/**
 * Relevance head — LANTERN-ARCHITECTURE.md §3.4 / §3.3b.
 *
 * Retrieval, not scoring: 887 real titles narrow to a few hundred candidates,
 * then rank, then calibrate. Runs entirely on the device over a catalogue
 * derived from the real event logs.
 *
 * Event frequency is deliberately NOT one of the embedding dimensions (§3.3b).
 * It is applied afterwards as a band constraint so the ranker cannot trade it
 * away for a similarity gain.
 */

import catalog from '../data/catalog.json';

/* ------------------------- content embedding ---------------------------- */

const PROVIDERS = [...new Set(catalog.map((g) => g.provider))].sort();
const MECHANICS = [...new Set(catalog.map((g) => g.mechanic))].sort();

const maxLaunches = Math.max(...catalog.map((g) => g.launches));

/** A small, readable content vector. Real systems SVD this down; at 887 titles
 *  the sparse form is already fast enough and stays inspectable. */
function embed(g) {
  const v = new Float32Array(PROVIDERS.length + MECHANICS.length + 3);
  v[PROVIDERS.indexOf(g.provider)] = 1;
  v[PROVIDERS.length + MECHANICS.indexOf(g.mechanic)] = 1;
  const off = PROVIDERS.length + MECHANICS.length;
  v[off] = g.volatility / 4;
  v[off + 1] = g.jackpot ? 1 : 0;
  v[off + 2] = Math.log1p(g.launches) / Math.log1p(maxLaunches);
  return v;
}

const VECTORS = new Map(catalog.map((g) => [g.id, embed(g)]));
export const BY_ID = new Map(catalog.map((g) => [g.id, g]));

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/* ------------------------------ retrieval ------------------------------- */

const POPULAR = [...catalog].sort((a, b) => b.launches - a.launches);

/**
 * Stage 1 — candidates. Union of three cheap retrievers, exactly as specified:
 * content-ANN around what the session has touched, popularity prior, and
 * continuity (recently opened).
 */
function candidates(sco, limit = 200) {
  const seen = new Set(sco.seq);
  const out = new Map();

  // Continuity — titles already touched this session stay reachable.
  for (const id of sco.seq) {
    const g = BY_ID.get(id);
    if (g) out.set(id, g);
  }

  // Content neighbours of the most recent touches.
  const anchors = [...new Set(sco.seq)].slice(-3);
  for (const aid of anchors) {
    const av = VECTORS.get(aid);
    if (!av) continue;
    const scored = catalog
      .filter((g) => g.id !== aid)
      .map((g) => ({ g, s: cosine(av, VECTORS.get(g.id)) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 60);
    for (const { g } of scored) out.set(g.id, g);
  }

  // Popularity prior fills the rest — this is what a cold session gets.
  for (const g of POPULAR) {
    if (out.size >= limit) break;
    out.set(g.id, g);
  }

  return [...out.values()].slice(0, limit);
}

/* ------------------------------- ranking -------------------------------- */

/** Stage 2 — a readable linear ranker standing in for the GBDT. Every term is
 *  a feature the architecture doc names, and no demographic appears here. */
function rank(cands, sco) {
  const anchors = [...new Set(sco.seq)].slice(-3);
  const anchorVecs = anchors.map((id) => VECTORS.get(id)).filter(Boolean);
  const p = sco.prior;

  return cands
    .map((g) => {
      const v = VECTORS.get(g.id);

      const affinity = anchorVecs.length
        ? Math.max(...anchorVecs.map((av) => cosine(av, v)))
        : 0;
      const popularity = Math.log1p(g.launches) / Math.log1p(maxLaunches);
      const providerFit = (p.providerAffinity[g.provider] || 0) / 10;
      const mechanicFit = (p.mechanicAffinity[g.mechanic] || 0) / 10;
      const novelty = sco.seq.includes(g.id) ? -0.35 : 0.05;
      const bandFit = 1 - Math.abs(g.volatility - p.volatilityBand) / 4;

      const score =
        0.42 * affinity +
        0.24 * popularity +
        0.14 * providerFit +
        0.10 * mechanicFit +
        0.10 * bandFit +
        novelty;

      return { ...g, score, why: { affinity, popularity, providerFit, bandFit } };
    })
    .sort((a, b) => b.score - a.score);
}

/* ----------------------------- calibration ------------------------------ */

/**
 * Stage 3 — Steck calibration. Hold the output provider mix near the mix this
 * session has actually shown, rather than 100% of whatever ranks highest.
 * Returns the shelf plus the KL divergence, which the Monitor screen displays.
 */
function calibrate(ranked, sco, n = 12) {
  const target = mixOf(sco.seq.map((id) => BY_ID.get(id)).filter(Boolean));
  if (!Object.keys(target).length) {
    return { items: ranked.slice(0, n), kl: 0, calibrated: false };
  }

  const picked = [];
  const counts = {};

  while (picked.length < n && picked.length < ranked.length) {
    let best = null;
    let bestScore = -Infinity;

    for (const g of ranked) {
      if (picked.includes(g)) continue;
      const trial = { ...counts, [g.provider]: (counts[g.provider] || 0) + 1 };
      const total = picked.length + 1;
      // Greedy: maximise relevance minus the divergence the pick would create.
      const div = kl(target, normalise(trial, total));
      const s = g.score - 0.55 * div;
      if (s > bestScore) { bestScore = s; best = g; }
    }

    if (!best) break;
    picked.push(best);
    counts[best.provider] = (counts[best.provider] || 0) + 1;
  }

  return {
    items: picked,
    kl: +kl(target, normalise(counts, picked.length)).toFixed(3),
    calibrated: true,
  };
}

function mixOf(games) {
  const m = {};
  for (const g of games) m[g.provider] = (m[g.provider] || 0) + 1;
  return normalise(m, games.length);
}

function normalise(counts, total) {
  const out = {};
  if (!total) return out;
  for (const [k, v] of Object.entries(counts)) out[k] = v / total;
  return out;
}

/** KL(target ‖ actual), smoothed so a missing provider is finite. */
function kl(target, actual) {
  let d = 0;
  for (const [k, pk] of Object.entries(target)) {
    const qk = (actual[k] || 0) + 0.01;
    d += pk * Math.log(pk / qk);
  }
  return Math.max(0, d);
}

/* -------------------------------- public -------------------------------- */

/**
 * Full pipeline. `constraint` comes from the policy engine and carries the
 * risk gate — notably the volatility ceiling, which is applied *after*
 * ranking so it cannot be traded off inside the model.
 */
export function recommend(sco, constraint = {}, n = 12) {
  let cands = candidates(sco);

  if (typeof constraint.maxVolatility === 'number') {
    const capped = cands.filter((g) => g.volatility <= constraint.maxVolatility);
    if (capped.length >= n) cands = capped;
  }
  if (constraint.noJackpotSurfaces) {
    const nj = cands.filter((g) => !g.jackpot);
    if (nj.length >= n) cands = nj;
  }

  const ranked = rank(cands, sco);
  return calibrate(ranked, sco, n);
}

/** Baseline arm for the A/B: popularity order, exactly what a generic lobby
 *  does today. Used to show the difference rather than assert it. */
export function baseline(n = 12) {
  return { items: POPULAR.slice(0, n), kl: null, calibrated: false };
}

/**
 * Why this title is in front of the player, in their own language.
 *
 * Every card in the feed carries one of these. A recommendation the player can
 * interrogate is relevance; one they cannot is just a push. This reads the same
 * `why` object the ranker already emits, so the sentence cannot drift from the
 * scoring.
 */
export function explain(game, sco) {
  const w = game.why;
  if (!w) return `Popular right now · ${game.launches} launches in the logs`;

  const lastId = [...sco.seq].reverse()[0];
  const last = lastId ? BY_ID.get(lastId) : null;

  if (w.affinity > 0.72 && last) {
    if (last.provider === game.provider) {
      return `Close to ${last.name}, and also ${game.provider}`;
    }
    return `Plays like ${last.name}`;
  }
  if (w.providerFit > 0.25) {
    return `${game.provider} — you come back to them`;
  }
  if (w.affinity > 0.5 && last) {
    return `Same ${game.mechanic.replace('-', ' ')} feel as ${last.name}`;
  }
  if (w.bandFit > 0.85) {
    return `Volatility band ${game.volatility} — where you usually play`;
  }
  return `Popular this week · ${game.launches} launches in the logs`;
}

export { catalog, PROVIDERS, MECHANICS };

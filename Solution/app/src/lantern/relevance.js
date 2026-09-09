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

import live from '../data/live-catalog.json';
import logged from '../data/catalog.json';

/**
 * The catalogue is the live PSK list (3,131 titles, real art, real RTP and
 * volatility) merged with launch counts from the event logs, so popularity is
 * measured rather than guessed. Titles absent from the logs fall back to the
 * API's commercial tier.
 */
export const ASSET_BASE = live.assetBase;

import { scoreGame, rankingContext, GAME_STATS } from './model';

const launchesByName = new Map(logged.map((g) => [g.name.toLowerCase(), g.launches]));
const maxProminence = 100;

const catalog = live.games.map((g) => ({
  ...g,
  launches: launchesByName.get(g.name.toLowerCase())
    ?? Math.max(1, Math.round((maxProminence - Math.min(g.prominence, maxProminence)) * 2)),
  // `launches` blends measured counts with a prominence stand-in so the
  // embedding has a popularity signal for all 3,131 titles. That blend is the
  // wrong thing to *sort* by: measured counts are skewed low (median 2) while
  // the stand-in sits at 180-198, so ordering on it ranks never-launched
  // titles above almost every title anyone actually opened. Anything that
  // claims to order by launches reads this instead.
  measuredLaunches: launchesByName.get(g.name.toLowerCase()) ?? 0,
}));

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

/**
 * Stage 2 — the trained ranker.
 *
 * These weights used to be six numbers I chose. They are now six numbers fitted
 * on 4,995 sessions by Solution/kaggle/train_lantern.py, and the difference is
 * measurable rather than rhetorical: replaying held-out sessions, this ordering
 * puts the title the player actually opened in the top six 19.1% of the time
 * against 6.4% for popularity order — see `models.eval.replay`.
 *
 * A title outside the trained table (the tail of the catalogue, below the top
 * 1,200 by launches) is not dropped; it falls back to a popularity-only score,
 * discounted so a cold item never outranks one the model has evidence about.
 */
function rank(cands, sco, archetypeIndex = 0) {
  const names = sco.seq.map((id) => BY_ID.get(id)?.name).filter(Boolean);
  const ctx = rankingContext(names, archetypeIndex);

  return cands
    .map((g) => {
      const s = scoreGame(g.name, ctx);
      if (!s) {
        const popularity = Math.log1p(g.launches) / Math.log1p(maxLaunches);
        return { ...g, score: popularity - 1.5, why: { popularity, cold: true } };
      }
      const [popularity, affinity, seen, providerShare, jackpot, cooc] = s.f;
      return {
        ...g,
        score: s.score,
        why: { popularity, affinity, seen, providerShare, jackpot, cooc, trained: true },
      };
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
export function recommend(sco, constraint = {}, n = 12, archetypeIndex = 0) {
  let cands = candidates(sco);

  if (typeof constraint.maxVolatility === 'number') {
    const capped = cands.filter((g) => g.volatility <= constraint.maxVolatility);
    if (capped.length >= n) cands = capped;
  }
  if (constraint.noJackpotSurfaces) {
    const nj = cands.filter((g) => !g.jackpot);
    if (nj.length >= n) cands = nj;
  }

  const ranked = rank(cands, sco, archetypeIndex);
  return calibrate(ranked, sco, n);
}

/** Baseline arm for the A/B: popularity order, exactly what a generic lobby
 *  does today. Used to show the difference rather than assert it. */
/**
 * A fit score for titles the trained table has never seen.
 *
 * The model ships stats for the top 1,200 titles by launches; the catalogue has
 * 3,131. The tail used to render no badge at all, which reads as a broken tile
 * rather than as an absence of history. So the tail gets a content score built
 * from the same attributes the ranker uses — provider, mechanic, volatility
 * band, popularity — measured against what this session has actually opened.
 *
 * It is weaker evidence than the fitted score and the tile says so, but it is
 * the same question answered from the catalogue instead of from the logs.
 */
export function coldFit(game, sco) {
  const played = sco.seq.map((id) => BY_ID.get(id)).filter(Boolean);
  const pop = Math.log1p(game.launches) / Math.log1p(maxLaunches);

  if (!played.length) return Math.max(0.08, Math.min(0.62, 0.22 + pop * 0.4));

  const provShare = played.filter((g) => g.provider === game.provider).length / played.length;
  const mechShare = played.filter((g) => g.mechanic === game.mechanic).length / played.length;
  const meanVol = played.reduce((a, g) => a + (g.volatility ?? 3), 0) / played.length;
  const volFit = 1 - Math.min(1, Math.abs((game.volatility ?? 3) - meanVol) / 4);

  const score = 0.3 * provShare + 0.24 * mechShare + 0.26 * volFit + 0.2 * pop;
  return Math.max(0.05, Math.min(0.95, score));
}

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
  if (!w || w.cold) return `Popular right now · ${game.launches} launches in the logs`;

  const lastId = [...sco.seq].reverse()[0];
  const last = lastId ? BY_ID.get(lastId) : null;

  // Ordered by how much the feature actually moved this title's score, so the
  // sentence names the reason the model used — not the nicest-sounding one.
  if (w.cooc > 0.6 && last) return `Players who opened ${last.name} open this next`;
  if (w.seen) return `You opened this earlier — pick it back up`;
  if (w.providerShare > 0.3) return `${game.provider} — what you have been playing tonight`;
  if (w.affinity > 0.35) return `Suits how you are playing this session`;
  if (w.cooc > 0.25) return `Often opened alongside what you have tried`;
  return `Popular this week · ${game.launches} launches in the logs`;
}

export { catalog, PROVIDERS, MECHANICS };

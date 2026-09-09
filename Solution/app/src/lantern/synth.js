/**
 * Synthetic session generator.
 *
 * A demo produces a few hundred rows; training wants tens of thousands. This
 * tops the set up from four *planted* archetypes.
 *
 * The planting is the point. Because the generator knows which archetype
 * produced each session, "the model recovers the planted structure" is a claim
 * that can be checked — unlike "the model is accurate on real players", which
 * this data cannot support and which the README is explicit about not claiming.
 *
 * Corpus (catalogue, offers, sections) is injected rather than imported, so the
 * same generator runs in the app and under plain node — see
 * scripts/make-synthetic.mjs, which writes straight to CSV on disk.
 */

import { toRow, pseudoId, COLUMNS } from './schema.js';

const pick = (a, r) => a[Math.floor(r() * a.length)];

/** Small deterministic PRNG — a seed reproduces a dataset exactly. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const ARCHETYPES = {
  browser: {
    label: 'Browser',
    note: 'Opens many titles, dwells on none, rarely acts.',
    games: [6, 14], spins: [0, 6], stakeMul: 1, chase: false, slip: 0.15, minutes: [3, 12],
    // Wide net, no loyalty, no strong taste — hard to recommend to, which is
    // exactly why this cohort is the prize.
    slate: 55, favProviders: 3, volPref: 3, volTight: 1.8, jackpotBias: 1.3, repeat: 0.04,
  },
  returner: {
    label: 'Casual returner',
    note: 'Short, regular, mixed sport and casino.',
    games: [2, 5], spins: [8, 40], stakeMul: 1, chase: false, slip: 0.45, minutes: [6, 25],
    slate: 14, favProviders: 2, volPref: 2.6, volTight: 1.1, jackpotBias: 1.0, repeat: 0.30,
  },
  specialist: {
    label: 'Specialist',
    note: 'One or two titles, steady stake, high completion.',
    games: [1, 3], spins: [40, 160], stakeMul: 1, chase: false, slip: 0.7, minutes: [20, 70],
    // A tiny slate and a high repeat rate: this is what "has a favourite" looks
    // like in an event log, and it is the signal a lobby can actually act on.
    slate: 4, favProviders: 1, volPref: 2.2, volTight: 0.8, jackpotBias: 0.5, repeat: 0.62,
  },
  chaser: {
    label: 'Chaser',
    note: 'Stake climbs after losses, turbo on, deposits mid-session.',
    games: [3, 9], spins: [60, 260], stakeMul: 4, chase: true, slip: 0.3, minutes: [45, 180],
    slate: 9, favProviders: 2, volPref: 4.5, volTight: 1.0, jackpotBias: 2.4, repeat: 0.18,
  },
};

const DEFAULT_WEIGHTS = { browser: 0.42, returner: 0.31, specialist: 0.19, chaser: 0.08 };

const between = ([lo, hi], r) => lo + Math.floor(r() * (hi - lo + 1));

/**
 * Catalogue popularity, Pareto-shaped.
 *
 * Without this every title is drawn uniformly, so no game is ever a hit, nobody
 * has a favourite, and a recommender has nothing to beat. A real catalogue is
 * violently head-heavy; this reproduces that. Deterministic in `seed`, so a
 * regenerated dataset is identical.
 */
function popularityOf(catalog, r) {
  const order = catalog.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {          // seeded Fisher-Yates
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const w = new Float64Array(catalog.length);
  order.forEach((gameIdx, rank) => { w[gameIdx] = 1 / Math.pow(rank + 12, 0.92); });
  const cum = new Float64Array(catalog.length);
  let acc = 0;
  for (let i = 0; i < w.length; i++) { acc += w[i]; cum[i] = acc; }
  return { cum, total: acc };
}

/** Draw one game index, popularity-weighted. Binary search over the CDF. */
function drawByPopularity({ cum, total }, r) {
  const x = r() * total;
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < x) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/**
 * The slate: the handful of titles this session's player would ever consider.
 *
 * Built once per session from popularity filtered by taste — a couple of
 * favourite providers and a preferred volatility band. Everything the
 * recommender needs falls out of this one object: co-occurrence (slate members
 * get opened together), provider stickiness, archetype-to-game affinity, and
 * repeat play. A specialist gets a slate of 4 and reopens them; a browser gets
 * 55 and commits to none.
 */
function buildSlate(catalog, pop, A, r) {
  const favs = new Set();
  for (let i = 0; i < A.favProviders; i++) {
    favs.add(catalog[drawByPopularity(pop, r)].provider);
  }
  const slate = [];
  const taken = new Set();
  const tight = 2 * A.volTight * A.volTight;
  for (let guard = 0; guard < A.slate * 60 && slate.length < A.slate; guard++) {
    const i = drawByPopularity(pop, r);
    if (taken.has(i)) continue;
    const g = catalog[i];
    const vol = typeof g.volatility === 'number' ? g.volatility : 3;
    let p = Math.exp(-((vol - A.volPref) ** 2) / tight);
    p *= favs.has(g.provider) ? 1 : 0.14;
    if (g.jackpot) p *= A.jackpotBias;
    if (r() < Math.min(1, p)) { taken.add(i); slate.push(g); }
  }
  // A slate can come up short if taste is very narrow; top it up so the session
  // always has something to open.
  while (slate.length === 0) slate.push(catalog[drawByPopularity(pop, r)]);
  return slate;
}

/**
 * @param opts { sessions, seed, weights, platform, corpus: { catalog, offers, sections } }
 * @returns { rows, summary, sessions }
 */
export function generate({
  sessions = 200,
  seed = 20260908,
  weights = DEFAULT_WEIGHTS,
  platform = 'web',
  corpus,
} = {}) {
  const catalog = corpus?.catalog?.length ? corpus.catalog : [{ name: 'Unknown', provider: 'Unknown', jackpot: false }];
  const offers = corpus?.offers?.length ? corpus.offers : [];
  const sections = corpus?.sections?.length ? corpus.sections : [{ name: 'Najigranije' }];

  const r = rng(seed);
  const pop = popularityOf(catalog, r);
  const keys = Object.keys(ARCHETYPES);

  const cum = [];
  let acc = 0;
  for (const k of keys) { acc += weights[k] ?? 0; cum.push([k, acc]); }

  const rows = [];
  const summary = Object.fromEntries(keys.map((k) => [k, 0]));
  const t0 = Date.parse('2026-08-01T00:00:00Z');

  for (let i = 0; i < sessions; i++) {
    const roll = r() * acc;
    const kind = (cum.find(([, cAcc]) => roll <= cAcc) || cum[cum.length - 1])[0];
    const A = ARCHETYPES[kind];
    summary[kind]++;

    const slate = buildSlate(catalog, pop, A, r);
    const opened = [];

    const playerId = pseudoId('synth-player-' + Math.floor(i / 6));
    const sessionId = String(1786000000 + Math.floor(r() * 3000000));
    const minutes = between(A.minutes, r);
    // Chasers skew late; everyone else spreads across the day.
    const startHour = A.chase ? 21 + (Math.floor(r() * 5) % 5) : Math.floor(r() * 18) + 6;
    let t = t0 + Math.floor(r() * 27) * 864e5 + startHour * 36e5 + Math.floor(r() * 36e5);
    const step = (minutes * 60000) / Math.max(1, between(A.spins, r) + between(A.games, r) + 4);

    const ctx = { sessionId, playerId, route: 'home', riskState: 'calm', archetype: kind, platform };
    const push = (ev) => {
      rows.push(toRow({ ...ev, at: t }, ctx));
      t += Math.max(400, step * (0.5 + r()));
    };

    push({ t: 'view', surface: 'lobby', dwellMs: Math.floor(2000 + r() * 9000) });

    const nGames = between(A.games, r);
    let stake = 100 * (0.5 + r());
    let lossRun = 0;

    for (let g = 0; g < nGames; g++) {
      // Reopen something already played this session, or reach into the slate
      // for a new one. The reopen rate is the archetype's, and it is what makes
      // "your usual" a thing a lobby can put at the top.
      const game = (opened.length && r() < A.repeat)
        ? pick(opened, r)
        : pick(slate, r);
      if (!opened.includes(game)) opened.push(game);
      const section = pick(sections, r).name;
      ctx.route = 'game';
      push({
        t: 'game_open', gameName: game.name, provider: game.provider,
        section, jackpot: game.jackpot,
        origin: r() < 0.38 ? 'search_results' : 'category_game_row',
      });

      const spins = Math.round(between(A.spins, r) / nGames);
      for (let sIdx = 0; sIdx < spins; sIdx++) {
        const won = r() < 0.31;
        lossRun = won ? 0 : lossRun + 1;
        if (won) ctx.riskState = 'calm';

        // The planted signal: chasers raise stake into a losing run.
        if (A.chase && lossRun >= 3 && r() < 0.4) {
          const next = Math.min(stake * 2, 100 * A.stakeMul * 5);
          push({ t: 'stake_change', gameName: game.name, from: Math.round(stake), to: Math.round(next) });
          stake = next;
          ctx.riskState = 'elevated';
          if (r() < 0.3) push({ t: 'turbo', on: true });
        }
        push({
          t: 'spin', gameName: game.name, stake: Math.round(stake),
          // Hit rate 0.31 with a 1..5.2x win multiplier gives RTP 0.961 — a
          // realistic house edge. The previous multiplier ran to 7x, which put
          // RTP at 1.24: a casino that loses money, and an outcome model fitted
          // on it would report that longer play improves your chances. It does
          // not, and no data we ship should imply it does.
          payout: won ? Math.round(stake * (1 + r() * 4.2)) : 0,
        });
      }

      if (A.chase && r() < 0.45) {
        const declined = r() < 0.28;
        push({ t: 'deposit', amount: 5000, declined });
        if (declined) ctx.riskState = 'concern';
      }
      push({ t: 'game_close', gameName: game.name, durMs: Math.round(spins * step) });
    }

    // Sportsbook leg
    if (offers.length && r() < A.slip) {
      const m = pick(offers, r);
      const mk = pick(m.markets, r);
      ctx.route = 'sport';
      push({ t: 'slip_add', sport: m.sportHr, selectionId: mk.name, fixtureId: m.id, addedFrom: 'prematch' });
      push({ t: 'confirm_reach', legs: 1 });
      // The measured abandon rate in the real logs is 21.6%.
      if (r() > 0.216) {
        push({
          t: 'confirm_done', legs: 1, stake: Math.round(stake), odds: mk.odds,
          betslipNumber: 'SYN' + Math.floor(r() * 1e10),
        });
      } else {
        push({ t: 'confirm_abandon', legs: 1 });
      }
    }

    if (A.chase && r() < 0.35) {
      ctx.riskState = 'concern';
      push({ t: 'rg_change', direction: 'looser' });
    }
  }

  return { rows, summary, sessions };
}

export { COLUMNS };

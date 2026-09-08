/**
 * Synthetic session generator.
 *
 * A demo produces a few hundred rows. Training wants tens of thousands, so this
 * tops the captured log up with sessions drawn from four *planted* archetypes.
 *
 * The planting is the point. Because we know which archetype produced each
 * session, "the model recovers the planted structure" is a claim that can be
 * checked — unlike "the model is accurate on real players", which this data
 * cannot support and which the README is explicit about not claiming.
 *
 * Output is the same FEG schema as logger.js, with `from_origin` carrying the
 * archetype label so a training job has ground truth to score against.
 */

import { COLUMNS, toRow, pseudoId } from './logger';
import catalog from '../data/catalog.json';
import offers from '../data/offers.json';
import sections from '../data/sections.json';

const pick = (a, r) => a[Math.floor(r() * a.length)];

/** Small deterministic PRNG so a seed reproduces a dataset exactly. */
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
  },
  specialist: {
    label: 'Specialist',
    note: 'One or two titles, steady stake, high completion.',
    games: [1, 3], spins: [40, 160], stakeMul: 1, chase: false, slip: 0.7, minutes: [20, 70],
  },
  returner: {
    label: 'Casual returner',
    note: 'Short, regular, mixed sport and casino.',
    games: [2, 5], spins: [8, 40], stakeMul: 1, chase: false, slip: 0.45, minutes: [6, 25],
  },
  chaser: {
    label: 'Chaser',
    note: 'Stake climbs after losses, turbo on, deposits mid-session.',
    games: [3, 9], spins: [60, 260], stakeMul: 4, chase: true, slip: 0.3, minutes: [45, 180],
  },
};

const between = ([lo, hi], r) => lo + Math.floor(r() * (hi - lo + 1));

/**
 * @param opts { sessions, seed, weights }
 * @returns { rows, summary }
 */
export function generate({ sessions = 200, seed = 20260908, weights } = {}) {
  const r = rng(seed);
  const keys = Object.keys(ARCHETYPES);
  const w = weights || { browser: 0.42, returner: 0.31, specialist: 0.19, chaser: 0.08 };

  const cum = [];
  let acc = 0;
  for (const k of keys) { acc += w[k] ?? 0; cum.push([k, acc]); }

  const rows = [];
  const summary = Object.fromEntries(keys.map((k) => [k, 0]));
  const t0 = Date.parse('2026-08-01T00:00:00Z');

  for (let i = 0; i < sessions; i++) {
    const roll = r() * acc;
    const kind = (cum.find(([, c]) => roll <= c) || cum[cum.length - 1])[0];
    const A = ARCHETYPES[kind];
    summary[kind]++;

    const playerId = pseudoId('synth-player-' + Math.floor(i / 6));
    const sessionId = String(1786000000 + Math.floor(r() * 3000000));
    const minutes = between(A.minutes, r);
    // Chasers skew late; everyone else spreads across the day.
    const startHour = A.chase ? 21 + Math.floor(r() * 5) % 5 : Math.floor(r() * 18) + 6;
    let t = t0 + Math.floor(r() * 27) * 864e5 + startHour * 36e5 + Math.floor(r() * 36e5);
    const step = (minutes * 60000) / Math.max(1, between(A.spins, r) + between(A.games, r) + 4);

    const ctx = { sessionId, playerId, route: 'home', riskState: 'calm', archetype: kind };
    const push = (ev) => { rows.push(toRow({ ...ev, at: t }, ctx)); t += Math.max(400, step * (0.5 + r())); };

    push({ t: 'view', surface: 'lobby', dwellMs: Math.floor(2000 + r() * 9000) });

    const nGames = between(A.games, r);
    let stake = 100 * (0.5 + r());
    let lossRun = 0;

    for (let g = 0; g < nGames; g++) {
      const game = pick(catalog, r);
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

        // The planted signal: chasers raise stake into a losing run.
        if (A.chase && lossRun >= 3 && r() < 0.4) {
          const next = Math.min(stake * 2, 100 * A.stakeMul * 5);
          push({ t: 'stake_change', gameName: game.name, from: Math.round(stake), to: Math.round(next) });
          stake = next;
          if (r() < 0.3) push({ t: 'turbo', on: true });
        }
        push({ t: 'spin', gameName: game.name, stake: Math.round(stake), payout: won ? Math.round(stake * (1 + r() * 6)) : 0 });
      }

      if (A.chase && r() < 0.45) {
        push({ t: 'deposit', amount: 5000, declined: r() < 0.28 });
      }
      push({ t: 'game_close', gameName: game.name, durMs: Math.round(spins * step) });
    }

    // Sportsbook leg
    if (r() < A.slip) {
      const m = pick(offers, r);
      const mk = pick(m.markets, r);
      ctx.route = 'sport';
      push({ t: 'slip_add', sport: m.sportHr, selectionId: mk.name, fixtureId: m.id, addedFrom: 'prematch' });
      push({ t: 'confirm_reach', legs: 1 });
      // The measured abandon rate in the real logs is 21.6%.
      if (r() > 0.216) {
        push({ t: 'confirm_done', legs: 1, stake: Math.round(stake), odds: mk.odds, betslipNumber: 'SYN' + Math.floor(r() * 1e10) });
      } else {
        push({ t: 'confirm_abandon', legs: 1 });
      }
    }

    if (A.chase && r() < 0.35) push({ t: 'rg_change', direction: 'looser' });
  }

  return { rows, summary, sessions };
}

export { COLUMNS };

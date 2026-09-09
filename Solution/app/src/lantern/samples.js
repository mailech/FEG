/**
 * Reference sessions for the diagnostics console.
 *
 * `/mind` opened in a fresh tab has no live session, and a diagnostics page with
 * nothing to diagnose is a broken page. These four are built by pushing real
 * events through the real `apply()` reducer — the same code path the app uses —
 * so what the console shows is genuine inference, not a fixture with the answers
 * written in.
 *
 * They are behaviour, not labels: none of them tells the model what it is. The
 * chaser is a chaser because the stake climbs into a losing run, and the model
 * has to work that out from the feature vector like it would for anyone.
 */

import { createSCO, apply, emptyPrior } from './sco';

const T0 = Date.parse('2026-09-09T21:00:00Z');

function build(events) {
  let sco = createSCO(emptyPrior, T0);
  for (const ev of events) sco = apply(sco, ev);
  return sco;
}

/** Opens a lot, commits to nothing. */
function browser() {
  const evs = [];
  for (let i = 0; i < 11; i++) {
    evs.push({ t: 'game_open', gameId: `g${i}`, gameName: `Title ${i}`, section: 'row', at: T0 + i * 26000 });
    evs.push({ t: 'game_close', gameId: `g${i}`, durMs: 7000, at: T0 + i * 26000 + 7000 });
  }
  evs.push({ t: 'search', qLen: 6, at: T0 + 300000 });
  return build(evs);
}

/** Short, regular, mixed. Places a bet and leaves. */
function returner() {
  const evs = [{ t: 'game_open', gameId: 'g0', gameName: 'Title 0', section: 'row', at: T0 }];
  for (let i = 0; i < 22; i++) {
    evs.push({ t: 'spin', gameId: 'g0', stake: 80, payout: i % 4 === 0 ? 190 : 0, at: T0 + i * 9000 });
  }
  evs.push({ t: 'slip_add', sport: 'Nogomet', at: T0 + 220000 });
  evs.push({ t: 'confirm_reach', legs: 1, at: T0 + 226000 });
  evs.push({ t: 'confirm_done', legs: 1, at: T0 + 232000 });
  return build(evs);
}

/** One title, even stake, finishes what it starts. */
function specialist() {
  const evs = [{ t: 'game_open', gameId: 'g0', gameName: 'Title 0', section: 'row', at: T0 }];
  for (let i = 0; i < 96; i++) {
    evs.push({ t: 'spin', gameId: 'g0', stake: 120, payout: i % 3 === 0 ? 210 : 0, at: T0 + i * 21000 });
  }
  return build(evs);
}

/** Stake climbs into a losing run, turbo on, a declined deposit, limit loosened. */
function chaser() {
  const evs = [{ t: 'game_open', gameId: 'g0', gameName: 'Title 0', section: 'row', at: T0 }];
  let stake = 60;
  let t = T0;
  for (let i = 0; i < 84; i++) {
    t += 5200;
    const won = i % 13 === 0;
    if (!won && i > 6 && i % 8 === 0) {
      stake = Math.min(stake * 2, 4800);
      evs.push({ t: 'stake_change', gameId: 'g0', to: stake, at: t });
    }
    evs.push({ t: 'spin', gameId: 'g0', stake, payout: won ? stake * 2 : 0, at: t });
    if (i === 40) evs.push({ t: 'turbo', on: true, at: t });
    if (i === 58) evs.push({ t: 'deposit', amount: 5000, declined: true, at: t });
    if (i === 70) evs.push({ t: 'game_open', gameId: 'g1', gameName: 'Title 1', section: 'row', at: t });
  }
  evs.push({ t: 'rg_change', direction: 'looser', at: t + 4000 });
  return build(evs);
}

/**
 * Three titles, an even stake for most of it, one escalation, long gaps.
 *
 * The other four are archetypes by construction, so the model reads them at
 * once and the console shows a single bar at the top of its range. Real
 * sessions are not like that: this one carries specialist evidence (sustained
 * play on few titles) against returner evidence (short bursts, long gaps) with
 * one chaser marker in the middle, and the head splits 58/32/10 across them
 * rather than committing. It is the honest case, and the one worth showing —
 * a model that is never uncertain is not measuring anything.
 */
function mixed() {
  const evs = [];
  let t = T0;
  let stake = 50;
  for (let k = 0; k < 3; k++) {
    evs.push({ t: 'game_open', gameId: `g${k}`, gameName: `Title ${k}`, section: 'row', at: t });
    t += 4000;
    for (let i = 0; i < 20; i++) {
      t += 16000;
      const won = i % 6 === 0;
      if (!won && i > 0 && i % 20 === 0) {
        stake = Math.round(stake * 1.6);
        evs.push({ t: 'stake_change', gameId: `g${k}`, to: stake, at: t });
      }
      evs.push({ t: 'spin', gameId: `g${k}`, stake, payout: won ? Math.round(stake * 1.9) : 0, at: t });
    }
    evs.push({ t: 'game_close', gameId: `g${k}`, durMs: 20 * 16000, at: t });
  }
  return build(evs);
}

export const SAMPLES = [
  { key: 'browser', label: 'Opens many, commits to none', sco: browser() },
  { key: 'returner', label: 'Short visit, places one bet', sco: returner() },
  { key: 'specialist', label: 'One title, steady stake', sco: specialist() },
  { key: 'chaser', label: 'Stake climbs after losses', sco: chaser() },
  { key: 'mixed', label: 'Mixed signals, no clean read', sco: mixed() },
];

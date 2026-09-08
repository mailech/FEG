/**
 * Risk head — LANTERN-ARCHITECTURE.md §3.5.
 *
 * Eighteen behavioural markers, each computable from the event stream, scored
 * by logistic regression. The model is small on purpose: a compliance officer
 * has to be able to read the coefficient and a regulator has to be able to
 * audit the decision. Every marker returns *why* it fired, not just that it did.
 *
 * Age (§7) enters here and only here. It normalises thresholds — it never
 * ranks a game and never sets a target.
 */

import { sessionMinutes } from './sco';

/** Age-band multipliers on marker thresholds. Lower = fires sooner.
 *  18–24 carries the highest problem-gambling prevalence, so its gate is the
 *  most conservative. This table only ever makes the system more careful. */
const AGE_SENSITIVITY = {
  '18-24': 0.75,
  '25-34': 0.9,
  '35-44': 1.0,
  '45-54': 1.05,
  '55+': 1.1,
};

export const MARKERS = [
  { id: 1,  name: 'Chase slope',            w: 1.35 },
  { id: 2,  name: 'Latency compression',    w: 0.85 },
  { id: 3,  name: 'Turbo enabled',          w: 0.55 },
  { id: 4,  name: 'Autoplay depth',         w: 0.70 },
  { id: 5,  name: 'Session vs personal p90',w: 0.80 },
  { id: 6,  name: 'Within-session top-ups', w: 1.20 },
  { id: 7,  name: 'Declined deposit',       w: 1.60 },
  { id: 8,  name: 'RG limit loosened',      w: 1.75 },
  { id: 9,  name: 'Personal off-hours',     w: 0.60 },
  { id: 10, name: 'Game-switch after loss', w: 0.75 },
  { id: 11, name: 'Bet-slip churn',         w: 0.45 },
  { id: 12, name: 'Stake vs typical',       w: 1.10 },
  { id: 13, name: 'Late-night start',       w: 0.50 },
  { id: 14, name: 'Bonus-seeking',          w: 0.55 },
  { id: 15, name: 'Consecutive-day streak', w: 0.50 },
  { id: 16, name: 'Cancelled withdrawal',   w: 1.30 },
  { id: 17, name: 'No break taken',         w: 0.55 },
  { id: 18, name: 'Volatility drift',       w: 0.80 },
];

const BIAS = -3.4;
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/**
 * Evaluate all markers against the current SCO.
 * @returns {{score:number, state:string, fired:Array, sensitivity:number}}
 */
export function evaluate(sco, now = Date.now()) {
  const p = sco.prior;
  const k = AGE_SENSITIVITY[p.ageBand] ?? 1.0;
  const fired = [];

  const fire = (id, detail) => {
    const m = MARKERS.find((x) => x.id === id);
    fired.push({ id, name: m.name, w: m.w, detail });
  };

  /* 1 — chase slope: stake rising while losing. */
  if (sco.stakeTrace.length >= 4 && sco.maxLossRun >= 3) {
    const first = sco.stakeTrace[0];
    const last = sco.stakeTrace[sco.stakeTrace.length - 1];
    if (last > first * (1.4 * k)) {
      fire(1, `stake ${(first / 100).toFixed(2)} → ${(last / 100).toFixed(2)} across a ${sco.maxLossRun}-loss run`);
    }
  }

  /* 2 — latency compression: acting faster than earlier in the same session. */
  if (sco.latencyTrace.length >= 8) {
    const half = Math.floor(sco.latencyTrace.length / 2);
    const early = mean(sco.latencyTrace.slice(0, half));
    const late = mean(sco.latencyTrace.slice(half));
    if (early > 0 && late < early * (0.6 * k)) {
      fire(2, `gap ${Math.round(early)}ms → ${Math.round(late)}ms`);
    }
  }

  /* 3 — turbo / quick-spin. */
  if (sco.turbo) fire(3, 'quick-spin on');

  /* 4 — autoplay depth. */
  if (sco.autoplayArmed >= Math.round(25 * k)) fire(4, `${sco.autoplayArmed} spins armed`);

  /* 5 — session length against this player's own p90. */
  const mins = sessionMinutes(sco);
  if (mins > p.typicalSessionMin * 1.6 * k) {
    fire(5, `${mins.toFixed(0)} min vs typical ${p.typicalSessionMin}`);
  }

  /* 6 — within-session top-ups. */
  if (sco.deposits >= (p.ageBand === '18-24' ? 1 : 2)) fire(6, `${sco.deposits} deposits this session`);

  /* 7 — declined deposit. Strong single-event marker. */
  if (sco.depositsDeclined > 0) fire(7, `${sco.depositsDeclined} declined`);

  /* 8 — RG limit eased. Strongest single marker in the set. */
  if (sco.rgLoosened) fire(8, 'daily limit raised mid-session');

  /* 9 — play during this player's own unusual hours. */
  const hour = new Date(now).getHours();
  if (p.offHours.includes(hour)) fire(9, `${hour}:00 is outside this player's norm`);

  /* 10 — switching titles after a losing run. */
  if (sco.switchesAfterLoss >= 2) fire(10, `${sco.switchesAfterLoss} switches following losses`);

  /* 11 — bet-slip churn without confirming. */
  if (sco.slipRemoves >= 3 && sco.completedConfirm === 0) {
    fire(11, `${sco.slipAdds} added, ${sco.slipRemoves} removed, none placed`);
  }

  /* 12 — stake as a multiple of this player's typical. */
  const curStake = sco.stakeTrace[sco.stakeTrace.length - 1];
  if (curStake && curStake > p.typicalStake * 2.5 * k) {
    fire(12, `${(curStake / 100).toFixed(2)} vs typical ${(p.typicalStake / 100).toFixed(2)}`);
  }

  /* 13 — late-night start. */
  const startHour = new Date(sco.startedAt).getHours();
  if (startHour >= 23 || startHour <= 4) fire(13, `session opened at ${startHour}:00`);

  /* 14 — bonus-seeking navigation. */
  const bonusTaps = Object.entries(sco.launchedFrom)
    .filter(([s]) => /bonus|boost|jackpot|free/i.test(s))
    .reduce((a, [, n]) => a + n, 0);
  if (bonusTaps >= 3) fire(14, `${bonusTaps} launches from bonus surfaces`);

  /* 15 — consecutive-day streak. From the prior, not this session. */
  if ((p.dayStreak || 0) >= 10) fire(15, `${p.dayStreak} consecutive days`);

  /* 16 — cancelled withdrawal. Well-documented, comes from the prior. */
  if (p.cancelledWithdrawal) fire(16, 'withdrawal reversed in last 7 days');

  /* 17 — no break in a long session. */
  if (mins > 45 * k && sco.spins > 40) fire(17, `${mins.toFixed(0)} min unbroken`);

  /* 18 — volatility drift upward within the session. */
  if (sco.volatilitySeen.length >= 3) {
    const first = sco.volatilitySeen[0];
    const last = sco.volatilitySeen[sco.volatilitySeen.length - 1];
    if (last > first) fire(18, `band ${first} → ${last}`);
  }

  const z = BIAS + fired.reduce((a, m) => a + m.w, 0);
  const score = sigmoid(z);

  return { score, state: stateFor(score), fired, sensitivity: k };
}

/** Hysteresis lives in the caller; these are the raw cut points. */
export function stateFor(score) {
  if (score < 0.3) return 'calm';
  if (score < 0.65) return 'elevated';
  return 'concern';
}

/** Never let the displayed state flap between renders. */
export function withHysteresis(prev, next, score) {
  if (prev === next) return next;
  if (prev === 'elevated' && next === 'calm' && score > 0.24) return 'elevated';
  if (prev === 'concern' && next === 'elevated' && score > 0.58) return 'concern';
  return next;
}

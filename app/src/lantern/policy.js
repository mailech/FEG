/**
 * Policy engine — LANTERN-ARCHITECTURE.md §3.6.
 *
 * The only module that decides what renders, and the one you hand a judge to
 * read. No model runs in here. That is the point: a model regression can
 * degrade relevance, but it cannot breach a guardrail, because the guardrail
 * is a rule in this file rather than a weight in a network.
 *
 * Six markets, six regulators — the per-market table at the bottom is a config
 * difference, not a fork.
 */

import { archetype } from './sco';

/** Per-market policy. Only the values that actually differ are listed. */
export const MARKETS = {
  hr: { name: 'Croatia · PSK',        maxSendsPerWeek: 3, rewardSurfaces: true },
  cz: { name: 'Czechia · Fortuna',    maxSendsPerWeek: 3, rewardSurfaces: true },
  sk: { name: 'Slovakia · Fortuna',   maxSendsPerWeek: 3, rewardSurfaces: true },
  pl: { name: 'Poland · Fortuna',     maxSendsPerWeek: 2, rewardSurfaces: false },
  ro: { name: 'Romania · Casa P.',    maxSendsPerWeek: 3, rewardSurfaces: true },
  me: { name: 'Montenegro · Fortuna', maxSendsPerWeek: 2, rewardSurfaces: true },
};

/**
 * The decision. Takes relevance intent, risk state and RG state; returns what
 * the surfaces are allowed to show.
 */
export function decide({ sco, risk, rg = {}, market = 'hr' }) {
  const m = MARKETS[market] || MARKETS.hr;
  const state = risk.state;
  const arch = archetype(sco);

  // Hard stops first. These are not scored, they are absolute.
  if (rg.selfExcluded) {
    return {
      state,
      archetype: arch,
      shelves: [],
      constraint: { maxVolatility: 0 },
      showReward: false,
      showSessionSummary: true,
      showRgTools: true,
      reasons: ['self-excluded: no personalised surface of any kind'],
    };
  }

  const reasons = [];
  const constraint = {};
  let showReward = m.rewardSurfaces;
  let showSessionSummary = false;
  let showRgTools = false;
  let shelfSize = 12;

  if (state === 'elevated') {
    // Stop pointing toward more. Do not start pointing toward guilt.
    showReward = false;
    reasons.push('reward surfaces withheld — risk state elevated');

    const seen = sco.volatilitySeen;
    constraint.maxVolatility = seen.length ? Math.max(...seen) : 3;
    reasons.push(`volatility capped at band ${constraint.maxVolatility} — no upward drift`);

    constraint.noJackpotSurfaces = true;
    reasons.push('jackpot and bonus entry points dropped');

    showSessionSummary = true;
    shelfSize = 8;
  }

  if (state === 'concern') {
    showReward = false;
    constraint.maxVolatility = Math.min(2, ...(sco.volatilitySeen.length ? sco.volatilitySeen : [2]));
    constraint.noJackpotSurfaces = true;
    showSessionSummary = true;
    showRgTools = true;
    shelfSize = 0;
    reasons.push('no promotional surface');
    reasons.push('recommendations held — nothing above the current band');
    reasons.push('deposit limit and break tools shown plainly, no interstitial');
  }

  // Archetype shapes the layout, not the permission — §4.
  const shelves =
    shelfSize === 0
      ? []
      : arch === 'focused'
        ? [{ key: 'continue', title: 'Continue playing', n: 4 },
           { key: 'similar',  title: 'More like this',   n: shelfSize - 4 }]
        : arch === 'seeking'
          ? [{ key: 'similar', title: 'Closer to what you searched', n: shelfSize }]
          : [{ key: 'similar', title: 'Picked for this session', n: Math.min(6, shelfSize) },
             { key: 'popular', title: 'Najigranije',              n: shelfSize - Math.min(6, shelfSize) }];

  return {
    state,
    archetype: arch,
    market: m,
    shelves,
    constraint,
    showReward,
    showSessionSummary,
    showRgTools,
    reasons,
  };
}

/* ----------------------- notification policy (§3.9) ---------------------- */

export const TRIGGER_CLASSES = {
  fixture:  { allowed: true,  label: 'Calendar · fixture' },
  result:   { allowed: true,  label: 'Result · factual' },
  slip:     { allowed: true,  label: 'Continuation · resumption' },
  regret:   { allowed: false, label: 'Counterfactual · regret',
              why: 'Selectively counterfactual — the losing version is never sent, so the player sees a biased sample of hypothetical outcomes.' },
  loss:     { allowed: false, label: 'Loss-triggered',
              why: 'Fires because a bet lost. This is the chasing mechanism the risk head exists to detect.' },
  streak:   { allowed: false, label: 'Urgency · streak',
              why: 'Manufactured scarcity against an artificial deadline. Marker 15 treats streaks as a harm signal, not a goal.' },
};

export function shouldSend(candidate, { risk, rg = {}, sentThisWeek = 0, market = 'hr', hour = 12 }) {
  const m = MARKETS[market] || MARKETS.hr;
  const cls = TRIGGER_CLASSES[candidate.kind];
  const gates = [];

  const push = (name, pass, note) => gates.push({ name, pass, note });

  if (!cls.allowed) {
    push('Trigger class', false, cls.why);
    push('Risk state', null, 'Not evaluated — blocked at trigger class.');
    push('Quiet hours', null, '');
    push('Frequency cap', null, '');
    return { send: false, gates };
  }
  push('Trigger class', true, cls.label + '.');

  const riskOk = risk.state === 'calm';
  push('Risk state', riskOk, riskOk ? 'Player is calm. Send permitted.' : `Risk state is ${risk.state} — hold.`);
  if (!riskOk) return { send: false, gates };

  const quietOk = hour >= 9 && hour < 22;
  push('Quiet hours', quietOk, quietOk ? `${hour}:00 local.` : `${hour}:00 — deferred to 09:00.`);
  if (!quietOk) return { send: false, gates };

  const capOk = sentThisWeek < m.maxSendsPerWeek;
  push('Frequency cap', capOk, `${sentThisWeek} of ${m.maxSendsPerWeek} used this rolling week.`);
  if (!capOk) return { send: false, gates };

  if (rg.selfExcluded) {
    push('RG state', false, 'Self-excluded.');
    return { send: false, gates };
  }

  return { send: true, gates };
}

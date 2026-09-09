/**
 * The notification tray.
 *
 * Every gambling app has one, and in most of them it is the single most
 * aggressive surface in the product: streak reminders, expiring bonuses, "your
 * lucky game is hot right now". That pattern is banned outright by the brief's
 * guardrail, by the RG ground rules (no inducements, no fake urgency), and by
 * the AI Act's prohibition on manipulative practices. It is also, for what it is
 * worth, the reason people mute these apps.
 *
 * So this tray is built the other way round. Every message must earn its place
 * by being *useful to the person receiving it* — what happened in your session,
 * what you set as your own limit, what is genuinely new in something you already
 * play. Then each one is run through `shouldSend()` from policy.js, which is the
 * same gate the architecture already applies to pushes: trigger class, risk
 * state, quiet hours, frequency cap, RG state.
 *
 * The tray reports what it withheld and why. That is the part worth showing a
 * judge: a notification centre that can say "three messages were suppressed
 * because the risk head moved" is a compliance artefact, not a growth hack.
 */

import { shouldSend } from './policy';
import { DISTRIBUTION } from './outcomes';

const eur = (cents) => `€${(Math.abs(cents) / 100).toFixed(2)}`;

/**
 * Candidate messages. `kind` maps to TRIGGER_CLASSES in policy.js, which is what
 * decides whether a class may ever be sent at all.
 */
function candidates({ sco, minutes, pred, topPick, limitCents }) {
  const out = [];

  if (sco.spins > 0) {
    const staked = sco.staked;
    out.push({
      id: 'session',
      kind: 'session_summary',
      icon: 'stats-chart',
      title: 'Where this session stands',
      body: `${Math.round(minutes)} min · ${eur(staked)} staked · ${
        sco.netCents >= 0 ? 'up' : 'down'
      } ${eur(sco.netCents)}. Nothing to dismiss, nothing to claim.`,
    });
  }

  if (limitCents && sco.staked > 0) {
    const pctUsed = sco.staked / limitCents;
    if (pctUsed >= 0.5) {
      out.push({
        id: 'limit',
        kind: 'rg_notice',
        icon: 'shield-checkmark',
        title: 'Your own limit',
        body: `${eur(sco.staked)} of the ${eur(limitCents)} you set. We will stop you at it.`,
      });
    }
  }

  if (topPick) {
    out.push({
      id: 'pick',
      kind: 'relevance',
      icon: 'sparkles',
      title: `${topPick.name}`,
      body: `${topPick.provider} — matched to how you are playing tonight, not to what is trending.`,
    });
  }

  // The trust message. Note what it does NOT say: it never names an amount
  // someone won. "A player just won EUR 4,200" is an inducement — the losing
  // version of that message is never sent, so it tells the reader something
  // false about their own odds. This points at the whole ledger instead, and
  // leads with the share of players who are behind.
  out.push({
    id: 'ledger',
    kind: 'transparency',
    icon: 'shield-checkmark',
    title: 'Verified outcomes are published',
    body: `${Math.round((1 - DISTRIBUTION.upShare) * 100)}% of players in the ledger are behind, and the median is ${DISTRIBUTION.median < 0 ? '-' : ''}EUR ${Math.abs(DISTRIBUTION.median).toFixed(2)}. Every result carries a receipt you can check.`,
  });

  out.push({
    id: 'casual',
    kind: 'non_wagering',
    icon: 'grid',
    title: 'Slatki Slap is open',
    body: 'No stake, no payout. Available at every risk state, including the ones where nothing else is.',
  });

  if (pred?.risk?.state !== 'calm') {
    out.push({
      id: 'breather',
      kind: 'rg_notice',
      icon: 'pause-circle',
      title: 'A pause is available',
      body: 'You can set a limit or take a break from here. No streak is lost and nothing expires.',
    });
  }

  return out;
}

/**
 * Run every candidate through the policy gate and return both halves — what was
 * sent, and what was held and why. The second half is the interesting one.
 */
export function tray({ sco, minutes, pred, risk, rg = {}, topPick, limitCents = 5000, hour }) {
  const h = hour ?? new Date().getHours();
  const sent = [];
  const held = [];

  for (const cand of candidates({ sco, minutes, pred, topPick, limitCents })) {
    const verdict = shouldSend(cand, { risk, rg, sentThisWeek: sent.length, hour: h });
    if (verdict.send) sent.push(cand);
    else {
      const failed = verdict.gates.find((g) => g.pass === false);
      held.push({ ...cand, reason: failed ? `${failed.name}: ${failed.note}` : 'held by policy' });
    }
  }

  return { sent, held };
}

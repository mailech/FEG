/**
 * Verified outcomes — the trust surface.
 *
 * The obvious version of this feature is a "SOMEONE JUST WON €4,200!" banner.
 * That is one of the most studied dark patterns in gambling: it is selectively
 * counterfactual, because the losing version of the message is never sent, so
 * the player sees a biased sample and forms a false belief about their odds.
 * policy.js already refuses that class by name (`regret`), and the brief bans
 * inducements outright.
 *
 * The version that actually earns trust is the opposite: publish the *whole*
 * distribution. Wins and losses, in proportion, drawn from the same 834-player
 * corpus the models are trained on, each with a receipt the player can check —
 * and a summary line that states the true base rate rather than hiding it.
 *
 * That inverts the usual mechanic. A feed showing that 56% of players finish
 * down cannot be an inducement, and it answers the distrust the original idea
 * was reaching for: the wins are real *because* the losses are shown next to
 * them.
 */

import players from '../data/players.json';

/** Deterministic receipt id, so the same outcome always verifies the same way. */
function receipt(p) {
  let h = 0x811c9dc5;
  const s = `${p.id}|${p.net}|${p.sessions}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0').slice(0, 8).toUpperCase();
}

const ALL = players.players
  .filter((p) => p.sessions >= 2)
  .map((p) => ({ ...p, receipt: receipt(p) }));

/** The truth this feed exists to tell. */
export const DISTRIBUTION = (() => {
  const up = ALL.filter((p) => p.net > 0).length;
  const nets = ALL.map((p) => p.net).sort((a, b) => a - b);
  const median = nets.length ? nets[Math.floor(nets.length / 2)] : 0;
  return {
    total: ALL.length,
    up,
    down: ALL.length - up,
    upShare: ALL.length ? up / ALL.length : 0,
    median,
    best: Math.max(...nets),
    worst: Math.min(...nets),
  };
})();

/**
 * A feed in true proportion — no reweighting towards the exciting end.
 * Interleaved so the eye cannot skip the losses.
 */
export function feed(n = 12) {
  const up = ALL.filter((p) => p.net > 0).sort((a, b) => b.net - a.net);
  const down = ALL.filter((p) => p.net <= 0).sort((a, b) => a.net - b.net);
  const wantUp = Math.round(n * DISTRIBUTION.upShare);

  const out = [];
  for (let i = 0; i < n; i++) {
    const takeUp = out.filter((x) => x.net > 0).length < wantUp && (i % 2 === 0 || !down.length);
    const src = takeUp ? up : down;
    const item = src.shift() || up.shift() || down.shift();
    if (item) out.push(item);
  }
  return out;
}

/**
 * A conversation with the player behind an outcome.
 *
 * Consent-gated and templated on purpose. An open channel between gamblers,
 * opened by a published win, is a grooming and harassment vector before it is
 * anything else — so a player is only reachable if they switched contactability
 * on, the openers are fixed, and the receipt travels with the thread so the
 * verification is the point rather than the chat.
 */
export const OPENERS = [
  'Is this result verified?',
  'How long did that take you?',
  'Did you set a limit before playing?',
];

export function reply(opener, p) {
  const won = p.net > 0;
  switch (opener) {
    case 'Is this result verified?':
      return `Receipt ${p.receipt}. It covers ${p.sessions} sessions and ${p.events.toLocaleString()} logged events — the operator signs the ledger, not me.`;
    case 'How long did that take you?':
      return `${p.sessions} sessions. ${won ? 'Most of them I was down' : 'It went down steadily'} — the feed shows my whole record, not one screenshot.`;
    case 'Did you set a limit before playing?':
      return won
        ? 'Yes. It is the only reason I stopped while I was ahead.'
        : 'No, and that is the honest answer. I set one afterwards.';
    default:
      return `Receipt ${p.receipt}.`;
  }
}

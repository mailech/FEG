/**
 * Runtime smoke test for the Lantern core.
 *
 *   node Solution/scripts/smoke.mjs
 *
 * A bundle check only proves the imports resolve. This drives real events
 * through the reducer path — the thing that actually broke when `rows` was
 * missing from the initial state — and asserts the state machine escalates.
 *
 * sco.js and risk.js are dependency-free, so they run under node directly once
 * a `type: module` shim is in place (see the sibling package.json).
 */

import { createSCO, apply, emptyPrior, archetype, sessionMinutes } from '../app/src/lantern/sco.js';
import { evaluate, withHysteresis, MARKERS } from '../app/src/lantern/risk.js';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}${detail ? '  — ' + detail : ''}`);
  else { console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`); failed++; }
};

console.log('\nSCO + risk head\n');

/* --- a fresh session has every field the heads read ------------------------ */
const prior = { ...emptyPrior, dayStreak: 3, cancelledWithdrawal: false };
let sco = createSCO(prior, Date.parse('2026-09-08T21:40:00Z'));

for (const k of ['seq', 'stakeTrace', 'latencyTrace', 'volatilitySeen', 'events']) {
  ok(`createSCO.${k} is an array`, Array.isArray(sco[k]));
}
// `markers` is not stored on the SCO — the risk head recomputes fired markers
// from it on every call, so there is nothing to keep in sync.
for (const k of ['dwell', 'launchedFrom', 'prior']) {
  ok(`createSCO.${k} is an object`, sco[k] !== undefined && sco[k] !== null);
}

/* --- events fold without throwing ----------------------------------------- */
const trace = [
  { t: 'view', surface: 'lobby', dwellMs: 4200 },
  { t: 'game_open', gameId: 'g1', section: 'Najigranije', volatility: 2 },
  { t: 'spin', gameId: 'g1', stake: 200, payout: 0 },
  { t: 'spin', gameId: 'g1', stake: 200, payout: 0 },
  { t: 'spin', gameId: 'g1', stake: 200, payout: 0 },
  { t: 'spin', gameId: 'g1', stake: 200, payout: 0 },
  { t: 'stake_change', gameId: 'g1', from: 200, to: 500 },
  { t: 'spin', gameId: 'g1', stake: 500, payout: 0 },
  { t: 'turbo', on: true },
  { t: 'spin', gameId: 'g1', stake: 500, payout: 0 },
  { t: 'stake_change', gameId: 'g1', from: 500, to: 1000 },
  { t: 'deposit', amount: 5000, declined: false },
  { t: 'deposit', amount: 5000, declined: false },
  { t: 'autoplay', count: 50 },
  { t: 'game_open', gameId: 'g2', section: 'Boost Pots', volatility: 4 },
  { t: 'deposit', amount: 5000, declined: true },
  { t: 'rg_change', direction: 'looser' },
];

let threw = null;
let at = Date.parse('2026-09-08T21:40:00Z');
const states = [];
let shown = 'calm';

try {
  for (const ev of trace) {
    at += 4000;
    sco = apply(sco, { ...ev, at });
    const r = evaluate(sco, at);
    shown = withHysteresis(shown, r.state, r.score);
    states.push(shown);
  }
} catch (e) {
  threw = e;
}

ok('17 events fold without throwing', !threw, threw ? threw.message : '');

const final = evaluate(sco, at);
ok('risk score rises above 0.65', final.score > 0.65, `score=${final.score.toFixed(2)}`);
ok('state reaches concern', states[states.length - 1] === 'concern', states[states.length - 1]);
ok('state passes through elevated first', states.includes('elevated'));
ok('markers fire', final.fired.length >= 6, `${final.fired.length} of ${MARKERS.length}`);
ok('every fired marker has a reason', final.fired.every((m) => m.detail && m.name));
ok('archetype resolves', typeof archetype(sco) === 'string', archetype(sco));
ok('session minutes is finite', Number.isFinite(sessionMinutes(sco)));

/* --- age is a risk covariate only ----------------------------------------- */
const young = evaluate({ ...sco, prior: { ...prior, ageBand: '18-24' } }, at);
const older = evaluate({ ...sco, prior: { ...prior, ageBand: '55+' } }, at);
ok('younger band is more sensitive', young.sensitivity < older.sensitivity,
   `${young.sensitivity} vs ${older.sensitivity}`);
ok('younger band fires at least as many markers', young.fired.length >= older.fired.length,
   `${young.fired.length} vs ${older.fired.length}`);

/* --- a calm session stays calm --------------------------------------------- */
let calm = createSCO(prior, Date.parse('2026-09-08T14:00:00Z'));
let ct = Date.parse('2026-09-08T14:00:00Z');
for (const ev of [
  { t: 'view', surface: 'lobby', dwellMs: 3000 },
  { t: 'game_open', gameId: 'g9', section: 'Najigranije', volatility: 2 },
  { t: 'spin', gameId: 'g9', stake: 200, payout: 600 },
  { t: 'spin', gameId: 'g9', stake: 200, payout: 0 },
]) { ct += 9000; calm = apply(calm, { ...ev, at: ct }); }
const cr = evaluate(calm, ct);
ok('a short, level session stays calm', cr.state === 'calm', `score=${cr.score.toFixed(2)}`);

console.log(`\n${failed ? failed + ' FAILED' : 'all passed'}\n`);
process.exit(failed ? 1 : 0);

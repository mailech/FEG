/**
 * Integration tests for the two rules the handoff arbiter exists to enforce.
 *
 * These talk the edge WebSocket protocol directly rather than driving the UI,
 * because the properties under test are timing-sensitive and racing a browser
 * would make them flaky. Run with the dev rig up:
 *
 *   node scripts/test-handoff.js
 */

import WebSocket from 'ws';

const EDGE = process.env.EDGE_WS || 'ws://localhost:4002/stream';
const RGS = process.env.RGS_URL || 'http://localhost:4001';

let passed = 0;
let failed = 0;

function check(name, cond, detail = '') {
  if (cond) { passed += 1; console.log(`  PASS  ${name}`); }
  else { failed += 1; console.log(`  FAIL  ${name} ${detail}`); }
}

function connect() {
  const ws = new WebSocket(EDGE);
  const seen = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'frame') return; // ignore video, we only care about control
    // Resolve waiters with the stamped entry, not the raw message, so
    // callers can reason about arrival time.
    const entry = { ...m, at: Date.now() };
    seen.push(entry);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(entry)) { waiters[i].resolve(entry); waiters.splice(i, 1); }
    }
  });
  return {
    ws,
    seen,
    send: (o) => ws.send(JSON.stringify(o)),
    open: () => new Promise((r) => ws.once('open', r)),
    waitFor: (pred, ms = 15000) =>
      new Promise((resolve, reject) => {
        const hit = seen.find(pred);
        if (hit) return resolve(hit);
        const t = setTimeout(() => reject(new Error('timeout')), ms);
        waiters.push({ pred, resolve: (m) => { clearTimeout(t); resolve(m); } });
      }),
    sawSince: (since, pred) => seen.some((m) => m.at >= since && pred(m)),
    close: () => ws.close(),
  };
}

async function faults(body) {
  await fetch(`${RGS}/admin/faults`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------- */
/* RULE 1 - never hand off while a round is open                     */
/* ---------------------------------------------------------------- */

async function testQuiescenceGate() {
  console.log('\nRULE 1: no handoff while a round is open');
  await faults({ recoveryDown: false });
  const c = connect();
  await c.open();
  c.send({ t: 'start' });
  const started = await c.waitFor((m) => m.t === 'started');
  check('warm context claimed fast', started.claimMs < 1000, `(${started.claimMs}ms)`);

  // Open a round, THEN tell the edge the device is ready. The arbiter now has
  // everything it needs except quiescence, so it must sit on its hands.
  const round = await fetch(`${RGS}/round`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: started.sessionId, bet: 1 }),
  }).then((r) => r.json());

  const tRoundOpen = Date.now();
  c.send({ t: 'local:preloaded' });

  // Round is open for resolveMs. Sample well inside that window.
  await sleep(Math.floor(round.resolveMs * 0.7));
  const q = await fetch(`${RGS}/session/${started.sessionId}/quiescent`).then((r) => r.json());
  check('round still open mid-window', q.roundOpen === true);
  check(
    'arbiter did NOT signal handoff during open round',
    !c.sawSince(tRoundOpen, (m) => m.t === 'handoff:go')
  );

  // Once it settles, the handoff should follow promptly.
  const go = await c.waitFor((m) => m.t === 'handoff:go', 8000).catch(() => null);
  check('handoff signalled after settle', !!go);
  if (go) {
    const delay = go.at - (tRoundOpen + round.resolveMs);
    check('handoff followed settle within 1s', delay < 1000, `(${delay}ms after settle)`);
  }

  c.close();
}

/* ---------------------------------------------------------------- */
/* RULE 2 - never tear down the edge before the device confirms      */
/* ---------------------------------------------------------------- */

async function testRecoveryFailureKeepsSession() {
  console.log('\nRULE 2: failed recovery leaves the player on the edge, session intact');
  await faults({ recoveryDown: true });

  const c = connect();
  await c.open();
  c.send({ t: 'start' });
  const started = await c.waitFor((m) => m.t === 'started');
  const sid = started.sessionId;

  c.send({ t: 'local:preloaded' });
  await c.waitFor((m) => m.t === 'handoff:go');

  // Device tries to recover and the RGS refuses. Report the failure.
  const rec = await fetch(`${RGS}/session/${sid}/recover?host=local`);
  check('recovery genuinely failed', rec.status === 503, `(status ${rec.status})`);
  c.send({ t: 'handoff:failed', reason: 'recovery unavailable' });

  const aborted = await c.waitFor((m) => m.t === 'handoff:aborted', 8000).catch(() => null);
  check('client told handoff aborted', !!aborted);

  // The point of rule 2: the edge slot is still leased and still playable.
  const edge = await fetch('http://localhost:4002/stats').then((r) => r.json());
  check('edge slot NOT released', edge.pool.inUse >= 1, `(inUse=${edge.pool.inUse})`);

  const state = await fetch(`${RGS}/session/${sid}/state`).then((r) => r.json());
  check('session still alive with balance', typeof state.balance === 'number', `(${state.balance})`);

  // And the player can still play on the stream after the failed handoff.
  const spin = await fetch(`${RGS}/round`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: sid, bet: 1 }),
  });
  check('can still bet after failed handoff', spin.ok, `(status ${spin.status})`);

  await faults({ recoveryDown: false });
  c.close();
  await sleep(300);
}

/* ---------------------------------------------------------------- */
/* Recovery restores real state, not a fresh session                 */
/* ---------------------------------------------------------------- */

async function testRecoveryPreservesBalance() {
  console.log('\nRECOVERY: the moved session keeps its balance and limits');
  await faults({ recoveryDown: false });
  const s = await fetch(`${RGS}/session/create`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  }).then((r) => r.json());

  await fetch(`${RGS}/round`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: s.sessionId, bet: 1 }),
  });
  await sleep(1100);

  const before = await fetch(`${RGS}/session/${s.sessionId}/state`).then((r) => r.json());
  const after = await fetch(`${RGS}/session/${s.sessionId}/recover?host=local`).then((r) => r.json());

  check('balance identical across the move', after.balance === before.balance,
    `(${before.balance} -> ${after.balance})`);
  check('loss limit carried over', after.limits.lossSoFar === before.limits.lossSoFar);
  check('same session id', after.sessionId === s.sessionId);
  check('rounds played preserved', after.roundsPlayed === before.roundsPlayed);
  check('RGS recorded the new host', after.host === 'local');
}

await testQuiescenceGate();
await testRecoveryFailureKeepsSession();
await testRecoveryPreservesBalance();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

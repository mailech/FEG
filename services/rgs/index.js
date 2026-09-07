/**
 * Mock RGS (Remote Game Server).
 *
 * Stands in for the provider's certified remote game server. Two jobs:
 *
 *   1. It is the SOLE authority for outcomes. The edge instance and the local
 *      instance are both just rendering hosts. Neither ever decides a spin.
 *      This is what makes the edge path defensible to an auditor.
 *
 *   2. It owns the session recovery call. GLI-19 already requires every
 *      certified game to restore state after an interruption. We reuse that
 *      exact mechanism as a live migration primitive: the local instance
 *      "recovers" a session that was never actually disconnected.
 *
 * Round state doubles as the quiescence signal the handoff arbiter reads.
 * A session is quiescent when no round is open. The arbiter therefore never
 * needs to reach inside the game bundle to know when it is safe to switch.
 */

import express from 'express';
import crypto from 'node:crypto';

const PORT = process.env.RGS_PORT || 4001;
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'content-type');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// --- in-memory store. Redis in the real thing; a Map is enough for 48 hours.
const sessions = new Map();
const audit = [];

// Demo controls. The presentation deliberately breaks recovery once on stage
// to show the session survives, so that has to be switchable at runtime.
const faults = {
  recoveryDown: false,
  recoveryLatencyMs: 0,
};

const SPIN_RESOLVE_MS = 900; // server-side round duration, incl. settle

function log(sessionId, event, detail = {}) {
  const entry = { at: Date.now(), sessionId, event, ...detail };
  audit.push(entry);
  if (audit.length > 5000) audit.shift();
  return entry;
}

function publicView(s) {
  return {
    sessionId: s.id,
    balance: s.balance,
    currency: s.currency,
    limits: s.limits,
    round: s.round
      ? { roundId: s.round.roundId, open: s.round.open, bet: s.round.bet }
      : null,
    quiescent: isQuiescent(s),
    roundsPlayed: s.roundsPlayed,
  };
}

/**
 * Quiescence: no round in flight. This is the ONLY condition the arbiter is
 * allowed to hand off on. If a round is open, money is in the air and a
 * migration could double-settle or lose a win.
 */
function isQuiescent(s) {
  return !s.round || !s.round.open;
}

app.post('/session/create', (req, res) => {
  const id = crypto.randomBytes(8).toString('hex');
  const s = {
    id,
    balance: Number(req.body?.balance ?? 500.0),
    currency: 'EUR',
    limits: {
      // Surfaced on the lock screen as the Future-You Lock card.
      dailyLossLimit: Number(req.body?.dailyLossLimit ?? 50.0),
      lossSoFar: 0,
      sessionMinutes: 60,
    },
    round: null,
    roundsPlayed: 0,
    createdAt: Date.now(),
    // Where the session is currently being rendered. The RGS does not care,
    // but recording it proves the session identity is stable across the move.
    host: 'edge',
    recoveredCount: 0,
  };
  sessions.set(id, s);
  log(id, 'session.create', { balance: s.balance });
  res.json(publicView(s));
});

/**
 * The recovery call. In production this is the provider's existing endpoint,
 * invoked by the game client after a disconnect. We invoke it after a
 * deliberate, planned migration instead. Byte-identical request, same
 * certified code path, different reason for calling it.
 */
app.get('/session/:id/recover', async (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'unknown session' });

  if (faults.recoveryLatencyMs) {
    await new Promise((r) => setTimeout(r, faults.recoveryLatencyMs));
  }
  if (faults.recoveryDown) {
    log(s.id, 'recover.failed', { reason: 'fault injected' });
    return res.status(503).json({ error: 'recovery unavailable' });
  }

  s.recoveredCount += 1;
  s.host = req.query.host || 'local';
  log(s.id, 'recover.ok', { host: s.host, attempt: s.recoveredCount });
  res.json({ ...publicView(s), host: s.host, recoveredCount: s.recoveredCount });
});

app.post('/round', async (req, res) => {
  const s = sessions.get(req.body?.sessionId);
  if (!s) return res.status(404).json({ error: 'unknown session' });
  if (s.round?.open) return res.status(409).json({ error: 'round already open' });

  const bet = Number(req.body?.bet ?? 1.0);
  if (bet > s.balance) return res.status(402).json({ error: 'insufficient balance' });

  // Responsible gambling: the limit is enforced here, in the money path,
  // not in whichever renderer happens to be showing the game.
  if (s.limits.lossSoFar + bet > s.limits.dailyLossLimit) {
    log(s.id, 'round.blocked', { reason: 'daily loss limit' });
    return res.status(403).json({ error: 'daily loss limit reached', limits: s.limits });
  }

  const roundId = crypto.randomBytes(6).toString('hex');
  s.balance = round2(s.balance - bet);
  s.round = { roundId, open: true, bet, startedAt: Date.now() };
  log(s.id, 'round.open', { roundId, bet });

  // RNG lives here and only here.
  const reels = [rnd(0, 7), rnd(0, 7), rnd(0, 7)];
  const win = payout(reels, bet);

  // Hold the round open for the duration of the animation. The arbiter sees
  // a non-quiescent session for exactly this window and will not hand off.
  setTimeout(() => {
    s.balance = round2(s.balance + win);
    s.round.open = false;
    s.round.settledAt = Date.now();
    s.roundsPlayed += 1;
    const net = win - bet;
    if (net < 0) s.limits.lossSoFar = round2(s.limits.lossSoFar - net);
    log(s.id, 'round.settle', { roundId, win, balance: s.balance });
  }, SPIN_RESOLVE_MS);

  res.json({
    roundId,
    reels,
    win,
    bet,
    resolveMs: SPIN_RESOLVE_MS,
    balanceAfterBet: s.balance,
  });
});

app.get('/session/:id/state', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'unknown session' });
  res.json(publicView(s));
});

// The arbiter polls this. Kept separate so it is obvious in the code review
// that the handoff decision reads round state only, never game internals.
app.get('/session/:id/quiescent', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'unknown session' });
  res.json({ sessionId: s.id, quiescent: isQuiescent(s), roundOpen: !!s.round?.open });
});

app.get('/session/:id/audit', (req, res) => {
  res.json(audit.filter((a) => a.sessionId === req.params.id));
});

// --- demo fault injection, driven from the dashboard during the stage run
app.post('/admin/faults', (req, res) => {
  if (typeof req.body?.recoveryDown === 'boolean') faults.recoveryDown = req.body.recoveryDown;
  if (typeof req.body?.recoveryLatencyMs === 'number') faults.recoveryLatencyMs = req.body.recoveryLatencyMs;
  log('-', 'faults.set', faults);
  res.json(faults);
});
app.get('/admin/faults', (_req, res) => res.json(faults));

app.get('/health', (_req, res) =>
  res.json({ ok: true, sessions: sessions.size, faults })
);

function rnd(min, max) {
  return crypto.randomInt(min, max + 1);
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function payout(reels, bet) {
  const [a, b, c] = reels;
  if (a === b && b === c) return round2(bet * (a === 7 ? 50 : 12));
  if (a === b || b === c || a === c) return round2(bet * 2);
  return 0;
}

app.listen(PORT, () => {
  console.log(`[rgs]  listening on http://localhost:${PORT}`);
  console.log('[rgs]  sole authority for outcomes; owns the recovery call');
});

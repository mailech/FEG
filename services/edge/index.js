/**
 * Edge entry point: pool + transport + arbiter wired to one WebSocket.
 *
 * Transport choice. The PRD says decide between WebRTC and MJPEG at hour 4 and
 * commit. This is the MJPEG-shaped path, but done through CDP's screencast
 * rather than repeated page.screenshot() calls -- Chromium pushes JPEG frames
 * as they are composited, which is roughly an order of magnitude cheaper than
 * polling screenshots and is what makes 30fps feasible at all.
 *
 * Swapping this for WebRTC later touches only this file: the pool, the
 * arbiter and the client protocol stay as they are.
 */

import http from 'node:http';
import { WebSocketServer } from 'ws';
import { ContextPool } from './pool.js';
import { HandoffArbiter } from './arbiter.js';

const PORT = process.env.EDGE_PORT || 4002;
const WEB_URL = process.env.WEB_URL || 'http://localhost:4000';
const RGS_URL = process.env.RGS_URL || 'http://localhost:4001';

const pool = new ContextPool({
  gameUrl: `${WEB_URL}/game/`,
  rgsUrl: RGS_URL,
  size: Number(process.env.POOL_SIZE || 2),
  payloadMb: Number(process.env.PAYLOAD_MB || 8),
  initDelay: Number(process.env.INIT_DELAY_MS || 1200),
});

const arbiter = new HandoffArbiter({
  rgsUrl: RGS_URL,
  onRelease: (sid) => pool.release(sid),
});

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url.startsWith('/stats')) {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ pool: pool.snapshot(), handoff: arbiter.snapshot() }, null, 2));
  }
  // Counters accumulate across fault-injection runs, which makes the handoff
  // success rate read low for reasons that are not failures. Reset before a
  // measured run so the dashboard shows that run only.
  if (req.url.startsWith('/stats/reset')) {
    pool.stats.claimWaitMs = [];
    pool.stats.claimed = pool.stats.released = pool.stats.warmSecondsServed = 0;
    Object.assign(arbiter.stats, { attempted: 0, confirmed: 0, failed: 0, timedOut: 0 });
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ ok: true }));
  }
  if (req.url.startsWith('/health')) {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ ok: true, warm: pool.warm.length }));
  }
  res.statusCode = 404;
  res.end('edge');
});

const wss = new WebSocketServer({ server, path: '/stream' });

wss.on('connection', async (ws) => {
  const send = (o) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(o)); };
  let slot = null;
  let cdp = null;
  let sessionId = null;
  let frames = 0;
  let bytes = 0;

  const teardown = async () => {
    if (!sessionId) return;
    arbiter.untrack(sessionId);
    try { await cdp?.send('Page.stopScreencast'); } catch {}
    // If the player just closed the tab mid-session (no handoff), the slot is
    // still leased. Release it so the pool does not leak.
    if (pool.inUse.has(sessionId)) await pool.release(sessionId);
    sessionId = null;
  };

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // --- claim a warm context and start streaming
    if (msg.t === 'start') {
      const t0 = Date.now();
      try {
        const s = await fetch(`${RGS_URL}/session/create`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        }).then((r) => r.json());
        sessionId = s.sessionId;

        slot = await pool.claim(sessionId);
        cdp = await slot.context.newCDPSession(slot.page);

        cdp.on('Page.screencastFrame', async (f) => {
          frames += 1;
          bytes += f.data.length;
          send({ t: 'frame', d: f.data });
          try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
        });

        await cdp.send('Page.startScreencast', {
          format: 'jpeg',
          quality: Number(process.env.JPEG_QUALITY || 62),
          maxWidth: 560,
          maxHeight: 900,
          everyNthFrame: 1,
        });

        arbiter.track(sessionId, send);
        send({
          t: 'started',
          sessionId,
          balance: s.balance,
          limits: s.limits,
          claimMs: slot.claimWaitMs,
          serverMs: Date.now() - t0,
          coldStart: !!slot.coldStart,
        });
      } catch (err) {
        console.error('[edge] start failed:', err.message);
        send({ t: 'error', message: err.message });
      }
      return;
    }

    // --- input forwarding: normalised coords so client size does not matter
    if (msg.t === 'pointer' && slot) {
      const x = Math.round(msg.x * 560);
      const y = Math.round(msg.y * 900);
      const type =
        msg.kind === 'down' ? 'mousePressed' : msg.kind === 'up' ? 'mouseReleased' : 'mouseMoved';
      try {
        await cdp.send('Input.dispatchMouseEvent', {
          type, x, y, button: 'left', clickCount: msg.kind === 'move' ? 0 : 1,
        });
      } catch {}
      return;
    }

    if (msg.t === 'local:preloaded' && sessionId) return arbiter.localPreloaded(sessionId);
    if (msg.t === 'handoff:confirmed' && sessionId) {
      await arbiter.confirmed(sessionId);
      try { await cdp?.send('Page.stopScreencast'); } catch {}
      return;
    }
    if (msg.t === 'handoff:failed' && sessionId) return arbiter.failed(sessionId, msg.reason);
  });

  ws.on('close', teardown);
  ws.on('error', teardown);

  const statsTimer = setInterval(() => {
    send({ t: 'transport', frames, kb: Math.round((bytes * 0.75) / 1024) });
  }, 1000);
  ws.on('close', () => clearInterval(statsTimer));
});

await pool.start();
server.listen(PORT, () => {
  console.log(`[edge] listening on http://localhost:${PORT}  ws /stream`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log('\n[edge] shutting down');
    await pool.stop();
    process.exit(0);
  });
}

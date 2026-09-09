/**
 * Live session relay.  node Solution/server/relay.mjs
 *
 * The phone runs the product; the laptop runs the dashboards. This is the wire
 * between them, so a judge can watch the model's read change on a projector
 * while someone plays on a handset — which is the difference between claiming
 * the model is live and showing it.
 *
 * Deliberately zero dependencies: node:http, Server-Sent Events, and a POST.
 * A hackathon demo should not fail because a websocket library did not install
 * on the venue wifi. SSE reconnects on its own, which is the other reason.
 *
 * Nothing here is a store. Snapshots are held in memory, capped, and dropped on
 * restart — the relay forwards what the device already computed and keeps no
 * behavioural record of its own. The models still run on the device.
 */

import http from 'node:http';
import os from 'node:os';

const PORT = Number(process.argv[2]) || 8787;
const KEEP = 200;

// A session that has not published for this long is over. Without expiry the
// relay accumulates every session it has ever seen and the dashboards report
// people as "playing now" who closed the tab an hour ago.
const STALE_MS = 3 * 60 * 1000;

const clients = new Set();
const messages = [];           // peer-to-peer chat, in memory, capped
const snapshots = new Map();   // sessionId -> latest snapshot
const timeline = [];           // recent events, for the feed panel

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

const MSG_TTL_MS = 15 * 60 * 1000;

const prune = () => {
  const cutoff = Date.now() - STALE_MS;
  for (const [id, snap] of snapshots) if ((snap.at || 0) < cutoff) snapshots.delete(id);

  // Chat outlives a session on purpose — a reply should still arrive if someone
  // steps away for a minute — but not for ever.
  const msgCutoff = Date.now() - MSG_TTL_MS;
  while (messages.length && messages[0].at < msgCutoff) messages.shift();
};

const broadcast = (type, data) => {
  const frame = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(frame); } catch { clients.delete(res); }
  }
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  prune();

  if (url.pathname === '/health') {
    res.writeHead(200, { ...CORS, 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, clients: clients.size, sessions: snapshots.size }));
  }

  // ---- the dashboards subscribe here
  if (url.pathname === '/feed') {
    res.writeHead(200, {
      ...CORS,
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write(': connected\n\n');
    // Replay current state so a dashboard opened late is not blank.
    res.write(`event: hello\ndata: ${JSON.stringify({
      sessions: [...snapshots.values()],
      timeline: timeline.slice(-60),
      messages: messages.slice(-80),
    })}\n\n`);
    clients.add(res);

    const ping = setInterval(() => {
      try { res.write(': ping\n\n'); } catch { /* dropped below */ }
    }, 20000);

    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return undefined;
  }

  // ---- the app publishes here
  if (url.pathname === '/publish' && req.method === 'POST') {
    let body = '';
    req.on('data', (d) => {
      body += d;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        const snap = JSON.parse(body);
        snap.at = Date.now();
        snapshots.set(snap.sessionId, snap);
        if (snap.last) {
          timeline.push({ sessionId: snap.sessionId, at: snap.at, ...snap.last });
          if (timeline.length > KEEP) timeline.splice(0, timeline.length - KEEP);
        }
        broadcast('snapshot', snap);
        res.writeHead(204, CORS);
        res.end();
      } catch {
        res.writeHead(400, CORS);
        res.end('bad json');
      }
    });
    return undefined;
  }

  // ---- peer chat. One room per pair of sessions, addressed by sessionId.
  if (url.pathname === '/say' && req.method === 'POST') {
    let body = '';
    req.on('data', (d) => {
      body += d;
      if (body.length > 20000) req.destroy();
    });
    req.on('end', () => {
      try {
        const m = JSON.parse(body);
        const msg = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          from: String(m.from || '').slice(0, 64),
          fromName: String(m.fromName || '').slice(0, 40),
          to: String(m.to || '').slice(0, 64),
          text: String(m.text || '').slice(0, 400),
          at: Date.now(),
        };
        messages.push(msg);
        if (messages.length > KEEP) messages.splice(0, messages.length - KEEP);
        broadcast('message', msg);
        res.writeHead(204, CORS);
        res.end();
      } catch {
        res.writeHead(400, CORS);
        res.end('bad json');
      }
    });
    return undefined;
  }

  res.writeHead(404, CORS);
  return res.end('not found');
});

// Expire on a timer too, so a dashboard left open sees people drop off even
// when nothing else is happening.
setInterval(prune, 30000).unref?.();

server.listen(PORT, () => {
  const nets = Object.values(os.networkInterfaces()).flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);
  console.log(`Lantern relay on :${PORT}`);
  console.log(`  dashboards subscribe  http://localhost:${PORT}/feed`);
  console.log(`  app publishes to      http://localhost:${PORT}/publish`);
  if (nets.length) {
    console.log(`\n  from a phone on the same wifi, set EXPO_PUBLIC_RELAY to one of:`);
    nets.forEach((ip) => console.log(`    http://${ip}:${PORT}`));
  }
});

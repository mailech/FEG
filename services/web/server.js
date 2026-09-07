/**
 * Web tier. Serves the player shell, the stand-in game bundle, and the
 * ballast endpoint that gives the stand-in a realistic payload weight.
 *
 * Note on the cross-origin finding in the PRD: in production the provider
 * bundle is served from a provider domain, so a Service Worker on the
 * operator origin cannot touch it. Here we serve the game from our own origin
 * because we have to in order to instrument it at all. That is a limitation
 * of the demo, not a claim about production, and the README says so.
 */

import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const PORT = process.env.WEB_PORT || 4000;

const app = express();
app.use(express.json());

const metrics = {
  launches: 0,
  ballastBytes: 0,
  ttiSamples: [],   // {mode, ms}
  handoffs: { attempted: 0, confirmed: 0, failed: 0 },
};

/**
 * Simulated bundle weight.
 *
 * A real Playtech/Pragmatic title is 20-40 MB. Our stand-in is a few KB, and
 * quoting a speedup against a few KB would be meaningless. So both the
 * baseline and the Ember path load an identical ballast payload, and we
 * report the ballast size next to every number we publish.
 *
 * Incompressible random bytes, so gzip cannot quietly shrink it.
 */
const DEFAULT_KBPS = Number(process.env.BALLAST_KBPS || 0);

app.get('/bundle/ballast', (req, res) => {
  const mb = Math.min(Number(req.query.mb) || 0, 64);
  const total = mb * 1024 * 1024;
  const chunk = 64 * 1024;

  /**
   * Bandwidth pacing.
   *
   * On localhost there is no network, so an unthrottled baseline finishes in
   * about a second and the comparison flatters us badly. We pace the response
   * to a stated link speed instead, so the baseline pays a realistic download
   * cost. 1500 kbps is a conservative mid-range-Android-on-4G figure.
   *
   * The edge warms itself with kbps=0 on purpose, and that is not cheating:
   * an edge PoP sits next to the origin on a fat pipe, while the phone is the
   * one on a mobile link. Modelling both at the phone's speed would be the
   * inaccurate choice.
   */
  const kbps = req.query.kbps !== undefined ? Number(req.query.kbps) : DEFAULT_KBPS;
  const bytesPerSec = kbps > 0 ? (kbps * 1024) / 8 : 0;

  res.set({
    'content-type': 'application/octet-stream',
    'content-length': String(total),
    'cache-control': req.query.cache === '0' ? 'no-store' : 'public, max-age=31536000',
  });
  metrics.ballastBytes += total;

  let sent = 0;
  const buf = crypto.randomBytes(chunk);
  const nextChunk = () => {
    const n = Math.min(chunk, total - sent);
    return n === chunk ? buf : buf.subarray(0, n);
  };

  if (!bytesPerSec) {
    function pump() {
      while (sent < total) {
        const n = Math.min(chunk, total - sent);
        const ok = res.write(nextChunk());
        sent += n;
        if (!ok) return res.once('drain', pump);
      }
      res.end();
    }
    return pump();
  }

  const intervalMs = Math.max(10, (chunk / bytesPerSec) * 1000);
  const timer = setInterval(() => {
    if (sent >= total || res.writableEnded) {
      clearInterval(timer);
      if (!res.writableEnded) res.end();
      return;
    }
    const n = Math.min(chunk, total - sent);
    res.write(nextChunk());
    sent += n;
  }, intervalMs);
  res.on('close', () => clearInterval(timer));
});

app.post('/telemetry/tti', (req, res) => {
  const { mode, ms } = req.body || {};
  if (typeof ms === 'number' && mode) {
    metrics.launches += 1;
    metrics.ttiSamples.push({ mode, ms, at: Date.now() });
    if (metrics.ttiSamples.length > 1000) metrics.ttiSamples.shift();
    console.log(`[web]  tti mode=${mode} ${ms}ms`);
  }
  res.json({ ok: true });
});

app.post('/telemetry/handoff', (req, res) => {
  const { outcome } = req.body || {};
  if (outcome === 'attempted') metrics.handoffs.attempted += 1;
  if (outcome === 'confirmed') metrics.handoffs.confirmed += 1;
  if (outcome === 'failed') metrics.handoffs.failed += 1;
  console.log(`[web]  handoff ${outcome}`);
  res.json({ ok: true });
});

function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

app.get('/stats', (_req, res) => {
  const byMode = {};
  for (const s of metrics.ttiSamples) (byMode[s.mode] ||= []).push(s.ms);
  const out = {};
  for (const [mode, xs] of Object.entries(byMode)) {
    out[mode] = { n: xs.length, p50: pct(xs, 50), p95: pct(xs, 95), min: Math.min(...xs), max: Math.max(...xs) };
  }
  res.json({ tti: out, handoffs: metrics.handoffs, launches: metrics.launches });
});

// Prometheus scrape target for the Grafana board in the demo rig.
app.get('/metrics', (_req, res) => {
  const byMode = {};
  for (const s of metrics.ttiSamples) (byMode[s.mode] ||= []).push(s.ms);
  const lines = [
    '# HELP ember_tti_ms Time from tap to first interactive frame',
    '# TYPE ember_tti_ms gauge',
  ];
  for (const [mode, xs] of Object.entries(byMode)) {
    lines.push(`ember_tti_ms{mode="${mode}",quantile="0.5"} ${pct(xs, 50)}`);
    lines.push(`ember_tti_ms{mode="${mode}",quantile="0.95"} ${pct(xs, 95)}`);
    lines.push(`ember_tti_samples{mode="${mode}"} ${xs.length}`);
  }
  lines.push('# TYPE ember_handoffs_total counter');
  for (const [k, v] of Object.entries(metrics.handoffs)) {
    lines.push(`ember_handoffs_total{outcome="${k}"} ${v}`);
  }
  res.type('text/plain').send(lines.join('\n') + '\n');
});

app.use('/game', express.static(path.join(ROOT, 'game'), { etag: true }));
app.use('/', express.static(path.join(ROOT, 'client'), { etag: false, cacheControl: false }));

app.listen(PORT, () => {
  console.log(`[web]  listening on http://localhost:${PORT}`);
});

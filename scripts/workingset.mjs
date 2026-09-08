/**
 * Working-set measurement on a REAL certified game bundle.
 *
 * The research memo's A2 idea (REAP-for-games) rests on an unverified claim:
 * that a game touches only a small, stable subset of its own bundle to reach
 * the first interactive frame. It notes nobody has published that measurement
 * for games. This script measures it, on an actual 97 MB HTML5 slot.
 *
 * Method: serve the bundle locally, load it in Chrome, record every request
 * with CDP (encodedDataLength = real bytes on the wire), and snapshot the
 * cumulative total at the moment the loading overlay goes away — the game's
 * own signal that it is ready to play.
 *
 *   node scripts/workingset.mjs [runs]
 */

import { chromium } from 'playwright';
import express from 'express';
import compression from 'compression';
import fs from 'node:fs';
import path from 'node:path';

const RUNS = Number(process.argv[2] || 3);
const PORT = 4010;
const ROOT = path.resolve('empireofgold');

// Serve the bundle the way a CDN would: compressed, cacheable.
const app = express();
app.use(compression());
app.use(express.static(ROOT, { etag: true, maxAge: '1y' }));
const server = app.listen(PORT);
console.log(`serving ${ROOT} on :${PORT}`);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const runs = [];

for (let run = 1; run <= RUNS; run++) {
  // Fresh context each run: no HTTP cache, so we measure a genuine cold load.
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

  const reqs = new Map();
  const order = [];
  cdp.on('Network.requestWillBeSent', (e) =>
    reqs.set(e.requestId, { url: e.request.url, bytes: 0, at: Date.now() })
  );
  cdp.on('Network.loadingFinished', (e) => {
    const r = reqs.get(e.requestId);
    if (r) { r.bytes = e.encodedDataLength; r.done = Date.now(); order.push(r); }
  });

  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });

  // The bundle ships its own loading overlay (#preload). When the game hides
  // it, the game itself considers it ready. That is the honest anchor for
  // "first interactive frame" -- we are reading the game's own signal, not
  // guessing from the network going quiet.
  let readyMs = null;
  try {
    await page.waitForFunction(() => {
      const el = document.getElementById('preload');
      if (!el) return true;
      const s = getComputedStyle(el);
      return s.display === 'none' || s.opacity === '0' || s.visibility === 'hidden' || !el.isConnected;
    }, null, { timeout: 90_000 });
    readyMs = Date.now() - t0;
  } catch {
    readyMs = null;
  }

  const atReady = readyMs ? order.filter((r) => r.done - t0 <= readyMs) : [];
  const wsBytes = atReady.reduce((a, r) => a + r.bytes, 0);

  // Then let it keep loading to see what the full picture looks like.
  await page.waitForTimeout(25_000);
  const allBytes = order.reduce((a, r) => a + r.bytes, 0);

  runs.push({
    run, readyMs,
    workingSetMb: wsBytes / 1048576,
    workingSetFiles: atReady.length,
    totalMb: allBytes / 1048576,
    totalFiles: order.length,
    urls: atReady.map((r) => r.url.replace(`http://localhost:${PORT}/`, '')),
  });

  console.log(
    `run ${run}: ready at ${readyMs ?? 'TIMEOUT'}ms · working set ${(wsBytes / 1048576).toFixed(2)} MB / ${atReady.length} files` +
    ` · after 25s more: ${(allBytes / 1048576).toFixed(2)} MB / ${order.length} files`
  );
  await ctx.close();
}

await browser.close();
server.close();

// --- stability: is the working set the same set each run? (REAP's assumption,
// which FaaSnap disputes. Worth checking rather than asserting.)
const sets = runs.filter((r) => r.readyMs).map((r) => new Set(r.urls));
let stability = null;
if (sets.length > 1) {
  const inter = [...sets[0]].filter((u) => sets.every((s) => s.has(u)));
  const union = new Set(sets.flatMap((s) => [...s]));
  stability = { intersection: inter.length, union: union.size, jaccard: inter.length / union.size };
}

const onDisk = (() => {
  let t = 0;
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    e.isDirectory() ? walk(p) : (t += fs.statSync(p).size);
  });
  walk(ROOT);
  return t / 1048576;
})();

const ok = runs.filter((r) => r.readyMs);
console.log('\n================ working set ================');
console.log(`bundle on disk            ${onDisk.toFixed(1)} MB`);
if (ok.length) {
  const avgWs = ok.reduce((a, r) => a + r.workingSetMb, 0) / ok.length;
  const avgReady = ok.reduce((a, r) => a + r.readyMs, 0) / ok.length;
  console.log(`time to game-ready        ${Math.round(avgReady)} ms (uncapped localhost)`);
  console.log(`working set to ready      ${avgWs.toFixed(2)} MB in ${ok[0].workingSetFiles} files`);
  console.log(`working set / on disk     ${((avgWs / onDisk) * 100).toFixed(1)}%`);
  if (stability) {
    console.log(`working-set stability     Jaccard ${stability.jaccard.toFixed(3)} (${stability.intersection} common of ${stability.union} union)`);
  }
}
console.log('=============================================');

fs.mkdirSync('recon', { recursive: true });
fs.writeFileSync('recon/working-set.json', JSON.stringify({ onDiskMb: onDisk, runs, stability }, null, 2));
console.log('written to recon/working-set.json');

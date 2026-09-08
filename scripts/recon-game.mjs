/**
 * Deep recon on a single PSK game launch.
 *
 * This answers the question the whole architecture rests on: when a player
 * taps a game, what actually loads, from which origins, and how big is it?
 *
 * Uses CDP Network events rather than content-length, because most responses
 * are compressed and content-length is either absent or misleading.
 * encodedDataLength is the real bytes-on-the-wire figure.
 *
 * Read-only. Demo/fun mode only: no login, no real-money path.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';

fs.mkdirSync('recon', { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  locale: 'hr-HR',
});
const page = await ctx.newPage();

// --- 1. find real game entries from the lobby
console.log('loading casino lobby to enumerate games...');
await page.goto('https://casino.psk.hr/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
await page.waitForTimeout(6000);

const games = await page.evaluate(() => {
  const out = [];
  for (const a of document.querySelectorAll('a[href*="/play/"]')) {
    out.push({ href: a.href, text: (a.textContent || '').trim().slice(0, 60) });
  }
  return out.slice(0, 60);
});
console.log(`found ${games.length} /play/ links`);
for (const g of games.slice(0, 10)) console.log('   ', g.href, g.text ? `(${g.text})` : '');

// PSK uses /play/<id>/real. Try the demo variants that do not need a login.
const sample = games[0]?.href;
const candidates = [];
if (sample) {
  const base = sample.replace(/\/(real|demo|fun)$/, '');
  candidates.push(`${base}/demo`, `${base}/fun`, sample);
}

// --- 2. instrument the network before launching a game
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');

const net = new Map();
cdp.on('Network.requestWillBeSent', (e) => {
  net.set(e.requestId, { url: e.request.url, type: e.type, bytes: 0, startedAt: e.timestamp });
});
cdp.on('Network.loadingFinished', (e) => {
  const r = net.get(e.requestId);
  if (r) { r.bytes = e.encodedDataLength; r.finishedAt = e.timestamp; }
});
cdp.on('Network.responseReceived', (e) => {
  const r = net.get(e.requestId);
  if (r) { r.status = e.response.status; r.mime = e.response.mimeType; }
});

let launched = null;
for (const url of candidates) {
  net.clear();
  console.log(`\ntrying ${url}`);
  const t0 = Date.now();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  } catch (e) {
    console.log('  nav error:', e.message.split('\n')[0]);
    continue;
  }
  await page.waitForTimeout(12_000); // let the game bundle actually arrive

  const frames = page.frames().map((f) => {
    let host = '';
    try { host = new URL(f.url()).host; } catch {}
    return { host, url: f.url().slice(0, 240) };
  });

  const gameFrames = frames.filter((f) => f.host && !f.host.endsWith('psk.hr'));
  console.log(`  frames: ${frames.length}, non-psk.hr frames: ${gameFrames.length}`);
  for (const f of frames) console.log(`    [${f.host || 'about:blank'}] ${f.url.slice(0, 120)}`);

  launched = { url, loadMs: Date.now() - t0, frames };
  if (gameFrames.length) break; // found a real provider frame, stop here
}

// --- 3. summarise the waterfall
const reqs = [...net.values()].filter((r) => r.bytes > 0);
const byHost = {};
for (const r of reqs) {
  let host = '';
  try { host = new URL(r.url).host; } catch { continue; }
  byHost[host] ||= { bytes: 0, count: 0, types: new Set() };
  byHost[host].bytes += r.bytes;
  byHost[host].count += 1;
  byHost[host].types.add(r.type);
}
const hosts = Object.entries(byHost)
  .map(([host, v]) => ({ host, kb: Math.round(v.bytes / 1024), count: v.count, types: [...v.types] }))
  .sort((a, b) => b.kb - a.kb);

const totalKb = Math.round(reqs.reduce((a, r) => a + r.bytes, 0) / 1024);
console.log(`\n=== game launch waterfall ===`);
console.log(`total ${totalKb} KB over ${reqs.length} requests`);
for (const h of hosts.slice(0, 20)) {
  const own = h.host.endsWith('psk.hr') ? 'PSK  ' : 'THIRD';
  console.log(`  ${own} ${String(h.kb).padStart(6)} KB  ${String(h.count).padStart(3)} req  ${h.host}`);
}

const third = hosts.filter((h) => !h.host.endsWith('psk.hr'));
const thirdKb = third.reduce((a, h) => a + h.kb, 0);
console.log(`\nthird-party (non psk.hr) bytes: ${thirdKb} KB of ${totalKb} KB (${totalKb ? Math.round((thirdKb / totalKb) * 100) : 0}%)`);

const biggest = reqs.sort((a, b) => b.bytes - a.bytes).slice(0, 15);
console.log('\nlargest individual resources:');
for (const r of biggest) {
  console.log(`  ${String(Math.round(r.bytes / 1024)).padStart(6)} KB  ${r.mime || r.type}  ${r.url.slice(0, 110)}`);
}

fs.writeFileSync('recon/game-launch.json', JSON.stringify({ launched, hosts, totalKb, biggest: biggest.map((b) => ({ kb: Math.round(b.bytes / 1024), url: b.url, mime: b.mime })) }, null, 2));
await page.screenshot({ path: 'recon/game-launch.png' }).catch(() => {});
console.log('\nwritten to recon/game-launch.json');

await browser.close();

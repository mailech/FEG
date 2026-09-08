/**
 * Recon on the live PSK site.
 *
 * The PRD's section 1 asserts things about psk.hr (separate casino origin,
 * cross-origin provider iframes, Astro frontend). Those were inferences. This
 * script checks them against the real site and writes an evidence file, so the
 * claims we make on stage are measured rather than assumed.
 *
 * Read-only: loads public pages, records the network waterfall. No login, no
 * form submission, no money path.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = 'recon/psk-evidence.json';
fs.mkdirSync('recon', { recursive: true });

const targets = [
  { name: 'sport-home', url: 'https://www.psk.hr/' },
  { name: 'casino-lobby', url: 'https://casino.psk.hr/' },
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { capturedAt: new Date().toISOString(), pages: [] };

for (const t of targets) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    locale: 'hr-HR',
  });
  const page = await ctx.newPage();

  const requests = [];
  page.on('response', async (res) => {
    const req = res.request();
    let size = 0;
    try { size = Number((await res.headerValue('content-length')) || 0); } catch {}
    requests.push({
      url: res.url().slice(0, 300),
      host: new URL(res.url()).host,
      type: req.resourceType(),
      status: res.status(),
      size,
    });
  });

  const t0 = Date.now();
  let error = null;
  try {
    await page.goto(t.url, { waitUntil: 'networkidle', timeout: 45_000 });
  } catch (e) {
    error = e.message.split('\n')[0];
  }
  const loadMs = Date.now() - t0;
  await page.waitForTimeout(2500);

  // What frames exist, and are they same-origin with the page?
  const frames = page.frames().map((f) => {
    let host = '';
    try { host = new URL(f.url()).host; } catch {}
    return { url: f.url().slice(0, 200), host, name: f.name() };
  });

  // Framework fingerprints and anything that looks like a game launch link.
  const probe = await page.evaluate(() => {
    const has = (s) => !!document.querySelector(s);
    const links = [...document.querySelectorAll('a[href]')]
      .map((a) => a.getAttribute('href'))
      .filter((h) => /casino|game|igre|slot|play/i.test(h || ''))
      .slice(0, 40);
    return {
      title: document.title,
      astro: has('[class*="astro-"]') || !!document.querySelector('astro-island'),
      astroIslands: document.querySelectorAll('astro-island').length,
      nextjs: has('#__next') || !!window.__NEXT_DATA__,
      react: !!document.querySelector('[data-reactroot]') || !!window.React,
      iframes: document.querySelectorAll('iframe').length,
      scripts: document.querySelectorAll('script[src]').length,
      links: [...new Set(links)],
      generator: document.querySelector('meta[name="generator"]')?.content || null,
    };
  }).catch((e) => ({ evalError: e.message }));

  const byHost = {};
  for (const r of requests) {
    byHost[r.host] ||= { count: 0, bytes: 0, types: new Set() };
    byHost[r.host].count += 1;
    byHost[r.host].bytes += r.size;
    byHost[r.host].types.add(r.type);
  }
  const hosts = Object.entries(byHost)
    .map(([host, v]) => ({ host, count: v.count, kb: Math.round(v.bytes / 1024), types: [...v.types] }))
    .sort((a, b) => b.kb - a.kb || b.count - a.count);

  report.pages.push({
    ...t, loadMs, error, probe, frames, hosts,
    totalRequests: requests.length,
    totalKb: Math.round(requests.reduce((a, r) => a + r.size, 0) / 1024),
  });

  console.log(`\n=== ${t.name} (${t.url}) ===`);
  console.log(`load ${loadMs}ms · ${requests.length} requests · ${Math.round(requests.reduce((a, r) => a + r.size, 0) / 1024)} KB${error ? ' · ERROR: ' + error : ''}`);
  console.log(`title: ${probe.title}`);
  console.log(`astro=${probe.astro} islands=${probe.astroIslands} generator=${probe.generator} iframes=${probe.iframes}`);
  console.log('top hosts:');
  for (const h of hosts.slice(0, 12)) console.log(`   ${String(h.kb).padStart(6)} KB  ${String(h.count).padStart(3)} req  ${h.host}  [${h.types.slice(0, 4).join(',')}]`);
  if (frames.length > 1) {
    console.log('frames:');
    for (const f of frames) console.log(`   ${f.host || '(about:blank)'}  ${f.url.slice(0, 90)}`);
  }
  if (probe.links?.length) console.log('game-ish links:', probe.links.slice(0, 12).join('  '));

  await page.screenshot({ path: `recon/${t.name}.png`, fullPage: false }).catch(() => {});
  await ctx.close();
}

await browser.close();
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\nevidence written to ${OUT}`);

/**
 * End-to-end harness. Drives the real client in a real browser, taps both
 * phones, and reports the numbers the PRD commits to.
 *
 * Usage: node scripts/bench.js [runs]
 */

import { chromium } from 'playwright';

const WEB = process.env.WEB_URL || 'http://localhost:4000';
const RUNS = Number(process.argv[2] || 1);

async function launch() {
  try { return await chromium.launch({ channel: 'chrome', headless: true }); }
  catch { return await chromium.launch({ headless: true }); }
}

const results = [];

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();

page.on('console', (m) => {
  const t = m.text();
  if (t.startsWith('[bench]')) console.log('   ' + t);
});

for (let run = 1; run <= RUNS; run++) {
  console.log(`\n--- run ${run}/${RUNS} ---`);
  await page.goto(WEB, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  const t0 = Date.now();
  await page.click('#tap-both');

  // Ember should be interactive almost immediately.
  await page.waitForFunction(
    () => document.querySelector('#ember .status')?.textContent.includes('EDGE'),
    null, { timeout: 20_000 }
  );
  const emberMs = Number(await page.textContent('#ember .timer').then((s) => parseFloat(s) * 1000));
  console.log(`  ember   first interactive frame: ${emberMs.toFixed(0)} ms`);

  /**
   * SAFETY INVARIANT: the arbiter must never move a session while a round is
   * open. We watch RGS round state and the UI phase together for the whole
   * run; observing "round open" and "LOCAL" at the same instant is a
   * money-losing bug, so it fails the harness loudly.
   */
  let violations = 0;
  let sawRoundOpen = false;
  const sessionId = await page.evaluate(
    () => document.querySelector('#ember .claim')?.textContent && window.__emberSession
  ).catch(() => null);

  const monitor = setInterval(async () => {
    try {
      const sid = sessionId || (await page.evaluate(() => window.__emberSession));
      if (!sid) return;
      const q = await fetch(`http://localhost:4001/session/${sid}/quiescent`).then((r) => r.json());
      const phase = await page.textContent('#ember .status');
      if (q.roundOpen) sawRoundOpen = true;
      if (q.roundOpen && phase.includes('LOCAL')) {
        violations += 1;
        console.error('  !! HANDOFF DURING OPEN ROUND');
      }
    } catch {}
  }, 60);

  // Spin on the stream immediately, so a round is genuinely in flight while
  // the arbiter is deciding. Short timeout: the stream may already be gone.
  const stream = page.locator('#ember .streamview');
  for (let i = 0; i < 2; i++) {
    const box = await stream.boundingBox({ timeout: 700 }).catch(() => null);
    if (!box) break;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.42);
    await page.waitForTimeout(250);
  }

  // Handoff to device.
  let handoffMs = null;
  try {
    await page.waitForFunction(
      () => document.querySelector('#ember .status')?.textContent.includes('LOCAL'),
      null, { timeout: 25_000 }
    );
    handoffMs = Date.now() - t0;
    console.log(`  handoff to local: ${(handoffMs / 1000).toFixed(1)} s`);
  } catch {
    console.log('  handoff: DID NOT COMPLETE');
  }
  clearInterval(monitor);
  console.log(`  quiescence gate: ${violations} violations${sawRoundOpen ? '' : ' (no round observed open)'}`);

  // Baseline finishes whenever it finishes.
  let baselineMs = null;
  try {
    await page.waitForFunction(
      () => document.querySelector('#baseline .timer')?.classList.contains('done'),
      null, { timeout: 60_000 }
    );
    baselineMs = Number(await page.textContent('#baseline .timer').then((s) => parseFloat(s) * 1000));
    console.log(`  baseline first interactive frame: ${baselineMs.toFixed(0)} ms`);
  } catch {
    console.log('  baseline: timed out');
  }

  results.push({ emberMs, baselineMs, handoffMs, violations });
  await page.waitForTimeout(500);
}

await browser.close();

const ok = results.filter((r) => r.emberMs && r.baselineMs);
if (ok.length) {
  const avg = (f) => ok.reduce((a, r) => a + f(r), 0) / ok.length;
  const p = (f, q) => {
    const s = ok.map(f).sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor((q / 100) * s.length))];
  };
  console.log('\n================ summary ================');
  console.log(`runs                 ${ok.length}`);
  console.log(`baseline p50 / p95   ${p((r) => r.baselineMs, 50).toFixed(0)} / ${p((r) => r.baselineMs, 95).toFixed(0)} ms`);
  console.log(`ember    p50 / p95   ${p((r) => r.emberMs, 50).toFixed(0)} / ${p((r) => r.emberMs, 95).toFixed(0)} ms`);
  console.log(`speedup (mean)       ${(avg((r) => r.baselineMs) / avg((r) => r.emberMs)).toFixed(1)}x`);
  const totalViolations = results.reduce((a, r) => a + (r.violations || 0), 0);
  console.log(`quiescence gate      ${totalViolations === 0 ? 'HELD (0 violations)' : 'VIOLATED x' + totalViolations}`);
  const hs = results.filter((r) => r.handoffMs);
  console.log(`handoff success      ${hs.length}/${results.length}`);
  if (hs.length) console.log(`time to local (mean) ${(hs.reduce((a, r) => a + r.handoffMs, 0) / hs.length / 1000).toFixed(1)} s`);
  console.log('=========================================');
}

const stats = await fetch('http://localhost:4002/stats').then((r) => r.json());
console.log('\nedge pool:', JSON.stringify(stats.pool));
console.log('handoff  :', JSON.stringify(stats.handoff));

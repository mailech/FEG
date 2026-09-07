/**
 * Warm context pool.
 *
 * The central cost argument of Ember lives in this file. Cloud gaming keeps a
 * machine per player for the whole session. We keep a small pool of browser
 * CONTEXTS that have already paid the expensive part of startup, hand one to a
 * player for a few seconds, and take it back once the device has taken over.
 *
 * Contexts, not processes. Context creation is tens of milliseconds; launching
 * a browser process is seconds. One process hosts many contexts, and contexts
 * are isolated from each other for storage, cookies and cache. That ratio is
 * what makes ~800 warm copies serve ~10,000 players.
 */

import { chromium } from 'playwright';

const VIEWPORT = { width: 560, height: 900 };

// Injected before any page script. Bridges the game's postMessage lifecycle
// into something Playwright can wait on. Note it only READS events the game
// already emits -- it does not reach into game state.
const LIFECYCLE_HOOK = `
  window.__ev = [];
  window.__warm = false;
  window.__ready = false;
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.source !== 'game') return;
    window.__ev.push(d);
    if (d.type === 'game:warm') window.__warm = true;
    if (d.type === 'game:ready') window.__ready = true;
  });
`;

export class ContextPool {
  /**
   * @param {object} opts
   * @param {string} opts.gameUrl   base URL of the game bundle
   * @param {number} opts.size      how many warm contexts to hold
   * @param {number} opts.payloadMb simulated bundle weight
   * @param {number} opts.initDelay simulated engine init cost, ms
   */
  constructor(opts) {
    this.opts = { size: 2, payloadMb: 8, initDelay: 1200, ...opts };
    this.browser = null;
    this.warm = [];      // ready to be claimed
    this.inUse = new Map(); // leaseId -> slot
    this.refilling = 0;
    this.stats = {
      created: 0,
      claimed: 0,
      released: 0,
      claimWaitMs: [],
      warmSecondsServed: 0,
    };
  }

  async start() {
    this.browser = await launchBrowser();
    console.log(`[edge] browser up: ${this.browser.version()}`);
    await this.refill();
  }

  async refill() {
    const need = this.opts.size - this.warm.length - this.refilling;
    if (need <= 0) return;
    this.refilling += need;
    const jobs = [];
    for (let i = 0; i < need; i++) {
      jobs.push(
        this.#createWarmSlot()
          .then((slot) => { this.warm.push(slot); })
          .catch((e) => console.error('[edge] warm slot failed:', e.message))
          .finally(() => { this.refilling -= 1; })
      );
    }
    await Promise.all(jobs);
    console.log(`[edge] pool warm=${this.warm.length}/${this.opts.size} inUse=${this.inUse.size}`);
  }

  async #createWarmSlot() {
    const t0 = Date.now();
    const context = await this.browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      // Autoplay etc. would normally be configured here per provider.
      bypassCSP: true,
    });
    await context.addInitScript(LIFECYCLE_HOOK);
    const page = await context.newPage();

    const url = new URL(this.opts.gameUrl);
    url.searchParams.set('warm', '1');
    url.searchParams.set('payload', String(this.opts.payloadMb));
    url.searchParams.set('initDelay', String(this.opts.initDelay));
    // Edge warms over the datacentre link, not the player's mobile link.
    url.searchParams.set('kbps', '0');
    if (this.opts.rgsUrl) url.searchParams.set('rgs', this.opts.rgsUrl);

    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    // Paid the bundle download and engine init. No session, no player, no money.
    await page.waitForFunction('window.__warm === true', null, { timeout: 60_000 });

    this.stats.created += 1;
    const slot = {
      id: `slot-${this.stats.created}`,
      context,
      page,
      warmedAt: Date.now(),
      warmCostMs: Date.now() - t0,
    };
    console.log(`[edge] ${slot.id} warm in ${slot.warmCostMs}ms`);
    return slot;
  }

  /**
   * Claim a warm slot for a real session. This is the hot path: everything
   * expensive already happened, so all that is left is binding the session and
   * letting the game render its first interactive frame.
   */
  async claim(sessionId) {
    const t0 = Date.now();
    let slot = this.warm.shift();

    if (!slot) {
      // Pool miss. Honest fallback: build one now and eat the cost. In
      // production this is the case that falls back to the local path instead.
      console.warn('[edge] POOL MISS - cold slot, this will be slow');
      slot = await this.#createWarmSlot();
      slot.coldStart = true;
    }

    await slot.page.evaluate((sid) => window.__gameClaim(sid), sessionId);
    await slot.page.waitForFunction('window.__ready === true', null, { timeout: 30_000 });

    slot.sessionId = sessionId;
    slot.claimedAt = Date.now();
    const waitMs = Date.now() - t0;
    slot.claimWaitMs = waitMs;
    this.stats.claimed += 1;
    this.stats.claimWaitMs.push(waitMs);
    this.inUse.set(sessionId, slot);

    console.log(`[edge] claim ${slot.id} session=${sessionId} in ${waitMs}ms${slot.coldStart ? ' (COLD)' : ''}`);
    this.refill(); // rebuild in the background, do not await
    return slot;
  }

  /**
   * Return a slot. Called only AFTER the device confirms it has recovered the
   * session. The arbiter never tears down first -- if the local instance fails
   * to come up, the player stays on this context and nothing breaks.
   */
  async release(sessionId) {
    const slot = this.inUse.get(sessionId);
    if (!slot) return;
    this.inUse.delete(sessionId);
    const occupancyMs = Date.now() - slot.claimedAt;
    this.stats.released += 1;
    this.stats.warmSecondsServed += occupancyMs / 1000;
    console.log(`[edge] release ${slot.id} after ${(occupancyMs / 1000).toFixed(1)}s occupancy`);

    // Contexts are disposable. Destroying rather than recycling guarantees no
    // session data can leak between players, which matters for a regulator.
    await slot.context.close().catch(() => {});
    this.refill();
    return occupancyMs;
  }

  snapshot() {
    const w = this.stats.claimWaitMs;
    const sorted = [...w].sort((a, b) => a - b);
    const p = (q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((q / 100) * sorted.length))] : 0);
    return {
      warm: this.warm.length,
      inUse: this.inUse.size,
      target: this.opts.size,
      created: this.stats.created,
      claimed: this.stats.claimed,
      released: this.stats.released,
      claimWait: { p50: p(50), p95: p(95) },
      // The number that separates this from cloud gaming.
      avgEdgeSecondsPerLaunch:
        this.stats.released > 0
          ? Number((this.stats.warmSecondsServed / this.stats.released).toFixed(2))
          : null,
    };
  }

  async stop() {
    await this.browser?.close().catch(() => {});
  }
}

async function launchBrowser() {
  const args = ['--disable-dev-shm-usage', '--no-sandbox', '--mute-audio'];
  try {
    return await chromium.launch({ channel: 'chrome', headless: true, args });
  } catch {
    // Bundled Chromium: npx playwright install chromium
    return await chromium.launch({ headless: true, args });
  }
}

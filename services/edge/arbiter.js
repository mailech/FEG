/**
 * Handoff arbiter.
 *
 * Decides the single moment at which a session stops being rendered at the
 * edge and starts being rendered on the device. Two rules govern it, and both
 * exist because this is real money:
 *
 *   RULE 1 - only at quiescence. Never switch with a round open. Quiescence is
 *   read from the RGS, not from the game bundle, so the arbiter needs no
 *   privileged access to certified code.
 *
 *   RULE 2 - never tear down first. The edge context stays alive until the
 *   device has confirmed a successful recovery. If recovery fails, the player
 *   simply keeps playing on the stream and never learns anything happened.
 *
 * The failure run in the demo is rule 2 being exercised on stage.
 */

const POLL_MS = 250;
const CONFIRM_TIMEOUT_MS = 5000;

export class HandoffArbiter {
  /**
   * @param {object} opts
   * @param {string} opts.rgsUrl
   * @param {(sessionId:string)=>Promise<void>} opts.onRelease  release the edge slot
   */
  constructor(opts) {
    this.rgsUrl = opts.rgsUrl;
    this.onRelease = opts.onRelease;
    this.tracked = new Map();
    this.stats = { attempted: 0, confirmed: 0, failed: 0, timedOut: 0 };
  }

  /**
   * @param {string} sessionId
   * @param {(msg:object)=>void} send  channel back to the player's client
   */
  track(sessionId, send) {
    const s = {
      sessionId,
      send,
      phase: 'edge',        // edge -> going -> local
      localPreloaded: false,
      attempts: 0,
      startedAt: Date.now(),
      timer: null,
      confirmTimer: null,
    };
    this.tracked.set(sessionId, s);
    s.timer = setInterval(() => this.#tick(s), POLL_MS);
    return s;
  }

  /** Client reports its on-device copy has finished loading and is parked. */
  localPreloaded(sessionId) {
    const s = this.tracked.get(sessionId);
    if (!s) return;
    s.localPreloaded = true;
    s.localPreloadedAt = Date.now();
    console.log(`[arb] ${short(sessionId)} local copy preloaded after ${s.localPreloadedAt - s.startedAt}ms`);
  }

  async #tick(s) {
    if (s.phase !== 'edge' || !s.localPreloaded) return;

    let q;
    try {
      const res = await fetch(`${this.rgsUrl}/session/${s.sessionId}/quiescent`);
      if (!res.ok) return;
      q = await res.json();
    } catch {
      return; // RGS blip: stay on edge, try again next tick. Never guess.
    }
    if (!q.quiescent) return; // round in flight, money in the air, do not move

    s.phase = 'going';
    s.attempts += 1;
    this.stats.attempted += 1;
    console.log(`[arb] ${short(s.sessionId)} quiescent + local ready -> handoff attempt ${s.attempts}`);
    s.send({ t: 'handoff:go', sessionId: s.sessionId });

    // Rule 2 in code: if the device does not confirm, we do nothing at all.
    s.confirmTimer = setTimeout(() => {
      if (s.phase !== 'going') return;
      this.stats.timedOut += 1;
      this.stats.failed += 1;
      s.phase = 'edge';
      console.warn(`[arb] ${short(s.sessionId)} confirm timeout - staying on edge`);
      s.send({ t: 'handoff:aborted', reason: 'confirm timeout' });
    }, CONFIRM_TIMEOUT_MS);
  }

  /** Device recovered the session successfully. Safe to reclaim the edge slot. */
  async confirmed(sessionId) {
    const s = this.tracked.get(sessionId);
    if (!s || s.phase !== 'going') return;
    clearTimeout(s.confirmTimer);
    s.phase = 'local';
    clearInterval(s.timer);
    this.stats.confirmed += 1;
    const total = Date.now() - s.startedAt;
    console.log(`[arb] ${short(sessionId)} CONFIRMED local after ${total}ms - releasing edge slot`);
    await this.onRelease(sessionId);
    s.send({ t: 'handoff:done', totalMs: total });
  }

  /** Device failed to recover. Player stays on the stream; nothing is lost. */
  failed(sessionId, reason) {
    const s = this.tracked.get(sessionId);
    if (!s) return;
    clearTimeout(s.confirmTimer);
    this.stats.failed += 1;
    s.phase = 'edge';
    console.warn(`[arb] ${short(sessionId)} recovery FAILED (${reason}) - staying on edge, session intact`);
    s.send({ t: 'handoff:aborted', reason });
  }

  untrack(sessionId) {
    const s = this.tracked.get(sessionId);
    if (!s) return;
    clearInterval(s.timer);
    clearTimeout(s.confirmTimer);
    this.tracked.delete(sessionId);
  }

  snapshot() {
    const { attempted, confirmed, failed, timedOut } = this.stats;
    return {
      ...this.stats,
      successRate: attempted ? Number(((confirmed / attempted) * 100).toFixed(1)) : null,
      tracking: this.tracked.size,
    };
  }
}

function short(id) {
  return String(id).slice(0, 6);
}

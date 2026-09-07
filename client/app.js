/**
 * Player client.
 *
 * Runs one of two modes:
 *
 *   baseline - what happens today. Tap, then wait for the whole bundle.
 *   ember    - tap, get a warm edge context streamed instantly, and migrate to
 *              a local copy the moment the session is quiescent.
 *
 * Both modes load an identical game bundle with identical ballast, so the
 * comparison on stage is like for like. The only difference is when the
 * loading happens relative to the tap.
 */

const EDGE_WS = (location.hostname ? `ws://${location.hostname}:4002` : 'ws://localhost:4002') + '/stream';
const RGS = `http://${location.hostname || 'localhost'}:4001`;
const PAYLOAD_MB = Number(new URLSearchParams(location.search).get('payload') ?? 8);
const INIT_DELAY = Number(new URLSearchParams(location.search).get('initDelay') ?? 1200);
/**
 * Simulated mobile link speed, in kbps. Applied identically to the baseline
 * and to the on-device copy, because in reality both cross the same phone
 * link. The edge is exempt: it warms over the datacentre link.
 *
 * 15000 kbps is a decent-4G figure and is chosen to reproduce the problem PSK
 * actually has rather than to flatter us: 12 MB at 15 Mbps is ~6.5 s of
 * download, plus ~1.2 s of engine init, which lands on the 6-8 s that the
 * challenge brief describes. Open question 3 in the PRD asks FEG for their
 * real breakdown so we can replace this estimate with their number.
 */
const LINK_KBPS = Number(new URLSearchParams(location.search).get('kbps') ?? 15000);

function el(id) { return document.getElementById(id); }
function now() { return performance.now(); }

async function report(path, body) {
  try {
    await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {}
}

/* ------------------------------------------------------------------ */
/* Baseline: the seven seconds we are trying to delete.                */
/* ------------------------------------------------------------------ */

class BaselineRunner {
  constructor(root) {
    this.root = root;
    this.t0 = null;
  }

  launch() {
    this.t0 = now();
    const stage = this.root.querySelector('.stage');
    stage.innerHTML = '';
    setStatus(this.root, 'loading', 'Loading game…');
    startTimer(this.root, this.t0);

    const frame = document.createElement('iframe');
    frame.className = 'gameframe';
    frame.src = `/game/?payload=${PAYLOAD_MB}&initDelay=${INIT_DELAY}&kbps=${LINK_KBPS}&rgs=${encodeURIComponent(RGS)}&cachebust=${Date.now()}`;
    stage.appendChild(frame);

    const onMsg = (e) => {
      if (e.data?.source !== 'game') return;
      // Must be OUR frame. The Ember pane also hosts a game that emits
      // game:ready, and without this check whichever fires first wins,
      // which would silently corrupt the headline baseline number.
      if (e.source !== frame.contentWindow) return;
      if (e.data.type === 'game:ready') {
        const ms = Math.round(now() - this.t0);
        stopTimer(this.root, ms);
        setStatus(this.root, 'live', 'Playing');
        report('/telemetry/tti', { mode: 'baseline', ms });
        window.removeEventListener('message', onMsg);
      }
    };
    window.addEventListener('message', onMsg);
  }
}

/* ------------------------------------------------------------------ */
/* Ember: warm edge context now, device takeover shortly after.        */
/* ------------------------------------------------------------------ */

class EmberRunner {
  constructor(root) {
    this.root = root;
    this.ws = null;
    this.t0 = null;
    this.firstFrameAt = null;
    this.sessionId = null;
    this.localFrame = null;
    this.phase = 'idle';
  }

  launch() {
    this.t0 = now();
    const stage = this.root.querySelector('.stage');
    stage.innerHTML = '';
    setStatus(this.root, 'loading', 'Connecting to edge…');
    startTimer(this.root, this.t0);

    // Streamed frames land here. An <img> with a data URL is the crudest
    // possible video sink and it is completely adequate at this frame size.
    this.img = document.createElement('img');
    this.img.className = 'streamview';
    stage.appendChild(this.img);
    this.wireInput(this.img);

    this.ws = new WebSocket(EDGE_WS);
    this.ws.onopen = () => this.ws.send(JSON.stringify({ t: 'start' }));
    this.ws.onmessage = (e) => this.onMessage(JSON.parse(e.data));
    this.ws.onerror = () => setStatus(this.root, 'error', 'Edge unreachable');
    this.ws.onclose = () => { if (this.phase === 'edge') setStatus(this.root, 'error', 'Stream closed'); };

    window.addEventListener('message', (e) => this.onLocalMessage(e));
  }

  onMessage(m) {
    switch (m.t) {
      case 'started':
        this.sessionId = m.sessionId;
        window.__emberSession = m.sessionId; // read by scripts/bench.js
        this.root.querySelector('.claim').textContent = `claim ${m.claimMs}ms${m.coldStart ? ' COLD' : ''}`;
        // Start pulling the on-device copy immediately, in the background,
        // while the player is already playing on the stream.
        this.preloadLocal(m.sessionId);
        break;

      case 'frame':
        this.img.src = `data:image/jpeg;base64,${m.d}`;
        if (!this.firstFrameAt) {
          // The player can see and touch the game. This is time to first
          // interactive frame, and it is the number we quote.
          this.firstFrameAt = now();
          const ms = Math.round(this.firstFrameAt - this.t0);
          this.phase = 'edge';
          stopTimer(this.root, ms);
          setStatus(this.root, 'edge', 'Playing · EDGE');
          report('/telemetry/tti', { mode: 'ember', ms });
        }
        break;

      case 'transport':
        this.root.querySelector('.transport').textContent = `${m.frames} frames · ${m.kb} KB`;
        break;

      case 'handoff:go':
        setStatus(this.root, 'handoff', 'Handing off…');
        report('/telemetry/handoff', { outcome: 'attempted' });
        this.doHandoff();
        break;

      case 'handoff:aborted':
        // Rule 2. The player is still on the stream and never noticed.
        setStatus(this.root, 'edge', `Playing · EDGE (handoff held: ${m.reason})`);
        report('/telemetry/handoff', { outcome: 'failed' });
        break;

      case 'handoff:done':
        this.root.querySelector('.claim').textContent = `local at ${(m.totalMs / 1000).toFixed(1)}s`;
        break;

      case 'error':
        setStatus(this.root, 'error', m.message);
        break;
    }
  }

  /**
   * Pull the game onto the device in a hidden frame, parked at warm. It does
   * NOT recover the session yet -- that would move the session before the
   * arbiter says it is safe.
   */
  preloadLocal(sessionId) {
    this.localFrame = document.createElement('iframe');
    this.localFrame.className = 'gameframe hidden';
    this.localFrame.src =
      `/game/?warm=1&recover=${sessionId}&payload=${PAYLOAD_MB}&initDelay=${INIT_DELAY}&kbps=${LINK_KBPS}&rgs=${encodeURIComponent(RGS)}`;
    this.root.querySelector('.stage').appendChild(this.localFrame);
  }

  onLocalMessage(e) {
    const d = e.data;
    if (d?.source !== 'game') return;
    // Only our on-device copy. The baseline pane emits the same event names.
    if (!this.localFrame || e.source !== this.localFrame.contentWindow) return;

    if (d.type === 'game:warm') {
      this.ws?.send(JSON.stringify({ t: 'local:preloaded' }));
      this.root.querySelector('.local').textContent = 'local copy ready';
    }

    if (d.type === 'game:recovered') {
      // Device has the session. Reveal it, drop the stream, tell the edge it
      // is safe to reclaim the context.
      this.phase = 'local';
      this.localFrame.classList.remove('hidden');
      this.img.remove();
      setStatus(this.root, 'local', 'Playing · LOCAL');
      this.ws?.send(JSON.stringify({ t: 'handoff:confirmed' }));
      report('/telemetry/handoff', { outcome: 'confirmed' });
    }

    if (d.type === 'game:error' && this.phase !== 'local') {
      this.ws?.send(JSON.stringify({ t: 'handoff:failed', reason: d.message }));
      this.localFrame?.remove();
      this.localFrame = null;
      this.root.querySelector('.local').textContent = 'local copy failed';
    }
  }

  doHandoff() {
    const win = this.localFrame?.contentWindow;
    if (!win?.__gameClaim) {
      this.ws?.send(JSON.stringify({ t: 'handoff:failed', reason: 'local frame not ready' }));
      return;
    }
    // Same-origin, so we can call straight into the parked copy. In production
    // this is a postMessage to the provider frame.
    win.__gameClaim(null);
  }

  wireInput(target) {
    const send = (kind) => (ev) => {
      const r = target.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width;
      const y = (ev.clientY - r.top) / r.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      this.ws?.readyState === WebSocket.OPEN &&
        this.ws.send(JSON.stringify({ t: 'pointer', kind, x, y }));
      ev.preventDefault();
    };
    target.addEventListener('pointerdown', send('down'));
    target.addEventListener('pointerup', send('up'));
  }
}

/* ------------------------------------------------------------------ */
/* Shared UI plumbing                                                  */
/* ------------------------------------------------------------------ */

function setStatus(root, cls, text) {
  const s = root.querySelector('.status');
  s.className = `status ${cls}`;
  s.textContent = text;
}

function startTimer(root, t0) {
  const t = root.querySelector('.timer');
  t.classList.add('running');
  cancelAnimationFrame(root.__raf);
  const tick = () => {
    t.textContent = ((now() - t0) / 1000).toFixed(2) + 's';
    root.__raf = requestAnimationFrame(tick);
  };
  tick();
}

function stopTimer(root, ms) {
  cancelAnimationFrame(root.__raf);
  const t = root.querySelector('.timer');
  t.classList.remove('running');
  t.classList.add('done');
  t.textContent = (ms / 1000).toFixed(2) + 's';
}

/* ------------------------------------------------------------------ */

const runners = {
  baseline: new BaselineRunner(el('baseline')),
  ember: new EmberRunner(el('ember')),
};

el('baseline').querySelector('.tap').addEventListener('click', () => runners.baseline.launch());
el('ember').querySelector('.tap').addEventListener('click', () => runners.ember.launch());
el('tap-both').addEventListener('click', () => {
  runners.baseline = new BaselineRunner(el('baseline'));
  runners.ember = new EmberRunner(el('ember'));
  runners.baseline.launch();
  runners.ember.launch();
});

// Stage control for the deliberate failure run.
el('break-recovery').addEventListener('change', async (e) => {
  await fetch(`${RGS}/admin/faults`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recoveryDown: e.target.checked }),
  });
});

async function pollStats() {
  try {
    const [web, edge] = await Promise.all([
      fetch('/stats').then((r) => r.json()),
      fetch(`http://${location.hostname || 'localhost'}:4002/stats`).then((r) => r.json()),
    ]);
    const b = web.tti.baseline;
    const m = web.tti.ember;
    el('dash').innerHTML = `
      <div><span>baseline p50/p95</span><b>${b ? b.p50 + ' / ' + b.p95 + ' ms' : '—'}</b></div>
      <div><span>ember p50/p95</span><b class="good">${m ? m.p50 + ' / ' + m.p95 + ' ms' : '—'}</b></div>
      <div><span>pool warm / in use</span><b>${edge.pool.warm} / ${edge.pool.inUse}</b></div>
      <div><span>claim p50</span><b>${edge.pool.claimWait.p50} ms</b></div>
      <div><span>edge s / launch</span><b class="good">${edge.pool.avgEdgeSecondsPerLaunch ?? '—'}</b></div>
      <div><span>handoff ok</span><b>${edge.handoff.confirmed}/${edge.handoff.attempted}${
        edge.handoff.successRate !== null ? ' (' + edge.handoff.successRate + '%)' : ''
      }</b></div>`;
  } catch {}
}
setInterval(pollStats, 1000);
pollStats();
el('payload-note').textContent =
  `ballast ${PAYLOAD_MB} MB · init ${INIT_DELAY} ms · simulated link ${LINK_KBPS} kbps ` +
  `— identical for baseline and for the on-device copy; the edge warms over the datacentre link`;

/**
 * Multinomial logistic regression, trained in the browser.
 *
 * This is not an animation of training. It is training: softmax cross-entropy
 * with L2, minibatch SGD, run against `train-slice.json` — 1,500 standardised
 * prefix vectors taken straight out of the same split the shipped weights were
 * fitted on, with 400 held out that the optimiser never sees.
 *
 * The point is that convergence can be watched rather than claimed. The full fit
 * happened on Kaggle over 23,175 rows; this slice reaches close to the same
 * held-out accuracy in a few seconds on a laptop, which is the honest way to
 * show a judge what "we trained a model" actually means.
 *
 * Deliberately plain loops, no matrix library: the whole thing is ~40 lines of
 * arithmetic, and being able to read it is the reason this model was chosen over
 * a forest in the first place.
 */

export function createTrainer(data, opts = {}) {
  const D = data.train.x[0].length;
  const K = data.classes.length;

  return {
    D,
    K,
    lr: opts.lr ?? 0.35,
    l2: opts.l2 ?? 1e-4,
    batch: opts.batch ?? 32,
    W: Array.from({ length: K }, () => new Float64Array(D)),
    b: new Float64Array(K),
    seen: 0,
    epoch: 0,
    cursor: 0,
    order: shuffled(data.train.x.length, opts.seed ?? 11),
    history: [],
    data,
  };
}

function shuffled(n, seed) {
  const a = Array.from({ length: n }, (_, i) => i);
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function softmax(z) {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e.reduce((a, v) => a + v, 0);
  return e.map((v) => v / s);
}

function scores(t, x) {
  const z = new Array(t.K);
  for (let k = 0; k < t.K; k++) {
    let acc = t.b[k];
    const wk = t.W[k];
    for (let d = 0; d < t.D; d++) acc += wk[d] * x[d];
    z[k] = acc;
  }
  return z;
}

/** One minibatch. Returns the batch's mean cross-entropy. */
export function step(t) {
  const { x: X, y: Y } = t.data.train;
  const n = X.length;
  let loss = 0;

  const gW = Array.from({ length: t.K }, () => new Float64Array(t.D));
  const gb = new Float64Array(t.K);

  for (let i = 0; i < t.batch; i++) {
    if (t.cursor >= n) {
      t.cursor = 0;
      t.epoch += 1;
      t.order = shuffled(n, 11 + t.epoch);
    }
    const idx = t.order[t.cursor++];
    const x = X[idx];
    const y = Y[idx];

    const p = softmax(scores(t, x));
    loss += -Math.log(Math.max(p[y], 1e-12));

    for (let k = 0; k < t.K; k++) {
      const err = p[k] - (k === y ? 1 : 0);
      const gk = gW[k];
      for (let d = 0; d < t.D; d++) gk[d] += err * x[d];
      gb[k] += err;
    }
    t.seen += 1;
  }

  const scale = t.lr / t.batch;
  for (let k = 0; k < t.K; k++) {
    const wk = t.W[k];
    const gk = gW[k];
    for (let d = 0; d < t.D; d++) wk[d] -= scale * gk[d] + t.lr * t.l2 * wk[d];
    t.b[k] -= scale * gb[k];
  }

  return loss / t.batch;
}

/** Held-out accuracy. These 400 rows are never used for a gradient. */
export function testAccuracy(t) {
  const { x: X, y: Y } = t.data.test;
  let ok = 0;
  for (let i = 0; i < X.length; i++) {
    const z = scores(t, X[i]);
    let best = 0;
    for (let k = 1; k < t.K; k++) if (z[k] > z[best]) best = k;
    if (best === Y[i]) ok += 1;
  }
  return ok / X.length;
}

/** Per-class held-out accuracy, so a class collapsing is visible. */
export function perClass(t) {
  const { x: X, y: Y } = t.data.test;
  const hit = new Array(t.K).fill(0);
  const tot = new Array(t.K).fill(0);
  for (let i = 0; i < X.length; i++) {
    const z = scores(t, X[i]);
    let best = 0;
    for (let k = 1; k < t.K; k++) if (z[k] > z[best]) best = k;
    tot[Y[i]] += 1;
    if (best === Y[i]) hit[Y[i]] += 1;
  }
  return hit.map((h, i) => (tot[i] ? h / tot[i] : 0));
}

/** Largest absolute weight, for scaling the heatmap. */
export function weightRange(t) {
  let m = 1e-6;
  for (let k = 0; k < t.K; k++) for (let d = 0; d < t.D; d++) m = Math.max(m, Math.abs(t.W[k][d]));
  return m;
}

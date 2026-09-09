/**
 * The trained heads, running on the device.
 *
 * LANTERN-ARCHITECTURE.md §3.3. Everything here reads `models.json`, which is
 * written by Solution/kaggle/train_lantern.py on Kaggle. Nothing is fitted at
 * runtime and nothing is fetched: the weights ship with the bundle, so the
 * behavioural stream never leaves the phone. That is a privacy claim the
 * architecture can actually keep, not a promise in a footer.
 *
 * Why logistic and softmax rather than the gradient-boosted forest we also
 * trained? Because the forest bought ~1 accuracy point (see `eval.ceiling`) and
 * cost the two things this product needs most: inference small enough to run on
 * every event, and per-feature contributions that let the UI say *why* without
 * inventing a reason after the fact. `contributions()` below is not a post-hoc
 * story about the model — it is the arithmetic the model actually did.
 *
 * The feature vector must be built in exactly the order of `models.features`,
 * which is the order the trainer used. That coupling is load-bearing and drift
 * there would be silent, so it is checked at import and fails loudly.
 */

import models from '../data/models.json';
import { sessionMinutes } from './sco';

export const FEATURES = models.features;
export const CLASSES = models.archetype.classes;
export const CHARACTER = models.archetype.character;
export const META = models.meta;
export const EVAL = models.eval;
export const COHORTS = models.cohorts.profiles;

const { mean: MU, scale: SD } = models.scaler;

if (MU.length !== FEATURES.length) {
  throw new Error(
    `models.json is inconsistent: ${FEATURES.length} features but ${MU.length} scaler terms`
  );
}

/** Game statistics by title — keyed on name, because that is what the log carries. */
export const GAME_STATS = new Map(models.games.map((g) => [g.n, g]));
const NEIGHBOURS = models.ranker.neighbours || {};

/** Plain-language names for the explainer. The model does not need these; people do. */
export const LABEL = {
  log_minutes: 'session length',
  log_events: 'interactions',
  log_spins: 'spins',
  distinct_games: 'different titles opened',
  log_launches: 'games opened',
  launches_per_min: 'opening rate',
  log_mean_stake: 'typical stake',
  stake_cv: 'stake variability',
  stake_slope: 'stake trend',
  stake_up_after_loss: 'raises stake after a loss',
  max_loss_run: 'longest losing run',
  loss_run_now: 'losing run right now',
  net_per_stake: 'net position',
  turbo: 'turbo on',
  deposits: 'deposits',
  deposits_per_hour: 'deposit rate',
  log_mean_dwell_s: 'time spent per game',
  dwell_cv: 'dwell variability',
  log_median_gap_s: 'pace between actions',
  gap_cv: 'rhythm variability',
  searches: 'searches',
  slip_adds: 'selections added',
  slip_abandon_rate: 'abandons at confirm',
  rg_changes: 'limit changes',
  switches_after_loss: 'switches game after losing',
  hour_sin: 'time of day',
  hour_cos: 'time of day',
  late_night: 'playing late at night',
  games_per_launch: 'variety',
  spins_per_launch: 'commitment per game',
};

// ------------------------------------------------------------- small maths
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

const cv = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  if (Math.abs(m) < 1e-9) return 0;
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2))) / m;
};

const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/** Least-squares trend, normalised by level so it compares across stake sizes. */
function slope(a) {
  if (a.length < 3) return 0;
  const m = mean(a);
  if (m <= 1e-9) return 0;
  const n = a.length;
  const xbar = (n - 1) / 2;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xbar) * (a[i] - m);
    den += (i - xbar) ** 2;
  }
  return clamp((den ? num / den : 0) * (n / m), -5, 5);
}

/**
 * SCO -> the 30-dimensional vector the heads were trained on.
 *
 * Mirrors `featurise()` in train_lantern.py term for term. When one moves the
 * other must move with it — that is the price of running one model in two
 * languages, and it is cheaper than shipping a Python runtime to a phone.
 */
export function featuresFrom(sco) {
  const minutes = Math.max(sessionMinutes(sco), 1 / 60);
  const launches = sco.seq.length;
  const distinct = new Set(sco.seq).size;
  const st = sco.stakeTrace;
  const wins = sco.winTrace;

  let upAfterLoss = 0;
  if (st.length > 1 && wins.length === st.length) {
    const deltas = [];
    for (let i = 1; i < st.length; i++) if (!wins[i - 1]) deltas.push(st[i] - st[i - 1]);
    const m = mean(st);
    if (deltas.length && m > 1e-9) upAfterLoss = clamp(mean(deltas) / m, -3, 3);
  }

  const dwells = Object.values(sco.dwell).map((ms) => ms / 1000);
  const gaps = sco.latencyTrace.map((ms) => ms / 1000).filter((g) => g > 0 && g < 300);
  const hour = new Date(sco.startedAt).getHours();
  const abandoned = Math.max(0, sco.reachedConfirm - sco.completedConfirm);

  return [
    Math.log1p(minutes),
    Math.log1p(sco.events.length),
    Math.log1p(sco.spins),
    distinct,
    Math.log1p(launches),
    launches / minutes,
    Math.log1p(mean(st)),
    cv(st),
    slope(st),
    upAfterLoss,
    sco.maxLossRun,
    sco.lossRun,
    sco.staked > 1e-9 ? clamp(sco.netCents / sco.staked, -1, 5) : 0,
    sco.turbo ? 1 : 0,
    sco.deposits,
    sco.deposits / (minutes / 60),
    Math.log1p(mean(dwells)),
    cv(dwells),
    Math.log1p(median(gaps)),
    cv(gaps),
    sco.searches,
    sco.slipAdds,
    sco.reachedConfirm ? abandoned / sco.reachedConfirm : 0,
    sco.rgLoosened ? 1 : 0,
    sco.switchesAfterLoss,
    Math.sin((2 * Math.PI * hour) / 24),
    Math.cos((2 * Math.PI * hour) / 24),
    hour >= 23 || hour < 5 ? 1 : 0,
    launches ? distinct / launches : 0,
    launches ? sco.spins / launches : 0,
  ];
}

const standardise = (x) => x.map((v, i) => (v - MU[i]) / (SD[i] || 1));

/**
 * What actually moved a score, in the model's own arithmetic: coefficient times
 * standardised value, sorted by magnitude.
 */
function contributions(z, coef, n = 4) {
  return coef
    .map((c, i) => ({
      feature: FEATURES[i],
      label: LABEL[FEATURES[i]] || FEATURES[i],
      value: c * z[i],
    }))
    .filter((c) => Math.abs(c.value) > 0.01)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, n);
}

function softmax(logits) {
  const m = Math.max(...logits);
  const e = logits.map((l) => Math.exp(l - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

/** Nearest cohort centroid, in the standardised space the trainer clustered in. */
function nearestCohort(z) {
  let best = 0;
  let bestD = Infinity;
  models.cohorts.centroids.forEach((c, k) => {
    let d = 0;
    for (let i = 0; i < c.length; i++) d += (z[i] - c[i]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  });
  return COHORTS.find((c) => c.id === best) || COHORTS[0];
}

/**
 * Every head, in one pass. Cheap enough to run on each event — which is the
 * whole reason for keeping the models linear.
 */
export function predict(sco) {
  const x = featuresFrom(sco);
  const z = standardise(x);

  const A = models.archetype;
  const logits = A.coef.map((row, k) =>
    row.reduce((acc, c, i) => acc + c * z[i], A.intercept[k])
  );
  const probs = softmax(logits);
  const top = probs.indexOf(Math.max(...probs));

  // What pushed towards *this* character rather than the average of the others.
  // Raw class coefficients would otherwise just re-describe the population.
  const rel = A.coef[top].map(
    (c, i) => c - mean(A.coef.filter((_, k) => k !== top).map((row) => row[i]))
  );

  const riskZ = models.risk.coef.reduce((a, c, i) => a + c * z[i], models.risk.intercept);
  const p = sigmoid(riskZ);
  const T = models.risk.thresholds;

  const convZ = models.conversion.coef.reduce(
    (a, c, i) => a + c * z[i],
    models.conversion.intercept
  );

  return {
    x,
    z,
    archetype: {
      index: top,
      key: CLASSES[top],
      probs,
      confidence: probs[top],
      ...CHARACTER[CLASSES[top]],
      why: contributions(z, rel),
    },
    risk: {
      p,
      state: p >= T.concern ? 'concern' : p >= T.elevated ? 'elevated' : 'calm',
      why: contributions(z, models.risk.coef),
    },
    conversion: {
      p: sigmoid(convZ),
      why: contributions(z, models.conversion.coef),
    },
    cohort: nearestCohort(z),
  };
}

// ------------------------------------------------------------------ ranking
const R = models.ranker;
const POP_MAX = R.pop_max || 1;

/**
 * The learned ranker. Six features, six weights — and the one a generic lobby
 * structurally cannot use: co-occurrence with what you opened minutes ago.
 *
 * Offline replay of held-out sessions puts this at +197% recall@6 against
 * ordering by popularity. See `eval.replay`.
 */
export function scoreGame(name, ctx) {
  const g = GAME_STATS.get(name);
  if (!g) return null;

  let cooc = 0;
  for (const prev of ctx.priorGames) {
    for (const [other, w] of NEIGHBOURS[prev] || []) {
      if (other === name && w > cooc) cooc = w;
    }
  }

  const f = [
    Math.log1p(g.l) / POP_MAX,
    g.aff[ctx.archetypeIndex],
    ctx.seen.has(name) ? 1 : 0,
    ctx.providerShare[g.p] || 0,
    g.j ? 1 : 0,
    cooc,
  ];

  return {
    score: f.reduce((a, v, i) => a + v * R.coef[i], R.intercept),
    f,
    game: g,
  };
}

/**
 * The session context the ranker needs, derived once per render.
 *
 * Takes game *names*, not the SCO: the SCO tracks catalogue ids while the
 * trained tables are keyed on the title as it appears in the log. The caller
 * owns that translation because only the caller has the catalogue.
 */
export function rankingContext(gameNames, archetypeIndex) {
  const seen = new Set(gameNames);
  const providerShare = {};
  let n = 0;
  for (const name of gameNames) {
    const g = GAME_STATS.get(name);
    if (!g) continue;
    providerShare[g.p] = (providerShare[g.p] || 0) + 1;
    n++;
  }
  if (n) for (const k of Object.keys(providerShare)) providerShare[k] /= n;
  return { archetypeIndex, seen, providerShare, priorGames: [...seen] };
}

/**
 * Probability that a stretch of play on this title ends net positive.
 *
 * Fitted on 5,929 (session, title) pairs whose outcome is a fact in the log:
 * did the money come back or not. Held-out AUC 0.729, and calibrated — when it
 * says 85% the observed rate is 76-85%, which is what makes it a probability
 * rather than a number.
 *
 * Read the coefficients and it is obvious what it has learned. Hit frequency
 * (+0.75) and volatility (+0.88) dominate, because variance is what gives a
 * short stretch of play any chance of finishing ahead. Spins played is
 * **negative**: the longer you sit on a title, the closer you get to its true
 * return, and its true return is below 1. The model is describing the house
 * edge, not a way around it.
 *
 * That is exactly why this is safe to show and "your odds of winning" is not:
 * the honest number goes DOWN the more you play, so surfacing it protects
 * rather than entices.
 */
export function winProbability(game, sco, archetypeIndex) {
  const O = models.outcome;
  const g = GAME_STATS.get(game.name);
  if (!O || !g || !(g.spl > 0)) return null;

  const here = sco.byGame?.[game.id] || null;
  const spins = here?.spins ?? 0;
  const stake = here && here.spins ? here.staked / here.spins : mean(sco.stakeTrace) || 0;

  const one = (i) => (i === archetypeIndex ? 1 : 0);
  const raw = [
    Math.log1p(g.l) / POP_MAX,
    g.hit,
    Math.min(20, g.vol) / 20,
    Math.min(200, g.spl) / 200,
    g.j ? 1 : 0,
    Math.log1p(spins),
    Math.log1p(stake),
    one(0), one(1), one(2), one(3),
  ];

  const z = raw.map((v, i) => (v - O.scaler.mean[i]) / (O.scaler.scale[i] || 1));
  const p = sigmoid(z.reduce((a, v, i) => a + v * O.coef[i], O.intercept));

  return {
    p,
    spins,
    auc: O.auc,
    baseRate: O.base_rate,
    // What is actually moving it, in the model's own arithmetic.
    drivers: [
      { label: 'hit frequency', value: O.coef[1] * z[1] },
      { label: 'volatility', value: O.coef[2] * z[2] },
      { label: 'spins played here', value: O.coef[5] * z[5] },
      { label: 'stake size', value: O.coef[6] * z[6] },
    ].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)),
  };
}

/**
 * Fit: does this title suit how this person is playing right now?
 *
 * Deliberately NOT a win probability. Every game here has a house edge and no
 * model changes that; implying otherwise is precisely the dark pattern the
 * brief's guardrail rules out, and it is a judged criterion. What fit does say
 * is whether the *shape* of the game — its volatility, its pace, who else plays
 * it — matches the shape of this session. Honest, useful, and supported by the
 * data we actually have.
 */
export function fitFor(name, ctx) {
  const s = scoreGame(name, ctx);

  // The trained table holds the top 1,200 titles by launches; the catalogue has
  // 3,131. A tail title used to return null and the card silently disappeared,
  // which reads as a broken screen rather than as an absence of evidence. Say
  // the true thing instead: we have no history on this one.
  if (!s) {
    return {
      fit: null,
      cold: true,
      reasons: ['Too little logged play on this title to place it against your session'],
      provider: null,
      jackpot: false,
      launches: 0,
      hitRate: null,
      volatility: null,
      typicalSpins: null,
      affinity: 0,
    };
  }

  const { game } = s;
  const aff = game.aff[ctx.archetypeIndex];

  const reasons = [];
  if (s.f[5] > 0.5) reasons.push('Played alongside titles you opened this session');
  if (aff > 0.25) {
    reasons.push(`Popular with ${CHARACTER[CLASSES[ctx.archetypeIndex]].label.toLowerCase()} players`);
  }
  if (s.f[3] > 0.3) reasons.push(`You have been playing ${game.p} titles`);
  if (s.f[2]) reasons.push('You opened this earlier in the session');
  if (!reasons.length) reasons.push('Broadly popular, but nothing specific to how you play');

  return {
    // The ranker's logit, squashed into something a progress bar can hold.
    fit: clamp(sigmoid(s.score * 0.9), 0.02, 0.98),
    cold: false,
    reasons,
    provider: game.p,
    jackpot: game.j,
    launches: game.l,
    // Observed frequency of a paying spin, and how spread out returns are. Both
    // describe the game. Neither predicts anything about the player.
    //
    // A title can be in the catalogue with launches but no logged spins. Its
    // stats are then 0, which would render as "0% hit rate" — a confident claim
    // built from no evidence. Say nothing instead.
    hitRate: game.spl > 0 ? game.hit : null,
    volatility: game.spl > 0 ? game.vol : null,
    typicalSpins: game.spl > 0 ? game.spl : null,
    affinity: aff,
  };
}

# Lantern — architecture and design overview

Local-first behavioural prediction for session quality and game discovery.

FEG Innovation Hackathon 2026 · Challenge 01 · Lorven AI

Companion docs: [CHALLENGES-DECODED.md](CHALLENGES-DECODED.md) (what the brief
asks for), [RECON-FINDINGS.md](RECON-FINDINGS.md) (measured PSK evidence),
[EMBER-PRD.md](EMBER-PRD.md) (our Challenge 03 build).

---

## The claim, in one paragraph

A player opens the app, and within three interactions Lantern has classified
what kind of session this is and reshaped what they see — from a catalogue of
several thousand titles down to the handful this session is actually about.
Every model runs **on the device**: the behavioural event stream never leaves
the phone, only a bounded policy decision does. The same feature vector feeds
two heads — one that predicts relevance and one that predicts harm — and the
second one **gates** the first. That gate is the product, not the disclaimer.

---

## 1. The design problem, stated honestly

The obvious build is: model what keeps players engaged, then serve more of it.
That build fails, and it fails for a specific and interesting reason.

The behavioural features that predict *"this session continues"* are largely the
same features that predict *"this player is chasing losses"*: compressed
inter-action latency, rising stake after a loss, turbo mode on, session running
past the player's own typical length. A single-objective engagement model does
not distinguish these. It finds the chasing state, observes that it correlates
beautifully with continued play, and learns to steer toward it.

So Lantern models both, on purpose, from the same features:

| | Label | Question |
|---|---|---|
| **Relevance head** | did the player act on this surface | what is this session about |
| **Risk head** | did a harm marker fire, this session or next | what state is this player in |

The policy engine acts only where relevance is high **and** risk is low. Where
risk is high, personalization is suppressed regardless of what the relevance
head wants. This is the architectural answer to the brief's judged guardrail,
and it is also just the correct way to build the thing.

---

## 2. System overview

```
  ON DEVICE                                          │  OFFLINE / SERVER
                                                     │
  ┌──────────────┐                                   │
  │ Event bus    │  taps, dwell, spins, stake,       │
  │              │  bet-slip, deposits, RG changes   │
  └──────┬───────┘                                   │
         ▼                                           │
  ┌──────────────────────────────┐                   │
  │ Session Context Object (SCO) │◄── player prior   │
  │ rolling, in-memory, ring buf │    (IndexedDB)    │
  └──────┬───────────────────────┘                   │
         ▼                                           │
  ┌──────────────────────────────┐                   │
  │ Feature layer (pure fns)     │                   │
  │ session · prior · catalogue  │                   │
  └──────┬──────────────┬────────┘                   │
         ▼              ▼                            │
  ┌────────────┐  ┌────────────┐                     │   ┌─────────────────┐
  │ RELEVANCE  │  │ RISK       │                     │   │ Training lane   │
  │ head       │  │ head       │                     │   │ · synthetic gen │
  │            │  │            │                     │   │ · fit ranker    │
  │ retrieve   │  │ 18 markers │                     │   │ · fit risk clf  │
  │ → rank     │  │ → score    │                     │   │ · export ONNX   │
  │ → calibrate│  │ → state    │                     │   └────────┬────────┘
  └──────┬─────┘  └──────┬─────┘                     │            │
         │               │                           │            │ model
         ▼               ▼                           │            │ artifacts
  ┌──────────────────────────────┐                   │            │ (CDN)
  │ POLICY ENGINE (deterministic)│◄──────────────────┼────────────┘
  │ the only thing that decides  │                   │
  └──────┬───────────────────────┘                   │
         ▼                                           │   ┌─────────────────┐
  ┌──────────────────────────────┐   aggregated,     │   │ Dashboard       │
  │ Surfaces                     │   k-anonymised    │   │ conversion ↑    │
  │ shelves · confirm-assist ·   │──────────────────►│   │ harm      →     │
  │ wheel                        │   metrics only    │   └─────────────────┘
  └──────────────────────────────┘                   │
```

The vertical boundary is load-bearing. Raw behavioural events — the things that
would make this a GDPR profiling problem — stay on the device. What crosses is
aggregate counters for the measurement dashboard.

---

## 3. Layers

### 3.1 Event bus

Typed, schema-versioned, append-only ring buffer (last 500 events). One entry
point so every downstream consumer sees the same stream.

```ts
type Event =
  | { t: 'view';         surface: SurfaceId; dwellMs: number }
  | { t: 'game_open';    gameId: GameId; from: SurfaceId }
  | { t: 'game_close';   gameId: GameId; durMs: number }
  | { t: 'spin';         gameId: GameId; stake: Cents; outcome: Outcome }
  | { t: 'stake_change'; gameId: GameId; from: Cents; to: Cents }
  | { t: 'turbo';        on: boolean }
  | { t: 'autoplay';     count: number }
  | { t: 'search';       qLen: number; resultCount: number }
  | { t: 'slip_add' | 'slip_remove'; selectionId: string }
  | { t: 'confirm_reach' | 'confirm_done' | 'confirm_abandon' }
  | { t: 'deposit';      amount: Cents; declined: boolean }
  | { t: 'withdraw_cancel' }
  | { t: 'rg_change';    setting: RgSetting; direction: 'tighter' | 'looser' }
```

Note what is deliberately absent: no free text, no keystroke timing, no device
sensors. Nothing that edges toward biometric or special-category data.

### 3.2 Session Context Object

One rolling object, read by every head. This is the cross-challenge asset
`CHALLENGES-DECODED.md` already identified — C02's surfaces read the same
object.

```ts
interface SCO {
  sessionId: string
  startedAt: number
  seq: GameId[]               // interaction sequence, most recent last
  dwell: Map<GameId, number>
  categoryMix: Float32Array   // this session
  stakeTrace: Cents[]
  latencyTrace: number[]      // ms between consecutive actions
  markers: MarkerSet          // which harm markers have fired
  prior: PlayerPrior          // from IndexedDB, long-run
}
```

### 3.3 Feature layer

Pure functions over the SCO. Three time scales, deliberately separated so you
can ablate them in evaluation:

- **Session** — sequence of last N interactions, dwell distribution, category
  entropy, inter-action latency and its first derivative, stake trajectory,
  post-loss behaviour delta, navigation churn rate.
- **Player prior** — long-run category affinity, volatility preference, typical
  session length, typical stake, typical time-of-day. Persisted locally.
- **Catalogue** — per-game metadata embedding (provider, theme, volatility band,
  RTP band, mechanic, min stake, release recency) plus co-occurrence.

### 3.3b Game embedding construction

One 32-dim vector per title, built in two halves and concatenated. The whole
catalogue — sports and casino together — lives in a single space, which is what
lets a horse race and a snooker frame land near each other.

**Content half, 16 dims — cold-start capable.**

Structural attributes shared across every product type:

| Attribute | Encoding |
|---|---|
| Outcome latency (stake → resolution) | log seconds, standardized |
| Skill perception (pure chance ↔ form-driven) | ordinal 0–4 |
| Pre-commitment window | log seconds |
| Variance band | ordinal |
| Typical stake | log, standardized |
| Session shape (single-shot ↔ continuous) | ordinal |

Plus product-specific multi-hots — casino: mechanic, theme, provider, feature
set, max-win band, RTP band. Sports: sport, competition tier, market type,
pre-match vs in-play, heritage ↔ modern.

Truncated SVD down to 16 dims. Deterministic, no training loop, runs in seconds,
and re-runs whenever the catalogue changes.

**Collaborative half, 16 dims — sharper, once sessions exist.**

Treat each session as a sentence and each game as a word. Build the PPMI matrix
over within-session co-occurrence and truncated-SVD it to 16 dims. This is
item2vec by the PPMI-SVD route rather than SGNS — equivalent result, no training
loop, and it is *reproducible*, which matters when you have to explain a
recommendation to a regulator.

**Cold start.** A title with no play history gets the content half plus the
provider-mean collaborative half. It is retrievable on day one and sharpens as
sessions accumulate. Track *share of shelf served from the cold-start path* as a
model-health metric (§7): if it sits near zero, new titles are invisible and the
catalogue is quietly shrinking to its top 200.

**Event frequency is deliberately not a dimension.** If it were one of 32 axes,
the ranker could trade it away against any other similarity gain — which is
exactly the failure in §3.4b. Keep it out of the embedding entirely and apply it
as an explicit band constraint after retrieval. Similarity then answers "what
kind of thing is this," and frequency exposure is governed separately by a rule
you can read. Two mechanisms, two places, neither able to silently override the
other.

**You do not need a vector database.** At 5,000 titles × 32 dims, brute-force
cosine is 160,000 multiply-adds — comfortably under a millisecond in WASM, and
it is exact rather than approximate. HNSW and friends start paying off somewhere
above 10⁵ items. Shipping a vector DB at this scale is infrastructure with no
measurable benefit, and it would break the local-first property in §4.

### 3.4 Relevance head

Four stages. The library is large — assume 5,000+ titles — so this is a
retrieval problem, not a scoring problem.

**Stage 1 — candidate generation, ~5,000 → ~200.** Three cheap retrievers,
unioned:

- *Session-kNN (VS-KNN)*: look up the current session's recent items in a
  precomputed item-item neighbour table, take their neighbours weighted by
  recency position.
- *Content ANN*: nearest neighbours in the 32-dim metadata embedding space.
  This is what covers cold-start titles, which a pure co-occurrence model
  cannot reach.
- *Continuity*: recently played, unfinished, and "more from this provider."

**Stage 2 — ranking, ~200 → ~20.** Gradient-boosted trees over: session
affinity, content similarity, personal prior match, popularity prior, recency,
novelty, and price-point fit.

**Stage 3 — calibration.** Steck (RecSys 2018). If the player's own history is
70% slots / 30% sport, the output shelf is held to roughly 70/30 rather than
100% of whatever scores highest. Report the KL divergence between recommended
mix and the player's own mix as a live metric — this is the number that proves
the recommender reflects interests rather than amplifying the most engaging one.

**Stage 4 — risk gate.** See 3.6.

**Why not a transformer.** Ludewig & Jannach's evaluation lineage (already cited
in `CHALLENGES-DECODED.md`) found well-tuned nearest-neighbour baselines match
or beat GRU4Rec on session data. A transformer will not beat this baseline on
the data available and costs the entire build window. If there is time left at
the end, add BERT4Rec as a *comparison arm* in the offline eval, not as the
shipped path.

### 3.4b Cross-category discovery, and the one axis that must stay constrained

The motivating case: a player scrolls past an esports fixture without engaging,
then places a bet on a horse race.

The wrong inference is demographic — "older, affluent, likes traditional sport."
You do not have that data, you would be guessing, and the guess is both a
discrimination exposure and simply less accurate than what you can observe
directly.

The right inference is over **game attributes**. Horse racing occupies a
specific point on the catalogue vector: low event frequency (minutes to hours
between resolutions), form- and statistics-driven, heritage sport, long
pre-commitment window before the outcome. Recommend other titles near that
point — snooker, darts, greyhounds, 8-ball pool — and you have served the
"deeper engagement across categories" bullet in the brief using nothing but
observed behaviour. No demographic model, no inferred wealth, no age proxy.

**Event frequency must be a calibrated axis, not a free one.** This is the most
important single constraint in the recommender and it deserves stating on its
own. The distance from horse racing (one resolution per race) to slots (one
resolution per three seconds) is a two-order-of-magnitude jump in event
frequency, and event frequency is the most consistently documented structural
risk factor in the gambling harm literature. A recommender optimizing
engagement *will* find that jump on its own, because a higher-frequency product
genuinely does produce more actions per session — which is one of the brief's
own metrics. This is the clearest example of the §1 problem: the metric points
straight at the harm.

So recommend freely *along* the attribute vector, but treat event frequency the
way Stage 3 treats category mix — held near the player's established band, with
upward drift reported as a live metric. A player who moves up frequency bands
should do so because they went looking, not because the shelf led them there.
Marker #18 tracks the within-session version of this; this is its across-session
counterpart.

This is also the honest answer to "how do we raise value per session without
pressure." A horse-racing player who discovers snooker betting is worth more to
the operator and has not been moved anywhere they did not want to go.

### 3.5 Risk head

Eighteen markers, each drawn from the behavioural-tracking literature already
cited in `CHALLENGES-DECODED.md`, each computable from the event stream:

| # | Marker | Window |
|---|---|---|
| 1 | stake escalation slope after loss (chase slope) | session |
| 2 | inter-action latency compression vs. session baseline | session |
| 3 | turbo / quick-spin enabled mid-session | session |
| 4 | autoplay depth and re-arm count | session |
| 5 | session length vs. player's own p90 | session + prior |
| 6 | within-session deposit count (top-ups) | session |
| 7 | declined deposit event | session |
| 8 | RG limit loosened or removed | any |
| 9 | play during player's personal off-hours | session + prior |
| 10 | rapid game-switching following losses | session |
| 11 | bet-slip churn (add/remove cycling without confirm) | session |
| 12 | stake as multiple of player's typical stake | session + prior |
| 13 | late-night session start | session |
| 14 | bonus-seeking navigation pattern | session |
| 15 | consecutive-day session streak | prior |
| 16 | cancelled withdrawal (reverse withdrawal) | prior |
| 17 | time since last break within session | session |
| 18 | volatility drift — moving up volatility bands mid-session | session |

Model: **logistic regression.** Chosen deliberately, and say so on stage — a
compliance officer must be able to read the coefficient and a regulator must be
able to audit the decision. Interpretability here is a product requirement, not
a modelling compromise. Output is a score plus the set of markers that fired,
because "why" is as important as "how much."

Three states, with hysteresis so the UI does not flicker:

- **calm** — full personalization
- **elevated** — suppress reward surfaces; drop novelty and high-volatility
  recommendations; tighten calibration tolerance; surface a neutral session
  summary (spend, duration, net) with no judgement attached
- **concern** — cool-down: no promotional surface at all, no recommendation that
  increases stake or volatility, RG tools presented plainly, compliance signal
  emitted

Cool-down must not become a dark pattern in reverse. No lockout, no shaming, no
interstitial the player has to dismiss. It stops personalizing *toward more*;
it does not start personalizing toward guilt.

### 3.6 Policy engine

Deterministic. No model in the hot decision path. This is the only module that
decides what renders, and it is the module you hand a judge to read.

```ts
function decide(rel: RankedGames, risk: RiskState, rg: RgState): Surface[]
```

Keeping this deterministic buys three things: it is auditable, it is testable
with plain assertions, and it means a model regression can degrade relevance but
can never breach a guardrail.

### 3.7 Reward module

The wheel. The design constraint here is a four-way split, and it is enforced by
the function signatures rather than by convention:

```ts
// WHICH reward — personalized. Free spins on a game they actually like.
function rewardChoice(eligible: Reward[], rel: RankedGames): Reward

// HOW MUCH — fixed. Note the argument list: no session, no SCO, no risk state.
// Identical expected value for every eligible player. Structurally unable to
// respond to arousal, loss streak, or engagement score.
function rewardValue(campaign: Campaign): Value

// WHEN — scheduled. Milestone or calendar. Never event-triggered on a loss.
function rewardDue(schedule: Schedule, now: Time): boolean

// WHETHER — gated. Self-exclusion, RG state, risk head, recent declined deposit.
function rewardGate(risk: RiskState, rg: RgState): boolean
```

For a wheel specifically: the **segments** may be personalized — which games the
free-spin segments point at. The **probabilities and prize values are fixed and
published**. That is how a compliant personalized wheel is built, and the split
is visible in the type signature, which makes it a thing you can show rather
than a thing you assert.

One flag, since it is your call and not mine: the brief lists *pricing and
commercial terms* as out of scope, and bonus-seeking is itself marker #14. The
reward module is the piece most likely to draw a scoring objection even built
this way. It is last in the build order in §8 for that reason.

### 3.8 Surfaces

- **Adaptive shelves** — layout reshapes by session archetype (browsing /
  specific-intent / returning-specialist), which is build item #1 in
  `CHALLENGES-DECODED.md`.
- **Confirm-step assist** — the "what happens if" panel. Answers the actual
  question at the point of abandonment: odds moved, return unclear, a rule the
  player is unsure of. This is relevance and reduced friction. A countdown timer
  in the same slot would be a dark pattern; the brief draws that line for you.
- **Wheel** — per 3.7.

### 3.9 Re-engagement and notifications

This is the bridge into Challenge 02, and it reuses the same SCO and the same
risk head. The signal it runs on is the **follow graph**: a player who follows a
club has made an explicit, durable declaration of interest. That is the highest
quality intent data in the system and it is volunteered rather than inferred.

**Allowed triggers.** All are either calendar-driven or continuation of
something the player started:

| Trigger | Content | Why it is allowed |
|---|---|---|
| Fixture upcoming | "Rijeka play Saturday 15:00" | Calendar fact, declared interest |
| Result | "Rijeka won 3–1" | Factual, no counterfactual |
| Slip resumption | "Your slip from Tuesday is still here" | Continuation, fires once, never repeats |
| Market opened | "Saturday's markets are live" | Calendar fact |

**Excluded triggers**, and the reason is the same each time — each one
manufactures an emotional state rather than reporting a fact:

- **Counterfactual regret** — "if you had bet €10 you would have won €100."
  Selectively counterfactual by construction: the losing version is never sent,
  so the player is shown a systematically biased sample of hypothetical
  outcomes. That is misleading commercial practice under EU consumer law before
  it is anything else, and regret is a documented driver of chasing.
- **Loss-triggered re-engagement** — anything that fires because a bet lost.
- **Streak, urgency, and scarcity mechanics** — named patterns in the
  gambling-specific deceptive-design taxonomy cited in `CHALLENGES-DECODED.md`.

**The conversion mechanism that actually works** is not the copy, it is the
destination. The notification deep-links to the **pre-filled slip** — the market
they were looking at last session, the stake they normally use, one tap from
confirm. That is reduced friction, which is the brief's explicit ask, and it
converts by removing work rather than by adding emotion.

Worth knowing before anyone argues for the regret version: it wins on
click-through and loses on D30. That combination is the reason the brief scores
on D30/D90 survival at all. A mechanism that spikes week-one CTR and decays by
month three is the specific failure mode the metric was written to catch.

**Notification policy engine.** Same shape as §3.6 — deterministic, and it is
the only thing that may send:

```ts
function shouldSend(n: Candidate, risk: RiskState, rg: RgState, hist: SendLog)
```

Gates: frequency cap per rolling window; quiet hours derived from the player's
own off-hours (marker #9, reused); risk head must be `calm`; relevance above
threshold; and a hard per-trigger dedupe.

---

## 4. Local-first execution

### Payload budget

Everything ships to the client, cached after first visit:

| Artifact | Encoding | Size |
|---|---|---|
| Item-item neighbours, top-50 × 5,000 games | uint16 id + int8 score | 750 KB |
| Game metadata embeddings, 32-dim | float16 | 320 KB |
| Catalogue metadata | packed | 400 KB |
| Ranker (GBDT, ~100 trees) | ONNX | 150 KB |
| Risk model (logistic regression, 18 coef) | JSON | < 1 KB |
| **Total** | | **≈ 1.6 MB** (≈ 700 KB brotli) |

**This competes directly with Ember's load-time work.** If both ship in the same
product, 1.6 MB on the critical path undoes the C03 result. Mitigation: model
artifacts load *after* first interactive frame, and shelves fall back to
popularity ranking until the models are resident. Progressive enhancement, and
worth stating explicitly before a judge connects the two submissions and asks.

### Latency budget

Per shelf render, mid-range Android, target under 50 ms:

| Stage | Budget |
|---|---|
| SCO update | < 1 ms |
| Feature extraction | 2 ms |
| Candidate generation (5,000 → 200) | 8 ms |
| Ranking (200 through GBDT) | 15 ms |
| Calibration + diversity | 5 ms |
| Risk gate | < 1 ms |
| **Total** | **≈ 32 ms** |

These are budgets, not results. Follow the Ember precedent and put a measured
table in the README before the pitch — `scripts/bench.js` should produce this,
and if a number misses, say so on stage the way the Ember README does.

### Why local rather than cloud

Three independent reasons, and they happen to agree:

1. **Latency.** Scoring a short event sequence in a shelf render does not
   survive a network round trip.
2. **Privacy.** Behavioural profiling of gambling players is high-risk
   processing under GDPR and needs a DPIA. "Raw events never leave the device"
   is a genuine answer to that, and it differentiates from every commercial
   detection tool in this space, all of which ship events server-side.
3. **You have no data anyway.** The brief says baselines arrive after NDA for
   shortlisted teams. There is nothing cloud infrastructure buys you during the
   build.

Training stays offline and batch. Only the artifacts ship.

---

## 5. Data strategy

There is no real player data, so be precise about what each result proves.

- **Synthetic session generator** with *planted* archetypes — browser,
  specialist, casual-returner, chaser. The evaluation claim is that the model
  recovers the planted structure, which is a real claim. It is not a claim about
  accuracy on live players.
- **Public validation for session recommendation** — Yoochoose / Diginetica
  session datasets. Real sessions, real sequence structure, e-commerce domain.
- **Public validation for gambling behaviour** — the Transparency Project
  (Division on Addiction) publishes real operator behavioural datasets. This is
  the strongest citation available for the risk head and it is genuinely
  gambling data.

Say plainly on stage: the risk head trained on synthetic data demonstrates the
*mechanism*, not detection accuracy. Claiming otherwise is the kind of thing a
judge with a compliance background will catch, and the Ember README already
establishes that honest-limits is your house style.

---

## 6. Where an LLM earns its place

Not in the ranking hot path — that is a latency problem and an auditability
problem. Four places it genuinely pays:

1. **Confirm-step assist** — answering a rules question in place, in the
   player's own language.
2. **Recommendation explanation** — "because you follow ATP Challenger" as
   generated text over structured reasons the ranker already emits.
3. **Synthetic data generation** — archetype-consistent session traces.
4. **Offline dark-pattern audit** — score each UI variant against the Mathur and
   gambling-specific deceptive-design taxonomies already cited in
   `CHALLENGES-DECODED.md`, as a CI check.

Keep the word "agentic" off the compliance slide. An autonomous agent taking
actions on a gambling player is both a latency problem and a regulatory red
flag. The defensible framing is: deterministic policy in the hot path, LLM for
explanation and offline analysis.

---

## 7. Measurement

One dashboard, two lines, same axis. This is the screenshot no competitor will
have, per `CHALLENGES-DECODED.md`.

**Conversion side** — session conversion rate, actions per session, final-step
conversion, time to first action.

**Harm side** — each of the 18 markers as a rate, plus the share of sessions
reaching *elevated* and *concern*.

**Model health** — calibration KL divergence, recommendation precision@k,
candidate-generation recall, share of shelf served from cold-start path.

Expect an honest trade-off and show it rather than hiding it: a calibrated
recommender will convert slightly *worse* than an uncalibrated one on a short
horizon. Present both arms. The brief says uplift must survive into D30/D90, and
the uncalibrated arm is the one that decays.

---

## 8. Repo layout and build order

```
lantern/
  packages/
    sco/          # event bus + session context object, framework-free
    features/     # pure feature extractors
    relevance/    # retrieval, ranker, calibration
    risk/         # markers, scorer, state machine
    policy/       # deterministic decision engine
    surfaces/     # shelves, confirm-assist, wheel
  offline/
    gen/          # synthetic session generator
    train/        # fit ranker + risk model, export ONNX/JSON
    eval/         # offline evaluation harness
  dash/           # conversion vs. harm dashboard
  scripts/
    bench.js      # latency + payload budgets, measured
```

Build in this order. The second item is the one teams get wrong:

1. **SCO + event bus + synthetic generator.** Nothing can be evaluated without
   it.
2. **Risk head + markers + dashboard skeleton.** Second, not last. It is the
   differentiator, and building it early forces the policy boundary to exist
   before the relevance work leans on its absence.
3. **Candidate generation + one working shelf.** The demo becomes real here.
4. **Policy engine + calibration.**
5. **Ranker.** Until this lands, ship candidate generation ordered by popularity;
   it is a legitimate fallback, not a stub.
6. **Confirm-step assist.**
7. **Reward / wheel.** Last, per §3.7.

---

## 9. Open risks

- **The risk head cannot be validated on synthetic data.** State the limit
  before a judge finds it.
- **Calibration costs short-horizon conversion.** Show both arms rather than
  reporting only the flattering one.
- **The reward module is out-of-scope-adjacent** under "pricing and commercial
  terms." It may be worth cutting entirely if the pitch is running long.
- **Model payload conflicts with Ember.** §4 has the mitigation; it needs to be
  said out loud if both are submitted.
- **`CHALLENGES-DECODED.md` rates C01 the least demoable in 48 hours.** That
  assessment has not changed. The architecture here is deliberately sequenced so
  that stopping after step 3 still produces a working demo.

---

## 10. Out of bounds by construction

Recording this so it is decided once, and so there is an answer ready when a
judge asks — they will.

**Lantern never touches game outcomes.** It observes the event stream and
decides what to *show*. It has no path to the RNG, no path to outcome
selection, and no path to prize determination. Everything in §3 sits strictly
above the certified boundary.

This rules out a specific family of ideas that look adjacent to personalization
but are not:

- **Per-player near-miss tuning** — varying near-miss frequency by observed
  engagement response. Game outcomes in a certified title come from a certified
  RNG; modifying them per player breaks GLI-19 certification, which is the same
  standard Ember's recovery handoff depends on. Near-misses are also among the
  best-documented harm mechanisms in the literature, so per-player optimization
  of them is targeting individual susceptibility. This is not a grey area in any
  EU licensed market.
- **Outcome-timed reward delivery** — holding back or releasing a prize based on
  where the player is in a win/loss sequence. Same boundary, same reason.
- **Loss-triggered anything.** Rewards, prompts, and recommendations are
  scheduled or intent-driven, never triggered by a losing outcome. §3.7 enforces
  this in the signature of `rewardDue`.

The commercial argument is the same as the compliance one, which is why this is
in the architecture rather than a policy appendix. Revenue extracted from
players in a chasing state is the revenue that self-excludes, charges back, or
gets stripped out at the next audit — and the brief scores on **D30/D90
survival** precisely because short-horizon engagement extraction does not last
that long. The uplift Lantern is built to produce is a player who found
something they actually wanted, and comes back in March.

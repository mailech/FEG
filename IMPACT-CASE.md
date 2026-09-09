# D3 · Impact case

Lantern · FEG Innovation Hackathon 2026 · Challenge 01 · Lorven AI

Every number below is produced by [`Solution/kaggle/train_lantern.py`](Solution/kaggle/train_lantern.py)
and written to [`Solution/models/eval.json`](Solution/models/eval.json). Nothing is
hand-entered. Re-run the notebook and this document can be regenerated.

---

## 1. The problem, sized in the data

4,995 sessions · 834 players · 285,085 events.

| Cohort (KMeans, k=5) | Share of sessions | Converts | Value / session | Harm signal |
|---|---:|---:|---:|---:|
| Steady regulars | 43% | 100% | 57 | 0.03 |
| **Browsers** | **42%** | **15%** | **1.8** | 0.00 |
| Long-session regulars | 7% | 79% | 64 | 0.03 |
| Chasers | 5% | 100% | 2,616 | 0.84 |
| Chasers, escalated | 3% | 100% | 2,606 | 1.00 |

Two facts define the opportunity:

**42% of sessions convert at 15%.** The second-largest cohort is the one that
almost never acts. It carries a value per session of 1.8 against 57 for the
regulars — a 31× gap, on nearly identical session volume. This is the brief's
"a large share of sessions end in browsing", quantified.

**381 of 1,769 sessions that reached the confirm step left it.** That is 21.5% of
the strongest intent signal in the product, lost on the last screen. Those users
had already decided.

Note the third fact, because it constrains everything: the two chaser cohorts
carry ~1,400× the value per session of browsers *and* the harm signal. Any system
optimising revenue alone would target them. Section 5 is about why this one does
not.

---

## 2. The mechanism

Two heads read one feature vector; the second gates the first.

```
event → Session Context Object → 30 features ─┬─► relevance / ranker ─┐
                                              │                       ├─► policy → surfaces
                                              └─► risk head ──────────┘
                                                       │
                                                       └─ gates the ranker
```

Five models, all trained on **prefixes** of a session rather than completed
sessions, so they commit to a read after 5 events and update as evidence arrives.
Train/test split is by session, so no prefix of a session appears on both sides.

| Head | Metric | Held-out | GBDT ceiling |
|---|---|---:|---:|
| Character (4-class) | accuracy | **0.940** | 0.943 |
| Character, first 20% of session | accuracy | **0.824** | — |
| Risk | ROC-AUC | **0.996** | 0.998 |
| Conversion | ROC-AUC | **0.965** | 0.976 |

The ceiling column is the point. We also trained LightGBM on identical features
and it bought roughly **one accuracy point**. So the shipped model is multinomial
logistic regression: 30 coefficients per class, ~1 ms inference, runs on the
device, and yields per-feature contributions as a by-product — which is what lets
the UI state a reason that is the model's actual arithmetic rather than a
plausible-sounding reconstruction. We paid one point for explainability and zero
serving infrastructure.

---

## 3. The measurement: offline replay

For every launch in held-out sessions (n = 3,750), we asked where the game the
player **actually opened** sat in a generic popularity-ordered lobby, versus in
Lantern's ordering. No behavioural assumption — this is re-ranking recorded
history.

| | recall@6 | recall@12 | recall@24 | MRR |
|---|---:|---:|---:|---:|
| Generic lobby (popularity) | 0.064 | 0.122 | 0.191 | 0.045 |
| **Lantern** | **0.191** | **0.212** | **0.233** | **0.145** |
| Uplift | **+197%** | +75% | +22% | **+222%** |

The title a player wants appears in the first six **three times as often**.

The signal doing most of that work is one a generic lobby structurally cannot
use: co-occurrence with what *this* session opened minutes ago. Popularity is a
property of the catalogue; relevance is a property of the session.

**One honest caveat.** Median rank moved the wrong way — 126 generic, 215
Lantern. That is what personalisation does: it concentrates accuracy at the top
and lets non-matching titles sink. For a lobby this is the correct trade (nobody
scrolls to position 126), but it means recall@k and MRR are the defensible
metrics here and median rank is not.

---

## 4. From discovery to business outcome

Offline replay measures **ranking quality**, not causation. Converting one to the
other requires an assumption, so we state it explicitly rather than bury it.

Let **θ** = the fraction of the relative discovery gain that converts into
session conversion. θ = 1.0 would mean a 197% better lobby produces a 197% better
conversion rate, which is absurd. Plausible values are small.

Applied to the browser cohort only (2,098 sessions at 15%):

| θ | Browser conversion | Extra converting sessions | Overall session conversion |
|---:|---:|---:|---:|
| 0.05 (conservative) | 15% → 16.5% | +31 | 62.8% → 63.4% |
| **0.15 (central)** | **15% → 19.4%** | **+93** | **62.8% → 64.7%** |
| 0.30 (optimistic) | 15% → 23.9% | +186 | 62.8% → 66.5% |

At the central case: **+4.4 percentage points on the cohort that is 42% of all
sessions**, and +1.9 points on overall session conversion.

Separately, on the final step: the conversion head (AUC 0.965) identifies
sessions likely to abandon at confirm. Recovering 10% of the 381 abandons through
friction reduction alone — no pressure, no urgency — moves final-step conversion
from 78.5% to 80.6%.

These compound into the metrics the brief names: Actions per Session (more
sessions reach a first action), Time to First Action (specialists resume their
title instead of hunting for it), Value per Session (the browser cohort's 1.8
moving at all is the largest available lever).

**What would falsify this:** an online A/B where the treatment arm shows no
change in top-6 launch rate. That is the first thing to measure, and it is
measurable in a week.

---

## 5. Cost–value

| | |
|---|---|
| Model artefact | 445 KB raw, **92 KB gzipped** — bundled, not fetched |
| Inference | ~1 ms, on device, no network call |
| Serving infrastructure | **None.** No model server, no per-request cost, no scaling curve |
| Training | 4 minutes CPU. Weekly retrain ≈ 3.5 CPU-hours/year |
| Integration | One JSON file + one JS module |
| Schema work | **None** — the event schema is already FEG's own 24-column export |

The marginal cost of running this is approximately zero. There is no inference
bill that grows with traffic, because inference happens on the device that
already has the data. The cost is engineering time to integrate, and the
integration surface is deliberately one file.

That also removes the usual privacy/latency trade: the behavioural stream never
leaves the handset, so there is no round trip to pay for and no new data
processing to justify.

---

## 6. The guardrail, accounted for

The brief is explicit that uplift must come from relevance and reduced friction,
never pressure, and that sessions showing harmful-play indicators must not rise.

- **The target is defined to exclude the profitable-and-harmful.** Uplift is
  claimed only in cohorts with a harm signal below 0.10 — the browsers and the
  steady regulars. The two chaser cohorts carry 1,400× the value per session and
  are explicitly *not* a growth target.
- **The risk head gates the ranker, not the reverse.** Volatility ceilings and
  jackpot suppression are applied after ranking, so they cannot be traded away
  inside the model's objective.
- **The success metric is two-sided.** Session conversion up *and* risk-flagged
  session share flat or down. A single-metric dashboard would call growth in the
  chaser cohorts a win; ours reports both on the same screen (Monitor, Ops).

---

## 7. Limits

Stated plainly, because a judge will find them anyway.

1. **The data is synthetic.** The generator plants behavioural structure —
   specialists have favourites, chasers pursue volatility and jackpots, browsers
   wander — and the pipeline recovers it without being told. That demonstrates
   the mechanism; it is not evidence about real players. The magnitudes in
   section 3 would change on FEG's logs. The pipeline would not: same notebook,
   same schema, no code change.
2. **Offline replay is not causation.** Section 4's θ is an assumption, not a
   measurement, which is why it is shown as a band rather than a single number.
3. **Median rank regressed** (section 3).
4. **Risk head F1 is 0.541** against an AUC of 0.996 — the ranking is excellent,
   the operating threshold is not yet tuned. On a 2.4% base rate that is expected,
   and the fix is threshold calibration against a real cost matrix, which needs
   real data.

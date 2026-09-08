# Lantern

Session quality without pressure. React Native prototype for FEG Innovation
Hackathon 2026 · Challenge 01 · Lorven AI

Architecture: [../LANTERN-ARCHITECTURE.md](../LANTERN-ARCHITECTURE.md)

---

## Run it

```bash
cd Solution/app
npm install
npm run web        # browser — easiest for a projector
npm run android    # or ios, via Expo Go
```

Regenerate the dataset from the raw logs (only needed if the CSV changes):

```bash
node Solution/scripts/extract-data.mjs
```

## What it is

Two heads read the same feature vector. One predicts relevance, one predicts
harm. The second gates the first, and the gate is the product — not the
disclaimer.

```
event bus → Session Context Object → features ─┬─► relevance head ─┐
                                               │                   ├─► policy engine → surfaces
                                               └─► risk head ──────┘
                                                        │
                                                        └─ gates the relevance head
```

Every model runs on the device. The behavioural event stream never leaves it.

## Built on the real logs, not on invention

Everything the app displays is extracted from `top_casino_users_event_logs.csv`
by `scripts/extract-data.mjs`. That file is 87 MB and is deliberately not
committed; the derived JSON under `app/src/data/` is.

| | |
|---|---|
| Events | 332,119 |
| Players | 89 |
| Sessions | 13,260 |
| Catalogue | **887 titles, 44 providers** |
| Lobby sections | 85, real names (`Najigranije`, `Nove Igre`, `PSK Favoriti`, `Boost Pots`…) |
| Sports | 21, real names (`Nogomet`, `Tenis`, `Košarka`, `Pikado`…) |

### The two findings the demo is built around

**1 — Final-step drop-off, measured.** 357 of 1,649 sessions that reached the
betslip never placed a bet: **21.6% abandoned** at what the brief calls "our
strongest intent signal". That is the Sport tab's reason for existing.

**2 — Discovery friction, measured.** Games are launched from **search 3,580
times against 3,235 from category rows**. Search out-ranks every curated
section in the lobby. People are not being helped to find things; they are
working around the lobby. That is the Casino tab's reason for existing.

Neither number is estimated. Both come from FEG's own event stream.

## The three tabs

**Casino** — the adaptive lobby. The `Baseline / Lantern` switch is the A/B:
baseline is popularity order, which is what a generic lobby does today. Lantern
reads the session archetype from the first few interactions and reshapes,
holding the provider mix near the session's own (Steck calibration, KL shown
live).

**Sport** — the betslip and the confirm step. The "what happens if" panel
answers the questions that plausibly cause the 21.6%: void legs, postponement,
odds movement, cash-out. No timer, no scarcity copy. The brief draws that line
for us.

**Monitor** — conversion and harm on one screen. The 18 markers, the live risk
state, the age-band control (§7 — it changes threshold sensitivity and cannot
reorder a shelf), the per-market policy, and the notification gate simulator
with the blocked triggers included on purpose.

## Driving a demo

Open a game from the Casino tab, then in the game screen: raise the stake after
a losing run, flip turbo on, arm autoplay, take a declined deposit. The markers
fire in order, the state moves `calm → elevated → concern`, and the lobby
changes underneath you — the wheel is withheld, volatility is capped, the
session summary and limit tools appear.

The three buttons at the bottom of the game screen (deposit, declined deposit,
raise limit) stand in for events the real client already emits. They are there
so a two-minute demo reaches states a real session reaches over an hour.

## Layout

```
Solution/
  scripts/extract-data.mjs     raw CSV → app/src/data/*.json
  app/
    App.js                     tab shell
    src/
      lantern/
        sco.js                 event bus + Session Context Object   §3.1 §3.2
        risk.js                18 markers + age covariate           §3.5 §7
        relevance.js           retrieve → rank → calibrate          §3.4 §3.3b
        policy.js              deterministic decide() + shouldSend()§3.6 §3.9
        useLantern.js          the one place it is wired together
      screens/                 Lobby · Game · Slip · Monitor
      components/ui.js         shared primitives
      data/                    generated — do not hand-edit
      theme.js
```

## What this prototype does not do

- **It never touches game outcomes.** No path to the RNG, no path to outcome
  selection, no path to prize determination. The reels in the game screen are a
  uniform draw with a published table, and they exist only so the markers have
  real play to read.
- **The risk head is not validated.** Its markers are drawn from the behavioural
  tracking literature and it demonstrates the mechanism. Calling it accurate
  would need labelled outcomes we do not have.
- **The ranker is a readable linear model**, not the gradient-boosted trees the
  architecture specifies. Same features, same pipeline shape, fewer moving parts
  in a 48-hour build.
- **No demographic attribute reaches the relevance head.** Age enters the risk
  head only. That is checkable: `relevance.js` never reads `prior.ageBand`.

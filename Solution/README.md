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
npm start          # QR code for Expo Go on a phone
```

### The three surfaces

| URL | What it is | Who it is for |
|---|---|---|
| `/` | The product | Player |
| `/mind` | Model diagnostics — feature vector, contributions, sample sessions | Judge / data |
| `/ops` | Operator dashboard — cohorts, what to build, **live session feed** | Operator |

`/mind` and `/ops` are full-width web pages, not phone tabs. Home carries a
glanceable widget for each.

### Live feed (optional, but it is the demo)

In a second terminal:

```bash
cd Solution/app && npm run relay      # or: node Solution/server/relay.mjs
```

Then open `/ops` on the laptop and play on `/` — the session card, the character,
the risk head and the event stream update as you tap. To drive it from a phone on
the same wifi, the relay prints the LAN address to use:

```bash
EXPO_PUBLIC_RELAY=http://192.168.x.x:8787 npm run web
```

Publishing is fire-and-forget: with the relay stopped the product behaves
identically and the dashboard says so rather than erroring. Only model *output*
crosses the wire — character, risk, counters — never the behavioural stream.

**First run on a fresh clone**, Empire of Gold has to be put where the web server
can reach it. Expo serves `app/public/`, and the 98 MB bundle is gitignored, so
it is not there after a clone:

```bash
cp -r empireofgold Solution/app/public/empireofgold
cp -r recon/placeholders/assets/spines/* Solution/app/public/empireofgold/assets/spines/
```

The second line matters: four spine texture sets (`book`, `cards`, `jakpots`,
`jp_jackpots`) were never captured with the original bundle, and Pixi hard-fails
the whole load on a missing texture. `recon/placeholders/` holds stand-ins at the
right dimensions.

If Metro reports it cannot resolve a package that is plainly present in
`node_modules` — it caches resolution failures from mid-install — clear its
cache once:

```bash
npm run web:clean      # or: npm run start:clean
```

Regenerate the dataset from the raw logs (only needed if the CSV changes):

```bash
node Solution/scripts/extract-data.mjs
```

## Deliverables

| | |
|---|---|
| D1 Working prototype | this app |
| D2 Live demo | [../DEMO-SCRIPT.md](../DEMO-SCRIPT.md) — 15 min, timed, with the questions you'll get |
| D3 Impact case | [../IMPACT-CASE.md](../IMPACT-CASE.md) |
| D4 Compliance note | [../COMPLIANCE-NOTE.md](../COMPLIANCE-NOTE.md) |

## The models are trained, not tuned

Five models, fitted on Kaggle by [kaggle/train_lantern.py](kaggle/train_lantern.py)
and shipped as one 445 KB JSON (92 KB gzipped) that runs on the device.

| Head | Held-out | GBDT ceiling |
|---|---:|---:|
| Character (4-class) | 0.940 acc · **0.824 within the first 20% of a session** | 0.943 |
| Risk | 0.996 AUC | 0.998 |
| Conversion | 0.965 AUC | 0.976 |
| Ranker vs popularity | **+197% recall@6 · +222% MRR** | — |

All heads train on *prefixes* of a session, so they commit to a read after five
events and update as evidence arrives. Train/test splits on session id, so no
prefix of a session lands on both sides.

The shipped models are logistic/softmax rather than the gradient-boosted forest
we also trained, because the forest bought about one accuracy point and cost
per-feature contributions. Those contributions are what the Mind screen displays
— it is the model's own arithmetic, not an explanation composed after the fact.

```bash
node Solution/scripts/probe-model.mjs      # heads, on three known sessions
node Solution/scripts/smoke-ui.mjs <build> <shots>   # the whole UI, in a browser
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
working around the lobby. That is the Feed tab's reason for existing.

Neither number is estimated. Both come from FEG's own event stream.

## The three tabs

**Feed** — vertical discovery, shaped like the apps people already use. A
stories row of the real lobby sections, then large cover cards. The
`Generic / Lantern` switch is the A/B, and both arms are feeds so only the
ranking and the explanations differ. Lantern reads the session archetype from
the first few interactions and holds the provider mix near the session's own
(Steck calibration, KL shown live).

Two borrowed mechanics, handled differently. **Kept:** every card says why it is
in front of you, generated from the same `why` object the ranker emits, so the
sentence cannot drift from the scoring. **Dropped:** infinite scroll. The feed
is session-length, shows how far through you are, and ends with a summary
instead of loading more — "no natural stopping point" is the whole problem in a
gambling product, so it is the one mechanic that cannot come across.

**Sport** — the betslip and the confirm step. The "what happens if" panel
answers the questions that plausibly cause the 21.6%: void legs, postponement,
odds movement, cash-out. No timer, no scarcity copy. The brief draws that line
for us.

**Monitor** — conversion and harm on one screen. The 18 markers, the live risk
state, the age-band control (§7 — it changes threshold sensitivity and cannot
reorder a shelf), the per-market policy, and the notification gate simulator
with the blocked triggers included on purpose.

## Driving a demo

Start on **Generic**, flip to **Lantern**, and watch the order change and the
explanations appear. Then open a game and, in the game screen: raise the stake
after a losing run, flip turbo on, arm autoplay, take a declined deposit. The
markers fire in order, the state moves `calm → elevated → concern`, and the feed
contracts underneath you — the wheel is withheld, volatility is capped, the
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
      screens/                 Feed · Game · Slip · Monitor
      components/
        ui.js                  shared primitives
        GameArt.js             deterministic cover art, all 887 titles
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
- **Cover art is generated, not fetched.** Real tile imagery sits behind
  `feg-casino-portal-api` and costs the lobby 2,560 KB per load. `GameArt`
  derives a stable cover from the title string, keyed by mechanic so a family of
  games reads as one. Zero network bytes; nothing is passed off as FEG artwork.

# Ember — PRD and Presentation Playbook

**Ember: Instant play through transient edge execution and recovery based handoff, unified with an OS native match presence system.**

FEG Innovation Hackathon 2026 · Challenge 03 (primary) + Challenge 02 · Lorven AI

> **Name.** The pool is already burning before you ask. When you tap, an ember is handed to your device, and the source is returned.

---

## 1. What we learned from PSK

Recon on psk.hr changed four things in the build plan. Read this section before the architecture.

**The casino is a separate origin.** Sport lives on `www.psk.hr`, casino on `casino.psk.hr`, APIs on `api.psk.hr`. Games from 30+ providers (Playtech, Pragmatic Play, Novomatic, EGT Digital, Amusnet, Fazi, Play'n GO) are almost certainly loaded in cross origin iframes from provider domains.

This is the single most important technical finding, because **a Service Worker registered on a PSK origin cannot intercept requests made by a cross origin provider iframe.** Half the standard web performance playbook is unavailable to FEG by construction. It also strengthens our case: the edge browser has no such restriction, because it controls the whole page.

Consequence for the build: working set loading and chunk dedup only apply to assets we can proxy through a PSK origin. The edge path is the only one that works on an unmodified cross origin bundle. Say this out loud to judges. It is the reason a straightforward caching answer cannot win this challenge.

**PSK has four house games.** Vatreni Cup (Playtech), PSK BET and PSK RESPIN (Casimi), PSK HOT 40 (Fazi). These are co-branded, PSK-commissioned titles. They are the right demo target and the right pilot target, because the certification and provider-permission conversation is far easier on a game PSK helped commission than on a Pragmatic title.

**The frontend is Astro.** Static generated lobby, which means the shell is already fast and cacheable. Our work is entirely in what happens after the tap, not in the lobby itself.

**They already ship native apps.** iOS app id 642032278, Android `hr.psk.sport.betting`. The Challenge 2 layer is an extension of an existing app, not a new app. That materially lowers the "is this realistic" objection.

**Two gifts for the pitch.** First, PSK's own app marketing promises you can start playing in two taps. Our opening line writes itself: you promise two taps, and the second one costs seven seconds. Second, PSK runs 200+ branches and 2000 partner cafés, with the slogan about meeting for a drink at the PSK café. The "loud bar" context mode in Challenge 2 is not a hypothetical for this company. It is their core retail identity rendered on a phone.

**Sports events for the haptic vocabulary already exist as products.** PSK PREDNOST (2UP, 3UP, 5UP), 90+, VAR protection, Cash Out windows, BetBuilder legs settling. Build the haptic language on these real product events rather than inventing a taxonomy. A 2UP triggering is a real, felt, sport-driven moment.

---

## 2. Goals

**Primary goal.** Time from tap to first interactive frame under 500 ms at p50 and p95 on a mid-range Android over 4G, with no modification to the certified game bundle and no weakening of any protective step.

**Secondary goal.** Extend the same session to watch and lock screen so the match is present between app opens.

**Non-goals for the hackathon.** Full provider integration, real money flow, production RGS integration, Android parity on the presence layer (iOS only), and any claim of production certification sign-off.

### Success metrics

| Metric | Target | How measured |
|---|---|---|
| Time to first interactive frame | < 500 ms p50 and p95 | Client timestamp at tap to first input-accepting frame — **measured 120 / 170 ms** |
| Time to local takeover | < 8 s p95 | Controller log |
| Handoff success rate | > 95 % | Controller log, per attempt |
| Visible handoff artifacts | 0 in 20 consecutive runs | Manual, recorded on video |
| Edge instance seconds per launch | < 8 s | Pool telemetry |
| Bytes to first playable | < 4 MB | Network panel and SW log |
| Cold path (edge unavailable) | Report honestly, no target | Same harness, edge disabled |

Report real and perceived separately. The brief demands it and it is the fastest way to earn a technical judge's trust.

---

## 3. Architecture

```
                Responsible gambling layer
        (interstitial, age gate, Future-You Lock card)
                            |
                   Session object (Redis)
        balance · limits · match context · moments
              |                             |
      Entry engine                  Presence engine
              |                             |
  +-----------+----------+        +---------+---------+
  edge pool manager      |        match feed ingest
  frame + input transport|        haptic pattern mapper
  local loader (SW)      |        tension field renderer
  handoff arbiter        |        context sensor
  mock RGS + recovery    |        presence service
              |                             |
        phone · watch · lock screen · Dynamic Island
```

### Components

**Edge pool manager (Node.js).** Maintains N warm Chromium contexts per title via Playwright. Each context has already loaded the game and reached first interactive frame, then paused. On a launch request it claims a context, assigns a fresh session identity, and unpauses. Refills the pool in the background. Key decision: use browser *contexts* inside a smaller number of browser processes, not one process per user. Context creation is tens of milliseconds; process launch is seconds.

**Frame and input transport.** WebRTC from the edge context to the client, with a data channel carrying pointer and touch events back. Fallback path for the hackathon if WebRTC proves fiddly: MJPEG over a WebSocket at 30 fps. Ugly, but it demos, and you can swap it later. Decide this on hour 4, not hour 30.

**Local loader (Service Worker, Workbox).** Fetches the recorded launch working set first, then streams the remainder. Records the working set by instrumenting a first run and persisting the ordered list of URLs touched before first interactive frame. Only applies to assets we serve from our own origin, per the cross origin finding above.

**Handoff arbiter (Node.js).** Subscribes to game state signals and decides when to switch. Quiescence condition for a slot: no spin in flight, no animation running, no pending server round. On quiescence plus local-ready, it instructs the client to boot the local instance, waits for a recovery confirmation, then tears down the edge context. Never tears down first.

**Mock RGS.** Express service with `POST /session/create`, `GET /session/:id/recover`, `POST /round`. The recover endpoint returns balance, limits, and round state. This stands in for the provider's real remote game server and is where you demonstrate that the handoff uses an existing certified mechanism rather than a new one.

**Presence engine (Swift, iOS/watchOS).** Consumes the match feed over APNs and a websocket. Maps event types to Core Haptics patterns. Renders the tension field into a Live Activity and Dynamic Island. Reads Core Location coarse signals plus ambient audio level to pick a context mode. Hard architectural rule: **this module has no dependency on, and no read path to, the wagering service.** Enforce it as a module boundary, and show the boundary in the diagram.

---

## 4. Build plan, 48 hours

Assume four people. Adjust ratios if you have fewer.

### Workstream A — Edge and transport (2 people)

| Hours | Task | Done when |
|---|---|---|
| 0–4 | Playwright + Chromium in Docker, one game loaded headless, screenshot proves it renders | You can see a rendered game frame from a container |
| 4–8 | Transport spike: WebRTC vs MJPEG-over-WS. Pick one and commit | Interactive-ish frame stream visible in a browser |
| 8–16 | Input forwarding, round trip under 60 ms locally | You can spin the game from the client through the stream |
| 16–24 | Pool manager: pre-warm N contexts, claim, refill | Launch request served from a warm context in under 300 ms |
| 24–32 | Session identity injection, teardown, leak checks | 50 sequential launches without memory growth |

### Workstream B — Local path and handoff (1 person)

| Hours | Task | Done when |
|---|---|---|
| 0–6 | Mock RGS with create/recover/round | curl returns a recoverable session |
| 6–14 | Service worker with working set recording and replay | Bytes to first playable measurably lower than baseline |
| 14–26 | Handoff arbiter: quiescence detection and switch | Local instance takes over with correct balance |
| 26–34 | Failure paths: recovery timeout, stay-on-edge fallback | Killing recovery does not break the session |

### Workstream C — Presence layer (1 person)

| Hours | Task | Done when |
|---|---|---|
| 0–8 | SwiftUI app shell, Live Activity, Dynamic Island | Card appears on lock screen with mock match data |
| 8–18 | Core Haptics vocabulary: calm, rising, momentum shift, big event | A person can identify three patterns blind |
| 18–26 | Tension field rendering driven by a match intensity value | Field visibly changes across a scripted match |
| 26–32 | Deep link from watch tap into the game, through the entry engine | Tap on watch, playing in under a second |

### All hands, hours 32–48

| Hours | Task |
|---|---|
| 32–38 | Instrumentation: Prometheus counters, Grafana board showing real vs perceived, p50/p95, hit rates |
| 38–42 | Demo rig: two phones, identical network, on-screen timers, dashboard on a third screen |
| 42–46 | Rehearse the 15 minute demo end to end, five times, including the failure recovery |
| 46–48 | Freeze. No new code. Only slide and script polish |

**Hard rule: feature freeze at hour 42.** Every hackathon loses on a broken demo, not a missing feature.

### Fallback ladder

If a workstream slips, degrade in this order and say so honestly on stage:

1. WebRTC fails → MJPEG over WebSocket
2. Handoff arbiter incomplete → manual button labelled "Hand off now", still real, still proves the mechanism
3. Working set recording incomplete → drop it, edge path alone still hits the entry number. **But say out loud that this is the cut that hurts:** measurement shows time-to-local, and therefore edge occupancy, is bounded below by the device's own download. Without working-set loading a real 30 MB title pushes occupancy to ~16 s and the cost ratio degrades with it. The demo survives this cut; the economics do not.
4. Presence layer incomplete → cut to Live Activity plus one haptic pattern, keep the watch-to-game deep link because that is the fusion point
5. Everything slips → demo the edge stream and the manual handoff on a laptop. That alone is the novel claim

---

## 5. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Cross origin iframe blocks local instrumentation | High | Reverse proxy the demo game through our own origin; state the constraint openly as a finding |
| WebRTC setup eats a day | Medium | Timebox to hour 8, fall back to MJPEG |
| Edge RTT on venue wifi ruins the demo | Medium | Run the edge node locally on the same LAN. Disclose it. Report expected RTT for real PoPs |
| Handoff visibly glitches | Medium | Only hand off at quiescence; if unsure, wait for the next quiescent window |
| Judge asks about certification | Certain | Prepared answer, see section 7 |
| Haptics read as an engagement mechanic | High | Module boundary in the diagram, plus the line that the engine reads the match feed only |
| Demo game is not representative of a real 30 MB title | Certain | State measured payload of the stand-in, and what the numbers would be at 30 MB |

---

## 6. Presentation plan

### Narrative arc, 15 minutes

**0:00–1:30 — The hook.** Open on their own promise. PSK's app store copy says you can start playing in two taps. Show a real phone doing exactly that, with a timer. The second tap costs seven seconds. Do not explain anything yet. Let the timer run in silence. Silence is the most underused tool in a hackathon demo.

**1:30–3:00 — The constraint.** The game is a certified third party package. Not one line may change. And here is the finding: casino.psk.hr is a separate origin from the games, so the standard toolkit (service workers, cache control on the bundle) cannot even reach the code. This challenge is harder than it looks, and that is why the answer is not caching.

**3:00–5:00 — The idea, in one breath.** Do not start with architecture. Say: what if the game were already running before you asked, somewhere near you, and then quietly moved onto your phone while you played? Then one diagram, thirty seconds on it, move on.

**5:00–9:00 — The demo.** See script below. This is the centrepiece. Protect these four minutes.

**9:00–11:00 — Why it is not cloud gaming and not caching.** The five second occupancy number. 800 warm copies for 10,000 players. The recovery path point: GLI-19 already requires every certified game to restore state after an interruption, and nobody has used that as a migration primitive.

**11:00–13:00 — The second half.** The same session object on the watch and lock screen. Haptic language built on PSK's own products: 2UP settling, VAR protection, the Cash Out window closing. And the fusion: feeling it is the reason to tap, instant play is why the tap keeps its promise. Land the retail point — for a company with 2000 partner cafés, the loud bar mode is not a hypothetical.

**13:00–15:00 — Honest limits and the ask.** Say the three things in section 7 before anyone asks. Close on the line: the waiting stops existing.

### Demo script, four minutes

Two identical phones, same network, side by side on a stand, both mirrored to the screen. A third screen shows the Grafana board.

| Time | Action | What the judge sees |
|---|---|---|
| 0:00 | Tap the left phone (baseline) | Loading bar, timer counting. Leave it running |
| 0:08 | Tap the right phone (Ember) | Playing at 0.24 s while the left one is still loading |
| 0:20 | Point at the dashboard | Real time to interactive vs bundle complete, plotted separately |
| 0:40 | Keep spinning on the right phone | Indicator flips to HANDOFF → LOCAL at ~5 s. Player does not pause |
| 1:00 | Turn off wifi on the right phone | It keeps playing. It is local now |
| 1:30 | Bring out the watch. Trigger a scripted 2UP event | Haptic fires. Judges can feel it if you pass the watch down |
| 2:00 | Tap the watch notification | Straight into the match context, no navigation, no loading |
| 2:30 | Show the lock screen | Tension field plus the Future-You Lock card with the limit visible |
| 3:00 | Back to the dashboard | p50 and p95, handoff success rate, edge seconds per launch |
| 3:30 | One failure run, deliberately | Kill recovery. It stays on the stream. Nothing breaks |

That last row is worth more than any other thirty seconds in the presentation. Showing a failure you handle gracefully is the strongest credibility move available, and almost no team does it.

### Slide-to-narrative mapping

Use the Ember deck as is. Slides 1–2 cover 0:00 to 3:00, slide 3 covers the idea, slides 4–5 sit behind the demo (do not talk to them, they are reference), slide 6 covers 11:00 to 13:00, slides 7–8 cover the close, slide 9 is the last thing on screen during Q&A.

---

## 7. Q&A preparation

Raise the first three yourself before anyone asks. Volunteering your weaknesses buys credibility you cannot buy any other way.

**"Is running a certified bundle at the edge allowed?"** The package is byte identical and hash verified. The RGS remains the sole authority for RNG and outcomes. The edge instance is a rendering host with no outcome authority. This still needs an auditor sign off, and we are not claiming we have one. For a pilot we would start with PSK's own commissioned titles, where the provider conversation is simplest.

**"Is this just cloud gaming?"** Cloud gaming is permanent and priced per hour per user. This is seconds per launch, then the compute is returned. **Measured on our rig: 7.85 s of edge occupancy per launch.** At 10,000 concurrent players launching about once a minute that is roughly 1,300 concurrent instances rather than 10,000 — a 7.6x reduction. That ratio is the whole difference.

Quote the measured 1,300, not the 800 this document originally estimated from a 5 s assumption. `node scripts/capacity.js` recomputes it from whatever the rig actually did, so the number on stage is always the number we measured that morning.

**"What about bad networks?"** Above roughly 50 ms edge RTT the instant entry degrades. That is why the local path exists and why we report both. Our p95 claim comes from the measured system, not the best case.

**"Are you bypassing responsible gambling steps?"** The opposite. The mandatory interstitial is the compute window we run inside. Nothing is skipped or shortened. And on the presence side, the player's own limit becomes a persistent lock screen object rather than a buried setting.

**"Won't the haptics drive more betting?"** The haptic engine subscribes to the sports feed only. There is no code path from wagering state to the Taptic Engine. It is a module boundary, and it is on the diagram.

**"Does this work for 2000 games?"** Warm pools are sized by demand, not catalogue. Analytics across the industry show a player samples about seven titles a month, so a pool covering the head of the catalogue serves most launches, and the tail falls back to the local path.

**"What is genuinely new here?"** Using a regulator mandated crash recovery requirement as a live migration primitive. Every certified game already ships it. Everyone treats it as a crash handler. Nobody has used it to move a running session from edge to device.

---

## 8. Judging rubric mapping

| Criterion | Weight | Where we win it |
|---|---|---|
| Business impact | 30 % | Launch to play conversion, games sampled per session, and the 800-vs-10,000 cost ratio with stated assumptions |
| Customer experience | 20 % | Live side by side demo, the offline proof, the watch to game tap |
| Originality | 15 % | Recovery path migration, and the compliance inversion |
| Technical feasibility | 15 % | Working prototype, honest fallback ladder, the cross origin finding |
| Product thinking | 10 % | One session object serving two engines; pilot plan starting with PSK's own titles |
| Compliance by design | 10 % | Interstitial as compute window, Future-You Lock, the haptic module boundary |

---

## 9. Open questions for FEG

Ask these in their Q&A window. The first one is load bearing.

1. Does the RGS expose a session recovery call outside a genuine disconnect, and can it be invoked by the platform rather than the game client?
2. What are the real payload sizes and provider mix for the top 50 titles by launch volume?
3. What is the measured breakdown of the 6 to 8 seconds across network, RGS handshake, and client init?
4. Are the games loaded cross origin from provider domains, or proxied through a PSK origin?
5. For the branded titles, what freedom exists to alter hosting or delivery without re-certification?
6. What is the current launch to play conversion rate, so the business case uses their number rather than ours?

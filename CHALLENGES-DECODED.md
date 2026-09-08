# The three FEG challenges, decoded

What each brief actually asks for, what the real difficulty is, what research
applies, and what to build. Written against the official challenge cards.

Companion docs: [RECON-FINDINGS.md](RECON-FINDINGS.md) (measured evidence from
psk.hr), [EMBER-PRD.md](EMBER-PRD.md) (our Challenge 03 build).

---

## Read this first: a correction that changes our Challenge 03 strategy

The research memo in `feg-game-load-time-hackathon.pdf` repeatedly warns that
caching and prefetching are "close to banned territory" and that a warm pool is
"the weakest-novelty idea." **The official brief says the opposite.** Under
"Where we expect innovation" Challenge 03 lists, in order:

- Prediction and prefetching
- Edge and CDN and caching strategy
- Progressive and perceived loading
- Lobby-to-game transitions
- Instrumenting real vs perceived load

FEG is *asking* for prefetching and edge strategy. The memo was guessing at the
judging criteria and guessed wrong. That does not make a lazy cache answer a
winner — it means the differentiator is **execution quality and honest
measurement**, not exotic mechanism. Note the metric `Cache hit / prefetch
accuracy`: they want to see that you measured your prefetch *precision*, not
that you prefetched everything and called it fast.

Also note: **"The solution space is everything around the game."** That is
exactly the seam we found at `gamecontainer-eu.psk.hr` — FEG's own code
wrapping every launch.

---

# Challenge 01 — Session Quality and Session-to-Action Conversion

## What they're saying, plainly

People open PSK far more often than they do anything in it. They scroll, they
look, they leave. FEG is not asking for more visitors — they say so twice
("Not a traffic problem. Users already come."). They are asking you to make the
visits that already happen end in something.

Two specific failure points, and they are different problems:

**1. Discovery friction.** "Generic layouts look the same to a first-time
visitor and a ten-year specialist." A newcomer who wants a football accumulator
and a specialist who only bets ATP Challenger tennis get the same homepage. The
newcomer is overwhelmed; the specialist has to dig past everything irrelevant.

**2. Drop-off at the final step.** People who reached the confirm button —
"our strongest intent signal" — still leave. This is not a discovery problem at
all. Someone who built a bet slip and then abandoned it did not lack interest.
Something at that moment stopped them.

Treating these as one problem is the most common mistake. They need different
solutions and different evidence.

## Decoding the metrics

| Metric | What it really measures | How a team accidentally games it |
|---|---|---|
| Value per Session | Revenue/GGR per session | Push bigger stakes — **violates the guardrail** |
| Session Conversion Rate | % of sessions with ≥1 action | Redefine "action" downward |
| Actions per Session | Actions per visit | Encourage many small impulsive bets — guardrail risk |
| Final-step Conversion | % who reach confirm and complete | The cleanest metric here; hardest to fake |
| Sessions per User | Visit frequency | Notification spam — Challenge 02's guardrail |
| Time to First Action | Open → first meaningful action | Genuinely good; aligns with reduced friction |

**Outcome that actually counts:** "uplift that survives into D30/D90 retention."
Short-term conversion tricks decay. They are telling you they will look at
whether the lift persists three months out. Anything pressure-based does not.

## Explicitly out of scope

Acquisition and marketing before the session. Pricing and commercial terms.
Registration and identity verification. So: no signup-flow redesign, no
promotional offers, no odds changes. The work is entirely inside an existing
session with an existing logged-in user.

## The hidden difficulty — and where you win

> **Guardrail:** Uplift must come from relevance and reduced friction, never
> pressure. No dark patterns, no urgency mechanics, nothing conflicting with
> responsible gambling limits or self-exclusion. **Sessions showing harmful-play
> indicators must not rise. Judged.**

"Judged" means the guardrail is *scored*, not advisory. And the harmful-play
clause is the sharp one: it requires you to **measure harm indicators and show
they did not rise**. Almost no hackathon team will build that. It is the single
highest-leverage thing you can do in this challenge, because it converts a
constraint everyone treats as a compliance footnote into a deliverable.

Concretely: ship a dashboard where the conversion line goes up and the
harm-indicator line stays flat, side by side. That is a screenshot no
competitor will have.

## Research foundations

**Session-based recommendation.** The brief is about *sessions*, not users, and
there is a whole literature on exactly that distinction — modelling the current
short sequence of interactions rather than a long-term user profile. Start with
[GRU4Rec's evaluation lineage](https://arxiv.org/pdf/1803.09587) (Ludewig &
Jannach's comparison is unusually honest about simple baselines beating neural
ones), then [BERT4Rec](https://arxiv.org/pdf/1904.06690) for the bidirectional
transformer approach. Relevant caution from that literature: well-tuned
nearest-neighbour baselines frequently match deep models on session data, so do
not burn the hackathon training a transformer.

**Calibrated recommendations.** [Steck, RecSys 2018](https://dl.acm.org/doi/10.1145/3240323.3240372)
— if a user's history is 70% tennis and 30% football, their recommendations
should be roughly 70/30, not 100% of whatever the model finds most clickable.
This is the *responsible* form of personalization: it reflects interests back
rather than amplifying the most engaging one. For a gambling operator that
distinction is not academic — an uncalibrated engagement-maximising recommender
is precisely the thing that would make harm indicators rise. Cite this as the
reason your recommender is safe by construction.

**Deceptive design, as a checklist of what not to do.**
[Mathur et al.'s ecommerce taxonomy](https://deceptive.design/book/contents/chapter-13/)
and, more directly,
[Sludge, dark patterns and dark nudges: a taxonomy of online gambling platforms' deceptive design features](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12426356/)
— a gambling-specific taxonomy. Use it as an explicit rubric: show your design
scored against each named pattern and does not use any.

**Behavioural markers of harm.** This is how you build the monitor.
[Behavioural Markers of Harm and Their Potential in Identifying Product Risk in Online Gambling](https://link.springer.com/article/10.1007/s11469-023-01060-8)
and [a review of behavioural tracking studies using real operator data](https://pmc.ncbi.nlm.nih.gov/articles/PMC11272745/).
Established markers you can implement on sample data: within-session repeat
deposits ("top-ups"), declined deposits, easing or removing one's own RG
settings, bonus-seeking, and play at unusual hours. These are literature-backed
and cheap to compute.

## What to build

1. **A session-intent classifier, not a user profile.** Within the first two or
   three interactions, classify the session: browsing, specific-intent,
   returning-specialist. Reshape the layout accordingly. This directly answers
   "generic layouts look the same to a first-time visitor and a ten-year
   specialist," and it is honest about the fact that the same person has
   different sessions.

2. **Diagnose the final step rather than decorating it.** Instrument abandonment
   at confirm and find the actual cause. Plausible candidates you can test:
   odds moved between selection and confirm, stake/return unclear, a rule the
   user is unsure about. Then answer *that* question in place. A "what happens
   if" panel at the confirm step is relevance and reduced friction. A countdown
   timer is a dark pattern. The brief draws that line for you.

3. **A calibrated discovery shelf**, with the calibration metric shown live so
   you can prove it is not amplifying.

4. **The harm monitor**, as a first-class panel, not an appendix.

---

# Challenge 02 — Native App Experience, Relevance on Every Surface

## What they're saying, plainly

Between app opens, PSK does not exist to the user. And that is exactly when the
things they care about happen — their team scores, their bet settles, the match
they staked on goes to penalties. So the user follows the match in *somebody
else's* app, and PSK finds out about it only when they next open.

The four stated problems, in their words:

- Between sessions we're invisible, and that's when the moments happen
- **Live moments are lost** — someone following a live event tracks it in a
  third-party app, not ours
- **Broadcast pushes are ignored or disabled, and opt-out is effectively
  permanent**
- **The OS canvas sits unused** — a user's own live activity is a stronger
  real-time story than a generic feed

That third point is the most important sentence in the brief. They are telling
you their existing notification strategy has already failed and burned the
permission. Proposing better-targeted pushes is answering a question they have
already closed.

## The reframe that wins this

**Stop interrupting. Start persisting.**

A push notification is an interruption: it demands attention now, and the user's
only long-term defence is to revoke permission — which the brief says they
already do, permanently. A Live Activity, a widget, a watch complication, or a
Dynamic Island presentation is a *persistent surface*: it updates in place,
carries live state, and costs the user nothing when ignored.

This is well-grounded, not just a nice framing. The interruption literature
([Intelligent Notification Systems survey](https://arxiv.org/pdf/1711.10171))
documents that notifications draw attention away from ongoing tasks and increase
cognitive load, and that **ambient representation of incoming information
maintains awareness while mitigating disruption**. Glanceability is a measurable
design property — see
[Glanceable Visualization, InfoVis 2018](https://www.microsoft.com/en-us/research/wp-content/uploads/2018/08/GlanceableVis-InfoVis2018.pdf)
on how much can be read in a sub-second glance, and
[the smartwatch glanceable-feedback design space study](https://pmc.ncbi.nlm.nih.gov/articles/PMC13448195/)
on stylization, granularity and salience as the three levers.

Look at their metric list again with this lens: **"Notification opt-in
retention."** They are measuring whether users *keep* notifications enabled.
You can win that metric by sending dramatically fewer interruptions and moving
the information onto a persistent surface. State that trade explicitly.

## The constraints nobody will know

These are real platform limits that will separate a demo that works on stage
from one that dies:

- **Live Activity push payload is ~4 KB total**, including the content state.
  Design the state model to fit.
- **`apns-priority: 10` is metered against a per-device budget** that iOS
  calculates; exceed it and updates are delayed or dropped. `priority: 5` is
  unmetered but delivered opportunistically. A football match with frequent
  updates must use a mix, not blast priority 10.
- **`NSSupportsLiveActivitiesFrequentUpdates`** in Info.plist raises the budget
  — but **users can switch it off**, and you must detect that at runtime via
  ActivityKit's `frequentPushesEnabled` and lower your send rate for those
  users. Handling that gracefully is a genuine engineering signal.
- **Android WebView does not support bfcache** and Chrome has said the
  integration cost is too high. Relevant if the one-tap launch shortcut lands in
  a WebView.
- **Chrome Custom Tabs `warmup()` saves up to ~700 ms**, and `mayLaunchUrl()`
  prefetches — the Android equivalent of the one-tap launch story.

## The guardrail, and "enforced by design"

> OS surfaces are the most personal space we could occupy — misuse destroys
> trust permanently. Quiet hours, frequency caps and GDPR consent respected.
> **Zero inducement pushes to at-risk or self-excluded customers, enforced by
> design.**

"Enforced by design" is doing real work. It means a policy document is not
enough — it should be *architecturally impossible* for the presence layer to
send an inducement to an at-risk user. The way to demonstrate this is a module
boundary: the surface engine subscribes to the match/event feed and has **no
read path to the wagering or promotions service at all**. Show the boundary in
the code and in the diagram. If there is no wire, there is no risk.

## What to build

The brief is unusually generous here: **"a standalone native demo app on real
devices with sample data — iOS, Android or both."** Production integration and
real user data are explicitly out of scope. So this is a well-scoped native
build, not an integration project.

1. **One Live Activity that tells the user's own story**, not a feed. Their
   match, their selection, their current position — updating in place on the
   lock screen and Dynamic Island.
2. **A watch complication plus one-tap launch** into the exact context. The
   tap-through metric is listed; make the tap land somewhere specific, not on a
   home screen.
3. **A visible frequency/quiet-hours governor** — show the app choosing *not*
   to send. Demonstrating restraint on stage is more persuasive than
   demonstrating capability.
4. **The module boundary**, diagrammed and enforced.

---

# Challenge 03 — Game Load Time, 6–8 Seconds to Near-Instant

## What they're saying, plainly

Choosing a game should feel like scrolling a feed. Today it takes 6–8 seconds
from tap to playable, in a product whose entire core loop is *choosing and
switching games*. Because loading is slow, users stop exploring — they "settle
into a small familiar set and new content never gets a fair chance." So the
slow load is not only a UX annoyance, it is suppressing catalogue discovery,
which is a commercial problem.

"The constraint is structural — games are certified third-party bundles,
contractually fixed. **The solution space is everything around the game.**"

## What we have already measured

From [RECON-FINDINGS.md](RECON-FINDINGS.md), against the live site:

- Provider game frame attaches at **7.1–8.8 s** (Play'n GO 7057 ms, Fazi
  8392 ms, Spribe Aviator 8849 ms) — their 6–8 s reproduced, unthrottled, so
  these are floor numbers.
- **Two launch architectures.** Playtech GPAS serves a **7815 KB** client from
  `gpas-games2.psk.hr`, a PSK origin. Fazi and Spribe nest a genuinely
  cross-origin provider frame inside two PSK-owned frames.
- **~2 MB of PSK-owned non-game payload per launch**, including **638 KB of
  Google Tag Manager** ahead of the game.
- The seam: `gamecontainer-eu.psk.hr/GameView/<Provider>` — FEG's own code, same
  origin, on every launch path, already aware of provider and real/demo mode.

## Decoding the metrics

| Metric | What it means for the build |
|---|---|
| Cold Load p50 / p95 under 500 ms | The headline. p95 matters more than p50 — no cherry-picked runs |
| Launch-to-play conversion | Of taps on a game tile, how many reach play |
| Games sampled per session | The discovery outcome — the actual business case |
| Perceived-load quality | They will judge how the wait *feels*, separately |
| Cache hit / prefetch accuracy | **Precision, not volume.** Prefetching everything is a fail |

`Cache hit / prefetch accuracy` deserves attention. Any team can prefetch the
whole lobby and report a high hit rate while wasting enormous bandwidth on a
mobile connection. Report precision *and* waste: what fraction of what you
prefetched was actually used.

## Research foundations that actually apply here

The PDF memo's research lineage — Firecracker, CRIU, Catalyzer's `sfork`, REAP
— is about **native processes with GPU contexts**. PSK's games are web games:
we measured `gpasclient.html`, `/Content/webjs/slots/WildSunburst/`, and
`aviator-demo.spribegaming.com`. CRIU against a browser tab is the wrong tool.
The transferable *idea* from REAP is working-set recording; the transferable
idea from Firecracker/SnapStart is pay-init-once. The implementations do not
transfer.

What does apply, on the web platform:

- **[Speculation Rules API](https://developer.chrome.com/docs/web-platform/prerender-pages)**
  — declare in JSON which URLs the browser should prefetch or fully *prerender*.
  A prerendered page is rendered in an invisible tab and activates near-instantly.
  This is the single most direct tool for "lobby-to-game transitions." Chromium
  109+, with `eagerness` levels and URL patterns; **no Firefox or Safari
  support**, which matters a lot on iOS and must be stated.
- **[bfcache](https://web.dev/articles/bfcache)** — caches the whole page
  including the JS heap for instant back/forward. Critical caveat we found:
  **Android WebView is explicitly not supported.** If PSK's native app hosts
  games in a WebView, this is off the table there.
- **[Chrome Custom Tabs `warmup()` / `mayLaunchUrl()`](https://developer.chrome.com/docs/android/custom-tabs/guide-warmup-prefetch)**
  — documented ~700 ms saving, the native-Android lever.
- **`WebAssembly.instantiateStreaming()`** — compile while downloading rather
  than after. Applies if any provider ships WASM.
- **Service Worker precache** — available for Pattern A (`gpas-games2.psk.hr`)
  and *not* for Pattern B. Say which is which.

**Perceived load has its own literature, and the brief scores it separately.**
[The effect of skeleton screens (ECCE 2018)](https://dl.acm.org/doi/10.1145/3232078.3232086)
found skeleton screens score higher than spinners on both perceived speed and
perceived ease of navigation. Further work finds an *interactive* animation
beats both a progress bar and a passive animation on perceived wait and
satisfaction. Since the brief asks you to "say which gains are raw speed and
which are perceived," you can cite this and instrument both.

## The guardrail

> Speed must not bypass anything that protects the user — responsible gambling
> interstitials, reality checks, session limits and age gates stay at full
> fidelity. Certified packages must not be altered.

This is the compliance inversion we already argue: the mandatory interstitial is
not an obstacle to work around, it is **the compute window you work inside**.
Nothing is skipped or shortened; the time the user was already going to spend
looking at a required screen is the time the game becomes ready.

## What to build — and what to change in ours

Our prototype already hits the headline number (120/170 ms p50/p95 against a
7.8 s baseline, measured). What the real brief tells us to add:

1. **A prefetch-precision panel.** We do not currently report it and it is a
   named metric. Report hit rate *and* wasted bytes.
2. **Lobby-to-game transition via Speculation Rules**, as the cheap path that
   composes with the edge path — and honestly note the Safari gap.
3. **Games sampled per session** — we have no discovery metric at all, and it
   is the business case. Even a simulated before/after is better than nothing.
4. **Target the real seam.** Re-aim the client half at the
   `gamecontainer-eu.psk.hr/GameView/<Provider>` shape rather than our
   invented container.
5. **Pattern A working-set loading against Playtech's 7.8 MB**, which our recon
   proved is same-origin and therefore reachable — and which our own
   measurements showed is the binding constraint on handoff time.
6. **Defer Google Tag Manager**, 638 KB off the critical path. It needs no edge
   infrastructure and nobody's permission. Name it as the Monday fix.

---

# How the three connect

They are one product problem seen from three distances, and there is a single
thread: **the user's own context, made present at the right moment, without
pressure.**

- **C03** removes the cost of acting (the game opens instantly).
- **C01** makes the right thing to act on findable (relevance, not pressure).
- **C02** makes the moment worth acting on visible when the app is closed.

The strongest cross-challenge asset is one **session/context object** that all
three read, plus the **module boundary** that keeps the engagement surfaces
away from the wagering state. Both C01 and C02 have guardrails that are
explicitly judged, and both are satisfied by the same architectural move.

If we enter two challenges, C03 + C02 is the natural pair — we already have a
working C03 prototype, and C02 is explicitly scoped to a standalone demo app
with sample data. C01 is the most research-heavy and the least demoable in 48
hours, but it has the weakest expected competition on the guardrail, because
building a harm monitor is the obvious thing that nobody does.

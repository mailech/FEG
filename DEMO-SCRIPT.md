# D2 · Live demo — 15 minutes

Lantern · Challenge 01 · Lorven AI

**Setup before you walk in**

```bash
cd Solution/app
npm install          # already done on this machine
npm run web          # opens localhost:8081
```

Browser at ~430 px wide (phone shape). Have [IMPACT-CASE.md](IMPACT-CASE.md) open
in a second tab in case someone asks for a number mid-flow.

If Metro complains it cannot resolve a package that is plainly installed, run
`npm run web:clean` once — it caches resolution failures from mid-install.

---

## The scenario

**Marina, 34.** Opens PSK three or four evenings a week. Rarely bets. She is not
a problem to be solved — she is 42% of your sessions.

Do not narrate the architecture. Play her session and let the screens talk.

---

## 0:00 — 1:30 · The problem, in their own data

Open on **Ops**.

> "Before the product — this is your data. 4,995 sessions. 42% of them sit in one
> cohort that converts at 15%. The regulars convert at 100%. Same session volume,
> 31× the value.
>
> And 381 sessions reached the confirm screen and left. That is 22% of the
> strongest intent signal you have, lost on the last tap."

Tap the **Intuitive** cohort to expand it.

> "That's the brief's problem, sized in your numbers rather than asserted."

**Do not skip this.** It frames everything that follows as revenue, not UX.

---

## 1:30 — 4:00 · The two lobbies

Go to **Home**. Toggle **Generic lobby**.

> "This is a generic lobby. It is ordered by popularity. It looks identical to a
> first-time visitor and a ten-year specialist — that's the discovery friction in
> the brief."

Toggle **Lantern**. Let the shelf visibly re-order.

> "Same catalogue, same moment, ordered by a model trained on 285,000 events."

**Now the cross-category moment.** At the top of Home is the next race at Sinj.
Back **Bura od Dinare** — one tap.

A rail appears immediately: *"Because you backed a race."*

> "She just told us something a casino recommender can't normally hear. A race
> resolves every thirty minutes and you watch it. A turbo slot resolves every two
> seconds and you don't. That's the one axis sport and casino share — event
> frequency — and it's the axis this rail matches on. So she gets dice and table
> titles that move at her pace, not the loudest slot in the building."

Toggle back to **Generic lobby**. The rail is gone; nothing moved.

> "The generic lobby can't react to that, because it doesn't know she's here.
> Every user gets the same six titles."

Be straight about the provenance if asked — it's in the UI already: the sample
FEG provided carries three sports and no racing, so this weight is a stated
prior over the frequency axis rather than a fitted one. On their logs it's
learned exactly the way casino co-occurrence already is.

Point at the reason line under the hero card.

> "Every card carries why it's there. Not marketing copy — that sentence is
> generated from the feature that actually moved the score."

> "Replayed against held-out sessions: the title the player actually opened
> appears in the top six **19% of the time against 6% for popularity**. Three
> times more often."

---

## 4:00 — 7:00 · The Mind

Go to **Mind** *before* interacting much.

> "It says **Listening**. Four bars, near even. The model could give you a
> confident answer right now from the intercept alone — it would be
> arithmetically true and editorially dishonest. So it doesn't."

Go back to **Home**, open two or three games, spin a few times, return to **Mind**.

> "Now it has evidence."

Point at the class bars, then the contributions.

> "Those bars are coefficient times standardised value. That is not an
> explanation layered over the model — it *is* the model's arithmetic. That's why
> we ship logistic regression: we also trained gradient boosting, and it bought
> one accuracy point. We paid one point for the ability to show you this."

Point at the trace strip.

> "One bar per event. It calls the character correctly **82% of the time within
> the first 20% of a session** — early enough to change what she sees, which is
> the only kind of accuracy that matters here."

---

## 7:00 — 9:30 · Fit, and the line we did not cross

Open any game from Home.

> "Here's where a recommender in a gambling product can cheat. The obvious
> feature is 'your odds of winning'. We were asked for it. We did not build it."

Point at the fit card.

> "It's a **Fit** score — does the shape of this game match the shape of your
> session. Underneath: how often a spin pays, how wide the swings are. Both are
> measured properties of the *game*."

Scroll one card down to **Your record on games like this**, then spin a dozen
times so it fills in.

> "And this is her own record — how her spins on this provider and this mechanic
> have actually gone, against her session average. Measured, personal, past
> tense. What it never does is turn that into a forecast, because every spin is
> independent and the edge doesn't move."

Now flip the toggle to **Generic lobby** and open the same game.

> "Both cards are gone. Board, stake ladder, spin button — that's it. That's the
> product today, and that's the control arm: it doesn't know who is holding the
> phone."

Flip back to **Lantern**.

> "One thing stays on in both arms, deliberately — the risk head. You can A/B a
> recommendation. You cannot A/B a safeguard. Withholding harm detection from a
> control group to prove a conversion number would fail the guardrail and the EU
> baseline in the same move."

Read the disclaimer line out loud, verbatim:

> "*It describes the game, not you — the house edge is unchanged and no ordering
> here improves your odds.*"

> "Implying a player edge is a prohibited manipulative practice under the AI Act
> and a dark pattern under your RG rules. The model is identical either way. Only
> the framing changes — and the honest framing is the one that survives review."

---

## 9:30 — 12:00 · The guardrail is the product

Still in the game. Hit **Spin** repeatedly to build a losing run, raise the stake
part-way through, then **Deposit declined**, then **Raise my daily limit**.

Watch the state chip move calm → elevated → concern. It will turn well before you
finish the sequence — say so, because that's the point:

> "Second head, same feature vector, 0.996 AUC. It gates the first one.
>
> We had a hand-written rules engine doing this. On that exact sequence the
> trained head reaches concern about **twenty spins earlier** than the rules did.
> Twenty spins is the difference between intervening and reporting."

The named markers below are still the rules engine — kept deliberately, because
"which signals fired" is a sentence a compliance officer can read. The *state* is
the model's.

Go to **Home**.

> "The shelf is held. Volatility ceiling applied *after* ranking, so relevance
> can't trade it away inside its own objective. Offers are suppressed — not
> re-timed, suppressed."

Point at the casual game card.

> "And there's still somewhere to go that isn't a bet. Nothing is wagered here.
> Under concern it's the only thing we'll offer."

Go to **Monitor**.

> "Conversion and harm on one screen. A single-metric dashboard would read growth
> in your chaser cohort — 1,400× the value per session — as a win. This one reads
> it as a risk."

---

## 12:00 — 14:00 · Integration

Back to **Ops**, then say the numbers:

> "One JSON file, 92 KB gzipped. Inference runs on the device in about a
> millisecond. No model server, no per-request cost, no scaling curve — and the
> behavioural stream never leaves the handset, so privacy-by-design is
> architecture, not a policy page.
>
> The event schema is already yours — 24 columns, same order, same names. There
> is no mapping step. Training is a four-minute CPU notebook; point it at your
> real logs and nothing changes but the numbers."

---

## 14:00 — 15:00 · Close

> "The uplift here comes from relevance and less friction. Nothing on any screen
> creates urgency, and the sessions we are trying to grow are explicitly the
> low-risk ones.
>
> The data is synthetic — the generator plants behavioural structure and the
> model recovers it without being told. That demonstrates the mechanism. Point
> the same pipeline at your logs and you get the real magnitudes in an
> afternoon."

---

## Questions you will get

**"Isn't this circular — you planted the signal you then found?"**
Yes, and it says so in the manifest and the impact case. Synthetic data can only
demonstrate mechanism. What transfers is the pipeline: same schema, same
notebook, no code change. Section 7 of the impact case.

**"Why is median rank worse?"**
Because personalisation concentrates accuracy at the top and lets non-matching
titles sink. For a lobby that's the right trade — nobody scrolls to position 126.
recall@k and MRR are the honest metrics for this surface; we publish the median
anyway.

**"How do you know it converts?"**
We don't. Offline replay measures ranking, not causation. The impact case shows a
band across a stated pass-through assumption instead of one invented number. The
falsification test is an online A/B on top-6 launch rate, measurable in a week.

**"Risk head F1 is 0.54."**
AUC is 0.996 — the ranking is sound, the operating threshold isn't chosen yet. On
a 2.4% base rate that's expected, and picking the threshold is a policy decision
about false positives, not a modelling one. It needs real data.

**"What about a player who wants high volatility?"**
The ceiling only applies in elevated/concern. In calm we rank what suits them.
The gate is a risk response, not a permanent preference override.

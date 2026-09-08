# Challenge 01 — the solution

**Working name: Mjera.** Croatian for *measure* — both "a measurement" and
"moderation." The product is one idea in two senses: measure the thing
accurately, and you get moderation for free.

Pairs with [Ember](EMBER-PRD.md) (Challenge 03). The two are one system; see
§6.

---

## 1. The sentence everyone else will misread

> "How might we turn more sessions into **confident, informed** actions?"

Every team in that room will read *more actions*. The brief says **informed**.
It says it in the headline question, and then it says the same thing three more
ways: "without pushing anyone to do more than they want to", "uplift must come
from relevance and reduced friction, never pressure", and "uplift that survives
into D30/D90 retention."

FEG is not asking for a conversion optimiser. They are asking for something
harder: **actions the user would take again.**

That reframing is the entire product, and it is why this does not look like a
recommender with an LLM on top.

## 2. The finding this is built on

In October 2024 the Behavioural Insights Team ran a randomised controlled trial
with **over 4,000 participants** on how odds *presentation* changes betting
behaviour. Five arms: American odds, decimal (European), fractional, American +
win probability, American + loss probability.

Two results matter enormously:

1. Participants shown American odds **chose the riskier bet significantly more
   often** than every other presentation. Same bets. Same information content.
   Different format.
2. On a same-game parlay, those participants **estimated a 53% chance of
   winning a bet whose implied probability was 4%.**

A thirteen-fold misperception, produced by nothing but formatting.

3. And the fix worked: **adding the implied win probability reduced risky bet
   selection** and helped people "better calibrate their confidence and
   understand their chances."

Source: [American odds lead to riskier sports betting, BIT](https://www.bi.team/blogs/american-odds-lead-to-riskier-sports-betting/).

This is the rarest thing in this whole problem space: a large, recent,
randomised experiment showing that a *purely transparent* change — showing the
true number — measurably changes decision quality. Not a nudge. Not a dark
pattern. The opposite of both.

It sits on established theory. Prospect theory's probability weighting says
people overweight small probabilities; the
[favourite–longshot bias literature](https://www.journals.uchicago.edu/doi/abs/10.1086/655844)
(Snowberg & Wolfers, *JPE* 2010) tested whether that bias is risk-love or
misperception and concluded **misperception**. People are systematically unable
to distinguish small probabilities from tiny ones, so they price them alike.
That is exactly why accumulators feel attractive.

**PSK uses decimal odds, which the trial found safer than American — but the
mechanism is identical and untested at PSK.** Decimal odds still express
probability as a payout multiplier, which is not a probability. The open
question, which we would put to FEG, is how large the effect is on *their*
format with *their* users. That is a real experiment worth proposing.

## 3. Mechanism 1 — Doubt is not the same as deliberation

This is the core insight and the part nobody else will build.

Someone reaches the confirm button and leaves. In the analytics that is one
event: abandonment. In reality it is **two opposite things**:

| | What happened | Correct response |
|---|---|---|
| **Doubt** | "I don't understand what I'm about to do" | Resolve it. Converting this is legitimate |
| **Deliberation** | "I'm not sure I *should* do this" | Respect it. Converting this is harm |

They look identical. They are opposite. And here is the trap the guardrail is
built to catch: **some final-step drop-off is the responsible-gambling system
working correctly.** A person who hesitates and walks away has just
self-regulated. A team that "fixes" all final-step abandonment will drive
harmful-play indicators up and fail a guardrail the brief explicitly marks
*Judged*.

So the product does not maximise conversion at the final step. It **sorts**.

### How to tell them apart

Both are readable from ordinary interaction telemetry, no new instrumentation
on the user:

**Doubt signals** — the user is seeking information
- opens market rules or "how does this work"
- long dwell specifically on the *returns* figure
- scrolls back to the fixture / re-reads the selection
- toggles selections in and out
- first time using this bet type on this account

**Deliberation signals** — the user is weighing whether to act at all
- edits the stake **downward**, repeatedly
- long dwell on the *stake* field rather than the returns figure
- opens and closes the slip more than once
- checks balance mid-slip
- session is already net-down (loss-chasing context)
- extended session length, or unusual hour

Doubt gets the answer. Deliberation gets nothing at all — no prompt, no offer,
no timer, no "your bet is waiting." Silence is the feature.

**Demo moment:** show the system detecting deliberation and visibly choosing
*not* to intervene. Nobody else will show restraint on stage, and it is the
single clearest proof that the guardrail was designed in rather than bolted on.

## 4. Mechanism 2 — Personalise density, not content

The brief: "generic layouts look the same to a first-time visitor and a ten-year
specialist."

Every team will reorder tiles by behaviour. That is table stakes and the brief
practically says so.

The real difference between a novice and a specialist is not *which markets they
want*. It is **how much explanation they can tolerate and how much surface they
can absorb**.

This has a name and forty years of evidence behind it. The **expertise reversal
effect** (Kalyuga, Ayres, Chandler & Sweller) within cognitive load theory:
instructional scaffolding that measurably helps novices measurably **harms**
experts, because the expert must reconcile the redundant external explanation
against the schema already in their head, and that reconciliation costs working
memory.
([Instructional Science special issue](https://link.springer.com/article/10.1007/s11251-009-9102-0)).

Applied here:

| | Novice view | Specialist view |
|---|---|---|
| Markets shown | Few, one type at a time | Dense multi-market grid |
| Labels | Plain language | Standard abbreviations |
| Returns | Worked example | Bare number |
| Probability | Explicit, prominent | Available, compact |
| Entry | Guided | Fast / keyboard |

**Same catalogue. Same odds. Different legibility.** The metric that proves it
is `Time to First Action`, which should fall for *both* groups — for opposite
reasons. The novice gets there because there is less to parse; the specialist
gets there because we stopped explaining things they already know.

To a judge this reads as a different axis of personalisation entirely, and it is
defensible from literature rather than from taste.

## 5. Mechanism 3 — Answer the question they actually asked

Under "Where we expect innovation," their fifth bullet is:

> **Better ways to measure session quality itself**

Almost nobody will treat that as an invitation. It is the easiest differentiator
in the challenge.

### Informed Action Rate (IAR)

The share of actions where the user demonstrably had — and engaged with — the
information material to that decision:

- the calibrated probability was shown and dwelt on
- the bet type was one they have used before, or was explained
- their current session position was visible, not buried

IAR is a *quality-weighted* conversion metric. It cannot be gamed by pressure,
because pressure does not make anyone informed.

### The claim we then test

**Informed actions retain better than uninformed ones at D30.**

That is the exact thing the brief says it will judge ("uplift that survives into
D30/D90 retention"). With sample data we can only show the instrumentation and a
simulated cohort split — and we say so plainly — but proposing the measurement
is itself the contribution, because it is the measurement FEG asked for and
cannot currently make.

### The harm panel, running beside it

Literature-backed markers, computed live:
within-session repeat deposits, declined deposits, easing or removing one's own
RG limits, bonus-seeking, play at unusual hours
([Behavioural Markers of Harm](https://link.springer.com/article/10.1007/s11469-023-01060-8);
[review of operator-data tracking studies](https://pmc.ncbi.nlm.nih.gov/articles/PMC11272745/)).

The winning screenshot is one chart: **conversion and IAR rising, harm markers
flat.** Every other team will show the first line only.

## 6. How this fuses with Challenge 03

The brief frames browsing as the failure: "A large share of sessions end in
browsing."

**Our reframe: browsing is not the failure. Uninformed browsing is.**

Ember makes opening a game cost ~120 ms instead of 6–8 s. When trying something
costs nothing, *browsing becomes sampling* — the user actually plays before
committing anything. That is the most informed a decision can possibly be, and
it only becomes available once load time collapses.

So the two challenges are one causal chain:

```
Ember: instant load
   └─► exploration becomes free
        └─► sampling replaces guessing
             └─► decisions become informed        (Mjera: IAR)
                  └─► informed actions convert and retain better
```

Challenge 03's metric `Games sampled per session` is literally an *input* to
Challenge 01's `Informed Action Rate`. That is not a bolt-on narrative; the
numbers connect.

## 7. What we build for the demo

1. **Split bet slip, live.** Today's slip beside the calibrated one. Same bet,
   same odds, and the true probability made visible. Cite the 53%-vs-4% result
   while it is on screen.
2. **The classifier, visible.** A panel showing doubt vs deliberation being
   detected in real time — including a run where it detects deliberation and
   deliberately does nothing.
3. **The density switch.** One fixture, novice view and specialist view, toggled
   live. Time-to-first-action timer on both.
4. **The dashboard.** Conversion, Informed Action Rate, and harm markers on one
   chart.
5. **The fusion run.** Tap a game → 120 ms → play it → then bet. Sampling as
   informed decision, both challenges in one gesture.

## 8. The commercial tension, said out loud

Calibration will probably **reduce** longshot accumulator volume. Accumulators
are among the highest-margin products a bookmaker sells. We should say this
before a judge says it.

The counter-argument, which is theirs not ours:

- The brief's outcome is "more value per active user" and "uplift that survives
  into D30/D90" — not bet count this session.
- A bettor who loses a parlay they never understood churns. One who understood
  the odds and lost has no grievance and returns.
- The guardrail forbids uplift from pressure. Removing misperception is the only
  lever left that raises confidence without raising pressure.

We are not proposing PSK sell less. We are proposing the mix shift from bets
that produce regret to bets that produce returning customers — and we propose
the measurement that would prove it either way.

That honesty is also strategy. It is a claim no team optimising for click-through
can make, and it is the kind of thing an operator's own risk and compliance
people will recognise as real.

## 9. Open questions for FEG

1. What is the current final-step abandonment rate, and do you have any
   segmentation of *why*?
2. Decimal odds are safer than American in the BIT trial, but untested at PSK
   scale. Would you run the calibration experiment on your own users?
3. Do you already compute behavioural harm markers, and could a session-quality
   metric be scored against them jointly?
4. Is there an existing novice/expert signal in the account data, or would
   density have to be inferred purely in-session?
5. Do you allow one project to be entered against two challenges?

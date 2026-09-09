# D4 · Compliance note

Lantern · FEG Innovation Hackathon 2026 · Challenge 01 · Croatian brand (PSK) track

Mapped against *FEG Innovation Hackathon 2026 — EU & Croatia Regulatory Compliance
Guide* (4 Sept 2026). One page. Design decisions, not intentions.

---

## The one that matters most

A recommender inside a gambling product has exactly one way to cheat: make the
player believe the machine has improved their odds. We were asked for "your odds
of winning" on the game card. **We did not build it.**

The game card shows a **Fit score** — does the *shape* of this title match the
shape of your session — alongside two measured properties of the game (how often
a spin pays anything, how wide the swings are). It states, on the card:

> *"It describes the game, not you — the house edge is unchanged and no ordering
> here improves your odds."*

Implying a player edge would be a manipulative practice under the AI Act and a
dark pattern under the RG ground rules. It is also the single easiest thing for a
judge to catch. The model is identical either way; only the framing changes, and
the honest framing is the one that survives review.

---

## EU baseline

| Instrument | How the build answers it |
|---|---|
| **GDPR** Reg. (EU) 2016/679, Art. 25 | Inference runs **on the device**. The behavioural stream never leaves the handset — no profile is transmitted, stored server-side, or joined to an identity. Privacy-by-design as architecture, not policy. Feature vector is 30 behavioural terms; the session buffer is a 500-event ring, session-scoped. |
| **GDPR** minimisation | No demographic enters the ranker. Age band exists solely as a **risk** covariate (harm sensitivity), never as a relevance feature — enforced by construction: `models.features` contains no demographic term. |
| **ePrivacy** Dir. 2002/58/EC | Terminal-equipment storage is limited to the session context and the model weights shipped with the bundle. No tracking identifiers, no third-party beacons, no marketing pixels. Any push/offer path is gated (below). |
| **EU AI Act** Reg. (EU) 2024/1689 | Self-classified **limited-risk**. Not a prohibited practice: the system does not exploit vulnerability — the second head exists specifically to **detect** vulnerability and **withdraw** commercial surfaces. Transparency obligation met by design: every recommendation carries a reason, and the Mind screen exposes the model's own per-feature contributions (coefficient × standardised value), not a post-hoc narrative. Note the Digital Omnibus (in force 27 Jul 2026) defers high-risk timelines; re-check before production. |
| **DSA** Reg. (EU) 2022/2065 | Recommender-system transparency: the main parameter of the ranking is stated to the user in plain language on each card, and the full parameter set is inspectable in-product. Croatia has adopted its DSA implementing act. |
| **eIDAS 2.0** Reg. 910/2014 / 2024/1183 | Registration and identity verification are out of scope for this challenge. Where age is needed, the design assumes an **attribute-based** proof ("over 18") in the EUDI Wallet pattern rather than document sharing. |
| **AMLD / AMLR** 2015/849 · 2024/1624 | Out of scope — no onboarding, no payments, no source-of-funds. Deposit events in the prototype are simulated markers, not transactions. |
| **Accessibility** Dir. 2019/882 · WCAG 2.1 AA | Dark-surface palette with contrast-checked ink tokens, ≥11 px type, tap targets ≥44 px, `accessibilityLabel` on every tab and control, no colour-only state encoding (risk state carries text and shape as well as hue). Partial — see gaps. |
| **Data rule** | Synthetic throughout. 834 pseudonymous ids (64-hex, hashed), zero real players, no production feed. The manifest records the seed so the dataset is reproducible and auditable. |

---

## Croatian national layer (binding, not soft law)

| Requirement | How the build answers it |
|---|---|
| **Act on Games of Chance** + Regulation on Measures for Socially Responsible Organisation — requires age/ID verification **and a check against the register of excluded players before play is allowed** | Self-exclusion is modelled as a **register check**, not a UI checkbox: `policy.decide()` takes an `rg` state that hard-gates every commercial surface before any shelf is composed. A self-excluded state cannot be overridden by relevance, and no code path re-enables offers for it. |
| Age gating at every entry point | 18+ gate applies at product entry, not only at registration. |
| **AZOP** / Act on Implementation of the GDPR | On-device processing means there is no new controller-side profiling dataset to register or DPIA in the first place. |

---

## Responsible gambling, as built

- **No dark patterns.** No countdown timers, no fake scarcity, no "N players are
  betting now", no loss-framed re-engagement, no forced continuity. The feed is
  finite and ends — it does not scroll forever.
- **No inducements to at-risk or excluded players.** `shouldSend()` gates every
  trigger class against risk state and RG flags. Under `concern`, commercial
  surfaces are withheld; what remains on offer is a **non-wagering** casual game —
  somewhere to go that is not a bet.
- **The gate runs the other way round from the usual.** Volatility ceilings and
  jackpot suppression are applied *after* ranking, so relevance cannot trade them
  away inside its own objective.
- **Limits are never nudged looser.** A limit-loosening action is treated as a
  risk marker, not a conversion.
- **Two-sided success metric.** Session conversion up *and* harmful-play
  indicators flat or down, on the same screen (Monitor, Ops). A single-metric
  dashboard would read growth in the escalated-chaser cohort — 1,400× the value
  per session — as a win. Ours reports it as a risk.

---

## Gaps, stated

Required before anything here processes real data or goes live:

1. **FEG Legal & Compliance review.** This note is a build map, not legal advice.
2. **DPIA** if the on-device design is ever relaxed to server-side profiling. As
   built, the trigger is not met; that is a property worth preserving.
3. **Risk-head threshold calibration** against a real cost matrix. Held-out AUC is
   0.996 but F1 is 0.541 on a 2.4% base rate — the ranking is sound, the
   operating point is not yet chosen, and choosing it is a policy decision about
   false positives, not a modelling one.
4. **Full WCAG 2.1 AA audit** including screen-reader traversal and keyboard-only
   navigation. Current state is designed-for, not audited.
5. **Register integration** for self-exclusion — the prototype models the check;
   production must perform it.
6. Croatian transpositions for ePrivacy, eIDAS and the AI Act were not confirmed
   in FEG's source guide; the EU instrument is treated as the floor.

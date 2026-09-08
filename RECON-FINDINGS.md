# PSK recon — measured findings

Everything here was measured against the live site on 2026-09-08 with
[scripts/recon-psk.mjs](scripts/recon-psk.mjs) and
[scripts/recon-game.mjs](scripts/recon-game.mjs). Read-only: public pages and
`/demo` mode only, no login, no real-money path. Raw evidence in
[recon/](recon/).

This file exists because section 1 of the PRD was written from inference and
**got the central technical claim wrong**. Corrections are marked.

---

## 1. The game launch chain

There are two different architectures in production, not one.

### Pattern A — provider client hosted on a PSK origin

Playtech GPAS. The launcher **redirects** and the provider's own client becomes
the top-level document:

```
casino.psk.hr/play/gpas_gstorm2_pop/demo
  └─► gpas-games2.psk.hr/gpasclient.html?game=gpas_gstorm2_pop     7815 KB
```

No nesting. The entire 7.8 MB game is served from `gpas-games2.psk.hr`, which
is a PSK origin.

### Pattern B — cross-origin provider frame, wrapped in two PSK frames

Fazi, Spribe, and (by inspection of the same container endpoint) the rest:

```
casino.psk.hr/play/<code>/demo
  └─ gamelauncher-uu-pop2.psk.hr/launcher?game=<code>&casino=pskeur.hr   255 KB
       └─ gamecontainer-eu.psk.hr/GameView/<Provider>?gameName=…&real=0   90 KB
            └─ <provider domain>                              cross-origin
```

Observed provider domains:

| Provider | Innermost frame |
|---|---|
| Fazi | `pskfegpskhr2eur.fazi.rs/Content/webjs/slots/WildSunburst/` |
| Spribe | `aviator-demo.spribegaming.com` |

Note the container endpoint is **generic per provider** —
`/GameView/Fazi`, `/GameView/Spribe` — and carries `real=0|1`. This is FEG's
own abstraction layer over every provider they integrate.

## 2. Correction to the PRD

> **PRD section 1 claimed:** "Games from 30+ providers are almost certainly
> loaded in cross origin iframes from provider domains… a Service Worker
> registered on a PSK origin cannot intercept requests made by a cross origin
> provider iframe. Half the standard web performance playbook is unavailable to
> FEG by construction."

**That is half right, and stating it as written would damage us.** The people
who built `gpas-games2.psk.hr` will be in the room.

| Claim | Verdict |
|---|---|
| Casino is a separate origin from sport | **Confirmed** — `casino.psk.hr` vs `www.psk.hr` |
| All provider games are cross-origin | **False.** Playtech's 7.8 MB — the heaviest bundle measured — is same-origin on `gpas-games2.psk.hr` |
| Service workers cannot reach game code | **False for Pattern A, true for Pattern B** |
| Casino frontend is Astro | **False.** The *sport* site is Astro (7 `astro-island` elements). The casino is not |

The honest version is stronger, because it is specific: **the technique has to
be chosen per provider, and we can say which provider gets which.**

## 3. Where the 6–8 seconds actually goes

Measured in `/demo` mode on a throttled-free connection, so these are *floor*
numbers — a real phone on 4G is worse.

| Milestone | Time |
|---|---|
| PSK launcher frame attaches | 2.3 – 4.1 s |
| Provider game frame attaches | 7.1 – 8.8 s |

Per-title: Play'n GO 7057 ms · Fazi 8392 ms · Spribe Aviator 8849 ms.

**This reproduces the brief's 6–8 s against production.** We are not taking
their word for the number; we measured it.

### The payload before the game

Every launch pays this before a single game byte arrives, and **all of it is
same-origin PSK code**:

| Source | Bytes | What it is |
|---|---|---|
| `casino.psk.hr` | ~1000 KB | lobby shell |
| `www.googletagmanager.com` | **638 KB** | analytics, in the critical path |
| `gamelauncher-uu-pop2.psk.hr` | 255 KB | FEG launcher |
| `gamecontainer-eu.psk.hr` | 90 KB | FEG per-provider container |
| `smart.psk.hr` | 57 KB | — |

≈ **2 MB of non-game payload per launch**, none of it certified, none of it
requiring a provider conversation to change. 638 KB of that is Google Tag
Manager loading ahead of the game.

## 4. What this means for Ember

The core claim survives and gets sharper. The edge path was justified by "the
bundle is unreachable"; the real justification is better:

**Pattern B titles (Fazi, Spribe, most of the catalogue).** The provider frame
is genuinely cross-origin. No service worker, no working-set loading, no
bundle-level trick can touch it. **The edge path is the only thing that works**,
exactly as argued — now with a measured example rather than an assumption.

**Pattern A titles (Playtech GPAS, 7.8 MB).** Same-origin, so *both* paths are
available. This is where working-set loading is genuinely implementable, and
it is also the heaviest bundle we found — the best possible target for it.

**The injection point already exists.** `gamecontainer-eu.psk.hr/GameView/<Provider>`
is FEG's own code, same-origin, on the path of every single launch, and it
already knows the provider and the real/demo mode. Ember's client half belongs
there. That means:

- no certified bundle is modified
- no provider integration is renegotiated
- no re-certification is triggered

We are changing the behaviour of a container FEG wrote and controls. That is a
far easier ask than anything the PRD previously implied, and it should be said
plainly on stage.

**The 2 MB of pre-game overhead is a second, independent win** that needs no
edge infrastructure at all — deferring GTM alone is 638 KB off the critical
path of every launch.

## 5. Useful specifics

- `/demo` mode works **without login** — a legitimate, credential-free
  benchmark target. `/real` redirects to login; `/fun` 404s.
- Game code format: `pop_<hash>_<provider>feg` (e.g. `pop_b52bdfa0_fazfeg`)
  and `gpas_<name>_pop` for Playtech. The `feg` suffix confirms these are
  FEG-group-wide integrations, not PSK-only.
- Game metadata comes from `feg-casino-portal-api.psk.hr` — provider ids,
  slugs, and `gameCodes` per title. The lobby pulls 2560 KB of tile imagery
  from it.
- Deep links use the `ftnvegashr://` scheme via `applink.casino.psk.hr`,
  shared across FEG brands — relevant to the Challenge 02 watch-to-game tap.
- Lobby load: 336 requests / 4167 KB, ~11.4 s to network idle.

## 6. Questions this sharpens for FEG

Replacing the vaguer versions in PRD section 9:

1. `gamecontainer-eu.psk.hr/GameView/<Provider>` — is that layer yours to
   change freely, and does changing it trigger any re-certification?
2. Which providers follow Pattern A (client hosted on a PSK origin) versus
   Pattern B (cross-origin frame)? We measured four; you have thirty-plus.
3. Is `gpas-games2.psk.hr` a proxy of Playtech's origin, or do you host those
   assets? That determines whether working-set loading is available to you
   unilaterally.
4. What is the measured split of the 6–8 s across launcher, container, and
   provider frame? We see the provider frame attach at 7–9 s, but not what it
   spends before first interactive frame.
5. Can Google Tag Manager be moved off the launch critical path, and who owns
   that decision?

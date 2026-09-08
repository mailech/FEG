# Ember

Instant play through transient edge execution and recovery-based handoff.

FEG Innovation Hackathon 2026 · Challenge 03 · Lorven AI
Product spec and pitch plan: [EMBER-PRD.md](EMBER-PRD.md)

---

## The claim, in one paragraph

A certified casino game takes 6–8 seconds to become playable, and not one byte
of the bundle may be changed. Ember hands the player a game that is **already
running** — a pre-warmed browser context at the edge, streamed to the phone in
about 120 ms — and then, at the first moment no money is in flight, quietly
migrates the session onto the device using the crash-recovery call that every
GLI-19 certified game already ships. The edge instance is occupied for seconds,
not for the session, and is then returned to the pool.

## Measured results

Five consecutive runs on this rig. `node scripts/bench.js 5`.

| Metric | PRD target | Measured |
|---|---|---|
| Time to first interactive frame, p50 / p95 | < 500 ms | **120 / 170 ms** |
| Baseline for the same bundle, p50 / p95 | — | 7820 / 7850 ms |
| Time to local takeover | < 8 s p95 | **7.9 s — marginal, see below** |
| Handoff success rate | > 95 % | **100 % (5/5)** |
| Quiescence-gate violations | 0 | **0** |
| Warm context claim, p50 / p95 | < 300 ms | **36 / 40 ms** |
| Edge instance seconds per launch | < 8 s | **7.85 s — marginal** |

Speedup on time-to-interactive: **~61x**. Integration suite: 15/15 passing
(`node scripts/test-handoff.js`).

### What those numbers are measured against

The stand-in game is a few KB of canvas JS, so quoting a speedup against it
would be meaningless. Every path — baseline, edge, and on-device — loads an
identical **12 MB incompressible ballast payload** plus a **1200 ms simulated
engine init**, and the origin paces that download to a stated **15 Mbps** link.
Those parameters are served from `/config` so the three paths cannot drift
apart. Measured: 12 MB at 15 Mbps takes 6.72 s against a theoretical 6.55 s,
so the pacer is accurate to ~2.6 %. Baseline therefore lands at 7.8 s, which
reproduces the 6–8 s the challenge brief describes.

The edge warms itself with throttling disabled. That is deliberate and stated
on stage: a PoP sits beside the origin on a datacentre link, while the phone is
the thing on a mobile connection. Modelling both at the phone's speed would be
the inaccurate choice, not the conservative one.

### Capacity

`node scripts/capacity.js` derives this from measured occupancy rather than
asserting it:

| Scenario | Occupancy | Concurrent instances for 10,000 players |
|---|---|---|
| Measured on this rig | 7.9 s | 1,309 |
| If working-set loading lands | 3.0 s | 500 |
| Cloud gaming | whole session | 10,000 |

**Note a correction to the PRD.** Section 7 claims ~800 concurrent instances
from ~5 s occupancy. We measure 7.85 s, which gives ~1,309. Quote the measured
number. The ratio against cloud gaming is 7.6x, not 12x.

### The finding that matters most

**Time to local takeover is bounded below by the device's own download time.**
We measure 7.9 s, and that is almost exactly 6.7 s of download plus 1.2 s of
init. The arbiter adds ~200 ms on top. Nothing in the edge path is the
constraint — claiming a warm context costs 36 ms.

Two consequences, and both belong on stage:

1. **Entry speed is independent of bundle size. Handoff time is not.** The
   120 ms figure holds no matter how big the title is, because the player is
   watching a context that was warmed in advance. But a real 30 MB title would
   push time-to-local to roughly 16 s at 15 Mbps, and edge occupancy with it.
2. **So working-set loading is not an optional extra, it is the thing that
   makes the cost model work at real bundle sizes.** Workstream B in the PRD is
   what turns 7.9 s of occupancy into ~3 s. Cutting it would leave the demo
   intact and the economics weak — the opposite of how the fallback ladder
   currently ranks it.

This is also why the 8 s targets are met only marginally at 12 MB and would be
missed at 30 MB. Say that before a judge finds it.

## Running it

Requires Node 20+ and Chrome installed. No Docker needed for the dev rig.

```bash
npm install
npm run dev                      # rgs :4001, web :4000, edge :4002
# open http://localhost:4000 and press "Tap both"
```

```bash
node scripts/test-handoff.js     # safety-rule integration tests
node scripts/bench.js 5          # end-to-end timing, drives the real client
node scripts/capacity.js         # cost model from measured occupancy
```

Tuning knobs (env): `POOL_SIZE`, `PAYLOAD_MB`, `INIT_DELAY_MS`, `JPEG_QUALITY`.
Client query params: `?payload=`, `?initDelay=`, `?kbps=`.

On a machine without Chrome: `npx playwright install chromium`.

## How it works

```
tap
 │
 ├─► edge: claim a pre-warmed browser context ......... 37 ms
 │     └─ CDP screencast → WebSocket → <img>            120 ms to first frame
 │        pointer events ride the same socket back
 │
 ├─► device: start pulling the same bundle in a hidden frame,
 │     park it at "warm" WITHOUT creating a session
 │
 └─► arbiter: poll RGS round state
       └─ when (no round open) AND (device parked):
            "handoff:go" → device calls the RGS recovery endpoint
            → device confirms → THEN release the edge context
```

| Path | What it is |
|---|---|
| [services/rgs/](services/rgs/) | Mock remote game server. Sole authority for outcomes; owns the recovery call; round state doubles as the quiescence signal |
| [services/edge/pool.js](services/edge/pool.js) | Warm browser-context pool. Contexts, not processes |
| [services/edge/arbiter.js](services/edge/arbiter.js) | Decides the single moment of migration |
| [services/edge/index.js](services/edge/index.js) | CDP screencast transport + input forwarding |
| [services/web/](services/web/) | Static hosting, ballast endpoint, telemetry, `/metrics` |
| [game/](game/) | Stand-in "certified" bundle. Treated as unmodifiable — same bytes run in all three places |
| [client/](client/) | Side-by-side demo rig with live dashboard |

### The two rules the arbiter enforces

Both are covered by tests in `scripts/test-handoff.js`.

**Rule 1 — only at quiescence.** Never switch with a round open. Quiescence is
read from the RGS, never from inside the game bundle, so the arbiter needs no
privileged access to certified code.

**Rule 2 — never tear down first.** The edge context stays alive until the
device confirms a successful recovery. Flip "break recovery" in the demo UI and
the handoff aborts, the player keeps playing on the stream, the balance is
intact, and betting still works. That is the deliberate failure run in the
demo script.

## Honest limits

Say these before a judge asks.

- **The game is served from our own origin.** In production it depends on the
  provider — see [RECON-FINDINGS.md](RECON-FINDINGS.md). Fazi and Spribe nest a
  genuinely cross-origin frame that no service worker can reach; Playtech's
  7.8 MB client is served from `gpas-games2.psk.hr`, a PSK origin, and is
  reachable. We serve the stand-in locally because otherwise we could not
  instrument it at all. That is a limitation of the rig, not a claim about
  production.
- **The stand-in is not a real certified title.** The ballast models payload
  weight, not real engine behaviour, shader compilation, or asset decode.
- **Transport is MJPEG-shaped**, via CDP screencast over a WebSocket. It works
  and it demos. WebRTC is the production answer and touches only
  [services/edge/index.js](services/edge/index.js).
- **No network between edge and client.** Everything is on localhost, so
  measured TTI excludes real edge RTT. Above ~50 ms RTT instant entry degrades;
  that is why the local path exists.
- **No auditor sign-off.** The architecture is designed to be defensible — the
  RGS keeps sole outcome authority and the bundle is unmodified — but we are
  not claiming anyone has approved it.
- **The presence layer (Challenge 02) is not built.** It is iOS/watchOS Swift
  and cannot be built on this machine. Workstream C in the PRD is unstarted.

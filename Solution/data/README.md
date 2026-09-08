# Solution/data

Where the logs live.

## Captured from the running app

Interactions are written to **`localStorage`** under `lantern.logs.v1`, in the
browser, on the machine you are demoing from. They survive a reload. Nothing
crosses the network.

To get them out: **Monitor tab → Export CSV**. The file lands in your browser's
downloads folder. `Clear` wipes both the in-memory set and the stored copy.

If the browser blocks site data (private window, storage disabled), the app
falls back to memory only and the Monitor panel says so — export before
reloading.

This is the right shape for a demo and the wrong shape for a training set. A
few minutes of clicking produces a few hundred rows.

## Generated to disk

```bash
node Solution/scripts/make-synthetic.mjs            # 5,000 sessions
node Solution/scripts/make-synthetic.mjs 50000      # 50,000 sessions
node Solution/scripts/make-synthetic.mjs 50000 4242 # …with a fixed seed
```

Writes here:

| File | What |
|---|---|
| `synthetic_event_logs.csv` | The rows. 5,000 sessions ≈ 280k rows ≈ 70 MB. |
| `synthetic_manifest.json` | Seed, archetype mix, corpus sizes, and the caveats. |

Both are gitignored — a 70 MB CSV does not belong in the repo, and the seed in
the manifest reproduces it exactly.

## The schema

Identical to `top_casino_users_event_logs.csv`: same 24 columns, same order,
same `null` convention. Verified — the header line is byte-for-byte the same, so
the two files concatenate directly.

```bash
# real events + synthetic, one training set
cat top_casino_users_event_logs.csv > train.csv
tail -n +2 Solution/data/synthetic_event_logs.csv >> train.csv
```

Two things to know before training:

**Filter the prefix.** Events named `lantern_*` have no FEG-native equivalent —
`lantern_spin`, `lantern_deposit`, `lantern_rg_change` and so on. Drop them to
train on FEG events only; keep them if you want the richer behavioural signal
the real export does not carry.

**Two columns are labels, not features.** `from_origin` holds the planted
session archetype and `from_route` holds the risk state at that instant. They
are what a model trains *against*. Leaving them in the feature set leaks the
answer.

## What the synthetic data is and is not

Four planted archetypes — browser, casual returner, specialist, chaser. The
planting is the point: because the generator knows which archetype produced each
session, *"the model recovers the planted structure"* is a claim you can check.

*"The model is accurate on real players"* is not a claim this data supports, and
saying it on stage would be the kind of thing a judge with a compliance
background catches. The sportsbook legs abandon at 21.6% because that is the
rate measured in the real logs; the rest of the distribution is constructed.

"""
Lantern — behavioural models for FEG Challenge 01.
Paste this whole file into ONE Kaggle cell and run. CPU only, ~3-5 minutes.

Input : synthetic_event_logs.csv  (uploaded as a Kaggle dataset)
Output: /kaggle/working/models.json   -> bundle into the app (src/data/models.json)
        /kaggle/working/cohorts.json  -> management dashboard
        /kaggle/working/players.json  -> management dashboard
        /kaggle/working/eval.json     -> the numbers for the impact case (D3)

Five models, all trained on prefixes of a session so they work LIVE, updating
as the player acts rather than only at session end:
  1 archetype head      4-class   softmax  -> "predicted character"
  2 risk head           binary    logistic -> replaces the hardcoded BIAS
  3 game fit            per-game stat table + fit scorer
  4 conversion head     binary    logistic -> final-step assist
  5 cohorts             KMeans               -> management dashboard

Logistic/softmax is deliberate, not a shortcut: the weights are a matrix, so
inference is ~20 lines of JS on the device, and per-feature contributions come
out for free -- which is what makes the explainer page honest. LightGBM is
trained alongside ONLY to report the accuracy ceiling in the impact case.
"""

import os, re, json, glob, math, warnings
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
RNG = np.random.default_rng(20260908)
OUT = "/kaggle/working" if os.path.isdir("/kaggle/working") else "."

# ----------------------------------------------------------------- load
def find_csv():
    for pat in ("/kaggle/input/**/*event_logs*.csv", "/kaggle/input/**/*.csv",
                "**/*event_logs*.csv", "*.csv"):
        hits = glob.glob(pat, recursive=True)
        if hits:
            return max(hits, key=os.path.getsize)     # biggest = the full log
    raise SystemExit("No CSV found. Add your dataset via '+ Add Input'.")

CSV = find_csv()
print("reading", CSV)
df = pd.read_csv(CSV, low_memory=False)
df = df[df["event_name"] != "event_name"]              # stray header rows
df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)
df = df.dropna(subset=["timestamp"]).sort_values(["session", "timestamp"])
print(f"{len(df):,} rows | {df.session.nunique():,} sessions | {df.PlayerID.nunique():,} players")

# spin outcomes live in `status` as "stake=61;payout=131"
def kv(s, key):
    if not isinstance(s, str):
        return np.nan
    m = re.search(rf"{key}=(-?\d+(?:\.\d+)?)", s)
    return float(m.group(1)) if m else np.nan

df["stake"]  = df["status"].map(lambda s: kv(s, "stake"))
df["payout"] = df["status"].map(lambda s: kv(s, "payout"))

ARCHETYPES = ["browser", "returner", "specialist", "chaser"]
RISK_STATES = ["calm", "elevated", "concern"]

# session-level truth, planted by the generator
lab = (df[df.from_origin.isin(ARCHETYPES)]
       .groupby("session")["from_origin"]
       .agg(lambda s: s.value_counts().idxmax()))
print("\narchetypes:", lab.value_counts().to_dict())
print("risk states:", df[df.from_route.isin(RISK_STATES)].from_route.value_counts().to_dict())

# ------------------------------------------------------- feature spec
# Order is load-bearing: it is exported to models.json and the app rebuilds
# the vector in exactly this order from its Session Context Object.
FEATURES = [
    "log_minutes", "log_events", "log_spins", "distinct_games", "log_launches",
    "launches_per_min", "log_mean_stake", "stake_cv", "stake_slope",
    "stake_up_after_loss", "max_loss_run", "loss_run_now", "net_per_stake",
    "turbo", "deposits", "deposits_per_hour", "log_mean_dwell_s", "dwell_cv",
    "log_median_gap_s", "gap_cv", "searches", "slip_adds", "slip_abandon_rate",
    "rg_changes", "switches_after_loss", "hour_sin", "hour_cos", "late_night",
    "games_per_launch", "spins_per_launch",
]

def _cv(a):
    a = np.asarray(a, dtype=float)
    if a.size < 2:
        return 0.0
    m = a.mean()
    return float(a.std() / m) if m > 1e-9 else 0.0

def _slope(a):
    """Normalised trend of the stake trace: >0 means the player is climbing."""
    a = np.asarray(a, dtype=float)
    if a.size < 3:
        return 0.0
    x = np.arange(a.size, dtype=float)
    m = a.mean()
    if m <= 1e-9:
        return 0.0
    b = np.polyfit(x, a, 1)[0]
    return float(np.clip(b * a.size / m, -5, 5))

def featurise(s, k):
    """Features from the first k events of one session. k=len(s) is session end."""
    ev     = s["event"][:k]
    t      = s["t"][:k]
    game   = s["game"][:k]
    stake  = s["stake"][:k]
    payout = s["payout"][:k]

    n = k
    minutes = max((t[-1] - t[0]) / 60.0, 1 / 60.0) if n > 1 else 1 / 60.0

    is_spin   = ev == "lantern_spin"
    is_launch = ev == "casino_game_launch"
    is_close  = ev == "lantern_game_close"

    spins    = int(is_spin.sum())
    launches = int(is_launch.sum())
    games    = pd.unique(game[is_launch])
    distinct = int(len([g for g in games if isinstance(g, str) and g != "null"]))

    st = stake[is_spin]
    st = st[~np.isnan(st)]
    po = payout[is_spin]
    po = po[~np.isnan(po)]
    won = po > 0 if po.size else np.zeros(0, dtype=bool)

    # consecutive losses: longest run, and the run standing right now
    max_run = run = 0
    for w in won:
        run = 0 if w else run + 1
        max_run = max(max_run, run)
    loss_now = run

    # does the stake go UP after a loss? the chaser signature
    up_after_loss = 0.0
    if st.size > 1 and won.size == st.size:
        d = np.diff(st)
        after_loss = ~won[:-1]
        if after_loss.any() and st.mean() > 1e-9:
            up_after_loss = float(np.clip(d[after_loss].mean() / st.mean(), -3, 3))

    staked = float(st.sum())
    net = float(po.sum() - staked)

    # dwell per game, from launch/close pairs
    dwells = []
    open_at = {}
    for i in range(n):
        g = game[i]
        if not isinstance(g, str):
            continue
        if is_launch[i]:
            open_at[g] = t[i]
        elif is_close[i] and g in open_at:
            dwells.append(t[i] - open_at.pop(g))
    dwells = np.array(dwells, dtype=float) if dwells else np.zeros(0)

    # gaps between deliberate actions only -- passive views say nothing
    act = t[ev != "screen_view"]
    gaps = np.diff(act) if act.size > 1 else np.zeros(0)
    gaps = gaps[(gaps > 0) & (gaps < 300)]

    reach = int((ev == "lantern_confirm_reach").sum())
    aband = int((ev == "lantern_confirm_abandon").sum())
    deps  = int((ev == "lantern_deposit").sum())

    # a switch that follows losing, not any switch
    switches = 0
    run2 = 0
    for i in range(n):
        if is_spin[i]:
            p = payout[i]
            run2 = 0 if (not np.isnan(p) and p > 0) else run2 + 1
        elif is_launch[i] and run2 >= 3:
            switches += 1

    hour = pd.Timestamp(t[0], unit="s", tz="UTC").hour

    return [
        math.log1p(minutes),
        math.log1p(n),
        math.log1p(spins),
        float(distinct),
        math.log1p(launches),
        launches / minutes,
        math.log1p(float(st.mean()) if st.size else 0.0),
        _cv(st),
        _slope(st),
        up_after_loss,
        float(max_run),
        float(loss_now),
        float(np.clip(net / staked, -1, 5)) if staked > 1e-9 else 0.0,
        float((ev == "lantern_turbo").sum() > 0),
        float(deps),
        deps / (minutes / 60.0),
        math.log1p(float(dwells.mean()) if dwells.size else 0.0),
        _cv(dwells),
        math.log1p(float(np.median(gaps)) if gaps.size else 0.0),
        _cv(gaps),
        float((ev == "lantern_search").sum()),
        float((ev == "betslip_add_bet").sum()),
        (aband / reach) if reach else 0.0,
        float((ev == "lantern_rg_change").sum()),
        float(switches),
        math.sin(2 * math.pi * hour / 24),
        math.cos(2 * math.pi * hour / 24),
        float(hour >= 23 or hour < 5),
        (distinct / launches) if launches else 0.0,
        (spins / launches) if launches else 0.0,
    ]

# --------------------------------------------------- build the dataset
print("\nbuilding prefix dataset ...")
sessions, X, y_arch, y_risk, y_conv, sess_id, frac = [], [], [], [], [], [], []

placed = df[df.event_name == "betslip_placed_bet"].session.unique()
spin_ct = df[df.event_name == "lantern_spin"].groupby("session").size()

for sid, g in df.groupby("session", sort=False):
    if sid not in lab.index or len(g) < 6:
        continue
    s = {
        "event":  g.event_name.to_numpy(),
        "t":      (g.timestamp.astype("int64") // 10**9).to_numpy().astype(float),
        "game":   g.game_name.to_numpy(),
        "stake":  g.stake.to_numpy(dtype=float),
        "payout": g.payout.to_numpy(dtype=float),
        "route":  g.from_route.to_numpy(),
    }
    n = len(g)
    converted = int((sid in placed) or (spin_ct.get(sid, 0) >= 10))
    sessions.append((sid, s, lab[sid], converted, n))

    cuts = sorted({5, *[max(4, int(n * f)) for f in (0.15, 0.3, 0.5, 0.75, 1.0)]})
    for k in cuts:
        if k < 4 or k > n:
            continue
        X.append(featurise(s, k))
        y_arch.append(ARCHETYPES.index(lab[sid]))
        r = s["route"][k - 1]
        y_risk.append(int(r in ("elevated", "concern")))
        y_conv.append(converted)
        sess_id.append(sid)
        frac.append(k / n)

X       = np.array(X, dtype=float)
y_arch  = np.array(y_arch)
y_risk  = np.array(y_risk)
y_conv  = np.array(y_conv)
sess_id = np.array(sess_id)
frac    = np.array(frac)
X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)

print(f"{X.shape[0]:,} prefix samples x {X.shape[1]} features from {len(sessions):,} sessions")
print(f"base rates -> risk {y_risk.mean():.3f} | conversion {y_conv.mean():.3f}")

# split by SESSION, never by row -- otherwise prefixes of one session leak
uniq = np.array(sorted(set(sess_id)))
RNG.shuffle(uniq)
test_ids = set(uniq[: int(len(uniq) * 0.2)])
te = np.array([s in test_ids for s in sess_id])
tr = ~te
print(f"train {tr.sum():,} | test {te.sum():,} (split on sessions, no prefix leakage)")

# ------------------------------------------------------------- train
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (accuracy_score, roc_auc_score, f1_score,
                             confusion_matrix, average_precision_score)
from sklearn.cluster import KMeans

scaler = StandardScaler().fit(X[tr])
Xs = scaler.transform(X)

def fit_binary(y, name):
    m = LogisticRegression(max_iter=2000, class_weight="balanced", C=0.5)
    m.fit(Xs[tr], y[tr])
    p = m.predict_proba(Xs[te])[:, 1]
    auc = roc_auc_score(y[te], p)
    ap  = average_precision_score(y[te], p)
    f1  = f1_score(y[te], (p > 0.5).astype(int))
    print(f"  {name:<12} AUC {auc:.3f}  AP {ap:.3f}  F1 {f1:.3f}")
    return m, {"auc": round(float(auc), 4), "ap": round(float(ap), 4),
               "f1": round(float(f1), 4), "base_rate": round(float(y.mean()), 4)}

print("\ntraining heads:")
arch = LogisticRegression(max_iter=3000, C=0.5)   # lbfgs => multinomial by default
arch.fit(Xs[tr], y_arch[tr])
pa = arch.predict(Xs[te])
arch_acc = accuracy_score(y_arch[te], pa)
arch_f1  = f1_score(y_arch[te], pa, average="macro")
print(f"  {'archetype':<12} ACC {arch_acc:.3f}  macro-F1 {arch_f1:.3f}")

risk_m, risk_ev = fit_binary(y_risk, "risk")
conv_m, conv_ev = fit_binary(y_conv, "conversion")

# how confident is the archetype head after only N events? -> the explainer page
early = {}
for lo, hi, name in [(0, .2, "first 20%"), (.2, .5, "20-50%"), (.5, 1.01, "50-100%")]:
    m = te & (frac >= lo) & (frac < hi)
    if m.sum() > 20:
        early[name] = round(float(accuracy_score(y_arch[m], arch.predict(Xs[m]))), 4)
print("  archetype accuracy by session progress:", early)

# ------------------------------------- accuracy ceiling (reported, not shipped)
ceiling = {}
try:
    from lightgbm import LGBMClassifier
    for nm, yy in [("archetype", y_arch), ("risk", y_risk), ("conversion", y_conv)]:
        gb = LGBMClassifier(n_estimators=300, learning_rate=.06, num_leaves=31, verbose=-1)
        gb.fit(X[tr], yy[tr])
        if nm == "archetype":
            ceiling[nm] = round(float(accuracy_score(yy[te], gb.predict(X[te]))), 4)
        else:
            ceiling[nm] = round(float(roc_auc_score(yy[te], gb.predict_proba(X[te])[:, 1])), 4)
    print("\nLightGBM ceiling (not shipped, quoted in the impact case):", ceiling)
except Exception as e:
    print("\nlightgbm unavailable, skipping ceiling:", e)

# ------------------------------------------------ model 3: game fit table
print("\nbuilding game table ...")
launch = df[df.event_name == "casino_game_launch"].copy()
spin   = df[df.event_name == "lantern_spin"].copy()
sess_arch = lab.to_dict()
launch["arch"] = launch.session.map(sess_arch)

glob_mix = launch.arch.value_counts(normalize=True).reindex(ARCHETYPES).fillna(0)
g_launch = launch.groupby("game_name")
g_spin   = spin.groupby("game_name")

meta = pd.DataFrame({"launches": g_launch.size()})
meta["sessions"] = g_launch.session.nunique()
meta["provider"] = g_launch.provider.agg(lambda s: s.mode().iat[0] if len(s.mode()) else "null")
meta["jackpot"]  = g_launch.jackpot.agg(lambda s: str(s.mode().iat[0]).lower() == "true" if len(s.mode()) else False)

mix = (launch.pivot_table(index="game_name", columns="arch", aggfunc="size", fill_value=0)
             .reindex(columns=ARCHETYPES, fill_value=0))
# affinity = lift over the population mix, so a game is "for chasers" only if
# chasers pick it MORE than they pick everything else
aff = (mix.div(mix.sum(axis=1).replace(0, 1), axis=0) + 1e-6) / (glob_mix.values + 1e-6)
aff = np.log(aff).clip(-2, 2)

sp = pd.DataFrame({
    "spins":    g_spin.size(),
    "staked":   g_spin.stake.sum(),
    "returned": g_spin.payout.sum(),
    "hits":     g_spin.payout.apply(lambda s: float((s > 0).mean())),
})
sp["rtp"] = (sp.returned / sp.staked.replace(0, np.nan)).clip(0, 3)
mult = spin.assign(m=(spin.payout / spin.stake.replace(0, np.nan)))
sp["vol"] = mult.groupby("game_name").m.std().clip(0, 20)

meta = meta.join(sp, how="left").join(aff.add_prefix("aff_"), how="left").fillna(0)
meta["spins_per_launch"] = meta.spins / meta.launches.replace(0, 1)
POP_MAX = float(np.log1p(meta.launches.max()))
print(f"  {len(meta):,} games | median RTP {meta[meta.spins>50].rtp.median():.3f}")

# ------------------------------- model 3b: the learned ranker (drives D3)
print("\ntraining ranker ...")
prov = meta.provider.to_dict()
jack = meta.jackpot.to_dict()
popn = {g: math.log1p(v) / POP_MAX for g, v in meta.launches.items()}
affd = {g: aff.loc[g].to_numpy() for g in aff.index}
ALL  = meta.sort_values("launches", ascending=False).index.to_numpy()
POOL = ALL[:800]                                   # realistic candidate slate
P_at = {g: i for i, g in enumerate(POOL)}

# "players who opened this also opened that", from TRAIN sessions only.
# The single strongest personalisation signal, and the one a generic lobby
# structurally cannot use: it needs to know what YOU opened five minutes ago.
C = np.zeros((len(POOL), len(POOL)), dtype=np.float32)
for sid, s, a, conv, n in sessions:
    if sid in test_ids:
        continue
    idx = list({P_at[g] for e, g in zip(s["event"], s["game"])
                if e == "casino_game_launch" and isinstance(g, str) and g in P_at})
    for i in idx:
        for j in idx:
            if i != j:
                C[i, j] += 1.0
occ = C.sum(axis=1, keepdims=True)
C = C / np.maximum(occ, 1.0)                       # P(j | i), row-normalised
C = np.log1p(C / max(C.mean(), 1e-9)).clip(0, 6)   # lift over the average pair
print(f"  co-occurrence: {int((C > 0).sum()):,} game pairs seen together")

def cooc_score(cand_i, prior_idx):
    return float(C[prior_idx, cand_i].max()) if prior_idx else 0.0

def rank_feats(g, ai, seen, seen_prov, nprev, prior_idx):
    a = affd.get(g, np.zeros(4))
    return [popn.get(g, 0.0), float(a[ai]), float(g in seen),
            (seen_prov.get(prov.get(g, "null"), 0) / nprev) if nprev else 0.0,
            float(jack.get(g, False)),
            cooc_score(P_at[g], prior_idx) if g in P_at else 0.0, 1.0]

RX, RY, rank_sess = [], [], []
for sid, s, a, conv, n in sessions:
    ai = ARCHETYPES.index(a)
    seq = [g for e, g in zip(s["event"], s["game"])
           if e == "casino_game_launch" and isinstance(g, str) and g in popn]
    seen, seen_prov, prior_idx = set(), {}, []
    for i, g in enumerate(seq):
        if i > 0:
            negs = RNG.choice(POOL, 16, replace=False)
            for cand, y in [(g, 1)] + [(c, 0) for c in negs if c != g]:
                RX.append(rank_feats(cand, ai, seen, seen_prov, i, prior_idx))
                RY.append(y)
                rank_sess.append(sid)
        seen.add(g)
        if g in P_at:
            prior_idx.append(P_at[g])
        seen_prov[prov.get(g, "null")] = seen_prov.get(prov.get(g, "null"), 0) + 1

RX, RY, rank_sess = np.array(RX), np.array(RY), np.array(rank_sess)
rtr = np.array([s not in test_ids for s in rank_sess])
ranker = LogisticRegression(max_iter=2000, class_weight="balanced")
ranker.fit(RX[rtr][:, :-1], RY[rtr])
print(f"  {len(RX):,} pairs | AUC {roc_auc_score(RY[~rtr], ranker.decision_function(RX[~rtr][:, :-1])):.3f}")

# ------------------------------- model 6: outcome head (win probability)
#
# The honest version of "what are my chances on this game".
#
# For every (session, title) pair with enough play to be meaningful, the label
# is simply: did that stretch of play end net positive? That is an observable
# fact in the log, not an opinion, so it can be fitted like anything else.
#
# What it is NOT is an edge. Every title here has a house edge and this model
# does not move it. What the head actually learns is the shape of variance —
# hit frequency, volatility, and above all how long you play. The dominant
# coefficient comes out negative on spin count, which is the mathematically
# correct and uncomfortable finding: the longer you sit on any title, the lower
# your probability of walking away ahead. Surfacing that honestly is protective,
# which is why this head is safe to show and a "you will win" score is not.
print("\nfitting outcome head ...")

pairs = spin.groupby(["session", "game_name"]).agg(
    n=("stake", "size"), staked=("stake", "sum"), returned=("payout", "sum")
).reset_index()
pairs = pairs[pairs.n >= 5]
pairs["won"] = (pairs.returned > pairs.staked).astype(int)
pairs["arch"] = pairs.session.map(sess_arch)
pairs = pairs[pairs.arch.notna()]

gstat = meta[["launches", "hits", "vol", "spins_per_launch", "jackpot"]]
pairs = pairs.join(gstat, on="game_name", how="inner").fillna(0)

WIN_FEATURES = [
    "g_pop", "g_hit", "g_vol", "g_spl", "g_jackpot",
    "log_spins_here", "log_stake_here",
    "is_browser", "is_returner", "is_specialist", "is_chaser",
]

WX = np.column_stack([
    np.log1p(pairs.launches.to_numpy()) / POP_MAX,
    pairs.hits.to_numpy(),
    np.clip(pairs.vol.to_numpy(), 0, 20) / 20.0,
    np.clip(pairs.spins_per_launch.to_numpy(), 0, 200) / 200.0,
    pairs.jackpot.to_numpy().astype(float),
    np.log1p(pairs.n.to_numpy()),
    np.log1p(pairs.staked.to_numpy() / np.maximum(pairs.n.to_numpy(), 1)),
    *[(pairs.arch.to_numpy() == a).astype(float) for a in ARCHETYPES],
])
WY = pairs.won.to_numpy()

wtr = np.array([sid not in test_ids for sid in pairs.session])
wsc = StandardScaler().fit(WX[wtr])
WXs = wsc.transform(WX)

win = LogisticRegression(max_iter=2000, C=0.5)
win.fit(WXs[wtr], WY[wtr])
wp = win.predict_proba(WXs[~wtr])[:, 1]
win_auc = roc_auc_score(WY[~wtr], wp)
print(f"  {len(pairs):,} (session,title) pairs | base rate {WY.mean():.3f} | held-out AUC {win_auc:.3f}")

# Calibration, because a probability that is not calibrated is a number, not a
# probability. Ten bins, predicted against observed.
bins = np.clip((wp * 10).astype(int), 0, 9)
calib = []
for bidx in range(10):
    m = bins == bidx
    if m.sum() >= 10:
        calib.append({"bin": bidx / 10, "predicted": round(float(wp[m].mean()), 4),
                      "observed": round(float(WY[~wtr][m].mean()), 4), "n": int(m.sum())})
print("  calibration:", " ".join(f"{c['predicted']:.2f}->{c['observed']:.2f}" for c in calib))

# The single most important thing this head has to say, stated as a number.
spins_coef = float(win.coef_[0][WIN_FEATURES.index("log_spins_here")])
print(f"  coefficient on spins played: {spins_coef:+.3f}  "
      f"({'longer play lowers it' if spins_coef < 0 else 'CHECK: positive'})")

# ------------------------------------------------------------------------
# D3: offline replay. For every held-out launch, where did the game the player
# ACTUALLY chose sit in a generic popularity lobby, versus in Lantern's?
# This is the data-backed link to the outcome -- no simulation, no assumption
# about behaviour, just re-ranking history.
# ------------------------------------------------------------------------
print("\nreplaying held-out sessions ...")
# every provider in the catalogue, not just the ones inside the candidate pool --
# the replay walks games the player actually launched, pool member or not
provs = sorted({str(v) for v in prov.values()} | {"null"})
pidx  = {p: i for i, p in enumerate(provs)}
prov_of = lambda g: pidx.get(str(prov.get(g, "null")), pidx["null"])
P_pop  = np.array([popn.get(g, 0.0) for g in POOL])
P_aff  = np.array([affd.get(g, np.zeros(4)) for g in POOL])
P_jack = np.array([float(jack.get(g, False)) for g in POOL])
P_prov = np.array([prov_of(g) for g in POOL])
W = ranker.coef_[0]

def ranks_for(order, target):
    return int(np.where(order == target)[0][0]) + 1

res = {"generic": [], "lantern": []}
for sid, s, a, conv, n in sessions:
    if sid not in test_ids:
        continue
    ai = ARCHETYPES.index(a)
    seq = [g for e, g in zip(s["event"], s["game"])
           if e == "casino_game_launch" and isinstance(g, str) and g in popn]
    seen_vec = np.zeros(len(POOL))
    pshare   = np.zeros(len(provs))
    prior_idx, nprev = [], 0
    for i, g in enumerate(seq):
        if i > 0 and g in P_at:
            share = (pshare / nprev)[P_prov] if nprev else np.zeros(len(POOL))
            cv = C[prior_idx].max(axis=0) if prior_idx else np.zeros(len(POOL))
            score = (W[0] * P_pop + W[1] * P_aff[:, ai] + W[2] * seen_vec
                     + W[3] * share + W[4] * P_jack + W[5] * cv)
            res["lantern"].append(ranks_for(np.argsort(-score), P_at[g]))
            res["generic"].append(ranks_for(np.argsort(-P_pop), P_at[g]))
        if g in P_at:
            seen_vec[P_at[g]] = 1.0
            prior_idx.append(P_at[g])
        pshare[prov_of(g)] += 1
        nprev += 1

replay = {}
for k, v in res.items():
    v = np.array(v, dtype=float)
    replay[k] = {
        "n": int(v.size),
        "recall_at_6":  round(float((v <= 6).mean()), 4),
        "recall_at_12": round(float((v <= 12).mean()), 4),
        "recall_at_24": round(float((v <= 24).mean()), 4),
        "mrr":          round(float((1 / v).mean()), 4),
        "median_rank":  float(np.median(v)),
    }
lift6  = replay["lantern"]["recall_at_6"] / max(replay["generic"]["recall_at_6"], 1e-9) - 1
liftm  = replay["lantern"]["mrr"] / max(replay["generic"]["mrr"], 1e-9) - 1
replay["uplift"] = {"recall_at_6": round(float(lift6), 4), "mrr": round(float(liftm), 4)}
for k in ("generic", "lantern"):
    r = replay[k]
    print(f"  {k:<8} recall@6 {r['recall_at_6']:.3f}  @12 {r['recall_at_12']:.3f}  "
          f"@24 {r['recall_at_24']:.3f}  MRR {r['mrr']:.3f}  median rank {r['median_rank']:.0f}")
print(f"  uplift   recall@6 {lift6:+.1%}  MRR {liftm:+.1%}")

# funnel truth, straight from the log -- the denominator for the impact case
reach   = int((df.event_name == "lantern_confirm_reach").sum())
done    = int((df.event_name == "betslip_placed_bet").sum())
abandon = int((df.event_name == "lantern_confirm_abandon").sum())
funnel = {
    "sessions": int(len(sessions)),
    "session_conversion": round(float(np.mean([c for _, _, _, c, _ in sessions])), 4),
    "confirm_reached": reach, "confirm_completed": done, "confirm_abandoned": abandon,
    "final_step_conversion": round(done / max(reach, 1), 4),
}
print("  funnel:", funnel)

# ------------------------------------------------- model 5: cohorts
print("\nclustering ...")
end = np.array([featurise(s, n) for _, s, _, _, n in sessions])
end = np.nan_to_num(end, nan=0.0, posinf=0.0, neginf=0.0)
Es  = scaler.transform(end)
K = 5
km = KMeans(n_clusters=K, n_init=10, random_state=7).fit(Es)
cl = km.labels_

cohorts = []
NAMES = {}
for k in range(K):
    m = cl == k
    sub = [sessions[i] for i in np.where(m)[0]]
    amix = pd.Series([a for _, _, a, _, _ in sub]).value_counts(normalize=True)
    stake_i, spins_i, conv_i, mins_i = FEATURES.index("log_mean_stake"), FEATURES.index("log_spins"), None, FEATURES.index("log_minutes")
    prisk = risk_m.predict_proba(Es[m])[:, 1].mean()
    cohorts.append({
        "id": k,
        "size": int(m.sum()),
        "share": round(float(m.mean()), 4),
        "archetype_mix": {a: round(float(amix.get(a, 0)), 3) for a in ARCHETYPES},
        "dominant": str(amix.idxmax()),
        "conversion": round(float(np.mean([c for _, _, _, c, _ in sub])), 4),
        "mean_minutes": round(float(np.expm1(end[m, mins_i]).mean()), 1),
        "mean_spins": round(float(np.expm1(end[m, spins_i]).mean()), 1),
        "mean_stake": round(float(np.expm1(end[m, stake_i]).mean()), 1),
        "risk_rate": round(float(prisk), 4),
        "value_per_session": round(float(np.expm1(end[m, spins_i]).mean() * np.expm1(end[m, stake_i]).mean() / 100), 2),
    })
for co in sorted(cohorts, key=lambda c: -c["size"]):
    print(f"  cohort {co['id']}  {co['share']:.0%}  {co['dominant']:<11} "
          f"conv {co['conversion']:.2f}  risk {co['risk_rate']:.2f}  VPS {co['value_per_session']}")

# ------------------------------------------- players, for the ops dashboard
pl = df.groupby("PlayerID").agg(sessions=("session", "nunique"),
                                events=("event_name", "size"),
                                staked=("stake", "sum"),
                                returned=("payout", "sum"),
                                last=("timestamp", "max"))
sess_player = df.groupby("session").PlayerID.first()
parch = (pd.Series({sid: a for sid, _, a, _, _ in sessions})
           .rename("a").to_frame().join(sess_player.rename("p"))
           .groupby("p").a.agg(lambda s: s.value_counts().idxmax()))
pconv = (pd.Series({sid: c for sid, _, _, c, _ in sessions})
           .rename("c").to_frame().join(sess_player.rename("p")).groupby("p").c.mean())
pl["archetype"] = parch
pl["conversion"] = pconv
pl = pl.dropna(subset=["archetype"])
players = [{"id": str(i)[:12], "sessions": int(r.sessions), "events": int(r.events),
            "staked": round(float(r.staked) / 100, 2), "net": round(float(r.returned - r.staked) / 100, 2),
            "archetype": r.archetype, "conversion": round(float(r.conversion), 3),
            "last": str(r.last)[:10]}
           for i, r in pl.sort_values("events", ascending=False).head(400).iterrows()]
print(f"  {len(pl):,} players aggregated, exporting top {len(players)}")

# --------------------------------------------------------------- export
r4 = lambda a: [round(float(x), 5) for x in np.asarray(a).ravel()]

# top-12 neighbours per game: the co-occurrence matrix, sparsified to something
# small enough to ship to a phone
NEIGHBOURS = {}
for i, g in enumerate(POOL):
    top = np.argsort(-C[i])[:12]
    top = [j for j in top if C[i, j] > 0]
    if top:
        NEIGHBOURS[str(g)] = [[str(POOL[j]), round(float(C[i, j]), 3)] for j in top]

TOP = meta.sort_values("launches", ascending=False).head(1200)
games = [{
    "n": str(g),
    "p": str(r.provider),
    "j": bool(r.jackpot),
    "l": int(r.launches),
    "rtp": round(float(r.rtp), 4),
    "hit": round(float(r.hits), 4),
    "vol": round(float(r.vol), 3),
    "spl": round(float(r.spins_per_launch), 2),
    "aff": [round(float(r[f"aff_{a}"]), 3) for a in ARCHETYPES],
} for g, r in TOP.iterrows()]

# how the four learned archetypes are spoken about in the UI
CHARACTER = {
    "browser":    {"label": "Intuitive",    "blurb": "Follows curiosity. Opens a lot, commits to little."},
    "returner":   {"label": "Steady",       "blurb": "Short, regular visits. Knows what they came for."},
    "specialist": {"label": "Conservative", "blurb": "One or two titles, even stakes, finishes what they start."},
    "chaser":     {"label": "Aggressive",   "blurb": "Stake climbs after losses. The state the gate is built for."},
}

models = {
    "meta": {
        "trained_on": os.path.basename(CSV),
        "rows": int(len(df)), "sessions": int(len(sessions)),
        "players": int(df.PlayerID.nunique()),
        "prefix_samples": int(X.shape[0]),
        "note": "Synthetic data. Demonstrates the mechanism; not evidence about real players.",
    },
    "features": FEATURES,
    "scaler": {"mean": r4(scaler.mean_), "scale": r4(scaler.scale_)},
    "archetype": {
        "classes": ARCHETYPES,
        "character": CHARACTER,
        "coef": [r4(row) for row in arch.coef_],
        "intercept": r4(arch.intercept_),
        "accuracy": round(float(arch_acc), 4),
        "macro_f1": round(float(arch_f1), 4),
        "accuracy_by_progress": early,
    },
    "risk": {
        "coef": r4(risk_m.coef_), "intercept": r4(risk_m.intercept_)[0],
        # calm below .35, elevated to .65, concern above -- with hysteresis in-app
        "thresholds": {"elevated": 0.35, "concern": 0.65}, **risk_ev,
    },
    "conversion": {"coef": r4(conv_m.coef_), "intercept": r4(conv_m.intercept_)[0], **conv_ev},
    "ranker": {
        "features": ["popularity", "archetype_affinity", "already_seen",
                     "provider_share", "jackpot", "cooccurrence"],
        "neighbours": NEIGHBOURS,
        "coef": r4(ranker.coef_), "intercept": r4(ranker.intercept_)[0],
        "pop_max": round(POP_MAX, 5),
    },
    "outcome": {
        "features": WIN_FEATURES,
        "scaler": {"mean": r4(wsc.mean_), "scale": r4(wsc.scale_)},
        "coef": r4(win.coef_), "intercept": r4(win.intercept_)[0],
        "auc": round(float(win_auc), 4),
        "base_rate": round(float(WY.mean()), 4),
        "pairs": int(len(pairs)),
        "calibration": calib,
        "spins_coefficient": round(spins_coef, 4),
        "note": "P(this stretch of play ends net positive). Reflects variance and session length, not an edge. The house edge is unchanged.",
    },
    "cohorts": {"k": K, "centroids": [r4(c) for c in km.cluster_centers_], "profiles": cohorts},
    "games": games,
    "eval": {"replay": replay, "funnel": funnel, "ceiling": ceiling},
}

def dump(name, obj):
    p = os.path.join(OUT, name)
    with open(p, "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    print(f"  {name:<16} {os.path.getsize(p)/1024:8.1f} KB")

# ---------------------------------------------------------- training slice
# A stratified sample of the *standardised* prefix vectors with their labels,
# shipped so the product can rerun the same fit in a browser, live, in front of
# an audience. It is the real training data, not a mock: the same rows, the same
# scaler, the same targets. The full run stays on Kaggle; this slice exists so
# the convergence can be watched rather than asserted.
SLICE_N = 1500
rng_slice = np.random.default_rng(7)
idx_tr = np.where(tr)[0]
take = []
for cls in range(len(ARCHETYPES)):
    pool = idx_tr[y_arch[idx_tr] == cls]
    if len(pool):
        take.append(rng_slice.choice(pool, min(len(pool), SLICE_N // len(ARCHETYPES)), replace=False))
take = np.concatenate(take)
rng_slice.shuffle(take)

idx_te = np.where(te)[0]
hold = rng_slice.choice(idx_te, min(len(idx_te), 400), replace=False)

slice_obj = {
    "features": FEATURES,
    "classes": ARCHETYPES,
    "note": "Standardised prefix vectors from the training split. Same rows the shipped weights were fitted on.",
    "train": {
        "x": [[round(float(v), 3) for v in Xs[i]] for i in take],
        "y": [int(y_arch[i]) for i in take],
        "risk": [int(y_risk[i]) for i in take],
    },
    "test": {
        "x": [[round(float(v), 3) for v in Xs[i]] for i in hold],
        "y": [int(y_arch[i]) for i in hold],
        "risk": [int(y_risk[i]) for i in hold],
    },
    "reference": {
        "archetype_accuracy": round(float(arch_acc), 4),
        "coef": [r4(row) for row in arch.coef_],
        "intercept": r4(arch.intercept_),
    },
}

print("\nwriting:")
dump("models.json", models)
dump("cohorts.json", {"cohorts": cohorts, "archetypes": ARCHETYPES, "character": CHARACTER})
dump("players.json", {"players": players, "total": int(len(pl))})
dump("train_slice.json", slice_obj)
dump("eval.json", {"replay": replay, "funnel": funnel, "ceiling": ceiling,
                   "heads": {"archetype": {"accuracy": round(float(arch_acc), 4),
                                           "macro_f1": round(float(arch_f1), 4),
                                           "by_progress": early},
                             "risk": risk_ev, "conversion": conv_ev}})

print("\ndone. download models.json + cohorts.json + players.json + eval.json")
print("from the Kaggle Output panel on the right.")

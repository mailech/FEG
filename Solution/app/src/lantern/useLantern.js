/**
 * The one place the pipeline is wired together.
 *
 *   event → SCO → features → { relevance, risk } → policy → surfaces
 *
 * Every screen reads this and none of them decides anything themselves. That
 * mirrors the architecture: the policy engine is the only decision point.
 */

import React, { createContext, useContext, useMemo, useReducer, useCallback, useEffect, useRef } from 'react';
import { createSCO, apply, emptyPrior, sessionMinutes, archetype as archetypeOf } from './sco';
import { evaluate, withHysteresis } from './risk';
import { recommend, baseline, BY_ID } from './relevance';
import { decide } from './policy';
import { predict } from './model';
import { publish } from './feed';
import { loadProfile, handleFor } from './identity';
import { toRow, pseudoId, PLATFORM, loadRows, saveRows, clearRows as clearStored } from './logger';

const Ctx = createContext(null);

const PLAYER_ID = pseudoId('lantern-demo-player');

const initial = () => ({
  sco: createSCO({
    ...emptyPrior,
    providerAffinity: { Amusnet: 4, 'EGT Digital': 3 },
    mechanicAffinity: { 'classic-fruit': 5, 'link-jackpot': 3 },
    dayStreak: 3,
    cancelledWithdrawal: false,
  }),
  state: 'calm',
  balanceCents: 12_500,
  market: 'hr',
  arm: 'lantern',      // 'lantern' | 'baseline' — the A/B for the demo
  rg: { selfExcluded: false },
  slip: [],
  log: [],
  rows: loadRows(),  // FEG-schema rows, rehydrated from storage
  route: 'home',
});

function reducer(st, action) {
  switch (action.type) {
    case 'event': {
      const sco = apply(st.sco, action.ev);

      // The displayed state comes from the TRAINED head; the hand-written marker
      // rules stay on as the human-readable "which signals fired".
      //
      // They disagreed, and not subtly: on a losing run with the stake climbing,
      // the trained head reaches `concern` around twenty spins before the rules
      // engine leaves `calm`. Two risk readings on two screens is how a demo
      // loses its credibility, and of the two the learned one both fires earlier
      // and is the one we can evidence (held-out AUC 0.996).
      const trained = predict(sco).risk;
      const state = withHysteresis(st.state, trained.state, trained.p);
      const log = [...st.log, { ...action.ev, at: action.ev.at ?? Date.now() }].slice(-200);

      // Same event, written in FEG's schema so the export concatenates onto
      // their real file without a mapping step.
      const row = toRow(action.ev, {
        sessionId: sco.sessionId,
        playerId: PLAYER_ID,
        route: st.route,
        riskState: state,
        archetype: archetypeOf(sco),
        platform: PLATFORM,
      });
      const rows = [...(st.rows || []), row].slice(-20000);
      let balanceCents = st.balanceCents;
      if (action.ev.t === 'spin') balanceCents += (action.ev.payout || 0) - action.ev.stake;
      if (action.ev.t === 'deposit' && !action.ev.declined) balanceCents += action.ev.amount;
      return { ...st, sco, state, log, rows, balanceCents };
    }
    case 'slipAdd':
      return { ...st, slip: [...st.slip, action.sel] };
    case 'slipRemove':
      return { ...st, slip: st.slip.filter((x) => x.id !== action.id) };
    case 'slipClear':
      return { ...st, slip: [] };
    case 'setArm':
      return { ...st, arm: action.arm };
    case 'setMarket':
      return { ...st, market: action.market };
    case 'setAge':
      return { ...st, sco: { ...st.sco, prior: { ...st.sco.prior, ageBand: action.band } } };
    // Self-exclusion set from the profile. It hard-gates every commercial
    // surface through policy.decide(), so it belongs in the reducer rather than
    // in a screen's local state.
    case 'setRg':
      return { ...st, rg: { ...st.rg, ...action.rg } };

    case 'setRoute':
      return st.route === action.route ? st : { ...st, route: action.route };
    case 'addRows':
      return { ...st, rows: [...(st.rows || []), ...action.rows].slice(-60000) };
    case 'clearRows':
      clearStored();
      return { ...st, rows: [] };
    case 'reset':
      return { ...initial(), rows: st.rows };   // keep the captured log across resets
    default:
      return st;
  }
}

export function LanternProvider({ children }) {
  const [st, dispatch] = useReducer(reducer, undefined, initial);

  // Persist on a debounce. Writing the whole log on every event would make the
  // app crawl once the set is large.
  const rowsRef = useRef(st.rows);
  rowsRef.current = st.rows;
  useEffect(() => {
    const id = setTimeout(() => saveRows(rowsRef.current), 800);
    return () => clearTimeout(id);
  }, [st.rows]);

  const emit = useCallback((ev) => dispatch({ type: 'event', ev }), []);

  // Every trained head, refreshed on each event. Linear models are cheap enough
  // that this can sit in the render path; that is why they were chosen.
  const pred = useMemo(() => predict(st.sco), [st.sco]);

  // `evaluate` still supplies `fired` — the named markers the Monitor lists.
  // Score and state come from the trained head so nothing contradicts anything.
  const markers = useMemo(() => evaluate(st.sco), [st.sco]);
  const riskShown = useMemo(
    () => ({ ...markers, state: st.state, score: pred.risk.p, markerScore: markers.score }),
    [markers, st.state, pred.risk.p]
  );

  const policy = useMemo(
    () => decide({ sco: st.sco, risk: riskShown, rg: st.rg, market: st.market }),
    [st.sco, riskShown, st.rg, st.market]
  );

  // The A/B. Baseline is popularity order — what a generic feed does today.
  // Length is fixed and finite on purpose: the feed ends (see FeedScreen).
  const FEED_LEN = 16;
  const shelf = useMemo(() => {
    if (st.arm === 'baseline') return baseline(FEED_LEN);
    return recommend(st.sco, policy.constraint, FEED_LEN, pred.archetype.index);
  }, [st.sco, policy.constraint, st.arm, pred.archetype.index]);

  /**
   * Stream the model's read to the relay so the dashboards can show it live.
   *
   * Guarded on `events.length` for a reason: the dashboard pages mount this same
   * provider, and an idle session publishing zeroes would put a ghost row on the
   * feed. Only a session that has actually done something is worth relaying.
   */
  /**
   * Stream the model's read to the relay so the dashboards can show it live.
   *
   * Guarded on `events.length` because the dashboard pages mount this same
   * provider, and an idle session publishing zeroes would put a ghost row on
   * the feed.
   */
  const snapshot = useCallback(() => {
    if (!st.sco.events.length) return null;
    const last = st.sco.events[st.sco.events.length - 1];

    // The brief names six metrics. Two of them cannot be read off the SCO
    // directly, so they are derived here: an "action" is any deliberate
    // interaction that is not a passive view, and time-to-first-action is
    // measured from session start to the first of them.
    const acted = st.sco.events.filter((e) => e.t !== 'view');
    const firstAction = acted[0];
    const who = loadProfile();

    return {
      sessionId: st.sco.sessionId,
      name: who?.name || null,
      handle: who ? handleFor(who) : null,
      contactable: !!who?.contactable,
      arm: st.arm,
      route: st.route,
      character: {
        key: pred.archetype.key,
        label: pred.archetype.label,
        confidence: pred.archetype.confidence,
        probs: pred.archetype.probs,
        why: pred.archetype.why.slice(0, 3).map((w) => w.label),
      },
      risk: { p: pred.risk.p, state: st.state },
      conversion: pred.conversion.p,
      cohort: { id: pred.cohort.id, dominant: pred.cohort.dominant },
      counters: {
        events: st.sco.events.length,
        spins: st.sco.spins,
        launches: st.sco.seq.length,
        distinct: new Set(st.sco.seq).size,
        minutes: sessionMinutes(st.sco),
        stakedCents: st.sco.staked,
        netCents: st.sco.netCents,
        slipAdds: st.sco.slipAdds,
        reachedConfirm: st.sco.reachedConfirm,
        completedConfirm: st.sco.completedConfirm,
        searches: st.sco.searches,
        actions: acted.length,
        ttfaMs: firstAction ? Math.max(0, (firstAction.at ?? st.sco.startedAt) - st.sco.startedAt) : null,
      },
      last: { t: last.t, gameId: last.gameId ?? null, at: last.at ?? Date.now() },
    };
  }, [st.sco, st.arm, st.route, st.state, pred]);

  useEffect(() => {
    const snap = snapshot();
    if (snap) publish(snap);
  }, [snapshot]);

  /**
   * Presence heartbeat.
   *
   * Publishing only on events made "online" mean "tapped something in the last
   * ninety seconds". Someone signed in and reading the screen dropped off the
   * other player's list, which is why the notification tray kept coming up
   * empty. Republishing the same snapshot on a timer keeps presence honest
   * without inventing activity: the counters do not move, only `at` does.
   */
  useEffect(() => {
    const id = setInterval(() => {
      const snap = snapshot();
      if (snap) publish(snap);
    }, 25000);
    return () => clearInterval(id);
  }, [snapshot]);

  const value = useMemo(
    () => ({
      ...st,
      emit,
      dispatch,
      risk: riskShown,
      pred,
      policy,
      shelf,
      minutes: sessionMinutes(st.sco),
      byId: BY_ID,
    }),
    [st, emit, riskShown, pred, policy, shelf]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLantern() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLantern must be used inside <LanternProvider>');
  return v;
}

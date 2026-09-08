/**
 * The one place the pipeline is wired together.
 *
 *   event → SCO → features → { relevance, risk } → policy → surfaces
 *
 * Every screen reads this and none of them decides anything themselves. That
 * mirrors the architecture: the policy engine is the only decision point.
 */

import React, { createContext, useContext, useMemo, useReducer, useCallback } from 'react';
import { createSCO, apply, emptyPrior, sessionMinutes } from './sco';
import { evaluate, withHysteresis } from './risk';
import { recommend, baseline, BY_ID } from './relevance';
import { decide } from './policy';

const Ctx = createContext(null);

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
});

function reducer(st, action) {
  switch (action.type) {
    case 'event': {
      const sco = apply(st.sco, action.ev);
      const risk = evaluate(sco);
      const state = withHysteresis(st.state, risk.state, risk.score);
      const log = [...st.log, { ...action.ev, at: action.ev.at ?? Date.now() }].slice(-200);
      let balanceCents = st.balanceCents;
      if (action.ev.t === 'spin') balanceCents += (action.ev.payout || 0) - action.ev.stake;
      if (action.ev.t === 'deposit' && !action.ev.declined) balanceCents += action.ev.amount;
      return { ...st, sco, state, log, balanceCents };
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
    case 'reset':
      return initial();
    default:
      return st;
  }
}

export function LanternProvider({ children }) {
  const [st, dispatch] = useReducer(reducer, undefined, initial);

  const emit = useCallback((ev) => dispatch({ type: 'event', ev }), []);

  const risk = useMemo(() => evaluate(st.sco), [st.sco]);
  const riskShown = useMemo(() => ({ ...risk, state: st.state }), [risk, st.state]);

  const policy = useMemo(
    () => decide({ sco: st.sco, risk: riskShown, rg: st.rg, market: st.market }),
    [st.sco, riskShown, st.rg, st.market]
  );

  // The A/B. Baseline is popularity order — what a generic feed does today.
  // Length is fixed and finite on purpose: the feed ends (see FeedScreen).
  const FEED_LEN = 16;
  const shelf = useMemo(() => {
    if (st.arm === 'baseline') return baseline(FEED_LEN);
    return recommend(st.sco, policy.constraint, FEED_LEN);
  }, [st.sco, policy.constraint, st.arm]);

  const value = useMemo(
    () => ({
      ...st,
      emit,
      dispatch,
      risk: riskShown,
      policy,
      shelf,
      minutes: sessionMinutes(st.sco),
      byId: BY_ID,
    }),
    [st, emit, riskShown, policy, shelf]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLantern() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLantern must be used inside <LanternProvider>');
  return v;
}

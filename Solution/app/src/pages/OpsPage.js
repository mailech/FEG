/**
 * /ops — the operator dashboard.
 *
 * The in-app Ops tab answers "who is here". This answers the question after it:
 * *what should we build for them*.
 *
 * The concept briefs are derived, not written. For each cohort we take the
 * titles its dominant archetype over-indexes on — `aff` in models.json is a log
 * lift over the population mix, so a positive value means this archetype picks
 * that title more than it picks everything else — join them to the catalogue for
 * mechanic and volatility, and report what that set actually looks like. If the
 * data changes, the brief changes. Nothing here is a product opinion typed into
 * a component.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { CHARACTER, CLASSES, GAME_STATS, META, EVAL } from '../lantern/model';
import { catalog } from '../lantern/relevance';
import cohortData from '../data/cohorts.json';
import playerData from '../data/players.json';
import { subscribe, relayBase } from '../lantern/feed';
import {
  ChartFrame, ValueQuadrant, RecallCurve, WinDecay, Waterfall, AffinityHeat, KpiRings, BeforeAfter,
} from './Charts';
import { c, sp, type, radius } from '../theme';

const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
const COHORTS = [...cohortData.cohorts].sort((a, b) => b.share - a.share);
const BY_NAME = new Map(catalog.map((g) => [g.name, g]));

/** What this archetype demonstrably reaches for, from the affinity table. */
function profileFor(archetypeKey) {
  const i = CLASSES.indexOf(archetypeKey);
  if (i < 0) return null;

  const liked = [...GAME_STATS.values()]
    .filter((g) => g.l >= 8 && g.aff[i] > 0.15)
    .sort((a, b) => b.aff[i] - a.aff[i])
    .slice(0, 80)
    .map((g) => ({ stat: g, meta: BY_NAME.get(g.n) }))
    .filter((x) => x.meta);

  if (!liked.length) return null;

  const mech = {};
  let vol = 0;
  let jack = 0;
  let hit = 0;
  let hitN = 0;
  for (const { stat, meta } of liked) {
    mech[meta.mechanic] = (mech[meta.mechanic] || 0) + 1;
    vol += meta.volatility ?? 3;
    if (stat.j) jack++;
    if (stat.spl > 0) { hit += stat.hit; hitN++; }
  }
  const ranked = Object.entries(mech).sort((a, b) => b[1] - a[1]);
  return {
    n: liked.length,
    mechanics: ranked.slice(0, 3),
    volatility: vol / liked.length,
    jackpotShare: jack / liked.length,
    hitRate: hitN ? hit / hitN : null,
    examples: liked.slice(0, 4).map((x) => x.stat.n),
  };
}

const VOL_BAND = (v) => (v < 2.4 ? 'low' : v < 3.6 ? 'medium' : 'high');

/**
 * KMeans splits some archetypes across more than one cohort — two "Steady"
 * clusters that differ by session shape, not by taste. Labelling both of them
 * "Steady" makes the dashboard look like it is repeating itself, so peers are
 * separated by the stat that actually distinguishes them.
 */
function nameFor(co, all) {
  const base = CHARACTER[co.dominant]?.label || co.dominant;
  const peers = all.filter((x) => x.dominant === co.dominant);
  if (peers.length < 2) return { name: base, qualifier: null };

  const byMinutes = [...peers].sort((a, b) => a.mean_minutes - b.mean_minutes);
  const rank = byMinutes.findIndex((x) => x.id === co.id);
  const qualifier =
    rank === 0 ? 'shorter sessions'
    : rank === byMinutes.length - 1 ? 'longer sessions'
    : 'mid-length sessions';
  return { name: base, qualifier };
}

/**
 * Live sessions, straight off the relay.
 *
 * This is the panel that makes the argument in a demo: the phone is in someone's
 * hand and the character, the risk head and the counters move on the projector
 * as they play. Everything else on this page is history.
 */
/** One streamed session, rendered in full. Every field on the wire appears here. */
function LiveSession({ r }) {
  const [raw, setRaw] = useState(false);
  const cn = r.counters || {};
  const net = cn.netCents ?? 0;

  return (
    <View style={[s.card, { borderColor: r.arm === 'lantern' ? c.relevance : c.rule }]}>
      <View style={s.liveHead}>
        <View style={{ flex: 1 }}>
          <Text style={s.briefName}>{r.character?.label || '—'}</Text>
          <Text style={s.small}>
            <Text style={s.mono}>{r.sessionId}</Text> · arm{' '}
            <Text style={{ color: r.arm === 'lantern' ? c.relevance : c.inkSoft, fontWeight: '800' }}>
              {r.arm === 'lantern' ? 'Lantern' : 'Generic'}
            </Text>{' '}
            · on <Text style={s.mono}>{r.route}</Text> · cohort #{r.cohort?.id} ({r.cohort?.dominant})
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: sp(1) }}>
          <View style={[s.state, { borderColor: c[r.risk?.state] || c.rule }]}>
            <Text style={[s.stateText, { color: c[r.risk?.state] || c.ink }]}>
              {(r.risk?.state || 'calm').toUpperCase()} {((r.risk?.p ?? 0) * 100).toFixed(1)}%
            </Text>
          </View>
          <Pressable onPress={() => setRaw((v) => !v)}>
            <Text style={s.rawToggle}>{raw ? 'hide raw' : 'show raw'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={s.probRow}>
        {CLASSES.map((k, i) => {
          const v = r.character?.probs?.[i] ?? 0;
          const top = r.character?.key === k;
          return (
            <View key={k} style={s.probCell}>
              <View style={s.probHead}>
                <Text style={[s.probName, top && { color: c.ink, fontWeight: '800' }]}>
                  {CHARACTER[k]?.label || k}
                </Text>
                <Text style={[s.probPct, top && { color: c.relevance }]}>{(v * 100).toFixed(1)}%</Text>
              </View>
              <View style={s.probTrack}>
                <View
                  style={[
                    s.probFill,
                    { width: `${Math.max(1, v * 100)}%`, backgroundColor: top ? c.relevance : c.rule },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>

      <View style={s.liveGrid}>
        {[
          [`${((r.character?.confidence ?? 0) * 100).toFixed(1)}%`, 'character confidence'],
          [`${((r.conversion ?? 0) * 100).toFixed(1)}%`, 'will complete an action'],
          [cn.events ?? 0, 'events'],
          [cn.spins ?? 0, 'spins'],
          [cn.launches ?? 0, 'launches'],
          [cn.distinct ?? 0, 'distinct titles'],
          [`${(cn.minutes ?? 0).toFixed(1)}m`, 'session length'],
          [`€${((cn.stakedCents ?? 0) / 100).toFixed(2)}`, 'staked'],
          [`${net >= 0 ? '+' : '-'}€${Math.abs(net / 100).toFixed(2)}`, 'net', net >= 0 ? c.calm : c.risk],
          [cn.slipAdds ?? 0, 'selections added'],
          [`${cn.completedConfirm ?? 0}/${cn.reachedConfirm ?? 0}`, 'confirm completed'],
          [cn.searches ?? 0, 'searches'],
        ].map(([n, l, tone]) => (
          <View key={l} style={s.liveCell}>
            <Text style={[s.liveN, tone && { color: tone }]}>{n}</Text>
            <Text style={s.kpiL}>{l}</Text>
          </View>
        ))}
      </View>

      <View style={s.liveFoot}>
        {r.character?.why?.length > 0 && (
          <Text style={s.examples}>Driven by {r.character.why.join(', ')}.</Text>
        )}
        <Text style={s.examples}>
          Last event <Text style={s.mono}>{r.last?.t}</Text>
          {r.last?.gameId ? <Text style={s.mono}> · {r.last.gameId}</Text> : null}
          {' · '}
          {new Date(r.at).toLocaleTimeString()}
        </Text>
      </View>

      {raw && (
        <View style={s.rawBox}>
          <Text style={s.rawText}>{JSON.stringify(r, null, 2)}</Text>
        </View>
      )}
    </View>
  );
}

function LiveFeed() {
  const [sessions, setSessions] = useState({});
  const [timeline, setTimeline] = useState([]);
  const [status, setStatus] = useState('connecting');

  useEffect(() => subscribe({
    onStatus: setStatus,
    onHello: (d) => {
      setSessions(Object.fromEntries((d.sessions || []).map((x) => [x.sessionId, x])));
      setTimeline((d.timeline || []).slice(-40).reverse());
    },
    onSnapshot: (snap) => {
      setSessions((m) => ({ ...m, [snap.sessionId]: snap }));
      if (snap.last) setTimeline((t) => [{ ...snap.last, sessionId: snap.sessionId }, ...t].slice(0, 40));
    },
  }), []);

  const rows = Object.values(sessions).sort((a, b) => b.at - a.at);
  const tone = status === 'live' ? c.calm : status === 'connecting' ? c.gold : c.inkFaint;

  return (
    <View style={{ gap: sp(4) }}>
      <View style={s.card}>
        <View style={s.liveHead}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2) }}>
            <View style={[s.pulse, { backgroundColor: tone }]} />
            <Text style={s.cardTitle}>
              {status === 'live' ? 'RELAY CONNECTED' : status === 'connecting' ? 'CONNECTING' : 'RELAY OFFLINE'}
            </Text>
          </View>
          <Text style={s.small}>{relayBase()}</Text>
        </View>

        {status !== 'live' && (
          <Text style={s.body}>
            Start it with <Text style={s.code}>node Solution/server/relay.mjs</Text>. The dashboard
            reconnects on its own — the product keeps working either way, since publishing is
            fire-and-forget.
          </Text>
        )}

        {status === 'live' && !rows.length && (
          <Text style={s.body}>
            Connected, no active session yet. Open the product, tap something, and it appears here
            within half a second.
          </Text>
        )}
      </View>

      {rows.map((r) => <LiveSession key={r.sessionId} r={r} />)}

      {timeline.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>EVENT STREAM</Text>
          {timeline.slice(0, 18).map((e, i) => (
            <View key={i} style={s.tickRow}>
              <Text style={[s.td, { flex: 0.6 }, s.mono]}>
                {new Date(e.at).toLocaleTimeString()}
              </Text>
              <Text style={[s.td, { flex: 0.8, color: c.relevance }]}>{e.t}</Text>
              <Text style={[s.td, { flex: 1.4 }, s.mono]} numberOfLines={1}>{e.gameId || '—'}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * The projection the whole page exists to support.
 *
 * Replay measures ranking quality, not causation, so turning one into the other
 * needs an assumption and the assumption is shown rather than buried. Theta is
 * the fraction of the measured discovery gain that survives into conversion;
 * 1.0 would mean a 197% better lobby yields 197% more conversion, which is
 * absurd, so the band runs 0.05 to 0.30 and the middle is labelled central.
 */
function projections(opportunity, funnel) {
  const gain = EVAL.replay?.uplift?.recall_at_6 ?? 1.9689;
  const cohortSessions = Math.round(funnel.sessions * opportunity.share);
  const base = opportunity.conversion;

  return [
    { theta: 0.05, tag: 'Conservative' },
    { theta: 0.15, tag: 'Central' },
    { theta: 0.30, tag: 'Optimistic' },
  ].map((sc) => {
    const conv = base * (1 + gain * sc.theta);
    const extra = Math.round(cohortSessions * (conv - base));
    return {
      ...sc,
      conv,
      extra,
      overall: funnel.session_conversion + extra / funnel.sessions,
      deltaPts: (conv - base) * 100,
    };
  });
}

/** A horizontal bar. Financial dashboards live on these; keep them honest. */
function Bar({ value, max, tone, height = 10 }) {
  const w = Math.max(1, Math.min(100, (value / max) * 100));
  return (
    <View style={[s.barTrack, { height }]}>
      <View style={[s.barFill, { width: `${w}%`, backgroundColor: tone || c.relevance, height }]} />
    </View>
  );
}

/** Sessions to confirm to completed — where the money actually leaks. */
function Funnel({ funnel }) {
  const steps = [
    { k: 'Sessions', v: funnel.sessions, tone: c.rule },
    { k: 'Reached confirm', v: funnel.confirm_reached, tone: c.relevance },
    { k: 'Completed', v: funnel.confirm_completed, tone: c.calm },
  ];
  const max = funnel.sessions;
  return (
    <View style={{ gap: sp(2) }}>
      {steps.map((st) => (
        <View key={st.k} style={s.funnelRow}>
          <Text style={s.funnelK}>{st.k}</Text>
          <View style={{ flex: 1 }}>
            <Bar value={st.v} max={max} tone={st.tone} height={14} />
          </View>
          <Text style={s.funnelV}>{st.v.toLocaleString()}</Text>
        </View>
      ))}
      <View style={s.leak}>
        <Text style={s.leakN}>{funnel.confirm_abandoned}</Text>
        <Text style={s.leakL}>
          abandoned after reaching confirm — {pct(1 - funnel.final_step_conversion)} of the
          strongest intent signal in the product
        </Text>
      </View>
    </View>
  );
}

function Stat({ n, l, tone }) {
  return (
    <View style={s.kpi}>
      <Text style={[s.kpiN, tone && { color: tone }]}>{n}</Text>
      <Text style={s.kpiL}>{l}</Text>
    </View>
  );
}

export default function OpsPage() {
  const { width } = useWindowDimensions();
  const wide = width >= 1040;
  const [tab, setTab] = useState('live');

  const f = EVAL.funnel;
  const briefs = useMemo(
    () => COHORTS.map((co) => ({ co, profile: profileFor(co.dominant) })),
    []
  );
  const opportunity = COHORTS.find((co) => co.conversion < 0.35);
  const proj = useMemo(
    () => (opportunity ? projections(opportunity, f) : []),
    [opportunity, f]
  );
  const riskShare = COHORTS.filter((co) => co.risk_rate >= 0.5).reduce((a, co) => a + co.share, 0);

  return (
    <ScrollView style={s.root} contentContainerStyle={s.wrap}>
      <View style={s.top}>
        <View style={{ flex: 1, minWidth: 320 }}>
          <Text style={s.kicker}>LANTERN · OPERATOR DASHBOARD</Text>
          <Text style={s.h1}>Who is playing, and what to build next</Text>
          <Text style={s.lede}>
            {f.sessions.toLocaleString()} sessions · {META.players.toLocaleString()} players ·{' '}
            {(META.rows / 1000).toFixed(0)}k events. Cohorts come from KMeans over the same
            30-feature vector the player-facing model uses — one pipeline, read two ways.
          </Text>
        </View>
      </View>

      <KpiRings
        cohorts={COHORTS}
        funnel={f}
        labelFor={(co) => {
          const n = nameFor(co, COHORTS);
          return n.qualifier ? `${n.name} · ${n.qualifier.split(' ')[0]}` : n.name;
        }}
      />

      {opportunity && (
        <>
          <View style={[s.card, { borderColor: c.relevance }]}>
            <Text style={s.cardTitle}>THE OPPORTUNITY</Text>
            <Text style={s.headline}>
              One cohort is {pct(opportunity.share)} of all sessions. Only{' '}
              {pct(opportunity.conversion)} of them end in an action.
            </Text>
            <Text style={s.body}>
              It is the largest segment by session count and the worst converter in the portfolio —
              value per session {opportunity.value_per_session} against{' '}
              {Math.round(Math.max(...COHORTS.map((x) => x.value_per_session))).toLocaleString()} for
              the strongest. These players do not lack intent; they lack a reason to stop scrolling.
              That is a relevance problem, and relevance is the one lever that moves it without
              pressure.
            </Text>

            <View style={s.oppGrid}>
              <View style={s.oppCell}>
                <Text style={s.oppN}>
                  {Math.round(f.sessions * opportunity.share).toLocaleString()}
                </Text>
                <Text style={s.oppL}>sessions in the cohort</Text>
              </View>
              <View style={s.oppCell}>
                <Text style={s.oppN}>{pct(opportunity.conversion)}</Text>
                <Text style={s.oppL}>convert today</Text>
              </View>
              <View style={s.oppCell}>
                <Text style={[s.oppN, { color: c.relevance }]}>
                  +{Math.round((EVAL.replay?.uplift?.recall_at_6 ?? 1.97) * 100)}%
                </Text>
                <Text style={s.oppL}>measured discovery gain</Text>
              </View>
            </View>
          </View>

          <View style={[s.card, s.projCard]}>
            <View style={s.rowBetween}>
              <Text style={s.cardTitle}>PROJECTED UPLIFT</Text>
              <Text style={s.small}>assumption stated, not buried</Text>
            </View>

            <View style={s.projHead}>
              <Text style={[s.th, { flex: 1.5 }]}>SCENARIO</Text>
              <Text style={[s.th, { flex: 2 }]}>COHORT CONVERSION</Text>
              <Text style={[s.th, s.r]}>+SESSIONS</Text>
              <Text style={[s.th, s.r, { flex: 1.3 }]}>PORTFOLIO</Text>
            </View>

            {proj.map((sc) => {
              const central = sc.tag === 'Central';
              return (
                <View key={sc.tag} style={[s.projRow, central && s.projRowOn]}>
                  <View style={{ flex: 1.5 }}>
                    <Text style={[s.projTag, central && { color: c.relevance }]}>{sc.tag}</Text>
                    <Text style={s.projTheta}>θ = {sc.theta.toFixed(2)}</Text>
                  </View>
                  <View style={{ flex: 2, gap: 4 }}>
                    <Bar
                      value={sc.conv}
                      max={0.28}
                      tone={central ? c.relevance : c.rule}
                    />
                    <Text style={s.projConv}>
                      {pct(opportunity.conversion)} → {pct(sc.conv)}{' '}
                      <Text style={{ color: c.calm }}>+{sc.deltaPts.toFixed(1)} pts</Text>
                    </Text>
                  </View>
                  <Text style={[s.td, s.r, s.num, { color: c.calm }]}>+{sc.extra}</Text>
                  <Text style={[s.td, s.r, s.num, { flex: 1.3 }]}>
                    {pct(sc.overall, 1)}
                  </Text>
                </View>
              );
            })}

            <Text style={s.body}>
              θ is the fraction of the measured discovery gain that survives into conversion.
              θ = 1.0 would mean a {Math.round((EVAL.replay?.uplift?.recall_at_6 ?? 1.97) * 100)}%
              better lobby produces {Math.round((EVAL.replay?.uplift?.recall_at_6 ?? 1.97) * 100)}%
              more conversion, which is absurd — so the band runs from conservative to optimistic
              and the central case is the one we would defend. The falsification test is an online
              A/B on top-six launch rate, measurable in a week.
            </Text>
          </View>

        </>
      )}

      <View style={[s.card, { borderColor: c.relevance }]}>
        <View style={s.rowBetween}>
          <Text style={s.cardTitle}>BEFORE AND AFTER · SAME CATALOGUE, SAME SESSIONS</Text>
          <Text style={s.small}>
            {(EVAL.replay?.generic?.n ?? 3750).toLocaleString()} held-out launches
          </Text>
        </View>
        <BeforeAfter />
        <Text style={s.body}>
          Grey is the lobby ordered by popularity, cyan is the same catalogue ordered by the trained
          ranker, replayed over launches neither model saw in training. Nothing about the player or
          the catalogue changes between the two rows — only the order does.
        </Text>
      </View>

      <View style={s.charts}>
        <ChartFrame
          title="PORTFOLIO MAP · VALUE AGAINST CONVERSION"
          note="Bubble size is share of sessions, height is value per session on a log scale. The two bubbles in the shaded corner are worth 1,400× the one at bottom left — and they are the two carrying the harm signal. Growth and harm occupy the same corner, which is the whole reason the risk head gates the ranker."
        >
          <ValueQuadrant
            cohorts={COHORTS}
            labelFor={(co) => {
              const n = nameFor(co, COHORTS);
              return n.qualifier ? `${n.name} · ${n.qualifier.split(' ')[0]}` : n.name;
            }}
          />
        </ChartFrame>

        <ChartFrame
          title="DISCOVERY · WHERE THE CHOSEN TITLE SAT"
          note={`Replayed across ${(EVAL.replay?.generic?.n ?? 3750).toLocaleString()} held-out launches. Dashed is popularity ordering, solid is the trained ranker. The gap at top-six is the product: ${pct(EVAL.replay?.generic?.recall_at_6 ?? 0)} against ${pct(EVAL.replay?.lantern?.recall_at_6 ?? 0)}.`}
        >
          <RecallCurve />
        </ChartFrame>

        <ChartFrame
          title="HOUSE EDGE, MEASURED"
          note="Share of play stretches ending net positive, by how long the stretch ran. It falls because the title returns 96.5% over the long run. The outcome head learned the same thing — its coefficient on spins played is negative — which is why a score built on it can be shown to a player without becoming an inducement."
        >
          <WinDecay />
        </ChartFrame>

        <ChartFrame
          title="PROJECTED PORTFOLIO CONVERSION"
          note="Today against the three pass-through scenarios. The dashed line is the current rate; every bar above it is the same cohort converting better, with nothing else in the portfolio assumed to move."
        >
          <Waterfall funnel={f} scenarios={proj} />
        </ChartFrame>

        <ChartFrame
          title="WHAT EACH CHARACTER REACHES FOR"
          note="Log lift over the population mix, averaged by game format. Positive means that character picks that format more than it picks everything else. This is the table the build briefs are derived from — shown directly rather than summarised."
        >
          <AffinityHeat />
        </ChartFrame>
      </View>

      <View style={s.tabs}>
        {[['live', 'Live sessions'], ['build', 'What to build'], ['cohorts', 'Cohorts'], ['players', 'Players']].map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && s.tabOn]}>
            <Text style={[s.tabText, tab === k && s.tabTextOn]}>{l}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'live' && <LiveFeed />}

      {tab === 'build' && (
        <View style={[s.grid, wide && s.gridWide]}>
          {briefs.map(({ co, profile }) => (
            <View key={co.id} style={[s.card, s.brief]}>
              <View style={s.briefHead}>
                <View style={{ flex: 1 }}>
                  <Text style={s.briefName}>{nameFor(co, COHORTS).name}</Text>
                  {nameFor(co, COHORTS).qualifier && (
                    <Text style={s.briefQual}>{nameFor(co, COHORTS).qualifier}</Text>
                  )}
                </View>
                <Text style={s.briefShare}>{pct(co.share)} of sessions</Text>
              </View>

              {profile ? (
                <>
                  <Text style={s.specLine}>
                    <Text style={s.specKey}>Format · </Text>
                    {profile.mechanics.map(([m]) => m.replace('-', ' ')).join(', ')}
                  </Text>
                  <Text style={s.specLine}>
                    <Text style={s.specKey}>Volatility · </Text>
                    {VOL_BAND(profile.volatility)} (band {profile.volatility.toFixed(1)})
                  </Text>
                  <Text style={s.specLine}>
                    <Text style={s.specKey}>Jackpot · </Text>
                    {pct(profile.jackpotShare)} of what they reach for
                  </Text>
                  <Text style={s.specLine}>
                    <Text style={s.specKey}>Session · </Text>
                    build for {co.mean_minutes} min, {Math.round(co.mean_spins)} spins
                  </Text>
                  {profile.hitRate != null && (
                    <Text style={s.specLine}>
                      <Text style={s.specKey}>Hit frequency · </Text>
                      {pct(profile.hitRate)} of spins pay something
                    </Text>
                  )}
                  <Text style={s.examples}>
                    Over-indexes on {profile.examples.join(', ')} — {profile.n} titles above
                    population baseline. Format and volatility are read from the archetype's
                    revealed taste; session length and spin count are this cohort's own.
                  </Text>
                </>
              ) : (
                <Text style={s.body}>
                  No title in this cohort clears the population baseline by enough to brief from.
                  That is itself the finding: nothing in the catalogue is built for them.
                </Text>
              )}

              <View style={s.verdict}>
                <Text style={[s.verdictTag, { color: co.risk_rate >= 0.5 ? c.concern : c.calm }]}>
                  {co.risk_rate >= 0.5 ? 'DO NOT GROW' : 'BUILD'}
                </Text>
                <Text style={s.verdictText}>
                  {co.risk_rate >= 0.5
                    ? `Harm signal ${pct(co.risk_rate)} and the highest value per session in the portfolio. These are the same fact. Ship limits here, not content.`
                    : co.conversion < 0.35
                    ? 'Largest addressable gap. Shorter path to a first action, and titles that match the pace above rather than the loudest thing in the lobby.'
                    : 'Converts reliably. Depth over discovery — more of what they already finish.'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {tab === 'cohorts' && (
        <View style={s.card}>
          <View style={s.thead}>
            <Text style={[s.th, { flex: 1.6 }]}>COHORT</Text>
            <Text style={[s.th, s.r]}>SHARE</Text>
            <Text style={[s.th, s.r]}>CONVERT</Text>
            <Text style={[s.th, s.r]}>VALUE/SESSION</Text>
            <Text style={[s.th, s.r]}>MINUTES</Text>
            <Text style={[s.th, s.r]}>SPINS</Text>
            <Text style={[s.th, s.r]}>HARM</Text>
          </View>
          {COHORTS.map((co) => (
            <View key={co.id} style={s.tr}>
              <Text style={[s.td, { flex: 1.6, fontWeight: '700' }]}>
                {nameFor(co, COHORTS).name}
                {nameFor(co, COHORTS).qualifier ? ` · ${nameFor(co, COHORTS).qualifier}` : ''}
              </Text>
              <Text style={[s.td, s.r, s.num]}>{pct(co.share)}</Text>
              <Text style={[s.td, s.r, s.num]}>{pct(co.conversion)}</Text>
              <Text style={[s.td, s.r, s.num]}>{co.value_per_session.toLocaleString()}</Text>
              <Text style={[s.td, s.r, s.num]}>{co.mean_minutes}</Text>
              <Text style={[s.td, s.r, s.num]}>{Math.round(co.mean_spins)}</Text>
              <Text style={[s.td, s.r, s.num, co.risk_rate >= 0.5 && { color: c.concern }]}>
                {pct(co.risk_rate)}
              </Text>
            </View>
          ))}
          <Text style={[s.body, { marginTop: sp(3) }]}>
            Read the last two columns together. The cohorts with the highest value per session are
            the cohorts carrying the harm signal, which is why growth cannot be the only number on
            this page.
          </Text>
        </View>
      )}

      {tab === 'players' && (
        <View style={s.card}>
          <View style={s.thead}>
            <Text style={[s.th, { flex: 1.8 }]}>PLAYER</Text>
            <Text style={[s.th, { flex: 1.4 }]}>CHARACTER</Text>
            <Text style={[s.th, s.r]}>SESSIONS</Text>
            <Text style={[s.th, s.r]}>EVENTS</Text>
            <Text style={[s.th, s.r]}>CONVERT</Text>
            <Text style={[s.th, s.r]}>NET</Text>
            <Text style={[s.th, s.r]}>LAST SEEN</Text>
          </View>
          {playerData.players.slice(0, 60).map((p) => (
            <View key={p.id} style={s.tr}>
              <Text style={[s.td, { flex: 1.8 }, s.mono]} numberOfLines={1}>{p.id}</Text>
              <Text style={[s.td, { flex: 1.4 }]}>{CHARACTER[p.archetype]?.label || p.archetype}</Text>
              <Text style={[s.td, s.r, s.num]}>{p.sessions}</Text>
              <Text style={[s.td, s.r, s.num]}>{p.events.toLocaleString()}</Text>
              <Text style={[s.td, s.r, s.num]}>{pct(p.conversion)}</Text>
              <Text style={[s.td, s.r, s.num, { color: p.net >= 0 ? c.calm : c.inkSoft }]}>
                {p.net >= 0 ? '+' : ''}{Math.round(p.net)}
              </Text>
              <Text style={[s.td, s.r]}>{p.last}</Text>
            </View>
          ))}
          <Text style={[s.body, { marginTop: sp(3) }]}>
            Showing {Math.min(60, playerData.players.length)} of {playerData.total.toLocaleString()}.
            Pseudonymous ids exactly as they arrive in the export — no name, no contact, no
            demographic. The cohort model never sees one.
          </Text>
        </View>
      )}

      <View style={[s.card, { marginTop: sp(2) }]}>
        <Text style={s.cardTitle}>WHERE THE VALUE LEAKS</Text>
        <Text style={s.body}>
          A funnel of the whole corpus. Of 4,995 sessions, 1,769 reached the confirm screen — the
          point where a player has chosen a bet and only has to press the button — and 1,388 of
          those completed. The gap between those two bars is the leak: people who did the hard part
          and then walked away.
        </Text>

        <View style={s.grid2}>
            <View style={{ flex: 1, minWidth: 280, gap: sp(2) }}>
              <Text style={s.cardTitle}>WHERE THE VALUE LEAKS</Text>
              <Funnel funnel={f} />
            </View>
            <View style={{ flex: 1, minWidth: 280, gap: sp(2) }}>
              <Text style={s.cardTitle}>FINAL-STEP RECOVERY</Text>
              <Text style={s.body}>
                The conversion head (AUC {(EVAL.heads?.conversion?.auc ?? 0.965).toFixed(3)})
                identifies sessions likely to abandon before the confirm screen, so friction can be
                removed while intent is still live rather than chased afterwards.
              </Text>
              <View style={s.recoverGrid}>
                {[10, 20, 30].map((r) => {
                  const recovered = Math.round(f.confirm_abandoned * (r / 100));
                  const rate = (f.confirm_completed + recovered) / f.confirm_reached;
                  return (
                    <View key={r} style={s.recoverCell}>
                      <Text style={s.recoverN}>{pct(rate, 1)}</Text>
                      <Text style={s.recoverL}>
                        if {r}% of the {f.confirm_abandoned} recovered
                      </Text>
                      <Text style={s.recoverD}>
                        +{(rate - f.final_step_conversion).toFixed(3).slice(1)} vs{' '}
                        {pct(f.final_step_conversion, 1)} today
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
      </View>

      <Text style={s.foot}>{META.note}</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  wrap: { padding: sp(6), paddingBottom: sp(14), gap: sp(4), maxWidth: 1500, width: '100%', alignSelf: 'center' },

  top: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(5), justifyContent: 'space-between' },
  kicker: { ...type.label, color: c.gold },
  h1: { ...type.h1, fontSize: 30, marginTop: sp(1) },
  lede: { ...type.soft, maxWidth: 640, marginTop: sp(2), lineHeight: 20 },
  kpis: { flexDirection: 'row', gap: sp(2), flexWrap: 'wrap' },
  kpi: { backgroundColor: c.surface, borderRadius: radius.md, padding: sp(3), minWidth: 128, borderWidth: 1, borderColor: c.rule },
  kpiN: { ...type.h2, fontSize: 22, ...type.num },
  kpiL: { ...type.tiny, marginTop: 2 },

  card: { backgroundColor: c.surface, borderRadius: radius.lg, padding: sp(4), borderWidth: 1, borderColor: c.rule, gap: sp(2) },
  cardTitle: { ...type.label, color: c.relevance },
  headline: { ...type.h1, fontSize: 24 },
  body: { ...type.tiny, lineHeight: 17, maxWidth: 760 },

  tabs: { flexDirection: 'row', gap: sp(2) },
  tab: { paddingHorizontal: sp(4), paddingVertical: sp(2.5), borderRadius: radius.pill, borderWidth: 1, borderColor: c.rule, backgroundColor: c.surface },
  tabOn: { borderColor: c.relevance, backgroundColor: c.surfaceAlt },
  tabText: { ...type.tiny, fontWeight: '800', color: c.inkSoft },
  tabTextOn: { color: c.ink },

  grid: { gap: sp(4) },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  brief: { flexGrow: 1, flexBasis: 340, maxWidth: 480, gap: sp(1.5) },
  briefHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  briefName: { ...type.h2, fontSize: 19 },
  briefShare: { ...type.tiny, ...type.num },
  briefQual: { ...type.tiny, color: c.inkFaint, marginTop: 1 },
  specLine: { ...type.tiny, color: c.ink, lineHeight: 18 },
  specKey: { color: c.inkFaint, fontWeight: '800' },
  examples: { ...type.tiny, color: c.inkFaint, marginTop: sp(1), lineHeight: 15 },
  verdict: { borderTopWidth: 1, borderTopColor: c.ruleSoft, paddingTop: sp(2), marginTop: sp(1), gap: sp(1) },
  verdictTag: { ...type.label, fontSize: 9.5 },
  verdictText: { ...type.tiny, lineHeight: 16 },

  thead: { flexDirection: 'row', gap: sp(2), borderBottomWidth: 1, borderBottomColor: c.rule, paddingBottom: sp(2) },
  th: { ...type.label, flex: 1, fontSize: 8.5 },
  tr: { flexDirection: 'row', gap: sp(2), paddingVertical: sp(2), borderBottomWidth: 1, borderBottomColor: c.ruleSoft },
  td: { ...type.tiny, color: c.ink, flex: 1 },
  mono: { color: c.inkSoft, fontSize: 10 },
  r: { textAlign: 'right' },
  num: { ...type.num },
  liveHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: sp(3) },
  probRow: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2), marginTop: sp(2) },
  probCell: { flexGrow: 1, flexBasis: 150, gap: 3 },
  probHead: { flexDirection: 'row', justifyContent: 'space-between' },
  probName: { ...type.tiny, color: c.inkSoft },
  probPct: { ...type.tiny, ...type.num, color: c.inkSoft },
  probTrack: { height: 5, backgroundColor: c.inset, borderRadius: 3, overflow: 'hidden' },
  probFill: { height: '100%', borderRadius: 3 },
  liveFoot: { gap: 2, marginTop: sp(1) },
  rawToggle: { ...type.tiny, color: c.relevance, fontWeight: '700' },
  rawBox: { backgroundColor: c.inset, borderRadius: radius.md, padding: sp(3), marginTop: sp(2) },
  rawText: { ...type.tiny, color: c.inkSoft, fontSize: 10, lineHeight: 15 },
  pulse: { width: 9, height: 9, borderRadius: 5 },
  state: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: sp(2), paddingVertical: 2 },
  stateText: { ...type.tiny, fontWeight: '900', fontSize: 9.5 },
  liveGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2), marginTop: sp(2) },
  liveCell: { flexGrow: 1, flexBasis: 120, backgroundColor: c.inset, borderRadius: radius.md, padding: sp(2.5) },
  liveN: { ...type.h2, fontSize: 18, ...type.num },
  tickRow: { flexDirection: 'row', gap: sp(2), paddingVertical: sp(1), borderBottomWidth: 1, borderBottomColor: c.ruleSoft },
  code: { color: c.gold, fontSize: 11 },
  charts: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(3) },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: sp(3) },
  oppGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(3), marginTop: sp(2) },
  oppCell: { flexGrow: 1, flexBasis: 150 },
  oppN: { ...type.h1, fontSize: 26, ...type.num },
  oppL: { ...type.tiny, marginTop: 2 },

  projCard: { gap: sp(2) },
  projHead: {
    flexDirection: 'row', gap: sp(2), borderBottomWidth: 1, borderBottomColor: c.rule,
    paddingBottom: sp(1.5), marginTop: sp(1),
  },
  projRow: {
    flexDirection: 'row', gap: sp(2), alignItems: 'center',
    paddingVertical: sp(2.5), borderBottomWidth: 1, borderBottomColor: c.ruleSoft,
  },
  projRowOn: { backgroundColor: c.surfaceAlt, borderRadius: radius.sm },
  projTag: { ...type.body, fontWeight: '800', fontSize: 14 },
  projTheta: { ...type.tiny, color: c.inkFaint, ...type.num, fontSize: 9.5 },
  projConv: { ...type.tiny, ...type.num, color: c.inkSoft },

  barTrack: { backgroundColor: c.inset, borderRadius: 3, overflow: 'hidden' },
  barFill: { borderRadius: 3 },

  funnelRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2.5) },
  funnelK: { ...type.tiny, color: c.inkSoft, width: 108 },
  funnelV: { ...type.tiny, ...type.num, color: c.ink, width: 56, textAlign: 'right', fontWeight: '700' },
  leak: {
    flexDirection: 'row', alignItems: 'flex-start', gap: sp(2.5), marginTop: sp(1),
    borderTopWidth: 1, borderTopColor: c.ruleSoft, paddingTop: sp(2.5),
  },
  leakN: { ...type.h1, fontSize: 26, color: c.risk, ...type.num },
  leakL: { ...type.tiny, flex: 1, lineHeight: 15 },

  recoverGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2) },
  recoverCell: {
    flexGrow: 1, flexBasis: 120, backgroundColor: c.inset, borderRadius: radius.md, padding: sp(2.5),
  },
  recoverN: { ...type.h2, fontSize: 19, color: c.calm, ...type.num },
  recoverL: { ...type.tiny, fontSize: 9.5, lineHeight: 13, marginTop: 2 },
  recoverD: { ...type.tiny, fontSize: 9, color: c.inkFaint, marginTop: 3, ...type.num },

  foot: { ...type.tiny, color: c.inkFaint, marginTop: sp(2) },
});

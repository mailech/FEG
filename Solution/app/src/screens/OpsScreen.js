/**
 * Ops — the same models, read sideways.
 *
 * The player-facing screens ask "what should this person see next". This asks
 * "what kind of people do we have, and what should we build for them". Same
 * feature vector, same cluster centroids, no second pipeline.
 *
 * The advice per cohort is *derived*, not written down against a cluster id.
 * KMeans renumbers its clusters on every retrain, so hard-coded copy would
 * silently attach itself to the wrong segment the next time the notebook runs.
 * `adviceFor()` reads the cohort's own numbers instead.
 */

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Card, Label, Row, Note, Toggle } from '../components/ui';
import { CHARACTER } from '../lantern/model';
import cohortData from '../data/cohorts.json';
import playerData from '../data/players.json';
import evalData from '../data/eval.json';
import { c, sp, type, radius } from '../theme';

const pct = (x) => `${Math.round(x * 100)}%`;
const COHORTS = [...cohortData.cohorts].sort((a, b) => b.share - a.share);

/**
 * What this segment is, and what to do about it — inferred from the cohort's
 * own conversion, risk and session shape.
 */
function adviceFor(co) {
  if (co.risk_rate >= 0.5) {
    return {
      tag: 'Protect',
      tone: c.concern,
      what: 'Highest value per session and the highest harm signal. These two facts are the same fact.',
      build: 'Hard limits surfaced before the session, not after. Growth here is not growth.',
    };
  }
  if (co.conversion < 0.35) {
    return {
      tag: 'The opportunity',
      tone: c.relevance,
      what: `${pct(co.share)} of sessions and only ${pct(co.conversion)} of them end in an action. The brief's problem, sized.`,
      build: 'Relevance and fewer steps. This is the cohort the ranker was built for.',
    };
  }
  if (co.mean_minutes < 15) {
    return {
      tag: 'Efficient',
      tone: c.calm,
      what: 'Short sessions, high completion. They know what they came for.',
      build: 'Get out of the way. Resume-where-you-left-off, one tap to the usual.',
    };
  }
  return {
    tag: 'Core',
    tone: c.gold,
    what: 'Long sessions, steady stakes, converts reliably. The base of the business.',
    build: 'Depth over discovery — deeper catalogue, better sport crossover.',
  };
}

function StatCell({ n, label, tone }) {
  return (
    <View style={s.statCell}>
      <Text style={[s.statNum, tone && { color: tone }]}>{n}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function CohortCard({ co, open, onPress }) {
  const a = adviceFor(co);
  const mix = Object.entries(co.archetype_mix).sort((x, y) => y[1] - x[1]);
  return (
    <Pressable onPress={onPress}>
      <Card style={s.cohort}>
        <Row>
          <View style={s.cohortHead}>
            <View style={[s.dot, { backgroundColor: a.tone }]} />
            <Text style={s.cohortName}>{CHARACTER[co.dominant]?.label || co.dominant}</Text>
            <Text style={[s.tag, { color: a.tone, borderColor: a.tone }]}>{a.tag}</Text>
          </View>
          <Text style={s.share}>{pct(co.share)}</Text>
        </Row>

        <View style={s.bar}>
          {mix.map(([k, v]) =>
            v > 0.01 ? (
              <View
                key={k}
                style={{
                  flex: v,
                  backgroundColor: k === co.dominant ? a.tone : c.rule,
                }}
              />
            ) : null
          )}
        </View>

        <Row style={s.stats}>
          <StatCell n={pct(co.conversion)} label="convert" />
          <StatCell n={co.value_per_session} label="value / session" />
          <StatCell n={`${co.mean_minutes}m`} label="session" />
          <StatCell
            n={pct(co.risk_rate)}
            label="harm signal"
            tone={co.risk_rate >= 0.5 ? c.concern : undefined}
          />
        </Row>

        {open && (
          <View style={s.detail}>
            <Text style={s.what}>{a.what}</Text>
            <View style={s.buildRow}>
              <Text style={[s.buildTag, { color: a.tone }]}>BUILD</Text>
              <Text style={s.build}>{a.build}</Text>
            </View>
            <Text style={s.meta}>
              {co.size.toLocaleString()} sessions · {co.mean_spins} spins ·{' '}
              {mix.map(([k, v]) => `${k} ${pct(v)}`).join(' · ')}
            </Text>
          </View>
        )}
      </Card>
    </Pressable>
  );
}

export default function OpsScreen() {
  const [open, setOpen] = useState(COHORTS[0]?.id ?? 0);
  const [view, setView] = useState('cohorts');
  const f = evalData.funnel;

  const opportunity = COHORTS.find((co) => co.conversion < 0.35);
  const atRisk = COHORTS.filter((co) => co.risk_rate >= 0.5);
  const riskShare = atRisk.reduce((a, co) => a + co.share, 0);

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.content}>
      <Label>Portfolio</Label>
      <Text style={s.h1}>Who is actually here</Text>

      <Card style={s.summary}>
        <Row style={s.stats}>
          <StatCell n={f.sessions.toLocaleString()} label="sessions" />
          <StatCell n={playerData.total.toLocaleString()} label="players" />
          <StatCell n={pct(f.session_conversion)} label="session conversion" />
          <StatCell n={pct(f.final_step_conversion)} label="final step" />
        </Row>
        <View style={s.rule} />
        <Text style={s.head}>
          {f.confirm_abandoned.toLocaleString()} sessions reached the confirm step and left
        </Text>
        <Text style={s.sub}>
          That is {pct(1 - f.final_step_conversion)} of the strongest intent signal in the
          product, lost at the last screen. It is the cheapest volume in the funnel to
          recover, because those users already decided.
        </Text>
      </Card>

      {opportunity && (
        <Card style={[s.summary, { borderColor: c.relevance, borderWidth: 1 }]}>
          <Label>The prize</Label>
          <Text style={s.head}>
            {pct(opportunity.share)} of sessions convert at {pct(opportunity.conversion)}
          </Text>
          <Text style={s.sub}>
            The largest cohort by session count is also the one that almost never acts —
            value per session {opportunity.value_per_session} against{' '}
            {Math.round(Math.max(...COHORTS.map((x) => x.value_per_session))).toLocaleString()} for
            the top segment. Moving
            this group is the whole business case, and it is a relevance problem, not a
            pressure problem.
          </Text>
        </Card>
      )}

      <Toggle
        options={[
          { value: 'cohorts', label: 'Cohorts' },
          { value: 'players', label: 'Players' },
        ]}
        value={view}
        onChange={setView}
      />

      {view === 'cohorts' ? (
        <>
          {COHORTS.map((co) => (
            <CohortCard
              key={co.id}
              co={co}
              open={open === co.id}
              onPress={() => setOpen(open === co.id ? -1 : co.id)}
            />
          ))}
          <Card style={s.summary}>
            <Label>Guardrail</Label>
            <Text style={s.sub}>
              {pct(riskShare)} of sessions sit in cohorts carrying a harm signal, and they
              hold the highest value per session in the portfolio. Any uplift claim has to be
              read against that: the target is more sessions converting in the low-risk
              cohorts, and flat-or-down in these. A dashboard that only shows revenue would
              call growth here a win.
            </Text>
          </Card>
        </>
      ) : (
        <Card style={s.summary}>
          <Row>
            <Label>Top players by activity</Label>
            <Text style={s.sub}>{playerData.players.length} of {playerData.total}</Text>
          </Row>
          <View style={s.thead}>
            <Text style={[s.th, { flex: 2 }]}>PLAYER</Text>
            <Text style={[s.th, { flex: 1.6 }]}>CHARACTER</Text>
            <Text style={[s.th, s.right]}>SESS</Text>
            <Text style={[s.th, s.right]}>CONV</Text>
            <Text style={[s.th, s.right, { flex: 1.2 }]}>NET</Text>
          </View>
          {playerData.players.slice(0, 40).map((p) => (
            <View key={p.id} style={s.trow}>
              <Text style={[s.td, s.mono, { flex: 2 }]} numberOfLines={1}>{p.id}</Text>
              <Text style={[s.td, { flex: 1.6 }]}>{CHARACTER[p.archetype]?.label || p.archetype}</Text>
              <Text style={[s.td, s.right]}>{p.sessions}</Text>
              <Text style={[s.td, s.right]}>{pct(p.conversion)}</Text>
              <Text
                style={[s.td, s.right, { flex: 1.2, color: p.net >= 0 ? c.calm : c.inkSoft }]}
              >
                {p.net >= 0 ? '+' : ''}{Math.round(p.net)}
              </Text>
            </View>
          ))}
          <Note tone="quiet">
            Pseudonymous ids, as they arrive in the export. No name, no contact, no
            demographic — the cohort model never sees one.
          </Note>
        </Card>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  content: { padding: sp(4), paddingBottom: sp(12), gap: sp(3) },
  h1: { ...type.h1, fontSize: 26, marginBottom: sp(1) },
  summary: { gap: sp(2) },
  head: { ...type.body, fontWeight: '700', fontSize: 15 },
  sub: { ...type.tiny, lineHeight: 16 },
  rule: { height: 1, backgroundColor: c.ruleSoft },

  stats: { gap: sp(2) },
  statCell: { flex: 1 },
  statNum: { ...type.h2, fontSize: 17, ...type.num },
  statLabel: { ...type.tiny, marginTop: sp(0.5) },

  cohort: { gap: sp(2) },
  cohortHead: { flexDirection: 'row', alignItems: 'center', gap: sp(2), flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  cohortName: { ...type.body, fontWeight: '800' },
  tag: {
    ...type.tiny, fontWeight: '800', borderWidth: 1, borderRadius: radius.pill,
    paddingHorizontal: sp(1.5), paddingVertical: 1, fontSize: 9.5,
  },
  share: { ...type.h2, fontSize: 18, ...type.num },
  bar: { flexDirection: 'row', height: 5, borderRadius: radius.pill, overflow: 'hidden' },

  detail: { gap: sp(2), borderTopWidth: 1, borderTopColor: c.ruleSoft, paddingTop: sp(2) },
  what: { ...type.soft, lineHeight: 18 },
  buildRow: { flexDirection: 'row', gap: sp(2) },
  buildTag: { ...type.tiny, fontWeight: '900', fontSize: 9.5, letterSpacing: 1, marginTop: 1 },
  build: { ...type.soft, flex: 1, lineHeight: 18 },
  meta: { ...type.tiny, color: c.inkFaint },

  thead: {
    flexDirection: 'row', gap: sp(2), paddingBottom: sp(1.5),
    borderBottomWidth: 1, borderBottomColor: c.rule,
  },
  th: { ...type.label, flex: 1, fontSize: 9 },
  trow: {
    flexDirection: 'row', gap: sp(2), paddingVertical: sp(1.5),
    borderBottomWidth: 1, borderBottomColor: c.ruleSoft,
  },
  td: { ...type.tiny, color: c.ink, flex: 1 },
  mono: { color: c.inkSoft, fontSize: 10 },
  right: { textAlign: 'right', ...type.num },
});

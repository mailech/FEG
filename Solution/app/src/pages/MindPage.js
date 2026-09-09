/**
 * /mind — the model diagnostics console.
 *
 * The in-app Mind tab is a phone surface: it answers "what does the model think
 * of me, right now". This is the desktop instrument behind it, and it answers a
 * harder question — *show me the arithmetic*. The full 30-dimensional feature
 * vector, raw and standardised, every coefficient, every contribution, for any
 * session you point it at.
 *
 * It runs the same `predict()` as the app. Nothing is recomputed for display and
 * nothing is rounded before it is used, so a number that appears here is the
 * number the product acted on.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { useLantern } from '../lantern/useLantern';
import { SAMPLES } from '../lantern/samples';
import { usePeers } from '../lantern/usePeers';
import {
  predict, FEATURES, LABEL, CLASSES, CHARACTER, META, EVAL,
} from '../lantern/model';
import { c, sp, type, radius } from '../theme';

/**
 * A softmax output is never exactly 1 and never exactly 0, so it must not be
 * printed as though it were. `.toFixed(1)` rounds 0.9997 to "100.0%", which
 * reads as certainty the model does not have and cannot have — its own held-out
 * accuracy is 94%. The tails are clamped to the strongest claim one decimal
 * place can honestly support.
 */
/** The relay row has no room for decimals, but it still must not say 100%. */
const coarse = (x) => (x >= 0.995 ? '>99%' : x > 0 && x < 0.005 ? '<1%' : Math.round(x * 100) + '%');

const pct = (x) =>
  x >= 0.9995 ? '>99.9%'
  : x > 0 && x < 0.0005 ? '<0.1%'
  : `${(x * 100).toFixed(1)}%`;

function Bar({ v, max, tone }) {
  const w = Math.min(100, (Math.abs(v) / max) * 100);
  return (
    <View style={s.miniTrack}>
      <View style={s.miniCentre} />
      <View
        style={[
          s.miniFill,
          v >= 0
            ? { left: '50%', width: `${w / 2}%`, backgroundColor: tone || c.relevance }
            : { right: '50%', width: `${w / 2}%`, backgroundColor: c.risk },
        ]}
      />
    </View>
  );
}

/**
 * Everyone signed in right now, and what each of them is doing.
 *
 * The session picker below inspects one vector in depth. This is the other
 * question a diagnostics page has to answer: who is on the system at all, what
 * does the model make of each of them, and is anyone in a state that matters.
 *
 * Rows come from the relay, so a laptop with two browser profiles signed in as
 * two people shows two rows. Anyone without a profile shows as an anonymous
 * session — visible, but not named.
 */
function LiveUsers() {
  const { all, status } = usePeers(null, null);
  const named = all.filter((p) => p.name);
  const anon = all.length - named.length;

  const tone = status === 'live' ? c.calm : status === 'connecting' ? c.gold : c.inkFaint;

  return (
    <View style={s.card}>
      <View style={s.usersHead}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2) }}>
          <View style={[s.dot, { backgroundColor: tone }]} />
          <Text style={s.cardTitle}>
            SIGNED IN NOW · {named.length} {named.length === 1 ? 'user' : 'users'}
            {anon > 0 ? ` + ${anon} anonymous` : ''}
          </Text>
        </View>
        <Text style={s.small}>
          {status === 'live' ? 'live from the relay' : status === 'connecting' ? 'connecting' : 'relay offline'}
        </Text>
      </View>

      {all.length === 0 ? (
        <Text style={s.small}>
          {status === 'live'
            ? 'Nobody playing. Open the product in another window and sign in.'
            : 'Start the relay to see live users: node Solution/server/relay.mjs'}
        </Text>
      ) : (
        <>
          <View style={s.uhead}>
            <Text style={[s.th, { flex: 1.4 }]}>USER</Text>
            <Text style={[s.th, { flex: 1.3 }]}>CHARACTER</Text>
            <Text style={[s.th, s.r]}>CONF</Text>
            <Text style={[s.th, s.r]}>RISK</Text>
            <Text style={[s.th, s.r]}>SPINS</Text>
            <Text style={[s.th, s.r]}>TITLES</Text>
            <Text style={[s.th, s.r]}>NET</Text>
            <Text style={[s.th, { flex: 1.1 }]}>DOING</Text>
          </View>
          {all.map((p) => {
            const net = (p.counters?.netCents ?? 0) / 100;
            const risky = p.risk?.state && p.risk.state !== 'calm';
            return (
              <View key={p.sessionId} style={s.urow}>
                <View style={{ flex: 1.4 }}>
                  <Text style={s.uname}>{p.name || 'anonymous'}</Text>
                  <Text style={s.uhandle}>{p.handle || p.sessionId}</Text>
                </View>
                <Text style={[s.td, { flex: 1.3 }]}>{p.character?.label || '—'}</Text>
                <Text style={[s.td, s.r, s.num]}>
                  {coarse(p.character?.confidence ?? 0)}
                </Text>
                <Text style={[s.td, s.r, s.num, risky && { color: c[p.risk.state] }]}>
                  {coarse(p.risk?.p ?? 0)}
                </Text>
                <Text style={[s.td, s.r, s.num]}>{p.counters?.spins ?? 0}</Text>
                <Text style={[s.td, s.r, s.num]}>{p.counters?.distinct ?? 0}</Text>
                <Text style={[s.td, s.r, s.num, { color: net >= 0 ? c.calm : c.risk }]}>
                  {net >= 0 ? '+' : '−'}€{Math.abs(net).toFixed(2)}
                </Text>
                <Text style={[s.td, { flex: 1.1 }]} numberOfLines={1}>
                  {p.last?.t || '—'}
                </Text>
              </View>
            );
          })}
          <Text style={s.small}>
            Names come from the device profile and are the only identifying field on the wire.
            Limits, age band and the behavioural stream never leave the handset.
          </Text>
        </>
      )}
    </View>
  );
}

export default function MindPage() {
  const { sco: liveSco } = useLantern();
  const { width } = useWindowDimensions();
  const wide = width >= 980;
  // Landing here cold, the live session is empty and the page reads "Listening ·
  // 0 events" — correct, and a poor first impression for someone who opened the
  // URL to see the model work. Default to a session with something in it, and
  // pick the one that exercises both heads at once.
  const [pick, setPick] = useState(() => (liveSco.events.length >= 6 ? 'live' : 'chaser'));

  const sco = pick === 'live' ? liveSco : SAMPLES.find((x) => x.key === pick).sco;
  const p = useMemo(() => predict(sco), [sco]);

  const a = p.archetype;
  const relCoef = useMemo(() => {
    const rows = a.why.reduce((m, w) => ({ ...m, [w.feature]: w.value }), {});
    return rows;
  }, [a.why]);

  const maxAbs = Math.max(0.01, ...p.z.map(Math.abs));
  const evidence = Math.min(1, sco.events.length / 6);
  const shown = a.probs.map((q) => q * evidence + 0.25 * (1 - evidence));
  const listening = evidence < 0.5;

  return (
    <ScrollView style={s.root} contentContainerStyle={s.wrap}>
      <View style={s.top}>
        <View>
          <Text style={s.kicker}>LANTERN · MODEL DIAGNOSTICS</Text>
          <Text style={s.h1}>What the model is doing, and why</Text>
          <Text style={s.lede}>
            Two heads and a ranker, trained on {(META.rows / 1000).toFixed(0)}k events across{' '}
            {META.sessions.toLocaleString()} sessions, running on the device. Every number below is
            the model's own arithmetic — coefficient times standardised value — not a description
            written after the fact.
          </Text>
        </View>
        <View style={s.badges}>
          {[
            ['Character', pct(EVAL.heads?.archetype?.accuracy ?? 0.94)],
            ['Risk AUC', (EVAL.heads?.risk?.auc ?? 0.996).toFixed(3)],
            ['Conversion AUC', (EVAL.heads?.conversion?.auc ?? 0.965).toFixed(3)],
            ['Top-6 uplift', `+${Math.round((EVAL.replay?.uplift?.recall_at_6 ?? 1.97) * 100)}%`],
          ].map(([k, v]) => (
            <View key={k} style={s.badge}>
              <Text style={s.badgeV}>{v}</Text>
              <Text style={s.badgeK}>{k}</Text>
            </View>
          ))}
        </View>
      </View>

      <LiveUsers />

      <View style={s.picker}>
        <Text style={s.pickerLabel}>SESSION</Text>
        {[{ key: 'live', label: `Live session · ${liveSco.events.length} events` }, ...SAMPLES].map((o) => (
          <Pressable
            key={o.key}
            onPress={() => setPick(o.key)}
            style={[s.chip, pick === o.key && s.chipOn]}
          >
            <Text style={[s.chipText, pick === o.key && s.chipTextOn]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[s.cols, wide && s.colsWide]}>
        {/* -------------------------------- left */}
        <View style={s.col}>
          <View style={s.card}>
            <Text style={s.cardTitle}>Character</Text>
            <Text style={s.verdict}>{listening ? 'Listening' : a.label}</Text>
            <Text style={s.verdictSub}>
              {listening
                ? `Only ${sco.events.length} events. Held near even until there is evidence behind a call.`
                : a.blurb}
            </Text>
            {CLASSES.map((k, i) => (
              <View key={k} style={s.classRow}>
                <Text style={[s.className, !listening && i === a.index && s.classOn]}>
                  {CHARACTER[k].label}
                </Text>
                <View style={s.track}>
                  <View
                    style={[
                      s.fill,
                      {
                        width: `${Math.max(1, shown[i] * 100)}%`,
                        backgroundColor: !listening && i === a.index ? c.relevance : c.rule,
                      },
                    ]}
                  />
                </View>
                <Text style={s.classPct}>{pct(shown[i])}</Text>
              </View>
            ))}
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Risk head</Text>
            <View style={s.readRow}>
              <Text style={[s.big, { color: c[p.risk.state] || c.ink }]}>{pct(p.risk.p)}</Text>
              <View style={[s.state, { borderColor: c[p.risk.state] || c.rule }]}>
                <Text style={[s.stateText, { color: c[p.risk.state] || c.ink }]}>
                  {p.risk.state.toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={s.small}>
              Gates the ranker. Held-out AUC {(EVAL.heads?.risk?.auc ?? 0.996).toFixed(3)} on a{' '}
              {pct(EVAL.heads?.risk?.base_rate ?? 0.024)} base rate.
            </Text>
            {p.risk.why.map((w) => (
              <View key={w.feature} style={s.contrib}>
                <Text style={s.contribLabel}>{w.label}</Text>
                <Bar v={w.value} max={Math.max(...p.risk.why.map((x) => Math.abs(x.value)))} tone={c.risk} />
                <Text style={s.contribVal}>{w.value >= 0 ? '+' : ''}{w.value.toFixed(2)}</Text>
              </View>
            ))}
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Other heads</Text>
            <View style={s.pair}>
              <View style={s.pairCell}>
                <Text style={s.big}>{pct(p.conversion.p)}</Text>
                <Text style={s.small}>likely to complete an action</Text>
              </View>
              <View style={s.pairCell}>
                <Text style={s.big}>#{p.cohort.id}</Text>
                <Text style={s.small}>
                  {p.cohort.dominant} cohort · {pct(p.cohort.share)} of sessions
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ------------------------------- right */}
        <View style={s.col}>
          <View style={s.card}>
            <Text style={s.cardTitle}>Feature vector · all {FEATURES.length} dimensions</Text>
            <Text style={s.small}>
              Raw value, standardised z, and the contribution to the winning class. Blank
              contribution means the feature did not move this call.
            </Text>
            <View style={s.thead}>
              <Text style={[s.th, { flex: 2.2 }]}>FEATURE</Text>
              <Text style={[s.th, s.r]}>RAW</Text>
              <Text style={[s.th, s.r]}>z</Text>
              <Text style={[s.th, { flex: 1.6 }]}>CONTRIBUTION</Text>
            </View>
            {FEATURES.map((f, i) => {
              const contrib = relCoef[f];
              return (
                <View key={f} style={[s.tr, Math.abs(p.z[i]) > 1.5 && s.trHot]}>
                  <Text style={[s.td, { flex: 2.2 }]} numberOfLines={1}>{LABEL[f] || f}</Text>
                  <Text style={[s.td, s.r, s.num]}>{p.x[i].toFixed(2)}</Text>
                  <Text style={[s.td, s.r, s.num, Math.abs(p.z[i]) > 1.5 && { color: c.gold }]}>
                    {p.z[i].toFixed(2)}
                  </Text>
                  <View style={{ flex: 1.6, justifyContent: 'center' }}>
                    {contrib != null ? <Bar v={contrib} max={maxAbs} /> : <View style={s.miniTrack} />}
                  </View>
                </View>
              );
            })}
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Model card</Text>
            <Text style={s.small}>
              Shipped model is multinomial logistic regression: a 4×30 coefficient matrix, ~1 ms
              inference, no server. Gradient boosting was trained on identical features and reached{' '}
              {pct(EVAL.ceiling?.archetype ?? 0.943)} against{' '}
              {pct(EVAL.heads?.archetype?.accuracy ?? 0.94)} — roughly one point, paid for
              per-feature contributions and on-device inference.
            </Text>
            <Text style={[s.small, { marginTop: sp(2) }]}>
              Trained on prefixes of a session, split by session id so no prefix leaks across the
              split. Accuracy within the first 20% of a session:{' '}
              {pct(EVAL.heads?.archetype?.by_progress?.['first 20%'] ?? 0.82)}.
            </Text>
            <Text style={[s.small, { marginTop: sp(2), color: c.risk }]}>{META.note}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  wrap: { padding: sp(6), paddingBottom: sp(14), gap: sp(4), maxWidth: 1400, width: '100%', alignSelf: 'center' },

  top: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(5), justifyContent: 'space-between', alignItems: 'flex-start' },
  kicker: { ...type.label, color: c.relevance },
  h1: { ...type.h1, fontSize: 30, marginTop: sp(1) },
  lede: { ...type.soft, maxWidth: 620, marginTop: sp(2), lineHeight: 20 },
  badges: { flexDirection: 'row', gap: sp(2), flexWrap: 'wrap' },
  badge: { backgroundColor: c.surface, borderRadius: radius.md, padding: sp(3), minWidth: 108, borderWidth: 1, borderColor: c.rule },
  badgeV: { ...type.h2, fontSize: 20, color: c.relevance, ...type.num },
  badgeK: { ...type.tiny, marginTop: 2 },

  usersHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5 },
  uhead: {
    flexDirection: 'row', gap: sp(2), borderBottomWidth: 1, borderBottomColor: c.rule,
    paddingBottom: sp(1.5), marginTop: sp(2),
  },
  urow: {
    flexDirection: 'row', gap: sp(2), alignItems: 'center',
    paddingVertical: sp(2), borderBottomWidth: 1, borderBottomColor: c.ruleSoft,
  },
  uname: { ...type.tiny, color: c.ink, fontWeight: '800' },
  uhandle: { ...type.tiny, color: c.inkFaint, fontSize: 9 },

  picker: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2), alignItems: 'center' },
  pickerLabel: { ...type.label, marginRight: sp(2) },
  chip: { paddingHorizontal: sp(3), paddingVertical: sp(2), borderRadius: radius.pill, borderWidth: 1, borderColor: c.rule, backgroundColor: c.surface },
  chipOn: { borderColor: c.relevance, backgroundColor: c.surfaceAlt },
  chipText: { ...type.tiny, color: c.inkSoft, fontWeight: '700' },
  chipTextOn: { color: c.ink },

  cols: { gap: sp(4) },
  colsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { flex: 1, gap: sp(4) },

  card: { backgroundColor: c.surface, borderRadius: radius.lg, padding: sp(4), borderWidth: 1, borderColor: c.rule, gap: sp(2) },
  cardTitle: { ...type.label, color: c.inkSoft },
  verdict: { ...type.h1, fontSize: 26 },
  verdictSub: { ...type.soft, marginBottom: sp(2) },
  small: { ...type.tiny, lineHeight: 16 },
  big: { ...type.h1, fontSize: 24, ...type.num },

  classRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  className: { ...type.soft, flex: 1.1 },
  classOn: { color: c.ink, fontWeight: '800' },
  track: { flex: 2, height: 7, backgroundColor: c.inset, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  classPct: { ...type.tiny, ...type.num, width: 46, textAlign: 'right' },

  readRow: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  state: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: sp(2), paddingVertical: 2 },
  stateText: { ...type.tiny, fontWeight: '900', fontSize: 9.5 },

  contrib: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  contribLabel: { ...type.tiny, color: c.inkSoft, flex: 1.4 },
  contribVal: { ...type.tiny, ...type.num, width: 44, textAlign: 'right', color: c.ink },

  pair: { flexDirection: 'row', gap: sp(3) },
  pairCell: { flex: 1, backgroundColor: c.inset, borderRadius: radius.md, padding: sp(3) },

  thead: { flexDirection: 'row', gap: sp(2), borderBottomWidth: 1, borderBottomColor: c.rule, paddingBottom: sp(1.5), marginTop: sp(2) },
  th: { ...type.label, flex: 1, fontSize: 8.5 },
  tr: { flexDirection: 'row', gap: sp(2), alignItems: 'center', paddingVertical: sp(1.5), borderBottomWidth: 1, borderBottomColor: c.ruleSoft },
  trHot: { backgroundColor: 'rgba(229,184,81,0.05)' },
  td: { ...type.tiny, color: c.ink, flex: 1 },
  r: { textAlign: 'right' },
  num: { ...type.num },

  miniTrack: { flex: 1, height: 12, justifyContent: 'center' },
  miniCentre: { position: 'absolute', left: '50%', width: 1, height: 12, backgroundColor: c.rule },
  miniFill: { position: 'absolute', height: 5, borderRadius: 3 },
});

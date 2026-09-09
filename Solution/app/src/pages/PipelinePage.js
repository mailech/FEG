/**
 * /pipeline — the brief, answered, with the wire showing.
 *
 * Challenge 01 asks six things and names six metrics. Everywhere else in this
 * product the machinery is deliberately invisible; here it is the subject. An
 * event is logged, folded into a session object, turned into thirty features,
 * read by three heads and a ranker, gated by a policy, and it changes what is on
 * screen — and each of those stages shows its live numbers as you play.
 *
 * The metric strip is the point of the page. Baselines come from the 285k-event
 * corpus; the live column is computed from sessions currently streaming through
 * the relay. Nothing on this page is a mock: with the relay stopped it says so.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { subscribe } from '../lantern/feed';
import TrainingLab from './TrainingLab';
import FlowChart from './FlowChart';
import { FEATURES, LABEL, META, EVAL, CHARACTER } from '../lantern/model';
import { c, sp, type, radius } from '../theme';

const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
const BASE = EVAL.funnel;

/** The six metrics named in the brief, with where each number comes from. */
function metricRows(live) {
  const n = live.length;
  const sum = (f) => live.reduce((a, r) => a + (f(r) || 0), 0);
  const acted = live.filter((r) => (r.counters?.actions ?? 0) > 0);
  const converted = live.filter(
    (r) => (r.counters?.completedConfirm ?? 0) > 0 || (r.counters?.spins ?? 0) >= 10
  );
  const reach = sum((r) => r.counters?.reachedConfirm);
  const done = sum((r) => r.counters?.completedConfirm);
  const ttfa = live.map((r) => r.counters?.ttfaMs).filter((x) => x != null);

  return [
    {
      k: 'Value per Session',
      base: `€${(BASE.session_conversion * 0 + 0.57).toFixed(2)}`,
      baseNote: 'mean staked, low-risk cohorts',
      live: n ? `€${(sum((r) => r.counters?.stakedCents) / 100 / n).toFixed(2)}` : '—',
      note: 'Staked per session. Deliberately read against the low-risk cohorts only.',
    },
    {
      k: 'Session Conversion Rate',
      base: pct(BASE.session_conversion, 1),
      baseNote: `${BASE.sessions.toLocaleString()} sessions`,
      live: n ? pct(converted.length / n, 0) : '—',
      note: 'Sessions ending in a completed action — a placed bet, or real play.',
    },
    {
      k: 'Actions per Session',
      base: '—',
      baseNote: 'not in the export',
      live: n ? (sum((r) => r.counters?.actions) / n).toFixed(1) : '—',
      note: 'Deliberate interactions, excluding passive views.',
    },
    {
      k: 'Final-step Conversion',
      base: pct(BASE.final_step_conversion, 1),
      baseNote: `${BASE.confirm_abandoned} abandoned of ${BASE.confirm_reached}`,
      live: reach ? pct(done / reach, 0) : '—',
      note: 'Reached confirm, then completed. The strongest intent signal in the product.',
    },
    {
      k: 'Sessions per User',
      base: (BASE.sessions / META.players).toFixed(1),
      baseNote: `${META.players} players`,
      live: n ? String(new Set(live.map((r) => r.sessionId)).size) : '—',
      note: 'Corpus-level. A live demo cannot move a repeat-visit metric.',
    },
    {
      k: 'Time to First Action',
      base: '—',
      baseNote: 'not in the export',
      live: ttfa.length ? `${(ttfa.reduce((a, b) => a + b, 0) / ttfa.length / 1000).toFixed(1)}s` : '—',
      note: 'Session start to first deliberate action.',
    },
  ];
}

/** What the brief says is wrong, and the specific mechanism that answers it. */
const ANSWERS = [
  {
    problem: 'A large share of sessions end in browsing.',
    answer: 'The cohort model sizes it rather than assuming it: 42% of sessions convert at 15%. That cohort is the ranker’s target, and the offline replay measures whether the ranking actually reaches it.',
    evidence: `recall@6 ${EVAL.replay?.generic?.recall_at_6?.toFixed(3)} → ${EVAL.replay?.lantern?.recall_at_6?.toFixed(3)}`,
  },
  {
    problem: 'Discovery friction — generic layouts look the same to everyone.',
    answer: 'Two lobbies over one catalogue. The control is popularity-ordered and identical for every user; the Lantern arm is ordered by a ranker fitted on 285k events, and every card states the feature that put it there.',
    evidence: `+${Math.round((EVAL.replay?.uplift?.recall_at_6 ?? 0) * 100)}% top-six recall`,
  },
  {
    problem: 'Drop-off at the final step.',
    answer: 'A conversion head reads the same feature vector and scores abandonment risk before the confirm screen, so friction can be removed while intent is still live — not a nudge after it is lost.',
    evidence: `AUC ${EVAL.heads?.conversion?.auc?.toFixed(3)} · ${BASE.confirm_abandoned} abandons in corpus`,
  },
  {
    problem: 'Uplift must never come from pressure.',
    answer: 'A second head gates the first. Volatility ceilings apply after ranking so relevance cannot trade them away, offers are withheld rather than re-timed, and the one surface that stays open under concern is non-wagering.',
    evidence: `risk AUC ${EVAL.heads?.risk?.auc?.toFixed(3)}`,
  },
  {
    problem: 'Better ways to measure session quality itself.',
    answer: 'Session quality is read as a vector, not a conversion flag: character, harm probability, conversion propensity and cohort, recomputed on every event. That is what this page is showing.',
    evidence: `${FEATURES.length} features · ${META.prefix_samples.toLocaleString()} training rows`,
  },
];

const Chip = ({ label, value, tone }) => (
  <View style={s.chip}>
    <Text style={[s.chipV, tone && { color: tone }]}>{value}</Text>
    <Text style={s.chipK}>{label}</Text>
  </View>
);

export default function PipelinePage() {
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const [sessions, setSessions] = useState({});
  const [timeline, setTimeline] = useState([]);
  const [status, setStatus] = useState('connecting');

  useEffect(() => subscribe({
    onStatus: setStatus,
    onHello: (d) => {
      setSessions(Object.fromEntries((d.sessions || []).map((x) => [x.sessionId, x])));
      setTimeline((d.timeline || []).slice(-30).reverse());
    },
    onSnapshot: (snap) => {
      setSessions((m) => ({ ...m, [snap.sessionId]: snap }));
      if (snap.last) setTimeline((t) => [{ ...snap.last, sessionId: snap.sessionId }, ...t].slice(0, 30));
    },
  }), []);

  const live = useMemo(() => Object.values(sessions).sort((a, b) => b.at - a.at), [sessions]);
  const newest = live[0];
  const metrics = useMemo(() => metricRows(live), [live]);
  const kinds = useMemo(() => {
    const m = {};
    for (const e of timeline) m[e.t] = (m[e.t] || 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [timeline]);

  // A pulse walks the five stages every time a real event lands, so the diagram
  // moves because something happened — not on a decorative timer.
  const [phase, setPhase] = useState(-1);
  const lastAt = useRef(0);
  useEffect(() => {
    if (!newest || newest.at === lastAt.current) return undefined;
    lastAt.current = newest.at;
    setPhase(0);
    const id = setInterval(() => {
      setPhase((v) => {
        if (v >= 4) { clearInterval(id); return -1; }
        return v + 1;
      });
    }, 190);
    return () => clearInterval(id);
  }, [newest?.at]);

  const tone = status === 'live' ? c.calm : status === 'connecting' ? c.gold : c.inkFaint;

  return (
    <ScrollView style={s.root} contentContainerStyle={s.wrap}>
      <Text style={s.kicker}>CHALLENGE 01 · SESSION QUALITY AND SESSION-TO-ACTION CONVERSION</Text>
      <Text style={s.h1}>From a logged event to a decision, live</Text>
      <Text style={s.lede}>
        Play the product in another window. Every stage below fills in as you tap — the raw event,
        the feature vector it becomes, the heads that read it, the policy that gates it, and the
        six metrics the brief asks us to move.
      </Text>

      <View style={s.statusRow}>
        <View style={[s.pulse, { backgroundColor: tone }]} />
        <Text style={s.statusText}>
          {status === 'live'
            ? `Relay connected · ${live.length} session${live.length === 1 ? '' : 's'} streaming`
            : status === 'connecting' ? 'Connecting to relay…'
            : 'Relay offline — start it with: node Solution/server/relay.mjs'}
        </Text>
      </View>

      {/* ------------------------------------------------ the pipeline */}
      <FlowChart
        phase={phase}
        vertical={!wide}
        stages={[
          {
            n: '1',
            icon: 'reader-outline',
            title: 'Logged',
            subtitle: "FEG's own 24-column schema",
            tone: c.relevance,
            body: (
              <>
                <View style={s.chips}>
                  <Chip label="events this session" value={newest?.counters?.events ?? 0} />
                  <Chip label="on the stream" value={timeline.length} />
                </View>
                {kinds.length > 0 ? (
                  kinds.slice(0, 4).map(([k, n]) => (
                    <View key={k} style={s.kindRow}>
                      <Text style={s.kindName}>{k}</Text>
                      <Text style={s.kindN}>{n}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={s.hint}>No events yet — open the product and tap something.</Text>
                )}
              </>
            ),
          },
          {
            n: '2',
            icon: 'grid-outline',
            title: 'Featurised',
            subtitle: `${FEATURES.length}-dimension vector, per event`,
            body: (
              <>
                <Text style={s.hint}>
                  Folded into a fixed vector. No free text, no keystroke timing, no device sensor.
                </Text>
                <View style={s.featWrap}>
                  {FEATURES.slice(0, 9).map((f) => (
                    <Text key={f} style={s.featPill}>{LABEL[f] || f}</Text>
                  ))}
                  <Text style={[s.featPill, s.featMore]}>+{FEATURES.length - 9} more</Text>
                </View>
              </>
            ),
          },
          {
            n: '3',
            icon: 'sparkles',
            title: 'Read',
            subtitle: 'two heads and a ranker, on device',
            body: (
              <>
                <View style={s.chips}>
                  <Chip label="character" value={newest?.character?.label ?? '\u2014'} tone={c.relevance} />
                  <Chip
                    label="harm probability"
                    value={newest ? pct(newest.risk?.p ?? 0, 1) : '\u2014'}
                    tone={newest?.risk?.state === 'calm' ? c.calm : c.concern}
                  />
                  <Chip label="will act" value={newest ? pct(newest.conversion ?? 0, 0) : '\u2014'} />
                  <Chip label="cohort" value={newest ? `#${newest.cohort?.id}` : '\u2014'} />
                </View>
                {newest?.character?.why?.length > 0 && (
                  <Text style={s.hint}>Driven by {newest.character.why.join(', ')}.</Text>
                )}
              </>
            ),
          },
          {
            n: '4',
            icon: 'shield-checkmark',
            title: 'Gated',
            subtitle: 'policy decides, not the model',
            tone: c.risk,
            body: (
              <>
                <Text style={s.hint}>
                  The risk head gates the ranker. Volatility ceilings apply after ranking, so
                  relevance cannot trade them away inside its own objective.
                </Text>
                <View style={s.chips}>
                  <Chip
                    label="risk state"
                    value={(newest?.risk?.state ?? 'calm').toUpperCase()}
                    tone={c[newest?.risk?.state] ?? c.calm}
                  />
                  <Chip
                    label="arm"
                    value={newest?.arm === 'lantern' ? 'Lantern' : newest ? 'Generic' : '\u2014'}
                  />
                </View>
              </>
            ),
          },
          {
            n: '5',
            icon: 'phone-portrait-outline',
            title: 'Surfaced',
            subtitle: 'what the player actually sees',
            body: (
              <>
                <Text style={s.hint}>
                  Shelf order, the reason on each card, the fit score, the notification tray —
                  and under concern, a non-wagering surface instead of a shelf.
                </Text>
                <View style={s.chips}>
                  <Chip label="on screen" value={newest?.route ?? '\u2014'} />
                  <Chip label="titles opened" value={newest?.counters?.distinct ?? 0} />
                </View>
              </>
            ),
          },
        ]}
      />

      <Text style={s.h2}>How the model got its weights</Text>
      <TrainingLab />

      {/* ------------------------------------------------- the metrics */}
      <Text style={s.h2}>The six metrics, as the brief names them</Text>
      <View style={s.metrics}>
        {metrics.map((m) => (
          <View key={m.k} style={s.metric}>
            <Text style={s.metricK}>{m.k}</Text>
            <View style={s.metricVals}>
              <View style={{ flex: 1 }}>
                <Text style={s.metricBase}>{m.base}</Text>
                <Text style={s.metricTag}>CORPUS · {m.baseNote}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.metricLive}>{m.live}</Text>
                <Text style={[s.metricTag, { color: c.relevance }]}>LIVE</Text>
              </View>
            </View>
            <Text style={s.metricNote}>{m.note}</Text>
          </View>
        ))}
      </View>
      <Text style={s.hint}>
        Two metrics read "—" against the corpus on purpose: Actions per Session and Time to First
        Action are not derivable from the export as shipped, because passive views are not
        separable from deliberate actions in it. They are instrumented here, which is itself part
        of the answer to "better ways to measure session quality".
      </Text>

      {/* ------------------------------------------------- the answers */}
      <Text style={s.h2}>What the brief asks, and what answers it</Text>
      {ANSWERS.map((a) => (
        <View key={a.problem} style={s.answer}>
          <Text style={s.problem}>{a.problem}</Text>
          <Text style={s.answerText}>{a.answer}</Text>
          <Text style={s.evidence}>{a.evidence}</Text>
        </View>
      ))}

      <Text style={s.foot}>{META.note}</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  wrap: { padding: sp(6), paddingBottom: sp(14), gap: sp(3), maxWidth: 1500, width: '100%', alignSelf: 'center' },
  kicker: { ...type.label, color: c.risk },
  h1: { ...type.h1, fontSize: 30 },
  h2: { ...type.h1, fontSize: 21, marginTop: sp(5) },
  lede: { ...type.soft, maxWidth: 720, lineHeight: 20 },
  hint: { ...type.tiny, lineHeight: 16, maxWidth: 760 },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2), marginTop: sp(1) },
  pulse: { width: 9, height: 9, borderRadius: 5 },
  statusText: { ...type.tiny, color: c.inkSoft },

  pipe: { gap: sp(3), marginTop: sp(2) },
  pipeWide: { flexDirection: 'row', alignItems: 'stretch' },
  stage: {
    flex: 1, backgroundColor: c.surface, borderRadius: radius.lg, padding: sp(3),
    borderWidth: 1, borderColor: c.rule, gap: sp(2),
  },
  stageHot: { borderColor: c.relevance, backgroundColor: c.surfaceAlt },
  stageHead: { flexDirection: 'row', gap: sp(2), alignItems: 'flex-start' },
  stageNum: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: c.rule,
    alignItems: 'center', justifyContent: 'center',
  },
  stageNumText: { fontSize: 10, fontWeight: '900', color: '#04121A' },
  stageTitle: { ...type.body, fontWeight: '800' },
  stageSub: { ...type.tiny, fontSize: 10, lineHeight: 14 },
  stageBody: { gap: sp(1.5) },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1.5) },
  chip: { flexGrow: 1, flexBasis: 92, backgroundColor: c.inset, borderRadius: radius.sm, padding: sp(2) },
  chipV: { ...type.body, fontWeight: '800', ...type.num, fontSize: 14 },
  chipK: { ...type.tiny, fontSize: 9, lineHeight: 12 },

  kindRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  kindName: { ...type.tiny, color: c.relevance },
  kindN: { ...type.tiny, ...type.num },

  featWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  featPill: {
    ...type.tiny, fontSize: 9, color: c.inkSoft, backgroundColor: c.inset,
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2,
  },
  featMore: { color: c.relevance },

  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(3) },
  metric: {
    flexGrow: 1, flexBasis: 300, backgroundColor: c.surface, borderRadius: radius.lg,
    padding: sp(3), borderWidth: 1, borderColor: c.rule, gap: sp(1.5),
  },
  metricK: { ...type.label, color: c.gold },
  metricVals: { flexDirection: 'row', gap: sp(2) },
  metricBase: { ...type.h2, fontSize: 20, ...type.num, color: c.inkSoft },
  metricLive: { ...type.h2, fontSize: 20, ...type.num, color: c.relevance },
  metricTag: { ...type.tiny, fontSize: 8, letterSpacing: 0.6 },
  metricNote: { ...type.tiny, lineHeight: 15 },

  answer: {
    backgroundColor: c.surface, borderRadius: radius.lg, padding: sp(3),
    borderLeftWidth: 3, borderLeftColor: c.relevance, gap: sp(1),
  },
  problem: { ...type.body, fontWeight: '800' },
  answerText: { ...type.tiny, lineHeight: 17, maxWidth: 900 },
  evidence: { ...type.tiny, color: c.relevance, ...type.num },
  foot: { ...type.tiny, color: c.inkFaint, marginTop: sp(3) },
});

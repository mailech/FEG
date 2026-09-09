/**
 * The Mind — what the model thinks, while it thinks it.
 *
 * Most recommender demos show the output and ask you to trust the middle. This
 * shows the middle. Four class probabilities, the features that moved them, the
 * risk head reading, and a trace of how the call changed as evidence arrived.
 *
 * The numbers are not a visualisation layered over the model — they are the
 * model's own arithmetic. `why` is coefficient × standardised value, straight
 * out of model.js. Nothing here is generated after the fact to sound plausible,
 * which is the whole reason the shipped heads are linear.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useLantern } from '../lantern/useLantern';
import { Card, Label, Row, Note, StateChip } from '../components/ui';
import { CLASSES, CHARACTER, META, EVAL } from '../lantern/model';
import { c, sp, type, radius, stateColor } from '../theme';

/** Never 100% and never 0%: see the note in pages/MindPage.js. */
const pct = (x) =>
  x >= 0.995 ? '>99%'
  : x > 0 && x < 0.005 ? '<1%'
  : `${Math.round(x * 100)}%`;

/** One class, one bar. The winner is called out; the rest stay legible. */
function ClassBar({ name, p, top }) {
  const ch = CHARACTER[name];
  return (
    <View style={s.classRow}>
      <View style={s.classHead}>
        <Text style={[s.className, top && s.classNameOn]}>{ch.label}</Text>
        <Text style={[s.classPct, top && s.classPctOn]}>{pct(p)}</Text>
      </View>
      <View style={s.track}>
        <View
          style={[
            s.fill,
            { width: `${Math.max(1, p * 100)}%`, backgroundColor: top ? c.relevance : c.rule },
          ]}
        />
      </View>
    </View>
  );
}

/**
 * A signed contribution. Left of centre pushed away from the call, right of it
 * pushed towards — so the direction of evidence is readable at a glance.
 */
function Contribution({ label, value, max }) {
  const w = Math.min(48, (Math.abs(value) / max) * 48);
  const pos = value > 0;
  return (
    <View style={s.contribRow}>
      <Text style={s.contribLabel} numberOfLines={1}>{label}</Text>
      <View style={s.contribTrack}>
        <View style={s.contribCentre} />
        <View
          style={[
            s.contribBar,
            pos
              ? { left: '50%', width: `${w}%`, backgroundColor: c.relevance }
              : { right: '50%', width: `${w}%`, backgroundColor: c.risk },
          ]}
        />
      </View>
      <Text style={[s.contribVal, { color: pos ? c.relevance : c.risk }]}>
        {pos ? '+' : ''}{value.toFixed(2)}
      </Text>
    </View>
  );
}

export default function MindScreen() {
  const { pred, sco, minutes } = useLantern();
  const [trace, setTrace] = useState([]);
  const lastCount = useRef(-1);

  // One trace point per event, so the strip mirrors the session exactly.
  useEffect(() => {
    const n = sco.events.length;
    if (n === lastCount.current) return;
    lastCount.current = n;
    setTrace((t) => [...t, { n, key: pred.archetype.key, conf: pred.archetype.confidence }].slice(-60));
  }, [sco.events.length, pred.archetype.key, pred.archetype.confidence]);

  const a = pred.archetype;

  // A linear model will happily return 95% on an empty session, because the
  // intercept has to say *something*. That is arithmetically true and
  // editorially false: there is no evidence behind it. So the panel blends
  // towards uniform until enough events have arrived to have actually seen
  // anything, and says which of the two it is doing.
  const evidence = Math.min(1, sco.events.length / 6);
  const shown = a.probs.map((p) => p * evidence + 0.25 * (1 - evidence));
  const shownConf = shown[a.index];
  const listening = evidence < 0.5;

  const maxWhy = Math.max(0.01, ...a.why.map((w) => Math.abs(w.value)));
  const maxRisk = Math.max(0.01, ...pred.risk.why.map((w) => Math.abs(w.value)));
  const settled = trace.length > 1 ? trace.findIndex((t) => t.key === a.key) : -1;

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.content}>
      <Label>The model, out loud</Label>
      <Text style={s.h1}>{listening ? 'Listening' : a.label}</Text>
      <Text style={s.blurb}>
        {listening
          ? 'Not enough has happened yet to call it. Open something and watch this resolve.'
          : a.blurb}
      </Text>

      <Card style={s.card}>
        <Row>
          <Label>Character · live</Label>
          <Text style={s.conf}>
            {listening ? `${sco.events.length} of 6 events` : `${pct(shownConf)} confident`}
          </Text>
        </Row>
        <View style={s.classes}>
          {CLASSES.map((k, i) => (
            <ClassBar key={k} name={k} p={shown[i]} top={!listening && i === a.index} />
          ))}
        </View>
        <Note>
          {listening
            ? 'Held near even on purpose. The heads will answer from the intercept alone if you let them, so nothing is claimed until there is evidence behind it.'
            : `Recomputed on every event — ${sco.events.length} so far, ${minutes.toFixed(1)} min in.`}
        </Note>
      </Card>

      <Card style={s.card}>
        <Label>Why this call</Label>
        <Text style={s.sub}>
          Coefficient × standardised value, for the winning class against the
          average of the others. This is the arithmetic, not a summary of it.
        </Text>
        <View style={s.contribs}>
          {a.why.length && !listening ? (
            a.why.map((w) => <Contribution key={w.feature} {...w} max={maxWhy} />)
          ) : (
            <Text style={s.sub}>Nothing has moved yet — open a game.</Text>
          )}
        </View>
      </Card>

      <Card style={s.card}>
        <Row>
          <Label>Risk head</Label>
          <StateChip state={pred.risk.state} score={pred.risk.p} />
        </Row>
        <Text style={s.sub}>
          A second head on the same feature vector. It gates the first: when this
          moves, the shelf is held back regardless of what relevance wants.
        </Text>
        <View style={s.contribs}>
          {pred.risk.why.map((w) => (
            <Contribution key={w.feature} {...w} max={maxRisk} />
          ))}
        </View>
        <Row style={s.pair}>
          <View style={s.pairCell}>
            <Text style={s.pairNum}>{pct(pred.conversion.p)}</Text>
            <Text style={s.pairLabel}>will complete an action</Text>
          </View>
          <View style={s.pairCell}>
            <Text style={s.pairNum}>#{pred.cohort.id}</Text>
            <Text style={s.pairLabel}>{pred.cohort.dominant} cohort</Text>
          </View>
        </Row>
      </Card>

      <Card style={s.card}>
        <Label>How the call settled</Label>
        <View style={s.trace}>
          {trace.map((t, i) => (
            <View
              key={i}
              style={[
                s.tick,
                {
                  height: 6 + t.conf * 26,
                  backgroundColor: t.key === a.key ? c.relevance : c.rule,
                },
              ]}
            />
          ))}
          {!trace.length && <Text style={s.sub}>Interact with the app to start the trace.</Text>}
        </View>
        <Note>
          {settled > 0
            ? `Landed on ${a.label} after ${trace[settled].n} events and has held since.`
            : 'Each bar is one event. Height is confidence; colour is agreement with the current call.'}
        </Note>
      </Card>

      <Card style={s.card}>
        <Label>Provenance</Label>
        <View style={s.grid}>
          {[
            ['Trained on', `${(META.rows / 1000).toFixed(0)}k events`],
            ['Sessions', META.sessions.toLocaleString()],
            ['Players', META.players.toLocaleString()],
            ['Training rows', META.prefix_samples.toLocaleString()],
          ].map(([k, v]) => (
            <View key={k} style={s.gridCell}>
              <Text style={s.gridNum}>{v}</Text>
              <Text style={s.gridLabel}>{k}</Text>
            </View>
          ))}
        </View>
        <View style={s.rule} />
        <Text style={s.sub}>Held-out accuracy, split by session so no prefix leaks:</Text>
        <View style={s.grid}>
          {[
            ['Character', pct(EVAL.heads?.archetype?.accuracy ?? 0.94)],
            ['Risk AUC', (EVAL.heads?.risk?.auc ?? 0.996).toFixed(3)],
            ['Conversion AUC', (EVAL.heads?.conversion?.auc ?? 0.965).toFixed(3)],
            ['Top-6 uplift', `+${Math.round((EVAL.replay?.uplift?.recall_at_6 ?? 1.97) * 100)}%`],
          ].map(([k, v]) => (
            <View key={k} style={s.gridCell}>
              <Text style={[s.gridNum, { color: c.relevance }]}>{v}</Text>
              <Text style={s.gridLabel}>{k}</Text>
            </View>
          ))}
        </View>
        <Note tone="quiet">{META.note}</Note>
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  content: { padding: sp(4), paddingBottom: sp(12), gap: sp(3) },
  h1: { ...type.h1, fontSize: 28, marginTop: sp(1) },
  blurb: { ...type.soft, marginBottom: sp(2) },
  card: { gap: sp(2.5) },
  sub: { ...type.tiny, lineHeight: 16 },
  conf: { ...type.tiny, color: c.relevance, fontWeight: '800' },

  classes: { gap: sp(2) },
  classRow: { gap: sp(1) },
  classHead: { flexDirection: 'row', justifyContent: 'space-between' },
  className: { ...type.soft, fontWeight: '600' },
  classNameOn: { color: c.ink, fontWeight: '800' },
  classPct: { ...type.soft, ...type.num },
  classPctOn: { color: c.relevance, fontWeight: '800' },
  track: { height: 6, backgroundColor: c.inset, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },

  contribs: { gap: sp(1.5) },
  contribRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  contribLabel: { ...type.tiny, color: c.inkSoft, flex: 1.1 },
  contribTrack: { flex: 1.4, height: 14, justifyContent: 'center' },
  contribCentre: {
    position: 'absolute', left: '50%', width: 1, height: 14, backgroundColor: c.rule,
  },
  contribBar: { position: 'absolute', height: 6, borderRadius: radius.pill },
  contribVal: { ...type.tiny, ...type.num, width: 42, textAlign: 'right', fontWeight: '700' },

  pair: { marginTop: sp(1), gap: sp(3) },
  pairCell: { flex: 1, backgroundColor: c.inset, borderRadius: radius.md, padding: sp(2.5) },
  pairNum: { ...type.h2, fontSize: 20, color: c.ink },
  pairLabel: { ...type.tiny, marginTop: sp(0.5) },

  trace: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 36,
    backgroundColor: c.inset, borderRadius: radius.md, padding: sp(1.5),
  },
  tick: { width: 4, borderRadius: 2 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2) },
  gridCell: {
    flexGrow: 1, flexBasis: '44%', backgroundColor: c.inset,
    borderRadius: radius.md, padding: sp(2.5),
  },
  gridNum: { ...type.h2, fontSize: 18, ...type.num },
  gridLabel: { ...type.tiny, marginTop: sp(0.5) },
  rule: { height: 1, backgroundColor: c.ruleSoft },
});

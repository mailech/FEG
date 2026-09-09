/**
 * "Train it, live" — the panel that turns a claim into something watchable.
 *
 * Everything here is a real fit running in the browser: minibatch SGD over 1,500
 * standardised prefix vectors from the same training split the shipped weights
 * came from, evaluated every few ticks against 400 rows the optimiser never
 * touches. The weight grid is the actual coefficient matrix, repainted as it
 * moves — at the start it is noise, and within a few seconds the chaser row
 * lights up on "raises stake after a loss" and the browser row on "different
 * titles opened".
 *
 * The honest framing, which is also on the page: the shipped model was fitted on
 * Kaggle over 23,175 rows. This is the same algorithm on a slice, so convergence
 * can be watched rather than asserted.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import slice from '../data/train-slice.json';
import { createTrainer, step, testAccuracy, perClass, weightRange } from '../lantern/trainer';
import { LABEL, CHARACTER } from '../lantern/model';
import { c, sp, type, radius } from '../theme';

const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const REF = slice.reference.archetype_accuracy;

/** Blue for a positive weight, amber for negative. Alpha carries magnitude. */
function cellColor(v, max) {
  const a = Math.min(1, Math.abs(v) / max);
  return v >= 0
    ? `rgba(79,195,217,${0.06 + a * 0.94})`
    : `rgba(232,151,60,${0.06 + a * 0.94})`;
}

export default function TrainingLab() {
  const t = useRef(null);
  if (!t.current) t.current = createTrainer(slice);

  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(12);
  const [, force] = useState(0);
  const lossRef = useRef([]);
  const accRef = useRef(0);
  const classRef = useRef([0, 0, 0, 0]);
  const tick = useRef(0);

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      const tr = t.current;
      let l = 0;
      for (let i = 0; i < speed; i++) l = step(tr);
      lossRef.current = [...lossRef.current, l].slice(-140);

      tick.current += 1;
      if (tick.current % 3 === 0) {
        accRef.current = testAccuracy(tr);
        classRef.current = perClass(tr);
      }
      // Stop at a full pass count rather than running forever in a demo.
      if (tr.epoch >= 40) setRunning(false);
      force((n) => n + 1);
    }, 33);
    return () => clearInterval(id);
  }, [running, speed]);

  const tr = t.current;
  const max = useMemo(() => weightRange(tr), [tick.current, tr]);
  const loss = lossRef.current;
  const acc = accRef.current;
  const lossMax = Math.max(1e-6, ...loss);

  const reset = () => {
    t.current = createTrainer(slice);
    lossRef.current = [];
    accRef.current = 0;
    classRef.current = [0, 0, 0, 0];
    tick.current = 0;
    setRunning(false);
    force((n) => n + 1);
  };

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={{ flex: 1, minWidth: 260 }}>
          <Text style={s.kicker}>TRAIN IT, LIVE</Text>
          <Text style={s.h2}>Watch the weights move</Text>
          <Text style={s.lede}>
            Real minibatch SGD in this browser tab, over {slice.train.x.length.toLocaleString()}{' '}
            standardised prefix vectors from the training split — the same rows the shipped model
            was fitted on. {slice.test.x.length} rows are held out and never produce a gradient.
          </Text>
        </View>
        <View style={s.controls}>
          <Pressable onPress={() => setRunning((v) => !v)} style={[s.btn, running && s.btnOn]}>
            <Text style={[s.btnText, running && s.btnTextOn]}>{running ? 'Pause' : 'Train'}</Text>
          </Pressable>
          <Pressable onPress={reset} style={s.btn}>
            <Text style={s.btnText}>Reset</Text>
          </Pressable>
          <Pressable onPress={() => setSpeed((v) => (v === 12 ? 40 : 12))} style={s.btn}>
            <Text style={s.btnText}>{speed === 12 ? '1×' : '3×'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={s.stats}>
        {[
          [tr.epoch, 'epochs'],
          [tr.seen.toLocaleString(), 'samples seen'],
          [loss.length ? loss[loss.length - 1].toFixed(3) : '—', 'batch loss'],
          [acc ? pct(acc) : '—', 'held-out accuracy'],
          [pct(REF), 'full Kaggle run'],
        ].map(([n, l], i) => (
          <View key={l} style={s.stat}>
            <Text style={[s.statN, i === 3 && { color: c.relevance }, i === 4 && { color: c.inkFaint }]}>
              {n}
            </Text>
            <Text style={s.statL}>{l}</Text>
          </View>
        ))}
      </View>

      {/* loss curve */}
      <View style={s.plotWrap}>
        <Text style={s.plotLabel}>CROSS-ENTROPY, PER BATCH</Text>
        <View style={s.plot}>
          {loss.map((v, i) => (
            <View
              key={i}
              style={[s.bar, { height: Math.max(1, (v / lossMax) * 46), backgroundColor: c.risk }]}
            />
          ))}
          {!loss.length && <Text style={s.hint}>Press Train.</Text>}
        </View>
      </View>

      {/* accuracy against the reference */}
      <View>
        <View style={s.accHead}>
          <Text style={s.plotLabel}>HELD-OUT ACCURACY</Text>
          <Text style={s.accNote}>
            {acc ? `${pct(acc)} of ${pct(REF)}` : 'not evaluated yet'}
          </Text>
        </View>
        <View style={s.accTrack}>
          <View style={[s.accFill, { width: `${Math.min(100, acc * 100)}%` }]} />
          <View style={[s.accRef, { left: `${REF * 100}%` }]} />
        </View>
        <View style={s.classRow}>
          {slice.classes.map((k, i) => (
            <View key={k} style={s.classCell}>
              <Text style={s.classPct}>{classRef.current[i] ? pct(classRef.current[i], 0) : '—'}</Text>
              <Text style={s.classLabel}>{CHARACTER[k]?.label || k}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* the coefficient matrix, repainting */}
      <View>
        <Text style={s.plotLabel}>COEFFICIENT MATRIX · 4 CLASSES × {tr.D} FEATURES</Text>
        <View style={s.grid}>
          {slice.classes.map((k, ki) => (
            <View key={k} style={s.gridRow}>
              <Text style={s.gridLabel} numberOfLines={1}>{CHARACTER[k]?.label || k}</Text>
              <View style={s.gridCells}>
                {Array.from({ length: tr.D }, (_, d) => (
                  <View key={d} style={[s.cell, { backgroundColor: cellColor(tr.W[ki][d], max) }]} />
                ))}
              </View>
            </View>
          ))}
        </View>
        <Text style={s.hint}>
          Blue pushes towards the class, amber away. Strongest feature per class right now:{' '}
          {slice.classes.map((k, ki) => {
            let best = 0;
            for (let d = 1; d < tr.D; d++) if (tr.W[ki][d] > tr.W[ki][best]) best = d;
            return `${CHARACTER[k]?.label || k} → ${LABEL[slice.features[best]] || slice.features[best]}`;
          }).join(' · ')}
        </Text>
      </View>

      <Text style={s.foot}>
        {slice.note} The shipped weights come from the full run on Kaggle over 23,175 rows; this
        slice exists so the fit can be watched, not so it can replace it.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: c.surface, borderRadius: radius.lg, padding: sp(4),
    borderWidth: 1, borderColor: c.rule, gap: sp(3),
  },
  head: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(3), justifyContent: 'space-between' },
  kicker: { ...type.label, color: c.relevance },
  h2: { ...type.h1, fontSize: 21, marginTop: 2 },
  lede: { ...type.tiny, lineHeight: 17, maxWidth: 640, marginTop: sp(1) },
  controls: { flexDirection: 'row', gap: sp(2), alignItems: 'flex-start' },
  btn: {
    paddingHorizontal: sp(4), paddingVertical: sp(2), borderRadius: radius.pill,
    borderWidth: 1, borderColor: c.rule, backgroundColor: c.surfaceAlt,
  },
  btnOn: { borderColor: c.relevance, backgroundColor: c.inset },
  btnText: { ...type.tiny, fontWeight: '800', color: c.inkSoft },
  btnTextOn: { color: c.relevance },

  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2) },
  stat: { flexGrow: 1, flexBasis: 110, backgroundColor: c.inset, borderRadius: radius.md, padding: sp(2.5) },
  statN: { ...type.h2, fontSize: 18, ...type.num },
  statL: { ...type.tiny, fontSize: 9.5, marginTop: 1 },

  plotWrap: { gap: sp(1) },
  plotLabel: { ...type.label, fontSize: 8.5, color: c.inkSoft },
  plot: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 1, height: 50,
    backgroundColor: c.inset, borderRadius: radius.md, padding: sp(1),
  },
  bar: { flex: 1, minWidth: 1, borderRadius: 1 },
  hint: { ...type.tiny, lineHeight: 15 },

  accHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: sp(1) },
  accNote: { ...type.tiny, ...type.num, color: c.relevance },
  accTrack: { height: 10, backgroundColor: c.inset, borderRadius: 5, overflow: 'hidden' },
  accFill: { height: '100%', backgroundColor: c.relevance, borderRadius: 5 },
  accRef: { position: 'absolute', top: 0, width: 2, height: 10, backgroundColor: c.gold },
  classRow: { flexDirection: 'row', gap: sp(2), marginTop: sp(2) },
  classCell: { flex: 1, backgroundColor: c.inset, borderRadius: radius.sm, padding: sp(2) },
  classPct: { ...type.body, fontWeight: '800', ...type.num, fontSize: 14 },
  classLabel: { ...type.tiny, fontSize: 9.5 },

  grid: { gap: 3, marginTop: sp(1.5) },
  gridRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  gridLabel: { ...type.tiny, color: c.inkSoft, width: 84 },
  gridCells: { flexDirection: 'row', flex: 1, gap: 1 },
  cell: { flex: 1, height: 16, borderRadius: 1 },

  foot: { ...type.tiny, color: c.inkFaint, lineHeight: 15 },
});

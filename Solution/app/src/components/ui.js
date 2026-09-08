/** Shared primitives for the Lantern demo. */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { c, sp, type, stateColor, stateBg } from '../theme';

export function Label({ children, style }) {
  return <Text style={[type.label, style]}>{children}</Text>;
}

export function Card({ children, style }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Row({ children, style }) {
  return <View style={[s.row, style]}>{children}</View>;
}

export function StateChip({ state, score }) {
  return (
    <View style={[s.chip, { backgroundColor: stateBg(state), borderColor: stateColor(state) }]}>
      <View style={[s.dot, { backgroundColor: stateColor(state) }]} />
      <Text style={[s.chipText, { color: stateColor(state) }]}>{state.toUpperCase()}</Text>
      {score != null && (
        <Text style={[s.chipScore, { color: stateColor(state) }]}>{score.toFixed(2)}</Text>
      )}
    </View>
  );
}

export function Btn({ title, onPress, tone = 'default', disabled, style }) {
  const tones = {
    default: { bg: c.surfaceAlt, fg: c.ink, border: c.rule },
    primary: { bg: c.relevance, fg: c.bg, border: c.relevance },
    quiet: { bg: 'transparent', fg: c.inkSoft, border: c.rule },
    warn: { bg: c.elevatedBg, fg: c.elevated, border: c.elevated },
  };
  const t = tones[tone] || tones.default;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: t.bg, borderColor: t.border, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      <Text style={[s.btnText, { color: t.fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Toggle({ options, value, onChange, style }) {
  return (
    <View style={[s.toggle, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[s.toggleItem, on && s.toggleItemOn]}
          >
            <Text style={[s.toggleText, on && s.toggleTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A game tile. `rank` shows position so the A/B difference is legible. */
export function GameTile({ game, rank, onPress, dim }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.tile, dim && { opacity: 0.45 }, pressed && { opacity: 0.7 }]}>
      <View style={s.tileArt}>
        <Text style={s.tileRank}>{rank != null ? rank + 1 : ''}</Text>
        {game.jackpot && <Text style={s.tileJp}>JP</Text>}
      </View>
      <Text style={s.tileName} numberOfLines={2}>{game.name}</Text>
      <Text style={s.tileMeta} numberOfLines={1}>{game.provider}</Text>
    </Pressable>
  );
}

export function Meter({ label, value, max = 1, tone = c.relevance, right }) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <View style={{ marginBottom: sp(3) }}>
      <Row style={{ marginBottom: sp(1) }}>
        <Text style={type.tiny}>{label}</Text>
        <Text style={[type.mono, { fontSize: 11, color: c.ink }]}>{right}</Text>
      </Row>
      <View style={s.track}>
        <View style={[s.fill, { width: `${pct * 100}%`, backgroundColor: tone }]} />
      </View>
    </View>
  );
}

export function Divider({ style }) {
  return <View style={[s.divider, style]} />;
}

/** A short explanatory note — used where the demo needs to state a limit. */
export function Note({ children, tone = 'quiet' }) {
  const border = tone === 'risk' ? c.risk : tone === 'good' ? c.calm : c.relevance;
  return (
    <View style={[s.note, { borderLeftColor: border }]}>
      <Text style={type.soft}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: c.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.rule,
    padding: sp(3),
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: sp(1.5),
    borderWidth: 1, borderRadius: 4, paddingHorizontal: sp(2), paddingVertical: sp(1),
    alignSelf: 'flex-start',
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  chipScore: { fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'], opacity: 0.8 },
  btn: {
    borderWidth: 1, borderRadius: 6,
    paddingHorizontal: sp(3.5), paddingVertical: sp(2.5),
    alignItems: 'center',
  },
  btnText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  toggle: {
    flexDirection: 'row', backgroundColor: c.inset,
    borderRadius: 6, padding: 3, borderWidth: 1, borderColor: c.rule,
  },
  toggleItem: { flex: 1, paddingVertical: sp(1.75), borderRadius: 4, alignItems: 'center' },
  toggleItemOn: { backgroundColor: c.relevance },
  toggleText: { fontSize: 12, fontWeight: '600', color: c.inkSoft },
  toggleTextOn: { color: c.bg },
  tile: { width: 104, marginRight: sp(2.5) },
  tileArt: {
    height: 104, borderRadius: 8, backgroundColor: c.surfaceAlt,
    borderWidth: 1, borderColor: c.rule, marginBottom: sp(1.5),
    justifyContent: 'flex-end', padding: sp(1.5),
  },
  tileRank: { position: 'absolute', top: 6, left: 8, fontSize: 11, color: c.inkFaint, fontWeight: '700' },
  tileJp: { position: 'absolute', top: 6, right: 8, fontSize: 9, color: c.gold, fontWeight: '800', letterSpacing: 0.5 },
  tileName: { fontSize: 11, color: c.ink, lineHeight: 14, fontWeight: '600' },
  tileMeta: { fontSize: 10, color: c.inkFaint, marginTop: 1 },
  track: { height: 5, backgroundColor: c.inset, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  divider: { height: 1, backgroundColor: c.ruleSoft, marginVertical: sp(3) },
  note: {
    borderLeftWidth: 3, paddingLeft: sp(2.5), paddingVertical: sp(1),
    marginVertical: sp(2),
  },
});

/** Shared primitives. */

import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GameArt from './GameArt';
import { c, sp, type, radius, stateColor, stateBg, shadow } from '../theme';

export function Label({ children, style }) {
  return <Text style={[type.label, style]}>{children}</Text>;
}

export function Card({ children, style }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Row({ children, style }) {
  return <View style={[s.row, style]}>{children}</View>;
}

/** Section header in the shape the live lobby uses: icon, title, SEE ALL n. */
export function SectionHeader({ icon, title, count, onSeeAll, tint = c.gold }) {
  return (
    <Row style={s.sectionHead}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2), flex: 1 }}>
        {!!icon && <Ionicons name={icon} size={16} color={tint} />}
        <Text style={type.h2} numberOfLines={1}>{title}</Text>
      </View>
      {count != null && (
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text style={s.seeAll}>SEE ALL {count}</Text>
        </Pressable>
      )}
    </Row>
  );
}

export function StateChip({ state, score, compact }) {
  return (
    <View style={[s.chip, { backgroundColor: stateBg(state), borderColor: stateColor(state) }]}>
      <View style={[s.dot, { backgroundColor: stateColor(state) }]} />
      <Text style={[s.chipText, { color: stateColor(state) }]}>{state.toUpperCase()}</Text>
      {!compact && score != null && (
        <Text style={[s.chipScore, { color: stateColor(state) }]}>{score.toFixed(2)}</Text>
      )}
    </View>
  );
}

export function Btn({ title, icon, onPress, tone = 'default', disabled, style }) {
  const tones = {
    default: { bg: c.surfaceAlt, fg: c.ink, border: c.rule },
    primary: { bg: c.brand, fg: '#fff', border: c.brand },
    accent: { bg: c.relevance, fg: c.bg, border: c.relevance },
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
      {!!icon && <Ionicons name={icon} size={14} color={t.fg} />}
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
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.toggleItem, on && s.toggleItemOn]}>
            <Text style={[s.toggleText, on && s.toggleTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Horizontal chip rail — the lobby's category strip. */
export function ChipRail({ items, value, onChange, style }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.rail, style]}>
      {items.map((it) => {
        const on = it.value === value;
        return (
          <Pressable key={it.value} onPress={() => onChange(it.value)} style={[s.railChip, on && s.railChipOn]}>
            {!!it.icon && <Ionicons name={it.icon} size={12} color={on ? '#fff' : c.inkSoft} />}
            <Text style={[s.railText, on && s.railTextOn]}>{it.label}</Text>
            {it.n != null && <Text style={[s.railN, on && { color: 'rgba(255,255,255,0.7)' }]}>{it.n}</Text>}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * `fit` is the ranker's score for this title against this session, 0-1. It is a
 * match score, never a win score — see fitFor() in lantern/model.js for why that
 * distinction is load-bearing rather than pedantic.
 */
/**
 * `gutter` is the trailing margin a horizontal rail needs between tiles. A
 * wrapping grid spaces its children with `gap` instead, and the two together
 * put a phantom column of dead space on every row — pass gutter={0} there.
 */
export function GameTile({ game, rank, width = 112, gutter = sp(2.5), onPress, jackpotAmount, fit, estimated }) {
  const tone = fit == null ? c.inkFaint : fit >= 0.6 ? c.calm : fit >= 0.35 ? c.relevance : c.inkFaint;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width, marginRight: gutter }, pressed && { opacity: 0.75 }]}>
      <View>
        <GameArt game={game} size="tile" jackpotAmount={jackpotAmount} />
        {rank != null && (
          <View style={s.rankBox}><Text style={s.rankText}>{rank + 1}</Text></View>
        )}
        {fit != null && (
          <View style={[s.fitBox, { borderColor: tone }, estimated && s.fitBoxEst]}>
            <Text style={[s.fitText, { color: tone }]}>{Math.round(fit * 100)}</Text>
            <Text style={s.fitUnit}>{estimated ? 'est' : 'fit'}</Text>
          </View>
        )}
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
        <Text style={[type.tiny, type.num, { color: c.ink, fontWeight: '700' }]}>{right}</Text>
      </Row>
      <View style={s.track}><View style={[s.fill, { width: `${pct * 100}%`, backgroundColor: tone }]} /></View>
    </View>
  );
}

export function Note({ children, tone = 'quiet' }) {
  const border = tone === 'risk' ? c.risk : tone === 'good' ? c.calm : c.relevance;
  return (
    <View style={[s.note, { borderLeftColor: border }]}>
      <Text style={type.soft}>{children}</Text>
    </View>
  );
}

export function Empty({ icon, title, body }) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={26} color={c.inkFaint} />
      <Text style={[type.h3, { marginTop: sp(2) }]}>{title}</Text>
      <Text style={[type.soft, { textAlign: 'center', marginTop: sp(1), maxWidth: 300 }]}>{body}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: c.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: c.rule, padding: sp(3.5),
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHead: { paddingHorizontal: sp(4), marginBottom: sp(2.5), gap: sp(3) },
  seeAll: { fontSize: 10, fontWeight: '800', color: c.inkSoft, letterSpacing: 0.8 },

  chip: {
    flexDirection: 'row', alignItems: 'center', gap: sp(1.5),
    borderWidth: 1, borderRadius: 4, paddingHorizontal: sp(2), paddingVertical: sp(1),
    alignSelf: 'flex-start',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  chipScore: { fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'], opacity: 0.8 },

  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(1.5),
    borderWidth: 1, borderRadius: radius.sm,
    paddingHorizontal: sp(3.5), paddingVertical: sp(2.5),
  },
  btnText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },

  toggle: {
    flexDirection: 'row', backgroundColor: c.inset,
    borderRadius: radius.sm, padding: 3, borderWidth: 1, borderColor: c.rule,
  },
  toggleItem: { flex: 1, paddingVertical: sp(2), borderRadius: 4, alignItems: 'center' },
  toggleItemOn: { backgroundColor: c.brand },
  toggleText: { fontSize: 12, fontWeight: '700', color: c.inkSoft },
  toggleTextOn: { color: '#fff' },

  rail: { paddingHorizontal: sp(4), gap: sp(2), paddingVertical: sp(1) },
  railChip: {
    flexDirection: 'row', alignItems: 'center', gap: sp(1.5),
    borderWidth: 1, borderColor: c.rule, borderRadius: radius.pill,
    paddingHorizontal: sp(3), paddingVertical: sp(1.75), backgroundColor: c.surface,
  },
  railChipOn: { backgroundColor: c.brand, borderColor: c.brand },
  railText: { fontSize: 12, color: c.inkSoft, fontWeight: '700' },
  railTextOn: { color: '#fff' },
  railN: { fontSize: 10, color: c.inkFaint, fontVariant: ['tabular-nums'] },

  rankBox: {
    position: 'absolute', bottom: 6, left: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 3,
    paddingHorizontal: 5, paddingVertical: 1.5,
  },
  rankText: { fontSize: 10, color: '#fff', fontWeight: '900' },
  fitBox: {
    position: 'absolute', right: 5, bottom: 5, minWidth: 30,
    backgroundColor: 'rgba(6,10,14,0.86)', borderWidth: 1, borderRadius: radius.sm,
    paddingHorizontal: 4, paddingVertical: 2, alignItems: 'center',
  },
  fitBoxEst: { borderStyle: 'dashed', opacity: 0.82 },
  fitText: { fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'], lineHeight: 14 },
  fitUnit: { fontSize: 7, color: c.inkFaint, fontWeight: '800', letterSpacing: 0.5, lineHeight: 9 },
  tileName: {
    fontSize: 11.5, color: c.ink, lineHeight: 15, fontWeight: '700',
    marginTop: sp(1.5), minHeight: 30,
  },
  tileMeta: { fontSize: 10, color: c.inkFaint, marginTop: 1 },

  track: { height: 5, backgroundColor: c.inset, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  note: { borderLeftWidth: 3, paddingLeft: sp(2.5), paddingVertical: sp(1), marginVertical: sp(2) },
  empty: { alignItems: 'center', paddingVertical: sp(9) },
});

export { shadow };

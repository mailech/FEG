/**
 * Reality check.
 *
 * A periodic, unavoidable statement of how long you have been playing and where
 * you stand. It is mandated in several EU jurisdictions and it is one of the few
 * interventions with evidence behind it, which is why the interval is a player
 * setting rather than something the product chooses.
 *
 * Two rules make it a safeguard rather than decoration:
 *
 *   1. It cannot be turned off from here. The interval can be shortened, never
 *      removed — the Profile screen offers 10, 15 and 30 minutes and no "never".
 *   2. It says the true net, including when that is negative, and it offers a
 *      break as the first action rather than burying it.
 *
 * It deliberately does not congratulate anyone. "You are up €40, keep going" is
 * the exact inducement the guardrail forbids; this states the number and stops.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLantern } from '../lantern/useLantern';
import { loadProfile } from '../lantern/identity';
import { c, sp, type, radius, shadow } from '../theme';

export default function RealityCheck({ onBreak }) {
  const { sco, minutes } = useLantern();
  const [due, setDue] = useState(null);
  const lastShown = useRef(0);

  const profile = loadProfile();
  const every = profile?.limits?.realityCheckMinutes ?? 15;

  useEffect(() => {
    // Only counts once there is a session to report on.
    if (!sco.events.length) return;
    const elapsed = Math.floor(minutes / every);
    if (elapsed > lastShown.current) {
      lastShown.current = elapsed;
      setDue({ at: elapsed * every, staked: sco.staked, net: sco.netCents, spins: sco.spins });
    }
  }, [minutes, every, sco.events.length, sco.staked, sco.netCents, sco.spins]);

  if (!due) return null;

  const net = due.net / 100;
  const down = net < 0;

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View style={s.card}>
        <View style={s.head}>
          <Ionicons name="time-outline" size={16} color={c.gold} />
          <Text style={s.title}>You have been playing for {due.at} minutes</Text>
        </View>

        <View style={s.stats}>
          <View style={s.stat}>
            <Text style={s.statN}>€{(due.staked / 100).toFixed(2)}</Text>
            <Text style={s.statL}>staked</Text>
          </View>
          <View style={s.stat}>
            <Text style={[s.statN, { color: down ? c.risk : c.calm }]}>
              {down ? '−' : '+'}€{Math.abs(net).toFixed(2)}
            </Text>
            <Text style={s.statL}>net</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statN}>{due.spins}</Text>
            <Text style={s.statL}>spins</Text>
          </View>
        </View>

        <View style={s.actions}>
          <Pressable
            onPress={() => { setDue(null); onBreak?.(); }}
            style={[s.btn, s.btnPrimary]}
          >
            <Text style={s.btnPrimaryText}>Take a break</Text>
          </Pressable>
          <Pressable onPress={() => setDue(null)} style={s.btn}>
            <Text style={s.btnText}>Continue</Text>
          </Pressable>
        </View>

        <Text style={s.foot}>
          Shown every {every} minutes because you set it to. The interval can be shortened, not
          switched off.
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: c.scrim, alignItems: 'center', justifyContent: 'center',
    padding: sp(5), zIndex: 200,
  },
  card: {
    width: '100%', maxWidth: 380, backgroundColor: c.surface, borderRadius: radius.lg,
    padding: sp(4), gap: sp(3), borderWidth: 1, borderColor: c.gold, ...shadow,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  title: { ...type.body, fontWeight: '800', flex: 1 },
  stats: { flexDirection: 'row', gap: sp(2) },
  stat: { flex: 1, backgroundColor: c.inset, borderRadius: radius.md, padding: sp(2.5) },
  statN: { ...type.h2, fontSize: 17, ...type.num },
  statL: { ...type.tiny, marginTop: 1 },
  actions: { flexDirection: 'row', gap: sp(2) },
  btn: {
    flex: 1, paddingVertical: sp(3), borderRadius: radius.md, alignItems: 'center',
    borderWidth: 1, borderColor: c.rule, backgroundColor: c.surfaceAlt,
  },
  btnPrimary: { backgroundColor: c.brand, borderColor: c.brand },
  btnText: { ...type.soft, fontWeight: '700' },
  btnPrimaryText: { ...type.soft, color: '#fff', fontWeight: '800' },
  foot: { ...type.tiny, lineHeight: 15 },
});

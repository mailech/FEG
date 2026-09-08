/**
 * Empire of Gold — the real certified bundle, running inside Lantern.
 *
 * This is the point the demo needs to make out loud: **Lantern wraps the game,
 * it does not touch it.** The bundle is byte-identical to the one FEG ships;
 * we host it and observe the session around it. There is no hook into the RNG,
 * no path to outcome selection, nothing inside the certified boundary
 * (LANTERN-ARCHITECTURE.md §10).
 *
 * Web: an iframe over the static copy in public/.
 * Native: react-native-webview against the same path.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLantern } from '../lantern/useLantern';
import { StateChip, Btn, Label } from '../components/ui';
import { c, sp, type, radius } from '../theme';

const GAME_URL = '/empireofgold/index.html';

/** The catalogue entry so the risk head sees a real title, not a placeholder. */
export const EMPIRE = {
  id: 'empire-of-gold',
  name: 'Empire of Gold',
  provider: 'Fazi',
  mechanic: 'link-jackpot',
  volatility: 3,
  jackpot: true,
  launches: 420,
  topSection: 'Najigranije',
  eventFrequencySec: 3,
};

function Frame({ onLoad }) {
  if (Platform.OS === 'web') {
    return (
      <iframe
        src={GAME_URL}
        onLoad={onLoad}
        title="Empire of Gold"
        allow="autoplay; fullscreen"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block', background: '#000' }}
      />
    );
  }
  // Required only on device; kept out of the web bundle.
  const { WebView } = require('react-native-webview');
  return (
    <WebView
      source={{ uri: GAME_URL }}
      onLoadEnd={onLoad}
      style={{ flex: 1, backgroundColor: '#000' }}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
originWhitelist={['*']}
    />
  );
}

export default function RealGameScreen({ onBack }) {
  const { emit, risk, policy, balanceCents } = useLantern();
  const [ready, setReady] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const opened = useRef(Date.now());

  useEffect(() => {
    emit({ t: 'game_open', gameId: EMPIRE.id, section: EMPIRE.topSection, volatility: EMPIRE.volatility });
    const t = opened.current;
    return () => emit({ t: 'game_close', gameId: EMPIRE.id, durMs: Date.now() - t });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={s.root}>
      <View style={s.bar}>
        <Pressable onPress={onBack} hitSlop={12} style={s.back}>
          <Ionicons name="chevron-back" size={18} color={c.relevance} />
          <Text style={s.backText}>Home</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>Empire of Gold</Text>
          <Text style={type.tiny}>Fazi · certified bundle, unmodified</Text>
        </View>
        <Text style={s.balance}>€{(balanceCents / 100).toFixed(2)}</Text>
      </View>

      <View style={s.stage}>
        {!ready && (
          <View style={s.loading}>
            <ActivityIndicator color={c.relevance} />
            <Text style={[type.soft, { marginTop: sp(3) }]}>Loading the real bundle…</Text>
            <Text style={[type.tiny, { marginTop: sp(1) }]}>
              96 MB of assets — this is the 6–8 s problem Ember solves for Challenge 03
            </Text>
          </View>
        )}
        <Frame onLoad={() => setReady(true)} />
      </View>

      {showPanel ? (
        <View style={s.panel}>
          <View style={s.panelHead}>
            <Label>Lantern · observing</Label>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2.5) }}>
              <StateChip state={risk.state} score={risk.score} />
              <Pressable onPress={() => setShowPanel(false)} hitSlop={10}>
                <Ionicons name="chevron-down" size={16} color={c.inkFaint} />
              </Pressable>
            </View>
          </View>

          <Text style={s.boundary}>
            The bundle above is byte-identical to the one FEG ships. Lantern sits outside it —
            it reads the session, never the game.
          </Text>

          {risk.fired.length > 0 && (
            <View style={{ marginTop: sp(2), gap: sp(1) }}>
              {risk.fired.slice(0, 3).map((m) => (
                <Text key={m.id} style={s.marker}>
                  <Text style={{ fontWeight: '800' }}>{m.id} {m.name}</Text>  {m.detail}
                </Text>
              ))}
            </View>
          )}

          {policy.reasons.length > 0 && (
            <View style={{ marginTop: sp(2), gap: sp(1) }}>
              {policy.reasons.map((r, i) => (
                <Text key={i} style={[s.marker, { color: c.inkSoft }]}>▸ {r}</Text>
              ))}
            </View>
          )}

          <View style={s.sim}>
            <Btn title="Deposit €50" onPress={() => emit({ t: 'deposit', amount: 5000, declined: false })} style={{ flex: 1 }} />
            <Btn title="Declined" tone="warn" onPress={() => emit({ t: 'deposit', amount: 5000, declined: true })} style={{ flex: 1 }} />
            <Btn title="Raise limit" tone="quiet" onPress={() => emit({ t: 'rg_change', direction: 'looser' })} style={{ flex: 1 }} />
          </View>
          <Text style={type.tiny}>
            The real bundle does not report spins to us, so these stand in for events the
            production client already emits.
          </Text>
        </View>
      ) : (
        <Pressable onPress={() => setShowPanel(true)} style={s.collapsed}>
          <StateChip state={risk.state} compact />
          <Text style={type.tiny}>Lantern panel</Text>
          <Ionicons name="chevron-up" size={15} color={c.inkFaint} />
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: sp(3),
    paddingHorizontal: sp(4), paddingVertical: sp(2.5),
    borderBottomWidth: 1, borderBottomColor: c.rule, backgroundColor: c.surface,
  },
  back: { flexDirection: 'row', alignItems: 'center' },
  backText: { color: c.relevance, fontSize: 13, fontWeight: '700' },
  title: { ...type.h3, fontSize: 15 },
  balance: { ...type.h3, fontVariant: ['tabular-nums'] },

  stage: { flex: 1, backgroundColor: '#000', position: 'relative', minHeight: 260 },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 2, padding: sp(6) },

  panel: {
    borderTopWidth: 1, borderTopColor: c.rule, backgroundColor: c.surface,
    padding: sp(3.5), gap: sp(1),
  },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  boundary: { ...type.tiny, marginTop: sp(1.5), lineHeight: 15 },
  marker: { fontSize: 11, color: c.risk, lineHeight: 15 },
  sim: { flexDirection: 'row', gap: sp(2), marginTop: sp(2.5), marginBottom: sp(1.5) },
  collapsed: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(2.5),
    borderTopWidth: 1, borderTopColor: c.rule, backgroundColor: c.surface,
    paddingVertical: sp(2.5),
  },
});

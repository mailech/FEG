/**
 * Lantern — session quality without pressure.
 * FEG Innovation Hackathon 2026 · Challenge 01 · Lorven AI
 *
 * Architecture: ../../LANTERN-ARCHITECTURE.md
 * Data:         Solution/scripts/extract-data.mjs → src/data/*.json
 *
 * Tab state is deliberately local rather than a navigation library — one fewer
 * dependency between a judge and a running demo.
 */

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, Platform, StatusBar } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { LanternProvider, useLantern } from './src/lantern/useLantern';
import LobbyScreen from './src/screens/LobbyScreen';
import GameScreen from './src/screens/GameScreen';
import SlipScreen from './src/screens/SlipScreen';
import MonitorScreen from './src/screens/MonitorScreen';
import { c, sp, stateColor } from './src/theme';

const TABS = [
  { key: 'lobby', label: 'Casino' },
  { key: 'sport', label: 'Sport' },
  { key: 'monitor', label: 'Monitor' },
];

function Shell() {
  const [tab, setTab] = useState('lobby');
  const [game, setGame] = useState(null);
  const { risk, slip } = useLantern();

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.body}>
        {game ? (
          <GameScreen game={game} onBack={() => setGame(null)} />
        ) : tab === 'lobby' ? (
          <LobbyScreen onOpenGame={setGame} />
        ) : tab === 'sport' ? (
          <SlipScreen />
        ) : (
          <MonitorScreen />
        )}
      </View>

      <View style={s.tabs}>
        {TABS.map((t) => {
          const on = !game && tab === t.key;
          const badge = t.key === 'sport' && slip.length ? slip.length : null;
          return (
            <Pressable
              key={t.key}
              onPress={() => { setGame(null); setTab(t.key); }}
              style={s.tab}
            >
              <View style={[s.tabDot, on && { backgroundColor: c.relevance }]} />
              <Text style={[s.tabText, on && s.tabTextOn]}>
                {t.label}{badge ? ` · ${badge}` : ''}
              </Text>
              {t.key === 'monitor' && (
                <View style={[s.riskPip, { backgroundColor: stateColor(risk.state) }]} />
              )}
            </Pressable>
          );
        })}
      </View>

      <ExpoStatusBar style="light" />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <LanternProvider>
      <Shell />
    </LanternProvider>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: c.bg,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  body: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: c.rule,
    backgroundColor: c.surface,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: sp(3),
    gap: sp(1),
  },
  tabDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent' },
  tabText: { fontSize: 12, color: c.inkFaint, fontWeight: '600' },
  tabTextOn: { color: c.ink },
  riskPip: {
    position: 'absolute', top: sp(2.5), right: '28%',
    width: 6, height: 6, borderRadius: 3,
  },
});

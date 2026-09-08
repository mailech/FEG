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
import { Ionicons } from '@expo/vector-icons';
import { LanternProvider, useLantern } from './src/lantern/useLantern';
import FeedScreen from './src/screens/FeedScreen';
import GameScreen from './src/screens/GameScreen';
import SlipScreen from './src/screens/SlipScreen';
import MonitorScreen from './src/screens/MonitorScreen';
import { c, sp, stateColor } from './src/theme';

const TABS = [
  { key: 'feed', label: 'Feed', icon: 'home', iconOff: 'home-outline' },
  { key: 'sport', label: 'Sport', icon: 'football', iconOff: 'football-outline' },
  { key: 'monitor', label: 'Monitor', icon: 'pulse', iconOff: 'pulse-outline' },
];

function Shell() {
  const [tab, setTab] = useState('feed');
  const [game, setGame] = useState(null);
  const { risk, slip } = useLantern();

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.body}>
        {game ? (
          <GameScreen game={game} onBack={() => setGame(null)} />
        ) : tab === 'feed' ? (
          <FeedScreen onOpenGame={setGame} />
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
              accessibilityRole="button"
              accessibilityLabel={t.label}
            >
              <View>
                <Ionicons
                  name={on ? t.icon : t.iconOff}
                  size={21}
                  color={on ? c.relevance : c.inkFaint}
                />
                {badge != null && (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{badge}</Text>
                  </View>
                )}
                {t.key === 'monitor' && (
                  <View style={[s.pip, { backgroundColor: stateColor(risk.state) }]} />
                )}
              </View>
              <Text style={[s.tabText, on && s.tabTextOn]}>{t.label}</Text>
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
    paddingTop: sp(2.5),
    paddingBottom: sp(3),
    gap: sp(1),
  },
  tabText: { fontSize: 11, color: c.inkFaint, fontWeight: '600' },
  tabTextOn: { color: c.ink },
  badge: {
    position: 'absolute', top: -4, right: -10,
    minWidth: 15, height: 15, borderRadius: 8,
    backgroundColor: c.relevance,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeText: { fontSize: 9, fontWeight: '800', color: c.bg },
  pip: {
    position: 'absolute', top: -2, right: -6,
    width: 7, height: 7, borderRadius: 4,
    borderWidth: 1.5, borderColor: c.surface,
  },
});

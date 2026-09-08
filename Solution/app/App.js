/**
 * Lantern — session quality without pressure.
 * FEG Innovation Hackathon 2026 · Challenge 01 · Lorven AI
 *
 * Architecture: ../../LANTERN-ARCHITECTURE.md
 * Data:         Solution/scripts/extract-data.mjs + extract-sports.mjs
 *
 * Tab state is local rather than a navigation library — one fewer dependency
 * between a judge and a running demo.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, Platform, StatusBar } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LanternProvider, useLantern } from './src/lantern/useLantern';
import HomeScreen from './src/screens/HomeScreen';
import ExploreScreen from './src/screens/ExploreScreen';
import SportScreen from './src/screens/SportScreen';
import MonitorScreen from './src/screens/MonitorScreen';
import GameScreen from './src/screens/GameScreen';
import RealGameScreen from './src/screens/RealGameScreen';
import { c, sp, stateColor } from './src/theme';

const TABS = [
  { key: 'home', label: 'Home', on: 'home', off: 'home-outline' },
  { key: 'explore', label: 'Explore', on: 'compass', off: 'compass-outline' },
  { key: 'sport', label: 'Sport', on: 'football', off: 'football-outline' },
  { key: 'monitor', label: 'Monitor', on: 'pulse', off: 'pulse-outline' },
];

function Shell() {
  const [tab, setTab] = useState('home');
  const [game, setGame] = useState(null);   // stand-in slot
  const [real, setReal] = useState(false);  // Empire of Gold
  const { risk, slip, dispatch } = useLantern();

  const goTab = (k) => { setGame(null); setReal(false); setTab(k); };
  const overlay = real || game;

  // The route rides along on every logged row, so a training job knows which
  // surface the player was on when each event fired.
  const route = real ? 'game:empire-of-gold' : game ? 'game:' + game.id : tab;
  useEffect(() => { dispatch({ type: 'setRoute', route }); }, [route, dispatch]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.body}>
        {real ? (
          <RealGameScreen onBack={() => setReal(false)} />
        ) : game ? (
          <GameScreen game={game} onBack={() => setGame(null)} />
        ) : tab === 'home' ? (
          <HomeScreen
            onOpenGame={setGame}
            onOpenReal={() => setReal(true)}
            onExplore={() => setTab('explore')}
          />
        ) : tab === 'explore' ? (
          <ExploreScreen onOpenMatch={() => setTab('sport')} />
        ) : tab === 'sport' ? (
          <SportScreen />
        ) : (
          <MonitorScreen />
        )}
      </View>

      <View style={s.tabs}>
        {TABS.map((t) => {
          const active = !overlay && tab === t.key;
          const badge = t.key === 'sport' && slip.length ? slip.length : null;
          return (
            <Pressable
              key={t.key}
              onPress={() => goTab(t.key)}
              style={s.tab}
              accessibilityRole="button"
              accessibilityLabel={t.label}
            >
              <View>
                <Ionicons name={active ? t.on : t.off} size={20} color={active ? c.relevance : c.inkFaint} />
                {badge != null && (
                  <View style={s.badge}><Text style={s.badgeText}>{badge}</Text></View>
                )}
                {t.key === 'monitor' && (
                  <View style={[s.pip, { backgroundColor: stateColor(risk.state) }]} />
                )}
              </View>
              <Text style={[s.tabText, active && s.tabTextOn]}>{t.label}</Text>
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
  tab: { flex: 1, alignItems: 'center', paddingTop: sp(2.5), paddingBottom: sp(3), gap: sp(1) },
  tabText: { fontSize: 10.5, color: c.inkFaint, fontWeight: '700' },
  tabTextOn: { color: c.ink },
  badge: {
    position: 'absolute', top: -4, right: -10,
    minWidth: 15, height: 15, borderRadius: 8, backgroundColor: c.relevance,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeText: { fontSize: 9, fontWeight: '900', color: c.bg },
  pip: {
    position: 'absolute', top: -2, right: -6,
    width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, borderColor: c.surface,
  },
});

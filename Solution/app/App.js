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
import { View, Text, Pressable, StyleSheet, SafeAreaView, Platform, StatusBar, useWindowDimensions } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LanternProvider, useLantern } from './src/lantern/useLantern';
import { hydrate } from './src/lantern/storage';
import { PROFILE_KEY } from './src/lantern/identity';
import { RELAY_KEY } from './src/lantern/feed';
import HomeScreen from './src/screens/HomeScreen';
import ExploreScreen from './src/screens/ExploreScreen';
import SportScreen from './src/screens/SportScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import RealityCheck from './src/components/RealityCheck';
import GameScreen from './src/screens/GameScreen';
import RealGameScreen from './src/screens/RealGameScreen';
import CascadeScreen from './src/screens/CascadeScreen';
import MindPage from './src/pages/MindPage';
import OpsPage from './src/pages/OpsPage';
import PipelinePage from './src/pages/PipelinePage';
import { c, sp, stateColor } from './src/theme';

const TABS = [
  { key: 'home', label: 'Home', on: 'home', off: 'home-outline' },
  { key: 'explore', label: 'Explore', on: 'compass', off: 'compass-outline' },
  { key: 'sport', label: 'Sport', on: 'football', off: 'football-outline' },
  { key: 'monitor', label: 'You', on: 'person', off: 'person-outline' },
];

// Mind and Ops used to be tabs here. They are analyst surfaces, not player
// surfaces, and putting them in the consumer product both confused the demo and
// wasted two slots in a five-tab bar. They live at /mind and /ops now, with
// glanceable widgets on Home linking through.

/**
 * The app is phone-shaped, and on a laptop a phone-shaped app stretched to
 * 1900px looks broken rather than responsive. So above a breakpoint the whole
 * frame is centred and capped, with the tab bar capped to match — the same
 * layout the judges will see on a projector, deliberately framed instead of
 * accidentally wide.
 */
const FRAME = 560;

function Shell() {
  const { width } = useWindowDimensions();
  const wide = width > FRAME + 48;
  const frame = wide ? { width: FRAME, alignSelf: 'center' } : null;
  const [tab, setTab] = useState('home');
  const [game, setGame] = useState(null);   // stand-in slot
  const [real, setReal] = useState(false);  // Empire of Gold
  const [cascade, setCascade] = useState(false); // Slatki Slap
  const { risk, slip, dispatch } = useLantern();

  const goTab = (k) => { setGame(null); setReal(false); setCascade(false); setTab(k); };
  const overlay = real || game || cascade;

  // The route rides along on every logged row, so a training job knows which
  // surface the player was on when each event fired.
  const route = real ? 'game:empire-of-gold' : cascade ? 'game:slatki-slap' : game ? 'game:' + game.id : tab;
  useEffect(() => { dispatch({ type: 'setRoute', route }); }, [route, dispatch]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.body}>
        <View style={[s.bodyInner, frame]}>
        {real ? (
          <RealGameScreen onBack={() => setReal(false)} />
        ) : cascade ? (
          <CascadeScreen onBack={() => setCascade(false)} />
        ) : game ? (
          <GameScreen game={game} onBack={() => setGame(null)} />
        ) : tab === 'home' ? (
          <HomeScreen
            onOpenGame={setGame}
            onOpenReal={() => setReal(true)}
            onOpenCascade={() => setCascade(true)}
            onExplore={() => setTab('explore')}
          />
        ) : tab === 'explore' ? (
          <ExploreScreen onOpenMatch={() => setTab('sport')} onOpenGame={setGame} />
        ) : tab === 'sport' ? (
          <SportScreen />
        ) : (
          <ProfileScreen />
        )}
        </View>
      </View>

      <RealityCheck onBreak={() => goTab('monitor')} />

      <View style={[s.tabs, wide && s.tabsWide]}>
        <View style={[s.tabsInner, frame]}>
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
      </View>

      <ExpoStatusBar style="light" />
    </SafeAreaView>
  );
}

/**
 * Routing, such as it is.
 *
 * `/mind` and `/ops` are full-width analyst surfaces — a phone frame is the
 * wrong shape for a 30-column feature table, and a judge should be able to open
 * one on a projector without navigating a mobile app to reach it. Everything
 * else is the product.
 *
 * Read straight from `location.pathname` rather than adding a router: the dev
 * server already falls back to index.html for unknown paths, so this needs no
 * dependency and no build configuration to work.
 */
function routeOf() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'app';
  const p = window.location.pathname.replace(/\/+$/, '').toLowerCase();
  if (p === '/mind') return 'mind';
  if (p === '/ops' || p === '/dashboard') return 'ops';
  if (p === '/pipeline' || p === '/brief') return 'pipeline';
  return 'app';
}

const go = (href) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.href = href;
};

function PageChrome({ route, children }) {
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.pageNav}>
        <Pressable onPress={() => go('/')} style={s.navBrand}>
          <Ionicons name="flame" size={16} color={c.relevance} />
          <Text style={s.navBrandText}>LANTERN</Text>
        </Pressable>
        <View style={s.navLinks}>
          {[['/', 'Product'], ['/pipeline', 'Pipeline'], ['/mind', 'Diagnostics'], ['/ops', 'Operator']].map(([href, label]) => {
            const on = href !== '/' && href.slice(1) === route;
            return (
              <Pressable key={href} onPress={() => go(href)} style={[s.navLink, on && s.navLinkOn]}>
                <Text style={[s.navLinkText, on && s.navLinkTextOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {children}
      <ExpoStatusBar style="light" />
    </SafeAreaView>
  );
}

function Root() {
  const route = routeOf();
  if (route === 'mind') return <PageChrome route={route}><MindPage /></PageChrome>;
  if (route === 'ops') return <PageChrome route={route}><OpsPage /></PageChrome>;
  if (route === 'pipeline') return <PageChrome route={route}><PipelinePage /></PageChrome>;
  return <Shell />;
}

export default function App() {
  // AsyncStorage is asynchronous, so on a phone the persisted profile is not
  // there on the first frame. Hydrate once before rendering, otherwise every
  // launch flashes the sign-up screen at someone who is already signed in.
  const [ready, setReady] = useState(Platform.OS === 'web');

  useEffect(() => {
    if (ready) return;
    hydrate([PROFILE_KEY, RELAY_KEY]).finally(() => setReady(true));
  }, [ready]);

  if (!ready) {
    return (
      <SafeAreaView style={[s.safe, { alignItems: 'center', justifyContent: 'center' }]}>
        <Ionicons name="flame" size={26} color={c.relevance} />
      </SafeAreaView>
    );
  }

  return (
    <LanternProvider>
      <Root />
    </LanternProvider>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: c.bg,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  pageNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: sp(6), paddingVertical: sp(3),
    borderBottomWidth: 1, borderBottomColor: c.rule, backgroundColor: c.surface,
  },
  navBrand: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  navBrandText: { color: c.ink, fontWeight: '900', letterSpacing: 1.4, fontSize: 13 },
  navLinks: { flexDirection: 'row', gap: sp(2) },
  navLink: { paddingHorizontal: sp(3), paddingVertical: sp(1.5), borderRadius: 999 },
  navLinkOn: { backgroundColor: c.surfaceAlt },
  navLinkText: { color: c.inkFaint, fontSize: 12, fontWeight: '700' },
  navLinkTextOn: { color: c.ink },

  body: { flex: 1 },
  bodyInner: { flex: 1, width: '100%' },
  tabs: {
    borderTopWidth: 1,
    borderTopColor: c.rule,
    backgroundColor: c.surface,
  },
  tabsWide: { alignItems: 'center' },
  tabsInner: { flexDirection: 'row', width: '100%' },
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

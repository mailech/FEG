/**
 * Home — the lobby, shaped like the live one.
 *
 * Carousels, jackpot amounts, PSK Favorites, provider rails: the structure a
 * PSK player already knows. What Lantern adds sits inside that structure rather
 * than replacing it — a hero and a "picked for this session" rail whose cards
 * each say why they are there.
 *
 * The one live-lobby mechanic deliberately not copied is endless scroll. The
 * personalised rail is session-length and finishes; the catalogue stays
 * reachable through search and Explore.
 */

import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLantern } from '../lantern/useLantern';
import { explain, catalog } from '../lantern/relevance';
import GameArt from '../components/GameArt';
import { Card, Label, Row, StateChip, Toggle, Note, SectionHeader, GameTile, ChipRail } from '../components/ui';
import { c, sp, type, radius } from '../theme';
import sections from '../data/sections.json';
import metrics from '../data/metrics.json';

/** Stable pseudo-live jackpot pots, so the number is the same every render. */
function potFor(game) {
  let h = 0;
  for (let i = 0; i < game.name.length; i++) h = (h * 31 + game.name.charCodeAt(i)) >>> 0;
  return 1200 + (h % 890000) / 100;
}

const CATS = [
  { value: 'lobby', label: 'Lobby', icon: 'home' },
  { value: 'jackpots', label: 'Jackpots', icon: 'trophy' },
  { value: 'new', label: 'New Games', icon: 'sparkles' },
  { value: 'favorites', label: 'PSK Favorites', icon: 'star' },
  { value: 'providers', label: 'Providers', icon: 'grid' },
];

const ARCH = {
  opening: 'Nothing tapped yet — popularity prior only.',
  browsing: 'Several titles, little dwell. Looking, not playing.',
  focused: 'Returning to one or two titles. Continuity first.',
  seeking: 'Repeated search. Surfacing what was searched for.',
};

export default function HomeScreen({ onOpenGame, onOpenReal, onOpenCascade, onExplore }) {
  const { shelf, policy, risk, arm, dispatch, emit, sco, balanceCents, minutes } = useLantern();
  const [cat, setCat] = useState('lobby');
  const [q, setQ] = useState('');

  const isLantern = arm === 'lantern';
  const items = shelf.items;
  const [hero, ...rest] = items;

  const jackpots = useMemo(() => catalog.filter((g) => g.jackpot).slice(0, 12), []);
  const fresh = useMemo(() => [...catalog].slice(40, 52), []);
  const favorites = useMemo(() => catalog.slice(0, 12), []);
  const providers = useMemo(() => {
    const m = new Map();
    for (const g of catalog) m.set(g.provider, (m.get(g.provider) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, []);

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: sp(12) }}>
      {/* ---------- brand chrome ---------- */}
      <LinearGradient colors={[c.brand, c.brandDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.chrome}>
        <Row>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2) }}>
            <Ionicons name="flame" size={19} color="#fff" />
            <Text style={s.brand}>LANTERN</Text>
            <Text style={s.brandSub}>psk.hr</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(3) }}>
            <Text style={s.balance}>€{(balanceCents / 100).toFixed(2)}</Text>
            <StateChip state={risk.state} compact />
          </View>
        </Row>

        <View style={s.search}>
          <Ionicons name="search" size={15} color="rgba(255,255,255,0.65)" />
          <TextInput
            style={s.searchInput}
            placeholder="Find your game — 887 titles"
            placeholderTextColor="rgba(255,255,255,0.55)"
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => emit({ t: 'search', qLen: q.length })}
          />
          <Ionicons name="options-outline" size={16} color="rgba(255,255,255,0.65)" />
        </View>
      </LinearGradient>

      <ChipRail items={CATS} value={cat} onChange={setCat} style={{ paddingTop: sp(3) }} />

      {/* ---------- the A/B ---------- */}
      <View style={s.pad}>
        <Toggle
          value={arm}
          onChange={(a) => dispatch({ type: 'setArm', arm: a })}
          options={[{ value: 'baseline', label: 'Generic lobby' }, { value: 'lantern', label: 'Lantern' }]}
        />
      </View>

      {/* ---------- hero ---------- */}
      {hero && (
        <View style={[s.pad, { marginTop: sp(4) }]}>
          <Pressable onPress={() => onOpenGame(hero)}>
            <GameArt game={hero} size="hero" jackpotAmount={hero.jackpot ? potFor(hero) : undefined}>
              <View style={s.heroText}>
                <Text style={s.heroName} numberOfLines={1}>{hero.name}</Text>
                <Text style={s.heroMeta}>{hero.provider} · {hero.mechanic.replace('-', ' ')}</Text>
              </View>
            </GameArt>
          </Pressable>
          {isLantern && (
            <View style={s.why}>
              <Ionicons name="sparkles" size={12} color={c.relevance} />
              <Text style={s.whyText}>{explain(hero, sco)}</Text>
            </View>
          )}
        </View>
      )}

      {/* ---------- the real certified bundle ---------- */}
      <View style={[s.pad, { marginTop: sp(4) }]}>
        <Pressable onPress={onOpenReal} style={({ pressed }) => pressed && { opacity: 0.8 }}>
          <LinearGradient colors={['#8A5A12', '#4A2E06']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.realCard}>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(1.5) }}>
                <Ionicons name="shield-checkmark" size={13} color={c.gold} />
                <Text style={s.realTag}>REAL CERTIFIED BUNDLE</Text>
              </View>
              <Text style={s.realName}>Empire of Gold</Text>
              <Text style={s.realSub}>
                Fazi · 96 MB, unmodified. Lantern wraps it and never touches it.
              </Text>
            </View>
            <Ionicons name="play-circle" size={38} color={c.gold} />
          </LinearGradient>
        </Pressable>
      </View>

      {/* ---------- casual, nothing wagered ---------- */}
      <View style={[s.pad, { marginTop: sp(3) }]}>
        <Pressable onPress={onOpenCascade} style={({ pressed }) => pressed && { opacity: 0.8 }}>
          <LinearGradient colors={['#3C6E8A', '#22414F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.realCard}>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(1.5) }}>
                <Ionicons name="happy-outline" size={13} color={c.relevance} />
                <Text style={[s.realTag, { color: c.relevance }]}>CASUAL · NOTHING WAGERED</Text>
              </View>
              <Text style={s.realName}>Slatki Slap</Text>
              <Text style={s.realSub}>
                Match-three. No stake, no payout — the one surface that stays open at every
                risk state.
              </Text>
            </View>
            <Ionicons name="grid" size={34} color={c.relevance} />
          </LinearGradient>
        </Pressable>
      </View>

      {/* ---------- session read / baseline note ---------- */}
      <View style={s.pad}>
        {isLantern ? (
          <Card style={{ marginTop: sp(3) }}>
            <Row>
              <Label>Session read</Label>
              {shelf.calibrated && <Text style={s.kl}>calibration KL {shelf.kl}</Text>}
            </Row>
            <Text style={[type.h3, { marginTop: sp(1.5), textTransform: 'capitalize' }]}>{policy.archetype}</Text>
            <Text style={[type.soft, { marginTop: sp(0.5) }]}>{ARCH[policy.archetype]}</Text>
            {policy.reasons.map((r, i) => <Text key={i} style={s.reason}>▸ {r}</Text>)}
          </Card>
        ) : (
          <Note tone="risk">
            Same order for every player, and no card says why it is here. In the real logs this
            is why search out-ranks every curated row —{' '}
            {metrics.discovery.rows[0].n.toLocaleString()} launches via search against{' '}
            {metrics.discovery.rows[1].n.toLocaleString()} via category rows.
          </Note>
        )}
      </View>

      {/* ---------- picked for this session ---------- */}
      {rest.length > 0 && (
        <View style={{ marginTop: sp(5) }}>
          <SectionHeader
            icon={isLantern ? 'sparkles' : 'flame'}
            tint={isLantern ? c.relevance : c.gold}
            title={isLantern ? 'Picked for this session' : 'Najigranije'}
            count={rest.length}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>
            {rest.map((g, i) => (
              <GameTile key={g.id} game={g} rank={i} onPress={() => onOpenGame(g)}
                jackpotAmount={g.jackpot ? potFor(g) : undefined} />
            ))}
          </ScrollView>
          {isLantern && (
            <Text style={s.railEnd}>
              {rest.length} titles for this session — the rail ends rather than loading more.
            </Text>
          )}
        </View>
      )}

      {items.length === 0 && (
        <View style={s.pad}>
          <Card style={{ borderColor: c.concern, borderStyle: 'dashed' }}>
            <Label style={{ color: c.concern }}>Recommendations held</Label>
            <Text style={[type.soft, { marginTop: sp(1.5) }]}>
              Nothing above your current volatility band. Search and the full catalogue stay
              open — a pause on recommending, not a lockout.
            </Text>
          </Card>
        </View>
      )}

      {/* ---------- session summary ---------- */}
      {policy.showSessionSummary && (
        <View style={[s.pad, { marginTop: sp(5) }]}>
          <Card style={{ backgroundColor: c.surfaceAlt }}>
            <Label>This session</Label>
            <Row style={{ marginTop: sp(2) }}>
              <Text style={type.soft}>{minutes.toFixed(0)} min</Text>
              <Text style={type.soft}>€{(sco.stakeTrace.reduce((a, b) => a + b, 0) / 100).toFixed(2)} staked</Text>
              <Text style={[type.soft, { color: sco.netCents < 0 ? c.concern : c.calm }]}>
                {sco.netCents < 0 ? '−' : '+'}€{Math.abs(sco.netCents / 100).toFixed(2)}
              </Text>
            </Row>
            <Text style={[type.tiny, { marginTop: sp(2) }]}>Stated plainly, nothing to dismiss.</Text>
          </Card>
        </View>
      )}

      {/* ---------- jackpots ---------- */}
      <View style={{ marginTop: sp(6) }}>
        <SectionHeader icon="trophy" title="Jackpots" count={jackpots.length} tint={c.jackpot} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>
          {jackpots.map((g) => (
            <GameTile key={g.id} game={g} width={128} onPress={() => onOpenGame(g)} jackpotAmount={potFor(g)} />
          ))}
        </ScrollView>
      </View>

      {/* ---------- PSK favourites ---------- */}
      <View style={{ marginTop: sp(6) }}>
        <SectionHeader icon="star" title="PSK Favoriti" count={33} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>
          {favorites.map((g) => <GameTile key={g.id} game={g} onPress={() => onOpenGame(g)} />)}
        </ScrollView>
      </View>

      {/* ---------- new ---------- */}
      <View style={{ marginTop: sp(6) }}>
        <SectionHeader icon="sparkles" title="Nove Igre" count={fresh.length} tint={c.fresh} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>
          {fresh.map((g) => <GameTile key={g.id} game={g} onPress={() => onOpenGame(g)} />)}
        </ScrollView>
      </View>

      {/* ---------- providers ---------- */}
      <View style={{ marginTop: sp(6) }}>
        <SectionHeader icon="grid" title="Featured Providers" count={44} onSeeAll={onExplore} tint={c.brandLite} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>
          {providers.map(([name, n]) => (
            <View key={name} style={s.provider}>
              <Text style={s.providerName} numberOfLines={1}>{name}</Text>
              <Text style={s.providerN}>{n} titles</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* ---------- reward ---------- */}
      <View style={[s.pad, { marginTop: sp(6) }]}>
        {policy.showReward ? (
          <Card style={{ borderColor: c.gold }}>
            <Row>
              <Label style={{ color: c.gold }}>Weekly wheel</Label>
              <Ionicons name="disc-outline" size={17} color={c.gold} />
            </Row>
            <Text style={[type.soft, { marginTop: sp(1.5) }]}>
              Segments point at titles you actually play. Prize values and probabilities are
              fixed and published — identical for every eligible player.
            </Text>
          </Card>
        ) : (
          <Card style={{ borderStyle: 'dashed' }}>
            <Label style={{ color: c.risk }}>Weekly wheel — withheld</Label>
            <Text style={[type.tiny, { marginTop: sp(1) }]}>
              {risk.state === 'calm'
                ? 'Market policy: no reward surfaces in this jurisdiction.'
                : `gate: risk state ${risk.state}`}
            </Text>
          </Card>
        )}
      </View>

      {/* ---------- RG ---------- */}
      {policy.showRgTools && (
        <View style={[s.pad, { marginTop: sp(4) }]}>
          <Card>
            <Label>Your limits</Label>
            <View style={{ marginTop: sp(2.5), gap: sp(3) }}>
              <Row>
                <View><Text style={type.body}>Deposit limit</Text><Text style={type.tiny}>currently €200 / day</Text></View>
                <Text style={s.link}>Edit</Text>
              </Row>
              <Row>
                <View><Text style={type.body}>Take a break</Text><Text style={type.tiny}>1 hour to 6 weeks</Text></View>
                <Text style={s.link}>Open</Text>
              </Row>
            </View>
            <Text style={[type.tiny, { marginTop: sp(2.5) }]}>
              Shown plainly · no interstitial, no lockout, nothing to dismiss
            </Text>
          </Card>
        </View>
      )}

      {/* ---------- real sections footnote ---------- */}
      <View style={[s.pad, { marginTop: sp(7) }]}>
        <Label>All {sections.length} lobby sections in the logs</Label>
        <View style={s.secChips}>
          {sections.slice(0, 12).map((x) => (
            <View key={x.name} style={s.secChip}>
              <Text style={s.secChipText}>{x.name}</Text>
              <Text style={s.secChipN}>{x.n}</Text>
            </View>
          ))}
        </View>
        <Text style={[type.tiny, { marginTop: sp(2.5) }]}>
          Catalogue, sections and counts extracted from top_casino_users_event_logs.csv —{' '}
          {metrics.totalEvents.toLocaleString()} events, {metrics.players} players,{' '}
          {metrics.sessions.toLocaleString()} sessions.
        </Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  chrome: { paddingHorizontal: sp(4), paddingTop: sp(3), paddingBottom: sp(3.5), gap: sp(3) },
  brand: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1.2 },
  brandSub: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '700' },
  balance: { color: '#fff', fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: sp(2),
    backgroundColor: 'rgba(0,0,0,0.24)', borderRadius: radius.pill,
    paddingHorizontal: sp(3.5),
  },
  searchInput: { flex: 1, color: '#fff', paddingVertical: sp(2.5), fontSize: 13, outlineStyle: 'none' },

  pad: { paddingHorizontal: sp(4), marginTop: sp(3) },
  rail: { paddingHorizontal: sp(4) },
  railEnd: { ...type.tiny, paddingHorizontal: sp(4), marginTop: sp(2.5) },

  heroText: { position: 'absolute', left: sp(3.5), bottom: sp(3.5), right: sp(3.5) },
  heroName: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  heroMeta: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600', marginTop: 2 },

  why: {
    flexDirection: 'row', alignItems: 'center', gap: sp(1.5),
    marginTop: sp(2), backgroundColor: c.surface, borderWidth: 1, borderColor: c.rule,
    paddingHorizontal: sp(3), paddingVertical: sp(2.25), borderRadius: radius.sm,
  },
  whyText: { flex: 1, fontSize: 12, color: c.inkSoft, lineHeight: 16 },
  kl: { fontSize: 10, color: c.relevance, fontWeight: '700' },
  reason: { fontSize: 11, color: c.risk, lineHeight: 16, marginTop: sp(1) },

  provider: {
    width: 128, height: 62, marginRight: sp(2.5),
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.rule,
    borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  providerName: { color: c.ink, fontSize: 12, fontWeight: '800' },
  providerN: { color: c.inkFaint, fontSize: 10 },

  secChips: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1.5), marginTop: sp(2.5) },
  secChip: {
    flexDirection: 'row', alignItems: 'center', gap: sp(1.5),
    borderWidth: 1, borderColor: c.rule, borderRadius: radius.pill,
    paddingHorizontal: sp(2.5), paddingVertical: sp(1),
  },
  secChipText: { fontSize: 11, color: c.inkSoft },
  secChipN: { fontSize: 9, color: c.inkFaint, fontVariant: ['tabular-nums'] },
  link: { color: c.relevance, fontSize: 13, fontWeight: '700' },

  realCard: {
    flexDirection: 'row', alignItems: 'center', gap: sp(3),
    borderRadius: radius.md, padding: sp(3.5),
    borderWidth: 1, borderColor: 'rgba(229,184,81,0.35)',
  },
  realTag: { color: c.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  realName: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  realSub: { color: 'rgba(255,255,255,0.72)', fontSize: 11, lineHeight: 15 },
});

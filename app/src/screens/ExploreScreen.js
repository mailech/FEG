/**
 * Explore — browse the whole sportsbook by sport, competition and match.
 *
 * Built entirely from EPS_Offers.csv: five sports, 258 competitions, and every
 * match carries its real market depth. The point it makes for Challenge 01 is
 * that the catalogue is enormous and the lobby surfaces almost none of it —
 * which is why search out-ranks every curated row in the event logs.
 */

import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLantern } from '../lantern/useLantern';
import { Card, Label, Row, SectionHeader, ChipRail, Note, Empty } from '../components/ui';
import { c, sp, type, radius } from '../theme';
import sportsbook from '../data/sportsbook.json';
import offers from '../data/offers.json';
import sections from '../data/sections.json';

const ICON = {
  Soccer: 'football',
  Tennis: 'tennisball',
  Basketball: 'basketball',
  'Ice Hockey': 'snow',
  MMA: 'fitness',
};

export default function ExploreScreen({ onOpenMatch }) {
  const { emit } = useLantern();
  const [sport, setSport] = useState(sportsbook.sports[0]?.name);
  const [tournament, setTournament] = useState(null);

  const active = sportsbook.sports.find((s) => s.name === sport) || sportsbook.sports[0];

  const matches = useMemo(
    () =>
      offers.filter(
        (o) => o.sport === sport && (!tournament || o.tournament === tournament)
      ),
    [sport, tournament]
  );

  const totalComps = sportsbook.sports.reduce((a, s) => a + s.tournamentCount, 0);
  const totalMarkets = offers.reduce((a, o) => a + o.marketCount, 0);

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: sp(12) }}>
      <LinearGradient colors={[c.brand, c.brandDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.chrome}>
        <Text style={s.title}>Explore</Text>
        <Text style={s.sub}>
          {sportsbook.sports.length} sports · {totalComps} competitions ·{' '}
          {totalMarkets.toLocaleString()} markets in this sample
        </Text>
      </LinearGradient>

      {/* ---------- sports ---------- */}
      <ChipRail
        style={{ paddingTop: sp(3.5) }}
        value={sport}
        onChange={(v) => { setSport(v); setTournament(null); }}
        items={sportsbook.sports.map((sp2) => ({
          value: sp2.name,
          label: sp2.nameHr,
          icon: ICON[sp2.name],
          n: sp2.tournamentCount,
        }))}
      />

      {/* ---------- sport summary ---------- */}
      <View style={s.pad}>
        <Card>
          <Row>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2.5), flex: 1 }}>
              <Ionicons name={ICON[active.name] || 'ellipse'} size={22} color={c.relevance} />
              <View>
                <Text style={type.h2}>{active.nameHr}</Text>
                <Text style={type.tiny}>{active.name}</Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.bigNum}>{active.tournamentCount}</Text>
              <Text style={type.tiny}>competitions</Text>
            </View>
          </Row>
          <Text style={[type.tiny, { marginTop: sp(2.5) }]}>
            {active.priceUpdates.toLocaleString()} price updates in the sampled window
          </Text>
        </Card>
      </View>

      {/* ---------- competitions ---------- */}
      <View style={{ marginTop: sp(5) }}>
        <SectionHeader
          icon="trophy"
          title="Competitions"
          count={active.tournamentCount}
          tint={c.gold}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>
          <Pressable
            onPress={() => setTournament(null)}
            style={[s.comp, !tournament && s.compOn]}
          >
            <Text style={[s.compName, !tournament && { color: '#fff' }]}>All</Text>
            <Text style={[s.compN, !tournament && { color: 'rgba(255,255,255,0.7)' }]}>
              {active.tournamentCount} comps
            </Text>
          </Pressable>
          {active.tournaments.map((t) => {
            const on = tournament === t.name;
            return (
              <Pressable key={t.name} onPress={() => setTournament(on ? null : t.name)} style={[s.comp, on && s.compOn]}>
                <Text style={[s.compName, on && { color: '#fff' }]} numberOfLines={2}>{t.name}</Text>
                <Text style={[s.compN, on && { color: 'rgba(255,255,255,0.7)' }]}>
                  {t.n.toLocaleString()} prices
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ---------- matches ---------- */}
      <View style={{ marginTop: sp(5) }}>
        <SectionHeader
          icon="list"
          title={tournament || `${active.nameHr} — top matches`}
          count={matches.length}
          tint={c.relevance}
        />
        <View style={s.pad2}>
          {matches.length === 0 ? (
            <Empty
              icon="search-outline"
              title="No sampled matches here"
              body="This competition appears in the price feed but not in the 80 deepest matches the extractor keeps. Widen MAX_ROWS in extract-sports.mjs to pull more."
            />
          ) : (
            matches.slice(0, 24).map((m) => {
              const movers = m.markets.filter((k) => k.moved !== 0).length;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => { emit({ t: 'view', surface: 'explore_match' }); onOpenMatch?.(m); }}
                  style={({ pressed }) => [s.match, pressed && { opacity: 0.75 }]}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={type.h3} numberOfLines={1}>{m.home}</Text>
                    <Text style={type.h3} numberOfLines={1}>{m.away || '—'}</Text>
                    <Text style={type.tiny} numberOfLines={1}>{m.tournament}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={s.mkCount}>
                      <Text style={s.mkCountText}>{m.marketCount.toLocaleString()}</Text>
                    </View>
                    <Text style={type.tiny}>markets</Text>
                    {movers > 0 && (
                      <View style={s.moved}>
                        <Ionicons name="swap-vertical" size={9} color={c.risk} />
                        <Text style={s.movedText}>{movers} moved</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </View>

      {/* ---------- casino verticals ---------- */}
      <View style={{ marginTop: sp(6) }}>
        <SectionHeader icon="apps" title="Casino sections" count={sections.length} tint={c.exclusive} />
        <View style={s.pad2}>
          <View style={s.grid}>
            {sections.slice(0, 12).map((x) => (
              <View key={x.name} style={s.gridCell}>
                <Text style={s.gridName} numberOfLines={1}>{x.name}</Text>
                <Text style={s.gridN}>{x.n.toLocaleString()} launches</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={s.pad}>
        <Note>
          Depth is the argument. {totalComps} competitions and {totalMarkets.toLocaleString()}{' '}
          markets sit behind a lobby that shows a handful of rows — which is exactly why search
          out-ranks every curated section in the event logs. Explore is where the catalogue
          becomes reachable without knowing what to type.
        </Note>
        <Text style={[type.tiny, { marginTop: sp(2) }]}>
          Source: EPS_Offers.csv · {sportsbook.scannedRows.toLocaleString()} price updates scanned.
        </Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  chrome: { paddingHorizontal: sp(4), paddingTop: sp(4), paddingBottom: sp(4), gap: sp(1) },
  title: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: -0.4 },
  sub: { color: 'rgba(255,255,255,0.75)', fontSize: 11.5, fontWeight: '600' },

  pad: { paddingHorizontal: sp(4), marginTop: sp(4) },
  pad2: { paddingHorizontal: sp(4) },
  rail: { paddingHorizontal: sp(4), gap: sp(2.5) },
  bigNum: { ...type.h1, color: c.relevance, fontVariant: ['tabular-nums'] },

  comp: {
    width: 132, padding: sp(2.5), gap: 4,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.rule,
    borderRadius: radius.md, justifyContent: 'space-between', minHeight: 66,
  },
  compOn: { backgroundColor: c.brand, borderColor: c.brand },
  compName: { fontSize: 12, fontWeight: '800', color: c.ink, lineHeight: 15 },
  compN: { fontSize: 10, color: c.inkFaint, fontVariant: ['tabular-nums'] },

  match: {
    flexDirection: 'row', alignItems: 'center', gap: sp(3),
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.rule,
    borderRadius: radius.md, padding: sp(3), marginBottom: sp(2),
  },
  mkCount: {
    backgroundColor: c.inset, borderRadius: 4,
    paddingHorizontal: sp(2), paddingVertical: sp(0.75),
  },
  mkCountText: { color: c.relevance, fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
  moved: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  movedText: { color: c.risk, fontSize: 9, fontWeight: '700' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2) },
  gridCell: {
    width: '48%', backgroundColor: c.surface, borderWidth: 1, borderColor: c.rule,
    borderRadius: radius.sm, padding: sp(2.5), gap: 2,
  },
  gridName: { fontSize: 12, fontWeight: '700', color: c.ink },
  gridN: { fontSize: 10, color: c.inkFaint, fontVariant: ['tabular-nums'] },
});

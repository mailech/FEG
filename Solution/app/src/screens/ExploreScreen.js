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
import { VERTICALS, HORSE_CARDS, HORSE_MARKETS } from '../data/verticals';
import offers from '../data/offers.json';
import sections from '../data/sections.json';

const ICON = {
  Soccer: 'football',
  Tennis: 'tennisball',
  Basketball: 'basketball',
  'Ice Hockey': 'snow',
  MMA: 'fitness',
};

/** Log scale from 60s to 6h — the span the catalogue actually covers. */
const freqPct = (sec) => {
  const lo = Math.log(60);
  const hi = Math.log(21600);
  return Math.max(2, Math.min(98, ((Math.log(Math.max(60, sec)) - lo) / (hi - lo)) * 100));
};

const freqLabel = (sec) =>
  sec >= 3600 ? `${Math.round(sec / 3600)}h` : sec >= 60 ? `${Math.round(sec / 60)}m` : `${sec}s`;

/** Closest verticals by event frequency — the safe-neighbour question. */
const neighboursOf = (v) =>
  VERTICALS
    .filter((x) => x.key !== v.key)
    .sort((a, b) => Math.abs(Math.log(a.freq) - Math.log(v.freq)) - Math.abs(Math.log(b.freq) - Math.log(v.freq)))
    .slice(0, 3);

export default function ExploreScreen({ onOpenMatch }) {
  const { emit } = useLantern();
  const [sport, setSport] = useState(sportsbook.sports[0]?.name);
  const [tournament, setTournament] = useState(null);

  const active = sportsbook.sports.find((s) => s.name === sport) || sportsbook.sports[0];
  // Only the five EPS verticals have measured competitions and matches.
  const measuredActive = sportsbook.sports.some((s) => s.name === sport);
  const activeVertical = VERTICALS.find((v) => v.key === sport);

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

      {/* ---------- every vertical ---------- */}
      <View style={{ marginTop: sp(4) }}>
        <SectionHeader icon="apps" title="All sports" count={VERTICALS.length} tint={c.relevance} />
        <View style={s.pad2}>
          <View style={s.vgrid}>
            {VERTICALS.map((v) => {
              const on = sport === v.key;
              return (
                <Pressable
                  key={v.key}
                  onPress={() => { setSport(v.key); setTournament(null); }}
                  style={[s.vcell, on && s.vcellOn]}
                >
                  <Ionicons name={v.icon} size={17} color={on ? '#fff' : c.relevance} />
                  <Text style={[s.vname, on && { color: '#fff' }]} numberOfLines={1}>{v.hr}</Text>
                  <Text style={[s.vmeta, on && { color: 'rgba(255,255,255,0.7)' }]}>
                    {v.source === 'measured' ? `${v.competitions} comps` : 'catalogue'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[type.tiny, { marginTop: sp(2.5) }]}>
            Five verticals carry measured competition counts from EPS_Offers.csv. The rest are
            catalogue entries modelled on the live PSK sidebar — marked, never passed off as
            measured.
          </Text>
        </View>
      </View>

      {/* ---------- sport summary ---------- */}
      {measuredActive && (
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
      )}

      {/* ---------- catalogue vertical: where it sits on the axis ---------- */}
      {!measuredActive && sport !== 'Horse Racing' && activeVertical && (
        <View style={s.pad}>
          <Card>
            <Row>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2.5), flex: 1 }}>
                <Ionicons name={activeVertical.icon} size={22} color={c.relevance} />
                <View>
                  <Text style={type.h2}>{activeVertical.hr}</Text>
                  <Text style={type.tiny}>{activeVertical.key}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.bigNum}>{freqLabel(activeVertical.freq)}</Text>
                <Text style={type.tiny}>between results</Text>
              </View>
            </Row>

            <Text style={[type.soft, { marginTop: sp(3) }]}>
              Not in the sampled price feed, so there are no live prices to show. What it does
              carry is its position on the event-frequency axis — the dimension the recommender
              holds constant, and the reason this vertical is or is not a safe neighbour for
              any other.
            </Text>

            <View style={s.axis}>
              <View style={s.axisTrack}>
                <View style={[s.axisFill, { width: `${freqPct(activeVertical.freq)}%` }]} />
                <View style={[s.axisPin, { left: `${freqPct(activeVertical.freq)}%` }]} />
              </View>
              <Row style={{ marginTop: sp(1.5) }}>
                <Text style={type.tiny}>seconds · slots</Text>
                <Text style={type.tiny}>hours · outrights</Text>
              </Row>
            </View>

            <Text style={[type.tiny, { marginTop: sp(2.5) }]}>
              Nearest by frequency:{' '}
              {neighboursOf(activeVertical).map((n) => n.hr).join(' · ') || '—'}
            </Text>
          </Card>
        </View>
      )}

      {/* ---------- horse racing ---------- */}
      {sport === 'Horse Racing' && (
        <View style={{ marginTop: sp(5) }}>
          <SectionHeader icon="trail-sign" title="Race cards" count={HORSE_CARDS.length} tint={c.gold} />
          <View style={s.pad2}>
            <Note>
              One resolution per race, roughly half an hour apart. Horse racing anchors the low
              end of the event-frequency axis, which is the dimension the recommender holds
              constant (§3.4b). It is the sport that makes cross-category discovery
              demonstrable: snooker and darts are its neighbours, slots are not.
            </Note>

            {HORSE_CARDS.map((race) => {
              const open = tournament === race.id;
              return (
                <View key={race.id} style={s.race}>
                  <Pressable onPress={() => setTournament(open ? null : race.id)} style={s.raceHead}>
                    <View style={s.raceTime}><Text style={s.raceTimeText}>{race.time}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={type.h3}>{race.hrCourse}</Text>
                      <Text style={type.tiny}>
                        {race.grade} · {race.distance} · {race.runners} grla · teren {race.going}
                      </Text>
                    </View>
                    <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={c.inkFaint} />
                  </Pressable>

                  {open && (
                    <View style={s.field}>
                      <View style={s.mkRail}>
                        {HORSE_MARKETS.map((m) => (
                          <View key={m.key} style={s.mkChip}>
                            <Text style={s.mkChipText}>{m.label}</Text>
                          </View>
                        ))}
                      </View>
                      {race.field.map((h) => (
                        <View key={h.no} style={s.runner}>
                          <View style={s.saddle}><Text style={s.saddleText}>{h.no}</Text></View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.horse} numberOfLines={1}>{h.horse}</Text>
                            <Text style={type.tiny}>{h.jockey} · forma {h.form}</Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <View style={s.hodds}><Text style={s.hoddsText}>{h.odds.toFixed(2)}</Text></View>
                            {h.drift !== 0 && (
                              <Text style={[s.drift, { color: h.drift < 0 ? c.calm : c.risk }]}>
                                {h.drift < 0 ? '▼' : '▲'} {Math.abs(h.drift).toFixed(2)}
                              </Text>
                            )}
                          </View>
                        </View>
                      ))}
                      <Text style={[type.tiny, { marginTop: sp(2) }]}>
                        Constructed card — horse racing is not in the EPS price feed. Courses and
                        market types are real; the field is not.
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* ---------- competitions ---------- */}
      {measuredActive && (
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
      )}

      {/* ---------- matches ---------- */}
      {measuredActive && (
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
      )}

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

  vgrid: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2) },
  vcell: {
    width: '31.2%', alignItems: 'center', gap: 3, paddingVertical: sp(2.5),
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.rule, borderRadius: radius.md,
  },
  vcellOn: { backgroundColor: c.brand, borderColor: c.brand },
  vname: { fontSize: 11, fontWeight: '700', color: c.ink },
  vmeta: { fontSize: 9, color: c.inkFaint },

  race: {
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.rule,
    borderRadius: radius.md, marginBottom: sp(2), overflow: 'hidden',
  },
  raceHead: { flexDirection: 'row', alignItems: 'center', gap: sp(3), padding: sp(3) },
  raceTime: {
    backgroundColor: c.inset, borderRadius: 4,
    paddingHorizontal: sp(2), paddingVertical: sp(1),
  },
  raceTimeText: { color: c.gold, fontWeight: '900', fontSize: 12, fontVariant: ['tabular-nums'] },
  field: { borderTopWidth: 1, borderTopColor: c.ruleSoft, padding: sp(3), gap: sp(1.5) },
  mkRail: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1.5), marginBottom: sp(2) },
  mkChip: {
    borderWidth: 1, borderColor: c.rule, borderRadius: radius.pill,
    paddingHorizontal: sp(2.5), paddingVertical: sp(1),
  },
  mkChipText: { fontSize: 10.5, color: c.inkSoft, fontWeight: '700' },
  runner: { flexDirection: 'row', alignItems: 'center', gap: sp(2.5) },
  saddle: {
    width: 24, height: 24, borderRadius: 4, backgroundColor: c.inset,
    alignItems: 'center', justifyContent: 'center',
  },
  saddleText: { color: c.ink, fontSize: 11, fontWeight: '900' },
  horse: { fontSize: 13, fontWeight: '700', color: c.ink },
  hodds: {
    backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.rule, borderRadius: 4,
    paddingHorizontal: sp(2), paddingVertical: sp(1), minWidth: 48, alignItems: 'center',
  },
  hoddsText: { color: c.ink, fontWeight: '800', fontSize: 12, fontVariant: ['tabular-nums'] },
  drift: { fontSize: 9, fontWeight: '800', marginTop: 2 },

  axis: { marginTop: sp(3) },
  axisTrack: {
    height: 6, backgroundColor: c.inset, borderRadius: 3,
    justifyContent: 'center', position: 'relative',
  },
  axisFill: { height: 6, backgroundColor: c.relevance, opacity: 0.35, borderRadius: 3 },
  axisPin: {
    position: 'absolute', width: 12, height: 12, borderRadius: 6,
    backgroundColor: c.relevance, marginLeft: -6,
    borderWidth: 2, borderColor: c.surface,
  },
});

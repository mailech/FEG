/**
 * Explore — browse the whole sportsbook by sport, competition and match.
 *
 * Built entirely from EPS_Offers.csv: five sports, 258 competitions, and every
 * match carries its real market depth. The point it makes for Challenge 01 is
 * that the catalogue is enormous and the lobby surfaces almost none of it —
 * which is why search out-ranks every curated row in the event logs.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLantern } from '../lantern/useLantern';
import { Card, Label, Row, SectionHeader, ChipRail, Note, Empty } from '../components/ui';
import { c, sp, type, radius } from '../theme';
import sportsbook from '../data/sportsbook.json';
import { VERTICALS, HORSE_CARDS, HORSE_MARKETS } from '../data/verticals';
import { catalog } from '../lantern/relevance';
import { GameTile } from '../components/ui';
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

/** 240 minutes reads worse than 4 hours; 1.5 minutes worse than 90 seconds. */
const fmtEvery = (sec) =>
  sec >= 5400 ? `${+(sec / 3600).toFixed(1)} hours`
  : sec >= 120 ? `${Math.round(sec / 60)} minutes`
  : `${sec} seconds`;

const norm = (x) => (x || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The titles behind a lobby row, and how that answer was reached.
 *
 * The rows come from the event logs and the titles come from the live
 * catalogue, and the two name things differently: some rows are PSK categories
 * a game carries directly, some are providers, one — Najigranije, "most
 * played" — is an ordering rather than a membership. Each route is tried in
 * turn and the one that answered is shown on the page, so a ranked fallback is
 * never presented as a real category.
 */
function resolveSection(name) {
  if (!name) return { games: [], how: null };
  const byCat = catalog.filter((g) => (g.categories || []).includes(name));
  if (byCat.length) return { games: byCat, how: 'a PSK category these titles carry' };
  const byProv = catalog.filter((g) => norm(g.provider) === norm(name));
  if (byProv.length) return { games: byProv, how: 'every title from this provider' };
  const byName = catalog.filter((g) => norm(g.name).includes(norm(name)));
  if (byName.length) return { games: byName, how: 'titles in this family' };
  return {
    games: [...catalog].sort((a, b) => b.measuredLaunches - a.measuredLaunches).slice(0, 24),
    how: 'most launched in the sample — this row is an ordering, not a category',
  };
}

/**
 * Where Explore was standing.
 *
 * Opening a game swaps this screen out for GameScreen at the same slot in
 * App.js's ternary, so React unmounts it and every useState below is gone;
 * GameScreen's back mounts a fresh one. Holding the navigation values outside
 * the component makes that remount land where the user left - section, tile,
 * game, back is otherwise a one-way trip to the index.
 */
const nav = { sport: null, open: null, openSec: null };

export default function ExploreScreen({ onOpenMatch, onOpenGame }) {
  const { emit } = useLantern();
  const [sport, setSport] = useState(nav.sport ?? sportsbook.sports[0]?.name);

  /**
   * Casino titles that move at the selected vertical's pace.
   *
   * Nineteen of the twenty-four verticals have no live prices in the sample, so
   * tapping them used to change a highlight and nothing else — the section
   * below only ever rendered for the five measured sports. Every tile now opens
   * onto something, and what it opens onto is the cross-vertical mechanism
   * rather than a placeholder: mechanics carry an implied seconds-between-
   * resolutions, and the closest ones to this sport's own frequency are shown.
   */
  const MECHANIC_PACE = {
    table: 1200, 'classic-fruit': 600, 'book-adventure': 300,
    'video-slot': 180, 'link-jackpot': 150, 'cluster-tumble': 90,
  };
  const [tournament, setTournament] = useState(null);

  /**
   * Which vertical the user has drilled into, or null for the index.
   *
   * Tapping a sport used to change a highlight and reveal sections further down
   * the same scroll, which meant the thing you asked for was below the fold and
   * the way back was to scroll up and guess. A vertical is a place now: you go
   * in, you see what is in it, and one control brings you back out.
   */
  const [open, setOpen] = useState(nav.open);

  /**
   * The same drill-in for casino sections, which are real rows of the lobby.
   *
   * `topSection` in catalog.json is the section a title was actually launched
   * from in the event logs, so a section page is measured content, not a
   * mock-up: these are the games that row really contains.
   */
  /**
   * Columns solved from the grid's own box, not from the window.
   *
   * A fixed 112px tile leaves a ragged gutter down the right of every row —
   * three tiles and a third of a fourth. The window width is not the answer
   * either: on web the app renders inside a phone-width frame, so a 1440px
   * window still only has ~500px of shelf, and sizing to 1440 puts two
   * oversized tiles on a row meant for four. onLayout reports the box that
   * actually holds the tiles, and the remainder divides evenly into it.
   */
  const { width: winW } = useWindowDimensions();
  const [gridBox, setGridBox] = useState(0);
  const onGridLayout = (e) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w && w !== gridBox) setGridBox(w);
  };
  const avail = (gridBox || Math.min(winW, 560)) - sp(8);
  const gridCols = Math.max(3, Math.min(7, Math.floor((avail + sp(2.5)) / (112 + sp(2.5)))));
  const gridW = Math.floor((avail - (gridCols - 1) * sp(2.5)) / gridCols);
  /** Whole rows only — a lone tile on a trailing row is what looks unfinished. */
  const gridRows = (n) => gridCols * Math.max(1, Math.round(n / gridCols));

  const [openSec, setOpenSec] = useState(nav.openSec);
  const sec = useMemo(() => resolveSection(openSec), [openSec]);

  useEffect(() => { nav.sport = sport; nav.open = open; nav.openSec = openSec; }, [sport, open, openSec]);

  const active = sportsbook.sports.find((s) => s.name === sport) || sportsbook.sports[0];
  // Only the five EPS verticals have measured competitions and matches.
  const measuredActive = sportsbook.sports.some((s) => s.name === sport);

  // The rail sets `sport` to a VERTICALS key, and only five of the
  // twenty-four exist in sportsbook.json, so `active` above silently falls
  // back to Soccer for the other nineteen. Everything the pace section reads —
  // the Croatian name, the icon, the event frequency — comes from VERTICALS,
  // which always resolves.
  const vert = VERTICALS.find((v) => v.key === sport) || VERTICALS[0];

  const paced = useMemo(() => {
    const target = Math.log(vert.freq || 600);
    const maxL = Math.max(1, ...catalog.map((g) => g.launches || 0));

    const want = 24;
    const ranked = [...catalog]
      .map((g) => ({
        g,
        // Pace is per title, not per mechanic. The mechanic sets a base
        // interval and volatility stretches it, because a high-variance title
        // resolves meaningfully far less often than a low-variance one on the
        // same reels. Mechanic alone gave six pace values inside 90-1200s
        // against verticals spanning 120-14400s, so every vertical at or above
        // 1200s ranked those six identically and twenty of the twenty-four
        // pages rendered the same twelve tiles in the same order.
        d: Math.abs(
             Math.log((MECHANIC_PACE[g.mechanic] ?? 200) * Math.pow(5, (g.volatility ?? 3) - 2))
             - target
           )
           // Well-known titles break ties. They are the ones a Croatian player
           // recognises, and — since their art is the art the CDN actually
           // still serves — the ones whose tiles are not blank.
           - (Math.log1p(g.launches || 0) / Math.log1p(maxL)) * 0.35,
      }))
      .sort((a, b) => a.d - b.d);

    // Straight top-12 returns twelve near-identical titles: pace is a function
    // of mechanic, so the closest mechanic sweeps the whole shelf and the page
    // reads as one game twelve times. Caps per mechanic and per provider, and a
    // floor of three non-slot formats, make it a shelf rather than a row.
    const out = [];
    const byMech = {}, byProv = {};
    const take = (x) => {
      out.push(x.g);
      byMech[x.g.mechanic] = (byMech[x.g.mechanic] || 0) + 1;
      byProv[x.g.provider] = (byProv[x.g.provider] || 0) + 1;
    };

    // Three non-slot formats up front, from three different studios — the
    // closest three by pace alone are all Evolution live tables, which is the
    // same monotony one rung along.
    for (const x of ranked) {
      if (out.length >= 3) break;
      if (!x.g.type || x.g.type === 'Slot') continue;
      if (byProv[x.g.provider]) continue;
      take(x);
    }

    for (const x of ranked) {
      if (out.length >= want) break;
      if (out.includes(x.g)) continue;
      if ((byMech[x.g.mechanic] || 0) >= 3) continue;
      if ((byProv[x.g.provider] || 0) >= 2) continue;
      take(x);
    }
    // Caps are a preference, not a constraint: if they starve the shelf, fill it.
    for (const x of ranked) {
      if (out.length >= want) break;
      if (!out.includes(x.g)) out.push(x.g);
    }
    return out;
  }, [vert]);
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

  // One casino section, on its own page.
  if (openSec) {
    return (
      <ScrollView
        key={openSec ? 'sec' : open ? 'vert' : 'idx'}
        style={s.root}
        contentContainerStyle={{ paddingBottom: sp(12) }}
      >
        <LinearGradient
          colors={[c.exclusive, c.brandDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.chrome}
        >
          <Pressable onPress={() => setOpenSec(null)} style={s.back} hitSlop={12}>
            <Ionicons name="chevron-back" size={17} color="#fff" />
            <Text style={s.backText}>Casino sections</Text>
          </Pressable>
          <View style={s.crumbRow}>
            <View style={s.crumbIcon}>
              <Ionicons name="albums" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{openSec}</Text>
              <Text style={s.sub}>
                {Math.min(sec.games.length, gridRows(24))} of {sec.games.length} titles ·{' '}
                {(sections.find((x) => x.name === openSec)?.n || 0).toLocaleString()} launches from
                this row in the sample
              </Text>
            </View>
          </View>
        </LinearGradient>

        <View style={{ marginTop: sp(4) }}>
          <SectionHeader
            icon="albums-outline" title="In this section" count={Math.min(sec.games.length, gridRows(24))} tint={c.exclusive}
          />
          {sec.games.length ? (
            <View style={s.pgrid} onLayout={onGridLayout}>
              {[...sec.games].sort((a, b) => b.measuredLaunches - a.measuredLaunches).slice(0, gridRows(24)).map((g, i) => (
                <GameTile
                  key={g.id} game={g} rank={i} width={gridW} gutter={0}
                  onPress={() => onOpenGame?.(g)}
                />
              ))}
            </View>
          ) : (
            <View style={s.pad}>
              <Empty text="No launches from this row landed in the sampled window." />
            </View>
          )}
          <View style={s.pad}>
            <Text style={[type.tiny, { marginTop: sp(2) }]}>
              Membership here is {sec.how}. Order is by launch count in the sampled window.
            </Text>
            <Pressable onPress={() => setOpenSec(null)} style={s.backWide}>
              <Ionicons name="grid-outline" size={15} color={c.relevance} />
              <Text style={s.backWideText}>Back to Explore</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    );
  }

  // One vertical, on its own page.
  if (open) {
    return (
      <ScrollView
        key={openSec ? 'sec' : open ? 'vert' : 'idx'}
        style={s.root}
        contentContainerStyle={{ paddingBottom: sp(12) }}
      >
      <LinearGradient colors={[c.brand, c.brandDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.chrome}>
        <Pressable onPress={() => { setOpen(null); setTournament(null); }} style={s.back} hitSlop={12}>
          <Ionicons name="chevron-back" size={17} color="#fff" />
          <Text style={s.backText}>All sports</Text>
        </Pressable>
        <View style={s.crumbRow}>
          <View style={s.crumbIcon}>
            <Ionicons name={vert.icon} size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{vert.hr}</Text>
            <Text style={s.sub}>
              {vert.key} · {measuredActive
                ? `${vert.competitions} competitions measured`
                : 'catalogue vertical'} · resolves every {fmtEvery(vert.freq)}
            </Text>
          </View>
        </View>
      </LinearGradient>

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

        {/* ---------- what this vertical actually opens onto ---------- */}
        {vert && (
          <View style={{ marginTop: sp(5) }}>
            <SectionHeader
              icon={vert.icon}
              title="Games that play at this pace"
              count={Math.min(paced.length, gridRows(12))}
              tint={c.relevance}
            />
            <View style={s.pad}>
              <Text style={s.paceLine}>
                <Text style={s.paceStrong}>{vert.hr}</Text> resolves about every{' '}
                <Text style={s.paceStrong}>{fmtEvery(vert.freq)}</Text>.
                {measuredActive
                  ? ` ${active.tournamentCount} competitions carry live prices in this sample.`
                  : ' No live prices for it in this sample — it is a catalogue entry.'}
              </Text>
              <Text style={s.paceNote}>
                Event frequency is the one axis sport and casino share, so it is the axis these
                titles are matched on. A slow vertical surfaces deliberate formats; a fast one
                surfaces games that keep up.
              </Text>
            </View>
            <View style={s.pgrid} onLayout={onGridLayout}>
              {paced.slice(0, gridRows(12)).map((g, i) => (
                <GameTile
                  key={g.id} game={g} rank={i} width={gridW} gutter={0}
                  onPress={() => onOpenGame?.(g)}
                />
              ))}
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


        <View style={s.pad}>
          <Pressable onPress={() => { setOpen(null); setTournament(null); }} style={s.backWide}>
            <Ionicons name="grid-outline" size={15} color={c.relevance} />
            <Text style={s.backWideText}>Back to all {VERTICALS.length} sports</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
        key={openSec ? 'sec' : open ? 'vert' : 'idx'}
        style={s.root}
        contentContainerStyle={{ paddingBottom: sp(12) }}
      >
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
                  onPress={() => { setSport(v.key); setTournament(null); setOpen(v.key); }}
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

      {/* ---------- casino verticals ---------- */}
      <View style={{ marginTop: sp(6) }}>
        <SectionHeader icon="apps" title="Casino sections" count={sections.length} tint={c.exclusive} />
        <View style={s.pad2}>
          <View style={s.grid}>
            {sections.slice(0, 12).map((x) => (
              <Pressable key={x.name} onPress={() => setOpenSec(x.name)} style={s.gridCell}>
                <Text style={s.gridName} numberOfLines={1}>{x.name}</Text>
                <Text style={s.gridN}>{x.n.toLocaleString()} launches</Text>
              </Pressable>
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
  back: { flexDirection: 'row', alignItems: 'center', gap: sp(0.5), marginBottom: sp(2), marginLeft: -sp(1) },
  backText: { ...type.label, color: '#fff', fontSize: 11.5, letterSpacing: 0.6 },
  crumbRow: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  crumbIcon: {
    width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  backWide: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(1.5),
    marginTop: sp(4), paddingVertical: sp(3.5), borderRadius: radius.md,
    borderWidth: 1, borderColor: c.rule, backgroundColor: c.inset,
  },
  backWideText: { ...type.label, color: c.relevance, fontSize: 11.5 },
  pgrid: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start',
    columnGap: sp(2.5), rowGap: sp(3.5), paddingHorizontal: sp(4),
  },
  paceLine: { ...type.soft, lineHeight: 19 },
  paceStrong: { color: c.ink, fontWeight: '700' },
  paceNote: { ...type.tiny, lineHeight: 15, marginTop: sp(1.5) },
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

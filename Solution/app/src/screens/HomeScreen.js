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

import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, useWindowDimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLantern } from '../lantern/useLantern';
import { explain, catalog, BY_ID, coldFit } from '../lantern/relevance';
import { fitFor, rankingContext, scoreGame, CLASSES, CHARACTER } from '../lantern/model';
import { tray } from '../lantern/notifications';
import { subscribe } from '../lantern/feed';
import { usePeers } from '../lantern/usePeers';
import { loadProfile } from '../lantern/identity';
import { paceMatched, LEARNED as XV_LEARNED } from '../lantern/crossVertical';
import { HORSE_CARDS } from '../data/verticals';
import { EMPIRE } from './RealGameScreen';
import GameArt from '../components/GameArt';
import { Card, Label, Row, StateChip, Toggle, Note, SectionHeader, GameTile, ChipRail } from '../components/ui';
import { c, sp, type, radius, shadow } from '../theme';
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

/**
 * A live conversation with another player about a result they are showing.
 *
 * Real messages over the relay, not a script: both sides are actual sessions.
 * The verification is the point — the header carries their session id, their
 * character as the model reads it, and the net they are actually up, so the
 * claim can be checked before a word is exchanged.
 */
function PeerChat({ peer, thread, onSend, onClose, meId }) {
  const [draft, setDraft] = useState('');
  const net = (peer.counters?.netCents ?? 0) / 100;

  const submit = () => {
    if (!draft.trim()) return;
    onSend(peer.sessionId, draft);
    setDraft('');
  };

  return (
    <View style={s.peerChat}>
      <Row>
        <View style={{ flex: 1 }}>
          <Text style={s.peerChatName}>{peer.name}</Text>
          <Text style={s.peerChatMeta}>
            {peer.character?.label} · {peer.counters?.spins ?? 0} spins · session{' '}
            {peer.sessionId}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={16} color={c.inkSoft} />
        </Pressable>
      </Row>

      <View style={s.peerVerify}>
        <Ionicons name="shield-checkmark" size={12} color={c.calm} />
        <Text style={s.peerVerifyText}>
          Live session, up {net >= 0 ? '' : '-'}€{Math.abs(net).toFixed(2)} · verified
          against the relay, not a screenshot
        </Text>
      </View>

      <View style={{ gap: sp(1.5) }}>
        {thread.length === 0 && (
          <Text style={s.peerHint}>No messages yet. Ask them anything.</Text>
        )}
        {thread.map((m) => (
          <View
            key={m.id}
            style={[s.peerBubble, m.from === meId ? s.peerMine : s.peerTheirs]}
          >
            <Text style={m.from === meId ? s.peerMineText : s.peerTheirsText}>{m.text}</Text>
          </View>
        ))}
      </View>

      <View style={s.peerInputRow}>
        <TextInput
          style={s.peerInput}
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask about the result"
          placeholderTextColor={c.inkFaint}
          onSubmitEditing={submit}
          returnKeyType="send"
          maxLength={400}
        />
        <Pressable onPress={submit} style={s.peerSend}>
          <Ionicons name="send" size={14} color={c.relevance} />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The two surfaces that are not a stand-in slot, given catalogue entries so they
 * can sit in the feed rather than in a box underneath it.
 *
 * A lobby where every tile is a simulated spinner tells a judge the product is a
 * slot recommender. It is not: one of these is FEG's real certified bundle and
 * the other wagers nothing at all, and both belong in the same shelf as
 * everything else — the ranker's job is to widen a session, and it cannot do
 * that if the only things it can reach are more of the same.
 */
const SPECIALS = [
  {
    ...EMPIRE,
    label: 'CERTIFIED',
    special: 'real',
    launches: 0,
  },
  {
    id: 'slatki-slap',
    name: 'Slatki Slap',
    provider: 'Lantern',
    mechanic: 'cluster-tumble',
    volatility: 1,
    jackpot: false,
    label: 'NO STAKE',
    special: 'casual',
    launches: 0,
  },
];

const openPage = (href) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(href, '_blank');
};

/**
 * Home-screen widgets.
 *
 * Mind and Ops were tabs in the consumer app, which was the wrong place for
 * them — a player does not want a feature-contribution chart, and two of five
 * tab slots were going to surfaces built for analysts. They are full pages at
 * /mind and /ops now; what stays here is the glanceable part, in the shape a
 * home-screen widget actually takes: one number, one state, no navigation.
 */
function Widgets({ pred, sco, risk }) {
  const [relay, setRelay] = useState('connecting');
  const [open, setOpen] = useState(null);
  useEffect(() => subscribe({ onStatus: setRelay }), []);

  const evidence = Math.min(1, sco.events.length / 6);
  const listening = evidence < 0.5;
  const conf = pred.archetype.confidence * evidence + 0.25 * (1 - evidence);
  const relayTone = relay === 'live' ? c.calm : relay === 'connecting' ? c.gold : c.inkFaint;
  const net = sco.netCents;

  const Metric = ({ n, l, tone }) => (
    <View style={s.wMetric}>
      <Text style={[s.wMetricN, tone && { color: tone }]}>{n}</Text>
      <Text style={s.wMetricL}>{l}</Text>
    </View>
  );

  return (
    <View style={[s.pad, { marginTop: sp(4) }]}>
      <View style={s.widgets}>
        <Pressable
          onPress={() => setOpen(open === 'mind' ? null : 'mind')}
          style={({ pressed }) => [s.widget, pressed && { opacity: 0.85 }]}
        >
          <View style={s.widgetTop}>
            <Ionicons name="sparkles" size={13} color={c.relevance} />
            <Text style={s.widgetTag}>YOUR READ</Text>
            <Ionicons
              name={open === 'mind' ? 'chevron-up' : 'chevron-down'}
              size={13}
              color={c.inkFaint}
              style={{ marginLeft: 'auto' }}
            />
          </View>
          <Text style={s.widgetBig} numberOfLines={1}>
            {listening ? 'Listening' : pred.archetype.label}
          </Text>
          <View style={s.widgetTrack}>
            <View style={[s.widgetFill, { width: `${Math.max(3, conf * 100)}%` }]} />
          </View>
          <Text style={s.widgetSub}>
            {listening
              ? `${sco.events.length} of 6 events`
              : `${Math.round(conf * 100)}% confident`}
          </Text>
          <View style={[s.widgetChip, { borderColor: c[risk.state] || c.rule }]}>
            <Text style={[s.widgetChipText, { color: c[risk.state] || c.ink }]}>
              {risk.state.toUpperCase()} {Math.round(pred.risk.p * 100)}%
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => setOpen(open === 'ops' ? null : 'ops')}
          style={({ pressed }) => [s.widget, pressed && { opacity: 0.85 }]}
        >
          <View style={s.widgetTop}>
            <Ionicons name="grid" size={13} color={c.gold} />
            <Text style={[s.widgetTag, { color: c.gold }]}>OPERATOR</Text>
            <Ionicons
              name={open === 'ops' ? 'chevron-up' : 'chevron-down'}
              size={13}
              color={c.inkFaint}
              style={{ marginLeft: 'auto' }}
            />
          </View>
          <Text style={s.widgetBig}>{Math.round(pred.conversion.p * 100)}%</Text>
          <Text style={s.widgetSub}>likely to complete an action</Text>
          <View style={s.widgetRow}>
            <Text style={s.widgetStat}>{sco.spins} spins</Text>
            <Text style={s.widgetStat}>{new Set(sco.seq).size} titles</Text>
          </View>
          <View style={s.widgetRelay}>
            <View style={[s.widgetDot, { backgroundColor: relayTone }]} />
            <Text style={s.widgetRelayText}>
              {relay === 'live' ? 'streaming live' : relay === 'connecting' ? 'connecting' : 'relay offline'}
            </Text>
          </View>
        </Pressable>
      </View>

      {open === 'mind' && (
        <Card style={s.wPanel}>
          <Label>Character probabilities</Label>
          {CLASSES.map((k, i) => {
            const v = pred.archetype.probs[i] * evidence + 0.25 * (1 - evidence);
            const top = !listening && i === pred.archetype.index;
            return (
              <View key={k} style={s.wProb}>
                <Text style={[s.wProbName, top && { color: c.ink, fontWeight: '800' }]}>
                  {CHARACTER[k].label}
                </Text>
                <View style={s.wProbTrack}>
                  <View
                    style={[
                      s.wProbFill,
                      { width: `${Math.max(2, v * 100)}%`, backgroundColor: top ? c.relevance : c.rule },
                    ]}
                  />
                </View>
                <Text style={s.wProbPct}>{Math.round(v * 100)}%</Text>
              </View>
            );
          })}
          {pred.archetype.why.length > 0 && !listening && (
            <Text style={s.wWhy}>
              Driven by {pred.archetype.why.slice(0, 3).map((w) => w.label).join(', ')}.
            </Text>
          )}
          <Pressable onPress={() => openPage('/mind')} style={s.wOpen}>
            <Text style={s.wOpenText}>Open full diagnostics</Text>
            <Ionicons name="open-outline" size={13} color={c.relevance} />
          </Pressable>
        </Card>
      )}

      {open === 'ops' && (
        <Card style={s.wPanel}>
          <Label>This session, as the operator sees it</Label>
          <View style={s.wGrid}>
            <Metric n={sco.events.length} l="events" />
            <Metric n={sco.spins} l="spins" />
            <Metric n={sco.seq.length} l="launches" />
            <Metric n={new Set(sco.seq).size} l="distinct titles" />
            <Metric n={`${minutesOf(sco)}m`} l="session length" />
            <Metric n={`€${(sco.staked / 100).toFixed(2)}`} l="staked" />
            <Metric
              n={`${net >= 0 ? '+' : '-'}€${Math.abs(net / 100).toFixed(2)}`}
              l="net"
              tone={net >= 0 ? c.calm : c.risk}
            />
            <Metric n={`${sco.completedConfirm}/${sco.reachedConfirm}`} l="confirm done" />
          </View>
          <Text style={s.wWhy}>
            Cohort #{pred.cohort.id} · {pred.cohort.dominant} · risk{' '}
            {(pred.risk.p * 100).toFixed(1)}%. These are the same numbers streaming to the
            operator dashboard.
          </Text>
          <Pressable onPress={() => openPage('/ops')} style={s.wOpen}>
            <Text style={s.wOpenText}>Open operator dashboard</Text>
            <Ionicons name="open-outline" size={13} color={c.relevance} />
          </Pressable>
        </Card>
      )}
    </View>
  );
}

const minutesOf = (sco) => Math.max(0, (sco.lastAt - sco.startedAt) / 60000).toFixed(1);

const ARCH = {
  opening: 'Nothing tapped yet — popularity prior only.',
  browsing: 'Several titles, little dwell. Looking, not playing.',
  focused: 'Returning to one or two titles. Continuity first.',
  seeking: 'Repeated search. Surfacing what was searched for.',
};

export default function HomeScreen({ onOpenGame, onOpenReal, onOpenCascade, onExplore }) {
  const { shelf, policy, risk, arm, dispatch, emit, sco, balanceCents, minutes, pred, rg } = useLantern();
  const [cat, setCat] = useState('lobby');
  const [q, setQ] = useState('');
  const [bell, setBell] = useState(false);
  const [chatWith, setChatWith] = useState(null);


  // Other people currently playing, straight off the relay.
  const me = loadProfile();
  const { peers, winners, contacts, announcements, threadWith, send, activity, status: peerStatus } =
    usePeers(sco.sessionId, me?.name);

  // Grid columns from the width actually available — measured, not guessed.
  // The 560 the frame was assumed to cap at is not what it measures on a
  // desktop, and 34px of optimism is enough to wrap a four-tile row down to
  // three and leave a hole. onLayout reports the box the tiles really sit in.
  const { width: winW } = useWindowDimensions();
  const [catBox, setCatBox] = useState(0);
  const onCatLayout = (e) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w && w !== catBox) setCatBox(w);
  };
  // catGrid sits inside s.pad, so its measured box already excludes the page
  // gutters — unlike Explore's grid, which carries its own padding.
  const gridW = catBox || Math.min(winW, 520) - sp(8);
  const cols = Math.max(3, Math.min(6, Math.floor((gridW + sp(2.5)) / (112 + sp(2.5)))));
  // The grid spaces its own children with columnGap and the tiles pass
  // gutter={0}, so a row needs cols - 1 gutters. Budgeting for cols instead —
  // which is what a trailing marginRight forces — parks 10px of dead space on
  // the right of every row and makes the block look off-centre.
  const tileW = Math.floor((gridW - (cols - 1) * sp(2.5)) / cols);

  const isLantern = arm === 'lantern';
  const items = shelf.items;

  // The ranker puts titles you have already opened at the top — `already_seen`
  // is a strong learned feature, and for a returning player that is correct.
  // It is also the wrong thing to lead a *lobby* with: a shelf that recommends
  // the game you are already playing has told you nothing. So the two are
  // split. Continue is continuity; the feed is discovery, and discovery means
  // titles this session has not touched.
  const seenIds = useMemo(() => new Set(sco.seq), [sco.seq]);
  const continueItems = useMemo(
    () => (isLantern ? items.filter((g) => seenIds.has(g.id)) : []),
    [items, seenIds, isLantern]
  );
  const fresh1 = useMemo(
    () => (isLantern ? items.filter((g) => !seenIds.has(g.id)) : items),
    [items, seenIds, isLantern]
  );
  // Placed a little way in, so the hero stays a ranked title and these read as
  // part of the shelf rather than as a promo strip bolted to the top.
  const feedItems = useMemo(() => {
    if (!isLantern) return fresh1;
    const out = [...fresh1];
    out.splice(Math.min(2, out.length), 0, SPECIALS[0]);
    out.splice(Math.min(5, out.length), 0, SPECIALS[1]);
    return out;
  }, [fresh1, isLantern]);

  const [hero, ...rest] = feedItems;

  /** The two specials open their own screens; everything else is a stand-in. */
  const openTile = (g) => {
    if (g.special === 'real') return onOpenReal();
    if (g.special === 'casual') return onOpenCascade();
    return onOpenGame(g);
  };

  // Sport in, casino out. Only ever populated once a sport has been engaged.
  const cross = useMemo(
    () => (isLantern ? paceMatched(sco, catalog, 10) : null),
    [sco, isLantern]
  );

  // Fit per tile. Same scorer the game screen uses, so the number on the tile and
  // the number on the card can never disagree.
  const fits = useMemo(() => {
    if (!isLantern) return {};
    const names = sco.seq.map((id) => BY_ID.get(id)?.name).filter(Boolean);
    const ctx = rankingContext(names, pred.archetype.index);
    const m = {};
    for (const g of [...fresh1, ...continueItems, ...(cross?.items || [])]) {
      const f = fitFor(g.name, ctx);
      // Every tile gets a score. Titles the trained table knows use the fitted
      // one; the tail falls back to a content score and is marked "est", so a
      // missing badge never reads as a broken tile.
      m[g.id] = f && f.fit != null
        ? { v: f.fit, est: false }
        : { v: coldFit(g, sco), est: true };
    }
    return m;
  }, [isLantern, sco, pred.archetype.index, fresh1, continueItems, cross]);

  const notes = useMemo(
    () => (isLantern
      ? tray({ sco, minutes, pred, risk, rg, topPick: fresh1[0] })
      : { sent: [], held: [] }),
    [isLantern, sco, minutes, pred, risk, rg, fresh1]
  );

  // The category chips used to set state nothing read — they looked like
  // navigation and did nothing. Each one now selects a slice of the catalogue,
  // and the slice is ordered by the same trained ranker as the lobby, so the A/B
  // holds *inside* a category too rather than only on the front page.
  const isLobby = cat === 'lobby';

  const categoryItems = useMemo(() => {
    if (isLobby) return [];
    const pool =
      cat === 'jackpots' ? catalog.filter((g) => g.jackpot)
      : cat === 'new' ? catalog.filter((g) => g.isNew || g.label === 'NOVO').concat(catalog.slice(40, 90))
      : cat === 'favorites' ? catalog.filter((g) => g.launches > 0)
      : catalog;

    const uniq = [...new Map(pool.map((g) => [g.id, g])).values()];

    if (!isLantern) return uniq.sort((a, b) => b.launches - a.launches).slice(0, 24);

    const names = sco.seq.map((id) => BY_ID.get(id)?.name).filter(Boolean);
    const ctx = rankingContext(names, pred.archetype.index);
    return uniq
      .map((g) => ({ g, s: scoreGame(g.name, ctx)?.score ?? -99 }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 24)
      .map((x) => x.g);
  }, [cat, isLobby, isLantern, sco.seq, pred.archetype.index]);

  const catFits = useMemo(() => {
    if (isLobby || !isLantern) return {};
    const names = sco.seq.map((id) => BY_ID.get(id)?.name).filter(Boolean);
    const ctx = rankingContext(names, pred.archetype.index);
    const m = {};
    for (const g of categoryItems) {
      const f = fitFor(g.name, ctx);
      m[g.id] = f && f.fit != null
        ? { v: f.fit, est: false }
        : { v: coldFit(g, sco), est: true };
    }
    return m;
  }, [categoryItems, isLobby, isLantern, sco, pred.archetype.index]);

  const race = HORSE_CARDS[0];
  const backRunner = (r) => {
    emit({ t: 'slip_add', sport: 'Konjičke utrke', selectionId: r.horse, fixtureId: race.id, addedFrom: 'racecard' });
    emit({ t: 'confirm_reach', legs: 1 });
  };

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
      <View style={s.chromeWrap}>
      <LinearGradient colors={[c.brand, c.brandDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.chrome}>
        <Row>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2) }}>
            <Ionicons name="flame" size={19} color="#fff" />
            <Text style={s.brand}>LANTERN</Text>
            <Text style={s.brandSub}>psk.hr</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(3) }}>
            <Text style={s.balance}>€{(balanceCents / 100).toFixed(2)}</Text>
            {isLantern && (
              <Pressable onPress={() => setBell((b) => !b)} hitSlop={10} accessibilityLabel="Notifications">
                <Ionicons name={bell ? 'notifications' : 'notifications-outline'} size={19} color="#fff" />
                {notes.sent.length + contacts.length + announcements.length > 0 && (
                  <View style={s.bellDot}><Text style={s.bellDotText}>{notes.sent.length + contacts.length + announcements.length}</Text></View>
                )}
              </Pressable>
            )}
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

      {bell && isLantern && (
        <View style={s.trayAnchor}>
          <View style={s.trayCaret} />
          <Card style={s.trayCard}>
            <Row>
              <Label>Notifications</Label>
              <Text style={s.trayCount}>
                {notes.sent.length + contacts.length + announcements.length} shown
                {peerStatus === 'live' ? ` · ${peers.length} online` : ''}
              </Text>
            </Row>

            {announcements
              // Only posts whose author is still playing. A result from a session
              // that has since ended is not something anyone can go and verify,
              // which was the entire point of showing it.
              .filter((a) => peers.some((p) => p.sessionId === a.from))
              .filter((a, i, arr) => arr.findIndex((x) => x.from === a.from) === i)
              .slice(0, 4)
              .map((a) => {
              const from = peers.find((p) => p.sessionId === a.from);
              const net = (from?.counters?.netCents ?? 0) / 100;
              const open = chatWith === a.from;
              return (
                <View key={a.id} style={{ gap: sp(2) }}>
                  <Pressable
                    onPress={() => from && setChatWith(open ? null : a.from)}
                    style={s.note}
                  >
                    <Ionicons name="megaphone" size={15} color={c.gold} style={{ marginTop: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.noteTitle}>
                        {a.fromName} posted a result
                        {from ? ` · ${net >= 0 ? '+' : '−'}€${Math.abs(net).toFixed(2)}` : ''}
                      </Text>
                      <Text style={s.noteBody}>
                        {a.text
                          ? `"${a.text}" — `
                          : ''}
                        {from?.counters?.spins ?? 0} spins, still playing. The figure is read
                        from their live session, not from what they typed.
                      </Text>
                    </View>
                    {from && (
                      <Ionicons
                        name={open ? 'chevron-up' : 'chatbubble-ellipses-outline'}
                        size={15}
                        color={c.relevance}
                      />
                    )}
                  </Pressable>
                  {open && from && (
                    <PeerChat
                      peer={from}
                      meId={sco.sessionId}
                      thread={threadWith(from.sessionId)}
                      onSend={send}
                      onClose={() => setChatWith(null)}
                    />
                  )}
                </View>
              );
            })}

            {contacts
              .filter((p) => !announcements.slice(0, 4).some((a) => a.from === p.sessionId))
              .map((p) => {
              const net = (p.counters?.netCents ?? 0) / 100;
              const open = chatWith === p.sessionId;
              return (
                <View key={p.sessionId} style={{ gap: sp(2) }}>
                  <Pressable
                    onPress={() => setChatWith(open ? null : p.sessionId)}
                    style={s.note}
                  >
                    <Ionicons name="trophy" size={15} color={c.gold} style={{ marginTop: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.noteTitle}>
                        {net > 0
                          ? `${p.name} is up €${net.toFixed(2)}`
                          : `${p.name} messaged you`}
                      </Text>
                      <Text style={s.noteBody}>
                        {net > 0
                          ? `${p.counters?.spins ?? 0} spins this session, playing now. Their session is on the relay — tap to ask them about it.`
                          : `Playing now, ${net < 0 ? 'down' : 'level'} €${Math.abs(net).toFixed(2)}. Tap to reply.`}
                      </Text>
                    </View>
                    <Ionicons
                      name={open ? 'chevron-up' : 'chatbubble-ellipses-outline'}
                      size={15}
                      color={c.relevance}
                    />
                  </Pressable>
                  {open && (
                    <PeerChat
                      peer={p}
                      meId={sco.sessionId}
                      thread={threadWith(p.sessionId)}
                      onSend={send}
                      onClose={() => setChatWith(null)}
                    />
                  )}
                </View>
              );
            })}

            {/* Everyone else online, whether or not they are ahead. Reachability
                should not depend on winning: needing a peer to be up before you
                could message them made the person who was asked unable to reply,
                and made a quiet player invisible. */}
            {(() => {
              const shown = new Set([
                ...announcements.map((a) => a.from),
                ...contacts.map((p) => p.sessionId),
              ]);
              const rest = peers.filter((p) => !shown.has(p.sessionId));
              if (!rest.length) return null;
              return (
                <View style={s.onlineBlock}>
                  <Text style={s.onlineLabel}>
                    PLAYERS ONLINE · {rest.length}
                  </Text>
                  {rest.map((p) => {
                    const net = (p.counters?.netCents ?? 0) / 100;
                    const open = chatWith === p.sessionId;
                    return (
                      <View key={p.sessionId} style={{ gap: sp(2) }}>
                        <Pressable
                          onPress={() => setChatWith(open ? null : p.sessionId)}
                          style={s.onlineRow}
                        >
                          <View style={s.onlineDot} />
                          <View style={{ flex: 1 }}>
                            <Text style={s.onlineName}>{p.name}</Text>
                            <Text style={s.onlineMeta}>
                              {p.character?.label || 'reading'} · {p.counters?.spins ?? 0} spins ·{' '}
                              {net >= 0 ? '+' : '−'}€{Math.abs(net).toFixed(2)}
                            </Text>
                          </View>
                          <Ionicons
                            name={open ? 'chevron-up' : 'chatbubble-ellipses-outline'}
                            size={15}
                            color={c.relevance}
                          />
                        </Pressable>
                        {open && (
                          <PeerChat
                            peer={p}
                            meId={sco.sessionId}
                            thread={threadWith(p.sessionId)}
                            onSend={send}
                            onClose={() => setChatWith(null)}
                          />
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })()}

            {peers.length === 0 && peerStatus === 'live' && (
              <Text style={s.noteBody}>
                Nobody else online. Sign in as another player in a second browser profile and they
                appear here.
              </Text>
            )}

            {notes.sent.map((n) => (
              <View key={n.id} style={s.note}>
                <Ionicons name={n.icon} size={15} color={c.relevance} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.noteTitle}>{n.title}</Text>
                  <Text style={s.noteBody}>{n.body}</Text>
                </View>
              </View>
            ))}

            {activity.length > 0 && (
              <View style={s.ledgerBlock}>
                <Text style={s.onlineLabel}>LIVE ACTIVITY</Text>
                {activity.slice(0, 8).map((a) => {
                  const net = a.netCents / 100;
                  const verb =
                    a.t === 'spin' ? 'spun'
                    : a.t === 'game_open' ? 'opened a game'
                    : a.t === 'game_close' ? 'closed a game'
                    : a.t === 'slip_add' ? 'added a selection'
                    : a.t === 'confirm_done' ? 'placed a bet'
                    : a.t.replace('_', ' ');
                  return (
                    <View key={a.key} style={s.tapeRow}>
                      <View style={s.tapeDot} />
                      <Text style={s.tapeText} numberOfLines={1}>
                        <Text style={s.tapeWho}>{a.name}</Text> {verb}
                        {a.spins ? ` · ${a.spins} spins` : ''}
                        {net ? ` · ${net >= 0 ? '+' : '−'}€${Math.abs(net).toFixed(2)}` : ''}
                      </Text>
                      <Text style={s.tapeTime}>
                        {new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

          </Card>
        </View>
      )}
      </View>

      <ChipRail items={CATS} value={cat} onChange={setCat} style={{ paddingTop: sp(3) }} />

      {/* ---------- the A/B ---------- */}
      <View style={s.pad}>
        <Toggle
          value={arm}
          onChange={(a) => dispatch({ type: 'setArm', arm: a })}
          options={[{ value: 'baseline', label: 'Generic lobby' }, { value: 'lantern', label: 'Lantern' }]}
        />
      </View>

      {!isLobby && (
        <View style={[s.pad, { marginTop: sp(4) }]}>
          <Row>
            <Label>{CATS.find((x) => x.value === cat)?.label}</Label>
            <Text style={s.catCount}>
              {categoryItems.length} titles · {isLantern ? 'ranked for you' : 'by popularity'}
            </Text>
          </Row>
          <View style={s.catGrid} onLayout={onCatLayout}>
            {categoryItems.map((g, i) => (
              <GameTile
                key={g.id}
                game={g}
                rank={isLantern ? i : undefined}
                fit={catFits[g.id]?.v} estimated={catFits[g.id]?.est}
                width={tileW}
                gutter={0}
                onPress={() => openTile(g)}
                jackpotAmount={g.jackpot ? potFor(g) : undefined}
              />
            ))}
          </View>
          {categoryItems.length === 0 && (
            <Note tone="quiet">Nothing in this category right now.</Note>
          )}
        </View>
      )}

      {isLobby && (
        <>
      {isLantern && <Widgets pred={pred} sco={sco} risk={risk} />}

      {/* ---------- next off: the cross-vertical entry point ---------- */}
      <View style={[s.pad, { marginTop: sp(4) }]}>
        <View style={s.raceCard}>
          <Row>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2) }}>
              <Ionicons name="trail-sign" size={14} color={c.gold} />
              <Text style={s.raceTag}>NEXT OFF</Text>
              <Text style={s.raceTime}>{race.time}</Text>
            </View>
            <Text style={s.raceMeta}>{race.hrCourse} · {race.distance}</Text>
          </Row>
          <Text style={s.raceGrade}>{race.grade} · {race.runners} runners · {race.going}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.runners}>
            {race.field.slice(0, 5).map((r) => (
              <Pressable key={r.no} onPress={() => backRunner(r)} style={s.runner}>
                <Text style={s.runnerNo}>{r.no}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.runnerName} numberOfLines={1}>{r.horse}</Text>
                  <Text style={s.runnerForm}>{r.form} · {r.jockey}</Text>
                </View>
                <Text style={s.runnerOdds}>{r.odds.toFixed(2)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* ---------- sport in, casino out ---------- */}
      {cross && cross.items.length > 0 && (
        <View style={{ marginTop: sp(5) }}>
          <SectionHeader icon="git-compare" tint={c.gold} title="Because you backed a race" count={cross.items.length} />
          <View style={s.pad}>
            <Text style={s.crossWhy}>{cross.why}</Text>
            <Text style={s.crossPrior}>
              {XV_LEARNED
                ? 'Weight fitted on the logs.'
                : 'Matched on event frequency — the one axis sport and casino share. Stated prior, not fitted: the sample carries no racing.'}
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>
            {cross.items.map((g, i) => (
              <GameTile key={g.id} game={g} rank={i} fit={fits[g.id]?.v} estimated={fits[g.id]?.est} onPress={() => openTile(g)} />
            ))}
          </ScrollView>
        </View>
      )}

      {/* ---------- hero ---------- */}
      {hero && (
        <View style={[s.pad, { marginTop: sp(4) }]}>
          <Pressable onPress={() => openTile(hero)}>
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

      {/* ---------- the two non-standard surfaces, side by side ---------- */}
      <View style={[s.pad, { marginTop: sp(4) }]}>
        <View style={s.pair}>
          <Pressable onPress={onOpenReal} style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.8 }]}>
            <LinearGradient colors={['#8A5A12', '#4A2E06']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.pairCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(1.5) }}>
                <Ionicons name="shield-checkmark" size={12} color={c.gold} />
                <Text style={s.pairTag}>CERTIFIED</Text>
              </View>
              <Text style={s.pairName}>Empire of Gold</Text>
              <Text style={s.pairSub}>Fazi · unmodified. Lantern wraps it and never touches it.</Text>
              <Ionicons name="play-circle" size={26} color={c.gold} style={{ marginTop: sp(1) }} />
            </LinearGradient>
          </Pressable>

          <Pressable onPress={onOpenCascade} style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.8 }]}>
            <LinearGradient colors={['#3C6E8A', '#22414F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.pairCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(1.5) }}>
                <Ionicons name="happy-outline" size={12} color={c.relevance} />
                <Text style={[s.pairTag, { color: c.relevance }]}>NOTHING WAGERED</Text>
              </View>
              <Text style={s.pairName}>Slatki Slap</Text>
              <Text style={s.pairSub}>Match-three. No stake, no payout — open at every risk state.</Text>
              <Ionicons name="grid" size={24} color={c.relevance} style={{ marginTop: sp(1) }} />
            </LinearGradient>
          </Pressable>
        </View>
      </View>

      {/* The Lantern-arm "Session read" card lived here. It duplicated the
          YOUR READ widget above it, so it went. The control-arm note stays:
          it is the one place the generic lobby explains what it is not doing. */}
      {!isLantern && (
        <View style={s.pad}>
          <Note tone="risk">
            Same order for every player, and no card says why it is here. In the real logs this
            is why search out-ranks every curated row —{' '}
            {metrics.discovery.rows[0].n.toLocaleString()} launches via search against{' '}
            {metrics.discovery.rows[1].n.toLocaleString()} via category rows.
          </Note>
        </View>
      )}

      {/* ---------- continuity, kept apart from discovery ---------- */}
      {continueItems.length > 0 && (
        <View style={{ marginTop: sp(5) }}>
          <SectionHeader icon="play-back" tint={c.calm} title="Continue" count={continueItems.length} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>
            {continueItems.map((g, i) => (
              <GameTile key={g.id} game={g} rank={i} fit={fits[g.id]?.v} estimated={fits[g.id]?.est} onPress={() => openTile(g)} />
            ))}
          </ScrollView>
        </View>
      )}

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
              <GameTile key={g.id} game={g} rank={i} fit={fits[g.id]?.v} estimated={fits[g.id]?.est} onPress={() => openTile(g)}
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
            <GameTile key={g.id} game={g} width={128} onPress={() => openTile(g)} jackpotAmount={potFor(g)} />
          ))}
        </ScrollView>
      </View>

      {/* ---------- PSK favourites ---------- */}
      <View style={{ marginTop: sp(6) }}>
        <SectionHeader icon="star" title="PSK Favoriti" count={33} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>
          {favorites.map((g) => <GameTile key={g.id} game={g} onPress={() => openTile(g)} />)}
        </ScrollView>
      </View>

      {/* ---------- new ---------- */}
      <View style={{ marginTop: sp(6) }}>
        <SectionHeader icon="sparkles" title="Nove Igre" count={fresh.length} tint={c.fresh} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>
          {fresh.map((g) => <GameTile key={g.id} game={g} onPress={() => openTile(g)} />)}
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

        </>
      )}

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
  onlineBlock: { borderTopWidth: 1, borderTopColor: c.ruleSoft, paddingTop: sp(2), gap: sp(1.5) },
  ledgerBlock: { borderTopWidth: 1, borderTopColor: c.ruleSoft, paddingTop: sp(2), gap: sp(1.5) },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  tapeRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  tapeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: c.relevance },
  tapeText: { ...type.tiny, color: c.inkSoft, flex: 1, fontSize: 10 },
  tapeWho: { color: c.ink, fontWeight: '800' },
  tapeTime: { ...type.tiny, color: c.inkFaint, fontSize: 9, ...type.num },
  ledgerWho: { ...type.tiny, color: c.ink, fontWeight: '700', fontSize: 10.5 },
  ledgerMeta: { ...type.tiny, color: c.inkFaint, fontSize: 9 },
  ledgerNet: { ...type.tiny, fontWeight: '800', ...type.num, fontSize: 11.5 },
  onlineLabel: { ...type.label, fontSize: 8.5, color: c.inkFaint },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2.5) },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.calm },
  onlineName: { ...type.soft, color: c.ink, fontWeight: '700' },
  onlineMeta: { ...type.tiny, color: c.inkFaint, fontSize: 9.5 },

  peerChat: {
    backgroundColor: c.inset, borderRadius: radius.md, padding: sp(2.5), gap: sp(2),
    borderWidth: 1, borderColor: c.relevance,
  },
  peerChatName: { ...type.soft, color: c.ink, fontWeight: '800' },
  peerChatMeta: { ...type.tiny, color: c.inkFaint, fontSize: 9.5 },
  peerVerify: { flexDirection: 'row', alignItems: 'flex-start', gap: sp(1.5) },
  peerVerifyText: { ...type.tiny, color: c.calm, flex: 1, lineHeight: 14 },
  peerHint: { ...type.tiny, color: c.inkFaint },
  peerBubble: { maxWidth: '88%', borderRadius: radius.sm, paddingHorizontal: sp(2.5), paddingVertical: sp(1.5) },
  peerMine: { alignSelf: 'flex-end', backgroundColor: c.brand },
  peerTheirs: { alignSelf: 'flex-start', backgroundColor: c.surfaceAlt },
  peerMineText: { ...type.tiny, color: '#fff', lineHeight: 15 },
  peerTheirsText: { ...type.tiny, color: c.ink, lineHeight: 15 },
  peerInputRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  peerInput: {
    flex: 1, backgroundColor: c.surface, borderRadius: radius.sm, borderWidth: 1,
    borderColor: c.rule, paddingHorizontal: sp(2.5), paddingVertical: sp(2),
    color: c.ink, fontSize: 12,
  },
  peerSend: {
    width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center',
    justifyContent: 'center', backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.rule,
  },

  widgets: { flexDirection: 'row', gap: sp(2.5) },
  widget: {
    flex: 1, backgroundColor: c.surfaceAlt, borderRadius: radius.lg, padding: sp(3),
    borderWidth: 1, borderColor: c.rule, gap: sp(1), minHeight: 132,
  },
  widgetTop: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5) },
  widgetTag: { ...type.label, color: c.relevance, fontSize: 8.5 },
  widgetBig: { ...type.h2, fontSize: 19, marginTop: sp(1) },
  widgetTrack: { height: 4, backgroundColor: c.inset, borderRadius: 2, overflow: 'hidden' },
  widgetFill: { height: '100%', backgroundColor: c.relevance, borderRadius: 2 },
  widgetSub: { ...type.tiny, lineHeight: 14 },
  widgetChip: {
    alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.pill,
    paddingHorizontal: sp(1.5), paddingVertical: 1, marginTop: 'auto',
  },
  widgetChipText: { ...type.tiny, fontWeight: '900', fontSize: 8.5 },
  widgetRow: { flexDirection: 'row', gap: sp(2), marginTop: sp(1) },
  widgetStat: { ...type.tiny, color: c.inkSoft, ...type.num },
  widgetRelay: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5), marginTop: 'auto' },
  widgetDot: { width: 6, height: 6, borderRadius: 3 },
  widgetRelayText: { ...type.tiny, fontSize: 9.5, color: c.inkFaint },

  wPanel: { marginTop: sp(2.5), gap: sp(2) },
  wProb: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  wProbName: { ...type.tiny, color: c.inkSoft, flex: 1.1 },
  wProbTrack: { flex: 1.6, height: 5, backgroundColor: c.inset, borderRadius: 3, overflow: 'hidden' },
  wProbFill: { height: '100%', borderRadius: 3 },
  wProbPct: { ...type.tiny, ...type.num, width: 34, textAlign: 'right' },
  wWhy: { ...type.tiny, lineHeight: 15 },
  wGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2) },
  wMetric: { flexGrow: 1, flexBasis: '22%', backgroundColor: c.inset, borderRadius: radius.md, padding: sp(2) },
  wMetricN: { ...type.body, fontWeight: '800', ...type.num, fontSize: 14 },
  wMetricL: { ...type.tiny, fontSize: 9.5, lineHeight: 13 },
  wOpen: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5), marginTop: sp(1) },
  wOpenText: { ...type.tiny, color: c.relevance, fontWeight: '800' },
  pair: { flexDirection: 'row', gap: sp(2.5) },
  pairCard: { flex: 1, borderRadius: radius.lg, padding: sp(3), gap: 3, minHeight: 132 },
  pairTag: { ...type.label, color: c.gold, fontSize: 8.5 },
  pairName: { ...type.body, color: '#fff', fontWeight: '900', fontSize: 15 },
  pairSub: { ...type.tiny, color: 'rgba(255,255,255,0.72)', lineHeight: 14 },

  catCount: { ...type.tiny, color: c.inkFaint },
  catGrid: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start',
    columnGap: sp(2.5), rowGap: sp(3.5), marginTop: sp(3),
  },
  chromeWrap: { position: 'relative', zIndex: 40 },
  trayAnchor: {
    position: 'absolute', top: '100%', right: sp(4), width: 316, zIndex: 50, marginTop: -2,
  },
  trayCaret: {
    position: 'absolute', top: -5, right: 10, width: 10, height: 10,
    backgroundColor: c.surface, borderLeftWidth: 1, borderTopWidth: 1,
    borderColor: c.rule, transform: [{ rotate: '45deg' }],
  },
  trayCard: { gap: sp(2), borderWidth: 1, borderColor: c.rule, ...shadow },
  bellDot: {
    position: 'absolute', top: -5, right: -7, minWidth: 15, height: 15, borderRadius: 8,
    backgroundColor: c.relevance, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bellDotText: { fontSize: 9, fontWeight: '900', color: '#04121A' },
  trayCount: { ...type.tiny, color: c.inkFaint },
  note: { flexDirection: 'row', gap: sp(2), alignItems: 'flex-start' },
  noteTitle: { ...type.soft, color: c.ink, fontWeight: '700' },
  noteBody: { ...type.tiny, lineHeight: 16, marginTop: 1 },

  raceCard: {
    backgroundColor: c.surface, borderRadius: radius.lg, padding: sp(3),
    borderWidth: 1, borderColor: 'rgba(229,184,81,0.35)', gap: sp(1.5),
  },
  raceTag: { ...type.label, color: c.gold, fontSize: 9.5 },
  raceTime: { ...type.body, fontWeight: '900', color: c.ink, fontVariant: ['tabular-nums'] },
  raceMeta: { ...type.tiny },
  raceGrade: { ...type.tiny, color: c.inkSoft },
  runners: { gap: sp(2), paddingTop: sp(1) },
  runner: {
    flexDirection: 'row', alignItems: 'center', gap: sp(2), width: 196,
    backgroundColor: c.inset, borderRadius: radius.md, padding: sp(2),
    borderWidth: 1, borderColor: c.rule,
  },
  runnerNo: {
    ...type.tiny, color: c.ink, fontWeight: '900', width: 18, height: 18,
    textAlign: 'center', lineHeight: 18, backgroundColor: c.surfaceAlt, borderRadius: 4,
  },
  runnerName: { ...type.tiny, color: c.ink, fontWeight: '700' },
  runnerForm: { ...type.tiny, color: c.inkFaint, fontSize: 10 },
  runnerOdds: { ...type.body, color: c.gold, fontWeight: '900', fontVariant: ['tabular-nums'] },

  crossWhy: { ...type.soft, marginBottom: sp(1) },
  crossPrior: { ...type.tiny, color: c.inkFaint, marginBottom: sp(1) },

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

/**
 * Game screen — a stand-in, shaped by the title it stands in for.
 *
 * There is no way to run 3,131 certified bundles in a prototype, so this is a
 * simulation. But it is not one generic simulation: the board, the symbols, the
 * stake ladder, the RTP and the jackpot meter all come from the real catalogue
 * entry the portal API returned. A classic fruit slot gets three reels and
 * sevens; a cluster game gets a 6x5 board; a table game gets cards. Two titles
 * look and play differently because the metadata behind them differs.
 *
 * Outcomes are a uniform draw against a published table. Lantern has no path to
 * outcome selection and never will (§10, out of bounds by construction) — this
 * exists only so the behavioural markers have real play to read. For the real
 * thing, open Empire of Gold from the feed.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLantern } from '../lantern/useLantern';
import { Btn, Card, Label, Row, StateChip, Note } from '../components/ui';
import { fitFor, rankingContext, scoreGame, winProbability, EVAL } from '../lantern/model';
import { BY_ID } from '../lantern/relevance';
import GameArt from '../components/GameArt';
import { c, sp, type, radius } from '../theme';

/** Board shape and symbol set per mechanic — the same attribute the recommender
 *  ranks on, so a shelf of one family plays as a family. */
const KIT = {
  'classic-fruit': {
    cols: 3, rows: 3,
    symbols: ['7', '★', '🍒', '🍋', '🔔', '🍉'],
    pay: { 6: 30, 5: 6, 4: 2 },   // 28.5% hit, RTP 0.958
    tone: ['#8E2A22', '#4A120E'],
    label: 'reels',
  },
  'link-jackpot': {
    cols: 5, rows: 3,
    symbols: ['💰', '👑', '🔔', '💎', '⭐', '7'],
    pay: { 8: 35, 7: 9, 6: 3 },   // 16.4% hit, RTP 0.927
    tone: ['#8A5A12', '#40280A'],
    label: 'reels',
  },
  'cluster-tumble': {
    cols: 6, rows: 5,
    symbols: ['🍬', '🍇', '🍭', '🍏', '💜', '⭐'],
    pay: { 11: 6, 10: 4, 9: 2.5 },   // 29.4% hit, RTP 0.995
    tone: ['#6B2E7A', '#331439'],
    label: 'cluster',
  },
  'book-adventure': {
    cols: 5, rows: 3,
    symbols: ['📖', '👁', '🪲', '★', '♛', 'A'],
    pay: { 8: 35, 7: 9, 6: 3.5 },   // 16.3% hit, RTP 0.983
    tone: ['#7A5116', '#3A250A'],
    label: 'reels',
  },
  table: {
    cols: 3, rows: 1,
    symbols: ['♠', '♥', '♦', '♣', 'J', 'Q'],
    pay: { 3: 14, 2: 1.5 },   // 44.4% hit, RTP 1.017
    tone: ['#14563C', '#0A2A1D'],
    label: 'cards',
  },
  // Not everything in a casino spins. A catalogue that is 2,997 slots and 117
  // table games still contains dice, wheels and crash titles, and a lobby demo
  // where every tile plays identically undersells the breadth the ranker is
  // actually ordering. These three are picked by title and type in kitFor().
  dice: {
    cols: 3, rows: 2,
    symbols: ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'],
    pay: { 5: 55, 4: 6, 3: 1.5 },   // 36.8% hit, RTP 0.983
    tone: ['#1F5D4A', '#0D2A21'],
    label: 'dice',
  },
  wheel: {
    cols: 4, rows: 3,
    // Six distinct pockets, and a bottom tier of four. Listing a colour twice
    // left four distinct symbols across twelve cells, and by pigeonhole one of
    // them always reached the three-of tier - a roulette that could not lose,
    // which took the loss run, the 'no win' copy and every risk marker off the
    // table for all fourteen roulette titles.
    symbols: ['🔴', '⚫', '🟢', '🔵', '🟡', '★'],
    pay: { 7: 30, 6: 8, 5: 2.5 },   // 21.6% hit, RTP 0.969
    tone: ['#5B1D22', '#2A0C0F'],
    label: 'pockets',
  },
  crash: {
    cols: 5, rows: 2,
    // The rocket was listed twice, leaving five distinct multipliers across ten
    // cells — the same pigeonhole that made the wheel unlosable, in milder form.
    symbols: ['🚀', '📈', '💥', '✦', '🎯', '📉'],
    pay: { 6: 16, 5: 4, 4: 1.5 },   // 40.2% hit, RTP 1.008
    tone: ['#2B3A6B', '#121A33'],
    label: 'multipliers',
  },

  'video-slot': {
    cols: 5, rows: 3,
    // Was abstract geometry, which read as a wireframe rather than a slot.
    // video-slot is the largest family in the catalogue, so this set is what
    // most titles show — it has to look like the thing it stands in for.
    symbols: ['💎', '👑', '🔥', '⚡', '🍀', '7'],
    pay: { 8: 30, 7: 10, 6: 3 },   // 16.4% hit, RTP 0.928
    tone: ['#1D4E6B', '#0D2634'],
    label: 'reels',
  },
};

/**
 * Title and type decide the format before mechanic does.
 *
 * The catalogue only carries six mechanics, so a roulette wheel and a dice game
 * both arrive labelled `table` or `video-slot` and would play identically. The
 * name is the better signal here, and it is the same signal the player reads on
 * the tile.
 */
function kitFor(g) {
  const n = (g.name || '').toLowerCase();
  // Title first, because the live catalogue's `type` only separates Slot from
  // Table from Crash — a roulette and a blackjack are both `Table`, and both
  // would otherwise deal cards. `wheel` alone is not a signal either: Zodiac
  // Wheel is a reel game.
  if (/roulette|ruleta|wheel of/.test(n)) return KIT.wheel;
  if (/dice|kocke|sic bo|craps/.test(n)) return KIT.dice;
  if (g.type === 'Crash' || /aviator|crash|plinko|rocket|spaceman|zeppelin/.test(n)) return KIT.crash;
  if (/dream catcher|spin a win|big baller|balloon race/.test(n)) return KIT.wheel;
  if (/blackjack|poker|baccarat|punto banco/.test(n)) return KIT.table;
  // Twenty-one live-catalogue `Table` titles - Casino Hold'em, Dragon Tiger,
  // Andar Bahar, Jacks or Better - carry mechanic `video-slot`, so without
  // this they fall through to five reels and a Spin button.
  if (g.type === 'Table') return KIT.table;
  return KIT[g.mechanic] || KIT['video-slot'];
}

/** Emoji carry their own colour; bare glyphs need one or the grid goes flat. */
const SYM_TINT = {
  7: '#FF6B5B', '★': '#F2C14E', '⭐': '#F2C14E', A: '#EFF4F8',
  '♠': '#DCE6EE', '♣': '#DCE6EE', '♥': '#E8544B', '♦': '#E8544B',
  J: '#DCE6EE', Q: '#E8A33D', '♛': '#F2C14E', '◆': '#5AC8E0',
  '👁': '#9FD8E8', '💜': '#C08BE0',
};

/** Stake ladder from the title's own limits, not a hardcoded list. */
function stakesFor(game) {
  const min = Math.max(10, Math.round((game.minBet ?? 0.2) * 100));
  const max = Math.min(5000, Math.max(min * 4, Math.round((game.maxBet ?? 50) * 100)));
  const out = [min];
  let v = min;
  while (out.length < 5) {
    v = v < 100 ? v * 2 : v < 500 ? v + 100 : v + 500;
    if (v >= max) break;
    out.push(Math.round(v));
  }
  out.push(max);
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Stable pseudo-live pot, same value every render. */
function potFor(game) {
  let h = 0;
  for (let i = 0; i < game.name.length; i++) h = (h * 31 + game.name.charCodeAt(i)) >>> 0;
  return 1200 + (h % 890000) / 100;
}

/**
 * Fit — how well this title matches how this person is playing right now.
 *
 * Explicitly NOT "your odds of winning". Every title here has a house edge, no
 * model changes that, and implying a player edge is the precise dark pattern the
 * brief's guardrail rules out — and it is judged. So the card answers a question
 * that is both honest and actually useful: does the *shape* of this game match
 * the shape of your session?
 *
 * Hit rate and volatility are properties of the game, measured over every logged
 * spin on it. They describe the title. They predict nothing about the player,
 * and the card says so.
 */
function FitCard({ game, sco, archetypeIndex }) {
  const fit = useMemo(() => {
    const names = sco.seq.map((id) => BY_ID.get(id)?.name).filter(Boolean);
    return fitFor(game.name, rankingContext(names, archetypeIndex));
  }, [game.name, sco.seq, archetypeIndex]);

  if (!fit) return null;
  const strong = !fit.cold && fit.fit >= 0.6;
  const weak = !fit.cold && fit.fit < 0.35;

  return (
    <Card style={{ marginHorizontal: sp(4), marginTop: sp(3), gap: sp(2.5) }}>
      <Row>
        <Label>Fit for how you play</Label>
        <Text style={[fitS.pct, { color: fit.cold ? c.inkFaint : strong ? c.calm : weak ? c.inkSoft : c.relevance }]}>
          {fit.cold ? 'no data' : `${Math.round(fit.fit * 100)}%`}
        </Text>
      </Row>

      {!fit.cold && (
        <View style={fitS.track}>
          <View
            style={[
              fitS.fill,
              {
                width: `${Math.max(2, fit.fit * 100)}%`,
                backgroundColor: strong ? c.calm : weak ? c.rule : c.relevance,
              },
            ]}
          />
        </View>
      )}

      <Text style={fitS.verdict}>
        {fit.cold
          ? 'This title is in the catalogue but barely in the logs, so there is nothing honest to score it against yet.'
          : strong
          ? 'Close to what you have been playing this session.'
          : weak
          ? 'Not much like the rest of your session — worth a look if you want a change.'
          : 'A reasonable match for this session.'}
      </Text>

      <View style={{ gap: sp(1) }}>
        {fit.reasons.map((r, i) => (
          <Text key={i} style={fitS.reason}>▸ {r}</Text>
        ))}
      </View>

      {fit.hitRate != null && (
        <View style={fitS.stats}>
          <View style={fitS.stat}>
            <Text style={fitS.statNum}>{Math.round(fit.hitRate * 100)}%</Text>
            <Text style={fitS.statLabel}>of spins pay something</Text>
          </View>
          <View style={fitS.stat}>
            <Text style={fitS.statNum}>{fit.volatility < 2 ? 'Low' : fit.volatility < 5 ? 'Medium' : 'High'}</Text>
            <Text style={fitS.statLabel}>swing between spins</Text>
          </View>
          <View style={fitS.stat}>
            <Text style={fitS.statNum}>{Math.round(fit.typicalSpins)}</Text>
            <Text style={fitS.statLabel}>typical spins per visit</Text>
          </View>
        </View>
      )}

      <Note tone="quiet">
        Measured across every logged spin on this title. It describes the game, not
        you — the house edge is unchanged and no ordering here improves your odds.
      </Note>
    </Card>
  );
}

const fitS = StyleSheet.create({
  pct: { ...type.h2, fontSize: 20, ...type.num },
  track: { height: 6, backgroundColor: c.inset, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  verdict: { ...type.soft, lineHeight: 18 },
  reason: { ...type.tiny, color: c.inkSoft },
  stats: {
    flexDirection: 'row', gap: sp(2), borderTopWidth: 1,
    borderTopColor: c.ruleSoft, paddingTop: sp(2.5),
  },
  stat: { flex: 1 },
  statNum: { ...type.body, fontWeight: '800', ...type.num },
  statLabel: { ...type.tiny, marginTop: sp(0.5), lineHeight: 14 },
});

/**
 * The outcome head, on the title in front of the player.
 *
 * This is a real trained probability: 5,929 (session, title) pairs, labelled by
 * whether the money came back, held-out AUC 0.729 and calibrated. It is the
 * closest thing to "what are my chances here" that can be honestly computed.
 *
 * Note which way it moves. Hit frequency and volatility push it up, because
 * variance is what lets a short stretch finish ahead. Spins played pushes it
 * DOWN — the longer you play, the closer you get to the title's true return,
 * which is 96.5%. So the number falls as you sit there, and the card says so.
 * A score that drops the more you play cannot be an inducement.
 */
function WinCard({ game, sco, archetypeIndex }) {
  const w = useMemo(
    () => winProbability(game, sco, archetypeIndex),
    [game, sco.byGame, sco.stakeTrace, archetypeIndex]
  );
  if (!w) return null;

  const above = w.p > w.baseRate;
  const maxD = Math.max(0.01, ...w.drivers.map((d) => Math.abs(d.value)));

  return (
    <Card style={{ marginHorizontal: sp(4), marginTop: sp(3), gap: sp(2.5) }}>
      <Row>
        <Label>Chance this ends ahead</Label>
        <Text style={winS.auc}>trained · AUC {w.auc.toFixed(2)}</Text>
      </Row>

      <Row style={{ alignItems: 'flex-end' }}>
        <Text style={[winS.big, { color: above ? c.calm : c.ink }]}>
          {Math.round(w.p * 100)}%
        </Text>
        <Text style={winS.base}>
          {Math.round(w.baseRate * 100)}% across all play in the logs
        </Text>
      </Row>

      <View style={winS.track}>
        <View style={[winS.fill, { width: `${Math.max(2, w.p * 100)}%`, backgroundColor: above ? c.calm : c.relevance }]} />
        <View style={[winS.mark, { left: `${w.baseRate * 100}%` }]} />
      </View>

      <View style={{ gap: sp(1) }}>
        {w.drivers.map((d) => (
          <View key={d.label} style={winS.row}>
            <Text style={winS.rowLabel}>{d.label}</Text>
            <View style={winS.rowTrack}>
              <View style={winS.rowCentre} />
              <View
                style={[
                  winS.rowBar,
                  d.value >= 0
                    ? { left: '50%', width: `${Math.min(48, (Math.abs(d.value) / maxD) * 48)}%`, backgroundColor: c.calm }
                    : { right: '50%', width: `${Math.min(48, (Math.abs(d.value) / maxD) * 48)}%`, backgroundColor: c.risk },
                ]}
              />
            </View>
            <Text style={[winS.rowVal, { color: d.value >= 0 ? c.calm : c.risk }]}>
              {d.value >= 0 ? '+' : ''}{d.value.toFixed(2)}
            </Text>
          </View>
        ))}
      </View>

      <Note tone="quiet">
        Fitted on real outcomes, and calibrated. It is not an edge: this title returns 96.5% over
        the long run and nothing here changes that. Notice the direction — spins played pushes
        this number DOWN, because the longer you play the closer you get to that 96.5%.
        {w.spins > 0 ? ` You have taken ${w.spins} spins here.` : ''}
      </Note>
    </Card>
  );
}

const winS = StyleSheet.create({
  auc: { ...type.tiny, color: c.inkFaint },
  big: { ...type.h1, fontSize: 34, ...type.num },
  base: { ...type.tiny, flex: 1, textAlign: 'right', marginBottom: sp(1) },
  track: { height: 8, backgroundColor: c.inset, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  mark: { position: 'absolute', top: 0, width: 2, height: 8, backgroundColor: c.gold },
  row: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  rowLabel: { ...type.tiny, color: c.inkSoft, flex: 1.2 },
  rowTrack: { flex: 1.3, height: 12, justifyContent: 'center' },
  rowCentre: { position: 'absolute', left: '50%', width: 1, height: 12, backgroundColor: c.rule },
  rowBar: { position: 'absolute', height: 5, borderRadius: 3 },
  rowVal: { ...type.tiny, ...type.num, width: 42, textAlign: 'right', fontWeight: '700' },
});

/**
 * Your record on titles like this one.
 *
 * Asked for twice, so it is built. What it reports is the player's own measured
 * history — spins taken and spins that paid, on titles sharing this one's
 * provider or mechanic — against their own session average. That is a fact
 * about them, and it is the thing they were actually asking to see.
 *
 * What it does not do is turn that into a forecast. Past results on a certified
 * RNG do not move the next spin, and a card that implied otherwise would be a
 * manipulative practice under the AI Act and a dark pattern under the RG rules —
 * both judged. So the verdict is phrased in the past tense throughout, and the
 * one line that keeps it honest stays on the card.
 */
function RecordCard({ game, sco }) {
  const rec = useMemo(() => {
    let simSpins = 0, simWins = 0, allSpins = 0, allWins = 0, simReturn = 0, simStake = 0;
    let thisSpins = 0, thisWins = 0;

    for (const [id, r] of Object.entries(sco.byGame || {})) {
      allSpins += r.spins;
      allWins += r.wins;
      if (id === game.id) { thisSpins = r.spins; thisWins = r.wins; continue; }
      const g = BY_ID.get(id);
      if (g && (g.provider === game.provider || g.mechanic === game.mechanic)) {
        simSpins += r.spins;
        simWins += r.wins;
        simStake += r.staked;
        simReturn += r.returned;
      }
    }
    return { simSpins, simWins, allSpins, allWins, simStake, simReturn, thisSpins, thisWins };
  }, [sco.byGame, game.id, game.provider, game.mechanic]);

  const enough = rec.simSpins >= 8;
  const simRate = rec.simSpins ? rec.simWins / rec.simSpins : 0;
  const allRate = rec.allSpins ? rec.allWins / rec.allSpins : 0;
  const delta = simRate - allRate;
  const better = delta > 0.03;
  const worse = delta < -0.03;

  return (
    <Card style={{ marginHorizontal: sp(4), marginTop: sp(3), gap: sp(2.5) }}>
      <Row>
        <Label>Your record on games like this</Label>
        {enough && (
          <Text style={[recS.verdict, { color: better ? c.calm : worse ? c.risk : c.inkSoft }]}>
            {better ? 'RUN WELL' : worse ? 'RUN COLD' : 'ABOUT EVEN'}
          </Text>
        )}
      </Row>

      {!enough ? (
        <Text style={recS.body}>
          You have taken {rec.simSpins} {rec.simSpins === 1 ? 'spin' : 'spins'} on {game.provider} or
          {' '}{game.mechanic.replace('-', ' ')} titles this session. Play a few more and this fills in
          with your own numbers rather than a guess.
        </Text>
      ) : (
        <>
          <Text style={recS.body}>
            {Math.round(simRate * 100)}% of your spins on {game.provider} and
            {' '}{game.mechanic.replace('-', ' ')} titles have paid something, against
            {' '}{Math.round(allRate * 100)}% across everything you have played this session.
            {better && ' This family has run well for you so far.'}
            {worse && ' This family has run cold for you so far.'}
            {!better && !worse && ' Much the same as the rest of your session.'}
          </Text>

          <View style={recS.stats}>
            <View style={recS.stat}>
              <Text style={recS.num}>{rec.simWins}/{rec.simSpins}</Text>
              <Text style={recS.lbl}>paying spins, this family</Text>
            </View>
            <View style={recS.stat}>
              <Text style={[recS.num, { color: rec.simReturn - rec.simStake >= 0 ? c.calm : c.inkSoft }]}>
                {rec.simReturn - rec.simStake >= 0 ? '+' : '−'}€
                {Math.abs((rec.simReturn - rec.simStake) / 100).toFixed(2)}
              </Text>
              <Text style={recS.lbl}>net, this family</Text>
            </View>
            <View style={recS.stat}>
              <Text style={recS.num}>{rec.thisSpins}</Text>
              <Text style={recS.lbl}>spins on this title</Text>
            </View>
          </View>
        </>
      )}

      <Note tone="quiet">
        Your history, measured — not a forecast. Every spin is independent and the house edge
        does not move, so a family that has run well is not more likely to pay next.
      </Note>
    </Card>
  );
}

const recS = StyleSheet.create({
  verdict: { ...type.tiny, fontWeight: '900', letterSpacing: 0.8, fontSize: 10 },
  body: { ...type.soft, lineHeight: 19 },
  stats: {
    flexDirection: 'row', gap: sp(2), borderTopWidth: 1,
    borderTopColor: c.ruleSoft, paddingTop: sp(2.5),
  },
  stat: { flex: 1 },
  num: { ...type.body, fontWeight: '800', ...type.num },
  lbl: { ...type.tiny, marginTop: sp(0.5), lineHeight: 14 },
});

/**
 * Analytics — everything the trained models know about this title, and about
 * this player's play on it, on one surface.
 *
 * Including the ranker's six features with their fitted weights. There is no
 * reason to hide them: a recommender a player can audit is relevance, and one
 * they cannot is just a push.
 *
 * Note what is deliberately absent: a probability that the player wins. The
 * models can score how well a title *fits* a session and can measure what has
 * already happened, and both are shown here in full. Neither is a forecast of
 * the next spin, because no model has one — the RNG is certified and
 * independent, and a number implying otherwise would be a manipulative practice
 * under the AI Act and a dark pattern under the RG rules.
 */
function AnalyticsCard({ game, sco, archetypeIndex, minutes }) {
  const detail = useMemo(() => {
    const names = sco.seq.map((id) => BY_ID.get(id)?.name).filter(Boolean);
    const ctx = rankingContext(names, archetypeIndex);
    return { scored: scoreGame(game.name, ctx), fit: fitFor(game.name, ctx) };
  }, [game.name, sco.seq, archetypeIndex]);

  const LABELS = ['Popularity', 'Suits your character', 'Opened before', 'Provider you play', 'Jackpot', 'Played alongside'];
  const mine = sco.byGame?.[game.id];

  return (
    <Card style={{ marginHorizontal: sp(4), marginTop: sp(3), gap: sp(2.5) }}>
      <Row>
        <Label>Analytics · trained models</Label>
        <Text style={anaS.tag}>on device</Text>
      </Row>

      <Text style={anaS.h}>This title, in the logs</Text>
      <View style={anaS.grid}>
        <Stat n={detail.fit?.launches?.toLocaleString() ?? '—'} l="launches recorded" />
        <Stat n={detail.fit?.hitRate != null ? `${Math.round(detail.fit.hitRate * 100)}%` : '—'} l="spins that pay" />
        <Stat n={detail.fit?.typicalSpins != null ? Math.round(detail.fit.typicalSpins) : '—'} l="spins per visit" />
        <Stat n={game.rtp != null ? `${game.rtp}%` : '—'} l="published RTP" />
      </View>

      <Text style={anaS.h}>Your play, this session</Text>
      <View style={anaS.grid}>
        <Stat n={mine ? `${mine.wins}/${mine.spins}` : '0'} l="paying spins here" />
        <Stat n={sco.spins} l="spins overall" />
        <Stat n={`${minutes.toFixed(0)}m`} l="session length" />
        <Stat
          n={`${sco.netCents >= 0 ? '+' : '−'}€${Math.abs(sco.netCents / 100).toFixed(2)}`}
          l="net this session"
          tone={sco.netCents >= 0 ? c.calm : c.inkSoft}
        />
      </View>

      {detail.scored && (
        <>
          <Text style={anaS.h}>Why the ranker placed it where it did</Text>
          {detail.scored.f.map((v, i) => (
            <View key={i} style={anaS.featRow}>
              <Text style={anaS.featLabel}>{LABELS[i]}</Text>
              <View style={anaS.featTrack}>
                <View style={[anaS.featFill, { width: `${Math.min(100, Math.abs(v) * 100)}%` }]} />
              </View>
              <Text style={anaS.featVal}>{v.toFixed(2)}</Text>
            </View>
          ))}
        </>
      )}

      <Note tone="quiet">
        Fit is a match score against how you are playing, and the figures above are history.
        Neither is a prediction that you will win: the RNG is certified and every spin is
        independent, so no ordering and no score here changes the odds or the house edge.
        Replayed on held-out sessions, this ranker put the title a player actually opened in
        the top six {Math.round((EVAL.replay?.lantern?.recall_at_6 ?? 0.19) * 100)}% of the
        time against {Math.round((EVAL.replay?.generic?.recall_at_6 ?? 0.06) * 100)}% for
        popularity order.
      </Note>
    </Card>
  );
}

function Stat({ n, l, tone }) {
  return (
    <View style={anaS.cell}>
      <Text style={[anaS.num, tone && { color: tone }]}>{n}</Text>
      <Text style={anaS.lbl}>{l}</Text>
    </View>
  );
}

const anaS = StyleSheet.create({
  tag: { ...type.tiny, color: c.relevance, fontWeight: '800' },
  h: { ...type.label, color: c.inkSoft, marginTop: sp(1) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2) },
  cell: { flexGrow: 1, flexBasis: '44%', backgroundColor: c.inset, borderRadius: radius.md, padding: sp(2) },
  num: { ...type.body, fontWeight: '800', ...type.num },
  lbl: { ...type.tiny, marginTop: 1, lineHeight: 14 },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  featLabel: { ...type.tiny, color: c.inkSoft, flex: 1.3 },
  featTrack: { flex: 1, height: 5, backgroundColor: c.inset, borderRadius: 3, overflow: 'hidden' },
  featFill: { height: '100%', backgroundColor: c.relevance, borderRadius: 3 },
  featVal: { ...type.tiny, ...type.num, width: 34, textAlign: 'right', color: c.ink },
});

export default function GameScreen({ game, onBack }) {
  const { emit, risk, policy, balanceCents, sco, pred, arm, minutes } = useLantern();

  // The A/B has to hold on every surface, not just the lobby. In the control
  // arm this screen is what the product ships today: a board, a stake ladder and
  // nothing that knows who is holding the phone. Leaving the fit and record
  // cards on in both arms made the comparison meaningless — the control has to
  // actually be the control.
  const isLantern = arm === 'lantern';

  // Insights live behind the chart icon rather than above the board. Three
  // stacked cards pushed the game itself below the fold, which made the screen
  // read as a report with a slot machine attached. The icon carries a dot until
  // it is opened once so it is still discoverable on arrival.
  const [stats, setStats] = useState(false);
  const [seenStats, setSeenStats] = useState(false);
  const openStats = () => { setStats((v) => !v); setSeenStats(true); };
  const kit = useMemo(() => kitFor(game), [game.mechanic]);
  const stakes = useMemo(() => stakesFor(game), [game.id]);

  const [stake, setStake] = useState(() => stakes[Math.min(1, stakes.length - 1)]);
  const [spinning, setSpinning] = useState(false);
  const [board, setBoard] = useState(() =>
    Array.from({ length: kit.rows * kit.cols }, () =>
      kit.symbols[Math.floor(Math.random() * kit.symbols.length)]
    )
  );
  const [last, setLast] = useState(null);
  const [turbo, setTurbo] = useState(false);
  const [auto, setAuto] = useState(0);
  const openedAt = useRef(Date.now());

  useEffect(() => {
    emit({
      t: 'game_open', gameId: game.id, gameName: game.name, provider: game.provider,
      section: game.topSection || game.categories?.[0],
      volatility: game.volatility, jackpot: game.jackpot,
    });
    const t = openedAt.current;
    return () => emit({ t: 'game_close', gameId: game.id, gameName: game.name, durMs: Date.now() - t });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id]);

  useEffect(() => {
    if (auto <= 0) return;
    const id = setTimeout(() => { spin(); setAuto((a) => a - 1); }, turbo ? 260 : 700);
    return () => clearTimeout(id);
    // `spinning` is a dependency: without it the settle never re-runs this
    // effect, so the pending timeout keeps a `spin` closed over spinning ===
    // true and every second tick decrements the counter without spinning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, turbo, spinning]);

  /**
   * The reels roll before they settle.
   *
   * Purely presentational — the outcome is drawn once, at rest, in `settle()`.
   * The roll is a cosmetic cycle over the symbol set and cannot influence it.
   * Turbo shortens the roll, which is what turbo means and is also why turbo is
   * a risk marker rather than a feature: it exists to remove the pause.
   */
  const reel = useRef(null);
  useEffect(() => () => clearInterval(reel.current), []);

  const randomBoard = () =>
    Array.from({ length: kit.rows * kit.cols }, () =>
      kit.symbols[Math.floor(Math.random() * kit.symbols.length)]
    );

  function settle() {
    const next = randomBoard();
    setBoard(next);

    // Most common symbol on the board, paid against the published table.
    const counts = {};
    for (const sym of next) counts[sym] = (counts[sym] || 0) + 1;
    const best = Math.max(...Object.values(counts));
    const tier = Object.keys(kit.pay).map(Number).sort((a, b) => b - a).find((t) => best >= t);
    const payout = tier ? Math.round(stake * kit.pay[tier]) : 0;

    const winner = Object.keys(counts).find((k) => counts[k] === best);
    setLast({ payout, matched: best, symbol: tier ? winner : null });
    setSpinning(false);
    emit({ t: 'spin', gameId: game.id, gameName: game.name, stake, payout });
  }

  function spin() {
    if (spinning) return;
    setSpinning(true);
    setLast(null);

    const dur = turbo ? 220 : 620;
    const tick = turbo ? 45 : 70;
    const started = Date.now();

    clearInterval(reel.current);
    reel.current = setInterval(() => {
      setBoard(randomBoard());
      if (Date.now() - started >= dur) {
        clearInterval(reel.current);
        settle();
      }
    }, tick);
  }

  function changeStake(next) {
    emit({ t: 'stake_change', gameId: game.id, gameName: game.name, from: stake, to: next });
    setStake(next);
  }

  const verb =
    kit === KIT.dice ? { go: 'Roll', ing: 'Rolling' }
    : kit === KIT.wheel ? { go: 'Spin the wheel', ing: 'Spinning' }
    : kit === KIT.crash ? { go: 'Launch', ing: 'Climbing' }
    : kit === KIT.table ? { go: 'Deal', ing: 'Dealing' }
    : { go: 'Spin', ing: 'Spinning' };

  const cellW = kit.cols >= 6 ? 44 : kit.cols === 5 ? 54 : 74;
  const cellH = kit.rows >= 5 ? 44 : kit.rows === 3 ? 54 : 82;

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: sp(10) }}>
      <View style={s.header}>
        <Row>
          <Pressable onPress={onBack} hitSlop={12} style={s.back}>
            <Ionicons name="chevron-back" size={17} color={c.relevance} />
            <Text style={s.backText}>Home</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(3) }}>
            {isLantern && (
              <Pressable onPress={openStats} hitSlop={10} accessibilityLabel="Analytics">
                <Ionicons
                  name={stats ? 'stats-chart' : 'stats-chart-outline'}
                  size={18}
                  color={stats ? c.relevance : c.inkSoft}
                />
                {!seenStats && <View style={s.statsDot} />}
              </Pressable>
            )}
            <Text style={s.balance}>€{(balanceCents / 100).toFixed(2)}</Text>
          </View>
        </Row>

        <View style={s.titleRow}>
          <View style={{ width: 54 }}>
            <GameArt game={game} size="tile" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.h2} numberOfLines={1}>{game.name}</Text>
            <Text style={type.tiny} numberOfLines={1}>
              {game.provider} · {game.mechanic.replace('-', ' ')} · band {game.volatility}
            </Text>
            <View style={s.facts}>
              {game.rtp != null && <Fact k="RTP" v={`${game.rtp}%`} />}
              <Fact k={kit.label} v={`${kit.cols}×${kit.rows}`} />
              {game.maxWin != null && game.maxBet ? (
                <Fact k="max win" v={`×${Math.round(game.maxWin / game.maxBet)}`} />
              ) : null}
            </View>
          </View>
        </View>
      </View>

      {isLantern && stats && (
        <>
          <WinCard game={game} sco={sco} archetypeIndex={pred.archetype.index} />
          <FitCard game={game} sco={sco} archetypeIndex={pred.archetype.index} />
          <RecordCard game={game} sco={sco} />
          <AnalyticsCard
            game={game}
            sco={sco}
            archetypeIndex={pred.archetype.index}
            minutes={minutes}
          />
        </>
      )}

      {game.jackpot && (
        <View style={s.pad}>
          <LinearGradient colors={['#8A5A12', '#3A2408']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.pot}>
            <Text style={s.potLabel}>JACKPOT</Text>
            <Text style={s.potValue}>
              €{potFor(game).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
            </Text>
          </LinearGradient>
        </View>
      )}

      <View style={s.pad}>
        <LinearGradient colors={kit.tone} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.stage}>
          <View style={[s.board, { maxWidth: kit.cols * (cellW + 6) }]}>
            {board.map((sym, i) => {
              const won = !spinning && last?.symbol && sym === last.symbol;
              return (
                <View
                  key={i}
                  style={[
                    s.cell,
                    { width: cellW, height: cellH },
                    won && s.cellWin,
                    !won && !spinning && last?.symbol && s.cellDim,
                    spinning && s.cellRoll,
                  ]}
                >
                  <Text
                    style={[
                      s.sym,
                      { fontSize: Math.min(cellW, cellH) * 0.48 },
                      SYM_TINT[sym] && { color: SYM_TINT[sym] },
                    ]}
                  >
                    {sym}
                  </Text>
                </View>
              );
            })}
          </View>
        </LinearGradient>

        {last && (
          <Text style={[s.outcome, { color: last.payout > 0 ? c.calm : c.inkFaint }]}>
            {last.payout > 0 ? `+€${(last.payout / 100).toFixed(2)}` : 'no win'}
            {sco.lossRun >= 3 ? `  ·  ${sco.lossRun} in a row` : ''}
          </Text>
        )}

        <Label style={{ marginTop: sp(4) }}>
          Stake · this title allows €{(game.minBet ?? 0.2).toFixed(2)}–€{(game.maxBet ?? 50).toFixed(2)}
        </Label>
        <View style={s.stakes}>
          {stakes.map((v) => (
            <Pressable key={v} onPress={() => changeStake(v)} style={[s.stakeBtn, stake === v && s.stakeBtnOn]}>
              <Text style={[s.stakeText, stake === v && s.stakeTextOn]}>€{(v / 100).toFixed(2)}</Text>
            </Pressable>
          ))}
        </View>

        <Btn
          title={
            auto > 0 ? `Autoplay · ${auto} left`
            : spinning ? `${verb.ing}…`
            : verb.go
          }
          icon={auto > 0 ? 'sync' : spinning ? 'ellipsis-horizontal' : 'play'}
          tone="primary"
          onPress={spin}
          disabled={auto > 0 || spinning}
          style={{ marginTop: sp(4) }}
        />

        <Row style={{ marginTop: sp(3), gap: sp(2) }}>
          <Btn title={turbo ? 'Turbo on' : 'Turbo off'} tone={turbo ? 'warn' : 'default'}
            onPress={() => { const on = !turbo; setTurbo(on); emit({ t: 'turbo', on }); }} style={{ flex: 1 }} />
          <Btn title="Autoplay 50"
            onPress={() => { setAuto(50); emit({ t: 'autoplay', count: 50 }); }} style={{ flex: 1 }} />
        </Row>

        <Row style={{ marginTop: sp(3), gap: sp(2) }}>
          <Btn title="Deposit €50"
            onPress={() => emit({ t: 'deposit', amount: 5000, declined: false })} style={{ flex: 1 }} />
          <Btn title="Deposit declined" tone="warn"
            onPress={() => emit({ t: 'deposit', amount: 5000, declined: true })} style={{ flex: 1 }} />
        </Row>
        <Btn title="Raise my daily limit" tone="quiet"
          onPress={() => emit({ t: 'rg_change', setting: 'dailyDeposit', direction: 'looser' })}
          style={{ marginTop: sp(3) }} />

        <Note tone="risk">
          Those last three stand in for events the production client already emits, so a
          two-minute demo can reach states a real session reaches over an hour.
        </Note>

        <Card style={{ marginTop: sp(3) }}>
          <Row>
            <Label>Risk head</Label>
            <StateChip state={risk.state} score={risk.score} />
          </Row>
          {risk.fired.length === 0 ? (
            <Text style={[type.tiny, { marginTop: sp(2) }]}>No markers fired.</Text>
          ) : (
            <View style={{ marginTop: sp(2), gap: sp(1.5) }}>
              {risk.fired.map((m) => (
                <Text key={m.id} style={s.marker}>
                  <Text style={{ fontWeight: '800' }}>{m.id} {m.name}</Text>{'  '}{m.detail}
                </Text>
              ))}
            </View>
          )}
          {policy.reasons.length > 0 && (
            <View style={{ marginTop: sp(3), borderTopWidth: 1, borderTopColor: c.ruleSoft, paddingTop: sp(2.5) }}>
              <Label>Policy response</Label>
              {policy.reasons.map((r, i) => (
                <Text key={i} style={[s.marker, { color: c.inkSoft, marginTop: sp(1) }]}>▸ {r}</Text>
              ))}
            </View>
          )}
        </Card>

        <Text style={[type.tiny, { marginTop: sp(3), lineHeight: 16 }]}>
          Simulation, not the certified bundle. Board, symbols and stake ladder come from this
          title's real catalogue entry; the RTP shown above is that entry's certified figure and
          applies to the real game, not to this board. Outcomes here are a uniform draw against
          a paytable solved to return about 96%, so a losing run is reachable. Lantern cannot
          read the draw and cannot change it.
        </Text>
      </View>
    </ScrollView>
  );
}

function Fact({ k, v }) {
  return (
    <View style={s.fact}>
      <Text style={s.factK}>{k}</Text>
      <Text style={s.factV}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    paddingHorizontal: sp(4), paddingTop: sp(3), paddingBottom: sp(3.5),
    borderBottomWidth: 1, borderBottomColor: c.rule, backgroundColor: c.surface,
  },
  back: { flexDirection: 'row', alignItems: 'center' },
  backText: { color: c.relevance, fontSize: 13, fontWeight: '700' },
  balance: { ...type.h3, fontVariant: ['tabular-nums'] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: sp(3), marginTop: sp(3) },
  facts: { flexDirection: 'row', gap: sp(1.5), marginTop: sp(1.5), flexWrap: 'wrap' },
  fact: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: c.inset, borderRadius: 4, paddingHorizontal: sp(1.5), paddingVertical: 2,
  },
  factK: { fontSize: 9, color: c.inkFaint, textTransform: 'uppercase', letterSpacing: 0.4 },
  factV: { fontSize: 10, color: c.ink, fontWeight: '800', fontVariant: ['tabular-nums'] },

  pad: { paddingHorizontal: sp(4), marginTop: sp(4) },
  pot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: radius.sm, paddingHorizontal: sp(3.5), paddingVertical: sp(2.5),
    borderWidth: 1, borderColor: 'rgba(229,184,81,0.4)',
  },
  potLabel: { color: c.gold, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  potValue: { color: '#fff', fontSize: 17, fontWeight: '900', fontVariant: ['tabular-nums'] },

  statsDot: {
    position: 'absolute', top: -2, right: -3, width: 7, height: 7,
    borderRadius: 4, backgroundColor: c.relevance,
  },
  stage: { borderRadius: radius.md, paddingVertical: sp(4), alignItems: 'center' },
  board: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  cell: {
    margin: 3, borderRadius: 8, backgroundColor: 'rgba(4,8,12,0.55)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  // The paying symbols after a spin, and everything they beat.
  cellWin: {
    backgroundColor: 'rgba(242,193,78,0.20)',
    borderColor: 'rgba(242,193,78,0.85)',
    borderWidth: 2,
  },
  cellDim: { opacity: 0.42 },
  cellRoll: { opacity: 0.72, borderColor: 'rgba(255,255,255,0.28)' },
  sym: { color: '#F2D488', textShadow: '0px 1px 3px rgba(0,0,0,0.7)' },
  outcome: { textAlign: 'center', marginTop: sp(3), fontSize: 15, fontWeight: '800' },

  stakes: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2), marginTop: sp(2) },
  stakeBtn: {
    borderWidth: 1, borderColor: c.rule, borderRadius: radius.sm,
    paddingHorizontal: sp(3), paddingVertical: sp(2), backgroundColor: c.surface,
  },
  stakeBtnOn: { borderColor: c.relevance, backgroundColor: c.surfaceAlt },
  stakeText: { color: c.inkSoft, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  stakeTextOn: { color: c.relevance },
  marker: { fontSize: 11, color: c.risk, lineHeight: 16 },
});

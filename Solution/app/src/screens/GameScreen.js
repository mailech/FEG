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
import GameArt from '../components/GameArt';
import { c, sp, type, radius } from '../theme';

/** Board shape and symbol set per mechanic — the same attribute the recommender
 *  ranks on, so a shelf of one family plays as a family. */
const KIT = {
  'classic-fruit': {
    cols: 3, rows: 3,
    symbols: ['7', '★', '🍒', '🍋', '🔔', '🍉'],
    pay: { 5: 20, 4: 6, 3: 2 },
    tone: ['#8E2A22', '#4A120E'],
    label: 'reels',
  },
  'link-jackpot': {
    cols: 5, rows: 3,
    symbols: ['◆', '★', '🔔', '👑', '💎', '7'],
    pay: { 6: 40, 5: 12, 4: 3 },
    tone: ['#8A5A12', '#40280A'],
    label: 'reels',
  },
  'cluster-tumble': {
    cols: 6, rows: 5,
    symbols: ['🍬', '🍇', '🍭', '🍏', '💜', '⭐'],
    pay: { 10: 30, 8: 8, 6: 2.5 },
    tone: ['#6B2E7A', '#331439'],
    label: 'cluster',
  },
  'book-adventure': {
    cols: 5, rows: 3,
    symbols: ['📖', '👁', '🪲', '★', '♛', 'A'],
    pay: { 6: 45, 5: 12, 4: 3 },
    tone: ['#7A5116', '#3A250A'],
    label: 'reels',
  },
  table: {
    cols: 3, rows: 1,
    symbols: ['♠', '♥', '♦', '♣', 'J', 'Q'],
    pay: { 3: 9, 2: 2 },
    tone: ['#14563C', '#0A2A1D'],
    label: 'cards',
  },
  'video-slot': {
    cols: 5, rows: 3,
    symbols: ['⬢', '★', '◆', '▲', '●', '■'],
    pay: { 6: 35, 5: 10, 4: 2.5 },
    tone: ['#1D4E6B', '#0D2634'],
    label: 'reels',
  },
};

const kitFor = (g) => KIT[g.mechanic] || KIT['video-slot'];

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

export default function GameScreen({ game, onBack }) {
  const { emit, risk, policy, balanceCents, sco } = useLantern();
  const kit = useMemo(() => kitFor(game), [game.mechanic]);
  const stakes = useMemo(() => stakesFor(game), [game.id]);

  const [stake, setStake] = useState(() => stakes[Math.min(1, stakes.length - 1)]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, turbo]);

  function spin() {
    const next = Array.from({ length: kit.rows * kit.cols }, () =>
      kit.symbols[Math.floor(Math.random() * kit.symbols.length)]
    );
    setBoard(next);

    // Most common symbol on the board, paid against the published table.
    const counts = {};
    for (const sym of next) counts[sym] = (counts[sym] || 0) + 1;
    const best = Math.max(...Object.values(counts));
    const tier = Object.keys(kit.pay).map(Number).sort((a, b) => b - a).find((t) => best >= t);
    const payout = tier ? Math.round(stake * kit.pay[tier]) : 0;

    setLast({ payout, matched: best });
    emit({ t: 'spin', gameId: game.id, gameName: game.name, stake, payout });
  }

  function changeStake(next) {
    emit({ t: 'stake_change', gameId: game.id, gameName: game.name, from: stake, to: next });
    setStake(next);
  }

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
          <Text style={s.balance}>€{(balanceCents / 100).toFixed(2)}</Text>
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
            {board.map((sym, i) => (
              <View key={i} style={[s.cell, { width: cellW, height: cellH }]}>
                <Text style={[s.sym, { fontSize: Math.min(cellW, cellH) * 0.48 }]}>{sym}</Text>
              </View>
            ))}
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
          title={auto > 0 ? `Autoplay · ${auto} left` : 'Spin'}
          icon={auto > 0 ? 'sync' : 'play'}
          tone="primary"
          onPress={spin}
          disabled={auto > 0}
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
          Simulation, not the certified bundle. Board, symbols, stake ladder and RTP come from
          this title's real catalogue entry; outcomes are a uniform draw against the paytable.
          Lantern cannot read it and cannot change it.
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

  stage: { borderRadius: radius.md, paddingVertical: sp(4), alignItems: 'center' },
  board: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  cell: {
    margin: 3, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.32)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  sym: { color: '#F2D488' },
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

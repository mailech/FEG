/**
 * Game screen — a stand-in, not a real title.
 *
 * The reels are a fair, uniform draw with a published table. Lantern has no
 * path to outcome selection and never will (§9, out of bounds by construction):
 * this exists only so the behavioural markers have real play to read.
 *
 * Everything here emits into the event bus. Change stake after a losing run,
 * flip turbo on, arm autoplay — and watch the Monitor tab respond.
 */

import React, { useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useLantern } from '../lantern/useLantern';
import { Btn, Card, Label, Row, StateChip, Note } from '../components/ui';
import GameArt from '../components/GameArt';
import { c, sp, type } from '../theme';

const STAKES = [50, 100, 200, 500, 1000, 2000];
const SYMBOLS = ['7', '★', '◆', '♣', '❁', '⬢'];

/** Published and fixed. Not personalised, not reachable from session state. */
const PAY = { 3: 12, 2: 1.5 };

export default function GameScreen({ game, onBack }) {
  const { emit, risk, policy, balanceCents, sco } = useLantern();
  const [stake, setStake] = useState(200);
  const [reels, setReels] = useState(['7', '★', '◆']);
  const [last, setLast] = useState(null);
  const [turbo, setTurbo] = useState(false);
  const [auto, setAuto] = useState(0);
  const openedAt = useRef(Date.now());

  useEffect(() => {
    emit({ t: 'game_open', gameId: game.id, section: game.topSection, volatility: game.volatility });
    const t = openedAt.current;
    return () => emit({ t: 'game_close', gameId: game.id, durMs: Date.now() - t });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id]);

  useEffect(() => {
    if (auto <= 0) return;
    const id = setTimeout(() => { spin(); setAuto((a) => a - 1); }, turbo ? 260 : 700);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, turbo]);

  function spin() {
    const r = [0, 1, 2].map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
    setReels(r);
    const counts = r.reduce((m, s) => ({ ...m, [s]: (m[s] || 0) + 1 }), {});
    const best = Math.max(...Object.values(counts));
    const payout = Math.round(stake * (PAY[best] || 0));
    setLast(payout);
    emit({ t: 'spin', gameId: game.id, stake, payout });
  }

  function changeStake(next) {
    emit({ t: 'stake_change', gameId: game.id, from: stake, to: next });
    setStake(next);
  }

  function toggleTurbo() {
    const on = !turbo;
    setTurbo(on);
    emit({ t: 'turbo', on });
  }

  function armAuto(n) {
    setAuto(n);
    emit({ t: 'autoplay', count: n });
  }

  const lossRun = sco.lossRun;

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: sp(10) }}>
      <View style={s.header}>
        <Row>
          <Pressable onPress={onBack} hitSlop={12}>
            <Text style={s.back}>‹ Feed</Text>
          </Pressable>
          <Text style={s.balance}>€{(balanceCents / 100).toFixed(2)}</Text>
        </Row>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(3), marginTop: sp(3) }}>
          <View style={{ width: 52 }}>
            <GameArt game={game} size="tile" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.h2} numberOfLines={1}>{game.name}</Text>
            <Text style={type.tiny}>
              {game.provider} · {game.mechanic.replace('-', ' ')} · band {game.volatility}
              {game.jackpot ? ' · jackpot' : ''}
            </Text>
          </View>
        </View>
      </View>

      <View style={s.pad}>
        <View style={s.reels}>
          {reels.map((r, i) => (
            <View key={i} style={s.reel}><Text style={s.symbol}>{r}</Text></View>
          ))}
        </View>

        {last != null && (
          <Text style={[s.outcome, { color: last > 0 ? c.calm : c.inkFaint }]}>
            {last > 0 ? `+€${(last / 100).toFixed(2)}` : 'no win'}
            {lossRun >= 3 ? `  ·  ${lossRun} in a row` : ''}
          </Text>
        )}

        <Label style={{ marginTop: sp(5) }}>Stake</Label>
        <View style={s.stakes}>
          {STAKES.map((v) => (
            <Pressable
              key={v}
              onPress={() => changeStake(v)}
              style={[s.stakeBtn, stake === v && s.stakeBtnOn]}
            >
              <Text style={[s.stakeText, stake === v && s.stakeTextOn]}>
                €{(v / 100).toFixed(2)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Btn
          title={auto > 0 ? `Autoplay · ${auto} left` : 'Spin'}
          tone="primary"
          onPress={spin}
          disabled={auto > 0}
          style={{ marginTop: sp(4) }}
        />

        <Row style={{ marginTop: sp(3), gap: sp(2) }}>
          <Btn
            title={turbo ? 'Turbo on' : 'Turbo off'}
            tone={turbo ? 'warn' : 'default'}
            onPress={toggleTurbo}
            style={{ flex: 1 }}
          />
          <Btn title="Autoplay 50" onPress={() => armAuto(50)} style={{ flex: 1 }} />
        </Row>

        <Row style={{ marginTop: sp(3), gap: sp(2) }}>
          <Btn
            title="Deposit €50"
            onPress={() => emit({ t: 'deposit', amount: 5000, declined: false })}
            style={{ flex: 1 }}
          />
          <Btn
            title="Deposit declined"
            onPress={() => emit({ t: 'deposit', amount: 5000, declined: true })}
            style={{ flex: 1 }}
          />
        </Row>

        <Btn
          title="Raise my daily limit"
          tone="quiet"
          onPress={() => emit({ t: 'rg_change', setting: 'dailyDeposit', direction: 'looser' })}
          style={{ marginTop: sp(3) }}
        />

        <Note tone="risk">
          These last three buttons stand in for events the real client already emits. They are
          here so a two-minute demo can reach the states a real session reaches over an hour.
        </Note>

        <Card style={{ marginTop: sp(4) }}>
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
                  <Text style={{ fontWeight: '700' }}>{m.id} {m.name}</Text>
                  {'  '}{m.detail}
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

        <Text style={[type.tiny, { marginTop: sp(4) }]}>
          Paytable: three of a kind ×12, two of a kind ×1.5. Uniform draw over six symbols,
          identical for every player. Lantern cannot read it and cannot change it.
        </Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    paddingHorizontal: sp(4), paddingTop: sp(3), paddingBottom: sp(4),
    borderBottomWidth: 1, borderBottomColor: c.rule,
  },
  pad: { paddingHorizontal: sp(4), marginTop: sp(4) },
  back: { color: c.relevance, fontSize: 14, fontWeight: '600' },
  balance: { ...type.h3, fontVariant: ['tabular-nums'] },
  reels: { flexDirection: 'row', gap: sp(2.5), justifyContent: 'center', marginTop: sp(2) },
  reel: {
    width: 84, height: 100, borderRadius: 8,
    backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.rule,
    alignItems: 'center', justifyContent: 'center',
  },
  symbol: { fontSize: 40, color: c.gold },
  outcome: { textAlign: 'center', marginTop: sp(3), fontSize: 15, fontWeight: '700' },
  stakes: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2), marginTop: sp(2) },
  stakeBtn: {
    borderWidth: 1, borderColor: c.rule, borderRadius: 6,
    paddingHorizontal: sp(3), paddingVertical: sp(2), backgroundColor: c.surface,
  },
  stakeBtnOn: { borderColor: c.relevance, backgroundColor: c.surfaceAlt },
  stakeText: { color: c.inkSoft, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  stakeTextOn: { color: c.relevance },
  marker: { fontSize: 11, color: c.risk, lineHeight: 16 },
});

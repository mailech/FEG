/**
 * Betslip and the confirm step — LANTERN-ARCHITECTURE.md §3.8.
 *
 * This is where the measured problem lives. In FEG's own logs, 357 of 1,649
 * sessions that reached the betslip never placed: 21.6% abandoned at the
 * strongest intent signal in the product.
 *
 * The answer is to diagnose rather than decorate. Every abandonment cause we
 * can name gets answered in place. A countdown timer in this slot would be a
 * dark pattern; the brief draws that line for us.
 */

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useLantern } from '../lantern/useLantern';
import { Btn, Card, Label, Row, Note, StateChip } from '../components/ui';
import { c, sp, type } from '../theme';
import sports from '../data/sports.json';
import metrics from '../data/metrics.json';

/** Shaped like the real feed: Croatian sport names, real market vocabulary. */
const OFFERS = [
  { id: 'o1', sport: 'Nogomet', match: 'Rijeka — Osijek', market: 'Konačan ishod · 1', odds: 1.85, moved: 0 },
  { id: 'o2', sport: 'Nogomet', match: 'Hajduk — Dinamo', market: 'Oba tima daju gol', odds: 1.72, moved: -0.08 },
  { id: 'o3', sport: 'Tenis', match: 'Challenger Split · R16', market: 'Točan rezultat 2-0', odds: 3.10, moved: 0 },
  { id: 'o4', sport: 'Košarka', match: 'Cibona — Zadar', market: 'Ukupno poena o158.5', odds: 1.94, moved: +0.06 },
  { id: 'o5', sport: 'Pikado', match: 'Players Championship', market: 'Najviše 180-ica', odds: 2.40, moved: 0 },
];

export default function SlipScreen() {
  const { emit, slip, dispatch, risk } = useLantern();
  const [confirming, setConfirming] = useState(false);
  const [stake, setStake] = useState(500);
  const [placed, setPlaced] = useState(null);
  const [openWhatIf, setOpenWhatIf] = useState(null);

  const moved = slip.filter((x) => x.moved !== 0);
  const totalOdds = slip.reduce((a, x) => a * x.odds, 1);
  const ret = Math.round(stake * totalOdds);

  function add(o) {
    if (slip.find((x) => x.id === o.id)) return;
    dispatch({ type: 'slipAdd', sel: o });
    emit({ t: 'slip_add', selectionId: o.id });
  }
  function remove(id) {
    dispatch({ type: 'slipRemove', id });
    emit({ t: 'slip_remove', selectionId: id });
  }
  function reachConfirm() {
    setConfirming(true);
    emit({ t: 'confirm_reach' });
  }
  function place() {
    emit({ t: 'confirm_done' });
    setPlaced({ n: slip.length, ret });
    dispatch({ type: 'slipClear' });
    setConfirming(false);
  }
  function abandon() {
    emit({ t: 'confirm_abandon' });
    setConfirming(false);
  }

  if (placed) {
    return (
      <ScrollView style={s.root} contentContainerStyle={s.pad}>
        <Card style={{ marginTop: sp(8), borderColor: c.calm }}>
          <Label style={{ color: c.calm }}>Placed</Label>
          <Text style={[type.h2, { marginTop: sp(2) }]}>
            {placed.n} selection{placed.n > 1 ? 's' : ''} · potential return €{(placed.ret / 100).toFixed(2)}
          </Text>
          <Btn title="New slip" onPress={() => setPlaced(null)} style={{ marginTop: sp(4) }} />
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: sp(12) }}>
      <View style={s.header}>
        <Row>
          <Text style={type.h1}>Sport</Text>
          <StateChip state={risk.state} score={risk.score} />
        </Row>
        <Text style={type.tiny}>
          {sports.slice(0, 4).map((x) => `${x.name} ${x.n.toLocaleString()}`).join(' · ')}
        </Text>
      </View>

      <View style={s.pad}>
        <Label>Today</Label>
        {OFFERS.map((o) => {
          const inSlip = !!slip.find((x) => x.id === o.id);
          return (
            <Pressable key={o.id} onPress={() => add(o)} style={[s.offer, inSlip && s.offerOn]}>
              <View style={{ flex: 1 }}>
                <Text style={type.body}>{o.match}</Text>
                <Text style={type.tiny}>{o.sport} · {o.market}</Text>
              </View>
              <View style={s.odds}>
                <Text style={s.oddsText}>{o.odds.toFixed(2)}</Text>
              </View>
            </Pressable>
          );
        })}

        {slip.length > 0 && !confirming && (
          <Card style={{ marginTop: sp(5) }}>
            <Label>Betslip · {slip.length}</Label>
            {slip.map((x) => (
              <Row key={x.id} style={{ marginTop: sp(2) }}>
                <View style={{ flex: 1 }}>
                  <Text style={type.body}>{x.match}</Text>
                  <Text style={type.tiny}>{x.market}</Text>
                </View>
                <Pressable onPress={() => remove(x.id)} hitSlop={10}>
                  <Text style={{ color: c.inkFaint, fontSize: 18 }}>×</Text>
                </Pressable>
              </Row>
            ))}
            <Row style={{ marginTop: sp(3) }}>
              <Text style={type.soft}>Total odds</Text>
              <Text style={[type.h3, { fontVariant: ['tabular-nums'] }]}>{totalOdds.toFixed(2)}</Text>
            </Row>
            <Btn title="Continue" tone="primary" onPress={reachConfirm} style={{ marginTop: sp(3) }} />
          </Card>
        )}

        {confirming && (
          <Card style={{ marginTop: sp(5), borderColor: c.relevance }}>
            <Label style={{ color: c.relevance }}>Confirm</Label>

            <Row style={{ marginTop: sp(3) }}>
              <Text style={type.soft}>Stake</Text>
              <View style={{ flexDirection: 'row', gap: sp(1.5) }}>
                {[200, 500, 1000, 2000].map((v) => (
                  <Pressable key={v} onPress={() => setStake(v)} style={[s.stake, stake === v && s.stakeOn]}>
                    <Text style={[s.stakeText, stake === v && { color: c.relevance }]}>
                      €{(v / 100).toFixed(0)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Row>

            <View style={s.returnBox}>
              <Row>
                <Text style={type.soft}>You stake</Text>
                <Text style={s.money}>€{(stake / 100).toFixed(2)}</Text>
              </Row>
              <Row style={{ marginTop: sp(1.5) }}>
                <Text style={type.soft}>Returns if every leg wins</Text>
                <Text style={[s.money, { color: c.calm }]}>€{(ret / 100).toFixed(2)}</Text>
              </Row>
              <Row style={{ marginTop: sp(1.5) }}>
                <Text style={type.soft}>Profit</Text>
                <Text style={s.money}>€{((ret - stake) / 100).toFixed(2)}</Text>
              </Row>
            </View>

            {moved.length > 0 && (
              <View style={s.movedBox}>
                <Text style={s.movedTitle}>Odds moved since you added</Text>
                {moved.map((x) => (
                  <Text key={x.id} style={type.tiny}>
                    {x.match} · {x.moved > 0 ? '↑' : '↓'} {Math.abs(x.moved).toFixed(2)} → now {x.odds.toFixed(2)}
                  </Text>
                ))}
                <Text style={[type.tiny, { marginTop: sp(1.5), color: c.inkSoft }]}>
                  The figures above already use the current price. Nothing changes after you tap place.
                </Text>
              </View>
            )}

            <Label style={{ marginTop: sp(4) }}>What happens if…</Label>
            {WHAT_IF.map((w) => (
              <View key={w.q}>
                <Pressable onPress={() => setOpenWhatIf(openWhatIf === w.q ? null : w.q)} style={s.whatIf}>
                  <Text style={[type.body, { flex: 1 }]}>{w.q}</Text>
                  <Text style={{ color: c.inkFaint }}>{openWhatIf === w.q ? '−' : '+'}</Text>
                </Pressable>
                {openWhatIf === w.q && <Text style={s.whatIfA}>{w.a}</Text>}
              </View>
            ))}

            <Btn title={`Place bet · €${(stake / 100).toFixed(2)}`} tone="primary" onPress={place} style={{ marginTop: sp(4) }} />
            <Btn title="Back" tone="quiet" onPress={abandon} style={{ marginTop: sp(2) }} />

            <Note>
              No timer, no "3 people are viewing this", no price-rise warning. Every element
              here answers a question rather than manufacturing a reason to hurry.
            </Note>
          </Card>
        )}

        <Card style={{ marginTop: sp(6), backgroundColor: c.surfaceAlt }}>
          <Label>Why this screen exists</Label>
          <Text style={[type.h2, { marginTop: sp(2), color: c.risk }]}>
            {(metrics.finalStep.abandonRate * 100).toFixed(1)}% abandoned
          </Text>
          <Text style={[type.soft, { marginTop: sp(1) }]}>
            {metrics.finalStep.abandoned} of {metrics.finalStep.sessionsWithAdd.toLocaleString()} sessions
            reached the betslip and never placed — measured in top_casino_users_event_logs.csv,
            not estimated. That is the brief's "drop-off at the final step", with a number on it.
          </Text>
        </Card>
      </View>
    </ScrollView>
  );
}

/** Answers, in place, to the questions that plausibly cause abandonment. */
const WHAT_IF = [
  {
    q: 'One leg is void?',
    a: 'A void leg is removed and the remaining legs re-price. Your stake stays on the shorter accumulator — it is not refunded and not lost.',
  },
  {
    q: 'The match is postponed?',
    a: 'Postponed beyond 48 hours voids that leg and the slip re-prices as above. Inside 48 hours the selection stands.',
  },
  {
    q: 'The odds move again before kick-off?',
    a: 'They do not affect a placed bet. The price is fixed at the moment you place, and that is the price shown above.',
  },
  {
    q: 'I want to cash out early?',
    a: 'Cash-out is offered on most pre-match accumulators once the first leg is settled. The amount varies with live odds and is never guaranteed.',
  },
];

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    paddingHorizontal: sp(4), paddingTop: sp(3), paddingBottom: sp(4),
    borderBottomWidth: 1, borderBottomColor: c.rule, gap: sp(1),
  },
  pad: { paddingHorizontal: sp(4), marginTop: sp(4) },
  offer: {
    flexDirection: 'row', alignItems: 'center', gap: sp(3),
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.rule,
    borderRadius: 6, padding: sp(3), marginTop: sp(2),
  },
  offerOn: { borderColor: c.relevance },
  odds: {
    borderWidth: 1, borderColor: c.rule, borderRadius: 4,
    paddingHorizontal: sp(2.5), paddingVertical: sp(1.5), backgroundColor: c.inset,
  },
  oddsText: { color: c.ink, fontWeight: '700', fontSize: 13, fontVariant: ['tabular-nums'] },
  stake: {
    borderWidth: 1, borderColor: c.rule, borderRadius: 4,
    paddingHorizontal: sp(2.5), paddingVertical: sp(1.5),
  },
  stakeOn: { borderColor: c.relevance, backgroundColor: c.surfaceAlt },
  stakeText: { color: c.inkSoft, fontSize: 12, fontWeight: '600' },
  returnBox: {
    backgroundColor: c.inset, borderRadius: 6, padding: sp(3), marginTop: sp(3),
  },
  money: { ...type.h3, fontVariant: ['tabular-nums'] },
  movedBox: {
    borderLeftWidth: 3, borderLeftColor: c.risk,
    paddingLeft: sp(2.5), marginTop: sp(3), gap: sp(0.5),
  },
  movedTitle: { fontSize: 12, fontWeight: '700', color: c.risk, marginBottom: sp(1) },
  whatIf: {
    flexDirection: 'row', alignItems: 'center', gap: sp(2),
    paddingVertical: sp(2.5), borderBottomWidth: 1, borderBottomColor: c.ruleSoft,
  },
  whatIfA: {
    ...type.soft, paddingBottom: sp(3), paddingTop: sp(1),
    borderBottomWidth: 1, borderBottomColor: c.ruleSoft,
  },
});

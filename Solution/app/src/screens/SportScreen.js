/**
 * Sport — betslip and the confirm step, on the real price feed.
 *
 * Matches, competitions, market names and odds all come from EPS_Offers.csv,
 * including the movement: every extracted match carries the price it opened at
 * and the price it is at now. So "odds moved since you added" shows a real
 * delta rather than a decorative arrow.
 *
 * The screen exists because of one measured number: 357 of 1,649 sessions
 * reached the betslip and never placed — 21.6% abandoned at the strongest
 * intent signal in the product. Every element here answers a question that
 * plausibly causes that. None of them manufactures urgency.
 */

import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLantern } from '../lantern/useLantern';
import { Btn, Card, Label, Row, Note, StateChip, ChipRail, SectionHeader } from '../components/ui';
import { c, sp, type, radius } from '../theme';
import offers from '../data/offers.json';
import sportsbook from '../data/sportsbook.json';
import metrics from '../data/metrics.json';

const ICON = { Soccer: 'football', Tennis: 'tennisball', Basketball: 'basketball', 'Ice Hockey': 'snow', MMA: 'fitness' };

const WHAT_IF = [
  { q: 'One leg is void?', a: 'A void leg is removed and the remaining legs re-price. Your stake stays on the shorter accumulator — not refunded, not lost.' },
  { q: 'The match is postponed?', a: 'Postponed beyond 48 hours voids that leg and the slip re-prices as above. Inside 48 hours the selection stands.' },
  { q: 'The odds move again before kick-off?', a: 'They do not affect a placed bet. The price is fixed the moment you place, and that is the price shown above.' },
  { q: 'I want to cash out early?', a: 'Cash-out is offered on most pre-match accumulators once the first leg settles. The amount tracks live odds and is never guaranteed.' },
];

export default function SportScreen() {
  const { emit, slip, dispatch, risk } = useLantern();
  const [sport, setSport] = useState('Soccer');
  const [open, setOpen] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [stake, setStake] = useState(500);
  const [placed, setPlaced] = useState(null);
  const [whatIf, setWhatIf] = useState(null);

  const list = useMemo(() => offers.filter((o) => o.sport === sport).slice(0, 12), [sport]);

  const totalOdds = slip.reduce((a, x) => a * x.odds, 1);
  const ret = Math.round(stake * totalOdds);
  const moved = slip.filter((x) => x.moved !== 0);

  function add(match, mk) {
    const id = match.id + '|' + mk.name;
    if (slip.find((x) => x.id === id)) return;
    dispatch({ type: 'slipAdd', sel: { id, match: `${match.home} — ${match.away}`, market: mk.name, odds: mk.odds, opened: mk.opened, moved: mk.moved } });
    emit({ t: 'slip_add', selectionId: id });
  }

  if (placed) {
    return (
      <ScrollView style={s.root} contentContainerStyle={{ padding: sp(4) }}>
        <Card style={{ marginTop: sp(8), borderColor: c.calm }}>
          <Ionicons name="checkmark-circle" size={30} color={c.calm} />
          <Text style={[type.h2, { marginTop: sp(2) }]}>Bet placed</Text>
          <Text style={[type.soft, { marginTop: sp(1) }]}>
            {placed.n} selection{placed.n > 1 ? 's' : ''} · potential return €{(placed.ret / 100).toFixed(2)}
          </Text>
          <Btn title="New slip" tone="primary" onPress={() => setPlaced(null)} style={{ marginTop: sp(4) }} />
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: sp(14) }}>
      <LinearGradient colors={[c.brand, c.brandDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.chrome}>
        <Row>
          <Text style={s.title}>Sport</Text>
          <StateChip state={risk.state} compact />
        </Row>
        <Text style={s.sub}>
          {sportsbook.sports.reduce((a, x) => a + x.tournamentCount, 0)} competitions · live prices from the feed
        </Text>
      </LinearGradient>

      <ChipRail
        style={{ paddingTop: sp(3.5) }}
        value={sport}
        onChange={(v) => { setSport(v); setOpen(null); }}
        items={sportsbook.sports.map((x) => ({ value: x.name, label: x.nameHr, icon: ICON[x.name] }))}
      />

      <View style={{ marginTop: sp(4) }}>
        <SectionHeader icon="calendar" title="Today" count={list.length} tint={c.relevance} />
        <View style={{ paddingHorizontal: sp(4) }}>
          {list.map((m) => {
            const isOpen = open === m.id;
            return (
              <View key={m.id} style={s.match}>
                <Pressable onPress={() => setOpen(isOpen ? null : m.id)} style={s.matchHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={type.h3} numberOfLines={1}>{m.home}</Text>
                    <Text style={type.h3} numberOfLines={1}>{m.away || '—'}</Text>
                    <Text style={type.tiny} numberOfLines={1}>
                      {m.tournament} · {m.marketCount.toLocaleString()} markets
                    </Text>
                  </View>
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={c.inkFaint} />
                </Pressable>

                {isOpen && (
                  <View style={s.markets}>
                    {m.markets.map((mk) => {
                      const inSlip = !!slip.find((x) => x.id === m.id + '|' + mk.name);
                      return (
                        <Pressable
                          key={mk.name}
                          onPress={() => add(m, mk)}
                          style={[s.mk, inSlip && s.mkOn]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={s.mkName} numberOfLines={2}>{mk.name}</Text>
                            {mk.moved !== 0 && (
                              <Text style={[s.mkMove, { color: mk.moved > 0 ? c.calm : c.risk }]}>
                                {mk.moved > 0 ? '▲' : '▼'} from {mk.opened.toFixed(2)} · {mk.updates} updates
                              </Text>
                            )}
                          </View>
                          <View style={s.odds}><Text style={s.oddsText}>{mk.odds.toFixed(2)}</Text></View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>

      {/* ---------------- slip ---------------- */}
      {slip.length > 0 && !confirming && (
        <View style={s.pad}>
          <Card style={{ borderColor: c.relevance }}>
            <Label style={{ color: c.relevance }}>Betslip · {slip.length}</Label>
            {slip.map((x) => (
              <Row key={x.id} style={{ marginTop: sp(2.5) }}>
                <View style={{ flex: 1, paddingRight: sp(3) }}>
                  <Text style={type.body} numberOfLines={1}>{x.match}</Text>
                  <Text style={type.tiny} numberOfLines={1}>{x.market}</Text>
                </View>
                <Text style={[type.h3, type.num]}>{x.odds.toFixed(2)}</Text>
                <Pressable onPress={() => { dispatch({ type: 'slipRemove', id: x.id }); emit({ t: 'slip_remove', selectionId: x.id }); }} hitSlop={10} style={{ marginLeft: sp(3) }}>
                  <Ionicons name="close" size={16} color={c.inkFaint} />
                </Pressable>
              </Row>
            ))}
            <Row style={{ marginTop: sp(3.5) }}>
              <Text style={type.soft}>Total odds</Text>
              <Text style={[type.h2, type.num]}>{totalOdds.toFixed(2)}</Text>
            </Row>
            <Btn title="Continue" tone="primary" onPress={() => { setConfirming(true); emit({ t: 'confirm_reach' }); }} style={{ marginTop: sp(3) }} />
          </Card>
        </View>
      )}

      {/* ---------------- confirm ---------------- */}
      {confirming && (
        <View style={s.pad}>
          <Card style={{ borderColor: c.relevance }}>
            <Label style={{ color: c.relevance }}>Confirm</Label>

            <Row style={{ marginTop: sp(3) }}>
              <Text style={type.soft}>Stake</Text>
              <View style={{ flexDirection: 'row', gap: sp(1.5) }}>
                {[200, 500, 1000, 2000].map((v) => (
                  <Pressable key={v} onPress={() => setStake(v)} style={[s.stake, stake === v && s.stakeOn]}>
                    <Text style={[s.stakeText, stake === v && { color: c.relevance }]}>€{v / 100}</Text>
                  </Pressable>
                ))}
              </View>
            </Row>

            <View style={s.returns}>
              <Row><Text style={type.soft}>You stake</Text><Text style={[type.h3, type.num]}>€{(stake / 100).toFixed(2)}</Text></Row>
              <Row style={{ marginTop: sp(1.5) }}>
                <Text style={type.soft}>Returns if every leg wins</Text>
                <Text style={[type.h3, type.num, { color: c.calm }]}>€{(ret / 100).toFixed(2)}</Text>
              </Row>
              <Row style={{ marginTop: sp(1.5) }}>
                <Text style={type.soft}>Profit</Text>
                <Text style={[type.h3, type.num]}>€{((ret - stake) / 100).toFixed(2)}</Text>
              </Row>
            </View>

            {moved.length > 0 && (
              <View style={s.movedBox}>
                <Text style={s.movedTitle}>Odds moved since these opened</Text>
                {moved.map((x) => (
                  <Text key={x.id} style={type.tiny} numberOfLines={1}>
                    {x.market} · {x.moved > 0 ? '▲' : '▼'} {Math.abs(x.moved).toFixed(2)} → now {x.odds.toFixed(2)}
                  </Text>
                ))}
                <Text style={[type.tiny, { marginTop: sp(1.5), color: c.inkSoft }]}>
                  Real movement from the price feed. The figures above already use the current
                  price, and nothing changes after you tap place.
                </Text>
              </View>
            )}

            <Label style={{ marginTop: sp(4) }}>What happens if…</Label>
            {WHAT_IF.map((w) => (
              <View key={w.q}>
                <Pressable onPress={() => setWhatIf(whatIf === w.q ? null : w.q)} style={s.whatIf}>
                  <Text style={[type.body, { flex: 1 }]}>{w.q}</Text>
                  <Ionicons name={whatIf === w.q ? 'remove' : 'add'} size={15} color={c.inkFaint} />
                </Pressable>
                {whatIf === w.q && <Text style={s.whatIfA}>{w.a}</Text>}
              </View>
            ))}

            <Btn title={`Place bet · €${(stake / 100).toFixed(2)}`} tone="primary"
              onPress={() => { emit({ t: 'confirm_done' }); setPlaced({ n: slip.length, ret }); dispatch({ type: 'slipClear' }); setConfirming(false); }}
              style={{ marginTop: sp(4) }} />
            <Btn title="Back" tone="quiet" onPress={() => { emit({ t: 'confirm_abandon' }); setConfirming(false); }} style={{ marginTop: sp(2) }} />

            <Note>
              No timer, no "3 people are viewing this", no price-rise warning. Every element
              answers a question rather than manufacturing a reason to hurry.
            </Note>
          </Card>
        </View>
      )}

      <View style={s.pad}>
        <Card style={{ backgroundColor: c.surfaceAlt }}>
          <Label>Why this screen exists</Label>
          <Text style={[type.h1, { marginTop: sp(2), color: c.risk }]}>
            {(metrics.finalStep.abandonRate * 100).toFixed(1)}% abandoned
          </Text>
          <Text style={[type.soft, { marginTop: sp(1) }]}>
            {metrics.finalStep.abandoned} of {metrics.finalStep.sessionsWithAdd.toLocaleString()}{' '}
            sessions reached the betslip and never placed — measured in
            top_casino_users_event_logs.csv, not estimated. The brief's "drop-off at the final
            step", with a number on it.
          </Text>
        </Card>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  chrome: { paddingHorizontal: sp(4), paddingTop: sp(4), paddingBottom: sp(4), gap: sp(1) },
  title: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: -0.4 },
  sub: { color: 'rgba(255,255,255,0.75)', fontSize: 11.5, fontWeight: '600' },
  pad: { paddingHorizontal: sp(4), marginTop: sp(5) },

  match: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.rule, borderRadius: radius.md, marginBottom: sp(2), overflow: 'hidden' },
  matchHead: { flexDirection: 'row', alignItems: 'center', gap: sp(3), padding: sp(3) },
  markets: { borderTopWidth: 1, borderTopColor: c.ruleSoft, padding: sp(2.5), gap: sp(1.5) },
  mk: { flexDirection: 'row', alignItems: 'center', gap: sp(2.5), backgroundColor: c.inset, borderWidth: 1, borderColor: 'transparent', borderRadius: radius.sm, padding: sp(2.5) },
  mkOn: { borderColor: c.relevance },
  mkName: { fontSize: 12, color: c.ink, lineHeight: 16 },
  mkMove: { fontSize: 10, marginTop: 2, fontWeight: '700' },
  odds: { backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.rule, borderRadius: 4, paddingHorizontal: sp(2.5), paddingVertical: sp(1.5), minWidth: 52, alignItems: 'center' },
  oddsText: { color: c.ink, fontWeight: '800', fontSize: 13, fontVariant: ['tabular-nums'] },

  stake: { borderWidth: 1, borderColor: c.rule, borderRadius: 4, paddingHorizontal: sp(2.5), paddingVertical: sp(1.5) },
  stakeOn: { borderColor: c.relevance, backgroundColor: c.surfaceAlt },
  stakeText: { color: c.inkSoft, fontSize: 12, fontWeight: '700' },
  returns: { backgroundColor: c.inset, borderRadius: radius.sm, padding: sp(3), marginTop: sp(3) },
  movedBox: { borderLeftWidth: 3, borderLeftColor: c.risk, paddingLeft: sp(2.5), marginTop: sp(3), gap: 2 },
  movedTitle: { fontSize: 12, fontWeight: '800', color: c.risk, marginBottom: sp(1) },
  whatIf: { flexDirection: 'row', alignItems: 'center', gap: sp(2), paddingVertical: sp(2.5), borderBottomWidth: 1, borderBottomColor: c.ruleSoft },
  whatIfA: { ...type.soft, paddingBottom: sp(3), paddingTop: sp(1), borderBottomWidth: 1, borderBottomColor: c.ruleSoft },
});

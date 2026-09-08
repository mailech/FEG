/**
 * The adaptive lobby — LANTERN-ARCHITECTURE.md §4.
 *
 * Same catalogue, same code, same moment; reshaped by what this session's first
 * few interactions say about it. The Baseline / Lantern switch is the A/B: the
 * baseline arm is popularity order, which is what a generic lobby does today.
 */

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput } from 'react-native';
import { useLantern } from '../lantern/useLantern';
import { GameTile, Label, Toggle, Note, StateChip, Card, Row } from '../components/ui';
import { c, sp, type } from '../theme';
import sections from '../data/sections.json';
import metrics from '../data/metrics.json';

const ARCH_COPY = {
  opening: 'No interactions yet — popularity prior only.',
  browsing: 'Several titles, little dwell. Looking, not playing.',
  focused: 'Returning to one or two titles. Continuity first.',
  seeking: 'Repeated search. Surface what was searched for.',
};

export default function LobbyScreen({ onOpenGame }) {
  const { shelf, policy, risk, arm, dispatch, emit, sco, balanceCents } = useLantern();
  const [q, setQ] = useState('');

  const items = shelf.items;
  let cursor = 0;

  return (
    <ScrollView style={st.root} contentContainerStyle={{ paddingBottom: sp(10) }}>
      <View style={st.header}>
        <Row>
          <View>
            <Text style={type.h1}>Casino</Text>
            <Text style={type.tiny}>{policy.market?.name}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: sp(1.5) }}>
            <Text style={st.balance}>€{(balanceCents / 100).toFixed(2)}</Text>
            <StateChip state={risk.state} score={risk.score} />
          </View>
        </Row>
      </View>

      <View style={st.pad}>
        <Toggle
          value={arm}
          onChange={(a) => dispatch({ type: 'setArm', arm: a })}
          options={[
            { value: 'baseline', label: 'Baseline lobby' },
            { value: 'lantern', label: 'Lantern' },
          ]}
        />

        <Pressable
          style={st.search}
          onPress={() => emit({ t: 'search', qLen: q.length })}
        >
          <Text style={st.searchIcon}>⌕</Text>
          <TextInput
            style={st.searchInput}
            placeholder="Search 887 titles"
            placeholderTextColor={c.inkFaint}
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => emit({ t: 'search', qLen: q.length })}
          />
        </Pressable>

        {arm === 'baseline' ? (
          <Note tone="risk">
            Popularity order, identical for every player. {metrics.discovery.rows[0]?.name === 'search_results'
              ? `In the real logs this is why search out-ranks every curated row as the way a game gets found — ${metrics.discovery.rows[0].n.toLocaleString()} launches via search against ${metrics.discovery.rows[1]?.n.toLocaleString()} via category rows.`
              : ''}
          </Note>
        ) : (
          <Card style={{ marginTop: sp(3) }}>
            <Label>Session read</Label>
            <Text style={[type.h3, { marginTop: sp(1.5) }]}>
              {policy.archetype}
            </Text>
            <Text style={[type.soft, { marginTop: sp(1) }]}>{ARCH_COPY[policy.archetype]}</Text>
            {shelf.calibrated && (
              <Text style={[type.tiny, { marginTop: sp(2) }]}>
                calibration KL {shelf.kl} · provider mix held near this session's own
              </Text>
            )}
            {policy.reasons.length > 0 && (
              <View style={{ marginTop: sp(2.5), gap: sp(1) }}>
                {policy.reasons.map((r, i) => (
                  <Text key={i} style={st.reason}>▸ {r}</Text>
                ))}
              </View>
            )}
          </Card>
        )}
      </View>

      {policy.showSessionSummary && <SessionSummary />}

      {arm === 'lantern' && policy.shelves.length === 0 && (
        <View style={st.pad}>
          <Card style={{ borderColor: c.concern, borderStyle: 'dashed' }}>
            <Label style={{ color: c.concern }}>Recommendations held</Label>
            <Text style={[type.soft, { marginTop: sp(1.5) }]}>
              Nothing is surfaced above the current volatility band. This is not a lockout —
              search and the full catalogue stay available.
            </Text>
          </Card>
        </View>
      )}

      {(arm === 'baseline'
        ? [{ key: 'popular', title: 'Najigranije', n: 12 }]
        : policy.shelves
      ).map((sh) => {
        const slice = items.slice(cursor, cursor + sh.n);
        const start = cursor;
        cursor += sh.n;
        if (!slice.length) return null;
        return (
          <View key={sh.key} style={{ marginTop: sp(5) }}>
            <View style={st.pad}>
              <Label>{sh.title}</Label>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.shelf}>
              {slice.map((g, i) => (
                <GameTile
                  key={g.id}
                  game={g}
                  rank={start + i}
                  onPress={() => onOpenGame(g)}
                />
              ))}
            </ScrollView>
          </View>
        );
      })}

      {policy.showReward ? (
        <View style={[st.pad, { marginTop: sp(5) }]}>
          <Card style={{ borderColor: c.gold }}>
            <Row>
              <View style={{ flex: 1 }}>
                <Label style={{ color: c.gold }}>Weekly wheel</Label>
                <Text style={[type.soft, { marginTop: sp(1) }]}>
                  Segments point at titles you actually play. Prize values and probabilities
                  are fixed and published — identical for every eligible player.
                </Text>
              </View>
            </Row>
          </Card>
        </View>
      ) : (
        <View style={[st.pad, { marginTop: sp(5) }]}>
          <Card style={{ borderStyle: 'dashed', borderColor: c.rule }}>
            <Label style={{ color: c.risk }}>Weekly wheel — withheld</Label>
            <Text style={[type.tiny, { marginTop: sp(1) }]}>
              {risk.state === 'calm'
                ? 'Market policy: no reward surfaces in this jurisdiction.'
                : `gate: risk state ${risk.state}`}
            </Text>
          </Card>
        </View>
      )}

      {policy.showRgTools && <RgTools />}

      <View style={[st.pad, { marginTop: sp(6) }]}>
        <Label>Real lobby sections in the logs</Label>
        <View style={st.chips}>
          {sections.slice(0, 10).map((s) => (
            <View key={s.name} style={st.sectionChip}>
              <Text style={st.sectionChipText}>{s.name}</Text>
              <Text style={st.sectionChipN}>{s.n}</Text>
            </View>
          ))}
        </View>
        <Text style={[type.tiny, { marginTop: sp(2) }]}>
          85 distinct sections across {metrics.totalEvents.toLocaleString()} events from{' '}
          {metrics.players} players. Extracted from top_casino_users_event_logs.csv.
        </Text>
      </View>
    </ScrollView>
  );
}

function SessionSummary() {
  const { sco, minutes, balanceCents } = useLantern();
  const staked = sco.stakeTrace.reduce((a, b) => a + b, 0);
  return (
    <View style={[st.pad, { marginTop: sp(4) }]}>
      <Card style={{ backgroundColor: c.surfaceAlt }}>
        <Label>This session</Label>
        <Row style={{ marginTop: sp(2) }}>
          <Text style={type.soft}>{minutes.toFixed(0)} min</Text>
          <Text style={type.soft}>€{(staked / 100).toFixed(2)} staked</Text>
          <Text style={[type.soft, { color: sco.netCents < 0 ? c.concern : c.calm }]}>
            {sco.netCents < 0 ? '−' : '+'}€{Math.abs(sco.netCents / 100).toFixed(2)} net
          </Text>
        </Row>
        <Text style={[type.tiny, { marginTop: sp(2) }]}>
          Stated plainly, with no judgement attached and nothing to dismiss.
        </Text>
      </Card>
    </View>
  );
}

function RgTools() {
  return (
    <View style={[st.pad, { marginTop: sp(4) }]}>
      <Card>
        <Label>Your limits</Label>
        <View style={{ marginTop: sp(2), gap: sp(2) }}>
          <Row>
            <View>
              <Text style={type.body}>Deposit limit</Text>
              <Text style={type.tiny}>currently €200 / day</Text>
            </View>
            <Text style={st.link}>Edit</Text>
          </Row>
          <Row>
            <View>
              <Text style={type.body}>Take a break</Text>
              <Text style={type.tiny}>1 hour to 6 weeks</Text>
            </View>
            <Text style={st.link}>Open</Text>
          </Row>
        </View>
        <Text style={[type.tiny, { marginTop: sp(2.5) }]}>
          Shown plainly · no interstitial, no lockout, nothing to dismiss
        </Text>
      </Card>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    paddingHorizontal: sp(4), paddingTop: sp(3), paddingBottom: sp(4),
    borderBottomWidth: 1, borderBottomColor: c.rule,
  },
  pad: { paddingHorizontal: sp(4), marginTop: sp(4) },
  balance: { ...type.h2, fontVariant: ['tabular-nums'] },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: sp(2),
    backgroundColor: c.inset, borderWidth: 1, borderColor: c.rule,
    borderRadius: 6, paddingHorizontal: sp(3), marginTop: sp(3),
  },
  searchIcon: { color: c.inkFaint, fontSize: 16 },
  searchInput: { flex: 1, color: c.ink, paddingVertical: sp(2.5), fontSize: 14, outlineStyle: 'none' },
  shelf: { paddingHorizontal: sp(4), paddingTop: sp(2.5) },
  reason: { fontSize: 11, color: c.risk, lineHeight: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1.5), marginTop: sp(2) },
  sectionChip: {
    flexDirection: 'row', alignItems: 'center', gap: sp(1.5),
    borderWidth: 1, borderColor: c.rule, borderRadius: 20,
    paddingHorizontal: sp(2.5), paddingVertical: sp(1),
  },
  sectionChipText: { fontSize: 11, color: c.inkSoft },
  sectionChipN: { fontSize: 10, color: c.inkFaint, fontVariant: ['tabular-nums'] },
  link: { color: c.relevance, fontSize: 13, fontWeight: '600' },
});

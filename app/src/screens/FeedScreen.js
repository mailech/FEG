/**
 * The feed — a discovery surface shaped like the apps people already know.
 *
 * One design decision worth defending out loud: **this feed ends.** Infinite
 * scroll is the one Instagram mechanic that does not survive contact with the
 * guardrail, because "no natural stopping point" is the whole problem in a
 * gambling product. So the feed is session-length, it tells you how far through
 * you are, and it finishes with a summary instead of loading more.
 *
 * The other borrowed idea is the one that actually helps: every card says why
 * it is in front of you. A recommendation the player can interrogate is
 * relevance. One they cannot is just a push.
 */

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLantern } from '../lantern/useLantern';
import { explain } from '../lantern/relevance';
import GameArt from '../components/GameArt';
import { Card, Label, Row, StateChip, Toggle, Note } from '../components/ui';
import { c, sp, type } from '../theme';
import sections from '../data/sections.json';
import metrics from '../data/metrics.json';

const ARCH_COPY = {
  opening: 'Nothing tapped yet — this is the popularity prior.',
  browsing: 'Several titles, little dwell. Looking, not playing.',
  focused: 'Returning to one or two titles. Continuity first.',
  seeking: 'Repeated search. Surfacing what was searched for.',
};

export default function FeedScreen({ onOpenGame }) {
  const { shelf, policy, risk, arm, dispatch, emit, sco, balanceCents, minutes } = useLantern();
  const [q, setQ] = useState('');
  const [saved, setSaved] = useState({});

  const items = shelf.items;
  const isLantern = arm === 'lantern';

  const toggleSave = (id) => setSaved((s) => ({ ...s, [id]: !s[id] }));

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: sp(12) }}>
      {/* ---------------- header ---------------- */}
      <View style={s.header}>
        <Row>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2) }}>
            <Ionicons name="flame" size={20} color={c.relevance} />
            <Text style={s.brand}>Lantern</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(3) }}>
            <Text style={s.balance}>€{(balanceCents / 100).toFixed(2)}</Text>
            <StateChip state={risk.state} score={risk.score} />
          </View>
        </Row>
      </View>

      {/* ---------------- stories row ---------------- */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.stories}>
        {sco.seq.length > 0 && (
          <Story label="Continue" icon="play" tone={c.relevance} />
        )}
        {sections.slice(0, 8).map((sec) => (
          <Story key={sec.name} label={sec.name} count={sec.n} />
        ))}
      </ScrollView>

      {/* ---------------- search + arm ---------------- */}
      <View style={s.pad}>
        <View style={s.search}>
          <Ionicons name="search" size={15} color={c.inkFaint} />
          <TextInput
            style={s.searchInput}
            placeholder="Search 887 titles"
            placeholderTextColor={c.inkFaint}
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => emit({ t: 'search', qLen: q.length })}
          />
        </View>

        <Toggle
          style={{ marginTop: sp(3) }}
          value={arm}
          onChange={(a) => dispatch({ type: 'setArm', arm: a })}
          options={[
            { value: 'baseline', label: 'Generic feed' },
            { value: 'lantern', label: 'Lantern' },
          ]}
        />

        {isLantern ? (
          <Card style={{ marginTop: sp(3) }}>
            <Row>
              <Label>Session read</Label>
              <Text style={[type.tiny, { color: c.relevance }]}>
                {shelf.calibrated ? `KL ${shelf.kl}` : ''}
              </Text>
            </Row>
            <Text style={[type.h3, { marginTop: sp(1.5), textTransform: 'capitalize' }]}>
              {policy.archetype}
            </Text>
            <Text style={[type.soft, { marginTop: sp(0.5) }]}>{ARCH_COPY[policy.archetype]}</Text>
            {policy.reasons.map((r, i) => (
              <Text key={i} style={s.reason}>▸ {r}</Text>
            ))}
          </Card>
        ) : (
          <Note tone="risk">
            Same order for every player, no explanation on any card. In the real logs this is
            why search out-ranks every curated row as the way a game gets found —{' '}
            {metrics.discovery.rows[0].n.toLocaleString()} launches via search against{' '}
            {metrics.discovery.rows[1].n.toLocaleString()} via category rows.
          </Note>
        )}
      </View>

      {/* ---------------- session summary ---------------- */}
      {policy.showSessionSummary && (
        <View style={s.pad}>
          <Card style={{ backgroundColor: c.surfaceAlt }}>
            <Label>This session</Label>
            <Row style={{ marginTop: sp(2) }}>
              <Text style={type.soft}>{minutes.toFixed(0)} min</Text>
              <Text style={type.soft}>
                €{(sco.stakeTrace.reduce((a, b) => a + b, 0) / 100).toFixed(2)} staked
              </Text>
              <Text style={[type.soft, { color: sco.netCents < 0 ? c.concern : c.calm }]}>
                {sco.netCents < 0 ? '−' : '+'}€{Math.abs(sco.netCents / 100).toFixed(2)}
              </Text>
            </Row>
          </Card>
        </View>
      )}

      {/* ---------------- the feed ---------------- */}
      {items.length === 0 ? (
        <View style={s.pad}>
          <Card style={{ borderColor: c.concern, borderStyle: 'dashed' }}>
            <Label style={{ color: c.concern }}>Feed held</Label>
            <Text style={[type.soft, { marginTop: sp(1.5) }]}>
              Nothing is surfaced above your current volatility band. Search and the full
              catalogue stay open — this is a pause on recommending, not a lockout.
            </Text>
          </Card>
        </View>
      ) : (
        items.map((g, i) => (
          <FeedCard
            key={g.id}
            game={g}
            index={i}
            total={items.length}
            why={isLantern ? explain(g, sco) : null}
            saved={!!saved[g.id]}
            onSave={() => toggleSave(g.id)}
            onPlay={() => onOpenGame(g)}
          />
        ))
      )}

      {/* ---------------- wheel, inline as a feed item ---------------- */}
      {policy.showReward && items.length > 0 && (
        <View style={s.pad}>
          <Card style={{ borderColor: c.gold }}>
            <Row>
              <Label style={{ color: c.gold }}>Weekly wheel</Label>
              <Ionicons name="disc-outline" size={18} color={c.gold} />
            </Row>
            <Text style={[type.soft, { marginTop: sp(1.5) }]}>
              Segments point at titles you actually play. Prize values and probabilities are
              fixed and published — identical for every eligible player.
            </Text>
          </Card>
        </View>
      )}

      {!policy.showReward && (
        <View style={s.pad}>
          <Card style={{ borderStyle: 'dashed' }}>
            <Label style={{ color: c.risk }}>Weekly wheel — withheld</Label>
            <Text style={[type.tiny, { marginTop: sp(1) }]}>
              {risk.state === 'calm'
                ? 'Market policy: no reward surfaces in this jurisdiction.'
                : `gate: risk state ${risk.state}`}
            </Text>
          </Card>
        </View>
      )}

      {policy.showRgTools && (
        <View style={s.pad}>
          <Card>
            <Label>Your limits</Label>
            <View style={{ marginTop: sp(2), gap: sp(2.5) }}>
              <Row>
                <View>
                  <Text style={type.body}>Deposit limit</Text>
                  <Text style={type.tiny}>currently €200 / day</Text>
                </View>
                <Text style={s.link}>Edit</Text>
              </Row>
              <Row>
                <View>
                  <Text style={type.body}>Take a break</Text>
                  <Text style={type.tiny}>1 hour to 6 weeks</Text>
                </View>
                <Text style={s.link}>Open</Text>
              </Row>
            </View>
            <Text style={[type.tiny, { marginTop: sp(2.5) }]}>
              Shown plainly · no interstitial, no lockout, nothing to dismiss
            </Text>
          </Card>
        </View>
      )}

      {/* ---------------- the end ---------------- */}
      {items.length > 0 && (
        <View style={[s.pad, { marginTop: sp(6) }]}>
          <View style={s.endBox}>
            <Ionicons name="checkmark-circle-outline" size={28} color={c.calm} />
            <Text style={[type.h3, { marginTop: sp(2) }]}>That's the whole feed</Text>
            <Text style={[type.soft, { textAlign: 'center', marginTop: sp(1), maxWidth: 280 }]}>
              {items.length} titles, chosen for this session. It doesn't load more — a feed
              without an end is the one borrowed mechanic that fails the guardrail.
            </Text>
            <Text style={[type.tiny, { marginTop: sp(2.5), textAlign: 'center' }]}>
              Search stays open for all 887.
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

/* ------------------------------- pieces -------------------------------- */

function Story({ label, count, icon, tone = c.rule }) {
  return (
    <View style={s.story}>
      <View style={[s.storyRing, { borderColor: tone }]}>
        {icon ? (
          <Ionicons name={icon} size={18} color={tone} />
        ) : (
          <Text style={s.storyGlyph}>{label.slice(0, 2).toUpperCase()}</Text>
        )}
      </View>
      <Text style={s.storyLabel} numberOfLines={1}>{label}</Text>
      {count != null && <Text style={s.storyCount}>{count}</Text>}
    </View>
  );
}

function FeedCard({ game, index, total, why, saved, onSave, onPlay }) {
  return (
    <View style={s.card}>
      <Pressable onPress={onPlay}>
        <GameArt game={game} size="card" />
      </Pressable>

      <View style={s.cardBody}>
        <Row style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1, paddingRight: sp(3) }}>
            <Text style={type.h3} numberOfLines={1}>{game.name}</Text>
            <Text style={type.tiny}>
              {game.provider} · {game.mechanic.replace('-', ' ')} · band {game.volatility}
            </Text>
          </View>
          <Text style={s.counter}>{index + 1}/{total}</Text>
        </Row>

        {why && (
          <View style={s.why}>
            <Ionicons name="sparkles-outline" size={12} color={c.relevance} />
            <Text style={s.whyText}>{why}</Text>
          </View>
        )}

        <Row style={{ marginTop: sp(3) }}>
          <Pressable onPress={onPlay} style={s.play}>
            <Ionicons name="play" size={13} color={c.bg} />
            <Text style={s.playText}>Play</Text>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: sp(4), alignItems: 'center' }}>
            <Pressable onPress={onSave} hitSlop={10}>
              <Ionicons
                name={saved ? 'bookmark' : 'bookmark-outline'}
                size={20}
                color={saved ? c.relevance : c.inkFaint}
              />
            </Pressable>
            <Pressable hitSlop={10}>
              <Ionicons name="information-circle-outline" size={20} color={c.inkFaint} />
            </Pressable>
          </View>
        </Row>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    paddingHorizontal: sp(4), paddingTop: sp(3), paddingBottom: sp(3),
    borderBottomWidth: 1, borderBottomColor: c.rule,
  },
  brand: { ...type.h2, letterSpacing: -0.3 },
  balance: { ...type.h3, fontVariant: ['tabular-nums'] },
  pad: { paddingHorizontal: sp(4), marginTop: sp(4) },

  stories: { paddingHorizontal: sp(4), paddingVertical: sp(3.5), gap: sp(3.5) },
  story: { alignItems: 'center', width: 62 },
  storyRing: {
    width: 54, height: 54, borderRadius: 27, borderWidth: 1.5,
    backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center',
  },
  storyGlyph: { color: c.inkSoft, fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  storyLabel: { fontSize: 10, color: c.inkSoft, marginTop: sp(1.25), textAlign: 'center' },
  storyCount: { fontSize: 9, color: c.inkFaint, fontVariant: ['tabular-nums'] },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: sp(2),
    backgroundColor: c.inset, borderWidth: 1, borderColor: c.rule,
    borderRadius: 8, paddingHorizontal: sp(3),
  },
  searchInput: {
    flex: 1, color: c.ink, paddingVertical: sp(2.5), fontSize: 14, outlineStyle: 'none',
  },
  reason: { fontSize: 11, color: c.risk, lineHeight: 16, marginTop: sp(1) },

  card: {
    marginTop: sp(5), marginHorizontal: sp(4),
    backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.rule, overflow: 'hidden',
  },
  cardBody: { padding: sp(3.5) },
  counter: { fontSize: 10, color: c.inkFaint, fontVariant: ['tabular-nums'] },
  why: {
    flexDirection: 'row', alignItems: 'center', gap: sp(1.5),
    marginTop: sp(2.5), backgroundColor: c.inset,
    paddingHorizontal: sp(2.5), paddingVertical: sp(2), borderRadius: 6,
  },
  whyText: { flex: 1, fontSize: 12, color: c.inkSoft, lineHeight: 16 },
  play: {
    flexDirection: 'row', alignItems: 'center', gap: sp(1.5),
    backgroundColor: c.relevance, borderRadius: 6,
    paddingHorizontal: sp(4), paddingVertical: sp(2.25),
  },
  playText: { color: c.bg, fontWeight: '800', fontSize: 13 },

  endBox: {
    alignItems: 'center', paddingVertical: sp(8),
    borderTopWidth: 1, borderTopColor: c.rule,
  },
  link: { color: c.relevance, fontSize: 13, fontWeight: '600' },
});

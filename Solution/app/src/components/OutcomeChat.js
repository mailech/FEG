/**
 * Asking a player from the ledger about their result.
 *
 * These are not live sessions — they are the 834 pseudonymous players the models
 * were trained on, each with a receipt. So the conversation is templated: fixed
 * openers, answers derived from that player's own record. A free-text channel to
 * someone who is not there would be theatre.
 *
 * The distinction matters enough to be visible. A live peer gets the real chat
 * in the notification tray, with a green presence dot; a ledger player gets this
 * one, labelled "from the ledger". Nobody should have to guess which is which.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OPENERS, reply } from '../lantern/outcomes';
import { CHARACTER } from '../lantern/model';
import { c, sp, type, radius } from '../theme';

export default function OutcomeChat({ person, onClose, compact }) {
  const [thread, setThread] = useState([]);
  const asked = new Set(thread.filter((m) => m.me).map((m) => m.text));
  const won = person.net > 0;

  const ask = (q) =>
    setThread((t) => [...t, { me: true, text: q }, { me: false, text: reply(q, person) }]);

  return (
    <View style={[s.wrap, compact && s.compact]}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.who}>{person.id}</Text>
          <Text style={s.meta}>
            {CHARACTER[person.archetype]?.label || person.archetype} · {person.sessions} sessions ·{' '}
            <Text style={{ color: won ? c.calm : c.inkSoft }}>
              {won ? '+' : '−'}€{Math.abs(person.net).toFixed(2)}
            </Text>
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={16} color={c.inkSoft} />
        </Pressable>
      </View>

      <View style={s.receipt}>
        <Ionicons name="shield-checkmark" size={12} color={c.calm} />
        <Text style={s.receiptText}>
          From the ledger · receipt {person.receipt} · {person.events.toLocaleString()} logged events
        </Text>
      </View>

      <View style={{ gap: sp(1.5) }}>
        {thread.map((m, i) => (
          <View key={i} style={[s.bubble, m.me ? s.mine : s.theirs]}>
            <Text style={m.me ? s.mineText : s.theirsText}>{m.text}</Text>
          </View>
        ))}
        {!thread.length && (
          <Text style={s.hint}>Pick a question — openers are fixed, free text is not open here.</Text>
        )}
      </View>

      <View style={s.chips}>
        {OPENERS.filter((q) => !asked.has(q)).map((q) => (
          <Pressable key={q} onPress={() => ask(q)} style={s.chip}>
            <Text style={s.chipText}>{q}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: c.inset, borderRadius: radius.md, padding: sp(2.5), gap: sp(2),
    borderWidth: 1, borderColor: c.rule,
  },
  compact: { padding: sp(2) },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: sp(2) },
  who: { ...type.tiny, color: c.ink, fontWeight: '800' },
  meta: { ...type.tiny, color: c.inkFaint, fontSize: 9.5 },
  receipt: { flexDirection: 'row', alignItems: 'flex-start', gap: sp(1.5) },
  receiptText: { ...type.tiny, color: c.calm, flex: 1, fontSize: 9.5, lineHeight: 13 },
  hint: { ...type.tiny, color: c.inkFaint },
  bubble: { maxWidth: '90%', borderRadius: radius.sm, paddingHorizontal: sp(2.5), paddingVertical: sp(1.5) },
  mine: { alignSelf: 'flex-end', backgroundColor: c.brand },
  theirs: { alignSelf: 'flex-start', backgroundColor: c.surfaceAlt },
  mineText: { ...type.tiny, color: '#fff', lineHeight: 15 },
  theirsText: { ...type.tiny, color: c.ink, lineHeight: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1.5) },
  chip: {
    paddingHorizontal: sp(2.5), paddingVertical: sp(1.5), borderRadius: radius.pill,
    borderWidth: 1, borderColor: c.relevance, backgroundColor: c.surface,
  },
  chipText: { ...type.tiny, color: c.inkSoft, fontWeight: '700', fontSize: 9.5 },
});

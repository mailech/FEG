/**
 * Profile — who is holding the phone, what they told us, and what they can check.
 *
 * Three things live here, in this order on purpose: the account, the limits the
 * player set for themselves, and the verified-outcomes ledger.
 *
 * The ledger is the interesting one. It began as "notify everyone when someone
 * wins", which is a textbook inducement — the losing version of that message is
 * never sent. Published in full, wins and losses in true proportion with a
 * receipt on each, the same feature becomes the opposite: proof that the wins on
 * the board are real, because the losses are sitting next to them.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLantern } from '../lantern/useLantern';
import { Card, Label, Row, Note, Btn, Toggle, StateChip } from '../components/ui';
import MonitorScreen from './MonitorScreen';
import {
  loadProfile, saveProfile, createProfile, clearProfile, handleFor, AGE_BANDS, MARKETS,
} from '../lantern/identity';
import { backend } from '../lantern/storage';
import { relayBase } from '../lantern/feed';
import { feed, DISTRIBUTION } from '../lantern/outcomes';
import OutcomeChat from '../components/OutcomeChat';
import { usePeers } from '../lantern/usePeers';
import { CHARACTER } from '../lantern/model';
import { c, sp, type, radius } from '../theme';

const eur = (n) => `${n < 0 ? '−' : ''}€${Math.abs(n).toFixed(2)}`;

/* ------------------------------------------------------------------ signup */

function SignUp({ onDone, onSignedIn }) {
  const [name, setName] = useState('');
  const [band, setBand] = useState('35-44');
  const [market, setMarket] = useState('hr');
  const [confirmed, setConfirmed] = useState(false);

  return (
    <ScrollView style={s.root} contentContainerStyle={s.wrap}>
      <View style={s.brandRow}>
        <Ionicons name="flame" size={20} color={c.relevance} />
        <Text style={s.brand}>LANTERN</Text>
      </View>
      <Text style={s.h1}>Set up your profile</Text>
      <Text style={s.lede}>
        A demo account, held on this device only. Registration and identity verification are out
        of scope for this challenge, and the hackathon rules forbid real personal data — so give
        it any name you like.
      </Text>

      <Card style={{ gap: sp(3) }}>
        <View>
          <Label>Display name</Label>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Marina"
            placeholderTextColor={c.inkFaint}
            maxLength={32}
          />
        </View>

        <View>
          <Label>Age band</Label>
          <View style={s.chips}>
            {AGE_BANDS.map((b) => (
              <Pressable key={b} onPress={() => setBand(b)} style={[s.chip, band === b && s.chipOn]}>
                <Text style={[s.chipText, band === b && s.chipTextOn]}>{b}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.hint}>
            Used only as a risk covariate. It never enters the recommendation model.
          </Text>
        </View>

        <View>
          <Label>Market</Label>
          <View style={s.chips}>
            {MARKETS.map((m) => (
              <Pressable
                key={m.value}
                onPress={() => setMarket(m.value)}
                style={[s.chip, market === m.value && s.chipOn]}
              >
                <Text style={[s.chipText, market === m.value && s.chipTextOn]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable onPress={() => setConfirmed((v) => !v)} style={s.checkRow}>
          <View style={[s.check, confirmed && s.checkOn]}>
            {confirmed && <Ionicons name="checkmark" size={13} color="#04121A" />}
          </View>
          <Text style={s.checkText}>
            I am 18 or over, and I am not on a self-exclusion register.
          </Text>
        </Pressable>

        <Btn
          title="Create profile"
          tone="primary"
          disabled={!confirmed}
          onPress={() => {
            onDone(createProfile({ name, ageBand: band, market }));
            // Signing in is an interaction. Without an event the session never
            // publishes, so a user who has signed in but not yet played would be
            // invisible on the dashboards — which is the wrong answer to "who is
            // signed in right now".
            onSignedIn?.();
          }}
        />

        <Note tone="quiet">
          In production this is where the register check runs — Croatia's Regulation on Measures
          for Socially Responsible Organisation requires a check against the excluded-players
          register before play, not a tickbox. Modelled here as a gate in front of the product.
        </Note>
      </Card>
    </ScrollView>
  );
}

/* ---------------------------------------------------------------- outcomes */

function Outcomes() {
  const rows = useMemo(() => feed(12), []);
  const [open, setOpen] = useState(null);

  return (
    <Card style={{ gap: sp(2.5) }}>
      <Row>
        <Label>Verified outcomes</Label>
        <Text style={s.hint}>{DISTRIBUTION.total} players</Text>
      </Row>

      <Text style={s.truth}>
        {Math.round(DISTRIBUTION.upShare * 100)}% of players in this ledger are ahead.{' '}
        {Math.round((1 - DISTRIBUTION.upShare) * 100)}% are behind, and the median player is at{' '}
        {eur(DISTRIBUTION.median)}.
      </Text>
      <Text style={s.hint}>
        Published in true proportion. A feed that only showed the wins would be telling you
        something false about your own chances.
      </Text>

      <View style={s.bar}>
        <View style={[s.barUp, { flex: Math.max(0.02, DISTRIBUTION.upShare) }]} />
        <View style={[s.barDown, { flex: Math.max(0.02, 1 - DISTRIBUTION.upShare) }]} />
      </View>

      {rows.map((p) => {
        const won = p.net > 0;
        return (
          <Pressable
            key={p.id}
            onPress={() => setOpen(open?.id === p.id ? null : p)}
            style={s.outcomeRow}
          >
            <Ionicons
              name={won ? 'trending-up' : 'trending-down'}
              size={15}
              color={won ? c.calm : c.inkFaint}
            />
            <View style={{ flex: 1 }}>
              <Text style={s.outcomeWho} numberOfLines={1}>{p.id}</Text>
              <Text style={s.outcomeMeta}>
                {CHARACTER[p.archetype]?.label || p.archetype} · {p.sessions} sessions · receipt {p.receipt}
              </Text>
            </View>
            <Text style={[s.outcomeNet, { color: won ? c.calm : c.inkSoft }]}>{eur(p.net)}</Text>
            <Ionicons name="chatbubble-ellipses-outline" size={14} color={c.relevance} />
          </Pressable>
        );
      })}

      {open && <OutcomeChat person={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}

/**
 * Post your own result to everyone else who is online.
 *
 * The player writes a line; they do not write the number. Whatever they say,
 * the figure their peers see is pulled from this session's live snapshot on the
 * relay — so the post is an invitation to check, not a claim to believe.
 */
function ShareResult({ sco, pred, peers, announce, posted }) {
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const net = sco.netCents / 100;

  const post = () => {
    announce(note);
    setSent(true);
    setNote('');
    setTimeout(() => setSent(false), 4000);
  };

  return (
    <Card style={{ gap: sp(2.5) }}>
      <Row>
        <Label>Post your result</Label>
        <Text style={s.hint}>
          {peers.length} {peers.length === 1 ? 'player' : 'players'} online
        </Text>
      </Row>

      <View style={s.preview}>
        <Text style={s.previewLabel}>THEY WILL SEE</Text>
        <Text style={s.previewNet}>
          {net >= 0 ? '+' : '−'}€{Math.abs(net).toFixed(2)}
        </Text>
        <Text style={s.previewMeta}>
          {sco.spins} spins · {new Set(sco.seq).size} titles · read as {pred.archetype.label}
        </Text>
      </View>

      <TextInput
        style={s.input}
        value={note}
        onChangeText={setNote}
        placeholder="Add a line (optional)"
        placeholderTextColor={c.inkFaint}
        maxLength={160}
      />

      <Btn
        title={sent ? 'Posted' : peers.length ? 'Post to everyone online' : 'Post'}
        tone={sent ? 'quiet' : 'primary'}
        // Only gated on having something to post. It used to require someone
        // else to be online, which made the button look broken when it was
        // simply early — and a post is still there for whoever connects next.
        disabled={hasNothingToShow(sco)}
        onPress={post}
      />

      {hasNothingToShow(sco) && (
        <Text style={s.hint}>
          Nothing to post yet — open a game and take a spin first.
        </Text>
      )}
      {!hasNothingToShow(sco) && peers.length === 0 && (
        <Text style={s.hint}>
          Nobody else is online right now. Post anyway and it will be waiting for the next player
          who connects, as long as this session is still open.
        </Text>
      )}

      {posted.length > 0 && (
        <Text style={s.hint}>
          You have posted {posted.length} {posted.length === 1 ? 'time' : 'times'} this session.
        </Text>
      )}

      <Note tone="quiet">
        You write the line; you do not write the number. The figure your peers see is read from
        your live session on the relay, so a post cannot claim a result that did not happen — and
        it shows a loss exactly as readily as a win.
      </Note>
    </Card>
  );
}

const hasNothingToShow = (sco) => sco.events.length === 0;

/* ----------------------------------------------------------------- profile */

export default function ProfileScreen() {
  const [profile, setProfile] = useState(() => loadProfile());
  const [view, setView] = useState('profile');
  const { sco, minutes, pred, risk, dispatch, emit } = useLantern();
  const me = loadProfile();
  const { peers, announce, myAnnouncements } = usePeers(sco.sessionId, me?.name);

  if (!profile) {
    return (
      <SignUp
        onDone={setProfile}
        onSignedIn={() => emit({ t: 'view', surface: 'profile' })}
      />
    );
  }

  const update = (patch) => setProfile(saveProfile({ ...profile, ...patch }));

  return (
    <ScrollView style={s.root} contentContainerStyle={s.wrap}>
      <Toggle
        value={view}
        onChange={setView}
        options={[{ value: 'profile', label: 'Profile' }, { value: 'compliance', label: 'Compliance' }]}
      />

      {view === 'compliance' ? (
        <View style={{ marginHorizontal: -sp(4), marginTop: -sp(2) }}>
          <MonitorScreen />
        </View>
      ) : (
        <>
          <Card style={{ gap: sp(2) }}>
            <Row>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2.5), flex: 1 }}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>{profile.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{profile.name}</Text>
                  <Text style={s.handle}>{handleFor(profile)}</Text>
                </View>
              </View>
              <StateChip state={risk.state} compact />
            </Row>
            <View style={s.metaGrid}>
              {[
                [profile.ageBand, 'age band'],
                [MARKETS.find((m) => m.value === profile.market)?.label.split(' · ')[0] ?? '—', 'market'],
                [pred.archetype.label, 'character'],
                [`${minutes.toFixed(0)}m`, 'this session'],
              ].map(([v, l]) => (
                <View key={l} style={s.metaCell}>
                  <Text style={s.metaV}>{v}</Text>
                  <Text style={s.metaL}>{l}</Text>
                </View>
              ))}
            </View>
          </Card>

          <Card style={{ gap: sp(2.5) }}>
            <Label>Your limits</Label>
            <Text style={s.hint}>
              You set these. Lantern can tighten them on its own; it will never offer to loosen
              one, and a loosening request is logged as a risk marker rather than a conversion.
            </Text>
            {[
              ['dailyDepositCents', 'Daily deposit', [2000, 5000, 10000], (v) => `€${v / 100}`],
              ['sessionMinutes', 'Session length', [30, 60, 120], (v) => `${v} min`],
              ['realityCheckMinutes', 'Reality check', [10, 15, 30], (v) => `every ${v} min`],
            ].map(([key, label, opts, fmt]) => (
              <View key={key}>
                <Text style={s.limitLabel}>{label}</Text>
                <View style={s.chips}>
                  {opts.map((o) => (
                    <Pressable
                      key={o}
                      onPress={() => update({ limits: { ...profile.limits, [key]: o } })}
                      style={[s.chip, profile.limits[key] === o && s.chipOn]}
                    >
                      <Text style={[s.chipText, profile.limits[key] === o && s.chipTextOn]}>
                        {fmt(o)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}

            <Pressable
              onPress={() => update({ contactable: !profile.contactable })}
              style={s.checkRow}
            >
              <View style={[s.check, profile.contactable && s.checkOn]}>
                {profile.contactable && <Ionicons name="checkmark" size={13} color="#04121A" />}
              </View>
              <Text style={s.checkText}>
                Let other players ask me about my published outcomes. Off by default.
              </Text>
            </Pressable>
          </Card>

          <ShareResult
            sco={sco}
            pred={pred}
            peers={peers}
            announce={announce}
            posted={myAnnouncements}
          />

          <Outcomes />

          <Card style={{ gap: sp(2) }}>
            <Label>Account</Label>
            <Btn
              title={profile.selfExcluded ? 'Self-exclusion active' : 'Self-exclude'}
              tone={profile.selfExcluded ? 'warn' : 'quiet'}
              onPress={() => {
                update({ selfExcluded: !profile.selfExcluded });
                dispatch({ type: 'setRg', rg: { selfExcluded: !profile.selfExcluded } });
              }}
            />
            <Btn
              title="Sign out"
              tone="quiet"
              onPress={() => { clearProfile(); setProfile(null); }}
            />
            <View style={s.diagRow}>
              <Ionicons
                name={peers.length ? 'wifi' : 'cloud-offline-outline'}
                size={13}
                color={peers.length ? c.calm : c.inkFaint}
              />
              <Text style={s.diag}>
                relay {relayBase()} · {peers.length} peer{peers.length === 1 ? '' : 's'} visible
              </Text>
            </View>

            <Note tone={backend().durable ? 'quiet' : 'risk'}>
              Held on this device via {backend().name}. Nothing on this screen is transmitted —
              not to the relay, not to us.
              {backend().durable
                ? ''
                : ` Durable storage is unavailable here, so this profile will not survive a reload${
                    backend().error ? ` (${backend().error})` : ''
                  }.`}
            </Note>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  wrap: { padding: sp(4), paddingBottom: sp(12), gap: sp(3) },

  brandRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  brand: { color: c.ink, fontWeight: '900', letterSpacing: 1.4, fontSize: 14 },
  h1: { ...type.h1, fontSize: 25 },
  lede: { ...type.soft, lineHeight: 19 },
  hint: { ...type.tiny, lineHeight: 15 },

  input: {
    backgroundColor: c.inset, borderRadius: radius.md, borderWidth: 1, borderColor: c.rule,
    paddingHorizontal: sp(3), paddingVertical: sp(2.5), color: c.ink, marginTop: sp(1.5),
    fontSize: 14,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2), marginTop: sp(1.5) },
  chip: {
    paddingHorizontal: sp(3), paddingVertical: sp(2), borderRadius: radius.pill,
    borderWidth: 1, borderColor: c.rule, backgroundColor: c.surface,
  },
  chipOn: { borderColor: c.relevance, backgroundColor: c.surfaceAlt },
  chipAsk: { borderColor: c.relevance },
  chipText: { ...type.tiny, color: c.inkSoft, fontWeight: '700' },
  chipTextOn: { color: c.ink },

  checkRow: { flexDirection: 'row', gap: sp(2.5), alignItems: 'flex-start' },
  check: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 1, borderColor: c.rule,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  checkOn: { backgroundColor: c.relevance, borderColor: c.relevance },
  checkText: { ...type.tiny, flex: 1, lineHeight: 16 },

  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: c.surfaceAlt,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.rule,
  },
  avatarText: { ...type.h2, color: c.relevance },
  name: { ...type.h2, fontSize: 18 },
  handle: { ...type.tiny, color: c.inkFaint },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2) },
  metaCell: { flexGrow: 1, flexBasis: '44%', backgroundColor: c.inset, borderRadius: radius.md, padding: sp(2.5) },
  metaV: { ...type.body, fontWeight: '800' },
  metaL: { ...type.tiny, marginTop: 1 },

  limitLabel: { ...type.soft, fontWeight: '700' },
  diagRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  diag: { ...type.tiny, color: c.inkFaint, flex: 1, fontSize: 9.5 },

  preview: { backgroundColor: c.inset, borderRadius: radius.md, padding: sp(3), gap: 2 },
  previewLabel: { ...type.label, fontSize: 8.5, color: c.inkFaint },
  previewNet: { ...type.h1, fontSize: 26, ...type.num },
  previewMeta: { ...type.tiny },

  truth: { ...type.body, fontWeight: '700', lineHeight: 20 },
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  barUp: { backgroundColor: c.calm },
  barDown: { backgroundColor: c.rule },

  outcomeRow: {
    flexDirection: 'row', alignItems: 'center', gap: sp(2.5),
    paddingVertical: sp(2), borderBottomWidth: 1, borderBottomColor: c.ruleSoft,
  },
  outcomeWho: { ...type.tiny, color: c.ink, fontWeight: '700' },
  outcomeMeta: { ...type.tiny, color: c.inkFaint, fontSize: 9.5 },
  outcomeNet: { ...type.body, fontWeight: '800', ...type.num, fontSize: 14 },

  chatWho: { ...type.body, fontWeight: '800' },
  receiptRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  receiptText: { ...type.tiny, color: c.calm },
  bubble: { maxWidth: '86%', borderRadius: radius.md, padding: sp(2.5) },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: c.brand },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: c.inset },
  bubbleMeText: { ...type.tiny, color: '#fff', lineHeight: 16 },
  bubbleThemText: { ...type.tiny, color: c.ink, lineHeight: 16 },
});

/**
 * The monitor — the judge-facing panel.
 *
 * Conversion and harm on the same screen (§7 of the architecture doc). This is
 * the thing the brief asks for and almost nobody builds: the guardrail is
 * scored, so it gets a first-class surface rather than an appendix.
 */

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useLantern } from '../lantern/useLantern';
import { Card, Label, Row, StateChip, Meter, Btn, Note, Toggle } from '../components/ui';
import { MARKERS } from '../lantern/risk';
import { shouldSend, TRIGGER_CLASSES, MARKETS } from '../lantern/policy';
import { c, sp, type } from '../theme';
import metrics from '../data/metrics.json';
import benchmarks from '../data/benchmarks.json';
import { download, COLUMNS } from '../lantern/logger';
import { generate, ARCHETYPES } from '../lantern/synth';

const AGE_BANDS = ['18-24', '25-34', '35-44', '45-54', '55+'];

const CANDIDATES = [
  { kind: 'fixture', copy: 'Rijeka play Saturday 15:00. Markets open Thursday.' },
  { kind: 'result', copy: 'Rijeka won 3–1 against Osijek.' },
  { kind: 'slip', copy: 'Your slip from Tuesday is still here.' },
  { kind: 'regret', copy: 'If you had backed Rijeka you would have won €100.' },
  { kind: 'loss', copy: 'Unlucky on Saturday. Here is another shot at it.' },
  { kind: 'streak', copy: 'Your 6-day streak ends in 3 hours.' },
];

export default function MonitorScreen() {
  const { risk, policy, sco, minutes, dispatch, market, shelf, log, rows } = useLantern();
  const [pick, setPick] = useState('regret');
  const [synthN, setSynthN] = useState(200);
  const [lastGen, setLastGen] = useState(null);

  const firedIds = new Set(risk.fired.map((m) => m.id));
  const candidate = CANDIDATES.find((x) => x.kind === pick);
  const verdict = shouldSend(candidate, { risk, market, hour: 14, sentThisWeek: 1 });

  const staked = sco.stakeTrace.reduce((a, b) => a + b, 0);

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: sp(12) }}>
      <View style={s.header}>
        <Text style={type.h1}>Monitor</Text>
        <Text style={type.tiny}>Conversion and harm on one screen</Text>
      </View>

      <View style={s.pad}>
        {/* ---- live session ---- */}
        <Card>
          <Row>
            <Label>This session</Label>
            <StateChip state={risk.state} score={risk.score} />
          </Row>

          <View style={{ marginTop: sp(3) }}>
            <Meter
              label="risk score"
              value={risk.score}
              tone={c.risk}
              right={risk.score.toFixed(2)}
            />
            <Meter
              label="stake vs personal typical"
              value={Math.min(6, (sco.stakeTrace.at(-1) || sco.prior.typicalStake) / sco.prior.typicalStake)}
              max={6}
              right={`${((sco.stakeTrace.at(-1) || sco.prior.typicalStake) / sco.prior.typicalStake).toFixed(1)}×`}
            />
          </View>

          <Row style={{ marginTop: sp(1) }}>
            <Text style={type.tiny}>{minutes.toFixed(0)} min</Text>
            <Text style={type.tiny}>{sco.spins} spins</Text>
            <Text style={type.tiny}>€{(staked / 100).toFixed(2)} staked</Text>
            <Text style={type.tiny}>{log.length} events</Text>
          </Row>
        </Card>

        {/* ---- 18 markers ---- */}
        <Card style={{ marginTop: sp(3) }}>
          <Label>Markers 1–18</Label>
          <View style={s.grid}>
            {MARKERS.map((m) => {
              const on = firedIds.has(m.id);
              return (
                <View key={m.id} style={[s.cell, on && s.cellOn]}>
                  <Text style={[s.cellText, on && s.cellTextOn]}>{m.id}</Text>
                </View>
              );
            })}
          </View>
          {risk.fired.length === 0 ? (
            <Text style={[type.tiny, { marginTop: sp(2) }]}>None fired.</Text>
          ) : (
            <View style={{ marginTop: sp(2), gap: sp(1) }}>
              {risk.fired.map((m) => (
                <Text key={m.id} style={s.fired}>
                  <Text style={{ fontWeight: '700' }}>{m.id} {m.name}</Text>  {m.detail}
                </Text>
              ))}
            </View>
          )}
        </Card>

        {/* ---- age routing, §7 ---- */}
        <Card style={{ marginTop: sp(3) }}>
          <Label>Age band · risk covariate only</Label>
          <Text style={[type.soft, { marginTop: sp(1.5) }]}>
            Age normalises marker thresholds and nothing else. It never reaches the relevance
            head, so changing it here cannot reorder a single shelf.
          </Text>
          <View style={s.ages}>
            {AGE_BANDS.map((b) => {
              const on = sco.prior.ageBand === b;
              return (
                <Pressable key={b} onPress={() => dispatch({ type: 'setAge', band: b })} style={[s.age, on && s.ageOn]}>
                  <Text style={[s.ageText, on && { color: c.relevance }]}>{b}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[type.tiny, { marginTop: sp(2) }]}>
            threshold sensitivity ×{risk.sensitivity.toFixed(2)} — lower fires sooner. 18–24
            carries the highest prevalence, so it gets the most conservative gate.
          </Text>
        </Card>

        {/* ---- the dashboard ---- */}
        <Card style={{ marginTop: sp(3) }}>
          <Label>Measured in FEG's own logs</Label>
          <Text style={[type.tiny, { marginTop: sp(1) }]}>
            {metrics.totalEvents.toLocaleString()} events · {metrics.players} players ·{' '}
            {metrics.sessions.toLocaleString()} sessions
          </Text>

          <View style={s.stats}>
            <Stat
              v={`${(metrics.finalStep.abandonRate * 100).toFixed(1)}%`}
              k="Final-step abandonment"
              sub={`${metrics.finalStep.abandoned} of ${metrics.finalStep.sessionsWithAdd.toLocaleString()}`}
              tone={c.risk}
            />
            <Stat
              v={metrics.discovery.rows[0]?.n.toLocaleString()}
              k="Launches via search"
              sub={`vs ${metrics.discovery.rows[1]?.n.toLocaleString()} via category rows`}
              tone={c.relevance}
            />
            <Stat
              v={`${metrics.sessionMinutes.p50}m`}
              k="Median session"
              sub={`p90 ${metrics.sessionMinutes.p90}m · p99 ${metrics.sessionMinutes.p99}m`}
            />
            <Stat
              v={shelf.kl == null ? '—' : shelf.kl.toFixed(2)}
              k="Calibration KL"
              sub={shelf.calibrated ? 'recommended vs own mix' : 'baseline arm — uncalibrated'}
              tone={c.calm}
            />
          </View>

          <Note>
            Search out-ranking every curated row is discovery friction with a number on it.
            The lobby is not helping people find things; they are working around it.
          </Note>
        </Card>

        {/* ---- notification gates ---- */}
        <Card style={{ marginTop: sp(3) }}>
          <Label>Notification policy · shouldSend()</Label>
          <View style={{ marginTop: sp(2), gap: sp(1.5) }}>
            {CANDIDATES.map((x) => {
              const on = pick === x.kind;
              const allowed = TRIGGER_CLASSES[x.kind].allowed;
              return (
                <Pressable key={x.kind} onPress={() => setPick(x.kind)} style={[s.trig, on && s.trigOn]}>
                  <Row>
                    <Text style={s.trigClass}>{TRIGGER_CLASSES[x.kind].label}</Text>
                    <Text style={[s.tag, { color: allowed ? c.calm : c.concern }]}>
                      {allowed ? 'ALLOWED' : 'BLOCKED'}
                    </Text>
                  </Row>
                  <Text style={[type.body, { marginTop: sp(1) }]}>{x.copy}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ marginTop: sp(3), borderTopWidth: 1, borderTopColor: c.ruleSoft, paddingTop: sp(3) }}>
            {verdict.gates.map((g, i) => (
              <View key={i} style={s.gate}>
                <Text style={[s.gateMark, { color: g.pass === true ? c.calm : g.pass === false ? c.concern : c.inkFaint }]}>
                  {g.pass === true ? '✓' : g.pass === false ? '✕' : '·'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.gateName}>{g.name}</Text>
                  {!!g.note && <Text style={[type.soft, { marginTop: 1 }]}>{g.note}</Text>}
                </View>
              </View>
            ))}
            <View style={[s.verdict, { borderColor: verdict.send ? c.calm : c.concern, backgroundColor: verdict.send ? c.calmBg : c.concernBg }]}>
              <Text style={{ color: verdict.send ? c.calm : c.concern, fontWeight: '800', fontSize: 12, letterSpacing: 1 }}>
                {verdict.send ? 'SEND' : 'DO NOT SEND'}
              </Text>
            </View>
          </View>
        </Card>

        {/* ---- market ---- */}
        <Card style={{ marginTop: sp(3) }}>
          <Label>Market policy</Label>
          <Text style={[type.soft, { marginTop: sp(1.5) }]}>
            Six markets, six regulators. The model ships once; this is a config file.
          </Text>
          <View style={s.ages}>
            {Object.entries(MARKETS).map(([k, m]) => {
              const on = market === k;
              return (
                <Pressable key={k} onPress={() => dispatch({ type: 'setMarket', market: k })} style={[s.age, on && s.ageOn]}>
                  <Text style={[s.ageText, on && { color: c.relevance }]}>{k.toUpperCase()}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[type.tiny, { marginTop: sp(2) }]}>
            {policy.market?.name} · {policy.market?.maxSendsPerWeek} sends/week ·{' '}
            reward surfaces {policy.market?.rewardSurfaces ? 'permitted' : 'not permitted'}
          </Text>
        </Card>

        {/* ---- training log capture ---- */}
        <Card style={{ marginTop: sp(3) }}>
          <Row>
            <Label>Training log</Label>
            <Text style={[type.tiny, type.num, { color: c.relevance, fontWeight: '800' }]}>
              {rows.length.toLocaleString()} rows
            </Text>
          </Row>
          <Text style={[type.soft, { marginTop: sp(1.5) }]}>
            Every interaction is written in FEG's own 24-column schema — same names, same
            order, same null convention as top_casino_users_event_logs.csv. Rows exported here
            concatenate onto that file with no mapping step.
          </Text>

          <View style={s.schema}>
            {COLUMNS.slice(0, 8).map((k) => (
              <Text key={k} style={s.col}>{k}</Text>
            ))}
            <Text style={[s.col, { color: c.inkFaint }]}>+{COLUMNS.length - 8} more</Text>
          </View>

          {rows.length > 0 && (
            <View style={s.preview}>
              <Text style={s.previewHead}>most recent</Text>
              {rows.slice(-3).reverse().map((r, i) => (
                <Text key={i} style={s.previewRow} numberOfLines={1}>
                  {r.event_name} · {r.timestamp.slice(11, 19)} · {r.from_origin}/{r.from_route}
                  {r.game_name !== 'null' ? ' · ' + r.game_name : ''}
                </Text>
              ))}
            </View>
          )}

          <Row style={{ marginTop: sp(3), gap: sp(2) }}>
            <Btn
              title="Export CSV"
              icon="download-outline"
              tone="accent"
              disabled={rows.length === 0}
              onPress={() => download(rows, `lantern_logs_${Date.now()}.csv`)}
              style={{ flex: 1 }}
            />
            <Btn title="Clear" tone="quiet" onPress={() => dispatch({ type: 'clearRows' })} style={{ flex: 1 }} />
          </Row>

          <View style={{ marginTop: sp(4), borderTopWidth: 1, borderTopColor: c.ruleSoft, paddingTop: sp(3) }}>
            <Label>Top up with synthetic sessions</Label>
            <Text style={[type.soft, { marginTop: sp(1.5) }]}>
              A demo produces a few hundred rows; training wants tens of thousands. These come
              from four planted archetypes, so "the model recovers the planted structure" is a
              claim that can actually be checked.
            </Text>

            <View style={{ marginTop: sp(2.5), gap: sp(1.5) }}>
              {Object.entries(ARCHETYPES).map(([k, a]) => (
                <Text key={k} style={s.arch}>
                  <Text style={{ fontWeight: '800', color: c.ink }}>{a.label}</Text>  {a.note}
                </Text>
              ))}
            </View>

            <View style={s.ages}>
              {[200, 1000, 5000].map((n) => (
                <Pressable key={n} onPress={() => setSynthN(n)} style={[s.age, synthN === n && s.ageOn]}>
                  <Text style={[s.ageText, synthN === n && { color: c.relevance }]}>
                    {n.toLocaleString()} sessions
                  </Text>
                </Pressable>
              ))}
            </View>

            <Btn
              title={`Generate ${synthN.toLocaleString()} sessions`}
              icon="construct-outline"
              onPress={() => {
                const out = generate({ sessions: synthN, seed: Date.now() >>> 0 });
                dispatch({ type: 'addRows', rows: out.rows });
                setLastGen({ ...out.summary, rows: out.rows.length });
              }}
              style={{ marginTop: sp(3) }}
            />

            {lastGen && (
              <Text style={[type.tiny, { marginTop: sp(2) }]}>
                +{lastGen.rows.toLocaleString()} rows · browser {lastGen.browser} · returner{' '}
                {lastGen.returner} · specialist {lastGen.specialist} · chaser {lastGen.chaser}.
                Abandon rate is planted at the measured 21.6%.
              </Text>
            )}
          </View>

          <Note>
            Nothing leaves the device on its own. The CSV is produced only when Export is
            pressed, so the on-device promise holds even though the file is for training.
          </Note>
        </Card>

        {/* ---- group benchmarks: the divergence that makes the case ---- */}
        <Card style={{ marginTop: sp(3) }}>
          <Label>FEG group benchmarks · Sep 2025 → Aug 2026</Label>
          <Text style={[type.soft, { marginTop: sp(1.5) }]}>
            From hackathon_casino_trends.xlsx. Two markets grew value per session by taking
            more from fewer returning players. Two grew both.
          </Text>

          <View style={{ marginTop: sp(3), gap: sp(1.5) }}>
            {MARKET_TREND.map((m) => (
              <View key={m.market} style={s.trend}>
                <Text style={s.trendName}>{m.market}</Text>
                <View style={s.trendBars}>
                  <Delta label="stake/session" pct={m.stake} good />
                  <Delta label="sessions/player" pct={m.sessions} />
                </View>
              </View>
            ))}
          </View>

          <Note tone="risk">
            "Value per Session" is a listed metric. Optimise it alone and you get the CASA and
            RO shape — revenue concentrating into fewer, heavier sessions. The brief scores on
            D30/D90 survival, which is the other column.
          </Note>
        </Card>

        <Btn title="Reset session" tone="quiet" onPress={() => dispatch({ type: 'reset' })} style={{ marginTop: sp(4) }} />

        <Text style={[type.tiny, { marginTop: sp(4), lineHeight: 16 }]}>
          Catalogue, sections, sports and every figure above are extracted from
          top_casino_users_event_logs.csv by Solution/scripts/extract-data.mjs. The live session
          is yours, generated by tapping through this build. No synthetic player data is
          presented as real.
        </Text>
      </View>
    </ScrollView>
  );
}

/** First and last month per market, as percentage change. */
const MARKET_TREND = (() => {
  const by = {};
  for (const r of benchmarks) (by[r.market] = by[r.market] || []).push(r);
  return Object.entries(by).map(([market, rs]) => {
    const a = rs[0], z = rs[rs.length - 1];
    const pc = (x, y) => Math.round(((y - x) / x) * 100);
    return {
      market,
      stake: pc(a.stakePerSession, z.stakePerSession),
      sessions: pc(a.sessionsPerPlayer, z.sessionsPerPlayer),
    };
  }).sort((x, y) => x.sessions - y.sessions);
})();

function Delta({ label, pct }) {
  const up = pct >= 0;
  return (
    <View style={{ flex: 1 }}>
      <Text style={[s.deltaV, { color: up ? c.calm : c.concern }]}>
        {up ? '+' : ''}{pct}%
      </Text>
      <Text style={s.deltaK}>{label}</Text>
    </View>
  );
}

function Stat({ v, k, sub, tone = c.ink }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statV, { color: tone }]}>{v}</Text>
      <Text style={s.statK}>{k}</Text>
      {!!sub && <Text style={type.tiny}>{sub}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    paddingHorizontal: sp(4), paddingTop: sp(3), paddingBottom: sp(4),
    borderBottomWidth: 1, borderBottomColor: c.rule, gap: sp(1),
  },
  pad: { paddingHorizontal: sp(4), marginTop: sp(4) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1.5), marginTop: sp(2.5) },
  cell: {
    width: 34, height: 30, borderRadius: 4, borderWidth: 1, borderColor: c.rule,
    backgroundColor: c.inset, alignItems: 'center', justifyContent: 'center',
  },
  cellOn: { backgroundColor: c.risk, borderColor: c.risk },
  cellText: { fontSize: 11, color: c.inkFaint, fontWeight: '600' },
  cellTextOn: { color: c.bg, fontWeight: '800' },
  fired: { fontSize: 11, color: c.risk, lineHeight: 16 },
  ages: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1.5), marginTop: sp(2.5) },
  age: {
    borderWidth: 1, borderColor: c.rule, borderRadius: 20,
    paddingHorizontal: sp(2.5), paddingVertical: sp(1.25),
  },
  ageOn: { borderColor: c.relevance, backgroundColor: c.surfaceAlt },
  ageText: { fontSize: 11, color: c.inkSoft, fontWeight: '600' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', marginTop: sp(3) },
  stat: { width: '50%', paddingVertical: sp(2), paddingRight: sp(2) },
  statV: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  statK: { fontSize: 11, color: c.inkSoft, fontWeight: '600', marginTop: 1 },
  trig: {
    borderWidth: 1, borderColor: c.rule, borderRadius: 6,
    padding: sp(2.5), backgroundColor: c.inset,
  },
  trigOn: { borderColor: c.relevance },
  trigClass: { fontSize: 10, color: c.inkFaint, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: '700' },
  tag: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  gate: { flexDirection: 'row', gap: sp(2.5), paddingVertical: sp(1.5) },
  gateMark: { width: 14, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  gateName: { fontSize: 12, color: c.ink, fontWeight: '600' },
  verdict: {
    marginTop: sp(2.5), borderWidth: 1, borderRadius: 4,
    paddingVertical: sp(2), paddingHorizontal: sp(3), alignItems: 'center',
  },
  trend: {
    flexDirection: 'row', alignItems: 'center', gap: sp(3),
    backgroundColor: c.inset, borderRadius: 6, padding: sp(2.5),
  },
  trendName: { width: 52, fontSize: 12, fontWeight: '900', color: c.ink },
  trendBars: { flex: 1, flexDirection: 'row', gap: sp(3) },
  deltaV: { fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  deltaK: { fontSize: 9.5, color: c.inkFaint, marginTop: 1 },
  schema: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(1.5), marginTop: sp(2.5) },
  col: {
    fontSize: 9.5, color: c.inkSoft, backgroundColor: c.inset,
    paddingHorizontal: sp(1.5), paddingVertical: 2, borderRadius: 3,
  },
  preview: { marginTop: sp(2.5), backgroundColor: c.inset, borderRadius: 6, padding: sp(2.5) },
  previewHead: { ...type.label, fontSize: 9, marginBottom: sp(1) },
  previewRow: { fontSize: 10, color: c.inkSoft, lineHeight: 15 },
  arch: { fontSize: 11.5, color: c.inkSoft, lineHeight: 16 },
});

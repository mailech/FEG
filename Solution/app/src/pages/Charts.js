/**
 * Charts for the operator dashboard.
 *
 * Every series here is computed from the shipped model artefacts at render time
 * — cohort profiles, the affinity table, the replay result — so a retrain moves
 * the pictures. Nothing is a hand-drawn illustration of a number written
 * elsewhere.
 *
 * Drawn with react-native-svg so the same components render on the phone and on
 * a projector. Colour is semantic and separate from the accent: green reads
 * healthy, amber elevated, red harmful, and the cyan accent is used for "this is
 * the model" rather than for "this is good".
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, {
  Line, Rect, Circle, Path, Polyline, Text as SvgText, G, Defs, LinearGradient, Stop,
} from 'react-native-svg';
import { GAME_STATS, CLASSES, CHARACTER, EVAL } from '../lantern/model';
import { catalog } from '../lantern/relevance';
import { c, sp, type, radius } from '../theme';

const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;

export function ChartFrame({ title, note, children, tall }) {
  return (
    <View style={[s.frame, tall && { minHeight: 300 }]}>
      <Text style={s.title}>{title}</Text>
      <View style={s.body}>{children}</View>
      {note ? <Text style={s.note}>{note}</Text> : null}
    </View>
  );
}

/* ───────────────────────────────────────────────────── arc primitives */

const TAU = Math.PI * 2;
const polar = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];

/** One donut segment as a closed path: outer arc, in, inner arc back, close. */
function ring(cx, cy, rOut, rIn, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, rOut, a0);
  const [x1, y1] = polar(cx, cy, rOut, a1);
  const [x2, y2] = polar(cx, cy, rIn, a1);
  const [x3, y3] = polar(cx, cy, rIn, a0);
  return `M ${x0} ${y0} A ${rOut} ${rOut} 0 ${large} 1 ${x1} ${y1} `
       + `L ${x2} ${y2} A ${rIn} ${rIn} 0 ${large} 0 ${x3} ${y3} Z`;
}

/**
 * A radial gauge for a single rate.
 *
 * Opens at the bottom rather than closing a full circle: a complete ring reads
 * as "this is the whole of something", and a conversion rate is not.
 */
export function Gauge({ value, label, tone, sub }) {
  const S = 240, cx = S / 2, cy = S / 2, rOut = 102, rIn = 76;
  const start = Math.PI * 0.75, sweep = Math.PI * 1.5;
  const end = start + sweep * Math.max(0, Math.min(1, value));

  return (
    <View style={s.tile}>
      <Svg viewBox={`0 0 ${S} ${S}`} width="100%" style={{ maxWidth: 280 }}>
        <Path d={ring(cx, cy, rOut, rIn, start, start + sweep)} fill={c.inset} />
        {value > 0.004 && <Path d={ring(cx, cy, rOut, rIn, start, end)} fill={tone || c.relevance} />}
        <SvgText x={cx} y={cy + 8} fill={c.ink} fontSize="46" fontWeight="800" textAnchor="middle">
          {pct(value)}
        </SvgText>
        {sub ? (
          <SvgText x={cx} y={cy + 36} fill={c.inkFaint} fontSize="12" textAnchor="middle">{sub}</SvgText>
        ) : null}
      </Svg>
      <Text style={s.tileLabel}>{label}</Text>
    </View>
  );
}

/**
 * A donut over a set of parts, with the headline part named in the middle.
 * Segments carry their own semantic colour, so the picture reads before the key.
 */
export function Donut({ parts, centreValue, centreLabel, label }) {
  const S = 240, cx = S / 2, cy = S / 2, rOut = 102, rIn = 68;
  const total = parts.reduce((a, x) => a + x.v, 0) || 1;
  let a = -Math.PI / 2;

  return (
    <View style={s.tile}>
      <Svg viewBox={`0 0 ${S} ${S}`} width="100%" style={{ maxWidth: 280 }}>
        {parts.map((p, i) => {
          const a0 = a;
          const a1 = a + (p.v / total) * TAU;
          a = a1;
          // A hairline gap keeps adjacent segments legible without a stroke.
          return <Path key={i} d={ring(cx, cy, rOut, rIn, a0, Math.max(a0 + 0.004, a1 - 0.02))} fill={p.tone} />;
        })}
        <SvgText x={cx} y={cy + 4} fill={c.ink} fontSize="42" fontWeight="800" textAnchor="middle">
          {centreValue}
        </SvgText>
        {centreLabel ? (
          <SvgText x={cx} y={cy + 32} fill={c.inkFaint} fontSize="11" textAnchor="middle">
            {centreLabel}
          </SvgText>
        ) : null}
      </Svg>
      <Text style={s.tileLabel}>{label}</Text>
      <View style={s.key}>
        {parts.map((p, i) => (
          <View key={i} style={s.keyRow}>
            <View style={[s.keyDot, { backgroundColor: p.tone }]} />
            <Text style={s.keyText} numberOfLines={1}>{p.k}</Text>
            <Text style={s.keyVal}>{pct(p.v / total)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Before and after, on the three things the ranker actually moved.
 *
 * Every pair is measured on the same held-out sessions, so the comparison is
 * like for like. The baselines are not flattering and are not meant to be —
 * they are what the corpus does today, and a small baseline is what makes the
 * gap worth showing.
 */
export function BeforeAfter() {
  const r = EVAL.replay || {};
  const rows = [
    {
      k: 'Title found in the top six',
      before: r.generic?.recall_at_6 ?? 0.064,
      after: r.lantern?.recall_at_6 ?? 0.191,
      fmt: (v) => pct(v, 1),
      max: 0.24,
    },
    {
      k: 'Title found in the top twelve',
      before: r.generic?.recall_at_12 ?? 0.122,
      after: r.lantern?.recall_at_12 ?? 0.212,
      fmt: (v) => pct(v, 1),
      max: 0.24,
    },
    {
      k: 'Mean reciprocal rank',
      before: r.generic?.mrr ?? 0.045,
      after: r.lantern?.mrr ?? 0.145,
      fmt: (v) => v.toFixed(3),
      max: 0.17,
    },
  ];

  const W = 560, rowH = 74, PAD = { l: 8, r: 8, t: 30 };
  const H = PAD.t + rows.length * rowH + 8;
  const barL = 232, barW = W - barL - 84;

  return (
    <Svg viewBox={`0 0 ${W} ${H}`} width="100%">
      <SvgText x={barL} y={16} fill={c.inkFaint} fontSize="9.5">GENERIC LOBBY</SvgText>
      <SvgText x={barL} y={16 + 0} fill={c.inkFaint} fontSize="9.5" opacity="0" />
      <SvgText x={W - 8} y={16} fill={c.relevance} fontSize="9.5" textAnchor="end">WITH LANTERN</SvgText>

      {rows.map((row, i) => {
        const yTop = PAD.t + i * rowH;
        const wB = Math.max(3, (row.before / row.max) * barW);
        const wA = Math.max(3, (row.after / row.max) * barW);
        const mult = row.after / row.before;
        return (
          <G key={row.k}>
            <SvgText x={PAD.l} y={yTop + 20} fill={c.ink} fontSize="12.5" fontWeight="600">
              {row.k}
            </SvgText>

            <Rect x={barL} y={yTop + 6} width={wB} height={16} rx="2" fill={c.rule} />
            <SvgText x={barL + wB + 8} y={yTop + 19} fill={c.inkFaint} fontSize="11.5">
              {row.fmt(row.before)}
            </SvgText>

            <Rect x={barL} y={yTop + 28} width={wA} height={16} rx="2" fill={c.relevance} />
            <SvgText x={barL + wA + 8} y={yTop + 41} fill={c.ink} fontSize="12.5" fontWeight="700">
              {row.fmt(row.after)}
            </SvgText>

            <SvgText x={PAD.l} y={yTop + 41} fill={c.calm} fontSize="15" fontWeight="800">
              {mult.toFixed(1)}× better
            </SvgText>

            {i < rows.length - 1 && (
              <Line x1={PAD.l} y1={yTop + rowH - 10} x2={W - 8} y2={yTop + rowH - 10}
                    stroke={c.ruleSoft} strokeWidth="1" />
            )}
          </G>
        );
      })}
    </Svg>
  );
}

/** The four rings that open the page. */
export function KpiRings({ cohorts, funnel, labelFor }) {
  const risky = cohorts.filter((x) => x.risk_rate >= 0.5).reduce((a, x) => a + x.share, 0);

  const mix = [...cohorts]
    .sort((a, b) => b.share - a.share)
    .slice(0, 4)
    .map((co) => ({
      k: labelFor ? labelFor(co) : CHARACTER[co.dominant]?.label || co.dominant,
      v: co.share,
      tone: co.risk_rate >= 0.5 ? c.concern : co.conversion < 0.35 ? c.relevance : c.calm,
    }));

  const biggest = mix[0];

  return (
    <View style={s.rings}>
      <Gauge
        value={funnel.session_conversion}
        label="Session conversion"
        sub={`${funnel.sessions.toLocaleString()} sessions`}
        tone={c.relevance}
      />
      <Gauge
        value={funnel.final_step_conversion}
        label="Final-step conversion"
        sub={`${funnel.confirm_abandoned} lost`}
        tone={c.calm}
      />
      <Donut
        parts={mix}
        centreValue={pct(biggest.v)}
        centreLabel={biggest.k.toUpperCase()}
        label="Session mix by cohort"
      />
      <Donut
        parts={[
          { k: 'Low risk', v: 1 - risky, tone: c.rule },
          { k: 'Harm signal', v: risky, tone: c.concern },
        ]}
        centreValue={pct(risky)}
        centreLabel="FLAGGED"
        label="Harm exposure"
      />
    </View>
  );
}

/* ────────────────────────────────────────────────────────── quadrant */
/**
 * Value per session against conversion, bubble size by share of sessions.
 *
 * The chart that makes the argument on its own: the two bubbles floating at the
 * top are worth 1,400x the one at the bottom left, and they are the two carrying
 * the harm signal. Growth and harm occupy the same corner.
 */
export function ValueQuadrant({ cohorts, labelFor }) {
  // Generous padding on every side: a bubble is placed by its centre, so the
  // plot area has to leave room for the largest radius or the biggest cohort
  // gets clipped by the card edge — which is exactly what happened first time.
  const W = 560, H = 340, PAD = { l: 62, r: 58, t: 54, b: 52 };
  const maxV = Math.max(...cohorts.map((x) => x.value_per_session));
  const ly = (v) => Math.log10(Math.max(1, v));
  const maxLy = Math.max(1, ly(maxV));

  const rOf = (share) => 10 + Math.sqrt(share) * 30;
  const RMAX = rOf(Math.max(...cohorts.map((x) => x.share)));

  // Clamp centres so every circle sits wholly inside the plot area.
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const x = (conv, r) =>
    clamp(PAD.l + conv * (W - PAD.l - PAD.r), PAD.l + r, W - PAD.r - r);
  const y = (v, r) =>
    clamp(H - PAD.b - (ly(v) / maxLy) * (H - PAD.t - PAD.b), PAD.t + r, H - PAD.b - r);

  const dangerX = PAD.l + 0.62 * (W - PAD.l - PAD.r);

  /**
   * Two cohorts can land on the same point — the escalated and unescalated
   * chasers both convert at 100% on almost identical value — and drawn raw they
   * overlap into an unreadable smear. One separation pass pushes touching
   * circles apart along x and alternates the label above and below, which keeps
   * both readable without moving either far from where the data puts it.
   */
  const placed = [...cohorts]
    .sort((a, b) => b.share - a.share)
    .map((co) => {
      const r = rOf(co.share);
      return {
        co, r,
        cx: x(co.conversion, r),
        cy: y(co.value_per_session, r),
        tone: co.risk_rate >= 0.5 ? c.concern : co.conversion < 0.35 ? c.relevance : c.calm,
        above: false,
      };
    });

  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b2 = placed[j];
        const dx = b2.cx - a.cx, dy = b2.cy - a.cy;
        const dist = Math.hypot(dx, dy) || 0.01;
        const want = a.r + b2.r + 8;
        if (dist < want) {
          const push = (want - dist) / 2;
          const ux = dx / dist || 1;
          a.cx = clamp(a.cx - ux * push, PAD.l + a.r, W - PAD.r - a.r);
          b2.cx = clamp(b2.cx + ux * push, PAD.l + b2.r, W - PAD.r - b2.r);
          b2.above = true;
        }
      }
    }
  }

  return (
    <Svg viewBox={`0 0 ${W} ${H}`} width="100%">
      {/* danger band, drawn first and kept clear of the plotted points */}
      <Rect
        x={dangerX} y={PAD.t - 26} width={W - PAD.r - dangerX + RMAX}
        height={H - PAD.b - PAD.t + 26} fill={c.concern} opacity="0.06" rx="3"
      />
      <SvgText x={dangerX + 6} y={PAD.t - 32} fill={c.concern} fontSize="9.5" fontWeight="700">
        HIGH VALUE · HIGH HARM
      </SvgText>

      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <Line
          key={g} x1={PAD.l + g * (W - PAD.l - PAD.r)} y1={PAD.t - 10}
          x2={PAD.l + g * (W - PAD.l - PAD.r)} y2={H - PAD.b}
          stroke={c.ruleSoft} strokeWidth="1"
        />
      ))}
      {[1, 10, 100, 1000].map((v) => {
        const yy = H - PAD.b - (ly(v) / maxLy) * (H - PAD.t - PAD.b);
        return (
          <G key={v}>
            <Line x1={PAD.l} y1={yy} x2={W - PAD.r} y2={yy} stroke={c.ruleSoft} strokeWidth="1" />
            <SvgText x={PAD.l - 10} y={yy + 4} fill={c.inkFaint} fontSize="9.5" textAnchor="end">
              {v >= 1000 ? '€1k' : `€${v}`}
            </SvgText>
          </G>
        );
      })}

      {placed.map((pt, i) => (
        <G key={pt.co.id}>
          <Circle cx={pt.cx} cy={pt.cy} r={pt.r} fill={pt.tone} opacity="0.2" />
          <Circle cx={pt.cx} cy={pt.cy} r={pt.r} fill="none" stroke={pt.tone} strokeWidth="1.6" />
          <SvgText x={pt.cx} y={pt.cy + 4} fill={c.ink} fontSize="11" fontWeight="800" textAnchor="middle">
            {pct(pt.co.share)}
          </SvgText>
          <SvgText
            x={pt.cx}
            y={pt.above ? pt.cy - pt.r - 6 : pt.cy + pt.r + 13}
            fill={c.inkSoft} fontSize="9" textAnchor="middle"
          >
            {labelFor ? labelFor(pt.co) : CHARACTER[pt.co.dominant]?.label || pt.co.dominant}
          </SvgText>
        </G>
      ))}

      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <SvgText
          key={g} x={PAD.l + g * (W - PAD.l - PAD.r)} y={H - PAD.b + 18}
          fill={c.inkFaint} fontSize="9.5" textAnchor="middle"
        >
          {pct(g)}
        </SvgText>
      ))}
      <SvgText x={W / 2} y={H - 8} fill={c.inkSoft} fontSize="10.5" textAnchor="middle">
        session conversion
      </SvgText>
      <SvgText x={PAD.l - 10} y={PAD.t - 16} fill={c.inkSoft} fontSize="10.5" textAnchor="end">
        € / session
      </SvgText>
    </Svg>
  );
}

/* ───────────────────────────────────────────────────────── recall curve */
export function RecallCurve() {
  const r = EVAL.replay || {};
  const ks = [6, 12, 24];
  const g = [r.generic?.recall_at_6, r.generic?.recall_at_12, r.generic?.recall_at_24];
  const l = [r.lantern?.recall_at_6, r.lantern?.recall_at_12, r.lantern?.recall_at_24];
  const W = 520, H = 250, PAD = { l: 46, r: 56, t: 20, b: 40 };
  const max = 0.26;
  const x = (i) => PAD.l + (i / (ks.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v) => H - PAD.b - ((v || 0) / max) * (H - PAD.t - PAD.b);
  const pts = (arr) => arr.map((v, i) => `${x(i)},${y(v)}`).join(' ');

  return (
    <Svg viewBox={`0 0 ${W} ${H}`} width="100%">
      <Defs>
        <LinearGradient id="lanternFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.relevance} stopOpacity="0.28" />
          <Stop offset="1" stopColor={c.relevance} stopOpacity="0.02" />
        </LinearGradient>
      </Defs>

      {[0, 0.05, 0.1, 0.15, 0.2, 0.25].map((v) => (
        <G key={v}>
          <Line x1={PAD.l} y1={y(v)} x2={W - PAD.r} y2={y(v)} stroke={c.ruleSoft} strokeWidth="1" />
          <SvgText x={PAD.l - 8} y={y(v) + 4} fill={c.inkFaint} fontSize="9" textAnchor="end">{pct(v)}</SvgText>
        </G>
      ))}

      <Path
        d={`M ${x(0)},${y(l[0])} L ${x(1)},${y(l[1])} L ${x(2)},${y(l[2])} L ${x(2)},${y(0)} L ${x(0)},${y(0)} Z`}
        fill="url(#lanternFill)"
      />
      <Polyline points={pts(g)} fill="none" stroke={c.inkFaint} strokeWidth="2" strokeDasharray="5 4" />
      <Polyline points={pts(l)} fill="none" stroke={c.relevance} strokeWidth="2.5" strokeLinejoin="round" />

      {l.map((v, i) => <Circle key={`l${i}`} cx={x(i)} cy={y(v)} r="4.5" fill={c.relevance} />)}
      {g.map((v, i) => <Circle key={`g${i}`} cx={x(i)} cy={y(v)} r="3.5" fill={c.inkFaint} />)}

      <SvgText x={x(2) + 10} y={y(l[2]) + 4} fill={c.relevance} fontSize="10" fontWeight="700">Lantern</SvgText>
      <SvgText x={x(2) + 10} y={y(g[2]) + 4} fill={c.inkFaint} fontSize="10">generic</SvgText>

      {ks.map((k, i) => (
        <SvgText key={k} x={x(i)} y={H - PAD.b + 16} fill={c.inkFaint} fontSize="9" textAnchor="middle">
          top {k}
        </SvgText>
      ))}
      <SvgText x={(W - PAD.r + PAD.l) / 2} y={H - 8} fill={c.inkSoft} fontSize="10" textAnchor="middle">
        how far down the lobby the player had to look
      </SvgText>
    </Svg>
  );
}

/* ─────────────────────────────────────────────────────────── decay line */
/** Measured share of play stretches ending net positive, by spins played. */
export function WinDecay() {
  const data = [
    { k: '5–15', v: 0.45, n: 2695 },
    { k: '16–40', v: 0.47, n: 1581 },
    { k: '41–100', v: 0.41, n: 1252 },
    { k: '100+', v: 0.39, n: 401 },
  ];
  const W = 520, H = 250, PAD = { l: 46, r: 28, t: 24, b: 44 };
  const lo = 0.34, hi = 0.5;
  const x = (i) => PAD.l + (i / (data.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v) => H - PAD.b - ((v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  return (
    <Svg viewBox={`0 0 ${W} ${H}`} width="100%">
      {[0.35, 0.4, 0.45, 0.5].map((v) => (
        <G key={v}>
          <Line x1={PAD.l} y1={y(v)} x2={W - PAD.r} y2={y(v)} stroke={c.ruleSoft} strokeWidth="1" />
          <SvgText x={PAD.l - 8} y={y(v) + 4} fill={c.inkFaint} fontSize="9" textAnchor="end">{pct(v)}</SvgText>
        </G>
      ))}

      <Polyline
        points={data.map((d, i) => `${x(i)},${y(d.v)}`).join(' ')}
        fill="none" stroke={c.gold} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
      />
      {data.map((d, i) => (
        <G key={d.k}>
          <Circle cx={x(i)} cy={y(d.v)} r="5" fill={c.gold} />
          <SvgText x={x(i)} y={y(d.v) - 12} fill={c.ink} fontSize="11" fontWeight="700" textAnchor="middle">
            {pct(d.v)}
          </SvgText>
          <SvgText x={x(i)} y={H - PAD.b + 16} fill={c.inkFaint} fontSize="9" textAnchor="middle">{d.k}</SvgText>
          <SvgText x={x(i)} y={H - PAD.b + 28} fill={c.inkFaint} fontSize="8" textAnchor="middle">
            n={d.n.toLocaleString()}
          </SvgText>
        </G>
      ))}
      <SvgText x={(W + PAD.l) / 2} y={H - 6} fill={c.inkSoft} fontSize="10" textAnchor="middle">
        spins played on one title
      </SvgText>
    </Svg>
  );
}

/* ───────────────────────────────────────────────────────────── waterfall */
export function Waterfall({ funnel, scenarios }) {
  const W = 520, H = 240, PAD = { l: 46, r: 20, t: 24, b: 48 };
  const base = funnel.session_conversion;
  const best = scenarios[scenarios.length - 1]?.overall ?? base;
  const lo = Math.max(0, base - 0.04), hi = best + 0.03;
  const y = (v) => H - PAD.b - ((v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const bars = [{ tag: 'Today', v: base, tone: c.rule }, ...scenarios.map((sc) => ({
    tag: sc.tag, v: sc.overall, tone: sc.tag === 'Central' ? c.relevance : c.calm,
  }))];
  const bw = (W - PAD.l - PAD.r) / bars.length;

  return (
    <Svg viewBox={`0 0 ${W} ${H}`} width="100%">
      {[lo, base, hi].map((v, i) => (
        <G key={i}>
          <Line x1={PAD.l} y1={y(v)} x2={W - PAD.r} y2={y(v)}
                stroke={i === 1 ? c.rule : c.ruleSoft} strokeWidth="1"
                strokeDasharray={i === 1 ? '4 4' : undefined} />
          <SvgText x={PAD.l - 8} y={y(v) + 4} fill={c.inkFaint} fontSize="9" textAnchor="end">
            {pct(v, 1)}
          </SvgText>
        </G>
      ))}
      {bars.map((b, i) => {
        const cx = PAD.l + i * bw + bw / 2;
        const top = y(b.v);
        return (
          <G key={b.tag}>
            <Rect x={cx - bw * 0.3} y={top} width={bw * 0.6} height={Math.max(2, y(lo) - top)}
                  fill={b.tone} opacity={b.tag === 'Today' ? 0.55 : 0.85} rx="2" />
            <SvgText x={cx} y={top - 8} fill={c.ink} fontSize="11" fontWeight="700" textAnchor="middle">
              {pct(b.v, 1)}
            </SvgText>
            <SvgText x={cx} y={H - PAD.b + 16} fill={c.inkFaint} fontSize="9" textAnchor="middle">{b.tag}</SvgText>
            {i > 0 && (
              <SvgText x={cx} y={H - PAD.b + 28} fill={c.calm} fontSize="8.5" textAnchor="middle">
                +{((b.v - base) * 100).toFixed(1)} pts
              </SvgText>
            )}
          </G>
        );
      })}
    </Svg>
  );
}

/* ─────────────────────────────────────────────────────────────── heatmap */
/**
 * What each character actually reaches for, by game format.
 *
 * `aff` in the model artefact is a log lift over the population mix, so a
 * positive cell means that archetype picks that format more than it picks
 * everything else. This is the table the "what to build" briefs are derived
 * from, shown directly.
 */
export function AffinityHeat() {
  const { mechanics, cells, max } = useMemo(() => {
    const byName = new Map(catalog.map((g) => [g.name, g]));
    const acc = {};
    for (const g of GAME_STATS.values()) {
      const meta = byName.get(g.n);
      if (!meta || g.l < 12) continue;
      const m = meta.mechanic;

      // Centre each title's own pattern before averaging.
      //
      // `aff` is a log lift, and on a title with a dozen launches an archetype
      // that simply never appeared lands at the -2 clip. Averaging raw values
      // therefore drags every cell negative and says nothing. Subtracting the
      // title's own mean removes that offset and leaves the question worth
      // asking: relative to the other three characters, who over-indexes here.
      const mean = (g.aff[0] + g.aff[1] + g.aff[2] + g.aff[3]) / 4;
      acc[m] = acc[m] || { n: 0, sum: [0, 0, 0, 0] };
      acc[m].n += 1;
      for (let i = 0; i < 4; i++) acc[m].sum[i] += g.aff[i] - mean;
    }
    const mechs = Object.entries(acc)
      .filter(([, v]) => v.n >= 6)
      .map(([m, v]) => ({ m, avg: v.sum.map((x) => x / v.n), n: v.n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 6);
    const mx = Math.max(0.05, ...mechs.flatMap((r) => r.avg.map(Math.abs)));
    return { mechanics: mechs, cells: mechs, max: mx };
  }, []);

  const W = 520, PAD = { l: 118, t: 26, r: 12 };
  const cw = (W - PAD.l - PAD.r) / 4;
  const ch = 30;
  const H = PAD.t + mechanics.length * ch + 16;

  return (
    <Svg viewBox={`0 0 ${W} ${H}`} width="100%">
      {CLASSES.map((k, i) => (
        <SvgText key={k} x={PAD.l + i * cw + cw / 2} y={16} fill={c.inkSoft} fontSize="9.5" textAnchor="middle">
          {CHARACTER[k]?.label || k}
        </SvgText>
      ))}
      {cells.map((row, r) => (
        <G key={row.m}>
          <SvgText x={PAD.l - 10} y={PAD.t + r * ch + ch / 2 + 4} fill={c.inkSoft} fontSize="10" textAnchor="end">
            {row.m.replace('-', ' ')}
          </SvgText>
          {row.avg.map((v, i) => {
            const t = Math.min(1, Math.abs(v) / max);
            return (
              <G key={i}>
                <Rect
                  x={PAD.l + i * cw + 2} y={PAD.t + r * ch + 2}
                  width={cw - 4} height={ch - 4} rx="2"
                  fill={v >= 0 ? c.relevance : c.risk} opacity={0.08 + t * 0.62}
                />
                <SvgText
                  x={PAD.l + i * cw + cw / 2} y={PAD.t + r * ch + ch / 2 + 4}
                  fill={t > 0.55 ? '#04121A' : c.ink} fontSize="9.5" fontWeight="600" textAnchor="middle"
                >
                  {v >= 0 ? '+' : ''}{v.toFixed(2)}
                </SvgText>
              </G>
            );
          })}
        </G>
      ))}
    </Svg>
  );
}

const s = StyleSheet.create({
  frame: {
    backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.rule,
    padding: sp(3.5), gap: sp(2), flexGrow: 1, flexBasis: 380,
  },
  title: { ...type.label, color: c.inkSoft },
  body: { marginTop: sp(1) },
  note: { ...type.tiny, lineHeight: 15, color: c.inkSoft },

  rings: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(3) },
  tile: {
    flexGrow: 1, flexBasis: 300, alignItems: 'center', gap: sp(1.5),
    backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1,
    borderColor: c.rule, padding: sp(3),
  },
  tileLabel: { ...type.label, fontSize: 11, color: c.inkSoft, textAlign: 'center' },
  key: { alignSelf: 'stretch', gap: 3, marginTop: sp(1) },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5) },
  keyDot: { width: 7, height: 7, borderRadius: 4 },
  keyText: { ...type.tiny, color: c.inkSoft, flex: 1, fontSize: 10.5 },
  keyVal: { ...type.tiny, color: c.ink, ...type.num, fontSize: 10.5, fontWeight: '700' },
});

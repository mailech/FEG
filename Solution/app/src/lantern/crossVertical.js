/**
 * Cross-vertical relevance — sport in, casino out.
 *
 * This is the part of the brief nobody builds: "deeper engagement across
 * categories". A recommender trained on casino co-occurrence cannot answer
 * "she just backed a horse, now what?", because the two verticals never appear
 * in the same interaction sequence.
 *
 * The bridge is the axis LANTERN-ARCHITECTURE.md §3.4b already names: **event
 * frequency**, seconds between resolutions. It is the one dimension every
 * product on the platform shares. A race resolves every ~30 minutes and you
 * watch it; a turbo slot resolves every 2 seconds and you do not. Someone who
 * chose the first has told you something real about the pace they want, and
 * pointing them at the second is the mistake a popularity lobby makes by
 * default.
 *
 * ── Honesty note, and say this out loud in the demo ──────────────────────────
 * The provided sample contains three sports — Nogomet, Tenis, Košarka — and no
 * racing at all, so this weight is NOT fitted. It is a stated cold-start prior
 * over an axis we can defend. On FEG's real logs the same shape is learned the
 * same way casino co-occurrence already is; nothing in the pipeline changes but
 * where the number comes from. `LEARNED = false` is exported so the UI can say
 * so on the surface rather than in a footnote.
 */

import { VERTICALS } from '../data/verticals';

export const LEARNED = false;

/** Seconds between resolutions, by sport. Straight from the vertical table. */
const SPORT_PACE = new Map(VERTICALS.map((v) => [v.hr, v.freq]));

/**
 * The same axis, for casino content. A table game is dealt and considered; a
 * cluster-tumble resolves before you have finished looking at it.
 */
const MECHANIC_PACE = {
  table: 1200,
  'classic-fruit': 600,
  'book-adventure': 300,
  'video-slot': 180,
  'link-jackpot': 150,
  'cluster-tumble': 90,
};

const paceOf = (g) => MECHANIC_PACE[g.mechanic] ?? 200;

/** The pace this session has actually chosen, in seconds. Null if no sport yet. */
export function sportPace(sco) {
  const touched = Object.entries(sco.sports || {});
  if (!touched.length) return null;
  let num = 0;
  let den = 0;
  for (const [name, n] of touched) {
    const f = SPORT_PACE.get(name);
    if (!f) continue;
    num += Math.log(f) * n;
    den += n;
  }
  return den ? { seconds: Math.exp(num / den), sports: touched.map(([n]) => n) } : null;
}

/**
 * Casino titles whose pace matches the sport this session engaged with.
 *
 * Deliberately excludes anything already opened: this rail exists to widen the
 * session, and a rail that recommends what you just played is a rail that has
 * told you nothing.
 */
export function paceMatched(sco, catalog, n = 10) {
  const pace = sportPace(sco);
  if (!pace) return null;

  const seen = new Set(sco.seq);
  const target = Math.log(pace.seconds);

  const items = catalog
    .filter((g) => !seen.has(g.id))
    .map((g) => {
      // Distance on the log-pace axis, plus a small pull towards steadier
      // titles — a slow bettor who wanted violent variance would have said so.
      const d = Math.abs(Math.log(paceOf(g)) - target);
      const volPenalty = Math.max(0, (g.volatility ?? 3) - 3) * 0.18;
      return { ...g, paceGap: d, score: -(d + volPenalty) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n);

  return { items, pace, why: reasonFor(pace) };
}

function reasonFor(pace) {
  const mins = Math.round(pace.seconds / 60);
  const sport = pace.sports[0];
  if (pace.seconds >= 900) {
    return `${sport} resolves about every ${mins} minutes. These are the titles that move at that pace.`;
  }
  if (pace.seconds >= 300) {
    return `${sport} sits mid-pace. These titles match it rather than outrun it.`;
  }
  return `${sport} resolves fast. These keep up.`;
}

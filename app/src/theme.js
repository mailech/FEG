/**
 * Lantern theme.
 *
 * Pitched at the real product rather than at a spec document: PSK's chrome is a
 * strong royal blue over a near-black body, with saturated game art carrying the
 * colour. We borrow that structure so the prototype reads as a casino app a
 * judge already recognises — but it stays branded Lantern, not a PSK clone.
 *
 * Two accents carry the architecture: teal is relevance, amber is risk.
 */

export const c = {
  // chrome
  brand: '#1553A8',
  brandDeep: '#0F3F84',
  brandLite: '#2E7BD6',

  // ground
  bg: '#0E1318',
  surface: '#171F27',
  surfaceAlt: '#1E2831',
  inset: '#0A0E12',
  scrim: 'rgba(0,0,0,0.45)',

  // ink
  ink: '#E8EEF3',
  inkSoft: '#93A3AF',
  inkFaint: '#65757F',

  rule: '#25303A',
  ruleSoft: '#1B242C',

  // the two heads
  relevance: '#4FC3D9',
  risk: '#E8973C',

  // risk states
  calm: '#48B77F',
  elevated: '#E8973C',
  concern: '#E05A52',
  calmBg: '#122E20',
  elevatedBg: '#33230F',
  concernBg: '#331A17',

  // badges, taken from the live lobby
  jackpot: '#D93A3A',
  exclusive: '#8B44C8',
  fresh: '#3FA96A',
  gold: '#E5B851',
};

export const sp = (n) => n * 4;

export const radius = { sm: 6, md: 10, lg: 14, pill: 999 };

export const type = {
  h1: { fontSize: 26, fontWeight: '800', color: c.ink, letterSpacing: -0.5 },
  h2: { fontSize: 18, fontWeight: '800', color: c.ink, letterSpacing: -0.3 },
  h3: { fontSize: 14, fontWeight: '700', color: c.ink },
  body: { fontSize: 14, color: c.ink, lineHeight: 20 },
  soft: { fontSize: 13, color: c.inkSoft, lineHeight: 18 },
  tiny: { fontSize: 11, color: c.inkFaint, lineHeight: 15 },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: c.inkFaint,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  num: { fontVariant: ['tabular-nums'] },
};

export const stateColor = (s) =>
  s === 'concern' ? c.concern : s === 'elevated' ? c.elevated : c.calm;

export const stateBg = (s) =>
  s === 'concern' ? c.concernBg : s === 'elevated' ? c.elevatedBg : c.calmBg;

export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.35,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
};

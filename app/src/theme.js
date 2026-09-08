/**
 * Lantern demo theme.
 *
 * Deliberately not a clone of PSK's brand — this is a Lantern prototype shown to
 * FEG, not an impersonation of their production app. The two accent hues carry
 * the architecture's central idea: teal is relevance, amber is risk.
 */

export const c = {
  bg: '#0B1115',
  surface: '#131B21',
  surfaceAlt: '#18222A',
  inset: '#0A0F13',

  ink: '#DFE7EC',
  inkSoft: '#8998A3',
  inkFaint: '#5E6D78',

  rule: '#22303A',
  ruleSoft: '#1A242B',

  relevance: '#52B8CE',
  risk: '#E0913C',

  calm: '#57B287',
  elevated: '#E0913C',
  concern: '#DC6A62',

  calmBg: '#14291F',
  elevatedBg: '#2E2011',
  concernBg: '#301A18',

  gold: '#D9A441',
};

export const sp = (n) => n * 4;

export const type = {
  h1: { fontSize: 24, fontWeight: '700', color: c.ink, letterSpacing: -0.4 },
  h2: { fontSize: 17, fontWeight: '700', color: c.ink, letterSpacing: -0.2 },
  h3: { fontSize: 14, fontWeight: '600', color: c.ink },
  body: { fontSize: 14, color: c.ink, lineHeight: 20 },
  soft: { fontSize: 13, color: c.inkSoft, lineHeight: 18 },
  tiny: { fontSize: 11, color: c.inkFaint },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: c.inkFaint,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  mono: {
    fontSize: 12,
    color: c.ink,
    fontVariant: ['tabular-nums'],
  },
};

export const stateColor = (s) =>
  s === 'concern' ? c.concern : s === 'elevated' ? c.elevated : c.calm;

export const stateBg = (s) =>
  s === 'concern' ? c.concernBg : s === 'elevated' ? c.elevatedBg : c.calmBg;

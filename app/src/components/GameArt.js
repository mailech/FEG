/**
 * Procedural cover art.
 *
 * Real tile imagery lives behind feg-casino-portal-api and costs the lobby
 * 2,560 KB per load (RECON-FINDINGS.md §5). This generates a stable, distinct
 * cover for all 887 titles from the title itself — deterministic, offline, and
 * zero bytes over the network.
 *
 * The palette comes from the game's mechanic, so a shelf of link-jackpots reads
 * as a family and a table game never looks like a fruit slot. That is the same
 * attribute vector the recommender ranks on, made visible.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { c } from '../theme';

/** FNV-ish, stable across platforms. */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const FAMILIES = {
  'classic-fruit':  { hues: [4, 22],    glyph: '7',  sat: 62, light: 34 },
  'link-jackpot':   { hues: [36, 46],   glyph: '◆',  sat: 58, light: 32 },
  'cluster-tumble': { hues: [292, 322], glyph: '❁',  sat: 50, light: 34 },
  'book-adventure': { hues: [28, 40],   glyph: '◈',  sat: 44, light: 26 },
  'table':          { hues: [150, 168], glyph: '♠',  sat: 36, light: 22 },
  'video-slot':     { hues: [196, 222], glyph: '⬢',  sat: 42, light: 30 },
};

const hsl = (h, s, l) => `hsl(${Math.round(h)}, ${s}%, ${l}%)`;

export function artFor(game) {
  const f = FAMILIES[game.mechanic] || FAMILIES['video-slot'];
  const h = hash(game.name);
  const span = f.hues[1] - f.hues[0];
  const base = f.hues[0] + (h % 1000) / 1000 * span;

  return {
    from: hsl(base, f.sat, f.light + 6),
    to: hsl(base + 14, f.sat + 8, f.light - 12),
    accent: hsl(base + 30, Math.min(90, f.sat + 30), 62),
    glyph: f.glyph,
    // Two stable pseudo-random offsets so no two covers compose identically.
    ox: (h % 37) / 37,
    oy: ((h >> 5) % 41) / 41,
  };
}

/**
 * @param size  'tile' | 'card'  — shelf thumbnail vs feed hero
 */
export default function GameArt({ game, size = 'tile', children }) {
  const a = artFor(game);
  const big = size === 'card';
  const g = big ? s.gBig : s.gSmall;

  return (
    <LinearGradient
      colors={[a.from, a.to]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[s.base, big ? s.card : s.tile]}
    >
      {/* Two soft discs give each cover a composition instead of a flat wash. */}
      <View
        style={[
          s.disc,
          {
            backgroundColor: a.accent,
            opacity: 0.16,
            width: big ? 190 : 78,
            height: big ? 190 : 78,
            borderRadius: big ? 95 : 39,
            left: `${8 + a.ox * 42}%`,
            top: `${-14 + a.oy * 34}%`,
          },
        ]}
      />
      <View
        style={[
          s.disc,
          {
            backgroundColor: a.accent,
            opacity: 0.1,
            width: big ? 130 : 54,
            height: big ? 130 : 54,
            borderRadius: big ? 65 : 27,
            right: `${4 + a.oy * 26}%`,
            bottom: `${-10 + a.ox * 24}%`,
          },
        ]}
      />

      <Text style={[g, { color: a.accent }]} numberOfLines={1}>
        {a.glyph}
      </Text>

      {game.jackpot && (
        <View style={s.jp}>
          <Text style={s.jpText}>JACKPOT</Text>
        </View>
      )}

      {children}
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  base: { overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  tile: { width: '100%', aspectRatio: 1, borderRadius: 10 },
  card: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12 },
  disc: { position: 'absolute' },
  gSmall: { fontSize: 34, fontWeight: '900', opacity: 0.9 },
  gBig: { fontSize: 76, fontWeight: '900', opacity: 0.9 },
  jp: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.42)',
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 3,
  },
  jpText: { color: c.gold, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
});

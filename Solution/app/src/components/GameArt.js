/**
 * Procedural cover art.
 *
 * Real tile imagery lives behind feg-casino-portal-api and costs the live lobby
 * 2,560 KB per load (RECON-FINDINGS.md §5). This derives a stable, saturated
 * cover for all 887 titles from the title string — deterministic, offline, zero
 * network bytes, and nothing passed off as FEG artwork.
 *
 * Palette is keyed to the game's mechanic, so a row of link-jackpots reads as a
 * family and a table game never looks like a fruit slot. That is the same
 * attribute vector the recommender ranks on, made visible: when the feed
 * re-ranks, you can see it re-rank.
 */

import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { c, radius } from '../theme';
import { ASSET_BASE } from '../lantern/relevance';

/** FNV-1a — stable across platforms and cheap. */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Casino art is saturated and high-contrast. These are pitched to match. */
const FAMILIES = {
  'classic-fruit':  { hue: [352, 14],  glyph: '7',  s: 78, l: 42, rays: true },
  'link-jackpot':   { hue: [34, 46],   glyph: '◆',  s: 84, l: 44, rays: true },
  'cluster-tumble': { hue: [286, 322], glyph: '❁',  s: 66, l: 46, rays: false },
  'book-adventure': { hue: [24, 40],   glyph: '◈',  s: 62, l: 34, rays: false },
  'table':          { hue: [146, 166], glyph: '♠',  s: 46, l: 26, rays: false },
  'video-slot':     { hue: [198, 232], glyph: '⬢',  s: 60, l: 38, rays: false },
};

const hsl = (h, s, l) => `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;

export function artFor(game) {
  const f = FAMILIES[game.mechanic] || FAMILIES['video-slot'];
  const h = hash(game.name);
  const base = f.hue[0] + ((h % 997) / 997) * (f.hue[1] - f.hue[0]);

  return {
    top: hsl(base + 10, f.s, f.l + 14),
    mid: hsl(base, f.s, f.l),
    bot: hsl(base - 8, f.s + 6, f.l - 20),
    glow: hsl(base + 26, 92, 66),
    glyph: f.glyph,
    rays: f.rays,
    ox: (h % 37) / 37,
    oy: ((h >> 5) % 41) / 41,
    rot: ((h >> 9) % 40) - 20,
  };
}

export function Badge({ kind, children }) {
  const bg =
    kind === 'jackpot' ? c.jackpot : kind === 'exclusive' ? c.exclusive : kind === 'new' ? c.fresh : c.brand;
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={s.badgeText}>{children}</Text>
    </View>
  );
}

/**
 * @param size  'tile' | 'wide' | 'hero'
 */
export default function GameArt({ game, size = 'tile', jackpotAmount, children }) {
  const a = artFor(game);
  const [artFailed, setArtFailed] = React.useState(false);
  const uri = game.art && !artFailed ? ASSET_BASE + game.art : null;
  const scale = size === 'hero' ? 1 : size === 'wide' ? 0.62 : 0.42;
  const box = size === 'hero' ? s.hero : size === 'wide' ? s.wide : s.tile;

  return (
    <LinearGradient
      colors={[a.top, a.mid, a.bot]}
      locations={[0, 0.55, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[s.base, box]}
    >
      {/* sunburst — the single most casino-looking device there is */}
      {a.rays && (
        <View style={[s.rayWrap, { transform: [{ rotate: `${a.rot}deg` }], pointerEvents: 'none' }]}>
          {[0, 30, 60, 90, 120, 150].map((deg) => (
            <View
              key={deg}
              style={[
                s.ray,
                {
                  backgroundColor: a.glow,
                  transform: [{ rotate: `${deg}deg` }],
                  height: 420 * scale,
                  width: 26 * scale,
                },
              ]}
            />
          ))}
        </View>
      )}

      <View
        style={[
          s.disc,
          { pointerEvents: 'none' },
          {
            backgroundColor: a.glow,
            opacity: 0.2,
            width: 300 * scale, height: 300 * scale, borderRadius: 150 * scale,
            left: `${4 + a.ox * 40}%`,
            top: `${-22 + a.oy * 32}%`,
          },
        ]}
      />

      {uri ? (
        // Real cover art, referenced live from the portal API — never copied
        // into this repo. Falls back to the procedural cover if it 404s or the
        // machine is offline, so the demo never shows a hole.
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setArtFailed(true)}
        />
      ) : (
        // A glyph tinted from the same family palette all but disappears
        // against it, which reads as a broken image rather than a cover. The
        // title carries the tile instead, with the glyph behind it.
        <View style={s.fallback} pointerEvents="none">
          <Text style={[s.glyph, s.fbGlyph, { fontSize: 104 * scale, color: a.glow }]}>
            {a.glyph}
          </Text>
          <Text
            style={[s.fbName, { fontSize: Math.max(10, 26 * scale) }]}
            numberOfLines={size === 'tile' ? 3 : 2}
          >
            {game.name}
          </Text>
        </View>
      )}

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.55)']}
        style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
      />

      <View style={s.badges}>
        {game.label ? (
          <View style={[s.badge, { backgroundColor: game.label.color || c.brand }]}>
            <Text style={s.badgeText}>{game.label.text}</Text>
          </View>
        ) : game.jackpot ? (
          <Badge kind="jackpot">JACKPOT</Badge>
        ) : game.launches > 400 ? (
          <Badge kind="exclusive">TOP</Badge>
        ) : null}
      </View>

      {jackpotAmount != null && (
        <View style={s.jpAmount}>
          <Text style={s.jpAmountText}>€{jackpotAmount.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</Text>
        </View>
      )}

      {children}
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  base: { overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  tile: { width: '100%', aspectRatio: 1, borderRadius: radius.md },
  wide: { width: '100%', aspectRatio: 16 / 10, borderRadius: radius.md },
  hero: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg },

  rayWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  ray: { position: 'absolute', opacity: 0.13 },
  disc: { position: 'absolute' },
  glyph: { fontWeight: '900', opacity: 0.92, textShadow: '0px 0px 8px rgba(0,0,0,0.35)' },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: '9%',
  },
  fbGlyph: { position: 'absolute', opacity: 0.4 },
  fbName: {
    color: '#FFFFFF', fontWeight: '900', textAlign: 'center', letterSpacing: 0.2,
    textShadow: '0px 1px 6px rgba(0,0,0,0.75)',
  },

  badges: { position: 'absolute', top: 7, left: 7, flexDirection: 'row', gap: 4 },
  badge: { paddingHorizontal: 5, paddingVertical: 2.5, borderRadius: 3 },
  badgeText: { color: '#fff', fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },

  jpAmount: {
    position: 'absolute', bottom: 6, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 4,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  jpAmountText: { color: c.gold, fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
});

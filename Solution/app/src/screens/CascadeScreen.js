/**
 * Slatki Slap — a match-3 casual game.
 *
 * Written from scratch rather than shipping anyone's assets: Candy Crush is
 * King's, and a hackathon demo is not a place to borrow trademarked art. Same
 * mechanic, own implementation, own name.
 *
 * It earns its place architecturally, not as filler. **Nothing here is
 * wagered.** No stake, no payout, no RNG anyone has to certify. That makes it
 * the safest surface in the whole product: it raises Actions per Session and
 * gives a reason to open the app, at zero event-frequency risk — the
 * constrained axis in LANTERN-ARCHITECTURE.md §3.4b.
 *
 * So when the risk head moves to `concern` and the wagering shelves are held,
 * this is the one thing the policy engine can still offer. Somewhere to go that
 * isn't a bet.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLantern } from '../lantern/useLantern';
import { Card, Label, Row, Btn, Note, StateChip } from '../components/ui';
import { c, sp, type, radius } from '../theme';

const COLS = 7;
const ROWS = 8;
const MOVES = 25;

const GEMS = [
  { ch: '●', from: '#E8524A', to: '#B32F28' },
  { ch: '◆', from: '#4FA6E8', to: '#2A6EA8' },
  { ch: '▲', from: '#5FC08A', to: '#2F7D55' },
  { ch: '★', from: '#E8B93C', to: '#B3872155' },
  { ch: '⬟', from: '#A86FD9', to: '#6E3EA0' },
  { ch: '◼', from: '#E8863C', to: '#B35A1E' },
];

const rnd = () => Math.floor(Math.random() * GEMS.length);
const key = (r, cIdx) => `${r},${cIdx}`;

function freshGrid() {
  // Build with no pre-existing matches so the first move is the player's.
  const g = [];
  for (let r = 0; r < ROWS; r++) {
    g.push([]);
    for (let cIdx = 0; cIdx < COLS; cIdx++) {
      let v;
      do {
        v = rnd();
      } while (
        (cIdx >= 2 && g[r][cIdx - 1] === v && g[r][cIdx - 2] === v) ||
        (r >= 2 && g[r - 1][cIdx] === v && g[r - 2][cIdx] === v)
      );
      g[r].push(v);
    }
  }
  return g;
}

/** All cells belonging to a run of 3 or more, horizontally or vertically. */
function findMatches(g) {
  const hits = new Set();
  for (let r = 0; r < ROWS; r++) {
    let run = 1;
    for (let cIdx = 1; cIdx <= COLS; cIdx++) {
      if (cIdx < COLS && g[r][cIdx] != null && g[r][cIdx] === g[r][cIdx - 1]) run++;
      else {
        if (run >= 3) for (let k = cIdx - run; k < cIdx; k++) hits.add(key(r, k));
        run = 1;
      }
    }
  }
  for (let cIdx = 0; cIdx < COLS; cIdx++) {
    let run = 1;
    for (let r = 1; r <= ROWS; r++) {
      if (r < ROWS && g[r][cIdx] != null && g[r][cIdx] === g[r - 1][cIdx]) run++;
      else {
        if (run >= 3) for (let k = r - run; k < r; k++) hits.add(key(k, cIdx));
        run = 1;
      }
    }
  }
  return hits;
}

/** Clear, drop, refill. Returns the settled grid and points scored. */
function settle(grid) {
  let g = grid.map((row) => [...row]);
  let gained = 0;
  let chain = 0;

  for (;;) {
    const hits = findMatches(g);
    if (!hits.size) break;
    chain++;
    // Longer chains are worth more — the only escalation in the game, and it
    // costs the player nothing.
    gained += hits.size * 10 * chain;
    for (const k of hits) {
      const [r, cIdx] = k.split(',').map(Number);
      g[r][cIdx] = null;
    }
    for (let cIdx = 0; cIdx < COLS; cIdx++) {
      const col = [];
      for (let r = ROWS - 1; r >= 0; r--) if (g[r][cIdx] != null) col.push(g[r][cIdx]);
      for (let r = ROWS - 1; r >= 0; r--) g[r][cIdx] = col[ROWS - 1 - r] ?? rnd();
    }
  }
  return { grid: g, gained, chain };
}

export default function CascadeScreen({ onBack }) {
  const { emit, risk, policy } = useLantern();
  const [grid, setGrid] = useState(() => settle(freshGrid()).grid);
  const [sel, setSel] = useState(null);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(MOVES);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    emit({ t: 'game_open', gameId: 'slatki-slap', gameName: 'Slatki Slap', provider: 'Lantern', section: 'Casual', volatility: 1 });
    return () => emit({ t: 'game_close', gameId: 'slatki-slap', gameName: 'Slatki Slap' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const width = Math.min(Dimensions.get('window').width - sp(8), 360);
  const cell = Math.floor((width - (COLS - 1) * 4) / COLS);

  const tap = useCallback(
    (r, cIdx) => {
      if (moves <= 0) return;
      if (!sel) { setSel({ r, c: cIdx }); return; }
      if (sel.r === r && sel.c === cIdx) { setSel(null); return; }

      const adjacent = Math.abs(sel.r - r) + Math.abs(sel.c - cIdx) === 1;
      if (!adjacent) { setSel({ r, c: cIdx }); return; }

      const next = grid.map((row) => [...row]);
      [next[sel.r][sel.c], next[r][cIdx]] = [next[r][cIdx], next[sel.r][sel.c]];

      if (!findMatches(next).size) {
        // Illegal swap costs nothing — no move burned, no penalty.
        setFlash('no match there');
        setTimeout(() => setFlash(null), 900);
        setSel(null);
        return;
      }

      const out = settle(next);
      setGrid(out.grid);
      setScore((s) => s + out.gained);
      setMoves((m) => m - 1);
      setSel(null);
      setFlash(out.chain > 1 ? `${out.chain}x cascade  +${out.gained}` : `+${out.gained}`);
      setTimeout(() => setFlash(null), 1100);

      emit({ t: 'cascade_move', gameId: 'slatki-slap', chain: out.chain, gained: out.gained });
    },
    [grid, sel, moves, emit]
  );

  const restart = () => {
    setGrid(settle(freshGrid()).grid);
    setScore(0);
    setMoves(MOVES);
    setSel(null);
    emit({ t: 'cascade_restart', gameId: 'slatki-slap' });
  };

  const over = moves <= 0;

  return (
    <View style={s.root}>
      <View style={s.bar}>
        <Pressable onPress={onBack} hitSlop={12} style={s.back}>
          <Ionicons name="chevron-back" size={18} color={c.relevance} />
          <Text style={s.backText}>Home</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Slatki Slap</Text>
          <Text style={type.tiny}>Casual · nothing wagered</Text>
        </View>
        <StateChip state={risk.state} compact />
      </View>

      <View style={s.hud}>
        <View style={s.hudCell}>
          <Text style={s.hudV}>{score.toLocaleString()}</Text>
          <Text style={s.hudK}>score</Text>
        </View>
        <View style={s.hudCell}>
          <Text style={[s.hudV, { color: moves <= 5 ? c.risk : c.ink }]}>{moves}</Text>
          <Text style={s.hudK}>moves left</Text>
        </View>
        <View style={s.hudCell}>
          <Text style={[s.hudV, { color: c.calm }]}>€0.00</Text>
          <Text style={s.hudK}>staked</Text>
        </View>
      </View>

      <View style={[s.boardWrap, { width: width + sp(4) }]}>
        <View style={[s.board, { width }]}>
          {grid.map((row, r) =>
            row.map((v, cIdx) => {
              const g = GEMS[v] || GEMS[0];
              const on = sel && sel.r === r && sel.c === cIdx;
              return (
                <Pressable
                  key={key(r, cIdx)}
                  onPress={() => tap(r, cIdx)}
                  style={{ width: cell, height: cell, margin: 2 }}
                >
                  <LinearGradient
                    colors={[g.from, g.to]}
                    style={[s.gem, on && s.gemOn, { width: cell, height: cell }]}
                  >
                    <Text style={[s.gemCh, { fontSize: cell * 0.42 }]}>{g.ch}</Text>
                  </LinearGradient>
                </Pressable>
              );
            })
          )}
        </View>

        {!!flash && (
          <View style={s.flash} pointerEvents="none">
            <Text style={s.flashText}>{flash}</Text>
          </View>
        )}

        {over && (
          <View style={s.over}>
            <Text style={type.h2}>Round complete</Text>
            <Text style={[type.soft, { marginTop: sp(1) }]}>{score.toLocaleString()} points</Text>
            <Btn title="Play again" tone="accent" onPress={restart} style={{ marginTop: sp(3) }} />
            <Text style={[type.tiny, { marginTop: sp(2.5), textAlign: 'center', maxWidth: 250 }]}>
              No balance changed. There is nothing to win back, so there is nothing to chase.
            </Text>
          </View>
        )}
      </View>

      <View style={s.foot}>
        <Card>
          <Row>
            <Label>Why this is in a betting app</Label>
            <Ionicons name="shield-checkmark" size={15} color={c.calm} />
          </Row>
          <Text style={[type.soft, { marginTop: sp(1.5) }]}>
            Nothing is wagered here — no stake, no payout, no certified RNG. That makes it the
            safest surface in the product: it raises Actions per Session and gives a reason to
            open the app, at zero event-frequency risk.
          </Text>
          {policy.state !== 'calm' && (
            <Note tone="good">
              The risk head is at <Text style={{ fontWeight: '800' }}>{policy.state}</Text>, so the
              wagering shelves are held. This is what the policy engine can still offer —
              somewhere to go that isn't a bet.
            </Note>
          )}
        </Card>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: sp(3),
    paddingHorizontal: sp(4), paddingVertical: sp(2.5),
    borderBottomWidth: 1, borderBottomColor: c.rule, backgroundColor: c.surface,
  },
  back: { flexDirection: 'row', alignItems: 'center' },
  backText: { color: c.relevance, fontSize: 13, fontWeight: '700' },
  title: { ...type.h3, fontSize: 15 },

  hud: {
    flexDirection: 'row', paddingVertical: sp(3),
    borderBottomWidth: 1, borderBottomColor: c.ruleSoft,
  },
  hudCell: { flex: 1, alignItems: 'center' },
  hudV: { ...type.h2, fontVariant: ['tabular-nums'] },
  hudK: { ...type.tiny, marginTop: 1 },

  boardWrap: { alignSelf: 'center', marginTop: sp(4), position: 'relative' },
  board: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center' },
  gem: {
    borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  gemOn: { borderColor: '#fff' },
  gemCh: { color: 'rgba(255,255,255,0.85)', fontWeight: '900' },

  flash: {
    position: 'absolute', top: '42%', alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: radius.pill,
    paddingHorizontal: sp(4), paddingVertical: sp(2),
  },
  flashText: { color: '#fff', fontWeight: '900', fontSize: 14 },

  over: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,14,18,0.92)',
    alignItems: 'center', justifyContent: 'center', borderRadius: radius.md,
  },
  foot: { padding: sp(4), marginTop: 'auto' },
});

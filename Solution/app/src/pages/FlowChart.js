/**
 * The pipeline as a flowchart.
 *
 * Five nodes, four links, and a packet that travels each link when a real event
 * moves through the system. The motion is driven by the relay, not by a timer:
 * `phase` steps 0-4 as a snapshot arrives, so the animation is a rendering of
 * something that happened rather than decoration.
 *
 * Layout flips on width — a row with horizontal arrows on a projector, a column
 * with vertical ones on a phone — because a flowchart that wraps mid-arrow is
 * worse than no flowchart.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { c, sp, type, radius } from '../theme';

const STEP_MS = 190;

/** A link between two nodes, with a packet that runs it when `active`. */
function Link({ active, vertical }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return undefined;
    t.setValue(0);
    const anim = Animated.timing(t, {
      toValue: 1,
      duration: STEP_MS * 1.6,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [active, t]);

  const span = vertical ? 26 : 34;
  const travel = t.interpolate({ inputRange: [0, 1], outputRange: [0, span] });
  const fade = t.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] });

  return (
    <View style={vertical ? s.linkV : s.linkH}>
      <View style={[vertical ? s.railV : s.railH, active && { backgroundColor: c.relevance }]} />
      <Ionicons
        name={vertical ? 'caret-down' : 'caret-forward'}
        size={11}
        color={active ? c.relevance : c.rule}
        style={vertical ? s.headV : s.headH}
      />
      <Animated.View
        style={[
          s.packet,
          { opacity: fade },
          vertical ? { transform: [{ translateY: travel }] } : { transform: [{ translateX: travel }] },
        ]}
      />
    </View>
  );
}

function Node({ n, icon, title, subtitle, tone, hot, children }) {
  return (
    <View style={[s.node, tone && { borderColor: tone }, hot && s.nodeHot]}>
      <View style={s.nodeHead}>
        <View style={[s.badge, { backgroundColor: hot ? c.relevance : tone || c.rule }]}>
          <Ionicons name={icon} size={13} color="#04121A" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.nodeTitle}>
            <Text style={s.nodeN}>{n} · </Text>
            {title}
          </Text>
          <Text style={s.nodeSub}>{subtitle}</Text>
        </View>
      </View>
      <View style={s.nodeBody}>{children}</View>
    </View>
  );
}

/**
 * @param stages  [{ n, icon, title, subtitle, tone, body }]
 * @param phase   index of the node currently lit, or -1
 */
export default function FlowChart({ stages, phase, vertical }) {
  return (
    <View style={vertical ? s.wrapV : s.wrapH}>
      {stages.map((st, i) => (
        <React.Fragment key={st.title}>
          <Node
            n={st.n}
            icon={st.icon}
            title={st.title}
            subtitle={st.subtitle}
            tone={st.tone}
            hot={phase === i}
          >
            {st.body}
          </Node>
          {i < stages.length - 1 && <Link active={phase === i} vertical={vertical} />}
        </React.Fragment>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrapH: { flexDirection: 'row', alignItems: 'stretch' },
  wrapV: { gap: 0 },

  node: {
    flex: 1, backgroundColor: c.surface, borderRadius: radius.lg, padding: sp(3),
    borderWidth: 1, borderColor: c.rule, gap: sp(2), minWidth: 0,
  },
  nodeHot: { borderColor: c.relevance, backgroundColor: c.surfaceAlt },
  nodeHead: { flexDirection: 'row', gap: sp(2), alignItems: 'flex-start' },
  badge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  nodeTitle: { ...type.body, fontWeight: '800' },
  nodeN: { color: c.inkFaint, fontWeight: '900' },
  nodeSub: { ...type.tiny, fontSize: 10, lineHeight: 14 },
  nodeBody: { gap: sp(1.5) },

  linkH: { width: 44, alignItems: 'center', justifyContent: 'center' },
  linkV: { height: 34, alignItems: 'center', justifyContent: 'center' },
  railH: { position: 'absolute', left: 4, right: 10, height: 2, backgroundColor: c.rule },
  railV: { position: 'absolute', top: 3, bottom: 9, width: 2, backgroundColor: c.rule },
  headH: { position: 'absolute', right: 0 },
  headV: { position: 'absolute', bottom: -1 },
  packet: {
    position: 'absolute', width: 7, height: 7, borderRadius: 4,
    backgroundColor: c.relevance, left: 2, top: undefined,
  },
});

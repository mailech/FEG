/**
 * Other people, live.
 *
 * The relay already carries one snapshot per active session. Filter out your own
 * and what is left is everyone else currently playing — their character, their
 * risk state, their net position — plus a chat channel addressed by session id.
 *
 * What crosses the wire is still only model output plus a display name. No
 * limits, no age band, no behavioural stream. A peer can see that you are up
 * €40 and that the model calls you Steady; they cannot see what you tapped.
 *
 * `contactable` is honoured here rather than in the UI: a session that has not
 * opted in is visible on the operator dashboard but cannot be messaged.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { subscribe, say } from './feed';

/**
 * How recently a session must have published to count as "playing now".
 *
 * The relay expires its own records after three minutes, but a dashboard left
 * open would still be holding whatever it was last told. Ninety seconds is
 * comfortably longer than the publish interval and short enough that a closed
 * tab disappears while someone is still looking at the screen.
 */
const FRESH_MS = 90 * 1000;

export function usePeers(ownSessionId, ownName) {
  const [sessions, setSessions] = useState({});
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('connecting');
  const [activity, setActivity] = useState([]);

  useEffect(() => subscribe({
    onStatus: setStatus,
    onHello: (d) => {
      setSessions(Object.fromEntries((d.sessions || []).map((x) => [x.sessionId, x])));
      setMessages(d.messages || []);
    },
    onSnapshot: (snap) => {
      setSessions((m) => ({ ...m, [snap.sessionId]: snap }));

      // A live tape of what other people are doing. Keyed on the event's own
      // timestamp so the presence heartbeat — which republishes an unchanged
      // snapshot every 25s — does not spam the feed with repeats.
      if (snap.last && snap.name) {
        setActivity((a) => {
          const key = `${snap.sessionId}:${snap.last.at}`;
          if (a.some((x) => x.key === key)) return a;
          return [{
            key,
            sessionId: snap.sessionId,
            name: snap.name,
            t: snap.last.t,
            gameId: snap.last.gameId,
            at: snap.last.at,
            netCents: snap.counters?.netCents ?? 0,
            spins: snap.counters?.spins ?? 0,
          }, ...a].slice(0, 24);
        });
      }
    },
    onMessage: (msg) => setMessages((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg])),
  }), []);

  // Re-evaluated on a tick as well as on new data, so rows age out on their own.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  const all = useMemo(
    () => Object.values(sessions)
      .filter((p) => now - (p.at || 0) < FRESH_MS)
      .sort((a, b) => b.at - a.at),
    [sessions, now]
  );

  const peers = useMemo(
    () => all.filter((p) => p.sessionId !== ownSessionId && p.name),
    [all, ownSessionId]
  );

  /** Peers who are up, opted in, and have actually played. The chat prompt. */
  const winners = useMemo(
    () => peers.filter((p) => (p.counters?.netCents ?? 0) > 0 && (p.counters?.spins ?? 0) >= 3),
    [peers]
  );

  /**
   * Anyone already in a conversation with me, whether or not they are ahead.
   *
   * Without this the chat is one-directional: a peer only became reachable by
   * appearing in `winners`, so the person being asked about their result had no
   * row to reply from. Being messaged is reason enough to show someone.
   */
  const conversational = useMemo(() => {
    const ids = new Set(
      messages
        .filter((m) => m.to !== '*')
        .filter((m) => m.from === ownSessionId || m.to === ownSessionId)
        .map((m) => (m.from === ownSessionId ? m.to : m.from))
    );
    return peers.filter((p) => ids.has(p.sessionId));
  }, [messages, peers, ownSessionId]);

  /** Everyone worth a row in the tray, deduplicated. */
  const contacts = useMemo(() => {
    const seen = new Set();
    return [...winners, ...conversational].filter((p) => {
      if (seen.has(p.sessionId)) return false;
      seen.add(p.sessionId);
      return true;
    });
  }, [winners, conversational]);

  const threadWith = useCallback(
    (peerId) => messages
      .filter((m) => m.to !== '*')
      .filter((m) => (m.from === ownSessionId && m.to === peerId) || (m.from === peerId && m.to === ownSessionId))
      .sort((a, b) => a.at - b.at),
    [messages, ownSessionId]
  );

  /**
   * Posts addressed to everyone. `to: '*'` is the whole protocol.
   *
   * Note what an announcement does NOT carry: an amount. The poster writes an
   * optional line, and the figure shown to everyone else is read live from that
   * session's own snapshot on the relay. So a post cannot claim a number that
   * did not happen — the claim and the evidence come from different places, and
   * only one of them is under the poster's control.
   */
  const announcements = useMemo(
    () => messages
      .filter((m) => m.to === '*' && m.from !== ownSessionId)
      .sort((a, b) => b.at - a.at),
    [messages, ownSessionId]
  );

  const myAnnouncements = useMemo(
    () => messages.filter((m) => m.to === '*' && m.from === ownSessionId),
    [messages, ownSessionId]
  );

  const announce = useCallback(
    (note) => say({
      from: ownSessionId,
      fromName: ownName || 'Guest',
      to: '*',
      text: String(note || '').trim().slice(0, 160),
    }),
    [ownSessionId, ownName]
  );

  const send = useCallback(
    (to, text) => {
      const clean = String(text || '').trim().slice(0, 400);
      if (!clean) return;
      say({ from: ownSessionId, fromName: ownName || 'Guest', to, text: clean });
    },
    [ownSessionId, ownName]
  );

  /** Unread-ish: anything addressed to me since the last time this was read. */
  const inbox = useMemo(
    () => messages.filter((m) => m.to === ownSessionId),
    [messages, ownSessionId]
  );

  return {
    status, all, peers, winners, conversational, contacts, messages, inbox,
    announcements, myAnnouncements, announce, threadWith, send, activity,
  };
}

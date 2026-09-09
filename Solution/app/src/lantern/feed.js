/**
 * The wire to the relay.
 *
 * `publish()` is fire-and-forget by design: if the relay is not running, the
 * product must carry on exactly as before. A demo where the phone app breaks
 * because a dashboard is closed is worse than no dashboard.
 *
 * What crosses the wire is the *output* of the models, never the raw
 * behavioural stream — character, risk, conversion, counters. Inference still
 * happens on the device, and the relay could be read by anyone on the network
 * without learning what was tapped.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getItem, setItem, removeItem } from './storage';

const RELAY_KEY = 'lantern.relay';

/**
 * Where the relay lives.
 *
 * Resolution order matters for the tunnel case. Through a public tunnel the app
 * is served from some https host that has no port 8787 behind it, so the default
 * guess is wrong and the page would silently sit at "offline". `?relay=` fixes
 * that without a rebuild — open the dashboard once with the relay's tunnel URL
 * and it is remembered from then on.
 *
 *   1. ?relay=https://... on the URL   (remembered)
 *   2. whatever was remembered earlier
 *   3. EXPO_PUBLIC_RELAY, baked at build time
 *   4. same host as the app, port 8787 — right on a laptop, wrong on a tunnel
 */
export function relayBase() {
  const clean = (u) => u.replace(/\/+$/, '');

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const q = new URLSearchParams(window.location.search).get('relay');
      if (q) {
        setItem(RELAY_KEY, clean(q));
        return clean(q);
      }
      const saved = getItem(RELAY_KEY);
      if (saved) return saved;
    } catch {
      /* storage blocked; fall through to the build-time value */
    }
  }

  const fromEnv = process.env.EXPO_PUBLIC_RELAY;
  if (fromEnv) return clean(fromEnv);

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:8787`;
  }

  // On a phone, `localhost` is the phone. Expo Go knows the address of the
  // machine serving the bundle, so borrow that host and swap the port — the
  // relay is on the same laptop as Metro. Without this the device silently
  // never joins the relay and everyone else sees "0 players online".
  const host = devHost();
  if (host) return `http://${host}:8787`;

  return 'http://localhost:8787';
}

/** The LAN address of the dev machine, however this Expo version reports it. */
function devHost() {
  const candidates = [
    Constants?.expoConfig?.hostUri,
    Constants?.expoGoConfig?.debuggerHost,
    Constants?.manifest2?.extra?.expoClient?.hostUri,
    Constants?.manifest?.debuggerHost,
    Constants?.manifest?.hostUri,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length) {
      const host = c.split('@').pop().split('/')[0].split(':')[0];
      if (host && host !== 'localhost' && host !== '127.0.0.1') return host;
    }
  }
  return null;
}

/** Forget a remembered relay — used by the tunnel banner. */
export function forgetRelay() {
  removeItem(RELAY_KEY);
}

export { RELAY_KEY };

let lastSent = 0;
let pending = null;
let timer = null;
const MIN_GAP = 400;   // ms; a spin loop must not become a request loop

function post(payload) {
  fetch(`${relayBase()}/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});   // relay down is a non-event
}

/** Throttled, coalescing publish. The newest snapshot always wins. */
export function publish(payload) {
  pending = payload;
  const now = Date.now();
  const wait = Math.max(0, MIN_GAP - (now - lastSent));

  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    lastSent = Date.now();
    const p = pending;
    pending = null;
    if (p) post(p);
  }, wait);
}

/**
 * Subscribe a dashboard to the relay.
 * @returns unsubscribe function
 */
/** Send a chat line to another live session. Fire-and-forget, like publish. */
export function say({ from, fromName, to, text }) {
  fetch(`${relayBase()}/say`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ from, fromName, to, text }),
  }).catch(() => {});
}

export function subscribe({ onSnapshot, onHello, onStatus, onMessage }) {
  if (typeof EventSource === 'undefined') {
    onStatus?.('unsupported');
    return () => {};
  }

  let es;
  let closed = false;

  const open = () => {
    if (closed) return;
    onStatus?.('connecting');
    es = new EventSource(`${relayBase()}/feed`);
    es.onopen = () => onStatus?.('live');
    es.addEventListener('hello', (e) => {
      onStatus?.('live');
      try { onHello?.(JSON.parse(e.data)); } catch {}
    });
    es.addEventListener('snapshot', (e) => {
      try { onSnapshot?.(JSON.parse(e.data)); } catch {}
    });
    es.addEventListener('message', (e) => {
      try { onMessage?.(JSON.parse(e.data)); } catch {}
    });
    es.onerror = () => {
      onStatus?.('offline');
      // EventSource retries on its own, but a relay that never comes back would
      // otherwise leave a dead socket open for the life of the page.
      if (es.readyState === 2 && !closed) {
        es.close();
        setTimeout(open, 3000);
      }
    };
  };

  open();
  return () => { closed = true; es?.close(); };
}

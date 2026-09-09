/**
 * One key-value store, three environments.
 *
 * `localStorage` does not exist in React Native. identity.js called it directly,
 * so on a phone in Expo Go every write silently failed and every read came back
 * empty — signing in worked, and then navigating anywhere re-read nothing and
 * showed the sign-up screen again. That is the bug this file exists to remove.
 *
 * Three layers, in order:
 *
 *   1. an in-memory cache, so a read immediately after a write is always
 *      correct even when nothing durable is available;
 *   2. `localStorage` on web;
 *   3. AsyncStorage on native, which is asynchronous — hence `hydrate()`, which
 *      the app awaits once at startup so the first synchronous read already has
 *      the answer.
 *
 * Reads stay synchronous on purpose. The screens that use this render on the
 * first frame and a promise there would mean a flash of the signed-out state on
 * every mount.
 */

import { Platform } from 'react-native';

const mem = new Map();
let native = null;

let nativeError = null;

if (Platform.OS !== 'web') {
  try {
    // Optional: the app still runs without it, it just forgets across restarts.
    native = require('@react-native-async-storage/async-storage').default;
    if (!native || typeof native.setItem !== 'function') {
      nativeError = 'module loaded but has no setItem';
      native = null;
    }
  } catch (e) {
    nativeError = String(e?.message || e).slice(0, 120);
    native = null;
  }
}

/**
 * Which layer is actually holding the data.
 *
 * Worth surfacing rather than guessing: "memory" means the profile survives
 * navigation but not a reload, which is exactly the symptom that sends you
 * hunting in the wrong place.
 */
export function backend() {
  if (Platform.OS === 'web') return { name: 'localStorage', durable: true, error: null };
  if (native) return { name: 'async-storage', durable: true, error: null };
  return { name: 'memory only', durable: false, error: nativeError };
}

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

/** Pull persisted values into memory. Await once, before the first render. */
export async function hydrate(keys = []) {
  if (!native) return;
  try {
    const pairs = await native.multiGet(keys);
    for (const [k, v] of pairs) if (v != null) mem.set(k, v);
  } catch {
    /* a cold or corrupt store is not worth blocking startup for */
  }
}

export function getItem(key) {
  if (mem.has(key)) return mem.get(key);
  if (isWeb) {
    try {
      const v = localStorage.getItem(key);
      if (v != null) mem.set(key, v);
      return v;
    } catch {
      return null;   // private window, or storage blocked
    }
  }
  return null;
}

export function setItem(key, value) {
  mem.set(key, value);
  if (isWeb) {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
  } else if (native) {
    native.setItem(key, value).catch(() => {});
  }
}

export function removeItem(key) {
  mem.delete(key);
  if (isWeb) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  } else if (native) {
    native.removeItem(key).catch(() => {});
  }
}

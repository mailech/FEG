/**
 * Log capture and persistence.
 *
 * The row schema itself lives in schema.js, deliberately free of React Native
 * so the same builder runs under plain node (see scripts/make-synthetic.mjs).
 * This file adds the three things that only make sense inside the app: the
 * platform string, persistence across reloads, and the CSV download.
 *
 * Persistence is localStorage on web and in-memory elsewhere. That is the
 * honest version of the on-device promise in §4 of the architecture: the log
 * sits in the browser's own storage for this origin, and nothing crosses the
 * network unless someone presses Export.
 */

import { Platform } from 'react-native';
import { COLUMNS, toRow, toCsv, pseudoId, EVENT_MAP } from './schema';

export { COLUMNS, toRow, toCsv, pseudoId, EVENT_MAP };

export const PLATFORM =
  Platform.OS === 'web' ? 'web' : Platform.OS === 'ios' ? 'SB iOS' : 'SB Android';

const KEY = 'lantern.logs.v1';
const MAX_PERSISTED = 40000;

const store = () => {
  try {
    return Platform.OS === 'web' && typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    // Private windows and blocked site-data throw on access, not on use.
    return null;
  }
};

/** Rows captured in earlier sessions, or [] if storage is unavailable. */
export function loadRows() {
  const s = store();
  if (!s) return [];
  try {
    const raw = s.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRows(rows) {
  const s = store();
  if (!s) return false;
  try {
    s.setItem(KEY, JSON.stringify(rows.slice(-MAX_PERSISTED)));
    return true;
  } catch {
    // Quota exceeded — drop the oldest half rather than losing the lot.
    try {
      s.setItem(KEY, JSON.stringify(rows.slice(-Math.floor(rows.length / 2))));
      return true;
    } catch {
      return false;
    }
  }
}

export function clearRows() {
  const s = store();
  if (s) { try { s.removeItem(KEY); } catch { /* nothing to do */ } }
}

export const canPersist = () => !!store();

/** Browser download. On native this returns the CSV for the caller to share. */
export function download(rows, filename = 'lantern_event_logs.csv') {
  const csv = toCsv(rows);
  if (Platform.OS !== 'web' || typeof document === 'undefined') return csv;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return csv;
}

/**
 * The demo profile.
 *
 * Registration and identity verification are explicitly out of scope for
 * Challenge 01, and the hackathon data rule forbids real personal data outright.
 * So this is deliberately the thinnest thing that still lets the product behave
 * as though it knows who is holding the phone: a display name, an age band, a
 * market, and a set of limits the player chooses for themselves.
 *
 * It is held by lantern/storage.js and never leaves the device — the same rule
 * the behavioural model follows. Nothing here is transmitted to the relay.
 *
 * The age gate is not decoration. Croatia's Regulation on Measures for Socially
 * Responsible Organisation requires an age check and a register check before
 * play, so the prototype models both as a gate in front of the product rather
 * than a checkbox inside it.
 */

import { getItem, setItem, removeItem } from './storage';

export const PROFILE_KEY = 'lantern.profile.v1';
const KEY = PROFILE_KEY;

export const AGE_BANDS = ['18-24', '25-34', '35-44', '45-54', '55+'];
export const MARKETS = [
  { value: 'hr', label: 'Croatia · PSK' },
  { value: 'cz', label: 'Czechia · Fortuna' },
  { value: 'sk', label: 'Slovakia · Fortuna' },
];

export const DEFAULT_LIMITS = {
  dailyDepositCents: 5000,
  sessionMinutes: 60,
  realityCheckMinutes: 15,
};

export function loadProfile() {
  const raw = getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;   // corrupt entry, treat as signed out
  }
}

export function saveProfile(p) {
  setItem(KEY, JSON.stringify(p));
  return p;
}

export function clearProfile() {
  removeItem(KEY);
}

export function createProfile({ name, ageBand, market }) {
  return saveProfile({
    name: (name || '').trim().slice(0, 32) || 'Guest',
    ageBand,
    market,
    createdAt: Date.now(),
    limits: { ...DEFAULT_LIMITS },
    selfExcluded: false,
    // Opting in to being contactable about a published outcome. Off by default,
    // because consent that is on by default is not consent.
    contactable: false,
  });
}

/** A stable pseudonym for display. Never an identifier we could resolve back. */
export function handleFor(profile) {
  if (!profile) return 'guest';
  let h = 0x811c9dc5;
  const s = profile.name + profile.createdAt;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return `${profile.name.split(' ')[0].toLowerCase()}·${h.toString(36).slice(0, 4)}`;
}

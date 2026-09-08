/**
 * Pull the live PSK casino catalogue for the demo.
 *
 *   node Solution/scripts/fetch-catalog.mjs
 *
 * Source: feg-casino-portal-api.psk.hr — the same public endpoint the lobby
 * itself calls. It returns real RTP, volatility, bet limits, jackpot flags and
 * category membership, plus asset UUIDs that resolve to cover art at
 * /api/Assets/<uuid>.
 *
 * We store the UUIDs, never the images. The app points <Image> at the live URL,
 * so no FEG artwork is copied into this repo — it is referenced the way the
 * lobby references it, and only for the demo.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../app/src/data');
const API = 'https://feg-casino-portal-api.psk.hr/api';
export const ASSET = (id) => `${API}/Assets/${id}`;

const get = async (path) => {
  const res = await fetch(`${API}/${path}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
};

/** The API's numeric volatility is 1–5; our recommender bands 1–4. */
const band = (v) => Math.max(1, Math.min(4, Math.round((v ?? 3) * 0.8)));

/** Mechanic from the title, so covers and neighbours stay coherent when the
 *  API gives us only `type`. Mirrors extract-data.mjs. */
const MECHANIC_RULES = [
  [/bell link|hold and win|hold & win|golden coins|link\b|jackpot|pots?\b/i, 'link-jackpot'],
  [/blackjack|roulette|baccarat|poker|dice|rulet/i, 'table'],
  [/gates of|sugar rush|cluster|tumble|scatter/i, 'cluster-tumble'],
  [/book of|egypt|scarab|pharaoh|ramses/i, 'book-adventure'],
  [/super hot|burning hot|sizzling|fruit|seven|stars|cherry|joker|roll/i, 'classic-fruit'],
];
const mechanicOf = (name, type) => {
  if (/live/i.test(type || '')) return 'table';
  for (const [re, m] of MECHANIC_RULES) if (re.test(name)) return m;
  return 'video-slot';
};

console.log('fetching catalogue…');
const [games, categories] = await Promise.all([
  get('Games?locale=hr-HR&status=Published&pageSize=4000'),
  get('Categories?locale=hr-HR').catch(() => []),
]);

const catById = new Map((Array.isArray(categories) ? categories : []).map((c) => [c.id, c.name || c.title]));

const catalog = games
  .filter((g) => g.name && g.thumbnail)
  .map((g, i) => {
    const mechanic = mechanicOf(g.name, g.type);
    return {
      id: 'lg' + i,
      name: g.name,
      provider: g.gameProvider || 'Unknown',
      gameCode: g.gameCode || null,
      art: g.thumbnail,
      artPortrait: g.portraitImage || null,
      type: g.type || 'Slot',
      mechanic,
      volatility: band(g.volatility),
      rtp: g.rtp ? +g.rtp.toFixed(2) : null,
      jackpot: !!g.jackpot,
      demo: !!g.demoEnabled,
      minBet: g.minBet ?? null,
      maxBet: g.maxBet ?? null,
      maxWin: g.maxWin ?? null,
      reels: g.numberOfReels ?? null,
      label: g.labels?.[0]
        ? { text: g.labels[0].title, color: g.labels[0].color, isNew: !!g.labels[0].isNew }
        : null,
      categories: (g.categories || []).map((c) => catById.get(c.id)).filter(Boolean),
      // Slots resolve every few seconds; live tables are slower. The constrained
      // axis in the recommender (LANTERN-ARCHITECTURE.md §3.3b).
      eventFrequencySec: /live/i.test(g.type || '') ? 45 : 3,
      // Popularity prior: the API has no play counts, so commercialTier stands
      // in. Lower tier number = more prominent in the live lobby.
      prominence: g.commercialTier ?? 50,
    };
  })
  .sort((a, b) => a.prominence - b.prominence);

const providers = [...new Set(catalog.map((g) => g.provider))].sort();
const labels = [...new Set(catalog.map((g) => g.label?.text).filter(Boolean))];

await mkdir(OUT, { recursive: true });
await writeFile(
  resolve(OUT, 'live-catalog.json'),
  JSON.stringify({ assetBase: `${API}/Assets/`, fetchedAt: new Date().toISOString(), games: catalog }, null, 0) + '\n'
);

console.log(`games        ${catalog.length}`);
console.log(`providers    ${providers.length}`);
console.log(`jackpots     ${catalog.filter((g) => g.jackpot).length}`);
console.log(`with RTP     ${catalog.filter((g) => g.rtp).length}`);
console.log(`labels       ${labels.join(', ') || '—'}`);
console.log(`types        ${[...new Set(catalog.map((g) => g.type))].join(', ')}`);
console.log(`\nwrote -> Solution/app/src/data/live-catalog.json`);
console.log(`art served from ${API}/Assets/<uuid> — referenced, never copied`);

/**
 * Extract the Lantern demo dataset from the FEG event logs.
 *
 * Reads  ../../top_casino_users_event_logs.csv   (332k rows, ~87 MB, not committed)
 * Writes ../app/src/data/*.json                  (small, committed)
 *
 *   node Solution/scripts/extract-data.mjs
 *
 * Everything the app shows comes from here. No invented game names, no invented
 * sections, no invented funnel numbers.
 */

import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../top_casino_users_event_logs.csv');
const OUT = resolve(HERE, '../app/src/data');

const COLS = [
  'event_name', 'session', 'timestamp', 'platform', 'game_name', 'provider',
  'from_origin', 'on_origin', 'on_origin_name', 'jackpot', 'on_route', 'from_route',
  'demo', 'page_location', 'page_referrer', 'fortuna_screen_name', 'status',
  'added_from', 'sport_name', 'betslip_number', 'betslip_type', 'fixture_id',
  'selection_id', 'PlayerID',
];

const nn = (v) => (v === 'null' || v === '' || v === undefined ? null : v);

/** Rows have no quoted fields, but URLs sit in late columns. Take the first
 *  N fields positionally and treat any overflow as belonging to the URL block,
 *  which we do not read. Anomalies are counted and reported rather than hidden. */
function parse(line) {
  const p = line.split(',');
  const row = {};
  for (let i = 0; i < COLS.length; i++) row[COLS[i]] = nn(p[i]);
  // PlayerID is always last and always a 64-char hash — recover it from the tail.
  if (p.length !== COLS.length) row.PlayerID = nn(p[p.length - 1]);
  return { row, ragged: p.length !== COLS.length };
}

/* ---------- mechanic + attribute inference from real title names ---------- */

const MECHANIC_RULES = [
  [/bell link|hold and win|hold & win|golden coins link|link\b|jackpot|pots?\b/i, 'link-jackpot'],
  [/blackjack|roulette|baccarat|poker|dice/i, 'table'],
  [/gates of|sugar rush|cluster|tumble|scatter/i, 'cluster-tumble'],
  [/super hot|burning hot|sizzling|fruits?|seven|stars|cherry|joker/i, 'classic-fruit'],
  [/book of|egypt|scarab|pharaoh|ramses/i, 'book-adventure'],
];

const VOLATILITY = {
  'table': 1,
  'classic-fruit': 2,
  'link-jackpot': 3,
  'book-adventure': 4,
  'cluster-tumble': 4,
  'video-slot': 3,
};

function mechanicOf(name) {
  for (const [re, m] of MECHANIC_RULES) if (re.test(name)) return m;
  return 'video-slot';
}

/* --------------------------------- main --------------------------------- */

const games = new Map();     // name -> stats
const sections = new Map();  // on_origin_name -> launches
const entry = new Map();     // on_origin -> launches
const sports = new Map();    // normalised sport -> adds
const platforms = new Map();
const events = new Map();

const sessAdd = new Set();
const sessPlaced = new Set();
const sessAny = new Set();
const players = new Set();
const sessionsOf = new Map(); // session -> {events, first, last, player, platform}

let total = 0;
let ragged = 0;

const rl = createInterface({
  input: createReadStream(SRC, { encoding: 'utf8' }),
  crlfDelay: Infinity,
});

let header = true;
for await (const line of rl) {
  if (header) { header = false; continue; }
  if (!line) continue;
  const { row, ragged: r } = parse(line);
  if (r) ragged++;
  total++;

  const ev = row.event_name;
  events.set(ev, (events.get(ev) || 0) + 1);
  if (row.platform) platforms.set(row.platform, (platforms.get(row.platform) || 0) + 1);
  if (row.PlayerID) players.add(row.PlayerID);

  const sid = row.session;
  if (sid) {
    sessAny.add(sid);
    let s = sessionsOf.get(sid);
    if (!s) {
      s = { id: sid, n: 0, first: row.timestamp, last: row.timestamp, platform: row.platform, games: [], sports: [], adds: 0, placed: 0 };
      sessionsOf.set(sid, s);
    }
    s.n++;
    if (row.timestamp < s.first) s.first = row.timestamp;
    if (row.timestamp > s.last) s.last = row.timestamp;
  }

  if (ev === 'casino_game_launch') {
    const name = row.game_name;
    if (name) {
      let g = games.get(name);
      if (!g) {
        g = { name, provider: row.provider, launches: 0, viaSearch: 0, viaCategory: 0, viaGrid: 0, jackpot: false, sections: new Map() };
        games.set(name, g);
      }
      g.launches++;
      if (row.provider && !g.provider) g.provider = row.provider;
      if (row.jackpot === 'true') g.jackpot = true;
      if (row.on_origin === 'search_results') g.viaSearch++;
      else if (row.on_origin === 'category_game_row') g.viaCategory++;
      else if (row.on_origin === 'grid') g.viaGrid++;
      if (row.on_origin_name) g.sections.set(row.on_origin_name, (g.sections.get(row.on_origin_name) || 0) + 1);
      if (sid) sessionsOf.get(sid).games.push(name);
    }
    if (row.on_origin_name) sections.set(row.on_origin_name, (sections.get(row.on_origin_name) || 0) + 1);
    if (row.on_origin) entry.set(row.on_origin, (entry.get(row.on_origin) || 0) + 1);
  }

  if (ev === 'betslip_add_bet') {
    if (sid) { sessAdd.add(sid); sessionsOf.get(sid).adds++; }
    if (row.sport_name) {
      // The feed is inconsistent about casing: "Nogomet" and "nogomet" both occur.
      const sp = row.sport_name.charAt(0).toUpperCase() + row.sport_name.slice(1).toLowerCase();
      sports.set(sp, (sports.get(sp) || 0) + 1);
      if (sid) sessionsOf.get(sid).sports.push(sp);
    }
  }

  if (ev === 'betslip_placed_bet') {
    if (sid) { sessPlaced.add(sid); sessionsOf.get(sid).placed++; }
  }
}

/* ------------------------------- derive --------------------------------- */

const sortDesc = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);

const catalog = [...games.values()]
  .sort((a, b) => b.launches - a.launches)
  .map((g, i) => {
    const mechanic = mechanicOf(g.name);
    const topSection = sortDesc(g.sections)[0];
    return {
      id: 'g' + i,
      name: g.name,
      provider: g.provider || 'Unknown',
      launches: g.launches,
      jackpot: g.jackpot,
      mechanic,
      volatility: VOLATILITY[mechanic],
      // Slot resolutions land every few seconds; this is the constrained axis
      // in the recommender (see LANTERN-ARCHITECTURE.md §3.3b).
      eventFrequencySec: mechanic === 'table' ? 45 : 3,
      searchShare: g.launches ? +(g.viaSearch / g.launches).toFixed(3) : 0,
      topSection: topSection ? topSection[0] : null,
    };
  });

const bothAddPlaced = [...sessAdd].filter((s) => sessPlaced.has(s)).length;
const abandoned = sessAdd.size - bothAddPlaced;

const entryRows = sortDesc(entry).filter(([k]) => k !== 'null');
const entryTotal = entryRows.reduce((a, [, v]) => a + v, 0);

const sessionList = [...sessionsOf.values()];
const durations = sessionList
  .map((s) => (Date.parse(s.last) - Date.parse(s.first)) / 60000)
  .filter((d) => d >= 0 && Number.isFinite(d))
  .sort((a, b) => a - b);
const pct = (p) => durations[Math.floor(durations.length * p)] || 0;

const metrics = {
  generatedAt: new Date().toISOString(),
  source: 'top_casino_users_event_logs.csv',
  totalEvents: total,
  raggedRows: ragged,
  players: players.size,
  sessions: sessAny.size,
  eventMix: sortDesc(events).map(([name, n]) => ({ name, n })),
  platforms: sortDesc(platforms).map(([name, n]) => ({ name, n })),
  finalStep: {
    sessionsWithAdd: sessAdd.size,
    sessionsWithPlaced: sessPlaced.size,
    sessionsBoth: bothAddPlaced,
    abandoned,
    abandonRate: +(abandoned / sessAdd.size).toFixed(4),
  },
  discovery: {
    rows: entryRows.map(([name, n]) => ({ name, n, share: +(n / entryTotal).toFixed(4) })),
    searchBeatsCategory:
      (entry.get('search_results') || 0) > (entry.get('category_game_row') || 0),
  },
  sessionMinutes: { p50: +pct(0.5).toFixed(1), p90: +pct(0.9).toFixed(1), p99: +pct(0.99).toFixed(1) },
};

const sectionRows = sortDesc(sections)
  .filter(([k]) => k !== 'null')
  .map(([name, n]) => ({ name, n }));

const sportRows = sortDesc(sports).map(([name, n]) => ({ name, n }));

// A few real sessions worth replaying in the monitor: long, casino-heavy,
// and ending without a placed bet where possible.
const traces = sessionList
  .filter((s) => s.games.length >= 6)
  .sort((a, b) => b.games.length - a.games.length)
  .slice(0, 12)
  .map((s) => ({
    id: s.id,
    platform: s.platform,
    events: s.n,
    minutes: +((Date.parse(s.last) - Date.parse(s.first)) / 60000).toFixed(1),
    games: s.games.slice(0, 40),
    distinctGames: new Set(s.games).size,
    adds: s.adds,
    placed: s.placed,
  }));

/* -------------------------------- write --------------------------------- */

await mkdir(OUT, { recursive: true });
const write = (f, o) => writeFile(resolve(OUT, f), JSON.stringify(o, null, 2) + '\n');

await write('catalog.json', catalog);
await write('sections.json', sectionRows);
await write('sports.json', sportRows);
await write('metrics.json', metrics);
await write('traces.json', traces);

console.log(`events        ${total.toLocaleString()}  (ragged ${ragged})`);
console.log(`players       ${players.size}`);
console.log(`sessions      ${sessAny.size.toLocaleString()}`);
console.log(`catalog       ${catalog.length} titles, ${new Set(catalog.map(g => g.provider)).size} providers`);
console.log(`sections      ${sectionRows.length}`);
console.log(`sports        ${sportRows.length}`);
console.log(`final step    ${abandoned}/${sessAdd.size} abandoned = ${(abandoned / sessAdd.size * 100).toFixed(1)}%`);
console.log(`discovery     search ${entry.get('search_results') || 0} vs category ${entry.get('category_game_row') || 0}`);
console.log(`traces        ${traces.length}`);
console.log(`\nwrote -> Solution/app/src/data/`);

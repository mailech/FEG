/**
 * Extract the sportsbook + benchmark datasets.
 *
 * Reads  ../../EPS_Offers.csv            1.7 GB, 11.3M odds snapshots (not committed)
 *        ../../hackathon_casino_trends.xlsx
 * Writes ../app/src/data/*.json
 *
 *   node Solution/scripts/extract-sports.mjs
 *
 * EPS_Offers is an odds *history* feed, not a fixture list: each row is one
 * price with the window it was live for. That is what lets the confirm screen
 * show real movement instead of a made-up arrow.
 */

import { createReadStream, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const EPS = resolve(HERE, '../../EPS_Offers.csv');
const XLSX = resolve(HERE, '../../hackathon_casino_trends.xlsx');
const OUT = resolve(HERE, '../app/src/data');

// The file is far larger than we need for a demo and Windows/OneDrive will
// intermittently lock it, so read a bounded prefix. 4M rows already yields
// 6,000+ matches across every sport in the feed.
const MAX_ROWS = 4_000_000;

/** Proper CSV split — tournament names contain commas inside quotes. */
function splitCsv(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const SPORT_HR = {
  Soccer: 'Nogomet',
  Tennis: 'Tenis',
  Basketball: 'Košarka',
  'Ice Hockey': 'Hokej',
  MMA: 'Borilački sportovi',
};

/* ----------------------------- scan EPS ---------------------------------- */

const sports = new Map();                 // sport -> { n, tournaments:Map }
const matches = new Map();                // key -> { sport, tournament, match, markets:Map }
let rows = 0;

const rl = createInterface({
  input: createReadStream(EPS, { encoding: 'utf8' }),
  crlfDelay: Infinity,
});

let header = true;
outer:
for await (const line of rl) {
  if (header) { header = false; continue; }
  if (!line) continue;
  if (++rows > MAX_ROWS) break outer;

  const p = splitCsv(line);
  if (p.length < 9) continue;

  const [, sport, tournament, match, marketName, odds, start, end] = p;
  const price = Number(odds);
  if (!sport || !match || !Number.isFinite(price)) continue;

  let s = sports.get(sport);
  if (!s) { s = { n: 0, tournaments: new Map() }; sports.set(sport, s); }
  s.n++;
  s.tournaments.set(tournament, (s.tournaments.get(tournament) || 0) + 1);

  const key = sport + '|' + match;
  let m = matches.get(key);
  if (!m) {
    m = { sport, tournament, match, markets: new Map(), n: 0 };
    matches.set(key, m);
  }
  m.n++;

  let mk = m.markets.get(marketName);
  if (!mk) { mk = { name: marketName, prices: [] }; m.markets.set(marketName, mk); }
  // Keep a short price history so movement is derivable.
  if (mk.prices.length < 8) mk.prices.push({ odds: price, start, end });
}
rl.close();

/* ---------------------------- shape output -------------------------------- */

const sortDesc = (m, k) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k);

const sportRows = [...sports.entries()]
  .sort((a, b) => b[1].n - a[1].n)
  .map(([name, s]) => ({
    name,
    nameHr: SPORT_HR[name] || name,
    priceUpdates: s.n,
    tournaments: sortDesc(s.tournaments, 14).map(([t, n]) => ({ name: t.replace(/\s+/g, ' ').trim(), n })),
    tournamentCount: s.tournaments.size,
  }));

/** Matches deep enough to look real, with movement where the feed shows it. */
const offers = [...matches.values()]
  .filter((m) => m.markets.size >= 6)
  .sort((a, b) => b.n - a.n)
  .slice(0, 80)
  .map((m, i) => {
    const markets = [...m.markets.values()]
      .slice(0, 8)
      .map((mk) => {
        const first = mk.prices[0];
        const last = mk.prices[mk.prices.length - 1];
        const moved = mk.prices.length > 1 ? +(last.odds - first.odds).toFixed(2) : 0;
        return {
          name: mk.name.replace(/\s+/g, ' ').trim(),
          odds: last.odds,
          opened: first.odds,
          moved,
          updates: mk.prices.length,
        };
      });

    const [home, away] = m.match.split(' vs. ');
    return {
      id: 'm' + i,
      sport: m.sport,
      sportHr: SPORT_HR[m.sport] || m.sport,
      tournament: m.tournament.replace(/\s+/g, ' ').trim(),
      match: m.match,
      home: (home || m.match).trim(),
      away: (away || '').trim(),
      priceUpdates: m.n,
      marketCount: m.markets.size,
      markets,
    };
  });

/* --------------------------- benchmarks (xlsx) ---------------------------- */

/** Read the xlsx without an exclusive lock.
 *  Excel keeps the file open, so ZipFile.OpenRead fails. readFileSync takes a
 *  shared read, and a zip central directory is cheap to walk by hand. */
function readTrends() {
  const buf = readFileSync(XLSX);

  // End of central directory, scanned backwards past any comment.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const cmtLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.set(name, { method, compSize, local });
    p += 46 + nameLen + extraLen + cmtLen;
  }

  const read = (name) => {
    const e = entries.get(name);
    if (!e) throw new Error('missing ' + name);
    const lnLen = buf.readUInt16LE(e.local + 26);
    const lxLen = buf.readUInt16LE(e.local + 28);
    const start = e.local + 30 + lnLen + lxLen;
    const raw = buf.subarray(start, start + e.compSize);
    return (e.method === 8 ? inflateRawSync(raw) : raw).toString('utf8');
  };

  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>(.*?)<\/si>/gs)]
    .map((m) => [...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((t) => t[1]).join(''));

  const sheet = read('xl/worksheets/sheet1.xml');
  const out = [];
  for (const rowM of sheet.matchAll(/<row[^>]*>(.*?)<\/row>/gs)) {
    const cells = [];
    // Capture the whole cell tag, then look for t="s" inside it — an optional
    // group after a lazy [^>]*? will happily skip the attribute entirely.
    for (const cM of rowM[1].matchAll(/<c([^>]*)\/?>(?:<v>(.*?)<\/v>)?/gs)) {
      const isShared = /\st="s"/.test(cM[1]);
      const v = cM[2];
      cells.push(isShared && v != null ? shared[+v] : v ?? '');
    }
    out.push(cells);
  }
  return out;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const monthOf = (serial) =>
  new Date(EXCEL_EPOCH + Number(serial) * 86400000).toISOString().slice(0, 7);

let benchmarks = [];
try {
  const raw = readTrends();
  benchmarks = raw
    .slice(1)
    .filter((r) => r.length >= 7 && r[0]?.trim() && r[1]?.trim() && Number(r[1]))
    .map((r) => ({
      market: r[0].trim(),
      month: monthOf(r[1]),
      stakePerSession: +Number(r[2]).toFixed(2),
      spinsPerSession: +Number(r[3]).toFixed(1),
      gamesPerSession: +Number(r[4]).toFixed(2),
      sessionsPerPlayer: +Number(r[5]).toFixed(2),
      medianSessionSec: Math.round(Number(r[6])),
    }))
    .sort((a, b) => (a.market === b.market ? a.month.localeCompare(b.month) : a.market.localeCompare(b.market)));
} catch (e) {
  console.warn('benchmarks: could not read xlsx —', e.message);
}

/* -------------------------------- write ----------------------------------- */

await mkdir(OUT, { recursive: true });
const write = (f, o) => writeFile(resolve(OUT, f), JSON.stringify(o, null, 2) + '\n');

await write('sportsbook.json', { sports: sportRows, scannedRows: rows - 1 });
await write('offers.json', offers);
await write('benchmarks.json', benchmarks);

console.log(`scanned      ${(rows - 1).toLocaleString()} price updates`);
console.log(`sports       ${sportRows.length} — ${sportRows.map((s) => `${s.name} (${s.tournamentCount} comps)`).join(', ')}`);
console.log(`offers       ${offers.length} matches, ${offers.reduce((a, o) => a + o.marketCount, 0).toLocaleString()} markets between them`);
console.log(`movement     ${offers.filter((o) => o.markets.some((m) => m.moved !== 0)).length} matches show real price movement`);
console.log(`benchmarks   ${benchmarks.length} rows · ${[...new Set(benchmarks.map((b) => b.market))].join(', ')}`);
console.log(`\nwrote -> Solution/app/src/data/`);

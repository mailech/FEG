/**
 * Write synthetic training data straight to disk.
 *
 *   node Solution/scripts/make-synthetic.mjs                # 5,000 sessions
 *   node Solution/scripts/make-synthetic.mjs 50000          # 50,000 sessions
 *   node Solution/scripts/make-synthetic.mjs 50000 12345    # …with a seed
 *
 * Writes Solution/data/synthetic_event_logs.csv in FEG's own 24-column schema,
 * plus a manifest recording the seed and archetype mix so the run is
 * reproducible and auditable.
 *
 * This exists because clicking a button in the Monitor tab is a fine way to
 * show the mechanism and a bad way to produce a training set. Same generator,
 * same row builder as the app — synth.js and schema.js are dependency-free
 * precisely so they run here unchanged.
 */

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, ARCHETYPES } from '../app/src/lantern/synth.js';
import { toCsv } from '../app/src/lantern/schema.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, '../data');
const APP_DATA = resolve(HERE, '../app/src/data');

const sessions = Number(process.argv[2]) || 5000;
const seed = Number(process.argv[3]) || Date.now() >>> 0;

const json = async (f) => JSON.parse(await readFile(resolve(APP_DATA, f), 'utf8'));

console.log(`generating ${sessions.toLocaleString()} sessions (seed ${seed})…`);

const [liveCat, offers, sections] = await Promise.all([
  json('live-catalog.json'),
  json('offers.json'),
  json('sections.json'),
]);

const out = generate({
  sessions,
  seed,
  platform: 'SB Android',
  corpus: { catalog: liveCat.games, offers, sections },
});

await mkdir(DATA, { recursive: true });
const csvPath = resolve(DATA, 'synthetic_event_logs.csv');
await writeFile(csvPath, toCsv(out.rows));

const manifest = {
  generatedAt: new Date().toISOString(),
  generator: 'Solution/scripts/make-synthetic.mjs',
  seed,
  sessions,
  rows: out.rows.length,
  archetypes: Object.fromEntries(
    Object.entries(out.summary).map(([k, n]) => [k, { sessions: n, note: ARCHETYPES[k].note }])
  ),
  corpus: {
    catalog: liveCat.games.length,
    offers: offers.length,
    sections: sections.length,
  },
  notes: [
    'Schema matches top_casino_users_event_logs.csv exactly — same columns, same order.',
    'Events prefixed lantern_ have no FEG-native equivalent; filter them out to train on FEG events only.',
    'from_origin carries the planted archetype, from_route the risk state at that instant. Those are the labels.',
    'Sportsbook legs abandon at 21.6%, the rate measured in the real logs.',
    'Synthetic throughout. It demonstrates the mechanism; it is not evidence about real players.',
  ],
};
await writeFile(resolve(DATA, 'synthetic_manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const { size } = await stat(csvPath);
console.log(`rows         ${out.rows.length.toLocaleString()}`);
console.log(`archetypes   ${Object.entries(out.summary).map(([k, n]) => `${k} ${n}`).join(' · ')}`);
console.log(`size         ${(size / 1048576).toFixed(1)} MB`);
console.log(`\nwrote -> Solution/data/synthetic_event_logs.csv`);
console.log(`         Solution/data/synthetic_manifest.json`);

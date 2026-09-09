/**
 * Smoke test for the trained heads:  node Solution/scripts/probe-model.mjs
 *
 * Drives model.js with three hand-built sessions whose character is not in
 * doubt, and checks the heads call each one correctly with no NaNs in the
 * feature vector. Feature-order drift between train_lantern.py and model.js is
 * the failure this catches — it is silent everywhere else.
 *
 * Metro resolves `import x from './x.json'` and bare relative paths; plain node
 * needs an import attribute and a file extension. Both are rewritten here so
 * the app source stays idiomatic.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '../app/src/lantern/model.js'), 'utf8').replace("from './sco'", "from './sco.js'").replace(
  "import models from '../data/models.json';",
  "import fs from 'node:fs';\nimport { fileURLToPath as f } from 'node:url';\nconst models = JSON.parse(fs.readFileSync(new URL('../data/models.json', import.meta.url), 'utf8'));"
);
const tmp = path.join(here, '../app/src/lantern/__model_probe.mjs');
fs.writeFileSync(tmp, src);

const M = await import('../app/src/lantern/__model_probe.mjs');
const { createSCO, apply, emptyPrior } = await import('../app/src/lantern/sco.js');

const at = (m) => Date.parse('2026-09-08T20:00:00Z') + m * 60000;
const run = (events) => {
  let sco = createSCO(emptyPrior, at(0));
  for (const e of events) sco = apply(sco, e);
  return sco;
};

// A browser: opens a lot, commits to nothing.
const browser = [];
for (let i = 0; i < 9; i++) {
  browser.push({ t: 'game_open', gameId: 'g' + i, at: at(i * 0.4), section: 'row' });
  browser.push({ t: 'game_close', gameId: 'g' + i, durMs: 9000, at: at(i * 0.4 + 0.2) });
}

// A chaser: long losing run, stake climbing, turbo, a deposit.
const chaser = [{ t: 'game_open', gameId: 'g0', at: at(0), section: 'row' }];
let stake = 100;
for (let i = 0; i < 90; i++) {
  const won = i % 11 === 0;
  if (!won && i > 8 && i % 7 === 0) { stake = Math.min(stake * 2, 4000); chaser.push({ t: 'stake_change', to: stake, at: at(i * 0.5) }); }
  chaser.push({ t: 'spin', gameId: 'g0', stake, payout: won ? stake * 3 : 0, at: at(i * 0.5) });
}
chaser.push({ t: 'turbo', on: true, at: at(46) });
chaser.push({ t: 'deposit', amount: 5000, at: at(47) });

// A specialist: one title, even stake, patient.
const spec = [{ t: 'game_open', gameId: 'g0', at: at(0), section: 'row' }];
for (let i = 0; i < 70; i++) spec.push({ t: 'spin', gameId: 'g0', stake: 120, payout: i % 3 === 0 ? 200 : 0, at: at(i * 0.7) });

for (const [name, evs] of [['browser', browser], ['chaser', chaser], ['specialist', spec]]) {
  const sco = run(evs);
  const p = M.predict(sco);
  const bad = p.x.filter((v) => !Number.isFinite(v)).length;
  console.log(
    `${name.padEnd(11)} -> ${p.archetype.key.padEnd(11)} (${p.archetype.label}) ` +
    `conf ${p.archetype.confidence.toFixed(2)}  risk ${p.risk.p.toFixed(3)} ${p.risk.state}  ` +
    `conv ${p.conversion.p.toFixed(2)}  cohort ${p.cohort.id}  nonfinite ${bad}`
  );
  console.log(`             why: ${p.archetype.why.map((w) => w.label).join(', ')}`);
}

// Ranking sanity: does the ranker reorder against raw popularity?
const sco = run(browser.slice(0, 6));
const names = [...M.GAME_STATS.keys()];
const ctx = M.rankingContext([...new Set(sco.seq)], 0);
const byPop = [...names].sort((a, b) => M.GAME_STATS.get(b).l - M.GAME_STATS.get(a).l).slice(0, 6);
const byModel = names.map((n) => ({ n, s: M.scoreGame(n, ctx).score }))
  .sort((a, b) => b.s - a.s).slice(0, 6).map((x) => x.n);
console.log('\ngeneric top 6:', byPop.join(' | '));
console.log('lantern top 6:', byModel.join(' | '));
console.log('overlap:', byPop.filter((n) => byModel.includes(n)).length, 'of 6');

const fit = M.fitFor(byModel[0], ctx);
console.log('\nfit example:', byModel[0], JSON.stringify({ fit: +fit.fit.toFixed(3), hitRate: fit.hitRate, vol: fit.volatility, reasons: fit.reasons }));
console.log('eval replay uplift recall@6:', M.EVAL.replay.uplift.recall_at_6);

fs.unlinkSync(tmp);

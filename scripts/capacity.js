/**
 * Capacity model.
 *
 * Turns MEASURED edge occupancy into the concurrency number the pitch rests
 * on, instead of asserting "800 vs 10,000" from a slide. Run it after a bench
 * pass so it reads the occupancy this machine actually produced.
 *
 *   node scripts/capacity.js [concurrentPlayers] [launchesPerPlayerPerHour]
 */

const EDGE = process.env.EDGE_URL || 'http://localhost:4002';

const players = Number(process.argv[2] || 10_000);
const launchesPerHour = Number(process.argv[3] || 60); // once a minute

const stats = await fetch(`${EDGE}/stats`).then((r) => r.json());
const measured = stats.pool.avgEdgeSecondsPerLaunch;

if (!measured) {
  console.error('No completed launches yet. Run scripts/bench.js first.');
  process.exit(1);
}

/**
 * Little's Law. Concurrent instances = arrival rate x mean occupancy.
 * The whole cost argument is that occupancy is seconds, not the session.
 */
function concurrency(occupancySec) {
  const launchesPerSec = (players * launchesPerHour) / 3600;
  return launchesPerSec * occupancySec;
}

const rows = [
  ['measured (this rig)', measured],
  ['if device load halved', measured / 2],
  ['if working-set loading lands (PRD 4B)', 3.0],
];

/**
 * Cloud gaming does NOT follow the arrival-rate model: it pins one instance
 * per player for the whole session, so its concurrency is simply the player
 * count. Running it through Little's Law would inflate it absurdly and the
 * first technical judge to notice would be right to discount everything else
 * on the slide.
 */
const cloud = players;
const n = (x) => Math.ceil(x).toLocaleString('en-US');

console.log(`\nAssumptions: ${n(players)} concurrent players, ${launchesPerHour} launches/player/hour`);
console.log(`Measured mean edge occupancy: ${measured}s per launch (from ${stats.pool.released} releases)\n`);
console.log('scenario                                  occupancy    concurrent instances   vs cloud gaming');
console.log('-'.repeat(96));
for (const [label, occ] of rows) {
  const c = concurrency(occ);
  console.log(
    label.padEnd(42) +
    `${occ.toFixed(1)}s`.padStart(9) +
    `${n(c)}`.padStart(23) +
    `${(cloud / c).toFixed(1)}x fewer`.padStart(18)
  );
}
console.log(
  'cloud gaming (one instance per player)'.padEnd(42) +
  'session'.padStart(9) + `${n(cloud)}`.padStart(23) + '1.0x'.padStart(18)
);

console.log(`
Read this honestly on stage:

  The edge instance is occupied for ${measured}s, not for the session. That is the
  entire cost argument, and it is why this is not cloud gaming.

  Occupancy here is dominated by how long the DEVICE takes to pull its own
  copy (~6.6s at 15 Mbps for a 12 MB bundle), not by anything the edge does.
  Claiming a warm context costs ${stats.pool.claimWait.p50}ms. So the lever that lowers cost
  further is working-set loading on the device, not more edge capacity.
`);

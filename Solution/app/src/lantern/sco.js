/**
 * Event bus + Session Context Object.
 *
 * LANTERN-ARCHITECTURE.md §3.1 / §3.2. One typed, append-only ring buffer and
 * one rolling object every head reads. Nothing here leaves the device: the SCO
 * lives in memory, the player prior would live in IndexedDB / AsyncStorage.
 *
 * Deliberately absent: free text, keystroke timing, device sensors.
 */

export const RING = 500;

/** A fresh session. `now` is injectable so traces can be replayed. */
export function createSCO(prior, now = Date.now()) {
  return {
    sessionId: 's' + now.toString(36),
    startedAt: now,
    lastAt: now,

    events: [],          // ring buffer, most recent last
    seq: [],             // gameId interaction sequence
    byGame: {},          // gameId -> { spins, wins, staked, returned }
    sports: {},          // sport name -> touches, for the cross-vertical read
    dwell: {},           // gameId -> ms
    launchedFrom: {},    // section name -> count, this session

    stakeTrace: [],      // cents
    winTrace: [],        // per spin, did it pay — the trained heads need the
    staked: 0,           // outcome sequence, not just the stake sequence
    latencyTrace: [],    // ms between consecutive actions
    spins: 0,
    lossRun: 0,          // consecutive losses, current
    maxLossRun: 0,
    netCents: 0,

    turbo: false,
    autoplayArmed: 0,
    deposits: 0,
    depositsDeclined: 0,
    rgLoosened: false,
    switchesAfterLoss: 0,
    volatilitySeen: [],

    searches: 0,
    slipAdds: 0,
    slipRemoves: 0,
    reachedConfirm: 0,
    completedConfirm: 0,

    prior,
  };
}

/**
 * Fold one event into the SCO. Pure enough to be testable: it returns a new
 * top-level object so React re-renders, but reuses unchanged sub-objects.
 */
export function apply(sco, ev) {
  const at = ev.at ?? Date.now();
  const gap = at - sco.lastAt;

  const s = { ...sco, lastAt: at };
  // Stamp the event as it goes in. Most callers emit without an `at`, and an
  // unstamped ring buffer cannot answer "how long until the first action" —
  // which is one of the six metrics the brief names.
  const stamped = ev.at ? ev : { ...ev, at };
  s.events = sco.events.length >= RING ? [...sco.events.slice(1), stamped] : [...sco.events, stamped];

  // Latency is only meaningful between deliberate actions, not passive views.
  if (ev.t !== 'view' && gap > 0 && gap < 5 * 60_000) {
    s.latencyTrace = [...sco.latencyTrace, gap].slice(-60);
  }

  switch (ev.t) {
    case 'game_open':
      s.seq = [...sco.seq, ev.gameId].slice(-60);
      if (ev.section) {
        s.launchedFrom = { ...sco.launchedFrom, [ev.section]: (sco.launchedFrom[ev.section] || 0) + 1 };
      }
      if (typeof ev.volatility === 'number') {
        s.volatilitySeen = [...sco.volatilitySeen, ev.volatility].slice(-30);
      }
      // Marker 10 wants a switch that follows losing, not any switch.
      if (sco.lossRun >= 3) s.switchesAfterLoss = sco.switchesAfterLoss + 1;
      break;

    case 'game_close':
      s.dwell = { ...sco.dwell, [ev.gameId]: (sco.dwell[ev.gameId] || 0) + (ev.durMs || 0) };
      break;

    case 'spin': {
      s.spins = sco.spins + 1;
      s.stakeTrace = [...sco.stakeTrace, ev.stake].slice(-120);
      const won = (ev.payout || 0) > 0;
      s.winTrace = [...sco.winTrace, won].slice(-120);
      s.staked = sco.staked + ev.stake;

      // Per-title record. The session totals cannot answer "how have I done on
      // THIS kind of game", which is the question the game screen has to answer.
      if (ev.gameId) {
        const g = sco.byGame[ev.gameId] || { spins: 0, wins: 0, staked: 0, returned: 0 };
        s.byGame = {
          ...sco.byGame,
          [ev.gameId]: {
            spins: g.spins + 1,
            wins: g.wins + (won ? 1 : 0),
            staked: g.staked + ev.stake,
            returned: g.returned + (ev.payout || 0),
          },
        };
      }
      s.lossRun = won ? 0 : sco.lossRun + 1;
      s.maxLossRun = Math.max(sco.maxLossRun, s.lossRun);
      s.netCents = sco.netCents + (ev.payout || 0) - ev.stake;
      break;
    }

    case 'stake_change':
      s.stakeTrace = [...sco.stakeTrace, ev.to].slice(-120);
      break;

    case 'turbo':
      s.turbo = ev.on;
      break;

    case 'autoplay':
      s.autoplayArmed = sco.autoplayArmed + (ev.count || 0);
      break;

    case 'deposit':
      if (ev.declined) s.depositsDeclined = sco.depositsDeclined + 1;
      else s.deposits = sco.deposits + 1;
      break;

    case 'rg_change':
      if (ev.direction === 'looser') s.rgLoosened = true;
      break;

    case 'search':
      s.searches = sco.searches + 1;
      break;

    case 'slip_add':
      s.slipAdds = sco.slipAdds + 1;
      if (ev.sport) s.sports = { ...sco.sports, [ev.sport]: (sco.sports[ev.sport] || 0) + 1 };
      break;

    case 'slip_remove':
      s.slipRemoves = sco.slipRemoves + 1;
      break;

    case 'confirm_reach':
      s.reachedConfirm = sco.reachedConfirm + 1;
      break;

    case 'confirm_done':
      s.completedConfirm = sco.completedConfirm + 1;
      break;

    default:
      break;
  }

  return s;
}

export const sessionMinutes = (sco) => (sco.lastAt - sco.startedAt) / 60000;

/**
 * Session archetype from the first few interactions — LANTERN §4. This reads
 * the *session*, not the person: the same player is `focused` on a commute and
 * `browsing` on a Saturday.
 */
export function archetype(sco) {
  const touches = sco.seq.length + sco.slipAdds;
  if (touches === 0) return 'opening';

  const distinct = new Set(sco.seq).size;
  const dwellTotal = Object.values(sco.dwell).reduce((a, b) => a + b, 0);

  // Many titles, little time in any of them: looking, not playing.
  if (distinct >= 4 && dwellTotal < 90_000) return 'browsing';
  // Repeated returns to one or two titles, or a slip in progress.
  if (distinct <= 2 && (sco.spins >= 5 || sco.slipAdds >= 1)) return 'focused';
  if (sco.searches >= 2) return 'seeking';
  return 'browsing';
}

/** Default prior for a demo player with no history. */
export const emptyPrior = {
  typicalStake: 200,          // cents
  typicalSessionMin: 22,
  offHours: [2, 3, 4, 5],     // local hours that are unusual for this player
  ageBand: '35-44',           // §7: risk covariate only, never a ranking feature
  providerAffinity: {},
  mechanicAffinity: {},
  volatilityBand: 3,
};

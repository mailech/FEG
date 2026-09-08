/**
 * The FEG log schema — pure, no React Native, no JSON imports.
 *
 * Deliberately dependency-free so the same code runs in the app and under plain
 * node. That is what lets `scripts/make-synthetic.mjs` write training data to
 * disk using the identical row builder the live app uses, instead of a second
 * implementation that drifts.
 *
 * Every column is taken from top_casino_users_event_logs.csv in the same order,
 * with the same event names and the same 'null' convention, so rows written
 * here concatenate onto FEG's real export with no mapping step.
 */

/** Column order is load-bearing — do not reorder. */
export const COLUMNS = [
  'event_name', 'session', 'timestamp', 'platform', 'game_name', 'provider',
  'from_origin', 'on_origin', 'on_origin_name', 'jackpot', 'on_route', 'from_route',
  'demo', 'page_location', 'page_referrer', 'fortuna_screen_name', 'status',
  'added_from', 'sport_name', 'betslip_number', 'betslip_type', 'fixture_id',
  'selection_id', 'PlayerID',
];

/** Events the real feed uses. Anything Lantern-specific is prefixed so it can
 *  be filtered out before training on FEG-native events only. */
export const EVENT_MAP = {
  view: 'screen_view',
  game_open: 'casino_game_launch',
  game_close: 'lantern_game_close',
  spin: 'lantern_spin',
  stake_change: 'lantern_stake_change',
  turbo: 'lantern_turbo',
  autoplay: 'lantern_autoplay',
  search: 'lantern_search',
  slip_add: 'betslip_add_bet',
  slip_remove: 'lantern_slip_remove',
  confirm_reach: 'lantern_confirm_reach',
  confirm_done: 'betslip_placed_bet',
  confirm_abandon: 'lantern_confirm_abandon',
  deposit: 'lantern_deposit',
  rg_change: 'lantern_rg_change',
  screen: 'fortuna_screen_view',
};

/** Hashed like the real export — a stable pseudonym, never a real identity. */
export function pseudoId(seed) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + s.charCodeAt(i), 2654435761) >>> 0;
  }
  return (h1.toString(16) + h2.toString(16)).padEnd(16, '0').repeat(4).slice(0, 64);
}

const nn = (v) => (v === undefined || v === null || v === '' ? 'null' : String(v));

/**
 * One Lantern event -> one FEG-schema row.
 * @param ev   the event as emitted onto the bus
 * @param ctx  { sessionId, playerId, route, riskState, archetype, platform }
 */
export function toRow(ev, ctx) {
  const r = {};
  for (const k of COLUMNS) r[k] = 'null';

  r.event_name = EVENT_MAP[ev.t] || 'lantern_' + ev.t;
  r.session = ctx.sessionId;
  r.timestamp = new Date(ev.at ?? Date.now()).toISOString();
  r.platform = ctx.platform || 'web';
  r.PlayerID = ctx.playerId;
  r.on_route = nn(ctx.route);
  r.demo = 'true';
  r.page_location = nn(ctx.route ? `lantern://${ctx.route}` : null);

  switch (ev.t) {
    case 'game_open':
      r.game_name = nn(ev.gameName);
      r.provider = nn(ev.provider);
      r.on_origin = nn(ev.origin || 'category_game_row');
      r.on_origin_name = nn(ev.section);
      r.jackpot = ev.jackpot ? 'true' : 'false';
      break;
    case 'game_close':
      r.game_name = nn(ev.gameName);
      r.status = nn(ev.durMs);
      break;
    case 'spin':
      r.game_name = nn(ev.gameName);
      r.status = nn(`stake=${ev.stake};payout=${ev.payout ?? 0}`);
      break;
    case 'stake_change':
      r.game_name = nn(ev.gameName);
      r.status = nn(`from=${ev.from};to=${ev.to}`);
      break;
    case 'turbo':
    case 'autoplay':
      r.status = nn(ev.on ?? ev.count);
      break;
    case 'search':
      r.status = nn(`qlen=${ev.qLen ?? 0}`);
      r.on_origin = 'search_results';
      break;
    case 'slip_add':
    case 'slip_remove':
      r.sport_name = nn(ev.sport);
      r.selection_id = nn(ev.selectionId);
      r.fixture_id = nn(ev.fixtureId);
      r.added_from = nn(ev.addedFrom || 'prematch');
      break;
    case 'confirm_reach':
    case 'confirm_abandon':
      r.fortuna_screen_name = 'betslip';
      r.betslip_type = nn(ev.legs ? (ev.legs > 1 ? 'accumulator' : 'single') : null);
      break;
    case 'confirm_done':
      r.fortuna_screen_name = 'betslip';
      r.betslip_number = nn(ev.betslipNumber);
      r.betslip_type = nn(ev.legs > 1 ? 'accumulator' : 'single');
      r.status = nn(`stake=${ev.stake};odds=${ev.odds}`);
      break;
    case 'deposit':
      r.status = ev.declined ? 'declined' : 'accepted';
      break;
    case 'rg_change':
      r.status = nn(ev.direction);
      break;
    case 'view':
    case 'screen':
      r.fortuna_screen_name = nn(ev.surface || ctx.route);
      r.status = nn(ev.dwellMs);
      break;
    default:
      break;
  }

  // Lantern's own read of the moment — the labels a model trains against.
  r.from_origin = nn(ctx.archetype);
  r.from_route = nn(ctx.riskState);

  return r;
}

const esc = (v) => {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export function toCsv(rows, { header = true } = {}) {
  const body = rows.map((r) => COLUMNS.map((k) => esc(r[k])).join(','));
  return (header ? [COLUMNS.join(','), ...body] : body).join('\n') + '\n';
}

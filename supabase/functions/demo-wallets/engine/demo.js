/**
 * The demo account. Pure functions: they return rows and numbers, the caller
 * writes them (browser localStorage, Supabase, or Base44).
 *
 * A fresh sandbox gets two running sample portfolios (a copy portfolio of a
 * top trader and a momentum bot, real paper trading on live prices) plus a
 * handful of finished sample runs with a synthetic track record, so the
 * dashboard never starts empty. The account itself is a fixed paper bankroll.
 */
import { ENGINE_VERSION } from './tick.js';

export const DEMO_FUND = 500; // paper money per running sample portfolio
export const DEMO_BANKROLL = 6000; // the demo account: $1,000 tied up in the two samples, the rest free to allocate

/** Bankroll, what is tied up in running portfolios, and what is free to allocate. */
export function demoFunds(botRuns = [], bankroll = DEMO_BANKROLL) {
  const active = botRuns.filter(r => r.status === 'running' || r.status === 'paused');
  const finished = botRuns.filter(r => r.status === 'completed' || r.status === 'stopped');
  const deployed = active.reduce((s, r) => s + (Number(r.fund_allocation) || 0), 0);
  const finishedPnl = finished.reduce((s, r) => s + (Number(r.pnl) || 0), 0);
  const totalPnl = botRuns.reduce((s, r) => s + (Number(r.pnl) || 0), 0);
  return { bankroll, deployed, finishedPnl, totalPnl, totalFunds: bankroll + totalPnl, available: Math.max(0, bankroll + finishedPnl - deployed) };
}

/**
 * The trader the sample copy portfolio follows: the first leaderboard wallet
 * whose open book is small enough for a $500 copy to mirror (a whale with a
 * $5M book scales every position below the minimum trade). `fetchValue` is
 * fetchPortfolioValue; it is injected so this module stays free of fetching.
 */
export async function pickSamplePilot(board = [], fetchValue, { minBook = 2_000, maxBook = 60_000, tries = 12 } = {}) {
  for (const w of board.slice(0, tries)) {
    const value = await fetchValue(w.address).catch(() => null);
    if (value != null && value >= minBook && value <= maxBook) return { ...w, bookValue: value };
  }
  return board.find(w => w.name) || board[0] || null;
}

export function buildSampleBots({ pilot = null, now = new Date().toISOString(), fund = DEMO_FUND } = {}) {
  const base = {
    status: 'running',
    is_paper: true,
    fill_mode: 'paper',
    fund_allocation: fund,
    current_value: fund,
    pnl: 0,
    pnl_percent: 0,
    realized_pnl: 0,
    unrealized_pnl: 0,
    positions_bought: 0,
    positions_sold: 0,
    open_positions: 0,
    start_time: now,
    pnl_history: [{ time: now, pnl: 0, value: fund }],
    order_type: 'GTC',
    engine_version: ENGINE_VERSION,
    ticks: 0,
  };
  const rows = [];
  if (pilot?.address) {
    const name = pilot.name || `${pilot.address.slice(0, 6)}…${pilot.address.slice(-4)}`;
    rows.push({
      ...base,
      name: `copy-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`,
      algorithm: 'copy',
      categories: ['all'],
      duration_hours: 0,
      copy_wallets: [{ address: pilot.address, name, profileImage: pilot.profileImage || '' }],
      copy_mode: 'mirror',
      copy_state: {},
      kelly_fraction: 1,
      max_positions: 25,
      max_position_pct: 25,
      stop_loss_pct: 0,
      take_profit_pct: 0,
      activity_log: [{ t: now, type: 'sys', msg: `Sample portfolio: copying ${name}, from the top of the 30-day leaderboard when this sandbox was created` }],
    });
  }
  rows.push({
    ...base,
    name: 'momentum-sample',
    algorithm: 'momentum',
    categories: ['politics', 'crypto'],
    duration_hours: 72,
    kelly_fraction: 0.25,
    max_positions: 5,
    stop_loss_pct: 10,
    take_profit_pct: 15,
    max_position_pct: 20,
    activity_log: [{ t: now, type: 'sys', msg: 'Sample portfolio: momentum strategy on politics and crypto markets' }],
  });
  return rows;
}

// Finished sample runs: name, algorithm, categories, paper amount, return, days ago it ended, hours it ran, buys, sells.
const SAMPLE_HISTORY = [
  ['sample-copy-trader', 'copy', ['all'], 1000, 0.112, 12, 96, 22, 22],
  ['sample-momentum', 'momentum', ['politics', 'crypto'], 500, 0.064, 9, 48, 9, 9],
  ['sample-mean-reversion', 'mean_reversion', ['sports'], 750, 0.091, 7, 72, 14, 14],
  ['sample-copy-trader-2', 'copy', ['all'], 1000, -0.023, 5, 48, 11, 11],
  ['sample-sentiment', 'sentiment', ['politics'], 500, 0.148, 3, 72, 8, 8],
  ['sample-momentum-2', 'momentum', ['crypto'], 750, 0.057, 1, 36, 7, 7],
];

/** Small deterministic random source, so every visitor sees the same sample history. */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A plausible P&L path from 0 to `finalPnl`: a trend plus a wiggle that fades out toward the end. */
function samplePath({ start, end, finalPnl, fund, steps, seed }) {
  const rnd = mulberry(seed);
  const points = [];
  let noise = 0;
  for (let k = 0; k <= steps; k++) {
    const p = k / steps;
    noise = noise * 0.7 + (rnd() - 0.5) * fund * 0.02;
    const pnl = k === 0 ? 0 : k === steps ? finalPnl : finalPnl * p + noise * (1 - p);
    points.push({ time: new Date(start + (end - start) * p).toISOString(), pnl: +pnl.toFixed(2), value: +(fund + pnl).toFixed(2) });
  }
  return points;
}

/**
 * Finished sample runs for a fresh sandbox: a synthetic track record over the
 * last two weeks (five winners, one small loser), clearly named "sample-…"
 * and explained in each run's log. Everything running is real paper trading.
 */
export function buildSampleHistory({ now = Date.now(), pilot = null } = {}) {
  const nowMs = typeof now === 'string' ? Date.parse(now) : now;
  const copyName = pilot?.name || 'a top trader';
  return SAMPLE_HISTORY.map(([name, algorithm, categories, fund, ret, daysAgo, hours, bought, sold], i) => {
    const end = nowMs - daysAgo * 86_400_000 - i * 37 * 60_000;
    const start = end - hours * 3_600_000;
    const pnl = +(fund * ret).toFixed(2);
    const history = samplePath({ start, end, finalPnl: pnl, fund, steps: Math.min(48, Math.max(12, Math.round(hours / 2))), seed: 1000 + i });
    const startIso = new Date(start).toISOString();
    return {
      name,
      algorithm,
      categories,
      status: 'completed',
      is_paper: true,
      fill_mode: 'paper',
      fund_allocation: fund,
      current_value: +(fund + pnl).toFixed(2),
      pnl,
      pnl_percent: +(ret * 100).toFixed(2),
      realized_pnl: pnl,
      unrealized_pnl: 0,
      positions_bought: bought,
      positions_sold: sold,
      open_positions: 0,
      start_time: startIso,
      end_time: new Date(end).toISOString(),
      duration_hours: hours,
      pnl_history: history,
      ticks: history.length,
      engine_version: ENGINE_VERSION,
      order_type: 'GTC',
      kelly_fraction: 0.25,
      max_positions: 10,
      max_position_pct: 20,
      stop_loss_pct: algorithm === 'copy' ? 0 : 10,
      take_profit_pct: algorithm === 'copy' ? 0 : 15,
      ...(algorithm === 'copy'
        ? { copy_wallets: pilot?.address ? [{ address: pilot.address, name: copyName, profileImage: pilot.profileImage || '' }] : [], copy_mode: 'mirror', copy_state: {} }
        : {}),
      activity_log: [{ t: startIso, type: 'sys', msg: 'Sample run: a synthetic track record so the demo does not start empty. The running portfolios are real paper trading on live prices.' }],
    };
  });
}

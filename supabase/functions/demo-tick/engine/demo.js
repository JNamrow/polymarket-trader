/**
 * Sample portfolios for a fresh demo sandbox: one copy portfolio of a top
 * trader and one momentum bot, both on paper money. Pure: returns the rows,
 * the caller writes them (browser localStorage, Supabase, or Base44).
 */
import { ENGINE_VERSION } from './tick.js';

export const DEMO_FUND = 250;

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
      activity_log: [{ t: now, type: 'sys', msg: `Sample portfolio: copying ${name}, top of the 30-day leaderboard when this sandbox was created` }],
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

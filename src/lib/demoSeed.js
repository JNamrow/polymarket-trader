/**
 * Sample portfolios for a fresh demo sandbox, so the first screen shows the
 * engine at work instead of an empty state. Both run on paper money against
 * live Polymarket data; the engine ticks them as soon as the dashboard opens.
 */
import { fetchLeaderboard } from '@/engine/polymarketApi.js';
import { ENGINE_VERSION } from '@/engine/tick.js';

const FUND = 250;

export async function seedDemo(client) {
  const existing = await client.entities.BotRun.list('-created_date', 1);
  if (existing.length) return false;

  const now = new Date().toISOString();
  const base = {
    status: 'running',
    is_paper: true,
    fill_mode: 'paper',
    fund_allocation: FUND,
    current_value: FUND,
    pnl: 0,
    pnl_percent: 0,
    realized_pnl: 0,
    unrealized_pnl: 0,
    positions_bought: 0,
    positions_sold: 0,
    open_positions: 0,
    start_time: now,
    pnl_history: [{ time: now, pnl: 0, value: FUND }],
    order_type: 'GTC',
    engine_version: ENGINE_VERSION,
    ticks: 0,
  };

  let pilot = null;
  try {
    const board = await fetchLeaderboard({ window: '1m', limit: 5, orderBy: 'PNL' });
    pilot = board.find(w => w.name) || board[0] || null;
  } catch {
    /* leaderboard unavailable: seed the strategy bot only */
  }

  const rows = [];
  if (pilot) {
    rows.push({
      ...base,
      name: `copy-${pilot.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`,
      algorithm: 'copy',
      categories: ['all'],
      duration_hours: 0,
      copy_wallets: [{ address: pilot.address, name: pilot.name, profileImage: pilot.profileImage || '' }],
      copy_mode: 'mirror',
      copy_state: {},
      kelly_fraction: 1,
      max_positions: 25,
      max_position_pct: 25,
      stop_loss_pct: 0,
      take_profit_pct: 0,
      activity_log: [{ t: now, type: 'sys', msg: `Sample portfolio: copying ${pilot.name}, top of the 30-day leaderboard when this sandbox was created` }],
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

  for (const row of rows) await client.entities.BotRun.create(row);
  return true;
}

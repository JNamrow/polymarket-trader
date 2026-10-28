/**
 * Seeds an empty private demo sandbox with the sample portfolios and the
 * sample history from src/engine/demo.js (the shared Supabase sandbox is
 * seeded by the demo-tick Edge Function with the same rows). The engine
 * ticks the running ones as soon as the dashboard opens.
 */
import { fetchLeaderboard, fetchPortfolioValue } from '@/engine/polymarketApi.js';
import { buildSampleBots, buildSampleHistory, pickSamplePilot } from '@/engine/demo.js';

export async function seedDemo(client) {
  const existing = await client.entities.BotRun.list('-created_date', 1);
  if (existing.length) return false;
  let pilot = null;
  try {
    const board = await fetchLeaderboard({ window: '1m', limit: 25, orderBy: 'PNL' });
    pilot = await pickSamplePilot(board, fetchPortfolioValue);
  } catch {
    /* leaderboard unavailable: seed the strategy bot only */
  }
  for (const row of [...buildSampleBots({ pilot }), ...buildSampleHistory({ pilot })]) await client.entities.BotRun.create(row);
  return true;
}

/**
 * executeTick — fetch live Polymarket data, run one tick for a bot, and
 * write the result through an `api` adapter.
 *
 * The adapter keeps this file free of SDK details so it runs both in the
 * browser (frontend client) and in a backend function (service role):
 *
 *   api = {
 *     createTrades(rows)  → Promise<created[]>
 *     updateTrades(rows)  → Promise<void>   (each row has an id)
 *     updateBot(id, data) → Promise<void>
 *   }
 */
import { fetchUniverse, fetchQuotes, fetchBook, fetchMarketsByConditionIds, fetchPositions } from './polymarketApi.js';
import { getStrategy } from './strategies.js';
import { runTick, ENGINE_VERSION, normalizePilots } from './tick.js';

export { ENGINE_VERSION };

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i).catch(() => null);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function executeTick({ bot, openTrades = [], api, now = Date.now() }) {
  if (bot.algorithm === 'copy') return executeCopyTick({ bot, openTrades, api, now });
  const strategy = getStrategy(bot.algorithm);
  const stamp = new Date(now).toISOString();

  let universe;
  try {
    universe = await fetchUniverse(bot.categories, { now });
  } catch (err) {
    // No market data: mark the failure on the bot so the UI can show it, but keep positions untouched.
    await api.updateBot(bot.id, {
      last_tick_at: stamp,
      last_error: `Market data unavailable: ${err.message}`,
      activity_log: [...(bot.activity_log || []), { t: stamp, type: 'error', msg: `Market data unavailable: ${err.message}` }].slice(-150),
    });
    return { botId: bot.id, error: err.message, opens: 0, closes: 0 };
  }

  const ctx0 = { bot, openTrades, universe, quotes: {}, books: {}, resolved: {}, now };

  // Positions whose market dropped out of the live universe (resolved, closed, delisted).
  const known = new Set(universe.markets.map(m => m.conditionId));
  const missing = openTrades.map(t => t.market_id).filter(id => id && !known.has(id));
  const resolved = missing.length ? await fetchMarketsByConditionIds(missing).catch(() => ({})) : {};

  // Tokens we need fresh CLOB quotes for: everything held + the top candidates.
  const heldTokens = openTrades.map(t => t.token_id).filter(Boolean);
  let candidateTokens = [];
  if (bot.algorithm === 'arbitrage') {
    const { baskets } = strategy.scanBaskets(ctx0);
    candidateTokens = baskets.slice(0, 2).flatMap(b => b.legs.map(l => l.tokenId));
  } else if (!strategy.needsBooks) {
    candidateTokens = strategy
      .scan(ctx0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(c => c.tokenId);
  }

  // Order books (sentiment only): held tokens + the markets it wants to inspect.
  let books = {};
  if (strategy.needsBooks) {
    const bookTargets = [...new Set([...heldTokens, ...strategy.bookCandidates(ctx0).map(m => m.yesTokenId)])];
    const fetched = await mapLimit(bookTargets, 4, tokenId => fetchBook(tokenId));
    bookTargets.forEach((id, i) => {
      if (fetched[i]) books[id] = fetched[i];
    });
    const ctxBooks = { ...ctx0, books };
    candidateTokens = strategy.scan(ctxBooks).sort((a, b) => b.score - a.score).slice(0, 12).map(c => c.tokenId);
  }

  const quotes = await fetchQuotes([...heldTokens, ...candidateTokens]).catch(() => ({}));

  const plan = runTick({ bot, openTrades, universe, quotes, books, resolved, now });
  await applyPlan(api, bot, plan);
  return summarize(bot, plan, universe.markets.length);
}

async function applyPlan(api, bot, plan) {
  const created = [...plan.opens, ...(plan.sells || [])];
  if (created.length) await api.createTrades(created);
  const updates = [...plan.closes, ...plan.marks];
  if (updates.length) await api.updateTrades(updates);
  await api.updateBot(bot.id, plan.botPatch);
}

function summarize(bot, plan, marketsScanned) {
  return {
    botId: bot.id,
    opens: plan.opens.length,
    closes: plan.closes.length + (plan.sells?.length || 0),
    marketsScanned,
    pnl: plan.botPatch.pnl,
    finished: plan.finished,
    log: plan.log,
  };
}

/**
 * Copy bots do not scan a market universe. Each tick they read every pilot's
 * open positions, price the markets they hold or the pilot just entered, and
 * let runTick turn the position deltas into mirrored buys and sells.
 */
async function executeCopyTick({ bot, openTrades = [], api, now = Date.now() }) {
  const stamp = new Date(now).toISOString();
  const wallets = normalizePilots(bot.copy_wallets);
  if (!wallets.length) {
    await api.updateBot(bot.id, { last_tick_at: stamp, last_error: 'No wallet to copy', activity_log: [...(bot.activity_log || []), { t: stamp, type: 'error', msg: 'No wallet to copy — add one or stop the bot' }].slice(-150) });
    return { botId: bot.id, error: 'No wallet to copy', opens: 0, closes: 0 };
  }

  const fetched = await mapLimit(wallets, 2, w => fetchPositions(w.address, { limit: 500 }));
  const pilots = {};
  wallets.forEach((w, i) => {
    if (fetched[i]) pilots[w.address] = { positions: fetched[i] };
  });
  if (!Object.keys(pilots).length) {
    const msg = 'Pilot positions unavailable (Data API error) — nothing changed';
    await api.updateBot(bot.id, { last_tick_at: stamp, last_error: msg, activity_log: [...(bot.activity_log || []), { t: stamp, type: 'error', msg }].slice(-150) });
    return { botId: bot.id, error: msg, opens: 0, closes: 0 };
  }

  // Markets to price: everything we hold plus anything a pilot holds that we do not yet.
  const heldConditions = openTrades.map(t => t.market_id).filter(Boolean);
  const heldTokens = openTrades.map(t => t.token_id).filter(Boolean);
  const held = new Set(heldTokens);
  const prevState = bot.copy_state && typeof bot.copy_state === 'object' ? bot.copy_state : {};
  // Biggest live positions first: the first mirror tick can only open a limited number of lots anyway.
  const wanted = [];
  for (const w of wallets) {
    const prevPos = prevState[w.address]?.positions || {};
    const isFirst = !prevState[w.address] && (bot.copy_mode || 'mirror') === 'mirror';
    for (const p of pilots[w.address]?.positions || []) {
      if (!(Number(p.currentValue) > 0) || p.redeemable) continue;
      const grew = (Number(p.size) || 0) > (Number(prevPos[p.tokenId]) || 0) * 1.001;
      if (held.has(p.tokenId) || grew || isFirst) wanted.push(p);
    }
  }
  wanted.sort((a, b) => b.currentValue - a.currentValue);
  const pilotConditions = wanted.map(p => p.conditionId);
  const pilotTokens = wanted.map(p => p.tokenId);
  const conditionIds = [...new Set([...heldConditions, ...pilotConditions])].slice(0, 160);
  const resolved = conditionIds.length ? await fetchMarketsByConditionIds(conditionIds).catch(() => ({})) : {};
  const quotes = await fetchQuotes([...new Set([...heldTokens, ...pilotTokens])].slice(0, 320)).catch(() => ({}));

  const plan = runTick({ bot, openTrades, universe: { markets: [], events: [] }, quotes, books: {}, resolved, pilots, now });
  await applyPlan(api, bot, plan);
  return summarize(bot, plan, plan.botPatch.markets_scanned);
}

/**
 * Close every open position at the current bid and end the run.
 * Used when the user stops a bot by hand.
 */
export async function liquidateBot({ bot, openTrades = [], api, now = Date.now(), reason = 'stopped by user' }) {
  const stamp = new Date(now).toISOString();
  const quotes = openTrades.length
    ? await fetchQuotes(openTrades.map(t => t.token_id).filter(Boolean)).catch(() => ({}))
    : {};
  const closes = [];
  const log = [];
  let realized = Number(bot.realized_pnl) || 0;
  for (const trade of openTrades) {
    const exit = quotes[trade.token_id]?.bid ?? (trade.current_price != null ? Number(trade.current_price) : Number(trade.entry_price));
    const qty = Number(trade.quantity) || 0;
    const pnl = Math.round((exit - Number(trade.entry_price)) * qty * 100) / 100;
    realized += pnl;
    closes.push({
      id: trade.id,
      status: 'closed',
      exit_price: exit,
      exit_time: stamp,
      exit_reason: reason,
      current_price: exit,
      unrealized_pnl: 0,
      pnl,
    });
    log.push({ t: stamp, type: pnl >= 0 ? 'ok' : 'warn', msg: `CLOSE ${trade.outcome} ${qty} @ ${Math.round(exit * 100)}¢ — ${trade.market_name} (${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}, ${reason})` });
  }
  const fund = Number(bot.fund_allocation) || 0;
  const pnl = Math.round(realized * 100) / 100;
  const patch = {
    status: 'stopped',
    end_time: stamp,
    realized_pnl: pnl,
    unrealized_pnl: 0,
    open_positions: 0,
    current_value: Math.round((fund + pnl) * 100) / 100,
    pnl,
    pnl_percent: fund > 0 ? Math.round((pnl / fund) * 10000) / 100 : 0,
    positions_sold: (Number(bot.positions_sold) || 0) + closes.length,
    pnl_history: [...(bot.pnl_history || []), { time: stamp, pnl, value: fund + pnl }],
    activity_log: [...(bot.activity_log || []), ...log, { t: stamp, type: 'sys', msg: `Run ${reason} — final P&L ${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}` }].slice(-150),
    last_tick_at: stamp,
  };
  if (closes.length) await api.updateTrades(closes);
  await api.updateBot(bot.id, patch);
  return { botId: bot.id, closes: closes.length, pnl };
}

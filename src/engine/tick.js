/**
 * One engine tick for one bot. Pure: takes data in, returns a plan out.
 * No network, no database. engine.js fetches the inputs and applies the plan.
 *
 * ctx = {
 *   bot,            BotRun record
 *   openTrades,     Trade records with status 'open'
 *   universe,       { markets, events } from fetchUniverse
 *   quotes,         tokenId → { bid, ask, mid } fresh CLOB quotes
 *   books,          tokenId → book summary (sentiment only)
 *   resolved,       conditionId → market, for open positions no longer in the universe
 *   now,            ms timestamp
 * }
 */
import { sidePrices } from './markets.js';
import { riskParams, positionSize, makerSize, basketSize } from './sizing.js';
import { getStrategy, riskExitReason } from './strategies.js';

export const ENGINE_VERSION = '2.0.0';
const MAX_LOG = 150;
const MAX_HISTORY = 400;
const MAX_SLIPPAGE = 0.05; // skip an entry if the fresh ask is >5% above the scan price
const REENTRY_COOLDOWN_MS = 6 * 3_600_000; // after closing a market, stay out of it for 6h

const round2 = v => Math.round(v * 100) / 100;
const round4 = v => Math.round(v * 10000) / 10000;
const cents = p => `${Math.round(p * 100)}¢`;

export function runTick(ctx) {
  const { bot, openTrades = [], universe, quotes = {}, books = {}, resolved = {}, now } = ctx;
  const risk = riskParams(bot);
  const strategy = getStrategy(bot.algorithm);
  const fundAllocation = Number(bot.fund_allocation) || 0;
  const log = [];
  const say = (type, msg) => log.push({ t: new Date(now).toISOString(), type, msg });
  const byCondition = new Map(universe.markets.map(m => [m.conditionId, m]));
  const tickNo = (Number(bot.ticks) || 0) + 1;
  const catLabel = (bot.categories || ['all']).join(', ');
  say('sys', `Tick #${tickNo} — scanned ${universe.markets.length} markets (${catLabel})`);

  const startMs = bot.start_time ? Date.parse(bot.start_time) : now;
  const durationOver = Number(bot.duration_hours) > 0 && now - startMs >= Number(bot.duration_hours) * 3_600_000;

  // Markets we recently exited: no re-entry until the cooldown passes.
  const cooldowns = {};
  for (const [conditionId, until] of Object.entries(bot.entry_cooldowns || {})) {
    if (Date.parse(until) > now) cooldowns[conditionId] = until;
  }

  // ── 1. Mark open positions and decide exits ────────────────────────────────
  const closes = [];
  const marks = [];
  const stillOpen = [];
  const markOf = trade => {
    const market = byCondition.get(trade.market_id) || resolved[trade.market_id] || null;
    const quote = quotes[trade.token_id];
    const side = market ? sidePrices(market, trade.outcome) : null;
    const mark = quote?.bid ?? side?.bid ?? (trade.current_price != null ? Number(trade.current_price) : Number(trade.entry_price));
    return { market, mark };
  };

  for (const trade of openTrades) {
    const { market, mark } = markOf(trade);
    const qty = Number(trade.quantity) || 0;
    const entry = Number(trade.entry_price) || 0;
    const isBasketLeg = !!trade.basket_id;

    let exitPrice = null;
    let reason = null;
    if (market?.closed) {
      exitPrice = trade.outcome === 'YES' ? market.yesPrice : market.noPrice;
      reason = `market resolved ${exitPrice >= 0.5 ? 'in favor' : 'against'}`;
    } else if (durationOver) {
      exitPrice = mark;
      reason = 'run duration reached';
    } else if (market && !market.acceptingOrders) {
      exitPrice = mark;
      reason = 'market stopped accepting orders';
    } else if (!isBasketLeg) {
      reason = strategy.exitReason(trade, mark, market, ctx) || riskExitReason(trade, mark, risk);
      if (reason) exitPrice = mark;
    }

    if (reason != null && exitPrice != null) {
      const pnl = round2((exitPrice - entry) * qty);
      closes.push({
        id: trade.id,
        status: 'closed',
        exit_price: round4(exitPrice),
        exit_time: new Date(now).toISOString(),
        exit_reason: reason,
        current_price: round4(exitPrice),
        unrealized_pnl: 0,
        pnl,
      });
      say(pnl >= 0 ? 'ok' : 'warn', `CLOSE ${trade.outcome} ${qty} @ ${cents(exitPrice)} — ${trade.market_name} (${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}, ${reason})`);
      if (trade.market_id) cooldowns[trade.market_id] = new Date(now + REENTRY_COOLDOWN_MS).toISOString();
    } else {
      const unrealized = round2((mark - entry) * qty);
      marks.push({ id: trade.id, current_price: round4(mark), unrealized_pnl: unrealized });
      stillOpen.push({ ...trade, current_price: mark, unrealized_pnl: unrealized });
    }
  }

  // Arbitrage baskets: close the whole basket once the bids add up to the payout.
  const baskets = new Map();
  for (const t of stillOpen) if (t.basket_id) baskets.set(t.basket_id, [...(baskets.get(t.basket_id) || []), t]);
  for (const [basketId, legs] of baskets) {
    const payout = Number(legs[0].basket_payout) || 1;
    const sumBids = legs.reduce((s, t) => s + Number(t.current_price || 0), 0);
    if (sumBids >= payout * 0.997) {
      for (const t of legs) {
        const qty = Number(t.quantity) || 0;
        const pnl = round2((t.current_price - Number(t.entry_price)) * qty);
        marks.splice(marks.findIndex(m => m.id === t.id), 1);
        closes.push({
          id: t.id,
          status: 'closed',
          exit_price: round4(t.current_price),
          exit_time: new Date(now).toISOString(),
          exit_reason: 'basket converged to payout',
          current_price: round4(t.current_price),
          unrealized_pnl: 0,
          pnl,
        });
      }
      say('ok', `Basket ${basketId.split('-')[0]} converged — closed ${legs.length} legs`);
    }
  }
  const closedIds = new Set(closes.map(c => c.id));
  const remaining = stillOpen.filter(t => !closedIds.has(t.id));

  // ── 2. Cash available for new entries ──────────────────────────────────────
  const realizedBefore = Number(bot.realized_pnl) || 0;
  const realizedNow = realizedBefore + closes.reduce((s, c) => s + c.pnl, 0);
  const openCost = remaining.reduce((s, t) => s + (Number(t.size_usdc) || Number(t.entry_price) * Number(t.quantity) || 0), 0);
  let cash = round2(fundAllocation + realizedNow - openCost);

  // ── 3. New entries ─────────────────────────────────────────────────────────
  const opens = [];
  const heldConditions = new Set(remaining.map(t => t.market_id));
  const fillMode = bot.is_paper ? 'paper' : 'simulated';
  const stamp = new Date(now).toISOString();
  const slots = Math.max(0, risk.maxPositions - remaining.length);

  const buildTrade = (c, { quantity, sizeUsd, fillPrice, basketId = null, basketPayout = null }) => {
    const markQuote = quotes[c.tokenId];
    const mark = markQuote?.bid ?? sidePrices(c.market, c.outcome).bid ?? fillPrice;
    return {
      bot_run_id: bot.id,
      market_name: c.market.question,
      market_id: c.market.conditionId,
      gamma_market_id: c.market.id,
      token_id: c.tokenId,
      event_title: c.market.eventTitle,
      event_slug: c.market.eventSlug,
      market_slug: c.market.slug,
      market_url: c.market.url,
      side: 'buy',
      outcome: c.outcome,
      entry_price: round4(fillPrice),
      quantity,
      size_usdc: sizeUsd,
      status: 'open',
      timestamp: stamp,
      order_type: bot.order_type || 'GTC',
      edge_at_entry: +((c.estProb - fillPrice) * 100).toFixed(2),
      est_prob: c.estProb,
      kelly_fraction: risk.kellyMultiplier,
      neg_risk: !!basketId,
      fill_mode: c.maker ? `${fillMode}-maker` : fillMode,
      strategy: bot.algorithm,
      signal: c.signal,
      signal_value: c.signalValue != null ? +Number(c.signalValue).toFixed(4) : null,
      signal_reason: c.reason,
      basket_id: basketId,
      basket_payout: basketPayout,
      current_price: round4(mark),
      unrealized_pnl: round2((mark - fillPrice) * quantity),
    };
  };

  if (!durationOver && bot.status === 'running' && slots > 0 && cash >= risk.minTradeUsd) {
    if (bot.algorithm === 'arbitrage') {
      const { baskets: found, closest } = strategy.scanBaskets(ctx);
      const heldBaskets = new Set(remaining.map(t => t.basket_id).filter(Boolean));
      let opened = 0;
      for (const b of found) {
        if (opened >= 1 || heldBaskets.size + opened >= Math.max(1, Math.floor(risk.maxPositions / 2))) break;
        if (b.legs.some(l => heldConditions.has(l.market.conditionId) || cooldowns[l.market.conditionId])) continue;
        const legAsks = b.legs.map(l => quotes[l.tokenId]?.ask ?? l.price);
        const sized = basketSize({ legAsks, payoutPerSet: b.payoutPerSet, bankroll: fundAllocation, cash, risk });
        if (!sized) {
          say('info', `Basket on "${b.event.title}" found (${(b.edge * 100).toFixed(1)}¢ edge) but too small for available cash`);
          continue;
        }
        b.legs.forEach((leg, i) => {
          const fillPrice = legAsks[i];
          const sizeUsd = round2(sized.sets * fillPrice);
          opens.push(buildTrade(leg, { quantity: sized.sets, sizeUsd, fillPrice, basketId: b.basketId, basketPayout: b.payoutPerSet }));
        });
        cash = round2(cash - sized.totalCost);
        opened += 1;
        say('trade', `BUY ${b.outcome} basket × ${sized.sets} on "${b.event.title}" — ${b.legs.length} legs for $${sized.totalCost.toFixed(2)}, locked edge ${sized.edgePct}%`);
      }
      if (!found.length) {
        if (closest) {
          say('info', `No NegRisk mispricing ≥ ${(1.5).toFixed(1)}¢. Closest: "${closest.event.title}" (YES asks sum ${closest.sumYesAsk.toFixed(3)})`);
        } else {
          say('info', 'No multi-outcome NegRisk events in the selected categories');
        }
      }
    } else {
      const candidates = strategy
        .scan(ctx)
        .filter(c => !heldConditions.has(c.market.conditionId) && !cooldowns[c.market.conditionId] && c.edge > 0)
        .sort((a, b) => b.score - a.score);
      let opened = 0;
      const seen = new Set();
      for (const c of candidates) {
        if (opened >= slots || cash < risk.minTradeUsd) break;
        if (seen.has(c.market.conditionId)) continue;
        seen.add(c.market.conditionId);
        const quote = quotes[c.tokenId];
        let fillPrice = c.maker ? (quote?.bid ?? c.price) : (quote?.ask ?? c.price);
        if (!c.maker && fillPrice > c.price * (1 + MAX_SLIPPAGE)) {
          say('info', `Skipped ${c.market.question.slice(0, 60)} — ask moved to ${cents(fillPrice)} since scan`);
          continue;
        }
        if (!(fillPrice > 0.01 && fillPrice < 0.99)) continue;
        const sized = c.maker
          ? makerSize({ price: fillPrice, bankroll: fundAllocation, cash, risk })
          : positionSize({ estProb: c.estProb, price: fillPrice, bankroll: fundAllocation, cash, risk });
        if (!sized) continue;
        opens.push(buildTrade(c, { quantity: sized.quantity, sizeUsd: sized.sizeUsd, fillPrice }));
        cash = round2(cash - sized.sizeUsd);
        opened += 1;
        say('trade', `BUY ${c.outcome} ${sized.quantity} @ ${cents(fillPrice)} — ${c.market.question} (edge +${((c.estProb - fillPrice) * 100).toFixed(1)}%, ${c.reason})`);
      }
      if (!candidates.length) {
        say('info', `No ${strategy.label.toLowerCase()} signals above threshold this tick`);
      } else if (!opened) {
        say('info', `${candidates.length} signal${candidates.length === 1 ? '' : 's'} found, none sized (cash $${cash.toFixed(2)}, ${remaining.length}/${risk.maxPositions} positions open)`);
      }
    }
  } else if (durationOver) {
    say('sys', `Run duration of ${bot.duration_hours}h reached — closing out`);
  } else if (slots === 0) {
    say('info', `All ${risk.maxPositions} position slots in use — holding`);
  }

  // ── 4. Bot patch ───────────────────────────────────────────────────────────
  const unrealized = round2(
    marks.filter(m => !closedIds.has(m.id)).reduce((s, m) => s + m.unrealized_pnl, 0) +
      opens.reduce((s, t) => s + t.unrealized_pnl, 0)
  );
  const currentValue = round2(fundAllocation + realizedNow + unrealized);
  const pnl = round2(currentValue - fundAllocation);
  const pnlPercent = fundAllocation > 0 ? round2((pnl / fundAllocation) * 100) : 0;
  const prevBought = Number(bot.positions_bought) || 0;
  const prevAvgEdge = Number(bot.avg_edge) || 0;
  const newEdges = opens.map(t => t.edge_at_entry);
  const avgEdge = prevBought + newEdges.length > 0
    ? round2((prevAvgEdge * prevBought + newEdges.reduce((s, e) => s + e, 0)) / (prevBought + newEdges.length))
    : prevAvgEdge;

  const history = thinHistory([...(Array.isArray(bot.pnl_history) ? bot.pnl_history : []), { time: stamp, pnl, value: currentValue }]);
  const activity = [...(Array.isArray(bot.activity_log) ? bot.activity_log : []), ...log].slice(-MAX_LOG);
  const finished = durationOver && remaining.length === 0;
  if (finished) say('sys', `Run complete — final P&L ${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}`);

  const botPatch = {
    current_value: currentValue,
    pnl,
    pnl_percent: pnlPercent,
    realized_pnl: round2(realizedNow),
    unrealized_pnl: unrealized,
    positions_bought: prevBought + opens.length,
    positions_sold: (Number(bot.positions_sold) || 0) + closes.length,
    open_positions: remaining.length + opens.length,
    avg_edge: avgEdge,
    markets_scanned: universe.markets.length,
    pnl_history: history,
    activity_log: finished ? [...activity, log[log.length - 1]].slice(-MAX_LOG) : activity,
    last_tick_at: stamp,
    ticks: tickNo,
    engine_version: ENGINE_VERSION,
    fill_mode: fillMode,
    entry_cooldowns: cooldowns,
    last_error: null,
    ...(finished ? { status: 'completed', end_time: stamp } : {}),
  };

  return { opens, closes, marks: marks.filter(m => !closedIds.has(m.id)), botPatch, log, finished };
}

/** Keep the P&L history bounded: drop every other point from the oldest half. */
function thinHistory(points) {
  if (points.length <= MAX_HISTORY) return points;
  const half = Math.floor(points.length / 2);
  const old = points.slice(0, half).filter((_, i) => i % 2 === 0);
  return [...old, ...points.slice(half)];
}

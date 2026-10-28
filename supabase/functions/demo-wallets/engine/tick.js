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
 *   pilots,         copy bots only: address → { positions } from fetchPositions
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
  const stamp = new Date(now).toISOString();
  const log = [];
  const say = (type, msg) => log.push({ t: stamp, type, msg });
  const byCondition = new Map(universe.markets.map(m => [m.conditionId, m]));
  const tickNo = (Number(bot.ticks) || 0) + 1;
  const isCopy = bot.algorithm === 'copy';
  const copy = isCopy ? planCopyDeltas(ctx) : null;
  const ctxExit = isCopy ? { ...ctx, copyDeltas: copy.deltas } : ctx;
  if (isCopy) {
    say('sys', `Tick #${tickNo} — following ${copy.pilots.length} wallet${copy.pilots.length === 1 ? '' : 's'} (${copy.pilots.map(p => p.name).join(', ')}), ${copy.positionsSeen} positions seen`);
  } else {
    const catLabel = (bot.categories || ['all']).join(', ');
    say('sys', `Tick #${tickNo} — scanned ${universe.markets.length} markets (${catLabel})`);
  }

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
      reason = strategy.exitReason(trade, mark, market, ctxExit) || riskExitReason(trade, mark, risk);
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

  // Copy bots: when a pilot trims a position, sell the same fraction of our lots.
  const sells = []; // new closed rows for the sold part
  const trims = []; // updates to the lots that stay open
  if (isCopy) {
    for (const t of remaining) {
      const d = copy.deltas[t.token_id];
      if (!d || !(d.fraction > 0) || d.fraction >= 0.999) continue;
      const qty = Number(t.quantity) || 0;
      const entry = Number(t.entry_price) || 0;
      let sellQty = Math.floor(qty * d.fraction * 100) / 100;
      if (!(sellQty > 0)) continue;
      const mark = Number(t.current_price) || entry;
      if ((qty - sellQty) * entry < 1) sellQty = qty; // do not leave dust behind
      const keepQty = round2(qty - sellQty);
      const pnl = round2((mark - entry) * sellQty);
      sells.push({
        ...lotFields(t),
        side: 'sell',
        status: 'closed',
        quantity: sellQty,
        size_usdc: round2(sellQty * entry),
        entry_price: round4(entry),
        timestamp: stamp,
        exit_price: round4(mark),
        exit_time: stamp,
        exit_reason: `${d.pilotName} trimmed ${Math.round(d.fraction * 100)}%`,
        current_price: round4(mark),
        unrealized_pnl: 0,
        pnl,
      });
      if (keepQty > 0) {
        trims.push({ id: t.id, quantity: keepQty, size_usdc: round2(keepQty * entry), current_price: round4(mark), unrealized_pnl: round2((mark - entry) * keepQty) });
        t.quantity = keepQty;
        t.size_usdc = round2(keepQty * entry);
        t.unrealized_pnl = round2((mark - entry) * keepQty);
      } else {
        closes.push({ id: t.id, status: 'closed', exit_price: round4(mark), exit_time: stamp, exit_reason: `${d.pilotName} trimmed ${Math.round(d.fraction * 100)}%`, current_price: round4(mark), unrealized_pnl: 0, pnl: 0 });
        closedIds.add(t.id);
      }
      say('trade', `SELL ${t.outcome_label || t.outcome} ${sellQty} @ ${cents(mark)} — ${t.market_name} (${d.pilotName} sold ${Math.round(d.fraction * 100)}%, ${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)})`);
    }
  }
  const trimmedIds = new Set(trims.map(u => u.id));
  const stillRemaining = remaining.filter(t => !closedIds.has(t.id));

  // ── 2. Cash available for new entries ──────────────────────────────────────
  const realizedBefore = Number(bot.realized_pnl) || 0;
  const realizedNow = realizedBefore + closes.reduce((s, c) => s + c.pnl, 0) + sells.reduce((s, c) => s + c.pnl, 0);
  const openCost = stillRemaining.reduce((s, t) => s + (Number(t.size_usdc) || Number(t.entry_price) * Number(t.quantity) || 0), 0);
  let cash = round2(fundAllocation + realizedNow - openCost);

  // ── 3. New entries ─────────────────────────────────────────────────────────
  const opens = [];
  const heldConditions = new Set(stillRemaining.map(t => t.market_id));
  const heldOutcome = new Map(stillRemaining.map(t => [t.market_id, t.outcome]));
  const fillMode = bot.is_paper ? 'paper' : 'simulated';
  const slots = Math.max(0, risk.maxPositions - stillRemaining.length);

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
    if (isCopy) {
      let opened = 0;
      let tooSmall = 0;
      let unpriced = 0;
      const maxPerLot = (fundAllocation * risk.maxPositionPct) / 100;
      for (const d of copy.buys) {
        if (opened >= slots || cash < risk.minTradeUsd) break;
        const outcome = d.outcomeIndex === 0 ? 'YES' : 'NO';
        if (heldOutcome.has(d.conditionId) && heldOutcome.get(d.conditionId) !== outcome) continue; // pilot is hedging; stay on one side
        const market = resolved[d.conditionId] || byCondition.get(d.conditionId);
        if (!market || market.closed || market.acceptingOrders === false) {
          unpriced++;
          continue;
        }
        const quote = quotes[d.tokenId];
        const fillPrice = quote?.ask ?? sidePrices(market, outcome).ask ?? d.refPrice;
        if (!(fillPrice > 0.01 && fillPrice < 0.99)) {
          unpriced++;
          continue;
        }
        const want = d.deltaShares * fillPrice * d.scale;
        const sizeUsd = Math.min(want, maxPerLot, cash);
        const quantity = Math.floor((sizeUsd / fillPrice) * 100) / 100;
        if (!(sizeUsd >= risk.minTradeUsd) || !(quantity > 0)) {
          tooSmall++;
          continue;
        }
        const c = {
          market,
          outcome,
          tokenId: d.tokenId,
          price: fillPrice,
          estProb: fillPrice,
          edge: 0,
          signal: 'pilot_buy',
          signalValue: d.scale,
          reason: `mirrors ${d.pilotName}: ${d.outcomeName} +${Math.round(d.deltaShares).toLocaleString()} sh`,
          maker: false,
        };
        const row = buildTrade(c, { quantity, sizeUsd: round2(quantity * fillPrice), fillPrice });
        row.pilot_address = d.pilot;
        row.outcome_label = d.outcomeName;
        opens.push(row);
        cash = round2(cash - row.size_usdc);
        heldOutcome.set(d.conditionId, outcome);
        opened += 1;
        say('trade', `BUY ${d.outcomeName} ${quantity} @ ${cents(fillPrice)} — ${market.question} (copying ${d.pilotName}, $${row.size_usdc.toFixed(2)})`);
      }
      if (!copy.buys.length) {
        say('info', copy.firstSync ? 'Snapshot taken — new moves by the followed wallets are copied from now on' : 'No new buys by the followed wallets');
      } else if (tooSmall || unpriced) {
        say('info', `${tooSmall} pilot move${tooSmall === 1 ? '' : 's'} too small to mirror at this allocation${unpriced ? `, ${unpriced} without a live market` : ''}`);
      }
    } else if (bot.algorithm === 'arbitrage') {
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
        say('info', `${candidates.length} signal${candidates.length === 1 ? '' : 's'} found, none sized (cash $${cash.toFixed(2)}, ${stillRemaining.length}/${risk.maxPositions} positions open)`);
      }
    }
  } else if (durationOver) {
    say('sys', `Run duration of ${bot.duration_hours}h reached — closing out`);
  } else if (slots === 0) {
    say('info', `All ${risk.maxPositions} position slots in use — holding`);
  }

  // ── 4. Bot patch ───────────────────────────────────────────────────────────
  const finalMarks = [...marks.filter(m => !closedIds.has(m.id) && !trimmedIds.has(m.id)), ...trims];
  const unrealized = round2(finalMarks.reduce((s, m) => s + m.unrealized_pnl, 0) + opens.reduce((s, t) => s + t.unrealized_pnl, 0));
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
  const finished = durationOver && stillRemaining.length === 0;
  if (finished) say('sys', `Run complete — final P&L ${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}`);

  const botPatch = {
    current_value: currentValue,
    pnl,
    pnl_percent: pnlPercent,
    realized_pnl: round2(realizedNow),
    unrealized_pnl: unrealized,
    positions_bought: prevBought + opens.length,
    positions_sold: (Number(bot.positions_sold) || 0) + closes.length + sells.length,
    open_positions: stillRemaining.length + opens.length,
    avg_edge: avgEdge,
    markets_scanned: isCopy ? copy.positionsSeen : universe.markets.length,
    pnl_history: history,
    activity_log: finished ? [...activity, log[log.length - 1]].slice(-MAX_LOG) : activity,
    last_tick_at: stamp,
    ticks: tickNo,
    engine_version: ENGINE_VERSION,
    fill_mode: fillMode,
    entry_cooldowns: cooldowns,
    last_error: null,
    ...(isCopy ? { copy_state: copy.snapshot } : {}),
    ...(finished ? { status: 'completed', end_time: stamp } : {}),
  };

  return { opens, sells, closes, marks: finalMarks, botPatch, log, finished };
}

/** Fields a sold-off part of a lot inherits from the lot it came from. */
function lotFields(t) {
  const keys = ['bot_run_id', 'market_name', 'market_id', 'gamma_market_id', 'token_id', 'event_title', 'event_slug', 'market_slug', 'market_url', 'outcome', 'outcome_label', 'order_type', 'edge_at_entry', 'est_prob', 'kelly_fraction', 'neg_risk', 'fill_mode', 'strategy', 'signal', 'signal_value', 'signal_reason', 'pilot_address'];
  const out = {};
  for (const k of keys) if (t[k] !== undefined) out[k] = t[k];
  return out;
}

export function normalizePilots(list) {
  return (Array.isArray(list) ? list : [])
    .map(w => (typeof w === 'string' ? { address: w } : w))
    .filter(w => w && typeof w.address === 'string')
    .map(w => ({ ...w, address: w.address.toLowerCase(), name: w.name || w.label || `${w.address.slice(0, 6)}…${w.address.slice(-4)}` }));
}

/**
 * Compare each pilot's current positions with the snapshot from the last tick.
 *   buys    new or bigger positions, biggest dollar change first
 *   deltas  tokenId → { fraction sold, pilotName } for smaller or closed positions
 *   snapshot the new copy_state to store on the bot
 * Each pilot gets an equal share of the allocation; `scale` = that share ÷ the
 * pilot's portfolio value, so our book keeps the pilot's proportions.
 * On the first tick a "mirror" bot buys into everything the pilot holds; a
 * "new_only" bot just records the snapshot.
 */
export function planCopyDeltas(ctx) {
  const { bot, pilots = {}, now } = ctx;
  const wallets = normalizePilots(bot.copy_wallets);
  const budget = wallets.length ? (Number(bot.fund_allocation) || 0) / wallets.length : 0;
  const prevState = bot.copy_state && typeof bot.copy_state === 'object' ? bot.copy_state : {};
  const deltas = {};
  const buys = [];
  const snapshot = {};
  let firstSync = false;
  let positionsSeen = 0;

  for (const w of wallets) {
    const data = pilots[w.address];
    const prev = prevState[w.address];
    if (!data) {
      if (prev) snapshot[w.address] = prev; // fetch failed this tick: keep the old snapshot, do nothing
      continue;
    }
    // Only the live book counts: settled positions (value 0, awaiting redeem) are not mirrored or tracked.
    const positions = (data.positions || []).filter(p => p.size > 0 && p.tokenId && Number(p.currentValue) > 0 && !p.redeemable);
    positionsSeen += positions.length;
    const cur = {};
    const byToken = {};
    let value = 0;
    for (const p of positions) {
      cur[p.tokenId] = round2((cur[p.tokenId] || 0) + p.size);
      byToken[p.tokenId] = p;
      value += Number(p.currentValue) || 0;
    }
    const scale = value > 0 ? budget / value : 0;
    const push = (p, deltaShares) =>
      buys.push({
        tokenId: p.tokenId,
        conditionId: p.conditionId,
        outcomeIndex: Number(p.outcomeIndex ?? 0),
        outcomeName: p.outcome || (Number(p.outcomeIndex) === 1 ? 'No' : 'Yes'),
        deltaShares,
        usd: deltaShares * (Number(p.curPrice) || 0) * scale,
        scale,
        pilot: w.address,
        pilotName: w.name,
        refPrice: Number(p.curPrice) || 0,
      });

    if (!prev) {
      firstSync = true;
      if ((bot.copy_mode || 'mirror') === 'mirror' && scale > 0) for (const p of positions) push(p, p.size);
    } else {
      const prevPos = prev.positions || {};
      for (const [tokenId, size] of Object.entries(cur)) {
        const before = Number(prevPos[tokenId]) || 0;
        if (size > before * 1.001 && scale > 0) push(byToken[tokenId], round2(size - before));
      }
      for (const [tokenId, beforeRaw] of Object.entries(prevPos)) {
        const before = Number(beforeRaw) || 0;
        const size = cur[tokenId] || 0;
        if (before > 0 && size < before * 0.999) deltas[tokenId] = { fraction: Math.min(1, (before - size) / before), pilot: w.address, pilotName: w.name };
      }
    }
    snapshot[w.address] = { positions: cur, value: round2(value), syncedAt: new Date(now).toISOString() };
  }
  buys.sort((a, b) => b.usd - a.usd);
  return { pilots: wallets, deltas, buys, snapshot, firstSync, positionsSeen };
}

/** Keep the P&L history bounded: drop every other point from the oldest half. */
function thinHistory(points) {
  if (points.length <= MAX_HISTORY) return points;
  const half = Math.floor(points.length / 2);
  const old = points.slice(0, half).filter((_, i) => i % 2 === 0);
  return [...old, ...points.slice(half)];
}

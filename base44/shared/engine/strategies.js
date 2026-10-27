/**
 * Trading strategies. Each one is a pure object:
 *
 *   scan(ctx)                → candidate entries ranked by score
 *   exitReason(trade, mark, market, ctx) → string | null
 *   needsBooks               → whether it wants CLOB order books
 *
 * A candidate is { market, outcome, tokenId, price, estProb, edge, score,
 * signal, signalValue, reason, maker }. `price` is the price we expect to pay
 * (the ask, or the bid for a maker order). `estProb` is the strategy's
 * estimate of the chance the bought outcome wins; `edge = estProb - price`.
 *
 * These are simple, transparent rules built on live Polymarket data. They are
 * a starting point for paper trading, not a claim of profitability.
 */
import { sidePrices, hoursToEnd } from './markets.js';
import { pnlPct } from './sizing.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const log10 = v => Math.log10(Math.max(10, v));

function candidate(market, outcome, { estProb, signal, signalValue, reason, score, maker = false }) {
  const side = sidePrices(market, outcome);
  const price = maker ? side.bid : side.ask;
  if (!(price > 0.01 && price < 0.99) || !side.tokenId) return null;
  const prob = clamp(estProb, 0.01, 0.99);
  return {
    market,
    outcome,
    tokenId: side.tokenId,
    price,
    estProb: +prob.toFixed(4),
    edge: +(prob - price).toFixed(4),
    score,
    signal,
    signalValue,
    reason,
    maker,
  };
}

/** In-play sports markets move on the game, not on the signals below. Skip them. */
function isInPlay(market, now) {
  if (market.live || market.ended) return true;
  return market.gameStartTime != null && market.gameStartTime <= now;
}

function baseFilter(market, ctx, { minVolume24h = 5000, minLiquidity = 2000, maxSpread = 0.06, minHours = 12 } = {}) {
  return (
    !isInPlay(market, ctx.now) &&
    market.volume24h >= minVolume24h &&
    market.liquidity >= minLiquidity &&
    (market.spread == null || market.spread <= maxSpread) &&
    hoursToEnd(market, ctx.now) >= minHours
  );
}

// ─── Momentum ─────────────────────────────────────────────────────────────────
const momentum = {
  id: 'momentum',
  label: 'Momentum',
  needsBooks: false,
  scan(ctx) {
    const out = [];
    for (const m of ctx.universe.markets) {
      if (!baseFilter(m, ctx)) continue;
      const up = m.change24h >= 0.03 && m.change1h >= -0.005;
      const down = m.change24h <= -0.03 && m.change1h <= 0.005;
      if (!up && !down) continue;
      const outcome = up ? 'YES' : 'NO';
      const side = sidePrices(m, outcome);
      if (side.ask == null || side.ask < 0.05 || side.ask > 0.93) continue;
      const push = clamp(0.5 * Math.abs(m.change24h) + 0.5 * Math.abs(m.change1h), 0.01, 0.1);
      const c = candidate(m, outcome, {
        estProb: side.ask + push,
        signal: up ? 'momentum_up' : 'momentum_down',
        signalValue: m.change24h,
        reason: `${up ? '+' : ''}${(m.change24h * 100).toFixed(0)}¢ in 24h, ${m.change1h >= 0 ? '+' : ''}${(m.change1h * 100).toFixed(1)}¢ in 1h`,
        score: (Math.abs(m.change24h) + Math.abs(m.change1h)) * log10(m.volume24h),
      });
      if (c) out.push(c);
    }
    return out;
  },
  exitReason(trade, mark, market) {
    if (!market) return null;
    if (trade.outcome === 'YES' && market.change1h <= -0.03) return 'momentum reversed (-3¢ in 1h)';
    if (trade.outcome === 'NO' && market.change1h >= 0.03) return 'momentum reversed (+3¢ in 1h)';
    return null;
  },
};

// ─── Mean reversion ───────────────────────────────────────────────────────────
const meanReversion = {
  id: 'mean_reversion',
  label: 'Mean Reversion',
  needsBooks: false,
  scan(ctx) {
    const out = [];
    for (const m of ctx.universe.markets) {
      if (!baseFilter(m, ctx, { minLiquidity: 5000, minVolume24h: 2000 })) continue;
      if (Math.abs(m.change1h) < 0.04) continue;
      const outcome = m.change1h < 0 ? 'YES' : 'NO'; // buy whatever just got cheaper
      const side = sidePrices(m, outcome);
      if (side.ask == null || side.ask < 0.08 || side.ask > 0.92) continue;
      const c = candidate(m, outcome, {
        estProb: side.ask + clamp(0.5 * Math.abs(m.change1h), 0.015, 0.06),
        signal: 'reversion',
        signalValue: m.change1h,
        reason: `${m.change1h > 0 ? '+' : ''}${(m.change1h * 100).toFixed(1)}¢ move in 1h, fading it`,
        score: Math.abs(m.change1h) * log10(m.liquidity),
      });
      if (c) out.push(c);
    }
    return out;
  },
  exitReason(trade, mark) {
    const move = Math.abs(Number(trade.signal_value) || 0);
    if (move > 0 && mark != null && mark - Number(trade.entry_price) >= 0.5 * move) return 'reversion target reached';
    return null;
  },
};

// ─── Sentiment (order-flow) ───────────────────────────────────────────────────
const sentiment = {
  id: 'sentiment',
  label: 'Sentiment',
  needsBooks: true,
  bookCandidates(ctx, limit = 10) {
    return ctx.universe.markets
      .filter(m => baseFilter(m, ctx) && m.yesPrice >= 0.08 && m.yesPrice <= 0.92)
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, limit);
  },
  scan(ctx) {
    const out = [];
    for (const m of this.bookCandidates(ctx)) {
      const book = ctx.books[m.yesTokenId];
      if (!book) continue;
      const imb = book.imbalance; // +1 = only bids, -1 = only asks
      if (Math.abs(imb) < 0.25) continue;
      const outcome = imb > 0 ? 'YES' : 'NO';
      const spike = m.volume1w > 0 ? m.volume24h / (m.volume1w / 7) : 1;
      const side = sidePrices(m, outcome);
      if (side.ask == null) continue;
      const c = candidate(m, outcome, {
        estProb: side.ask + clamp(0.06 * Math.abs(imb) * Math.min(spike, 2), 0.01, 0.06),
        signal: imb > 0 ? 'bid_pressure' : 'ask_pressure',
        signalValue: imb,
        reason: `book ${imb > 0 ? 'bid' : 'ask'}-heavy (${(imb * 100).toFixed(0)}%), volume ${spike.toFixed(1)}× weekly avg`,
        score: Math.abs(imb) * Math.min(spike, 3) * log10(m.volume24h),
      });
      if (c) out.push(c);
    }
    return out;
  },
  exitReason(trade, mark, market, ctx) {
    const book = ctx.books[trade.token_id];
    if (book && book.imbalance <= -0.3) return 'order flow flipped against position';
    return null;
  },
};

// ─── Market making ────────────────────────────────────────────────────────────
const marketMaking = {
  id: 'market_making',
  label: 'Market Making',
  needsBooks: false,
  scan(ctx) {
    const out = [];
    for (const m of ctx.universe.markets) {
      if (!baseFilter(m, ctx, { minVolume24h: 10000, minLiquidity: 20000, maxSpread: 0.2, minHours: 24 })) continue;
      if (m.bestBid == null || m.bestAsk == null || m.spread == null || m.spread < 0.02) continue;
      if (m.bestBid < 0.1 || m.bestAsk > 0.9) continue;
      const mid = (m.bestBid + m.bestAsk) / 2;
      const c = candidate(m, 'YES', {
        estProb: mid,
        signal: 'join_bid',
        signalValue: m.spread,
        reason: `join bid at ${(m.bestBid * 100).toFixed(0)}¢, spread ${(m.spread * 100).toFixed(0)}¢`,
        score: m.spread * log10(m.liquidity),
        maker: true,
      });
      if (c) out.push(c);
    }
    return out;
  },
  exitReason(trade, mark) {
    const spread = Number(trade.signal_value) || 0;
    if (spread > 0 && mark != null && mark >= Number(trade.entry_price) + spread) return 'spread captured';
    return null;
  },
};

// ─── NegRisk arbitrage ────────────────────────────────────────────────────────
const MIN_ARB_EDGE = 0.015;

const arbitrage = {
  id: 'arbitrage',
  label: 'Arbitrage',
  needsBooks: false,
  /**
   * Returns baskets, not single candidates. A basket is
   * { basketId, event, legs: [candidate], payoutPerSet, edge, kind }.
   */
  scanBaskets(ctx) {
    const baskets = [];
    let closest = null;
    for (const ev of ctx.universe.events) {
      if (!ev.negRisk || ev.markets.length < 3 || ev.live || ev.suspiciousClosed > 0) continue;
      if (ev.markets.some(m => isInPlay(m, ctx.now) || (m.yesPrice ?? 0) >= 0.99)) continue;
      const yesAsks = ev.markets.map(m => sidePrices(m, 'YES').ask);
      const yesBids = ev.markets.map(m => sidePrices(m, 'YES').bid);
      if (yesAsks.some(p => p == null) || yesBids.some(p => p == null)) continue;
      const n = ev.markets.length;
      const sumMid = ev.markets.reduce((s, m) => s + (m.yesPrice ?? 0), 0);
      if (sumMid > 1.1) continue; // prices inconsistent with one winner — stale data
      const sumYesAsk = yesAsks.reduce((s, p) => s + p, 0);
      const sumNoAsk = yesBids.reduce((s, p) => s + (1 - p), 0); // NO ask = 1 - YES bid
      // Buy every YES: exactly one pays 1. Only valid when the listed outcomes
      // are the complete set (not "augmented" with an implicit "other").
      const yesEdge = ev.negRiskAugmented || sumMid < 0.9 ? -1 : 1 - sumYesAsk;
      // Buy every NO: at least n-1 of them pay 1, whichever outcome wins.
      const noEdge = n - 1 - sumNoAsk;
      const best = Math.max(yesEdge, noEdge);
      if (!closest || best > closest.edge) closest = { event: ev, edge: best, sumYesAsk, sumNoAsk, n };
      if (yesEdge >= MIN_ARB_EDGE) {
        baskets.push(basket(ev, 'YES', 1, yesEdge, ctx));
      } else if (noEdge >= MIN_ARB_EDGE) {
        baskets.push(basket(ev, 'NO', n - 1, noEdge, ctx));
      }
    }
    return { baskets: baskets.filter(Boolean).sort((a, b) => b.edge - a.edge), closest };
  },
  scan() {
    return [];
  },
  exitReason() {
    return null; // baskets are held to settlement or convergence (handled in tick.js)
  },
};

function basket(ev, outcome, payoutPerSet, edge, ctx) {
  const legs = [];
  for (const m of ev.markets) {
    const c = candidate(m, outcome, {
      estProb: outcome === 'YES' ? sidePrices(m, 'YES').ask + edge / ev.markets.length : sidePrices(m, 'NO').ask + edge / ev.markets.length,
      signal: outcome === 'YES' ? 'negrisk_yes_basket' : 'negrisk_no_basket',
      signalValue: edge,
      reason: `${ev.markets.length}-way NegRisk basket, ${(edge * 100).toFixed(1)}¢ under payout`,
      score: edge,
    });
    if (!c) return null;
    legs.push(c);
  }
  return {
    basketId: `${ev.id}-${outcome}-${ctx.now}`,
    event: ev,
    outcome,
    legs,
    payoutPerSet,
    edge,
    kind: 'negrisk',
  };
}

// ─── Custom thresholds ────────────────────────────────────────────────────────
const custom = {
  id: 'custom',
  label: 'Custom',
  needsBooks: false,
  scan(ctx) {
    const params = ctx.bot.custom_params || {};
    const entry = Number(params.entry ?? 0.3);
    const exit = Number(params.exit ?? 0.7);
    const out = [];
    for (const m of ctx.universe.markets) {
      if (!baseFilter(m, ctx, { minVolume24h: 1000, minLiquidity: 2000 })) continue;
      const side = sidePrices(m, 'YES');
      if (side.ask == null || side.ask > entry || side.ask < 0.02) continue;
      if (exit <= side.ask) continue;
      const c = candidate(m, 'YES', {
        // The exit target is the goal, but for sizing cap the assumed edge at 20¢
        // so cheap long shots do not get sized like sure things.
        estProb: Math.min(exit, side.ask + 0.2),
        signal: 'below_entry',
        signalValue: entry,
        reason: `YES at ${(side.ask * 100).toFixed(0)}¢ ≤ entry ${(entry * 100).toFixed(0)}¢, target ${(exit * 100).toFixed(0)}¢`,
        score: m.volume24h,
      });
      if (c) out.push(c);
    }
    return out;
  },
  exitReason(trade, mark, market, ctx) {
    const exit = Number(ctx.bot.custom_params?.exit ?? 0.7);
    if (mark != null && mark >= exit) return `exit threshold ${(exit * 100).toFixed(0)}¢ reached`;
    return null;
  },
};

export const STRATEGIES = {
  momentum,
  mean_reversion: meanReversion,
  sentiment,
  market_making: marketMaking,
  arbitrage,
  custom,
};

export function getStrategy(id) {
  return STRATEGIES[id] || momentum;
}

/**
 * Generic exits that apply to every strategy except arbitrage baskets.
 * The move must be at least two ticks (2¢) so the bid/ask spread on a cheap
 * contract cannot trigger a stop by itself.
 */
const MIN_EXIT_MOVE = 0.02;

export function riskExitReason(trade, mark, risk) {
  if (mark == null) return null;
  const entry = Number(trade.entry_price);
  if (!(entry > 0)) return null;
  const move = mark - entry;
  const lossFloor = Math.max((entry * risk.stopLossPct) / 100, MIN_EXIT_MOVE);
  const gainFloor = Math.max((entry * risk.takeProfitPct) / 100, MIN_EXIT_MOVE);
  const pct = pnlPct(trade, mark);
  if (move <= -lossFloor) return `stop loss (${pct.toFixed(1)}%)`;
  if (move >= gainFloor) return `take profit (+${pct.toFixed(1)}%)`;
  return null;
}

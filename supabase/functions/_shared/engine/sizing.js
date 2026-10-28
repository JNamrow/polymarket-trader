/**
 * Position sizing: fractional Kelly with hard caps.
 *
 * For a binary contract bought at `price` that pays 1 if right, with an
 * estimated win probability `estProb`, full Kelly is
 *     f* = (estProb - price) / (1 - price)
 * The bot's `kelly_fraction` (¼, ½, ¾, 1) scales that down, and every
 * position is also capped at `max_position_pct` of the bot's allocation.
 */

export const DEFAULT_RISK = {
  maxPositions: 5,
  stopLossPct: 10, // close when a position is down this % of its cost
  takeProfitPct: 15, // close when a position is up this % of its cost
  maxPositionPct: 20, // one position may use at most this % of the allocation
  minTradeUsd: 2,
  kellyMultiplier: 0.25,
};

const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback);

export function riskParams(bot) {
  const custom = bot.custom_params || {};
  return {
    maxPositions: Math.max(1, Math.round(num(bot.max_positions, num(custom.maxPositions, DEFAULT_RISK.maxPositions)))),
    stopLossPct: Math.max(0, num(bot.stop_loss_pct, DEFAULT_RISK.stopLossPct)), // 0 = off
    takeProfitPct: Math.max(0, num(bot.take_profit_pct, DEFAULT_RISK.takeProfitPct)), // 0 = off
    maxPositionPct: Math.min(100, Math.max(1, num(bot.max_position_pct, DEFAULT_RISK.maxPositionPct))),
    minTradeUsd: DEFAULT_RISK.minTradeUsd,
    kellyMultiplier: Math.min(1, Math.max(0.05, num(bot.kelly_fraction, DEFAULT_RISK.kellyMultiplier))),
  };
}

export function kellyFraction(estProb, price) {
  if (!(price > 0 && price < 1) || !(estProb > 0)) return 0;
  return Math.max(0, (Math.min(estProb, 0.999) - price) / (1 - price));
}

/**
 * Size one position. Returns null when the trade is too small to bother with.
 */
export function positionSize({ estProb, price, bankroll, cash, risk }) {
  if (!(price > 0 && price < 1) || !(cash > 0) || !(bankroll > 0)) return null;
  const fullKelly = kellyFraction(estProb, price);
  const fraction = fullKelly * risk.kellyMultiplier;
  const cap = (bankroll * risk.maxPositionPct) / 100;
  const sizeUsd = Math.min(fraction * bankroll, cap, cash);
  if (!(sizeUsd >= risk.minTradeUsd)) return null;
  const quantity = Math.floor((sizeUsd / price) * 100) / 100; // shares, 2 dp
  if (quantity <= 0) return null;
  return {
    quantity,
    sizeUsd: +(quantity * price).toFixed(2),
    kellyFull: +fullKelly.toFixed(4),
    fractionUsed: +fraction.toFixed(4),
  };
}

/**
 * Size a passive maker quote. Market making earns the spread, not an edge
 * estimate, so Kelly does not apply: use half of the per-position cap.
 */
export function makerSize({ price, bankroll, cash, risk }) {
  if (!(price > 0 && price < 1) || !(cash > 0) || !(bankroll > 0)) return null;
  const sizeUsd = Math.min((bankroll * risk.maxPositionPct) / 100 / 2, cash);
  if (!(sizeUsd >= risk.minTradeUsd)) return null;
  const quantity = Math.floor((sizeUsd / price) * 100) / 100;
  if (quantity <= 0) return null;
  return { quantity, sizeUsd: +(quantity * price).toFixed(2), kellyFull: 0, fractionUsed: 0 };
}

/**
 * Size a basket of legs that together pay `payoutPerSet` per set of one
 * share of every leg (a NegRisk arbitrage basket). The basket is risk-free
 * at entry, so it only respects the per-position cap and available cash.
 */
export function basketSize({ legAsks, payoutPerSet, bankroll, cash, risk }) {
  const costPerSet = legAsks.reduce((s, p) => s + p, 0);
  if (!(costPerSet > 0) || !(payoutPerSet > costPerSet)) return null;
  const cap = (bankroll * risk.maxPositionPct) / 100;
  const budget = Math.min(cap, cash);
  const sets = Math.floor((budget / costPerSet) * 100) / 100;
  if (!(sets > 0) || sets * costPerSet < risk.minTradeUsd) return null;
  return {
    sets,
    costPerSet: +costPerSet.toFixed(4),
    totalCost: +(sets * costPerSet).toFixed(2),
    edge: +(payoutPerSet - costPerSet).toFixed(4),
    edgePct: +(((payoutPerSet - costPerSet) / costPerSet) * 100).toFixed(2),
  };
}

export function pnlPct(trade, mark) {
  const entry = Number(trade.entry_price);
  if (!(entry > 0) || mark == null) return 0;
  return ((mark - entry) / entry) * 100;
}

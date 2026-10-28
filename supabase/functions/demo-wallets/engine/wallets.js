/**
 * Wallet analytics for the whale tracker. Pure functions over Data API rows
 * (see polymarketApi.js): no fetching, no React, so the browser and the
 * scheduled backend scanner share one definition of every signal.
 *
 * Every number comes from public on-chain data. The scores are plain,
 * documented heuristics, a starting point for your own judgement, not a verdict.
 */

export const WHALE_DEFAULTS = Object.freeze({
  minUsd: 10_000, // a "whale" fill
  longShotPrice: 0.3, // buying at or below this price goes against the crowd
  freshAccountDays: 30, // an account younger than this is "fresh"
  fewMarkets: 3, // traded this many markets or fewer
  concentratedShare: 0.5, // one bet is at least half of the portfolio
});

export const ALERT_DEFAULTS = Object.freeze({
  minUsd: 25_000, // contrarian fills at or above this raise an alert
  followed: true, // any fill by a wallet you follow
  insiders: true, // suspicious fresh accounts
  contrarian: true, // big bets against the crowd
});

const DAY_MS = 86_400_000;

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Age of an account in days, or null when the join date is unknown. */
export function ageDays(joinedAt, now = Date.now()) {
  if (!joinedAt) return null;
  return Math.max(0, (now - joinedAt) / DAY_MS);
}

/** A BUY at long-shot odds, or a SELL of a heavy favourite, goes against the crowd. */
export function isContrarian(trade, { longShotPrice = WHALE_DEFAULTS.longShotPrice } = {}) {
  if (!trade) return false;
  if (trade.side === 'BUY') return trade.price > 0 && trade.price <= longShotPrice;
  if (trade.side === 'SELL') return trade.price >= 1 - longShotPrice;
  return false;
}

/** YES price implied by a fill on either outcome token. */
export function impliedYesPrice(trade) {
  return trade.outcomeIndex === 1 ? +(1 - trade.price).toFixed(4) : trade.price;
}

// Gamma tags → app category. First rule that matches wins.
const CATEGORY_RULES = [
  ['sports', ['sports', 'nba', 'nfl', 'mlb', 'nhl', 'soccer', 'football', 'tennis', 'ufc', 'mma', 'golf', 'f1', 'esports', 'boxing', 'cricket', 'college-football', 'college-basketball']],
  ['crypto', ['crypto', 'bitcoin', 'ethereum', 'solana', 'memecoins', 'defi', 'crypto-prices']],
  ['politics', ['politics', 'elections', 'geopolitics', 'trump', 'congress', 'senate', 'world-elections', 'global-elections', 'middle-east', 'ukraine', 'china', 'world']],
  ['business', ['business', 'finance', 'economics', 'economy', 'fed', 'fomc', 'stocks', 'earnings', 'us-cpi', 'tariffs', 'ipo']],
  ['tech', ['tech', 'ai', 'openai', 'spacex', 'apple', 'tesla']],
  ['science', ['science', 'weather', 'climate', 'space', 'health', 'pandemics']],
  ['culture', ['pop-culture', 'culture', 'movies', 'music', 'tv', 'celebrities', 'awards', 'entertainment', 'gaming']],
];

/** App category id ('politics', 'sports', …, or 'other') for a list of Gamma tag slugs. */
export function categoryFromTags(tags = []) {
  const set = new Set((tags || []).map(t => String(t).toLowerCase()));
  for (const [category, slugs] of CATEGORY_RULES) if (slugs.some(s => set.has(s))) return category;
  return 'other';
}

/** Win rate, profit factor and the extremes of a list of settled positions. */
export function summarizeClosed(closed = []) {
  let wins = 0;
  let losses = 0;
  let grossWins = 0;
  let grossLosses = 0;
  let biggestWin = 0;
  let biggestLoss = 0;
  let roiSum = 0;
  let roiCount = 0;
  for (const p of closed) {
    const pnl = Number(p.realizedPnl || 0);
    if (pnl > 0) {
      wins++;
      grossWins += pnl;
      biggestWin = Math.max(biggestWin, pnl);
    } else if (pnl < 0) {
      losses++;
      grossLosses -= pnl;
      biggestLoss = Math.min(biggestLoss, pnl);
    }
    const cost = Number(p.avgPrice || 0) * Number(p.totalSize || 0);
    if (cost > 0) {
      roiSum += pnl / cost;
      roiCount++;
    }
  }
  const decided = wins + losses;
  return {
    count: closed.length,
    wins,
    losses,
    winRate: decided ? wins / decided : null,
    realizedPnl: grossWins - grossLosses,
    grossWins,
    grossLosses,
    profitFactor: grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : null,
    avgRoi: roiCount ? roiSum / roiCount : null,
    biggestWin,
    biggestLoss,
  };
}

/** How much of an open portfolio sits in its single biggest market. */
export function concentration(positions = []) {
  const byMarket = new Map();
  let total = 0;
  for (const p of positions) {
    const value = Math.max(0, Number(p.currentValue || 0));
    total += value;
    const key = p.conditionId || p.title;
    const row = byMarket.get(key) || { conditionId: p.conditionId, title: p.title, outcome: p.outcome, value: 0 };
    row.value += value;
    byMarket.set(key, row);
  }
  const top = [...byMarket.values()].sort((a, b) => b.value - a.value)[0] || null;
  return { total, markets: byMarket.size, top, topShare: total > 0 && top ? top.value / total : null };
}

export const SCORE_MIN_CLOSED = 5;

export function scoreLabel(score) {
  if (score == null) return 'Unrated';
  if (score >= 75) return 'Elite';
  if (score >= 60) return 'Strong';
  if (score >= 45) return 'Average';
  return 'Weak';
}

/**
 * Trader score, 0–100, from public data only:
 *   40  profitability  realized P&L ÷ cash volume, −20%…+20% maps to 0…40
 *   20  hit rate       share of settled positions that made money
 *   10  profit factor  gross wins ÷ gross losses, capped at 3
 *   10  experience     markets traded, capped at 50
 *   10  track record   account age, capped at one year
 *   10  discipline     full marks when no market holds more than 25% of the portfolio
 * Wallets with fewer than SCORE_MIN_CLOSED settled positions are "Unrated".
 */
export function traderScore({ stats, closed = [], concentration: conc = null }) {
  const summary = Array.isArray(closed) ? summarizeClosed(closed) : closed;
  if (!stats || !summary || summary.count < SCORE_MIN_CLOSED) return { score: null, label: 'Unrated', parts: null, summary };
  const roi = stats.volume > 0 ? stats.realizedPnl / stats.volume : 0;
  const parts = {
    profitability: clamp((roi + 0.2) / 0.4, 0, 1) * 40,
    hitRate: (summary.winRate ?? 0) * 20,
    profitFactor: (summary.profitFactor == null ? 0 : Math.min(summary.profitFactor, 3) / 3) * 10,
    experience: clamp(stats.marketsTraded / 50, 0, 1) * 10,
    trackRecord: clamp((ageDays(stats.joinedAt) ?? 0) / 365, 0, 1) * 10,
    discipline: (1 - clamp(((conc?.topShare ?? 0) - 0.25) / 0.75, 0, 1)) * 10,
  };
  const score = Math.round(Object.values(parts).reduce((s, v) => s + v, 0));
  return { score, label: scoreLabel(score), parts, summary };
}

export const FLAG_LABELS = {
  fresh_account: 'Fresh account',
  few_markets: 'Few markets',
  concentrated: 'Concentrated',
  long_shot: 'Long shot',
  big_size: 'Big size',
};

/**
 * Potential-insider signals for one fill. Points add up to a 0–100 score.
 * `suspicious` needs a fresh account plus at least one conviction signal:
 * a new wallet making one big, concentrated or long-shot bet is the pattern
 * worth a second look.
 *   fresh_account  joined ≤ 30 days ago (45 pts if ≤ 7 days, else 35)
 *   few_markets    ≤ 3 markets ever traded (20)
 *   concentrated   the fill is ≥ 50% of the wallet's portfolio value (20)
 *   long_shot      BUY at ≤ 30¢ (15; 20 at ≤ 15¢)
 *   big_size       ≥ $25k (10) or ≥ $100k (15)
 * `pending` is true while the wallet's stats have not loaded yet.
 */
export function insiderSignals({ trade, stats = null, portfolioValue = null }, opts = {}) {
  const o = { ...WHALE_DEFAULTS, ...opts };
  const flags = [];
  let score = 0;
  const add = (id, pts, detail) => {
    flags.push({ id, label: FLAG_LABELS[id], pts, detail });
    score += pts;
  };

  const days = stats ? ageDays(stats.joinedAt, o.now) : null;
  if (days != null && days <= o.freshAccountDays) add('fresh_account', days <= 7 ? 45 : 35, days < 1 ? 'joined today' : `${Math.round(days)}d old`);
  if (stats && stats.marketsTraded > 0 && stats.marketsTraded <= o.fewMarkets) {
    add('few_markets', 20, `${stats.marketsTraded} market${stats.marketsTraded === 1 ? '' : 's'} ever`);
  }
  if (trade.side === 'BUY' && portfolioValue != null) {
    const share = trade.usd / Math.max(portfolioValue, trade.usd, 1);
    if (share >= o.concentratedShare) add('concentrated', 20, `${Math.round(share * 100)}% of portfolio`);
  }
  if (trade.side === 'BUY' && trade.price > 0 && trade.price <= o.longShotPrice) add('long_shot', trade.price <= 0.15 ? 20 : 15, `${Math.round(trade.price * 100)}¢`);
  if (trade.usd >= 100_000) add('big_size', 15, '≥ $100k');
  else if (trade.usd >= 25_000) add('big_size', 10, '≥ $25k');

  const fresh = flags.some(f => f.id === 'fresh_account');
  const conviction = flags.some(f => f.id === 'concentrated' || f.id === 'long_shot' || f.id === 'big_size');
  return { flags, score: Math.min(100, score), suspicious: fresh && conviction, pending: !stats };
}

/**
 * Insider flags for a wallet-registry row (public.wallets in the shared
 * sandbox). Same point table as insiderSignals, applied to what the registry
 * has seen from the wallet so far instead of to one fill:
 *   fresh_account  joined ≤ 30 days ago (45 pts if ≤ 7 days, else 35)
 *   few_markets    ≤ 3 markets ever traded (20)
 *   concentrated   at least one buy worth ≥ 50% of the portfolio (20)
 *   long_shot      at least one buy at ≤ 30¢ (15)
 *   big_size       biggest fill ≥ $25k (10) or ≥ $100k (15)
 * `suspicious` = fresh account plus at least one conviction signal.
 */
export function registryFlags(row = {}, opts = {}) {
  const o = { ...WHALE_DEFAULTS, ...opts };
  const flags = [];
  let score = 0;
  const add = (id, pts, detail) => {
    flags.push({ id, label: FLAG_LABELS[id], pts, detail });
    score += pts;
  };
  const days = row.wallet_age_days ?? (row.joined_at ? ageDays(Date.parse(row.joined_at), o.now) : null);
  if (days != null && days <= o.freshAccountDays) add('fresh_account', days <= 7 ? 45 : 35, days < 1 ? 'joined today' : `${Math.round(days)}d old`);
  const markets = Number(row.markets_traded || 0);
  if (markets > 0 && markets <= o.fewMarkets) add('few_markets', 20, `${markets} market${markets === 1 ? '' : 's'} ever`);
  if (row.concentrated_fills > 0) add('concentrated', 20, `${row.concentrated_fills} buy${row.concentrated_fills === 1 ? '' : 's'} ≥ ${Math.round(o.concentratedShare * 100)}% of the portfolio`);
  if (row.long_shot_fills > 0) add('long_shot', 15, `${row.long_shot_fills} buy${row.long_shot_fills === 1 ? '' : 's'} at ≤ ${Math.round(o.longShotPrice * 100)}¢`);
  const max = Number(row.max_fill_usd || 0);
  if (max >= 100_000) add('big_size', 15, '≥ $100k');
  else if (max >= 25_000) add('big_size', 10, '≥ $25k');
  const fresh = flags.some(f => f.id === 'fresh_account');
  const conviction = flags.some(f => f.id === 'concentrated' || f.id === 'long_shot' || f.id === 'big_size');
  return { flags, score: Math.min(100, score), suspicious: fresh && conviction };
}

/** The stats object fetchUserStats() returns, rebuilt from a registry row (null when the row was never checked). */
export function statsFromRegistry(row) {
  if (!row || !row.last_checked_at) return null;
  return {
    address: row.address,
    joinedAt: row.joined_at ? Date.parse(row.joined_at) : null,
    marketsTraded: Number(row.markets_traded || 0),
    tradeCount: Number(row.trade_count || 0),
    biggestWin: Number(row.biggest_win || 0),
    realizedPnl: Number(row.realized_pnl || 0),
    unrealizedPnl: Number(row.unrealized_pnl || 0),
    totalPnl: Number(row.total_pnl || 0),
    tradePnl: Number(row.trade_pnl ?? row.total_pnl ?? 0),
    walletIncome: 0,
    volume: Number(row.volume || 0),
    volumeTotal: Number(row.volume_total ?? row.volume ?? 0),
    feesPaid: Number(row.fees_paid || 0),
    views: 0,
  };
}

/**
 * Where the biggest holders sit versus the price. `holders` is fetchHolders()
 * output; `yesPrice` the market's YES price. Each side's top holders are
 * dollar-weighted and the YES share is compared with the price the crowd
 * pays. Across a whole market that share equals the price exactly (every $1
 * mints one YES and one NO), so `gap` > 0 means the whales lean YES.
 */
export function holdersLean(holders = [], { yesPrice }) {
  const price = Number(yesPrice);
  let yesValue = 0;
  let noValue = 0;
  const topYes = [];
  const topNo = [];
  for (const group of holders) {
    for (const h of group.holders || []) {
      const isYes = h.outcomeIndex === 0;
      const value = h.amount * (isYes ? price : 1 - price);
      if (isYes) {
        yesValue += value;
        topYes.push({ ...h, value });
      } else {
        noValue += value;
        topNo.push({ ...h, value });
      }
    }
  }
  const total = yesValue + noValue;
  const yesShare = total > 0 ? yesValue / total : null;
  return {
    yesValue,
    noValue,
    yesShare,
    gap: yesShare != null && Number.isFinite(price) ? yesShare - price : null,
    topYes: topYes.sort((a, b) => b.value - a.value),
    topNo: topNo.sort((a, b) => b.value - a.value),
  };
}

/**
 * Pool the open positions of several top traders: one row per market with how
 * many of them hold it, which side, and the dollars behind each side. `gap` is
 * the smart-money YES share minus the YES price, the same idea as holdersLean.
 */
export function aggregateSmartMoney(positionsByWallet = {}, { minTraders = 2 } = {}) {
  const rows = new Map();
  for (const [wallet, positions] of Object.entries(positionsByWallet)) {
    for (const p of positions || []) {
      if (!p.conditionId || !(p.currentValue > 0)) continue;
      const row = rows.get(p.conditionId) || {
        conditionId: p.conditionId,
        title: p.title,
        slug: p.slug,
        eventSlug: p.eventSlug,
        icon: p.icon,
        endDate: p.endDate,
        outcomes: ['Yes', 'No'],
        yesValue: 0,
        noValue: 0,
        yesPrice: null,
        wallets: new Map(),
      };
      const isYes = p.outcomeIndex === 0;
      row.outcomes = isYes ? [p.outcome, p.oppositeOutcome || row.outcomes[1]] : [p.oppositeOutcome || row.outcomes[0], p.outcome];
      if (isYes) row.yesValue += p.currentValue;
      else row.noValue += p.currentValue;
      row.yesPrice = isYes ? p.curPrice : +(1 - p.curPrice).toFixed(4);
      const w = row.wallets.get(wallet) || { wallet, yes: 0, no: 0, pnl: 0 };
      if (isYes) w.yes += p.currentValue;
      else w.no += p.currentValue;
      w.pnl += Number(p.cashPnl || 0);
      row.wallets.set(wallet, w);
      rows.set(p.conditionId, row);
    }
  }
  return [...rows.values()]
    .map(r => {
      const total = r.yesValue + r.noValue;
      const yesShare = total > 0 ? r.yesValue / total : null;
      const wallets = [...r.wallets.values()];
      return {
        ...r,
        wallets,
        traders: wallets.length,
        yesTraders: wallets.filter(w => w.yes >= w.no).length,
        total,
        yesShare,
        gap: yesShare != null && r.yesPrice != null ? yesShare - r.yesPrice : null,
      };
    })
    .filter(r => r.traders >= minTraders)
    .sort((a, b) => b.total - a.total);
}

/** Group fills by wallet, keeping the strongest insider score and the union of flags. */
export function groupByWallet(trades = [], signalsById = {}) {
  const groups = new Map();
  for (const t of trades) {
    const g = groups.get(t.wallet) || { wallet: t.wallet, name: t.name, profileImage: t.profileImage, trades: [], usd: 0, score: 0, flags: new Map(), suspicious: false, pending: false };
    const s = signalsById[t.id];
    g.trades.push(t);
    g.usd += t.usd;
    if (s) {
      g.score = Math.max(g.score, s.score);
      g.suspicious = g.suspicious || s.suspicious;
      g.pending = g.pending || s.pending;
      for (const f of s.flags) if (!g.flags.has(f.id)) g.flags.set(f.id, f);
    }
    groups.set(t.wallet, g);
  }
  return [...groups.values()]
    .map(g => ({ ...g, flags: [...g.flags.values()], trades: g.trades.sort((a, b) => b.timestamp - a.timestamp) }))
    .sort((a, b) => b.score - a.score || b.usd - a.usd);
}

/** Short human text for a fill: "bought $12k of YES at 34¢". */
export function describeFill(trade) {
  const verb = trade.side === 'BUY' ? 'bought' : 'sold';
  return `${verb} ${formatCompactUsd(trade.usd)} of ${trade.outcome} at ${Math.round(trade.price * 100)}¢`;
}

export function formatCompactUsd(n) {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}k`;
  return `$${v.toFixed(0)}`;
}

/**
 * Alerts a fill should raise for one user. kinds:
 *   followed    a wallet you follow traded
 *   insider     a suspicious fresh account made a conviction bet
 *   contrarian  a fill of at least prefs.minUsd against the crowd
 *   whale       a very large fill (4× prefs.minUsd), whatever the side
 */
export function alertsForTrade({ trade, signals = null, followed = new Set(), prefs = ALERT_DEFAULTS }) {
  const p = { ...ALERT_DEFAULTS, ...(prefs || {}) };
  const out = [];
  const base = {
    tradeId: trade.id,
    wallet: trade.wallet,
    name: trade.name || trade.wallet.slice(0, 8),
    conditionId: trade.conditionId,
    title: trade.title,
    eventSlug: trade.eventSlug,
    outcome: trade.outcome,
    side: trade.side,
    usd: trade.usd,
    price: trade.price,
    timestamp: trade.timestamp,
  };
  const who = base.name;
  if (p.followed !== false && followed.has(trade.wallet)) {
    out.push({ ...base, id: `followed:${trade.id}`, kind: 'followed', text: `${who} ${describeFill(trade)} · ${trade.title}` });
  }
  if (p.insiders !== false && signals?.suspicious) {
    out.push({ ...base, id: `insider:${trade.id}`, kind: 'insider', text: `Fresh account ${who} ${describeFill(trade)} · ${trade.title}` });
  }
  if (p.contrarian !== false && trade.usd >= p.minUsd && isContrarian(trade)) {
    out.push({ ...base, id: `contrarian:${trade.id}`, kind: 'contrarian', text: `${who} ${describeFill(trade)} against the crowd · ${trade.title}` });
  } else if (trade.usd >= p.minUsd * 4) {
    out.push({ ...base, id: `whale:${trade.id}`, kind: 'whale', text: `${who} ${describeFill(trade)} · ${trade.title}` });
  }
  return out;
}

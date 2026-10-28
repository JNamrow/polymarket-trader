/**
 * Polymarket public API calls used by the trading engine and the whale tracker.
 * Works in the browser and in Deno (both have global fetch).
 *
 *   Gamma — https://gamma-api.polymarket.com  (markets, events, tags)
 *   CLOB  — https://clob.polymarket.com       (books, prices, history)
 *   Data  — https://data-api.polymarket.com   (trades, positions, wallet stats, leaderboard)
 *
 * Read-only. Placing orders needs a signed request and is not done here.
 * All three APIs answer with `Access-Control-Allow-Origin: *`, so the browser
 * calls them directly. Bursts get 429s, which getJson retries with a pause.
 */
import { normalizeMarket, flattenEvents, CATEGORY_TAGS, hoursToEnd } from './markets.js';

export const GAMMA_API = 'https://gamma-api.polymarket.com';
export const CLOB_API = 'https://clob.polymarket.com';
export const DATA_API = 'https://data-api.polymarket.com';

const RETRYABLE = new Set([429, 502, 503, 504]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function getJson(url, init, { retries = 2 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res.json();
    if (RETRYABLE.has(res.status) && attempt < retries) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : 800 * (attempt + 1);
      await sleep(wait);
      continue;
    }
    const text = await res.text().catch(() => '');
    throw new Error(`Polymarket ${res.status} on ${url.replace(/^https?:\/\//, '').split('?')[0]}${text ? `: ${text.slice(0, 100)}` : ''}`);
  }
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Run `fn` over `items` with at most `limit` calls in flight. A failed item becomes null. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch {
        out[i] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

/**
 * Concurrency gate shared by callers that fan out over many wallets:
 * `const limit = createLimiter(4); await limit(() => fetchUserStats(a))`.
 */
export function createLimiter(max = 4) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return fn =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

// ─── Gamma ────────────────────────────────────────────────────────────────────

/** Live events (each with nested markets). `tag` = Gamma tag slug or null. */
export async function fetchEvents({ tag = null, limit = 40, offset = 0 } = {}) {
  const params = new URLSearchParams({
    active: 'true',
    closed: 'false',
    order: 'volume24hr',
    ascending: 'false',
    limit: String(limit),
    offset: String(offset),
  });
  if (tag) params.set('tag_slug', tag);
  const events = await getJson(`${GAMMA_API}/events?${params}`);
  return Array.isArray(events) ? events : [];
}

/**
 * Tradable universe for app categories (['all'] or ['politics', ...]).
 * Markets ending within `minHoursToEnd` are dropped: the 5-minute "up or
 * down" crypto markets resolve before a bot can manage a position in them.
 */
export async function fetchUniverse(categories = ['all'], { perCategory = 40, minHoursToEnd = 6, now = Date.now() } = {}) {
  const wantsAll = !categories?.length || categories.includes('all');
  const tags = wantsAll ? [null] : [...new Set(categories.map(c => CATEGORY_TAGS[c]).filter(Boolean))];
  const lists = await Promise.all(tags.map(tag => fetchEvents({ tag, limit: perCategory })));
  const { markets, events } = flattenEvents(lists.flat());
  const keep = m => hoursToEnd(m, now) >= minHoursToEnd;
  return {
    markets: markets.filter(keep),
    events: events
      .map(ev => ({ ...ev, markets: ev.markets.filter(keep) }))
      .filter(ev => ev.markets.length > 0),
    fetchedAt: now,
  };
}

export async function fetchMarketById(id) {
  const m = await getJson(`${GAMMA_API}/markets/${id}`);
  return normalizeMarket(m, m.events?.[0]);
}

/** Markets by condition id (used to settle positions whose market left the universe). */
export async function fetchMarketsByConditionIds(conditionIds) {
  const ids = [...new Set(conditionIds.filter(Boolean))];
  const out = {};
  for (const batch of chunk(ids, 20)) {
    const params = new URLSearchParams();
    batch.forEach(id => params.append('condition_ids', id));
    const rows = await getJson(`${GAMMA_API}/markets?${params}`).catch(() => []);
    for (const raw of Array.isArray(rows) ? rows : []) {
      const m = normalizeMarket(raw, raw.events?.[0]);
      if (m.conditionId) out[m.conditionId] = m;
    }
  }
  return out;
}

/** condition id → Gamma tag slugs. Used to sort fills and positions into app categories. */
export async function fetchMarketTags(conditionIds) {
  const ids = [...new Set(conditionIds.filter(Boolean))];
  const out = {};
  for (const batch of chunk(ids, 20)) {
    const params = new URLSearchParams({ include_tag: 'true' });
    batch.forEach(id => params.append('condition_ids', id));
    const rows = await getJson(`${GAMMA_API}/markets?${params}`).catch(() => []);
    for (const m of Array.isArray(rows) ? rows : []) {
      if (m.conditionId) out[m.conditionId] = (m.tags || []).map(t => t?.slug).filter(Boolean);
    }
  }
  return out;
}

// ─── CLOB ─────────────────────────────────────────────────────────────────────

/** token_id → midpoint. */
export async function fetchMidpoints(tokenIds) {
  const ids = [...new Set(tokenIds.filter(Boolean))];
  const out = {};
  for (const batch of chunk(ids, 100)) {
    const res = await getJson(`${CLOB_API}/midpoints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch.map(token_id => ({ token_id }))),
    });
    for (const [id, mid] of Object.entries(res || {})) out[id] = Number(mid);
  }
  return out;
}

/**
 * token_id → { bid, ask, mid }. The CLOB reports the best resting *buy*
 * order as BUY (the bid) and the best resting *sell* order as SELL (the ask).
 */
export async function fetchQuotes(tokenIds) {
  const ids = [...new Set(tokenIds.filter(Boolean))];
  const out = {};
  for (const batch of chunk(ids, 50)) {
    const body = batch.flatMap(token_id => [
      { token_id, side: 'BUY' },
      { token_id, side: 'SELL' },
    ]);
    const res = await getJson(`${CLOB_API}/prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    for (const [id, sides] of Object.entries(res || {})) {
      const bid = sides?.BUY != null ? Number(sides.BUY) : null;
      const ask = sides?.SELL != null ? Number(sides.SELL) : null;
      const mid = bid != null && ask != null ? +((bid + ask) / 2).toFixed(4) : (bid ?? ask);
      out[id] = { bid, ask, mid };
    }
  }
  return out;
}

/** Order book with a depth summary near the touch. */
export async function fetchBook(tokenId, { depthCents = 5 } = {}) {
  const book = await getJson(`${CLOB_API}/book?token_id=${tokenId}`);
  const bids = (book.bids || []).map(l => ({ price: Number(l.price), size: Number(l.size) })).sort((a, b) => b.price - a.price);
  const asks = (book.asks || []).map(l => ({ price: Number(l.price), size: Number(l.size) })).sort((a, b) => a.price - b.price);
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const band = depthCents / 100;
  const bidDepth = bids.filter(l => bestBid != null && l.price >= bestBid - band).reduce((s, l) => s + l.size * l.price, 0);
  const askDepth = asks.filter(l => bestAsk != null && l.price <= bestAsk + band).reduce((s, l) => s + l.size * l.price, 0);
  const total = bidDepth + askDepth;
  return {
    tokenId,
    bids,
    asks,
    bestBid,
    bestAsk,
    spread: bestBid != null && bestAsk != null ? +(bestAsk - bestBid).toFixed(4) : null,
    bidDepth,
    askDepth,
    imbalance: total > 0 ? (bidDepth - askDepth) / total : 0, // +1 all bids, -1 all asks
    timestamp: Number(book.timestamp) || Date.now(),
  };
}

/** Price history for a token. interval: '1h' | '6h' | '1d' | '1w' | '1m' | 'max'. */
export async function fetchPriceHistory(tokenId, { interval = '1d', fidelity = 30 } = {}) {
  const res = await getJson(`${CLOB_API}/prices-history?market=${tokenId}&interval=${interval}&fidelity=${fidelity}`);
  return (res.history || []).map(p => ({ t: p.t * 1000, p: Number(p.p) }));
}

// ─── Data API: traders ────────────────────────────────────────────────────────

/** Polymarket shows a random two-word pseudonym until a user picks a name. */
export function traderName(row = {}) {
  const name = row.name || row.user_name || row.userName || '';
  if (name && !/^0x[0-9a-f]{40}-\d+$/i.test(name)) return name;
  return row.pseudonym || '';
}

/** One fill from the Data API `/trades` endpoint → flat Fill. */
export function normalizeTrade(t) {
  const size = Number(t.size || 0);
  const price = Number(t.price || 0);
  return {
    id: `${t.transactionHash}:${t.asset}:${t.side}:${size}`,
    txHash: t.transactionHash,
    wallet: String(t.proxyWallet || '').toLowerCase(),
    name: traderName(t),
    pseudonym: t.pseudonym || '',
    profileImage: t.profileImage || '',
    side: t.side,
    tokenId: t.asset,
    conditionId: t.conditionId,
    outcome: t.outcome,
    outcomeIndex: Number(t.outcomeIndex ?? 0),
    size,
    price,
    usd: +(size * price).toFixed(2),
    timestamp: Number(t.timestamp || 0) * 1000,
    title: t.title,
    slug: t.slug,
    eventSlug: t.eventSlug,
    icon: t.icon || '',
  };
}

/**
 * Large taker fills across every market, newest first. `minUsd` filters on
 * notional (shares × price). Narrow with `market` (condition id), `user`
 * (wallet) or `side` ('BUY' | 'SELL'). Pages with `offset`; `limit` ≤ 1000.
 */
export async function fetchWhaleTrades({ minUsd = 10_000, limit = 100, offset = 0, side = null, market = null, user = null, takerOnly = true } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    takerOnly: String(takerOnly),
    filterType: 'CASH',
    filterAmount: String(minUsd),
  });
  if (side) params.set('side', side);
  if (market) params.set('market', market);
  if (user) params.set('user', user);
  const rows = await getJson(`${DATA_API}/trades?${params}`);
  return (Array.isArray(rows) ? rows : []).map(normalizeTrade);
}

/** Recent fills for a wallet. */
export async function fetchWalletTrades(address, { limit = 25 } = {}) {
  const params = new URLSearchParams({ user: address, limit: String(limit) });
  const rows = await getJson(`${DATA_API}/trades?${params}`);
  return (Array.isArray(rows) ? rows : []).map(normalizeTrade);
}

/**
 * Lifetime numbers for a wallet. Polymarket's profile page shows
 * `trade_pnl` as "Profit/Loss" (trading P&L before fees) and `volume` as
 * "Total Volume", so those are `tradePnl` and `volumeTotal` here.
 *   realizedPnl   closed positions, after fees
 *   unrealizedPnl open positions, marked to market
 *   totalPnl      economic P&L: realized + unrealized + rebates and rewards
 *   volume        cash that actually changed hands (volume_usdc)
 */
export async function fetchUserStats(address) {
  const res = await getJson(`${DATA_API}/v2/user-stats?user=${address}`);
  const d = res?.data || res || {};
  const pnl = d.all_time_pnl || {};
  const realized = Number(pnl.realized_pnl || 0);
  const unrealized = Number(pnl.unrealized_pnl || 0);
  const economic = pnl.economic_pnl != null ? Number(pnl.economic_pnl) : realized + unrealized;
  return {
    address: String(d.proxy_wallet || address).toLowerCase(),
    joinedAt: d.join_date ? Number(d.join_date) * 1000 : null,
    marketsTraded: Number(d.trades || 0),
    tradeCount: Number(pnl.trade_count || 0),
    biggestWin: Number(d.biggest_win || 0),
    realizedPnl: realized,
    unrealizedPnl: unrealized,
    totalPnl: economic,
    tradePnl: pnl.trade_pnl != null ? Number(pnl.trade_pnl) : economic,
    walletIncome: Number(pnl.wallet_income || 0),
    volume: Number(pnl.volume_usdc ?? pnl.volume ?? 0),
    volumeTotal: Number(pnl.volume ?? pnl.volume_usdc ?? 0),
    feesPaid: Math.abs(Number(pnl.fees_paid || 0)),
    views: Number(d.views || 0),
  };
}

const PNL_FIDELITY = { '1d': '1h', '1w': '3h', '1m': '18h', all: '1d' };

/** P&L curve for a wallet. interval: '1d' | '1w' | '1m' | 'all'. */
export async function fetchPnlHistory(address, { interval = '1m' } = {}) {
  const fidelity = PNL_FIDELITY[interval] || '1d';
  const res = await getJson(`${DATA_API}/v2/user-pnl?user=${address}&interval=${interval}&fidelity=${fidelity}`);
  return (res?.data?.points || []).map(p => {
    const realized = Number(p.realized_pnl || 0);
    const unrealized = Number(p.unrealized_pnl || 0);
    const total = p.economic_pnl != null ? Number(p.economic_pnl) : realized + unrealized;
    return {
      t: Number(p.timestamp) * 1000,
      realized,
      unrealized,
      total,
      trade: p.trade_pnl != null ? Number(p.trade_pnl) : total, // the line Polymarket's profile chart draws
      volume: Number(p.volume_usdc ?? p.volume ?? 0),
      trades: Number(p.trade_count || 0),
    };
  });
}

/** Open positions for a Polymarket (proxy) wallet address, biggest first. */
export async function fetchPositions(address, { limit = 100 } = {}) {
  const params = new URLSearchParams({ user: address, limit: String(limit), sortBy: 'CURRENT', sortDirection: 'DESC' });
  const rows = await getJson(`${DATA_API}/positions?${params}`);
  return (Array.isArray(rows) ? rows : []).map(p => ({
    wallet: String(p.proxyWallet || address).toLowerCase(),
    tokenId: p.asset,
    conditionId: p.conditionId,
    title: p.title,
    slug: p.slug,
    eventId: p.eventId != null ? String(p.eventId) : null,
    eventSlug: p.eventSlug,
    outcome: p.outcome,
    outcomeIndex: Number(p.outcomeIndex ?? 0),
    oppositeOutcome: p.oppositeOutcome || null,
    size: Number(p.size || 0),
    avgPrice: Number(p.avgPrice || 0),
    curPrice: Number(p.curPrice || 0),
    initialValue: Number(p.initialValue || 0),
    currentValue: Number(p.currentValue || 0),
    cashPnl: Number(p.cashPnl || 0),
    percentPnl: Number(p.percentPnl || 0),
    realizedPnl: Number(p.realizedPnl || 0),
    redeemable: !!p.redeemable,
    negRisk: !!p.negativeRisk,
    endDate: p.endDate || null,
    icon: p.icon || null,
  }));
}

/**
 * Settled positions, newest first. The API caps one page, so for busy
 * wallets this is a recent sample (the last `limit` settled positions), not
 * the whole history. Sorting by profit instead would return only winners.
 */
export async function fetchClosedPositions(address, { limit = 500, sortBy = 'TIMESTAMP', sortDirection = 'DESC' } = {}) {
  const params = new URLSearchParams({
    user: address,
    status: 'CLOSED',
    limit: String(limit),
    sort_by: sortBy,
    sort_direction: sortDirection,
  });
  const res = await getJson(`${DATA_API}/v2/positions?${params}`);
  return (res?.data || []).map(p => ({
    wallet: String(p.proxy_wallet || address).toLowerCase(),
    tokenId: p.token_id,
    conditionId: p.condition_id,
    title: p.title,
    slug: p.slug,
    eventSlug: p.event_slug,
    icon: p.icon || '',
    outcome: p.outcome,
    outcomeIndex: Number(p.outcome_index ?? 0),
    avgPrice: Number(p.avg_price || 0),
    totalSize: Number(p.total_size || 0),
    realizedPnl: Number(p.realized_pnl || 0),
    percentRealizedPnl: Number(p.percent_realized_pnl || 0),
    curPrice: Number(p.current_price || 0),
    firstEntryAt: p.first_entry_at ? Number(p.first_entry_at) * 1000 : null,
    lastEventAt: p.last_event_at ? Number(p.last_event_at) * 1000 : null,
    endDate: p.end_date || null,
  }));
}

/**
 * On-chain activity for a wallet: TRADE, SPLIT, MERGE, REDEEM, REWARD, CONVERSION.
 * `types` narrows to those kinds; `start` (ms) skips anything older.
 */
export async function fetchActivity(address, { limit = 30, types = null, start = null } = {}) {
  const params = new URLSearchParams({ user: address, limit: String(limit) });
  if (types?.length) params.set('type', types.join(','));
  if (start) params.set('start', String(Math.floor(start / 1000)));
  const rows = await getJson(`${DATA_API}/activity?${params}`);
  return (Array.isArray(rows) ? rows : []).map(a => ({
    id: `${a.transactionHash}:${a.asset || a.conditionId}:${a.type}:${a.timestamp}`,
    type: a.type,
    side: a.side || '',
    size: Number(a.size || 0),
    usd: Number(a.usdcSize || 0),
    price: Number(a.price || 0),
    timestamp: Number(a.timestamp || 0) * 1000,
    conditionId: a.conditionId,
    tokenId: a.asset || null,
    title: a.title,
    slug: a.slug,
    eventSlug: a.eventSlug,
    outcome: a.outcome,
    outcomeIndex: Number(a.outcomeIndex ?? 0),
    icon: a.icon || '',
    txHash: a.transactionHash,
  }));
}

/** Biggest holders of each outcome token of a market (condition id). */
export async function fetchHolders(conditionId, { limit = 20 } = {}) {
  const rows = await getJson(`${DATA_API}/holders?market=${conditionId}&limit=${limit}`);
  return (Array.isArray(rows) ? rows : []).map(group => ({
    tokenId: group.token,
    holders: (group.holders || []).map(h => ({
      wallet: String(h.proxyWallet || '').toLowerCase(),
      name: traderName(h),
      pseudonym: h.pseudonym || '',
      profileImage: h.profileImage || '',
      amount: Number(h.amount || 0),
      outcomeIndex: Number(h.outcomeIndex ?? 0),
      verified: !!h.verified,
    })),
  }));
}

/** Value of a wallet's open positions in USDC. */
export async function fetchPortfolioValue(address) {
  const res = await getJson(`${DATA_API}/value?user=${address}`);
  const row = Array.isArray(res) ? res[0] : res?.data || res;
  return Number(row?.value || 0);
}

/** Leaderboard niches the Data API accepts. */
export const LEADERBOARD_CATEGORIES = [
  { id: 'overall', label: 'All' },
  { id: 'politics', label: 'Politics' },
  { id: 'sports', label: 'Sports' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'culture', label: 'Culture' },
  { id: 'finance', label: 'Finance' },
  { id: 'economics', label: 'Economics' },
  { id: 'tech', label: 'Tech' },
];

/**
 * Top traders. window: '1d' | '1w' | '1m' | 'all'. orderBy: 'PNL' | 'VOL'.
 * category: see LEADERBOARD_CATEGORIES. Paging is cursor-only here (pass the
 * previous response's `nextCursor`).
 */
export async function fetchLeaderboard({ window = '1w', limit = 20, orderBy = 'PNL', category = 'overall', cursor = null } = {}) {
  const params = new URLSearchParams({ window, limit: String(limit), orderBy });
  if (category && category !== 'overall') params.set('category', category);
  if (cursor) params.set('cursor', cursor);
  const res = await getJson(`${DATA_API}/v2/leaderboard?${params}`);
  const rows = (res.data || []).map(row => ({
    rank: Number(row.rank),
    address: String(row.user_id || '').toLowerCase(),
    name: traderName(row),
    xUsername: row.x_username || '',
    verified: !!row.verified,
    pnl: Number(row.pnl || 0),
    volume: Number(row.volume || 0),
    profileImage: row.profile_image || '',
  }));
  rows.nextCursor = res.pagination?.has_more ? res.pagination.next_cursor : null;
  return rows;
}

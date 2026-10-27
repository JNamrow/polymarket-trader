/**
 * Polymarket public API calls used by the trading engine.
 * Works in the browser and in Deno (both have global fetch).
 *
 *   Gamma — https://gamma-api.polymarket.com  (markets, events, tags)
 *   CLOB  — https://clob.polymarket.com       (books, prices, history)
 *   Data  — https://data-api.polymarket.com   (leaderboard, positions, trades)
 *
 * Read-only. Placing orders needs a signed request and is not done here.
 */
import { normalizeMarket, flattenEvents, CATEGORY_TAGS, hoursToEnd } from './markets.js';

export const GAMMA_API = 'https://gamma-api.polymarket.com';
export const CLOB_API = 'https://clob.polymarket.com';
export const DATA_API = 'https://data-api.polymarket.com';

export async function getJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Polymarket ${res.status} on ${url.replace(/^https?:\/\//, '').split('?')[0]}${text ? `: ${text.slice(0, 100)}` : ''}`);
  }
  return res.json();
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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

// ─── Data API ─────────────────────────────────────────────────────────────────

/**
 * Top traders. window: '1d' | '1w' | '1m' | 'all'. orderBy: 'PNL' | 'VOL'.
 * Paging is cursor-only on this endpoint (pass the previous response's next_cursor).
 */
export async function fetchLeaderboard({ window = '1w', limit = 20, orderBy = 'PNL', cursor = null } = {}) {
  const params = new URLSearchParams({ window, limit: String(limit), orderBy });
  if (cursor) params.set('cursor', cursor);
  const res = await getJson(`${DATA_API}/v2/leaderboard?${params}`);
  return (res.data || []).map(row => ({
    rank: Number(row.rank),
    address: row.user_id,
    name: row.user_name || '',
    xUsername: row.x_username || '',
    verified: !!row.verified,
    pnl: Number(row.pnl || 0),
    volume: Number(row.volume || 0),
    profileImage: row.profile_image || '',
  }));
}

/** Open positions for a Polymarket (proxy) wallet address. */
export async function fetchPositions(address, { limit = 50 } = {}) {
  const params = new URLSearchParams({ user: address, limit: String(limit), sortBy: 'CURRENT', sortDirection: 'DESC' });
  const rows = await getJson(`${DATA_API}/positions?${params}`);
  return (Array.isArray(rows) ? rows : []).map(p => ({
    tokenId: p.asset,
    conditionId: p.conditionId,
    title: p.title,
    slug: p.slug,
    eventSlug: p.eventSlug,
    outcome: p.outcome,
    size: Number(p.size || 0),
    avgPrice: Number(p.avgPrice || 0),
    curPrice: Number(p.curPrice || 0),
    initialValue: Number(p.initialValue || 0),
    currentValue: Number(p.currentValue || 0),
    cashPnl: Number(p.cashPnl || 0),
    percentPnl: Number(p.percentPnl || 0),
    realizedPnl: Number(p.realizedPnl || 0),
    redeemable: !!p.redeemable,
    endDate: p.endDate || null,
    icon: p.icon || null,
  }));
}

/** Recent fills for a wallet. */
export async function fetchWalletTrades(address, { limit = 25 } = {}) {
  const params = new URLSearchParams({ user: address, limit: String(limit) });
  const rows = await getJson(`${DATA_API}/trades?${params}`);
  return (Array.isArray(rows) ? rows : []).map(t => ({
    side: t.side,
    tokenId: t.asset,
    conditionId: t.conditionId,
    size: Number(t.size || 0),
    price: Number(t.price || 0),
    timestamp: Number(t.timestamp || 0) * 1000,
    title: t.title,
    slug: t.slug,
    eventSlug: t.eventSlug,
    outcome: t.outcome,
    txHash: t.transactionHash,
  }));
}

/** Value of a wallet's open positions in USDC. */
export async function fetchPortfolioValue(address) {
  const res = await getJson(`${DATA_API}/value?user=${address}`);
  const row = Array.isArray(res) ? res[0] : res;
  return Number(row?.value || 0);
}

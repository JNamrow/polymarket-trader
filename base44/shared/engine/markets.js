/**
 * Market normalization shared by the frontend and backend functions.
 * Plain ESM, no runtime-specific APIs, so Vite and Deno can both import it.
 */

export const POLYMARKET_SITE = 'https://polymarket.com';

/** App category id → Gamma tag slug. 'all' means no tag filter. */
export const CATEGORY_TAGS = {
  politics: 'politics',
  sports: 'sports',
  crypto: 'crypto',
  culture: 'pop-culture',
  science: 'science',
  business: 'business',
  tech: 'tech',
};

export const CATEGORY_LABELS = {
  all: 'All',
  politics: 'Politics',
  sports: 'Sports',
  crypto: 'Crypto',
  culture: 'Culture',
  science: 'Science',
  business: 'Business',
  tech: 'Tech',
};

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Gamma writes game times like "2026-10-27 23:30:00+00"; return ms or null. */
export function parseGameTime(value) {
  if (!value) return null;
  const iso = String(value).trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** Gamma market object (optionally with its parent event) → flat Market. */
export function normalizeMarket(m, event = null) {
  const outcomes = parseJsonArray(m.outcomes);
  const prices = parseJsonArray(m.outcomePrices).map(p => num(p, null));
  const tokens = parseJsonArray(m.clobTokenIds);
  const ev = event || m.events?.[0] || null;
  const eventMarketCount = ev?.markets?.length ?? (ev ? 1 : 1);
  const eventSlug = ev?.slug || m.slug;
  const yesPrice = prices[0] ?? null;
  const bestBid = m.bestBid != null ? num(m.bestBid, null) : null;
  const bestAsk = m.bestAsk != null ? num(m.bestAsk, null) : null;

  return {
    id: String(m.id),
    conditionId: m.conditionId,
    slug: m.slug,
    question: m.question,
    groupItemTitle: m.groupItemTitle || '',
    eventId: ev?.id != null ? String(ev.id) : null,
    eventTitle: ev?.title || m.question,
    eventSlug,
    eventMarketCount,
    outcomes: outcomes.length ? outcomes : ['Yes', 'No'],
    yesPrice,
    noPrice: prices[1] ?? (yesPrice != null ? +(1 - yesPrice).toFixed(4) : null),
    yesTokenId: tokens[0] || null,
    noTokenId: tokens[1] || null,
    bestBid,
    bestAsk,
    spread: m.spread != null ? num(m.spread, null) : (bestBid != null && bestAsk != null ? +(bestAsk - bestBid).toFixed(4) : null),
    lastTradePrice: m.lastTradePrice != null ? num(m.lastTradePrice, null) : null,
    change1h: num(m.oneHourPriceChange),
    change24h: num(m.oneDayPriceChange),
    change1w: num(m.oneWeekPriceChange),
    volume24h: num(m.volume24hr),
    volume1w: num(m.volume1wk),
    volume: num(m.volumeNum ?? m.volume),
    liquidity: num(m.liquidityNum ?? m.liquidity),
    endDate: m.endDate || null,
    closed: !!m.closed,
    active: !!m.active,
    acceptingOrders: m.acceptingOrders !== false,
    negRisk: !!m.negRisk,
    negRiskMarketId: m.negRiskMarketID || null,
    minTick: num(m.orderPriceMinTickSize, 0.01),
    minSize: num(m.orderMinSize, 5),
    image: m.image || m.icon || ev?.image || null,
    gameStartTime: parseGameTime(m.gameStartTime),
    live: !!ev?.live,
    ended: !!ev?.ended,
    url: eventMarketCount > 1
      ? `${POLYMARKET_SITE}/event/${eventSlug}/${m.slug}`
      : `${POLYMARKET_SITE}/event/${eventSlug}`,
  };
}

/**
 * Gamma events (with nested markets) → { markets, events }.
 * Markets are de-duplicated and only tradable ones are kept.
 */
export function flattenEvents(events) {
  const seen = new Set();
  const markets = [];
  const normalizedEvents = [];
  for (const ev of events || []) {
    const evMarkets = [];
    for (const raw of ev.markets || []) {
      const market = normalizeMarket(raw, ev);
      if (!isTradable(market)) continue;
      evMarkets.push(market);
      if (seen.has(market.id)) continue;
      seen.add(market.id);
      markets.push(market);
    }
    if (evMarkets.length) {
      const rawMarkets = ev.markets || [];
      // A closed market that still shows a meaningful YES price was not simply
      // eliminated: the event may be resolved or mid-resolution. Arbitrage skips those.
      const suspiciousClosed = rawMarkets.filter(raw => {
        const m = normalizeMarket(raw, ev);
        return !isTradable(m) && (m.yesPrice ?? 0) > 0.05;
      }).length;
      normalizedEvents.push({
        id: String(ev.id),
        title: ev.title,
        slug: ev.slug,
        negRisk: !!ev.negRisk,
        negRiskAugmented: !!ev.negRiskAugmented, // an implicit "other" outcome exists
        live: !!ev.live,
        volume24h: num(ev.volume24hr),
        liquidity: num(ev.liquidity),
        endDate: ev.endDate || null,
        rawMarketCount: rawMarkets.length,
        suspiciousClosed,
        markets: evMarkets,
      });
    }
  }
  return { markets, events: normalizedEvents };
}

export function isTradable(market) {
  return (
    !!market.yesTokenId &&
    !market.closed &&
    market.active &&
    market.acceptingOrders &&
    market.yesPrice != null
  );
}

/** Hours until the market's scheduled end (Infinity when unknown). */
export function hoursToEnd(market, now = Date.now()) {
  if (!market.endDate) return Infinity;
  const end = Date.parse(market.endDate);
  if (!Number.isFinite(end)) return Infinity;
  return (end - now) / 3_600_000;
}

/** Price of a given outcome token, derived from the YES book when needed. */
export function sidePrices(market, outcome) {
  const yesBid = market.bestBid ?? market.yesPrice;
  const yesAsk = market.bestAsk ?? market.yesPrice;
  if (outcome === 'YES') {
    return { bid: yesBid, ask: yesAsk, tokenId: market.yesTokenId };
  }
  // The NO book mirrors the YES book: NO bid = 1 - YES ask, NO ask = 1 - YES bid.
  return {
    bid: yesAsk != null ? +(1 - yesAsk).toFixed(4) : null,
    ask: yesBid != null ? +(1 - yesBid).toFixed(4) : null,
    tokenId: market.noTokenId,
  };
}

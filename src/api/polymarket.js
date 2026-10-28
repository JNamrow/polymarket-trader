/**
 * Polymarket public API client for the frontend.
 *
 * The real implementation lives in src/engine/polymarketApi.js (mirrored to
 * base44/shared/engine for the backend functions). This file re-exports it
 * and adds a few browser-only formatting helpers.
 */
export {
  GAMMA_API,
  CLOB_API,
  DATA_API,
  getJson,
  mapLimit,
  createLimiter,
  fetchEvents,
  fetchUniverse,
  fetchMarketById,
  fetchMarketsByConditionIds,
  fetchMarketTags,
  fetchMidpoints,
  fetchQuotes,
  fetchBook,
  fetchPriceHistory,
  traderName,
  normalizeTrade,
  fetchWhaleTrades,
  fetchWalletTrades,
  fetchUserStats,
  fetchPnlHistory,
  fetchPositions,
  fetchClosedPositions,
  fetchActivity,
  fetchHolders,
  fetchPortfolioValue,
  LEADERBOARD_CATEGORIES,
  fetchLeaderboard,
} from '@/engine/polymarketApi.js';

export {
  CATEGORY_TAGS,
  CATEGORY_LABELS,
  POLYMARKET_SITE,
  normalizeMarket,
  flattenEvents,
  hoursToEnd,
  sidePrices,
} from '@/engine/markets.js';

import { POLYMARKET_SITE } from '@/engine/markets.js';

export function profileUrl(address) {
  return `${POLYMARKET_SITE}/profile/${address}`;
}

export function shortAddress(address = '') {
  return address.length > 10 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/** "$1,234.50", or with compact: "$1.2k", "$12k", "$1.5M". Negatives keep their sign. */
export function formatUsd(value, { digits = 2, compact = false } = {}) {
  const n = Number(value || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (compact) {
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
    return `${sign}$${abs.toFixed(abs >= 100 ? 0 : digits)}`;
  }
  return `${sign}$${abs.toFixed(digits)}`;
}

export function formatSignedUsd(value, digits = 2) {
  const n = Number(value || 0);
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(digits)}`;
}

export function formatCents(price) {
  if (price == null || Number.isNaN(Number(price))) return '—';
  return `${Math.round(Number(price) * 100)}¢`;
}

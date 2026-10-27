/**
 * Polymarket public API client for the frontend.
 *
 * The real implementation lives in base44/shared/engine/polymarketApi.js so
 * the backend tick function can use the same code. This file re-exports it
 * and adds a few browser-only helpers.
 */
export {
  GAMMA_API,
  CLOB_API,
  DATA_API,
  fetchEvents,
  fetchUniverse,
  fetchMarketById,
  fetchMarketsByConditionIds,
  fetchMidpoints,
  fetchQuotes,
  fetchBook,
  fetchPriceHistory,
  fetchLeaderboard,
  fetchPositions,
  fetchWalletTrades,
  fetchPortfolioValue,
} from '../../base44/shared/engine/polymarketApi.js';

export {
  CATEGORY_TAGS,
  CATEGORY_LABELS,
  POLYMARKET_SITE,
  normalizeMarket,
  flattenEvents,
  hoursToEnd,
  sidePrices,
} from '../../base44/shared/engine/markets.js';

import { POLYMARKET_SITE } from '../../base44/shared/engine/markets.js';

export function profileUrl(address) {
  return `${POLYMARKET_SITE}/profile/${address}`;
}

export function shortAddress(address = '') {
  return address.length > 10 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

export function formatUsd(value, { digits = 2, compact = false } = {}) {
  const n = Number(value || 0);
  if (compact && Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (compact && Math.abs(n) >= 10_000) return `$${(n / 1_000).toFixed(0)}k`;
  if (compact && Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(digits)}`;
}

export function formatSignedUsd(value, digits = 2) {
  const n = Number(value || 0);
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(digits)}`;
}

export function formatCents(price) {
  if (price == null || Number.isNaN(Number(price))) return '—';
  return `${Math.round(Number(price) * 100)}¢`;
}

/**
 * React Query hooks for the whale tracker. Everything here reads public
 * Polymarket data; nothing needs a login. Calls that fan out over many
 * wallets go through a small concurrency gate because the Data API answers
 * bursts with 429s.
 */
import { useMemo } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import {
  fetchWhaleTrades,
  fetchWalletTrades,
  fetchUserStats,
  fetchPortfolioValue,
  fetchPositions,
  fetchClosedPositions,
  fetchPnlHistory,
  fetchActivity,
  fetchHolders,
  fetchMarketTags,
  fetchLeaderboard,
  createLimiter,
} from '@/api/polymarket';
import { insiderSignals, traderScore, concentration, categoryFromTags, aggregateSmartMoney, holdersLean } from '@/engine/wallets.js';
import { useRegistrySeed } from '@/lib/useRegistry';

export const dataApiGate = createLimiter(4);
const gated = fn => () => dataApiGate(fn);

const MINUTE = 60_000;
const STATS_STALE = 15 * MINUTE;

const queryKeyOf = queries => queries.map(q => q.dataUpdatedAt || (q.isError ? 'err' : 0)).join(',');
const EMPTY = [];

// ─── Feed ─────────────────────────────────────────────────────────────────────

/** Large fills across all markets, refreshed every 30 s. */
export function useWhaleFeed({ minUsd = 10_000, side = null, limit = 100, refetchInterval = 30 * 1000, enabled = true } = {}) {
  return useQuery({
    queryKey: ['whale-feed', minUsd, side, limit],
    queryFn: () => fetchWhaleTrades({ minUsd, side, limit }),
    staleTime: 20 * 1000,
    refetchInterval,
    enabled,
    placeholderData: previous => previous,
  });
}

/**
 * Lifetime stats and portfolio value for many wallets at once (feed enrichment).
 * With `wait` the queries are not mounted yet: useFeedSignals waits for the
 * wallet registry to seed the cache first, so wallets the server already
 * checked cost no Data API call.
 */
export function useWalletEnrichment(addresses = [], { wait = false } = {}) {
  const unique = useMemo(() => [...new Set(addresses.filter(Boolean))], [addresses]);
  const list = wait ? EMPTY : unique;
  const statsQueries = useQueries({
    queries: list.map(address => ({
      queryKey: ['trader-stats', address],
      queryFn: gated(() => fetchUserStats(address)),
      staleTime: STATS_STALE,
      retry: 1,
    })),
  });
  const valueQueries = useQueries({
    queries: list.map(address => ({
      queryKey: ['trader-value', address],
      queryFn: gated(() => fetchPortfolioValue(address)),
      staleTime: 5 * MINUTE,
      retry: 1,
    })),
  });
  const statsKey = queryKeyOf(statsQueries);
  const valueKey = queryKeyOf(valueQueries);
  return useMemo(() => {
    const statsByWallet = {};
    const valueByWallet = {};
    const settled = new Set();
    let pending = wait ? unique.length : 0;
    list.forEach((address, i) => {
      const s = statsQueries[i];
      const v = valueQueries[i];
      if (s.data) statsByWallet[address] = s.data;
      if (s.data || s.isError) settled.add(address);
      else pending++;
      if (v.data != null) valueByWallet[address] = v.data;
    });
    return { statsByWallet, valueByWallet, settled, pending, total: unique.length };
    // statsKey / valueKey change whenever any query resolves, which is when this must recompute.
  }, [unique, list, wait, statsKey, valueKey]);
}

/** Potential-insider signals for every fill in a feed, filled in as wallet stats arrive. */
export function useFeedSignals(trades = []) {
  const addresses = useMemo(() => trades.map(t => t.wallet), [trades]);
  const seed = useRegistrySeed(addresses);
  const enrichment = useWalletEnrichment(addresses, { wait: !seed.ready });
  const signalsById = useMemo(() => {
    const out = {};
    for (const t of trades) {
      out[t.id] = insiderSignals({
        trade: t,
        stats: enrichment.statsByWallet[t.wallet] || null,
        portfolioValue: enrichment.valueByWallet[t.wallet] ?? null,
      });
      if (enrichment.settled.has(t.wallet)) out[t.id].pending = false;
    }
    return out;
  }, [trades, enrichment]);
  return { signalsById, ...enrichment };
}

/** App category for each condition id. Tags are fetched once per market per session. */
const categoryCache = new Map();
export function useMarketCategories(conditionIds = []) {
  const missing = useMemo(() => [...new Set(conditionIds.filter(id => id && !categoryCache.has(id)))].sort(), [conditionIds]);
  const query = useQuery({
    queryKey: ['market-tags', missing.join(',')],
    enabled: missing.length > 0,
    staleTime: Infinity,
    retry: 1,
    queryFn: async () => {
      const tags = await fetchMarketTags(missing);
      for (const id of missing) categoryCache.set(id, categoryFromTags(tags[id] || []));
      return tags;
    },
  });
  return useMemo(() => {
    const out = {};
    for (const id of conditionIds) out[id] = categoryCache.get(id) || null;
    return out;
  }, [conditionIds, query.dataUpdatedAt]);
}

// ─── One trader ───────────────────────────────────────────────────────────────

export function useTraderStats(address, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['trader-stats', address],
    queryFn: gated(() => fetchUserStats(address)),
    staleTime: STATS_STALE,
    enabled: !!address && enabled,
    retry: 1,
  });
}

export function useTraderValue(address, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['trader-value', address],
    queryFn: gated(() => fetchPortfolioValue(address)),
    staleTime: 5 * MINUTE,
    enabled: !!address && enabled,
    retry: 1,
  });
}

export function useTraderPositions(address, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['trader-positions', address],
    queryFn: gated(() => fetchPositions(address, { limit: 100 })),
    staleTime: 2 * MINUTE,
    enabled: !!address && enabled,
    retry: 1,
  });
}

export function useTraderClosed(address, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['trader-closed', address],
    queryFn: gated(() => fetchClosedPositions(address, { limit: 500 })),
    staleTime: 10 * MINUTE,
    enabled: !!address && enabled,
    retry: 1,
  });
}

export function useTraderPnl(address, interval = '1m', { enabled = true } = {}) {
  return useQuery({
    queryKey: ['trader-pnl', address, interval],
    queryFn: gated(() => fetchPnlHistory(address, { interval })),
    staleTime: 10 * MINUTE,
    enabled: !!address && enabled,
    retry: 1,
  });
}

export function useTraderActivity(address, { limit = 40, enabled = true } = {}) {
  return useQuery({
    queryKey: ['trader-activity', address, limit],
    queryFn: gated(() => fetchActivity(address, { limit })),
    staleTime: MINUTE,
    enabled: !!address && enabled,
    retry: 1,
  });
}

/** Recent fills of one wallet, polled so followed wallets can raise alerts. */
export function useWalletFills(address, { limit = 15, refetchInterval = null, enabled = true } = {}) {
  return useQuery({
    queryKey: ['wallet-fills', address, limit],
    queryFn: gated(() => fetchWalletTrades(address, { limit })),
    staleTime: 30 * 1000,
    refetchInterval: refetchInterval ?? false,
    enabled: !!address && enabled,
    retry: 1,
  });
}

/** Everything the profile drawer shows, plus the derived score and concentration. */
export function useTraderProfile(address) {
  const stats = useTraderStats(address);
  const value = useTraderValue(address);
  const positions = useTraderPositions(address);
  const closed = useTraderClosed(address);
  const derived = useMemo(() => {
    const conc = concentration(positions.data || []);
    const score = traderScore({ stats: stats.data, closed: closed.data || [], concentration: conc });
    return { concentration: conc, score, summary: score.summary };
  }, [stats.data, positions.data, closed.data]);
  return {
    stats,
    value,
    positions,
    closed,
    ...derived,
    isLoading: stats.isLoading || positions.isLoading || closed.isLoading,
  };
}

// ─── Leaderboard and smart money ──────────────────────────────────────────────

export function useLeaderboard({ window = '1w', orderBy = 'PNL', category = 'overall', limit = 20, enabled = true } = {}) {
  return useQuery({
    queryKey: ['leaderboard', window, orderBy, category, limit],
    queryFn: gated(() => fetchLeaderboard({ window, orderBy, category, limit })),
    staleTime: 2 * MINUTE,
    enabled,
    retry: 1,
  });
}

/**
 * Pool the open positions of the top `top` traders on a leaderboard into one
 * row per market (see aggregateSmartMoney). Loads one wallet at a time
 * through the gate; `loaded`/`total` show progress.
 */
export function useSmartMoney({ window = '1m', category = 'overall', top = 10, enabled = true } = {}) {
  const board = useLeaderboard({ window, orderBy: 'PNL', category, limit: top, enabled });
  const wallets = useMemo(() => (board.data || []).map(w => w.address), [board.data]);
  const positionQueries = useQueries({
    queries: wallets.map(address => ({
      queryKey: ['trader-positions', address],
      queryFn: gated(() => fetchPositions(address, { limit: 100 })),
      staleTime: 5 * MINUTE,
      retry: 1,
      enabled,
    })),
  });
  const key = queryKeyOf(positionQueries);
  const rows = useMemo(() => {
    const byWallet = {};
    wallets.forEach((address, i) => {
      if (positionQueries[i].data) byWallet[address] = positionQueries[i].data;
    });
    return aggregateSmartMoney(byWallet, { minTraders: 2 });
  }, [wallets, key]);
  const loaded = positionQueries.filter(q => q.data || q.isError).length;
  const tradersByAddress = useMemo(() => Object.fromEntries((board.data || []).map(w => [w.address, w])), [board.data]);
  return { board, rows, loaded, total: wallets.length, tradersByAddress, isLoading: board.isLoading };
}

// ─── One market ───────────────────────────────────────────────────────────────

/** Top holders of both outcomes plus the whale lean versus the YES price. */
export function useMarketHolders(conditionId, yesPrice, { enabled = true } = {}) {
  const query = useQuery({
    queryKey: ['holders', conditionId],
    queryFn: gated(() => fetchHolders(conditionId, { limit: 20 })),
    staleTime: 2 * MINUTE,
    enabled: !!conditionId && enabled,
    retry: 1,
  });
  const lean = useMemo(() => (query.data ? holdersLean(query.data, { yesPrice }) : null), [query.data, yesPrice]);
  return { ...query, lean };
}

/** Fills of at least `minUsd` in one market, newest first. */
export function useMarketWhaleTrades(conditionId, { minUsd = 1000, limit = 30, enabled = true } = {}) {
  return useQuery({
    queryKey: ['market-whales', conditionId, minUsd, limit],
    queryFn: gated(() => fetchWhaleTrades({ market: conditionId, minUsd, limit })),
    staleTime: MINUTE,
    enabled: !!conditionId && enabled,
    retry: 1,
  });
}

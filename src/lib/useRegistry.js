/**
 * Wallet registry hooks. The registry is public.wallets in the shared
 * Supabase sandbox, grown by the demo-wallets Edge Function (one row per
 * wallet seen behind a fill of $1,000 or more, with public stats, trader
 * score and insider flags). Only the shared sandbox has it; in the private
 * demo or the owner's Base44 app registryAvailable() is false and these
 * hooks stay idle.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44, isSharedSandbox } from '@/api/base44Client';
import { statsFromRegistry } from '@/engine/wallets.js';

const MINUTE = 60_000;
const FRESH_MS = 24 * 60 * MINUTE; // a server check younger than this stands in for a live one

export const registryAvailable = () => isSharedSandbox() && typeof base44.registry?.query === 'function';

/** One page of wallets for the given sort, filters and search. */
export function useRegistry(params, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['registry', params],
    queryFn: () => base44.registry.query(params),
    enabled: enabled && registryAvailable(),
    staleTime: MINUTE,
    placeholderData: previous => previous,
    retry: 1,
  });
}

/** Registry size, checked count, second-look count and the last scan. */
export function useRegistryStats({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['registry-stats'],
    queryFn: () => base44.registry.stats(),
    enabled: enabled && registryAvailable(),
    staleTime: MINUTE,
    refetchInterval: MINUTE,
    retry: 1,
  });
}

/**
 * Seeds the per-wallet stats cache (the keys useTraderStats / useTraderValue
 * use) from the registry, so the live feed only calls the Data API for
 * wallets the server has not checked within a day. `ready` turns true once
 * the seed for the current set of wallets is in the cache (or the registry
 * is unavailable), which is when the feed should mount its own queries.
 */
export function useRegistrySeed(addresses = []) {
  const queryClient = useQueryClient();
  const available = registryAvailable();
  const unique = useMemo(() => [...new Set(addresses.filter(Boolean))].sort(), [addresses]);
  const key = unique.join(',');
  const query = useQuery({
    queryKey: ['registry-seed', key],
    queryFn: () => base44.registry.lookup(unique),
    enabled: available && unique.length > 0,
    staleTime: 5 * MINUTE,
    retry: 1,
  });
  const [applied, setApplied] = useState('');
  useEffect(() => {
    if (!query.data && !query.isError) return;
    const cutoff = Date.now() - FRESH_MS;
    for (const row of Object.values(query.data || {})) {
      const stats = statsFromRegistry(row);
      if (!stats || Date.parse(row.last_checked_at) < cutoff) continue;
      if (queryClient.getQueryData(['trader-stats', row.address]) == null) queryClient.setQueryData(['trader-stats', row.address], stats, { updatedAt: Date.now() });
      if (row.portfolio_value != null && queryClient.getQueryData(['trader-value', row.address]) == null) {
        queryClient.setQueryData(['trader-value', row.address], Number(row.portfolio_value), { updatedAt: Date.now() });
      }
    }
    setApplied(key);
  }, [query.data, query.isError, key, queryClient]);
  const seeded = useMemo(() => Object.values(query.data || {}).filter(r => r.last_checked_at).length, [query.data]);
  return { ready: !available || unique.length === 0 || applied === key, seeded, available };
}

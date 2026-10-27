/**
 * The signed-in user's profile plus the app's per-user settings, which Base44
 * stores as extra fields on the User record (auth.updateMe):
 *
 *   polymarket_address  Polymarket proxy wallet (0x…) — real cash + positions
 *   browser_wallet      last connected browser wallet address (read-only)
 *   wallet_balance      manual USDC balance, used when no address is set
 *   default_fund        default allocation for new bots
 *   default_algorithm   default strategy for new bots
 *   watched_wallets     [{ address, label }] shown first on the Watchlist
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { isAddress, getPolygonUsdc } from '@/lib/wallet';
import { fetchPortfolioValue } from '@/api/polymarket';

export function useUserProfile() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me(),
    staleTime: 60_000,
    retry: 0,
  });
  const mutation = useMutation({
    mutationFn: data => base44.auth.updateMe(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });
  return {
    user: query.data || null,
    isLoading: query.isLoading,
    update: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}

/** Live USDC cash and position value for a Polymarket wallet address. */
export function useWalletFunds(address) {
  const valid = isAddress(address);
  return useQuery({
    queryKey: ['wallet-funds', address],
    enabled: valid,
    queryFn: async () => {
      const [usdc, positionsValue] = await Promise.all([
        getPolygonUsdc(address),
        fetchPortfolioValue(address).catch(() => null),
      ]);
      return { cash: usdc.total, usdce: usdc.usdce, usdc: usdc.usdc, positionsValue, fetchedAt: Date.now() };
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });
}

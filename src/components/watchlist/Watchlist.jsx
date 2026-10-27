import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Plus, Trophy, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import WalletCard from './WalletCard';
import { fetchLeaderboard, formatUsd } from '@/api/polymarket';
import { isAddress } from '@/lib/wallet';
import { useUserProfile } from '@/lib/useUserProfile';

const WINDOWS = [
  { id: '1d', label: '24h' },
  { id: '1w', label: '7d' },
  { id: '1m', label: '30d' },
  { id: 'all', label: 'All time' },
];

export default function Watchlist() {
  const { user, update, isSaving } = useUserProfile();
  const [window, setWindow] = useState('1w');
  const [orderBy, setOrderBy] = useState('PNL');
  const [newAddress, setNewAddress] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const leaderboard = useQuery({
    queryKey: ['leaderboard', window, orderBy],
    queryFn: () => fetchLeaderboard({ window, orderBy, limit: 20 }),
    staleTime: 120_000,
    retry: 1,
  });

  const watched = Array.isArray(user?.watched_wallets) ? user.watched_wallets : [];

  const addWallet = async () => {
    const address = newAddress.trim().toLowerCase();
    if (!isAddress(address)) {
      toast.error('Enter a valid 0x wallet address');
      return;
    }
    if (watched.some(w => w.address.toLowerCase() === address)) {
      toast.error('Already tracked');
      return;
    }
    try {
      await update({ watched_wallets: [...watched, { address, label: newLabel.trim() || '' }] });
      setNewAddress('');
      setNewLabel('');
      toast.success('Wallet tracked');
    } catch (err) {
      toast.error(err?.message || 'Could not save');
    }
  };

  const removeWallet = async wallet => {
    try {
      await update({ watched_wallets: watched.filter(w => w.address.toLowerCase() !== wallet.address.toLowerCase()) });
    } catch (err) {
      toast.error(err?.message || 'Could not save');
    }
  };

  const rows = (leaderboard.data || []).map(w => ({ ...w, window: WINDOWS.find(x => x.id === window)?.label }));
  const totalPnl = rows.reduce((s, w) => s + w.pnl, 0);
  const totalVolume = rows.reduce((s, w) => s + w.volume, 0);

  return (
    <div className="space-y-4">
      {/* Track a wallet */}
      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Track a wallet</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={newAddress}
            onChange={e => setNewAddress(e.target.value)}
            placeholder="0x… Polymarket profile address"
            className="bg-background border-border font-mono text-xs h-9 flex-1"
          />
          <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Label (optional)" className="bg-background border-border text-xs h-9 sm:w-40" />
          <Button size="sm" onClick={addWallet} disabled={isSaving} className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Track
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Any Polymarket profile address works — copy it from a profile URL (polymarket.com/profile/0x…) or from a leaderboard card below.
        </p>
      </div>

      {watched.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tracked wallets</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {watched.map(w => (
              <WalletCard key={w.address} wallet={{ ...w, pnl: null }} tracked onRemove={removeWallet} />
            ))}
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div className="flex items-center gap-2 flex-wrap">
        <Trophy className="w-4 h-4 text-yellow-400" />
        <span className="text-sm font-medium text-foreground mr-2">Top traders</span>
        {WINDOWS.map(w => (
          <button
            key={w.id}
            onClick={() => setWindow(w.id)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium border transition-all',
              window === w.id ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {w.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-secondary rounded-md p-0.5">
            {[
              { id: 'PNL', label: 'By P&L' },
              { id: 'VOL', label: 'By volume' },
            ].map(o => (
              <button
                key={o.id}
                onClick={() => setOrderBy(o.id)}
                className={cn('px-2 py-0.5 rounded text-[11px] font-medium', orderBy === o.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {o.label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" onClick={() => leaderboard.refetch()} className="h-7 px-2 text-muted-foreground hover:text-foreground">
            <RefreshCw className={cn('w-3.5 h-3.5', leaderboard.isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Wallets shown</p>
          <p className="text-lg font-mono font-bold text-foreground mt-0.5">{rows.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Combined P&L</p>
          <p className={cn('text-lg font-mono font-bold mt-0.5', totalPnl >= 0 ? 'text-primary' : 'text-destructive')}>{formatUsd(totalPnl, { compact: true })}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Combined volume</p>
          <p className="text-lg font-mono font-bold text-foreground mt-0.5">{formatUsd(totalVolume, { compact: true })}</p>
        </div>
      </div>

      {leaderboard.isLoading ? (
        <div className="py-16 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : leaderboard.error ? (
        <div className="bg-card border border-border rounded-xl py-10 flex flex-col items-center gap-2 text-center">
          <AlertTriangle className="w-5 h-5 text-yellow-400" />
          <p className="text-sm text-muted-foreground">Leaderboard unavailable: {leaderboard.error.message}</p>
          <p className="text-xs text-muted-foreground/70">The Polymarket Data API rate-limits bursts. Try again in a minute.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rows.map(wallet => (
            <WalletCard key={wallet.address} wallet={wallet} />
          ))}
        </div>
      )}
    </div>
  );
}

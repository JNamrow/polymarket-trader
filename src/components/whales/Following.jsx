import React, { useState } from 'react';
import { Plus, Star, X, Pencil, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { isAddress } from '@/lib/wallet';
import { formatUsd } from '@/api/polymarket';
import { useTraderStats, useTraderValue, useWalletFills } from '@/lib/useTraders';
import { describeFill } from '@/engine/wallets.js';
import { TraderLink, AddressActions, Pnl, EmptyState, shortAgo, marketUrl } from './shared';

function FollowedCard({ wallet, following }) {
  const stats = useTraderStats(wallet.address);
  const value = useTraderValue(wallet.address);
  const fills = useWalletFills(wallet.address, { limit: 5, refetchInterval: 60 * 1000 });
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(wallet.label || '');
  const last = fills.data?.[0];
  const name = wallet.label || wallet.name || last?.name || '';

  const saveLabel = async () => {
    try {
      await following.relabel(wallet.address, label.trim());
      setEditing(false);
    } catch (err) {
      toast.error(err?.message || 'Could not save');
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <TraderLink address={wallet.address} name={name} profileImage={last?.profileImage} className="text-sm font-medium" />
            {!editing ? (
              <button type="button" onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground" title="Rename">
                <Pencil className="w-3 h-3" />
              </button>
            ) : (
              <span className="flex items-center gap-1">
                <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label" className="h-6 w-32 text-xs bg-background border-border" />
                <button type="button" onClick={saveLabel} className="text-primary" title="Save">
                  <Check className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
          </div>
          <AddressActions address={wallet.address} className="mt-0.5" />
        </div>
        <button type="button" onClick={() => following.unfollow(wallet.address)} className="text-muted-foreground hover:text-destructive flex-shrink-0" title="Unfollow">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-[10px] text-muted-foreground">All-time P&L</p>
          <p className="font-mono font-semibold">{stats.data ? <Pnl value={stats.data.totalPnl} /> : '…'}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Portfolio</p>
          <p className="font-mono font-semibold text-foreground">{value.data != null ? formatUsd(value.data, { compact: true }) : '…'}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Markets</p>
          <p className="font-mono font-semibold text-foreground">{stats.data ? stats.data.marketsTraded : '…'}</p>
        </div>
      </div>

      <div className="border-t border-border/60 pt-2 text-xs">
        {fills.isLoading ? (
          <p className="text-muted-foreground">Loading fills…</p>
        ) : last ? (
          <div className="space-y-1">
            {fills.data.slice(0, 3).map(t => (
              <p key={t.id} className="text-muted-foreground truncate">
                <span className="font-mono text-[10px] mr-1.5">{shortAgo(t.timestamp)}</span>
                <span className={cn(t.side === 'BUY' ? 'text-primary' : 'text-destructive')}>{describeFill(t)}</span>{' '}
                <a href={marketUrl(t.eventSlug)} target="_blank" rel="noreferrer" className="hover:text-foreground hover:underline" title={t.title}>
                  {t.title}
                </a>
              </p>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">No recent fills</p>
        )}
      </div>
    </div>
  );
}

export default function Following({ following }) {
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');

  const add = async () => {
    const key = address.trim().toLowerCase();
    if (!isAddress(key)) {
      toast.error('Enter a 0x wallet address (40 hex characters)');
      return;
    }
    if (following.set.has(key)) {
      toast.error('Already following');
      return;
    }
    try {
      await following.follow({ address: key, label: label.trim() });
      setAddress('');
      setLabel('');
      toast.success('Following');
    } catch (err) {
      toast.error(err?.message || 'Could not save');
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Follow a wallet</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="0x… Polymarket profile address" className="bg-background border-border font-mono text-xs h-9 flex-1" />
          <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (optional)" className="bg-background border-border text-xs h-9 sm:w-40" />
          <Button size="sm" onClick={add} disabled={!following.ready || following.isSaving} className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Follow
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Paste any address from a Polymarket profile URL, or press the star next to a trader anywhere in the app. Followed wallets raise an alert when they trade while the app is open.
        </p>
      </div>

      {following.list.length === 0 ? (
        <EmptyState icon={Star} title="You follow no wallets yet" text="Start with the Smart money tab: the star next to a top trader follows them." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {following.list.map(w => (
            <FollowedCard key={w.address} wallet={w} following={following} />
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, ExternalLink, Copy, X, BadgeCheck, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { fetchPositions, profileUrl, shortAddress, formatUsd, formatSignedUsd, formatCents } from '@/api/polymarket';

function PositionsList({ address }) {
  const positions = useQuery({
    queryKey: ['positions', address],
    queryFn: () => fetchPositions(address, { limit: 25 }),
    staleTime: 60_000,
    retry: 1,
  });

  if (positions.isLoading) return <div className="px-4 py-4 text-xs text-muted-foreground">Loading positions…</div>;
  if (positions.error) return <div className="px-4 py-4 text-xs text-destructive">Could not load positions: {positions.error.message}</div>;
  const rows = positions.data || [];
  if (rows.length === 0) return <div className="px-4 py-4 text-xs text-muted-foreground">No open positions</div>;
  const totalValue = rows.reduce((s, p) => s + p.currentValue, 0);
  const totalPnl = rows.reduce((s, p) => s + p.cashPnl, 0);

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2 text-[11px] text-muted-foreground bg-muted/30">
        <span>
          {rows.length} position{rows.length === 1 ? '' : 's'} · {formatUsd(totalValue, { compact: true })} value
        </span>
        <span className={cn('font-mono', totalPnl >= 0 ? 'text-primary' : 'text-destructive')}>{formatSignedUsd(totalPnl)} unrealized</span>
      </div>
      <div className="divide-y divide-border/50 max-h-72 overflow-y-auto">
        {rows.map(p => (
          <div key={`${p.conditionId}-${p.outcome}`} className="px-4 py-2 flex items-center gap-3 text-xs">
            <Badge
              variant="outline"
              className={cn('text-[10px] flex-shrink-0 w-10 justify-center', p.outcome === 'Yes' || p.outcome === 'YES' ? 'border-primary/30 bg-primary/5 text-primary' : 'border-destructive/30 bg-destructive/5 text-destructive')}
            >
              {p.outcome?.toUpperCase().slice(0, 4)}
            </Badge>
            <a
              href={`https://polymarket.com/event/${p.eventSlug}`}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground truncate flex-1 hover:text-foreground hover:underline"
              title={p.title}
            >
              {p.title}
            </a>
            <span className="font-mono text-muted-foreground flex-shrink-0 hidden sm:inline">{p.size.toFixed(0)} sh</span>
            <span className="font-mono text-foreground flex-shrink-0">
              {formatCents(p.avgPrice)}→{formatCents(p.curPrice)}
            </span>
            <span className="font-mono text-foreground flex-shrink-0 w-16 text-right">{formatUsd(p.currentValue, { compact: true })}</span>
            <span className={cn('font-mono flex-shrink-0 w-16 text-right', p.cashPnl >= 0 ? 'text-primary' : 'text-destructive')}>{formatSignedUsd(p.cashPnl)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WalletCard({ wallet, tracked = false, onRemove }) {
  const [open, setOpen] = useState(false);
  const pnl = Number(wallet.pnl) || 0;
  const isPositive = pnl >= 0;
  const label = wallet.label || wallet.name || shortAddress(wallet.address);

  const copy = async e => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(wallet.address);
      toast.success('Address copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden hover:border-border/80 transition-colors">
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {wallet.profileImage ? (
            <img src={wallet.profileImage} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0 bg-secondary" />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 font-mono text-xs text-muted-foreground">
              {wallet.rank ? `#${wallet.rank}` : wallet.address.slice(2, 4).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium text-foreground truncate">{label}</span>
              {wallet.verified && <BadgeCheck className="w-3.5 h-3.5 text-sky-400" />}
              {tracked && (
                <Badge variant="outline" className="text-[10px] border-yellow-500/30 bg-yellow-500/10 text-yellow-400 px-1.5 py-0">
                  <Star className="w-2.5 h-2.5 mr-0.5" />
                  tracked
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground font-mono">
              <span>{shortAddress(wallet.address)}</span>
              <button onClick={copy} className="hover:text-foreground" title="Copy address">
                <Copy className="w-3 h-3" />
              </button>
              <a href={profileUrl(wallet.address)} target="_blank" rel="noreferrer" className="hover:text-foreground" title="Open Polymarket profile">
                <ExternalLink className="w-3 h-3" />
              </a>
              {wallet.volume > 0 && <span>· {formatUsd(wallet.volume, { compact: true })} vol</span>}
            </div>
          </div>
        </div>

        <div className="text-right flex-shrink-0 flex items-start gap-2">
          {wallet.pnl != null && (
            <div>
              <div className={cn('text-sm font-mono font-semibold flex items-center gap-1 justify-end', isPositive ? 'text-primary' : 'text-destructive')}>
                {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {formatSignedUsd(pnl, 0)}
              </div>
              <div className="text-[10px] text-muted-foreground">{wallet.window ? `${wallet.window} P&L` : 'P&L'}</div>
            </div>
          )}
          {tracked && onRemove && (
            <button onClick={() => onRemove(wallet)} className="text-muted-foreground hover:text-destructive" title="Stop tracking">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-border">
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {open ? 'Hide open positions' : 'Show open positions'}
          </span>
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {open && <PositionsList address={wallet.address} />}
      </div>
    </div>
  );
}

import React from 'react';
import { Users, Waves } from 'lucide-react';
import { formatUsd, formatCents } from '@/api/polymarket';
import { useMarketHolders, useMarketWhaleTrades } from '@/lib/useTraders';
import { TraderLink, SideBadge, LeanBar, shortAgo } from './shared';

function HolderList({ title, rows, tone }) {
  return (
    <div>
      <p className={`text-[10px] uppercase tracking-wider mb-1 ${tone}`}>{title}</p>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">—</p>
      ) : (
        <div className="space-y-1">
          {rows.slice(0, 5).map(h => (
            <div key={h.wallet} className="flex items-center gap-2 text-[11px]">
              <TraderLink address={h.wallet} name={h.name} profileImage={h.profileImage} verified={h.verified} size="sm" className="flex-1 min-w-0" />
              <span className="font-mono text-foreground flex-shrink-0">{formatUsd(h.value, { compact: true })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Top holders of both outcomes plus the latest big fills, for the market explorer's detail panel. */
export default function MarketWhales({ market }) {
  const holders = useMarketHolders(market.conditionId, market.yesPrice);
  const fills = useMarketWhaleTrades(market.conditionId, { minUsd: 1000, limit: 20 });
  const outcomes = market.outcomes || ['Yes', 'No'];
  const lean = holders.lean;

  return (
    <div className="md:col-span-5 grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/60">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
          <Users className="w-3.5 h-3.5 text-primary" /> Biggest holders
          <span className="text-[10px] text-muted-foreground font-normal ml-auto">top 20 each side, at today's price</span>
        </div>
        {holders.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading holders…</p>
        ) : holders.error ? (
          <p className="text-xs text-destructive">{holders.error.message}</p>
        ) : lean ? (
          <>
            <LeanBar yesShare={lean.yesShare} yesPrice={market.yesPrice} outcomes={outcomes} className="max-w-xs" />
            <div className="grid grid-cols-2 gap-3 pt-1">
              <HolderList title={`${outcomes[0]} · ${formatUsd(lean.yesValue, { compact: true })}`} rows={lean.topYes} tone="text-primary" />
              <HolderList title={`${outcomes[1]} · ${formatUsd(lean.noValue, { compact: true })}`} rows={lean.topNo} tone="text-destructive" />
            </div>
          </>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
          <Waves className="w-3.5 h-3.5 text-primary" /> Big fills
          <span className="text-[10px] text-muted-foreground font-normal ml-auto">≥ $1k, newest first</span>
        </div>
        {fills.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading fills…</p>
        ) : fills.error ? (
          <p className="text-xs text-destructive">{fills.error.message}</p>
        ) : !fills.data?.length ? (
          <p className="text-xs text-muted-foreground">No fills of $1k or more yet</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {fills.data.map(t => (
              <div key={t.id} className="flex items-center gap-2 text-[11px]">
                <span className="font-mono text-[10px] text-muted-foreground w-7 flex-shrink-0">{shortAgo(t.timestamp)}</span>
                <TraderLink address={t.wallet} name={t.name} profileImage={t.profileImage} size="sm" className="w-28 flex-shrink-0" />
                <SideBadge side={t.side} outcome={t.outcome} />
                <span className="font-mono text-muted-foreground flex-shrink-0 ml-auto">{formatCents(t.price)}</span>
                <span className="font-mono text-foreground font-semibold flex-shrink-0 w-14 text-right">{formatUsd(t.usd, { compact: true })}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

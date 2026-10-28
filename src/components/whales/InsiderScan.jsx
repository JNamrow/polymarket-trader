import React, { useMemo } from 'react';
import { Radar, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatUsd, formatCents } from '@/api/polymarket';
import { groupByWallet, WHALE_DEFAULTS } from '@/engine/wallets.js';
import { TraderLink, SideBadge, FlagList, Tile, Spinner, EmptyState, shortAgo, marketUrl } from './shared';

function WalletCard({ group }) {
  const shown = group.trades.slice(0, 3);
  const rest = group.trades.length - shown.length;
  return (
    <div className={cn('bg-card border rounded-xl p-4 space-y-3', group.suspicious ? 'border-rose-500/40' : 'border-border')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <TraderLink address={group.wallet} name={group.name} profileImage={group.profileImage} className="text-sm font-medium" />
          <div className="mt-1.5">
            <FlagList flags={group.flags} max={5} />
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className={cn('text-xl font-mono font-bold leading-none', group.suspicious ? 'text-rose-300' : group.score >= 40 ? 'text-amber-300' : 'text-foreground')}>{group.score}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">suspicion</div>
          {group.suspicious && (
            <Badge variant="outline" className="mt-1 text-[10px] px-1.5 py-0 border-rose-500/40 bg-rose-500/10 text-rose-300">
              second look
            </Badge>
          )}
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground">
        {formatUsd(group.usd, { compact: true })} across {group.trades.length} fill{group.trades.length === 1 ? '' : 's'} in this window
      </div>
      <div className="divide-y divide-border/50 border-t border-border/50">
        {shown.map(t => (
          <div key={t.id} className="py-1.5 flex items-center gap-2 text-xs">
            <span className="font-mono text-[10px] text-muted-foreground w-7 flex-shrink-0">{shortAgo(t.timestamp)}</span>
            <SideBadge side={t.side} outcome={t.outcome} />
            <a href={marketUrl(t.eventSlug)} target="_blank" rel="noreferrer" className="text-muted-foreground truncate flex-1 hover:text-foreground hover:underline" title={t.title}>
              {t.title}
            </a>
            <span className="font-mono text-foreground flex-shrink-0">{formatCents(t.price)}</span>
            <span className="font-mono text-foreground font-semibold flex-shrink-0 w-14 text-right">{formatUsd(t.usd, { compact: true })}</span>
          </div>
        ))}
        {rest > 0 && <p className="py-1.5 text-[10px] text-muted-foreground">+{rest} more</p>}
      </div>
    </div>
  );
}

export default function InsiderScan({ trades, signalsById, pendingStats, totalWallets, minUsd }) {
  const groups = useMemo(() => groupByWallet(trades, signalsById).filter(g => g.flags.length > 0), [trades, signalsById]);
  const suspicious = groups.filter(g => g.suspicious);
  const others = groups.filter(g => !g.suspicious);
  const wallets = new Set(trades.map(t => t.wallet)).size;

  return (
    <div className="space-y-4">
      <div className="surface p-4 text-xs text-muted-foreground space-y-2">
        <p className="flex items-center gap-2 text-foreground text-sm font-medium">
          <Radar className="w-4 h-4 text-primary" /> How this scan works
        </p>
        <p>
          Every fill of {formatUsd(minUsd, { compact: true })} or more in the live feed is checked against its wallet's public history. Points add up to a suspicion score:
          fresh account (joined ≤ {WHALE_DEFAULTS.freshAccountDays} days ago) 35–45, few markets (≤ {WHALE_DEFAULTS.fewMarkets}) 20, concentrated (one fill ≥ {Math.round(WHALE_DEFAULTS.concentratedShare * 100)}% of the
          portfolio) 20, long shot (bought at ≤ {Math.round(WHALE_DEFAULTS.longShotPrice * 100)}¢) 15–20, big size 10–15.
        </p>
        <p>
          A wallet gets a <span className="text-rose-300">second look</span> when it is fresh <em>and</em> shows conviction: a concentrated, long-shot or very large bet. That is a pattern, not proof. Use it as a
          prompt to read the market and the wallet before you act.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Fills scanned" value={trades.length} sub={`≥ ${formatUsd(minUsd, { compact: true })}`} />
        <Tile label="Wallets" value={wallets} sub={pendingStats > 0 ? `${totalWallets - pendingStats}/${totalWallets} checked` : 'all checked'} />
        <Tile label="Flagged" value={groups.length} sub="at least one signal" />
        <Tile label="Second look" value={suspicious.length} sub="fresh + conviction" className={suspicious.length ? 'border-rose-500/40' : ''} />
      </div>

      {trades.length === 0 ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <EmptyState icon={ShieldAlert} title={pendingStats > 0 ? 'Checking wallets…' : 'Nothing flagged in this window'} text="Lower the minimum size on the Whale flow tab to scan more fills." />
      ) : (
        <>
          {suspicious.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-medium text-rose-300 uppercase tracking-wider">Needs a second look</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {suspicious.map(g => (
                  <WalletCard key={g.wallet} group={g} />
                ))}
              </div>
            </section>
          )}
          {others.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Other flagged wallets</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {others.slice(0, 30).map(g => (
                  <WalletCard key={g.wallet} group={g} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

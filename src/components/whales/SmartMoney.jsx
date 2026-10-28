import React, { useState } from 'react';
import { Trophy, Star, Target, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatUsd, formatCents, LEADERBOARD_CATEGORIES } from '@/api/polymarket';
import { useLeaderboard, useSmartMoney } from '@/lib/useTraders';
import { TraderLink, Pnl, Chip, Segmented, LeanBar, SkeletonRows, ErrorState, EmptyState, marketUrl } from './shared';

const WINDOWS = [
  { id: '1d', label: '24h' },
  { id: '1w', label: '7d' },
  { id: '1m', label: '30d' },
  { id: 'all', label: 'All time' },
];
const ORDERS = [
  { id: 'PNL', label: 'By P&L' },
  { id: 'VOL', label: 'By volume' },
];
const TOPS = [
  { id: 5, label: 'Top 5' },
  { id: 10, label: 'Top 10' },
  { id: 20, label: 'Top 20' },
];

function FollowStar({ wallet, following }) {
  const on = following.isFollowing(wallet.address);
  const click = async e => {
    e.stopPropagation();
    try {
      await following.toggle({ address: wallet.address, name: wallet.name || '' });
    } catch (err) {
      toast.error(err?.message || 'Could not save');
    }
  };
  return (
    <button type="button" onClick={click} disabled={!following.ready || following.isSaving} className={cn('p-1 rounded hover:bg-secondary', on ? 'text-yellow-400' : 'text-muted-foreground hover:text-foreground')} title={on ? 'Unfollow' : 'Follow'}>
      <Star className={cn('w-3.5 h-3.5', on && 'fill-yellow-400')} />
    </button>
  );
}

function Leaderboard({ window, orderBy, category, following }) {
  const board = useLeaderboard({ window, orderBy, category, limit: 25 });
  const rows = board.data || [];
  const windowLabel = WINDOWS.find(w => w.id === window)?.label;
  return (
    <div className="surface overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
        <Trophy className="w-3.5 h-3.5 text-yellow-400" />
        <span className="text-xs font-medium text-foreground">Top traders · {windowLabel}</span>
        <span className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wider">{orderBy === 'PNL' ? 'P&L' : 'Volume'}</span>
      </div>
      {board.isLoading ? (
        <SkeletonRows rows={10} />
      ) : board.error ? (
        <ErrorState error={board.error} hint="The Data API rate-limits bursts. Try again in a minute." />
      ) : rows.length === 0 ? (
        <EmptyState title="No traders for this niche" />
      ) : (
        <div className="divide-y divide-border/60 max-h-[45vh] xl:max-h-[70vh] overflow-y-auto">
          {rows.map(w => (
            <div key={w.address} className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-secondary/30">
              <span className="font-mono text-muted-foreground w-6 flex-shrink-0">#{w.rank}</span>
              <TraderLink address={w.address} name={w.name} profileImage={w.profileImage} verified={w.verified} className="flex-1 min-w-0" />
              <div className="text-right flex-shrink-0">
                <Pnl value={w.pnl} className="font-semibold" />
                <p className="text-[10px] text-muted-foreground">{formatUsd(w.volume, { compact: true })} vol</p>
              </div>
              <FollowStar wallet={w} following={following} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SmartPositions({ window, category, top, tradersByAddress }) {
  const smart = useSmartMoney({ window, category, top });
  const rows = smart.rows;
  return (
    <div className="surface overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
        <Target className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-medium text-foreground">Where the top {top} sit right now</span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {smart.loaded}/{smart.total} wallets loaded
        </span>
      </div>
      {smart.isLoading || (smart.total > 0 && smart.loaded === 0) ? (
        <SkeletonRows rows={8} />
      ) : rows.length === 0 ? (
        <EmptyState title="No shared markets yet" text="Markets show up here once two or more of these traders hold them." />
      ) : (
        <div className="divide-y divide-border/60 max-h-[45vh] xl:max-h-[70vh] overflow-y-auto">
          {rows.slice(0, 60).map(r => (
            <div key={r.conditionId} className="px-4 py-2.5 text-xs">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <a href={marketUrl(r.eventSlug)} target="_blank" rel="noreferrer" className="text-foreground/90 truncate block hover:underline" title={r.title}>
                    {r.title}
                  </a>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {r.traders} trader{r.traders === 1 ? '' : 's'} · {r.yesTraders} on {r.outcomes[0]} · {formatUsd(r.total, { compact: true })} at risk · price {formatCents(r.yesPrice)}
                  </p>
                  <p className="text-[10px] text-muted-foreground/80 mt-0.5 truncate">
                    {r.wallets
                      .slice(0, 4)
                      .map(w => `${tradersByAddress[w.wallet]?.name || w.wallet.slice(0, 6)} (${w.yes >= w.no ? r.outcomes[0] : r.outcomes[1]})`)
                      .join(', ')}
                    {r.wallets.length > 4 ? ` +${r.wallets.length - 4}` : ''}
                  </p>
                </div>
                <LeanBar yesShare={r.yesShare} yesPrice={r.yesPrice} outcomes={r.outcomes} className="w-40 flex-shrink-0" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SmartMoney({ following }) {
  const [window, setWindow] = useState('1m');
  const [category, setCategory] = useState('overall');
  const [orderBy, setOrderBy] = useState('PNL');
  const [top, setTop] = useState(10);
  const board = useLeaderboard({ window, orderBy: 'PNL', category, limit: top });
  const tradersByAddress = Object.fromEntries((board.data || []).map(w => [w.address, w]));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {WINDOWS.map(w => (
          <Chip key={w.id} small active={window === w.id} onClick={() => setWindow(w.id)}>
            {w.label}
          </Chip>
        ))}
        <span className="w-px h-4 bg-border mx-1 hidden sm:block" />
        {LEADERBOARD_CATEGORIES.map(c => (
          <Chip key={c.id} small active={category === c.id} onClick={() => setCategory(c.id)}>
            {c.label}
          </Chip>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Segmented options={ORDERS} value={orderBy} onChange={setOrderBy} />
          <Segmented options={TOPS} value={top} onChange={setTop} />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Left: Polymarket's own leaderboard for the niche and window. Right: the open positions of its top {top} by P&L, pooled per market. The bar is their dollar share on the first outcome; the tick
        is the current price. A gap means the best traders lean further than the crowd.{' '}
        <a href="https://polymarket.com/leaderboard" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
          Source <ExternalLink className="w-3 h-3" />
        </a>
      </p>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Leaderboard window={window} orderBy={orderBy} category={category} following={following} />
        <SmartPositions window={window} category={category} top={top} tradersByAddress={tradersByAddress} />
      </div>
    </div>
  );
}

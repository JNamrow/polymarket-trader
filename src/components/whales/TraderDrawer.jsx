import React, { useCallback, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Star, CalendarDays, Layers, Eye, BadgeCheck, ExternalLink, Copy } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { TraderDrawerContext } from './traderDrawerContext';
import { TraderAvatar, AddressActions, ScoreBadge, Pnl, Chip, Tile, Spinner, ErrorState, SideBadge, shortAgo, marketUrl } from './shared';
import { useTraderProfile, useTraderPnl, useTraderActivity } from '@/lib/useTraders';
import { useFollowing } from '@/lib/useFollowing';
import { useLaunch } from '@/lib/launchContext';
import { shortAddress, formatUsd, formatCents } from '@/api/polymarket';
import { ageDays } from '@/engine/wallets.js';

export function TraderDrawerProvider({ children }) {
  const [current, setCurrent] = useState(null);
  const open = useCallback((address, seed = {}) => {
    if (!address) return;
    setCurrent({ address: String(address).toLowerCase(), seed });
  }, []);
  const close = useCallback(() => setCurrent(null), []);
  const value = useMemo(() => ({ open, close, current }), [open, close, current]);
  return (
    <TraderDrawerContext.Provider value={value}>
      {children}
      <Sheet
        open={!!current}
        onOpenChange={isOpen => {
          if (!isOpen) close();
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 overflow-y-auto overscroll-contain bg-card border-border">
          {current && <TraderProfile key={current.address} address={current.address} seed={current.seed} onClose={close} />}
        </SheetContent>
      </Sheet>
    </TraderDrawerContext.Provider>
  );
}

const RANGES = [
  { id: '1d', label: '24h' },
  { id: '1w', label: '7d' },
  { id: '1m', label: '30d' },
  { id: 'all', label: 'All' },
];

const PnlTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-muted-foreground">{format(p.t, 'MMM d, HH:mm')}</p>
      <p>
        <Pnl value={p.total} compact={false} /> <span className="text-muted-foreground">total</span>
      </p>
      <p className="text-muted-foreground">
        realized <Pnl value={p.realized} /> · open <Pnl value={p.unrealized} />
      </p>
    </div>
  );
};

function PnlChart({ address, range }) {
  const pnl = useTraderPnl(address, range);
  const points = pnl.data || [];
  const last = points[points.length - 1]?.total ?? 0;
  const first = points[0]?.total ?? 0;
  const up = last >= first;
  if (pnl.isLoading) return <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Loading P&L…</div>;
  if (pnl.error) return <div className="h-full flex items-center justify-center text-xs text-destructive px-4 text-center">{pnl.error.message}</div>;
  if (points.length < 2) return <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No P&L history for this range</div>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
        <defs>
          <linearGradient id="trader-pnl" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? 'hsl(142,71%,45%)' : 'hsl(0,72%,51%)'} stopOpacity={0.35} />
            <stop offset="100%" stopColor={up ? 'hsl(142,71%,45%)' : 'hsl(0,72%,51%)'} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="t" hide />
        <YAxis hide domain={['auto', 'auto']} />
        <Tooltip content={<PnlTooltip />} />
        <Area type="monotone" dataKey="total" stroke={up ? 'hsl(142,71%,45%)' : 'hsl(0,72%,51%)'} strokeWidth={1.5} fill="url(#trader-pnl)" dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Pinned column labels for the small tables in the drawer. */
function TableHead({ cols }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 py-1.5 bg-card text-[10px] uppercase tracking-wider text-muted-foreground">
      {cols.map(([cls, label]) => (
        <span key={label} className={cn('flex-shrink-0', cls)}>
          {label}
        </span>
      ))}
    </div>
  );
}

function OutcomeTag({ outcome, index }) {
  const yes = index === 0;
  return (
    <span className={cn('font-mono text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 w-14 text-center truncate', yes ? 'border-primary/30 bg-primary/5 text-primary' : 'border-destructive/30 bg-destructive/5 text-destructive')} title={outcome}>
      {String(outcome || (yes ? 'Yes' : 'No')).toUpperCase().slice(0, 7)}
    </span>
  );
}

function PositionsTable({ rows, loading, error }) {
  if (loading) return <Spinner className="py-8" />;
  if (error) return <ErrorState error={error} />;
  if (!rows?.length) return <p className="py-8 text-center text-xs text-muted-foreground">No open positions</p>;
  const total = rows.reduce((s, p) => s + p.currentValue, 0);
  const pnl = rows.reduce((s, p) => s + p.cashPnl, 0);
  return (
    <div>
      <div className="flex items-center justify-between py-2 text-[11px] text-muted-foreground">
        <span>
          {rows.length} position{rows.length === 1 ? '' : 's'} · {formatUsd(total, { compact: true })}
        </span>
        <span>
          <Pnl value={pnl} /> unrealized
        </span>
      </div>
      <div className="divide-y divide-border/50 max-h-80 overflow-y-auto overscroll-contain -mx-1 px-1">
        <TableHead cols={[['w-14', 'Side'], ['flex-1', 'Market'], ['hidden sm:block', 'Entry→Mark'], ['w-14 text-right', 'Value'], ['w-16 text-right', 'P&L']]} />
        {rows.map(p => (
          <div key={`${p.conditionId}-${p.outcomeIndex}`} className="py-2 flex items-center gap-2 text-xs">
            <OutcomeTag outcome={p.outcome} index={p.outcomeIndex} />
            <a href={marketUrl(p.eventSlug)} target="_blank" rel="noreferrer" className="text-muted-foreground truncate flex-1 hover:text-foreground hover:underline" title={p.title}>
              {p.title}
            </a>
            <span className="font-mono text-foreground flex-shrink-0 hidden sm:inline">
              {formatCents(p.avgPrice)}→{formatCents(p.curPrice)}
            </span>
            <span className="font-mono text-foreground flex-shrink-0 w-14 text-right">{formatUsd(p.currentValue, { compact: true })}</span>
            <span className="flex-shrink-0 w-16 text-right">
              <Pnl value={p.cashPnl} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClosedTable({ rows, loading, error }) {
  if (loading) return <Spinner className="py-8" />;
  if (error) return <ErrorState error={error} />;
  if (!rows?.length) return <p className="py-8 text-center text-xs text-muted-foreground">No settled positions yet</p>;
  const sorted = [...rows].sort((a, b) => b.realizedPnl - a.realizedPnl);
  return (
    <div className="divide-y divide-border/50 max-h-80 overflow-y-auto overscroll-contain -mx-1 px-1">
      <TableHead cols={[['w-14', 'Side'], ['flex-1', 'Market · entry · settled'], ['w-12 text-right hidden sm:block', 'Return'], ['w-16 text-right', 'P&L']]} />
      {sorted.slice(0, 100).map(p => (
        <div key={`${p.conditionId}-${p.outcomeIndex}`} className="py-2 flex items-center gap-2 text-xs">
          <OutcomeTag outcome={p.outcome} index={p.outcomeIndex} />
          <div className="min-w-0 flex-1">
            <a href={marketUrl(p.eventSlug)} target="_blank" rel="noreferrer" className="text-muted-foreground truncate block hover:text-foreground hover:underline" title={p.title}>
              {p.title}
            </a>
            <p className="text-[10px] text-muted-foreground/70 font-mono">
              in at {formatCents(p.avgPrice)} · {p.lastEventAt ? format(p.lastEventAt, 'MMM d, yyyy') : ''}
            </p>
          </div>
          <span className="font-mono text-muted-foreground flex-shrink-0 w-12 text-right hidden sm:inline">
            {Number.isFinite(p.percentRealizedPnl) ? `${p.percentRealizedPnl > 0 ? '+' : ''}${Math.round(p.percentRealizedPnl)}%` : ''}
          </span>
          <span className="flex-shrink-0 w-16 text-right">
            <Pnl value={p.realizedPnl} />
          </span>
        </div>
      ))}
    </div>
  );
}

const ACTIVITY_LABEL = { TRADE: 'Trade', SPLIT: 'Split', MERGE: 'Merge', REDEEM: 'Redeem', REWARD: 'Reward', CONVERSION: 'Convert' };

function ActivityList({ address }) {
  const activity = useTraderActivity(address, { limit: 40 });
  if (activity.isLoading) return <Spinner className="py-8" />;
  if (activity.error) return <ErrorState error={activity.error} />;
  const rows = activity.data || [];
  if (!rows.length) return <p className="py-8 text-center text-xs text-muted-foreground">No activity</p>;
  return (
    <div className="divide-y divide-border/50 max-h-80 overflow-y-auto overscroll-contain -mx-1 px-1">
      <TableHead cols={[['w-8', 'Age'], ['w-20', 'Action'], ['flex-1', 'Market'], ['hidden sm:block', 'Price'], ['w-16 text-right', 'Size']]} />
      {rows.map(a => (
        <div key={a.id} className="py-2 flex items-center gap-2 text-xs">
          <span className="font-mono text-[10px] text-muted-foreground w-8 flex-shrink-0">{shortAgo(a.timestamp)}</span>
          {a.type === 'TRADE' ? (
            <SideBadge side={a.side} outcome={a.outcome} />
          ) : (
            <span className="font-mono text-[10px] px-1.5 py-0 rounded border border-border text-muted-foreground flex-shrink-0">{ACTIVITY_LABEL[a.type] || a.type}</span>
          )}
          <a href={marketUrl(a.eventSlug)} target="_blank" rel="noreferrer" className="text-muted-foreground truncate flex-1 hover:text-foreground hover:underline" title={a.title}>
            {a.title}
          </a>
          {a.type === 'TRADE' && <span className="font-mono text-foreground flex-shrink-0 hidden sm:inline">{formatCents(a.price)}</span>}
          <span className="font-mono text-foreground flex-shrink-0 w-16 text-right">{formatUsd(a.usd, { compact: true })}</span>
        </div>
      ))}
    </div>
  );
}

function scoreBreakdown(score) {
  if (!score?.parts) return `Needs 5 settled positions to rate (has ${score?.summary?.count ?? 0}).`;
  const p = score.parts;
  return [
    `Profitability ${p.profitability.toFixed(0)}/40`,
    `Hit rate ${p.hitRate.toFixed(0)}/20`,
    `Profit factor ${p.profitFactor.toFixed(0)}/10`,
    `Experience ${p.experience.toFixed(0)}/10`,
    `Track record ${p.trackRecord.toFixed(0)}/10`,
    `Discipline ${p.discipline.toFixed(0)}/10`,
  ].join(' · ');
}

function TraderProfile({ address, seed, onClose }) {
  const { stats, value, positions, closed, score, summary, concentration, isLoading } = useTraderProfile(address);
  const following = useFollowing();
  const { openLaunch } = useLaunch();
  const [range, setRange] = useState('1m');
  const name = seed?.name || shortAddress(address);
  const joined = stats.data?.joinedAt;
  const days = ageDays(joined);
  const isFollowing = following.isFollowing(address);

  const toggleFollow = async () => {
    try {
      await following.toggle({ address, name: seed?.name || '' });
      toast.success(isFollowing ? `Unfollowed ${name}` : `Following ${name}`);
    } catch (err) {
      toast.error(err?.message || 'Could not save');
    }
  };

  return (
    <div className="flex flex-col">
      <div className="p-5 pr-12 border-b border-border space-y-4">
        <div className="flex items-start gap-3">
          <TraderAvatar src={seed?.profileImage} address={address} size="lg" />
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-base font-semibold text-foreground flex items-center gap-1.5 truncate">
              <span className="truncate">{name}</span>
              {seed?.verified && <BadgeCheck className="w-4 h-4 text-sky-400 flex-shrink-0" />}
            </SheetTitle>
            <SheetDescription asChild>
              <div className="mt-0.5">
                <AddressActions address={address} />
              </div>
            </SheetDescription>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                {stats.isLoading ? '…' : joined ? `joined ${format(joined, 'MMM d, yyyy')} (${Math.round(days)}d)` : 'join date unknown'}
              </span>
              <span className="inline-flex items-center gap-1">
                <Layers className="w-3 h-3" />
                {stats.data ? `${stats.data.marketsTraded} markets · ${stats.data.tradeCount} fills` : '…'}
              </span>
              {stats.data?.views > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  {stats.data.views.toLocaleString()} views
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
            <Button size="sm" variant={isFollowing ? 'outline' : 'secondary'} onClick={toggleFollow} disabled={!following.ready || following.isSaving} className={cn('h-8', isFollowing && 'border-border')}>
              <Star className={cn('w-3.5 h-3.5 mr-1.5', isFollowing && 'fill-yellow-400 text-yellow-400')} />
              {isFollowing ? 'Following' : 'Follow'}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onClose?.();
                openLaunch({ mode: 'live', pilot: { address, name: seed?.name || '', profileImage: seed?.profileImage || '' } });
              }}
              className="h-8 bg-primary hover:bg-primary/90 text-primary-foreground"
              title="Start a portfolio that mirrors this wallet"
            >
              <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy trader
            </Button>
          </div>
        </div>

        {stats.error ? (
          <ErrorState error={stats.error} hint="The Data API rate-limits bursts. Close and reopen in a moment." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Tile label="Portfolio value" value={value.data != null ? formatUsd(value.data, { compact: true }) : '…'} sub={concentration.markets ? `${concentration.markets} market${concentration.markets === 1 ? '' : 's'}` : null} />
            <Tile label="All-time P&L" value={stats.data ? <Pnl value={stats.data.totalPnl} /> : '…'} sub={stats.data ? `realized ${formatUsd(stats.data.realizedPnl, { compact: true })}` : null} />
            <Tile label="Cash volume" value={stats.data ? formatUsd(stats.data.volume, { compact: true }) : '…'} sub={stats.data ? `fees ${formatUsd(stats.data.feesPaid, { compact: true })}` : null} />
            <Tile label="Win rate" value={closed.isLoading ? '…' : summary.winRate != null ? `${Math.round(summary.winRate * 100)}%` : '—'} sub={closed.data ? `${summary.wins}W · ${summary.losses}L settled` : null} />
            <Tile label="Biggest win" value={stats.data ? formatUsd(stats.data.biggestWin, { compact: true }) : '…'} sub={summary.biggestLoss < 0 ? `worst ${formatUsd(summary.biggestLoss, { compact: true })}` : null} />
            <Tile label="Trader score" value={isLoading ? '…' : <ScoreBadge score={score.score} label={score.label} />} sub={score.parts ? 'hover for breakdown' : `${summary.count}/5 settled`} title={scoreBreakdown(score)} />
          </div>
        )}

        {concentration.topShare != null && concentration.topShare >= 0.5 && concentration.total > 0 && (
          <p className="text-[11px] text-amber-300/90">
            {Math.round(concentration.topShare * 100)}% of the portfolio sits in one market: {concentration.top?.title}
          </p>
        )}
      </div>

      <div className="px-5 pt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-foreground">P&L over time</span>
          <div className="flex gap-1">
            {RANGES.map(r => (
              <Chip key={r.id} small active={range === r.id} onClick={() => setRange(r.id)}>
                {r.label}
              </Chip>
            ))}
          </div>
        </div>
        <div className="h-36 bg-secondary/30 rounded-xl">
          <PnlChart address={address} range={range} />
        </div>
      </div>

      <Tabs defaultValue="positions" className="px-5 pb-6 pt-4">
        <TabsList className="bg-secondary h-8">
          <TabsTrigger value="positions" className="text-xs h-6 px-2.5">
            Open {positions.data ? `(${positions.data.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="closed" className="text-xs h-6 px-2.5">
            Settled {closed.data ? `(${closed.data.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="activity" className="text-xs h-6 px-2.5">
            Activity
          </TabsTrigger>
        </TabsList>
        <TabsContent value="positions">
          <PositionsTable rows={positions.data} loading={positions.isLoading} error={positions.error} />
        </TabsContent>
        <TabsContent value="closed">
          <ClosedTable rows={closed.data} loading={closed.isLoading} error={closed.error} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityList address={address} />
        </TabsContent>
      </Tabs>

      <div className="px-5 pb-6 -mt-2">
        <a href={`https://polymarket.com/profile/${address}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          Open profile on Polymarket <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

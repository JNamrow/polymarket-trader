import React, { useMemo, useState } from 'react';
import { Search, RefreshCw, Waves } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatUsd, formatCents, CATEGORY_LABELS } from '@/api/polymarket';
import { isContrarian } from '@/engine/wallets.js';
import { TraderLink, SideBadge, CategoryBadge, FlagList, Chip, Segmented, Tile, SkeletonRows, ErrorState, EmptyState, shortAgo, marketUrl } from './shared';

export const FEED_SIZES = [1000, 5000, 10_000, 25_000, 100_000];
const SIDES = [
  { id: null, label: 'All' },
  { id: 'BUY', label: 'Buys' },
  { id: 'SELL', label: 'Sells' },
];
const CATEGORY_FILTERS = ['all', 'politics', 'sports', 'crypto', 'business', 'tech', 'science', 'culture', 'other'];

function FillRow({ t, signals, category, followed }) {
  const contrarian = isContrarian(t);
  return (
    <div className={cn('flex items-center gap-3 px-4 py-2.5 border-b border-border/60 last:border-b-0 text-xs hover:bg-secondary/30 transition-colors duration-100', signals?.suspicious && 'bg-rose-500/5')}>
      <span className="font-mono text-[10px] text-muted-foreground w-8 flex-shrink-0" title={new Date(t.timestamp).toLocaleString()}>
        {shortAgo(t.timestamp)}
      </span>
      <div className="w-36 sm:w-44 flex-shrink-0 min-w-0">
        <TraderLink address={t.wallet} name={t.name} profileImage={t.profileImage} size="sm" className="text-xs w-full" />
        {followed && <span className="block text-[10px] text-yellow-400 pl-8">following</span>}
      </div>
      <span className="w-24 flex-shrink-0 hidden sm:flex">
        <SideBadge side={t.side} outcome={t.outcome} className="max-w-full truncate" />
      </span>
      <div className="flex-1 min-w-0">
        <a href={marketUrl(t.eventSlug)} target="_blank" rel="noreferrer" className="text-foreground/90 truncate block hover:underline" title={t.title}>
          {t.title}
        </a>
        <div className="flex items-center gap-1.5 mt-0.5">
          <SideBadge side={t.side} outcome={t.outcome} className="sm:hidden" />
          <CategoryBadge category={category} />
          {contrarian && <span className="text-[10px] text-violet-300">against the crowd</span>}
          <FlagList flags={signals?.flags || []} max={3} className="lg:hidden" />
        </div>
      </div>
      <span className="font-mono text-foreground w-10 text-right flex-shrink-0">{formatCents(t.price)}</span>
      <span className="font-mono text-muted-foreground w-16 text-right flex-shrink-0 hidden md:inline">{Math.round(t.size).toLocaleString()} sh</span>
      <span className={cn('font-mono font-semibold w-16 text-right flex-shrink-0', t.usd >= 100_000 ? 'text-amber-300' : 'text-foreground')}>{formatUsd(t.usd, { compact: true })}</span>
      <div className="w-44 flex-shrink-0 hidden lg:flex justify-end">
        {signals?.pending ? <span className="text-[10px] text-muted-foreground">checking wallet…</span> : <FlagList flags={signals?.flags || []} max={3} />}
      </div>
    </div>
  );
}

export default function WhaleFlow({ trades, signalsById, categories, pendingStats, totalWallets, minUsd, onMinUsd, side, onSide, feed, following, registryTotal = null }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [only, setOnly] = useState({ contrarian: false, flagged: false, followed: false });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trades.filter(t => {
      if (category !== 'all' && (categories[t.conditionId] || 'other') !== category) return false;
      if (only.contrarian && !isContrarian(t)) return false;
      if (only.flagged && !(signalsById[t.id]?.flags?.length > 0)) return false;
      if (only.followed && !following.set.has(t.wallet)) return false;
      if (q && !`${t.title} ${t.name} ${t.wallet} ${t.outcome}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [trades, categories, signalsById, following.set, category, only, search]);

  const totalUsd = rows.reduce((s, t) => s + t.usd, 0);
  const buyUsd = rows.filter(t => t.side === 'BUY').reduce((s, t) => s + t.usd, 0);
  const flagged = rows.filter(t => signalsById[t.id]?.flags?.length > 0).length;
  const span = rows.length > 1 ? rows[0].timestamp - rows[rows.length - 1].timestamp : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-muted-foreground mr-1">Min size</span>
        {FEED_SIZES.map(s => (
          <Chip key={s} small active={minUsd === s} onClick={() => onMinUsd(s)}>
            {formatUsd(s, { compact: true })}
          </Chip>
        ))}
        <Segmented options={SIDES} value={side} onChange={onSide} className="ml-1" />
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Market or trader" className="h-8 w-40 sm:w-52 pl-8 bg-card border-border text-xs" />
          </div>
          <button
            type="button"
            onClick={() => feed.refetch()}
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground"
            title="Refresh now (auto every 30 s)"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', feed.isFetching && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {CATEGORY_FILTERS.map(id => (
          <Chip key={id} small active={category === id} onClick={() => setCategory(id)}>
            {id === 'other' ? 'Other' : CATEGORY_LABELS[id]}
          </Chip>
        ))}
        <span className="w-px h-4 bg-border mx-1 hidden sm:block" />
        <Chip small active={only.contrarian} onClick={() => setOnly(o => ({ ...o, contrarian: !o.contrarian }))} title="Buys at ≤ 30¢ or sells at ≥ 70¢">
          Against the crowd
        </Chip>
        <Chip small active={only.flagged} onClick={() => setOnly(o => ({ ...o, flagged: !o.flagged }))} title="Fills with at least one insider flag">
          Flagged
        </Chip>
        <Chip small active={only.followed} onClick={() => setOnly(o => ({ ...o, followed: !o.followed }))} title="Only wallets you follow">
          Following
        </Chip>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Fills shown" value={rows.length} sub={span > 0 ? `last ${shortAgo(Date.now() - span)}` : null} />
        <Tile label="Dollar volume" value={formatUsd(totalUsd, { compact: true })} sub={totalUsd > 0 ? `${Math.round((buyUsd / totalUsd) * 100)}% buys` : null} />
        <Tile label="Flagged fills" value={flagged} sub="any insider signal" />
        <Tile
          label="Wallets checked"
          value={`${Math.max(0, totalWallets - pendingStats)}/${totalWallets}`}
          sub={pendingStats > 0 ? 'loading stats…' : registryTotal ? `in this window · ${registryTotal.toLocaleString()} in the Wallets registry` : 'stats loaded'}
          title="Wallets behind the fills shown here. The Wallets tab lists every wallet the server scan has seen."
        />
      </div>

      <div className="surface overflow-hidden">
        <div className="max-h-[70vh] overflow-y-auto overscroll-contain">
          {/* Column headers stay pinned while the list scrolls. Widths and breakpoints mirror FillRow. */}
          <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-2 border-b border-border bg-card text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="w-8 flex-shrink-0">Age</span>
            <span className="w-36 sm:w-44 flex-shrink-0">Trader</span>
            <span className="w-24 flex-shrink-0 hidden sm:block">Side</span>
            <span className="flex-1 min-w-0">Market</span>
            <span className="w-10 text-right flex-shrink-0">Price</span>
            <span className="w-16 text-right flex-shrink-0 hidden md:block">Shares</span>
            <span className="w-16 text-right flex-shrink-0">Size</span>
            <span className="w-44 text-right flex-shrink-0 hidden lg:block">Signals</span>
          </div>
          {feed.isLoading ? (
            <SkeletonRows rows={8} />
          ) : feed.error ? (
            <ErrorState error={feed.error} hint="The Data API rate-limits bursts. It retries on the next refresh." />
          ) : rows.length === 0 ? (
            <EmptyState icon={Waves} title="No fills match" text="Lower the minimum size or clear a filter." />
          ) : (
            rows.map(t => <FillRow key={t.id} t={t} signals={signalsById[t.id]} category={categories[t.conditionId]} followed={following.set.has(t.wallet)} />)
          )}
        </div>
      </div>
    </div>
  );
}

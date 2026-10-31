/**
 * Wallets view: the wallet registry. A server scan (supabase/functions/demo-wallets)
 * reads every Polymarket fill of $1,000 or more every 5 minutes and keeps one
 * row per wallet with its public stats, trader score and insider flags, so
 * this list reaches thousands of wallets without a single Data API call from
 * the browser. Sort, filter and search; click a trader for the profile
 * drawer, star to follow, or copy them straight into a portfolio.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Search, Star, Rocket, ChevronLeft, ChevronRight, ExternalLink, Database, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatUsd, CATEGORY_LABELS } from '@/api/polymarket';
import { useLaunch } from '@/lib/launchContext';
import { useRegistry, useRegistryStats, registryAvailable } from '@/lib/useRegistry';
import { TraderLink, ScoreBadge, Pnl, FlagList, Chip, Segmented, Tile, SkeletonRows, ErrorState, EmptyState, shortAgo, marketUrl } from './shared';

export const HOSTED_DEMO = 'https://polymarket-trader-lac.vercel.app';
const PAGE_SIZE = 50;
const SORTS = [
  { id: 'score', label: 'Score' },
  { id: 'trade_pnl', label: 'P&L' },
  { id: 'volume_total', label: 'Volume' },
  { id: 'fills_usd', label: 'Fills seen' },
  { id: 'last_fill_at', label: 'Latest' },
  { id: 'insider_score', label: 'Suspicion' },
];
const CATEGORIES = ['all', 'politics', 'sports', 'crypto', 'business', 'tech', 'science', 'culture'];

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function ageText(days) {
  if (days == null) return '—';
  if (days < 1) return '<1d';
  if (days < 60) return `${Math.round(days)}d`;
  if (days < 730) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

function FollowStar({ address, name, following }) {
  const on = following.isFollowing(address);
  const click = async e => {
    e.stopPropagation();
    try {
      await following.toggle({ address, name: name || '' });
    } catch (err) {
      toast.error(err?.message || 'Could not save');
    }
  };
  return (
    <button type="button" onClick={click} disabled={!following.ready || following.isSaving} className={cn('pressable p-1 rounded hover:bg-secondary', on ? 'text-yellow-400' : 'text-muted-foreground hover:text-foreground')} title={on ? 'Unfollow' : 'Follow'}>
      <Star className={cn('w-3.5 h-3.5', on && 'fill-yellow-400')} />
    </button>
  );
}

function WalletRow({ row, following, onCopy }) {
  const checked = !!row.last_checked_at;
  return (
    <div className={cn('flex items-center gap-3 px-4 py-2.5 border-b border-border/60 last:border-b-0 text-xs hover:bg-secondary/30 transition-colors duration-100', row.suspicious && 'bg-rose-500/5')}>
      <div className="w-40 sm:w-48 flex-shrink-0 min-w-0">
        <TraderLink address={row.address} name={row.name} profileImage={row.profile_image} size="sm" className="text-xs w-full" />
        {following.isFollowing(row.address) && <span className="block text-[11px] text-yellow-400 pl-8">following</span>}
      </div>
      <span className="w-24 flex-shrink-0 hidden sm:flex">
        {checked ? <ScoreBadge score={row.score} label={row.score_label || 'Unrated'} title={row.closed_count != null ? `From the last ${row.closed_count} settled positions` : undefined} /> : <span className="text-[11px] text-muted-foreground">queued</span>}
      </span>
      <span className="w-16 text-right flex-shrink-0">{checked ? <Pnl value={row.trade_pnl} /> : <span className="text-muted-foreground">—</span>}</span>
      <span className="font-mono text-muted-foreground w-16 text-right flex-shrink-0 hidden md:inline">{checked && row.volume_total != null ? formatUsd(row.volume_total, { compact: true }) : '—'}</span>
      <span className="w-20 text-right flex-shrink-0 font-mono">
        <span className="text-foreground">{formatUsd(row.fills_usd, { compact: true })}</span>
        <span className="block text-[11px] text-muted-foreground">
          {row.fills_seen} fill{row.fills_seen === 1 ? '' : 's'}
        </span>
      </span>
      <span className="font-mono text-muted-foreground w-10 text-right flex-shrink-0 hidden lg:inline">{checked ? row.markets_traded ?? '—' : '—'}</span>
      <span className="font-mono text-muted-foreground w-10 text-right flex-shrink-0 hidden lg:inline">{checked ? ageText(row.wallet_age_days) : '—'}</span>
      <div className="flex-1 min-w-0 hidden sm:block">
        <FlagList flags={row.flags || []} max={3} />
      </div>
      <div className="w-44 flex-shrink-0 hidden xl:block min-w-0">
        {row.last_fill_at ? (
          <>
            <a href={marketUrl(row.last_fill_event_slug)} target="_blank" rel="noreferrer" className="block truncate text-foreground/80 hover:underline" title={row.last_fill_title}>
              {row.last_fill_title}
            </a>
            <span className="text-[11px] text-muted-foreground">
              {shortAgo(Date.parse(row.last_fill_at))} ago · {row.last_fill_side === 'BUY' ? 'bought' : 'sold'} {formatUsd(row.last_fill_usd, { compact: true })}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
      <div className="w-16 flex-shrink-0 flex items-center justify-end gap-1">
        <FollowStar address={row.address} name={row.name} following={following} />
        <button type="button" onClick={() => onCopy(row)} className="pressable p-1 rounded text-muted-foreground hover:text-primary hover:bg-secondary" title="Copy this trader into a portfolio">
          <Rocket className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function Unavailable() {
  return (
    <div className="surface">
      <EmptyState icon={Database} title="The wallet registry runs on the hosted demo's server" text="This copy has no Supabase sandbox behind it, so there is no server scan. Open the hosted demo to browse the scanned wallets, or deploy your own sandbox (README: Deploy the free demo).">
        <a href={HOSTED_DEMO} target="_blank" rel="noreferrer" className="pressable mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:text-primary">
          Open the hosted demo <ExternalLink className="w-3 h-3" />
        </a>
      </EmptyState>
    </div>
  );
}

export default function WalletRegistry({ following }) {
  const { openLaunch } = useLaunch();
  const [sort, setSort] = useState('score');
  const [category, setCategory] = useState('all');
  const [only, setOnly] = useState({ rated: false, fresh: false, suspicious: false });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const term = useDebounced(search.trim(), 300);
  const params = useMemo(
    () => ({ sort, dir: 'desc', page, pageSize: PAGE_SIZE, search: term, category: category === 'all' ? null : category, rated: only.rated, fresh: only.fresh, suspicious: only.suspicious }),
    [sort, page, term, category, only]
  );
  useEffect(() => setPage(0), [sort, term, category, only]);
  const list = useRegistry(params);
  const stats = useRegistryStats();

  if (!registryAvailable()) return <Unavailable />;

  const rows = list.data?.rows || [];
  const total = list.data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const st = stats.data;
  const scan = st?.state;
  const queued = st ? Math.max(0, st.total - st.checked) : 0;
  const onCopy = row => openLaunch({ mode: 'live', pilot: { address: row.address, name: row.name || '', profileImage: row.profile_image || '' } });

  return (
    <div className="space-y-3">
      <div className="surface p-4 text-xs text-muted-foreground space-y-1.5">
        <p className="flex items-center gap-2 text-foreground text-sm font-medium">
          <Users className="w-4 h-4 text-primary" /> Every wallet behind a big fill
        </p>
        <p>
          A server scan reads every Polymarket fill of $1,000 or more every 5 minutes and keeps one row per wallet. Each wallet is checked once (public stats, the last 100 settled positions, the open book) and
          refreshed daily. The score and the flags follow the same rules as the live feed. "Queued" wallets have been seen but not checked yet.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Wallets tracked" value={st ? st.total.toLocaleString() : '…'} sub="fills ≥ $1k · scan every 5 min" />
        <Tile label="Checked" value={st ? st.checked.toLocaleString() : '…'} sub={st ? (queued > 0 ? `${queued.toLocaleString()} queued` : 'all checked') : null} />
        <Tile label="Second look" value={st ? st.suspicious.toLocaleString() : '…'} sub="fresh + conviction" className={st?.suspicious ? 'border-rose-500/40' : ''} />
        <Tile label="Last scan" value={scan?.last_run_at ? `${shortAgo(Date.parse(scan.last_run_at))} ago` : '—'} sub={scan ? `${(scan.last_fills_scanned || 0).toLocaleString()} fills read · +${scan.last_wallets_new || 0} new wallets` : null} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-muted-foreground mr-1">Sort</span>
        <Segmented options={SORTS} value={sort} onChange={setSort} />
        <span className="w-px h-4 bg-border mx-1 hidden sm:block" />
        <Chip small active={only.rated} onClick={() => setOnly(o => ({ ...o, rated: !o.rated }))} title="Only wallets with a trader score (5 or more settled positions)">
          Rated
        </Chip>
        <Chip small active={only.fresh} onClick={() => setOnly(o => ({ ...o, fresh: !o.fresh }))} title="Accounts 30 days old or younger">
          Fresh accounts
        </Chip>
        <Chip small active={only.suspicious} onClick={() => setOnly(o => ({ ...o, suspicious: !o.suspicious }))} title="Fresh account plus a concentrated, long-shot or very large bet">
          Second look
        </Chip>
        <div className="ml-auto relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or address" className="h-8 w-40 sm:w-52 pl-8 bg-card border-border text-xs" />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {CATEGORIES.map(id => (
          <Chip key={id} small active={category === id} onClick={() => setCategory(id)}>
            {id === 'all' ? 'All' : CATEGORY_LABELS[id]}
          </Chip>
        ))}
      </div>

      <div className="surface overflow-hidden">
        <div className="max-h-[70vh] overflow-y-auto overscroll-contain">
          {/* Column headers stay pinned while the list scrolls. Widths and breakpoints mirror WalletRow. */}
          <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-2 border-b border-border bg-card text-[11px] text-muted-foreground">
            <span className="w-40 sm:w-48 flex-shrink-0">Trader</span>
            <span className="w-24 flex-shrink-0 hidden sm:block">Score</span>
            <span className="w-16 text-right flex-shrink-0">P&L</span>
            <span className="w-16 text-right flex-shrink-0 hidden md:block">Volume</span>
            <span className="w-20 text-right flex-shrink-0">Fills seen</span>
            <span className="w-10 text-right flex-shrink-0 hidden lg:block">Mkts</span>
            <span className="w-10 text-right flex-shrink-0 hidden lg:block">Age</span>
            <span className="flex-1 min-w-0 hidden sm:block">Flags</span>
            <span className="w-44 flex-shrink-0 hidden xl:block">Last fill</span>
            <span className="w-16 flex-shrink-0" />
          </div>
          {list.isLoading ? (
            <SkeletonRows rows={10} />
          ) : list.error ? (
            <ErrorState error={list.error} hint="The registry could not be read. It retries on the next refresh." />
          ) : rows.length === 0 ? (
            <EmptyState icon={Users} title={st && st.total === 0 ? 'The first scan has not finished yet' : 'No wallets match'} text={st && st.total === 0 ? 'The server fills the registry within a few minutes of deployment.' : 'Clear a filter or try another search.'} />
          ) : (
            rows.map(row => <WalletRow key={row.address} row={row} following={following} onCopy={onCopy} />)
          )}
        </div>
        <div className="flex items-center gap-2 px-4 py-2 border-t border-border text-[11px] text-muted-foreground">
          <span>
            {total === 0 ? '0 wallets' : `${(page * PAGE_SIZE + 1).toLocaleString()}–${Math.min(total, (page + 1) * PAGE_SIZE).toLocaleString()} of ${total.toLocaleString()} wallets`}
            {list.isFetching && !list.isLoading ? ' · updating…' : ''}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="pressable p-1 rounded border border-border bg-card disabled:opacity-40 hover:text-foreground" title="Previous page">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono px-1">
              {page + 1}/{pages}
            </span>
            <button type="button" onClick={() => setPage(p => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} className="pressable p-1 rounded border border-border bg-card disabled:opacity-40 hover:text-foreground" title="Next page">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

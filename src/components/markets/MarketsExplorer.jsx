import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import { Search, RefreshCw, ExternalLink, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { formatDistanceToNowStrict, format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { fetchUniverse, fetchPriceHistory, fetchBook, CATEGORY_LABELS, formatUsd, formatCents, hoursToEnd } from '@/api/polymarket';
import MarketWhales from '@/components/whales/MarketWhales';

const SORTS = [
  { id: 'volume24h', label: '24h volume' },
  { id: 'change24h', label: '24h move' },
  { id: 'liquidity', label: 'Liquidity' },
  { id: 'ending', label: 'Ending soon' },
];

function endsIn(market) {
  const h = hoursToEnd(market);
  if (!Number.isFinite(h)) return '—';
  if (h < 0) return 'ended';
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

function Change({ value }) {
  const cents = Math.round((value || 0) * 100);
  const cls = cents > 0 ? 'text-primary' : cents < 0 ? 'text-destructive' : 'text-muted-foreground';
  return (
    <span className={cn('font-mono text-xs', cls)}>
      {cents > 0 ? '+' : ''}
      {cents}¢
    </span>
  );
}

const HistoryTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded px-2 py-1 text-xs font-mono">
      {format(p.t, 'MMM d HH:mm')} · {formatCents(p.p)}
    </div>
  );
};

function MarketDetail({ market }) {
  const history = useQuery({
    queryKey: ['price-history', market.yesTokenId],
    queryFn: () => fetchPriceHistory(market.yesTokenId, { interval: '1w', fidelity: 60 }),
    staleTime: 5 * 60_000,
  });
  const book = useQuery({
    queryKey: ['book', market.yesTokenId],
    queryFn: () => fetchBook(market.yesTokenId),
    staleTime: 30_000,
  });
  const points = history.data || [];
  const up = points.length > 1 && points[points.length - 1].p >= points[0].p;

  return (
    <div className="px-4 pb-4 pt-1 grid grid-cols-1 md:grid-cols-5 gap-4">
      <div className="md:col-span-3 h-32 bg-secondary/30 rounded-xl p-2">
        {history.isLoading ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Loading 7-day YES price…</div>
        ) : points.length < 2 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No price history</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 6, right: 6, left: 6, bottom: 6 }}>
              <YAxis domain={[0, 1]} hide />
              <Tooltip content={<HistoryTooltip />} />
              <Line type="monotone" dataKey="p" stroke={up ? 'hsl(142,71%,45%)' : 'hsl(0,72%,51%)'} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="md:col-span-2 text-xs space-y-1.5">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Best bid / ask</span>
          <span className="font-mono text-foreground">
            {formatCents(book.data?.bestBid ?? market.bestBid)} / {formatCents(book.data?.bestAsk ?? market.bestAsk)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Book imbalance (±5¢)</span>
          <span className="font-mono text-foreground">
            {book.data ? `${book.data.imbalance > 0 ? 'bid' : 'ask'}-heavy ${Math.abs(Math.round(book.data.imbalance * 100))}%` : '…'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">1h / 24h / 1w</span>
          <span className="font-mono">
            <Change value={market.change1h} /> <span className="text-muted-foreground">/</span> <Change value={market.change24h} />{' '}
            <span className="text-muted-foreground">/</span> <Change value={market.change1w} />
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Ends</span>
          <span className="font-mono text-foreground">{market.endDate ? format(new Date(market.endDate), 'MMM d, yyyy') : '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Condition id</span>
          <span className="font-mono text-foreground/70 truncate max-w-[140px]" title={market.conditionId}>
            {market.conditionId?.slice(0, 10)}…
          </span>
        </div>
        <a
          href={market.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline pt-1"
          onClick={e => e.stopPropagation()}
        >
          Open on Polymarket <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <MarketWhales market={market} />
    </div>
  );
}

function MarketRow({ market, expanded, onToggle }) {
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors cursor-pointer" onClick={onToggle}>
        {market.image ? (
          <img src={market.image} alt="" className="w-8 h-8 rounded-md object-cover flex-shrink-0 bg-secondary" loading="lazy" />
        ) : (
          <div className="w-8 h-8 rounded-md bg-secondary flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground truncate" title={market.question}>
            {market.question}
          </p>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground truncate">
            {market.eventTitle && market.eventTitle !== market.question && <span className="truncate">{market.eventTitle}</span>}
            {market.negRisk && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/30 text-amber-400">
                NegRisk
              </Badge>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0 w-16">
          <p className="text-sm font-mono font-semibold text-foreground">{formatCents(market.yesPrice)}</p>
          <Change value={market.change24h} />
        </div>
        <div className="text-right flex-shrink-0 w-14 hidden sm:block">
          <p className="text-[10px] text-muted-foreground">spread</p>
          <p className="text-xs font-mono text-foreground/80">{market.spread != null ? formatCents(market.spread) : '—'}</p>
        </div>
        <div className="text-right flex-shrink-0 w-16 hidden md:block">
          <p className="text-[10px] text-muted-foreground">24h vol</p>
          <p className="text-xs font-mono text-foreground/80">{formatUsd(market.volume24h, { compact: true })}</p>
        </div>
        <div className="text-right flex-shrink-0 w-16 hidden lg:block">
          <p className="text-[10px] text-muted-foreground">liquidity</p>
          <p className="text-xs font-mono text-foreground/80">{formatUsd(market.liquidity, { compact: true })}</p>
        </div>
        <div className="text-right flex-shrink-0 w-12 hidden sm:block">
          <p className="text-[10px] text-muted-foreground">ends</p>
          <p className="text-xs font-mono text-foreground/80">{endsIn(market)}</p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
      </div>
      {expanded && <MarketDetail market={market} />}
    </div>
  );
}

export default function MarketsExplorer() {
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('volume24h');
  const [expanded, setExpanded] = useState(null);

  const universe = useQuery({
    queryKey: ['universe', category],
    queryFn: () => fetchUniverse(category === 'all' ? ['all'] : [category], { perCategory: 60, minHoursToEnd: 0 }),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const markets = useMemo(() => {
    let list = universe.data?.markets || [];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(m => `${m.question} ${m.eventTitle}`.toLowerCase().includes(q));
    const sorted = [...list];
    if (sort === 'change24h') sorted.sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));
    else if (sort === 'liquidity') sorted.sort((a, b) => b.liquidity - a.liquidity);
    else if (sort === 'ending') sorted.sort((a, b) => hoursToEnd(a) - hoursToEnd(b));
    else sorted.sort((a, b) => b.volume24h - a.volume24h);
    return sorted.slice(0, 150);
  }, [universe.data, search, sort]);

  const totalVolume = (universe.data?.markets || []).reduce((s, m) => s + m.volume24h, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
          <button
            key={id}
            onClick={() => {
              setCategory(id);
              setExpanded(null);
            }}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all',
              category === id ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search markets"
              className="h-8 w-44 sm:w-56 pl-8 bg-card border-border text-xs"
            />
          </div>
          <button
            onClick={() => universe.refetch()}
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', universe.isFetching && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Live markets</p>
          <p className="text-lg font-mono font-bold text-foreground mt-0.5">{universe.data?.markets.length ?? '—'}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">24h volume (shown)</p>
          <p className="text-lg font-mono font-bold text-primary mt-0.5">{formatUsd(totalVolume, { compact: true })}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Updated</p>
          <p className="text-lg font-mono font-bold text-foreground mt-0.5">
            {universe.dataUpdatedAt ? `${formatDistanceToNowStrict(universe.dataUpdatedAt)} ago` : '—'}
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
          <span className="text-xs text-muted-foreground mr-1">Sort</span>
          {SORTS.map(s => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className={cn('px-2 py-0.5 rounded text-[11px] font-medium transition-all', sort === s.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {s.label}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground">{markets.length} shown</span>
        </div>
        {universe.isLoading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : universe.error ? (
          <div className="py-12 flex flex-col items-center gap-2 text-center">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
            <p className="text-sm text-muted-foreground">Could not load markets: {universe.error.message}</p>
          </div>
        ) : markets.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No markets match</div>
        ) : (
          markets.map(m => <MarketRow key={m.id} market={m} expanded={expanded === m.id} onToggle={() => setExpanded(expanded === m.id ? null : m.id)} />)
        )}
      </div>
    </div>
  );
}

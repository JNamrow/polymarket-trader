import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Zap, Fish, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import WalletCard from './WalletCard';

const FILTERS = [
  { id: 'all', label: 'All Wallets' },
  { id: 'velocity', label: 'High Velocity', icon: Zap, description: 'Most active traders by trade count' },
  { id: 'whales', label: 'Whales', icon: Fish, description: 'Largest position sizes' },
];

// Simulate fetching Polymarket wallets — in production this would hit the Polymarket API
function generateWallets() {
  const names = [
    '0x3f4a...9b2c', '0xa1b2...7f3e', '0x88cc...1d4a', '0x2e9f...3c8b',
    '0x5d7a...0e1f', '0xf3c1...4a9d', '0x1a2b...8e7f', '0x9c4d...2f6a',
    '0x6b3e...5d0c', '0x7f8a...3b1e',
  ];
  return names.map((addr, i) => {
    const tradeCount = Math.floor(Math.random() * 200) + 5;
    const avgPositionSize = Math.floor(Math.random() * 4500) + 50;
    const totalVolume = tradeCount * avgPositionSize;
    const winRate = 0.35 + Math.random() * 0.4;
    const pnl = Math.round((Math.random() * 2 - 0.6) * totalVolume * 0.15);
    const pnlPct = ((pnl / (totalVolume * 0.5)) * 100).toFixed(1);
    const openTrades = Math.floor(Math.random() * 8) + 1;

    const pnlHistory = Array.from({ length: 12 }, (_, j) => ({
      t: `${j * 2}h`,
      v: Math.round((Math.sin(j / 2 + i) * 500 + j * 80 + (Math.random() * 300 - 150))),
    }));

    const liveTrades = Array.from({ length: openTrades }, (_, k) => ({
      id: k,
      market: [
        'Will Trump tweet before noon?',
        'BTC above $70k by April?',
        'Fed rate cut in June?',
        'Celtics win NBA title?',
        'US recession in 2026?',
        'SpaceX Mars mission 2026?',
        'GPT-5 released Q2?',
        'Apple stock above $200?',
      ][Math.floor(Math.random() * 8)],
      side: Math.random() > 0.5 ? 'YES' : 'NO',
      size: Math.floor(Math.random() * avgPositionSize * 2) + 20,
      price: (0.2 + Math.random() * 0.7).toFixed(2),
      entered: `${Math.floor(Math.random() * 23) + 1}h ago`,
    }));

    return {
      id: i,
      address: addr,
      tradeCount,
      avgPositionSize,
      totalVolume,
      winRate: Math.round(winRate * 100),
      pnl,
      pnlPct: parseFloat(pnlPct),
      pnlHistory,
      liveTrades,
      openTrades,
    };
  });
}

export default function Watchlist() {
  const [filter, setFilter] = useState('all');
  const [seed, setSeed] = useState(0);

  const { data: wallets = [], isFetching } = useQuery({
    queryKey: ['watchlist-wallets', seed],
    queryFn: () => Promise.resolve(generateWallets()),
    staleTime: 30000,
  });

  const filtered = useMemo(() => {
    if (filter === 'velocity') {
      return [...wallets].sort((a, b) => b.tradeCount - a.tradeCount).slice(0, 6);
    }
    if (filter === 'whales') {
      return [...wallets].sort((a, b) => b.avgPositionSize - a.avgPositionSize).slice(0, 6);
    }
    return wallets;
  }, [wallets, filter]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all',
              filter === id
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-border/80'
            )}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {filter !== 'all' && (
            <span className="text-xs text-muted-foreground">
              {filter === 'velocity' ? 'Sorted by trade frequency' : 'Sorted by avg position size'}
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSeed(s => s + 1)}
            className="h-7 px-2 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Stats summary bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Wallets Tracked</p>
          <p className="text-lg font-mono font-bold text-foreground mt-0.5">{filtered.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Total Open Trades</p>
          <p className="text-lg font-mono font-bold text-primary mt-0.5">
            {filtered.reduce((s, w) => s + w.openTrades, 0)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Avg Win Rate</p>
          <p className="text-lg font-mono font-bold text-foreground mt-0.5">
            {filtered.length ? Math.round(filtered.reduce((s, w) => s + w.winRate, 0) / filtered.length) : 0}%
          </p>
        </div>
      </div>

      {/* Wallet cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map(wallet => (
          <WalletCard key={wallet.id} wallet={wallet} filter={filter} />
        ))}
      </div>
    </div>
  );
}
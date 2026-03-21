import React, { useState } from 'react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import { Zap, Fish, ChevronDown, ChevronUp, TrendingUp, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const MiniTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="bg-card border border-border rounded px-2 py-1 text-xs font-mono">
      <span className={v >= 0 ? 'text-primary' : 'text-destructive'}>{v >= 0 ? '+' : ''}${v}</span>
    </div>
  );
};

export default function WalletCard({ wallet, filter }) {
  const [showTrades, setShowTrades] = useState(false);
  const isPositive = wallet.pnl >= 0;
  const isVelocity = wallet.tradeCount > 100;
  const isWhale = wallet.avgPositionSize > 2000;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden hover:border-border/80 transition-colors">
      {/* Header */}
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 font-mono text-xs text-muted-foreground">
            {wallet.address.slice(2, 4).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-mono text-foreground">{wallet.address}</span>
              {isVelocity && (
                <Badge variant="outline" className="text-xs border-yellow-500/30 bg-yellow-500/10 text-yellow-400 px-1.5 py-0">
                  <Zap className="w-2.5 h-2.5 mr-0.5" />HV
                </Badge>
              )}
              {isWhale && (
                <Badge variant="outline" className="text-xs border-blue-500/30 bg-blue-500/10 text-blue-400 px-1.5 py-0">
                  <Fish className="w-2.5 h-2.5 mr-0.5" />Whale
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground font-mono">
              <span>{wallet.tradeCount} trades</span>
              <span>avg ${wallet.avgPositionSize.toLocaleString()}</span>
              <span>{wallet.winRate}% win</span>
            </div>
          </div>
        </div>

        {/* P&L */}
        <div className="text-right flex-shrink-0">
          <div className={cn('text-sm font-mono font-semibold flex items-center gap-1', isPositive ? 'text-primary' : 'text-destructive')}>
            {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {isPositive ? '+' : ''}${wallet.pnl.toLocaleString()}
          </div>
          <div className={cn('text-xs font-mono', isPositive ? 'text-primary/70' : 'text-destructive/70')}>
            {isPositive ? '+' : ''}{wallet.pnlPct}%
          </div>
        </div>
      </div>

      {/* Mini P&L chart */}
      <div className="h-20 px-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={wallet.pnlHistory} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
            <defs>
              <linearGradient id={`grad-${wallet.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isPositive ? 'hsl(142,71%,45%)' : 'hsl(0,72%,51%)'} stopOpacity={0.25} />
                <stop offset="95%" stopColor={isPositive ? 'hsl(142,71%,45%)' : 'hsl(0,72%,51%)'} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip content={<MiniTooltip />} />
            <Area
              type="monotone"
              dataKey="v"
              stroke={isPositive ? 'hsl(142,71%,45%)' : 'hsl(0,72%,51%)'}
              strokeWidth={1.5}
              fill={`url(#grad-${wallet.id})`}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Live trades toggle */}
      <div className="border-t border-border">
        <button
          onClick={() => setShowTrades(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {wallet.openTrades} live trade{wallet.openTrades !== 1 ? 's' : ''}
          </span>
          {showTrades ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showTrades && (
          <div className="divide-y divide-border/50">
            {wallet.liveTrades.map(trade => (
              <div key={trade.id} className="px-4 py-2 flex items-center gap-3 text-xs">
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs flex-shrink-0',
                    trade.side === 'YES'
                      ? 'border-primary/30 bg-primary/5 text-primary'
                      : 'border-destructive/30 bg-destructive/5 text-destructive'
                  )}
                >
                  {trade.side}
                </Badge>
                <span className="text-muted-foreground truncate flex-1">{trade.market}</span>
                <span className="font-mono text-muted-foreground flex-shrink-0">${trade.size.toLocaleString()}</span>
                <span className="font-mono text-foreground flex-shrink-0">@{trade.price}</span>
                <span className="text-muted-foreground flex-shrink-0">{trade.entered}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
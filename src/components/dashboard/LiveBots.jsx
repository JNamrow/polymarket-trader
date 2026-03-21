import React from 'react';
import { Pause, Square, Play, Clock, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

const algorithmLabels = {
  momentum: 'Momentum',
  mean_reversion: 'Mean Rev.',
  arbitrage: 'Arbitrage',
  sentiment: 'Sentiment',
  custom: 'Custom',
};

export default function LiveBots({ bots, onPause, onStop, onResume }) {
  if (bots.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-foreground">Live Trading Bots</h3>
          <Zap className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
            <Zap className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No active bots running</p>
          <p className="text-xs text-muted-foreground mt-1">Configure and launch a new bot to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 lg:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-foreground">Live Trading Bots</h3>
        <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5 text-xs">
          {bots.length} Active
        </Badge>
      </div>
      <div className="space-y-2">
        {bots.map((bot) => {
          const pnl = bot.pnl || 0;
          const isPositive = pnl >= 0;
          const elapsed = bot.start_time ? formatDistanceToNow(new Date(bot.start_time), { addSuffix: false }) : '—';

          return (
            <div key={bot.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
              {/* Status indicator */}
              <div className={cn(
                "w-2 h-2 rounded-full flex-shrink-0",
                bot.status === 'running' ? "bg-primary animate-pulse-glow" : "bg-yellow-500"
              )} />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{bot.name}</span>
                  <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                    {algorithmLabels[bot.algorithm] || bot.algorithm}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-muted-foreground font-mono">${bot.fund_allocation?.toFixed(0)} USDC</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />{elapsed}
                  </span>
                  {bot.categories && (
                    <span className="text-xs text-muted-foreground">{bot.categories.join(', ')}</span>
                  )}
                </div>
              </div>

              {/* P&L */}
              <div className="text-right flex-shrink-0">
                <p className={cn(
                  "text-sm font-mono font-semibold",
                  isPositive ? "text-primary" : "text-destructive"
                )}>
                  {isPositive ? '+' : ''}${pnl.toFixed(2)}
                </p>
                <p className={cn(
                  "text-xs font-mono",
                  isPositive ? "text-primary/70" : "text-destructive/70"
                )}>
                  {bot.pnl_percent ? `${isPositive ? '+' : ''}${bot.pnl_percent.toFixed(1)}%` : '0.0%'}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-1 flex-shrink-0">
                {bot.status === 'running' ? (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-yellow-500" onClick={() => onPause(bot)}>
                    <Pause className="w-3.5 h-3.5" />
                  </Button>
                ) : (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => onResume(bot)}>
                    <Play className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => onStop(bot)}>
                  <Square className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
import React, { useState } from 'react';
import { Pause, Square, Play, Clock, Zap, FlaskConical, RefreshCw, AlertTriangle, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDistanceToNowStrict } from 'date-fns';
import BotDetailModal from './BotDetailModal';
import { formatSignedUsd } from '@/api/polymarket';

export const ALGORITHM_LABELS = {
  momentum: 'Momentum',
  mean_reversion: 'Mean Rev.',
  market_making: 'Market Making',
  arbitrage: 'Arbitrage',
  sentiment: 'Sentiment',
  custom: 'Custom',
};

export function FillModeBadge({ bot, className }) {
  if (bot.is_paper) {
    return (
      <Badge variant="outline" className={cn('text-xs border-violet-500/30 bg-violet-500/10 text-violet-400 flex items-center gap-1', className)}>
        <FlaskConical className="w-2.5 h-2.5" />
        Paper
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={cn('text-xs border-amber-500/30 bg-amber-500/10 text-amber-400', className)}
      title="Live bot: tracks real markets, but order execution is simulated until a signer is connected"
    >
      Sim fills
    </Badge>
  );
}

export default function LiveBots({ bots, trades = [], onPause, onStop, onResume, onTick, engineBusy }) {
  const [selectedBot, setSelectedBot] = useState(null);

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
          <p className="text-xs text-muted-foreground mt-1">Start a paper experiment to see the engine trade live markets</p>
        </div>
      </div>
    );
  }

  const selected = selectedBot ? bots.find(b => b.id === selectedBot.id) || selectedBot : null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 lg:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-foreground">Live Trading Bots</h3>
        <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5 text-xs">
          {bots.length} Active
        </Badge>
      </div>
      <BotDetailModal bot={selected} trades={trades} open={!!selected} onClose={() => setSelectedBot(null)} onTick={onTick} />
      <div className="space-y-2">
        {bots.map(bot => {
          const pnl = Number(bot.pnl) || 0;
          const isPositive = pnl >= 0;
          const elapsed = bot.start_time ? formatDistanceToNowStrict(new Date(bot.start_time)) : '—';
          const openCount = trades.filter(t => t.bot_run_id === bot.id && t.status === 'open').length;
          const lastTick = bot.last_tick_at ? `${formatDistanceToNowStrict(new Date(bot.last_tick_at))} ago` : 'no tick yet';

          return (
            <div
              key={bot.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer"
              onClick={() => setSelectedBot(bot)}
            >
              <div
                className={cn(
                  'w-2 h-2 rounded-full flex-shrink-0',
                  bot.last_error ? 'bg-destructive' : bot.status === 'running' ? 'bg-primary animate-pulse-glow' : 'bg-yellow-500'
                )}
                title={bot.last_error || bot.status}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground truncate">{bot.name}</span>
                  <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                    {ALGORITHM_LABELS[bot.algorithm] || bot.algorithm}
                  </Badge>
                  <FillModeBadge bot={bot} />
                  {bot.last_error && <AlertTriangle className="w-3 h-3 text-destructive" />}
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-xs text-muted-foreground font-mono">${Number(bot.fund_allocation || 0).toFixed(0)} USDC</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {elapsed}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1" title="Open positions">
                    <Layers className="w-3 h-3" />
                    {openCount}
                  </span>
                  <span className="text-xs text-muted-foreground/70 hidden xl:inline">tick {lastTick}</span>
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <p className={cn('text-sm font-mono font-semibold', isPositive ? 'text-primary' : 'text-destructive')}>{formatSignedUsd(pnl)}</p>
                <p className={cn('text-xs font-mono', isPositive ? 'text-primary/70' : 'text-destructive/70')}>
                  {bot.pnl_percent ? `${isPositive ? '+' : ''}${Number(bot.pnl_percent).toFixed(1)}%` : '0.0%'}
                </p>
              </div>

              <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                {bot.status === 'running' ? (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-sky-400"
                      onClick={() => onTick?.(bot)}
                      disabled={engineBusy}
                      title="Tick now"
                    >
                      <RefreshCw className={cn('w-3.5 h-3.5', engineBusy && 'animate-spin')} />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-yellow-500" onClick={() => onPause(bot)} title="Pause">
                      <Pause className="w-3.5 h-3.5" />
                    </Button>
                  </>
                ) : (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => onResume(bot)} title="Resume">
                    <Play className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => onStop(bot)}
                  title="Stop and close all positions"
                >
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

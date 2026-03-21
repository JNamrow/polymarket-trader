import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { FlaskConical, Clock, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';

const algorithmLabels = {
  momentum: 'Momentum',
  mean_reversion: 'Mean Reversion',
  arbitrage: 'Arbitrage',
  sentiment: 'Sentiment',
  custom: 'Custom',
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-mono font-semibold', val >= 0 ? 'text-primary' : 'text-destructive')}>
        {val >= 0 ? '+' : ''}${val?.toFixed(2)}
      </p>
    </div>
  );
};

export default function BotDetailModal({ bot, trades, open, onClose }) {
  if (!bot) return null;

  const pnl = bot.pnl || 0;
  const isPositive = pnl >= 0;
  const elapsed = bot.start_time ? formatDistanceToNow(new Date(bot.start_time), { addSuffix: false }) : '—';
  const botTrades = trades.filter(t => t.bot_run_id === bot.id);
  const pnlHistory = bot.pnl_history || [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto bg-card border-border p-0">
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-sm font-semibold text-foreground truncate">{bot.name}</DialogTitle>
                <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                  {algorithmLabels[bot.algorithm] || bot.algorithm}
                </Badge>
                {bot.is_paper && (
                  <Badge variant="outline" className="text-xs border-violet-500/30 bg-violet-500/10 text-violet-400 flex items-center gap-1">
                    <FlaskConical className="w-2.5 h-2.5" />Paper
                  </Badge>
                )}
                <Badge variant="outline" className={cn('text-xs', bot.status === 'running' ? 'border-primary/30 bg-primary/5 text-primary' : 'border-yellow-500/30 text-yellow-500')}>
                  {bot.status}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                <span className="font-mono">${bot.fund_allocation?.toFixed(0)} USDC</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{elapsed}</span>
                {bot.categories && <span className="hidden sm:inline">{bot.categories.join(', ')}</span>}
              </div>
            </div>
            {/* P&L summary */}
            <div className="text-right flex-shrink-0">
              <div className={cn('text-xl font-mono font-bold flex items-center gap-1 justify-end', isPositive ? 'text-primary' : 'text-destructive')}>
                {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {isPositive ? '+' : ''}${pnl.toFixed(2)}
              </div>
              <div className={cn('text-xs font-mono', isPositive ? 'text-primary/70' : 'text-destructive/70')}>
                {bot.pnl_percent ? `${isPositive ? '+' : ''}${bot.pnl_percent.toFixed(1)}%` : '0.0%'}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-4 sm:space-y-5">
          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-secondary/50 border border-border rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Current Value</p>
              <p className="text-sm font-mono font-semibold text-foreground mt-0.5">
                ${(bot.current_value || bot.fund_allocation || 0).toFixed(2)}
              </p>
            </div>
            <div className="bg-secondary/50 border border-border rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Opened / Closed</p>
              <p className="text-sm font-mono font-semibold text-foreground mt-0.5">{bot.positions_bought || 0} / {bot.positions_sold || 0}</p>
            </div>
            <div className="bg-secondary/50 border border-border rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Avg Edge</p>
              <p className={cn("text-sm font-mono font-semibold mt-0.5", (bot.avg_edge || 0) >= 0 ? "text-primary" : "text-destructive")}>
                {bot.avg_edge != null ? `${bot.avg_edge > 0 ? '+' : ''}${bot.avg_edge.toFixed(1)}%` : '—'}
              </p>
            </div>
          </div>

          {/* Config strip */}
          <div className="flex flex-wrap gap-2">
            {bot.kelly_fraction != null && (
              <span className="text-xs font-mono px-2 py-1 rounded-md bg-secondary border border-border text-muted-foreground">
                Kelly {bot.kelly_fraction === 0.25 ? '¼' : bot.kelly_fraction === 0.5 ? '½' : bot.kelly_fraction === 0.75 ? '¾' : '1×'}
              </span>
            )}
            {bot.order_type && (
              <span className="text-xs font-mono px-2 py-1 rounded-md bg-secondary border border-border text-muted-foreground">
                {bot.order_type}
              </span>
            )}
            {bot.neg_risk && (
              <span className="text-xs font-mono px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400">
                NegRisk
              </span>
            )}
            {bot.vpin != null && (
              <span className={cn("text-xs font-mono px-2 py-1 rounded-md border",
                bot.vpin > 0.85 ? "bg-destructive/10 border-destructive/30 text-destructive" :
                bot.vpin > 0.7 ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400" :
                "bg-secondary border-border text-muted-foreground"
              )}>
                VPIN {bot.vpin.toFixed(2)}
              </span>
            )}
          </div>

          {/* P&L Chart */}
          {pnlHistory.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">P&L Over Time</p>
              <div className="h-44 bg-secondary/30 rounded-xl p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={pnlHistory} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="modalPnlGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={isPositive ? 'hsl(142,71%,45%)' : 'hsl(0,72%,51%)'} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={isPositive ? 'hsl(142,71%,45%)' : 'hsl(0,72%,51%)'} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,14%)" />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(215,14%,50%)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(215,14%,50%)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="pnl"
                      stroke={isPositive ? 'hsl(142,71%,45%)' : 'hsl(0,72%,51%)'}
                      strokeWidth={2}
                      fill="url(#modalPnlGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Trades */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Trades {botTrades.length > 0 ? `(${botTrades.length})` : ''}
            </p>
            {botTrades.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground bg-secondary/30 rounded-xl">
                No trades recorded for this run yet.
              </div>
            ) : (
              <>
                {/* Mobile: card list */}
                <div className="sm:hidden space-y-2">
                  {botTrades.map(trade => {
                    const tradePnl = trade.pnl || 0;
                    const tradePositive = tradePnl >= 0;
                    const isBuy = trade.side === 'buy';
                    const isOpen = trade.status === 'open' || !trade.exit_price;
                    const pnlPct = trade.entry_price && trade.quantity
                      ? (tradePnl / (trade.entry_price * trade.quantity)) * 100 : null;
                    const tradeTime = trade.timestamp ? format(new Date(trade.timestamp), 'HH:mm') : '—';
                    return (
                      <div key={trade.id} className="bg-secondary/40 border border-border rounded-xl p-3 space-y-2">
                        {/* Row 1: side + market + time */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={cn("font-bold font-mono text-xs flex-shrink-0", isBuy ? "text-primary" : "text-destructive")}>
                              {isBuy ? 'BUY' : 'SELL'}
                            </span>
                            <span className="text-xs text-foreground/80 truncate">{trade.market_name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground/60 flex-shrink-0">{tradeTime}</span>
                        </div>
                        {/* Row 2: prices + pnl */}
                        <div className="flex items-center justify-between gap-2 text-xs font-mono">
                          <div className="flex items-center gap-3 text-muted-foreground">
                            <span>Qty <span className="text-foreground/70">{trade.quantity ?? '—'}</span></span>
                            <span>Entry <span className="text-foreground/70">{trade.entry_price != null ? `$${trade.entry_price.toFixed(3)}` : '—'}</span></span>
                            <span className="flex items-center gap-1">
                              {isOpen ? 'Live' : 'Exit'}
                              {isOpen ? (
                                <span className="flex items-center gap-1">
                                  <span className="relative flex h-1.5 w-1.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
                                  </span>
                                  <span className="text-primary/80">{trade.entry_price != null ? `$${trade.entry_price.toFixed(3)}` : '—'}</span>
                                </span>
                              ) : (
                                <span className="text-foreground/70">{trade.exit_price ? `$${trade.exit_price.toFixed(3)}` : '—'}</span>
                              )}
                            </span>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className={cn("font-bold", tradePositive ? "text-primary" : "text-destructive")}>
                              {tradePositive ? '+' : ''}${tradePnl.toFixed(2)}
                            </span>
                            {pnlPct != null && !isOpen && (
                              <span className={cn("ml-1.5 text-[10px]", tradePositive ? "text-primary/70" : "text-destructive/70")}>
                                {pnlPct > 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop: table */}
                <div className="hidden sm:block rounded-xl overflow-hidden border border-border">
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    <span className="w-10 flex-shrink-0">Side</span>
                    <span className="flex-1 min-w-0">Market</span>
                    <span className="w-8 text-right flex-shrink-0">Qty</span>
                    <span className="w-14 text-right flex-shrink-0">Entry</span>
                    <span className="w-20 text-right flex-shrink-0">Exit / Live</span>
                    <span className="w-16 text-right flex-shrink-0">P&L</span>
                    <span className="w-12 text-right flex-shrink-0">%</span>
                    <span className="w-10 text-right flex-shrink-0">Time</span>
                  </div>
                  <div className="divide-y divide-border">
                    {botTrades.map(trade => {
                      const tradePnl = trade.pnl || 0;
                      const tradePositive = tradePnl >= 0;
                      const isBuy = trade.side === 'buy';
                      const isOpen = trade.status === 'open' || !trade.exit_price;
                      const pnlPct = trade.entry_price && trade.quantity
                        ? (tradePnl / (trade.entry_price * trade.quantity)) * 100 : null;
                      const tradeTime = trade.timestamp ? format(new Date(trade.timestamp), 'HH:mm') : '—';
                      return (
                        <div key={trade.id} className="flex items-center gap-2 px-4 py-3 text-xs hover:bg-secondary/30 transition-colors">
                          <span className={cn("w-10 flex-shrink-0 font-bold font-mono", isBuy ? "text-primary" : "text-destructive")}>
                            {isBuy ? 'BUY' : 'SELL'}
                          </span>
                          <span className="flex-1 min-w-0 text-foreground/80 truncate" title={trade.market_name}>{trade.market_name}</span>
                          <span className="w-8 flex-shrink-0 font-mono text-foreground/70 text-right">{trade.quantity ?? '—'}</span>
                          <span className="w-14 flex-shrink-0 font-mono text-foreground/70 text-right">
                            {trade.entry_price != null ? `$${trade.entry_price.toFixed(3)}` : '—'}
                          </span>
                          <span className="w-20 flex-shrink-0 font-mono text-right flex items-center justify-end gap-1.5">
                            {isOpen ? (
                              <>
                                <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
                                </span>
                                <span className="text-primary/80">{trade.entry_price != null ? `$${trade.entry_price.toFixed(3)}` : 'live'}</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">${trade.exit_price.toFixed(3)}</span>
                            )}
                          </span>
                          <span className={cn('w-16 flex-shrink-0 font-mono font-bold text-right', tradePositive ? 'text-primary' : 'text-destructive')}>
                            {tradePositive ? '+' : ''}${tradePnl.toFixed(2)}
                          </span>
                          <span className={cn('w-12 flex-shrink-0 font-mono text-right', tradePositive ? 'text-primary/70' : 'text-destructive/70')}>
                            {pnlPct != null && !isOpen ? `${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(1)}%` : <span className="text-muted-foreground/40">—</span>}
                          </span>
                          <span className="w-10 flex-shrink-0 font-mono text-muted-foreground/50 text-right text-[10px]">{tradeTime}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
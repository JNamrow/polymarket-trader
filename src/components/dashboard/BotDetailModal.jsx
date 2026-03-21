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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-base font-semibold text-foreground">{bot.name}</DialogTitle>
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
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                <span className="font-mono">${bot.fund_allocation?.toFixed(0)} USDC allocated</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{elapsed}</span>
                {bot.categories && <span>{bot.categories.join(', ')}</span>}
              </div>
            </div>

            {/* P&L summary */}
            <div className="text-right flex-shrink-0">
              <div className={cn('text-2xl font-mono font-bold flex items-center gap-1 justify-end', isPositive ? 'text-primary' : 'text-destructive')}>
                {isPositive ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                {isPositive ? '+' : ''}${pnl.toFixed(2)}
              </div>
              <div className={cn('text-sm font-mono', isPositive ? 'text-primary/70' : 'text-destructive/70')}>
                {bot.pnl_percent ? `${isPositive ? '+' : ''}${bot.pnl_percent.toFixed(1)}%` : '0.0%'}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-secondary/50 border border-border rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Current Value</p>
              <p className="text-sm font-mono font-semibold text-foreground mt-0.5">
                ${(bot.current_value || bot.fund_allocation || 0).toFixed(2)}
              </p>
            </div>
            <div className="bg-secondary/50 border border-border rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Positions Bought</p>
              <p className="text-sm font-mono font-semibold text-foreground mt-0.5">{bot.positions_bought || 0}</p>
            </div>
            <div className="bg-secondary/50 border border-border rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Positions Sold</p>
              <p className="text-sm font-mono font-semibold text-foreground mt-0.5">{bot.positions_sold || 0}</p>
            </div>
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
              <div className="divide-y divide-border rounded-xl overflow-hidden border border-border">
                {/* Header */}
                <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 px-4 py-2 bg-muted/30 text-xs text-muted-foreground">
                  <span>Side</span>
                  <span>Market</span>
                  <span className="text-right">Entry</span>
                  <span className="text-right">Exit</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">P&L</span>
                </div>
                {botTrades.map(trade => {
                  const tradePnl = trade.pnl || 0;
                  const tradePositive = tradePnl >= 0;
                  return (
                    <div key={trade.id} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 items-center px-4 py-2.5 text-xs hover:bg-secondary/30 transition-colors">
                      <span>
                        {trade.side === 'buy'
                          ? <span className="flex items-center gap-1 text-primary"><ArrowUpCircle className="w-3.5 h-3.5" />Buy</span>
                          : <span className="flex items-center gap-1 text-destructive"><ArrowDownCircle className="w-3.5 h-3.5" />Sell</span>
                        }
                      </span>
                      <span className="text-muted-foreground truncate">{trade.market_name}</span>
                      <span className="font-mono text-muted-foreground text-right">${trade.entry_price?.toFixed(3)}</span>
                      <span className="font-mono text-muted-foreground text-right">{trade.exit_price ? `$${trade.exit_price.toFixed(3)}` : '—'}</span>
                      <span className="font-mono text-muted-foreground text-right">{trade.quantity}</span>
                      <span className={cn('font-mono font-semibold text-right', tradePositive ? 'text-primary' : 'text-destructive')}>
                        {tradePositive ? '+' : ''}${tradePnl.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Clock, TrendingUp, TrendingDown, Terminal, Sparkles, ExternalLink, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNowStrict, format } from 'date-fns';
import { toast } from 'sonner';
import { base44, isDemoMode } from '@/api/base44Client';
import { ALGORITHM_LABELS, FillModeBadge } from './LiveBots';
import { formatSignedUsd, formatCents } from '@/api/polymarket';

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-muted-foreground">{format(point.t, 'MMM d, HH:mm')}</p>
      <p className={cn('text-sm font-mono font-semibold', point.pnl >= 0 ? 'text-primary' : 'text-destructive')}>{formatSignedUsd(point.pnl)}</p>
    </div>
  );
};

const LOG_COLORS = {
  sys: 'text-slate-400',
  info: 'text-sky-400',
  ok: 'text-emerald-400',
  warn: 'text-yellow-400',
  trade: 'text-violet-300',
  error: 'text-red-400',
};

// ─── Activity log (real engine output) ────────────────────────────────────────
function ActivityLog({ bot, className }) {
  const logRef = useRef(null);
  const lines = Array.isArray(bot.activity_log) ? bot.activity_log : [];

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines.length]);

  return (
    <div className={cn('flex flex-col h-full bg-[#0d1117] border-[#21262d] overflow-hidden', className)}>
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#161b22] border-b border-[#21262d] flex-shrink-0">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <span className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex items-center gap-1.5 ml-2 min-w-0">
          <Terminal className="w-3 h-3 text-slate-500 flex-shrink-0" />
          <span className="text-[11px] font-mono text-slate-400 truncate">engine — {bot.name}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className={cn('w-1.5 h-1.5 rounded-full', bot.status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500')} />
          <span className="text-[10px] font-mono text-slate-400 uppercase">{bot.status}</span>
        </div>
      </div>
      <div ref={logRef} className="flex-1 overflow-y-auto p-4 space-y-0.5 font-mono text-[11px] leading-relaxed">
        <p className="text-slate-600 mb-2 select-none">
          {'>'} polybot engine {bot.engine_version || '2.x'} — {bot.ticks || 0} ticks, {bot.markets_scanned || 0} markets in last scan
        </p>
        {lines.length === 0 && <p className="text-slate-500">Waiting for the first engine tick…</p>}
        {lines.map((line, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-slate-600 flex-shrink-0 select-none">[{line.t ? format(new Date(line.t), 'HH:mm:ss') : '--:--:--'}]</span>
            <span className={LOG_COLORS[line.type] || 'text-slate-300'}>{line.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Positions ────────────────────────────────────────────────────────────────
function PositionRow({ trade }) {
  const isOpen = trade.status === 'open';
  const pnl = isOpen ? Number(trade.unrealized_pnl) || 0 : Number(trade.pnl) || 0;
  const positive = pnl >= 0;
  const mark = isOpen ? trade.current_price : trade.exit_price;
  return (
    <div className="px-3 py-2 text-xs hover:bg-secondary/30 transition-colors">
      <div className="flex items-center gap-2">
        <span className={cn('w-8 flex-shrink-0 font-bold font-mono', trade.outcome === 'YES' ? 'text-primary' : 'text-destructive')}>{trade.outcome}</span>
        <a
          href={trade.market_url || '#'}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          className="flex-1 min-w-0 text-foreground/80 truncate hover:text-foreground hover:underline"
          title={trade.market_name}
        >
          {trade.market_name}
        </a>
        <span className="w-14 text-right font-mono text-foreground/70 flex-shrink-0 hidden sm:block">{Number(trade.quantity || 0).toFixed(1)}</span>
        <span className="w-12 text-right font-mono text-foreground/70 flex-shrink-0">{formatCents(trade.entry_price)}</span>
        <span className="w-14 text-right font-mono flex-shrink-0 flex items-center justify-end gap-1">
          {isOpen && (
            <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
            </span>
          )}
          <span className={isOpen ? 'text-primary/80' : 'text-muted-foreground'}>{formatCents(mark)}</span>
        </span>
        <span className={cn('w-16 text-right font-mono font-bold flex-shrink-0', positive ? 'text-primary' : 'text-destructive')}>{formatSignedUsd(pnl)}</span>
      </div>
      <div className="flex items-center gap-2 mt-0.5 pl-10 text-[10px] text-muted-foreground/70 truncate">
        <span>{trade.timestamp ? format(new Date(trade.timestamp), 'MMM d HH:mm') : ''}</span>
        {trade.edge_at_entry != null && <span>edge {Number(trade.edge_at_entry) >= 0 ? '+' : ''}{Number(trade.edge_at_entry).toFixed(1)}%</span>}
        {trade.signal_reason && <span className="truncate">· {trade.signal_reason}</span>}
        {!isOpen && trade.exit_reason && <span className="truncate">· closed: {trade.exit_reason}</span>}
      </div>
    </div>
  );
}

function PositionsTable({ title, trades, emptyText }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
        {title} {trades.length > 0 ? `(${trades.length})` : ''}
      </p>
      {trades.length === 0 ? (
        <div className="text-center py-6 text-xs text-muted-foreground bg-secondary/30 rounded-xl">{emptyText}</div>
      ) : (
        <div className="rounded-xl overflow-hidden border border-border">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            <span className="w-8 flex-shrink-0">Side</span>
            <span className="flex-1 min-w-0">Market</span>
            <span className="w-14 text-right flex-shrink-0 hidden sm:block">Shares</span>
            <span className="w-12 text-right flex-shrink-0">Entry</span>
            <span className="w-14 text-right flex-shrink-0">Mark</span>
            <span className="w-16 text-right flex-shrink-0">P&L</span>
          </div>
          <div className="divide-y divide-border max-h-64 overflow-y-auto">
            {trades.map(trade => (
              <PositionRow key={trade.id} trade={trade} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AI brief (optional, uses Base44's LLM integration) ───────────────────────
function AiBrief({ bot, openTrades, closedTrades }) {
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const positions = openTrades
        .map(t => `${t.outcome} ${t.quantity} shares of "${t.market_name}" bought at ${formatCents(t.entry_price)}, now ${formatCents(t.current_price)} (${formatSignedUsd(t.unrealized_pnl)}) — signal: ${t.signal_reason || t.signal}`)
        .join('\n');
      const closed = closedTrades
        .slice(0, 10)
        .map(t => `${t.outcome} "${t.market_name}" ${formatCents(t.entry_price)} → ${formatCents(t.exit_price)} (${formatSignedUsd(t.pnl)}, ${t.exit_reason})`)
        .join('\n');
      const prompt = `You are reviewing a ${bot.is_paper ? 'paper-trading' : 'simulated'} Polymarket bot run named "${bot.name}" using the ${bot.algorithm} strategy on categories ${(bot.categories || ['all']).join(', ')}.
Allocation $${bot.fund_allocation}. Current P&L ${formatSignedUsd(bot.pnl)} (realized ${formatSignedUsd(bot.realized_pnl)}, unrealized ${formatSignedUsd(bot.unrealized_pnl)}). ${bot.positions_bought || 0} positions opened, ${bot.positions_sold || 0} closed.

Open positions:
${positions || '(none)'}

Recently closed:
${closed || '(none)'}

In under 150 words and plain language: 1) what the bot is currently exposed to, 2) the biggest risk in the open positions, 3) one concrete suggestion for the next run (parameters, categories, or risk settings). Do not invent data.`;
      const result = await base44.integrations.Core.InvokeLLM({ prompt });
      setBrief(typeof result === 'string' ? result : JSON.stringify(result));
    } catch (err) {
      toast.error(err?.message || 'AI brief failed');
    } finally {
      setLoading(false);
    }
  };

  if (isDemoMode()) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">AI Brief</p>
        <p className="text-[11px] text-muted-foreground/70">Off in the demo because it spends LLM credits. The full version asks Base44's LLM to sum up exposure and risk from the positions above.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">AI Brief</p>
        <Button size="sm" variant="outline" className="h-7 text-xs border-fuchsia-500/30 text-fuchsia-300 hover:bg-fuchsia-500/10" onClick={run} disabled={loading}>
          {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          <span className="ml-1.5">{brief ? 'Refresh' : 'Analyze this run'}</span>
        </Button>
      </div>
      {brief ? (
        <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-3 text-xs text-foreground/85 whitespace-pre-wrap leading-relaxed">{brief}</div>
      ) : (
        <p className="text-[11px] text-muted-foreground/70">Asks the Base44 LLM integration to summarize exposure and risk from the real positions above.</p>
      )}
    </div>
  );
}

// ─── Main modal ──────────────────────────────────────────────────────────────
export default function BotDetailModal({ bot, trades, open, onClose, onTick }) {
  if (!bot) return null;

  const pnl = Number(bot.pnl) || 0;
  const isPositive = pnl >= 0;
  const elapsed = bot.start_time ? formatDistanceToNowStrict(new Date(bot.start_time)) : '—';
  const botTrades = trades.filter(t => t.bot_run_id === bot.id);
  const openTrades = botTrades.filter(t => t.status === 'open');
  const closedTrades = botTrades.filter(t => t.status !== 'open').sort((a, b) => new Date(b.exit_time || 0) - new Date(a.exit_time || 0));
  const history = (Array.isArray(bot.pnl_history) ? bot.pnl_history : [])
    .map(p => ({ t: Date.parse(p.time), pnl: Number(p.pnl) || 0 }))
    .filter(p => Number.isFinite(p.t));
  const spansDays = history.length > 1 && history[history.length - 1].t - history[0].t > 36 * 3_600_000;
  const risk = [
    bot.kelly_fraction != null && `Kelly ${bot.kelly_fraction === 0.25 ? '¼' : bot.kelly_fraction === 0.5 ? '½' : bot.kelly_fraction === 0.75 ? '¾' : '1×'}`,
    bot.order_type,
    bot.max_positions != null && `max ${bot.max_positions} pos`,
    bot.stop_loss_pct != null && `SL ${bot.stop_loss_pct}%`,
    bot.take_profit_pct != null && `TP ${bot.take_profit_pct}%`,
    bot.max_position_pct != null && `≤${bot.max_position_pct}%/pos`,
    bot.neg_risk && 'NegRisk',
  ].filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[98vw] max-w-5xl max-h-[92vh] bg-card border-border p-0 overflow-hidden flex flex-col">
        <DialogTitle className="sr-only">{bot.name}</DialogTitle>

        {/* Top bar */}
        <div className="flex items-center gap-3 px-5 py-2.5 bg-secondary/40 border-b border-border flex-shrink-0 text-xs">
          <span className="text-muted-foreground">Execution:</span>
          <span className={bot.is_paper ? 'text-violet-300' : 'text-amber-300'}>
            {bot.is_paper ? 'paper trading on live market prices' : 'live market data, simulated fills (no signer connected)'}
          </span>
          {bot.last_error && <span className="text-destructive ml-auto truncate">⚠ {bot.last_error}</span>}
          {!bot.last_error && bot.last_tick_at && (
            <span className="text-muted-foreground/60 ml-auto hidden sm:block">last tick {formatDistanceToNowStrict(new Date(bot.last_tick_at))} ago</span>
          )}
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: live activity log */}
          <div className="hidden md:flex flex-col w-5/12 min-h-0 border-r border-border">
            <ActivityLog bot={bot} />
          </div>

          {/* Right: stats, chart, positions */}
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <div className="px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold text-foreground">{bot.name}</h2>
                    <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                      {ALGORITHM_LABELS[bot.algorithm] || bot.algorithm}
                    </Badge>
                    <FillModeBadge bot={bot} />
                    <Badge
                      variant="outline"
                      className={cn('text-xs', bot.status === 'running' ? 'border-primary/30 bg-primary/5 text-primary' : 'border-yellow-500/30 text-yellow-500')}
                    >
                      {bot.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span className="font-mono">${Number(bot.fund_allocation || 0).toFixed(0)} USDC</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {elapsed}
                      {bot.duration_hours ? ` / ${bot.duration_hours}h` : ''}
                    </span>
                    {bot.categories && <span>{bot.categories.join(', ')}</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={cn('text-xl font-mono font-bold flex items-center gap-1 justify-end', isPositive ? 'text-primary' : 'text-destructive')}>
                    {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    {formatSignedUsd(pnl)}
                  </div>
                  <div className={cn('text-xs font-mono', isPositive ? 'text-primary/70' : 'text-destructive/70')}>
                    {bot.pnl_percent ? `${isPositive ? '+' : ''}${Number(bot.pnl_percent).toFixed(1)}%` : '0.0%'}
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground/70 mt-0.5">
                    {formatSignedUsd(bot.realized_pnl)} realized · {formatSignedUsd(bot.unrealized_pnl)} open
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-secondary/50 border border-border rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Value</p>
                  <p className="text-sm font-mono font-semibold text-foreground mt-0.5">${(Number(bot.current_value) || Number(bot.fund_allocation) || 0).toFixed(2)}</p>
                </div>
                <div className="bg-secondary/50 border border-border rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Open / Closed</p>
                  <p className="text-sm font-mono font-semibold text-foreground mt-0.5">
                    {openTrades.length} / {closedTrades.length}
                  </p>
                </div>
                <div className="bg-secondary/50 border border-border rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Avg Edge at Entry</p>
                  <p className={cn('text-sm font-mono font-semibold mt-0.5', (Number(bot.avg_edge) || 0) >= 0 ? 'text-primary' : 'text-destructive')}>
                    {bot.avg_edge != null ? `${Number(bot.avg_edge) > 0 ? '+' : ''}${Number(bot.avg_edge).toFixed(1)}%` : '—'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 items-center">
                {risk.map(tag => (
                  <span key={tag} className="text-xs font-mono px-2 py-1 rounded-md bg-secondary border border-border text-muted-foreground">
                    {tag}
                  </span>
                ))}
                {bot.status === 'running' && onTick && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-sky-400 hover:text-sky-300 ml-auto" onClick={() => onTick(bot)}>
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Tick now
                  </Button>
                )}
              </div>

              {history.length > 1 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">P&L Over Time</p>
                  <div className="h-36 bg-secondary/30 rounded-xl p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={history} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="modalPnlGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={isPositive ? 'hsl(142,71%,45%)' : 'hsl(0,72%,51%)'} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={isPositive ? 'hsl(142,71%,45%)' : 'hsl(0,72%,51%)'} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,14%)" />
                        <XAxis
                          dataKey="t"
                          type="number"
                          domain={['dataMin', 'dataMax']}
                          scale="time"
                          tickFormatter={t => format(t, spansDays ? 'MMM d' : 'HH:mm')}
                          tick={{ fontSize: 10, fill: 'hsl(215,14%,50%)' }}
                          axisLine={false}
                          tickLine={false}
                          minTickGap={40}
                        />
                        <YAxis tick={{ fontSize: 10, fill: 'hsl(215,14%,50%)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={60} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="pnl"
                          stroke={isPositive ? 'hsl(142,71%,45%)' : 'hsl(0,72%,51%)'}
                          strokeWidth={2}
                          fill="url(#modalPnlGrad)"
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <PositionsTable title="Open positions" trades={openTrades} emptyText="No open positions. Marks use the current bid, so new buys start slightly negative by the spread." />
              <PositionsTable title="Closed trades" trades={closedTrades} emptyText="No closed trades yet." />

              <AiBrief bot={bot} openTrades={openTrades} closedTrades={closedTrades} />

              <div className="md:hidden">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Activity Log</p>
                <div className="h-64 rounded-xl overflow-hidden border border-[#21262d]">
                  <ActivityLog bot={bot} />
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                <ExternalLink className="w-3 h-3" />
                Market names link to Polymarket. Prices come from the Gamma and CLOB public APIs.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

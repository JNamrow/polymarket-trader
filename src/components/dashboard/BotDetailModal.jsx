import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { FlaskConical, Clock, TrendingUp, TrendingDown, Terminal, Cpu, DollarSign } from 'lucide-react';
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

function generateTerminalLog(bot) {
  const algo = bot.algorithm || 'momentum';
  const cats = bot.categories?.join(', ') || 'all';
  const fund = bot.fund_allocation || 100;
  const kelly = bot.kelly_fraction || 0.25;
  const orderType = bot.order_type || 'GTC';

  const lines = [
    { t: '00:00:01', type: 'sys',  msg: `Initializing bot run "${bot.name}"` },
    { t: '00:00:01', type: 'sys',  msg: `Algorithm: ${algo} | Categories: ${cats}` },
    { t: '00:00:02', type: 'info', msg: `Fetching CLOB orderbook snapshot...` },
    { t: '00:00:03', type: 'ok',   msg: `Orderbook loaded — 142 active markets` },
    { t: '00:00:04', type: 'info', msg: `Running sentiment filter on market corpus` },
    { t: '00:00:05', type: 'llm',  msg: `[GPT-4o] Evaluating top 20 markets by edge score` },
    { t: '00:00:07', type: 'ok',   msg: `Edge threshold: 0.04 | Markets qualified: 7` },
    { t: '00:00:08', type: 'info', msg: `Applying Kelly sizing: fraction=${kelly}` },
    { t: '00:00:09', type: 'info', msg: `Computing position sizes for $${fund.toFixed(0)} USDC` },
    { t: '00:00:10', type: 'llm',  msg: `[Claude-3] Cross-checking NLP signals vs market prices` },
    { t: '00:00:12', type: 'ok',   msg: `Signal confidence: HIGH on 3 markets` },
    { t: '00:00:13', type: 'trade',msg: `BUY YES 42 @ $0.340 — "Will BTC hit $100k by EOY?"` },
    { t: '00:00:13', type: 'info', msg: `Order type: ${orderType} | Submitted to CLOB` },
    { t: '00:00:14', type: 'ok',   msg: `Fill confirmed: 42 shares @ $0.340 ($14.28 USDC)` },
    { t: '00:00:16', type: 'trade',msg: `BUY YES 18 @ $0.610 — "Fed rate cut in Q1 2026?"` },
    { t: '00:00:17', type: 'ok',   msg: `Fill confirmed: 18 shares @ $0.610 ($10.98 USDC)` },
    { t: '00:00:20', type: 'llm',  msg: `[GPT-4o] Re-evaluating tail markets for arb opportunity` },
    { t: '00:00:22', type: 'warn', msg: `VPIN elevated (0.78) on crypto markets — reducing size` },
    { t: '00:00:24', type: 'info', msg: `Monitoring open positions for exit conditions...` },
    { t: '00:00:31', type: 'info', msg: `Position 1 drift: +$0.022 unrealized` },
    { t: '00:00:45', type: 'llm',  msg: `[GPT-4o] Exit signal triggered — edge degraded below threshold` },
    { t: '00:00:46', type: 'trade',msg: `SELL YES 42 @ $0.371 — "Will BTC hit $100k by EOY?"` },
    { t: '00:00:46', type: 'ok',   msg: `Fill confirmed: $15.58 USDC (+$1.30 PnL)` },
    { t: '00:00:50', type: 'info', msg: `Scanning next evaluation cycle...` },
    { t: '00:01:02', type: 'llm',  msg: `[Claude-3] Parsing new resolution probabilities` },
    { t: '00:01:05', type: 'ok',   msg: `3 new markets qualify post-rescan` },
    { t: '00:01:06', type: 'trade',msg: `BUY NO 55 @ $0.290 — "SpaceX Starship orbital success?"` },
    { t: '00:01:07', type: 'ok',   msg: `Fill confirmed: 55 shares @ $0.290 ($15.95 USDC)` },
    { t: '00:01:20', type: 'info', msg: `All positions active — monitoring...` },
  ];
  return lines;
}

function generateLLMCalls(bot) {
  return [
    { model: 'gpt-4o',     purpose: 'Market evaluation & edge scoring',   tokens_in: 3820, tokens_out: 412, cost: 0.0231 },
    { model: 'claude-3',   purpose: 'NLP signal cross-validation',         tokens_in: 2140, tokens_out: 290, cost: 0.0148 },
    { model: 'gpt-4o',     purpose: 'Exit signal detection',               tokens_in: 1950, tokens_out: 180, cost: 0.0118 },
    { model: 'claude-3',   purpose: 'Resolution probability parsing',       tokens_in: 2600, tokens_out: 320, cost: 0.0162 },
  ];
}

// ─── Terminal panel ──────────────────────────────────────────────────────────
function TerminalPanel({ bot }) {
  const logRef = useRef(null);
  const [visibleLines, setVisibleLines] = useState([]);
  const allLines = generateTerminalLog(bot);

  useEffect(() => {
    setVisibleLines([]);
    let i = 0;
    const interval = setInterval(() => {
      if (i < allLines.length) {
        setVisibleLines(prev => [...prev, allLines[i]]);
        i++;
      } else {
        clearInterval(interval);
      }
    }, 60);
    return () => clearInterval(interval);
  }, [bot.id]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [visibleLines]);

  const color = {
    sys:   'text-slate-400',
    info:  'text-sky-400',
    ok:    'text-emerald-400',
    warn:  'text-yellow-400',
    trade: 'text-violet-300',
    llm:   'text-fuchsia-400',
  };

  return (
    <div className="flex flex-col h-full bg-[#0d1117] border-r border-[#21262d] rounded-l-xl overflow-hidden">
      {/* terminal title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#161b22] border-b border-[#21262d] flex-shrink-0">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <span className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          <Terminal className="w-3 h-3 text-slate-500" />
          <span className="text-[11px] font-mono text-slate-400">bot-activity — {bot.name}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-mono text-emerald-400">LIVE</span>
        </div>
      </div>

      {/* log lines */}
      <div ref={logRef} className="flex-1 overflow-y-auto p-4 space-y-0.5 font-mono text-[11px] leading-relaxed">
        <p className="text-slate-600 mb-2 select-none">{'>'} bot-runtime v2.4.1 — polymarket CLOB interface</p>
        {visibleLines.map((line, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-slate-600 flex-shrink-0 select-none">[{line.t}]</span>
            <span className={color[line.type] || 'text-slate-300'}>{line.msg}</span>
          </div>
        ))}
        {visibleLines.length < allLines.length && (
          <div className="flex gap-2 mt-1">
            <span className="text-slate-600 select-none">{'>'}</span>
            <span className="w-2 h-3.5 bg-emerald-400 animate-pulse inline-block" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LLM tracker ────────────────────────────────────────────────────────────
function LLMTracker({ bot }) {
  const calls = generateLLMCalls(bot);
  const totalCost = calls.reduce((s, c) => s + c.cost, 0);
  const totalTokens = calls.reduce((s, c) => s + c.tokens_in + c.tokens_out, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">LLM Usage</p>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground">{totalTokens.toLocaleString()} tokens</span>
          <span className="text-xs font-mono font-semibold text-amber-400">${totalCost.toFixed(4)}</span>
        </div>
      </div>
      <div className="rounded-xl overflow-hidden border border-border divide-y divide-border">
        {calls.map((c, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2 bg-secondary/30 text-xs">
            <Cpu className="w-3 h-3 text-fuchsia-400 flex-shrink-0" />
            <span className="font-mono text-fuchsia-300 w-20 flex-shrink-0">{c.model}</span>
            <span className="text-muted-foreground flex-1 min-w-0 truncate">{c.purpose}</span>
            <span className="font-mono text-muted-foreground/60 flex-shrink-0">{(c.tokens_in + c.tokens_out).toLocaleString()}t</span>
            <span className="font-mono text-amber-400 flex-shrink-0 w-14 text-right">${c.cost.toFixed(4)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main modal ──────────────────────────────────────────────────────────────
export default function BotDetailModal({ bot, trades, open, onClose }) {
  if (!bot) return null;

  const pnl = bot.pnl || 0;
  const isPositive = pnl >= 0;
  const elapsed = bot.start_time ? formatDistanceToNow(new Date(bot.start_time), { addSuffix: false }) : '—';
  const botTrades = trades.filter(t => t.bot_run_id === bot.id);
  const pnlHistory = bot.pnl_history || [];

  const llmCalls = generateLLMCalls(bot);
  const totalApiSpend = llmCalls.reduce((s, c) => s + c.cost, 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[98vw] max-w-5xl max-h-[92vh] bg-card border-border p-0 overflow-hidden flex flex-col">

        {/* ── Top bar: API spend ── */}
        <div className="flex items-center gap-3 px-5 py-2.5 bg-amber-500/5 border-b border-amber-500/20 flex-shrink-0">
          <DollarSign className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span className="text-xs text-muted-foreground">Total API spend this run</span>
          <span className="text-xs font-mono font-bold text-amber-400">${totalApiSpend.toFixed(4)} USD</span>
          <span className="text-xs text-muted-foreground/50 ml-auto hidden sm:block">across {llmCalls.length} LLM calls</span>
        </div>

        {/* ── Body: two-panel ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left: Terminal — hidden on very small mobile, shown md+ */}
          <div className="hidden md:flex flex-col w-1/2 min-h-0">
            <TerminalPanel bot={bot} />
          </div>

          {/* Right: Stats + trades */}
          <div className="flex-1 md:w-1/2 flex flex-col min-h-0 overflow-y-auto">
            {/* header */}
            <div className="px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold text-foreground">{bot.name}</h2>
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
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span className="font-mono">${bot.fund_allocation?.toFixed(0)} USDC</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{elapsed}</span>
                    {bot.categories && <span>{bot.categories.join(', ')}</span>}
                  </div>
                </div>
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
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Stats strip */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-secondary/50 border border-border rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Portfolio Value</p>
                  <p className="text-sm font-mono font-semibold text-foreground mt-0.5">
                    ${(bot.current_value || bot.fund_allocation || 0).toFixed(2)}
                  </p>
                </div>
                <div className="bg-secondary/50 border border-border rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Open / Closed</p>
                  <p className="text-sm font-mono font-semibold text-foreground mt-0.5">{bot.positions_bought || 0} / {bot.positions_sold || 0}</p>
                </div>
                <div className="bg-secondary/50 border border-border rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Avg Edge</p>
                  <p className={cn("text-sm font-mono font-semibold mt-0.5", (bot.avg_edge || 0) >= 0 ? "text-primary" : "text-destructive")}>
                    {bot.avg_edge != null ? `${bot.avg_edge > 0 ? '+' : ''}${bot.avg_edge.toFixed(1)}%` : '—'}
                  </p>
                </div>
              </div>

              {/* Config tags */}
              <div className="flex flex-wrap gap-1.5">
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
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">P&L Over Time</p>
                  <div className="h-36 bg-secondary/30 rounded-xl p-2">
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
                        <Area type="monotone" dataKey="pnl" stroke={isPositive ? 'hsl(142,71%,45%)' : 'hsl(0,72%,51%)'} strokeWidth={2} fill="url(#modalPnlGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* LLM tracker */}
              <LLMTracker bot={bot} />

              {/* Trades */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Trades {botTrades.length > 0 ? `(${botTrades.length})` : ''}
                </p>
                {botTrades.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground bg-secondary/30 rounded-xl">
                    No trades recorded for this run yet.
                  </div>
                ) : (
                  <>
                    {/* Desktop table */}
                    <div className="hidden sm:block rounded-xl overflow-hidden border border-border">
                      <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        <span className="w-10 flex-shrink-0">Side</span>
                        <span className="flex-1 min-w-0">Market</span>
                        <span className="w-8 text-right flex-shrink-0">Qty</span>
                        <span className="w-14 text-right flex-shrink-0">Entry</span>
                        <span className="w-20 text-right flex-shrink-0">Exit / Current</span>
                        <span className="w-16 text-right flex-shrink-0">P&L</span>
                        <span className="w-10 text-right flex-shrink-0">Time</span>
                      </div>
                      <div className="divide-y divide-border">
                        {botTrades.map(trade => {
                          const tradePnl = trade.pnl || 0;
                          const tradePositive = tradePnl >= 0;
                          const isBuy = trade.side === 'buy';
                          const isOpen = trade.status === 'open' || !trade.exit_price;
                          const tradeTime = trade.timestamp ? format(new Date(trade.timestamp), 'HH:mm') : '—';
                          return (
                            <div key={trade.id} className="flex items-center gap-2 px-4 py-2.5 text-xs hover:bg-secondary/30 transition-colors">
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
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
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
                              <span className="w-10 flex-shrink-0 font-mono text-muted-foreground/50 text-right text-[10px]">{tradeTime}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Mobile cards */}
                    <div className="sm:hidden space-y-2">
                      {botTrades.map(trade => {
                        const tradePnl = trade.pnl || 0;
                        const tradePositive = tradePnl >= 0;
                        const isBuy = trade.side === 'buy';
                        const isOpen = trade.status === 'open' || !trade.exit_price;
                        const tradeTime = trade.timestamp ? format(new Date(trade.timestamp), 'HH:mm') : '—';
                        return (
                          <div key={trade.id} className="bg-secondary/40 border border-border rounded-lg px-3 py-2.5 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className={cn("text-xs font-bold font-mono", isBuy ? "text-primary" : "text-destructive")}>{isBuy ? 'BUY' : 'SELL'}</span>
                              <span className="text-[10px] font-mono text-muted-foreground/50">{tradeTime}</span>
                            </div>
                            <p className="text-xs text-foreground/80 truncate">{trade.market_name}</p>
                            <div className="flex items-center justify-between text-xs font-mono">
                              <div className="flex gap-3 text-muted-foreground">
                                <span>Entry: {trade.entry_price != null ? `$${trade.entry_price.toFixed(3)}` : '—'}</span>
                                <span className="flex items-center gap-1">
                                  {isOpen ? (
                                    <>
                                      <span className="relative flex h-1.5 w-1.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                                      </span>
                                      <span className="text-primary/80">{trade.entry_price != null ? `$${trade.entry_price.toFixed(3)}` : 'live'}</span>
                                    </>
                                  ) : (
                                    <span>Exit: ${trade.exit_price?.toFixed(3)}</span>
                                  )}
                                </span>
                              </div>
                              <span className={cn("font-bold", tradePositive ? "text-primary" : "text-destructive")}>
                                {tradePositive ? '+' : ''}${tradePnl.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Mobile terminal (shown below on small screens) */}
              <div className="md:hidden">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Activity Log</p>
                <div className="h-64 rounded-xl overflow-hidden border border-[#21262d]">
                  <TerminalPanel bot={bot} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
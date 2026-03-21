import React, { useState } from 'react';
import { ChevronDown, ChevronRight, History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const algorithmLabels = {
  momentum: 'Momentum',
  mean_reversion: 'Mean Rev.',
  arbitrage: 'Arbitrage',
  sentiment: 'Sentiment',
  custom: 'Custom',
};

function TradeRow({ trade }) {
  const pnl = trade.pnl || 0;
  const isPositive = pnl >= 0;

  return (
    <div className="flex items-center gap-4 px-4 py-2 text-xs bg-muted/50 border-l-2 border-border ml-4">
      <span className="text-muted-foreground w-40 truncate">{trade.market_name}</span>
      <Badge variant="outline" className={cn(
        "text-xs",
        trade.side === 'buy' ? "text-primary border-primary/30" : "text-destructive border-destructive/30"
      )}>
        {trade.side?.toUpperCase()}
      </Badge>
      <span className="font-mono text-muted-foreground">Entry: ${trade.entry_price?.toFixed(3)}</span>
      <span className="font-mono text-muted-foreground">Exit: ${trade.exit_price?.toFixed(3) || '—'}</span>
      <span className="font-mono text-muted-foreground">Qty: {trade.quantity}</span>
      <span className={cn("font-mono font-medium ml-auto", isPositive ? "text-primary" : "text-destructive")}>
        {isPositive ? '+' : ''}${pnl.toFixed(2)}
      </span>
    </div>
  );
}

function RunRow({ run, trades }) {
  const [expanded, setExpanded] = useState(false);
  const pnl = run.pnl || 0;
  const isPositive = pnl >= 0;
  const runTrades = trades.filter(t => t.bot_run_id === run.id);
  const duration = run.start_time && run.end_time
    ? `${Math.round((new Date(run.end_time) - new Date(run.start_time)) / 3600000)}h`
    : '—';

  return (
    <div>
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <button className="text-muted-foreground flex-shrink-0">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <span className="text-xs font-mono text-muted-foreground w-16 flex-shrink-0">#{run.id?.slice(-6)}</span>
        <Badge variant="outline" className="text-xs border-border text-muted-foreground flex-shrink-0">
          {algorithmLabels[run.algorithm] || run.algorithm}
        </Badge>
        <span className="text-xs text-muted-foreground flex-shrink-0">{run.categories?.join(', ') || '—'}</span>
        <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
          {run.start_time ? format(new Date(run.start_time), 'MMM d, HH:mm') : '—'}
        </span>
        <span className="text-xs text-muted-foreground font-mono flex-shrink-0">{duration}</span>
        <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
          B:{run.positions_bought || 0} / S:{run.positions_sold || 0}
        </span>
        <span className={cn(
          "text-sm font-mono font-semibold ml-auto",
          isPositive ? "text-primary" : "text-destructive"
        )}>
          {isPositive ? '+' : ''}${pnl.toFixed(2)}
        </span>
        <Badge variant="outline" className={cn(
          "text-xs flex-shrink-0",
          run.status === 'completed' ? "text-primary border-primary/30" : "text-destructive border-destructive/30"
        )}>
          {run.status}
        </Badge>
      </div>
      {expanded && runTrades.length > 0 && (
        <div className="space-y-px pb-2">
          {runTrades.map((trade) => (
            <TradeRow key={trade.id} trade={trade} />
          ))}
        </div>
      )}
      {expanded && runTrades.length === 0 && (
        <div className="px-8 py-3 text-xs text-muted-foreground">No trade records for this run.</div>
      )}
    </div>
  );
}

export default function CompletedRuns({ runs, trades }) {
  const totalPnl = runs.reduce((sum, r) => sum + (r.pnl || 0), 0);
  const isPositive = totalPnl >= 0;

  if (runs.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-foreground">Completed Runs</h3>
          <History className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-muted-foreground">No completed runs yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-4 lg:p-5 border-b border-border">
        <h3 className="text-sm font-medium text-foreground">Completed Runs</h3>
        <span className={cn("text-sm font-mono font-semibold", isPositive ? "text-primary" : "text-destructive")}>
          Total: {isPositive ? '+' : ''}${totalPnl.toFixed(2)}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 text-xs text-muted-foreground">
        <span className="w-4 flex-shrink-0" />
        <span className="w-16 flex-shrink-0">Run ID</span>
        <span className="flex-shrink-0">Algorithm</span>
        <span className="flex-shrink-0">Category</span>
        <span className="flex-shrink-0">Start</span>
        <span className="flex-shrink-0">Duration</span>
        <span className="flex-shrink-0">Positions</span>
        <span className="ml-auto">P&L</span>
        <span className="flex-shrink-0">Status</span>
      </div>

      <div className="divide-y divide-border">
        {runs.map(run => (
          <RunRow key={run.id} run={run} trades={trades} />
        ))}
      </div>
    </div>
  );
}
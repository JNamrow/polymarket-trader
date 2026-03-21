import React, { useState } from 'react';
import { History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import BotDetailModal from './BotDetailModal';

const algorithmLabels = {
  momentum: 'Momentum',
  mean_reversion: 'Mean Rev.',
  arbitrage: 'Arbitrage',
  sentiment: 'Sentiment',
  custom: 'Custom',
};

function RunRow({ run, onClick }) {
  const pnl = run.pnl || 0;
  const isPositive = pnl >= 0;
  const duration = run.start_time && run.end_time
    ? `${Math.round((new Date(run.end_time) - new Date(run.start_time)) / 3600000)}h`
    : '—';

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <span className="text-xs font-mono text-muted-foreground w-16 flex-shrink-0">#{run.id?.slice(-6)}</span>
      <Badge variant="outline" className="text-xs border-border text-muted-foreground flex-shrink-0">
        {algorithmLabels[run.algorithm] || run.algorithm}
      </Badge>
      <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:block">{run.categories?.join(', ') || '—'}</span>
      <span className="text-xs text-muted-foreground font-mono flex-shrink-0 hidden md:block">
        {run.start_time ? format(new Date(run.start_time), 'MMM d, HH:mm') : '—'}
      </span>
      <span className="text-xs text-muted-foreground font-mono flex-shrink-0">{duration}</span>
      <span className="text-xs text-muted-foreground font-mono flex-shrink-0 hidden sm:block">
        B:{run.positions_bought || 0} / S:{run.positions_sold || 0}
      </span>
      <span className={cn('text-sm font-mono font-semibold ml-auto', isPositive ? 'text-primary' : 'text-destructive')}>
        {isPositive ? '+' : ''}${pnl.toFixed(2)}
      </span>
      <Badge variant="outline" className={cn(
        'text-xs flex-shrink-0',
        run.status === 'completed' ? 'text-primary border-primary/30' : 'text-destructive border-destructive/30'
      )}>
        {run.status}
      </Badge>
    </div>
  );
}

export default function CompletedRuns({ runs, trades }) {
  const [selectedRun, setSelectedRun] = useState(null);
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
    <>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 lg:p-5 border-b border-border">
          <h3 className="text-sm font-medium text-foreground">Completed Runs</h3>
          <span className={cn('text-sm font-mono font-semibold', isPositive ? 'text-primary' : 'text-destructive')}>
            Total: {isPositive ? '+' : ''}${totalPnl.toFixed(2)}
          </span>
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 text-xs text-muted-foreground">
          <span className="w-16 flex-shrink-0">Run ID</span>
          <span className="flex-shrink-0">Algorithm</span>
          <span className="flex-shrink-0 hidden sm:block">Category</span>
          <span className="flex-shrink-0 hidden md:block">Start</span>
          <span className="flex-shrink-0">Duration</span>
          <span className="flex-shrink-0 hidden sm:block">Positions</span>
          <span className="ml-auto">P&L</span>
          <span className="flex-shrink-0">Status</span>
        </div>

        <div className="divide-y divide-border">
          {runs.map(run => (
            <RunRow key={run.id} run={run} onClick={() => setSelectedRun(run)} />
          ))}
        </div>
      </div>

      <BotDetailModal
        bot={selectedRun}
        trades={trades}
        open={!!selectedRun}
        onClose={() => setSelectedRun(null)}
      />
    </>
  );
}
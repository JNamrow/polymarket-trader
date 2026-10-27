import React, { useState } from 'react';
import { History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import BotDetailModal from './BotDetailModal';
import { ALGORITHM_LABELS, FillModeBadge } from './LiveBots';
import { formatSignedUsd } from '@/api/polymarket';

function runDuration(run) {
  if (!run.start_time || !run.end_time) return '—';
  const hours = (new Date(run.end_time) - new Date(run.start_time)) / 3_600_000;
  if (hours >= 48) return `${(hours / 24).toFixed(1)}d`;
  if (hours >= 1) return `${hours.toFixed(1)}h`;
  return `${Math.max(1, Math.round(hours * 60))}m`;
}

function RunRow({ run, onClick }) {
  const pnl = Number(run.pnl) || 0;
  const isPositive = pnl >= 0;

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors cursor-pointer" onClick={onClick}>
      <span className="text-xs font-mono text-muted-foreground w-24 flex-shrink-0 truncate" title={run.name}>
        {run.name || `#${run.id?.slice(-6)}`}
      </span>
      <Badge variant="outline" className="text-xs border-border text-muted-foreground flex-shrink-0">
        {ALGORITHM_LABELS[run.algorithm] || run.algorithm}
      </Badge>
      <FillModeBadge bot={run} className="hidden sm:flex" />
      <span className="text-xs text-muted-foreground flex-shrink-0 hidden lg:block">{run.categories?.join(', ') || '—'}</span>
      <span className="text-xs text-muted-foreground font-mono flex-shrink-0 hidden md:block">
        {run.start_time ? format(new Date(run.start_time), 'MMM d, HH:mm') : '—'}
      </span>
      <span className="text-xs text-muted-foreground font-mono flex-shrink-0">{runDuration(run)}</span>
      <span className="text-xs text-muted-foreground font-mono flex-shrink-0 hidden sm:block">
        B:{run.positions_bought || 0} / S:{run.positions_sold || 0}
      </span>
      <span className={cn('text-sm font-mono font-semibold ml-auto', isPositive ? 'text-primary' : 'text-destructive')}>{formatSignedUsd(pnl)}</span>
      <Badge
        variant="outline"
        className={cn('text-xs flex-shrink-0', run.status === 'completed' ? 'text-primary border-primary/30' : 'text-destructive border-destructive/30')}
      >
        {run.status}
      </Badge>
    </div>
  );
}

export default function CompletedRuns({ runs, trades }) {
  const [selectedRun, setSelectedRun] = useState(null);
  const totalPnl = runs.reduce((sum, r) => sum + (Number(r.pnl) || 0), 0);
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
            Total: {formatSignedUsd(totalPnl)}
          </span>
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 text-xs text-muted-foreground">
          <span className="w-24 flex-shrink-0">Run</span>
          <span className="flex-shrink-0">Algorithm</span>
          <span className="flex-shrink-0 hidden sm:block">Mode</span>
          <span className="flex-shrink-0 hidden lg:block">Categories</span>
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

      <BotDetailModal bot={selectedRun} trades={trades} open={!!selectedRun} onClose={() => setSelectedRun(null)} />
    </>
  );
}

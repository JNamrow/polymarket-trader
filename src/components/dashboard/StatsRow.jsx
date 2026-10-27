import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatUsd, formatSignedUsd } from '@/api/polymarket';

function StatCard({ label, value, subValue, icon: Icon, trend }) {
  const isPositive = trend === 'up';
  const isNegative = trend === 'down';

  return (
    <div className="bg-card border border-border rounded-xl p-4 lg:p-5">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
      <div className="space-y-1">
        <p className={cn('text-xl lg:text-2xl font-bold font-mono', isPositive && 'text-primary', isNegative && 'text-destructive', !trend && 'text-foreground')}>
          {value}
        </p>
        {subValue && (
          <div className="flex items-center gap-1">
            {isPositive && <TrendingUp className="w-3 h-3 text-primary" />}
            {isNegative && <TrendingDown className="w-3 h-3 text-destructive" />}
            <span className={cn('text-xs font-mono', isPositive && 'text-primary', isNegative && 'text-destructive', !trend && 'text-muted-foreground')}>
              {subValue}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StatsRow({ botRuns }) {
  const finished = botRuns.filter(r => r.status === 'completed' || r.status === 'stopped');
  const active = botRuns.filter(r => r.status === 'running' || r.status === 'paused');

  const totalPnl = botRuns.reduce((sum, r) => sum + (Number(r.pnl) || 0), 0);
  const totalAllocated = botRuns.reduce((sum, r) => sum + (Number(r.fund_allocation) || 0), 0);
  const pnlPercent = totalAllocated > 0 ? (totalPnl / totalAllocated) * 100 : 0;
  const currentValue = active.reduce((sum, r) => sum + (Number(r.current_value) || Number(r.fund_allocation) || 0), 0);
  const deployedLive = active.filter(r => !r.is_paper).reduce((sum, r) => sum + (Number(r.fund_allocation) || 0), 0);
  const deployedPaper = active.filter(r => r.is_paper).reduce((sum, r) => sum + (Number(r.fund_allocation) || 0), 0);
  const totalReturned = finished.reduce((sum, r) => sum + (Number(r.fund_allocation) || 0) + (Number(r.pnl) || 0), 0);
  const unrealized = active.reduce((sum, r) => sum + (Number(r.unrealized_pnl) || 0), 0);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
      <StatCard
        label="Total P&L"
        value={formatSignedUsd(totalPnl)}
        subValue={`${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}% on $${totalAllocated.toFixed(0)} allocated`}
        icon={TrendingUp}
        trend={totalPnl >= 0 ? 'up' : 'down'}
      />
      <StatCard
        label="Portfolio Value"
        value={formatUsd(currentValue)}
        subValue={`${active.length} active bot${active.length !== 1 ? 's' : ''} · ${formatSignedUsd(unrealized)} unrealized`}
        icon={Activity}
      />
      <StatCard
        label="Funds Deployed"
        value={formatUsd(deployedLive)}
        subValue={deployedPaper > 0 ? `+ ${formatUsd(deployedPaper)} in paper experiments` : 'Allocated to live bots'}
        icon={DollarSign}
      />
      <StatCard
        label="Total Returned"
        value={formatUsd(totalReturned)}
        subValue={`${finished.length} finished run${finished.length !== 1 ? 's' : ''}`}
        icon={Wallet}
      />
    </div>
  );
}

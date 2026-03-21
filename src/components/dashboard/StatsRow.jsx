import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

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
        <p className={cn(
          "text-xl lg:text-2xl font-bold font-mono",
          isPositive && "text-primary",
          isNegative && "text-destructive",
          !trend && "text-foreground"
        )}>
          {value}
        </p>
        {subValue && (
          <div className="flex items-center gap-1">
            {isPositive && <TrendingUp className="w-3 h-3 text-primary" />}
            {isNegative && <TrendingDown className="w-3 h-3 text-destructive" />}
            <span className={cn(
              "text-xs font-mono",
              isPositive && "text-primary",
              isNegative && "text-destructive",
              !trend && "text-muted-foreground"
            )}>
              {subValue}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StatsRow({ botRuns }) {
  const completedRuns = botRuns.filter(r => r.status === 'completed');
  const runningRuns = botRuns.filter(r => r.status === 'running' || r.status === 'paused');

  const totalPnl = botRuns.reduce((sum, r) => sum + (r.pnl || 0), 0);
  const totalDeployed = runningRuns.reduce((sum, r) => sum + (r.fund_allocation || 0), 0);
  const totalReturned = completedRuns.reduce((sum, r) => sum + (r.fund_allocation || 0) + (r.pnl || 0), 0);
  const currentValue = runningRuns.reduce((sum, r) => sum + (r.current_value || r.fund_allocation || 0), 0);
  const pnlPercent = botRuns.length > 0
    ? (totalPnl / botRuns.reduce((s, r) => s + (r.fund_allocation || 0), 0) * 100)
    : 0;

  const pnlTrend = totalPnl >= 0 ? 'up' : 'down';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
      <StatCard
        label="Total P&L"
        value={`${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`}
        subValue={`${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%`}
        icon={TrendingUp}
        trend={pnlTrend}
      />
      <StatCard
        label="Portfolio Value"
        value={`$${currentValue.toFixed(2)}`}
        subValue={`${runningRuns.length} active bot${runningRuns.length !== 1 ? 's' : ''}`}
        icon={Activity}
      />
      <StatCard
        label="Funds Deployed"
        value={`$${totalDeployed.toFixed(2)}`}
        subValue="Currently allocated"
        icon={DollarSign}
      />
      <StatCard
        label="Total Returned"
        value={`$${totalReturned.toFixed(2)}`}
        subValue={`${completedRuns.length} completed run${completedRuns.length !== 1 ? 's' : ''}`}
        icon={Wallet}
      />
    </div>
  );
}
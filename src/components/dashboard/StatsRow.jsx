import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatUsd, formatSignedUsd } from '@/api/polymarket';
import { demoFunds } from '@/engine/demo.js';

function StatCard({ label, value, subValue, trend }) {
  const isPositive = trend === 'up';
  const isNegative = trend === 'down';

  return (
    <div className="surface p-4 lg:p-5">
      <p className="text-xs text-muted-foreground mb-3">{label}</p>
      <div className="space-y-1">
        <p className={cn('text-xl lg:text-2xl font-medium font-mono', isPositive && 'text-primary', isNegative && 'text-destructive', !trend && 'text-foreground')}>
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

export default function StatsRow({ botRuns, demo = false }) {
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
  const funds = demo ? demoFunds(botRuns) : null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
      <StatCard
        label="Total P&L"
        value={formatSignedUsd(totalPnl)}
        subValue={`${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}% on $${totalAllocated.toFixed(0)} allocated`}
        trend={totalPnl >= 0 ? 'up' : 'down'}
      />
      <StatCard
        label="Portfolio value"
        value={formatUsd(demo ? funds.totalFunds : currentValue)}
        subValue={demo ? `${formatUsd(funds.available)} available to trade` : `${active.length} active bot${active.length !== 1 ? 's' : ''} · ${formatSignedUsd(unrealized)} unrealized`}
      />
      <StatCard
        label="Funds deployed"
        value={formatUsd(demo ? funds.deployed : deployedLive)}
        subValue={demo ? `in ${active.length} running portfolio${active.length !== 1 ? 's' : ''} · ${formatSignedUsd(unrealized)} unrealized` : deployedPaper > 0 ? `+ ${formatUsd(deployedPaper)} in paper experiments` : 'Allocated to live bots'}
      />
      <StatCard
        label="Total returned"
        value={formatUsd(totalReturned)}
        subValue={`${finished.length} finished run${finished.length !== 1 ? 's' : ''}`}
      />
    </div>
  );
}

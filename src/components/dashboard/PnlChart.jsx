import React, { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'paper', label: 'Paper' },
];
const MAX_POINTS = 240;

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-muted-foreground">{format(point.t, 'MMM d, HH:mm')}</p>
      <p className={cn('text-sm font-mono font-semibold', point.pnl >= 0 ? 'text-primary' : 'text-destructive')}>
        {point.pnl >= 0 ? '+' : '-'}${Math.abs(point.pnl).toFixed(2)}
      </p>
      <p className="text-[10px] text-muted-foreground font-mono">{point.bots} bot{point.bots === 1 ? '' : 's'} contributing</p>
    </div>
  );
};

/**
 * Combined P&L across bots. Each bot's history is a series of (time, pnl)
 * points; the chart carries every bot's latest value forward and sums them.
 */
function buildSeries(botRuns) {
  const points = [];
  for (const run of botRuns) {
    for (const p of Array.isArray(run.pnl_history) ? run.pnl_history : []) {
      const t = Date.parse(p.time);
      if (!Number.isFinite(t)) continue;
      points.push({ botId: run.id, t, pnl: Number(p.pnl) || 0 });
    }
  }
  points.sort((a, b) => a.t - b.t);
  const latest = new Map();
  const series = [];
  for (const p of points) {
    latest.set(p.botId, p.pnl);
    let total = 0;
    for (const v of latest.values()) total += v;
    const point = { t: p.t, pnl: Math.round(total * 100) / 100, bots: latest.size };
    // Two bots ticked in the same millisecond give one chart point, not two with the same x.
    if (series.length && series[series.length - 1].t === p.t) series[series.length - 1] = point;
    else series.push(point);
  }
  if (series.length <= MAX_POINTS) return series;
  const step = Math.ceil(series.length / MAX_POINTS);
  return series.filter((_, i) => i % step === 0 || i === series.length - 1);
}

export default function PnlChart({ botRuns }) {
  const [filter, setFilter] = useState('all');

  const chartData = useMemo(() => {
    const runs = botRuns.filter(r => (filter === 'all' ? true : filter === 'paper' ? r.is_paper : !r.is_paper));
    return buildSeries(runs);
  }, [botRuns, filter]);

  const spansDays = chartData.length > 1 && chartData[chartData.length - 1].t - chartData[0].t > 36 * 3_600_000;
  const isPositive = chartData.length > 0 && chartData[chartData.length - 1].pnl >= 0;
  const stroke = isPositive ? 'hsl(142,71%,45%)' : 'hsl(0,72%,51%)';

  return (
    <div className="surface p-4 lg:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-foreground">P&L Over Time</h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-secondary rounded-md p-0.5">
            {FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-medium transition-[color,background-color,border-color,box-shadow] duration-150 ease-out',
                  filter === f.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground font-mono">USDC</span>
        </div>
      </div>
      <div className="h-48 lg:h-56">
        {chartData.length < 2 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">No P&L history yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Each engine tick adds a point for every running bot</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={stroke} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={stroke} stopOpacity={0} />
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
                axisLine={{ stroke: 'hsl(220,14%,16%)' }}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(215,14%,50%)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `$${v}`}
                width={60}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="pnl" stroke={stroke} strokeWidth={2} fill="url(#pnlGradient)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

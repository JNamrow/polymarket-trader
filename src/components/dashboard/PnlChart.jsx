import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const val = payload[0].value;
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-sm font-mono font-semibold ${val >= 0 ? 'text-primary' : 'text-destructive'}`}>
          {val >= 0 ? '+' : ''}${val.toFixed(2)}
        </p>
      </div>
    );
  }
  return null;
};

export default function PnlChart({ botRuns }) {
  const chartData = useMemo(() => {
    // Aggregate P&L history from all runs
    const allPoints = [];
    botRuns.forEach(run => {
      if (run.pnl_history && run.pnl_history.length > 0) {
        run.pnl_history.forEach(p => allPoints.push(p));
      }
    });

    if (allPoints.length === 0) {
      // Generate demo data if no real data
      const now = Date.now();
      return Array.from({ length: 24 }, (_, i) => {
        const pnl = Math.sin(i / 3) * 15 + (i * 1.2) - 5 + (Math.random() * 8 - 4);
        return {
          time: `${i}h`,
          pnl: Math.round(pnl * 100) / 100,
        };
      });
    }

    return allPoints.sort((a, b) => new Date(a.time) - new Date(b.time));
  }, [botRuns]);

  const isPositive = chartData.length > 0 && chartData[chartData.length - 1].pnl >= 0;

  return (
    <div className="bg-card border border-border rounded-xl p-4 lg:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-foreground">P&L Over Time</h3>
        <span className="text-xs text-muted-foreground font-mono">USDC</span>
      </div>
      <div className="h-48 lg:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isPositive ? "hsl(142,71%,45%)" : "hsl(0,72%,51%)"} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={isPositive ? "hsl(142,71%,45%)" : "hsl(0,72%,51%)"} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,14%)" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: 'hsl(215,14%,50%)' }}
              axisLine={{ stroke: 'hsl(220,14%,16%)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'hsl(215,14%,50%)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="pnl"
              stroke={isPositive ? "hsl(142,71%,45%)" : "hsl(0,72%,51%)"}
              strokeWidth={2}
              fill="url(#pnlGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
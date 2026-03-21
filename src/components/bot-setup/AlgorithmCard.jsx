import React from 'react';
import { TrendingUp, BarChart3, Shuffle, MessageCircle, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

const algorithms = [
  {
    id: 'momentum',
    name: 'Momentum',
    description: 'Buy into markets trending strongly in one direction',
    icon: TrendingUp,
  },
  {
    id: 'mean_reversion',
    name: 'Mean Reversion',
    description: 'Bet against recent sharp price moves expecting a reversal',
    icon: BarChart3,
  },
  {
    id: 'arbitrage',
    name: 'Arbitrage',
    description: 'Exploit price discrepancies across related markets',
    icon: Shuffle,
  },
  {
    id: 'sentiment',
    name: 'Sentiment',
    description: 'Use market volume and activity signals to find opportunities',
    icon: MessageCircle,
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Define your own entry/exit thresholds and parameters',
    icon: SlidersHorizontal,
  },
];

export default function AlgorithmSelector({ selected, onSelect }) {
  return (
    <div className="space-y-3">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Algorithm
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {algorithms.map(({ id, name, description, icon: Icon }) => {
          const isSelected = selected === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={cn(
                "flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all duration-200",
                isSelected
                  ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                  : "border-border bg-card hover:border-border hover:bg-secondary/50"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                isSelected ? "bg-primary/20" : "bg-secondary"
              )}>
                <Icon className={cn("w-4 h-4", isSelected ? "text-primary" : "text-muted-foreground")} />
              </div>
              <div className="min-w-0">
                <p className={cn(
                  "text-sm font-medium",
                  isSelected ? "text-primary" : "text-foreground"
                )}>{name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
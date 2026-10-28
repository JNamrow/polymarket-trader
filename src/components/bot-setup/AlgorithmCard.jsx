import React from 'react';
import { TrendingUp, BarChart3, Shuffle, MessageCircle, SlidersHorizontal, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

const algorithms = [
  {
    id: 'momentum',
    name: 'Momentum',
    description: 'Buys the side that moved ≥3¢ over 24h with the 1h move agreeing. Exits on a 3¢ reversal or your stop/target.',
    icon: TrendingUp,
  },
  {
    id: 'mean_reversion',
    name: 'Mean Reversion',
    description: 'Fades sharp 1h moves (≥4¢) in liquid markets. Exits once half the move retraces.',
    icon: BarChart3,
  },
  {
    id: 'market_making',
    name: 'Market Making',
    description: 'Joins the bid on deep markets with a ≥2¢ spread and exits when the bid reaches entry + spread.',
    icon: Layers,
  },
  {
    id: 'arbitrage',
    name: 'Arbitrage',
    description: 'Buys full NegRisk baskets when every YES (or NO) costs less than the guaranteed payout. Holds to settlement.',
    icon: Shuffle,
  },
  {
    id: 'sentiment',
    name: 'Sentiment',
    description: 'Reads live order-book imbalance within 5¢ of the touch plus volume spikes; follows the pressure.',
    icon: MessageCircle,
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Buy YES below your entry price, sell at your exit price. You set the thresholds and position count.',
    icon: SlidersHorizontal,
  },
];

export default function AlgorithmSelector({ selected, onSelect }) {
  return (
    <div className="space-y-3">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Algorithm</label>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {algorithms.map(({ id, name, description, icon: Icon }) => {
          const isSelected = selected === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={cn(
                'flex items-start gap-3 p-3.5 rounded-xl border text-left transition-[color,background-color,border-color,box-shadow] duration-150 ease-out',
                isSelected ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20' : 'border-border bg-card hover:border-border hover:bg-secondary/50'
              )}
            >
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', isSelected ? 'bg-primary/20' : 'bg-secondary')}>
                <Icon className={cn('w-4 h-4', isSelected ? 'text-primary' : 'text-muted-foreground')} />
              </div>
              <div className="min-w-0">
                <p className={cn('text-sm font-medium', isSelected ? 'text-primary' : 'text-foreground')}>{name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

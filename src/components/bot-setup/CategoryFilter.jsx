import React from 'react';
import { cn } from '@/lib/utils';

const categories = [
  { id: 'all', label: 'All' },
  { id: 'politics', label: 'Politics' },
  { id: 'sports', label: 'Sports' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'culture', label: 'Culture' },
  { id: 'science', label: 'Science' },
];

export default function CategoryFilter({ selected, onToggle }) {
  const handleToggle = (id) => {
    if (id === 'all') {
      if (selected.includes('all')) return;
      onToggle(['all']);
      return;
    }
    
    let next = selected.filter(s => s !== 'all');
    if (next.includes(id)) {
      next = next.filter(s => s !== id);
    } else {
      next = [...next, id];
    }
    if (next.length === 0) next = ['all'];
    onToggle(next);
  };

  return (
    <div className="space-y-3">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Market Categories
      </label>
      <div className="flex flex-wrap gap-2">
        {categories.map(({ id, label }) => {
          const isSelected = selected.includes(id);
          return (
            <button
              key={id}
              onClick={() => handleToggle(id)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all duration-200",
                isSelected
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
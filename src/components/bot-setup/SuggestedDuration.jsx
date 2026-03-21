import React, { useMemo } from 'react';
import { Clock, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const volatileCategories = ['crypto', 'politics'];

function calculateSuggested(fund, algorithm, categories) {
  let baseHours = 4;

  // Fund-based adjustment
  if (fund >= 500) baseHours += 24;
  else if (fund >= 200) baseHours += 12;
  else if (fund >= 100) baseHours += 6;

  // Category volatility
  const hasVolatile = categories.some(c => volatileCategories.includes(c));
  if (hasVolatile) baseHours *= 1.5;
  if (categories.includes('all')) baseHours *= 1.2;

  // Algorithm adjustment
  if (algorithm === 'arbitrage') baseHours *= 0.5;
  if (algorithm === 'momentum') baseHours *= 1.3;
  if (algorithm === 'sentiment') baseHours *= 1.1;

  return Math.round(baseHours);
}

function formatDuration(hours) {
  if (hours >= 48) return `${Math.round(hours / 24)} days`;
  return `${hours} hours`;
}

export default function SuggestedDuration({ fund, algorithm, categories, value, onChange, useCustom, setUseCustom }) {
  const suggested = useMemo(
    () => calculateSuggested(fund, algorithm, categories),
    [fund, algorithm, categories]
  );

  return (
    <div className="space-y-3">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Run Duration
      </label>

      {/* Suggested */}
      <div className={cn(
        "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200",
        !useCustom ? "border-primary/50 bg-primary/5" : "border-border bg-card hover:bg-secondary/50"
      )} onClick={() => { setUseCustom(false); onChange(suggested); }}>
        <Clock className={cn("w-4 h-4", !useCustom ? "text-primary" : "text-muted-foreground")} />
        <div>
          <p className={cn("text-sm font-medium", !useCustom ? "text-primary" : "text-foreground")}>
            Suggested: {formatDuration(suggested)}
          </p>
          <p className="text-xs text-muted-foreground">Based on your fund size, algorithm, and categories</p>
        </div>
      </div>

      {/* Custom */}
      <div className={cn(
        "flex items-center gap-3 p-3 rounded-xl border transition-all duration-200",
        useCustom ? "border-primary/50 bg-primary/5" : "border-border bg-card"
      )}>
        <div className="flex items-center gap-2 flex-1" onClick={() => setUseCustom(true)}>
          <Input
            type="number"
            min={1}
            value={useCustom ? value : ''}
            placeholder="Custom"
            onChange={(e) => { setUseCustom(true); onChange(Number(e.target.value)); }}
            className="w-20 h-8 text-sm font-mono bg-transparent border-border"
          />
          <Select defaultValue="hours" onOpenChange={() => setUseCustom(true)}>
            <SelectTrigger className="w-24 h-8 text-xs bg-transparent border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hours">Hours</SelectItem>
              <SelectItem value="days">Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
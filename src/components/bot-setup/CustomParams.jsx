import React from 'react';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';

export default function CustomParams({ params, onChange }) {
  const update = (key, value) => onChange({ ...params, [key]: value });

  return (
    <div className="space-y-4 surface p-4">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Custom Parameters
      </label>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground">Entry Threshold</span>
          <span className="text-sm font-mono text-primary">{params.entry.toFixed(2)}</span>
        </div>
        <Slider
          value={[params.entry * 100]}
          onValueChange={([v]) => update('entry', v / 100)}
          min={5}
          max={95}
          step={5}
          className="w-full"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground">Exit Threshold</span>
          <span className="text-sm font-mono text-primary">{params.exit.toFixed(2)}</span>
        </div>
        <Slider
          value={[params.exit * 100]}
          onValueChange={([v]) => update('exit', v / 100)}
          min={5}
          max={95}
          step={5}
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <span className="text-sm text-foreground">Max Positions</span>
        <Input
          type="number"
          min={1}
          max={50}
          value={params.maxPositions}
          onChange={(e) => update('maxPositions', Number(e.target.value))}
          className="bg-transparent border-border font-mono text-sm"
        />
      </div>
    </div>
  );
}
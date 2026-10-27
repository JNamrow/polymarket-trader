import React from 'react';
import { Input } from '@/components/ui/input';
import { ShieldCheck } from 'lucide-react';

const FIELDS = [
  { key: 'maxPositions', label: 'Max positions', min: 1, max: 25, step: 1, suffix: '' },
  { key: 'stopLossPct', label: 'Stop loss', min: 1, max: 90, step: 1, suffix: '%' },
  { key: 'takeProfitPct', label: 'Take profit', min: 1, max: 300, step: 1, suffix: '%' },
  { key: 'maxPositionPct', label: 'Max per position', min: 1, max: 100, step: 1, suffix: '%' },
];

export default function RiskControls({ value, onChange }) {
  const update = (key, raw) => onChange({ ...value, [key]: raw === '' ? '' : Number(raw) });

  return (
    <div className="space-y-3">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5" />
        Risk Controls
      </label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {FIELDS.map(({ key, label, min, max, step, suffix }) => (
          <div key={key} className="bg-background border border-border rounded-lg p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
            <div className="relative">
              <Input
                type="number"
                min={min}
                max={max}
                step={step}
                value={value[key] ?? ''}
                onChange={e => update(key, e.target.value)}
                className="h-8 bg-transparent border-border font-mono text-sm pr-6"
              />
              {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Exits need a move of at least 2¢ so the bid/ask spread alone cannot stop you out. Arbitrage baskets ignore stop/take-profit and hold to settlement.
      </p>
    </div>
  );
}

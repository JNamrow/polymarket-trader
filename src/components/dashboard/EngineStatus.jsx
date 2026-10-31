import React, { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Small pill showing what the in-browser trading engine is doing. */
export default function EngineStatus({ engine, runningCount }) {
  const [, setClock] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const secs = engine.nextTickAt ? Math.max(0, Math.round((engine.nextTickAt - Date.now()) / 1000)) : null;
  let label = 'engine idle';
  if (engine.running) label = 'ticking…';
  else if (engine.serverTicks) label = 'server ticks every 5 min';
  else if (runningCount > 0) label = secs != null ? `next tick ${secs}s` : 'engine ready';

  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-secondary border border-border"
      title={engine.error ? `Last tick error: ${engine.error}` : engine.serverTicks ? 'A server job ticks the shared sandbox every 5 minutes' : `Runs every ${Math.round(engine.intervalMs / 1000)}s while this page is open`}
    >
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          engine.running ? 'bg-primary motion-safe:animate-pulse' : runningCount > 0 ? 'bg-primary motion-safe:animate-pulse-glow' : 'bg-muted-foreground/40'
        )}
      />
      <span className="text-xs text-muted-foreground font-mono whitespace-nowrap hidden md:inline">{label}</span>
      {engine.error && <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />}
      <button
        type="button"
        onClick={() => engine.tickNow()}
        disabled={engine.running || runningCount === 0}
        className="text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
        title="Run a tick now"
      >
        <RefreshCw className={cn('w-3.5 h-3.5', engine.running && 'animate-spin')} />
      </button>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { FlaskConical, RotateCcw, Github } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { demoInfo, resetDemo } from '@/api/localClient';
import { base44, isSharedSandbox } from '@/api/base44Client';

const REPO_URL = 'https://github.com/JNamrow/polymarket-trader';

function timeLeft(expiresAt, now) {
  const left = Math.max(0, expiresAt - now);
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** One quiet line in demo mode: what the sandbox is, when it resets, where the source is. */
export default function DemoBanner() {
  const { isDemo } = useAuth();
  const shared = isSharedSandbox();
  const [now, setNow] = useState(Date.now());
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    if (!isDemo) return undefined;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [isDemo]);
  useEffect(() => {
    if (!isDemo || !shared || typeof base44.meta !== 'function') return undefined;
    let alive = true;
    const load = () => base44.meta().then(m => alive && setMeta(m)).catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [isDemo, shared]);
  if (!isDemo) return null;
  const expiresAt = shared ? (meta?.resets_at ? Date.parse(meta.resets_at) : null) : demoInfo().expiresAt;
  const resets = expiresAt ? `resets in ${timeLeft(expiresAt, now)}` : 'resets every 2 hours';
  const text = shared ? `Paper money on live Polymarket data · shared sandbox, a server ticks it every 5 min · ${resets}` : `Paper money on live Polymarket data · private sandbox in this browser · ${resets}`;

  const reset = () => {
    resetDemo();
    window.location.reload();
  };

  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-1.5 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5 font-medium text-foreground flex-shrink-0">
        <FlaskConical className="w-3.5 h-3.5" /> Demo
      </span>
      <span className="min-w-0 flex-1 truncate" title={text}>
        {text}
      </span>
      <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
        {!shared && (
          <button type="button" onClick={reset} className="pressable inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-muted-foreground hover:text-foreground" title="Wipe the sandbox and start again">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        )}
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="pressable inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-foreground hover:text-primary" title="Source on GitHub">
          <Github className="w-3 h-3" /> Source
        </a>
      </div>
    </div>
  );
}

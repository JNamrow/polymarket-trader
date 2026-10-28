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

/** Shown only in demo mode: what the sandbox is, when it resets, where the source is. */
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

  const reset = () => {
    resetDemo();
    window.location.reload();
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
      <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
        <FlaskConical className="w-3.5 h-3.5" /> Demo
      </span>
      <span className="text-muted-foreground">
        {shared ? (
          <>
            Paper money on live Polymarket data. This sandbox is shared: everyone sees the same portfolios, a server ticks them every 5 minutes, and it resets{' '}
            {expiresAt ? (
              <>
                in <span className="font-mono text-foreground">{timeLeft(expiresAt, now)}</span>
              </>
            ) : (
              'every 2 hours'
            )}
            . Fork the source to run your own.
          </>
        ) : (
          <>
            Paper money on live Polymarket data. Your sandbox lives in this browser and resets in <span className="font-mono text-foreground">{timeLeft(expiresAt, now)}</span>. Fork the source to run your own.
          </>
        )}
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        {!shared && (
          <button type="button" onClick={reset} className="pressable inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-muted-foreground hover:text-foreground" title="Wipe the sandbox and start again">
            <RotateCcw className="w-3 h-3" /> Reset now
          </button>
        )}
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="pressable inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 font-medium text-primary-foreground hover:bg-primary/90">
          <Github className="w-3 h-3" /> Source on GitHub
        </a>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { FlaskConical, RotateCcw, Github } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { demoInfo, resetDemo } from '@/api/localClient';

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
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isDemo) return undefined;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [isDemo]);
  if (!isDemo) return null;
  const { expiresAt } = demoInfo();

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
        Paper money on live Polymarket data. Your sandbox lives in this browser and resets in <span className="font-mono text-foreground">{timeLeft(expiresAt, now)}</span>. Fork the source to run your own.
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <button type="button" onClick={reset} className="pressable inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-muted-foreground hover:text-foreground" title="Wipe the sandbox and start again">
          <RotateCcw className="w-3 h-3" /> Reset now
        </button>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="pressable inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 font-medium text-primary-foreground hover:bg-primary/90">
          <Github className="w-3 h-3" /> Source on GitHub
        </a>
      </div>
    </div>
  );
}

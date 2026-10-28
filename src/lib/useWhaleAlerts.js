/**
 * Turns the live whale feed and the fills of followed wallets into alerts
 * while the app is open: a toast for each new one and a list for the bell
 * menu. Fills that happened before the tab opened are listed, not toasted.
 *
 * Alert rules live in src/engine/wallets.js (alertsForTrade) so the scheduled
 * backend scanner raises the same ones when no browser is open.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { fetchWalletTrades } from '@/api/polymarket';
import { alertsForTrade, describeFill } from '@/engine/wallets.js';
import { dataApiGate } from '@/lib/useTraders';

const READ_KEY = 'polybot-alerts-read-at';
const GRACE_MS = 60 * 1000; // fills older than mount − grace are "already happened"
const MAX_ALERTS = 200;

export const ALERT_KIND_LABELS = {
  followed: 'Followed wallet',
  insider: 'Potential insider',
  contrarian: 'Contrarian whale',
  whale: 'Whale fill',
};

const readStorage = () => {
  try {
    return Number(localStorage.getItem(READ_KEY)) || 0;
  } catch {
    return 0;
  }
};

export function useWhaleAlerts({ trades = [], signalsById = {}, followed = new Set(), prefs, enabled = true }) {
  const [alerts, setAlerts] = useState([]);
  const [readAt, setReadAt] = useState(readStorage);
  const seenRef = useRef(new Set());
  const mountedAtRef = useRef(Date.now());

  const followedList = useMemo(() => [...followed], [followed]);
  const followedFills = useQueries({
    queries: followedList.map(address => ({
      queryKey: ['wallet-fills', address, 15],
      queryFn: () => dataApiGate(() => fetchWalletTrades(address, { limit: 15 })),
      staleTime: 30 * 1000,
      refetchInterval: 60 * 1000,
      retry: 1,
      enabled,
    })),
  });
  const followedKey = followedFills.map(q => q.dataUpdatedAt || 0).join(',');

  useEffect(() => {
    if (!enabled) return;
    const pool = [...trades, ...followedFills.flatMap(q => q.data || [])];
    const seen = seenRef.current;
    const fresh = [];
    const now = Date.now();
    for (const t of pool) {
      if (seen.has(t.id)) continue;
      const signals = signalsById[t.id];
      // A feed fill waits for its wallet stats (a few seconds) so insider alerts can be judged.
      if (signals?.pending) continue;
      seen.add(t.id);
      const initial = t.timestamp < mountedAtRef.current - GRACE_MS;
      for (const a of alertsForTrade({ trade: t, signals, followed, prefs })) fresh.push({ ...a, at: now, initial });
    }
    if (!fresh.length) return;
    fresh.sort((a, b) => b.timestamp - a.timestamp);
    setAlerts(prev => {
      const ids = new Set(prev.map(a => a.id));
      return [...fresh.filter(a => !ids.has(a.id)), ...prev].slice(0, MAX_ALERTS);
    });
    fresh
      .filter(a => !a.initial)
      .slice(0, 3)
      .forEach(a => toast(ALERT_KIND_LABELS[a.kind], { description: a.text, duration: 8000 }));
    // followedKey changes when a followed wallet's fills refresh.
  }, [trades, signalsById, followedKey, followed, prefs, enabled]);

  // Signals the scheduled backend scanner stored while no browser was open (empty until whaleScan is deployed).
  const stored = useQuery({
    queryKey: ['whale-signals'],
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 0,
    queryFn: async () => {
      const rows = await base44.entities.WhaleSignal.list('-created_date', 60);
      return (rows || []).map(r => {
        const kinds = Array.isArray(r.kinds) ? r.kinds : [];
        const kind = kinds.includes('insider') ? 'insider' : kinds.includes('contrarian') ? 'contrarian' : 'whale';
        const name = r.trader_name || String(r.wallet || '').slice(0, 8);
        return {
          id: `stored:${r.trade_id}`,
          kind,
          wallet: r.wallet,
          name,
          title: r.title,
          eventSlug: r.event_slug,
          outcome: r.outcome,
          side: r.side,
          usd: r.usd,
          price: r.price,
          timestamp: Date.parse(r.traded_at) || 0,
          text: `${name} ${describeFill({ side: r.side, usd: r.usd, outcome: r.outcome, price: r.price })} · ${r.title}`,
          at: Date.parse(r.created_date) || 0,
          initial: true,
          stored: true,
        };
      });
    },
  });

  const unread = useMemo(() => alerts.filter(a => !a.initial && a.at > readAt).length, [alerts, readAt]);

  const markRead = () => {
    const now = Date.now();
    setReadAt(now);
    try {
      localStorage.setItem(READ_KEY, String(now));
    } catch {
      /* private mode */
    }
  };

  return { alerts, unread, markRead, stored: stored.data || [], storedUnavailable: !!stored.error };
}

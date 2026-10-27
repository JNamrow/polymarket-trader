/**
 * Runs the trading engine in the browser while the dashboard is open.
 *
 * Every `intervalMs` it ticks each running bot: fetches live Polymarket data,
 * opens/closes paper positions, marks open ones to market, and writes the
 * result back through the Base44 SDK. A bot that was ticked recently by
 * another tab (or by the scheduled backend function) is skipped.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { executeTick, liquidateBot } from '../../../base44/shared/engine/engine.js';

export const TICK_INTERVAL_MS = 60_000;

export function useEngineApi() {
  return useMemo(
    () => ({
      createTrades: rows => base44.entities.Trade.bulkCreate(rows),
      updateTrades: async rows => {
        for (const row of rows) {
          const { id, ...data } = row;
          await base44.entities.Trade.update(id, data);
        }
      },
      updateBot: (id, data) => base44.entities.BotRun.update(id, data),
    }),
    []
  );
}

export function useBotEngine({ bots = [], trades = [], enabled = true, intervalMs = TICK_INTERVAL_MS }) {
  const queryClient = useQueryClient();
  const api = useEngineApi();
  const botsRef = useRef(bots);
  const tradesRef = useRef(trades);
  botsRef.current = bots;
  tradesRef.current = trades;
  const busyRef = useRef(false);
  const lastRunRef = useRef(0);
  const [status, setStatus] = useState({
    running: false,
    lastTickAt: null,
    nextTickAt: null,
    error: null,
    summaries: [],
  });

  const refresh = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['botRuns'] }),
        queryClient.invalidateQueries({ queryKey: ['trades'] }),
      ]),
    [queryClient]
  );

  const tick = useCallback(
    async ({ force = false, botIds = null, extraBots = [] } = {}) => {
      if (busyRef.current) return;
      const now = Date.now();
      if (!force && now - lastRunRef.current < intervalMs * 0.5) return;
      // A bot created a moment ago may not be in the query cache yet; callers can pass it in.
      const known = botsRef.current || [];
      const pool = [...known, ...extraBots.filter(b => b && !known.some(k => k.id === b.id))];
      const running = pool.filter(b => b.status === 'running' && (!botIds || botIds.includes(b.id)));
      if (!running.length) {
        setStatus(s => ({ ...s, nextTickAt: now + intervalMs }));
        return;
      }
      busyRef.current = true;
      lastRunRef.current = now;
      setStatus(s => ({ ...s, running: true, error: null }));
      const summaries = [];
      let error = null;
      for (const bot of running) {
        const last = bot.last_tick_at ? Date.parse(bot.last_tick_at) : 0;
        if (!force && now - last < intervalMs * 0.6) {
          summaries.push({ botId: bot.id, skipped: 'ticked recently' });
          continue;
        }
        const openTrades = (tradesRef.current || []).filter(t => t.bot_run_id === bot.id && t.status === 'open');
        try {
          summaries.push(await executeTick({ bot, openTrades, api, now: Date.now() }));
        } catch (err) {
          error = err?.response?.data?.message || err?.message || String(err);
          summaries.push({ botId: bot.id, error });
        }
      }
      await refresh();
      busyRef.current = false;
      setStatus({ running: false, lastTickAt: Date.now(), nextTickAt: Date.now() + intervalMs, error, summaries });
    },
    [api, intervalMs, refresh]
  );

  // Regular ticks while mounted.
  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => tick(), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, tick]);

  // First tick as soon as running bots are known.
  const hasRunning = bots.some(b => b.status === 'running');
  useEffect(() => {
    if (enabled && hasRunning && lastRunRef.current === 0) tick();
  }, [enabled, hasRunning, tick]);

  const stopBot = useCallback(
    async bot => {
      const openTrades = (tradesRef.current || []).filter(t => t.bot_run_id === bot.id && t.status === 'open');
      await liquidateBot({ bot, openTrades, api, now: Date.now() });
      await refresh();
    },
    [api, refresh]
  );

  /** tickNow() ticks every running bot; tickNow([bot]) or tickNow([id]) ticks just those. */
  const tickNow = useCallback(
    targets => {
      if (!Array.isArray(targets) || targets.length === 0) return tick({ force: true });
      const bots = targets.filter(t => t && typeof t === 'object');
      const ids = targets.map(t => (typeof t === 'object' ? t.id : t));
      return tick({ force: true, botIds: ids, extraBots: bots });
    },
    [tick]
  );

  return {
    ...status,
    intervalMs,
    tickNow,
    stopBot,
  };
}

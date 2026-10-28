// @ts-nocheck — the shared engine is plain JavaScript.
/**
 * demo-tick — advances every running portfolio in the shared demo sandbox by
 * one engine tick, and seeds the sample portfolios when the sandbox is empty
 * (right after a reset). Same engine as the browser: ../_shared/engine.
 *
 * Called every 5 minutes by pg_cron (see supabase/cron.sql) with the service
 * role key as a bearer token. Anything else gets 401.
 */
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { executeTick } from "../_shared/engine/engine.js";
import { fetchLeaderboard } from "../_shared/engine/polymarketApi.js";
import { buildSampleBots } from "../_shared/engine/demo.js";

const MIN_GAP_MS = 4 * 60 * 1000;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const must = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

Deno.serve(async (req: Request) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!serviceKey || req.headers.get("Authorization") !== `Bearer ${serviceKey}`) return json({ error: "unauthorized" }, 401);
  const sb = createClient(Deno.env.get("SUPABASE_URL") || "", serviceKey, { auth: { persistSession: false } });

  try {
    let bots = must(await sb.from("bot_runs").select("*").eq("status", "running").order("created_date"));
    let seeded = 0;
    if (!bots.length) {
      const { count } = await sb.from("bot_runs").select("*", { count: "exact", head: true });
      if (!count) {
        let pilot = null;
        try {
          const board = await fetchLeaderboard({ window: "1m", limit: 5, orderBy: "PNL" });
          pilot = board.find((w) => w.name) || board[0] || null;
        } catch (_err) {
          /* leaderboard unavailable: seed the strategy bot only */
        }
        bots = must(await sb.from("bot_runs").insert(buildSampleBots({ pilot })).select());
        seeded = bots.length;
      }
    }

    const api = {
      createTrades: async (rows) => must(await sb.from("trades").insert(rows).select()),
      updateTrades: async (rows) => {
        for (const { id, ...patch } of rows) must(await sb.from("trades").update(patch).eq("id", id));
      },
      updateBot: async (id, patch) => must(await sb.from("bot_runs").update(patch).eq("id", id)),
    };

    const now = Date.now();
    const results = [];
    for (const bot of bots) {
      const last = bot.last_tick_at ? Date.parse(bot.last_tick_at) : 0;
      if (!seeded && now - last < MIN_GAP_MS) {
        results.push({ botId: bot.id, skipped: "ticked recently" });
        continue;
      }
      const openTrades = must(await sb.from("trades").select("*").eq("bot_run_id", bot.id).eq("status", "open"));
      try {
        const summary = await executeTick({ bot, openTrades, api, now: Date.now() });
        results.push({ ...summary, log: undefined });
      } catch (err) {
        console.error(`demo-tick failed for ${bot.id}:`, err);
        results.push({ botId: bot.id, error: err?.message || String(err) });
      }
    }
    await sb.from("demo_meta").update({ last_tick_at: new Date().toISOString() }).eq("id", 1);
    return json({ ok: true, seeded, bots: bots.length, results });
  } catch (err) {
    console.error("demo-tick failed:", err);
    return json({ ok: false, error: err?.message || String(err) }, 500);
  }
});

// @ts-nocheck — the shared engine is plain JavaScript.
/**
 * botTick — advances every running bot one engine tick.
 *
 * Runs on a schedule (see function.jsonc) so bots keep trading paper
 * positions while no browser has the dashboard open. The browser engine
 * and this function share base44/shared/engine; a bot ticked within the
 * last 4 minutes by either side is skipped.
 *
 * Can also be invoked by a signed-in user (base44.functions.invoke('botTick',
 * { force: true })) to tick only that user's bots.
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.57";
import { executeTick } from "../../shared/engine/engine.js";

const MIN_GAP_MS = 4 * 60 * 1000;

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    const user = await base44.auth.me().catch(() => null);
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true || body?.args?.force === true;
    const now = Date.now();

    const query: Record<string, unknown> = { status: "running" };
    if (user?.email) query.created_by = user.email;
    const bots = await db.BotRun.filter(query, "-created_date", 200);

    const api = {
      createTrades: (rows) => db.Trade.bulkCreate(rows),
      updateTrades: async (rows) => {
        for (const row of rows) {
          const { id, ...data } = row;
          await db.Trade.update(id, data);
        }
      },
      updateBot: (id, data) => db.BotRun.update(id, data),
    };

    const results = [];
    for (const bot of bots) {
      if (bot.server_tick === false) {
        results.push({ botId: bot.id, skipped: "server ticks disabled" });
        continue;
      }
      const last = bot.last_tick_at ? Date.parse(bot.last_tick_at) : 0;
      if (!force && now - last < MIN_GAP_MS) {
        results.push({ botId: bot.id, skipped: "ticked recently" });
        continue;
      }
      const openTrades = await db.Trade.filter({ bot_run_id: bot.id, status: "open" }, "-created_date", 500);
      try {
        const summary = await executeTick({ bot, openTrades, api, now: Date.now() });
        results.push({ ...summary, log: undefined });
      } catch (err) {
        console.error(`botTick failed for ${bot.id}:`, err);
        results.push({ botId: bot.id, error: err?.message || String(err) });
      }
    }

    return Response.json({ ok: true, bots: bots.length, results });
  } catch (error) {
    console.error("botTick error:", error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}

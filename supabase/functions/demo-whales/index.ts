// @ts-nocheck — the shared engine is plain JavaScript.
/**
 * demo-whales — stores notable Polymarket fills (whales, bets against the
 * crowd, suspicious fresh accounts) in whale_signals for the shared demo, and
 * drops rows older than two days. Same rules as the browser: _shared/engine/wallets.js.
 *
 * Called every 5 minutes by pg_cron (see supabase/cron.sql) with the cron token
 * as a bearer token. Deploy with verify_jwt off.
 */
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { fetchWhaleTrades, fetchUserStats, fetchPortfolioValue, fetchMarketTags, mapLimit } from "./engine/polymarketApi.js";
import { insiderSignals, isContrarian, categoryFromTags, ageDays } from "./engine/wallets.js";

const MIN_USD = 10_000;
const WHALE_USD = 100_000;
const MAX_NEW = 60;
const KEEP_DAYS = 2;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });


/** pg_cron calls with the token in demo_secrets (set by supabase/cron.sql); humans may use the service role key. */
async function authorized(req: Request, sb, serviceKey: string) {
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return false;
  if (bearer === serviceKey) return true;
  const { data } = await sb.from("demo_secrets").select("value").eq("name", "cron_token").maybeSingle();
  return !!data?.value && data.value === bearer;
}

Deno.serve(async (req: Request) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const sb = createClient(Deno.env.get("SUPABASE_URL") || "", serviceKey, { auth: { persistSession: false } });
  if (!serviceKey || !(await authorized(req, sb, serviceKey))) return json({ error: "unauthorized" }, 401);

  try {
    const trades = await fetchWhaleTrades({ minUsd: MIN_USD, limit: 200 });
    const { data: recent } = await sb.from("whale_signals").select("trade_id").order("created_date", { ascending: false }).limit(400);
    const known = new Set((recent || []).map((r) => r.trade_id));
    const fresh = trades.filter((t) => !known.has(t.id)).slice(0, MAX_NEW);

    const wallets = [...new Set(fresh.map((t) => t.wallet))];
    const stats = {};
    const values = {};
    await mapLimit(wallets, 3, async (w) => {
      stats[w] = await fetchUserStats(w).catch(() => null);
      values[w] = await fetchPortfolioValue(w).catch(() => null);
    });
    const tags = fresh.length ? await fetchMarketTags(fresh.map((t) => t.conditionId)).catch(() => ({})) : {};

    const rows = [];
    for (const t of fresh) {
      const s = insiderSignals({ trade: t, stats: stats[t.wallet], portfolioValue: values[t.wallet] });
      const kinds = [];
      if (t.usd >= WHALE_USD) kinds.push("whale");
      if (isContrarian(t)) kinds.push("contrarian");
      if (s.suspicious) kinds.push("insider");
      if (!kinds.length && !s.flags.length) continue;
      const st = stats[t.wallet];
      const days = st?.joinedAt ? ageDays(st.joinedAt) : null;
      rows.push({
        trade_id: t.id,
        tx_hash: t.txHash,
        traded_at: new Date(t.timestamp).toISOString(),
        wallet: t.wallet,
        trader_name: t.name || "",
        profile_image: t.profileImage || "",
        side: t.side,
        outcome: t.outcome || "",
        outcome_index: t.outcomeIndex,
        condition_id: t.conditionId,
        title: t.title || "",
        event_slug: t.eventSlug || "",
        icon: t.icon || "",
        category: categoryFromTags(tags[t.conditionId] || []),
        price: t.price,
        size: t.size,
        usd: t.usd,
        kinds,
        flags: s.flags.map((f) => f.id),
        insider_score: s.score,
        suspicious: s.suspicious,
        wallet_age_days: days != null ? Math.round(days) : null,
        wallet_markets: st?.marketsTraded ?? null,
        wallet_pnl: st?.totalPnl ?? null,
        portfolio_value: values[t.wallet] ?? null,
      });
    }
    let stored = 0;
    if (rows.length) {
      const { error, data } = await sb.from("whale_signals").upsert(rows, { onConflict: "trade_id", ignoreDuplicates: true }).select("id");
      if (error) throw new Error(error.message);
      stored = data?.length || 0;
    }
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
    await sb.from("whale_signals").delete().lt("traded_at", cutoff);
    return json({ ok: true, scanned: trades.length, considered: fresh.length, stored });
  } catch (err) {
    console.error("demo-whales failed:", err);
    return json({ ok: false, error: err?.message || String(err) }, 500);
  }
});

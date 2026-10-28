// @ts-nocheck — the shared engine is plain JavaScript.
/**
 * whaleScan — every 5 minutes, store notable Polymarket fills as WhaleSignal
 * rows so the Whales tab keeps history and alerts survive a closed browser.
 * Same rules as the browser: shared/engine/wallets.js.
 *
 * Can also be invoked by a signed-in user: base44.functions.invoke('whaleScan', { minUsd: 5000 }).
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.57";
import { fetchWhaleTrades, fetchUserStats, fetchPortfolioValue, fetchMarketTags, mapLimit } from "../../shared/engine/polymarketApi.js";
import { insiderSignals, isContrarian, categoryFromTags, ageDays } from "../../shared/engine/wallets.js";

const MIN_USD = 10_000; // fills below this are never looked at
const WHALE_USD = 100_000; // stored on size alone
const MAX_NEW = 60; // wallet lookups per run (2 calls each)

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    const body = await req.json().catch(() => ({}));
    const minUsd = Number(body?.minUsd || body?.args?.minUsd) || MIN_USD;

    const trades = await fetchWhaleTrades({ minUsd, limit: 200 });
    const recent = await db.WhaleSignal.list("-created_date", 400).catch(() => []);
    const known = new Set(recent.map((r) => r.trade_id));
    const fresh = trades.filter((t) => !known.has(t.id)).slice(0, MAX_NEW);
    if (!fresh.length) return json({ ok: true, scanned: trades.length, stored: 0 });

    const wallets = [...new Set(fresh.map((t) => t.wallet))];
    const stats = {};
    const values = {};
    await mapLimit(wallets, 3, async (w) => {
      stats[w] = await fetchUserStats(w).catch(() => null);
      values[w] = await fetchPortfolioValue(w).catch(() => null);
    });
    const tags = await fetchMarketTags(fresh.map((t) => t.conditionId)).catch(() => ({}));

    const rows = [];
    for (const t of fresh) {
      const s = insiderSignals({ trade: t, stats: stats[t.wallet], portfolioValue: values[t.wallet] });
      const kinds = [];
      if (t.usd >= WHALE_USD) kinds.push("whale");
      if (isContrarian(t)) kinds.push("contrarian");
      if (s.suspicious) kinds.push("insider");
      if (!kinds.length && !s.flags.length) continue; // only notable fills are kept
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
        ...(days != null ? { wallet_age_days: Math.round(days) } : {}),
        ...(st ? { wallet_markets: st.marketsTraded, wallet_pnl: st.totalPnl } : {}),
        ...(values[t.wallet] != null ? { portfolio_value: values[t.wallet] } : {}),
      });
    }
    if (rows.length) await db.WhaleSignal.bulkCreate(rows);
    return json({ ok: true, scanned: trades.length, considered: fresh.length, stored: rows.length });
  } catch (err) {
    console.error("whaleScan failed:", err);
    return json({ ok: false, error: err?.message || String(err) }, 500);
  }
}

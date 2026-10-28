// @ts-nocheck — the shared engine is plain JavaScript.
/**
 * demo-wallets — grows the wallet registry (public.wallets) for the shared
 * demo. Every run it reads the newest Polymarket fills of $1,000 or more
 * (plus a slice of older pages until the backfill is done), credits each
 * fill to its wallet once, fetches public stats for wallets it has not
 * checked yet, refreshes rows older than a day, and recomputes the trader
 * score and insider flags with the same rules as the browser (engine/wallets.js).
 *
 * Called every 5 minutes by pg_cron (see supabase/cron.sql) with the cron
 * token as a bearer token. Deploy with verify_jwt off. Stays under the Edge
 * Function wall-clock limit by stopping enrichment after BUDGET_MS.
 */
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { fetchWhaleTrades, fetchUserStats, fetchPortfolioValue, fetchPositions, fetchClosedPositions, fetchMarketTags, mapLimit } from "./engine/polymarketApi.js";
import { categoryFromTags, isContrarian, ageDays, traderScore, concentration, registryFlags, WHALE_DEFAULTS } from "./engine/wallets.js";

const MIN_USD = 1_000; // fills this size or bigger feed the registry
const PAGE = 1000; // Data API page size (its maximum)
const BACKFILL_PAGES = 2; // older pages read per run until BACKFILL_MAX
const BACKFILL_MAX = 10_000; // deepest offset the backfill reaches
const NEW_PER_RUN = 120; // new wallets checked per run (4 API calls each)
const REFRESH_PER_RUN = 30; // stale or never-checked wallets refreshed per run
const STALE_MS = 24 * 3_600_000;
const BUDGET_MS = 100_000; // stop checking wallets after this much wall time
const KEEP_SEEN_DAYS = 3;
const CLOSED_SAMPLE = 100; // settled positions per wallet for the score
const TAGS_PER_RUN = 300; // untagged markets looked up per run
const BIG_USD = 25_000;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const must = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};
const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};
const iso = (ms) => (ms ? new Date(ms).toISOString() : null);

/** pg_cron calls with the token in demo_secrets (set by supabase/cron.sql); humans may use the service role key. */
async function authorized(req: Request, sb, serviceKey: string) {
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return false;
  if (bearer === serviceKey) return true;
  const { data } = await sb.from("demo_secrets").select("value").eq("name", "cron_token").maybeSingle();
  return !!data?.value && data.value === bearer;
}

/** Rows whose `column` is in `values`. Small chunks: the list travels in the URL, and the gateway rejects very long ones. */
async function selectIn(sb, table, column, values, columns = "*", size = 60) {
  const out = [];
  for (const part of chunk(values, size)) out.push(...must(await sb.from(table).select(columns).in(column, part)));
  return out;
}

/** Public stats, portfolio, settled sample and score for one wallet: four Data API calls. */
async function checkWallet(address: string) {
  const [stats, value, closed, positions] = await Promise.all([
    fetchUserStats(address),
    fetchPortfolioValue(address).catch(() => null),
    fetchClosedPositions(address, { limit: CLOSED_SAMPLE }).catch(() => []),
    fetchPositions(address, { limit: 100 }).catch(() => []),
  ]);
  const live = positions.filter((p) => p.currentValue > 0 && !p.redeemable);
  const conc = concentration(live);
  const score = traderScore({ stats, closed, concentration: conc });
  const days = ageDays(stats.joinedAt);
  return {
    joined_at: iso(stats.joinedAt),
    wallet_age_days: days != null ? Math.round(days * 10) / 10 : null,
    markets_traded: stats.marketsTraded,
    trade_count: stats.tradeCount,
    biggest_win: stats.biggestWin,
    realized_pnl: stats.realizedPnl,
    unrealized_pnl: stats.unrealizedPnl,
    total_pnl: stats.totalPnl,
    trade_pnl: stats.tradePnl,
    volume: stats.volume,
    volume_total: stats.volumeTotal,
    fees_paid: stats.feesPaid,
    portfolio_value: value,
    open_positions: live.length,
    top_share: conc.topShare,
    closed_count: score.summary?.count ?? closed.length,
    win_rate: score.summary?.winRate ?? null,
    profit_factor: Number.isFinite(score.summary?.profitFactor) ? score.summary.profitFactor : null,
    score: score.score,
    score_label: score.label,
    last_checked_at: new Date().toISOString(),
    check_error: null,
  };
}

/** What a batch of fresh fills adds to one wallet row. `portfolioValue` decides "concentrated". */
function fillDelta(fills, portfolioValue) {
  const d = { n: 0, usd: 0, buy: 0, sell: 0, max: 0, big: 0, longShot: 0, concentrated: 0, contrarian: 0, categories: {}, last: null };
  for (const t of fills) {
    d.n++;
    d.usd += t.usd;
    if (t.side === "BUY") d.buy += t.usd;
    else d.sell += t.usd;
    d.max = Math.max(d.max, t.usd);
    if (t.usd >= BIG_USD) d.big++;
    if (t.side === "BUY" && t.price > 0 && t.price <= WHALE_DEFAULTS.longShotPrice) d.longShot++;
    if (t.side === "BUY" && portfolioValue != null && t.usd / Math.max(portfolioValue, t.usd, 1) >= WHALE_DEFAULTS.concentratedShare) d.concentrated++;
    if (isContrarian(t)) d.contrarian++;
    d.categories[t.category] = (d.categories[t.category] || 0) + 1;
    if (!d.last || t.timestamp > d.last.timestamp) d.last = t;
  }
  return d;
}

Deno.serve(async (req: Request) => {
  const t0 = Date.now();
  const budgetLeft = () => BUDGET_MS - (Date.now() - t0);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const sb = createClient(Deno.env.get("SUPABASE_URL") || "", serviceKey, { auth: { persistSession: false } });
  if (!serviceKey || !(await authorized(req, sb, serviceKey))) return json({ error: "unauthorized" }, 401);

  const state = (await sb.from("wallet_scan_state").select("*").eq("id", 1).maybeSingle()).data || { id: 1, backfill_offset: 0, backfill_done: false, runs: 0 };
  const summary: Record<string, unknown> = { ok: true };
  try {
    // 1. Fills: the newest page, plus older pages while the backfill is running.
    const pages = [await fetchWhaleTrades({ minUsd: MIN_USD, limit: PAGE, offset: 0 })];
    let backfillOffset = Math.max(Number(state.backfill_offset || 0), PAGE);
    let backfillDone = !!state.backfill_done;
    for (let k = 0; k < BACKFILL_PAGES && !backfillDone; k++) {
      if (backfillOffset >= BACKFILL_MAX) {
        backfillDone = true;
        break;
      }
      try {
        const page = await fetchWhaleTrades({ minUsd: MIN_USD, limit: PAGE, offset: backfillOffset });
        pages.push(page);
        backfillOffset += PAGE;
        if (page.length < PAGE) backfillDone = true;
      } catch (_err) {
        backfillDone = true; // the API stops paging somewhere; that is the end of the backfill
      }
    }
    const byId = new Map();
    for (const page of pages) for (const t of page) if (t.wallet && t.conditionId) byId.set(t.id, t);
    const trades = [...byId.values()];

    // 2. Drop fills already credited.
    // Trade ids are long (tx hash + token id), so they go in a POST body through an RPC instead of a URL.
    const seen = new Set(must(await sb.rpc("seen_fill_ids", { ids: trades.map((t) => t.id) })));
    const fresh = trades.filter((t) => !seen.has(t.id));

    // 3. Market categories: cached in market_tags, looked up from Gamma once per market.
    const conditionIds = [...new Set(fresh.map((t) => t.conditionId))];
    const category = new Map((await selectIn(sb, "market_tags", "condition_id", conditionIds, "condition_id,category")).map((r) => [r.condition_id, r.category]));
    const untagged = conditionIds.filter((id) => !category.has(id)).slice(0, TAGS_PER_RUN);
    if (untagged.length) {
      const tags = await fetchMarketTags(untagged).catch(() => ({}));
      const titles = new Map(fresh.map((t) => [t.conditionId, t.title]));
      const rows = untagged.filter((id) => tags[id]).map((id) => ({ condition_id: id, category: categoryFromTags(tags[id]), title: titles.get(id) || null }));
      for (const r of rows) category.set(r.condition_id, r.category);
      for (const part of chunk(rows, 500)) must(await sb.from("market_tags").upsert(part, { onConflict: "condition_id" }));
    }
    for (const t of fresh) t.category = category.get(t.conditionId) || "other";

    // 4. Group fresh fills by wallet; load the rows we already have.
    const freshByWallet = new Map();
    for (const t of fresh) {
      if (!freshByWallet.has(t.wallet)) freshByWallet.set(t.wallet, []);
      freshByWallet.get(t.wallet).push(t);
    }
    const existing = new Map((await selectIn(sb, "wallets", "address", [...freshByWallet.keys()], "*", 100)).map((r) => [r.address, r]));
    const newAddresses = [...freshByWallet.keys()]
      .filter((a) => !existing.has(a))
      .sort((a, b) => freshByWallet.get(b).reduce((s, t) => s + t.usd, 0) - freshByWallet.get(a).reduce((s, t) => s + t.usd, 0));

    // 5. Who gets checked this run: the biggest new wallets, then never-checked and stale rows.
    const stale = must(
      await sb
        .from("wallets")
        .select("*")
        .or(`last_checked_at.is.null,last_checked_at.lt.${new Date(Date.now() - STALE_MS).toISOString()}`)
        .order("last_checked_at", { ascending: true, nullsFirst: true })
        .order("last_seen_at", { ascending: false })
        .limit(REFRESH_PER_RUN)
    );
    for (const r of stale) existing.set(r.address, r);
    const queue = [...new Set([...newAddresses.slice(0, NEW_PER_RUN), ...stale.map((r) => r.address)])];
    const checked = new Map();
    let skipped = 0;
    await mapLimit(queue, 2, async (address) => {
      if (budgetLeft() < 8_000) {
        skipped++;
        return;
      }
      try {
        checked.set(address, await checkWallet(address));
      } catch (err) {
        checked.set(address, { last_checked_at: new Date().toISOString(), check_error: String(err?.message || err).slice(0, 200) });
      }
    });

    // 6. Build one merged row per touched wallet and upsert.
    const touched = new Set([...freshByWallet.keys(), ...stale.map((r) => r.address)]);
    const rows = [];
    for (const address of touched) {
      const ex = existing.get(address) || {};
      const patch = checked.get(address) || {};
      const fills = freshByWallet.get(address) || [];
      const pv = patch.portfolio_value ?? ex.portfolio_value ?? null;
      const d = fillDelta(fills, pv);
      const categories = { ...(ex.categories || {}) };
      for (const [c, n] of Object.entries(d.categories)) categories[c] = (categories[c] || 0) + n;
      const newest = d.last && (!ex.last_fill_at || d.last.timestamp > Date.parse(ex.last_fill_at)) ? d.last : null;
      const row = {
        address,
        name: newest?.name || ex.name || null,
        profile_image: newest?.profileImage || ex.profile_image || null,
        last_seen_at: newest ? iso(newest.timestamp) : ex.last_seen_at || new Date().toISOString(),
        fills_seen: (ex.fills_seen || 0) + d.n,
        fills_usd: (ex.fills_usd || 0) + d.usd,
        buy_usd: (ex.buy_usd || 0) + d.buy,
        sell_usd: (ex.sell_usd || 0) + d.sell,
        max_fill_usd: Math.max(ex.max_fill_usd || 0, d.max),
        big_fills: (ex.big_fills || 0) + d.big,
        long_shot_fills: (ex.long_shot_fills || 0) + d.longShot,
        concentrated_fills: (ex.concentrated_fills || 0) + d.concentrated,
        contrarian_fills: (ex.contrarian_fills || 0) + d.contrarian,
        categories,
        ...(newest
          ? {
              last_fill_at: iso(newest.timestamp),
              last_fill_usd: newest.usd,
              last_fill_side: newest.side,
              last_fill_price: newest.price,
              last_fill_outcome: newest.outcome || null,
              last_fill_title: newest.title || null,
              last_fill_event_slug: newest.eventSlug || null,
            }
          : {}),
        ...patch,
      };
      const merged = { ...ex, ...row };
      const sig = registryFlags(merged);
      row.flags = sig.flags;
      row.insider_score = sig.score;
      row.suspicious = sig.suspicious;
      rows.push(row);
    }
    for (const part of chunk(rows, 200)) must(await sb.from("wallets").upsert(part, { onConflict: "address" }));

    // 7. Remember the fills, forget old ones, record the run.
    const seenRows = fresh.map((t) => ({ trade_id: t.id, traded_at: iso(t.timestamp) }));
    for (const part of chunk(seenRows, 500)) must(await sb.from("wallet_fills_seen").upsert(part, { onConflict: "trade_id", ignoreDuplicates: true }));
    await sb.from("wallet_fills_seen").delete().lt("traded_at", new Date(Date.now() - KEEP_SEEN_DAYS * 86_400_000).toISOString());

    Object.assign(summary, {
      scanned: trades.length,
      fresh: fresh.length,
      wallets_new: newAddresses.length,
      checked: checked.size,
      skipped,
      stale: stale.length,
      backfill_offset: backfillOffset,
      backfill_done: backfillDone,
      ms: Date.now() - t0,
    });
    must(
      await sb.from("wallet_scan_state").upsert({
        id: 1,
        backfill_offset: backfillOffset,
        backfill_done: backfillDone,
        runs: (state.runs || 0) + 1,
        last_run_at: new Date().toISOString(),
        last_run_ms: Date.now() - t0,
        last_fills_scanned: trades.length,
        last_fills_new: fresh.length,
        last_wallets_new: newAddresses.length,
        last_wallets_checked: checked.size,
        last_error: null,
      })
    );
    return json(summary);
  } catch (err) {
    console.error("demo-wallets failed:", err);
    await sb.from("wallet_scan_state").upsert({ id: 1, last_run_at: new Date().toISOString(), last_error: String(err?.message || err).slice(0, 300) });
    return json({ ok: false, error: err?.message || String(err) }, 500);
  }
});

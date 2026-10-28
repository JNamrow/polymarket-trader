/**
 * Shared demo sandbox on Supabase. Same interface as the Base44 client, so
 * the rest of the app does not know the difference.
 *
 * Everyone who opens the demo sees the same portfolios. A scheduled Edge
 * Function (supabase/functions/demo-tick) ticks them every 5 minutes and a
 * cron job resets the whole sandbox on a schedule (supabase/migrations).
 * Personal things (followed wallets, alert settings) stay in the visitor's
 * own browser: the sandbox is shared, preferences are not.
 *
 * The browser talks to Supabase with the anon key. Row-level security limits
 * it to reading, creating and updating sandbox rows; deleting and resetting
 * happen only on the server. The wallet registry (public.wallets) is read-only.
 */
import { createClient } from '@supabase/supabase-js';
import { createLocalSettings, notInDemo } from './localClient';

const TABLES = { BotRun: 'bot_runs', Trade: 'trades', WhaleSignal: 'whale_signals' };

function orderOf(sort) {
  if (!sort) return null;
  const desc = sort.startsWith('-');
  return { column: desc ? sort.slice(1) : sort, ascending: !desc };
}

async function run(query, what) {
  const { data, error } = await query;
  if (error) throw new Error(error.message || `Sandbox ${what} failed`);
  return data;
}

function entity(sb, name) {
  const table = TABLES[name];
  if (!table) throw new Error(`No sandbox table for ${name}`);
  const ordered = (q, sort) => {
    const o = orderOf(sort);
    return o ? q.order(o.column, { ascending: o.ascending }) : q;
  };
  return {
    list: (sort, limit = 100, skip = 0) => run(ordered(sb.from(table).select('*'), sort).range(skip, skip + limit - 1), 'list'),
    filter: (query, sort, limit = 100, skip = 0) => run(ordered(sb.from(table).select('*').match(query || {}), sort).range(skip, skip + limit - 1), 'filter'),
    get: id => run(sb.from(table).select('*').eq('id', id).maybeSingle(), 'get'),
    create: row => run(sb.from(table).insert(row).select().single(), 'create'),
    bulkCreate: rows => (rows.length ? run(sb.from(table).insert(rows).select(), 'create') : Promise.resolve([])),
    update: (id, patch) => run(sb.from(table).update(patch).eq('id', id).select().single(), 'update'),
    delete: id => run(sb.from(table).delete().eq('id', id), 'delete').then(() => ({ ok: true })),
  };
}

export function createSandboxClient({ url, anonKey }) {
  const sb = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    shared: true,
    entities: { BotRun: entity(sb, 'BotRun'), Trade: entity(sb, 'Trade'), WhaleSignal: entity(sb, 'WhaleSignal') },
    auth: createLocalSettings('polybot-demo-settings'),
    integrations: { Core: { InvokeLLM: notInDemo('The AI brief') } },
    functions: { invoke: notInDemo('Server functions') },
    /** When the sandbox last reset, when it resets next, and when the server last ticked (demo_meta row 1). */
    meta: async () => {
      const { data } = await sb.from('demo_meta').select('*').eq('id', 1).maybeSingle();
      return data || null;
    },
    /**
     * Wallet registry (public.wallets): one row per wallet seen behind a fill
     * of $1,000 or more, grown by the demo-wallets Edge Function. Read-only here.
     */
    registry: {
      /** One page of wallets. `sort` must be a wallets column; see SORTS in WalletRegistry.jsx. */
      query: async ({ sort = 'score', dir = 'desc', page = 0, pageSize = 50, search = '', category = null, rated = false, fresh = false, suspicious = false } = {}) => {
        let q = sb.from('wallets').select('*', { count: 'exact' });
        if (rated) q = q.not('score', 'is', null);
        if (fresh) q = q.lte('wallet_age_days', 30);
        if (suspicious) q = q.eq('suspicious', true);
        if (category && category !== 'all') q = q.gt(`categories->${category}`, 0);
        const term = String(search || '').replace(/[%,()]/g, '').trim();
        if (term) q = q.or(`name.ilike.%${term}%,address.ilike.%${term}%`);
        const from = page * pageSize;
        const { data, error, count } = await q.order(sort, { ascending: dir === 'asc', nullsFirst: false }).order('address').range(from, from + pageSize - 1);
        if (error) throw new Error(error.message || 'Registry query failed');
        return { rows: data || [], total: count ?? 0 };
      },
      /** Registry size, how many wallets have stats, how many need a second look, and the last scan. */
      stats: async () => {
        const head = { count: 'exact', head: true };
        const [all, checked, suspicious, state] = await Promise.all([
          sb.from('wallets').select('address', head),
          sb.from('wallets').select('address', head).not('last_checked_at', 'is', null),
          sb.from('wallets').select('address', head).eq('suspicious', true),
          sb.from('wallet_scan_state').select('*').eq('id', 1).maybeSingle(),
        ]);
        return { total: all.count ?? 0, checked: checked.count ?? 0, suspicious: suspicious.count ?? 0, state: state.data || null };
      },
      /** Rows for a set of wallets, keyed by address (the live feed seeds its stats from these). */
      lookup: async addresses => {
        const unique = [...new Set(addresses.filter(Boolean))];
        const out = {};
        for (let i = 0; i < unique.length; i += 200) {
          const rows = await run(sb.from('wallets').select('*').in('address', unique.slice(i, i + 200)), 'lookup');
          for (const r of rows) out[r.address] = r;
        }
        return out;
      },
    },
  };
}

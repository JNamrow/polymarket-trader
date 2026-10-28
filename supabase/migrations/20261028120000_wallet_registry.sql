-- Wallet registry for the shared demo sandbox. Hand-written (not generated).
-- Filled by the demo-wallets Edge Function every 5 minutes: it pages through
-- Polymarket fills of $1,000 or more, keeps one row per wallet with that
-- wallet's public stats, trader score and insider flags, and refreshes stale
-- rows once a day. The browser only reads it (anon key, row-level security).

-- ─── One row per wallet ─────────────────────────────────────────────────────
create table if not exists public.wallets (
  address text primary key,
  name text,
  profile_image text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_checked_at timestamptz,            -- when stats were last fetched; null = never
  check_error text,
  -- lifetime stats (Data API /v2/user-stats)
  joined_at timestamptz,
  wallet_age_days double precision,
  markets_traded integer,
  trade_count integer,
  biggest_win double precision,
  realized_pnl double precision,
  unrealized_pnl double precision,
  total_pnl double precision,
  trade_pnl double precision,             -- what the Polymarket profile shows as Profit/Loss
  volume double precision,                -- cash volume (volume_usdc)
  volume_total double precision,          -- what the Polymarket profile shows as Total Volume
  fees_paid double precision,
  portfolio_value double precision,
  open_positions integer,
  top_share double precision,             -- share of the open book in the single biggest market
  -- settled positions (last 100) and the trader score built from them
  closed_count integer,
  win_rate double precision,
  profit_factor double precision,
  score integer,
  score_label text,
  -- insider signals, from the fills this registry has seen
  insider_score integer not null default 0,
  flags jsonb not null default '[]'::jsonb,
  suspicious boolean not null default false,
  -- fills seen by the registry (>= $1,000)
  fills_seen integer not null default 0,
  fills_usd double precision not null default 0,
  buy_usd double precision not null default 0,
  sell_usd double precision not null default 0,
  max_fill_usd double precision not null default 0,
  big_fills integer not null default 0,          -- >= $25k
  long_shot_fills integer not null default 0,    -- BUY at <= 30c
  concentrated_fills integer not null default 0, -- BUY >= 50% of the portfolio value
  contrarian_fills integer not null default 0,   -- against the crowd (BUY <= 30c or SELL >= 70c)
  last_fill_at timestamptz,
  last_fill_usd double precision,
  last_fill_side text,
  last_fill_price double precision,
  last_fill_outcome text,
  last_fill_title text,
  last_fill_event_slug text,
  categories jsonb not null default '{}'::jsonb, -- {"sports": 12, "politics": 3, ...} fills per category
  updated_date timestamptz not null default now()
);
drop trigger if exists wallets_updated on public.wallets;
create trigger wallets_updated before update on public.wallets for each row execute function public.set_updated_date();

create index if not exists wallets_score_idx on public.wallets ("score" desc nulls last);
create index if not exists wallets_last_seen_idx on public.wallets ("last_seen_at" desc);
create index if not exists wallets_last_fill_idx on public.wallets ("last_fill_at" desc nulls last);
create index if not exists wallets_fills_usd_idx on public.wallets ("fills_usd" desc);
create index if not exists wallets_trade_pnl_idx on public.wallets ("trade_pnl" desc nulls last);
create index if not exists wallets_volume_idx on public.wallets ("volume_total" desc nulls last);
create index if not exists wallets_insider_idx on public.wallets ("insider_score" desc);
create index if not exists wallets_check_idx on public.wallets ("last_checked_at" asc nulls first);

-- ─── Fills already counted (3-day memory, so a fill is never counted twice) ──
create table if not exists public.wallet_fills_seen (
  trade_id text primary key,
  traded_at timestamptz not null
);
create index if not exists wallet_fills_seen_at_idx on public.wallet_fills_seen ("traded_at");

-- ─── Market category cache (Gamma tags are fetched once per market) ─────────
create table if not exists public.market_tags (
  condition_id text primary key,
  category text not null default 'other',
  title text,
  updated_date timestamptz not null default now()
);

-- ─── Scan state (one row) ───────────────────────────────────────────────────
create table if not exists public.wallet_scan_state (
  id int primary key,
  backfill_offset int not null default 0,
  backfill_done boolean not null default false,
  runs int not null default 0,
  last_run_at timestamptz,
  last_run_ms int,
  last_fills_scanned int,
  last_fills_new int,
  last_wallets_new int,
  last_wallets_checked int,
  last_error text
);
insert into public.wallet_scan_state (id) values (1) on conflict (id) do nothing;

-- ─── Row-level security: the browser reads wallets, tags and the scan state ──
alter table public.wallets enable row level security;
alter table public.wallet_fills_seen enable row level security;
alter table public.market_tags enable row level security;
alter table public.wallet_scan_state enable row level security;

drop policy if exists "wallets read" on public.wallets;
create policy "wallets read" on public.wallets for select to anon, authenticated using (true);
drop policy if exists "tags read" on public.market_tags;
create policy "tags read" on public.market_tags for select to anon, authenticated using (true);
drop policy if exists "scan state read" on public.wallet_scan_state;
create policy "scan state read" on public.wallet_scan_state for select to anon, authenticated using (true);

grant select on public.wallets, public.market_tags, public.wallet_scan_state to anon, authenticated;
revoke all on public.wallet_fills_seen from public, anon, authenticated;

-- ─── Which of these fills are already counted (ids go in a POST body, not a URL) ──
create or replace function public.seen_fill_ids(ids text[]) returns setof text language sql stable security definer set search_path = public as $$
  select trade_id from public.wallet_fills_seen where trade_id = any(ids)
$$;
revoke all on function public.seen_fill_ids(text[]) from public, anon, authenticated;
grant execute on function public.seen_fill_ids(text[]) to service_role;

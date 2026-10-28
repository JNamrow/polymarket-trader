# PolyBot Terminal

An open-source autopilot for [Polymarket](https://polymarket.com).

Pick an amount. Pick a trader to copy or a strategy to run. Set it running. The engine watches live Polymarket data every minute, mirrors the trader (or applies the strategy), marks every position to market, and closes positions on the trader's exits or your own limits. Alongside it, a whale tracker shows where the big and the smart money is going, so you know who is worth copying.

Today the app **paper trades on real market data**. It reads real prices, books, positions and wallets, but it does not sign or send orders. "Live" portfolios track your real allocation with simulated fills until a backend signer is connected (see [Live execution](#live-execution-status)).

---

## What the app does

### Portfolios

1. **Amount** — paper money, or a live allocation checked against your real Polymarket balance.
2. **Follow** — either:
   - **Copy a trader.** Choose up to three wallets from Polymarket's leaderboard (by niche and window), from the wallets you follow, or by pasting an address. The wizard shows each wallet's book and what share of it your amount mirrors.
   - **Run a strategy.** One of six rule-based strategies on live markets, by category.
3. **Review** — name, duration (copy portfolios run until you stop them), position limits, optional stop-loss / take-profit. Launch.

Every running portfolio shows its P&L curve, open positions, settled trades and a live activity log of what the engine did and why.

### Whales

The place to find who to copy. Built only on Polymarket's public Data API.

- **Whale flow** — every taker fill above a size you choose ($1k to $100k), live, with the trader, side, price, size, market category and insider flags. Filters: side, category, "against the crowd", flagged, following.
- **Smart money** — the real leaderboard by niche (politics, sports, crypto, culture, finance, economics, tech) and window, next to a table of where its top traders sit *right now*: their pooled open positions per market, how many of them hold it, and a lean bar comparing their dollar split with the price the crowd pays.
- **Insider scan** — fills checked against the wallet's public history. Fresh accounts making concentrated, long-shot or very large bets get a "second look" tag. The rules are listed on the page and are a prompt to look closer, not proof.
- **Following** — wallets you starred, each with all-time P&L, book value and latest fills.
- **Trader profile** — click any trader anywhere: join date, markets traded, portfolio value, all-time P&L, cash volume, win rate, biggest win, a transparent trader score, a P&L chart (24h / 7d / 30d / all), open positions, settled positions and on-chain activity. From here: Follow, or Copy trader (opens the wizard pre-filled).
- **Alerts** — while the app is open: a followed wallet trades, a suspicious fresh account bets, a big contrarian fill, or a very large fill. A scheduled backend function stores the same signals every 5 minutes so there is history when you come back.

### Markets and wallet

- **Markets** — live explorer by category: YES price, 24h move, spread, volume, liquidity, time to resolution, 7-day history, order-book imbalance, the biggest holders of each side with their lean versus the price, and the latest big fills in that market.
- **Wallet** — save your Polymarket profile (proxy) address to see real USDC cash and position value; optionally connect a browser wallet (read-only). "Available" on the dashboard is real cash minus what live portfolios have allocated.

## How copy trading works

- Each pilot (wallet you copy) gets an equal share of the amount. **Scale** = that share ÷ the pilot's book value, so your positions keep the pilot's proportions. A $250 allocation copying a $250,000 book holds 0.1% of each position.
- **Mirror their book now** buys into every position the pilot holds at launch. **Copy new moves only** takes a snapshot and copies trades from then on.
- Every tick the engine reads the pilot's positions and compares them with the last snapshot: a new or bigger position is bought (at the live ask); a smaller one is trimmed by the same fraction; a closed one is sold. Partial sells become their own settled rows, so the record shows exactly what happened.
- Fills under $2 are skipped, so very small allocations only mirror the pilot's biggest positions. The wizard shows how many positions clear the minimum.
- Positions close when the pilot exits, when the market resolves, when the run ends, or when your own stop-loss / take-profit fires (off by default for copy portfolios).
- Limits: max positions (default 25) and max % of the amount per position (default 25%). If the pilot holds both sides of a market, the bot stays on the side it already holds.

## Strategies

| Strategy | Entry rule (live Gamma/CLOB data) | Exit rule |
| --- | --- | --- |
| **Momentum** | 24h move ≥ 3¢ with the 1h move agreeing; buy YES on up-moves, NO on down-moves | 1h reversal ≥ 3¢, or stop/target |
| **Mean reversion** | 1h move ≥ 4¢ in a liquid market; buy the side that just got cheaper | half the move retraces, or stop/target |
| **Sentiment** | order-book imbalance ≥ 25% within 5¢ of the touch, scaled by the 24h volume spike | imbalance flips ≤ −30%, or stop/target |
| **Market making** | deep markets with spread ≥ 2¢: join the bid on YES (passive fill assumed) | bid reaches entry + spread ("spread captured"), or stop |
| **Arbitrage** | NegRisk events where every YES costs < $1 total (complete outcome sets only) or every NO costs < $(n−1): buy the whole basket | hold to settlement, or close early when bids sum to the payout |
| **Custom** | buy YES at or below your entry price | sell at your exit price, or stop |

Guard rails that apply to every strategy:

- Markets ending within 6 hours and in-play sports games are never traded.
- Stops and targets need a move of at least 2¢ so the spread alone cannot stop a position out. A stop or target of 0 is off.
- A market exited by a bot is off-limits to that bot for 6 hours.
- An entry is skipped if the fresh CLOB ask moved more than 5% above the scan price.
- Paper fills are taker fills: buy at the ask, sell at the bid. Open positions are marked at the bid, so a new position starts slightly negative by the spread. That is deliberate.

These are transparent starting rules for paper trading, not a claim that they make money.

### Sizing

Strategy positions use fractional Kelly. For a contract bought at price *p* with an estimated win probability *q*, full Kelly is *f\* = (q − p) / (1 − p)*; the bot's Kelly fraction (¼, ½, ¾, 1) scales it down and every position is capped at the bot's max % per position and at the cash it has left. Market-making quotes use half the per-position cap (no edge estimate), and arbitrage baskets are risk-free at entry so they only respect the cap. Copy positions are sized by scale, as above.

## Whale signals, in the open

All of this is computed in `src/engine/wallets.js` from public data. Nothing is a black box.

**Trader score (0–100)** — 40 profitability (realized P&L ÷ cash volume, −20%…+20%), 20 hit rate (share of settled positions that made money), 10 profit factor (gross wins ÷ gross losses, capped at 3), 10 experience (markets traded, capped at 50), 10 track record (account age, capped at a year), 10 discipline (full marks when no market holds more than 25% of the book). Fewer than 5 settled positions → "Unrated".

**Insider flags** — fresh account (joined ≤ 30 days: 35 points, ≤ 7 days: 45), few markets (≤ 3: 20), concentrated (one fill ≥ 50% of the book: 20), long shot (bought at ≤ 30¢: 15, ≤ 15¢: 20), big size (≥ $25k: 10, ≥ $100k: 15). "Second look" = fresh **and** at least one conviction flag.

**Lean / gap** — the biggest holders of each side (or the pooled positions of the top traders) are dollar-weighted. Across a whole market the YES share equals the YES price exactly, because every $1 mints one YES and one NO. So `gap = whale YES share − price`: positive means the whales lean YES more than the crowd.

**Against the crowd** — a BUY at ≤ 30¢ or a SELL at ≥ 70¢.

## Live execution status

| Piece | Status |
| --- | --- |
| Market, wallet and fill data (Gamma, CLOB, Data APIs) | live |
| Paper trading and copy trading on real prices and books | live |
| Scheduled server-side ticks (`botTick`) and whale scanner (`whaleScan`) | deploy with `npx base44 deploy` (see below) |
| Real wallet balances and positions | live, read-only |
| Order placement | **not connected** |

Real orders need an EIP-712 signature from a wallet key plus CLOB API credentials. That has to live in a backend function with the credentials stored as Base44 secrets, never in the browser. Until that signer exists, portfolios labelled "Sim fills" never move funds.

## Architecture

```
┌─────────────────────────────────┐        ┌──────────────────────────────────────┐
│  React + Vite frontend          │        │  Base44 backend                      │
│  src/                           │  SDK   │  entities: BotRun, Trade,            │
│  • Portfolios (wizard, bots)    │◄──────►│            WhaleSignal, User         │
│  • Whales / Markets / Settings  │        │  auth, per-user settings             │
│  • useBotEngine (1 min ticks)   │        │  functions/botTick   (Deno, 5 min)   │
│  • useTraders / useWhaleAlerts  │        │  functions/whaleScan (Deno, 5 min)   │
└───────────────┬─────────────────┘        └──────────────────┬───────────────────┘
                │ imports src/engine                           │ imports base44/shared/engine
                ▼                                              ▼
        ┌──────────────────────────────────────────────────────────────┐
        │  the engine  (pure JS, same files in both places)            │
        │  polymarketApi.js  Gamma / CLOB / Data API calls             │
        │  markets.js        normalize Gamma markets and events        │
        │  strategies.js     six strategies + copy, scan() / exits     │
        │  sizing.js         Kelly, caps, basket sizing                │
        │  tick.js           runTick(ctx): opens / sells / closes /    │
        │                    marks / bot patch; planCopyDeltas()       │
        │  engine.js         executeTick: fetch → runTick → write      │
        │  wallets.js        trader score, insider flags, lean, alerts │
        └──────────────────────────────┬───────────────────────────────┘
                                       │ HTTPS (public, CORS *)
                                       ▼
          gamma-api.polymarket.com · clob.polymarket.com · data-api.polymarket.com
          polygon RPC (publicnode / 1rpc / drpc) for USDC balances
```

- **Frontend**: React 18, Vite, Tailwind, shadcn/ui, TanStack Query, Recharts. Pages in `src/pages`, features in `src/components/{dashboard,bot-setup,whales,markets}`.
- **Base44**: hosting, auth, the entity database, scheduled functions and the LLM integration. The SDK client is `src/api/base44Client.js`. Entity schemas (with row-level security) are in `base44/entities/*.jsonc`.
- **Engine**: `src/engine` has no React and no SDK calls. `executeTick` takes an `api` adapter (`createTrades`, `updateTrades`, `updateBot`) so the browser uses the user's client and the backend uses the service role. Base44's preview sandbox only serves `src/`, and backend functions can only import from `base44/shared/`, so the engine is edited in `src/engine` and copied to `base44/shared/engine` with `npm run engine:sync` (`npm run lint` fails if the copies differ).
- **Scheduler**: the browser hook ticks every 60 s while the dashboard is open; `botTick` runs every 5 minutes on the server. Whichever side ticked a bot within the last few minutes wins, so there is no double processing. `whaleScan` stores notable fills every 5 minutes.
- **Rate limits**: the Data API answers bursts with 429. Wallet lookups go through a 4-wide concurrency gate (`createLimiter`) and `getJson` retries 429/5xx with a pause.

### Data model

**BotRun** — one portfolio. Config: `name, algorithm (momentum | mean_reversion | sentiment | market_making | arbitrage | custom | copy), categories, fund_allocation, duration_hours (0 = until stopped), is_paper, kelly_fraction, order_type, neg_risk, custom_params, max_positions, stop_loss_pct, take_profit_pct (0 = off), max_position_pct, copy_wallets [{ address, name, profileImage }], copy_mode (mirror | new_only)`. State written by the engine: `status, current_value, pnl, pnl_percent, realized_pnl, unrealized_pnl, positions_bought/sold, open_positions, avg_edge, markets_scanned, ticks, last_tick_at, last_error, pnl_history[], activity_log[], entry_cooldowns{}, copy_state{}`.

**Trade** — one lot. `bot_run_id, market_name, market_id (condition id), token_id, outcome (YES|NO), outcome_label, side (buy|sell), entry_price, quantity, size_usdc, status (open|closed), current_price, unrealized_pnl, exit_price, exit_time, exit_reason, pnl, edge_at_entry, est_prob, signal, signal_value, signal_reason, fill_mode, pilot_address, basket_id, basket_payout, market_url`. A copy trim creates a closed `sell` row for the part sold and shrinks the open lot.

**WhaleSignal** — one notable fill stored by `whaleScan`: the fill, its category, `kinds (whale | contrarian | insider)`, `flags`, `insider_score`, `suspicious`, and the wallet's age, market count, P&L and book value at scan time. Readable by every signed-in user, written only by the backend.

**User** (extra fields via `auth.updateMe`) — `polymarket_address, browser_wallet, wallet_balance, default_fund, default_algorithm, watched_wallets[], whale_alerts { minUsd, followed, insiders, contrarian }`.

## Project structure

```
base44/
  config.jsonc              app name + site build settings
  entities/                 BotRun, Trade, WhaleSignal, User schemas (+ rls)
  functions/botTick/        scheduled engine tick (entry.ts + function.jsonc)
  functions/whaleScan/      scheduled whale scanner
  shared/engine/            mirror of src/engine for the backend (npm run engine:sync)
scripts/sync-engine.mjs     copies / checks that mirror
src/
  engine/                   the engine: polymarketApi, markets, strategies, sizing, tick, engine, wallets
  api/base44Client.js       Base44 SDK client
  api/polymarket.js         Polymarket API re-exports + formatting helpers
  lib/engine/useBotEngine.js  in-browser scheduler for the engine
  lib/useTraders.js         React Query hooks for fills, wallets, holders, leaderboards
  lib/useFollowing.js       followed wallets + alert preferences (on the User record)
  lib/useWhaleAlerts.js     live alerts + stored signals
  lib/useUserProfile.js     user settings + live wallet funds
  lib/wallet.js             read-only Polygon / browser-wallet helpers
  pages/                    Dashboard, Settings
  components/bot-setup/     portfolio wizard, pilot picker, strategy cards, risk controls
  components/dashboard/     stats, P&L chart, running portfolios, completed runs, detail modal
  components/whales/        whale flow, smart money, insider scan, following, alerts, trader drawer
  components/markets/       live market explorer (+ holders and big fills per market)
```

## Run it yourself

```bash
git clone https://github.com/JNamrow/polymarket-trader.git
cd polymarket-trader
npm install
```

**Frontend + Base44 backend.** Create a free Base44 app, then:

```bash
npx base44 login      # once, opens the browser
npx base44 link       # writes the git-ignored base44/.app.jsonc for your app
npx base44 deploy -y  # pushes entities (with RLS) and both scheduled functions
npx base44 dev        # local backend + Vite dev server
```

`npm run build` builds the site, `npm run lint` runs ESLint and checks the engine mirror, `npm run engine:sync` refreshes the mirror after editing `src/engine`.

**Engine without the UI.** `src/engine` runs in Node or Deno: import `executeTick` from `src/engine/engine.js` and pass an in-memory `api` adapter, or call `runTick` with your own `ctx`.

## Base44 ↔ GitHub sync

The app is connected to this repository with Base44's two-way GitHub sync:

- Edits made inside the Base44 builder are committed to `main`.
- Commits pushed to `main` are pulled into the Base44 app within about a minute (a push webhook notifies Base44). Click **Publish** in Base44 to make them live for users.
- Only the `main` branch syncs. Work on branches, then merge to `main`.
- Entity schema changes in `base44/entities` deploy on sync. Backend functions and their schedules deploy with `npx base44 deploy` (local `function.jsonc` files are the source of truth; dashboard edits are overwritten on the next deploy).
- With a *per user* GitHub connection (Workspace settings → GitHub), builder commits show under your own GitHub account instead of Base44's bot.

## Contributing

Issues and pull requests are welcome. Keep the engine pure (no React, no SDK calls in `src/engine`), run `npm run lint` before you push, and describe any change to a trading rule in the README table it belongs to.

## Roadmap

- Backend signer: CLOB API key/secret/passphrase as Base44 secrets, EIP-712 order signing, real GTC/FOK/FAK execution behind the existing `order_type` setting.
- Copy trading: per-pilot weights, a cap on total exposure per market across pilots, and a "closed positions of the pilot" view.
- Resolution tracking for closed-but-unsettled baskets, and redeem reminders.
- Email or push notifications from the stored signals.
- Backtests of each strategy against CLOB price history.

## Disclaimer

Prediction-market trading can lose money. The strategies and signals here are simple, public rules intended for paper trading and research. Copying a wallet copies its losses as well as its wins. Nothing in this repository is financial advice.

## License

[MIT](LICENSE) © 2026 Jacob Namrow

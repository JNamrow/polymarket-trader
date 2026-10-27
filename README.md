# PolyBot Terminal

A dashboard for running rule-based trading bots on [Polymarket](https://polymarket.com) prediction markets.

You pick a strategy, an amount of USDC, market categories and risk limits. The engine then scans live Polymarket markets every minute, opens positions when a strategy's rule fires, marks them to market, and closes them on your stop-loss, take-profit or the strategy's own exit rule. Every bot keeps a live activity log, a P&L curve and a full trade list.

Today the app **paper trades on real market data**. It reads real prices, real order books and real wallets, but it does not sign or send orders. "Live" bots track your real allocation with simulated fills until a backend signer is connected (see [Live execution](#live-execution-status)).

---

## What the app does

- **Bots** — launch paper experiments or live-allocation bots with one of six strategies, a Kelly fraction, an order type, categories, duration and risk controls (max positions, stop-loss %, take-profit %, max % per position).
- **Engine** — a shared, pure trading engine (`src/engine`, mirrored to `base44/shared/engine`) that runs in the browser while the dashboard is open and in a scheduled Base44 backend function every 5 minutes when it is not. Both sides skip a bot the other side ticked recently.
- **Bot detail** — live activity log straight from the engine (scans, signals, fills, exits, errors), open positions marked at the current bid, closed trades with exit reasons, the bot's P&L curve, and an optional AI brief of the run (Base44 LLM integration).
- **Markets** — a live explorer of Polymarket markets by category: YES price, 24h move, spread, 24h volume, liquidity, time to resolution, 7-day price history and order-book imbalance, with links to Polymarket.
- **Watchlist** — the real Polymarket leaderboard (24h / 7d / 30d / all time, by P&L or volume) and any wallets you choose to track, each expandable to its live open positions.
- **Wallet** — save your Polymarket profile (proxy) address to see your real USDC cash and position value; optionally connect a browser wallet (read-only, no signing) to read its Polygon USDC balance. "Available" on the dashboard is your real cash minus what live bots have allocated.

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
- Stops and targets need a move of at least 2¢ so the spread alone cannot stop a position out.
- A market exited by a bot is off-limits to that bot for 6 hours.
- An entry is skipped if the fresh CLOB ask moved more than 5% above the scan price.
- Paper fills are taker fills: buy at the ask, sell at the bid. Open positions are marked at the bid, so a new position starts slightly negative by the spread. That is deliberate.

These are transparent starting rules for paper trading, not a claim that they make money.

### Sizing

Position size is fractional Kelly. For a contract bought at price *p* with an estimated win probability *q*, full Kelly is *f\* = (q − p) / (1 − p)*; the bot's Kelly fraction (¼, ½, ¾, 1) scales it down and every position is capped at the bot's max % per position and at the cash it has left. Market-making quotes use half the per-position cap (no edge estimate), and arbitrage baskets are risk-free at entry so they only respect the cap.

## Live execution status

| Piece | Status |
| --- | --- |
| Market data (Gamma, CLOB, Data APIs) | live |
| Paper trading on real prices and books | live |
| Scheduled server-side ticks | `base44/functions/botTick` runs every 5 minutes (deployed with the app's backend) |
| Real wallet balances and positions | live, read-only |
| Order placement | **not connected** |

Real orders need an EIP-712 signature from a wallet key plus CLOB API credentials. That has to live in a backend function with the credentials stored as Base44 secrets, never in the browser. Until that signer exists, bots labelled "Sim fills" never move funds.

## Architecture

```
┌─────────────────────────────┐        ┌──────────────────────────────────┐
│  React + Vite frontend      │        │  Base44 backend                  │
│  src/                       │  SDK   │  entities: BotRun, Trade, User   │
│  • Dashboard / Markets /    │◄──────►│  auth, per-user settings         │
│    Watchlist / Settings     │        │  functions/botTick (Deno, cron)  │
│  • useBotEngine (1 min)     │        │  integrations.Core.InvokeLLM     │
└──────────────┬──────────────┘        └───────────────┬──────────────────┘
               │ imports src/engine                    │ imports base44/shared/engine
               ▼                                       ▼
        ┌──────────────────────────────────────────────────────┐
        │  the engine  (pure JS, same files in both places)    │
        │  markets.js   normalize Gamma markets/events         │
        │  strategies.js six strategies, scan() + exitReason() │
        │  sizing.js    Kelly, caps, basket sizing             │
        │  tick.js      runTick(ctx) → opens/closes/marks/patch│
        │  engine.js    executeTick: fetch → runTick → write   │
        │  polymarketApi.js  Gamma / CLOB / Data API calls     │
        └──────────────────────────┬───────────────────────────┘
                                   │ HTTPS (public, CORS *)
                                   ▼
             gamma-api.polymarket.com · clob.polymarket.com · data-api.polymarket.com
             polygon RPC (publicnode / 1rpc / drpc) for USDC balances
```

- **Frontend**: React 18, Vite, Tailwind, shadcn/ui, TanStack Query, Recharts. Pages live in `src/pages`, feature components in `src/components/{dashboard,bot-setup,markets,watchlist}`.
- **Base44**: hosting, auth, the entity database and the LLM integration. The SDK client is `src/api/base44Client.js`. Entity schemas are in `base44/entities/*.jsonc`.
- **Engine**: `src/engine` has no React and no SDK calls. `executeTick` takes an `api` adapter (`createTrades`, `updateTrades`, `updateBot`) so the browser uses the user's client and the backend uses the service role. Base44's preview sandbox only serves `src/`, and backend functions can only import from `base44/shared/`, so the engine is edited in `src/engine` and copied to `base44/shared/engine` with `npm run engine:sync` (`npm run lint` fails if the copies differ).
- **Scheduler**: `base44/functions/botTick/function.jsonc` declares a 5-minute automation. The browser hook ticks every 60 s; whichever side ticked a bot within the last few minutes wins, so there is no double processing.

### Data model

**BotRun** — one bot. Config: `name, algorithm, categories, fund_allocation, duration_hours, is_paper, kelly_fraction, order_type, neg_risk, custom_params, max_positions, stop_loss_pct, take_profit_pct, max_position_pct`. State written by the engine: `status, current_value, pnl, pnl_percent, realized_pnl, unrealized_pnl, positions_bought/sold, open_positions, avg_edge, markets_scanned, ticks, last_tick_at, last_error, pnl_history[], activity_log[], entry_cooldowns{}`.

**Trade** — one position. `bot_run_id, market_name, market_id (condition id), token_id, outcome (YES|NO), entry_price, quantity, size_usdc, status (open|closed), current_price, unrealized_pnl, exit_price, exit_time, exit_reason, pnl, edge_at_entry, est_prob, signal, signal_value, signal_reason, fill_mode, basket_id, basket_payout, market_url`.

**User** (extra fields via `auth.updateMe`) — `polymarket_address, browser_wallet, wallet_balance, default_fund, default_algorithm, watched_wallets[]`.

## Project structure

```
base44/
  config.jsonc              app name + site build settings
  entities/                 BotRun, Trade, User schemas
  functions/botTick/        scheduled engine tick (entry.ts + function.jsonc)
  shared/engine/            mirror of src/engine for the backend function (npm run engine:sync)
scripts/sync-engine.mjs     copies / checks that mirror
src/
  engine/                   the trading engine: markets, strategies, sizing, tick, engine, polymarketApi
  api/base44Client.js       Base44 SDK client
  api/polymarket.js         Polymarket API re-exports + formatting helpers
  lib/engine/useBotEngine.js  in-browser scheduler for the engine
  lib/useUserProfile.js     user settings + live wallet funds hooks
  lib/wallet.js             read-only Polygon / browser-wallet helpers
  pages/                    Dashboard, Settings
  components/dashboard/     stats, P&L chart, live bots, completed runs, bot detail
  components/bot-setup/     launch modal, algorithm picker, categories, risk controls
  components/markets/       live market explorer
  components/watchlist/     leaderboard + tracked wallets
```

## Local development

```bash
git clone https://github.com/JNamrow/polymarket-trader.git
cd polymarket-trader
npm install
npx base44 login      # once
npx base44 link       # writes the git-ignored base44/.app.jsonc for this app
npx base44 dev        # local backend + Vite dev server
```

`npm run build` builds the site, `npm run lint` runs ESLint and checks the engine mirror, `npm run engine:sync` refreshes the mirror after editing `src/engine`. The engine can be exercised from Node or Deno without the UI by importing `src/engine/engine.js` and passing an in-memory `api` adapter.

## Base44 ↔ GitHub sync

The app is connected to this repository with Base44's two-way GitHub sync:

- Edits made inside the Base44 builder are committed to `main` automatically.
- Commits pushed to `main` here are pulled into the Base44 app (a push webhook notifies Base44). Click **Publish** in Base44 to make them live for users.
- Only the `main` branch syncs. Work on branches, then merge to `main`.
- Commits from the builder are attributed to whoever the workspace's GitHub connection is set to. Workspace settings → GitHub → a *per user* connection makes builder commits show under your own GitHub account instead of Base44's bot.

## Roadmap

- Backend signer: CLOB API key/secret/passphrase as Base44 secrets, EIP-712 order signing, and real GTC/FOK/FAK execution behind the existing `order_type` setting.
- Resolution tracking for closed-but-unsettled baskets, and redeem reminders.
- Notifications when a run finishes or a stop fires.
- Backtests of each strategy against CLOB price history.

## Disclaimer

Prediction-market trading can lose money. The strategies here are simple, public rules intended for paper trading and research. Nothing in this repository is financial advice.

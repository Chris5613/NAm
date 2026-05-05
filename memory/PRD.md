# Net Worth Tracker - PRD

## Problem Statement
Track personal net worth and all investments (stocks, crypto wallets, DeFi, crypto investment projects, manual phones/other assets, mining) in a 100% client-side web app. No backend, no database — all data persisted in localStorage.

## Architecture
- **Frontend**: React + Tailwind + Shadcn UI + Recharts
- **Backend**: FastAPI stub only (`/api/health`) so K8s supervisor stays happy. Zero business logic.
- **Storage**: Browser `localStorage` exclusively
- **External APIs (called direct from browser)**:
  - CoinStats (multi-chain wallet balances)
  - Jupiter (`/v1/positions` — Solana DeFi)
  - eBay via RapidAPI (phone resale prices)
  - CoinGecko (crypto prices, including `gmt-token` for GoMining)
  - Finnhub (stock prices)
  - Bitcoin/Solana RPCs (BTC/SOL native balances)

## User Personas
- Single user (no auth) managing personal finances and investments

## What's Been Implemented (Feb 2026)
- Backend stripped to a 38-line stub — app is 100% client-side
- CoinStats integration with chain mapping (ETH/BSC/Polygon/Solana/etc.)
- Jupiter DeFi positions migrated to `/v1/positions` with 5-shape parser
- eBay RapidAPI phone prices (sequential fetch, 1h sessionStorage cache)
- "Other Assets" manual entry (inline forms)
- Real-time Net Worth chart on Dashboard (15s tick, 60s background wallet sync, rolling localStorage history)
- Hi-Lo dynamic sorting across asset breakdowns
- GoMining tab — pickaxe icon, inline-editable rows, live GMT price (CoinGecko), Reward = `PR − Electricity + Service + (GMT × GMT_price)`
- **GoMining → Investment Overview sync (Feb 2026 latest)** — `Save & Sync` button compares current rewards to last-synced snapshot; popup lists each row's `prev → new (+delta)` plus total; on confirm auto-creates "GoMining" project (if missing), appends one earning transaction per increased row, bumps `project.earned` by total delta. Idempotent (badge disappears after sync).
- **Nosana auto-sync (May 2026)** — Crypto tab has a "Nosana Node Earnings" card. User stores their node's Solana pubkey; the app calls the official Nosana dashboard API (`https://dashboard.k8s.prd.nos.ci/api/stats/earning-history?address=…&start_date=…&end_date=…&group_by=month`) at **23:45 UTC** daily (with catch-up if the app opens after that time) plus a manual "Sync now" button. Each day's USD earnings becomes a transaction (`source: 'nosana'`, `source_date: 'YYYY-MM-DD'`) on a "Nosana" investment project (auto-created). Idempotent — same date+amount is a no-op; intra-day amount changes update the existing transaction. Anti-double-dip is automatic: earnings come straight from Nosana's API, so wallet swaps never count. Edit/delete reversal mirrors GoMining (txn delete drops the date from the synced map and re-arms the next sync).
- **Integrations tab (May 2026)** — consolidated home (`/integrations`) for external-project auto-sync cards. Currently hosts Nosana and RollerCoin.
- **RollerCoin manual sync (May 2026)** — No public API, so this is a balance-delta flow. User sets a baseline TRX amount; the "Update balance" dialog computes `newBalance − baseline`, previews the delta in TRX and live USD (CoinGecko `tron`), and lets the user classify it: **Earned** (credits delta to the RollerCoin investment project as a `source: 'rollercoin'` transaction, baseline advances), **Withdrew** (baseline lowers, no earning), or **No change** (resets the stale nudge). An orange `update needed` badge appears when the last update is >7 days old. Edit/delete on a synced transaction decrements project.earned AND the baseline by the same TRX amount so the next update re-arms correctly.
- **Nosana "today only" tracking (Feb 2026 — current)** — Sync logic now persists a `start_tracking_date` cursor (defaults to the day setup runs) and filters API earnings to days ≥ cursor, so first-time setup never backfills weeks of history. A `resetNosanaSyncHistory()` helper deletes all auto-synced txns, clears the synced map, and bumps the cursor to today. `runTodayOnlyMigrationIfNeeded()` runs once on app boot for demo-seeded users to collapse the legacy 35-day backfill to a clean slate. Config dialog now exposes a "Reset sync history" button (two-click confirm) so users can purge synced history any time.
- **Acurast Phone Farm manual sync (Feb 2026 — current)** — Mirrors the RollerCoin/TRX flow exactly but with the Acurast (`acurast`) CoinGecko price feed and the **"Phone Farm"** investment project as the default target. User stores their current ACU balance; "Update balance" dialog computes `newBalance − baseline` in ACU + live USD, classifies as Earned / Withdrew / No change. Posts `source: 'acurast'` + `source_acu_delta` transactions; baseline + project.earned reverse correctly on edit/delete via the shared hook in api.js. Card uses cyan accent + `Smartphone` icon. Includes a one-shot `runAcurastUsdToAcuMigrationIfNeeded()` migration that wipes any earlier USD-prototype config (and its synced txns) on first load after the data-model switch.
- **Unity Network manual sync (Feb 2026 — current)** — Plain USD balance-delta tracker (no token-price hop). User enters their current USD total from the Unity Network dashboard (starts at $0.00); deltas post as `source: 'unity_network'` + `source_usd_delta` earnings to the **same "Phone Farm" investment project as Acurast** for one consolidated phone-farm P&L line. Indigo accent + `Network` icon. Same Earned/Withdrew/No-change classification + edit/delete reversal hook in api.js (decrements baseline_usd + project.earned).
- **Editable & undo-able auto-synced transactions (Feb 2026 latest)** — auto-synced transactions are tagged `source: 'gomining'` + `source_row_id` and visibly badged in the Transactions dialog. Editing or deleting them via the Investment Overview reverses/adjusts both the GoMining synced snapshot and `project.earned`, so the GoMining tab's pending badge re-arms when appropriate. GoMining page listens to focus/storage events to stay live.
- **Daily auto-snapshot (Feb 2026 latest)** — `App.js` mounts a one-shot effect that appends a net-worth snapshot to `networth_history` if the latest snapshot's calendar day is not today. StrictMode-safe via module-level guard.
- **Snapshot source markers (Feb 2026 latest)** — every snapshot is tagged with `source: 'auto' | 'manual'`; the Net Worth chart renders emerald circles for auto-snapshots and yellow diamonds for manual ones, with an inline legend showing counts and a Tooltip distinguishing the two on hover.

## Storage Keys (localStorage)
- `networth_assets`, `networth_phones`, `networth_wallets`, `networth_projects`
- `networth_tokens`, `networth_prefs`, `networth_crypto_cache`
- `networth_history`, `networth_live_history`
- `networth_gomining`, `networth_gomining_synced` (map of `{rowId: lastSyncedReward}`)

## Prioritized Backlog
### P0 — Done
- [x] 100% client-side migration
- [x] CoinStats / Jupiter / eBay integrations
- [x] Real-time Net Worth chart + manual Other Assets
- [x] GoMining tab with live GMT price
- [x] GoMining → Investment Overview sync with confirmation popup
- [x] Editable / deletable auto-synced GoMining transactions (with snapshot reversal)
- [x] Daily auto-snapshot of net-worth history
- [x] Visual markers on the history chart distinguishing auto vs manual snapshots

### P1 — Pending
- [ ] JSON Export/Import for full localStorage backup & restore
- [ ] CSV import for bulk phone entries

### P2 — Future
- [ ] Asset allocation target vs actual
- [ ] Multi-currency support
- [ ] Goal tracking (target net worth)
- [ ] Asset grouping/tagging
- [ ] Per-asset performance detail page

## Next Tasks
1. JSON Export/Import — single button on settings/dashboard to dump and restore all `networth_*` localStorage keys
2. Visual marker on the net-worth history chart for daily auto-snapshots vs manual ones

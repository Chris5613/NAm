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

### P1 — Pending
- [ ] JSON Export/Import for full localStorage backup & restore
- [ ] CSV import for bulk phone entries
- [ ] Auto-snapshot scheduling for net-worth history (daily)

### P2 — Future
- [ ] Asset allocation target vs actual
- [ ] Multi-currency support
- [ ] Goal tracking (target net worth)
- [ ] Asset grouping/tagging
- [ ] Per-asset performance detail page

## Next Tasks
1. JSON Export/Import — single button on settings/dashboard to dump and restore all `networth_*` localStorage keys
2. Optional: undo/edit individual GoMining sync transactions from Investment Overview

# Net Worth Tracker - PRD

## Problem Statement
Build a website to track net worth and all investments including stocks, crypto, crypto projects, cash/bank accounts, and debts/liabilities.

## Architecture
- **Frontend**: React + Tailwind + Shadcn UI + Recharts
- **Backend**: FastAPI + MongoDB (Motor async driver)
- **External APIs**: CoinGecko (crypto prices), Alpha Vantage (stock prices)

## User Personas
- Single user (no auth) managing personal finances and investments

## Core Requirements
- Track assets across 5 categories: stocks, crypto, cash, crypto_projects, debts
- Real-time price fetching for crypto (CoinGecko) and stocks (Alpha Vantage)
- Net worth calculation with category breakdown
- Historical net worth tracking via snapshots
- Portfolio breakdown visualization (pie chart)
- Net worth over time visualization (line chart)
- CRUD operations for all assets

## What's Been Implemented (Feb 2026)
- Full CRUD API for assets (/api/assets)
- Net worth calculation & snapshot system (/api/net-worth)
- CoinGecko integration for crypto prices (/api/prices/crypto)
- Alpha Vantage integration for stock prices (/api/prices/stock)
- Bulk price refresh endpoint (/api/prices/refresh)
- Dark theme dashboard with bento grid layout
- Net worth hero card with category breakdown
- Portfolio pie chart (Recharts)
- Net worth history line chart (Recharts)
- Asset list with category tabs (All/Stocks/Crypto/Cash/Projects/Debts)
- Add/Edit/Delete asset dialogs
- Fonts: Outfit (headings), Manrope (body), Space Mono (numbers)

## Prioritized Backlog
### P0
- [x] Asset CRUD
- [x] Net worth calculation
- [x] Dashboard with charts
- [x] Price fetching (CoinGecko + Alpha Vantage)

### P1
- [ ] Auto-scheduled price refresh (background job)
- [ ] Auto-snapshot scheduling (daily/weekly)
- [ ] Better empty states for history chart

### P2
- [ ] Asset allocation target vs actual
- [ ] Import/export CSV
- [ ] Multiple currency support
- [ ] Goal tracking (target net worth)
- [ ] Asset grouping/tagging

## Next Tasks
1. Add Alpha Vantage API key for real stock price data
2. Implement auto-refresh scheduler
3. Add more detailed individual asset performance page

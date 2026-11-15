# NAm full codebase integration, calculation-ownership and dead-code audit

**Date:** November 15, 2026 (Pacific)  
**Repository:** `Chris5613/NAm`, `main` (last inspected application commit `621cba66854580c53bd32aa1b935798b6cdd4350`)  
**Disposition:** **NOT FULLY MIGRATED / NOT DEAD-CODE CLEAN / NOT SECURITY-CLEAN.**  
**Distinction:** The earlier **six-of-six release checklist** was accepted for the defined financial integrity rollout; it was **not** a claim of zero client-owned calculations, no unused code, or every feature having a backend calculation endpoint.

> **Scope update from owner (November 15):** The user narrowed this
> review to the active sidebar pages: **Home, Spending, Crypto Dashboard,
> Financials, Mining Power**. Crypto Dashboard's **embedded Passive Income**
> content is in scope. Standalone routes that are not in the sidebar may be
> ignored unless loaded by one of these pages. Cloud betting is explicitly
> retired. Therefore broad original findings about standalone Delivery,
> Investment Overview, and Monthly Changes do not individually block the
> narrowed migration, although shared libraries still matter if live sidebar
> pages import them.
>
> **Executed cleanup:** Removed `frontend/src/pages/CloudPage.jsx`,
> `frontend/src/lib/cloudBetting.js`, its test, `MlbSlate.jsx`,
> `mlb-api.js` and `odds.js` after checking their source references;
> `/cloud` now redirects to Home. Preserved old saved Cloud betting
> records in PostgreSQL rather than deleting financial/account data.
> Removed an unused `currentRate`/Pacific time-of-use tariff calculator
> and its constant from the live Crypto Dashboard, which instead consumes
> backend power tariff output. Also removed dead derived project total
> variables; these changes did not modify provider earnings.
>
> **Narrowed release assessment:** The source review still shows remaining
> browser-side accounting/aggregation in **Spending** (totals, cash flow,
> categories, charts), **Crypto Dashboard's embedded Passive Income and
> per-project ROI summaries**, **Home's net-worth trends fallback** and
> some **Financials display totals**. Core Home/Financials accounting and
> power readings are backend-owned. The browser uses a server-backed
> store but that is not equivalent to server-owned calculation. This
> narrow-scope backend-only migration remains **NOT CERTIFIED**. More work,
> parity tests, and a full authenticated 5-page browser journey are needed.
>
## Implementation follow-up: current sidebar calculation ownership

The owner narrowed the release-quality code audit to the five **sidebar pages**
and any content embedded in them. These are the results of further changes,
separate from the earlier broad initial snapshot:

| Current sidebar page | Verified server-owned calculation paths | Remaining browser-owned / scope limitations |
| --- | --- | --- |
| **Home** | Main business assets, net worth and daily/monthly trends | Retired browser-calculated trends fallback; visual formatting and graph projection still run in React |
| **Spending** | Added authenticated `POST /api/spending/analytics/preview`: user-scoped PostgreSQL transaction totals, income, cashflow, category shares, month-to-month trends, monthly/YTD chart data. React now consumes strictly validated backend results and clearly displays unavailable state | The backend receives passive month values from the existing authenticated income-history consumer; budget display ratio is still calculated for UI. No authenticated all-click production journey yet |
| **Crypto Dashboard** | Booked monthly income, actual today, portfolio/Bitcoin and Hardware Payback via backend hooks | Per-project ROI/daily preview, some card sorting/progress and embedded **Passive Income** providers/chart transforms still execute browser math; frozen Lulo calculations must not be changed |
| **Financials** | Server owns balance rows, current ledger, recognized revenue/profit, trial balance, start/end Balance Sheet/net-change subtotals and cash flow movements. Saved archived closings are totaled by backend independently of unposted current ledger | Journal editor's visible debits/credits, some P&L display decomposition and other presentation-only transforms remain in React; historical owner-accepted estimates not independent statements |
| **Mining Power** | Backend reads power meter, Kryptex machine aggregate and tariff expense, including free-power policy | Meter visualization and values formatting remain in React |

**Implemented during this scope refinement:**
- Removed explicitly retired Cloud betting route and six Cloud-only frontend
  modules without deleting saved DB records; old `/cloud` redirects Home.
- Removed unused browser electricity tariff formula and dead aggregate totals
  from active Crypto Dashboard; server power source remains authoritative.
- Removed Home fallback which used browser-local baselines to synthesize
  read-only financial trend history. Last backend-verified trends are retained
  when the service cannot recalculate them.
- Moved Spending cash flow, totals, category and chart calculations to the
  authenticated backend with pure unit tests and disposable DB session
  regression coverage.
- Added server-sourced Balance Sheet and cash-movement totals to the existing
  authenticated Financials evaluator, with strict frontend validation and
  regression coverage. Archived close display totals are computed from saved
  server-owned closing rows; no source financial values were modified.
- Lulo source freeze remains enforced. Do not attempt deletion of retired
  Lulo-bearing CryptoPage source or rewrite Lulo earnings as a way to satisfy
  this code-cleanliness request.

**Remaining gates for literal 100% backend-owned business calculation:**
per-project Crypto Dashboard estimates/ROI and embedded Passive Income
transforms, surviving Financials presentation calculations if the requirement
includes *every* display subtotal, and a real authenticated browser sweep
through all five pages. The project remains **not certified as zero unused code**:
green React build checks local lint issues but no whole-codebase reachability
graph or isolated unused-export gate exists.

## 1. How this audit was performed

- Queried the actual GitHub recursive repository tree: **423 version-controlled blobs** at the time of inspection. Read application routing, major live page modules, shared data/finance modules, backend route decorators, Financials source modules, CI workflow definitions and specific dead-code references.
- Read the latest GitHub **source-validation** and **system-integrity** job results and dependency-audit job logs; checked Render frontend/backend deployment status and the persisted PostgreSQL settings count.
- Cross-referenced the owner-executed signed-in production integrity reports pasted into the conversation on November 15 at 22:46 and 23:10–23:11 UTC.
- Traced actual browser calculation call paths, including the project APY **write path**. Searched GitHub source references for candidate retired pages/functions. This is source review, not an instrumented runtime call graph or every-page browser automation.
- **Limits:** No authenticated all-route browser E2E test, bundle-level tree-shaking report, whole-repository unused-symbol/type/lint scan, or all-API-contract property-based test was executed. An exhaustive claim that *no other* dead exports or disconnected paths exist is therefore unsupported.

## 2. Source of truth versus where arithmetic runs

**Data persisted on the backend is NOT the same as calculations running on the backend.**
Many views read/write authenticated PostgreSQL using `frontend/src/lib/serverStore.js` (`remoteStorage` and `flushKey`). This is good cross-device persistence but does **not** establish that the arithmetic or business rules are backend-owned.

| Area | Present ownership | Finding | Source evidence |
| --- | --- | --- | --- |
| Financials Balance Sheet, recognized income, current ledger, trial balance | Predominantly **backend** | Backend hooks and API validation; small browser derived display sums and draft-journal totals remain | `FinancialsPage.jsx` lines 293, 326, 339–342, 346, 403–435, 1124–25 |
| Home business assets and headline net worth | **Backend** | Source backend `home-business`, `net-worth`; independently backend Home/Financials parity checked | `Dashboard.jsx` lines 397–468 |
| Home daily/monthly net worth display fallback | **Browser fallback exists** | `readOnlyNetWorthTrends` computes daily baseline/category deltas and history from browser-local storage if server trends unavailable | `Dashboard.jsx` line 472; `dashboardMetrics.js` |
| Crypto Dashboard booked earnings / provider monthly totals | **Backend**, with client metrics still present | `useBackendEarningsDashboard`, `useBackendBitcoinValuation`, `useBackendHardwarePayback`; local per-project ROI/daily-rate and weighted balance calculations remain | `SideHustleDashboard.jsx` lines 78–150, 286–299, 320–328, 610–614 |
| Hardware Payback | **Backend** for authoritative recovery | Backend lifetime/payback hook; browser handles settings/input/display | `HardwarePaybackPage.jsx` lines 65, 89; backend `hardware_payback_lifetime.py` |
| Mining Power | **Backend** tariff and machine telemetry | `/api/power/status` and Kryptex aggregate; frontend formats telemetry | `MiningPowerCard.jsx` lines 256–284 |
| Project Break Even | **Backend** authoritative project totals | `/api/project-tracking/project-break-even`; local ranking/display | `ProjectBreakEvenPage.jsx` lines 35–40 |
| **Spending** | **Browser-owned business math** | Spending backend handles account/transaction/budget CRUD, but browser independently computes total spending, income, cash flow, YoY/period charts, category shares | `SpendingPage.jsx` lines 114–190; backend `routers/spending.py` CRUD routes |
| **DoorDash/delivery** | **Browser-owned business math** | Gross, expenses, net, weekly/lifetime earnings and provider charts calculated in React from persisted `remoteStorage` entries; no corresponding backend-owned summary endpoint found in inspected routes | `DoorDashPage.jsx` lines 140–270 |
| **Cloud betting** | **Browser-owned business math** | Wagers, PnL, streaks, drawdown, stats and profit calculated locally from server-persisted settings | `CloudPage.jsx` lines 161–345; `cloudBetting.js`; `odds.js` |
| **Monthly Changes** | **Browser-owned presentation/summary math** | Historical lock server-protected, but current monthly asset delta, MoM percentage, and provider balances assembled in React | `MonthlyChangesPage.jsx` lines 14–57, 212–266 |
| **Investment Overview** | **Browser-owned project aggregation** | Project transaction totals, invested/earned/PnL and performance summary are computed in React | `InvestmentOverview.jsx` lines 689–736, 831–903 |
| **Passive Income / Yield Farming** | **Hybrid** | Backend earnings dashboard, provider history and portfolio exist; active browser provider/project arithmetic, chart aggregations and storage-side routines also exist | `YieldFarmingPage.jsx` lines 417, 789, 917, 1074, 1190, 1263–1489; `yieldFarmingAccounting.js` (3,702 lines) |
| **Generic APY accrual write path** | **Browser owns earnings calculation and writes** | `projectsApi.accrueApyTransactions` calls `applyApyTransactionAccruals(projects, now)` in browser; function computes `(invested × APY / 100) / 365`, appends daily earnings transactions, increments earned, then client persists via `storage.setProjects` and `flushKey`. This is a higher-priority backend migration than presentation-only chart math | `frontend/src/lib/api.js`; `projectDailyReturns.js` lines 92–148; invoked by `YieldFarmingPage.jsx` line 417 |

**Critical conclusion:** There are live business/accounting computations in browser code and at least one browser-calculated earnings **writer**. Therefore the claim `all browser calculations are now moved to the backend` is **false**.

## 3. Backend integration and missing endpoints

- `backend/routers/project_tracking.py` contains actual backend endpoints for monthly daily earnings, provider stats, Hardware Payback, Financials, portfolio, income history, power-related monitoring, and project break-even.
- `backend/routers/spending.py` exposes account/transaction/budget operations; it does **not** expose an authoritative spending analytics/period summary endpoint in the inspected route list.
- No corresponding dedicated backend-owned `DoorDash` or `Cloud` analytics routes were found in the inspected FastAPI router declarations; their pages calculate metrics in React and store records through backend-connected settings.
- Even if all stored records reside in PostgreSQL, browser math may still diverge across pages when different formulas or rounding conventions are used. Backend read/write connectivity is not a substitute for a single authoritative calculation path.
- **Backend-connected:** Authenticated financial source and current income calculations; most provider daily/booked income sourcing; machine telemetry and project portfolio; settings and generic account/project resource persistence.
- **Not fully backend-connected as an authoritative calculator:** Spending analytics, delivery analytics, cloud betting analytics, generic APY transaction accrual, non-core investment dashboard summaries and monthly business-change percentages.

## 4. Dead code and unused-export findings

These are **candidates supported by references**, not permission for blanket deletion.

1. **Retired CryptoPage:** `frontend/src/pages/CryptoPage.jsx` is 2,091 lines and has no imported route; `App.js` explicitly redirects `/crypto` to `/`. GitHub source search for `CryptoPage` returned only its declaration and the `App.js` retirement comment. This strongly indicates an unreachable old page. It contains Lulo-specific code, so removal would violate the current source-freeze gate without separate explicit authorization.
2. **CryptoPage-only helpers:** `frontend/src/lib/cryptoPageHelpers.js` (278 lines) contains old wallet/DeFi/history read/write helpers. Specific symbols such as `getSavedDefiPositions` and `getDailyCryptoChange` are only referenced by the retired `CryptoPage.jsx` in source search; tests still import some helpers. Verify the entire module graph before removing.
3. **Unused-in-production financial export candidate:** `buildAutoIncomeJournal` in `frontend/src/lib/financialAutoJournal.js` appears in the module itself, tests and historical documentation, while live `FinancialsPage.jsx` imports only `visibleLedgerEntries`. It may be test-only legacy implementation.
4. **Legacy accounting modules:** `yieldFarmingAccounting.js`, `financialAccounting.js`, `financialAutoJournal.js` retain legacy formulas/helpers. Parts are actively imported; therefore entire-file deletion is unsafe. Perform export-by-export usage tracing and preserve tests until equivalent backend tests exist.
5. **Generated / UI component library:** Many `frontend/src/components/ui/*` primitives exist, but this audit did not generate a symbol-level import graph of every primitive. It cannot certify zero unused components.
6. **CI deficiency:** Existing workflows run Jest, Python unit tests and a frontend build, but do not execute a repository-wide unused import/export/dependency checker or strict unused-symbol analysis. A successful build does not mean the tree is free of unused code.

**Do not delete Lulo-related source** without explicit authorization. The `tools/lulo_freeze_guard.py` explicitly fails on changed/deleted source lines that mention Lulo. Keeping this guard is intentional and was verified in recent CI.

## 5. Security findings that CI does not gate

Latest reviewed `NAm source validation` dependency-audit job on commit `621cba66`:
- Python `pip-audit`: **No known vulnerabilities found**.
- Production frontend `npm audit --omit=dev --audit-level=high`: **49 reported dependency findings (18 low, 8 moderate, 21 high, 2 critical)**.
- The workflow uses `npm audit ... || echo "::warning::..."`, so the dependency-audit job reports **success even when serious findings exist**. Investigate which vulnerable transitive dependencies actually ship to production before assigning exploitability or attempting high-risk automatic upgrades.
- Some reported advisories concern package classes such as `fast-uri`, `proxy-addr`, `serialize-javascript`, and build-tool transitive packages. A vulnerability report is **not proof of a remotely exploitable deployed NAm application**, but it rules out certifying a clean dependency audit.
- A separate dependency-upgrade/compatibility/test plan is required; avoid `npm audit fix --force` blindly.

## 6. Production and data consistency checks

- GitHub `main` last application commit inspected: `621cba66` (Rate X exclusion from open/current Balance Sheet), with **NAm source validation** and **NAm system integrity** both successful.
- Both connected Render services showed **live** deployment states at the inspected releases. Backend deployed `621cba66`; frontend last built at `b7cbbe5f` (no later frontend changes required by the Rate X backend-only exclusion).
- Read-only query confirmed the authenticated Postgres settings store was reachable and held **136 setting rows** at inspection. This establishes database availability, not full end-to-end ownership or every API call's success.
- Previously user-executed live read-only accounting integrity reports had **PASS** for booked months, Passive Income, Crypto portfolio, Home/Financials parity, journal preview, Salad eligible hardware coverage and provider monthly reconciliation; warnings for owner-accepted historical source limitations and incomplete/provisional dated evidence.
- Existing authenticated API smoke tests exercise Financials/hardware routes on disposable PostgreSQL, **not all front-end page interactions**. No signed-in full-browser E2E sweep of Spending, betting, Delivery, Investing, Yield Farming, Rate X and financial input flows was performed in this audit.

## 7. Remediation priorities before unconditional full-migration certification

1. **P0 — prevent dual financial authorities:** Migrate non-Lulo generic project APY earning accrual and automatic transaction creation to an atomic authenticated backend endpoint with idempotent (project, source-day) uniqueness/concurrency guarantees. Only switch frontend writers after same-input parity tests. The frozen Lulo path stays unchanged.
2. **P1 — financial/operational analytics backend:** Add server-owned, deterministic aggregation APIs for Spending (period totals, daily cumulative, category shares, cashflow); DoorDash (earned, expenses, net, provider/week/day trends); Cloud betting (net PnL, wager stats, drawdown, streaks), with frontend displaying validated responses and no divergent fallback math.
3. **P1 — remaining project dashboards:** Inventory and migrate Investment Overview, Monthly Changes, Crypto Dashboard per-project PnL/ROI and Yield Farming component arithmetic with source-of-calculation contracts. Preserve booked income and locked periods.
4. **P1 — eliminate Home financial history browser fallback** in favor of backend-only results with explicit cached/temporarily-unavailable state; never silently use local historical baselines as authoritative trends.
5. **P1 — security:** Triage the **49 frontend dependency findings**, identify production exposure and patch supported packages via narrow lockfile upgrades and tests. Make security gating explicitly policy-driven instead of masking it as green; exceptions must be documented.
6. **P2 — dead code:** Build an import/export/dependency reachability inventory; remove non-frozen verified dead modules in small commits with tests. The retired CryptoPage and its Lulo-bearing source must stay untouched until explicitly authorized.
7. **P2 — enforce guarantees:** Add backend ownership assertions, API contract/roundtrip tests for every major screen, ESLint unused imports / Knip-style reachability, CI regression gates, and real authenticated browser smoke across every route.
8. **P2 — release documentation:** Keep the six-of-six *prior scoped release* checklist complete by owner acceptance, but create a **separate all-codebase backend migration checklist**. Do not mark the larger migration complete until all required areas are proved.

## Final decision

**The prior six-of-six accounting release checklist is accepted. The NEW requested universal backend migration + zero dead/unused-code audit is NOT complete.** Several active browser-owned calculations and at least one financial write path remain, and the latest frontend dependency audit has serious unresolved findings. No production ledger values, historical locks, Lulo code or project histories were changed by this audit.

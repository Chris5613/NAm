# NAm cross-system integrity audit

**Inspection date:** 2026-11-14 (Pacific; UTC changes over to Nov 15 during the audit)

**Scope:** React frontend, shared server-backed store and settings API, FastAPI project tracking and mining reconciliation, Render PostgreSQL, Passive Income, Crypto Dashboard, Financials, Hardware Payback, and deployment state.

**Status:** Targeted integrity defects corrected. The reviewed live database invariants passed at the recorded inspection. **This is not certification that every possible user path or external provider is error-free.** A browser-authenticated, full click-through E2E run was not available to this audit.

## Cross-system source map

| Data | Primary record | Consumers | Expected relationship |
|---|---|---|---|
| Kryptex mined income | `project_income_kryptex_tracker_v1.kryptexMiningDaily` and `kryptexConfirmedDays` | Passive Income, backend provider-monthly-income, Financials snapshots, Hardware Payback | Confirmed dated rewards sum to tracker monthly income; BTC balance changes are NOT earnings |
| Kryptex BTC reward evidence | `kryptexMiningSatsDaily` plus verified Nov 1–6 recovery metadata | Kryptex audit/reconciliation | Pending BTC earnings without valid USD conversion flagged, never written as a false zero |
| Current-month Passive Income chart | `buildMonthlyDailyEarningsChart`, `sourceTotalsForDay` | Passive Income current month; Crypto Dashboard income card | The exact same daily chart total is published to the Dashboard; current-month popup uses the same per-day sources |
| Today's earnings | `buildTodayEarningsDisplay` in Passive Income | Passive Income and Crypto Dashboard | Both cards consume same calculation; old balance-based daily server totals are a fallback only until the Passive page computes |
| Provider monthly snapshots | `yield_monthly_snapshots_v1`, `getEffectiveProjectIncome` | Financials accruals, historical provider data, yearly archive | Snapshot total equals sum of recorded platform rows; NOT necessarily equal to dated current-month chart due to source/day conventions |
| Financial journal | `financials_journal_v1` plus dynamic `buildAutoIncomeJournal` | Balance Sheet, P&L, Cash Flow, Home business valuation | Compound entries must balance; manual transfers and mark-to-market account balances must not be counted as mining income |
| Hardware cost/returns | `hardware_payback_devices_v1`, dated recorded providers | Hardware Payback, equipment register | Distinct device IDs; cash-only payback cost may differ from acquisition/book value after a trade-in |
| Server-backed settings | PostgreSQL `settings` table via `serverStore` | All frontend views | Backend changes refresh into the client without overwriting in-progress local saves |

## Verified live PostgreSQL checks (point in time)

- The `yield_monthly_snapshots_v1` totals **exactly** equaled the sum of platform rows for **September ($330.062266)**, **October ($202.769111)**, and **November ($73.715186)**. These are snapshot totals, not the separate chart's month-to-date number.
- Kryptex confirmed daily income sum for November was **$40.522361** versus tracker monthly **$40.52236113**, an expected rounding difference below $0.01.
- The two manually posted compound journal entries were balanced: Lulo withdrawal **$2,488.14 debit/credit** and RTX 5080 acquisition/trade **$1,950 debit/credit**. Three additional legacy simple entries have symmetric debit/credit accounts by construction; this does NOT verify every automatically generated journal line.
- Hardware register: **2** registered devices, **2** distinct IDs, no invalid/nonpositive purchase costs.
- In the earlier detailed comparison, Kryptex November 7–14 had eight confirmed dated earnings rows, none missing, each at least as high as its historical server observation.
- Render backend/frontend were connected to the same `Chris5613/NAm` repo `main`. Successful Render frontend build/deployment was observed for commit `c20cb1c`, and earlier backend deployments were live. No error-level backend logs appeared in the queried time windows. **GitHub Actions test outcomes were not verified here.**

## Confirmed integration defects and changes

1. **Stale frontend provider cache:** `serverStore` originally hydrated once at sign-in, but provider settings written directly by backend extensions were not refreshed into all screens. Added safe refresh of backend-owned keys on focus/visibility and periodically **only while authenticated**. Dirty local edits and late responses from prior accounts are protected.
2. **Separate Dashboard daily/monthly formulas:** The Dashboard's current-month amount was already changed to the Passive Income chart value. The Dashboard's **Income Today** was still based on a separate legacy server daily total. Now the Passive Income component publishes both daily and monthly reconciled values; the Dashboard consumes them.
3. **Monthly chart vs by-project popup:** Previously used daily sources vs monthly provider snapshots respectively, causing false visual mismatches after backfills. Current-month breakdown now sums the **same dated provider rows** used by the monthly chart. Older, locked month snapshots retain their accounting meaning.
4. **Historical BTC repricing risk:** Kryptex saves confirmed daily earnings monotonically, and preserves satoshi evidence independently. Previously recovered Nov 1–6 BTC rewards remain protected from partial rolling-hourly chart readings.
5. **Missing shared diagnostics:** Added read-only authenticated `GET /api/project-tracking/integration-audit` checking Kryptex daily-vs-monthly reconciliation, missing BTC-to-USD conversion, unlocked Kryptex snapshot parity, snapshot row totals, compound journal balance, hardware identifiers and costs. An informational item explicitly distinguishes the Passive Income daily chart total from snapshot accounting totals.
6. **Automated regression coverage:** Added tests for storage refresh safety, chart-vs-popup reconciliation, audit mismatches, and Kryptex reward preservation. Added `.github/workflows/nam-integrity.yml` to run backend Python tests and frontend Jest tests plus a production build after future pushes. **Workflow execution/result still requires verification.**

## Continued audit pass (November 14, 2026, later Pacific session)

### New confirmed code-level data-loss risks corrected

1. **Kryptex loaded tracker fields were incomplete.** `loadKryptexTracker()` formerly reconstructed a subset of the persisted tracker and omitted `kryptexMiningSatsDaily`, `kryptexPendingEarningsDays`, `kryptexLastChartSyncAt`, and machine-audit fields. Since the Passive Income page also persisted its state on mount/change, opening it could have written that shorter object back into the shared settings record. The Kryptex loader now retains unknown fields, and Passive Income no longer blindly persists backend-owned Kryptex snapshots. Legacy extension writes explicitly preserve confirmed high-water daily amounts and satoshi evidence.
2. **Hardware Payback had a second direct Kryptex earnings writer.** Its browser `KRYPTEX_PUSH` listener used raw `daily_usd` data and assigned `daily[date] = amount` without a high-water check. That could replace a verified/recovered day's higher earnings with a lower BTC-repriced amount. Hardware Payback now listens to `kryptex-aggregate-update`, consuming the reconciled backend tracker instead of directly saving raw chart numbers.
3. **Provider state could drop unknown backend fields.** The Salad, Unetwork, RollerCoin, and Loopscale loaders also rebuilt objects without retaining new backend metadata. Each now preserves unknown persisted fields before normalizing known values, so future server-side reconciliation fields survive a frontend round trip.
4. **Inactive-project preferences could remain stale in an open tab.** The Passive Income preference hook originally read `yield_inactive_project_ids_v1` only at mount. It now subscribes to the shared server-backed store; the setting is included in authenticated background refreshes. React state updaters no longer perform settings writes.
5. **Distinct inactive definitions remain.** Legacy `projects.inactive` flags and the Passive Income `yield_inactive_project_ids_v1` preference use different identifiers and can legitimately describe different card sets. The audit identified different counts but did **not** rewrite those flags or choose one interpretation without user confirmation.

### Live recheck

A read-only SQL recheck after these fixes found the exact restored satoshi rewards for **Nov 1: 452 sats** and **Nov 6: 5,490 sats** still stored. November's confirmed Kryptex daily sum was **$40.605951** against its monthly tracker **$40.60595119** (rounding-only delta). Pending BTC-to-USD conversions: **none**. The live backend logs returned no error-level events for the queried interval. This is a point-in-time sample, not proof that all historic earnings are complete.

### Additional regression coverage

`frontend/src/lib/kryptexTrackerPersistence.test.js` now checks:
- Backend satoshi evidence, missing-conversion flags, and chart timestamps survive tracker load.
- Legacy fallback saves cannot reduce confirmed daily rewards or unset a confirmation.
- All four other provider loaders retain unrecognized backend reconciliation fields.

### Continued limitations

- Render production deploy status can verify a build started/live, not that the automated GitHub Actions test suite actually passed. Workflow-run results were unavailable through the available PR-scoped workflow query.
- No authenticated browser journey through all pages was executed. A production browser reload, multi-tab, and cross-device scenario must still be observed to verify all UI state transitions.
- The data-loss risks above are confirmed in code; this does not independently establish that previous user earnings were erased by these exact code paths.
- The two inactive-project systems are separate and should not be force-merged without checking user intent.
- The full Financials versus Home personal/business cash overlap remains subject to transaction-level confirmation; no bank opening or trade-in records were altered.

## Daily monitoring and legacy settings hardening

- **Daily NAm Integrity Watch is scheduled** for approximately 8 AM Pacific beginning November 15, 2026. It checks connected Render deployments/logs, authoritative Kryptex confirmed daily-vs-monthly earnings, preserved November 1–6 satoshi rewards, pending conversions, and month snapshot totals. Notification is conditional on a real discrepancy or an inability to verify critical sources; no records are mutated.
- **Legacy settings overwrite protection was missing at the backend boundary.** Older clients could use guarded `PATCH /api/settings/project_income_kryptex_tracker_v1` with an outdated whole-object snapshot. The former route checked a before/after CAS but did not preserve the independently server-owned reward evidence if the CAS succeeded.
- `backend/kryptex_setting_guard.py` now merges legacy writes conservatively: confirmed daily USD and historical satoshi observations are nondecreasing; previously confirmed days can't be unchecked; monthly totals are recomputed from the merged confirmed days; lifetime rewards cannot decrease; partial legacy snapshots cannot remove server-owned metadata; and legacy machine status cannot replace canonical multi-PC telemetry once established.
- The legacy settings handler obtains the **same user row lock** used by the canonical machine ingestion route, in addition to its existing per-key advisory lock, preventing concurrent upserts from bypassing the merge.
- `backend/tests/test_kryptex_setting_guard.py` covers old browser overwrites, confirmed day preservation, satoshi high-water history, pending conversion clearing, and protection of modern machine status. Tests committed; **test-run results not yet verified**.
- This update is a forward-looking safeguard; it does not itself backfill earnings before the verified start date. Manual financial journal entries, bank openings, device cost basis, and income snapshots were not modified.

## Bank-feed versus journal cross-check

- The manually entered RTX 5080 journal acquisition/trade is dated **November 13, 2026**, with **$1,250 cash outflow** and **$1,950 gross equipment debit** including trade-in. A connected personal-bank transaction for **$1,250** is dated **November 14, 2026**. This might reflect the difference between transaction and posting dates; it is a **date discrepancy for review, not automatic duplicate spending**, and neither side was edited.
- The manually recorded **$2,488.14 Lulo-to-cash withdrawal** dated November 1 has no exact matching entry in the available linked bank-transaction feed for the inspected October 25–November 20 window. The withdrawal may be represented by a different amount/date, unlinked account, or missing bank history; absence of an exact feed match is **not evidence the withdrawal didn't happen**.
- Home's display adjustment subtracts the lesser of business cash and total personal cash to avoid an assumed overlap. It does not currently prove the two accounts hold the same transferred funds by matching a bank-transaction ID. Keep this as a **manual reconciliation item**, not a reason to delete a cash balance.
- These checks queried only dates and amounts, not bank credentials. No changes were made to journal entries, business cash, personal accounts, or spending transactions.

## Important distinctions / outstanding verification

- **Legacy daily-income server records cannot be treated as mining rewards:** Older Kryptex records can contain USD account balance movements driven by BTC prices. Do not combine those numbers with the confirmed mining ledger.
- **Passive Income and Financials are not identical ledgers.** Current-month daily earnings can differ from a provider monthly snapshot due to source availability, Lulo UTC/Pacific day cutoffs, historical backfills, and accounting cutoffs. Shared values should match *within* each presentation path. Automatically overwriting the Financials journal with the chart total would risk changing recognized revenue or fabricating receivables; this audit deliberately did not do so.
- **Cash overlap:** The Home net-worth display includes a prior mitigation for business Cash / Bank also appearing in a personal account. Whether the personal cash is actually the same funds requires transaction-level evidence; the audit did not mutate the bank opening or the Lulo withdrawal.
- **Equipment:** RTX 5080's `$1,250` cash outlay can differ from the `$1,950` accounting entry because of the RTX 5070 trade-in. Preserve both definitions; do not create a second GPU from the journal.
- **Limitations:** No authenticated end-to-end UI navigation or cross-device browser session was executed; no exhaustive audit of external provider APIs, all screen interactions, all historical accounting months, or third-party wallet balances. The new API reports logic/data invariants, not real-world asset ownership. Test presence is not proof of passing test execution.

## Primary audit references

- `frontend/src/lib/serverStore.js`
- `frontend/src/App.js`
- `frontend/src/pages/SideHustleDashboard.jsx`
- `frontend/src/pages/YieldFarmingPage.jsx`
- `frontend/src/pages/FinancialsPage.jsx`
- `frontend/src/pages/HardwarePaybackPage.jsx`
- `frontend/src/lib/monthlyEarningsChart.js`
- `frontend/src/lib/earningsDisplay.js`
- `frontend/src/lib/financialAssetsSnapshot.js`
- `frontend/src/lib/financialAccounting.js`
- `frontend/src/lib/financialAutoJournal.js`
- `backend/routers/project_tracking.py`
- `backend/integration_audit.py`
- `backend/kryptex_earnings_audit.py`
- `backend/tests/test_integration_audit.py`
- `frontend/src/lib/serverStore.test.js`

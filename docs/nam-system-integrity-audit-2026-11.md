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

## BTC-price repricing and delayed-conversion reconciliation

- **Additional risk found:** A USD high-water mark can still rise when BTC rises even if the mined satoshi count does not. The old rule prevented downward repricing but did not distinguish price appreciation from new mining.
- The backend now recognizes incremental mining income from **the increase in daily satoshis**, valued using the incoming chart's implied USD per satoshi. It retains prior recognized USD instead of repricing all already credited satoshis. No earned satoshis are created from a balance-only market change. The historical Nov 1–6 recovery retains its original, auditable price basis.
- **Delayed conversion case:** Incoming `daily_sats` may precede its corresponding `daily_usd`. The tracker now keeps `kryptexMiningSatsDaily` (observed) separate from `kryptexIncomeCreditedSatsDaily` (already recognized as USD). The latter is initialized from historic confirmed observations for compatibility. If new sats arrive without USD, the day is marked in `kryptexPendingEarningsDays` and in the read-only audit until a USD conversion arrives. Subsequent USD recognition credits the remaining sats without doubling previously recognized income.
- Legacy generic-settings writes apply the same incremental-recognition rule and cannot erase the credited-sats baseline. Regression tests exercise a pure price rise, sats increase with a doubled BTC price, sats arriving before USD, and stale browser settings with pending sats.
- **Approximation:** The implied BTC/USD rate from a chart observation is not a verified timestamped exchange fill price for every newly mined satoshi. Precise historical USD recognition would require timestamps and priced reward lots that the source chart does not expose. This logic prevents BTC balance mark-to-market changes from driving recorded income as if all old mining happened at today's price.
- **Live recheck:** November confirmed Kryptex daily sum **$40.641553513** reconciled with monthly **$40.64155351**, pending conversions **0**, November 1 reward evidence **452 sats** retained. November provider snapshot total **$74.479955** reconciled with its platform rows **$74.479955**. `kryptexIncomeCreditedSatsDaily` was present in the live DB. This is a point-in-time check.

## Continuing audit: Home synchronization, Lulo snapshot source, and shared GPU earnings

- **Home Net Worth vs Financials refresh:** Home previously recomputed only its business-card data when a provider, equipment, or Financials setting changed, while its full net worth remained stale until the 30-second timer or focus event. The Home subscriber now coalesces updates for relevant net-worth/source keys and reruns the full calculation. Net-worth history and daily baseline keys are explicitly excluded to avoid self-triggered refresh loops. Regression tests cover included and excluded keys.
- **Legacy confirmed USD without a satoshi baseline:** Prior incremental Kryptex recognition correctly ignored BTC repricing when old satoshi evidence existed, but an older confirmed USD day with no sats could still increase when BTC rose. The backend now freezes that old USD credit until the first satoshi baseline is established. Only subsequent growth in mined satoshis can raise income. Added a regression test without modifying historical rewards.
- **November snapshot movement (source not conclusively isolated):** The total of the November monthly snapshot fell by around $4.90 during the audit while the current provider rows remained internally balanced. The earlier individual platform breakdown was not captured, so this drop **cannot be conclusively attributed to Lulo disappearing**; it could reflect a change in signed Loopscale P/L or another live provider. Independent Postgres evidence showed the authoritative November Lulo backfill was **$0**, the backend November Lulo monthly ledger recorded **$0**, and the Lulo project contained **no November dated earning transactions** through the checked period. Therefore the audit did not invent missing Lulo income or force the older number back into the current-month snapshot. The cause of that particular intraday drop remains unproven.
- **Live November provider rows:** Latest snapshot in the audit pass had **$69.582203** headline and approximately **$69.582202** summed provider rows (one-millionth of a dollar, harmless precision difference); prior September and October snapshots remained locked. A source amount can change during sync even while internal row summation remains valid; a snapshot balance is not itself evidence of mined rewards.
- **GPU payback credits overlap:** RTX 2080 and RTX 5080 can both deliberately claim their full Kryptex source income after their respective start dates. Summing each device's payback credit does **not** yield distinct business revenue; the headline previously said "Net project earnings" and was misleading. The Hardware Payback headline now says **"Sum of device payback credits"** and discloses shared providers. Individual payback amounts remain untouched, and Passive Income remains the appropriate view for deduplicated earnings. Shared-source detection has regression tests.

- **Hardware daily forecast had a second allocation rule:** The actual per-device earnings use full Kryptex source credits, but the projected daily earnings previously divided that same source by each GPU's share of hardware purchase costs. The projection now uses the full selected daily provider rate per device, less its own power cost, matching the actual payback method. The total of all device credits remains explicitly labeled as a non-unique payback figure. Regression tests cover this rule.

### Continued verification limits

The latest code fixes have unit/regression tests committed, but a passing GitHub Actions run and authenticated end-to-end browser journey were not verified from the available tool outputs. The above PostgreSQL readings are point-in-time, and subsequent provider syncs can legitimately move current-month amounts. No spending transactions, bank openings, Lulo backfills, or hardware cost basis were changed.

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

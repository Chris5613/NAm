# NAm Passive Income migration — 2026-10-30

## Scope delivered

This change is a compatibility-first extraction and initial backend accounting
migration. It keeps the same project cards, layouts, sync bridges, settings
keys, recorded earnings, historical corrections, and existing data.

### Source ownership

| Layer | File | Responsibility |
| --- | --- | --- |
| React controller | `frontend/src/pages/YieldFarmingPage.jsx` | Data source lifecycle, live integration messages, hooks, orchestration, page layout |
| Shared calculation helpers | `frontend/src/lib/yieldFarmingAccounting.js` | Legacy source-specific earnings accrual and snapshots; storage adapters; date/format utilities |
| Reusable visual components | `frontend/src/components/YieldFarmingComponents.jsx` | Project cards, editors, dialogs, monthly income views |
| Backend accounting | `backend/project_accounting.py` | Deterministic portfolio valuation and signed daily income summation |
| Backend endpoint | `backend/routers/project_tracking.py` | Authenticated observation ingestion, validation, daily auditable totals, portfolio summaries, sync recovery candidates |
| Backend scheduler | `backend/scheduler.py` | 11:58 PM Pacific persisted balance snapshots and catch-up attempts |
| Regression tests | `backend/tests/test_project_accounting.py` | Duplicates, invalid values, historical-earned double-counting, negative daily P/L |
| Continuous validation | `.github/workflows/source-validation.yml` | Python compile/tests and frontend production build on relevant changes |

The controller was reduced from 11,178 to approximately 5,577 lines.
Most reduction is an **extraction**: the total codebase size has not been
reduced by the same amount.

## Portfolio total migration

On each validated current project feed, the server calculates:
- `totalUsd`: current USD portfolio balance for all project entries,
- `activeTotalUsd`: balance excluding inactive entries,
- `complete`: whether all project IDs have valid current USD amounts,
- stale and invalid observation details.

The frontend adopts the server's canonical total only while:
1. the backend confirms a complete set;
2. the project count matches the currently displayed cards;
3. the server total is within one cent of the current local total.

Otherwise the existing live calculation remains visible. This prevents a
slow network response or missing server data from replacing live balances.

## Daily income migration

The per-source signed totals (including losses) are sent to an authenticated
`PUT /api/project-tracking/daily-earnings` endpoint. It verifies valid finite
amounts, sums them in decimal arithmetic, and saves an audit sequence and latest
totals under a dated PostgreSQL setting. Historical days cannot be modified
through this endpoint.

The display adopts the server's daily total only while *every* source
agrees with the latest local readings. This is a staged migration:
**source-specific accrual formulas still run in frontend helpers**.
Moving those formulas into a tested backend engine is a separate follow-up,
not a claim of completion here.

## Sync/backup behavior

Browser-specific integrations still require the extension and browser for
new measurements. The backend can persist and snapshot the last received data
with timestamps even if the page is closed; it cannot magically refresh an
extension-only source. The existing server scheduler runs at 11:58 PM Pacific
when the backend is active, and attempted catch-ups are recorded as later
actual captures rather than mislabelled as on-time measurements.

Recovery candidates are derived from quantity changes, not exclusively USD
market valuations. Unverified transfer-like changes are excluded from
automatic earnings recording. Do not interpret inferred differences as
independently verified mining rewards.

## Compatibility / rollout

- No new visual labels or dashboard controls.
- Original tracker storage keys and serialized historical ledgers retained.
- No data deletion or one-time destructive migration.
- The backend requires PostgreSQL, a stable session secret, and available
  service runtime.
- Refresh the deployed frontend after the new backend is deployed; client
  sums remain available if new backend endpoints cannot be reached.
- Verify live browser bridge sync separately from build-time checks.

## Follow-up boundaries

The next independent stage is to migrate each platform's accrual rules to
backend services with fixtures from known historical entries. Do not
auto-rewrite old dated P/L while performing that work. Chart rendering, layout,
tooltips, and interactive editors are frontend responsibilities.

## Phase 2 — provider accounting migration (2026-10-30)

### Backend-owned provider statistics

Four extension-dependent providers now have independent, pure backend
calculation functions in `backend/provider_stats.py`:

- **RollerCoin:** dated TRX earnings, wallet-day replacements, historical TRX
  baseline, month-to-date recorded USD income, and live current wallet value.
  Historic income is not repriced when TRX/USD moves.
- **Salad:** lifetime-earned and withdrawable/current balances remain
  separate. Projection samples use a verified 45–90 minute pair, preferring
  the reading closest to one hour; otherwise the current-month average.
- **Unetwork:** opening-month allocation baseline, lifetime allocation totals,
  and completed-day daily-rate projections (not today's partial total).
- **Kryptex:** user-established September 2026 USD baseline, current balance,
  profitability estimates, and miner status.

The authenticated `GET /api/project-tracking/provider-stats` endpoint
calculates these from **PostgreSQL's saved tracker settings**, without
requiring React to send a presumed dollar total in the request.

`frontend/src/hooks/useBackendProviderStats.js` uses the server result
only when each numeric field and scalar metadata match the locally
observed provider snapshot. A recently updated browser extension may be
ahead of PostgreSQL, so the screen continues using the live calculation
until its matching record has been saved. On backend failure, the locally
known latest values stay visible. No extra dashboard labels were added.

### Backend-owned monthly extension history

`backend/provider_monthly_income.py` mirrors the four providers' monthly
accrual rules, preserving legacy month-opening corrections and excluding
current wallet holdings from *earnings*. The authenticated endpoint is
`GET /api/project-tracking/provider-monthly-income`.

`frontend/src/hooks/useBackendMonthlyIncome.js` compares all recorded
extension-provider monthly values with the existing frontend calculations.
When equal, backend values are used in the aggregated month totals without
changing Lulo/Loopscale figures. Missing/lagging server months cannot
truncate or replace the existing history.

### Testing / deployment

`backend/tests/test_provider_stats.py` and
`backend/tests/test_provider_monthly_income.py` verify opening baselines,
wallet-versus-income separation, recent-hour Salad projections, Unetwork
completed-day semantics, and Pacific timezone rollover.

`frontend/src/lib/yieldProviderParity.test.js` verifies the stale-data
fallback, signed negative values, rejection of missing/corrected values,
and preservation of platform monthly figures. The GitHub Actions workflow
runs Python compilation, backend unit tests, frontend Jest tests, and a
strict production React build.

The legacy frontend accounting formulas remain as a deliberate transition
fallback, **not a second source that is summed together with backend data**.
They may only be removed once historical parity has been checked against
saved production tracker records. Browser-extension authentication still
requires Chrome while the service is active, and server-owned external API
polling for Lulo/Loopscale remains a separate migration.

## Phase 3 — independent Lulo and Loopscale polling (2026-10-30)

### Server-owned upstream connections

`backend/yield_source_sync.py` now polls **registered public Solana wallets**
from the server at five-minute intervals, even with the NAm browser tab
closed (provided the backend is running).

- **Lulo:** Fetches v1 account, pools, v0 custom account, and both dated
  performance endpoints in parallel. The backend reconstructs the same
  regular/protected/USDS balances, weighted APY, lifetime interest,
  and five-completed-day earnings average the browser displays.
- **Loopscale:** Fetches the borrower loan-info endpoint using the existing
  page-0, 25-item configuration. It selects the borrower's active ONyc
  loop, calculates the net equity after principal and accrued interest,
  prioritizes the protocol's UI P/L field, and derives its daily net
  yield and net APY.
- The scheduler stores **read-only** normalized snapshots under
  `yield_backend_source_snapshots_v1` and bounded observation history under
  `yield_backend_source_observations_v1`. It does **not** mutate projects,
  transactions, monthly earnings, or historical balance corrections.
- Endpoints `PUT /api/yield-sources/wallets`,
  `GET /api/yield-sources/latest`, and `GET /api/yield-sources/history`
  are authenticated. Registrations allow only base58-form public Solana
  addresses, never private keys or arbitrary provider URLs.
- Only wallets that have been registered from the updated frontend will be
  polled. A user must open the deployed NAm site **at least once** after
  rollout to persist wallet configuration.

### Safe frontend transition

The existing live API paths remain operational:

- The page registers its known Lulo project addresses and its configured
  Loopscale wallet with the backend.
- Lulo and Loopscale first check for a backend snapshot newer than their
  existing source reading and at most two minutes old.
- Stale, invalid, future-dated, or unexpectedly large balance changes
  fall back to the provider's existing direct API request.
- A large difference is not silently booked as yield: existing Lulo
  transaction anti-artifact filtering and Loopscale's original P/L history
  remain in control of accounting.

This does not change the displayed design, labels, or controls.

### Nightly backups while the browser is closed

At 11:58 PM Pacific the existing project backup attempts to overlay newer
server-polled Lulo/Loopscale USD totals onto a **copy** of the last
browser-reported project balance feed, only when the server observation is
at most 20 minutes old and newer than the browser observation.

The browser's old per-asset quantities cannot be assumed to match this
newer total: those are marked stale and excluded from quantity-based
recovery. Other projects retain their original source timestamps, so
RollerCoin/Salad/Unetwork/Kryptex do not claim false server-sourced updates.

### Preconditions and boundaries

- The backend needs continuous runtime, PostgreSQL, and a configured
  `LULO_API_KEY` environment variable for Lulo polling.
- Loopscale uses its server-accessible fixed HTTPS API endpoint and the
  user's previously configured public wallet address.
- A browser-independent read-only balance observation is **not** an
  independently verified earned-income transaction. Lulo's client-side
  cash-flow/interest correction algorithm and the Loopscale observed-P/L
  ledger are intentionally unchanged for this phase.
- API rate limits, provider outages, and the lack of a confirmed upstream
  production response can delay or prevent snapshots; errors are stored,
  not replaced with fabricated zeros.
- This phase includes regression fixtures for normalization, Pacific-day
  timestamps, account validation, and stale-backup overlays. A live
  end-to-end check against the deployed database and provider services is
  still required.

## Phase 4 — backend earnings-ledger reconciliation (2026-10-30)

### Durable reconciliation without rewriting old income

This phase moves the **calculation engines** for Loopscale P/L observations and
Lulo's month-to-date yield baseline into `backend/yield_earnings_ledger.py`.
The existing five-minute backend polling process now:

1. Loads the latest saved provider observations.
2. Seeds versioned backend ledgers from the user's existing browser history
   (`yield_loopscale_position_history_v1` and
   `yield_lulo_monthly_baselines_v1`), without resetting older corrections.
3. Rejects repeated or out-of-order provider timestamps.
4. Adds Loopscale flow-adjusted P/L changes to the day they were **observed**
   and preserves the original month opening-baseline rules.
5. Applies Lulo's version-5 interest checks: meaningful principal movements
   re-anchor the lifetime interest counter without booking cash flow as yield;
   excessive interest spikes are rejected; the $9.05 September 2026 opening
   correction is preserved.
6. Saves results to separate PostgreSQL setting keys
   `yield_backend_loopscale_pnl_ledger_v1` and
   `yield_backend_lulo_monthly_ledger_v1`.

The migration logic and seeding behavior live in
`backend/yield_earnings_state.py`. If a browser has a newer legacy
observation, its record is imported for that position/month instead of
silently overwritten by an older server snapshot.

### Lulo transaction reconciliation: backend comparison mode

`backend/lulo_transaction_reconciliation.py` ports the original Lulo
project transaction safeguards to a pure function. It can:

- Normalize interest against the saved cash-flow correction offset.
- Detect deposits/withdrawals and implausible raw-interest jumps.
- Remove only previously identified impossible yield artifacts.
- Consolidate repeated legitimate increases into one date-scoped
  `lulo_yield` transaction, without touching manual entries.
- Reject older snapshots so the same observation cannot be booked twice.

The scheduler runs this against the existing project snapshot and the
last backend preview, storing the independent result in
`yield_backend_lulo_transaction_previews_v1`. The browser's real
project transaction records **are not modified** by this preview yet:
full cutover requires comparing the output with the live production ledger
after several actual polling cycles.

### Safe Loopscale frontend promotion

The Passive Income page now reads the authenticated
`GET /api/yield-sources/earnings` endpoint every minute. It can adopt a
newer server-reconciled Loopscale ledger automatically when timestamps and
existing month baselines are compatible, retaining historical months,
observations, and other loans. Invalid, older, or conflicting server results
are ignored. The page retains its original browser calculation fallback.

Lulo's live project transactions are still managed by the existing legacy
engine; the server version is currently **comparison-only**. This
prevents a partial migration from counting deposits as earned interest.

### Tests and production limits

- Backend fixtures cover first observations, negative and positive P/L,
  month rollover, out-of-order polls, repeated observations, historical
  corrections, Lulo deposit/withdrawal resets, impossible interest jumps,
  and transaction idempotence.
- Frontend fixtures cover preserving old positions and manually corrected
  monthly baselines when fresh server observations arrive.
- These are source-level and regression tests. They do not verify production
  Lulo API access, actual database migration, server availability, or
  identical results against all saved personal historical observations.
- The backend must be running and public wallet registrations must be saved
  for server-only reconciliation to continue while Chrome is closed.

No new visual labels, cards, controls, or historical data deletion were
introduced by Phase 4.


## Phase 5 — Production parity, transaction safety, and frontend simplification (2026-10-30)

### What is implemented

1. **Production same-input Lulo comparison:** Every browser-triggered Lulo
   accrual can now send its *pre-reconciliation project*, fetched provider
   snapshot, *post-reconciliation project*, and exact application time to
   authenticated `POST /api/yield-sources/lulo-parity`. The backend runs its
   independent Python reconciliation against those same inputs and compares
   earned amounts, invested balance, interest offsets, interest-artifact
   corrections, and individual transaction dates and amounts. Generated
   client transaction IDs and equivalent UTC timestamp text formats cannot
   cause false mismatches.
2. **Durable parity reports:** `yield_lulo_transaction_parity_reports_v1`
   contains bounded diagnostics (no raw transaction payload), including
   the mismatched field names. Five *distinct*, sequential matching source
   observations are required for diagnostic confidence; repeated or older
   observations cannot increase that count. A match is diagnostic, **not**
   permission to write financial transactions.
3. **Actual saved-ledger parity:** The authenticated
   `GET /api/yield-sources/migration-status` independently reads the REAL
   saved PostgreSQL project and the backend preview. It distinguishes a
   same-observation exact match, a newer browser record, a newer server
   record, and a genuine discrepancy. It also returns source-poll freshness,
   Lulo API-key configuration status (not its value), and outstanding
   migration blockers.
4. **Pre-cutover accounting backups:** On its first backend polling cycle,
   the server writes one-time snapshots of each registered Lulo project's
   complete legacy JSON data, typed invested/earned balance, and any
   separately stored relational transaction rows. It also records the
   existing Loopscale history before changing authority. Backups cannot be
   overwritten by the generic client settings PUT endpoint.
   `GET /api/yield-sources/cutover-backups` lists the availability and dates
   of checkpoints; authenticated Lulo/Loopscale detail endpoints return
   those original records for recovery. No automatic destructive restore
   or rollback is attempted.
5. **Closed-browser regression:** The test suite simulates server-only
   provider polling with no frontend, Chrome, or DOM. The backend saves the
   source observations and independent ledgers. Replaying an identical
   provider timestamp does not duplicate earned amounts or change the
   original Project row.
6. **Main React component reduction:** The two original Lulo monthly
   accrual/backfill effects were moved *without rewriting their logic*
   into `frontend/src/hooks/useLegacyLuloMonthlyAccounting.js`.
   `YieldFarmingPage.jsx` fell from ~5,602 to ~5,135 lines. These legacy
   rules remain available intentionally until production parity and
   server-write ownership are proven.

### Why live transaction writes remain OFF

A backend-side diagnostic is not sufficient to safely write actual income.
The real browser project and the independently polled server can have
different observation times. More importantly, the legacy
`projectsApi.accrueApyTransactions` path rewrites a collection through
`storage.setProjects` / the replace-all resource endpoint. A naive new
backend writer could race with that mechanism and be overwritten by an
older browser tab.

Therefore the endpoint's `cutoverEnabled` and
`eligibleForAutomaticWrites` values remain **false**.
The backend's transaction preview never mutates `Project` or
`ProjectTransaction`. The actual cutover must wait for the
production-data checks AND a coordinated replacement of the existing
client collection-write path with per-project server-owned writes and
database concurrency controls.

### Verification procedure after deployment

1. Visit NAm normally after the new backend deploys so its authenticated
   wallet registration and Lulo browser sync run.
2. With the same signed-in session, request
   `/api/yield-sources/migration-status`. Inspect Lulo key configuration,
   source errors, source poll age, the per-project
   `persistedLedgerParity` result and
   `cutoverReadiness.blockers`.
3. Check `/api/yield-sources/cutover-backups` to confirm one-time
   transaction snapshots exist. The backups are READ ONLY.
4. Compare a representative set of actual earnings periods, deposits,
   withdrawals, and interest-correction events using parity reports.
   Investigate mismatches before changing write ownership.
5. Confirm independent snapshots advance across a period when NAm/Chrome
   is closed. Unit tests alone cannot prove the deployed runtime is
   continuously available.
6. Only after those checks and concurrency migration are completed,
   consider enabling backend-owned transaction writes and retiring the
   old browser accrual code.

This phase makes NO new dashboard labels or controls, and makes NO
automatic edits to existing income or project transactions. GitHub CI
tests compile the backend, run regression suites, and compile the React
frontend, but they do not prove live database or external API access.

## Phase 6 — Conflict-safe project persistence (2026-10-30)

### Delivered

- The storage facade now derives per-project changes from the last successfully
  loaded/saved server snapshot. `PATCH /api/project-records` accepts explicit
  `before` / `after` records, including deliberate creation and deletion.
- The server locks the user's database row with PostgreSQL `FOR UPDATE`, reads
  current projects, validates the entire batch, then updates existing rows in
  place. It never deletes/recreates the project collection. Relational
  transaction rows survive ordinary project saves.
- A stale before-image rejects the whole batch with HTTP 409. Exact replays are
  accepted, unrelated project changes are retained, and conflicting financial
  histories are never silently merged. Cross-user IDs cannot be overwritten.
- Legacy generic project POST/PUT/DELETE writes now return 409 so an old tab
  cannot bypass the protocol. Other resource collections retain their existing
  behavior. First-time legacy imports acquire the same user lock and continue
  to skip existing projects.
- Project requests are serialized within each tab. Edits made during a request
  are retained and included in the next save. Conflict errors use the existing
  save-error notification and stop further automatic project writes until
  reload; the current unsaved tab state stays in memory. Refresh does not erase
  pending/conflicting edits. Late save responses after logout are ignored.
- Migration status reports the write protocol and blocked legacy replacement.
  There are no new dashboard controls, labels, or visual changes.

### Deployment and remaining cutover gates

Deploy backend and frontend together, then reload all open NAm tabs. Old tabs
will show a save error rather than overwrite newer records. Before reloading a
conflicted tab, retain any manual edits you need to reapply; unsaved edits are
not durably persisted by this protocol. This is conflict detection, not an
automatic historical-data merge or a durable offline queue.

Backend Lulo transaction writes remain **OFF**, and the existing browser accrual
fallback remains. A future authoritative writer must acquire the SAME per-user
lock and update projects in place. The new protocol removes the known
replace-all race but does not prove real Lulo income parity, deployed uptime,
or closed-browser provider access. Those still require authenticated production
checks, a configured backend `LULO_API_KEY`, existing backup confirmation, and
multiple distinct matching observations from Phase 5.

### Validation

Backend tests cover atomic stale-batch rejection, create/replay, stale deletes,
ID collisions, cross-user ownership, transaction-row preservation, and legacy
write rejection. Frontend tests cover per-record differences, serialized
requests, edits during saves, conflict blocking, and logout races, alongside
the existing parity suites. The Python route tests use SQLite for persistence;
they do not prove PostgreSQL multi-worker lock contention. A deployed two-tab
conflicting-write check is still required before transaction-writing cutover.

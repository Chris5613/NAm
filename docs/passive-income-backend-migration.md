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

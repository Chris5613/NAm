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

# NAm

Personal finance and project-income dashboard, with a React frontend,
FastAPI backend, and PostgreSQL persistence.

## Code map

- `frontend/src/pages/YieldFarmingPage.jsx` — Passive Income page controller
  and live browser-extension synchronization.
- `frontend/src/lib/yieldFarmingAccounting.js` — legacy per-provider accrual
  formulas, tracker persistence, and project-income helpers.
- `frontend/src/components/YieldFarmingComponents.jsx` — project cards,
  editors, and monthly income views.
- `backend/project_accounting.py` — canonical current USD portfolio totals
  and signed daily income summation.
- `backend/routers/project_tracking.py` — authenticated project observations,
  validation, daily-income history, sync health, and recovery candidates.
- `backend/scheduler.py` — server-owned daily net-worth and project-balance
  snapshots, including 11:58 PM Pacific project backups.
- `docs/passive-income-backend-migration.md` — migration details, safety
  assumptions, and remaining work.

## Validation

The `NAm source validation` GitHub Actions workflow checks the Python
modules and regression tests, then builds the production React frontend.

Locally, with dependencies installed:

```bash
python -m unittest discover -s backend/tests -p 'test_*.py' -v
cd frontend
npm ci
npm run build
```

## Integration notes

- API-accessible projects can be polled by the server, but extension-dependent
  providers still require a logged-in browser for fresh readings.
- The backend saves and timestamps the last received readings; a closed browser
  cannot supply new Chrome-extension observations.
- Source-specific accrual rules remain in the accounting helper until each
  can be migrated with historical-regression fixtures. The backend already
  validates and sums current daily totals and current portfolio balances.
- New backend totals are shown only after they match live frontend totals,
  avoiding stale values during the gradual migration.
- The scheduled jobs require a continuously running backend and PostgreSQL.

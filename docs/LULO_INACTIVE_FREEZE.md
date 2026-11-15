# Lulo: INACTIVE / FROZEN — explicit user authorization required

**Status:** Inactive indefinitely, effective November 15, 2026.

**Instruction:** Do not change, refactor, migrate, "clean up", delete, re-enable,
reconcile, backfill, reprice, or repair **any Lulo-specific behavior, data, tests,
hooks, provider polling, endpoints, UI, or accounting logic** unless the user
explicitly requests changes to Lulo. A general instruction to "clean everything",
fix unrelated projects, or run an integrity audit does **not** authorize a Lulo
change.

This is a development change-freeze, **not** a modification of historical
financial balances, a rollback of previous user-approved withdrawals, or a
guarantee that Lulo provider polling is disabled. Do not alter Lulo runtime
behavior solely to apply this label.

Examples of frozen surfaces include:

- `backend/lulo_transaction_reconciliation.py`, `backend/income_history_core.py`
  (Lulo-specific portions), `backend/yield_source_sync.py`,
  `backend/yield_poll_merge.py`, `backend/yield_earnings_ledger.py`,
  `backend/legacy_income_reconciliation.py`, and Lulo-specific calculations
  within shared backend accounting/router modules.
- `frontend/src/hooks/useLegacyLuloMonthlyAccounting.js`,
  `frontend/src/lib/luloUtcDaily.js`, `frontend/src/lib/luloYieldSync.js`,
  and Lulo-specific portions of Yield Farming, income, provider-source,
  Financials, and Home displays.
- Lulo-specific fixtures, historical snapshots, recorded withdrawals, provider
  settings, and existing daily/monthly credited income.

**Enforcement:** CI checks modifications to Lulo-named source files and
Lulo-containing added/deleted source lines in shared modules. This is a
conservative guard, not a proof that any unrelated edit is safe: reviewers must
also inspect changes to shared income/asset calculations for indirect impact.
No automation is authorized to silently "fix" Lulo discrepancies. A direct
user request to resume work on Lulo is required to lift the freeze.

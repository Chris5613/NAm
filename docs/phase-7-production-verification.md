# Phase 7 — production verification and cutover gates

> Status: **verification only**. Do not enable backend-owned Lulo financial writes in this phase. Phase 6 adds conflict-safe project persistence but does not establish production parity.

## Preconditions

- Deploy matching frontend/backend revisions with the Phase 6 project-records protocol.
- Confirm PostgreSQL migrations/availability, a continuously running scheduler, and configured `LULO_API_KEY` (without exposing its value).
- Use a signed-in test account with known project history; export a separate verified backup before attempting conflict tests.
- Ensure older tabs are refreshed. Never send manual financial edits to production as synthetic test transactions.

## Automated checks (must pass)

```bash
python -m compileall -q backend
python -m unittest discover -s backend/tests -p 'test_*.py' -v
cd frontend
npm ci --no-audit --no-fund
CI=true npm test -- --watchAll=false --runInBand
CI=true npm run build
```

The GitHub Actions workflow runs these checks on code changes, but cannot prove multi-worker database locking, live provider access, or browser behavior.

## Live verification matrix

| Gate | Test | Expected result |
| --- | --- | --- |
| 1. Snapshot | Inspect authenticated `GET /api/yield-sources/cutover-backups` | Pre-cutover Lulo and Loopscale checkpoints exist and original financial history remains available |
| 2. Migration status | Inspect authenticated `GET /api/yield-sources/migration-status` | Source timestamps, parity state, and blockers are visible; backend write eligibility remains false |
| 3. Two-tab stale update | In a nonfinancial test project, open two tabs; save change A in one, then conflicting change B in the other | B returns 409; A survives; B's unsaved local state is not silently overwritten |
| 4. Independent projects | With two fresh browser tabs, edit different nonfinancial project fields | Unrelated edits survive; no collection-wide replacement |
| 5. Transaction integrity | Record existing transaction row counts/IDs; save ordinary nonfinancial project fields | Transaction IDs, amounts, and history remain unchanged |
| 6. Replay safety | Repeat the *same* previously accepted project change, with no intervening changes | Identical request is idempotent; no duplicated project or transaction |
| 7. Old client safety | Attempt legacy project POST/PUT/DELETE only against a dedicated nonfinancial test account | 409 instead of replace-all overwrite |
| 8. Closed-browser polling | Close the NAm tab and browser; inspect source status after multiple polling intervals | New server observations appear for registered wallets, or an explicit provider error is reported; no fabricated zero income |
| 9. Lulo parity | Compare several distinct sequential live observations, including a real cash-flow event when available | Same-input parity agrees; production persisted-ledger parity is independently confirmed |
| 10. Accounting boundary | Inspect stored projects and generated previews before/after polling | No server preview writes or rewrites Project or ProjectTransaction earnings |

## Stop conditions

Stop and do **not** enable transaction cutover if any of the following occurs:

- A missing backup, inconsistent project ownership, or disappearing relational transaction rows
- A stale edit is accepted instead of rejected, or unrelated edits disappear
- A provider snapshot is stale, out of order, or cannot be reproduced from upstream data
- Lulo same-input or persisted-ledger parity is mismatched or unverified
- PostgreSQL concurrency has not been tested against the actual deployed multi-worker setup
- The backend scheduler does not reliably advance observations while Chrome is closed

## Exit criteria

Document evidence (date, deployment SHA, sanitized API statuses, test results, and backup presence) for every gate. **Do not record wallet secrets, cookies, private keys, API keys, or personal transaction payloads** in issues or CI logs.

Only after all gates pass should a *separate*, reviewed change propose one authoritative backend transaction writer under the same per-user PostgreSQL lock, using per-project in-place updates, explicit replay protection, and a rollback procedure. The legacy browser financial accrual path must not remain a competing writer.

## Rollback approach

For a failed frontend/backend rollout, disable new financial write behavior (currently already disabled), restore matching application revisions, and retain database history and checkpoint records. Do not automatically replace live financial rows with old backup snapshots; reconcile differences and obtain approval for any targeted data repair.

# Phase 7 — provider-polling and diagnostic evidence safety

## Write ownership

The deployed app still uses browser-owned transaction history. Server polling is read-only relative to project earnings and transaction rows, and may write only separate server-owned snapshots, source observation history, shadow ledgers, diagnostic parity reports, and backups.

## Polling invariants

- A per-user PostgreSQL `FOR UPDATE` lock serializes writes to server-owned source observations and project records; upstream HTTP calls occur outside this lock.
- An in-flight poll is discarded if its wallet registration changed before the locked commit, even if a wallet was changed and changed back.
- Each source reading is admitted only when the wallet identity matches, the timestamp is timezone-aware and newer than the previously accepted source reading, and monetary fields are finite.
- Partial failures retain the last successful snapshot of every provider. A late older worker may advance an individual provider if it fetched a strictly newer valid reading, but it cannot regress a later poll's `checkedAt` or `errors`.
- Same-source timestamp replays do not add audit entries or count as new observations.
- Positive Lulo balance, finite cumulative interest, nonnegative Loopscale position, and signed finite Loopscale P&L are validated before snapshots become authoritative read-only observations.
- Parity diagnostics acquire the same user lock before reading the project and updating the observation streak, preventing independent requests from overwriting reports in a read-modify-write race.

## Cutover gates

`tools/phase7_readiness_check.py` independently checks the two server read-only diagnostic endpoints. A green result is **not authorization** to enable earnings writes. Production workers, history recovery, two-tab conflict rejection, closed-browser polling and manual backup restoration still require checks with disposable and/or read-only evidence.

## Rollback posture

Do not disable the backend write-off switch or replace existing browser-ledger history. If polling validation fails in deployment, revert only the polling/reporting code after retaining required evidence; existing project earnings and transactions must remain untouched. Never share session cookies or original account transactions in test artifacts.

## Wallet registration rotation and status

- Every wallet-registration change increments a per-user, monotonically increasing
  `revision`. In-flight pollers only commit observations if the revision and
  wallet identities still match the registration they originally read.
- Rotation or removal of wallets clears obsolete **live snapshot cache** entries
  under the same user lock. It resets polling freshness timestamps and errors so
  an earlier provider success is never misreported for a new registration.
- Legacy audit observations, independent earnings shadow ledgers, and immutable
  pre-cutover transaction backups are **not deleted** by wallet registration.
- A corrupted provider snapshot is reported as `InvalidSnapshot`; normal
  replays with the same source timestamp are silently ignored (not failures).

## Read-only live closed-browser probe

After closing every NAm browser tab, a deployment operator can run:

```sh
export NAM_SESSION_COOKIE='(session cookie from authenticated operator session)'
python tools/phase7_live_diagnostics.py --base-url https://YOUR-NAM-DEPLOYMENT \
  --interval-seconds 660
unset NAM_SESSION_COOKIE
```

Only three authenticated GET endpoints are used (`latest`, `migration-status`,
`cutover-backups`). The script refuses non-local plaintext HTTP, never prints
session cookies, wallet addresses, transactions, or full provider readings, and
requires a **new source timestamp for the same wallet** plus a newer successful
server-poll timestamp. Diagnostic readiness is evaluated separately. An HTTP
failure, stale polling, missing backups, or parity blocker returns exit code 2.
Even a passing probe does **not** authorize automatic financial transactions.

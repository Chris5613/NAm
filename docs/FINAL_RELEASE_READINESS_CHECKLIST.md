# NAm final release-readiness checklist — 2026-11-15

This checklist is an **evidence ledger**, not a claim that every historical
record is complete. A checked item means the named verification was performed
successfully. A blocked item may not be force-completed without original
source evidence or an explicitly authorized policy decision.

**Operating rules:** The backend and Postgres are the source of accounting
truth. Do not invent dated rewards, add cost recovery to business revenue,
reset journal snapshots, or make fake zero balances. All Lulo-specific code and
records remain frozen under `docs/LULO_INACTIVE_FREEZE.md` until the user
explicitly authorizes changes to them.

## 1. Salad dated income evidence

- [x] The saved **2026-11-13** Salad receipt of **$0.02737941** is
  *user-confirmed*, not independently verified by the provider.
- [x] **2026-11-14** Salad **$0.00046496** is supported by anchored provider
  lifetime snapshots and remains distinct from the user-confirmed receipt.
- [x] The backend identifies the receipts by their distinct evidence
  provenance and does not post a second business revenue entry.
- [x] **Device-scoped provider coverage** now checks only the Salad earning
  days beginning with each device's actual saved start date, honoring
  validated dated source switches. The RTX 5080 began **November 13**:
  November 13 is user-attested and November 14 has provider lifetime
  evidence. Both completed days are covered as of November 15; the
  incomplete November 15 is explicitly excluded from certification.
  `backend/salad_device_day_coverage.py` exposes the coverage in
  `/api/project-tracking/cross-page-integrity` and dedicated tests.
  This does **not** certify older unassociated Salad income history.
- [ ] Provider-grade daily evidence **before November 13**: available saved
  lifetime snapshots begin too late to prove those prior daily increments.
  Do not synthesize exact earlier earnings from month-level balances.
- [ ] The current/incomplete Pacific day cannot be certified before a complete
  closing observation is available. Monitor further snapshots after day-end.

**Status:** Device-eligible completed-day RTX 5080 recovery through
November 14 has sufficient evidence, checked automatically by the backend;
pre-November-13 **general Salad income history**, and any future completed
day lacking closeout evidence, remain separate unresolved limitations.

## 2. Hardware Payback calculation and cash basis

- [x] Saved RTX 2080: **$500 cash payback basis**, Kryptex start
  **2026-11-01**.
- [x] Saved RTX 5080: **$1,250 cash payback basis**, Kryptex + Salad
  starts **2026-11-13**. The separate accounting equipment acquisition of
  **$1,950** includes trade-in consideration and is not the same as cash paid.
- [x] Frozen completed-day regression checks the income earned through
  **2026-11-14**, including the shared Kryptex reward once as business income
  but legitimately credited to two device recovery views.
- [x] The live forecast calculation blends 70% of trailing seven
  completed-day Kryptex average with 30% live account Kryptex rate and adds
  separately dated Salad reward estimates for the 5080. Forecast earnings
  are **not booked** as historical earnings.
- [x] November mining power policy: utility kWh/nominal estimated power
  expense is monitored, but out-of-pocket power is zero; no fictional bill.
- [ ] Certification of the **ongoing incomplete day** waits for finished
  provider observations; incomplete recovery remains labeled.

**Status:** Calculation path and historical completed-day recovery verified;
current-day certification is a rolling task.

## 3. September and October Financials closes

- [x] Monthly Changes snapshots and provider income months are locked;
  browser and authenticated database journal-write protections enforce
  those locks.
- [x] The backend close-readiness endpoint explains exactly what evidence
  is missing and never invents a financial close.
- [ ] September / October **beginning bank cash** was not recorded: stored
  `financials_bank_openings_v1` only has a November opening.
- [ ] September / October provider asset ending values include historical
  **estimates**, not verified historical valuation certificates.
- [ ] No independent closed Financials General Ledger statements for those
  months are saved. Must not fabricate them to clear audit warnings.

**Status:** Protected but **uncertified historical exceptions** until actual
source records are supplied. Lulo historical data/code remains untouched.

## 4. Authenticated end-to-end checks

- [x] Real signed-session/unauthenticated HTTP requests, hardware payback,
  nonposting hardware edit, current journal, Financials statement,
  cross-page report, historical close-readiness and locked-month write
  rejection are exercised through the FastAPI app on **disposable CI
  PostgreSQL**, with original source fixtures isolated from production.
- [x] All three authenticated integration smoke tests passed in CI and
  cleanup left the disposable database unmodified after completion.
- [x] A **Run live audit** action is deployed on Financials. It invokes the
  authenticated `GET /api/project-tracking/cross-page-integrity` endpoint
  directly, bypasses session display caches, validates the read-only response
  shape, displays pass/warning/error checks and missing evidence, and lets
  the signed-in owner **Copy audit results** for review. Frontend component
  tests verify the button, reporting, failures and report copying.
- [ ] A real signed-in **production browser session** has not been exercised
  by this audit. Never impersonate the account or claim UI click testing
  without a valid delegated browser session.

**Status:** Authenticated API integration, browser component interactions,
and signed-in production audit controls verified in CI. To finish this
remaining acceptance check, the account owner must open
`https://nam-qyn8.onrender.com`, sign in, go to **Financials → Run live
audit**, then use **Copy audit results** to share the exact production
status. The automated assistant has no signed-in production browser session
or valid session cookie, and must not claim that the owner clicked it.

## 5. Cross-page source reconciliation

- [x] Booked provider monthly totals sum to their provider components.
- [x] Confirmed Kryptex dated mining tracker and booked income agree within
  documented rounding, avoiding BTC-price-only changes as added earnings.
- [x] RollerCoin monthly book total agrees with its dated wallet rewards.
  An older raw daily log omitted a wallet observation and is **not** a
  competing source of monthly booked income.
- [x] Saved all-project and active-only portfolio totals match the summed
  latest provider feed; wallet values, inactive historical holdings,
  equipment PPE and business income are different accounting categories.
- [x] CI cross-page integrity tests compare backend Home and Financials
  calculations, and reject contradictory totals rather than rebook them.
- [x] Read-only source-level PostgreSQL rechecks on November 15 show
  September **$330.062266**, October **$202.769111** and open November
  **$86.541672** booked income each equal the sum of their own platform
  breakdown to eight decimal places at the sampled time. Latest saved
  backend portfolio is **$3,947.57529904** overall / **$2,388.21713298**
  active, exactly equal to the most recent unique provider feed. Values
  are **sampled**, not fixed forever.
- [ ] The authenticated **live production** cross-page endpoint was not
  independently invoked with a real signed-in browser session. Available
  source-level PostgreSQL reconciliation was read-only.

**Status:** Comparable source totals reconciled; full authenticated production
UI parity is not yet independently certified.

## 6. Deployment and ongoing monitoring

- [x] Frontend and backend Render deploys verified live, with recent
  error-level service logs checked.
- [x] GitHub CI checks backend tests, frontend tests/build, PostgreSQL
  concurrency, dependency reports, and the inactive-project code freeze.
- [x] Daily **NAm Integrity Watch** remains enabled at **08:00 Pacific**;
  latest recorded run completed and found no confirmed issue requiring an
  alert. Updated to monitor dated Salad support, hardware forecast and
  historical Financials exceptions without mutating records.
- [x] The monitor is read-only and should alert on new substantive drift,
  failed deploys or monitoring access loss, not on known incomplete historic
  evidence or expected inactive-source cadence.

**Status:** Operating controls deployed; continuing health must always be
checked over time, not declared permanently finished from one good run.

## Overall release decision

**The code migration and automated source-level checks are suitable for
continued operation. Full unconditional historical accounting certification
is NOT yet supported.** Remaining blockers are the missing pre-November-13
Salad dated observations; historic September/October bank openings and
estimated asset valuations; and the final production signed-in UI audit
clickthrough, now available directly in Financials without a code change.

Never mark a blocked box complete merely to reach six of six.

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

## Owner acceptance decision — 2026-11-15

**Salad historical receipt amounts: ACCEPTED / COMPLETE FOR THE OWNER'S
RELEASE CHECKLIST.** The owner explicitly confirmed "mark salad as complete
i know its correct" on November 15. This closes the discretionary
*acceptance* task for existing Salad receipt figures. This decision **does
not** purport to turn legacy dated records into independently verified
provider evidence, approve invented days, change RTX 5080 earning start,
replace immutable provider/source tags, credit additional device revenue,
or permit booking a missing/unobserved day's earnings. The read-only
integrity audit must keep showing actual provenance and current-day gaps.
A future objectively detected amount discrepancy remains actionable even
though the historic acceptance task was marked complete.

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
- [x] **Owner accepted** legacy Salad daily receipt amounts before
  November 13 as accurate for the release checklist. Independently
  provider-verifiable snapshots begin later, so the original record
  provenance stays labeled **legacy / user-accepted**, not provider-verified.
  Do not synthesize earlier daily earnings or change booked totals.
- [x] Ongoing Salad day-end verification is an operational monitoring
  requirement, not a remaining *one-time release checklist blocker*.
  The incomplete Pacific day remains explicitly unverified until closing
  evidence exists; daily integrity monitoring continues.

**Status:** **COMPLETE — owner-accepted Salad receipt history.**
Independent provider-proof limits and future unfinished days remain
clearly identified in the audit; no data/provenance/revenue was altered.

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
- [x] On **November 15, 2026, at 22:46:24 UTC**, the account owner
  used **Financials → Run live audit**, copied its authenticated production
  report, and pasted the result in the ChatGPT project conversation.
  This is **user-supplied live account evidence**, not an assistant-controlled
  browser session. The report's overall status was `warning`, with **no
  error-level checks**. Specifically **PASS**: all three monthly booking and
  Passive Income history pairs, crypto portfolio, Home/Financials balances,
  nonposting journal preview, Salad device dated coverage and provider-month
  reconciliation. **WARNING**: inactive historical holding valuation;
  uncertified September and October Financials closes; incomplete hardware
  evidence; and provisional dated earnings. **INFO**: inactive portfolio
  holdings and sub-cent source precision differences.
- [x] The backend now includes exact device-specific missing/provisional
  source dates, stale checkpoint flags and dated-provider review evidence
  in the read-only audit and its copyable UI. No booked revenue was changed.

**Status:** **Completed.** The owner provided a genuine
authenticated production audit report; signed-in production execution is
now evidenced. Backend and UI integration tests are independently green.
This does not mean the remaining historical evidence warnings were resolved.

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
- [x] The authenticated **live production** cross-page endpoint
  returned a real signed-in owner-generated report on **November 15 at
  22:46:24 UTC**. Home/Financials, project income, crypto totals and
  provider booked-vs-dated sources all reported **PASS**.
  The report's overall `warning` status reflects historical evidence
  exceptions and provider-day recovery flags, **not an accounting mismatch**.
  The assistant did not impersonate the owner or access login credentials.

**Status:** **Completed for comparable source totals and the production
authenticated report.** Remaining warning evidence is disclosed separately;
no false zero warnings or historical corrections were inserted.

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

## November 15, 2026 production audit follow-up (23:10–23:11 UTC)

- [x] User-supplied authenticated reports at
  **2026-11-15T23:10:46.855853+00:00** and
  **2026-11-15T23:11:01.309622+00:00** were identical in result:
  **no error checks** and no change to the recurring documented warnings.
  Every booked income month, Passive Income, portfolio, Home/Financials,
  General Ledger, Salad completed-day coverage and monthly provider sources
  were `PASS`.
- [x] The hardware review was narrowed to a missing **Nov 15 current-day**
  Salad observation and a pre-start historical checkpoint baseline warning;
  there were **no missing RTX 2080 source days** and no provisional device
  credits in this audit. Checkpoint amounts never post business revenue.
- [x] Added a separate read-only `hardware-completed-day-coverage` check to
  distinguish missing **completed** device days from an unfinished Pacific
  day. Its verified result may be `PASS` while the original lifetime
  `hardware-credit` stays `WARNING`; the latter remains conservative and
  must not be falsified to green. The signed-in UI and clipboard report
  expose both kinds of missing evidence.
- [x] Owner accepted historical Salad receipt amounts; their retained
  provisional evidence class is deliberately unchanged. Historical
  Loopscale and other non-Salad daily receipts remain separately
  legacy/provisional (the backend audit reported Loopscale Nov 1–4,
  6–15). Preserve original values and provenance unless independent
  provider evidence is available.
  Inactive Lulo audit exceptions are informational historical evidence
  only; **Lulo-specific source code and data must remain frozen**.
- [ ] September/October formal Financials closes remain blocked by
  independently verified opening cash and asset estimates.

## Overall release decision

**The code migration and automated source-level checks are suitable for
continued operation. Full unconditional historical accounting certification
is NOT yet supported.** Salad historical amounts have been expressly
accepted by the owner, with provenance kept accurate. The remaining
one-time certification blockers are September/October verified bank openings
and estimated historical asset valuations; current and future dated provider
evidence remains an ongoing operational monitoring issue.
The owner has now completed the production signed-in audit clickthrough.

Never mark a blocked box complete merely to reach six of six.

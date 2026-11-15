# September–October 2026 Financials: source-evidence intake

**Owner release acceptance on November 15, 2026:** The user
explicitly opted to skip additional historical evidence collection and
accept the saved September/October amounts as correct for the application
release. This **closes the release checklist exception by owner waiver**,
without claiming independent verification, creating a certified historical
Financials close, or changing the original stored estimates. This document
remains the preserved source-evidence limitations inventory.

**Status:** protected / uncertified. Read-only inspection of the live NAm
PostgreSQL settings on November 15, 2026. This document is an audit
workpaper, **not** a certified General Ledger close or accounting entry.

The records that are already valid and protected:
- September booked project income: **$330.062266**, its provider components
  sum to exactly that total, and Monthly Changes are locked.
- October booked project income: **$202.769111**, its provider components
  sum to exactly that total, and Monthly Changes are locked.
- The current `financials_bank_openings_v1` stores only
  `{"2026-11": 0}`. Neither prior month's bank opening is verified.
- `financials_month_closes_v1` has no saved certified rows for either month.
- The historical `monthly_net_worth_history_v1/v2` contains whole-account
  totals, not dated independent source statements for the individual
  September/October provider assets. These cannot be substituted for a
  missing bank statement or used to claim the estimates were verified.
- `cloud_starting_bankroll: 1000` is a separate September-era starting
  bankroll setting. It is **not documented as the opening bank cash** for
  the Financials ledger and must not be silently substituted.

## September 2026: protected Monthly Changes asset values

| Account | Saved September ending USD | Evidence state |
| --- | ---: | --- |
| RollerCoin | 129.54 | Estimated; needs Sep 30 provider statement |
| Lulo | 2,476.30 | Estimated historical record; **Lulo is frozen** |
| Loopscale | 2,014.47 | Estimated; needs Sep 30 provider statement |
| Salad | 21.81 | Estimated asset balance; user accepted earnings, not this independently dated month-end asset value |
| BTC | 1,425.62 | Estimated; needs wallet balance and historical USD pricing as of Sep 30 |
| Kryptex | 197.79 | Estimated; needs Sep 30 provider wallet balance |
| Unetwork | 15.47 | Recorded (not flagged estimated); retain support |

6 of 7 rows were explicitly saved as estimated. No unknown amount
was invented and no historical source is rewritten.

**Beginning bank cash required:** source-supported balance at Sep 1,
2026, with identifying transaction reconciliation if the exact beginning
balance is reconstructed from original bank statements.

## October 2026: protected Monthly Changes asset values

| Account | Saved October ending USD | Evidence state |
| --- | ---: | --- |
| Lulo | 2,484.14 | Estimated historical record; **Lulo is frozen** |
| Loopscale | 2,040.18 | Estimated; needs Oct 31 provider statement |
| Salad | 54.48 | Estimated asset balance; user accepted earnings, not this independently dated month-end asset value |
| BTC | 1,321.21 | Estimated; needs wallet balance and historical USD pricing as of Oct 31 |
| Kryptex | 282.96 | Estimated; needs Oct 31 provider wallet balance |
| Unetwork | 37.95 | Recorded (not flagged estimated); retain support |
| RollerCoin | 11.79 | Estimated; needs Oct 31 provider statement |

6 of 7 rows were saved as estimated.

**Beginning bank cash required:** source-supported balance at Oct 1,
2026, or a defensible roll-forward from a verified Sep opening + complete
dated September bank movements and ending Sep cash.

## Conditions for completing certification

1. Preserve each source's original dated report or a bank statement and
   the valuation timestamp; if a provider cannot provide a historical
   position value, mark that row `unverifiable historical estimate` and
   leave the month *uncertified*.
2. Reconcile beginning bank cash, deposits, transfers, fees and journal
   cash movements. **Do not mistake the $1,000 bankroll target for bank cash.**
3. Review any asset value difference **before** changing a period protected
   by the user. Do not bypass month-lock guards to correct an estimate.
4. Only after the input evidence is verified should a separate auditable
   Financials closing statement be recorded, with who certified it and
   which source documents supported it. September and October must stay
   locked throughout; never create placeholder close rows.

## What is already finished

- Live provider month and Passive Income totals reconcile.
- Home, Financials and Crypto comparable totals agree in authenticated
  production audit.
- Both historical Monthly Changes periods are protected against edits.
- The Financials page now includes an expanded month-specific evidence list
  under the warning, backed by the read-only
  `GET /api/project-tracking/financial-core/close-readiness/{month}` API.
- Salad **receipt amounts** are accepted by the owner for the release
  checklist; this does not create or certify a provider balance statement.

**Release decision:** All six engineering/release checklist
workstreams are complete or explicitly owner-accepted. Independent
September/October historical certification has **not been performed**,
because its original source documents are missing; the owner expressly
waived that additional evidence as a release requirement. These months
remain locked and appropriately described as historically uncertified
in the underlying read-only accounting audit.

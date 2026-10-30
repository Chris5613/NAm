// Compatibility hook for Lulo's pre-cutover monthly accounting.
// Retains the exact two existing effects while backend parity is validated.
import { useEffect } from "react";
import {
  getCurrentMonthKey, getTodayKey, MONTHLY_TRACKING_START,
  LULO_MONTHLY_ACCOUNTING_VERSION, LULO_SEPTEMBER_2026_OPENING_EARNED,
} from "@/lib/yieldFarmingAccounting";

export function useLegacyLuloMonthlyAccounting({
  luloProjects, luloMonthlyBaselines,
  setLuloMonthlyBaselines, setMonthlyBackfills,
}) {
  useEffect(
    () => {
      if (
        !luloProjects.length
      ) {
        return;
      }

      const monthKey =
        getCurrentMonthKey();

      if (
        monthKey <
        MONTHLY_TRACKING_START
      ) {
        return;
      }

      /*
       * Lulo monthly income is tracked as a monotonic total instead of
       * being rebuilt from Lulo's raw lifetime-interest counter.
       *
       * Why: deposits and withdrawals can change Lulo's accounting
       * fields even though no yield was earned. We detect a meaningful
       * principal balance change, preserve the month-to-date income, and
       * simply re-anchor the lifetime-interest counter at the new value.
       *
       * Version 3 also repairs September 2026 to the last known-good
       * amount ($7.76) from immediately before the withdrawal.
       */
      setLuloMonthlyBaselines(
        (current) => {
          let changed =
            false;

          const next = {
            ...current,
          };

          const now =
            new Date();

          const nowIso =
            now.toISOString();

          luloProjects.forEach(
            (project) => {
              if (
                !project?.id
              ) {
                return;
              }

              const lifetimeInterest =
                Number(
                  project.lulo_lifetime_interest_usd
                );

              const balanceUsd =
                Number(
                  project.lulo_total_balance_usd
                );

              if (
                !Number.isFinite(
                  lifetimeInterest
                ) ||
                lifetimeInterest <
                  0 ||
                !Number.isFinite(
                  balanceUsd
                ) ||
                balanceUsd <
                  0
              ) {
                return;
              }

              const projectKey =
                String(
                  project.id
                );

              const projectMonths = {
                ...(
                  next[
                    projectKey
                  ] ||
                  {}
                ),
              };

              const previous =
                projectMonths[
                  monthKey
                ];

              /*
               * One-time migration from the old baseline/remainder
               * accounting. The old September data has already been
               * contaminated by the withdrawal, so re-anchor it now.
               */
              if (
                !previous ||
                Number(
                  previous.version
                ) !==
                  LULO_MONTHLY_ACCOUNTING_VERSION
              ) {
                projectMonths[
                  monthKey
                ] = {
                  version:
                    LULO_MONTHLY_ACCOUNTING_VERSION,
                  monthEarned:
                    monthKey ===
                    "2026-09"
                      ? LULO_SEPTEMBER_2026_OPENING_EARNED
                      : 0,
                  lastLifetimeInterest:
                    lifetimeInterest,
                  lastBalanceUsd:
                    balanceUsd,
                  createdAt:
                    nowIso,
                  lastSyncedAt:
                    nowIso,
                };

                next[
                  projectKey
                ] =
                  projectMonths;

                changed =
                  true;

                return;
              }

              const previousInterest =
                Number(
                  previous.lastLifetimeInterest
                );

              const previousBalance =
                Number(
                  previous.lastBalanceUsd
                );

              let monthEarned =
                Number(
                  previous.monthEarned
                ) || 0;

              const interestDelta =
                Number.isFinite(
                  previousInterest
                )
                  ? (
                      lifetimeInterest -
                      previousInterest
                    )
                  : 0;

              const balanceDelta =
                Number.isFinite(
                  previousBalance
                )
                  ? (
                      balanceUsd -
                      previousBalance
                    )
                  : 0;

              const referenceBalance =
                Math.max(
                  balanceUsd,
                  Number.isFinite(
                    previousBalance
                  )
                    ? previousBalance
                    : 0
                );

              const cashFlowThreshold =
                Math.max(
                  5,
                  referenceBalance *
                    0.0025
                );

              const principalMoved =
                Number.isFinite(
                  previousBalance
                ) &&
                Math.abs(
                  balanceDelta
                ) >=
                  cashFlowThreshold;

              let acceptInterestDelta =
                false;

              if (
                !principalMoved &&
                interestDelta >
                  0
              ) {
                const previousSyncMs =
                  new Date(
                    previous.lastSyncedAt ||
                      previous.createdAt ||
                      nowIso
                  ).getTime();

                const elapsedDays =
                  Number.isFinite(
                    previousSyncMs
                  )
                    ? Math.max(
                        (
                          now.getTime() -
                          previousSyncMs
                        ) /
                          86400000,
                        1 / 1440
                      )
                    : 1 / 1440;

                const apy =
                  Math.max(
                    0,
                    Number(
                      project.lulo_weighted_apy
                    ) || 0
                  );

                const expectedInterest =
                  referenceBalance *
                  (
                    apy /
                    100
                  ) *
                  (
                    elapsedDays /
                    365
                  );

                const plausibleLimit =
                  Math.max(
                    0.5,
                    (
                      expectedInterest *
                      5
                    ) +
                      0.1
                  );

                acceptInterestDelta =
                  interestDelta <=
                  plausibleLimit;
              }

              // Preserve accepted yield by observation date. Never infer
              // historical day allocations from a balance snapshot.
              const observedDaily = {
                ...(previous.observedDaily || {}),
              };
              if (acceptInterestDelta) {
                monthEarned += interestDelta;
                const observationDay = getTodayKey();
                observedDaily[observationDay] = Number((
                  (Number(observedDaily[observationDay]) || 0) +
                  interestDelta
                ).toFixed(8));
              }

              const updated = {
                ...previous,
                version:
                  LULO_MONTHLY_ACCOUNTING_VERSION,
                monthEarned:
                  Number(
                    Math.max(
                      0,
                      monthEarned
                    ).toFixed(
                      6
                    )
                  ),
                observedDaily,
                lastLifetimeInterest:
                  lifetimeInterest,
                lastBalanceUsd:
                  balanceUsd,
                // Only advance persistence timestamps for meaningful changes.
                lastSyncedAt:
                  nowIso,
                lastCashFlowAt:
                  principalMoved
                    ? nowIso
                    : (
                        previous.lastCashFlowAt ||
                        null
                      ),
              };

              // A fresh polling timestamp alone must not rewrite remote
              // settings dozens of times per minute.
              const previousComparable = { ...previous };
              const updatedComparable = { ...updated };
              delete previousComparable.lastSyncedAt;
              delete updatedComparable.lastSyncedAt;
              if (
                JSON.stringify(updatedComparable) !==
                JSON.stringify(previousComparable)
              ) {
                projectMonths[
                  monthKey
                ] =
                  updated;

                next[
                  projectKey
                ] =
                  projectMonths;

                changed =
                  true;
              }
            }
          );

          return changed
            ? next
            : current;
        }
      );
    },
    [
      luloProjects,
      setLuloMonthlyBaselines,
    ]
  );

  useEffect(
    () => {
      if (
        !luloProjects.length
      ) {
        return;
      }

      const monthKey =
        getCurrentMonthKey();

      if (
        monthKey <
        MONTHLY_TRACKING_START
      ) {
        return;
      }

      /*
       * monthlyBackfills now stores the authoritative Lulo month total.
       * buildProjectIncome() ignores legacy lulo_yield transactions for
       * months that have one of these totals, preventing double counting.
       */
      setMonthlyBackfills(
        (current) => {
          let changed =
            false;

          const next = {
            ...current,
          };

          luloProjects.forEach(
            (project) => {
              if (
                !project?.id
              ) {
                return;
              }

              const projectKey =
                String(
                  project.id
                );

              const tracker =
                luloMonthlyBaselines?.[
                  projectKey
                ]?.[
                  monthKey
                ];

              if (
                !tracker ||
                Number(
                  tracker.version
                ) !==
                  LULO_MONTHLY_ACCOUNTING_VERSION
              ) {
                return;
              }

              const monthEarned =
                Number(
                  tracker.monthEarned
                );

              if (
                !Number.isFinite(
                  monthEarned
                ) ||
                monthEarned <
                  0
              ) {
                return;
              }

              const existing =
                next[
                  projectKey
                ] || {};

              const previousValue =
                Number(
                  existing?.[
                    monthKey
                  ]
                );

              if (
                Number.isFinite(
                  previousValue
                ) &&
                Math.abs(
                  previousValue -
                    monthEarned
                ) <
                  0.000001
              ) {
                return;
              }

              next[
                projectKey
              ] = {
                ...existing,
                [monthKey]:
                  monthEarned,
              };

              changed =
                true;
            }
          );

          return changed
            ? next
            : current;
        }
      );
    },
    [
      luloProjects,
      luloMonthlyBaselines,
      setMonthlyBackfills,
    ]
  );
}

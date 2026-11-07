import { useUnetworkExtension } from "../hooks/useUnetworkExtension";
import { useSaladExtension } from "../hooks/useSaladExtension";
import { buildSelectedEarningsBreakdown, buildTodayEarningsDisplay } from "../lib/earningsDisplay";
import { buildWeeklyEarningsChart } from "../lib/weeklyEarningsChart";
import { useServerDailyIncome } from "../hooks/useServerDailyIncome";
import { useDailyEarningsObservations } from "../hooks/useDailyEarningsObservations";
import { useDailyEarningsHighWater } from "../hooks/useDailyEarningsHighWater";
import { buildSourceTotalsForDay } from "../lib/yieldIncomeSources";
import { buildMonthlyEarningsChart } from "../lib/monthlyEarningsChart";
import { buildDailyEarningsChart } from "../lib/dailyEarningsChart";
import { kryptexIncrease } from "../lib/kryptexEarnings";
import { recordKryptexDailyBalance } from "../lib/kryptexDailyBalance";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { remoteStorage } from "@/lib/serverStore";
import { stockPayoutTotal } from "@/lib/stockDividendPayouts";
import { projectsApi } from "@/lib/api";
import { getLoopscaleOnycSnapshot } from "@/lib/loopscaleYieldSync";
import { useRegisteredYieldWallets } from "@/hooks/useRegisteredYieldWallets";
import { useBackendLoopscaleHistory } from "@/hooks/useBackendLoopscaleHistory";
import { useInactiveYieldProjects } from "@/hooks/useInactiveYieldProjects";
import { useStockDividendPayouts } from "@/hooks/useStockDividendPayouts";
import { useYieldPersistence } from "@/hooks/useYieldPersistence";
import { api } from "@/lib/apiClient";
import { toast } from "sonner";
import { useBackendProviderStats } from "@/hooks/useBackendProviderStats";
import { useBackendMonthlyIncome } from "@/hooks/useBackendMonthlyIncome";
import { currentLuloUtcDaily } from "@/lib/luloUtcDaily";
import { useLegacyLuloMonthlyAccounting } from "@/hooks/useLegacyLuloMonthlyAccounting";
import { latestRollerCoinTimestamp, shouldAcceptRollerCoinBalance } from "@/lib/rollerCoinFreshness";
import { Card, CardContent } from "@/components/ui/card";
import DividendIncomeSection from "@/components/DividendIncomeSection";
import { Area, AreaChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CircleDollarSign, X } from "lucide-react";
import {
  readObject,
  saveObject,
  loadProjectPayback,
  saveProjectPayback,
  loadProjectExpenses,
  saveProjectExpenses,
  loadProjectLogos,
  saveProjectLogos,
  loadMonthlyBackfills,
  saveMonthlyBackfills,
  loadLuloMonthlyBaselines,
  saveLuloMonthlyBaselines,
  loadMonthlySnapshots,
  saveMonthlySnapshots,
  loadLoopscaleHistory,
  saveLoopscaleHistory,
  saveSaladTracker,
  getSaladTrackerStats,
  saveUnetworkTracker,
  getUnetworkTrackerStats,
  loadRollerCoinTracker,
  saveRollerCoinTracker,
  getRollerCoinTrackerStats,
  loadPositions,
  savePositions,
  formatCurrency,
  getCurrentMonthKey,
  getCurrentYear,
  getTodayKey,
  createLuloProjectCard,
  updateLoopscaleHistoryFromSnapshot,
  createLoopscaleProjectCard,
  groupManualPositions,
  loadKryptexTracker,
  saveKryptexTracker,
  getKryptexStats,
  buildProjectIncome,
  reconcileMonthlySnapshots,
  getEffectiveProjectIncome,
  DAILY_BALANCE_SNAPSHOT_KEY,
  DAILY_EARNINGS_CHART_OBSERVATIONS_KEY,
  AUTO_RECOVERED_EARNINGS_KEY,
  PROJECT_QUICK_CACHE_KEY,
  INACTIVE_PROJECTS_KEY,
  PROJECT_INCOME_PORTFOLIO_SUMMARY_KEY,
  getKryptexOpeningBalanceUsd,
  getPrivateAccountingProfile
} from "@/lib/yieldFarmingAccounting";
import {
  KryptexProjectCard,
  getProjectProjections,
  formatCompactSyncAge,
  ProjectCard,
  UnetworkProjectCard,
  SaladProjectCard,
  RollerCoinProjectCard,
  ProjectIncomeSection
} from "@/components/YieldFarmingComponents";

export default function YieldFarmingPage() {
  const {
    stockPayouts,
    recordStockPayout,
    removeStockPayout,
    restoreStockPayout,
    recordAnnouncedStockPayouts,
  } = useStockDividendPayouts();
  const [estimatedStockDividendsAnnual, setEstimatedStockDividendsAnnual] = useState(null);
  const updateStockDividendEstimate = useCallback(value => {
    setEstimatedStockDividendsAnnual(previous => previous === value ? previous : value);
  }, []);
  const [
    manualPositions,
    setManualPositions,
  ] = useState(
    loadPositions
  );

  const [
    projectPayback,
    setProjectPayback,
  ] = useState(
    loadProjectPayback
  );

  const [
    projectExpenses,
    setProjectExpenses,
  ] = useState(
    loadProjectExpenses
  );

  const {
    inactiveProjectIds,
    deactivateProject,
    reactivateProject,
  } = useInactiveYieldProjects();

  const [
    allProjects,
    setAllProjects,
  ] = useState(() => {
    const cached = readObject(PROJECT_QUICK_CACHE_KEY).projects;
    return Array.isArray(cached) ? cached : [];
  });

  const [
    luloProjects,
    setLuloProjects,
  ] = useState(() => {
    const cached = readObject(PROJECT_QUICK_CACHE_KEY).projects;
    return Array.isArray(cached) ? cached.filter(project => project?.yield_tracking === "lulo_lending") : [];
  });

  const [
    loopscaleSnapshot,
    setLoopscaleSnapshot,
  ] = useState(() => readObject(PROJECT_QUICK_CACHE_KEY).loopscaleSnapshot || null);

  const loopscaleWallet =
    getPrivateAccountingProfile()?.loopscaleWallet || "";

  // Register provider public wallets once, then the server continues to poll
  // them independently of whether NAm is open.
  useRegisteredYieldWallets(luloProjects, loopscaleWallet || null);

  const [
    loopscaleHistory,
    setLoopscaleHistory,
  ] = useState(
    loadLoopscaleHistory
  );

  useBackendLoopscaleHistory(setLoopscaleHistory);

  const {
    saladTracker,
    saladConnected,
    saladSyncing,
    saladMessage,
    syncSaladBalance,
  } = useSaladExtension();

  const [
    kryptexTracker,
    setKryptexTracker,
  ] = useState(
    loadKryptexTracker
  );

  const [
    kryptexConnected,
    setKryptexConnected,
  ] = useState(false);

  const [
    kryptexMessage,
    setKryptexMessage,
  ] = useState("");

  const {
    unetworkTracker,
    unetworkConnected,
    unetworkSyncing,
    unetworkMessage,
    syncUnetworkBalance,
  } = useUnetworkExtension();

  const [
    rollerCoinTracker,
    setRollerCoinTracker,
  ] = useState(
    loadRollerCoinTracker
  );

  const [
    rollerCoinConnected,
    setRollerCoinConnected,
  ] = useState(false);

  const [
    rollerCoinAuthenticated,
    setRollerCoinAuthenticated,
  ] = useState(false);

  const [
    rollerCoinOpen,
    setRollerCoinOpen,
  ] = useState(false);

  const [
    rollerCoinSyncing,
    setRollerCoinSyncing,
  ] = useState(false);

  const [
    rollerCoinMessage,
    setRollerCoinMessage,
  ] = useState("");

  const [
    rollerCoinFrom,
    setRollerCoinFrom,
  ] = useState(
    () =>
      `${getCurrentMonthKey()}-01`
  );

  const [
    rollerCoinTo,
    setRollerCoinTo,
  ] = useState(
    getTodayKey
  );

  const [
    monthlySnapshots,
    setMonthlySnapshots,
  ] = useState(
    loadMonthlySnapshots
  );

  const [
    syncError,
    setSyncError,
  ] = useState("");

  const [
    expandedProjects,
    setExpandedProjects,
  ] = useState(
    () =>
      new Set()
  );

  const [
    selectedMonthKey,
    setSelectedMonthKey,
  ] = useState(
    null
  );

  const [
    selectedYear,
    setSelectedYear,
  ] = useState(
    getCurrentYear
  );

  const [
    projectLogos,
    setProjectLogos,
  ] = useState(
    loadProjectLogos
  );

  const [
    monthlyBackfills,
    setMonthlyBackfills,
  ] = useState(
    loadMonthlyBackfills
  );

  const [
    luloMonthlyBaselines,
    setLuloMonthlyBaselines,
  ] = useState(
    loadLuloMonthlyBaselines
  );

  useLegacyLuloMonthlyAccounting({
    luloProjects,
    luloMonthlyBaselines,
    setLuloMonthlyBaselines,
    setMonthlyBackfills,
  });

  useYieldPersistence({
    manualPositions,
    projectLogos,
    monthlyBackfills,
    luloMonthlyBaselines,
    loopscaleHistory,
    saladTracker,
    kryptexTracker,
    rollerCoinTracker,
    unetworkTracker,
    monthlySnapshots,
  });

  // RollerCoin TRX price is supplied with each extension wallet sync.

  const importRollerCoinPayload =
    useCallback(
      async (
        payload
      ) => {
        const rows =
          Array.isArray(
            payload?.rows
          )
            ? payload.rows
            : [];

        const incomingBalanceTrx =
          payload?.current_balance_trx === null || payload?.current_balance_trx === undefined
            ? NaN : Number(payload.current_balance_trx);

        const hasLiveBalance =
          Number.isFinite(
            incomingBalanceTrx
          ) &&
          incomingBalanceTrx >=
            0;

        if (
          !rows.length &&
          !hasLiveBalance
        ) {
          setRollerCoinSyncing(
            false
          );

          setRollerCoinMessage(
            "RollerCoin returned no earnings or live TRX balance."
          );

          return;
        }

        // Use the price accompanying this wallet snapshot. No separate
        // website market poll should produce conflicting wallet valuations.
        const trxPrice = Number(payload?.trx_usd_price) || 0;

        const affectedMonths =
          new Set();

        setRollerCoinTracker(
          (current) => {
            // Cached earnings/status messages can arrive after a newer wallet
            // observation. Never let them rewind the wallet or its sync time.
            const acceptBalance = shouldAcceptRollerCoinBalance(current, payload);
            const nextDaily = {
              ...(
                current?.daily ||
                {}
              ),
            };

            const priceToUse =
              trxPrice > 0 && (acceptBalance || !Number(current?.lastTrxPrice))
                ? trxPrice
                : (
                    Number(
                      current?.lastTrxPrice
                    ) || 0
                  );

            rows.forEach(
              (
                row
              ) => {
                const date =
                  String(
                    row?.date ||
                      ""
                  ).slice(
                    0,
                    10
                  );

                const trx =
                  Number(
                    row?.trx ??
                      row?.sol ??
                      0
                  ) || 0;

                if (
                  !/^\d{4}-\d{2}-\d{2}$/.test(
                    date
                  )
                ) {
                  return;
                }

                affectedMonths.add(
                  date.slice(
                    0,
                    7
                  )
                );

                const previous =
                  nextDaily[
                    date
                  ];

                // Incomplete range syncs sometimes return zero or a smaller
                // partial total. Keep the last confirmed mined amount rather
                // than erasing historical chart earnings.
                const priorTrx = Number(previous?.trx ?? previous?.sol);
                if (!Number.isFinite(trx) || trx < 0 ||
                    (Number.isFinite(priorTrx) && priorTrx > 0 &&
                      trx < priorTrx - 1e-9)) {
                  return;
                }
                if (trx === 0 && Number.isFinite(priorTrx) && priorTrx > 0) {
                  return;
                }

                const sameTrx =
                  previous &&
                  Math.abs(
                    (
                      Number(
                        previous.trx ?? previous.sol
                      ) || 0
                    ) -
                      trx
                  ) <
                    1e-12;

                const rowPrice =
                  sameTrx
                    ? (
                        Number(
                          previous.trxPrice ?? previous.solPrice
                        ) ||
                        priceToUse
                      )
                    : priceToUse;

                nextDaily[
                  date
                ] = {
                  trx,
                  // Keep the historical mining USD valuation for unchanged
                  // TRX rows; market movements remain in portfolio P/L.
                  usd: sameTrx && Number(previous?.usd) > 0
                    ? Number(previous.usd)
                    : Number((trx * rowPrice).toFixed(8)),
                  trxPrice:
                    rowPrice,
                  syncedAt:
                    payload?.synced_at ||
                    payload?.syncedAt ||
                    new Date().toISOString(),
                };
              }
            );

            /*
             * Current wallet balance now comes directly from
             * the RollerCoin extension's DOM scraper.
             *
             * If a particular sync cannot see the balance,
             * preserve the last successfully scraped balance
             * instead of inventing or hard-coding a value.
             */
            const previousBalance =
              Number(
                current?.currentTrxBalance
              );

            const currentTrxBalance =
              acceptBalance
                ? incomingBalanceTrx
                : (
                    Number.isFinite(
                      previousBalance
                    )
                      ? previousBalance
                      : 0
                  );

            // Record each new confirmed wallet balance once, in TRX units.
            // A price-only change or re-delivery of the same reading adds no income.
            const snapshotAt = acceptBalance ? payload?.balance_synced_at || null : null;
            const snapshotTime = Date.parse(snapshotAt || "");
            const priorTime = Date.parse(current?.walletLastObservedAt || "");
            const isFresh = hasLiveBalance && Number.isFinite(snapshotTime) &&
              (!Number.isFinite(priorTime) || snapshotTime > priorTime);
            const day = isFresh ? new Intl.DateTimeFormat("en-CA", {
              timeZone: "America/Los_Angeles",
              year: "numeric", month: "2-digit", day: "2-digit",
            }).format(new Date(snapshotTime)) : null;
            const previousObserved = current?.walletLastObservedTrx;
            const hasPrevious = previousObserved !== null && previousObserved !== undefined &&
              Number.isFinite(Number(previousObserved));
            // Recover an opening interval from the last *timestamped*
            // pre-upgrade RollerCoin wallet reading when the new tracker has
            // not yet recorded its first observation. Never assume an
            // undated balance, or treat the whole wallet as earnings.
            const legacyBalance = current?.currentTrxBalance;
            const legacyTime = Date.parse(current?.balanceSyncedAt || "");
            const hasLegacyReference = !hasPrevious &&
              legacyBalance !== null && legacyBalance !== undefined &&
              Number.isFinite(Number(legacyBalance)) &&
              Number(legacyBalance) >= 0 &&
              Number.isFinite(legacyTime) &&
              Number.isFinite(snapshotTime) &&
              legacyTime < snapshotTime;
            const referenceBalance = hasPrevious
              ? Number(previousObserved)
              : hasLegacyReference ? Number(legacyBalance) : null;
            const difference = isFresh && referenceBalance !== null
              ? incomingBalanceTrx - referenceBalance : 0;
            const walletDaily = { ...(current?.walletDaily || {}) };
            if (isFresh && day) {
              const priorDay = walletDaily[day] || {};
              walletDaily[day] = {
                trx: Number(((Number(priorDay.trx) || 0) + difference).toFixed(8)),
                usd: Number(((Number(priorDay.usd) || 0) + difference * priceToUse).toFixed(8)),
                lastSyncedAt: snapshotAt,
              };
            }

            return {
              ...current,
              walletDaily,
              walletLastObservedTrx: isFresh ? incomingBalanceTrx : (current?.walletLastObservedTrx ?? null),
              walletLastObservedAt: isFresh ? snapshotAt : (current?.walletLastObservedAt || null),

              daily:
                nextDaily,

              currentTrxBalance,

              balanceSyncedAt:
                acceptBalance
                  ? (payload?.balance_synced_at || payload?.synced_at ||
                    payload?.syncedAt || new Date().toISOString())
                  : latestRollerCoinTimestamp(
                    current?.balanceSyncedAt, current?.walletLastObservedAt
                  ),

              balanceSource:
                acceptBalance
                  ? (payload?.balance_source || "extension")
                  : (current?.balanceSource || null),

              // Balance-only pushes must not masquerade as a fresh earnings sync.
              lastSyncedAt:
                (payload?.from && payload?.to
                  ? latestRollerCoinTimestamp(
                    current?.lastSyncedAt,
                    payload?.synced_at || payload?.syncedAt || new Date().toISOString()
                  )
                  : current?.lastSyncedAt) || null,

              lastRange: payload?.from && payload?.to
                ? { from: payload.from, to: payload.to }
                : (current?.lastRange || null),

              lastTrxPrice:
                priceToUse,
            };
          }
        );

        if (
          affectedMonths.size
        ) {
          setMonthlySnapshots(
            (current) => {
              const next = {
                ...current,
              };

              const currentMonth =
                getCurrentMonthKey();

              affectedMonths.forEach(
                (
                  monthKey
                ) => {
                  if (
                    monthKey <
                    currentMonth
                  ) {
                    delete next[
                      monthKey
                    ];
                  }
                }
              );

              return next;
            }
          );
        }

        setRollerCoinSyncing(
          false
        );

        setRollerCoinMessage(
          trxPrice >
            0
            ? `Imported ${rows.length} RollerCoin day${rows.length === 1 ? "" : "s"} into Project Income.`
            : `Imported ${rows.length} RollerCoin day${rows.length === 1 ? "" : "s"}, but TRX price could not be loaded.`
        );
      },
      []
    );

// The dashboard reads cached wallet observations frequently and asks for a
// fresh wallet reading at most once every ten minutes while it is open.
const lastRollerCoinWalletRequestRef = useRef(0);
const requestRollerCoinLatest =
  useCallback(
    () => {
      // Ask the extension for its latest cached wallet and status.
      window.postMessage(
        {
          source:
            "rollercoin-app",

          type:
            "REQUEST_LATEST",
        },
        window.location.origin
      );

      window.postMessage(
        {
          source:
            "rollercoin-app",

          type:
            "REQUEST_STATUS",
        },
        window.location.origin
      );

      // Today's total uses observed wallet changes. The dated earnings API
      // can return zero while the wallet changes, so it is not polled here.
      const now = Date.now();
      if (now - lastRollerCoinWalletRequestRef.current >= 600000) {
        lastRollerCoinWalletRequestRef.current = now;
        window.postMessage(
          { source: "rollercoin-app", type: "SYNC_WALLET" },
          window.location.origin
        );
      }
    },
    []
  );;

  const syncRollerCoinRange =
    useCallback(
      () => {
        if (
          !rollerCoinFrom ||
          !rollerCoinTo
        ) {
          setRollerCoinMessage(
            "Choose both dates first."
          );

          return;
        }

        if (
          rollerCoinFrom >
          rollerCoinTo
        ) {
          setRollerCoinMessage(
            "From date must be before To date."
          );

          return;
        }

        if (
          !rollerCoinConnected
        ) {
          setRollerCoinMessage(
            "RollerCoin extension is not connected to this page."
          );

          requestRollerCoinLatest();

          return;
        }

        setRollerCoinSyncing(
          true
        );

        setRollerCoinMessage(
          "Syncing RollerCoin earnings…"
        );

        window.postMessage(
          {
            source:
              "rollercoin-app",
            type:
              "SYNC_RANGE",
            from:
              rollerCoinFrom,
            to:
              rollerCoinTo,
          },
          window.location.origin
        );
      },
      [
        rollerCoinConnected,
        rollerCoinFrom,
        rollerCoinTo,
        requestRollerCoinLatest,
      ]
    );

  useEffect(
    () => {
      const handleMessage =
        (
          event
        ) => {
          if (
            event.origin !==
              window.location.origin ||
            event.source !==
              window
          ) {
            return;
          }

          const data =
            event.data;

          if (
            data?.source !==
            "rollercoin-ext"
          ) {
            return;
          }

          if (
            data.type ===
            "READY"
          ) {
            setRollerCoinConnected(
              true
            );

            requestRollerCoinLatest();

            return;
          }

          if (
            data.type ===
            "ROLLERCOIN_STATUS"
          ) {
            setRollerCoinConnected(
              true
            );

            setRollerCoinAuthenticated(
              Boolean(
                data.payload?.authenticated
              )
            );

            setRollerCoinOpen(
              Boolean(
                data.payload?.rollercoinOpen
              )
            );

            if (
              data.payload?.lastPayload
            ) {
              importRollerCoinPayload(
                data.payload.lastPayload
              );
            }

            return;
          }

          if (
            data.type ===
              "ROLLERCOIN_PUSH" ||
            data.type ===
              "ROLLERCOIN_SYNC_RESULT"
          ) {
            setRollerCoinConnected(
              true
            );

            if (
              data.payload
            ) {
              importRollerCoinPayload(
                data.payload
              );
            } else {
              setRollerCoinSyncing(
                false
              );
            }

            return;
          }

          if (
            data.type ===
            "ROLLERCOIN_SYNC_ERROR" ||
            data.type ===
            "ROLLERCOIN_ERROR"
          ) {
            setRollerCoinConnected(
              true
            );

            setRollerCoinSyncing(
              false
            );

            setRollerCoinMessage(
              data.error ||
                "RollerCoin sync failed."
            );
          }
        };

      window.addEventListener(
        "message",
        handleMessage
      );

      const firstRequest =
        window.setTimeout(
          requestRollerCoinLatest,
          400
        );

      const secondRequest =
        window.setTimeout(
          requestRollerCoinLatest,
          1400
        );

      const handleFocus =
        () =>
          requestRollerCoinLatest();

      window.addEventListener(
        "focus",
        handleFocus
      );

      return () => {
        window.removeEventListener(
          "message",
          handleMessage
        );

        window.removeEventListener(
          "focus",
          handleFocus
        );

        window.clearTimeout(
          firstRequest
        );

        window.clearTimeout(
          secondRequest
        );
      };
    },
    [
      importRollerCoinPayload,
      requestRollerCoinLatest,
    ]
  );

  // Ask the connected extension for dated RollerCoin records from the
  // November gap. The importer merges confirmed daily rows and preserves
  // any larger value already recorded for a day.
  useEffect(() => {
    if (!rollerCoinConnected) return;
    const key = "rollercoin-nov-1-6-2026-backfill-requested-v1";
    if (window.sessionStorage.getItem(key)) return;
    window.postMessage(
      { source: "rollercoin-app", type: "SYNC_RANGE", from: "2026-11-01", to: "2026-11-06" },
      window.location.origin
    );
    window.sessionStorage.setItem(key, "1");
  }, [rollerCoinConnected]);

  const applyProjectData =
    useCallback(
      (projects) => {
        const normalized =
          Array.isArray(
            projects
          )
            ? projects
            : [];

        setAllProjects(
          normalized
        );

        setLuloProjects(
          normalized.filter(
            (project) =>
              project?.yield_tracking ===
              "lulo_lending"
          )
        );
        // A successful fetch refreshes the instant-on-load cache.
        const cache = readObject(PROJECT_QUICK_CACHE_KEY);
        saveObject(PROJECT_QUICK_CACHE_KEY, { ...cache, projects: normalized });
      },
      []
    );

  const refreshProjectsOnly =
    useCallback(
      async () => {
        try {
          const response =
            await projectsApi.getAll();

          applyProjectData(
            response?.data
          );
        } catch (
          error
        ) {
          console.error(
            "Project refresh failed:",
            error
          );
        }
      },
      [
        applyProjectData,
      ]
    );

  useEffect(
    () => {
      const handleRollerCoinSync =
        () => {
          window.setTimeout(
            refreshProjectsOnly,
            150
          );
        };

      window.addEventListener(
        "rollercoin-sync-complete",
        handleRollerCoinSync
      );

      window.addEventListener(
        "focus",
        handleRollerCoinSync
      );

      return () => {
        window.removeEventListener(
          "rollercoin-sync-complete",
          handleRollerCoinSync
        );

        window.removeEventListener(
          "focus",
          handleRollerCoinSync
        );
      };
    },
    [
      refreshProjectsOnly,
    ]
  );

  useEffect(
    () => {
      if (
        !loopscaleSnapshot
      ) {
        return;
      }

      setLoopscaleHistory(
        (
          current
        ) => {
          const next =
            updateLoopscaleHistoryFromSnapshot(
              current,
              loopscaleSnapshot
            );

          if (
            JSON.stringify(
              next
            ) ===
            JSON.stringify(
              current
            )
          ) {
            return current;
          }

          return next;
        }
      );
    },
    [
      loopscaleSnapshot,
    ]
  );

const importKryptexPayload =
    useCallback(
      (payload) => {
        const status =
          payload?.status ||
          {};

        const hasBalance = status?.balance_usd != null;
        const currentBalance = Number(hasBalance
          ? status.balance_usd : loadKryptexTracker()?.lastBalance);

        if (
          !Number.isFinite(
            currentBalance
          ) ||
          currentBalance < 0
        ) {
          setKryptexMessage(
            "Kryptex returned an invalid balance."
          );
          return;
        }

        const syncedAt =
          payload?.synced_at ||
          new Date().toISOString();

        // A v1.4+ extension payload is machine-local. Do not let that one PC
        // overwrite the server-aggregated profitability that arrives via
        // "kryptex-aggregate-update".
        const isMachineScoped = Boolean(payload?.machine?.id);
        const profitabilityUsdDay =
          Number(
            status?.profitability_usd_day
          ) || 0;

        const withdrawableUsd =
          Number(
            status?.withdrawable_usd
          ) || 0;

        const miners =
          Array.isArray(
            status?.miners
          )
            ? status.miners
            : [];

        // v1.4+ machine payloads are persisted and merged by the backend.
        // Do not rebuild a competing tracker from one PC in this tab.
        if (isMachineScoped) {
          setKryptexConnected(true);
          setKryptexMessage(
            Object.prototype.hasOwnProperty.call(payload?.earnings?.daily_usd || {}, getTodayKey())
              ? "Kryptex earnings chart synced."
              : Object.prototype.hasOwnProperty.call(payload?.earnings?.daily_sats || {}, getTodayKey())
                ? "Kryptex sats captured; waiting for a BTC price."
                : payload?.chart_scan?.series_count === 0
                  ? "Kryptex chart is visible, but its earnings data was not recognized."
                  : "Open Kryptex's Satoshi earnings chart to sync today's income."
          );
          return;
        }

        setKryptexTracker(
          (current) => {
            const previousBalance =
              Number(
                current?.lastBalance
              );

            const baselineBalance =
              Number.isFinite(
                previousBalance
              )
                ? previousBalance
                : getKryptexOpeningBalanceUsd();

            const { peak: peakBalance } =
              kryptexIncrease(currentBalance, baselineBalance, current?.peakBalance);

            const day = getTodayKey();
            const recordedToday = Number(readObject("yield_daily_earnings_by_source_v2")?.days?.[day]?.sources?.Kryptex) || 0;
            const dailyBalanceDays = recordKryptexDailyBalance(current, currentBalance, day, recordedToday);

            const monthKey =
              getCurrentMonthKey();

            const monthlyEarnings = {
              ...(
                current?.monthlyEarnings ||
                {
                  "2026-09":
                    getKryptexOpeningBalanceUsd(),
                }
              ),
            };

            const existingMonth =
              Number(
                monthlyEarnings[
                  monthKey
                ]
              ) ||
              (
                monthKey ===
                  "2026-09"
                  ? getKryptexOpeningBalanceUsd()
                  : 0
              );

            // Only dated satoshi accruals from Kryptex's account chart
            // count as income. Balance changes and projected rates do not.
            const kryptexMiningDaily = {
              ...(current?.kryptexMiningDaily || {}),
            };
            const confirmedDays = { ...(current?.kryptexConfirmedDays || {}) };
            const confirmedChartDays = payload?.earnings?.daily_usd || {};
            for (const [entryDay, value] of Object.entries(confirmedChartDays)) {
              if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDay) || entryDay < "2026-11-01" || entryDay > day) continue;
              const confirmedUsd = Number(value);
              if (!Number.isFinite(confirmedUsd) || confirmedUsd < 0) continue;
              kryptexMiningDaily[entryDay] = confirmedUsd;
              confirmedDays[entryDay] = true;
            }

            const confirmedMonth = Object.entries(kryptexMiningDaily)
              .reduce((sum, [entryDay, amount]) => entryDay.startsWith(`${monthKey}-`) &&
                confirmedDays[entryDay] ? sum + Math.max(0, Number(amount) || 0) : sum, 0);
            monthlyEarnings[monthKey] = Number(confirmedMonth.toFixed(6));

            const lifetimeEarnedUsd =
              Math.max(getKryptexOpeningBalanceUsd(),
                (Number(current?.lifetimeEarnedUsd) || getKryptexOpeningBalanceUsd()) - existingMonth) +
              confirmedMonth;

            return {
              ...current,
              initialized: true,
              currentBalance,
              lastBalance:
                currentBalance,
              peakBalance,
              dailyBalanceDays,
              openingBalanceUsd:
                getKryptexOpeningBalanceUsd(),
              lifetimeEarnedUsd:
                Number(
                  lifetimeEarnedUsd.toFixed(
                    6
                  )
                ),
              profitabilityUsdDay:
                isMachineScoped
                  ? Number(current?.profitabilityUsdDay) || 0
                  : profitabilityUsdDay,
              withdrawableUsd,
              monthlyEarnings,
              kryptexMiningDaily,
              kryptexConfirmedDays: confirmedDays,
              lastSyncedAt:
                syncedAt,
              reachable:
                hasBalance && payload?.reachable !== false,
              miners,
            };
          }
        );

        setKryptexConnected(
          true
        );

        setKryptexMessage(
          Object.prototype.hasOwnProperty.call(payload?.earnings?.daily_usd || {}, getTodayKey())
            ? "Kryptex earnings chart synced."
            : Object.prototype.hasOwnProperty.call(payload?.earnings?.daily_sats || {}, getTodayKey())
              ? "Kryptex sats captured; waiting for a BTC price."
              : payload?.chart_scan?.series_count === 0
                ? "Kryptex chart is visible, but its earnings data was not recognized."
                : "Open Kryptex's Satoshi earnings chart to sync today's income."
        );
      },
      []
    );

  useEffect(() => {
    const handleAggregate = (event) => {
      const detail = event?.detail || {};
      const status = detail?.status || {};
      const profitabilityUsdDay = Number(status?.profitability_usd_day);
      if (!Number.isFinite(profitabilityUsdDay) || profitabilityUsdDay < 0) return;

      if (detail?.tracker && typeof detail.tracker === "object") {
        setKryptexTracker(detail.tracker);
      } else {
        setKryptexTracker(current => ({
          ...current,
          profitabilityUsdDay,
          miners: Array.isArray(status?.miners) ? status.miners : [],
          lastSyncedAt: detail?.synced_at || current?.lastSyncedAt || new Date().toISOString(),
          reachable: Math.max(0, Number(detail?.machine_count) || 0) > 0,
          activeMachineCount: Math.max(0, Number(detail?.machine_count) || 0),
        }));
      }
      setKryptexConnected(Math.max(0, Number(detail?.machine_count) || 0) > 0);
    };

    window.addEventListener("kryptex-aggregate-update", handleAggregate);
    return () => window.removeEventListener("kryptex-aggregate-update", handleAggregate);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshCombinedKryptex = async () => {
      try {
        const response = await api.get("/api/project-tracking/kryptex/aggregate");
        if (cancelled) return;
        const profitabilityUsdDay = Number(response?.status?.profitability_usd_day);
        if (!Number.isFinite(profitabilityUsdDay) || profitabilityUsdDay < 0) return;

        if (response?.tracker && typeof response.tracker === "object") {
          setKryptexTracker(response.tracker);
        } else {
          setKryptexTracker(current => ({
            ...current,
            profitabilityUsdDay,
            miners: Array.isArray(response?.status?.miners)
              ? response.status.miners
              : (current?.miners || []),
            lastSyncedAt: response?.received_at || current?.lastSyncedAt || null,
            activeMachineCount: Math.max(0, Number(response?.machine_count) || 0),
            reachable: Math.max(0, Number(response?.machine_count) || 0) > 0,
          }));
        }
        setKryptexConnected(Math.max(0, Number(response?.machine_count) || 0) > 0);
      } catch {
        // Keep the last known tracker value if the server refresh is unavailable.
      }
    };

    refreshCombinedKryptex();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshCombinedKryptex();
    }, 30000);

    const onFocus = () => refreshCombinedKryptex();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const requestKryptexLatest =
    useCallback(
      () => {
        window.postMessage(
          {
            source:
              "kryptex-tracker-app",
            type:
              "REQUEST_LATEST",
          },
          window.location.origin
        );
      },
      []
    );

  useEffect(
    () => {
      const handleMessage =
        (event) => {
          if (
            event.origin !==
              window.location.origin ||
            event.source !==
              window
          ) {
            return;
          }

          const data =
            event.data;

          if (
            data?.source !==
            "kryptex-tracker-ext"
          ) {
            return;
          }

          if (
            data.type ===
            "READY"
          ) {
            setKryptexConnected(
              true
            );

            requestKryptexLatest();
            return;
          }

          if (
            data.type ===
            "KRYPTEX_PUSH"
          ) {
            setKryptexConnected(
              true
            );

            if (
              data.payload
            ) {
              importKryptexPayload(
                data.payload
              );
            }

            return;
          }

          if (
            data.type ===
            "KRYPTEX_STATUS"
          ) {
            setKryptexConnected(
              true
            );

            setKryptexTracker(
              (current) => ({
                ...current,
                reachable: false,
              })
            );

            setKryptexMessage(
              "Kryptex Desktop is not reachable right now. Showing the last synced values."
            );
          }
        };

      window.addEventListener(
        "message",
        handleMessage
      );

      const firstRequest =
        window.setTimeout(
          requestKryptexLatest,
          500
        );

      const secondRequest =
        window.setTimeout(
          requestKryptexLatest,
          1500
        );

      const handleFocus =
        () =>
          requestKryptexLatest();

      window.addEventListener(
        "focus",
        handleFocus
      );

      return () => {
        window.removeEventListener(
          "message",
          handleMessage
        );

        window.removeEventListener(
          "focus",
          handleFocus
        );

        window.clearTimeout(
          firstRequest
        );

        window.clearTimeout(
          secondRequest
        );
      };
    },
    [
      importKryptexPayload,
      requestKryptexLatest,
    ]
  );


    const syncLivePositions = useCallback(async () => {
    setSyncError("");
    // Browser-extension updates do not depend on any API request finishing.
    requestRollerCoinLatest();
    requestSaladLatest();
    requestUnetworkLatest();
    requestKryptexLatest();

    const errors = [];
    // Load independent sources concurrently so slow network calls do not
    // delay updates from the other projects.
    await Promise.all([
      (async () => {
        try {
          const response = await projectsApi.accrueApyTransactions();
          if (!Array.isArray(response?.data)) throw new Error("Invalid project response");
          applyProjectData(response.data);
        } catch (error) {
          console.error("Yield page project sync failed:", error);
          errors.push(`Projects: ${error?.message || "sync failed"}`);
          try {
            const response = await projectsApi.getAll();
            if (Array.isArray(response?.data)) applyProjectData(response.data);
          } catch (fallbackError) {
            console.error("Yield page project fallback failed:", fallbackError);
            // Leave cached project cards in place if the connection fails.
          }
        }
      })(),
      (async () => {
        try {
          const snapshot = await getLoopscaleOnycSnapshot(
            loopscaleWallet,
            { newerThan: loopscaleSnapshot?.syncedAt,
              referenceBalanceUsd: loopscaleSnapshot?.positionValueUsd }
          );
          const currentAt = Date.parse(loopscaleSnapshot?.syncedAt || "");
          const incomingAt = Date.parse(snapshot?.syncedAt || "");
          if (snapshot && Number.isFinite(incomingAt) &&
              (!Number.isFinite(currentAt) || incomingAt >= currentAt)) {
            setLoopscaleSnapshot(snapshot);
            const cache = readObject(PROJECT_QUICK_CACHE_KEY);
            saveObject(PROJECT_QUICK_CACHE_KEY, { ...cache, loopscaleSnapshot: snapshot });
          }
        } catch (error) {
          console.error("Yield page Loopscale sync failed:", error);
          errors.push(`Loopscale: ${error?.message || "sync failed"}`);
        }
      })(),
    ]);
    if (errors.length) setSyncError(errors.join(" · "));
  }, [
    applyProjectData,
    requestRollerCoinLatest,
    requestSaladLatest,
    requestUnetworkLatest,
    requestKryptexLatest,
    loopscaleWallet,
    loopscaleSnapshot?.syncedAt,
    loopscaleSnapshot?.positionValueUsd,
  ]);

  // Keep polling intervals stable even when an extension pushes a new balance.
  // Otherwise every callback change resets the one-minute timer and can
  // indefinitely postpone Lulo's next scheduled accrual.
  const syncLiveRef = useRef(syncLivePositions);
  syncLiveRef.current = syncLivePositions;
  const quickRefreshRef = useRef(refreshProjectsOnly);
  quickRefreshRef.current = refreshProjectsOnly;
  const syncRunningRef = useRef(false);
  const quickRunningRef = useRef(false);

  useEffect(() => {
    let active = true;
    const fullRefresh = async () => {
      if (!active || syncRunningRef.current) return;
      syncRunningRef.current = true;
      try {
        await syncLiveRef.current();
      } finally {
        syncRunningRef.current = false;
      }
    };
    const quickRefresh = async () => {
      if (!active || quickRunningRef.current) return;
      quickRunningRef.current = true;
      try {
        // Request current extension readings whether or not a full API
        // accrual is still running.
        requestRollerCoinLatest();
        requestSaladLatest();
        requestUnetworkLatest();
        requestKryptexLatest();
        await quickRefreshRef.current();
      } finally {
        quickRunningRef.current = false;
      }
    };
    fullRefresh();
    const fullTimer = window.setInterval(fullRefresh, 60000);
    // Extension pushes still update immediately; the fallback refresh does
    // not need to re-read projects and write trackers every three seconds.
    const quickTimer = window.setInterval(quickRefresh, 15000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        quickRefresh();
        fullRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(fullTimer);
      window.clearInterval(quickTimer);
    };
  // The latest callbacks are read from refs; the timers must not restart.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodically reload the page as a fallback for extension messages that
  // only become visible on navigation. Keep it unobtrusive: preserve scroll,
  // skip hidden tabs, and wait until the user is not interacting.
  useEffect(() => {
    const scrollKey = "nam_yield_auto_refresh_scroll_v1";
    const stored = window.sessionStorage.getItem(scrollKey);
    if (stored !== null) {
      window.sessionStorage.removeItem(scrollKey);
      const y = Number(stored);
      if (Number.isFinite(y) && y >= 0) {
        window.requestAnimationFrame(() => window.scrollTo(0, y));
      }
    }
    let lastInteraction = Date.now();
    const markInteraction = () => { lastInteraction = Date.now(); };
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach(type =>
      window.addEventListener(type, markInteraction, { passive: true })
    );
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastInteraction < 30000) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      const active = document.activeElement;
      if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
      window.sessionStorage.setItem(scrollKey, String(window.scrollY));
      window.location.reload();
    }, 180000);
    return () => {
      window.clearInterval(timer);
      ["pointerdown", "keydown", "wheel", "touchstart"].forEach(type =>
        window.removeEventListener(type, markInteraction)
      );
    };
  }, []);

  const localSaladStats = useMemo(
    () => getSaladTrackerStats(saladTracker), [saladTracker]
  );
  const localRollerCoinStats = useMemo(
    () => getRollerCoinTrackerStats(rollerCoinTracker), [rollerCoinTracker]
  );
  const localUnetworkStats = useMemo(
    () => getUnetworkTrackerStats(unetworkTracker), [unetworkTracker]
  );
  const localKryptexStats = useMemo(
    () => getKryptexStats(kryptexTracker), [kryptexTracker]
  );
  // Backend computations now own provider projections once they agree
  // with the current saved observation. Newly synced extension values
  // retain the existing frontend calculation as a temporary fallback.
  const providerTrackers = useMemo(() => ({
    salad: saladTracker,
    rollercoin: rollerCoinTracker,
    unetwork: unetworkTracker,
    kryptex: kryptexTracker,
  }), [saladTracker, rollerCoinTracker, unetworkTracker, kryptexTracker]);
  const localProviderStats = useMemo(() => ({
    salad: localSaladStats,
    rollercoin: localRollerCoinStats,
    unetwork: localUnetworkStats,
    kryptex: localKryptexStats,
  }), [localSaladStats, localRollerCoinStats, localUnetworkStats, localKryptexStats]);
  const providerStats = useBackendProviderStats(providerTrackers, localProviderStats);
  const saladStats = providerStats.salad;
  const rollerCoinStats = providerStats.rollercoin;
  const unetworkStats = providerStats.unetwork;
  const kryptexStats = providerStats.kryptex;

  const projectCards =
    useMemo(
      () => {
        const autoProjects =
          luloProjects.map(
            createLuloProjectCard
          );

        const loopscaleProject =
          createLoopscaleProjectCard(
            loopscaleSnapshot
          );

        const manualProjects =
          groupManualPositions(
            manualPositions
          );

        return [
          ...autoProjects,
          ...(
            loopscaleProject
              ? [
                  loopscaleProject,
                ]
              : []
          ),
          ...manualProjects,
        ];
      },
      [
        luloProjects,
        loopscaleSnapshot,
        manualPositions,
      ]
    );


  const sortedProgramCards =
    useMemo(
      () => {
        const items = [
          ...projectCards.map(
            (
              project
            ) => ({
              type:
                "project",

              key:
                project.id,

              amount:
                Number(
                  project.totalBalance
                ) || 0,

              project,
            })
          ),

          {
            type:
              "rollercoin",

            key:
              "rollercoin-project",

            amount:
              Number(
                rollerCoinStats?.currentBalanceUsd
              ) || 0,
          },

          {
            type:
              "salad",

            key:
              "salad-project",

            amount:
              Number(
                saladStats?.currentBalance
              ) || 0,
          },

          {
            type:
              "unetwork",

            key:
              "unetwork-project",

            amount:
              Number(
                unetworkStats?.currentBalance
              ) || 0,
          },
          {
  type:
    "kryptex",

  key:
    "kryptex-project",

  amount:
    Number(
      kryptexStats?.currentBalanceUsd
    ) || 0,
},
        ];

        

        return items.sort(
          (
            a,
            b
          ) =>
            b.amount -
            a.amount
        );
      },
[
  projectCards,
  rollerCoinStats,
  saladStats,
  unetworkStats,
  kryptexStats,
]
    );
  // At 11:58 PM America/Los_Angeles, preserve a dated copy of every
  // project's reported balance. These are observations, not proof that
  // a stale external integration refreshed exactly at this time.
  const [dailyBalanceSnapshots, setDailyBalanceSnapshots] = useState(
    () => readObject(DAILY_BALANCE_SNAPSHOT_KEY)
  );
  useEffect(() => {
    const capture = () => {
      const now = new Date();
      const pacific = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).formatToParts(now);
      const part = type => pacific.find(item => item.type === type)?.value || "";
      // Store the actual observation time (never backdate a missed snapshot).
      if (part("hour") !== "23" || part("minute") !== "58") return;
      const day = `${part("year")}-${part("month")}-${part("day")}`;
      const existing = readObject(DAILY_BALANCE_SNAPSHOT_KEY);
      if (existing[day]) return;
      const projects = sortedProgramCards.map(item => {
        const project = item.project;
        const projectBalance = Number(item.amount);
        const base = {
          id: String(item.key),
          name: item.type === "project"
            ? String(project?.name || project?.platform || item.key)
            : item.type === "rollercoin" ? "RollerCoin"
            : item.type === "salad" ? "Salad"
            : item.type === "unetwork" ? "Unetwork"
            : item.type === "kryptex" ? "Kryptex" : String(item.key),
          balanceUsd: Number.isFinite(projectBalance) ? projectBalance : null,
          inactive: inactiveProjectIds.includes(String(item.key)),
          sourceLastSyncedAt: null,
        };
        if (item.type === "rollercoin") return {
          ...base,
          balanceTrx: Number(rollerCoinStats?.currentTrxBalance) || 0,
          trxUsdPrice: Number(rollerCoinStats?.liveTrxPrice) || 0,
          sourceLastSyncedAt: rollerCoinTracker?.balanceSyncedAt || null,
          balanceSource: rollerCoinTracker?.balanceSource || null,
        };
        if (item.type === "salad") return {
          ...base, sourceLastSyncedAt: saladTracker?.lastSyncedAt || null,
          lifetimeEarnedUsd: Number(saladTracker?.lifetimeBalance) || 0,
        };
        if (item.type === "unetwork") return {
          ...base, sourceLastSyncedAt: unetworkTracker?.lastSyncedAt || null,
        };
        if (item.type === "kryptex") return {
          ...base, sourceLastSyncedAt: kryptexTracker?.lastSyncedAt || null,
        };
        return {
          ...base,
          assetBalances: Array.isArray(project?.assets)
            ? project.assets.map(asset => ({
                symbol: asset?.symbol || asset?.ticker || null,
                balanceUsd: Number.isFinite(Number(asset?.valueUsd ?? asset?.value))
                  ? Number(asset?.valueUsd ?? asset?.value) : null,
                amount: Number.isFinite(Number(asset?.balance ?? asset?.amount))
                  ? Number(asset?.balance ?? asset?.amount) : null,
              }))
            : [],
          sourceLastSyncedAt: project?.lastSyncedAt || project?.last_synced_at || null,
        };
      });
      const entry = {
        date: day,
        scheduledLocalTime: "23:58",
        timezone: "America/Los_Angeles",
        capturedAt: now.toISOString(),
        projects,
        totalUsd: projects.reduce((sum, project) => sum + (project.balanceUsd || 0), 0),
      };
      // Merge with the latest persisted copy to avoid losing earlier days.
      const next = { ...existing, [day]: entry };
      saveObject(DAILY_BALANCE_SNAPSHOT_KEY, next);
      setDailyBalanceSnapshots(next);
    };
    capture();
    const interval = window.setInterval(capture, 10_000);
    const onVisible = () => { if (!document.hidden) capture(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [
    sortedProgramCards, inactiveProjectIds, rollerCoinStats,
    rollerCoinTracker, saladTracker, unetworkTracker, kryptexTracker,
  ]);

  // Keep an authenticated, durable server copy of the last known project
  // readings. This feeds the nightly backup even when the browser is closed.
  // Source timestamps are retained so stale extension values cannot masquerade
  // as freshly polled external balances.
  const [serverPortfolio, setServerPortfolio] = useState(null);
  const liveProjectFeedRef = useRef([]);
  const liveProjectFeed = sortedProgramCards.map(item => {
    const project = item.project;
    const sourceTimes = {
      rollercoin: rollerCoinTracker?.balanceSyncedAt,
      salad: saladTracker?.lastSyncedAt,
      unetwork: unetworkTracker?.lastSyncedAt,
      kryptex: kryptexTracker?.lastSyncedAt,
    };
    const time = item.type === "project"
      ? project?.lastSyncedAt || project?.last_synced_at || null
      : sourceTimes[item.type] || null;
    const base = {
      id: String(item.key),
      name: item.type === "project"
        ? String(project?.name || project?.platform || item.key)
        : item.type,
      balanceUsd: Number(item.amount) || 0,
      inactive: inactiveProjectIds.includes(String(item.key)),
      sourceLastSyncedAt: time,
      requiresLiveSync: item.type !== "project" ||
        Boolean(project?.lastSyncedAt || project?.last_synced_at),
    };
    if (item.type === "rollercoin") {
      return { ...base,
        balanceTrx: Number(rollerCoinStats?.currentTrxBalance) || 0,
        trxUsdPrice: Number(rollerCoinStats?.liveTrxPrice) || 0 };
    }
    if (item.type === "salad") return {
      ...base, lifetimeEarnedUsd: Number(saladTracker?.lifetimeBalance) || 0,
    };
    if (item.type === "project") {
      return { ...base,
        assetBalances: Array.isArray(project?.assets)
          ? project.assets.map(asset => ({
              symbol: asset?.symbol || asset?.ticker || "",
              amount: Number.isFinite(Number(asset?.balance ?? asset?.amount))
                ? Number(asset?.balance ?? asset?.amount) : null,
              balanceUsd: Number.isFinite(Number(asset?.valueUsd ?? asset?.value))
                ? Number(asset?.valueUsd ?? asset?.value) : null,
            }))
          : [],
      };
    }
    return base;
  });
  liveProjectFeedRef.current = liveProjectFeed;
  useEffect(() => {
    let active = true;
    let lastAlertText = "";
    let lastAlertTime = 0;
    let consecutiveFailures = 0;
    const report = async () => {
      if (!active) return;
      try {
        const result = await api.put("/api/project-tracking/latest", {
          projects: liveProjectFeedRef.current,
        });
        consecutiveFailures = 0;
        if (active && result?.portfolio?.complete &&
            Number.isFinite(Number(result.portfolio.totalUsd))) {
          setServerPortfolio({
            totalUsd: Number(result.portfolio.totalUsd),
            projectCount: Number(result.portfolio.projectCount),
          });
        }
        // Delayed or broken syncs are actionable, but avoid repeated toasts.
        const names = Array.isArray(result?.staleProjects)
          ? result.staleProjects.filter(Boolean) : [];
        if (names.length && document.visibilityState === "visible") {
          const alertText = names.join(", ");
          const now = Date.now();
          if (alertText !== lastAlertText || now - lastAlertTime > 60 * 60 * 1000) {
            lastAlertText = alertText;
            lastAlertTime = now;
            toast.warning("Project sync delayed", {
              description: names.join(", ") + " has not reported a recent reading.",
              duration: 6500,
            });
          }
        }
      } catch {
        consecutiveFailures += 1;
        if (consecutiveFailures === 3 && document.visibilityState === "visible") {
          toast.error("Project backup unavailable", {
            description: "The latest project balances could not reach the server.",
            duration: 6500,
          });
        }
      }
    };
    report();
    const interval = window.setInterval(report, 60000);
    const visible = () => { if (!document.hidden) report(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  const activeProgramCards = sortedProgramCards.filter(item => !inactiveProjectIds.includes(String(item.key)));
  const inactiveProgramCards = sortedProgramCards.filter(item => inactiveProjectIds.includes(String(item.key)));

  const allAssets =
    useMemo(
      () =>
        projectCards.flatMap(
          (project) =>
            project.assets ||
            []
        ),
      [
        projectCards,
      ]
    );

  const locallyDerivedProjectIncome = useMemo(
    () => buildProjectIncome(
      luloProjects,
      loopscaleHistory,
      saladTracker,
      monthlyBackfills,
      rollerCoinTracker,
      unetworkTracker,
      kryptexTracker
    ),
    [
      luloProjects, loopscaleHistory, saladTracker, monthlyBackfills,
      rollerCoinTracker, unetworkTracker, kryptexTracker,
    ]
  );
  // The backend owns extension-provider monthly accruals once their saved
  // figures match the latest live readings; Lulo and Loopscale remain on
  // their existing adapters until their migration can be verified.
  const liveProjectIncome = useBackendMonthlyIncome(
    providerTrackers, locallyDerivedProjectIncome
  );

  useEffect(
    () => {
      setMonthlySnapshots(
        (current) => {
          const next =
            reconcileMonthlySnapshots(
              current,
              liveProjectIncome
            );

          if (
            JSON.stringify(
              next
            ) ===
            JSON.stringify(
              current
            )
          ) {
            return current;
          }

          return next;
        }
      );
    },
    [
      liveProjectIncome,
    ]
  );

  const projectIncome =
    useMemo(
      () =>
        getEffectiveProjectIncome(
          liveProjectIncome,
          monthlySnapshots
        ),
      [
        liveProjectIncome,
        monthlySnapshots,
      ]
    );


  // Version 2 records earnings changes by project rather than storing a
  // single unexplained sum. The original v1 ledger is retained untouched.
  // Monthly aggregates are not proof of when earnings occurred, so first
  // readings (including a newly seen source) establish a baseline only.
  const DAILY_LEDGER_KEY = "yield_daily_earnings_by_source_v2";
  const [earningsClock, setEarningsClock] = useState(() => Date.now());
  const [earningsLedger, setEarningsLedger] = useState(() => {
    const saved = readObject(DAILY_LEDGER_KEY);
    return {
      days: saved.days && typeof saved.days === "object" ? saved.days : {},
      lastMonth: saved.lastMonth || "",
      lastSources: saved.lastSources && typeof saved.lastSources === "object" ? saved.lastSources : {},
      timeline: saved.timeline && typeof saved.timeline === "object" ? saved.timeline : {},
    };
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [earningsChartRange, setEarningsChartRange] = useState("daily");
  const [selectedEarningsPoint, setSelectedEarningsPoint] = useState(null);
  useEffect(() => {
    if (!selectedEarningsPoint) return;
    const closeOnEscape = event => {
      if (event.key === "Escape") setSelectedEarningsPoint(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedEarningsPoint]);
  useEffect(() => {
    const timer = window.setInterval(() => setEarningsClock(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const today = getTodayKey();
    const monthKey = today.slice(0, 7);
    const month = liveProjectIncome.find(entry => entry.monthKey === monthKey);
    const sources = Object.fromEntries((month?.platforms || [])
      .filter(item => Number.isFinite(Number(item.amount)) && Number(item.amount) >= 0)
      .map(item => [String(item.platform).trim(), Number(item.amount)]));
    setEarningsLedger(previous => {
      const sameMonth = previous.lastMonth === monthKey;
      // When a source temporarily disappears from an incomplete sync, keep
      // its last observed baseline to prevent counting old earnings again.
      const lastSources = sameMonth ? { ...previous.lastSources } : {};
      const increments = {};
      for (const [name, amount] of Object.entries(sources)) {
        // RollerCoin's month-to-date USD valuation changes with the TRX
        // market price. Those changes are P/L, not newly mined rewards.
        // Actual dated mining income is rendered from RollerCoin daily rows.
        // Unetwork's saved daily rows use the Pacific posting day; its
        // month-to-date increase can arrive after a month-boundary baseline.
        if (name === "RollerCoin" || name === "Unetwork") {
          lastSources[name] = amount;
          continue;
        }
        const prior = lastSources[name];
        if (sameMonth && Number.isFinite(prior) && amount > prior) {
          increments[name] = amount - prior;
        }
        // Do not count a temporary downward correction and subsequent rebound twice.
        lastSources[name] = sameMonth && Number.isFinite(prior) ? Math.max(prior, amount) : amount;
      }
      const todaySources = {
        ...((previous.days[today] && previous.days[today].sources) || {}),
      };
      for (const [name, change] of Object.entries(increments)) {
        todaySources[name] = (Number(todaySources[name]) || 0) + change;
      }
      const days = Object.keys(increments).length
        ? { ...previous.days, [today]: { sources: todaySources } }
        : previous.days;
      // Capture each observed increase with its Pacific-time clock position.
      // The historical daily totals are preserved, but intraday timing starts
      // from this release since the previous ledger did not retain timestamps.
      const pacificTime = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit",
        second: "2-digit", hourCycle: "h23",
      }).formatToParts(new Date());
      const timePart = key => Number(pacificTime.find(part => part.type === key)?.value || 0);
      const hour = timePart("hour") + timePart("minute") / 60 + timePart("second") / 3600;
      const totalIncrease = Object.values(increments).reduce((sum, amount) => sum + amount, 0);
      const priorTimeline = previous.timeline?.[today] || [];
      const timeline = totalIncrease > 0
        ? {
            ...previous.timeline,
            [today]: [...priorTimeline, { hour, amount: Object.values(todaySources).reduce((sum, amount) => sum + (Number(amount) || 0), 0) }].slice(-250),
          }
        : previous.timeline || {};
      const next = { days, lastMonth: monthKey, lastSources, timeline };
      if (JSON.stringify(previous) !== JSON.stringify(next)) {
        saveObject(DAILY_LEDGER_KEY, next);
        return next;
      }
      return previous;
    });
  }, [liveProjectIncome, earningsClock]);

  // Commit Lulo's accepted interest increases to the persistent daily ledger.
  // Keep legacy tracked earnings and the verified opening-day amount; never add
  // the same increment from the monthly ledger a second time.
  useEffect(() => {
    const observedByDay = {};
    Object.values(luloMonthlyBaselines || {}).forEach(months => {
      Object.values(months || {}).forEach(tracker => {
        Object.entries(tracker?.observedDaily || {}).forEach(([day, raw]) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
          const amount = Number(raw);
          if (!Number.isFinite(amount) || amount <= 0) return;
          observedByDay[day] = (observedByDay[day] || 0) + amount;
        });
      });
    });
    if (!Object.keys(observedByDay).length) return;
    setEarningsLedger(previous => {
      let changed = false;
      const days = { ...previous.days };
      for (const [day, amount] of Object.entries(observedByDay)) {
        const existing = days[day]?.sources || {};
        const existingAmount = Math.max(0, Number(existing.Lulo) || 0);
        if (amount <= existingAmount + 0.00000001) continue;
        days[day] = {
          ...days[day],
          sources: { ...existing, Lulo: Number(amount.toFixed(8)) },
        };
        changed = true;
      }
      if (!changed) return previous;
      const next = { ...previous, days };
      saveObject(DAILY_LEDGER_KEY, next);
      return next;
    });
  }, [luloMonthlyBaselines]);

  // Persist signed Loopscale observations: a loss must offset earlier gains.
  useEffect(() => {
    const observedByDay = {};
    Object.values(loopscaleHistory?.positions || {}).forEach(position => {
      Object.entries(position?.observedDaily || {}).forEach(([day, raw]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
        const amount = Number(raw);
        if (!Number.isFinite(amount)) return;
        observedByDay[day] = (observedByDay[day] || 0) + amount;
      });
    });
    if (!Object.keys(observedByDay).length) return;
    setEarningsLedger(previous => {
      let changed = false;
      const days = { ...previous.days };
      for (const [day, amount] of Object.entries(observedByDay)) {
        const existing = days[day]?.sources || {};
        const net = Number(amount.toFixed(8));
        if (Math.abs((Number(existing.Loopscale) || 0) - net) < 0.00000001) continue;
        days[day] = {
          ...days[day],
          sources: { ...existing, Loopscale: net },
        };
        changed = true;
      }
      if (!changed) return previous;
      const next = { ...previous, days };
      saveObject(DAILY_LEDGER_KEY, next);
      return next;
    });
  }, [loopscaleHistory]);

  // Restore the previously recorded RollerCoin earnings for today as a
  // one-time USD reference. Later market moves reprice that reference up
  // or down, rather than silently discarding it when dated rows are absent.
  const ROLLERCOIN_RESTORE_KEY = "yield_rollercoin_restored_daily_anchor_v1";
  const [rollerCoinRestoredAnchors, setRollerCoinRestoredAnchors] = useState(
    () => readObject(ROLLERCOIN_RESTORE_KEY)
  );
  useEffect(() => {
    const today = getTodayKey();
    if (rollerCoinRestoredAnchors?.[today]) return;
    const recorded = Number(earningsLedger.days?.[today]?.sources?.RollerCoin);
    const price = Number(rollerCoinTracker?.lastTrxPrice);
    if (!(recorded > 0) || !(price > 0)) return;
    const next = {
      ...rollerCoinRestoredAnchors,
      [today]: { usd: recorded, trxPrice: price },
    };
    setRollerCoinRestoredAnchors(next);
    saveObject(ROLLERCOIN_RESTORE_KEY, next);
  }, [earningsLedger.days, rollerCoinTracker?.lastTrxPrice, rollerCoinRestoredAnchors]);

  const todayKey = getTodayKey();
  // User-supplied Salad rate for Oct 29, 2026, 12:00 AM–9:00 AM PT only.
  // Fixed historical estimate, NOT a live rate or a future-day default.
  const SALAD_FIXED_DAY = "2026-10-29";
  const SALAD_FIXED_HOURLY_USD = 0.0756;
  const SALAD_FIXED_END_HOUR = 9;
  const SALAD_FIXED_TOTAL = SALAD_FIXED_HOURLY_USD * SALAD_FIXED_END_HOUR;
  // Verified Lulo dashboard screenshot for Oct 29: $0.21 USDC +
  // $0.15 USDS = $0.36 at the time of observation. This is a dated
  // historical floor, not a live per-asset API feed or a future-day rate.
  const LULO_FIXED_DAY = "2026-10-29";
  const LULO_FIXED_TOTAL = 0.36;
  const LULO_FIXED_END_HOUR = 14;
  // Oct 29 display starts at $2 and follows subsequent signed P/L changes.
  // Save the reference observation once so refreshes cannot restart the baseline.
  const LOOPSCALE_FIXED_DISPLAY_DAY = "2026-10-29";
  const LOOPSCALE_FIXED_DISPLAY_USD = 2;
  const LOOPSCALE_FIXED_BASELINE_KEY = "yield_loopscale_oct29_display_baseline_v1";
  const [loopscaleFixedBaseline, setLoopscaleFixedBaseline] = useState(
    () => readObject(LOOPSCALE_FIXED_BASELINE_KEY)
  );
  const observedLoopscaleToday = Object.values(loopscaleHistory?.positions || {})
    .reduce((sum, position) =>
      sum + (Number(position?.observedDaily?.[LOOPSCALE_FIXED_DISPLAY_DAY]) || 0), 0);
  const ledgerLoopscaleToday = Number(
    earningsLedger.days?.[LOOPSCALE_FIXED_DISPLAY_DAY]?.sources?.Loopscale
  ) || 0;
  const currentLoopscaleReference = Object.values(loopscaleHistory?.positions || {})
    .some(position => Object.prototype.hasOwnProperty.call(
      position?.observedDaily || {}, LOOPSCALE_FIXED_DISPLAY_DAY
    )) ? observedLoopscaleToday : ledgerLoopscaleToday;
  const savedLoopscaleReference = loopscaleFixedBaseline?.day === LOOPSCALE_FIXED_DISPLAY_DAY &&
    Number.isFinite(Number(loopscaleFixedBaseline?.amount))
    ? Number(loopscaleFixedBaseline.amount) : null;
  useEffect(() => {
    if (todayKey !== LOOPSCALE_FIXED_DISPLAY_DAY || savedLoopscaleReference !== null) return;
    const initial = { day: LOOPSCALE_FIXED_DISPLAY_DAY, amount: currentLoopscaleReference };
    setLoopscaleFixedBaseline(initial);
    saveObject(LOOPSCALE_FIXED_BASELINE_KEY, initial);
  }, [todayKey, savedLoopscaleReference, currentLoopscaleReference]);
  // User-confirmed RollerCoin wallet reading at 9:04 AM Pacific, Oct 30.
  // This is an opening balance, never an earned amount. The difference
  // from subsequent confirmed wallet readings is the post-anchor delta.
  const ROLLERCOIN_OCT30_ANCHOR_DAY = "2026-10-30";
  const ROLLERCOIN_OCT30_ANCHOR_TRX = 35.269272;
  const ROLLERCOIN_OCT30_ANCHOR_AT = Date.parse("2026-10-30T16:04:00Z");
  // Reconstruct the untracked 00:00-09:04 window from the user's daily
  // production rate, assuming uniform rewards (one block per minute).
  // This applies to Oct 30 only, not recurring or future dates.
  const ROLLERCOIN_OCT30_ESTIMATED_MORNING_TRX =
    Number((1.403988 * (9 * 60 + 4) / (24 * 60)).toFixed(8));
  // Recover a missed RollerCoin interval from the previous night's
  // confirmed token snapshot. This is a guarded display fallback, not a
  // ledger mutation: transfers cannot reliably be inferred from a balance.
  const [projectRecovery, setProjectRecovery] = useState(null);
  const [recoveredEarningsByDay, setRecoveredEarningsByDay] = useState(
    () => readObject(AUTO_RECOVERED_EARNINGS_KEY)
  );
  useEffect(() => {
    const day = getTodayKey();
    const previous = new Date(day + "T12:00:00Z");
    previous.setUTCDate(previous.getUTCDate() - 1);
    const previousDay = previous.toISOString().slice(0, 10);
    if (projectRecovery?.referenceDate !== previousDay) return;
    const item = (projectRecovery?.candidates || []).find(
      entry => entry.id === "rollercoin-project" && entry.eligibleForGuardedRecovery
    );
    const usd = Number(item?.usdAtCurrentPrice);
    if (!item || !Number.isFinite(usd) || usd <= 0) return;
    const existing = readObject(AUTO_RECOVERED_EARNINGS_KEY);
    const saved = Number(existing?.[day]?.RollerCoin) || 0;
    if (usd <= saved + 0.000001) return;
    const next = { ...existing, [day]: { ...(existing?.[day] || {}), RollerCoin: usd } };
    saveObject(AUTO_RECOVERED_EARNINGS_KEY, next);
    setRecoveredEarningsByDay(next);
  }, [projectRecovery]);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await api.get("/api/project-tracking/recovery");
        if (active) setProjectRecovery(result);
      } catch {
        // Preserve last known candidate; no invented earnings on API failure.
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 300000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  // This is the Lulo provider day (UTC), not NAm's Pacific calendar day.
  const currentLuloUtc = currentLuloUtcDaily(luloProjects, new Date(earningsClock));
  const sourceTotalsContext = {
    todayKey,
    luloProjects,
    currentLuloUtc,
    unetworkTracker,
    kryptexTracker,
    saladTracker,
    rollerCoinTracker,
    earningsLedger,
    stockPayouts,
    loopscaleHistory,
    recoveredEarningsByDay,
    projectRecovery,
    savedLoopscaleReference,
    currentLoopscaleReference,
    SALAD_FIXED_DAY,
    SALAD_FIXED_TOTAL,
    LULO_FIXED_DAY,
    LULO_FIXED_TOTAL,
    ROLLERCOIN_OCT30_ANCHOR_DAY,
    ROLLERCOIN_OCT30_ANCHOR_TRX,
    ROLLERCOIN_OCT30_ANCHOR_AT,
    ROLLERCOIN_OCT30_ESTIMATED_MORNING_TRX,
    LOOPSCALE_FIXED_DISPLAY_DAY,
    LOOPSCALE_FIXED_DISPLAY_USD,
  };
  const sourceTotalsForDay = key =>
    buildSourceTotalsForDay(key, sourceTotalsContext);

  // Today's Earnings is a cumulative earned-income counter, not mark-to-market
  // P/L. Persist per-source high-water values in a dedicated hook.
  const observedDailySourceTotals = sourceTotalsForDay(todayKey);
  const {
    dailySourceTotals,
    mergeHighWaterSources,
  } = useDailyEarningsHighWater(todayKey, observedDailySourceTotals);

  const selectedBreakdown = buildSelectedEarningsBreakdown({
    selection: selectedEarningsPoint,
    earningsChartRange,
    projectIncome,
    stockPayouts,
    todayKey,
    luloUtcDay: currentLuloUtc.utcDay,
    hasLuloProjects: luloProjects.length > 0,
    sourceTotalsForDay,
  });

  const serverDailyIncome =
    useServerDailyIncome(todayKey, dailySourceTotals, mergeHighWaterSources);

  const serverSources = serverDailyIncome?.date === todayKey
    ? (serverDailyIncome?.sources || {})
    : {};
  const previouslyDisplayedTodayMax = (Array.isArray(
    readObject(DAILY_EARNINGS_CHART_OBSERVATIONS_KEY)?.[todayKey]
  ) ? readObject(DAILY_EARNINGS_CHART_OBSERVATIONS_KEY)[todayKey] : [])
    .reduce(
      (highest, point) => Math.max(highest, Number(point?.value) || 0),
      0
    );
  const {
    displayDailySourceTotals,
    todayBreakdown,
    rawTodayEarnings,
    todayEarnings,
  } = buildTodayEarningsDisplay({
    dailySourceTotals,
    serverSources,
    previouslyDisplayedTodayMax,
    serverTotalUsd:
      serverDailyIncome?.date === todayKey
        ? serverDailyIncome?.totalUsd
        : null,
  });

  const dailyEarningsObservations =
    useDailyEarningsObservations(todayEarnings, earningsClock, todayKey);

  const {
    weekDays,
    weekEarnings,
    observedWeekMaximum,
    currentHour,
  } = buildWeeklyEarningsChart({
    todayKey,
    luloUtcDay: currentLuloUtc.utcDay,
    sourceTotalsForDay,
    earningsClock,
  });

  const { dailyChartData, dailyChartMax, dailyChartMin, dailyChartEnd, dailyChartTicks } =
    buildDailyEarningsChart(dailyEarningsObservations, todayKey, currentHour, todayEarnings);
  const monthlyChartData = buildMonthlyEarningsChart(projectIncome, stockPayouts, projectExpenses);
  const thisMonthEarned = monthlyChartData.find(month => month.monthKey === getCurrentMonthKey())?.value || 0;
  const monthlyChartMax = Math.max(0.1,...monthlyChartData.map(month => month.value))*1.15;


const summary =
  useMemo(
    () => {
      /*
       * Portfolio Balance should equal the sum of the
       * active project cards currently shown on this page.
       *
       * allAssets only includes the asset-backed project
       * cards, so it was leaving out RollerCoin, Salad,
       * Unetwork, and Kryptex.
       */
      /*
       * Build Portfolio Balance directly from CURRENT balances.
       *
       * RollerCoin MUST use currentBalanceUsd here. Lifetime earned
       * is only for Total Earned and must not remain in the portfolio
       * after a withdrawal.
       */
      const assetProjectBalance =
        projectCards.reduce(
          (
            sum,
            project
          ) =>
            sum +
            (
              Number(
                project?.totalBalance
              ) || 0
            ),
          0
        );

      const localPortfolioBalance =
        assetProjectBalance +
        (Number(rollerCoinStats?.currentBalanceUsd) || 0) +
        (Number(saladStats?.currentBalance) || 0) +
        (Number(unetworkStats?.currentBalance) || 0) +
        (Number(kryptexStats?.currentBalanceUsd) || 0);

      // Transition safely to the authoritative backend sum. During sync
      // lag or a validation disagreement, preserve the currently displayed
      // local balance instead of suddenly showing an old server result.
      const serverMatches = serverPortfolio?.projectCount === sortedProgramCards.length &&
        Number.isFinite(Number(serverPortfolio?.totalUsd)) &&
        Math.abs(Number(serverPortfolio.totalUsd) - localPortfolioBalance) < 0.01;
      const portfolioBalance = serverMatches
        ? Number(serverPortfolio.totalUsd) : localPortfolioBalance;

      /*
       * Keep Weighted APY based on the positions that
       * actually expose an APY. Otherwise adding the
       * mining/compute balances to Portfolio Balance would
       * artificially lower the displayed Weighted APY.
       */
      const apyEligibleBalance =
        allAssets.reduce(
          (
            sum,
            asset
          ) =>
            sum +
            (
              Number(
                asset.balance
              ) || 0
            ),
          0
        );

      const luloAnnualYield =
        projectCards
          .filter(
            (project) =>
              String(
                project?.platform || ""
              ).toLowerCase() ===
              "lulo"
          )
          .reduce(
            (
              total,
              project
            ) =>
              total +
              (
                Number(
                  project?.luloFiveDayAverageUsd
                ) || 0
              ) *
                365,
            0
          );

      const nonLuloAnnualYield =
        allAssets
          .filter(
            (asset) =>
              String(
                asset?.sourceLabel || ""
              ).toLowerCase() !==
              "lulo"
          )
          .reduce(
            (
              sum,
              asset
            ) =>
              sum +
              (
                Number(
                  asset?.balance
                ) || 0
              ) *
                (
                  (
                    Number(
                      asset?.apy
                    ) || 0
                  ) /
                  100
                ),
            0
          );

      /*
       * Sum the exact projections used by the active cards.
       * This keeps the headline Monthly / Yearly Income in
       * sync with what the user can actually see below.
       */
      const projectProjectionTotals =
        projectCards.reduce(
          (
            totals,
            project
          ) => {
            const projections =
              getProjectProjections(
                project
              );

            return {
              monthly:
                totals.monthly +
                (
                  Number(
                    projections?.monthly
                  ) || 0
                ),

              yearly:
                totals.yearly +
                (
                  Number(
                    projections?.yearly
                  ) || 0
                ),
            };
          },
          {
            monthly: 0,
            yearly: 0,
          }
        );

      const rollerCoinMonthlyIncome =
        1 *
        30.4375;

      const rollerCoinYearlyIncome =
        1 *
        365;

      const saladMonthlyIncome =
        Number(
          saladStats?.estimatedMonthlyUsd
        ) || 0;

      const saladYearlyIncome =
        Number(
          saladStats?.estimatedYearlyUsd
        ) || 0;

      const unetworkMonthlyIncome =
        Number(
          unetworkStats?.estimatedMonthlyUsd
        ) || 0;

      const unetworkYearlyIncome =
        Number(
          unetworkStats?.estimatedYearlyUsd
        ) || 0;

      const kryptexMonthlyIncome =
        Number(
          kryptexStats?.monthlyUsd
        ) || 0;

      const kryptexYearlyIncome =
        Number(
          kryptexStats?.yearlyUsd
        ) || 0;

      const monthlyYield =
        projectProjectionTotals.monthly +
        rollerCoinMonthlyIncome +
        saladMonthlyIncome +
        unetworkMonthlyIncome +
        kryptexMonthlyIncome;

      const annualYield =
        projectProjectionTotals.yearly +
        rollerCoinYearlyIncome +
        saladYearlyIncome +
        unetworkYearlyIncome +
        kryptexYearlyIncome;

      const weightedApy =
        apyEligibleBalance > 0
          ? allAssets.reduce(
              (
                sum,
                asset
              ) =>
                sum +
                (
                  Number(
                    asset.balance
                  ) || 0
                ) *
                  (
                    Number(
                      asset.apy
                    ) || 0
                  ),
              0
            ) /
            apyEligibleBalance
          : 0;

      const totalEarned =
        projectCards.reduce(
          (
            sum,
            project
          ) =>
            sum +
            (
              Number(
                project.earned
              ) || 0
            ),
          0
        ) +
        (
          Number(
            rollerCoinStats?.lifetimeUsd
          ) || 0
        ) +
        (
          Number(
            saladStats?.lifetimeUsd
          ) || 0
        ) +
        (
          Number(
            unetworkStats?.lifetimeUsd
          ) || 0
        ) +
        (
          Number(
            kryptexStats?.lifetimeUsd
          ) || 0
        );

      return {
        portfolioBalance,
        weightedApy,
        monthlyYield,
        annualYield,

        activePositions:
          sortedProgramCards.length,

        totalEarned,
      };
    },
    [
      allAssets,
      projectCards,
      sortedProgramCards,
      rollerCoinStats,
      saladStats,
      unetworkStats,
      kryptexStats,
      serverPortfolio,
    ]
  );

  /*
   * Make the Project Income page the source of truth for
   * the active project portfolio balance used by Net Worth.
   *
   * This prevents the Crypto tab from independently
   * rebuilding the balance and drifting away from the
   * number shown at the top of this page.
   */
  useEffect(
    () => {
      const next = {
        portfolioBalance:
          Number(
            summary?.portfolioBalance
          ) || 0,

        activePositions:
          Number(
            summary?.activePositions
          ) || 0,

        updatedAt:
          new Date().toISOString(),
      };

      remoteStorage.setItem(
        PROJECT_INCOME_PORTFOLIO_SUMMARY_KEY,
        JSON.stringify(next)
      );

      window.dispatchEvent(
        new CustomEvent(
          "project-income-portfolio-balance-updated",
          {
            detail: next,
          }
        )
      );
    },
    [
      summary?.portfolioBalance,
      summary?.activePositions,
    ]
  );

  function deletePosition(
    id
  ) {
    if (
      !window.confirm(
        "Delete this yield position?"
      )
    ) {
      return;
    }

    setManualPositions(
      (current) =>
        current.filter(
          (position) =>
            position.id !==
            id
        )
    );
  }

  function toggleProject(
    projectId
  ) {
    setExpandedProjects(
      (current) => {
        const next =
          new Set(
            current
          );

        if (
          next.has(
            projectId
          )
        ) {
          next.delete(
            projectId
          );
        } else {
          next.add(
            projectId
          );
        }

        return next;
      }
    );
  }

  function setProjectLogo(
    projectId,
    dataUrl
  ) {
    setProjectLogos(
      (current) => ({
        ...current,
        [projectId]:
          dataUrl,
      })
    );
  }

  function setProjectTotalSpent(
    projectId,
    value
  ) {
    const totalSpent =
      Math.max(
        0,
        Number(value) || 0
      );

    setProjectPayback(
      (current) => {
        const next = {
          ...current,
        };

        if (
          totalSpent > 0
        ) {
          next[
            projectId
          ] = {
            totalSpent,
            updatedAt:
              new Date().toISOString(),
          };
        } else {
          delete next[
            projectId
          ];
        }

        saveProjectPayback(
          next
        );

        return next;
      }
    );
  }

  return (
    <div
      className="min-w-0 space-y-2.5"
      data-testid="yield-farming-page"
    >

      <header className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Passive Income</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        {inactiveProgramCards.length > 0 && (
          <div className="shrink-0">
            <Dialog>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="border-[#2b3848] bg-[#0e141c] text-muted-foreground hover:text-white">
                  Inactive projects ({inactiveProgramCards.length})
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>Inactive projects ({inactiveProgramCards.length})</DialogTitle>
                </DialogHeader>
                <div className="grid max-h-[60vh] gap-2 overflow-y-auto py-2">
                  {inactiveProgramCards.map(item => (
                    <div key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-card/30 px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{item.type === "project" ? item.project.platform : item.type === "rollercoin" ? "RollerCoin" : item.type === "unetwork" ? "Unetwork" : item.type === "kryptex" ? "Kryptex" : "Salad"}</div>
                        <div className="text-xs tabular-nums text-muted-foreground">{formatCurrency(item.amount)}</div>
                      </div>
                      <button type="button" onClick={() => reactivateProject(item.key)} className="shrink-0 rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10">Reactivate</button>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
        <span className="text-[11px] text-muted-foreground">{weekDays[0].date} – {weekDays[6].date} · Pacific Time</span>
        </div>
      </header>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_minmax(290px,1fr)]">
        <section className="flex min-w-0 flex-col rounded-2xl border border-[#263342] bg-[#0b1017] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold">Earnings {earningsChartRange === "daily" ? "Today" : earningsChartRange === "weekly" ? "This Week" : "This Month"}</h2>
              <div className="mt-2 text-[27px] font-semibold tabular-nums text-emerald-400">{formatCurrency(earningsChartRange === "daily" ? todayEarnings : earningsChartRange === "weekly" ? weekEarnings : thisMonthEarned)}</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-[#2b3848] bg-[#0e141c] p-0.5" aria-label="Earnings chart period">
                {["daily", "weekly", "monthly"].map(period => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => { setEarningsChartRange(period); setSelectedEarningsPoint(null); }}
                    aria-pressed={earningsChartRange === period}
                    className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${earningsChartRange === period ? "bg-[#293747] text-white" : "text-muted-foreground hover:text-white"}`}
                  >
                    {period === "daily" ? "Daily" : period === "weekly" ? "Weekly" : "Monthly"}
                  </button>
                ))}
              </div>
              <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400">
                <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />Live
              </div>
            </div>
          </div>
          <div className="mt-3 h-[300px] w-full lg:h-auto lg:min-h-[280px] lg:flex-1">
            <ResponsiveContainer width="100%" height="100%">
              {earningsChartRange === "daily" ? (
                <AreaChart data={dailyChartData} margin={{top:12,right:12,left:-8,bottom:3}}>
                  <defs>
                    <linearGradient id="yieldDailyFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#30d991" stopOpacity={0.28}/>
                      <stop offset="100%" stopColor="#30d991" stopOpacity={0.01}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#344454" opacity={0.35} strokeDasharray="3 4"/>
                  <XAxis dataKey="x" type="number" domain={[0,dailyChartEnd]} ticks={dailyChartTicks} axisLine={false} tickLine={false} tick={{fontSize:10,fill:"#91a1b2"}} tickFormatter={hour => hour === 0 ? "12am" : hour === 12 ? "12pm" : hour === 24 ? "12am" : hour < 12 ? hour+"am" : (hour-12)+"pm"}/>
                  <YAxis axisLine={false} tickLine={false} width={51} tick={{fontSize:10,fill:"#91a1b2"}} domain={[dailyChartMin,dailyChartMax]} tickFormatter={v=>"$"+Number(v).toFixed(2)} />
                  <Tooltip cursor={{stroke:"#30d991",strokeDasharray:"3 4"}} contentStyle={{background:"#111b27",border:"1px solid #33465a",borderRadius:10,fontSize:12}} labelFormatter={hour => {
                    const rounded = Math.max(0, Math.min(24,Number(hour)));
                    const hours = Math.floor(rounded);
                    const mins = Math.floor((rounded-hours)*60);
                    return `${String(hours).padStart(2,"0")}:${String(mins).padStart(2,"0")} PT`;
                  }} formatter={(value, name, item)=>[formatCurrency(value), item?.payload?.displayBaseline ? "Display baseline · no reading" : "Recorded today"]}/>
                  <Area type="monotoneX" dataKey="value" stroke="#30e69b" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" fill="url(#yieldDailyFill)" dot={false} activeDot={{r:4, strokeWidth:2}} isAnimationActive={false}/>
                </AreaChart>
              ) : earningsChartRange === "weekly" ? (
                <AreaChart data={weekDays} margin={{top:28,right:15,left:-8,bottom:3}} onClick={point => { const index = Number(point?.activeTooltipIndex); const day = point?.activePayload?.[0]?.payload?.key || (Number.isInteger(index) ? weekDays[index]?.key : null); if (day && day <= todayKey) setSelectedEarningsPoint({range:"weekly",key:day}); }}>
                  <defs>
                    <linearGradient id="yieldWeeklyLiveFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#30d991" stopOpacity={0.28}/>
                      <stop offset="100%" stopColor="#30d991" stopOpacity={0.01}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#344454" opacity={0.35} strokeDasharray="3 4"/>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} interval={0} tick={{fontSize:11,fill:"#91a1b2"}} />
                  <YAxis axisLine={false} tickLine={false} width={51} tick={{fontSize:10,fill:"#91a1b2"}} domain={[0,observedWeekMaximum*1.15]} tickFormatter={v=>"$"+Number(v).toFixed(2)} />
                  <Tooltip cursor={{stroke:"#30d991",strokeDasharray:"3 4"}} contentStyle={{background:"#111b27",border:"1px solid #33465a",borderRadius:10,fontSize:12}} labelFormatter={(label,items)=>items?.[0]?.payload?.date || label} formatter={value=>[formatCurrency(value),"Recorded earnings"]} />
                  <Area type="monotone" dataKey="value" name="Earnings" stroke="#30e69b" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" fill="url(#yieldWeeklyLiveFill)"
                    dot={props => {
                      const day = props?.payload?.key;
                      if (!day || day > todayKey || props?.payload?.value == null) return null;
                      return <circle cx={props.cx} cy={props.cy} r={6} fill="#30e69b"
                        stroke="#0c141e" strokeWidth={2} style={{cursor:"pointer"}}
                        onClick={() => setSelectedEarningsPoint({range:"weekly",key:day})}/>;
                    }}
                    activeDot={props => {
                      const day = props?.payload?.key;
                      if (!day || day > todayKey || props?.payload?.value == null) return null;
                      return <circle cx={props.cx} cy={props.cy} r={8} fill="#30e69b"
                        stroke="#0c141e" strokeWidth={2} style={{cursor:"pointer"}}
                        onClick={() => setSelectedEarningsPoint({range:"weekly",key:day})}/>;
                    }}
                    connectNulls={false} isAnimationActive={false}>
                    <LabelList dataKey="value" position="top" offset={12} formatter={value => value == null ? "" : formatCurrency(value)} style={{fill:"#c7f9e5",fontSize:10,fontWeight:600}} />
                  </Area>
                </AreaChart>
              ) : (
                <AreaChart data={monthlyChartData} margin={{top:28,right:15,left:-8,bottom:3}} onClick={point => { const index = Number(point?.activeTooltipIndex); const month = point?.activePayload?.[0]?.payload?.monthKey || (Number.isInteger(index) ? monthlyChartData[index]?.monthKey : null); if (month) setSelectedEarningsPoint({range:"monthly",key:month}); }}>
                  <defs>
                    <linearGradient id="yieldMonthlyFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#30d991" stopOpacity={0.28}/>
                      <stop offset="100%" stopColor="#30d991" stopOpacity={0.01}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#344454" opacity={0.35} strokeDasharray="3 4"/>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize:10,fill:"#91a1b2"}} interval="preserveStartEnd" />
                  <YAxis axisLine={false} tickLine={false} width={51} tick={{fontSize:10,fill:"#91a1b2"}} domain={[0,monthlyChartMax]} tickFormatter={v=>"$"+Number(v).toFixed(0)}/>
                  <Tooltip cursor={{stroke:"#30d991",strokeDasharray:"3 4"}} contentStyle={{background:"#111b27",border:"1px solid #33465a",borderRadius:10,fontSize:12}} formatter={(value,name,props)=>[formatCurrency(value),"Monthly income"]}/>
                  <Area type="monotone" dataKey="value" name="Monthly income" stroke="#30e69b" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" fill="url(#yieldMonthlyFill)"
                    dot={props => {
                      const monthKey = props?.payload?.monthKey;
                      if (!monthKey) return null;
                      return <circle cx={props.cx} cy={props.cy} r={6} fill="#30e69b"
                        stroke="#0c141e" strokeWidth={2} style={{cursor:"pointer"}}
                        onClick={() => setSelectedEarningsPoint({range:"monthly",key:monthKey})}/>;
                    }}
                    activeDot={props => {
                      const monthKey = props?.payload?.monthKey;
                      if (!monthKey) return null;
                      return <circle cx={props.cx} cy={props.cy} r={8} fill="#30e69b"
                        stroke="#0c141e" strokeWidth={2} style={{cursor:"pointer"}}
                        onClick={() => setSelectedEarningsPoint({range:"monthly",key:monthKey})}/>;
                    }}
                    isAnimationActive={false}>
                    <LabelList dataKey="value" position="top" offset={12} formatter={value => value == null ? "" : formatCurrency(value)} style={{fill:"#c7f9e5",fontSize:10,fontWeight:600}} />
                  </Area>
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-2xl border border-[#263342] bg-[#0b1017] p-4">
          <h2 className="text-[16px] font-semibold">Today's Earnings</h2>
          <div className="mt-4 flex flex-col items-center gap-2">
            <div className="flex h-36 w-36 items-center justify-center rounded-full" style={{background:`conic-gradient(#36e69b ${Math.max(0,Math.min(100,todayEarnings/Math.max(summary.monthlyYield/30.4375,0.01)*100))}%, #25313d 0)`}}>
              <div className="flex h-[79%] w-[79%] flex-col items-center justify-center rounded-full bg-[#0b1017]">
                <strong className="text-xl font-semibold tabular-nums">{formatCurrency(todayEarnings)}</strong>
                <span className="text-[10px] text-muted-foreground">Today so far</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">{formatCurrency(summary.monthlyYield / 30.4375)} estimated daily</p>
          </div>
          <div className="mt-4 rounded-xl border border-[#2b3848] bg-[#0e141c] px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-[12px] font-semibold">Where today's earnings came from</h3>
              <span className="text-[10px] text-muted-foreground">Daily earnings and payouts</span>
            </div>
            {todayBreakdown.length ? (
              <div className="space-y-2">
                {todayBreakdown.map(source => (
                  <div key={source.name} className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate text-muted-foreground">{source.name}</span>
                    <span className={`shrink-0 font-semibold tabular-nums ${source.amount < 0 ? "text-rose-400" : "text-emerald-400"}`}>{formatCurrency(source.amount)}</span>
                  </div>
                ))}
                {!todayBreakdown.some(source => source.name === "Loopscale") && (
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 text-muted-foreground">Loopscale</span>
                    <span className="shrink-0 font-semibold tabular-nums text-emerald-400">{formatCurrency(0)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-white/10 pt-2 text-xs">
                  <span className="font-medium">Total</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(todayEarnings)}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Loopscale</span>
                  <span className="font-semibold tabular-nums text-emerald-400">{formatCurrency(0)}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  No new increases recorded yet. Each source starts from its first observed balance; earlier amounts are not assumed to be earned today.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
      {syncError && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          One or more live sources could not refresh.
          {syncError
            ? ` ${syncError}`
            : ""}
        </div>
      )}

      <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <DividendIncomeSection onEstimateChange={updateStockDividendEstimate} payouts={stockPayouts}
          onRecordPayout={recordStockPayout} onRemovePayout={removeStockPayout}
          onRestorePayout={restoreStockPayout} onAnnouncedPayouts={recordAnnouncedStockPayouts} />
      <section className="min-w-0 space-y-2 rounded-2xl border border-[#252a32] bg-[#0b1017] p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-[15px] font-semibold">Projects ({activeProgramCards.length})</h2>
          <span className="text-[11px] text-muted-foreground">Sorted by balance · {activeProgramCards.length} projects</span>
        </div>
{activeProgramCards.length ===
0 ? (
          <Card className="border-border/50 bg-card/70">
            <CardContent className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
              <CircleDollarSign className="mb-3 h-10 w-10 text-muted-foreground" />

              <p className="font-medium">
                No active yield projects
              </p>

              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Live yield positions will appear here automatically.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
  {activeProgramCards.map(
              (
                item
              ) => {

if (
  item.type ===
  "kryptex"
) {
  return (
    <KryptexProjectCard
      todayUsd={Number(dailySourceTotals["Kryptex"]) || 0}
      onDeactivate={() => deactivateProject(item.key)}
      key={
        item.key
      }
      collapsed={
        !expandedProjects.has(
          "kryptex-project"
        )
      }
      onToggle={() =>
        toggleProject(
          "kryptex-project"
        )
      }
      tracker={
        kryptexTracker
      }
      connected={
        kryptexConnected
      }
      stats={
        kryptexStats
      }
      message={
        kryptexMessage
      }
      onRefresh={
        requestKryptexLatest
      }
      logo={
        projectLogos[
          "kryptex-project"
        ] || ""
      }
      onLogoChange={(
        dataUrl
      ) =>
        setProjectLogo(
          "kryptex-project",
          dataUrl
        )
      }
      totalSpent={
        Number(
          projectPayback?.[
            "kryptex-project"
          ]?.totalSpent
        ) || 0
      }
      onTotalSpentChange={(
        value
      ) =>
        setProjectTotalSpent(
          "kryptex-project",
          value
        )
      }
    />
  );
}
                if (
                  item.type ===
                  "project"
                ) {
                  const project =
                    item.project;

                  return (
                    <ProjectCard
      todayUsd={Number(dailySourceTotals[project.platform]) || 0}
      onDeactivate={() => deactivateProject(item.key)}
                      key={
                        item.key
                      }
                      project={
                        project
                      }
                      collapsed={
                        !expandedProjects.has(
                          project.id
                        )
                      }
                      onToggle={() =>
                        toggleProject(
                          project.id
                        )
                      }
                      onDeletePosition={
                        deletePosition
                      }
                      logo={
                        projectLogos[
                          project.id
                        ] || ""
                      }
                      onLogoChange={(
                        dataUrl
                      ) =>
                        setProjectLogo(
                          project.id,
                          dataUrl
                        )
                      }
                      totalSpent={
                        Number(
                          projectPayback?.[
                            project.id
                          ]?.totalSpent
                        ) || 0
                      }
                      onTotalSpentChange={(
                        value
                      ) =>
                        setProjectTotalSpent(
                          project.id,
                          value
                        )
                      }
                    />
                  );
                }

                if (
                  item.type ===
                  "rollercoin"
                ) {
                  return (
                    <RollerCoinProjectCard
      todayUsd={Number(dailySourceTotals["RollerCoin"]) || 0}
      onDeactivate={() => deactivateProject(item.key)}
                      key={
                        item.key
                      }
                      tracker={
                        rollerCoinTracker
                      }
                      stats={
                        rollerCoinStats
                      }
                      connected={
                        rollerCoinConnected
                      }
                      authenticated={
                        rollerCoinAuthenticated
                      }
                      rollerCoinOpen={
                        rollerCoinOpen
                      }
                      syncing={
                        rollerCoinSyncing
                      }
                      message={
                        rollerCoinMessage
                      }
                      from={
                        rollerCoinFrom
                      }
                      to={
                        rollerCoinTo
                      }
                      onFromChange={
                        setRollerCoinFrom
                      }
                      onToChange={
                        setRollerCoinTo
                      }
                      onSync={
                        syncRollerCoinRange
                      }
                      onRefresh={
                        requestRollerCoinLatest
                      }
                      logo={
                        projectLogos[
                          "rollercoin-project"
                        ] || ""
                      }
                      onLogoChange={(
                        dataUrl
                      ) =>
                        setProjectLogo(
                          "rollercoin-project",
                          dataUrl
                        )
                      }
                      totalSpent={
                        Number(
                          projectPayback?.[
                            "rollercoin-project"
                          ]?.totalSpent
                        ) || 0
                      }
                      onTotalSpentChange={(
                        value
                      ) =>
                        setProjectTotalSpent(
                          "rollercoin-project",
                          value
                        )
                      }
                    />
                  );
                }

                if (
                  item.type ===
                  "salad"
                ) {
                  return (
                    <SaladProjectCard
      todayUsd={Number(dailySourceTotals["Salad"]) || 0}
      onDeactivate={() => deactivateProject(item.key)}
                      key={
                        item.key
                      }
                      tracker={
                        saladTracker
                      }
                      connected={
                        saladConnected
                      }
                      stats={
                        saladStats
                      }
                      syncing={
                        saladSyncing
                      }
                      message={
                        saladMessage
                      }
                      onRefresh={
                        syncSaladBalance
                      }
                      logo={
                        projectLogos[
                          "salad-project"
                        ] || ""
                      }
                      onLogoChange={(
                        dataUrl
                      ) =>
                        setProjectLogo(
                          "salad-project",
                          dataUrl
                        )
                      }
                      totalSpent={
                        Number(
                          projectPayback?.[
                            "salad-project"
                          ]?.totalSpent
                        ) || 0
                      }
                      onTotalSpentChange={(
                        value
                      ) =>
                        setProjectTotalSpent(
                          "salad-project",
                          value
                        )
                      }
                    />
                  );
                }

                return (
                  <UnetworkProjectCard
      todayUsd={Number(dailySourceTotals["Unetwork"]) || 0}
      onDeactivate={() => deactivateProject(item.key)}
                    key={
                      item.key
                    }
                    tracker={
                      unetworkTracker
                    }
                    connected={
                      unetworkConnected
                    }
                    stats={
                      unetworkStats
                    }
                    syncing={
                      unetworkSyncing
                    }
                    message={
                      unetworkMessage
                    }
                    onRefresh={
                      syncUnetworkBalance
                    }
                    logo={
                      projectLogos[
                        "unetwork-project"
                      ] || ""
                    }
                    onLogoChange={(
                      dataUrl
                    ) =>
                      setProjectLogo(
                        "unetwork-project",
                        dataUrl
                      )
                    }
                    totalSpent={
                      Number(
                        projectPayback?.[
                          "unetwork-project"
                        ]?.totalSpent
                      ) || 0
                    }
                    onTotalSpentChange={(
                      value
                    ) =>
                      setProjectTotalSpent(
                        "unetwork-project",
                        value
                      )
                    }
                  />
                );
              }
            )}
          </div>
        )}

      </section>
        <section className="min-w-0 rounded-2xl border border-[#263342] bg-[#0b1017] px-4 py-3">
          <h2 className="text-[13px] font-semibold">Projections</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              {label:"Daily",amount:(summary.annualYield+(estimatedStockDividendsAnnual || 0))/365,symbol:"D"},
              {label:"Weekly",amount:(summary.annualYield+(estimatedStockDividendsAnnual || 0))/52.1775,symbol:"W"},
              {label:"Monthly",amount:summary.monthlyYield+(estimatedStockDividendsAnnual || 0)/12,symbol:"M"},
              {label:"Yearly",amount:summary.annualYield+(estimatedStockDividendsAnnual || 0),symbol:"Y"},
            ].map(item => (
              <div key={item.label} className="min-w-0 rounded-xl border border-[#2b3848] bg-[#0e141c] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#23364b] text-[11px] font-bold text-[#a5c3d7]">{item.symbol}</span>
                  <div className="min-w-0">
                    <div className="text-[10px] text-muted-foreground">{item.label}</div>
                    <div className="truncate text-[clamp(13px,1.2vw,19px)] font-semibold tabular-nums" title={formatCurrency(item.amount)}>{formatCurrency(item.amount)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="min-w-0 rounded-2xl border border-[#263342] bg-[#0b1017] px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold">Connection Status</h2>
            <span className="text-[10px] text-muted-foreground">Latest sync</span>
          </div>
          <div className="space-y-1.5">
            {[
              {name:"RollerCoin wallet", connected:rollerCoinConnected, synced:latestRollerCoinTimestamp(rollerCoinTracker?.balanceSyncedAt, rollerCoinTracker?.walletLastObservedAt), maxAgeMs:25*60*1000},
              {name:"Loopscale", connected:Boolean(loopscaleSnapshot), synced:loopscaleSnapshot?.lastSyncedAt || loopscaleSnapshot?.syncedAt},
              {name:"Salad", connected:saladConnected, synced:saladTracker?.lastSyncedAt},
              {name:"Unetwork", connected:unetworkConnected, synced:unetworkTracker?.lastSyncedAt},
            ].map(item => {
              const stale = item.maxAgeMs && (!item.synced ||
                !Number.isFinite(Date.parse(item.synced)) ||
                Date.now() - Date.parse(item.synced) > item.maxAgeMs);
              return (
              <div key={item.name} className="border-b border-white/5 py-1 text-[10px] last:border-b-0">
                <div className="grid grid-cols-[minmax(0,1fr)_85px_95px] items-center gap-2">
                  <span className="truncate font-medium">{item.name}</span>
                  <span className="truncate text-muted-foreground">{formatCompactSyncAge(item.synced)}</span>
                  <span className={item.connected && !stale && !item.error ? "text-emerald-400" : "text-amber-300"}>
                    ● {!item.connected ? "Not connected" : item.error ? "Sync error" : stale ? "Stale" : "Connected"}
                  </span>
                </div>
                {item.error && <div className="mt-1 break-words text-amber-300">{item.error}</div>}
              </div>
              );
            })}
          </div>
        </section>
      </div>
      {selectedBreakdown && earningsChartRange !== "daily" && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onMouseDown={event => { if (event.target === event.currentTarget) setSelectedEarningsPoint(null); }}>
          <div role="dialog" aria-modal="true" aria-label={`Earnings by project for ${selectedBreakdown.label}`}
            className="w-full max-w-[480px] rounded-2xl border border-[#33465a] bg-[#0b1017] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Earnings by project</h3>
                <p className="mt-1 text-xs text-muted-foreground">{selectedBreakdown.label}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{selectedBreakdown.note}</p>
              </div>
              <button type="button" onClick={() => setSelectedEarningsPoint(null)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-white/10" aria-label="Close earnings breakdown">
                <X className="h-4 w-4"/>
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {selectedBreakdown.entries.length ? selectedBreakdown.entries.map(item => (
                <div key={item.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-muted-foreground">{item.name}</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(item.amount)}</span>
                </div>
              )) : <p className="text-sm text-muted-foreground">No recorded project earnings for this point.</p>}
              <div className="flex items-center justify-between border-t border-[#33465a] pt-3 text-sm font-semibold">
                <span>Total</span><span className="tabular-nums text-emerald-400">{formatCurrency(selectedBreakdown.total)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
      {historyOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm" onMouseDown={event=>{if(event.target===event.currentTarget)setHistoryOpen(false)}}>
          <div role="dialog" aria-modal="true" aria-label="Monthly income history" className="flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-4 py-3">
              <h2 className="text-base font-semibold">Monthly Income History</h2>
              <button type="button" aria-label="Close monthly history" onClick={()=>setHistoryOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-white/10"><X className="h-5 w-5"/></button>
            </div>
            <div className="min-h-0 overflow-y-auto p-3 sm:p-4">
      <ProjectIncomeSection
        months={
          projectIncome
        }
        expenses={
          projectExpenses
        }
        onExpenseChange={(
          monthKey,
          amount
        ) => {
          setProjectExpenses(
            (current) => {
              const next = {
                ...current,
              };

              const normalizedAmount =
                Math.max(
                  0,
                  Number(
                    amount
                  ) || 0
                );

              if (
                normalizedAmount >
                0
              ) {
                next[
                  monthKey
                ] =
                  normalizedAmount;
              } else {
                delete next[
                  monthKey
                ];
              }

              saveProjectExpenses(
                next
              );

              return next;
            }
          );
        }}
        selectedMonthKey={
          selectedMonthKey
        }
        onSelectMonth={
          setSelectedMonthKey
        }
        selectedYear={
          selectedYear
        }
        onSelectYear={
          setSelectedYear
        }
        saladTracker={
          saladTracker
        }
        projectLogos={
          projectLogos
        }
      />

            </div>
          </div>
        </div>
      )}


    </div>


  );
}

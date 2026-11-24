import BixberryCard from "@/components/BixberryCard";
import { useRollerCoinExtension } from "../hooks/useRollerCoinExtension";
import { useKryptexExtension } from "../hooks/useKryptexExtension";
import { useUnetworkExtension } from "../hooks/useUnetworkExtension";
import { useSaladExtension } from "../hooks/useSaladExtension";
import { buildSelectedEarningsBreakdown } from "../lib/earningsDisplay";
import { useBackendEarningsDashboard } from "@/hooks/useBackendEarningsDashboard";
import { backendYieldIncomeRows } from "@/lib/backendYieldIncomeRows";
import { useServerDailyIncome } from "../hooks/useServerDailyIncome";
import { useDailyEarningsObservations } from "../hooks/useDailyEarningsObservations";
import { useDailyEarningsHighWater } from "../hooks/useDailyEarningsHighWater";
import { buildSourceTotalsForDay } from "../lib/yieldIncomeSources";
import { buildYearlyEarningsChart } from "../lib/monthlyEarningsChart";
import { buildDailyEarningsChart } from "../lib/dailyEarningsChart";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { projectsApi } from "@/lib/api";
import { remoteStorage } from "@/lib/serverStore";
import { getLoopscaleOnycSnapshot } from "@/lib/loopscaleYieldSync";
import { useRegisteredYieldWallets } from "@/hooks/useRegisteredYieldWallets";
import { useBackendLoopscaleHistory } from "@/hooks/useBackendLoopscaleHistory";
import { useInactiveYieldProjects } from "@/hooks/useInactiveYieldProjects";
import { useYieldPersistence } from "@/hooks/useYieldPersistence";
import { api } from "@/lib/apiClient";
import { toast } from "sonner";
import { useBackendProviderStats } from "@/hooks/useBackendProviderStats";
import { currentLuloUtcDaily } from "@/lib/luloUtcDaily";
import { useLegacyLuloMonthlyAccounting } from "@/hooks/useLegacyLuloMonthlyAccounting";
import { Card, CardContent } from "@/components/ui/card";
import { Area, AreaChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CircleDollarSign, X, ChevronRight } from "lucide-react";
import {
  readObject,
  saveObject,
  loadProjectPayback,
  saveProjectPayback,
  loadProjectExpenses,
  saveProjectExpenses,
  loadProjectLogos,
  loadMonthlyBackfills,
  loadLuloMonthlyBaselines,
  loadLoopscaleHistory,
  getSaladTrackerStats,
  getUnetworkTrackerStats,
  getRollerCoinTrackerStats,
  loadPositions,
  formatCurrency,
  getCurrentYear,
  getTodayKey,
  createLuloProjectCard,
  updateLoopscaleHistoryFromSnapshot,
  createLoopscaleProjectCard,
  groupManualPositions,
  getKryptexStats,
  DAILY_BALANCE_SNAPSHOT_KEY,
  AUTO_RECOVERED_EARNINGS_KEY,
  PROJECT_QUICK_CACHE_KEY,
  getPrivateAccountingProfile,
  INACTIVE_PROJECTS_KEY
} from "@/lib/yieldFarmingAccounting";
import {
  ProjectLogoButton,
  KryptexProjectCard,
  getProjectProjections,
  ProjectCard,
  UnetworkProjectCard,
  SaladProjectCard,
  RollerCoinProjectCard,
  ProjectIncomeSection
} from "@/components/YieldFarmingComponents";

function RentalsProjectCard({ todayUsd, monthUsd, logo, onLogoChange, onDeactivate }) {
  const [expanded, setExpanded] = useState(false);
  const format = value => value == null || !Number.isFinite(Number(value)) ? "—" : "$" + Number(value).toFixed(4);
  const hasEvidence = monthUsd != null || todayUsd != null;
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-[#13181e] shadow-sm transition-all duration-200 hover:border-border hover:bg-[#171d24]">
      <div className="flex w-full min-w-0 items-start gap-2 px-3.5 py-2.5">
        <ProjectLogoButton platform="Rentals" logo={logo} onLogoChange={onLogoChange}/>
        <button type="button" onClick={() => setExpanded(true)} className="flex min-w-0 flex-1 items-start gap-2 text-left" aria-label="Rentals project details">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="min-w-0 truncate text-[12px] font-semibold">Rentals</span>
              <span className={`shrink-0 text-[9px] ${hasEvidence ? "text-emerald-400" : "text-amber-300"}`}>● {hasEvidence ? "Tracked" : "Pending"}</span>
            </div>
            <div className="mt-0.5 truncate text-[14px] font-semibold tabular-nums">{format(monthUsd)}</div>
          </div>
          <ChevronRight className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground"/>
        </button>
      </div>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 pr-7">
              <DialogTitle>Rentals</DialogTitle>
              {onDeactivate && (
                <button
                  type="button"
                  onClick={() => { setExpanded(false); onDeactivate(); }}
                  className="rounded-md border border-border/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground"
                >
                  Set inactive
                </button>
              )}
            </div>
          </DialogHeader>
          <div className="space-y-3">
            {[["Today's earnings", todayUsd], ["This month's earnings", monthUsd]].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border/50 px-4 py-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{format(value)}</div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function YieldFarmingPage({ onMonthlyEarningsChange } = {}) {
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
    requestSaladLatest,
  } = useSaladExtension();

  const {
    kryptexTracker,
    kryptexConnected,
    kryptexMessage,
    requestKryptexLatest,
  } = useKryptexExtension();

  const {
    unetworkTracker,
    unetworkConnected,
    unetworkSyncing,
    unetworkMessage,
    syncUnetworkBalance,
    requestUnetworkLatest,
  } = useUnetworkExtension();

  const {
    rollerCoinTracker,
    rollerCoinConnected,
    rollerCoinAuthenticated,
    rollerCoinOpen,
    rollerCoinSyncing,
    rollerCoinMessage,
    rollerCoinFrom,
    setRollerCoinFrom,
    rollerCoinTo,
    setRollerCoinTo,
    syncRollerCoinRange,
    requestRollerCoinLatest,
  } = useRollerCoinExtension();

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
  });

  // One-time, zero-balance Honeygain project requested by the account owner.
  // Manual by default: never manufacture earnings or infer provider payouts.
  useEffect(() => {
    const seedKey = "honeygain_project_seeded_v1";
    if (remoteStorage.getItem(seedKey) === "true") return;
    remoteStorage.setItem(seedKey, "true");
    setManualPositions(current => {
      if (current.some(position => String(position.platform || "").toLowerCase() === "honeygain")) return current;
      return [...current, {
        id: "honeygain-bandwidth-sharing",
        platform: "Honeygain",
        asset: "Bandwidth Sharing",
        strategy: "Manual earnings",
        balance: 0,
        earned: 0,
        apy: 0,
        startDate: new Date().toISOString().slice(0, 10),
      }];
    });
  }, []);

  // Remove any legacy Grass positions left in persisted account state.
  useEffect(() => {
    setManualPositions(current => current.some(position => String(position.platform || "").toLowerCase() === "grass")
      ? current.filter(position => String(position.platform || "").toLowerCase() !== "grass") : current);
  }, []);

  // Undo the mistaken default-inactive migration introduced in November.
  // The project belongs among active earners; the browser tab itself is
  // background/inactive when the extension polls Honeygain.
  useEffect(() => {
    const marker = "honeygain_default_inactive_applied_v1";
    const undoMarker = "honeygain_inactive_default_undo_v1";
    if (remoteStorage.getItem(marker) !== "true" ||
        remoteStorage.getItem(undoMarker) === "true") return;
    const stored = readObject(INACTIVE_PROJECTS_KEY);
    const ids = Array.isArray(stored.ids) ? stored.ids.map(String) : [];
    const next = ids.filter(id => id !== "manual-project-honeygain");
    if (next.length !== ids.length) {
      saveObject(INACTIVE_PROJECTS_KEY, { ...stored, ids: next });
    }
    remoteStorage.setItem(undoMarker, "true");
  }, []);

  // RollerCoin TRX price is supplied with each extension wallet sync.

  // All project refresh paths share one response-order gate. An older
  // request must not overwrite a newer response that has already applied.
  const projectRequestSequenceRef = useRef(0);
  const projectAppliedSequenceRef = useRef(0);
  const beginProjectRequest = useCallback(() => ++projectRequestSequenceRef.current, []);

  const applyOrderedProjectData = useCallback((projects, requestSequence) => {
    if (!Array.isArray(projects) || requestSequence < projectAppliedSequenceRef.current) return false;
    projectAppliedSequenceRef.current = requestSequence;
    return true;
  }, []);

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
        const requestSequence = beginProjectRequest();
        try {
          const response =
            await projectsApi.getAll();

          // A malformed response is not an empty portfolio. Preserve the
          // last valid server snapshot instead of clearing project cards.
          if (!Array.isArray(response?.data)) {
            throw new Error("Invalid project refresh response");
          }
          if (applyOrderedProjectData(response.data, requestSequence)) applyProjectData(response.data);
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
        beginProjectRequest,
        applyOrderedProjectData,
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

  const syncLivePositions = useCallback(async () => {
    setSyncError("");
    // Browser-extension updates do not depend on any API request finishing.
    requestRollerCoinLatest();
    requestSaladLatest();
    requestUnetworkLatest();
    requestKryptexLatest();

    const errors = [];
    const projectRequestSequence = beginProjectRequest();
    // Load independent sources concurrently so slow network calls do not
    // delay updates from the other projects.
    await Promise.all([
      (async () => {
        try {
          const response = await projectsApi.accrueApyTransactions();
          if (!Array.isArray(response?.data)) throw new Error("Invalid project response");
          if (applyOrderedProjectData(response.data, projectRequestSequence)) applyProjectData(response.data);
        } catch (error) {
          console.error("Yield page project sync failed:", error);
          errors.push(`Projects: ${error?.message || "sync failed"}`);
          try {
            const response = await projectsApi.getAll();
            if (Array.isArray(response?.data) && applyOrderedProjectData(response.data, projectRequestSequence)) applyProjectData(response.data);
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
    beginProjectRequest,
    applyOrderedProjectData,
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
  // Extension hooks can replace request callbacks when connection state
  // changes. Use the freshest callback on every tick, not the function
  // captured by the first render three minutes earlier.
  const latestExtensionRequestsRef = useRef({
    rollercoin: requestRollerCoinLatest,
    salad: requestSaladLatest,
    unetwork: requestUnetworkLatest,
    kryptex: requestKryptexLatest,
  });
  latestExtensionRequestsRef.current = {
    rollercoin: requestRollerCoinLatest,
    salad: requestSaladLatest,
    unetwork: requestUnetworkLatest,
    kryptex: requestKryptexLatest,
  };
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
        const latest = latestExtensionRequestsRef.current;
        latest.rollercoin();
        latest.salad();
        latest.unetwork();
        latest.kryptex();
        // Full sync already fetches and applies project data. Do not let a
        // quick project fetch race its response and overwrite newer values.
        if (!syncRunningRef.current) {
          await quickRefreshRef.current();
        }
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

  // Keep Passive Income on its current route during automatic refreshes.
  // fullRefresh (60 s) and quickRefresh (15 s) above already revalidate
  // providers and extension data without browser navigation. The older
  // three-minute location.reload() caused some hosted SPA sessions to return
  // to Crypto Dashboard and unnecessarily reset the page's open state.
  // Avoid a hard reload: server and extension updates remain in-place.

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

        // Honeygain project data is retained for edit history, but regular
        // Honeygain-mode balances never enter portfolio totals. The JumpTask
        // balance shown on its card comes only from the isolated backend feed.
        const manualProjects =
          groupManualPositions(
            manualPositions.filter(position => String(position.platform || "").toLowerCase() !== "grass").map(position =>
              String(position.platform || "").toLowerCase() === "honeygain"
                ? { ...position, balance: 0, earned: 0, apy: 0 }
                : position
            )
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


  const [bixberryTracker, setBixberryTracker] = useState(null);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const value = await api.get("/api/project-tracking/bixberry");
        if (active) setBixberryTracker(value);
      } catch { /* retain last known balance */ }
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  // The sorted project grid uses the same reported values displayed in each card.
  // Rentals previously bypassed sorting entirely; Honeygain previously sorted
  // by its retired manual balance instead of its JumpTask observation.
  const { data: backendEarnings, error: backendEarningsError } =
    useBackendEarningsDashboard(getTodayKey().slice(0, 7), true);
  const [honeygainSortBalance, setHoneygainSortBalance] = useState(null);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const value = await api.get("/api/honeygain/status");
        if (!active) return;
        const reported = value?.balanceUsd;
        setHoneygainSortBalance(
          reported !== null && reported !== undefined && Number.isFinite(Number(reported))
            ? Number(reported)
            : null
        );
      } catch { /* Unknown values sort after confirmed balances. */ }
    };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("nam-honeygain-updated", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("nam-honeygain-updated", refresh);
    };
  }, []);
  const sortedProgramCards =
    useMemo(
      () => {
        const items = [
          { type: "bixberry", key: "bixberry-project", amount: Number(bixberryTracker?.currentBalance) || 0 },
          ...projectCards.map(
            (
              project
            ) => ({
              type:
                "project",

              key:
                project.id,

              amount:
                String(project.platform || "").toLowerCase() === "honeygain"
                    ? (honeygainSortBalance ?? Number.NEGATIVE_INFINITY)
                    : Number(project.totalBalance) || 0,

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
          // Rentals remains in the earnings ledger, but is not a displayed project.
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
  bixberryTracker,
  rollerCoinStats,
  saladStats,
  unetworkStats,
  kryptexStats,
  backendEarnings?.monthlySources?.Rentals,
  honeygainSortBalance,
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
            : item.type === "kryptex" ? "Kryptex" : item.type === "bixberry" ? "Bixberry" : String(item.key),
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
        if (item.type === "bixberry") return { ...base, balanceUsd: bixberryTracker?.currentBalance ?? null, sourceLastSyncedAt: bixberryTracker?.lastSyncedAt || null };
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
    rollerCoinTracker, saladTracker, unetworkTracker, kryptexTracker, bixberryTracker,
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
      bixberry: bixberryTracker?.lastSyncedAt,
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
        // Keep reporting project freshness to the backend, but do not
        // interrupt the user with stale-reading warning popups.
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

  // Keep Rentals earnings and snapshots intact, but omit it from both visible project lists.
  const visibleProgramCards = sortedProgramCards.filter(item =>
    item.type !== "rentals" &&
    String(item.key).toLowerCase() !== "rentals-project" &&
    String(item.project?.platform || "").toLowerCase() !== "rentals"
  );
  const activeProgramCards = visibleProgramCards.filter(item => !inactiveProjectIds.includes(String(item.key)));
  const inactiveProgramCards = visibleProgramCards.filter(item => inactiveProjectIds.includes(String(item.key)));

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

  // Historical earnings are sourced exclusively from persisted backend
  // provider snapshots, dated dividends and verified legacy records. Do not
  // reconstruct monthly earnings from wallet balances or browser trackers.
  // Monthly, Weekly, and Yearly all come from the same authenticated
  // earnings dashboard response. Other accounting screens may still request
  // the independent source-income-history endpoint.

  const sourceIncomeMonths = backendEarnings?.incomeHistory?.months;
  const projectIncome = useMemo(
    () => backendYieldIncomeRows(sourceIncomeMonths), [sourceIncomeMonths]
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
  const [earningsChartRange, setEarningsChartRange] = useState("monthly");
  const [earningsChartYear, setEarningsChartYear] = useState(() => String(getCurrentYear()));
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

  // Daily provider earnings come from backend dated receipts. The retired
  // browser month-to-month delta observer must not create dated income from
  // changes to a historical monthly snapshot.

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
    stockPayouts: {},
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

  // All chart and history surfaces use the same booked monthly ledger.
  // The retired browser-side Lulo reconciliation must not be reapplied:
  // it can duplicate the provider's already-booked monthly rewards.
  const chartProjectIncome = projectIncome;

  // Today's Earnings is a cumulative earned-income counter, not mark-to-market
  // P/L. Persist per-source high-water values in a dedicated hook.
  const observedDailySourceTotals = sourceTotalsForDay(todayKey);
  const {
    dailySourceTotals,
    mergeHighWaterSources,
  } = useDailyEarningsHighWater(todayKey, observedDailySourceTotals);

  // Legacy extension observations are ingested for recovery only; all
  // financial values displayed on this page come from the backend ledger.
  useServerDailyIncome(todayKey, dailySourceTotals, mergeHighWaterSources);
  const hasServerToday = backendEarnings?.todayKey === todayKey;
  const todayEarnings = hasServerToday ? backendEarnings.todayTotalUsd : null;
  const displayDailySourceTotals = hasServerToday ? (backendEarnings.todaySources || {}) : {};
  // Honeygain is an observed reward balance, not booked USD income.
  // Display its reading with a date freshness check and preserve the
  // backend's audited daily earnings total.
  const [auxiliaryRewards, setAuxiliaryRewards] = useState({
    honeygain: null,
  });
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const honeygain = await api.get("/api/honeygain/status").catch(() => null);
      if (active) setAuxiliaryRewards({ honeygain });
    };
    refresh();
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener("nam-honeygain-updated", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("nam-honeygain-updated", refresh);
    };
  }, []);
  // Render all provider observations on the same America/Los_Angeles
  // calendar day as the rest of NAm. Their server timestamps remain UTC.
  const pacificDay = value => {
    if (!value) return null;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(date);
  };
  const honeygainObservedToday =
    pacificDay(auxiliaryRewards.honeygain?.latest?.observedAt) === todayKey;
  const honeygainDisplayUsd = honeygainObservedToday &&
    Number.isFinite(Number(auxiliaryRewards.honeygain?.balanceUsd))
    && auxiliaryRewards.honeygain?.balanceUsd != null
      ? Number(auxiliaryRewards.honeygain.balanceUsd) : null;

  // The visible list includes observed Honeygain and sorts by displayed
  // amount. The combined display total is not a booked-income calculation:
  // Honeygain is a transferred balance.
  const todayBreakdown = [
    ...Object.entries({ Kryptex: 0, ...displayDailySourceTotals })
      .filter(([name, amount]) => name === "Kryptex" || Number(amount) !== 0)
      .map(([name, amount]) => ({ name, amount: Number(amount) || 0 })),
    ...(honeygainDisplayUsd == null ? [] :
      [{ name: "Honeygain", amount: honeygainDisplayUsd, precision: 2 }]),
  ].sort((a, b) => b.amount - a.amount);
  const visibleEarningsTotal = todayEarnings == null ? null :
    Number(todayEarnings) + (honeygainDisplayUsd ?? 0);
  const monthlyChartData = backendEarnings?.days || [];
  // The daily chart is dated receipts; month-end income is the separately
  // booked provider ledger. Do not silently count provisional Lulo/Loopscale
  // receipts in the yearly accounting total.
  const thisMonthEarned = backendEarnings?.monthTotalUsd ?? null;
  const monthAccounting = backendEarnings?.monthAccountingComparison;
  const thisMonthBooked = monthAccounting?.status !== "invalid-snapshot" &&
    Number.isFinite(monthAccounting?.bookedTotalUsd)
      ? monthAccounting.bookedTotalUsd : null;
  // The chart headline must use the same booked total as the yearly November
  // point once the backend confirms parity (a sub-cent source rounding
  // difference is allowed). Keep daily detail rows unchanged for auditability.
  const thisMonthHeadline = thisMonthBooked != null &&
    Math.abs(monthAccounting?.differenceUsd ?? Infinity) <= 0.02
      ? thisMonthBooked : thisMonthEarned;
  const currentMonthSources = backendEarnings?.monthlySources || {};
  const chartSourceTotalsForDay = key =>
    backendEarnings?.days?.find(row => row.key === key)?.sources || {};
  const recordedBreakdown = buildSelectedEarningsBreakdown({
    selection: selectedEarningsPoint, earningsChartRange,
    projectIncome: chartProjectIncome, stockPayouts: {}, todayKey,
    luloUtcDay: currentLuloUtc.utcDay, hasLuloProjects: luloProjects.length > 0,
    sourceTotalsForDay: chartSourceTotalsForDay, currentMonthSources,
  });
  // Attach backend-stored Pacific-day balance observations to the popup for
  // the SELECTED chart date. Do not apply the current wallet balance to a past
  // day; that would falsify the historical chart. A month selection uses the
  // most recent observed balance in that month rather than a sum of balances.
  const selectedBreakdown = (() => {
    if (!recordedBreakdown || !selectedEarningsPoint) return recordedBreakdown;
    const key = String(selectedEarningsPoint.key || "");
    const monthlySelection = selectedEarningsPoint.range === "yearly";
    const chooseObservation = history => {
      if (!history || typeof history !== "object") return null;
      if (!monthlySelection) return history[key] || null;
      const dates = Object.keys(history).filter(day => day.startsWith(key + "-")).sort();
      return dates.length ? history[dates[dates.length - 1]] : null;
    };
    const honeyHistory = auxiliaryRewards.honeygain?.dailyHistory;
    const honeyRecord = chooseObservation(honeyHistory);
    // Before daily history existed, honor a latest persisted observation only
    // if its actual Pacific calendar date matches the selected date.
    const honeyLatest = auxiliaryRewards.honeygain?.latest;
    const honeyCreditBalance = honeyRecord?.lastCredits ??
      (honeyLatest && (monthlySelection ? pacificDay(honeyLatest.observedAt)?.startsWith(key + "-") : pacificDay(honeyLatest.observedAt) === key) ? honeyLatest.jumpTaskBalanceCredits : null);
    const numeric = value => value != null && Number.isFinite(Number(value)) ? Number(value) : null;
    const honeyCredits = numeric(honeyCreditBalance);
    const additions = [
      { name: "Honeygain", amount: honeyCredits == null ? null : honeyCredits / 1000 },
    ];
    const entries = [...recordedBreakdown.entries, ...additions]
      .sort((a, b) => (b.amount ?? -Infinity) - (a.amount ?? -Infinity));
    const addedValue = additions.reduce((total, row) => total + (row.amount ?? 0), 0);
    return {
      ...recordedBreakdown,
      entries,
      total: recordedBreakdown.total + addedValue,
      note: recordedBreakdown.note + " Tracked Honeygain balances are snapshots, not booked daily income.",
    };
  })();

  const dailyEarningsObservations =
    useDailyEarningsObservations(todayEarnings, earningsClock, todayKey);

  const weekDays = backendEarnings?.weekDays || [];
  const weekEarnings = backendEarnings?.weeklyTotalUsd ?? null;
  const observedWeekMaximum = Math.max(1, ...weekDays.map(day => Number(day.value) || 0));
  const timeParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(earningsClock));
  const timePart = type => Number(timeParts.find(part => part.type === type)?.value || 0);
  const currentHour = timePart("hour") + timePart("minute") / 60;

  const { dailyChartData, dailyChartMax, dailyChartMin, dailyChartEnd, dailyChartTicks } =
    buildDailyEarningsChart(dailyEarningsObservations, todayKey, currentHour, todayEarnings ?? 0);

  const monthlyChartMax = Math.max(
    0.1,
    ...monthlyChartData.map(day => Number(day.value) || 0)
  ) * 1.15;

  const availableEarningsYears = [...new Set([
    todayKey.slice(0, 4),
    ...chartProjectIncome
      .map(month => String(month?.monthKey || "").slice(0, 4))
      .filter(year => /^\d{4}$/.test(year)),
  ])].sort((a, b) => b.localeCompare(a));

  // Use the same backend-booked history for every monthly/yearly point.
  // Replacing November with the separately dated daily estimate made the
  // yearly sum disagree with the Lifetime Earned ledger.
  const yearlyChartData = buildYearlyEarningsChart(
    chartProjectIncome,
    {},
    earningsChartYear,
    todayKey
  );
  // The current-month earnings endpoint may finish before the full historical
  // ledger. Never show a fake Jan-Oct $0 chart or a partial yearly headline.
  const yearlyHistoryReady = Boolean(backendEarnings?.incomeHistory);
  const thisYearEarned = yearlyHistoryReady ? yearlyChartData.reduce(
    (sum, month) => sum + (Number(month.value) || 0),
    0
  ) : null;
  const yearlyChartMax = Math.max(
    0.1,
    ...yearlyChartData.map(month => Number(month.value) || 0)
  ) * 1.15;
  // All Years aggregates the exact same booked monthly history used by
  // Yearly, with the same current-month adjustment. Never derive revenue
  // from balances or recompute income from browser observations.
  const allYearsChartData = [...availableEarningsYears].sort().map(year => {
    const yearMonths = buildYearlyEarningsChart(chartProjectIncome, {}, year, todayKey);
    return {
      year, label: year,
      value: yearMonths.some(month => month.value != null)
        ? yearMonths.reduce((sum, month) => sum + (Number(month.value) || 0), 0)
        : null,
    };
  });
  const allYearsEarned = yearlyHistoryReady
    ? allYearsChartData.reduce((sum, year) => sum + (Number(year.value) || 0), 0)
    : null;
  const allYearsChartMax = Math.max(0.1,
    ...allYearsChartData.map(year => Number(year.value) || 0)) * 1.15;


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
      // Portfolio valuation is computed by /api/project-tracking/latest on
      // the backend from validated current provider amounts. No browser sum.
      const serverAvailable = serverPortfolio?.projectCount === sortedProgramCards.length &&
        Number.isFinite(Number(serverPortfolio?.totalUsd));
      const portfolioBalance = serverAvailable ? Number(serverPortfolio.totalUsd) : null;

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

  // The backend owns project_income_portfolio_summary_v1. Never publish
  // browser-computed values into a shared setting or another page.

  function updateHoneygainBalance(assetId, values) {
    const balance = Number(values?.balance);
    const earned = Number(values?.earned);
    if (!Number.isFinite(balance) || balance < 0 || !Number.isFinite(earned) || earned < 0) return;
    setManualPositions(current => current.map(position =>
      position.id === assetId && String(position.platform || "").toLowerCase() === "honeygain"
        ? { ...position, balance, earned }
        : position
    ));
    toast.success("Honeygain balances saved");
  }

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
                <Button type="button" variant="outline" size="sm" className="border-[#303842] bg-[#13181e] text-muted-foreground hover:text-white">
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
                        <div className="truncate text-sm font-medium">{item.type === "project" ? item.project.platform : item.type === "rollercoin" ? "RollerCoin" : item.type === "unetwork" ? "Unetwork" : item.type === "kryptex" ? "Kryptex" : item.type === "bixberry" ? "Bixberry" : item.type === "rentals" ? "Rentals" : "Salad"}</div>
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
        <span className="text-[11px] text-muted-foreground">{weekDays[0]?.date || "—"} – {weekDays[6]?.date || "—"} · Pacific Time</span>
        </div>
      </header>
      <div className="grid items-stretch gap-2.5 lg:min-h-[clamp(350px,calc(100dvh-465px),640px)] lg:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)]">
        <section className="flex min-w-0 flex-col rounded-2xl border border-[#242b33] bg-[#0d1014] p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-semibold">{earningsChartRange === "monthly" &&
                thisMonthBooked != null && Math.abs(monthAccounting.differenceUsd) > 0.02
                  ? "Dated Earnings This Month"
                  : `Earnings ${earningsChartRange === "monthly" ? "This Month"
                    : earningsChartRange === "weekly" ? "This Week"
                    : earningsChartRange === "allYears" ? "All Years"
                     : earningsChartYear === todayKey.slice(0, 4) ? "This Year" : earningsChartYear}`}</h2>
              <div className="mt-1 text-[22px] font-semibold tabular-nums text-emerald-400"
                title={backendEarnings?.fullyVerified === false
                  ? "Includes legacy receipts awaiting provider reconciliation"
                  : undefined}>{(earningsChartRange === "monthly" && thisMonthEarned == null) || (earningsChartRange === "weekly" && weekEarnings == null) || (earningsChartRange === "yearly" && thisYearEarned == null) || (earningsChartRange === "allYears" && allYearsEarned == null) ? "—" : formatCurrency(earningsChartRange === "monthly" ? thisMonthHeadline : earningsChartRange === "weekly" ? weekEarnings : earningsChartRange === "allYears" ? allYearsEarned : thisYearEarned)}</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-[#303842] bg-[#13181e] p-0.5" aria-label="Earnings chart period">
                {["monthly", "weekly", "yearly", "allYears"].map(period => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => { setEarningsChartRange(period); setSelectedEarningsPoint(null); }}
                    aria-pressed={earningsChartRange === period}
                    className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${earningsChartRange === period ? "bg-[#283039] text-white" : "text-muted-foreground hover:text-white"}`}
                  >
                    {period === "monthly" ? "Monthly" : period === "weekly" ? "Weekly" : period === "yearly" ? "Yearly" : "All Years"}
                  </button>
                ))}
              </div>
              {earningsChartRange === "yearly" && (
                <select
                  aria-label="Earnings chart year"
                  value={earningsChartYear}
                  onChange={event => {
                    setEarningsChartYear(event.target.value);
                    setSelectedEarningsPoint(null);
                  }}
                  className="rounded-lg border border-[#303842] bg-[#13181e] px-2 py-1 text-[10px] font-medium text-white outline-none"
                >
                  {availableEarningsYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              )}
              <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-400">
                <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                {earningsChartRange === "yearly" && earningsChartYear !== todayKey.slice(0, 4) ? "Historical" : earningsChartRange === "allYears" ? "History" : "Live"}
              </div>
            </div>
          </div>
          <div className="mt-2 h-[265px] w-full min-h-0 lg:h-auto lg:min-h-[280px] lg:flex-1">
            {(earningsChartRange === "yearly" || earningsChartRange === "allYears") && !yearlyHistoryReady ? (
              <div role="status" className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {backendEarningsError ? "Reconnecting to recorded earnings…" : "Loading recorded yearly earnings…"}
              </div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              {earningsChartRange === "monthly" ? (
                <AreaChart data={monthlyChartData} margin={{top:18,right:15,left:-8,bottom:3}} onClick={point => { const index = Number(point?.activeTooltipIndex); const day = point?.activePayload?.[0]?.payload?.key || (Number.isInteger(index) ? monthlyChartData[index]?.key : null); if (day && day <= todayKey) setSelectedEarningsPoint({range:"monthly",key:day}); }}>
                  <defs>
                    <linearGradient id="yieldMonthlyFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#30d991" stopOpacity={0.28}/>
                      <stop offset="100%" stopColor="#30d991" stopOpacity={0.01}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#26313b" opacity={0.35} strokeDasharray="3 4"/>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fontSize:9,fill:"#91a1b2"}} interval={2} />
                  <YAxis axisLine={false} tickLine={false} width={51} tick={{fontSize:10,fill:"#91a1b2"}} domain={[0,monthlyChartMax]} tickFormatter={v=>"$"+Number(v).toFixed(2)}/>
                  <Tooltip cursor={{stroke:"#30d991",strokeDasharray:"3 4"}} contentStyle={{background:"#13181e",border:"1px solid #303842",borderRadius:10,fontSize:12}} labelFormatter={(label,items)=>items?.[0]?.payload?.label || label} formatter={value=>[formatCurrency(value),"Daily earnings"]}/>
                  <Area type="monotone" dataKey="value" name="Daily earnings" stroke="#30e69b" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" fill="url(#yieldMonthlyFill)"
                    dot={props => {
                      const day = props?.payload?.key;
                      if (!day || day > todayKey || props?.payload?.value == null) return null;
                      return <circle cx={props.cx} cy={props.cy} r={4} fill="#30e69b"
                        stroke="#0d1014" strokeWidth={2} style={{cursor:"pointer"}}
                        onClick={() => setSelectedEarningsPoint({range:"monthly",key:day})}/>;
                    }}
                    activeDot={props => {
                      const day = props?.payload?.key;
                      if (!day || day > todayKey || props?.payload?.value == null) return null;
                      return <circle cx={props.cx} cy={props.cy} r={7} fill="#30e69b"
                        stroke="#0d1014" strokeWidth={2} style={{cursor:"pointer"}}
                        onClick={() => setSelectedEarningsPoint({range:"monthly",key:day})}/>;
                    }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              ) : earningsChartRange === "weekly" ? (
                <AreaChart data={weekDays} margin={{top:28,right:15,left:-8,bottom:3}} onClick={point => { const index = Number(point?.activeTooltipIndex); const day = point?.activePayload?.[0]?.payload?.key || (Number.isInteger(index) ? weekDays[index]?.key : null); if (day && day <= todayKey) setSelectedEarningsPoint({range:"weekly",key:day}); }}>
                  <defs>
                    <linearGradient id="yieldWeeklyLiveFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#30d991" stopOpacity={0.28}/>
                      <stop offset="100%" stopColor="#30d991" stopOpacity={0.01}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#26313b" opacity={0.35} strokeDasharray="3 4"/>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} interval={0} tick={{fontSize:11,fill:"#91a1b2"}} />
                  <YAxis axisLine={false} tickLine={false} width={51} tick={{fontSize:10,fill:"#91a1b2"}} domain={[0,observedWeekMaximum*1.15]} tickFormatter={v=>"$"+Number(v).toFixed(2)} />
                  <Tooltip cursor={{stroke:"#30d991",strokeDasharray:"3 4"}} contentStyle={{background:"#13181e",border:"1px solid #303842",borderRadius:10,fontSize:12}} labelFormatter={(label,items)=>items?.[0]?.payload?.date || label} formatter={value=>[formatCurrency(value),"Recorded earnings"]} />
                  <Area type="monotone" dataKey="value" name="Earnings" stroke="#30e69b" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" fill="url(#yieldWeeklyLiveFill)"
                    dot={props => {
                      const day = props?.payload?.key;
                      if (!day || day > todayKey || props?.payload?.value == null) return null;
                      return <circle cx={props.cx} cy={props.cy} r={6} fill="#30e69b"
                        stroke="#0d1014" strokeWidth={2} style={{cursor:"pointer"}}
                        onClick={() => setSelectedEarningsPoint({range:"weekly",key:day})}/>;
                    }}
                    activeDot={props => {
                      const day = props?.payload?.key;
                      if (!day || day > todayKey || props?.payload?.value == null) return null;
                      return <circle cx={props.cx} cy={props.cy} r={8} fill="#30e69b"
                        stroke="#0d1014" strokeWidth={2} style={{cursor:"pointer"}}
                        onClick={() => setSelectedEarningsPoint({range:"weekly",key:day})}/>;
                    }}
                    connectNulls={false} isAnimationActive={false}>
                    <LabelList dataKey="value" position="top" offset={12} formatter={value => value == null ? "" : formatCurrency(value)} style={{fill:"#c7f9e5",fontSize:10,fontWeight:600}} />
                  </Area>
                </AreaChart>
              ) : earningsChartRange === "allYears" ? (
                <AreaChart data={allYearsChartData} margin={{top:28,right:15,left:-8,bottom:3}}
                  onClick={point => {
                    const index = Number(point?.activeTooltipIndex);
                    const year = point?.activePayload?.[0]?.payload?.year ||
                      (Number.isInteger(index) ? allYearsChartData[index]?.year : null);
                    if (year && allYearsChartData.some(item => item.year === year && item.value != null)) {
                      setEarningsChartYear(year);
                      setEarningsChartRange("yearly");
                      setSelectedEarningsPoint(null);
                    }
                  }}>
                  <defs>
                    <linearGradient id="yieldAllYearsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#30d991" stopOpacity={0.28}/>
                      <stop offset="100%" stopColor="#30d991" stopOpacity={0.01}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#26313b" opacity={0.35} strokeDasharray="3 4"/>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} interval={0} tick={{fontSize:10,fill:"#91a1b2"}} />
                  <YAxis axisLine={false} tickLine={false} width={51} tick={{fontSize:10,fill:"#91a1b2"}} domain={[0,allYearsChartMax]} tickFormatter={v=>"$"+Number(v).toFixed(0)}/>
                  <Tooltip cursor={{stroke:"#30d991",strokeDasharray:"3 4"}} contentStyle={{background:"#13181e",border:"1px solid #303842",borderRadius:10,fontSize:12}} formatter={value=>[formatCurrency(value),"Annual earnings"]}/>
                  <Area type="monotone" dataKey="value" name="Annual earnings" stroke="#30e69b" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" fill="url(#yieldAllYearsFill)"
                    dot={props => props?.payload?.value == null ? null :
                      <circle cx={props.cx} cy={props.cy} r={5} fill="#30e69b" stroke="#0d1014" strokeWidth={2} style={{cursor:"pointer"}}
                        onClick={() => { setEarningsChartYear(props.payload.year); setEarningsChartRange("yearly"); setSelectedEarningsPoint(null); }}/>}
                    activeDot={{r:8}} connectNulls={false} isAnimationActive={false}>
                    <LabelList dataKey="value" position="top" offset={12}
                      formatter={value => value == null ? "" : formatCurrency(value)}
                      style={{fill:"#c7f9e5",fontSize:10,fontWeight:600}} />
                  </Area>
                </AreaChart>
              ) : (
                <AreaChart data={yearlyChartData} margin={{top:28,right:15,left:-8,bottom:3}} onClick={point => { const index = Number(point?.activeTooltipIndex); const month = point?.activePayload?.[0]?.payload?.monthKey || (Number.isInteger(index) ? yearlyChartData[index]?.monthKey : null); if (month && month <= todayKey.slice(0,7)) setSelectedEarningsPoint({range:"yearly",key:month}); }}>
                  <defs>
                    <linearGradient id="yieldYearlyFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#30d991" stopOpacity={0.28}/>
                      <stop offset="100%" stopColor="#30d991" stopOpacity={0.01}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#26313b" opacity={0.35} strokeDasharray="3 4"/>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} interval={0} tick={{fontSize:10,fill:"#91a1b2"}} />
                  <YAxis axisLine={false} tickLine={false} width={51} tick={{fontSize:10,fill:"#91a1b2"}} domain={[0,yearlyChartMax]} tickFormatter={v=>"$"+Number(v).toFixed(0)}/>
                  <Tooltip cursor={{stroke:"#30d991",strokeDasharray:"3 4"}} contentStyle={{background:"#13181e",border:"1px solid #303842",borderRadius:10,fontSize:12}} formatter={value=>[formatCurrency(value),"Monthly earnings"]}/>
                  <Area type="monotone" dataKey="value" name="Monthly earnings" stroke="#30e69b" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" fill="url(#yieldYearlyFill)"
                    dot={props => {
                      const monthKey = props?.payload?.monthKey;
                      if (!monthKey || props?.payload?.value == null) return null;
                      return <circle cx={props.cx} cy={props.cy} r={5} fill="#30e69b"
                        stroke="#0d1014" strokeWidth={2} style={{cursor:"pointer"}}
                        onClick={() => setSelectedEarningsPoint({range:"yearly",key:monthKey})}/>;
                    }}
                    activeDot={props => {
                      const monthKey = props?.payload?.monthKey;
                      if (!monthKey || props?.payload?.value == null) return null;
                      return <circle cx={props.cx} cy={props.cy} r={8} fill="#30e69b"
                        stroke="#0d1014" strokeWidth={2} style={{cursor:"pointer"}}
                        onClick={() => setSelectedEarningsPoint({range:"yearly",key:monthKey})}/>;
                    }}
                    connectNulls={false}
                    isAnimationActive={false}>
                    <LabelList dataKey="value" position="top" offset={12} formatter={value => value == null ? "" : formatCurrency(value)} style={{fill:"#c7f9e5",fontSize:10,fontWeight:600}} />
                  </Area>
                </AreaChart>
              )}
            </ResponsiveContainer>
            )}
          </div>
        </section>
        <section className="flex h-full min-w-0 flex-col rounded-2xl border border-[#242b33] bg-[#0d1014] p-3">
          <h2 className="text-[14px] font-semibold">Today's Earnings</h2>
          {backendEarningsError && <p className="mt-1 text-[11px] text-amber-400">{backendEarningsError} — saved backend totals shown if available</p>}

          <div className="mt-3 flex flex-1 flex-col px-1">
            {todayBreakdown.length ? (
              <div className="flex flex-1 flex-col justify-evenly gap-1">
                {todayBreakdown.map(source => (
                  <div key={source.name} className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate text-muted-foreground">{source.name}</span>
                    <span className={`shrink-0 font-semibold tabular-nums ${source.amount < 0 ? "text-rose-400" : "text-emerald-400"}`}>{source.precision != null ? "$" + source.amount.toFixed(source.precision) : formatCurrency(source.amount)}</span>
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
                  <span className="font-semibold tabular-nums">{visibleEarningsTotal == null ? "—" : formatCurrency(visibleEarningsTotal)}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col justify-center gap-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Loopscale</span>
                  <span className="font-semibold tabular-nums text-emerald-400">{formatCurrency(0)}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  No booked USD increases recorded yet.
                </p>

              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-3">
      <section className="h-full min-w-0 space-y-2 rounded-2xl border border-[#242b33] bg-[#0d1014] p-2.5">
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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(230px,255px))] sm:justify-start">
  {activeProgramCards.map(
              (
                item
              ) => {

if (item.type === "rentals") return (
  <RentalsProjectCard key={item.key}
    onDeactivate={() => deactivateProject(item.key)}
    todayUsd={backendEarnings?.todaySources?.Rentals}
    monthUsd={backendEarnings?.monthlySources?.Rentals}
    logo={projectLogos["rentals-project"] || ""}
    onLogoChange={value => setProjectLogo("rentals-project", value)}
  />
);
if (item.type === "bixberry") return <BixberryCard key={item.key} tracker={bixberryTracker} logo={projectLogos["bixberry-project"] || ""} onLogoChange={value => setProjectLogo("bixberry-project", value)} todayUsd={displayDailySourceTotals["Bixberry"]} />;

if (
  item.type ===
  "kryptex"
) {
  return (
    <KryptexProjectCard
      todayUsd={Number(displayDailySourceTotals["Kryptex"]) || 0}
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
      todayUsd={Number(displayDailySourceTotals[project.platform]) || 0}
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
      onManualEarningsChange={updateHoneygainBalance}
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
      todayUsd={Number(displayDailySourceTotals["RollerCoin"]) || 0}
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
      todayUsd={Number(displayDailySourceTotals["Salad"]) || 0}
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
      todayUsd={Number(displayDailySourceTotals["Unetwork"]) || 0}
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


      </div>
      {selectedBreakdown && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onMouseDown={event => { if (event.target === event.currentTarget) setSelectedEarningsPoint(null); }}>
          <div role="dialog" aria-modal="true" aria-label={`Earnings by project for ${selectedBreakdown.label}`}
            className="w-full max-w-[480px] rounded-2xl border border-[#303842] bg-[#0d1014] p-5 shadow-2xl">
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
                  <span className="font-semibold tabular-nums">{item.amount == null ? "—" : formatCurrency(item.amount)}</span>
                </div>
              )) : <p className="text-sm text-muted-foreground">No recorded project earnings for this point.</p>}
              <div className="flex items-center justify-between border-t border-[#303842] pt-3 text-sm font-semibold">
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
          chartProjectIncome
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

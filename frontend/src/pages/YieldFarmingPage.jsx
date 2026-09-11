import { useCallback, useEffect, useMemo, useState } from "react";
import { remoteStorage } from "@/lib/serverStore";
import { projectsApi } from "@/lib/api";
import { getRatexPtonycSnapshot } from "@/lib/ratexYieldSync";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CircleDollarSign,
  BadgeDollarSign,
  Layers3,
  Percent,
  Trash2,
  TrendingUp,
  Wifi,
  CalendarDays,
  X,
} from "lucide-react";

const STORAGE_KEY = "networth_yield_positions";
const LOGO_STORAGE_KEY = "yield_project_logos_v1";
const MONTHLY_BACKFILL_KEY = "yield_monthly_earnings_backfill_v1";
const MONTHLY_TRACKING_START = "2026-09";

function loadProjectLogos() {
  try {
    const raw = remoteStorage.getItem(LOGO_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);

    return parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function saveProjectLogos(logos) {
  remoteStorage.setItem(
    LOGO_STORAGE_KEY,
    JSON.stringify(logos)
  );
}

function loadMonthlyBackfills() {
  try {
    const raw = remoteStorage.getItem(MONTHLY_BACKFILL_KEY);

    if (!raw) return {};

    const parsed = JSON.parse(raw);

    return parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function saveMonthlyBackfills(value) {
  remoteStorage.setItem(
    MONTHLY_BACKFILL_KEY,
    JSON.stringify(value)
  );
}

function loadPositions() {
  try {
    const raw = remoteStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function savePositions(positions) {
  remoteStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(positions)
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatPercent(value) {
  return `${(Number(value) || 0).toFixed(2)}%`;
}

function formatSyncTime(value) {
  if (!value) return "Not synced yet";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not synced yet";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getInitials(value = "") {
  const parts = String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "?";

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getMonthKey(value) {
  if (!value) return "";

  const text = String(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text.slice(0, 7);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
  }).format(date);
}

function getCurrentMonthKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function formatMonthLabel(monthKey) {
  if (!monthKey) return "";

  const [year, month] = monthKey
    .split("-")
    .map(Number);

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "long",
    year: "numeric",
  }).format(
    new Date(
      Date.UTC(
        year,
        month - 1,
        15,
        12
      )
    )
  );
}

function formatShortMonth(monthKey) {
  if (!monthKey) return "";

  const [year, month] = monthKey
    .split("-")
    .map(Number);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "America/Los_Angeles",
  }).format(
    new Date(
      Date.UTC(
        year,
        month - 1,
        15,
        12
      )
    )
  );
}

function getMonthRange(startMonthKey, endMonthKey) {
  const [startYear, startMonth] = startMonthKey
    .split("-")
    .map(Number);

  const [endYear, endMonth] = endMonthKey
    .split("-")
    .map(Number);

  const months = [];

  let year = startYear;
  let month = startMonth;

  while (
    year < endYear ||
    (
      year === endYear &&
      month <= endMonth
    )
  ) {
    months.push(
      `${year}-${String(month).padStart(2, "0")}`
    );

    month += 1;

    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return months;
}

function getMonthStart(date = new Date()) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    1
  );
}

function getElapsedMonthDays(project, now = new Date()) {
  const monthStart = getMonthStart(now);

  const possibleStart =
    project?.start_date ||
    project?.startDate ||
    project?.created_at ||
    project?.createdAt ||
    null;

  let earningStart = monthStart;

  if (possibleStart) {
    const parsed = new Date(possibleStart);

    if (
      !Number.isNaN(parsed.getTime()) &&
      parsed > monthStart &&
      parsed < now
    ) {
      earningStart = parsed;
    }
  }

  const elapsedMs =
    now.getTime() -
    earningStart.getTime();

  return Math.max(
    0,
    elapsedMs / 86400000
  );
}

function getTrackedLuloMonthEarnings(
  project,
  monthKey
) {
  const transactions =
    Array.isArray(project?.transactions)
      ? project.transactions
      : [];

  return transactions
    .filter((transaction) => {
      if (
        transaction?.source !==
        "lulo_yield"
      ) {
        return false;
      }

      const amount =
        Number(transaction?.amount) || 0;

      if (amount <= 0) {
        return false;
      }

      const transactionMonth =
        getMonthKey(
          transaction.source_date ||
            transaction.date ||
            transaction.created_at
        );

      return transactionMonth === monthKey;
    })
    .reduce(
      (total, transaction) =>
        total +
        (Number(transaction.amount) || 0),
      0
    );
}

function estimateLuloMonthToDate(
  project,
  now = new Date()
) {
  const balance =
    Number(
      project?.lulo_total_balance_usd
    ) || 0;

  const apy =
    Number(
      project?.lulo_weighted_apy
    ) || 0;

  if (
    balance <= 0 ||
    apy <= 0
  ) {
    return 0;
  }

  const elapsedDays =
    getElapsedMonthDays(
      project,
      now
    );

  return (
    balance *
    (apy / 100) *
    (elapsedDays / 365)
  );
}

function createLuloProjectCard(project) {
  const assets = [];

  const totalBalance =
    Number(
      project.lulo_total_balance_usd
    ) || 0;

  const usdcBalance =
    Number(
      project.lulo_usdc_balance_usd
    ) || 0;

  const protectedBalance =
    Number(
      project.lulo_protected_balance_usd
    ) || 0;

  const savedUsdsBalance =
    Number(
      project.lulo_usds_balance_usd
    ) || 0;

  const derivedUsdsBalance = Math.max(
    0,
    totalBalance -
      usdcBalance -
      protectedBalance
  );

  const usdsBalance =
    savedUsdsBalance > 0
      ? savedUsdsBalance
      : derivedUsdsBalance;

  if (usdsBalance > 0) {
    assets.push({
      id: `lulo-usds-${project.id}`,
      asset: "USDS",
      strategy: "Lending",
      balance: usdsBalance,
      quantity: usdsBalance,
      price: 1,
      apy:
        Number(
          project.lulo_usds_apy
        ) ||
        Number(
          project.lulo_weighted_apy
        ) ||
        0,
      sourceLabel: "Lulo",
    });
  }

  if (usdcBalance > 0) {
    assets.push({
      id: `lulo-usdc-${project.id}`,
      asset: "USDC",
      strategy: "Lending",
      balance: usdcBalance,
      quantity: usdcBalance,
      price: 1,
      apy:
        Number(
          project.lulo_regular_apy
        ) || 0,
      sourceLabel: "Lulo",
    });
  }

  if (protectedBalance > 0) {
    assets.push({
      id: `lulo-protected-${project.id}`,
      asset: "Protected",
      strategy: "Protected Lending",
      balance: protectedBalance,
      quantity: protectedBalance,
      price: 1,
      apy:
        Number(
          project.lulo_protected_apy
        ) || 0,
      sourceLabel: "Lulo",
    });
  }

  if (
    !assets.length &&
    totalBalance > 0
  ) {
    assets.push({
      id: `lulo-total-${project.id}`,
      asset: "Stablecoins",
      strategy: "Lending",
      balance: totalBalance,
      quantity: null,
      price: null,
      apy:
        Number(
          project.lulo_weighted_apy
        ) || 0,
      sourceLabel: "Lulo",
    });
  }

  return {
    id: `lulo-project-${project.id}`,
    platform: "Lulo",
    autoSynced: true,
    totalBalance,
    weightedApy:
      Number(
        project.lulo_weighted_apy
      ) || 0,
    earned:
      Number(
        project.lulo_lifetime_interest_usd
      ) ||
      Number(project.earned) ||
      0,
    lastSyncedAt:
      project.lulo_last_synced_at ||
      null,
    assets,
  };
}

function createRatexProjectCard(snapshot) {
  if (
    !snapshot ||
    !(Number(snapshot.quantity) > 0)
  ) {
    return null;
  }

  const maturityDate =
    new Date(snapshot.maturity);

  const now = new Date();

  const daysRemaining =
    Number.isNaN(
      maturityDate.getTime()
    )
      ? null
      : Math.max(
          0,
          Math.ceil(
            (
              maturityDate.getTime() -
              now.getTime()
            ) /
              86400000
          )
        );

  const asset = {
    id: "ratex-ptonyc-2609",
    asset: "PTONyc",
    allocationSymbol: "ONyc",
    strategy: "Fixed Yield",
    balance:
      Number(
        snapshot.currentValueUsd
      ) || 0,
    quantity:
      Number(
        snapshot.quantity
      ) || 0,
    price:
      Number(
        snapshot.priceUsd
      ) || 0,
    apy:
      Number(
        snapshot.fixedApy
      ) || 0,
    maturity:
      snapshot.maturity,
    maturityValueUsd:
      Number(
        snapshot.maturityValueUsd
      ) || 0,
    projectedProfitUsd:
      Number(
        snapshot.projectedProfitUsd
      ) || 0,
    remainingYieldUsd:
      Number(
        snapshot.remainingYieldUsd
      ) || 0,
    daysRemaining,
    sourceLabel: "RateX",
  };

  return {
    id: "ratex-project-ptonyc-2609",
    platform: "RateX",
    autoSynced: true,
    totalBalance:
      asset.balance,
    weightedApy:
      asset.apy,
    earned:
      Number(
        snapshot.earnedUsd
      ) || 0,
    lastSyncedAt:
      snapshot.syncedAt ||
      null,
    assets: [asset],
  };
}

function groupManualPositions(positions) {
  const grouped = new Map();

  positions.forEach(
    (position) => {
      const platform =
        String(
          position.platform ||
            "Other"
        ).trim() ||
        "Other";

      const key =
        platform.toLowerCase();

      if (!grouped.has(key)) {
        grouped.set(key, {
          id: `manual-project-${key}`,
          platform,
          autoSynced: false,
          lastSyncedAt: null,
          assets: [],
        });
      }

      grouped.get(key).assets.push({
        id: position.id,
        manualId:
          position.id,
        asset:
          position.asset ||
          "Position",
        strategy:
          position.strategy ||
          "Yield",
        balance:
          Number(
            position.balance
          ) || 0,
        quantity: null,
        price: null,
        apy:
          Number(
            position.apy
          ) || 0,
        earned:
          Number(
            position.earned
          ) || 0,
        startDate:
          position.startDate ||
          "",
        sourceLabel:
          platform,
      });
    }
  );

  return Array.from(
    grouped.values()
  ).map((project) => {
    const totalBalance =
      project.assets.reduce(
        (sum, asset) =>
          sum +
          (Number(
            asset.balance
          ) || 0),
        0
      );

    const earned =
      project.assets.reduce(
        (sum, asset) =>
          sum +
          (Number(
            asset.earned
          ) || 0),
        0
      );

    const weightedApy =
      totalBalance > 0
        ? project.assets.reduce(
            (sum, asset) =>
              sum +
              (Number(
                asset.balance
              ) || 0) *
                (Number(
                  asset.apy
                ) || 0),
            0
          ) /
          totalBalance
        : 0;

    return {
      ...project,
      totalBalance,
      weightedApy,
      earned,
    };
  });
}

function buildMonthlyEarnings(
  luloProjects,
  ratexSnapshot,
  monthlyBackfills
) {
  const monthMap = new Map();

  function addEarning(
    monthKey,
    platform,
    amount
  ) {
    const numericAmount =
      Number(amount) || 0;

    if (
      !monthKey ||
      monthKey < MONTHLY_TRACKING_START ||
      numericAmount <= 0
    ) {
      return;
    }

    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, {
        monthKey,
        total: 0,
        platforms: new Map(),
      });
    }

    const month =
      monthMap.get(monthKey);

    month.total += numericAmount;

    month.platforms.set(
      platform,
      (
        month.platforms.get(
          platform
        ) || 0
      ) +
        numericAmount
    );
  }

  (luloProjects || []).forEach(
    (project) => {
      const transactions =
        Array.isArray(
          project?.transactions
        )
          ? project.transactions
          : [];

      transactions.forEach(
        (transaction) => {
          if (
            transaction?.source !==
            "lulo_yield"
          ) {
            return;
          }

          const amount =
            Number(
              transaction?.amount
            ) || 0;

          if (amount <= 0) {
            return;
          }

          const monthKey =
            getMonthKey(
              transaction.source_date ||
                transaction.date ||
                transaction.created_at
            );

          addEarning(
            monthKey,
            "Lulo",
            amount
          );
        }
      );

      const projectBackfills =
        monthlyBackfills?.[
          String(project.id)
        ] || {};

      Object.entries(
        projectBackfills
      ).forEach(
        ([
          monthKey,
          amount,
        ]) => {
          addEarning(
            monthKey,
            "Lulo",
            amount
          );
        }
      );
    }
  );

  const ratexEarned =
    Number(
      ratexSnapshot?.earnedUsd
    ) || 0;

  if (ratexEarned > 0) {
    addEarning(
      getCurrentMonthKey(),
      "RateX",
      ratexEarned
    );
  }

  return Array.from(
    monthMap.values()
  )
    .map((month) => ({
      monthKey:
        month.monthKey,
      total:
        month.total,
      platforms:
        Array.from(
          month.platforms.entries()
        )
          .map(
            ([
              platform,
              amount,
            ]) => ({
              platform,
              amount,
            })
          )
          .sort(
            (a, b) =>
              b.amount -
              a.amount
          ),
    }))
    .sort(
      (a, b) =>
        a.monthKey.localeCompare(
          b.monthKey
        )
    );
}

export default function YieldFarmingPage() {
  const [
    manualPositions,
    setManualPositions,
  ] = useState(
    loadPositions
  );

  const [
    luloProjects,
    setLuloProjects,
  ] = useState([]);

  const [
    ratexSnapshot,
    setRatexSnapshot,
  ] = useState(null);

  const [
    syncError,
    setSyncError,
  ] = useState("");

  const [
    expandedProjects,
    setExpandedProjects,
  ] = useState(
    () => new Set()
  );

  const [
    selectedMonthKey,
    setSelectedMonthKey,
  ] = useState(null);

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

  useEffect(() => {
    savePositions(
      manualPositions
    );
  }, [manualPositions]);

  useEffect(() => {
    saveProjectLogos(
      projectLogos
    );
  }, [projectLogos]);

  useEffect(() => {
    saveMonthlyBackfills(
      monthlyBackfills
    );
  }, [monthlyBackfills]);

  useEffect(() => {
    if (
      !luloProjects.length
    ) {
      return;
    }

    const now = new Date();
    const monthKey =
      getCurrentMonthKey();

    if (
      monthKey <
      MONTHLY_TRACKING_START
    ) {
      return;
    }

    setMonthlyBackfills(
      (current) => {
        let changed = false;

        const next = {
          ...current,
        };

        luloProjects.forEach(
          (project) => {
            if (!project?.id) {
              return;
            }

            const projectKey =
              String(project.id);

            const existing =
              next[projectKey] ||
              {};

            if (
              Object.prototype.hasOwnProperty.call(
                existing,
                monthKey
              )
            ) {
              return;
            }

            const tracked =
              getTrackedLuloMonthEarnings(
                project,
                monthKey
              );

            const estimate =
              estimateLuloMonthToDate(
                project,
                now
              );

            const lifetimeInterest =
              Number(
                project.lulo_lifetime_interest_usd
              ) || 0;

            let targetMonthEarned =
              estimate;

            if (
              lifetimeInterest > 0
            ) {
              targetMonthEarned =
                Math.min(
                  estimate,
                  lifetimeInterest
                );
            }

            targetMonthEarned =
              Math.max(
                tracked,
                targetMonthEarned
              );

            const backfill =
              Math.max(
                0,
                targetMonthEarned -
                  tracked
              );

            next[projectKey] = {
              ...existing,
              [monthKey]:
                Number(
                  backfill.toFixed(
                    6
                  )
                ),
            };

            changed = true;
          }
        );

        return changed
          ? next
          : current;
      }
    );
  }, [luloProjects]);

  const syncLivePositions =
    useCallback(
      async () => {
        setSyncError("");

        const errors = [];

        try {
          const response =
            await projectsApi.accrueApyTransactions();

          const projects =
            Array.isArray(
              response?.data
            )
              ? response.data
              : [];

          setLuloProjects(
            projects.filter(
              (project) =>
                project?.yield_tracking ===
                "lulo_lending"
            )
          );
        } catch (error) {
          console.error(
            "Yield page Lulo sync failed:",
            error
          );

          errors.push(
            `Lulo: ${
              error?.message ||
              "sync failed"
            }`
          );

          try {
            const response =
              await projectsApi.getAll();

            const projects =
              Array.isArray(
                response?.data
              )
                ? response.data
                : [];

            setLuloProjects(
              projects.filter(
                (project) =>
                  project?.yield_tracking ===
                  "lulo_lending"
              )
            );
          } catch {
            setLuloProjects([]);
          }
        }

        try {
          const snapshot =
            await getRatexPtonycSnapshot();

          setRatexSnapshot(
            snapshot
          );
        } catch (error) {
          console.error(
            "Yield page RateX sync failed:",
            error
          );

          errors.push(
            `RateX: ${
              error?.message ||
              "sync failed"
            }`
          );

          setRatexSnapshot(
            null
          );
        }

        if (errors.length) {
          setSyncError(
            errors.join(" · ")
          );
        }
      },
      []
    );

  useEffect(() => {
    syncLivePositions();

    const timer =
      window.setInterval(
        syncLivePositions,
        60_000
      );

    return () =>
      window.clearInterval(
        timer
      );
  }, [syncLivePositions]);

  const projectCards =
    useMemo(() => {
      const autoProjects =
        luloProjects.map(
          createLuloProjectCard
        );

      const ratexProject =
        createRatexProjectCard(
          ratexSnapshot
        );

      const manualProjects =
        groupManualPositions(
          manualPositions
        );

      return [
        ...autoProjects,
        ...(ratexProject
          ? [ratexProject]
          : []),
        ...manualProjects,
      ];
    }, [
      luloProjects,
      ratexSnapshot,
      manualPositions,
    ]);

  const allAssets =
    useMemo(
      () =>
        projectCards.flatMap(
          (project) =>
            project.assets ||
            []
        ),
      [projectCards]
    );

  const monthlyEarnings =
    useMemo(
      () =>
        buildMonthlyEarnings(
          luloProjects,
          ratexSnapshot,
          monthlyBackfills
        ),
      [
        luloProjects,
        ratexSnapshot,
        monthlyBackfills,
      ]
    );

  const summary =
    useMemo(() => {
      const portfolioBalance =
        allAssets.reduce(
          (sum, asset) =>
            sum +
            (Number(
              asset.balance
            ) || 0),
          0
        );

      const annualYield =
        allAssets.reduce(
          (sum, asset) =>
            sum +
            (Number(
              asset.balance
            ) || 0) *
              (
                (Number(
                  asset.apy
                ) || 0) /
                100
              ),
          0
        );

      const weightedApy =
        portfolioBalance > 0
          ? allAssets.reduce(
              (sum, asset) =>
                sum +
                (Number(
                  asset.balance
                ) || 0) *
                  (Number(
                    asset.apy
                  ) || 0),
              0
            ) /
            portfolioBalance
          : 0;

      const totalEarned =
        projectCards.reduce(
          (sum, project) =>
            sum +
            (Number(
              project.earned
            ) || 0),
          0
        );

      return {
        portfolioBalance,
        weightedApy,
        annualYield,
        activePositions:
          projectCards.length,
        totalEarned,
      };
    }, [
      allAssets,
      projectCards,
    ]);

  function deletePosition(id) {
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

  function toggleProject(projectId) {
    setExpandedProjects(
      (current) => {
        const next =
          new Set(current);

        if (
          next.has(projectId)
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

  return (
    <div
      className="space-y-8"
      data-testid="yield-farming-page"
    >
      <section className="border-b border-border/50 pb-8">
        <div className="grid gap-x-12 gap-y-8 md:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Portfolio Balance"
            value={formatCurrency(
              summary.portfolioBalance
            )}
            icon={
              CircleDollarSign
            }
          />

          <Metric
            label="Total Earned"
            value={formatCurrency(
              summary.totalEarned
            )}
            icon={
              BadgeDollarSign
            }
          />

          <Metric
            label="Weighted APY"
            value={formatPercent(
              summary.weightedApy
            )}
            icon={
              Percent
            }
          />

          <Metric
            label="Estimated Annual Yield"
            value={formatCurrency(
              summary.annualYield
            )}
            icon={
              TrendingUp
            }
          />

          <Metric
            label="Active Positions"
            value={String(
              summary.activePositions
            )}
            icon={
              Layers3
            }
          />
        </div>

        <PortfolioAllocationBar
          projects={
            projectCards
          }
          totalBalance={
            summary.portfolioBalance
          }
        />
      </section>

      {syncError && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          One or more live positions could not refresh.
          {syncError
            ? ` ${syncError}`
            : ""}
        </div>
      )}

      <section className="space-y-4">
        {projectCards.length ===
        0 ? (
          <Card className="border-border/50 bg-card/70">
            <CardContent className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
              <CircleDollarSign className="mb-3 h-10 w-10 text-muted-foreground" />

              <p className="font-medium">
                No yield projects yet
              </p>

              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Live yield positions will appear here automatically.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {projectCards.map(
              (project) => (
                <ProjectCard
                  key={
                    project.id
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
                />
              )
            )}
          </div>
        )}
      </section>

      <MonthlyEarningsSection
        months={
          monthlyEarnings
        }
        selectedMonthKey={
          selectedMonthKey
        }
        onSelectMonth={
          setSelectedMonthKey
        }
      />
    </div>
  );
}

function ProjectCard({
  project,
  collapsed,
  onToggle,
  onDeletePosition,
  logo,
  onLogoChange,
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/45 shadow-sm">
      <button
        type="button"
        onClick={
          onToggle
        }
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-white/[0.02]"
      >
        <div className="flex min-w-0 items-center gap-3">
          <ProjectLogoButton
            platform={
              project.platform
            }
            logo={
              logo
            }
            onLogoChange={
              onLogoChange
            }
          />

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold">
                {
                  project.platform
                }
              </h3>

              {project.autoSynced && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-400">
                  <Wifi className="h-3 w-3" />
                  Live
                </span>
              )}
            </div>

            <div className="mt-0.5 text-xs text-muted-foreground">
              1 position
              {project.autoSynced &&
              project.lastSyncedAt
                ? ` · synced ${formatSyncTime(
                    project.lastSyncedAt
                  )}`
                : ""}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xl font-semibold tabular-nums">
            {formatCurrency(
              project.totalBalance
            )}
          </div>

          <div className="mt-0.5 text-xs text-emerald-400">
            {formatPercent(
              project.weightedApy
            )}{" "}
            weighted APY
          </div>
        </div>
      </button>

      {!collapsed && (
        <ProjectPositionsSection
          project={
            project
          }
          onDeletePosition={
            onDeletePosition
          }
        />
      )}
    </div>
  );
}

function ProjectLogoButton({
  platform,
  logo,
  onLogoChange,
}) {
  const inputId =
    `yield-logo-${String(
      platform ||
        "project"
    )
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )}`;

  function handleFile(event) {
    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    if (
      !file.type.startsWith(
        "image/"
      )
    ) {
      window.alert(
        "Please choose an image file."
      );
      return;
    }

    if (
      file.size >
      1.5 * 1024 * 1024
    ) {
      window.alert(
        "Logo must be smaller than 1.5 MB."
      );
      return;
    }

    const reader =
      new FileReader();

    reader.onload = () => {
      if (
        typeof reader.result ===
        "string"
      ) {
        onLogoChange(
          reader.result
        );
      }
    };

    reader.readAsDataURL(
      file
    );
  }

  return (
    <div
      className="shrink-0"
      onClick={(event) =>
        event.stopPropagation()
      }
      onKeyDown={(event) =>
        event.stopPropagation()
      }
    >
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={
          handleFile
        }
      />

      <label
        htmlFor={inputId}
        title={`Change ${platform} logo`}
        aria-label={`Change ${platform} logo`}
        className="flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-white/[0.04] text-xs font-bold tracking-tight transition hover:border-border hover:bg-white/[0.08]"
      >
        {logo ? (
          <img
            src={logo}
            alt={`${platform} logo`}
            className="h-full w-full object-cover"
          />
        ) : (
          getInitials(
            platform
          )
        )}
      </label>
    </div>
  );
}

function ProjectPositionsSection({
  project,
  onDeletePosition,
}) {
  return (
    <div className="border-t border-border/40 px-4 pb-4 pt-3">
      <div>
        {project.assets.map(
          (asset) => (
            <PositionRow
              key={
                asset.id
              }
              asset={
                asset
              }
              autoSynced={
                project.autoSynced
              }
              onDeletePosition={
                onDeletePosition
              }
            />
          )
        )}
      </div>
    </div>
  );
}

function PositionRow({
  asset,
  autoSynced,
  onDeletePosition,
}) {
  const yearly =
    (Number(
      asset.balance
    ) || 0) *
    (
      (Number(
        asset.apy
      ) || 0) /
      100
    );

  const monthly =
    yearly / 12;

  const daily =
    yearly / 365;

  return (
    <div className="grid grid-cols-[1.2fr_1.35fr_0.9fr] items-center gap-3 px-3 py-4 md:grid-cols-[1.2fr_1.25fr_1fr_1fr]">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-white/[0.04] text-[10px] font-bold">
          {getInitials(
            asset.asset
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">
              {asset.asset ||
                "Position"}
            </span>

            {!autoSynced &&
              asset.manualId && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  title="Delete position"
                  onClick={() =>
                    onDeletePosition(
                      asset.manualId
                    )
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
          </div>
        </div>
      </div>

      <div>
        <div className="font-semibold tabular-nums">
          {formatCurrency(
            asset.balance
          )}
        </div>
      </div>

      <div className="hidden md:block">
        {asset.price !==
        null &&
        asset.price !==
        undefined ? (
          <div className="font-medium tabular-nums">
            {formatCurrency(
              asset.price
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">
            —
          </span>
        )}
      </div>

      <div className="text-right">
        <div className="font-semibold text-emerald-400 tabular-nums">
          {formatPercent(
            asset.apy
          )}{" "}
          APY
        </div>

        <div className="mt-0.5 whitespace-nowrap text-[11px] text-muted-foreground tabular-nums">
          {asset.maturity ? (
            <>
              matures{" "}
              {new Date(
                asset.maturity
              ).toLocaleDateString(
                [],
                {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }
              )}

              {asset.daysRemaining !==
              null
                ? ` · ${asset.daysRemaining}d left`
                : ""}

              {asset.maturityValueUsd >
              0
                ? ` · ${formatCurrency(
                    asset.maturityValueUsd
                  )} at maturity`
                : ""}
            </>
          ) : (
            <>
              {formatCurrency(
                daily
              )}
              /day ·{" "}
              {formatCurrency(
                monthly
              )}
              /mo ·{" "}
              {formatCurrency(
                yearly
              )}
              /yr
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MonthlyEarningsSection({
  months,
  selectedMonthKey,
  onSelectMonth,
}) {
  const currentMonthKey =
    getCurrentMonthKey();

  const monthKeys =
    getMonthRange(
      MONTHLY_TRACKING_START,
      currentMonthKey
    );

  const monthMap =
    new Map(
      months.map(
        (month) => [
          month.monthKey,
          month,
        ]
      )
    );

  const chartMonths =
    monthKeys.map(
      (monthKey) =>
        monthMap.get(
          monthKey
        ) || {
          monthKey,
          total: 0,
          platforms: [],
        }
    );

  const maxAmount =
    Math.max(
      1,
      ...chartMonths.map(
        (month) =>
          Number(
            month.total
          ) || 0
      )
    );

  const selectedMonth =
    selectedMonthKey
      ? chartMonths.find(
          (month) =>
            month.monthKey ===
            selectedMonthKey
        )
      : null;

  const trackingTotal =
    chartMonths.reduce(
      (total, month) =>
        total +
        (Number(
          month.total
        ) || 0),
      0
    );

  return (
    <section className="space-y-4 border-t border-border/50 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />

            <h2 className="text-lg font-semibold">
              Monthly Earnings
            </h2>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            Yield income tracked from September 2026 forward.
          </p>
        </div>

        <div className="text-right">
          <div className="text-xs text-muted-foreground">
            Total tracked
          </div>

          <div className="mt-1 text-xl font-semibold tabular-nums text-emerald-400">
            {formatCurrency(
              trackingTotal
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/35 px-5 pb-5 pt-6">
        <div className="flex h-56 items-end gap-3 md:gap-6">
          {chartMonths.map(
            (month) => {
              const amount =
                Number(
                  month.total
                ) || 0;

              const height =
                amount > 0
                  ? Math.max(
                      12,
                      (
                        amount /
                        maxAmount
                      ) * 100
                    )
                  : 3;

              const isCurrent =
                month.monthKey ===
                currentMonthKey;

              return (
                <button
                  key={
                    month.monthKey
                  }
                  type="button"
                  onClick={() =>
                    onSelectMonth(
                      month.monthKey
                    )
                  }
                  className="group flex min-w-0 flex-1 flex-col items-center justify-end rounded-lg px-1 pt-1 outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                >
                  <div className="mb-2 min-h-6 whitespace-nowrap text-xs font-semibold tabular-nums text-foreground">
                    {formatCurrency(
                      amount
                    )}
                  </div>

                  <div className="flex h-36 w-full items-end justify-center">
                    <div
                      className={`w-full max-w-14 rounded-t-md transition-all duration-200 ${
                        amount > 0
                          ? "bg-emerald-400/75 group-hover:bg-emerald-400"
                          : "bg-white/[0.06] group-hover:bg-white/[0.10]"
                      }`}
                      style={{
                        height:
                          `${height}%`,
                      }}
                    />
                  </div>

                  <div className="mt-3 text-xs font-medium text-muted-foreground transition group-hover:text-foreground">
                    {formatShortMonth(
                      month.monthKey
                    )}
                  </div>

                  {isCurrent && (
                    <div className="mt-1 h-1 w-1 rounded-full bg-emerald-400" />
                  )}
                </button>
              );
            }
          )}
        </div>
      </div>

      {selectedMonth && (
        <MonthEarningsModal
          month={
            selectedMonth
          }
          onClose={() =>
            onSelectMonth(
              null
            )
          }
        />
      )}
    </section>
  );
}

function MonthEarningsModal({
  month,
  onClose,
}) {
  const total =
    Number(
      month.total
    ) || 0;

  useEffect(() => {
    function handleKeyDown(
      event
    ) {
      if (
        event.key ===
        "Escape"
      ) {
        onClose();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () =>
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(
        event
      ) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/50 px-5 py-5">
          <div>
            <div className="text-lg font-semibold">
              {formatMonthLabel(
                month.monthKey
              )}
            </div>

            <div className="mt-1 text-xs text-muted-foreground">
              {month.platforms.length}{" "}
              income{" "}
              {month.platforms.length ===
              1
                ? "source"
                : "sources"}
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="text-right">
              <div className="text-xs text-muted-foreground">
                Total earned
              </div>

              <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-400">
                {formatCurrency(
                  total
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={
                onClose
              }
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-5">
          {month.platforms.length ===
          0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No earnings were recorded for this month.
            </div>
          ) : (
            <div className="space-y-2">
              {month.platforms.map(
                (platform) => {
                  const share =
                    total > 0
                      ? (
                          platform.amount /
                          total
                        ) * 100
                      : 0;

                  return (
                    <div
                      key={
                        platform.platform
                      }
                      className="rounded-xl border border-border/50 bg-white/[0.02] px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-white/[0.04] text-[10px] font-bold">
                            {getInitials(
                              platform.platform
                            )}
                          </div>

                          <span className="truncate font-medium">
                            {
                              platform.platform
                            }
                          </span>
                        </div>

                        <span className="shrink-0 font-semibold tabular-nums">
                          {formatCurrency(
                            platform.amount
                          )}
                        </span>
                      </div>

                      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full bg-emerald-400/70"
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(
                                100,
                                share
                              )
                            )}%`,
                          }}
                        />
                      </div>

                      <div className="mt-1.5 text-right text-[10px] tabular-nums text-muted-foreground">
                        {share.toFixed(
                          1
                        )}
                        % of monthly earnings
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PortfolioAllocationBar({
  projects,
  totalBalance,
}) {
  const coinBalances =
    new Map();

  (projects || []).forEach(
    (project) => {
      (
        project.assets ||
        []
      ).forEach(
        (asset) => {
          const balance =
            Number(
              asset.balance
            ) || 0;

          if (
            balance <= 0
          ) {
            return;
          }

          const symbol =
            String(
              asset.allocationSymbol ||
                asset.asset ||
                "Other"
            ).trim() ||
            "Other";

          coinBalances.set(
            symbol,
            (
              coinBalances.get(
                symbol
              ) || 0
            ) +
              balance
          );
        }
      );
    }
  );

  const coins = [
    ...coinBalances.entries(),
  ]
    .map(
      ([
        symbol,
        balance,
      ]) => ({
        symbol,
        balance,
      })
    )
    .sort(
      (a, b) =>
        b.balance -
        a.balance
    );

  if (
    !coins.length ||
    !(
      Number(
        totalBalance
      ) > 0
    )
  ) {
    return null;
  }

  const fallbackClasses = [
    "bg-emerald-400",
    "bg-violet-400",
    "bg-rose-400",
    "bg-cyan-400",
    "bg-yellow-400",
    "bg-pink-400",
  ];

  const getCoinColor =
    (
      symbol,
      index
    ) => {
      const normalized =
        String(
          symbol
        ).toUpperCase();

      if (
        normalized ===
        "USDS"
      ) {
        return "bg-orange-400";
      }

      if (
        normalized ===
        "USDC"
      ) {
        return "bg-blue-400";
      }

      if (
        normalized ===
        "ONYC"
      ) {
        return "bg-yellow-400";
      }

      return fallbackClasses[
        index %
          fallbackClasses.length
      ];
    };

  return (
    <div className="mt-8">
      <div className="flex h-[3px] w-full overflow-hidden rounded-full bg-white/5">
        {coins.map(
          (
            coin,
            index
          ) => {
            const width =
              (
                coin.balance /
                Number(
                  totalBalance
                )
              ) * 100;

            return (
              <div
                key={
                  coin.symbol
                }
                className={`${getCoinColor(
                  coin.symbol,
                  index
                )} h-full`}
                style={{
                  width:
                    `${width}%`,
                }}
              />
            );
          }
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {coins.map(
          (
            coin,
            index
          ) => (
            <div
              key={
                coin.symbol
              }
              className="flex items-center gap-1.5"
            >
              <span
                className={`h-2 w-2 rounded-full ${getCoinColor(
                  coin.symbol,
                  index
                )}`}
              />

              <span>
                {
                  coin.symbol
                }
              </span>

              <span className="tabular-nums">
                {formatCurrency(
                  coin.balance
                )}
              </span>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span>
          {label}
        </span>

        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/5">
          <Icon
            className="h-3.5 w-3.5"
            strokeWidth={
              1.6
            }
          />
        </span>
      </div>

      <div className="mt-3 text-4xl font-semibold tracking-tight tabular-nums">
        {value}
      </div>
    </div>
  );
}
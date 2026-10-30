// Passive Income project cards, editors, and monthly-detail views.
// Preserves existing visuals and callbacks from the original page.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, CalendarDays, Lock, X, Trash2 } from "lucide-react";
import {
  formatCurrency,
  formatPercent,
  formatSyncTime,
  formatDate,
  getProjectIncomeLogo,
  getInitials,
  getTodayKey,
  getCurrentYear,
  getCurrentMonthKey,
  formatShortMonth,
  formatMonthLabel,
  getPaybackStats,
  MONTHLY_TRACKING_START
} from "@/lib/yieldFarmingAccounting";

function KryptexProjectCard({
  collapsed,
  onToggle,
  tracker,
  connected,
  stats,
  message,
  onRefresh,
  logo,
  onLogoChange,
  totalSpent,
  onTotalSpentChange,
  onDeactivate,
  todayUsd = 0,
}) {
  const isLive =
    Boolean(
      connected &&
      stats?.reachable
    );

  return (
    <div
      className="
        overflow-hidden
        rounded-2xl
        border
        border-border/60
        bg-[#0e1218]
        shadow-sm
        transition-all
        duration-200
        hover:border-border
        hover:bg-[#151e28]
      "
    >
      <button
        type="button"
        onClick={
          onToggle
        }
        className="flex w-full flex-col px-3.5 py-2.5 text-left"
      >
        <div className="flex w-full min-w-0 items-start gap-2">
          <ProjectLogoButton platform={"Kryptex"} logo={logo} onLogoChange={onLogoChange} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="min-w-0 truncate text-[12px] font-semibold">Kryptex</span>
              <span className={`shrink-0 text-[9px] ${isLive ? "text-emerald-400" : "text-amber-300"}`}>
                ● {isLive ? "Online" : "Offline"}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[14px] font-semibold tabular-nums">{formatCurrency(stats?.currentBalanceUsd)}</div>
          </div>
          <ChevronRight className={`mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground ${collapsed ? "rotate-90" : ""}`}/>
        </div>
      </button>

      {!collapsed && (
        <ProjectDetailsModal title={"Kryptex"} onClose={onToggle} projections={{ daily: stats?.dailyUsd, monthly: stats?.monthlyUsd, yearly: stats?.yearlyUsd }} onDeactivate={onDeactivate}>
        <div className="border-t border-border/50 px-5 py-5">
          <div className="mb-5">
            <ProjectPaybackEditor
              value={
                totalSpent
              }
              onChange={
                onTotalSpentChange
              }
              earned={
                stats?.lifetimeUsd
              }
              dailyIncome={
                stats?.dailyUsd
              }
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Current Balance
              </p>
              <p className="mt-1 font-semibold tabular-nums">
                {formatCurrency(
                  stats?.currentBalanceUsd
                )}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                This Month
              </p>
              <p className="mt-1 font-semibold tabular-nums">
                {formatCurrency(
                  stats?.monthUsd
                )}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Lifetime Earned
              </p>
              <p className="mt-1 font-semibold tabular-nums">
                {formatCurrency(
                  stats?.lifetimeUsd
                )}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Withdrawable
              </p>
              <p className="mt-1 font-semibold tabular-nums">
                {formatCurrency(
                  stats?.withdrawableUsd
                )}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Live Profitability
              </p>
              <p className="mt-1 font-semibold tabular-nums">
                {formatCurrency(
                  stats?.dailyUsd
                )}
                /day
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Last Synced
              </p>
              <p className="mt-1 font-semibold">
                {formatSyncTime(
                  stats?.lastSyncedAt
                )}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4">
            <p className="text-xs text-muted-foreground">
              {message ||
                (isLive
                  ? "Kryptex extension connected. Balance and mining profitability update automatically."
                  : "Start Kryptex Desktop and make sure the Kryptex extension is enabled.")}
            </p>

            <Button
              type="button"
              variant="outline"
              onClick={
                onRefresh
              }
            >
              Refresh
            </Button>
          </div>
        </div>
      </ProjectDetailsModal>
      )}
    </div>
  );
}

function IncomeProjection({
  daily = 0,
  monthly = 0,
  yearly = 0,
}) {
  return (
    <div className="mt-1 flex flex-wrap justify-end gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-muted-foreground">
      <span>
        {formatCurrency(daily)}/day
      </span>

      <span>·</span>

      <span>
        {formatCurrency(monthly)}/month
      </span>

      <span>·</span>

      <span>
        {formatCurrency(yearly)}/year
      </span>
    </div>
  );
}

function getLuloFiveDayAverage(project) {
  const todayKey = getTodayKey();
  const totalsByDay = new Map();

  const balance =
    Number(project?.totalBalance) ||
    Number(project?.lulo_total_balance_usd) ||
    0;

  const apy =
    Number(project?.weightedApy) ||
    Number(project?.lulo_weighted_apy) ||
    0;

  const expectedDailyIncome =
    balance * (apy / 100) / 365;

  const maximumValidDailyIncome = Math.max(
    2,
    expectedDailyIncome * 8 + 0.25
  );

  (Array.isArray(project?.transactions)
    ? project.transactions
    : []
  ).forEach((transaction) => {
    if (transaction?.source !== "lulo_yield") {
      return;
    }

    const dateKey = String(
      transaction.source_date ||
        transaction.date ||
        transaction.created_at ||
        ""
    ).slice(0, 10);

    const amount = Number(transaction.amount) || 0;

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dateKey) ||
      dateKey === todayKey ||
      amount <= 0
    ) {
      return;
    }

    totalsByDay.set(
      dateKey,
      (totalsByDay.get(dateKey) || 0) + amount
    );
  });

  const validDays = [...totalsByDay.entries()]
    .filter(([, amount]) => amount <= maximumValidDailyIncome)
    .sort(([firstDate], [secondDate]) =>
      secondDate.localeCompare(firstDate)
    )
    .slice(0, 5);

  if (!validDays.length) {
    return 0;
  }

  const totalEarned = validDays.reduce(
    (sum, [, amount]) => sum + amount,
    0
  );

  return totalEarned / validDays.length;
}

function getProjectProjections(project) {
  const isLulo =
    String(
      project?.platform || ""
    ).toLowerCase() === "lulo";

  if (isLulo) {
    const daily =
      Number(
        project?.luloFiveDayAverageUsd
      ) ||
      getLuloFiveDayAverage(project);

    return {
      daily,
      monthly: daily * 30.4375,
      yearly: daily * 365,
    };
  }

  const assets = Array.isArray(
    project?.assets
  )
    ? project.assets
    : [];

  const yearly = assets.reduce(
    (sum, asset) =>
      sum +
      (Number(asset?.balance) || 0) *
        ((Number(asset?.apy) || 0) / 100),
    0
  );

  return {
    daily: yearly / 365,
    monthly: yearly / 12,
    yearly,
  };
}

function ProjectPaybackStatus({
  earned,
  dailyIncome,
  totalSpent,
  compact = false,
}) {
  const stats =
    getPaybackStats(
      earned,
      dailyIncome,
      totalSpent
    );

  if (compact && !stats.configured) return null;

  if (
    !stats.configured
  ) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex rounded-full border border-border/60 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          P/L —
        </span>
        <span className="text-[11px] text-muted-foreground">
          Add spent to track break-even
        </span>
      </div>
    );
  }

  const profitable =
    stats.pnl >= 0;

  if (compact) return (
    <span className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums ${profitable ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400" : "border-amber-500/25 bg-amber-500/10 text-amber-300"}`}>
      P/L {stats.pnl >= 0 ? "+" : ""}{formatCurrency(stats.pnl)}
    </span>
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${
          profitable
            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
            : "border-amber-500/25 bg-amber-500/10 text-amber-300"
        }`}
        title={`Lifetime earned ${formatCurrency(
          stats.earned
        )} minus total spent ${formatCurrency(
          stats.spent
        )}`}
      >
        P/L {stats.pnl >= 0 ? "+" : ""}{formatCurrency(
          stats.pnl
        )}
      </span>

      <span
        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums ${
          profitable
            ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
            : "border-border/60 bg-white/[0.03] text-muted-foreground"
        }`}
      >
        {profitable
          ? "In profit"
          : stats.daysToProfit !== null
            ? `${stats.daysToProfit}d to profit`
            : "Break-even unavailable"}
      </span>
    </div>
  );
}

function ProjectPaybackEditor({
  value,
  onChange,
  earned,
  dailyIncome,
}) {
  const [
    draft,
    setDraft,
  ] = useState(
    value > 0
      ? String(value)
      : ""
  );

  useEffect(
    () => {
      setDraft(
        value > 0
          ? String(value)
          : ""
      );
    },
    [
      value,
    ]
  );

  const stats =
    getPaybackStats(
      earned,
      dailyIncome,
      value
    );

  function commit() {
    onChange(
      Math.max(
        0,
        Number(draft) || 0
      )
    );
  }

  return (
    <div className="rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Total spent
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Enter everything you have spent on this project. Update it whenever you buy more. P/L uses lifetime earnings, and the break-even estimate uses the current daily income.
          </p>

          {stats.configured && (
            <div className="mt-2 text-[11px] tabular-nums text-muted-foreground">
              Earned {formatCurrency(
                stats.earned
              )} · Remaining {formatCurrency(
                stats.remaining
              )}
            </div>
          )}
        </div>

        <div className="relative w-36 shrink-0">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            $
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={draft}
            onChange={(
              event
            ) =>
              setDraft(
                event.target.value
              )
            }
            onBlur={
              commit
            }
            onKeyDown={(
              event
            ) => {
              if (
                event.key ===
                "Enter"
              ) {
                event.currentTarget.blur();
              }
            }}
            placeholder="0.00"
            className="h-9 w-full rounded-lg border border-border/60 bg-background/60 pl-7 pr-3 text-right text-sm font-medium tabular-nums outline-none transition focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/10"
          />
        </div>
      </div>
    </div>
  );
}

function formatCompactSyncAge(value) {
  if (!value) return "Waiting";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Waiting";
  const mins = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function ProjectCard({
  project,
  collapsed,
  onToggle,
  onDeletePosition,
  logo,
  onLogoChange,
  totalSpent,
  onTotalSpentChange,
  onDeactivate,
  todayUsd = 0,
}) {
  const projections =
    getProjectProjections(
      project
    );

  const normalizedPlatform =
    String(
      project?.platform || ""
    ).toLowerCase();

  const isLulo =
    normalizedPlatform ===
    "lulo";

  const hidePayback =
    isLulo ||
    normalizedPlatform ===
      "loopscale";

  return (
    <div
      className="
        overflow-hidden
        rounded-2xl
        border
        border-border/60
        bg-[#0e1218]
        shadow-sm
        transition-all
        duration-200
        hover:border-border
        hover:bg-[#151e28]
      "
    >
      <button
        type="button"
        onClick={
          onToggle
        }
        className="flex w-full flex-col px-3.5 py-2.5 text-left"
      >
        <div className="flex w-full min-w-0 items-start gap-2">
          <ProjectLogoButton platform={project.platform} logo={logo} onLogoChange={onLogoChange} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="min-w-0 truncate text-[12px] font-semibold">{project.platform}</span>
              <span className={`shrink-0 text-[9px] ${project.autoSynced ? "text-emerald-400" : "text-amber-300"}`}>
                ● {project.autoSynced ? "Online" : "Offline"}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[14px] font-semibold tabular-nums">{formatCurrency(project.totalBalance)}</div>
          </div>
          <ChevronRight className={`mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground ${collapsed ? "rotate-90" : ""}`}/>
        </div>
      </button>

      {!collapsed && (
        <ProjectDetailsModal title={project.platform} onClose={onToggle} projections={{ daily: projections.daily, monthly: projections.monthly, yearly: projections.yearly }} onDeactivate={onDeactivate}>
        <>
          {!hidePayback && (
            <div className="border-t border-border/40 px-5 py-4">
              <ProjectPaybackEditor
                value={
                  totalSpent
                }
                onChange={
                  onTotalSpentChange
                }
                earned={
                  project.earned
                }
                dailyIncome={
                  projections.daily
                }
              />
            </div>
          )}

          <ProjectPositionsSection
            project={
              project
            }
            onDeletePosition={
              onDeletePosition
            }
          />
        </>
      </ProjectDetailsModal>
      )}
    </div>
  );
}


function UnetworkProjectCard({
  tracker,
  connected,
  stats,
  syncing,
  message,
  onRefresh,
  logo,
  onLogoChange,
  totalSpent,
  onTotalSpentChange,
  onDeactivate,
  todayUsd = 0,
}) {
  const [
    expanded,
    setExpanded,
  ] = useState(false);

  return (
    <div
      className="
        overflow-hidden
        rounded-2xl
        border
        border-border/60
        bg-[#0e1218]
        shadow-sm
        transition-all
        duration-200
        hover:border-border
        hover:bg-[#151e28]
      "
    >
      <button
        type="button"
        onClick={() =>
          setExpanded(
            (value) =>
              !value
          )
        }
        className="flex w-full flex-col px-3.5 py-2.5 text-left"
      >
        <div className="flex w-full min-w-0 items-start gap-2">
          <ProjectLogoButton platform={"Unetwork"} logo={logo} onLogoChange={onLogoChange} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="min-w-0 truncate text-[12px] font-semibold">Unetwork</span>
              <span className={`shrink-0 text-[9px] ${connected ? "text-emerald-400" : "text-amber-300"}`}>
                ● {connected ? "Online" : "Offline"}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[14px] font-semibold tabular-nums">{formatCurrency(stats?.currentBalance)}</div>
          </div>
          <ChevronRight className={`mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground ${expanded ? "rotate-90" : ""}`}/>
        </div>
      </button>

      {expanded && (
        <ProjectDetailsModal title={"Unetwork"} onClose={() => setExpanded(false)} onDeactivate={onDeactivate} projections={{ daily: stats?.estimatedDailyUsd, monthly: stats?.estimatedMonthlyUsd, yearly: stats?.estimatedYearlyUsd }}>
        <div className="border-t border-border/40 px-5 pb-5 pt-4">
          <div className="mb-4">
            <ProjectPaybackEditor
              value={
                totalSpent
              }
              onChange={
                onTotalSpentChange
              }
              earned={
                stats?.lifetimeUsd
              }
              dailyIncome={
                stats?.estimatedDailyUsd
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                This month
              </div>

              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatCurrency(
                  stats?.monthUsd
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Available + pending
              </div>

              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatCurrency(
                  stats?.currentBalance
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Lifetime earned
              </div>

              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatCurrency(
                  stats?.lifetimeUsd
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Withdrawn
              </div>

              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatCurrency(
                  stats?.withdrawals
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {message ||
                (connected
                  ? "Unetwork extension connected. Balance and dated rewards sync automatically."
                  : "Install the Unetwork Earnings Bridge, open Unetwork, and make sure you are signed in.")}
            </p>

            <Button
              type="button"
              variant="outline"
              onClick={
                onRefresh
              }
              disabled={
                syncing
              }
            >
              {syncing
                ? "Syncing..."
                : "Refresh"}
            </Button>
          </div>
        </div>
      </ProjectDetailsModal>
      )}
    </div>
  );
}

function SaladProjectCard({
  tracker,
  connected,
  stats,
  syncing,
  message,
  onRefresh,
  logo,
  onLogoChange,
  totalSpent,
  onTotalSpentChange,
  onDeactivate,
  todayUsd = 0,
}) {
  const [
    expanded,
    setExpanded,
  ] = useState(false);

  /*
   * Use the tracker projection directly so the Salad card
   * and the page-level income summary always agree.
   */
  const dailyIncome =
    Number(
      stats?.estimatedDailyUsd
    ) || 0;

  const monthlyIncome =
    Number(
      stats?.estimatedMonthlyUsd
    ) ||
    (
      dailyIncome *
      30.4375
    );

  const yearlyIncome =
    Number(
      stats?.estimatedYearlyUsd
    ) ||
    (
      dailyIncome *
      365
    );

  return (
    <div
      className="
        overflow-hidden
        rounded-2xl
        border
        border-border/60
        bg-[#0e1218]
        shadow-sm
        transition-all
        duration-200
        hover:border-border
        hover:bg-[#151e28]
      "
    >
      <button
        type="button"
        onClick={() =>
          setExpanded(
            (value) =>
              !value
          )
        }
        className="flex w-full flex-col px-3.5 py-2.5 text-left"
      >
        <div className="flex w-full min-w-0 items-start gap-2">
          <ProjectLogoButton platform={"Salad"} logo={logo} onLogoChange={onLogoChange} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="min-w-0 truncate text-[12px] font-semibold">Salad</span>
              <span className={`shrink-0 text-[9px] ${connected ? "text-emerald-400" : "text-amber-300"}`}>
                ● {connected ? "Online" : "Offline"}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[14px] font-semibold tabular-nums">{formatCurrency(stats?.currentBalance)}</div>
          </div>
          <ChevronRight className={`mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground ${expanded ? "rotate-90" : ""}`}/>
        </div>
      </button>

      {expanded && (
        <ProjectDetailsModal title={"Salad"} onClose={() => setExpanded(false)} onDeactivate={onDeactivate} projections={{ daily: dailyIncome, monthly: monthlyIncome, yearly: yearlyIncome }}>
        <div className="border-t border-border/40 px-5 pb-5 pt-4">
          <div className="mb-4">
            <ProjectPaybackEditor
              value={
                totalSpent
              }
              onChange={
                onTotalSpentChange
              }
              earned={
                stats?.lifetimeUsd
              }
              dailyIncome={
                dailyIncome
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                This month
              </div>

              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatCurrency(
                  stats?.monthUsd
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Available
              </div>

              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatCurrency(
                  stats?.currentBalance
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Lifetime earned
              </div>

              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatCurrency(
                  stats?.lifetimeUsd
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Withdrawn
              </div>

              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatCurrency(
                  stats?.withdrawals
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {message ||
                (connected
                  ? "Salad extension connected. Earnings sync without storing your Salad login in NAm."
                  : "Install the Salad Earnings Bridge, open Salad, and make sure you are signed in.")}
            </p>

            <Button
              type="button"
              variant="outline"
              onClick={
                onRefresh
              }
              disabled={
                syncing
              }
            >
              {syncing
                ? "Syncing..."
                : "Refresh"}
            </Button>
          </div>
        </div>
      </ProjectDetailsModal>
      )}
    </div>
  );
}

function RollerCoinProjectCard({
  tracker,
  stats,
  connected,
  authenticated,
  rollerCoinOpen,
  syncing,
  message,
  from,
  to,
  onFromChange,
  onToChange,
  onSync,
  onRefresh,
  logo,
  onLogoChange,
  totalSpent,
  onTotalSpentChange,
  onDeactivate,
  todayUsd = 0,
}) {
  const [
    expanded,
    setExpanded,
  ] = useState(false);


  const dailyIncome = 1;

const monthlyIncome =
  dailyIncome * 30.4375;

const yearlyIncome =
  dailyIncome * 365;

return (
  <div
    className="
      overflow-hidden
      rounded-2xl
      border
      border-border/60
      bg-[#0e1218]
      shadow-sm
      transition-all
      duration-200
      hover:border-border
      hover:bg-[#151e28]
    "
  >
    <button
      type="button"
      onClick={() =>
        setExpanded(
          (current) =>
            !current
        )
      }
      className="flex w-full flex-col px-3.5 py-2.5 text-left"
    >
        <div className="flex w-full min-w-0 items-start gap-2">
          <ProjectLogoButton platform={"RollerCoin"} logo={logo} onLogoChange={onLogoChange} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="min-w-0 truncate text-[12px] font-semibold">RollerCoin</span>
              <span className={`shrink-0 text-[9px] ${connected ? "text-emerald-400" : "text-amber-300"}`}>
                ● {connected ? "Online" : "Offline"}
              </span>
            </div>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 tabular-nums"><span className="text-[14px] font-semibold">{formatCurrency(stats?.currentBalanceUsd)}</span><span className="text-[10px] text-muted-foreground">{Number(stats?.currentTrxBalance || 0).toFixed(2)} TRX</span></div>
            {(!stats?.lastSyncedAt || Date.now() - Date.parse(stats.lastSyncedAt) > 2 * 60 * 60 * 1000) && (
              <div className="mt-0.5 text-[10px] text-amber-300">Earnings sync stale · balance may be cached</div>
            )}
          </div>
          <ChevronRight className={`mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground ${expanded ? "rotate-90" : ""}`}/>
        </div>
      </button>

    {expanded && (
        <ProjectDetailsModal title={"RollerCoin"} onClose={() => setExpanded(false)} onDeactivate={onDeactivate} projections={{ daily: dailyIncome, monthly: monthlyIncome, yearly: yearlyIncome }}>
      <div className="border-t border-border/40 px-5 py-4">
        <ProjectPaybackEditor
          value={
            totalSpent
          }
          onChange={
            onTotalSpentChange
          }
          earned={
            stats?.lifetimeUsd
          }
          dailyIncome={
            dailyIncome
          }
        />
      </div>
    </ProjectDetailsModal>
      )}
  </div>
);
}

function ProjectDetailsModal({ title, onClose, onDeactivate, projections, children }) {
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title} project details`}
        className="flex max-h-[min(740px,calc(100dvh-24px))] w-full max-w-[520px] min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="text-[11px] text-muted-foreground">Project details</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onDeactivate && (
              <button type="button" onClick={() => { onDeactivate(); onClose(); }} className="rounded-md border border-border/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground">Set inactive</button>
            )}
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title} details`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
          {projections && <div className="grid grid-cols-3 gap-2 border-b border-border/50 px-4 py-3">
            {[["Daily",projections.daily],["Monthly",projections.monthly],["Yearly",projections.yearly]].map(([label,value])=><div key={label} className="min-w-0 rounded-lg bg-white/[0.03] p-2"><p className="text-[10px] text-muted-foreground">{label} estimate</p><p className="mt-1 truncate text-xs font-semibold tabular-nums" title={formatCurrency(value)}>{formatCurrency(value)}</p></div>)}
          </div>}
          {children}
        </div>
      </div>
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

  function handleFile(
    event
  ) {
    const file =
      event.target
        .files?.[0];

    event.target.value =
      "";

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
      1.5 *
        1024 *
        1024
    ) {
      window.alert(
        "Logo must be smaller than 1.5 MB."
      );

      return;
    }

    const reader =
      new FileReader();

    reader.onload =
      () => {
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
      onClick={(
        event
      ) =>
        event.stopPropagation()
      }
      onKeyDown={(
        event
      ) =>
        event.stopPropagation()
      }
    >
      <input
        id={
          inputId
        }
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={
          handleFile
        }
      />

      <label
        htmlFor={
          inputId
        }
        title={`Change ${platform} logo`}
        aria-label={`Change ${platform} logo`}
        className="
          flex
          h-9
          w-9
          cursor-pointer
          items-center
          justify-center
          overflow-hidden
          rounded-2xl
          border
          border-border/60
          bg-white/[0.04]
          text-base
          font-bold
          tracking-tight
          transition
          hover:border-border
          hover:bg-white/[0.08]
        "
      >
        {logo ? (
          <img
            src={
              logo
            }
            alt={`${platform} logo`}
            className="
              h-full
              w-full
              object-cover
            "
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
    (
      Number(
        asset.balance
      ) || 0
    ) *
    (
      (
        Number(
          asset.apy
        ) || 0
      ) /
      100
    );

  const monthly =
    yearly /
    12;

  const daily =
    yearly /
    365;

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
              {formatDate(
                asset.maturity
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

function ProjectIncomeSection({
  months,
  expenses,
  onExpenseChange,
  selectedMonthKey,
  onSelectMonth,
  selectedYear,
  onSelectYear,
  saladTracker,
  projectLogos,
}) {
  const currentYear =
    getCurrentYear();

  const currentMonthKey =
    getCurrentMonthKey();

  const firstTrackingYear =
    Number(
      MONTHLY_TRACKING_START.slice(
        0,
        4
      )
    );

  const yearMonths =
    Array.from(
      {
        length: 12,
      },
      (
        _,
        index
      ) =>
        `${selectedYear}-${String(
          index + 1
        ).padStart(
          2,
          "0"
        )}`
    ).filter(
      (monthKey) => {
        if (
          monthKey <
          MONTHLY_TRACKING_START
        ) {
          return false;
        }

        if (
          selectedYear ===
          currentYear
        ) {
          return (
            monthKey <=
            currentMonthKey
          );
        }

        return true;
      }
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
    yearMonths.map(
      (monthKey) => {
        const incomeMonth =
          monthMap.get(
            monthKey
          ) || {
            monthKey,
            total: 0,
            platforms: [],
            locked:
              monthKey <
              currentMonthKey,
          };

        return {
          ...incomeMonth,
          expense:
            Math.max(
              0,
              Number(
                expenses?.[
                  monthKey
                ]
              ) || 0
            ),
        };
      }
    );

  const maxAmount =
    Math.max(
      1,
      ...chartMonths.flatMap(
        (month) => [
          Number(
            month.total
          ) || 0,
          Number(
            month.expense
          ) || 0,
        ]
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

  const yearlyTotal =
    chartMonths.reduce(
      (
        total,
        month
      ) =>
        total +
        (
          Number(
            month.total
          ) || 0
        ),
      0
    );

  const yearlyExpenses =
    chartMonths.reduce(
      (
        total,
        month
      ) =>
        total +
        (
          Number(
            month.expense
          ) || 0
        ),
      0
    );

  function moveYear(
    direction
  ) {
    const targetYear =
      selectedYear +
      direction;

    if (
      targetYear <
        firstTrackingYear ||
      targetYear >
        currentYear
    ) {
      return;
    }

    onSelectMonth(
      null
    );

    onSelectYear(
      targetYear
    );
  }

  return (
    <section className="space-y-2 rounded-2xl border border-[#252a32] bg-[#0b1017] p-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />

            <h2 className="text-[15px] font-semibold">
              Project Income
            </h2>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            Income earned across all tracked projects. Completed months are automatically locked.
          </p>

        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-8 items-center overflow-hidden rounded-lg border border-border/50 bg-white/[0.02]">
            <button
              type="button"
              onClick={() =>
                moveYear(
                  -1
                )
              }
              disabled={
                selectedYear <=
                firstTrackingYear
              }
              className="flex h-full w-8 items-center justify-center text-muted-foreground transition hover:bg-white/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-25"
              aria-label="Previous year"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex h-full min-w-[65px] items-center justify-center border-x border-border/50 px-3 text-xs font-semibold tabular-nums">
              {selectedYear}
            </div>

            <button
              type="button"
              onClick={() =>
                moveYear(
                  1
                )
              }
              disabled={
                selectedYear >=
                currentYear
              }
              className="flex h-full w-8 items-center justify-center text-muted-foreground transition hover:bg-white/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-25"
              aria-label="Next year"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="text-right">
            <div className="text-xs text-muted-foreground">
              {selectedYear} total
            </div>

            <div className="mt-0.5 text-[16px] font-semibold tabular-nums text-emerald-400">
              {formatCurrency(
                yearlyTotal
              )}
            </div>

            <div className="mt-0.5 text-[11px] font-medium tabular-nums text-rose-400">
              Expenses {formatCurrency(
                yearlyExpenses
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/35 px-2.5 pb-2 pt-2.5">
        {chartMonths.length ===
        0 ? (
          <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
            No tracked months for this year.
          </div>
        ) : (
          <div className="flex h-[clamp(112px,17vh,148px)] items-end gap-1 md:gap-2">
            {chartMonths.map(
              (month) => {
                const amount =
                  Number(
                    month.total
                  ) || 0;

                const expense =
                  Number(
                    month.expense
                  ) || 0;

                const incomeHeight =
                  amount > 0
                    ? Math.max(
                        12,
                        (
                          amount /
                          maxAmount
                        ) *
                          100
                      )
                    : 3;

                const expenseHeight =
                  expense > 0
                    ? Math.max(
                        12,
                        (
                          expense /
                          maxAmount
                        ) *
                          100
                      )
                    : 3;

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
                    className="group flex min-w-0 flex-1 flex-col items-center justify-end rounded-lg px-0.5 pt-1 outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                  >
                    <div className="flex h-[clamp(84px,12vh,112px)] w-full items-end justify-center gap-1 md:gap-1.5">
                      <div className="flex h-full w-[44%] max-w-10 flex-col items-center justify-end">
                        <div className="mb-1 flex min-h-6 items-end justify-center gap-1 whitespace-nowrap text-[10px] font-semibold tabular-nums text-emerald-400 md:text-[11px]">
                          {formatCurrency(
                            amount
                          )}

                          {month.locked && (
                            <Lock className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                          )}
                        </div>

                        <div
                          className={`w-full rounded-t-md transition-all duration-200 ${
                            amount >
                            0
                              ? month.locked
                                ? "bg-emerald-400/45 group-hover:bg-emerald-400/65"
                                : "bg-emerald-400/75 group-hover:bg-emerald-400"
                              : "bg-white/[0.06] group-hover:bg-white/[0.10]"
                          }`}
                          style={{
                            height:
                              `${incomeHeight}%`,
                          }}
                          title={`Income: ${formatCurrency(
                            amount
                          )}`}
                        />
                      </div>

                      <div className="flex h-full w-[44%] max-w-10 flex-col items-center justify-end">
                        <div className="mb-1 flex min-h-6 items-end justify-center whitespace-nowrap text-[10px] font-semibold tabular-nums text-rose-400 md:text-[11px]">
                          {formatCurrency(
                            expense
                          )}
                        </div>

                        <div
                          className={`w-full rounded-t-md transition-all duration-200 ${
                            expense > 0
                              ? "bg-rose-500/75 group-hover:bg-rose-500"
                              : "bg-rose-500/10 group-hover:bg-rose-500/20"
                          }`}
                          style={{
                            height:
                              `${expenseHeight}%`,
                          }}
                          title={`Expenses: ${formatCurrency(
                            expense
                          )}`}
                        />
                      </div>
                    </div>

                    <div className="mt-1.5 text-[10px] font-medium text-muted-foreground transition group-hover:text-foreground md:text-xs">
                      {formatShortMonth(
                        month.monthKey
                      )}
                    </div>
                  </button>
                );
              }
            )}
          </div>
        )}
      </div>

      {selectedMonth && (
        <ProjectIncomeModal
          month={
            selectedMonth
          }
          expense={
            Number(
              selectedMonth.expense
            ) || 0
          }
          onExpenseChange={
            onExpenseChange
          }
          projectLogos={
            projectLogos
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

function ProjectIncomeModal({
  month,
  expense,
  onExpenseChange,
  projectLogos,
  onClose,
}) {
  const total =
    Number(
      month.total
    ) || 0;

  const [
    expenseInput,
    setExpenseInput,
  ] = useState(
    String(
      Number(
        expense
      ) || ""
    )
  );

  useEffect(
    () => {
      setExpenseInput(
        String(
          Number(
            expense
          ) || ""
        )
      );
    },
    [
      expense,
      month.monthKey,
    ]
  );

  useEffect(
    () => {
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
    },
    [
      onClose,
    ]
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-4"
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
        className="flex max-h-[min(680px,calc(100dvh-24px))] w-full max-w-[440px] min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-2xl sm:max-h-[min(680px,calc(100dvh-32px))]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-base font-semibold">
                {formatMonthLabel(
                  month.monthKey
                )}
              </div>

              {month.locked && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  Final
                </span>
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

          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-[11px] text-muted-foreground">
                Project income
              </div>

              <div className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-400">
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
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain p-3 [scrollbar-width:thin] sm:p-4">
          <div className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/[0.05] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">
                  Monthly expenses
                </div>

                <div className="mt-0.5 max-w-[225px] text-[11px] leading-snug text-muted-foreground">
                  Equipment, fees, electricity and other project costs.
                </div>
              </div>

              <div className="w-28 shrink-0 sm:w-32">
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Expense total
                </label>

                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={
                    expenseInput
                  }
                  placeholder="0.00"
                  onChange={(
                    event
                  ) =>
                    setExpenseInput(
                      event.target.value
                    )
                  }
                  onBlur={() =>
                    onExpenseChange(
                      month.monthKey,
                      expenseInput
                    )
                  }
                  onKeyDown={(
                    event
                  ) => {
                    if (
                      event.key ===
                      "Enter"
                    ) {
                      event.preventDefault();

                      onExpenseChange(
                        month.monthKey,
                        expenseInput
                      );

                      event.currentTarget.blur();
                    }
                  }}
                  className="h-8 text-right text-sm tabular-nums"
                />
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-rose-500/15 pt-2 text-xs">
              <span className="text-muted-foreground">
                Net project income
              </span>

              <span
                className={`font-semibold tabular-nums ${
                  total -
                    (
                      Number(
                        expenseInput
                      ) || 0
                    ) >=
                  0
                    ? "text-emerald-400"
                    : "text-rose-400"
                }`}
              >
                {formatCurrency(
                  total -
                    (
                      Number(
                        expenseInput
                      ) || 0
                    )
                )}
              </span>
            </div>
          </div>

          {month.platforms.length ===
          0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No project income was recorded for this month.
            </div>
          ) : (
            <div className="space-y-1.5">
              {month.platforms.map(
                (
                  platform
                ) => {
                  const share =
                    total >
                    0
                      ? (
                          platform.amount /
                          total
                        ) *
                        100
                      : 0;

                  return (
                    <div
                      key={
                        platform.platform
                      }
                      className="rounded-lg border border-border/50 bg-white/[0.02] px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          {getProjectIncomeLogo(
                            platform.platform,
                            projectLogos
                          ) ? (
                            <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full border border-border/60 bg-white/[0.04]">
                              <img
                                src={
                                  getProjectIncomeLogo(
                                    platform.platform,
                                    projectLogos
                                  )
                                }
                                alt={`${platform.platform} logo`}
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-white/[0.04] text-[10px] font-bold">
                              {getInitials(
                                platform.platform
                              )}
                            </div>
                          )}

                          <span className="truncate text-sm font-medium">
                            {
                              platform.platform
                            }
                          </span>
                        </div>

                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {formatCurrency(
                            platform.amount
                          )}
                        </span>
                      </div>

                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
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

                      <div className="mt-1 text-right text-[10px] tabular-nums text-muted-foreground">
                        {share.toFixed(
                          1
                        )}
                        % of project income
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

function Metric({ label, value, icon: Icon }) {
  return (
    <div className="flex min-w-0 flex-col justify-center rounded-xl border border-[#2a3039] bg-[#0e141c] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
        <span className="leading-snug">{label}</span>
      </div>
      <div className="mt-1.5 min-w-0 text-[clamp(16px,1.4vw,21px)] font-semibold leading-tight tracking-tight tabular-nums break-words" title={value}>
        {value}
      </div>
    </div>
  );
}

export {
  KryptexProjectCard,
  IncomeProjection,
  getLuloFiveDayAverage,
  getProjectProjections,
  ProjectPaybackStatus,
  ProjectPaybackEditor,
  formatCompactSyncAge,
  ProjectCard,
  UnetworkProjectCard,
  SaladProjectCard,
  RollerCoinProjectCard,
  ProjectDetailsModal,
  ProjectLogoButton,
  ProjectPositionsSection,
  PositionRow,
  ProjectIncomeSection,
  ProjectIncomeModal,
  Metric
};

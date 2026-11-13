import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays, ChartNoAxesCombined, ChevronRight, Coins, Cpu, Home, Layers3,
  Plus, Target, TrendingUp, Zap, X,
} from "lucide-react";
import { api, settingsApi } from "@/lib/apiClient";
import { remoteStorage, subscribe } from "@/lib/serverStore";
import { localStorage as appStorage } from "@/lib/localStorage";
import { getStoredProjectCryptoPortfolio } from "@/lib/projectCryptoPortfolio";
import { hasFreeMiningPower, outOfPocketMiningPowerCost } from "@/lib/powerOutOfPocket";
import YieldFarmingPage from "@/pages/YieldFarmingPage";
import MonthlyChangesPage from "@/pages/MonthlyChangesPage";
import { useBackendMonthlyIncome } from "@/hooks/useBackendMonthlyIncome";
import { mergeBackendLoopscaleHistory } from "@/lib/mergeBackendLoopscaleHistory";
import { mergeManualIncome } from "@/lib/manualIncomeHistory";
import { STOCK_DIVIDEND_PAYOUTS_KEY } from "@/lib/stockDividendPayouts";
import { buildIncomeHistory, legacyProjectIncome, reconcileLuloIncome } from "@/lib/incomeHistory";
import {
  buildProjectIncome,
  formatCurrency,
  getCurrentMonthKey,
  getEffectiveProjectIncome,
  getTodayKey,
  getKryptexStats,
  getRollerCoinTrackerStats,
  getSaladTrackerStats,
  getUnetworkTrackerStats,
  groupManualPositions,
  loadKryptexTracker,
  loadLoopscaleHistory,
  loadMonthlyBackfills,
  loadMonthlySnapshots,
  loadPositions,
  loadProjectPayback,
  saveProjectPayback,
  loadRollerCoinTracker,
  loadSaladTracker,
  loadUnetworkTracker,
  PROJECT_QUICK_CACHE_KEY,
  readObject,
} from "@/lib/yieldFarmingAccounting";

const panel = "rounded-2xl border border-[#242b33] bg-[#0d1014] shadow-[0_12px_36px_rgba(0,0,0,0.16)]";
const POWER_SETTINGS_KEY = "mining_power_dashboard_v1";
const HARDWARE_KEY = "hardware_payback_devices_v1";
const TOD_EFFECTIVE_AT = new Date("2026-12-10T00:00:00-08:00");
const TOD_EFFECTIVE_MONTH = "2026-12";
const POWER_DEFAULTS = {
  dailyRevenueUsd: 3.55,
  offPeakRate: 0.0893,
  midPeakRate: 0.1670,
  peakRate: 0.4313,
  basicRate: 0.1691,
};
const GPU_META = {
  rtx5070: { image: "/gpu/rtx5070-msi.webp", brand: "MSI" },
  rtx2080super: { image: "/gpu/rtx2080-super.webp", brand: "GIGABYTE" },
};

const money = value => formatCurrency(Number(value) || 0);
const percent = value => `${Math.max(0, Math.min(999, Number(value) || 0)).toFixed(0)}%`;

function pacificParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", weekday: "short", hour: "2-digit", hour12: false,
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

function currentRate(settings, date = new Date()) {
  if (date < TOD_EFFECTIVE_AT) return { rate: Number(settings.basicRate) || 0, label: "Basic" };
  const parts = pacificParts(date);
  if (["Sat", "Sun"].includes(parts.weekday)) return { rate: Number(settings.offPeakRate) || 0, label: "Off-peak" };
  const hour = Number(parts.hour) % 24;
  if (hour >= 17 && hour < 21) return { rate: Number(settings.peakRate) || 0, label: "Peak" };
  if (hour >= 21 || hour < 7) return { rate: Number(settings.offPeakRate) || 0, label: "Off-peak" };
  return { rate: Number(settings.midPeakRate) || 0, label: "Mid-peak" };
}

function usageCost(usage, settings, monthKey) {
  const tiers = usage?.tiers || {};
  const totalKwh = Number(usage?.totalKwh ?? usage?.kwh) || 0;
  if (monthKey && monthKey < TOD_EFFECTIVE_MONTH) return totalKwh * (Number(settings.basicRate) || 0);
  return (Number(tiers.basic) || 0) * (Number(settings.basicRate) || 0)
    + (Number(tiers.offPeak) || 0) * (Number(settings.offPeakRate) || 0)
    + (Number(tiers.midPeak) || 0) * (Number(settings.midPeakRate) || 0)
    + (Number(tiers.peak) || 0) * (Number(settings.peakRate) || 0);
}

function readHardware() {
  try {
    const value = JSON.parse(remoteStorage.getItem(HARDWARE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function buildDailyIncomeHistory({ luloProjects, loopscaleHistory, saladTracker, rollerTracker, unetworkTracker, kryptexTracker }) {
  const totals = new Map();
  const add = (date, amount) => {
    const day = String(date || "").slice(0, 10);
    const value = Number(amount) || 0;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || value <= 0) return;
    totals.set(day, (totals.get(day) || 0) + value);
  };

  Object.entries(saladTracker?.daily || {}).forEach(([day, amount]) => add(day, amount));

  Object.entries(unetworkTracker?.daily || {}).forEach(([day, entry]) =>
    add(day, typeof entry === "number" ? entry : entry?.usd)
  );

  const rollerDays = new Set([
    ...Object.keys(rollerTracker?.daily || {}),
    ...Object.keys(rollerTracker?.walletDaily || {}),
  ]);
  rollerDays.forEach(day => {
    const wallet = rollerTracker?.walletDaily?.[day];
    const mined = rollerTracker?.daily?.[day];
    add(day, wallet ? wallet?.usd : mined?.usd);
  });

  Object.entries(kryptexTracker?.kryptexMiningDaily || {}).forEach(([day, amount]) => {
    if (kryptexTracker?.kryptexConfirmedDays?.[day]) add(day, amount);
  });

  Object.values(loopscaleHistory?.positions || {}).forEach(position => {
    Object.entries(position?.observedDaily || {}).forEach(([day, amount]) => add(day, amount));
  });

  (luloProjects || []).forEach(project => {
    (project?.transactions || []).forEach(transaction => {
      if (transaction?.source !== "lulo_yield") return;
      add(transaction?.source_date || transaction?.date || transaction?.created_at, transaction?.amount);
    });
  });

  return [...totals.entries()]
    .map(([date, income]) => ({ date, income: Number(income.toFixed(6)) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function readRecordedHistory() {
  let legacyProjects = [];
  try {
    const saved = JSON.parse(remoteStorage.getItem("networth_projects") || "[]");
    if (Array.isArray(saved)) legacyProjects = saved;
  } catch { /* Keep other recorded income available. */ }
  return {
    legacyProjects,
    luloProjects: (readObject(PROJECT_QUICK_CACHE_KEY).projects || []).filter(project => project?.yield_tracking === "lulo_lending"),
    loopscale: loadLoopscaleHistory(), salad: loadSaladTracker(), rollercoin: loadRollerCoinTracker(),
    unetwork: loadUnetworkTracker(), kryptex: loadKryptexTracker(),
    backfills: loadMonthlyBackfills(), snapshots: loadMonthlySnapshots(),
    payouts: readObject(STOCK_DIVIDEND_PAYOUTS_KEY),
    manualIncome: {},
    luloBackfills: {},
  };
}

function readIncomeData() {
  const quick = readObject(PROJECT_QUICK_CACHE_KEY);
  const lulo = (quick.projects || []).filter(project => project?.yield_tracking === "lulo_lending");
  const saladTracker = loadSaladTracker();
  const rollerTracker = loadRollerCoinTracker();
  const unetworkTracker = loadUnetworkTracker();
  const kryptexTracker = loadKryptexTracker();
  const loopscaleHistory = loadLoopscaleHistory();
  const months = buildProjectIncome(
    lulo,
    loopscaleHistory,
    saladTracker,
    loadMonthlyBackfills(),
    rollerTracker,
    unetworkTracker,
    kryptexTracker,
  );
  const manual = groupManualPositions(loadPositions());
  const salad = getSaladTrackerStats(saladTracker);
  const roller = getRollerCoinTrackerStats(rollerTracker);
  const unetwork = getUnetworkTrackerStats(unetworkTracker);
  const kryptex = getKryptexStats(kryptexTracker);
  const luloBalance = lulo.reduce((sum, project) => sum + (Number(project?.lulo_total_balance_usd) || 0), 0);
  const luloApyWeighted = luloBalance > 0
    ? lulo.reduce((sum, project) => sum + (Number(project?.lulo_total_balance_usd) || 0) * (Number(project?.lulo_weighted_apy) || 0), 0) / luloBalance
    : 0;
  const loopscaleSnapshot = quick.loopscaleSnapshot || null;
  const loopscaleBalance = Number(loopscaleSnapshot?.positionValueUsd) || 0;
  const loopscaleApy = Number(loopscaleSnapshot?.netApy) || 0;
  const projects = [
    ...manual.map(project => ({
      id: project.id,
      name: project.platform,
      earned: Number(project.earned) || 0,
      balance: Number(project.totalBalance) || 0,
      roi: Number(project.weightedApy) || 0,
      daily: (Number(project.totalBalance) || 0) * (Number(project.weightedApy) || 0) / 100 / 365,
    })),
    {
      id: "lulo-live",
      name: "Lulo",
      earned: lulo.reduce((sum, project) => sum + (Number(project?.lulo_lifetime_interest_usd) || 0), 0),
      balance: luloBalance,
      roi: luloApyWeighted,
      daily: luloBalance * luloApyWeighted / 100 / 365,
    },
    {
      id: "loopscale-live",
      name: "Loopscale",
      earned: Number(loopscaleSnapshot?.pnlUsd) || 0,
      balance: loopscaleBalance,
      roi: loopscaleApy,
      daily: loopscaleBalance * loopscaleApy / 100 / 365,
    },
    {
      id: "salad-project",
      name: "Salad",
      earned: salad.lifetimeUsd,
      balance: Number(salad.currentBalance) || 0,
      roi: Number(salad.currentBalance) > 0 ? (Number(salad.estimatedDailyUsd) || 0) * 365 / Number(salad.currentBalance) * 100 : 0,
      daily: salad.estimatedDailyUsd,
    },
    {
      id: "rollercoin-project",
      name: "RollerCoin",
      earned: roller.lifetimeUsd,
      balance: Number(roller.currentBalanceUsd) || 0,
      roi: Number(roller.currentBalanceUsd) > 0 ? (Number(roller.todayUsd) || 0) * 365 / Number(roller.currentBalanceUsd) * 100 : 0,
      daily: Math.max(0, Number(roller.todayUsd) || 0),
    },
    {
      id: "unetwork-project",
      name: "Unetwork",
      earned: unetwork.lifetimeUsd,
      balance: Number(unetwork.currentBalance) || 0,
      roi: Number(unetwork.currentBalance) > 0 ? (Number(unetwork.estimatedDailyUsd) || 0) * 365 / Number(unetwork.currentBalance) * 100 : 0,
      daily: unetwork.estimatedDailyUsd,
    },
    {
      id: "kryptex-project",
      name: "Kryptex",
      earned: kryptex.lifetimeUsd,
      balance: Number(kryptex.currentBalanceUsd) || 0,
      roi: Number(kryptex.currentBalanceUsd) > 0 ? (Number(kryptex.dailyUsd) || 0) * 365 / Number(kryptex.currentBalanceUsd) * 100 : 0,
      daily: kryptex.dailyUsd,
    },
  ];
  const payback = loadProjectPayback();
  return {
    months,
    dailyHistory: buildDailyIncomeHistory({
      luloProjects: lulo,
      loopscaleHistory,
      saladTracker,
      rollerTracker,
      unetworkTracker,
      kryptexTracker,
    }),
    projects: projects.map(project => ({
      ...project,
      earned: Math.max(0, Number(project.earned) || 0),
      daily: Math.max(0, Number(project.daily) || 0),
      spent: Number(payback[project.id]?.totalSpent) || 0,
    })),
  };
}

const KRYPTEX_PAYBACK_LEDGER = "kryptex-confirmed-v2";

function canonicalSourceName(source) {
  const value = String(source || "").trim().replace(/\s+/g, " ");
  const normalized = value.toLowerCase();
  if (["unity network", "unitynetwork", "unetwork"].includes(normalized)) return "Unetwork";
  if (normalized === "roller coin") return "RollerCoin";
  return value;
}

function pacificDayKey(time) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(time)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function monthPosition(time) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(time)).map(part => [part.type, Number(part.value)]));
  const days = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
  return parts.year * 12 + parts.month - 1 +
    (parts.day - 1 + (parts.hour + parts.minute / 60 + parts.second / 3600) / 24) / days;
}

function confirmedKryptexIncome(tracker, startDay, endDay) {
  return Object.entries(tracker?.kryptexMiningDaily || {}).reduce((sum, [day, value]) =>
    day >= startDay && day <= endDay && tracker?.kryptexConfirmedDays?.[day]
      ? sum + Math.max(0, Number(value) || 0)
      : sum, 0);
}

function confirmedKryptexIncomeByMonth(tracker, startMonth, endMonth) {
  return Object.entries(tracker?.kryptexMiningDaily || {}).reduce((sum, [day, value]) => {
    const month = day.slice(0, 7);
    return month >= startMonth && month <= endMonth && tracker?.kryptexConfirmedDays?.[day]
      ? sum + Math.max(0, Number(value) || 0)
      : sum;
  }, 0);
}

function hardwareEarningsByDevice(devices, currentMonth, tracker, now = Date.now()) {
  const costsBySource = devices.reduce((totals, device) => {
    const source = canonicalSourceName(device.source);
    if (source) totals[source] = (totals[source] || 0) + (Number(device.cost) || 0);
    return totals;
  }, {});

  return Object.fromEntries(devices.map(device => {
    const source = canonicalSourceName(device.source);
    const checkpoint = device.checkpoint;
    if (!checkpoint || !source) return [device.id, 0];

    if (source === "Kryptex") {
      if (checkpoint.ledger !== KRYPTEX_PAYBACK_LEDGER) return [device.id, 0];

      const sourceCost = costsBySource[source] || 0;
      if (!sourceCost) return [device.id, 0];

      const allocation = (Number(device.cost) || 0) / sourceCost;
      const powerStart = device.powerStartTime || checkpoint.time;
      const power = Math.max(0, monthPosition(now) - monthPosition(powerStart)) * (Number(device.power) || 0);

      if (device.earningsStartDay) {
        const accrued = confirmedKryptexIncome(tracker, device.earningsStartDay, pacificDayKey(now));
        return [device.id, Math.max(0, accrued * allocation - power)];
      }

      const income = confirmedKryptexIncomeByMonth(tracker, checkpoint.month, currentMonth);
      const today = pacificDayKey(now);
      const checkpointDay = pacificDayKey(checkpoint.time);
      if (checkpointDay === today) {
        const todayIncome = tracker?.kryptexConfirmedDays?.[today]
          ? Math.max(0, Number(tracker?.kryptexMiningDaily?.[today]) || 0)
          : 0;
        return [device.id, Math.max(0, todayIncome * allocation - power)];
      }

      return [device.id, Math.max(0,
        (Number(checkpoint.carried) || 0) +
        Math.max(0, income - (Number(checkpoint.baseline) || 0)) * allocation -
        power
      )];
    }

    return [device.id, Math.max(0, Number(checkpoint.carried) || 0)];
  }));
}

function KpiCard({ icon: Icon, title, value, detail, tone = "emerald", valueClass = "text-white" }) {
  const tones = {
    emerald: {
      border: "border-emerald-500/20",
      background: "bg-[radial-gradient(circle_at_100%_100%,rgba(16,185,129,0.24),transparent_52%),linear-gradient(135deg,rgba(16,185,129,0.10),rgba(8,13,15,0.96)_48%)]",
      iconWrap: "border-emerald-400/20 bg-emerald-400/15 text-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.16)]",
    },
    sky: {
      border: "border-sky-500/20",
      background: "bg-[radial-gradient(circle_at_100%_100%,rgba(14,165,233,0.24),transparent_52%),linear-gradient(135deg,rgba(14,165,233,0.09),rgba(8,13,15,0.96)_48%)]",
      iconWrap: "border-sky-400/20 bg-sky-400/15 text-sky-300 shadow-[0_0_18px_rgba(14,165,233,0.15)]",
    },
    violet: {
      border: "border-violet-500/20",
      background: "bg-[radial-gradient(circle_at_100%_100%,rgba(139,92,246,0.24),transparent_52%),linear-gradient(135deg,rgba(139,92,246,0.09),rgba(8,13,15,0.96)_48%)]",
      iconWrap: "border-violet-400/20 bg-violet-400/15 text-violet-300 shadow-[0_0_18px_rgba(139,92,246,0.15)]",
    },
    amber: {
      border: "border-amber-500/20",
      background: "bg-[radial-gradient(circle_at_100%_100%,rgba(245,158,11,0.24),transparent_52%),linear-gradient(135deg,rgba(245,158,11,0.09),rgba(8,13,15,0.96)_48%)]",
      iconWrap: "border-amber-400/20 bg-amber-400/15 text-amber-300 shadow-[0_0_18px_rgba(245,158,11,0.16)]",
    },
  };
  const theme = tones[tone] || tones.emerald;

  return <section className={`relative min-h-[112px] min-w-0 overflow-hidden rounded-2xl border px-4 py-3.5 ${theme.border} ${theme.background} shadow-[0_12px_34px_rgba(0,0,0,0.20)]`}>
    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.025),transparent_35%)]"/>
    <div className="relative z-10 flex h-full min-h-[82px] flex-col">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${theme.iconWrap}`}>
          <Icon className="h-4 w-4"/>
        </span>
        <span className="truncate text-[11px] font-semibold text-[#dfe7ee]">{title}</span>
      </div>
      <div className="mt-3 min-w-0">
        <strong className={`block truncate text-[27px] font-semibold leading-none tracking-tight tabular-nums ${valueClass}`}>{value}</strong>
      </div>
    </div>
  </section>;
}

function HardwareSummaryCard({ progress, earned, cost }) {
  return <section className={panel + " min-w-0 px-4 py-3.5"}>
    <div className="flex items-center gap-2 text-[10px] text-[#9aa7b4]"><Target className="h-4 w-4"/><span>Hardware Payback</span></div>
    <div className="mt-2 flex items-center gap-3">
      <strong className="text-[25px] font-semibold tracking-tight text-emerald-400 tabular-nums">{cost ? percent(progress) : "—"}</strong>
      <div className="min-w-0 flex-1">
        <div className="h-2 overflow-hidden rounded-full bg-[#283039]"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}/></div>
        <p className="mt-1 text-center text-[9px] text-[#8d98a4]">{cost ? `${money(earned)} / ${money(cost)}` : "No hardware tracked"}</p>
      </div>
    </div>
  </section>;
}

const PROJECT_TABLE_META = {
  Lulo: { type: "Lending", typeClass: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300", icon: "L", iconClass: "border-rose-500/30 bg-rose-500/10 text-rose-300" },
  Loopscale: { type: "Lending", typeClass: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300", icon: "∞", iconClass: "border-violet-500/30 bg-violet-500/10 text-violet-300" },
  Kryptex: { type: "Mining", typeClass: "border-amber-500/25 bg-amber-500/10 text-amber-300", icon: "◆", iconClass: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
  Salad: { type: "Compute", typeClass: "border-teal-500/25 bg-teal-500/10 text-teal-300", icon: "●", iconClass: "border-lime-500/30 bg-lime-500/10 text-lime-300" },
  Unetwork: { type: "Node", typeClass: "border-violet-500/25 bg-violet-500/10 text-violet-300", icon: "U", iconClass: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300" },
  RollerCoin: { type: "Gaming", typeClass: "border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-300", icon: "◉", iconClass: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
};

function projectTableMeta(name) {
  return PROJECT_TABLE_META[name] || {
    type: "Income",
    typeClass: "border-slate-500/25 bg-slate-500/10 text-slate-300",
    icon: String(name || "?").slice(0, 1).toUpperCase(),
    iconClass: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  };
}

function SectionTitle({ icon: Icon, title, to }) {
  return <div className="flex items-center justify-between gap-3">
    <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-[#9fb0c1]"/><h2 className="text-[15px] font-semibold">{title}</h2></div>
    {to && <Link to={to} className="flex items-center gap-1 text-[10px] font-medium text-emerald-400 hover:text-emerald-300">View all <ChevronRight className="h-3 w-3"/></Link>}
  </div>;
}

export default function SideHustleDashboard() {
  const [income, setIncome] = useState(readIncomeData);
  const [hardware, setHardware] = useState(readHardware);
  const [power, setPower] = useState(null);
  const [powerSettings, setPowerSettings] = useState(POWER_DEFAULTS);
  const [serverTodayIncome, setServerTodayIncome] = useState(null);
  const [recordedHistory, setRecordedHistory] = useState(readRecordedHistory);
  const [activeView, setActiveView] = useState("overview");
  const [clock, setClock] = useState(Date.now());
  const [addModal, setAddModal] = useState(null);
  const [hardwareDraft, setHardwareDraft] = useState({ name: "", cost: "", power: "", source: "", startMonth: getCurrentMonthKey() });
  const [projectDraft, setProjectDraft] = useState({ id: "", cost: "" });
  const [addError, setAddError] = useState("");

  const refreshIncomeMetrics = useCallback(async () => {
    const today = pacificDayKey(Date.now());
    const [dailyResult] = await Promise.allSettled([
      api.get(`/api/project-tracking/daily-earnings/${today}`),
    ]);

    if (dailyResult.status === "fulfilled") {
      const result = dailyResult.value;
      const total = Number(result?.totalUsd);
      if (result?.date === today && Number.isFinite(total)) setServerTodayIncome(total);
    }

  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await api.get("/api/yield-sources/earnings");
        if (active && result) setRecordedHistory(current => ({
          ...current,
          loopscale: mergeBackendLoopscaleHistory(current.loopscale, result.loopscaleHistory),
          manualIncome: result.manualIncomeHistory || current.manualIncome,
          luloBackfills: result.luloBackfills && typeof result.luloBackfills === "object"
            ? result.luloBackfills : current.luloBackfills,
        }));
      } catch { /* Use saved history when backend is unavailable. */ }
    };
    refresh();
    const timer = window.setInterval(refresh, 90000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const recordedTrackers = useMemo(() => ({
    salad: recordedHistory.salad, rollercoin: recordedHistory.rollercoin,
    unetwork: recordedHistory.unetwork, kryptex: recordedHistory.kryptex,
  }), [recordedHistory.salad, recordedHistory.rollercoin, recordedHistory.unetwork, recordedHistory.kryptex]);
  const recordedLocalMonths = useMemo(() => buildProjectIncome(
    recordedHistory.luloProjects, recordedHistory.loopscale, recordedHistory.salad, recordedHistory.backfills,
    recordedHistory.rollercoin, recordedHistory.unetwork, recordedHistory.kryptex,
  ), [recordedHistory]);
  const recordedLiveMonths = useBackendMonthlyIncome(recordedTrackers, recordedLocalMonths);
  const recordedMonthKey = getCurrentMonthKey();
  const recordedDayKey = getTodayKey();
  const recordedProjectMonths = useMemo(() => reconcileLuloIncome(
    getEffectiveProjectIncome(recordedLiveMonths, recordedHistory.snapshots),
    recordedHistory.backfills, recordedHistory.luloBackfills, recordedMonthKey,
    recordedHistory.luloProjects, recordedDayKey,
  ), [recordedLiveMonths, recordedHistory.snapshots, recordedHistory.backfills,
      recordedHistory.luloBackfills, recordedHistory.luloProjects, recordedMonthKey, recordedDayKey]);
  const recordedLegacy = useMemo(() => legacyProjectIncome(recordedHistory.legacyProjects), [recordedHistory.legacyProjects]);
  const recordedMonths = useMemo(() => mergeManualIncome(
    buildIncomeHistory(recordedProjectMonths, recordedHistory.payouts, recordedMonthKey, recordedLegacy),
    recordedHistory.manualIncome?.monthly || {}, recordedMonthKey,
  ), [recordedProjectMonths, recordedHistory.payouts, recordedMonthKey, recordedLegacy, recordedHistory.manualIncome]);

  const refreshPower = useCallback(async () => {
    try {
      const [status, saved] = await Promise.all([
        api.get("/api/power/status"),
        settingsApi.get(POWER_SETTINGS_KEY).catch(() => null),
      ]);
      setPower(status);
      if (saved && typeof saved === "object") setPowerSettings(current => ({ ...current, ...saved }));
    } catch {
      setPower(null);
    }
  }, []);

  useEffect(() => subscribe(() => {
    setIncome(readIncomeData());
    setRecordedHistory(current => ({ ...readRecordedHistory(), manualIncome: current.manualIncome, luloBackfills: current.luloBackfills }));
    setHardware(readHardware());
    refreshIncomeMetrics();
  }), [refreshIncomeMetrics]);
  useEffect(() => {
    refreshPower();
    refreshIncomeMetrics();
    const powerTimer = window.setInterval(refreshPower, 15000);
    const incomeTimer = window.setInterval(refreshIncomeMetrics, 5000);
    const clockTimer = window.setInterval(() => setClock(Date.now()), 60000);
    return () => {
      window.clearInterval(powerTimer);
      window.clearInterval(incomeTimer);
      window.clearInterval(clockTimer);
    };
  }, [refreshPower, refreshIncomeMetrics]);

  const currentMonthKey = getCurrentMonthKey();
  const currentMonth = income.months.find(row => row.monthKey === currentMonthKey) || { monthKey: currentMonthKey, total: 0, platforms: [] };
  const recordedCurrentMonth = recordedMonths.find(row => row.monthKey === currentMonthKey);
  const monthlyIncome = Math.max(0, Number(recordedCurrentMonth?.total) || 0);
  const recentMonths = recordedMonths.slice(-12);
  const dailyRows = Array.isArray(income.dailyHistory) ? income.dailyHistory : [];
  const todayKey = pacificDayKey(clock);
  const localTodayIncome = Number(dailyRows.find(row => row.date === todayKey)?.income) || 0;
  const passiveIncomeToday = Number.isFinite(Number(serverTodayIncome))
    ? Math.max(0, Number(serverTodayIncome))
    : Math.max(0, localTodayIncome);
  const yesterdayDate = new Date(new Date(`${todayKey}T12:00:00Z`).getTime() - 86400000);
  const yesterdayKey = yesterdayDate.toISOString().slice(0, 10);
  const yesterdayIncome = Math.max(0, Number(dailyRows.find(row => row.date === yesterdayKey)?.income) || 0);
  const todayVsYesterday = yesterdayIncome > 0
    ? (passiveIncomeToday - yesterdayIncome) / yesterdayIncome * 100
    : null;
  const previousMonth = recentMonths.length > 1 ? recentMonths[recentMonths.length - 2] : null;
  const monthChange = previousMonth?.total > 0 ? ((monthlyIncome - previousMonth.total) / previousMonth.total * 100) : 0;

  const rankedProjects = [...income.projects].sort((a, b) => {
    const ar = a.spent > 0 ? a.earned / a.spent : 0;
    const br = b.spent > 0 ? b.earned / b.spent : 0;
    return br - ar || b.daily - a.daily;
  });
  const configuredProjects = rankedProjects.filter(project => project.spent > 0);
  const incompleteProjects = configuredProjects
    .filter(project => Math.max(0, Number(project.earned) || 0) < Math.max(0, Number(project.spent) || 0))
    .sort((a, b) => {
      const ar = a.spent > 0 ? a.earned / a.spent : 0;
      const br = b.spent > 0 ? b.earned / b.spent : 0;
      return br - ar;
    });
  const projectSpent = configuredProjects.reduce((sum, row) => sum + row.spent, 0);
  const projectEarned = configuredProjects.reduce((sum, row) => sum + row.earned, 0);
  const projectProgress = projectSpent > 0 ? projectEarned / projectSpent * 100 : 0;

  const latest = power?.latest || null;
  const totalWatts = Number(latest?.totalWatts) || 0;
  const live = latest?.observedAt ? Date.now() - new Date(latest.observedAt).getTime() < 90000 : false;
  const rateInfo = currentRate(powerSettings, new Date(clock));
  const powerMonth = power?.currentMonth || null;
  const monthKwh = Number(powerMonth?.totalKwh) || 0;
  const freePower = hasFreeMiningPower(currentMonthKey);
  const monthPowerCost = outOfPocketMiningPowerCost(usageCost(powerMonth, powerSettings, powerMonth?.month), powerMonth?.month || currentMonthKey);
  const miningDailyRevenue = Math.max(0, Number(powerSettings.dailyRevenueUsd) || 0);
  const miningDailyCost = outOfPocketMiningPowerCost(totalWatts / 1000 * Number(rateInfo.rate || 0) * 24, currentMonthKey);
  const miningDailyNet = miningDailyRevenue - miningDailyCost;
  const deviceRows = Array.isArray(latest?.devices) ? latest.devices : [];
  const deviceUsage = powerMonth?.devices || {};

  const hardwareCost = hardware.reduce((sum, row) => sum + (Number(row.cost) || 0), 0);
  const kryptexTracker = loadKryptexTracker();
  const hardwareEarnings = hardwareEarningsByDevice(hardware, currentMonthKey, kryptexTracker, clock);
  const hardwareRecovered = Object.values(hardwareEarnings)
    .reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  const hardwareProgress = hardwareCost > 0 ? hardwareRecovered / hardwareCost * 100 : 0;

  const projectSummary = readObject("project_income_portfolio_summary_v1");
  const totalProjectBalance = Math.max(0, Number(projectSummary?.portfolioBalance) || 0);
  // Match the Bitcoin balance used by Home and Monthly Changes.
  // Project Income's portfolioBalance does not include Bitcoin.
  const homeBitcoin = appStorage.getCryptoCache()?.projectPortfolio?.bitcoin;
  const portfolioBitcoin = getStoredProjectCryptoPortfolio()?.bitcoin;
  const bitcoinBalance = Math.max(0, Number(
    homeBitcoin?.value ?? homeBitcoin?.balance ??
    portfolioBitcoin?.value ?? portfolioBitcoin?.balance
  ) || 0);
  const totalNetWorth = totalProjectBalance + bitcoinBalance;
  // Use the same reconciled per-source monthly totals as Income History.
  // This includes Lulo earnings even when the quick dashboard cache lacks a Lulo row.
  const sourceRows = Object.entries(recordedCurrentMonth?.sources || {})
    .filter(([, amount]) => Number.isFinite(Number(amount)) && Number(amount) > 0)
    .map(([platform, amount]) => ({ platform, amount: Number(amount) }))
    .sort((a, b) => b.amount - a.amount);
  const sourceProjectMap = new Map();
  income.projects.forEach(project => {
    const key = String(project?.name || "").trim().toLowerCase();
    if (!key) return;
    const existing = sourceProjectMap.get(key);
    if (!existing || Number(project.balance) > Number(existing.balance)) sourceProjectMap.set(key, project);
  });
  const sourceTableRows = sourceRows.map(row => {
    const project = sourceProjectMap.get(String(row.platform || "").trim().toLowerCase()) || {};
    return {
      ...row,
      daily: Math.max(0, Number(project.daily) || 0),
      roi: Math.max(0, Number(project.roi) || 0),
      meta: projectTableMeta(row.platform),
    };
  });

  const addSourceOptions = [...new Set([
    ...income.projects.map(project => project.name),
    ...Object.keys(recordedCurrentMonth?.sources || {}),
  ].map(canonicalSourceName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const projectAddOptions = [...income.projects]
    .filter(project => project.id && project.name)
    .sort((a, b) => a.name.localeCompare(b.name));
  function openAddModal(kind) {
    setAddError("");
    if (kind === "hardware") setHardwareDraft({
      name: "", cost: "", power: "", source: "", startMonth: currentMonthKey,
    });
    if (kind === "project") setProjectDraft({ id: "", cost: "" });
    setAddModal(kind);
  }
  function saveHardware(event) {
    event.preventDefault();
    const name = hardwareDraft.name.trim();
    const source = canonicalSourceName(hardwareDraft.source);
    const cost = Number(hardwareDraft.cost);
    const power = Number(hardwareDraft.power || 0);
    if (!name || !source || !/^\d{4}-\d{2}$/.test(hardwareDraft.startMonth) ||
        hardwareDraft.startMonth > currentMonthKey || !Number.isFinite(cost) || cost <= 0 ||
        !Number.isFinite(power) || power < 0) {
      setAddError("Enter a name, purchase cost, valid purchase month, and income source.");
      return;
    }
    const now = Date.now();
    const device = {
      id: crypto.randomUUID(), name, source, cost, power,
      startMonth: hardwareDraft.startMonth,
      checkpoint: {
        time: now, month: currentMonthKey,
        baseline: source === "Kryptex" ? 0 : Number(recordedCurrentMonth?.sources?.[source]) || 0,
        carried: 0,
        ...(source === "Kryptex" ? { ledger: KRYPTEX_PAYBACK_LEDGER } : {}),
      },
    };
    const next = [...readHardware(), device];
    remoteStorage.setItem(HARDWARE_KEY, JSON.stringify(next));
    setHardware(next);
    setAddModal(null);
  }
  function saveProjectCost(event) {
    event.preventDefault();
    const selected = projectAddOptions.find(project => project.id === projectDraft.id);
    const cost = Number(projectDraft.cost);
    if (!selected || !projectDraft.cost.trim() || !Number.isFinite(cost) || cost <= 0) {
      setAddError("Choose an existing project and enter a cost greater than $0.");
      return;
    }
    const next = { ...loadProjectPayback(), [selected.id]: {
      totalSpent: cost, updatedAt: new Date().toISOString(),
    } };
    saveProjectPayback(next);
    setIncome(readIncomeData());
    setAddModal(null);
  }

  return <div className="min-w-0 space-y-3 pb-8 text-white" data-testid="side-hustle-dashboard">


    <nav aria-label="Dashboard sections" className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-2xl border border-[#242b33] bg-[#0d1014] px-2 py-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.18)] [scrollbar-width:none]">
      {[
        { id: "overview", label: "Overview", Icon: Home },
        { id: "passive", label: "Passive Income", Icon: Layers3 },
        { id: "changes", label: "Monthly Changes", Icon: CalendarDays },
      ].map(({ id, label, Icon }) => {
        const active = activeView === id;
        return <button
          key={id}
          type="button"
          onClick={() => setActiveView(id)}
          aria-pressed={active}
          className={`flex h-9 shrink-0 items-center gap-2 rounded-xl px-4 text-[11px] transition-colors ${active
            ? "border border-sky-400/70 bg-[#171d24] font-semibold text-white shadow-[0_0_0_1px_rgba(56,189,248,0.08),0_0_18px_rgba(56,189,248,0.08)]"
            : "font-medium text-[#aab5bf] hover:bg-white/[0.04] hover:text-white"}`}
        >
          <Icon className="h-4 w-4"/>
          {label}
        </button>;
      })}
    </nav>

    {activeView === "overview" ? <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        icon={Layers3}
        title="Total Net Worth"
        value={money(totalNetWorth)}
        detail="Project balances + Bitcoin"
        tone="violet"
      />
      <KpiCard
        icon={Coins}
        title="Income Today"
        value={money(passiveIncomeToday)}
        detail={todayVsYesterday == null ? "Actual earnings today" : `${todayVsYesterday >= 0 ? "▲" : "▼"} ${Math.abs(todayVsYesterday).toFixed(1)}% vs. yesterday`}
        tone="emerald"
        valueClass="text-emerald-400"
      />
      <KpiCard
        icon={CalendarDays}
        title="Monthly Income"
        value={money(monthlyIncome)}
        detail={previousMonth ? `${monthChange >= 0 ? "▲" : "▼"} ${Math.abs(monthChange).toFixed(1)}% vs. last month` : "Current month total"}
        tone="sky"
      />
      <KpiCard
        icon={Zap}
        title="Total Power"
        value={`${totalWatts.toFixed(0)} W`}
        detail={`${deviceRows.length} GPUs • ${live ? "Live" : "Stale"}`}
        tone="amber"
      />
    </div>
    <div className="grid gap-3 xl:grid-cols-2">
      <section className={panel + " min-h-[210px] min-w-0 overflow-hidden px-4 pb-3 pt-3.5"}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-[#a8b6c4]"/>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold leading-none">Hardware Payback</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openAddModal("hardware")}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.08] px-2.5 text-[10px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/15"
          >
            <Plus className="h-3.5 w-3.5"/>
            Add
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {hardware.slice(0, 4).map(row => {
            const name = String(row.name || "");
            const lowerName = name.toLowerCase();
            const meta = lowerName.includes("2080")
              ? GPU_META.rtx2080super
              : lowerName.includes("5070")
                ? GPU_META.rtx5070
                : null;

            const sourceProject = income.projects.find(project =>
              String(project?.name || "").trim().toLowerCase() === String(row.source || "").trim().toLowerCase()
            );

            const cost = Math.max(0, Number(row.cost) || 0);
            const recovered = Math.max(0, Number(hardwareEarnings[row.id]) || 0);
            const progress = cost > 0 ? recovered / cost * 100 : 0;
            const monthlyPowerCost = Math.max(0, Number(row.power) || 0);
            const grossMonthlyIncome = Math.max(0, Number(sourceProject?.daily) || 0) * 30.4375;
            const estMonthlyIncome = Math.max(0, grossMonthlyIncome - monthlyPowerCost);
            const remaining = Math.max(0, cost - recovered);
            const paybackMonths = remaining <= 0 ? 0 : estMonthlyIncome > 0 ? remaining / estMonthlyIncome : null;

            return <div
              key={row.id}
              className="min-w-0 rounded-xl border border-[#202a33] bg-[linear-gradient(180deg,#10151a_0%,#0d1217_100%)] p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#26313b] bg-[#0a0e12] sm:h-12 sm:w-28">
                  {meta ? (
                    <img
                      src={meta.image}
                      alt={lowerName.includes("2080") ? "RTX 2080 Super" : "RTX 5070"}
                      className="h-full w-full object-contain px-1"
                    />
                  ) : (
                    <Cpu className="h-5 w-5 text-[#8fa0b0]"/>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[12px] font-semibold text-[#eef2f6]">{row.name}</p>
                  <p className="mt-0.5 text-[9px] uppercase tracking-[0.13em] text-[#7f8b97]">{meta?.brand || row.source || "Hardware"}</p>
                </div>
                <span className="inline-flex shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-emerald-400">
                  {cost > 0 ? percent(progress) : "—"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[#25313c] pt-3">
                <div className="min-w-0">
                  <strong className="block whitespace-nowrap text-[12px] font-semibold tabular-nums text-amber-400 sm:text-[13px]">{money(cost)}</strong>
                  <p className="mt-1 text-[10px] leading-tight text-[#8fa0ad]">Amount Spent</p>
                </div>
                <div className="min-w-0">
                  <strong className="block whitespace-nowrap text-[12px] font-semibold tabular-nums text-[#eef2f6] sm:text-[13px]">{money(recovered)}</strong>
                  <p className="mt-1 text-[10px] leading-tight text-[#8fa0ad]">Earned So Far</p>
                </div>
                <div className="min-w-0 text-right">
                  <strong className="block whitespace-nowrap text-[12px] font-semibold tabular-nums text-[#eef2f6] sm:text-[13px]">{paybackMonths === 0 ? "Recovered" : paybackMonths != null ? `~${paybackMonths.toFixed(1)} mo` : "—"}</strong>
                  <p className="mt-1 text-[10px] leading-tight text-[#8fa0ad]">Payback</p>
                </div>
              </div>
            </div>;
          })}
          {!hardware.length && <p className="rounded-xl border border-dashed border-[#2a343e] py-8 text-center text-xs text-[#778491]">No hardware tracked yet.</p>}
        </div>
      </section>
      <section className={panel + " min-h-[210px] min-w-0 overflow-hidden px-4 pb-3 pt-3.5"}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Target className="mt-0.5 h-4 w-4 text-[#a8b6c4]"/>
            <div>
              <h2 className="text-[15px] font-semibold leading-none">Project Break-Even</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openAddModal("project")}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.08] px-2.5 text-[10px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/15"
          >
            <Plus className="h-3.5 w-3.5"/>
            Add
          </button>
        </div>

        <div className="mt-3 divide-y divide-[#202932]">
          {incompleteProjects.slice(0, 3).map(row => {
            const spent = Math.max(0, Number(row.spent) || 0);
            const earned = Math.max(0, Number(row.earned) || 0);
            const ratio = spent > 0 ? Math.min(100, earned / spent * 100) : 0;
            const remaining = Math.max(0, spent - earned);
            const days = Number(row.daily) > 0 ? Math.ceil(remaining / Number(row.daily)) : null;
            const meta = projectTableMeta(row.name);
            return <div key={row.id} className="grid grid-cols-[minmax(0,.85fr)_minmax(120px,1.4fr)_52px_65px] items-center gap-3 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${meta.iconClass}`}>{meta.icon}</span>
                <span className="truncate text-[11px] font-medium text-[#eef2f6]">{row.name}</span>
              </div>
              <div className="min-w-0">
                <div className="h-2 overflow-hidden rounded-full bg-[#2a333c]">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${ratio}%` }}/>
                </div>
                <p className="mt-1 text-[9px] tabular-nums text-[#7f8b97]">{money(earned)} / {money(spent)}</p>
              </div>
              <strong className="text-right text-[11px] font-semibold tabular-nums text-emerald-400">{ratio.toFixed(0)}%</strong>
              <span className="text-right text-[9px] tabular-nums text-[#c0c8d0]">{days != null ? `~${days} days` : "—"}</span>
            </div>;
          })}
          {!incompleteProjects.length && <p className="py-8 text-center text-xs text-[#778491]">All configured projects have broken even.</p>}
        </div>
      </section>
    </div>

    <section className={panel + " min-w-0 overflow-hidden px-5 pb-5 pt-4"}>
        <div className="flex items-center justify-between gap-3">
          <Link to="/mining-power" className="flex items-center gap-2.5">
            <Zap className="h-5 w-5 text-emerald-400"/>
            <h2 className="text-[16px] font-semibold">Mining Power</h2>
          </Link>
          <div className="flex items-center gap-2">
          {freePower && <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-2.5 py-1 text-[9px] font-medium text-sky-300">Free power</span>}
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-medium ${live ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-[#303842] bg-[#13181e] text-[#8e9aa6]"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-400" : "bg-[#6f7a84]"}`}/>
            {live ? "Live" : "Stale"}
          </span>
          </div>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-y-5 sm:grid-cols-5 sm:gap-y-0">
          <div className="min-w-0 pr-4 sm:border-r sm:border-[#26313a]">
            <div className="flex items-center gap-1.5 text-[10px] text-[#8b98a5]"><Zap className="h-4 w-4 text-cyan-300"/><span>Total Power</span></div>
            <strong className="mt-2 block text-[31px] font-semibold leading-none tracking-tight tabular-nums text-white">{totalWatts.toFixed(0)} W</strong>
          </div>

          <div className="min-w-0 px-0 sm:border-r sm:border-[#26313a] sm:px-4">
            <div className="flex items-center gap-1.5 text-[10px] text-[#8b98a5]"><CalendarDays className="h-4 w-4 text-cyan-300"/><span>Monthly Energy</span></div>
            <strong className="mt-2 block text-[18px] font-semibold leading-none tabular-nums text-white">{monthKwh.toFixed(2)} kWh</strong>
          </div>

          <div className="min-w-0 pr-4 sm:border-r sm:border-[#26313a] sm:px-4">
            <div className="flex items-center gap-1.5 text-[10px] text-[#8b98a5]"><Coins className="h-4 w-4 text-amber-400"/><span>Monthly Cost</span></div>
            <strong className="mt-2 block text-[18px] font-semibold leading-none tabular-nums text-amber-400">{money(monthPowerCost)}</strong>
          </div>

          <div className="min-w-0 px-0 sm:border-r sm:border-[#26313a] sm:px-4">
            <div className="flex items-center gap-1.5 text-[10px] text-[#8b98a5]"><Zap className="h-4 w-4 text-cyan-300"/><span>Effective Rate</span></div>
            <strong className="mt-2 block text-[18px] font-semibold leading-none tabular-nums text-white">{"$" + Number(freePower ? 0 : rateInfo.rate || 0).toFixed(4) + "/kWh"}</strong>
          </div>

          <div className="col-span-2 min-w-0 sm:col-span-1 sm:pl-4">
            <div className="flex items-center gap-1.5 text-[10px] text-[#8b98a5]"><TrendingUp className="h-4 w-4 text-emerald-400"/><span>Net Profit / Day</span></div>
            <strong className={`mt-2 block text-[18px] font-semibold leading-none tabular-nums ${miningDailyNet >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{money(miningDailyNet)}</strong>
          </div>
        </div>
    </section>

    <div className="grid gap-3 xl:grid-cols-[1.15fr_1fr]">
      <section className={panel + " min-w-0 overflow-hidden px-4 pb-3 pt-3.5"}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-[#a8b6c4]"/>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold leading-none">Top Projects</h2>
              
            </div>
          </div>
        </div>

        <div className="mt-3 min-w-[620px] overflow-x-auto">
          <div className="grid grid-cols-[1.5fr_.9fr_1fr_1.05fr_.75fr] items-center gap-x-3 border-b border-[#25303a] px-1 pb-1.5 text-[9px] text-[#8a96a3]">
            <span>Project</span>
            <span>Type</span>
            <span className="text-right">Income (Today)</span>
            <span className="text-right">Income (MTD)</span>
            <span className="text-right">Status</span>
          </div>

          <div className="divide-y divide-[#202932]">
            {sourceTableRows.map(row => (
              <div key={row.platform} className="grid grid-cols-[1.5fr_.9fr_1fr_1.05fr_.75fr] items-center gap-x-3 px-1 py-2 text-[11px]">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${row.meta.iconClass}`}>{row.meta.icon}</span>
                  <span className="truncate font-medium text-[#e8edf2]">{row.platform}</span>
                </div>
                <div>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-medium ${row.meta.typeClass}`}>{row.meta.type}</span>
                </div>
                <strong className="text-right font-semibold tabular-nums text-[#eef2f6]">{money(row.daily)}</strong>
                <strong className="text-right font-semibold tabular-nums text-[#eef2f6]">{money(row.amount)}</strong>
                <div className="flex justify-end">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-medium text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"/>Active
                  </span>
                </div>
              </div>
            ))}
          </div>
          {!sourceTableRows.length && <p className="py-7 text-center text-xs text-[#778491]">No income projects recorded this month yet.</p>}
        </div>
      </section>

      <section className={panel + " relative min-w-0 overflow-hidden p-0"}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_42%,rgba(34,211,238,0.11),transparent_32%),linear-gradient(90deg,rgba(13,16,20,1)_0%,rgba(13,16,20,0.99)_47%,rgba(13,16,20,0.7)_67%,rgba(13,16,20,0.16)_100%)]" />
        <div className="grid min-h-[230px] grid-cols-1 lg:grid-cols-[1.05fr_.95fr]">
          <div className="relative z-10 p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <ChartNoAxesCombined className="h-4 w-4 text-emerald-400"/>
              <h2 className="text-[15px] font-semibold">This Month at a Glance</h2>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-x-0 gap-y-0">
              <div className="border-b border-r border-[#242d35] pb-5 pr-5">
                <p className="text-[10px] text-[#83909d]">Passive Income (MTD)</p>
                <strong className="mt-1.5 block text-[22px] font-semibold tracking-tight text-emerald-400">{money(monthlyIncome)}</strong>
                <p className="mt-1 text-[9px] text-emerald-400/80">{previousMonth ? `${monthChange >= 0 ? "+" : ""}${monthChange.toFixed(1)}% vs. last month` : "Current month"}</p>
              </div>
              <div className="border-b border-[#242d35] pb-5 pl-5">
                <p className="text-[10px] text-[#83909d]">Mining Energy</p>
                <strong className="mt-1.5 block text-[22px] font-semibold tracking-tight text-cyan-300">{monthKwh.toFixed(2)} kWh</strong>
                <p className="mt-1 text-[9px] text-cyan-300/80">{deviceRows.length} GPUs tracked</p>
              </div>
              <div className="border-r border-[#242d35] pt-5 pr-5">
                <p className="text-[10px] text-[#83909d]">Mining Cost</p>
                <strong className="mt-1.5 block text-[22px] font-semibold tracking-tight text-amber-400">{money(monthPowerCost)}</strong>
                
              </div>
              <div className="pt-5 pl-5">
                <p className="text-[10px] text-[#83909d]">Est. Net Profit (MTD)</p>
                <strong className="mt-1.5 block text-[22px] font-semibold tracking-tight text-emerald-400">{money(Math.max(0, monthlyIncome - monthPowerCost))}</strong>
                
              </div>
            </div>
          </div>
          <div className="relative min-h-[210px] overflow-hidden lg:min-h-full">
            <div className="absolute inset-y-0 left-0 z-10 hidden w-28 bg-gradient-to-r from-[#0d1014] via-[#0d1014]/80 to-transparent lg:block"/>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_45%,rgba(34,211,238,0.15),transparent_38%)]"/>
            <img
              src="/gpu/month-glance-pc-clean.webp"
              alt="RTX 5070 mining PC"
              className="absolute inset-0 h-full w-full object-cover object-center opacity-95"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0d1014] via-[#0d1014]/30 to-transparent lg:from-[#0d1014]/95 lg:via-[#0d1014]/15 lg:to-transparent" />
          </div>
        </div>
      </section>
    </div>
    </> : activeView === "passive" ? (
      <div className="pt-1">
        <YieldFarmingPage/>
      </div>
    ) : (
      <div className="pt-1">
        <MonthlyChangesPage/>
      </div>
    )}
    {addModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
        onMouseDown={event => { if (event.target === event.currentTarget) setAddModal(null); }}>
        <form onSubmit={addModal === "hardware" ? saveHardware : saveProjectCost}
          role="dialog" aria-modal="true" aria-label={addModal === "hardware" ? "Add hardware" : "Add project break-even cost"}
          className="w-full max-w-md space-y-4 rounded-2xl border border-[#263342] bg-[#0b1017] p-6 text-white shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{addModal === "hardware" ? "Add hardware" : "Add project break-even cost"}</h2>
            <button type="button" aria-label="Close" onClick={() => setAddModal(null)}
              className="rounded-lg p-1 text-[#91a4b8] hover:bg-white/10 hover:text-white"><X className="h-5 w-5"/></button>
          </div>
          {addModal === "hardware" ? (
            <>
              <label className="block text-sm">Hardware name
                <input autoFocus required value={hardwareDraft.name} onChange={event => setHardwareDraft(current => ({ ...current, name: event.target.value }))}
                  placeholder="RTX 5070" className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"/>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">Purchase cost ($)
                  <input required type="number" min="0.01" step="0.01" value={hardwareDraft.cost}
                    onChange={event => setHardwareDraft(current => ({ ...current, cost: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"/>
                </label>
                <label className="block text-sm">Power cost / month
                  <input type="number" min="0" step="0.01" value={hardwareDraft.power}
                    onChange={event => setHardwareDraft(current => ({ ...current, power: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"/>
                </label>
              </div>
              <label className="block text-sm">Income source
                <select required value={hardwareDraft.source}
                  onChange={event => setHardwareDraft(current => ({ ...current, source: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3">
                  <option value="" disabled>Select a source</option>
                  {addSourceOptions.map(source => <option key={source} value={source}>{source}</option>)}
                </select>
              </label>
              <label className="block text-sm">Purchase month
                <input required type="month" max={currentMonthKey} value={hardwareDraft.startMonth}
                  onChange={event => setHardwareDraft(current => ({ ...current, startMonth: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"/>
              </label>
            </>
          ) : (
            <>
              <label className="block text-sm">Project
                <select autoFocus required value={projectDraft.id}
                  onChange={event => {
                    const project = projectAddOptions.find(row => row.id === event.target.value);
                    setProjectDraft({ id: event.target.value, cost: project?.spent > 0 ? String(project.spent) : "" });
                  }}
                  className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3">
                  <option value="" disabled>Select a project</option>
                  {projectAddOptions.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </label>
              <label className="block text-sm">Total spent ($)
                <input required type="number" min="0.01" step="0.01" value={projectDraft.cost}
                  onChange={event => setProjectDraft(current => ({ ...current, cost: event.target.value }))}
                  placeholder="0.00" className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"/>
              </label>
              <p className="text-xs text-[#91a4b8]">This sets the purchase cost for an existing project. Its tracked earnings are unchanged.</p>
            </>
          )}
          {addError && <p role="alert" className="text-sm text-rose-400">{addError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setAddModal(null)}
              className="rounded-lg border border-[#3c5267] px-4 py-3 text-sm">Cancel</button>
            <button type="submit" className="flex-1 rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-[#061810]">
              {addModal === "hardware" ? "Save hardware" : "Save project cost"}
            </button>
          </div>
        </form>
      </div>
    )}
  </div>;
}

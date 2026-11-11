import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  CalendarDays, ChartNoAxesCombined, ChevronRight, Coins, Cpu, Layers3,
  Target, TrendingUp, Zap,
} from "lucide-react";
import { api, settingsApi } from "@/lib/apiClient";
import { remoteStorage, subscribe } from "@/lib/serverStore";
import {
  buildProjectIncome,
  formatCurrency,
  getCurrentMonthKey,
  getKryptexStats,
  getRollerCoinTrackerStats,
  getSaladTrackerStats,
  getUnetworkTrackerStats,
  groupManualPositions,
  loadKryptexTracker,
  loadLoopscaleHistory,
  loadMonthlyBackfills,
  loadPositions,
  loadProjectPayback,
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

function readIncomeData() {
  const quick = readObject(PROJECT_QUICK_CACHE_KEY);
  const lulo = (quick.projects || []).filter(project => project?.yield_tracking === "lulo_lending");
  const saladTracker = loadSaladTracker();
  const rollerTracker = loadRollerCoinTracker();
  const unetworkTracker = loadUnetworkTracker();
  const kryptexTracker = loadKryptexTracker();
  const months = buildProjectIncome(
    lulo,
    loadLoopscaleHistory(),
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
  const projects = [
    ...manual.map(project => ({
      id: project.id,
      name: project.platform,
      earned: Number(project.earned) || 0,
      daily: (Number(project.totalBalance) || 0) * (Number(project.weightedApy) || 0) / 100 / 365,
    })),
    { id: "salad-project", name: "Salad", earned: salad.lifetimeUsd, daily: salad.estimatedDailyUsd },
    { id: "rollercoin-project", name: "RollerCoin", earned: roller.lifetimeUsd, daily: Math.max(0, Number(roller.todayUsd) || 0) },
    { id: "unetwork-project", name: "Unetwork", earned: unetwork.lifetimeUsd, daily: unetwork.estimatedDailyUsd },
    { id: "kryptex-project", name: "Kryptex", earned: kryptex.lifetimeUsd, daily: kryptex.dailyUsd },
  ];
  const payback = loadProjectPayback();
  return {
    months,
    projects: projects.map(project => ({
      ...project,
      earned: Math.max(0, Number(project.earned) || 0),
      daily: Math.max(0, Number(project.daily) || 0),
      spent: Number(payback[project.id]?.totalSpent) || 0,
    })),
  };
}

function SummaryCard({ icon: Icon, title, value, detail, accent = "text-white" }) {
  return <section className={panel + " relative min-w-0 overflow-hidden p-4"}>
    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-emerald-400/[0.045] to-transparent" />
    <div className="relative flex items-center gap-2 text-[11px] text-[#9aa7b4]"><Icon className="h-4 w-4"/>{title}</div>
    <strong className={`relative mt-2 block truncate text-[27px] font-semibold tracking-tight tabular-nums ${accent}`}>{value}</strong>
    <p className="relative mt-1 truncate text-[10px] text-[#7f8b98]">{detail}</p>
  </section>;
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
  const [clock, setClock] = useState(Date.now());

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
    setHardware(readHardware());
  }), []);
  useEffect(() => {
    refreshPower();
    const powerTimer = window.setInterval(refreshPower, 15000);
    const clockTimer = window.setInterval(() => setClock(Date.now()), 60000);
    return () => { window.clearInterval(powerTimer); window.clearInterval(clockTimer); };
  }, [refreshPower]);

  const currentMonthKey = getCurrentMonthKey();
  const currentMonth = income.months.find(row => row.monthKey === currentMonthKey) || { monthKey: currentMonthKey, total: 0, platforms: [] };
  const recentMonths = income.months.slice(-8);
  const chartData = recentMonths.map(row => ({
    monthKey: row.monthKey,
    label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${row.monthKey}-15T12:00:00Z`)),
    income: Number(row.total) || 0,
  }));
  const dailyIncome = income.projects.reduce((sum, project) => sum + project.daily, 0);
  const previousMonth = recentMonths.length > 1 ? recentMonths[recentMonths.length - 2] : null;
  const monthChange = previousMonth?.total > 0 ? ((currentMonth.total - previousMonth.total) / previousMonth.total * 100) : 0;

  const rankedProjects = [...income.projects].sort((a, b) => {
    const ar = a.spent > 0 ? a.earned / a.spent : 0;
    const br = b.spent > 0 ? b.earned / b.spent : 0;
    return br - ar || b.daily - a.daily;
  });
  const configuredProjects = rankedProjects.filter(project => project.spent > 0);
  const projectSpent = configuredProjects.reduce((sum, row) => sum + row.spent, 0);
  const projectEarned = configuredProjects.reduce((sum, row) => sum + row.earned, 0);
  const projectProgress = projectSpent > 0 ? projectEarned / projectSpent * 100 : 0;

  const latest = power?.latest || null;
  const totalWatts = Number(latest?.totalWatts) || 0;
  const live = latest?.observedAt ? Date.now() - new Date(latest.observedAt).getTime() < 90000 : false;
  const rateInfo = currentRate(powerSettings, new Date(clock));
  const powerMonth = power?.currentMonth || null;
  const monthKwh = Number(powerMonth?.totalKwh) || 0;
  const monthPowerCost = usageCost(powerMonth, powerSettings, powerMonth?.month);
  const deviceRows = Array.isArray(latest?.devices) ? latest.devices : [];
  const deviceUsage = powerMonth?.devices || {};

  const hardwareCost = hardware.reduce((sum, row) => sum + (Number(row.cost) || 0), 0);
  const hardwareRecovered = hardware.reduce((sum, row) => sum + Math.max(0, Number(row.checkpoint?.carried) || 0), 0);
  const hardwareProgress = hardwareCost > 0 ? hardwareRecovered / hardwareCost * 100 : 0;

  const sourceRows = [...(currentMonth.platforms || [])].sort((a, b) => b.amount - a.amount);
  const maxSource = Math.max(1, ...sourceRows.map(row => Number(row.amount) || 0));

  return <div className="min-w-0 space-y-3 pb-8 text-white" data-testid="side-hustle-dashboard">
    <header className="flex flex-wrap items-end justify-between gap-3 px-1">
      <div>
        <div className="flex items-center gap-3">
          <ChartNoAxesCombined className="h-7 w-7 text-emerald-400"/>
          <h1 className="text-[30px] font-semibold tracking-tight">Overview</h1>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${live ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-[#303842] bg-[#13181e] text-[#8e9aa6]"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-400" : "bg-[#6f7a84]"}`}/>{live ? "Live" : "Stale"}
          </span>
        </div>
        <p className="mt-1 text-xs text-[#788491]">Your income-generating side hustles at a glance.</p>
      </div>
      <p className="text-[10px] text-[#73808d]">Updated {new Date(clock).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
    </header>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <SummaryCard icon={Coins} title="Passive Income Today" value={money(dailyIncome)} detail="Current estimated daily pace" accent="text-emerald-400"/>
      <SummaryCard icon={CalendarDays} title="Passive Income This Month" value={money(currentMonth.total)} detail={previousMonth ? `${monthChange >= 0 ? "+" : ""}${monthChange.toFixed(1)}% vs. last month` : "Current month"}/>
      <SummaryCard icon={Zap} title="Mining Power Live" value={`${totalWatts.toFixed(0)} W`} detail={`${deviceRows.length} GPUs · ${monthKwh.toFixed(2)} kWh MTD`} accent="text-cyan-300"/>
      <SummaryCard icon={Target} title="Project Break-Even" value={projectSpent ? percent(projectProgress) : "—"} detail={projectSpent ? `${money(projectEarned)} / ${money(projectSpent)}` : "Add project costs to track"}/>
      <SummaryCard icon={Cpu} title="Hardware Payback" value={hardwareCost ? percent(hardwareProgress) : "—"} detail={hardware.length ? `${hardware.length} tracked devices` : "No hardware tracked"} accent="text-emerald-400"/>
    </div>

    <div className="grid gap-3 xl:grid-cols-[1.6fr_.7fr_1fr]">
      <section className={panel + " min-w-0 p-4"}>
        <SectionTitle icon={TrendingUp} title="Income Trend" to="/income-history"/>
        <p className="mt-1 text-[10px] text-[#778491]">Recorded passive income over time</p>
        <div className="mt-3 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="sideHustleIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.34}/>
                  <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1d2730" vertical={false}/>
              <XAxis dataKey="label" stroke="#66727e" tick={{ fontSize: 10 }} axisLine={false} tickLine={false}/>
              <YAxis stroke="#66727e" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={value => `$${Math.round(value)}`}/>
              <Tooltip contentStyle={{ background: "#0b1015", border: "1px solid #2b3946", borderRadius: 10, fontSize: 11 }} formatter={value => [money(value), "Income"]}/>
              <Area type="monotone" dataKey="income" stroke="#2dd4bf" strokeWidth={2.2} fill="url(#sideHustleIncome)"/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className={panel + " min-w-0 p-4"}>
        <SectionTitle icon={CalendarDays} title="Income History" to="/income-history"/>
        <div className="mt-3 divide-y divide-[#202932]">
          {[...recentMonths].reverse().slice(0, 5).map(row => <div key={row.monthKey} className="flex items-center justify-between gap-3 py-3">
            <span className="text-[11px] text-[#9aa7b4]">{new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${row.monthKey}-15T12:00:00Z`))}</span>
            <strong className="text-[12px] tabular-nums">{money(row.total)}</strong>
          </div>)}
          {!recentMonths.length && <p className="py-8 text-center text-xs text-[#778491]">No income history yet.</p>}
        </div>
      </section>

      <section className={panel + " min-w-0 p-4"}>
        <SectionTitle icon={Target} title="Project Break-Even" to="/project-break-even"/>
        <p className="mt-1 text-[10px] text-[#778491]">Time to recover entered project costs</p>
        <div className="mt-3 space-y-4">
          {rankedProjects.slice(0, 4).map(row => {
            const ratio = row.spent > 0 ? row.earned / row.spent * 100 : 0;
            return <div key={row.id}>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate font-medium">{row.name}</span>
                <strong className={row.spent ? "text-emerald-400" : "text-[#778491]"}>{row.spent ? percent(ratio) : "No cost"}</strong>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#26313b]"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, ratio)}%` }}/></div>
              <p className="mt-1 text-[9px] text-[#778491]">{row.spent ? `${money(row.earned)} / ${money(row.spent)}` : `${money(row.earned)} earned`}</p>
            </div>;
          })}
        </div>
      </section>
    </div>

    <div className="grid gap-3 xl:grid-cols-[1fr_1.15fr]">
      <section className={panel + " min-w-0 p-4"}>
        <SectionTitle icon={Cpu} title="Hardware Payback" to="/hardware-payback"/>
        <p className="mt-1 text-[10px] text-[#778491]">GPU / rig ROI and payback tracking</p>
        <div className="mt-3 space-y-2">
          {hardware.slice(0, 4).map((row, index) => {
            const recovered = Math.max(0, Number(row.checkpoint?.carried) || 0);
            const progress = Number(row.cost) > 0 ? recovered / Number(row.cost) * 100 : 0;
            const meta = index === 0 ? GPU_META.rtx5070 : index === 1 ? GPU_META.rtx2080super : null;
            return <div key={row.id} className="grid grid-cols-[54px_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl border border-[#222c35] bg-[#10151a] px-3 py-2.5">
              <div className="flex h-10 items-center justify-center overflow-hidden rounded-lg bg-black/20">
                {meta ? <img src={meta.image} alt="" className="h-9 w-full object-contain"/> : <Cpu className="h-5 w-5 text-[#8fa0b0]"/>}
              </div>
              <div className="min-w-0"><p className="truncate text-xs font-semibold">{row.name}</p><p className="mt-0.5 text-[9px] uppercase tracking-[0.13em] text-[#778491]">{meta?.brand || row.source || "Hardware"}</p></div>
              <div className="text-right"><strong className="text-xs text-amber-400">{money(Number(row.power) || 0)}/mo</strong><p className="text-[9px] text-[#778491]">Power</p></div>
              <div className="min-w-[55px] text-right"><strong className="text-xs text-emerald-400">{row.cost ? percent(progress) : "—"}</strong><p className="text-[9px] text-[#778491]">Payback</p></div>
            </div>;
          })}
          {!hardware.length && <p className="rounded-xl border border-dashed border-[#2a343e] py-8 text-center text-xs text-[#778491]">No hardware tracked yet.</p>}
        </div>
      </section>

      <section className={panel + " min-w-0 p-4"}>
        <SectionTitle icon={Zap} title="Mining Power" to="/mining-power"/>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Total Power", `${totalWatts.toFixed(0)} W`, "text-white"],
            ["Monthly Energy", `${monthKwh.toFixed(2)} kWh`, "text-cyan-300"],
            ["Monthly Cost", money(monthPowerCost), "text-amber-400"],
            ["Current Rate", `${(rateInfo.rate * 100).toFixed(2)}¢/kWh`, "text-white"],
            ["Income / Day", money(dailyIncome), "text-emerald-400"],
          ].map(([label, value, color]) => <div key={label} className="min-w-0 border-l border-[#28323b] pl-3 first:border-0 first:pl-0">
            <p className="truncate text-[9px] text-[#778491]">{label}</p><strong className={`mt-1 block truncate text-[16px] tabular-nums ${color}`}>{value}</strong>
          </div>)}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {deviceRows.map(device => {
            const usage = deviceUsage[device.id] || {};
            const meta = GPU_META[device.id];
            return <div key={device.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-[#222c35] bg-[#10151a] p-3">
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{device.label}</p><strong className="mt-1 block text-xl tabular-nums">{(Number(device.watts) || 0).toFixed(0)} W</strong><p className="mt-1 text-[9px] text-cyan-300">{(Number(usage.kwh) || 0).toFixed(2)} kWh this month</p></div>
              {meta && <img src={meta.image} alt="" className="h-14 w-24 object-contain opacity-90"/>}
            </div>;
          })}
        </div>
      </section>
    </div>

    <div className="grid gap-3 xl:grid-cols-[1.15fr_1fr]">
      <section className={panel + " min-w-0 p-4"}>
        <SectionTitle icon={Layers3} title="Top Income Sources" to="/yield-farming"/>
        <div className="mt-3 space-y-2">
          {sourceRows.slice(0, 6).map(row => <div key={row.platform} className="grid grid-cols-[120px_minmax(0,1fr)_80px] items-center gap-3 text-[11px]">
            <span className="truncate font-medium">{row.platform}</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#25303a]"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.max(3, (Number(row.amount) || 0) / maxSource * 100)}%` }}/></div>
            <strong className="text-right tabular-nums">{money(row.amount)}</strong>
          </div>)}
          {!sourceRows.length && <p className="py-6 text-center text-xs text-[#778491]">No income recorded this month yet.</p>}
        </div>
      </section>

      <section className={panel + " min-w-0 p-4"}>
        <SectionTitle icon={Coins} title="This Month at a Glance"/>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5">
          <div><p className="text-[10px] text-[#778491]">Passive Income (MTD)</p><strong className="mt-1 block text-xl text-emerald-400">{money(currentMonth.total)}</strong></div>
          <div><p className="text-[10px] text-[#778491]">Mining Energy</p><strong className="mt-1 block text-xl text-cyan-300">{monthKwh.toFixed(2)} kWh</strong></div>
          <div><p className="text-[10px] text-[#778491]">Mining Cost</p><strong className="mt-1 block text-xl text-amber-400">{money(monthPowerCost)}</strong></div>
          <div><p className="text-[10px] text-[#778491]">Est. Income after Mining Power</p><strong className="mt-1 block text-xl text-emerald-400">{money(Math.max(0, currentMonth.total - monthPowerCost))}</strong></div>
        </div>
      </section>
    </div>
  </div>;
}

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ChartNoAxesCombined, Coins, Cpu, Home, Layers3, Plus, Target, Zap, X } from "lucide-react";
import { api } from "@/lib/apiClient";
import { remoteStorage, subscribe } from "@/lib/serverStore";
import { useBackendBitcoinValuation } from "@/hooks/useBackendBitcoinValuation";
import { hardwareImageFor, prepareHardwarePhoto } from "@/lib/hardwarePhotos";

import YieldFarmingPage from "@/pages/YieldFarmingPage";
import { useBackendEarningsDashboard } from "@/hooks/useBackendEarningsDashboard";
import { useCryptoDashboardSnapshot } from "@/hooks/useCryptoDashboardSnapshot";
import { backendCryptoProviderIncomeRows } from "@/lib/cryptoDashboardIncomeRows";
import { useAuth } from "@/lib/AuthContext";
import { readCryptoDashboardPowerCache, writeCryptoDashboardPowerCache } from "@/lib/cryptoDashboardPowerCache";
import { useBackendHardwarePayback } from "@/hooks/useBackendHardwarePayback";
import { previewHardwareCheckpointEdit } from "@/lib/backendHardwareCheckpointEdit";
import { formatEstimatedPaybackMonths } from "@/lib/backendHardwarePaybackCache";




import { formatCurrency, getCurrentMonthKey, loadProjectPayback, saveProjectPayback } from "@/lib/yieldFarmingAccounting";

const panel = "rounded-2xl border border-[#242b33] bg-[#0d1014] shadow-[0_12px_36px_rgba(0,0,0,0.16)]";
const HARDWARE_KEY = "hardware_payback_devices_v1";
const GPU_META = {
  rtx5070: { image: "/gpu/rtx5070-msi.webp", brand: "MSI" },
  rtx2080super: { image: "/gpu/rtx2080-super.webp", brand: "GIGABYTE" },
};

const money = value => formatCurrency(Number(value) || 0);
const percent = value => `${Math.max(0, Math.min(999, Number(value) || 0)).toFixed(0)}%`;

function readHardware() {
  try {
    const value = JSON.parse(remoteStorage.getItem(HARDWARE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}


function canonicalSourceName(source) {
  const value = String(source || "").trim().replace(/\s+/g, " ");
  const normalized = value.toLowerCase();
  if (["unity network", "unitynetwork", "unetwork"].includes(normalized)) return "Unetwork";
  if (normalized === "roller coin") return "RollerCoin";
  return value;
}

const hardwareSources = device => [...new Set(
  (Array.isArray(device?.sources) ? device.sources : [device?.source])
    .map(canonicalSourceName).filter(Boolean)
)];
function pacificDayKey(time) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(time)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
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

const PROJECT_TABLE_META = {
  Lulo: { type: "Lending", typeClass: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300", icon: "L", iconClass: "border-rose-500/30 bg-rose-500/10 text-rose-300" },
  Loopscale: { type: "Lending", typeClass: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300", icon: "∞", iconClass: "border-violet-500/30 bg-violet-500/10 text-violet-300" },
  Kryptex: { type: "Mining", typeClass: "border-amber-500/25 bg-amber-500/10 text-amber-300", icon: "◆", iconClass: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
  Honeygain: { type: "Bandwidth", typeClass: "border-sky-500/25 bg-sky-500/10 text-sky-300", icon: "H", iconClass: "border-orange-500/30 bg-orange-500/10 text-orange-300" },
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

export default function SideHustleDashboard() {
  const [hardware, setHardware] = useState(readHardware);
  const { user } = useAuth();
  const [power, setPower] = useState(() => readCryptoDashboardPowerCache(user?.id)?.data || null);
  const [powerIsCached, setPowerIsCached] = useState(() => Boolean(readCryptoDashboardPowerCache(user?.id)));
  // All income cards read the same backend-owned server projection.
  const [activeView, setActiveView] = useState("overview");
  const [clock, setClock] = useState(Date.now());
  const [addModal, setAddModal] = useState(null);
  const [hardwareDraft, setHardwareDraft] = useState({ name: "", cost: "", power: "", source: "", sources: [], startMonth: getCurrentMonthKey() });
  const [projectDraft, setProjectDraft] = useState({ id: "", cost: "" });
  const [addError, setAddError] = useState("");
  const [photoLoading, setPhotoLoading] = useState(false);
  const [savingHardware, setSavingHardware] = useState(false);
  const [projectBreakEven, setProjectBreakEven] = useState(null);
  const [projectBreakEvenError, setProjectBreakEvenError] = useState(false);
  const [projectRevision, setProjectRevision] = useState(0);

  const refreshPower = useCallback(async () => {
    try {
      const snapshot = await api.get("/api/power/status");
      setPower(snapshot);
      writeCryptoDashboardPowerCache(user?.id, snapshot);
      setPowerIsCached(false);
    } catch {
      // Preserve but label a saved measured snapshot during backend outages.
      setPowerIsCached(true);
    }
  }, [user?.id]);

  useEffect(() => subscribe(() => {
    setHardware(readHardware());
    setProjectRevision(current => current + 1);
  }), []);
  // The authenticated backend owns break-even earnings, remaining costs and
  // estimated days. The frontend only displays and sorts these verified rows.
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await api.get("/api/project-tracking/project-break-even");
        if (result?.sourceOfCalculation !== "backend-project-break-even" ||
            !Array.isArray(result.rows) ||
            !result.rows.every(row => typeof row.id === "string" &&
              typeof row.name === "string" &&
              ["earned", "daily", "spent", "recoveredPct"].every(key =>
                Number.isFinite(row[key])) &&
              (row.daysToProfit == null ||
                (Number.isInteger(row.daysToProfit) && row.daysToProfit >= 0)))) {
          throw new Error("Incomplete backend break-even response");
        }
        if (active) {
          setProjectBreakEven(result);
          setProjectBreakEvenError(false);
        }
      } catch {
        if (active) setProjectBreakEvenError(true);
      }
    };
    // Saved setting edits debounce for 600ms before backend reconciliation.
    const initial = window.setTimeout(refresh, projectRevision ? 900 : 0);
    const interval = window.setInterval(refresh, 90000);
    return () => {
      active = false;
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [projectRevision]);
  useEffect(() => {
    refreshPower();
    const powerTimer = window.setInterval(refreshPower, 15000);
    const clockTimer = window.setInterval(() => setClock(Date.now()), 60000);
    return () => {
      window.clearInterval(powerTimer);
      window.clearInterval(clockTimer);
    };
  }, [refreshPower]);

  // Financial summary values are NEVER calculated from browser cache.
  const currentMonthKey = getCurrentMonthKey();
  const { data: backendEarnings, isCached: earningsCached, error: earningsError } = useBackendEarningsDashboard(currentMonthKey);
  const { data: backendPortfolio, isCached: portfolioCached, error: portfolioError } = useCryptoDashboardSnapshot();
  const { data: backendHardware } = useBackendHardwarePayback();
  const { isCached: bitcoinCached, error: bitcoinError } = useBackendBitcoinValuation();
  // Monthly Income is the separately booked provider snapshot, not the
  // dated chart's provisional legacy receipts. Both are exposed by the same
  // backend response so a stale browser cache cannot silently swap them.
  const monthAccounting = backendEarnings?.monthAccountingComparison;
  const bookedMonthlyIncome = monthAccounting?.status !== "invalid-snapshot" &&
    Number.isFinite(monthAccounting?.bookedTotalUsd)
      ? monthAccounting.bookedTotalUsd : null;
  const monthlyIncome = bookedMonthlyIncome ?? backendEarnings?.monthTotalUsd ?? null;
  const monthIncomeDetail = bookedMonthlyIncome != null
    ? Math.abs(monthAccounting.differenceUsd) > 0.02
      ? `Provider ledger; dated receipts differ by ${money(Math.abs(monthAccounting.differenceUsd))}`
      : "Recorded monthly provider ledger"
    : backendEarnings?.fullyVerified === false
      ? "Includes legacy receipts awaiting provider reconciliation"
      : "Backend-recorded current month";
  const todayKey = pacificDayKey(clock);
  const passiveIncomeToday = backendEarnings?.todayKey === todayKey
    ? backendEarnings.todayTotalUsd ?? null : null;
  const yesterdayIncome = backendEarnings?.yesterdayTotalUsd ?? null;
  const todayVsYesterday = passiveIncomeToday !== null && yesterdayIncome !== null && yesterdayIncome > 0
    ? (passiveIncomeToday - yesterdayIncome) / yesterdayIncome * 100
    : null;


  const backendBreakEvenRows = Array.isArray(projectBreakEven?.rows) ? projectBreakEven.rows : [];
  const incompleteProjects = backendBreakEvenRows
    .filter(row => row.spent > 0 && row.recovered !== true)
    .sort((a,b) => b.recoveredPct - a.recoveredPct || b.daily - a.daily);

  const latest = power?.latest || null;
  const totalWatts = Number(latest?.totalWatts) || 0;
  const live = latest?.observedAt ? Date.now() - new Date(latest.observedAt).getTime() < 90000 : false;
  const powerMonth = power?.currentMonth || null;
  const monthKwh = Number(powerMonth?.totalKwh) || 0;
  const powerCost = power?.powerCost?.sourceOfCalculation === "backend-power-meter-tariffs"
    ? power.powerCost : null;
  const monthPowerCost = powerCost?.complete ? powerCost.outOfPocketUsd : null;
  const deviceRows = Array.isArray(latest?.devices) ? latest.devices : [];

  // Hardware recovery and editing checkpoints are backend-owned.
  const backendHardwareRows = new Map(
    (backendHardware?.devices || []).map(device => [String(device.id), device])
  );

  // Use the same reconciled per-source monthly totals as Income History.
  // This includes Lulo earnings even when the quick dashboard cache lacks a Lulo row.
  // Match KPI, monthly chart, and Top Projects to the one backend ledger.
  const sourceRows = backendCryptoProviderIncomeRows(backendEarnings, backendPortfolio);
  const sourceTableRows = sourceRows.map(row => ({
    ...row, meta: projectTableMeta(row.platform),
  }));

  const addSourceOptions = [...new Set([
    ...backendBreakEvenRows.map(project => project.name),
    ...(backendPortfolio?.projects || []).map(project => project.name),
    ...Object.keys(backendEarnings?.monthlySources || {}),
  ].map(canonicalSourceName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const projectAddOptions = [...backendBreakEvenRows]
    .filter(project => project.id && project.name)
    .sort((a, b) => a.name.localeCompare(b.name));
  function openAddModal(kind) {
    setAddError("");
    if (kind === "hardware") setHardwareDraft({
      name: "", cost: "", power: "", source: "", sources: [], startMonth: currentMonthKey, earningsStartDay:pacificDayKey(Date.now()),
    });
    if (kind === "project") setProjectDraft({ id: "", cost: "" });
    setAddModal(kind);
  }
  function openHardwareEditor(device) {
    setAddError("");
    setHardwareDraft({ ...device, sources:hardwareSources(device), earningsStartDay:device.earningsStartDay || "" });
    setAddModal("hardware");
  }
  async function saveHardware(event) {
    event.preventDefault();
    if (savingHardware || photoLoading) return;
    const name = hardwareDraft.name.trim();
    const sources = hardwareSources(hardwareDraft);
    const cost = Number(hardwareDraft.cost), power = Number(hardwareDraft.power || 0);
    const startDay = String(hardwareDraft.earningsStartDay || "");
    if (!name || !sources.length || !/^[0-9]{4}-[0-9]{2}$/.test(hardwareDraft.startMonth) ||
        hardwareDraft.startMonth > currentMonthKey || !Number.isFinite(cost) || cost <= 0 ||
        !Number.isFinite(power) || power < 0 ||
        (!hardwareDraft.id && !startDay) ||
        (startDay && (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(startDay) ||
        startDay > pacificDayKey(Date.now())))) {
      setAddError("Enter a name, cost, purchase month, earnings start date, and income source.");
      return;
    }
    const prior = hardware.find(row => row.id === hardwareDraft.id);
    const device = {
      ...hardwareDraft, id: prior?.id || crypto.randomUUID(),
      name, cost, power, sources, source: sources[0], earningsStartDay: startDay,
      startMonth: hardwareDraft.startMonth,
    };
    const proposed = prior
      ? hardware.map(row => row.id === prior.id ? device : row)
      : [...hardware, device];
    setAddError("");
    setSavingHardware(true);
    try {
      const reviewed = await previewHardwareCheckpointEdit(hardware, proposed);
      remoteStorage.setItem(HARDWARE_KEY, JSON.stringify(reviewed));
      window.dispatchEvent(new Event("hardware-payback-updated"));
      setHardware(reviewed);
      setAddModal(null);
    } catch (error) {
      setAddError(error?.message || "Backend checkpoint verification unavailable");
    } finally {
      setSavingHardware(false);
    }
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
    // Hide stale recovery figures until the backend reflects the new cost.
    setProjectBreakEven(null);
    setProjectRevision(current => current + 1);
    setAddModal(null);
  }

  return <div className="min-w-0 space-y-3 pb-8 text-white" data-testid="side-hustle-dashboard">
    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
      <h1 className="text-lg font-semibold text-white">Crypto Dashboard</h1>
      <span role="status" className="text-[10px] text-[#9da9b7]">
        {earningsCached || portfolioCached || bitcoinCached || powerIsCached ? "Saved backend snapshot · Updating" : "Backend data · Auto-refreshing"}
        {(earningsError || portfolioError || bitcoinError) && " · Some sources unavailable"}
      </span>
    </div>


    <nav aria-label="Crypto Dashboard sections" className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-2xl border border-[#242b33] bg-[#0d1014] px-2 py-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.18)] [scrollbar-width:none]">
      {[
        { id: "overview", label: "Overview", Icon: Home },
        { id: "passive", label: "Passive Income", Icon: Layers3 },
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
        icon={Coins}
        title="Income Today"
        value={passiveIncomeToday == null ? "—" : money(passiveIncomeToday)}
        detail={todayVsYesterday == null ? "Actual earnings today" : `${todayVsYesterday >= 0 ? "▲" : "▼"} ${Math.abs(todayVsYesterday).toFixed(1)}% vs. yesterday`}
        tone="emerald"
        valueClass="text-emerald-400"
      />
      <KpiCard
        icon={CalendarDays}
        title="Monthly Income"
        value={monthlyIncome===null ? "—" : money(monthlyIncome)}
        detail={monthIncomeDetail}
        tone="sky"
      />
      <KpiCard
        icon={Layers3}
        title="Lifetime Earned"
        value={backendEarnings?.lifetimeEarned == null ? "—" : money(backendEarnings.lifetimeEarned.totalUsd)}
        detail={backendEarnings?.lifetimeEarned
          ? `Booked earnings since ${backendEarnings.lifetimeEarned.fromMonth} · excludes principal`
          : "Waiting for complete backend income history"}
        tone="violet"
      />
      <KpiCard
        icon={Zap}
        title="Total Power"
        value={`${totalWatts.toFixed(0)} W`}
        detail={`${deviceRows.length} GPUs • ${live ? "Live" : powerIsCached ? "Saved" : "Stale"}`}
        tone="amber"
      />
    </div>
    <div className="grid min-w-0 items-stretch gap-3 xl:grid-cols-2">
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


        <div className="mt-3 grid grid-cols-1 gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))]">
          {[...hardware].sort((a, b) => {
            const rank = device => {
              const result = backendHardwareRows.get(String(device.id));
              const remaining = Number(result?.observedRemainingUsd);
              const days = Number(result?.estimatedDaysRemaining);
              if (result?.observedRemainingUsd != null && Number.isFinite(remaining) && remaining <= 0) return 0;
              return result?.estimatedDaysRemaining != null && Number.isFinite(days) && days >= 0
                ? days : Number.POSITIVE_INFINITY;
            };
            const difference = rank(a) - rank(b);
            return Number.isNaN(difference) || difference === 0
              ? String(a.name || "").localeCompare(String(b.name || "")) : difference;
          }).slice(0, 4).map(row => {
            const name = String(row.name || "");
            const lowerName = name.toLowerCase();
            const meta = lowerName.includes("2080")
              ? GPU_META.rtx2080super
              : lowerName.includes("5070")
                ? GPU_META.rtx5070
                : null;

            const selectedSources=hardwareSources(row);
            const verified=backendHardwareRows.get(String(row.id));
            const cost=verified?.cashCostUsd ?? null;
            const recovered=verified?.observedCreditUsd ?? null;
            const progress=verified?.observedProgressPct ?? null;
            const remaining=verified?.observedRemainingUsd ?? null;
            const payoffLabel=formatEstimatedPaybackMonths(
              verified?.estimatedDaysRemaining, remaining
            );

            return <div
              key={row.id} role="button" tabIndex={0}
              aria-label={`Edit ${row.name} hardware and income sources`}
              title="Click to edit hardware and income sources"
              onClick={()=>openHardwareEditor(row)}
              onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openHardwareEditor(row);}}}
              className="flex h-full min-w-0 cursor-pointer flex-col rounded-xl border border-[#202a33] bg-[linear-gradient(180deg,#10151a_0%,#0d1217_100%)] p-3 transition-colors hover:border-emerald-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            >
              <div className="flex min-w-0 flex-col gap-2">
                <div className="relative flex min-w-0 items-start gap-2">
                <div className="flex h-20 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-[#26313b] bg-[#0a0e12]">
                  <img src={hardwareImageFor(row)} alt={row.name + " hardware"}
                    className="h-full w-full object-contain px-1"/>
                </div>
                <span className="inline-flex shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-emerald-400">
                  {cost != null && progress != null ? percent(progress) : "—"}
                </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[12px] font-semibold text-[#eef2f6]">{row.name}</p>
                  <p className="mt-0.5 text-[9px] uppercase tracking-[0.13em] text-[#7f8b97]">{selectedSources.join(" · ") || meta?.brand || "Hardware"}</p>
                  {row.earningsStartDay && <p className="mt-1 text-[10px] text-sky-300">Earnings since {row.earningsStartDay}</p>}
                </div>

              </div>
              <div className="mt-3 flex flex-1 flex-col divide-y divide-[#25313c] border-t border-[#25313c]">
                <div className="flex min-w-0 flex-col-reverse gap-1 py-2.5">
                  <strong className="block break-words text-[16px] font-semibold tabular-nums text-amber-400 ">{cost == null ? "—" : money(cost)}</strong>
                  <p className="text-[10px] leading-tight text-[#8fa0ad]">Amount Spent</p>
                </div>
                <div className="flex min-w-0 flex-col-reverse gap-1 py-2.5">
                  <strong className="block break-words text-[16px] font-semibold tabular-nums text-[#eef2f6] ">{recovered == null ? "—" : money(recovered)}</strong>
                  <p className="text-[10px] leading-tight text-[#8fa0ad]">Earned so far</p>
                </div>
                <div className="flex min-w-0 flex-col-reverse gap-1 py-2.5">
                  <strong className="block break-words text-[16px] font-semibold tabular-nums text-[#eef2f6] " title={verified?.estimatedDailyCreditUsd != null
                    ? `${verified.forecastBasis==="blend-70pct-7day-30pct-live-kryptex" ? "70% 7-day average + 30% live Kryptex estimate" : "7-day observed average (live Kryptex unavailable)"}: ${money(verified.estimatedDailyCreditUsd)}/day · ${verified.estimatedDaysRemaining ?? "?"} days remaining`
                    : "No reliable estimate available yet"}>{payoffLabel}</strong>
                  <p className="text-[10px] leading-tight text-[#8fa0ad]">{verified?.forecastPartial && payoffLabel !== "—" && payoffLabel !== "Recovered" ? "Est. payback · partial data" : "Estimated payback time"}</p>
                </div>
              </div>
            </div>;
          })}
          {!hardware.length && <p className="col-span-full rounded-xl border border-dashed border-[#2a343e] py-8 text-center text-xs text-[#778491]">No hardware tracked yet.</p>}
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
            disabled={!projectBreakEven || projectBreakEvenError}
            onClick={() => openAddModal("project")}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.08] px-2.5 text-[10px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/15"
          >
            <Plus className="h-3.5 w-3.5"/>
            Add
          </button>
        </div>

        <div className="mt-3 divide-y divide-[#202932]">
          {incompleteProjects.slice(0, 3).map(row => {
            const spent = row.spent;
            const earned = row.earned;
            const ratio = Math.min(100, Math.max(0, row.recoveredPct));
            const days = row.daysToProfit;
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
          {!projectBreakEven && <p role="status" className="py-8 text-center text-xs text-[#778491]">
            {projectBreakEvenError ? "Backend break-even data unavailable." : "Loading backend break-even data…"}
          </p>}
          {projectBreakEven && projectBreakEvenError && <p role="status" className="py-2 text-center text-xs text-amber-300">Showing last verified break-even figures while the backend refresh is unavailable.</p>}
          {projectBreakEven && !incompleteProjects.length && <p className="py-8 text-center text-xs text-[#778491]">All configured projects have broken even.</p>}
        </div>
      </section>
    </div>

    <div className="grid min-w-0 items-stretch gap-3 xl:grid-cols-2">
      <section className={panel + " min-w-0 overflow-hidden px-4 pb-3 pt-3.5"}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-[#a8b6c4]"/>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold leading-none">Top Projects</h2>
              
            </div>
          </div>
        </div>

        <div className="mt-3 w-full min-w-0 overflow-x-auto">
          <div className="grid min-w-[620px] grid-cols-[1.5fr_.9fr_1fr_1.05fr_.75fr] items-center gap-x-3 border-b border-[#25303a] px-1 pb-1.5 text-[9px] text-[#8a96a3]">
            <span>Project</span>
            <span>Type</span>
            <span className="text-right">Income (Today)</span>
            <span className="text-right">Income (MTD)</span>
            <span className="text-right">Status</span>
          </div>

          <div className="divide-y divide-[#202932]">
            {sourceTableRows.map(row => (
              <div key={row.platform} className="grid min-w-[620px] grid-cols-[1.5fr_.9fr_1fr_1.05fr_.75fr] items-center gap-x-3 px-1 py-2 text-[11px]">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${row.meta.iconClass}`}>{row.meta.icon}</span>
                  <span className="truncate font-medium text-[#e8edf2]">{row.platform}</span>
                </div>
                <div>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-medium ${row.meta.typeClass}`}>{row.meta.type}</span>
                </div>
                <strong className="text-right font-semibold tabular-nums text-[#eef2f6]" title={row.daily == null ? "No confirmed daily earnings record available" : "Recorded earnings for today"}>{row.daily == null ? "—" : money(row.daily)}</strong>
                <strong className="text-right font-semibold tabular-nums text-[#eef2f6]">{money(row.amount)}</strong>
                <div className="flex justify-end">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-medium ${row.inactive === true
                    ? "border-[#405165] bg-[#1b222a] text-[#9eabb9]"
                    : row.inactive === false
                      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                      : "border-amber-400/25 bg-amber-400/10 text-amber-300"}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current"/>
                    {row.inactive === true ? "Inactive" : row.inactive === false ? "Active" : "Unverified"}
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
                <strong className="mt-1.5 block text-[22px] font-semibold tracking-tight text-emerald-400">{monthlyIncome===null ? "—" : money(monthlyIncome)}</strong>

              </div>
              <div className="border-b border-[#242d35] pb-5 pl-5">
                <p className="text-[10px] text-[#83909d]">Mining Energy</p>
                <strong className="mt-1.5 block text-[22px] font-semibold tracking-tight text-cyan-300">{monthKwh.toFixed(2)} kWh</strong>
                <p className="mt-1 text-[9px] text-cyan-300/80">{deviceRows.length} GPUs tracked</p>
              </div>
              <div className="border-r border-[#242d35] pt-5 pr-5">
                <p className="text-[10px] text-[#83909d]">Mining Cost</p>
                <strong className="mt-1.5 block text-[22px] font-semibold tracking-tight text-amber-400">{monthPowerCost == null ? "—" : money(monthPowerCost)}</strong>
                
              </div>
              <div className="pt-5 pl-5">
                <p className="text-[10px] text-[#83909d]">Est. Net Profit (MTD)</p>
                <strong className="mt-1.5 block text-[22px] font-semibold tracking-tight text-emerald-400">{monthlyIncome == null || monthPowerCost == null ? "—" : money(monthlyIncome - monthPowerCost)}</strong>
                
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
    </> : null}
    {activeView === "passive" && <div className="pt-1"><YieldFarmingPage/></div>}
    {addModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
        onMouseDown={event => { if (event.target === event.currentTarget) setAddModal(null); }}>
        <form onSubmit={addModal === "hardware" ? saveHardware : saveProjectCost}
          role="dialog" aria-modal="true" aria-label={addModal === "hardware" ? (hardwareDraft.id ? "Edit hardware" : "Add hardware") : "Add project break-even cost"}
          className="w-full max-w-2xl max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain space-y-4 rounded-2xl border border-[#263342] bg-[#0b1017] p-5 sm:p-7 text-white shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{addModal === "hardware" ? (hardwareDraft.id ? "Edit hardware" : "Add hardware") : "Add project break-even cost"}</h2>
            <button type="button" aria-label="Close" onClick={() => setAddModal(null)}
              className="rounded-lg p-1 text-[#91a4b8] hover:bg-white/10 hover:text-white"><X className="h-5 w-5"/></button>
          </div>
          {addModal === "hardware" ? (
            <>
              <label className="block text-sm">Hardware name
                <input autoFocus required value={hardwareDraft.name} onChange={event => setHardwareDraft(current => ({ ...current, name: event.target.value }))}
                  placeholder="RTX 5070" className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"/>
              </label>
              <div className="space-y-2">
                <span className="text-sm">Hardware photo</span>
                <div className="flex items-center gap-3">
                  <img src={hardwareImageFor(hardwareDraft)} alt="Hardware photo preview"
                    className="h-20 w-32 shrink-0 rounded-lg border border-[#3c5267] bg-[#111b25] object-contain p-1"/>
                  <div className="min-w-0 flex-1 space-y-2">
                    <input type="file" accept="image/jpeg,image/png,image/webp"
                      aria-label="Upload hardware photo" disabled={photoLoading}
                      onChange={async event=>{
                        const file=event.target.files?.[0];if(!file)return;
                        setPhotoLoading(true);setAddError("");
                        try{
                          const photo=await prepareHardwarePhoto(file);
                          setHardwareDraft(current=>({...current,photo}));
                        }catch(error){setAddError(error?.message || "Unable to load photo.");}
                        finally{setPhotoLoading(false);event.target.value="";}
                      }}
                      className="block w-full text-xs text-[#aab9c6] file:mr-2 file:rounded-md file:border-0 file:bg-[#243a4e] file:px-2 file:py-1.5 file:text-white"/>
                    {hardwareDraft.photo && <button type="button"
                      onClick={()=>setHardwareDraft(current=>({...current,photo:""}))}
                      className="text-xs text-rose-300 hover:underline">Remove photo</button>}
                    <p className="text-[11px] text-[#91a4b8]">Optional JPG, PNG or WebP. RTX 5080 has a transparent default image.</p>
                  </div>
                </div>
              </div>
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
              <fieldset className="space-y-2">
                <legend className="text-sm">Income sources (select multiple)</legend>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-[#3c5267] bg-[#111b25] p-2">
                  {[...new Set([...addSourceOptions,...hardwareSources(hardwareDraft)])].map(source=>
                    <label key={source} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white/5">
                      <input type="checkbox" checked={hardwareSources(hardwareDraft).includes(source)}
                        onChange={event=>setHardwareDraft(current=>{
                          const selected=hardwareSources(current);
                          const sources=event.target.checked ? [...selected,source] : selected.filter(name=>name!==source);
                          return {...current,sources,source:sources[0] || ""};
                        })}
                        className="h-4 w-4 accent-emerald-400"/>
                      {source}
                    </label>
                  )}
                </div>
              </fieldset>
              <label className="block text-sm">Purchase month
                <input required type="month" max={currentMonthKey} value={hardwareDraft.startMonth}
                  onChange={event => setHardwareDraft(current => ({ ...current, startMonth: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"/>
              </label>
              <label className="block text-sm">Earnings start date
                <input type="date" max={pacificDayKey(Date.now())} value={hardwareDraft.earningsStartDay || ""}
                  onChange={event=>setHardwareDraft(current=>({...current,earningsStartDay:event.target.value}))}
                  className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"/>
                <span className="mt-1 block text-xs text-[#91a4b8]">Counts available daily earnings beginning at midnight Pacific on this date. New devices need an explicit start date. Income source changes take effect the next Pacific day; earlier provider credits remain unchanged.</span>
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
            <button type="submit" disabled={photoLoading || savingHardware} className="flex-1 rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-[#061810] disabled:opacity-50">
              {savingHardware ? "Verifying…" : addModal === "hardware" ? (hardwareDraft.id ? "Save changes" : "Save hardware") : "Save project cost"}
            </button>
          </div>
        </form>
      </div>
    )}
  </div>;
}

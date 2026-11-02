import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { remoteStorage, subscribe } from "@/lib/serverStore";
import {
  PROJECT_QUICK_CACHE_KEY, createLoopscaleProjectCard, createLuloProjectCard,
  formatCurrency, getKryptexStats, getPaybackStats, getRollerCoinTrackerStats,
  getSaladTrackerStats, getUnetworkTrackerStats, groupManualPositions,
  loadKryptexTracker, loadPositions, loadProjectPayback, loadRollerCoinTracker,
  loadSaladTracker, loadUnetworkTracker, readObject, saveProjectPayback,
} from "@/lib/yieldFarmingAccounting";

const panel = "rounded-2xl border border-[#263342] bg-[#0b1017]";
const colors = {
  Kryptex: "#fbbf24", Salad: "#34d399", RollerCoin: "#fb7185",
  Unetwork: "#a78bfa", Lulo: "#a3e635", Loopscale: "#60a5fa",
};
const money = value => formatCurrency(Number(value) || 0);
const percent = value => `${Math.round(value)}%`;

function readProjects() {
  const cache = readObject(PROJECT_QUICK_CACHE_KEY);
  const lulo = (Array.isArray(cache.projects) ? cache.projects : [])
    .filter(project => project?.yield_tracking === "lulo_lending")
    .map(createLuloProjectCard);
  const loopscale = createLoopscaleProjectCard(cache.loopscaleSnapshot);
  const manual = groupManualPositions(loadPositions());
  const salad = getSaladTrackerStats(loadSaladTracker());
  const rollercoin = getRollerCoinTrackerStats(loadRollerCoinTracker());
  const unetwork = getUnetworkTrackerStats(loadUnetworkTracker());
  const kryptex = getKryptexStats(loadKryptexTracker());
  const rows = [
    ...manual.map(project => ({
      id: project.id, name: project.platform, earned: project.earned,
      daily: project.totalBalance * (project.weightedApy || 0) / 100 / 365,
    })),
    { id: "salad-project", name: "Salad", earned: salad.lifetimeUsd, daily: salad.estimatedDailyUsd },
    { id: "rollercoin-project", name: "RollerCoin", earned: rollercoin.lifetimeUsd, daily: 0 },
    { id: "unetwork-project", name: "Unetwork", earned: unetwork.lifetimeUsd, daily: unetwork.estimatedDailyUsd },
    { id: "kryptex-project", name: "Kryptex", earned: kryptex.lifetimeUsd, daily: kryptex.dailyUsd },
  ];
  const payback = loadProjectPayback();
  return {
    rows: rows.map(row => ({ ...row, spent: Number(payback[row.id]?.totalSpent) || 0 })),
    savings: [...lulo, ...(loopscale ? [loopscale] : [])]
      .map(project => ({ id: project.id, name: project.platform, balance: project.totalBalance })),
    payback,
  };
}

export default function ProjectBreakEvenPage() {
  const [data, setData] = useState(readProjects);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  useEffect(() => subscribe(() => setData(readProjects())), []);

  const ranked = useMemo(() => [...data.rows].sort((a, b) => {
    if (!a.spent || !b.spent) return Number(Boolean(b.spent)) - Number(Boolean(a.spent));
    return b.earned / b.spent - a.earned / a.spent;
  }), [data.rows]);
  const inProgress = ranked.filter(row => !row.spent || row.earned < row.spent);
  const recoveredProjects = ranked.filter(row => row.spent > 0 && row.earned >= row.spent);
  const selected = ranked.find(row => row.id === selectedId) || ranked[0];
  const configured = ranked.filter(row => row.spent > 0);
  const totalSpent = configured.reduce((sum, row) => sum + row.spent, 0);
  const totalEarned = configured.reduce((sum, row) => sum + Math.max(0, Number(row.earned) || 0), 0);
  const recovered = configured.filter(row => row.earned >= row.spent).length;
  const overall = totalSpent > 0 ? totalEarned / totalSpent * 100 : 0;
  const selectedStats = selected && getPaybackStats(selected.earned, selected.daily, selected.spent);

  function startEdit() {
    setDraft(selected?.spent > 0 ? String(selected.spent) : "");
    setEditing(true);
  }
  function selectProject(id) {
    setSelectedId(id);
    setEditing(false);
  }
  function saveSpent(event) {
    event.preventDefault();
    const value = draft.trim() === "" ? 0 : Number(draft);
    if (!Number.isFinite(value) || value < 0 || !selected) return;
    const next = { ...loadProjectPayback() };
    if (value > 0) next[selected.id] = { totalSpent: value, updatedAt: new Date().toISOString() };
    else delete next[selected.id];
    saveProjectPayback(next);
    setData(readProjects());
    setEditing(false);
  }

  function projectRow(row, index) {
    const ratio = row.spent > 0 ? Math.max(0, row.earned) / row.spent * 100 : 0;
    const color = colors[row.name] || "#38bdf8";
    return <button key={row.id} type="button" onClick={() => selectProject(row.id)}
      className={`w-full rounded-xl border p-3 text-left transition-colors sm:p-4 ${selected?.id === row.id ? "border-[#3ba580] bg-[#12231f]" : "border-[#263342] bg-[#101922] hover:border-[#3c5267]"}`}
      aria-pressed={selected?.id === row.id}>
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-semibold tabular-nums text-[#91a4b8]">{String(index + 1).padStart(2, "0")}</span>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{row.name}</span>
        <span className={`text-lg font-semibold tabular-nums ${ratio >= 100 ? "text-[#32d99b]" : "text-white"}`}>{row.spent ? percent(ratio) : "Add cost"}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[#91a4b8]" />
      </div>
      <p className="mt-2 text-xs tabular-nums text-[#91a4b8]">{row.spent ? `${money(row.earned)} earned of ${money(row.spent)} spent` : `${money(row.earned)} recorded earnings`}</p>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#273647]"><div className="h-full rounded-full transition-[width]" style={{ width: `${Math.min(100, ratio)}%`, backgroundColor: color }} /></div>
    </button>;
  }

  return <div className="min-w-0 space-y-3 pb-7 text-white" data-testid="project-break-even-page">
    <header className="px-1">
      <h1 className="text-[22px] font-semibold tracking-tight">Project Break-Even</h1>
      <p className="mt-1 text-xs text-[#91a4b8]">Track how much of each project’s entered costs its recorded earnings have covered.</p>
    </header>

    <section className={`${panel} p-5`} aria-label="Earnings-only cost recovery">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#91a4b8]">Earnings-only cost recovery</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <strong className="text-[42px] leading-none tracking-tight text-[#32d99b]">{totalSpent ? percent(overall) : "—"}</strong>
            <span className="text-sm text-[#c8d3df]">of entered costs recovered</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#273647]">
            <div className="h-full rounded-full bg-[#32d99b] transition-[width]" style={{ width: `${Math.min(100, overall)}%` }} />
          </div>
        </div>
        <div className="space-y-1 border-t border-[#263342] pt-4 text-sm lg:border-l lg:border-t-0 lg:py-2 lg:pl-6">
          <p><strong className="text-white">{money(totalEarned)}</strong> <span className="text-[#91a4b8]">earned</span></p>
          <p><strong className="text-white">{money(totalSpent)}</strong> <span className="text-[#91a4b8]">spent</span></p>
          <p className="pt-1 text-xs text-[#91a4b8]">{recovered} of {configured.length} with costs recovered</p>
        </div>
      </div>
      {!configured.length && <p className="mt-3 text-xs text-[#91a4b8]">Add a total spent amount to a project below to begin tracking recovery.</p>}
    </section>

    <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]">
      <section className={`${panel} min-w-0 p-4 sm:p-5`} aria-label="Still in progress">
        <div className="flex items-baseline justify-between gap-2"><h2 className="text-base font-semibold">Still in progress</h2><span className="text-xs text-[#91a4b8]">{inProgress.length} projects</span></div>
        <p className="mt-0.5 text-[11px] text-[#91a4b8]">Updates from your Passive Income earnings and saved costs</p>
        <div className="mt-4 space-y-2">
          {inProgress.map(projectRow)}
          {!inProgress.length && <p className="rounded-xl border border-[#263342] bg-[#101922] px-4 py-6 text-center text-sm text-[#91a4b8]">All projects with entered costs have recovered them.</p>}
        </div>
      </section>

      <section className={`${panel} min-w-0 p-4 sm:p-5`} aria-label="Selected project recovery">
        {selected ? <>
          <h2 className="text-lg font-semibold">{selected.name}</h2>
          <p className="mt-0.5 text-[11px] text-[#91a4b8]">Earnings-only recovery</p>
          <strong className="mt-7 block text-[42px] leading-none tracking-tight">{selected.spent ? percent(Math.max(0, selected.earned) / selected.spent * 100) : "—"}</strong>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#273647]"><div className="h-full rounded-full" style={{ width: `${selected.spent ? Math.min(100, Math.max(0, selected.earned) / selected.spent * 100) : 0}%`, backgroundColor: colors[selected.name] || "#38bdf8" }} /></div>
          <dl className="mt-5 divide-y divide-[#263342] border-t border-[#263342]">
            <div className="flex justify-between gap-3 py-3"><dt className="text-xs text-[#91a4b8]">Total spent</dt><dd className="font-semibold tabular-nums">{selected.spent ? money(selected.spent) : "Not entered"}</dd></div>
            <div className="flex justify-between gap-3 py-3"><dt className="text-xs text-[#91a4b8]">Lifetime earned</dt><dd className="font-semibold tabular-nums">{money(selected.earned)}</dd></div>
            <div className="flex justify-between gap-3 py-3"><dt className="text-xs text-[#91a4b8]">{selectedStats?.remaining === 0 ? "Above entered cost" : "Still to recover"}</dt><dd className={`font-semibold tabular-nums ${selectedStats?.remaining === 0 ? "text-[#32d99b]" : "text-[#fbbf24]"}`}>{selectedStats?.configured ? money(selectedStats.remaining === 0 ? Math.max(0, selectedStats.pnl) : selectedStats.remaining) : "—"}</dd></div>
          </dl>
          <div className="mt-3 rounded-xl border border-[#276751] bg-[#12221e] p-3.5">
            <p className="text-xs text-[#91a4b8]">At current earnings pace</p>
            <p className="mt-1 text-sm font-semibold">{!selectedStats?.configured ? "Enter a cost to estimate recovery" : selectedStats.remaining === 0 ? "Entered costs recovered" : selectedStats.daysToProfit != null ? `About ${selectedStats.daysToProfit.toLocaleString()} days to recover` : "No reliable daily pace available"}</p>
            <p className="mt-1 text-[11px] text-[#91a4b8]">Forecast only; earnings can change.</p>
          </div>
          {editing ? <form onSubmit={saveSpent} className="mt-4 space-y-2">
            <label htmlFor="break-even-spent" className="text-xs text-[#c8d3df]">Total spent (USD)</label>
            <input id="break-even-spent" autoFocus type="number" min="0" step="0.01" value={draft} onChange={event => setDraft(event.target.value)} placeholder="0.00" className="w-full rounded-lg border border-[#3c5267] bg-[#111b25] px-3 py-2 text-sm outline-none focus:border-[#32d99b]" />
            <div className="flex gap-2"><button type="submit" className="flex-1 rounded-lg bg-[#32d99b] px-3 py-2 text-xs font-semibold text-[#082019]">Save</button><button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-[#3c5267] px-3 py-2 text-xs">Cancel</button></div>
          </form> : <button type="button" onClick={startEdit} className="mt-4 w-full rounded-lg border border-[#3c5267] bg-[#192936] px-3 py-2.5 text-xs font-semibold hover:bg-[#203447]">Edit total spent</button>}
        </> : <p className="text-sm text-[#91a4b8]">No projects available yet.</p>}
      </section>
    </div>

    <section className={`${panel} min-w-0 p-4 sm:p-5`} aria-label="Recovered projects">
      <div className="flex items-baseline justify-between gap-2"><h2 className="text-base font-semibold">Recovered</h2><span className="text-xs text-[#91a4b8]">{recoveredProjects.length} projects</span></div>
      <p className="mt-0.5 text-[11px] text-[#91a4b8]">Recorded earnings have reached or exceeded the total spent you entered</p>
      {recoveredProjects.length ? <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{recoveredProjects.map(projectRow)}</div>
        : <p className="mt-4 rounded-xl border border-[#263342] bg-[#101922] px-4 py-6 text-center text-sm text-[#91a4b8]">Projects will move here automatically once their recorded earnings cover their entered costs.</p>}
    </section>

    {data.savings.length > 0 && <section className={`${panel} p-4 sm:p-5`} aria-label="Balances that remain yours">
      <h2 className="text-sm font-semibold">Balances that remain yours</h2>
      <p className="mt-1 text-xs text-[#91a4b8]">Lulo and Loopscale deposits are assets, so they are separate from earnings-only cost recovery.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">{data.savings.map(row => <div key={row.id} className="flex items-center justify-between rounded-xl border border-[#263342] bg-[#101922] px-4 py-3 text-sm"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[row.name] }} />{row.name}</span><strong className="tabular-nums">{money(row.balance)}</strong></div>)}</div>
    </section>}
    <p className="px-1 text-[11px] text-[#91a4b8]">Recovery compares recorded lifetime earnings with costs you enter. It excludes current balances and does not represent realized profit.</p>
  </div>;
}

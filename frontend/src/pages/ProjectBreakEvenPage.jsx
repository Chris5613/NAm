import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { subscribe } from "@/lib/serverStore";
import {
  formatCurrency, getKryptexStats, getPaybackStats, getRollerCoinTrackerStats,
  getSaladTrackerStats, getUnetworkTrackerStats, groupManualPositions,
  loadKryptexTracker, loadPositions, loadProjectPayback, loadRollerCoinTracker,
  loadSaladTracker, loadUnetworkTracker, saveProjectPayback,
} from "@/lib/yieldFarmingAccounting";

const panel = "rounded-2xl border border-[#263342] bg-[#0b1017]";
const colors = {
  Kryptex: "#fbbf24", Salad: "#34d399", RollerCoin: "#fb7185",
  Unetwork: "#a78bfa",
};
const money = value => formatCurrency(Number(value) || 0);
const percent = value => `${Math.round(value)}%`;
const isRecovered = row =>
  row.spent > 0 ? row.earned >= row.spent : row.id === "salad-project" && row.earned > 0;

function readProjects() {
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
  };
}

export default function ProjectBreakEvenPage() {
  const [data, setData] = useState(readProjects);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const closeButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  useEffect(() => subscribe(() => setData(readProjects())), []);
  useEffect(() => {
    if (!selectedId) return undefined;
    closeButtonRef.current?.focus();
    const onKeyDown = event => {
      if (event.key === "Escape") {
        setSelectedId(null);
        setEditing(false);
        triggerRef.current?.focus();
      } else if (event.key === "Tab") {
        const focusable = [...(dialogRef.current?.querySelectorAll('button:not([disabled]), input:not([disabled])') || [])];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  const ranked = useMemo(() => [...data.rows].sort((a, b) => {
    if (!a.spent || !b.spent) return Number(Boolean(b.spent)) - Number(Boolean(a.spent));
    return b.earned / b.spent - a.earned / a.spent;
  }), [data.rows]);
  const inProgress = ranked.filter(row => !isRecovered(row));
  const recoveredProjects = ranked.filter(isRecovered);
  const selected = ranked.find(row => row.id === selectedId) || null;
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
  function selectProject(id, event) {
    triggerRef.current = event.currentTarget;
    setSelectedId(id);
    setEditing(false);
  }
  function closeProject() {
    setSelectedId(null);
    setEditing(false);
    triggerRef.current?.focus();
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
    const noCostSalad = row.id === "salad-project" && !row.spent && row.earned > 0;
    return <button key={row.id} type="button" onClick={event => selectProject(row.id, event)}
      className="w-full rounded-xl border border-[#263342] bg-[#101922] p-3 text-left transition-colors hover:border-[#3c5267] sm:p-4"
      aria-haspopup="dialog">
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-semibold tabular-nums text-[#91a4b8]">{String(index + 1).padStart(2, "0")}</span>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{row.name}</span>
        <span className={`text-lg font-semibold tabular-nums ${ratio >= 100 || noCostSalad ? "text-[#32d99b]" : "text-white"}`}>{row.spent ? percent(ratio) : noCostSalad ? "No cost" : "Add cost"}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[#91a4b8]" />
      </div>
      <p className="mt-2 text-xs tabular-nums text-[#91a4b8]">{row.spent ? `${money(row.earned)} earned of ${money(row.spent)} spent` : `${money(row.earned)} recorded earnings`}</p>
      {row.spent > 0 && !isRecovered(row) && <p className="mt-1 text-xs font-semibold tabular-nums text-[#fbbf24]">{money(Math.max(0, row.spent - row.earned))} left to earn</p>}
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#273647]"><div className="h-full rounded-full transition-[width]" style={{ width: `${noCostSalad ? 100 : Math.min(100, ratio)}%`, backgroundColor: color }} /></div>
    </button>;
  }

  return <div className="min-w-0 space-y-3 pb-7 text-white" data-testid="project-break-even-page">
    <header className="px-1">
      <h1 className="text-[22px] font-semibold tracking-tight">Project Break-Even</h1>
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

    <div className="grid items-stretch gap-3 lg:grid-cols-2">
      <section className={`${panel} min-w-0 p-4 sm:p-5`} aria-label="Still in progress">
        <div className="flex items-baseline justify-between gap-2"><h2 className="text-base font-semibold">Still in progress</h2><span className="text-xs text-[#91a4b8]">{inProgress.length} projects</span></div>
        <p className="mt-0.5 text-[11px] text-[#91a4b8]">Updates from your Passive Income earnings and saved costs</p>
        <div className="mt-4 space-y-2">
          {inProgress.map(projectRow)}
          {!inProgress.length && <p className="rounded-xl border border-[#263342] bg-[#101922] px-4 py-6 text-center text-sm text-[#91a4b8]">All projects with entered costs have recovered them.</p>}
        </div>
      </section>

      <section className={`${panel} min-w-0 p-4 sm:p-5`} aria-label="Recovered projects">
        <div className="flex items-baseline justify-between gap-2"><h2 className="text-base font-semibold">Recovered</h2><span className="text-xs text-[#91a4b8]">{recoveredProjects.length} projects</span></div>
        <p className="mt-0.5 text-[11px] text-[#91a4b8]">Earnings cover the entered cost; Salad also appears here when it has earnings and no cost entered</p>
        {recoveredProjects.length ? <div className="mt-4 space-y-2">{recoveredProjects.map(projectRow)}</div>
          : <p className="mt-4 rounded-xl border border-[#263342] bg-[#101922] px-4 py-6 text-center text-sm text-[#91a4b8]">Projects move here automatically as their recorded earnings cover their entered costs.</p>}
      </section>
    </div>

    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onMouseDown={event => { if (event.target === event.currentTarget) closeProject(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="break-even-dialog-title" className={`${panel} max-h-[90vh] w-full max-w-md overflow-y-auto p-5 shadow-2xl sm:p-6`}>
        <div className="flex items-start justify-between gap-4">
          <div><h2 id="break-even-dialog-title" className="text-lg font-semibold">{selected.name}</h2><p className="mt-0.5 text-xs text-[#91a4b8]">Earnings-only recovery</p></div>
          <button ref={closeButtonRef} type="button" onClick={closeProject} aria-label="Close project details" className="rounded-lg p-1.5 text-[#91a4b8] hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <strong className="mt-6 block text-4xl tracking-tight">{selected.spent ? percent(Math.max(0, selected.earned) / selected.spent * 100) : "—"}</strong>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#273647]"><div className="h-full rounded-full" style={{ width: `${selected.spent ? Math.min(100, Math.max(0, selected.earned) / selected.spent * 100) : selected.id === "salad-project" && selected.earned > 0 ? 100 : 0}%`, backgroundColor: colors[selected.name] || "#38bdf8" }} /></div>
        <dl className="mt-5 divide-y divide-[#263342] border-t border-[#263342] text-sm">
          <div className="flex justify-between gap-3 py-3"><dt className="text-[#91a4b8]">Total spent</dt><dd className="font-semibold tabular-nums">{selected.spent ? money(selected.spent) : "Not entered"}</dd></div>
          <div className="flex justify-between gap-3 py-3"><dt className="text-[#91a4b8]">Lifetime earned</dt><dd className="font-semibold tabular-nums">{money(selected.earned)}</dd></div>
          <div className="flex justify-between gap-3 py-3"><dt className="text-[#91a4b8]">{selectedStats?.remaining === 0 ? "Above entered cost" : "Still to recover"}</dt><dd className="font-semibold tabular-nums">{selectedStats?.configured ? money(selectedStats.remaining === 0 ? Math.max(0, selectedStats.pnl) : selectedStats.remaining) : "—"}</dd></div>
        </dl>
        <div className="mt-3 rounded-xl border border-[#276751] bg-[#12221e] p-3.5 text-xs">
          <p>{selected.id === "salad-project" && !selected.spent && selected.earned > 0 ? "Salad has recorded earnings and no entered cost to recover." : !selectedStats?.configured ? "Enter a cost to estimate recovery." : selectedStats.remaining === 0 ? "Entered costs recovered." : selectedStats.daysToProfit != null ? `About ${selectedStats.daysToProfit.toLocaleString()} days to recover at the current earnings pace.` : "No reliable daily pace available."}</p>
          {selectedStats?.configured && selectedStats.remaining > 0 && <p className="mt-1 text-[#91a4b8]">Forecast only; earnings can change.</p>}
        </div>
        {editing ? <form onSubmit={saveSpent} className="mt-4 space-y-2">
          <label htmlFor="break-even-spent" className="text-xs text-[#c8d3df]">Total spent (USD)</label>
          <input id="break-even-spent" autoFocus type="number" min="0" step="0.01" value={draft} onChange={event => setDraft(event.target.value)} placeholder="0.00" className="w-full rounded-lg border border-[#3c5267] bg-[#111b25] px-3 py-2 text-sm outline-none focus:border-[#32d99b]" />
          <div className="flex gap-2"><button type="submit" className="flex-1 rounded-lg bg-[#32d99b] px-3 py-2 text-xs font-semibold text-[#082019]">Save</button><button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-[#3c5267] px-3 py-2 text-xs">Cancel</button></div>
        </form> : <button type="button" onClick={startEdit} className="mt-4 w-full rounded-lg border border-[#3c5267] bg-[#192936] px-3 py-2.5 text-xs font-semibold hover:bg-[#203447]">Edit total spent</button>}
      </section>
    </div>}

  </div>;
}

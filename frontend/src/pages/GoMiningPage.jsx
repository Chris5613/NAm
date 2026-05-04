import { useEffect, useMemo, useState, useRef } from "react";
import { localStorage as storage } from "@/lib/localStorage";
import { coinGeckoApi } from "@/lib/external-apis";
import { projectsApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Pickaxe, Plus, Trash2, Download, Save, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const GMT_COINGECKO_ID = "gmt-token"; // GoMining Token (symbol GOMINING) on CoinGecko
const GMT_PRICE_REFRESH_MS = 60_000;
const GOMINING_PROJECT_NAME = "GoMining";

const COLS = [
  { key: "date",            label: "Date",          type: "date",   width: 120 },
  { key: "cp_ths",          label: "CP (TH/s)",     type: "number", width: 110 },
  { key: "pr",              label: "PR",            type: "money",  width: 110 },
  { key: "electricity",     label: "Electricity",   type: "money",  width: 110 },
  { key: "service",         label: "Service",       type: "money",  width: 110 },
  // Reward is computed (read-only).
  { key: "reward",          label: "Reward",        type: "computed", width: 110 },
  { key: "total_discount",  label: "Total discount",type: "money",  width: 130 },
  { key: "gmt_earned",      label: "GMT Earned",    type: "number", width: 120 },
];

function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatNumber(value, decimals = 4) {
  const n = Number(value) || 0;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function todayIso() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function newRow() {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`,
    date: todayIso(),
    cp_ths: 0,
    pr: 0,
    electricity: 0,
    service: 0,
    total_discount: 0,
    gmt_earned: 0,
  };
}

// Per the user's formula: Reward = PR − Electricity + Service + (GMT_earned × GMT_price)
function computeReward(row, gmtPrice = 0) {
  const pr = Number(row.pr) || 0;
  const elec = Number(row.electricity) || 0;
  const svc = Number(row.service) || 0;
  const gmt = Number(row.gmt_earned) || 0;
  return pr - elec + svc + gmt * gmtPrice;
}

export default function GoMiningPage() {
  const [rows, setRows] = useState(() => storage.getGoMining());
  const [gmtPrice, setGmtPrice] = useState(0);
  const [priceLoading, setPriceLoading] = useState(true);

  // Snapshot of rewards last synced to the Investment Overview's GoMining
  // project. Map: { [rowId]: rewardAtLastSync }. Anything missing is treated
  // as 0 so brand-new rows count as a full delta on first sync.
  const [syncedMap, setSyncedMap] = useState(() => storage.getGoMiningSynced());
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncSubmitting, setSyncSubmitting] = useState(false);

  // Persist on every change.
  useEffect(() => { storage.setGoMining(rows); }, [rows]);

  // Re-read the synced snapshot whenever the tab regains focus — covers the
  // case where the user edited/deleted a GoMining auto-sync transaction in
  // the Investment Overview, which mutates `networth_gomining_synced`.
  useEffect(() => {
    const refresh = () => setSyncedMap(storage.getGoMiningSynced());
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // Live GoMining (GMT) token price.
  useEffect(() => {
    let cancelled = false;
    const fetchPrice = async () => {
      try {
        const p = await coinGeckoApi.getPrice(GMT_COINGECKO_ID);
        if (!cancelled && p > 0) setGmtPrice(p);
      } catch { /* silent */ }
      finally { if (!cancelled) setPriceLoading(false); }
    };
    fetchPrice();
    const id = setInterval(fetchPrice, GMT_PRICE_REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [rows],
  );

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.pr += Number(r.pr) || 0;
        acc.electricity += Number(r.electricity) || 0;
        acc.service += Number(r.service) || 0;
        acc.total_discount += Number(r.total_discount) || 0;
        acc.gmt_earned += Number(r.gmt_earned) || 0;
        acc.reward += computeReward(r, gmtPrice);
        return acc;
      },
      { pr: 0, electricity: 0, service: 0, total_discount: 0, reward: 0, gmt_earned: 0 },
    );
  }, [rows, gmtPrice]);

  const gmtUsd = totals.gmt_earned * gmtPrice;

  const updateRow = (id, key, value) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  };

  const addRow = () => {
    setRows((prev) => [newRow(), ...prev]);
  };

  const deleteRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  // Compute deltas vs. last synced snapshot. Only positive deltas are pushed
  // into the GoMining investment project (matches TRX/NOS earnings pattern —
  // earnings only ever go up).
  const syncDiffs = useMemo(() => {
    const out = [];
    let total = 0;
    for (const r of rows) {
      const current = computeReward(r, gmtPrice);
      const previous = Number(syncedMap[r.id]) || 0;
      const delta = current - previous;
      if (delta > 0.005) {
        out.push({ id: r.id, date: r.date, previous, current, delta });
        total += delta;
      }
    }
    out.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    return { rows: out, total };
  }, [rows, gmtPrice, syncedMap]);

  const openSyncDialog = () => {
    if (syncDiffs.rows.length === 0) {
      toast.info("Nothing new to sync — rewards haven't increased since last save");
      return;
    }
    setSyncDialogOpen(true);
  };

  const confirmSync = async () => {
    if (syncDiffs.rows.length === 0) { setSyncDialogOpen(false); return; }
    setSyncSubmitting(true);
    try {
      // Find or create the "GoMining" project.
      const projectsRes = await projectsApi.getAll();
      let project = (projectsRes.data || []).find(
        (p) => (p.name || "").trim().toLowerCase() === GOMINING_PROJECT_NAME.toLowerCase(),
      );
      if (!project) {
        const created = await projectsApi.create({
          name: GOMINING_PROJECT_NAME,
          icon_url: null,
          invested: 0,
          earned: 0,
          per_day: 0,
          per_week: 0,
          per_month: 0,
          per_year: 0,
          categories: [],
        });
        project = created.data;
      }

      // Add one earning transaction per row that increased — mirrors the daily
      // reward log so each entry shows up in the recent transactions list.
      // `source` + `source_row_id` let us reverse the synced snapshot if the
      // user later edits or deletes the txn from Investment Overview.
      for (const d of syncDiffs.rows) {
        await projectsApi.addTransaction(project.id, {
          type: "earning",
          amount: Number(d.delta.toFixed(2)),
          category: "Mining",
          notes: `GoMining auto-sync (${d.date})`,
          date: d.date || new Date().toISOString().split("T")[0],
          source: "gomining",
          source_row_id: d.id,
        });
      }

      // Bump project.earned by the total delta so the Investment Overview
      // totals reflect the new earnings without manual editing.
      const nextEarned = (Number(project.earned) || 0) + syncDiffs.total;
      await projectsApi.update(project.id, { earned: nextEarned });

      // Persist the new synced snapshot keyed by current row rewards.
      const nextSynced = { ...syncedMap };
      for (const r of rows) nextSynced[r.id] = computeReward(r, gmtPrice);
      storage.setGoMiningSynced(nextSynced);
      setSyncedMap(nextSynced);

      toast.success(
        `Synced $${formatMoney(syncDiffs.total)} across ${syncDiffs.rows.length} ${
          syncDiffs.rows.length === 1 ? "entry" : "entries"
        } to GoMining`,
      );
      setSyncDialogOpen(false);
    } catch (err) {
      console.warn("GoMining sync failed:", err);
      toast.error("Failed to sync to Investment Overview");
    } finally {
      setSyncSubmitting(false);
    }
  };

  const exportCsv = () => {
    if (rows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    const header = ["Date", "CP (TH/s)", "PR", "Electricity", "Service", "Reward", "Total discount", "GMT Earned"];
    const lines = [header.join(",")];
    sortedRows.forEach((r) => {
      lines.push([
        r.date,
        Number(r.cp_ths) || 0,
        Number(r.pr) || 0,
        Number(r.electricity) || 0,
        Number(r.service) || 0,
        computeReward(r, gmtPrice),
        Number(r.total_discount) || 0,
        Number(r.gmt_earned) || 0,
      ].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gomining_${todayIso()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  return (
    <div className="space-y-6" data-testid="gomining-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-4xl font-medium tracking-tight flex items-center gap-3">
            <Pickaxe className="w-8 h-8 text-amber-400" strokeWidth={1.5} />
            GoMining
          </h1>
          <span className="text-xs text-muted-foreground font-mono">
            {rows.length} {rows.length === 1 ? "entry" : "entries"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            className="border-border/40 hover:bg-secondary"
            data-testid="export-csv-btn"
          >
            <Download className="w-4 h-4 mr-2" strokeWidth={1.5} />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openSyncDialog}
            className={`border-border/40 hover:bg-secondary relative ${
              syncDiffs.rows.length > 0 ? "border-emerald-500/40 text-emerald-400 hover:text-emerald-300" : ""
            }`}
            data-testid="sync-investment-btn"
            title="Push reward increases to Investment Overview"
          >
            <Save className="w-4 h-4 mr-2" strokeWidth={1.5} />
            Save & Sync
            {syncDiffs.rows.length > 0 && (
              <span
                className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-mono font-medium"
                data-testid="sync-pending-badge"
              >
                {syncDiffs.rows.length}
              </span>
            )}
          </Button>
          <Button
            size="sm"
            onClick={addRow}
            className="bg-white text-black hover:bg-neutral-200"
            data-testid="add-row-btn"
          >
            <Plus className="w-4 h-4 mr-2" strokeWidth={1.5} />
            Add Row
          </Button>
        </div>
      </div>

      {/* Summary cards — order: PR → Reward → Electricity → Service → GMT Earned */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryStat label="Total PR"    value={`$${formatMoney(totals.pr)}`} />
        <SummaryStat label="Reward"      value={`$${formatMoney(totals.reward)}`} accent />
        <SummaryStat label="Electricity" value={`$${formatMoney(totals.electricity)}`} negative />
        <SummaryStat label="Service"     value={`$${formatMoney(totals.service)}`} />
        <SummaryStat
          label="GMT Earned"
          value={`$${formatMoney(gmtUsd)}`}
          subtitle={
            priceLoading
              ? "loading price…"
              : `${formatNumber(totals.gmt_earned)} GMT @ $${formatNumber(gmtPrice, 6)}`
          }
          accent
        />
      </div>

      <Card className="border-border/40 bg-card overflow-hidden">
        <CardHeader className="pb-3 border-b border-border/40">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Mining log — click any cell to edit
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-secondary/30 text-xs uppercase tracking-wider text-muted-foreground">
                  {COLS.map((c) => (
                    <th
                      key={c.key}
                      className="px-3 py-2.5 text-left font-medium"
                      style={{ minWidth: c.width }}
                    >
                      {c.label}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right font-medium w-12"></th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={COLS.length + 1}
                      className="px-3 py-12 text-center text-muted-foreground"
                    >
                      No entries yet. Click <span className="text-foreground font-medium">Add Row</span> to log your first day.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row) => (
                    <Row key={row.id} row={row} gmtPrice={gmtPrice} onChange={updateRow} onDelete={deleteRow} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Confirm sync to Investment Overview */}
      <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
        <DialogContent
          className="bg-card border-border sm:max-w-lg max-h-[85vh] overflow-y-auto"
          data-testid="gomining-sync-dialog"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pickaxe className="w-4 h-4 text-amber-400" strokeWidth={1.5} />
              Sync to Investment Overview
            </DialogTitle>
            <DialogDescription>
              Confirm these reward increases. They'll be added as earning transactions to the <span className="text-foreground font-medium">GoMining</span> project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-[320px] overflow-y-auto py-2">
            {syncDiffs.rows.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between px-3 py-2 rounded-md bg-secondary/50 text-sm"
                data-testid={`sync-row-${d.id}`}
              >
                <span className="font-mono text-xs text-muted-foreground">{d.date || "—"}</span>
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-muted-foreground">${formatMoney(d.previous)}</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" strokeWidth={1.5} />
                  <span className="text-foreground">${formatMoney(d.current)}</span>
                  <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400">
                    +${formatMoney(d.delta)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/40 text-sm">
            <span className="text-muted-foreground">Total earning to add</span>
            <span className="font-mono font-medium text-emerald-400" data-testid="sync-total">
              +${formatMoney(syncDiffs.total)}
            </span>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setSyncDialogOpen(false)}
              disabled={syncSubmitting}
              className="border-border/40"
              data-testid="sync-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmSync}
              disabled={syncSubmitting}
              className="bg-emerald-500 text-black hover:bg-emerald-400"
              data-testid="sync-confirm-btn"
            >
              {syncSubmitting ? "Syncing..." : "Confirm & Sync"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryStat({ label, value, subtitle, negative = false, accent = false }) {
  let valueClass = "text-foreground";
  if (negative) valueClass = "text-rose-400";
  else if (accent) valueClass = "text-emerald-400";
  return (
    <Card className="border-border/40 bg-card">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
        <p className={`text-lg font-mono font-medium ${valueClass}`}>{value}</p>
        {subtitle && (
          <p className="text-[10px] text-muted-foreground/70 font-mono mt-1 truncate">
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ row, gmtPrice, onChange, onDelete }) {
  const reward = computeReward(row, gmtPrice);
  const rewardPositive = reward >= 0;
  const gmtUsdRow = (Number(row.gmt_earned) || 0) * gmtPrice;
  return (
    <tr className="border-b border-border/40 hover:bg-secondary/20 transition-colors" data-testid={`gomining-row-${row.id}`}>
      {COLS.map((c) => {
        if (c.key === "reward") {
          return (
            <td key={c.key} className="px-3 py-2 align-middle">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-sm font-mono font-medium ${
                  rewardPositive
                    ? "text-emerald-400 bg-emerald-500/10"
                    : "text-rose-400 bg-rose-500/10"
                }`}
                title={`PR (${formatMoney(row.pr)}) − Electricity (${formatMoney(row.electricity)}) + Service (${formatMoney(row.service)}) + GMT $${formatMoney(gmtUsdRow)}`}
              >
                ${formatMoney(reward)}
              </span>
            </td>
          );
        }
        if (c.key === "gmt_earned") {
          return (
            <td key={c.key} className="px-3 py-2 align-middle">
              <div className="flex flex-col">
                <CellInput
                  row={row}
                  colKey={c.key}
                  type={c.type}
                  onChange={onChange}
                />
                {gmtPrice > 0 && Number(row.gmt_earned) > 0 && (
                  <span className="text-[10px] text-muted-foreground/70 font-mono px-2 mt-0.5">
                    ≈ ${formatMoney(gmtUsdRow)}
                  </span>
                )}
              </div>
            </td>
          );
        }
        return (
          <td key={c.key} className="px-3 py-2 align-middle">
            <CellInput
              row={row}
              colKey={c.key}
              type={c.type}
              onChange={onChange}
            />
          </td>
        );
      })}
      <td className="px-3 py-2 align-middle text-right">
        <button
          onClick={() => onDelete(row.id)}
          className="p-1.5 rounded hover:bg-rose-500/10 text-muted-foreground hover:text-rose-400 transition-colors"
          title="Delete row"
          data-testid={`delete-row-${row.id}`}
        >
          <Trash2 className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </td>
    </tr>
  );
}

function CellInput({ row, colKey, type, onChange }) {
  const ref = useRef(null);
  const isMoney = type === "money";
  const isNumber = type === "number" || isMoney;
  const value = row[colKey];

  const handleChange = (e) => {
    const raw = e.target.value;
    const next = isNumber
      ? raw === "" ? "" : Number(raw)
      : raw;
    onChange(row.id, colKey, next);
  };

  return (
    <input
      ref={ref}
      type={type === "date" ? "date" : isNumber ? "number" : "text"}
      step={isNumber ? "any" : undefined}
      value={value ?? ""}
      onChange={handleChange}
      onFocus={(e) => e.target.select()}
      className="w-full bg-transparent border border-transparent focus:border-border focus:bg-background rounded px-2 py-1 text-sm font-mono text-foreground transition-colors outline-none"
      data-testid={`cell-${colKey}-${row.id}`}
    />
  );
}

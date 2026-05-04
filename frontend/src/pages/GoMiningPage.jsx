import { useEffect, useMemo, useState, useRef } from "react";
import { localStorage as storage } from "@/lib/localStorage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pickaxe, Plus, Trash2, Download } from "lucide-react";
import { toast } from "sonner";

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

// Per the user's formula: Reward = PR − Electricity + Service
function computeReward(row) {
  const pr = Number(row.pr) || 0;
  const elec = Number(row.electricity) || 0;
  const svc = Number(row.service) || 0;
  return pr - elec + svc;
}

export default function GoMiningPage() {
  const [rows, setRows] = useState(() => storage.getGoMining());

  // Persist on every change.
  useEffect(() => { storage.setGoMining(rows); }, [rows]);

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
        acc.reward += computeReward(r);
        acc.gmt_earned += Number(r.gmt_earned) || 0;
        return acc;
      },
      { pr: 0, electricity: 0, service: 0, total_discount: 0, reward: 0, gmt_earned: 0 },
    );
  }, [rows]);

  const updateRow = (id, key, value) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  };

  const addRow = () => {
    setRows((prev) => [newRow(), ...prev]);
  };

  const deleteRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
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
        computeReward(r),
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

      {/* Summary card */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryStat label="Total PR" value={`$${formatMoney(totals.pr)}`} />
        <SummaryStat label="Electricity" value={`$${formatMoney(totals.electricity)}`} negative />
        <SummaryStat label="Service" value={`$${formatMoney(totals.service)}`} />
        <SummaryStat label="Reward" value={`$${formatMoney(totals.reward)}`} accent />
        <SummaryStat label="Discount" value={`$${formatMoney(totals.total_discount)}`} />
        <SummaryStat label="GMT Earned" value={formatNumber(totals.gmt_earned)} accent />
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
                    <Row key={row.id} row={row} onChange={updateRow} onDelete={deleteRow} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryStat({ label, value, negative = false, accent = false }) {
  let valueClass = "text-foreground";
  if (negative) valueClass = "text-rose-400";
  else if (accent) valueClass = "text-emerald-400";
  return (
    <Card className="border-border/40 bg-card">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
        <p className={`text-lg font-mono font-medium ${valueClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Row({ row, onChange, onDelete }) {
  const reward = computeReward(row);
  const rewardPositive = reward >= 0;
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
                title={`PR (${formatMoney(row.pr)}) − Electricity (${formatMoney(row.electricity)}) + Service (${formatMoney(row.service)})`}
              >
                ${formatMoney(reward)}
              </span>
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

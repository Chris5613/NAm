import { useMemo, useState } from "react";
import { remoteStorage } from "@/lib/serverStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  CalendarDays, Car, ChevronLeft, ChevronRight, CircleDollarSign,
  Clock3, Plus, ReceiptText, Trash2, TrendingUp
} from "lucide-react";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";

const STORAGE_KEY = "doordash_earnings_v1";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const money = (n) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD"
}).format(Number(n) || 0);

function readEntries() {
  try {
    const value = JSON.parse(remoteStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
const saveEntries = (value) => remoteStorage.setItem(STORAGE_KEY, JSON.stringify(value));

function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function monthKey(date = new Date()) {
  return dateKey(date).slice(0, 7);
}
function shiftMonth(key, amount) {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + amount, 1));
}
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return `${new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long" })} ${y}`;
}
function prettyDate(key) {
  return new Date(`${key}T12:00:00`).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric"
  });
}

function Metric({ icon: Icon, label, value, detail }) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="h-4 w-4" />
          {label}
        </div>
        <div className="mt-3 text-[28px] font-semibold tracking-tight">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  );
}

export default function DoorDashPage() {
  const [entries, setEntries] = useState(readEntries);
  const [selectedMonth, setSelectedMonth] = useState(monthKey());
  const [form, setForm] = useState({
    date: dateKey(), basePay: "", tips: "", promo: "", hours: "", deliveries: ""
  });

  const selectedYear = selectedMonth.slice(0, 4);

  const monthEntries = useMemo(() =>
    entries.filter(e => e.date?.startsWith(selectedMonth))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [entries, selectedMonth]
  );

  const yearEntries = useMemo(() =>
    entries.filter(e => e.date?.startsWith(selectedYear)),
    [entries, selectedYear]
  );

  const monthTotal = monthEntries.reduce((s, e) => s + Number(e.total || 0), 0);
  const yearTotal = yearEntries.reduce((s, e) => s + Number(e.total || 0), 0);
  const allTime = entries.reduce((s, e) => s + Number(e.total || 0), 0);
  const hours = monthEntries.reduce((s, e) => s + Number(e.hours || 0), 0);
  const deliveries = monthEntries.reduce((s, e) => s + Number(e.deliveries || 0), 0);
  const hourly = hours > 0 ? monthTotal / hours : 0;
  const perDelivery = deliveries > 0 ? monthTotal / deliveries : 0;

  const chartData = useMemo(() => {
    const byDay = {};
    monthEntries.forEach(e => {
      byDay[e.date] = (byDay[e.date] || 0) + Number(e.total || 0);
    });
    return Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({
      date,
      label: new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      total
    }));
  }, [monthEntries]);

  const monthTiles = useMemo(() => {
    const totals = {};
    yearEntries.forEach(e => {
      const key = e.date.slice(0, 7);
      totals[key] = (totals[key] || 0) + Number(e.total || 0);
    });
    return MONTHS.map((label, i) => {
      const key = `${selectedYear}-${String(i + 1).padStart(2, "0")}`;
      return { key, label, total: totals[key] || 0 };
    });
  }, [yearEntries, selectedYear]);

  const formTotal =
    (Number(form.basePay) || 0) +
    (Number(form.tips) || 0) +
    (Number(form.promo) || 0);

  const update = (field, value) =>
    setForm(current => ({ ...current, [field]: value }));

  function addEntry(event) {
    event.preventDefault();
    if (!form.date || formTotal <= 0) return;

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: form.date,
      basePay: Number(form.basePay) || 0,
      tips: Number(form.tips) || 0,
      promo: Number(form.promo) || 0,
      hours: Math.max(0, Number(form.hours) || 0),
      deliveries: Math.max(0, Math.round(Number(form.deliveries) || 0)),
      total: formTotal
    };

    setEntries(current => {
      const next = [entry, ...current];
      saveEntries(next);
      return next;
    });
    setSelectedMonth(form.date.slice(0, 7));
    setForm({ ...form, basePay: "", tips: "", promo: "", hours: "", deliveries: "" });
  }

  function removeEntry(id) {
    if (!window.confirm("Delete this DoorDash earnings entry?")) return;
    setEntries(current => {
      const next = current.filter(e => e.id !== id);
      saveEntries(next);
      return next;
    });
  }

  return (
    <div className="space-y-8" data-testid="doordash-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-red-400">DoorDash</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Earnings Tracker</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Track pay, tips, bonuses, hours, and deliveries.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon"
            onClick={() => setSelectedMonth(v => shiftMonth(v, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[160px] text-center text-sm font-medium">
            {monthLabel(selectedMonth)}
          </div>
          <Button variant="outline" size="icon"
            disabled={selectedMonth >= monthKey()}
            onClick={() => setSelectedMonth(v => shiftMonth(v, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={CircleDollarSign} label="This Month" value={money(monthTotal)}
          detail={`${monthEntries.length} logged dashes`} />
        <Metric icon={TrendingUp} label={`${selectedYear} Earnings`} value={money(yearTotal)}
          detail={`All-time ${money(allTime)}`} />
        <Metric icon={Clock3} label="Average / Hour" value={money(hourly)}
          detail={`${hours.toFixed(1)} hours this month`} />
        <Metric icon={Car} label="Average / Delivery" value={money(perDelivery)}
          detail={`${deliveries} deliveries this month`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="border-border/60">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold">Monthly Earnings</h2>
            <p className="mt-1 text-sm text-muted-foreground">{monthLabel(selectedMonth)}</p>
            <div className="mt-5 h-[260px]">
              {chartData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <XAxis dataKey="label" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                    <Tooltip formatter={v => [money(v), "Earnings"]} />
                    <Area type="monotone" dataKey="total"
                      stroke="currentColor" fill="currentColor"
                      fillOpacity={0.12} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                  Add your first dash for this month.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardContent className="p-6">
            <div className="mb-5 flex items-center gap-2">
              <Plus className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Add Earnings</h2>
            </div>

            <form className="space-y-4" onSubmit={addEntry}>
              <Input type="date" value={form.date}
                onChange={e => update("date", e.target.value)} />

              <div className="grid grid-cols-2 gap-3">
                <Input type="number" min="0" step="0.01" placeholder="DoorDash pay"
                  value={form.basePay} onChange={e => update("basePay", e.target.value)} />
                <Input type="number" min="0" step="0.01" placeholder="Tips"
                  value={form.tips} onChange={e => update("tips", e.target.value)} />
              </div>

              <Input type="number" min="0" step="0.01" placeholder="Promo / bonus"
                value={form.promo} onChange={e => update("promo", e.target.value)} />

              <div className="grid grid-cols-2 gap-3">
                <Input type="number" min="0" step="0.1" placeholder="Hours"
                  value={form.hours} onChange={e => update("hours", e.target.value)} />
                <Input type="number" min="0" step="1" placeholder="Deliveries"
                  value={form.deliveries} onChange={e => update("deliveries", e.target.value)} />
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                <div className="text-xs text-muted-foreground">Earnings total</div>
                <div className="mt-1 text-2xl font-semibold">{money(formTotal)}</div>
              </div>

              <Button type="submit" className="w-full" disabled={formTotal <= 0}>
                <Plus className="mr-2 h-4 w-4" /> Add dash
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-6">
          <div className="mb-5 flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            <h2 className="text-lg font-semibold">{selectedYear} by Month</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
            {monthTiles.map(m => (
              <button key={m.key} onClick={() => setSelectedMonth(m.key)}
                className={`rounded-lg border p-3 text-left ${
                  m.key === selectedMonth ? "border-red-400/60 bg-red-400/10" : "border-border/60"
                }`}>
                <div className="text-xs text-muted-foreground">{m.label}</div>
                <div className="mt-1 font-semibold">{money(m.total)}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="p-0">
          <div className="flex items-center gap-2 border-b px-6 py-5">
            <ReceiptText className="h-5 w-5" />
            <div>
              <h2 className="font-semibold">Earnings Log</h2>
              <p className="text-xs text-muted-foreground">{monthLabel(selectedMonth)}</p>
            </div>
          </div>

          {monthEntries.length ? (
            <div className="divide-y">
              {monthEntries.map(entry => (
                <div key={entry.id} className="flex items-center gap-5 px-6 py-4">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{prettyDate(entry.date)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {entry.deliveries} deliveries
                      {entry.hours > 0 ? ` · ${entry.hours.toFixed(1)} hrs` : ""}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>Pay {money(entry.basePay)}</div>
                    <div>Tips {money(entry.tips)}</div>
                  </div>
                  <div className="min-w-[100px] text-right">
                    <div className="font-semibold">{money(entry.total)}</div>
                    {entry.hours > 0 &&
                      <div className="text-xs text-muted-foreground">
                        {money(entry.total / entry.hours)}/hr
                      </div>}
                  </div>
                  <button onClick={() => removeEntry(entry.id)}
                    className="text-muted-foreground hover:text-red-400">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              No DoorDash earnings logged for this month yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

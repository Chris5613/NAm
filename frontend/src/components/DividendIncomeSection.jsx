import { useEffect, useMemo, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { api } from "@/lib/apiClient";
import { remoteStorage, subscribe } from "@/lib/serverStore";
import { formatCurrency, getTodayKey } from "@/lib/yieldFarmingAccounting";
import { announcedStockPayouts } from "@/lib/stockDividendPayouts";

const SYMBOLS = ["VTI", "VOO"];
// Fall back to the published 2026 schedule while the annual feed is unavailable.
const SCHEDULED_PAYMENTS = {
  VTI: [{ exDate: "2026-12-22", payableDate: "2026-12-24" }, { exDate: "2026-12-30", payableDate: "2027-01-04" }],
  VOO: [{ exDate: "2026-12-21", payableDate: "2026-12-23" }, { exDate: "2026-12-30", payableDate: "2027-01-04" }],
};

function nextPayment(schedule, symbol, today) {
  return schedule[symbol]?.find(row => row.payableDate >= today) || null;
}

function shortDate(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
}

function holdings() {
  try {
    const assets = JSON.parse(remoteStorage.getItem("networth_assets") || "[]");
    return Object.fromEntries(SYMBOLS.map(symbol => [symbol, (Array.isArray(assets) ? assets : [])
      .filter(asset => String(asset.symbol || "").toUpperCase() === symbol)
      .reduce((sum, asset) => sum + Math.max(0, Number(asset.quantity) || 0), 0)]));
  } catch {
    return { VTI: 0, VOO: 0 };
  }
}

export default function DividendIncomeSection({ onEstimateChange, payouts = {}, onRecordPayout, onRemovePayout, onRestorePayout, onAnnouncedPayouts }) {
  const [shares, setShares] = useState(holdings);
  const [history, setHistory] = useState({});
  const [error, setError] = useState("");
  const [publishedPayments, setPublishedPayments] = useState([]);
  const [selected, setSelected] = useState(null);
  const today = getTodayKey();
  const [payoutDate, setPayoutDate] = useState(today);
  const [payoutAmount, setPayoutAmount] = useState("");
  const year = today.slice(0, 4);

  useEffect(() => {
    const amount = payouts?.[`${selected}:${payoutDate}`]?.amount;
    setPayoutAmount(amount == null || amount <= 0 ? "" : String(amount));
  }, [selected, payoutDate, payouts]);

  useEffect(() => subscribe(key => {
    if (key == null || key === "networth_assets") setShares(holdings());
  }), []);

  useEffect(() => {
    let active = true;
    async function refresh() {
      const results = await Promise.allSettled(SYMBOLS.map(symbol => api.get(`/api/market/dividends/${symbol}`)));
      if (!active) return;
      const next = {};
      results.forEach((result, index) => {
        if (result.status === "fulfilled") next[SYMBOLS[index]] = result.value.distributions || [];
      });
      if (Object.keys(next).length) setHistory(previous => ({ ...previous, ...next }));
      setError(results.some(result => result.status === "rejected") ? "Dividend data could not refresh for one or more funds." : "");
    }
    refresh();
    const timer = window.setInterval(refresh, 6 * 3600 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    async function refreshSchedule() {
      try {
        const response = await api.get("/api/market/dividend-schedule");
        if (active) setPublishedPayments(Array.isArray(response.payments) ? response.payments : []);
      } catch { /* Keep the last published dates available offline. */ }
    }
    refreshSchedule();
    const timer = window.setInterval(refreshSchedule, 24 * 3600 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const schedule = useMemo(() => Object.fromEntries(SYMBOLS.map(symbol => [symbol,
    [...SCHEDULED_PAYMENTS[symbol], ...publishedPayments.filter(row => row.symbol === symbol)]
      .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.exDate) && /^\d{4}-\d{2}-\d{2}$/.test(row.payableDate))
      .sort((a, b) => a.payableDate.localeCompare(b.payableDate))
  ])), [publishedPayments]);

  const announced = useMemo(() => announcedStockPayouts(schedule, history, shares, today),
    [schedule, history, shares, today]);
  useEffect(() => {
    if (onAnnouncedPayouts && Object.keys(announced).some(key =>
        !Object.prototype.hasOwnProperty.call(payouts, key))) onAnnouncedPayouts(announced);
  }, [announced, payouts, onAnnouncedPayouts]);

  useEffect(() => {
    if (!onEstimateChange) return;
    const ready = SYMBOLS.every(symbol => (history[symbol] || []).length >= 4);
    const annual = ready ? SYMBOLS.reduce((sum, symbol) => sum +
      history[symbol].slice(0, 4).reduce((total, row) => total + Number(row.amountPerShare || 0), 0) * shares[symbol], 0) : null;
    onEstimateChange(Number.isFinite(annual) ? annual : null);
  }, [history, shares, onEstimateChange]);

  useEffect(() => {
    if (!selected) return;
    const closeOnEscape = event => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selected]);

  const details = symbol => {
    const rows = history[symbol] || [];
    const annualPerShare = rows.filter(row => row.exDate.startsWith(year))
      .reduce((sum, row) => sum + Number(row.amountPerShare), 0);
    const trailingYearPerShare = rows.slice(0, 4)
      .reduce((sum, row) => sum + Number(row.amountPerShare), 0);
    return { rows, annualPerShare, daily: rows.length >= 4 ? trailingYearPerShare * shares[symbol] / 365 : null };
  };
  const active = selected ? details(selected) : null;
  const selectedPayout = payouts?.[`${selected}:${payoutDate}`];
  const recentPayouts = Object.values(payouts).filter(row => row?.symbol === selected && Number(row.amount) > 0)
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  return (
    <section className="min-w-0 space-y-2 rounded-2xl border border-[#252a32] bg-[#0b1017] p-2.5" aria-label="Stock dividends">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-[15px] font-semibold">Stock dividends (2)</h2>
        <span className="text-[11px] text-muted-foreground">VTI · VOO</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {SYMBOLS.map(symbol => {
          const next = nextPayment(schedule, symbol, today);
          return (
            <button key={symbol} type="button" onClick={() => { setPayoutDate(getTodayKey()); setSelected(symbol); }}
              className="flex w-full min-w-0 items-start gap-2 rounded-2xl border border-border/60 bg-[#0e1218] px-3.5 py-2.5 text-left shadow-sm transition-all duration-200 hover:border-border hover:bg-[#151e28]"
              aria-label={`View ${symbol} dividend details`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#a52b32] text-xs font-bold text-white">V</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-1">
                  <span className="truncate text-[12px] font-semibold">{symbol}</span>
                  <span className={`shrink-0 text-[9px] ${next ? "text-emerald-400" : "text-amber-300"}`}>● {next ? "Scheduled" : "Pending"}</span>
                </span>
                <span className="mt-0.5 block truncate text-[14px] font-semibold tabular-nums">{next ? shortDate(next.payableDate) : "Date pending"}</span>
              </span>
              <ChevronRight className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          );
        })}
      </div>
      {error && <p className="px-1 text-[11px] text-amber-300">{error}</p>}
      {selected && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-5"
          onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
          <div role="dialog" aria-modal="true" aria-label={`${selected} dividend details`}
            className="max-h-[90dvh] w-full max-w-[520px] overflow-y-auto rounded-xl border border-border/70 bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
              <div><h3 className="text-base font-semibold">{selected} dividends</h3><p className="text-[11px] text-muted-foreground">{shares[selected]} shares from Home</p></div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close dividend details" className="rounded-lg p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 p-4">
              {nextPayment(schedule, selected, today) && <p className="text-xs text-muted-foreground">Next scheduled payment: <span className="font-semibold text-foreground">{shortDate(nextPayment(schedule, selected, today).payableDate)}</span> · ex-dividend {shortDate(nextPayment(schedule, selected, today).exDate)}</p>}
              <div className="grid grid-cols-3 gap-2">
                {[["Daily estimate", active.daily == null ? null : active.daily], [`${year} per share`, active.rows.length ? active.annualPerShare : null], [`${year} at current shares`, active.rows.length ? active.annualPerShare * shares[selected] : null]].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-lg bg-white/[0.03] p-2"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-1 truncate text-xs font-semibold tabular-nums">{value == null ? "—" : formatCurrency(value)}</p></div>
                ))}
              </div>
              <div className="rounded-lg border border-border/50 p-3 text-xs">
                <p className="mb-2 font-semibold">Recent distributions</p>
                {active.rows.length ? active.rows.slice(0, 4).map(row => <div key={row.exDate} className="flex justify-between gap-2 py-1 text-muted-foreground"><span>Ex-dividend {row.exDate}</span><span className="tabular-nums text-foreground">{formatCurrency(Number(row.amountPerShare))}/share</span></div>) : <p className="text-muted-foreground">Confirmed distributions are unavailable.</p>}
              </div>
              <form className="space-y-2 rounded-lg border border-border/50 p-3 text-xs" onSubmit={event => {
                event.preventDefault();
                onRecordPayout?.(selected, payoutDate, Number(payoutAmount));
              }}>
                <p className="font-semibold">Stock payout</p>
                <p className="text-[11px] text-muted-foreground">NAm adds a payout automatically on its published payment date once the per-share amount is confirmed. It uses your current shares from Home, so correct the amount here if your eligible shares or brokerage payment differ.</p>
                {recentPayouts.length > 0 && <div className="flex flex-wrap gap-1">
                  {recentPayouts.map(row => <button key={row.date} type="button" onClick={() => setPayoutDate(row.date)}
                    className="rounded-md border border-border/60 px-2 py-1 text-[11px] text-emerald-400">{shortDate(row.date)} · {formatCurrency(row.amount)}</button>)}
                </div>}
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex min-w-[130px] flex-1 flex-col gap-1 text-muted-foreground">Payment date
                    <input type="date" required max={today} value={payoutDate} onChange={event => setPayoutDate(event.target.value)} className="h-9 rounded-md border border-border/70 bg-[#0e141c] px-2 text-foreground" />
                  </label>
                  <label className="flex min-w-[110px] flex-1 flex-col gap-1 text-muted-foreground">Correct amount (USD)
                    <input type="number" required min="0.01" step="0.01" value={payoutAmount} onChange={event => setPayoutAmount(event.target.value)} className="h-9 rounded-md border border-border/70 bg-[#0e141c] px-2 text-foreground" />
                  </label>
                  <button type="submit" className="h-9 rounded-md bg-emerald-500 px-3 font-semibold text-black hover:bg-emerald-400">{selectedPayout?.amount > 0 ? "Correct payout" : "Record payout"}</button>
                </div>
                {selectedPayout?.source === "announced" && <p className="text-[11px] text-muted-foreground">Calculated: ${Number(selectedPayout.perShare).toFixed(6)}/share × {selectedPayout.shares} shares = {formatCurrency(selectedPayout.amount)}. Brokerage receipt not verified.</p>}
                {selectedPayout?.amount > 0 && <div className="flex items-center justify-between gap-2 text-[11px] text-emerald-400">
                  <span>Included under Stocks for {payoutDate === today ? "today" : payoutDate}.</span>
                  <button type="button" onClick={() => onRemovePayout?.(selected, payoutDate)} className="text-rose-300 underline">Exclude</button>
                </div>}
                {selectedPayout?.source === "excluded" && <button type="button" onClick={() => onRestorePayout?.(selected, payoutDate)} className="text-[11px] text-emerald-400 underline">Restore automatic calculation</button>}
              </form>
              <p className="text-[11px] leading-relaxed text-muted-foreground">Payment dates follow <a href="https://investor.vanguard.com/investor-resources-education/taxes/funds-tax-information" target="_blank" rel="noreferrer" className="underline">Vanguard's published schedule</a> and may change. New years refresh when Vanguard publishes them; until then, the card says Date pending. Estimates use today's shares and the last four distributions; past share counts and brokerage deposits are unavailable.</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

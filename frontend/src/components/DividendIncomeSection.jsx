import { useEffect, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { api } from "@/lib/apiClient";
import { remoteStorage, subscribe } from "@/lib/serverStore";
import { formatCurrency, getTodayKey } from "@/lib/yieldFarmingAccounting";

const SYMBOLS = ["VTI", "VOO"];
// Vanguard's published 2026 schedule; these are payable dates, not ex-dates.
const SCHEDULED_PAYMENTS = {
  VTI: [{ exDate: "2026-12-22", payableDate: "2026-12-24" }],
  VOO: [{ exDate: "2026-12-21", payableDate: "2026-12-23" }],
};

function nextPayment(symbol, today) {
  return SCHEDULED_PAYMENTS[symbol]?.find(row => row.payableDate >= today) || null;
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

export default function DividendIncomeSection() {
  const [shares, setShares] = useState(holdings);
  const [history, setHistory] = useState({});
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const today = getTodayKey();
  const year = today.slice(0, 4);

  useEffect(() => subscribe(key => {
    if (key === "networth_assets") setShares(holdings());
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

  return (
    <section className="space-y-2 rounded-2xl border border-[#252a32] bg-[#0b1017] p-2.5" aria-label="Stock dividends">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-[15px] font-semibold">Stock dividends (2)</h2>
        <span className="text-[11px] text-muted-foreground">VTI · VOO</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {SYMBOLS.map(symbol => {
          const next = nextPayment(symbol, today);
          return (
            <button key={symbol} type="button" onClick={() => setSelected(symbol)}
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
            className="w-full max-w-[520px] overflow-hidden rounded-xl border border-border/70 bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
              <div><h3 className="text-base font-semibold">{selected} dividends</h3><p className="text-[11px] text-muted-foreground">{shares[selected]} shares from Home</p></div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close dividend details" className="rounded-lg p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 p-4">
              {nextPayment(selected, today) && <p className="text-xs text-muted-foreground">Next scheduled payment: <span className="font-semibold text-foreground">{shortDate(nextPayment(selected, today).payableDate)}</span> · ex-dividend {shortDate(nextPayment(selected, today).exDate)}</p>}
              <div className="grid grid-cols-3 gap-2">
                {[["Daily estimate", active.daily == null ? null : active.daily], [`${year} per share`, active.rows.length ? active.annualPerShare : null], [`${year} at current shares`, active.rows.length ? active.annualPerShare * shares[selected] : null]].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-lg bg-white/[0.03] p-2"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-1 truncate text-xs font-semibold tabular-nums">{value == null ? "—" : formatCurrency(value)}</p></div>
                ))}
              </div>
              <div className="rounded-lg border border-border/50 p-3 text-xs">
                <p className="mb-2 font-semibold">Recent distributions</p>
                {active.rows.length ? active.rows.slice(0, 4).map(row => <div key={row.exDate} className="flex justify-between gap-2 py-1 text-muted-foreground"><span>Ex-dividend {row.exDate}</span><span className="tabular-nums text-foreground">{formatCurrency(Number(row.amountPerShare))}/share</span></div>) : <p className="text-muted-foreground">Confirmed distributions are unavailable.</p>}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">Payment dates follow <a href="https://investor.vanguard.com/investor-resources-education/taxes/funds-tax-information" target="_blank" rel="noreferrer" className="underline">Vanguard's 2026 schedule</a> and may change. When no future scheduled date is available, the card says Date pending. Estimates use today's shares and the last four distributions; past share counts and brokerage deposits are unavailable.</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

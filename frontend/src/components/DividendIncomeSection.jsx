import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { remoteStorage, subscribe } from "@/lib/serverStore";
import { formatCurrency, getTodayKey } from "@/lib/yieldFarmingAccounting";

const SYMBOLS = ["VTI", "VOO"];

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
  const year = getTodayKey().slice(0, 4);

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

  return (
    <section className="space-y-3 rounded-2xl border border-[#252a32] bg-[#0b1017] p-4" aria-label="Stock dividends">
      <div>
        <h2 className="text-[15px] font-semibold">Stock dividends</h2>
        <p className="text-xs text-muted-foreground">VTI and VOO · current shares from Home · separate from Projects</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {SYMBOLS.map(symbol => {
          const rows = history[symbol] || [];
          const annualPerShare = rows.filter(row => row.exDate.startsWith(year))
            .reduce((sum, row) => sum + Number(row.amountPerShare), 0);
          const trailingYearPerShare = rows.slice(0, 4)
            .reduce((sum, row) => sum + Number(row.amountPerShare), 0);
          return (
            <div key={symbol} className="rounded-xl border border-border/60 bg-card/60 p-3">
              <div className="font-medium">{symbol} <span className="text-xs font-normal text-muted-foreground">· {shares[symbol]} shares</span></div>
              <div className="mt-2 text-xs text-muted-foreground">{year} distributions per share</div>
              <div className="font-semibold tabular-nums">{rows.length ? formatCurrency(annualPerShare) : "—"}</div>
              <div className="mt-2 text-xs text-muted-foreground">At current share count · {year} distributions</div>
              <div className="text-lg font-semibold tabular-nums">{rows.length ? formatCurrency(annualPerShare * shares[symbol]) : "—"}</div>
              <div className="mt-2 text-xs text-muted-foreground">Daily average estimate · last 4 distributions</div>
              <div className="font-medium tabular-nums">{rows.length >= 4 ? formatCurrency(trailingYearPerShare * shares[symbol] / 365) : "—"}/day</div>
              <p className="mt-2 text-xs text-muted-foreground">
                {rows.length ? `Latest ex-dividend date: ${rows[0].exDate} · ${formatCurrency(Number(rows[0].amountPerShare))} per share` : "Loading confirmed distributions…"}
              </p>
            </div>
          );
        })}
      </div>
      {error && <p className="text-xs text-amber-300">{error}</p>}
      <p className="text-[11px] text-muted-foreground">Estimated using today's shares; past share counts and actual brokerage deposits are unavailable. Ex-dividend dates are eligibility dates, not payment dates. Amounts refresh from the distribution feed; future dividends are shown only after announced.</p>
    </section>
  );
}

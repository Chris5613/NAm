import { Wallet, RefreshCw } from "lucide-react";
import { useCryptoDashboardSnapshot } from "@/hooks/useCryptoDashboardSnapshot";
import { Card, CardContent } from "@/components/ui/card";

const money = amount => amount == null ? "—" : new Intl.NumberFormat("en-US", {
  style:"currency", currency:"USD", minimumFractionDigits:2,
}).format(amount);

function dateLabel(value) {
  const stamp = Date.parse(value || "");
  return Number.isFinite(stamp)
    ? new Date(stamp).toLocaleString(undefined, { dateStyle:"medium", timeStyle:"short" })
    : "Not yet recorded";
}

/** Crypto Business's project holdings panel: all values are from Postgres. */
export default function CryptoBreakdown() {
  const { data, cachedAt, isCached, loading, error, refresh } = useCryptoDashboardSnapshot();
  return <div className="space-y-3" data-testid="crypto-breakdown">
    <Card className="border-border/50 bg-card/70">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-foreground" />
            <div>
              <p className="font-semibold">Project Income Portfolio</p>
              <p className="text-xs text-muted-foreground">
                Backend-valued holdings · BTC, business equipment and bank cash are not included
              </p>
            </div>
          </div>
          <button type="button" aria-label="Refresh crypto holdings"
            onClick={refresh} disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1.5 text-xs hover:bg-secondary disabled:opacity-60">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}/>
            Refresh
          </button>
        </div>
        {data ? <>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">All project holdings (including inactive)</p>
              <p className="font-mono text-2xl font-semibold tabular-nums">{money(data.totalUsd)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{data.activePositions} active providers</p>
              <p className="font-mono text-lg tabular-nums">{money(data.activeTotalUsd)} active</p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {isCached ? "Saved snapshot · " : "Backend snapshot · "}
            Provider feed: {dateLabel(data.receivedAt)}
            {isCached && cachedAt ? " · Refreshing in background" : ""}
          </p>
        </> : <p className="mt-4 text-sm text-muted-foreground">
          {loading ? "Loading verified provider holdings…" : "No verified backend portfolio snapshot is available."}
        </p>}
        {error && <p role="status" className="mt-2 text-xs text-amber-500">
          {error} {data ? "Last saved provider figures are shown, not live balances." : ""}
        </p>}
      </CardContent>
    </Card>
    {data && data.projects.length > 0 && <div className="overflow-hidden rounded-lg border border-border/50">
      {data.projects.map((item, index) => <div key={item.id}
        className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm ${index ? "border-t border-border/40" : ""}`}>
        <div>
          <p className="font-medium">{item.name} {item.inactive &&
            <span className="ml-1 text-xs text-muted-foreground">(inactive)</span>}</p>
          <p className="text-[11px] text-muted-foreground">
            Source: {dateLabel(item.sourceLastSyncedAt)}
            {item.stale && !item.inactive ? " · Source overdue" : ""}
          </p>
        </div>
        <p className="font-mono font-semibold tabular-nums">{money(item.balanceUsd)}</p>
      </div>)}
    </div>}
  </div>;
}

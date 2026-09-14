import { useEffect, useMemo, useState } from "react";
import {
  getStoredProjectCryptoPortfolio,
  refreshProjectCryptoPortfolio,
} from "@/lib/projectCryptoPortfolio";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Bitcoin,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react";

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatPercent(value) {
  return `${(Number(value) || 0).toFixed(2)}%`;
}

function formatAmount(value, digits = 6) {
  const number = Number(value) || 0;

  return number.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatSyncTime(value) {
  if (!value) return "Pending";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Pending";

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function Logo({ entry }) {
  if (entry?.logo) {
    return (
      <img
        src={entry.logo}
        alt=""
        className="h-9 w-9 rounded-xl object-cover"
      />
    );
  }

  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-secondary text-xs font-semibold text-muted-foreground">
      {(entry?.platform || "?").slice(0, 2).toUpperCase()}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-border/40 bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function ProjectEntry({ entry }) {
  const [open, setOpen] = useState(false);
  const assets = Array.isArray(entry?.assets) ? entry.assets : [];

  return (
    <Card className="overflow-hidden border-border/50 bg-card/70">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-white/[0.02]"
      >
        <div className="flex min-w-0 items-center gap-3">
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}

          <Logo entry={entry} />

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-semibold text-foreground">
                {entry.platform}
              </p>

              {entry.live && (
                <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-400">
                  Live
                </span>
              )}
            </div>

            <p className="mt-0.5 text-xs text-muted-foreground">
              {assets.length} position{assets.length === 1 ? "" : "s"}
              {entry.lastSyncedAt
                ? ` · synced ${formatSyncTime(entry.lastSyncedAt)}`
                : ""}
            </p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-mono text-xl font-semibold text-foreground">
            {formatCurrency(entry.balance)}
          </p>

          {Number(entry.apy) > 0 ? (
            <p className="mt-0.5 text-xs font-mono text-emerald-400">
              {formatPercent(entry.apy)} APY
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatCurrency(entry.lifetimeUsd || entry.earned)} lifetime earned
            </p>
          )}
        </div>
      </button>

      {open && (
        <CardContent className="border-t border-border/40 px-5 pb-5 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Current Value"
              value={formatCurrency(entry.balance)}
            />
            <Stat
              label="Lifetime Earned"
              value={formatCurrency(entry.lifetimeUsd || entry.earned)}
            />
            <Stat
              label="This Month"
              value={
                entry.monthUsd == null
                  ? "—"
                  : formatCurrency(entry.monthUsd)
              }
            />
            <Stat
              label="Est. Monthly"
              value={formatCurrency(entry.estimatedMonthlyUsd)}
            />
          </div>

          {assets.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-xl border border-border/40">
              <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-3 border-b border-border/40 bg-white/[0.02] px-4 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                <span>Asset</span>
                <span className="text-right">Amount</span>
                <span className="text-right">APY</span>
                <span className="text-right">Value</span>
              </div>

              {assets.map((asset, index) => (
                <div
                  key={`${entry.id}-${asset.asset}-${index}`}
                  className="grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-3 border-b border-border/20 px-4 py-3 text-sm last:border-b-0"
                >
                  <div>
                    <p className="font-medium text-foreground">{asset.asset}</p>
                    <p className="text-xs text-muted-foreground">
                      {asset.strategy || "Position"}
                    </p>
                  </div>

                  <div className="self-center text-right font-mono text-xs text-muted-foreground">
                    {asset.quantity == null
                      ? "—"
                      : formatAmount(asset.quantity, 8)}
                  </div>

                  <div className="self-center text-right font-mono text-xs text-muted-foreground">
                    {Number(asset.apy) > 0
                      ? formatPercent(asset.apy)
                      : "—"}
                  </div>

                  <div className="self-center text-right font-mono font-medium text-foreground">
                    {formatCurrency(asset.balance)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function BitcoinEntry({ bitcoin }) {
  const [open, setOpen] = useState(false);
  const wallets = Array.isArray(bitcoin?.wallets) ? bitcoin.wallets : [];

  return (
    <Card className="overflow-hidden border-amber-500/20 bg-card/70">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-white/[0.02]"
      >
        <div className="flex min-w-0 items-center gap-3">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}

          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <Bitcoin className="h-5 w-5" />
          </div>

          <div>
            <p className="font-semibold text-foreground">Bitcoin Holdings</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {wallets.length} wallet{wallets.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="font-mono text-xl font-semibold text-foreground">
            {formatCurrency(bitcoin?.value)}
          </p>
          <p className="mt-0.5 text-xs font-mono text-muted-foreground">
            {formatAmount(bitcoin?.amount, 8)} BTC
          </p>
        </div>
      </button>

      {open && (
        <CardContent className="border-t border-border/40 px-5 pb-5 pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="BTC" value={formatAmount(bitcoin?.amount, 8)} />
            <Stat label="BTC Price" value={formatCurrency(bitcoin?.price)} />
            <Stat label="Value" value={formatCurrency(bitcoin?.value)} />
          </div>

          {wallets.length > 0 && (
            <div className="mt-4 space-y-2">
              {wallets.map((wallet) => (
                <div
                  key={wallet.walletId}
                  className="flex items-center justify-between rounded-xl border border-border/40 bg-white/[0.02] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {wallet.label || "Bitcoin Wallet"}
                    </p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">
                      {wallet.address}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm font-medium text-foreground">
                      {formatCurrency(wallet.value)}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {formatAmount(wallet.amount, 8)} BTC
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function CryptoBreakdown({
  defaultOpen = false,
  dailyChange = 0,
}) {
  const [portfolio, setPortfolio] = useState(() =>
    getStoredProjectCryptoPortfolio(),
  );
  const [cryptoOpen, setCryptoOpen] = useState(defaultOpen);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const next = await refreshProjectCryptoPortfolio();
        if (!cancelled) setPortfolio(next);
      } catch {
        // Keep the last stored values visible.
      }
    };

    refresh();

    const handleUpdate = (event) => {
      if (!cancelled && event?.detail) {
        setPortfolio(event.detail);
      }
    };

    window.addEventListener("project-crypto-updated", handleUpdate);

    return () => {
      cancelled = true;
      window.removeEventListener("project-crypto-updated", handleUpdate);
    };
  }, []);

  const entries = useMemo(
    () =>
      [...(portfolio?.projectEntries || [])].sort(
        (a, b) => (Number(b.balance) || 0) - (Number(a.balance) || 0),
      ),
    [portfolio],
  );

  const summary = portfolio?.summary || {};
  const bitcoin = portfolio?.bitcoin || {};
  const positive = Number(dailyChange) >= 0;

  const handleRefresh = async (event) => {
    event.stopPropagation();
    setRefreshing(true);

    try {
      const next = await refreshProjectCryptoPortfolio({ force: true });
      setPortfolio(next);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="crypto-breakdown">
      <Card
        className="border-border/40 bg-card hover:border-white/10 transition-colors"
        data-testid="crypto-top-card"
      >
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setCryptoOpen((value) => !value)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              {cryptoOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}

              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary">
                <Wallet className="h-4 w-4 text-foreground" />
              </div>

              <div>
                <p className="text-lg font-semibold text-foreground">Crypto</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Project Income + Bitcoin
                </p>
              </div>
            </button>

            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="border-border/40"
              >
                <RefreshCw
                  className={`mr-2 h-3.5 w-3.5 ${
                    refreshing ? "animate-spin" : ""
                  }`}
                />
                Refresh
              </Button>

              <div className="min-w-[130px] text-right">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="font-mono text-base font-bold text-foreground">
                  {formatCurrency(summary.cryptoTotal)}
                </p>
                <p
                  className={`mt-1 text-xs font-mono ${
                    positive ? "text-emerald-500" : "text-rose-500"
                  }`}
                >
                  {positive ? "+" : "-"}
                  {formatCurrency(Math.abs(Number(dailyChange) || 0))} today
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {cryptoOpen && (
        <div className="ml-6 space-y-5">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground">Project Income</p>
                <p className="text-xs text-muted-foreground">
                  The same programs tracked on your Project Income page
                </p>
              </div>

              <p className="font-mono text-sm font-semibold text-foreground">
                {formatCurrency(summary.projectBalance)}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat
                label="Total Earned"
                value={formatCurrency(summary.totalEarned)}
              />
              <Stat
                label="Weighted APY"
                value={formatPercent(summary.weightedApy)}
              />
              <Stat
                label="Est. Monthly"
                value={formatCurrency(summary.estimatedMonthlyIncome)}
              />
              <Stat
                label="Active Positions"
                value={String(summary.activePositions || 0)}
              />
            </div>

            <div className="space-y-2">
              {entries.length > 0 ? (
                entries.map((entry) => (
                  <ProjectEntry key={entry.id} entry={entry} />
                ))
              ) : (
                <Card className="border-border/40 bg-card/70">
                  <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
                    <CircleDollarSign className="h-4 w-4" />
                    No Project Income positions are stored yet.
                  </CardContent>
                </Card>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground">Bitcoin</p>
                <p className="text-xs text-muted-foreground">
                  Kept separate from Project Income
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" />
                Live wallet value
              </div>
            </div>

            <BitcoinEntry bitcoin={bitcoin} />
          </section>

          {Array.isArray(portfolio?.errors) && portfolio.errors.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
              {portfolio.errors.join(" · ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { localStorage as storage } from "@/lib/localStorage";
import { syncNosanaEarnings, resetNosanaSyncHistory } from "@/lib/nosanaSync";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { RefreshCw, Settings, Cpu, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const NOSANA_ICON = "https://assets.coingecko.com/coins/images/15214/small/nosana.png";

function formatUsd(v) {
  const n = Number(v) || 0;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function formatRelativeTime(iso) {
  if (!iso) return "never";
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function NosanaEarningsCard() {
  const [config, setConfig] = useState(() => storage.getNosanaConfig());
  const [syncedDates, setSyncedDates] = useState(() => storage.getNosanaSyncedDates());
  const [configOpen, setConfigOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [tickKey, setTickKey] = useState(0);
  const tickRef = useRef(null);

  // Re-render every minute so "Last sync: 4m ago" stays fresh.
  useEffect(() => {
    tickRef.current = setInterval(() => setTickKey((k) => k + 1), 60_000);
    return () => clearInterval(tickRef.current);
  }, []);

  // Listen for changes from other tabs/components (e.g. txn delete) and
  // for the custom "nosana-sync-complete" event the sync function fires
  // after auto/scheduled/bootstrap runs that didn't go through this card.
  useEffect(() => {
    const refresh = () => {
      setConfig(storage.getNosanaConfig());
      setSyncedDates(storage.getNosanaSyncedDates());
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("nosana-sync-complete", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("nosana-sync-complete", refresh);
    };
  }, []);

  const totalSynced = useMemo(
    () => Object.values(syncedDates || {}).reduce((s, e) => s + (Number(e?.amount) || 0), 0),
    [syncedDates],
  );
  const recent = useMemo(() => {
    const entries = Object.entries(syncedDates || {})
      .map(([date, e]) => ({ date, amount: Number(e?.amount) || 0 }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 7);
    return entries;
  }, [syncedDates]);

  const handleSyncNow = async () => {
    if (!config?.enabled || !config?.node_address) {
      setConfigOpen(true);
      return;
    }
    setSyncing(true);
    try {
      const result = await syncNosanaEarnings();
      setConfig(storage.getNosanaConfig());
      setSyncedDates(storage.getNosanaSyncedDates());
      const { added = 0, updated = 0, total_added_usd = 0 } = result || {};
      if (added === 0 && updated === 0) {
        toast.info("Nosana: nothing new to sync");
      } else {
        toast.success(
          `Nosana synced — ${added} added, ${updated} updated (${
            total_added_usd >= 0 ? "+" : ""
          }${formatUsd(total_added_usd)})`,
        );
      }
    } catch (err) {
      console.warn("Nosana sync failed:", err);
      toast.error(err?.message || "Failed to sync Nosana earnings");
    } finally {
      setSyncing(false);
    }
  };

  const isConfigured = !!(config?.enabled && config?.node_address);

  return (
    <>
      <Card className="border-border/40 bg-card" data-testid="nosana-earnings-card">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <img
                  src={NOSANA_ICON}
                  alt="Nosana"
                  className="w-7 h-7"
                  onError={(e) => {
                    e.target.style.display = "none";
                    e.target.nextSibling.style.display = "block";
                  }}
                />
                <Cpu className="w-5 h-5 text-emerald-400 hidden" strokeWidth={1.5} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">Nosana Node Earnings</p>
                  {isConfigured ? (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                      <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={2} />
                      auto-sync 23:45 UTC
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono">
                      <AlertCircle className="w-2.5 h-2.5" strokeWidth={2} />
                      not configured
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isConfigured ? (
                    <>
                      Node: <span className="font-mono">
                        {config.node_address.slice(0, 6)}…{config.node_address.slice(-4)}
                      </span>
                      <span className="ml-2">·</span>
                      <span className="ml-2">last sync: {formatRelativeTime(config.last_synced_at)}</span>
                    </>
                  ) : (
                    "Connect your Nosana node address to auto-sync daily earnings to your Nosana investment project."
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfigOpen(true)}
                className="border-border/40 hover:bg-secondary"
                data-testid="nosana-configure-btn"
              >
                <Settings className="w-4 h-4 mr-2" strokeWidth={1.5} />
                {isConfigured ? "Edit" : "Configure"}
              </Button>
              <Button
                size="sm"
                onClick={handleSyncNow}
                disabled={syncing || !isConfigured}
                className="bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-50"
                data-testid="nosana-sync-now-btn"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} strokeWidth={1.5} />
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
            </div>
          </div>

          {isConfigured && (
            <div className="mt-4 pt-4 border-t border-border/30 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total synced</p>
                <p className="font-mono text-base font-medium text-emerald-400" data-testid="nosana-total-synced">
                  {formatUsd(totalSynced)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Days tracked</p>
                <p className="font-mono text-base font-medium text-foreground">
                  {Object.keys(syncedDates || {}).length}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Project</p>
                <p className="font-mono text-base font-medium text-foreground">
                  {config.project_name || "Nosana"}
                </p>
              </div>
            </div>
          )}

          {isConfigured && recent.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border/30">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Last 7 days</p>
              <div className="grid grid-cols-7 gap-1">
                {recent.slice().reverse().map((d) => (
                  <div
                    key={d.date}
                    className="flex flex-col items-center justify-center px-1 py-2 rounded bg-secondary/40 border border-border/20"
                    title={`${d.date}: ${formatUsd(d.amount)}`}
                    data-testid={`nosana-day-${d.date}`}
                  >
                    <span className="text-[9px] font-mono text-muted-foreground">
                      {d.date.slice(5)}
                    </span>
                    <span className="text-[11px] font-mono text-emerald-400 mt-0.5">
                      ${d.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <NosanaConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        config={config}
        onSaved={(next) => {
          setConfig(next);
          setConfigOpen(false);
        }}
      />
    </>
  );
}

function NosanaConfigDialog({ open, onOpenChange, config, onSaved }) {
  const [address, setAddress] = useState(config?.node_address || "");
  const [projectName, setProjectName] = useState(config?.project_name || "Nosana");
  const [label, setLabel] = useState(config?.label || "");
  const [enabled, setEnabled] = useState(config?.enabled ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Reset form when dialog re-opens with a different config snapshot.
  useEffect(() => {
    if (open) {
      setAddress(config?.node_address || "");
      setProjectName(config?.project_name || "Nosana");
      setLabel(config?.label || "");
      setEnabled(config?.enabled ?? true);
      setConfirmReset(false);
    }
  }, [open, config]);

  const handleSave = () => {
    const trimmed = (address || "").trim();
    if (!trimmed) {
      toast.error("Node address is required");
      return;
    }
    setSubmitting(true);
    try {
      const next = {
        node_address: trimmed,
        project_name: (projectName || "Nosana").trim() || "Nosana",
        label: (label || "").trim() || null,
        enabled,
        last_synced_at: config?.last_synced_at || null,
      };
      storage.setNosanaConfig(next);
      toast.success("Nosana configuration saved");
      onSaved(next);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisable = () => {
    const next = { ...(config || {}), enabled: false };
    storage.setNosanaConfig(next);
    toast.success("Auto-sync disabled");
    onSaved(next);
  };

  const handleResetHistory = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setResetting(true);
    try {
      const result = await resetNosanaSyncHistory();
      const removed = result?.removed || 0;
      toast.success(
        removed > 0
          ? `Cleared ${removed} synced day${removed === 1 ? "" : "s"} — tracking from today (UTC)`
          : "Sync history was already empty — tracking from today (UTC)",
      );
      // Re-read config so the parent card refreshes its cursor display.
      const fresh = storage.getNosanaConfig();
      onSaved(fresh || config);
    } catch (err) {
      console.warn("Reset sync history failed:", err);
      toast.error(err?.message || "Failed to reset sync history");
    } finally {
      setResetting(false);
      setConfirmReset(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-lg" data-testid="nosana-config-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-400" strokeWidth={1.5} />
            Configure Nosana Auto-Sync
          </DialogTitle>
          <DialogDescription>
            Pulls daily earnings directly from the Nosana dashboard API at <span className="font-mono text-foreground">23:45 UTC</span> daily and posts them as transactions to your Investment Overview's Nosana project. Earnings come from Nosana's backend, so token swaps in your wallet won't be counted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs">Node Address</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="cLmiLWMpbWjUKZzuhmAq432Vaz8eFGHgyHXfxgL3As6"
              className="bg-background border-border font-mono text-sm"
              data-testid="nosana-address-input"
            />
            <p className="text-[10px] text-muted-foreground">
              Your Nosana node operator address (Solana pubkey).
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Investment Project Name</Label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Nosana"
              className="bg-background border-border text-sm"
              data-testid="nosana-project-name-input"
            />
            <p className="text-[10px] text-muted-foreground">
              Earnings will be posted to this project (created if it doesn't exist).
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Label (sub-category)</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`e.g. Mining, Bonus (default: "Nosana")`}
              className="bg-background border-border text-sm"
              data-testid="nosana-label-input"
            />
            <p className="text-[10px] text-muted-foreground">
              Auto-synced earnings will be tagged with this sub-category in the Investment Overview.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="accent-emerald-500"
              data-testid="nosana-enabled-checkbox"
            />
            <span>Enable auto-sync (runs daily at 23:45 UTC)</span>
          </label>

          <div className="pt-3 mt-2 border-t border-border/30">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Sync history
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Wipes all auto-synced Nosana transactions and starts tracking from today (UTC) only. Useful if your card was seeded with demo backfill data.
            </p>
            <Button
              variant="outline"
              onClick={handleResetHistory}
              disabled={resetting}
              className={
                confirmReset
                  ? "border-rose-500/60 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                  : "border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
              }
              data-testid="nosana-reset-history-btn"
            >
              {resetting
                ? "Resetting…"
                : confirmReset
                ? "Click again to confirm reset"
                : "Reset sync history"}
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {config?.enabled && (
            <Button
              variant="outline"
              onClick={handleDisable}
              className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 mr-auto"
              data-testid="nosana-disable-btn"
            >
              Disable
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-border/40"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={submitting}
            className="bg-emerald-500 text-black hover:bg-emerald-400"
            data-testid="nosana-save-config-btn"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

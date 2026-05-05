import { useEffect, useMemo, useRef, useState } from "react";
import { localStorage as storage } from "@/lib/localStorage";
import {
  applyUnityNetworkBalanceUpdate,
  isUnityNetworkStale,
} from "@/lib/unityNetworkSync";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  RefreshCw, Settings, Network, CheckCircle2, AlertCircle, Clock,
  TrendingUp, ArrowDown, MinusCircle,
} from "lucide-react";
import { toast } from "sonner";

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

export default function UnityNetworkEarningsCard() {
  const [config, setConfig] = useState(() => storage.getUnityNetworkConfig());
  const [configOpen, setConfigOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [tickKey, setTickKey] = useState(0);
  const tickRef = useRef(null);

  // Minute ticker so "last update" + stale badge stay live.
  useEffect(() => {
    tickRef.current = setInterval(() => setTickKey((k) => k + 1), 60_000);
    return () => clearInterval(tickRef.current);
  }, []);

  useEffect(() => {
    const refresh = () => setConfig(storage.getUnityNetworkConfig());
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("unity-network-sync-complete", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("unity-network-sync-complete", refresh);
    };
  }, []);

  const isConfigured = !!(config?.enabled);
  const stale = useMemo(() => isUnityNetworkStale(config), [config, tickKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const baselineUsd = Number(config?.baseline_usd) || 0;

  return (
    <>
      <Card className="border-border/40 bg-card" data-testid="unity-network-earnings-card">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                <Network className="w-5 h-5 text-indigo-400" strokeWidth={1.5} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground">Unity Network</p>
                  {isConfigured ? (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono"
                      title="Manual USD-balance tracking"
                    >
                      <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={2} />
                      manual
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono">
                      <AlertCircle className="w-2.5 h-2.5" strokeWidth={2} />
                      not configured
                    </span>
                  )}
                  {isConfigured && stale && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 font-mono"
                      title="Balance hasn't been updated in over 7 days — pop into Unity Network and log your latest USD total"
                      data-testid="unity-network-stale-badge"
                    >
                      <Clock className="w-2.5 h-2.5" strokeWidth={2} />
                      update needed
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isConfigured ? (
                    <>
                      Project: <span className="font-mono text-foreground">{config.project_name || "Phone Farm"}</span>
                      <span className="mx-2">·</span>
                      last update: {formatRelativeTime(config.last_updated_at)}
                    </>
                  ) : (
                    "Track Unity Network earnings in USD. No public API — enter your dashboard's USD total periodically and we'll log the delta as earnings on Phone Farm."
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
                data-testid="unity-network-configure-btn"
              >
                <Settings className="w-4 h-4 mr-2" strokeWidth={1.5} />
                {isConfigured ? "Edit" : "Configure"}
              </Button>
              <Button
                size="sm"
                onClick={() => setUpdateOpen(true)}
                disabled={!isConfigured}
                className={`${
                  stale ? "bg-orange-500 hover:bg-orange-400" : "bg-indigo-500 hover:bg-indigo-400"
                } text-black disabled:opacity-50`}
                data-testid="unity-network-update-btn"
              >
                <RefreshCw className="w-4 h-4 mr-2" strokeWidth={1.5} />
                Update balance
              </Button>
            </div>
          </div>

          {isConfigured && (
            <div className="mt-4 pt-4 border-t border-border/30 grid grid-cols-2 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current balance</p>
                <p className="font-mono text-base font-medium text-indigo-400" data-testid="unity-network-baseline">
                  {formatUsd(baselineUsd)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Project</p>
                <p className="font-mono text-base font-medium text-foreground">
                  {config.project_name || "Phone Farm"}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <UnityNetworkConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        config={config}
        onSaved={(next) => {
          setConfig(next);
          setConfigOpen(false);
        }}
      />

      <UnityNetworkUpdateDialog
        open={updateOpen}
        onOpenChange={setUpdateOpen}
        config={config}
        onDone={() => {
          setConfig(storage.getUnityNetworkConfig());
          setUpdateOpen(false);
        }}
      />
    </>
  );
}

// ───────────────────────────── Config dialog ─────────────────────────────
function UnityNetworkConfigDialog({ open, onOpenChange, config, onSaved }) {
  const [projectName, setProjectName] = useState(config?.project_name || "Phone Farm");
  const [baseline, setBaseline] = useState(String(config?.baseline_usd ?? "0"));
  const [enabled, setEnabled] = useState(config?.enabled ?? true);

  useEffect(() => {
    if (open) {
      setProjectName(config?.project_name || "Phone Farm");
      setBaseline(String(config?.baseline_usd ?? "0"));
      setEnabled(config?.enabled ?? true);
    }
  }, [open, config]);

  const handleSave = () => {
    const bn = Number(baseline);
    if (!Number.isFinite(bn) || bn < 0) {
      toast.error("Baseline must be a non-negative number");
      return;
    }
    const next = {
      baseline_usd: Number(bn.toFixed(6)),
      project_name: (projectName || "Phone Farm").trim() || "Phone Farm",
      enabled,
      last_updated_at: config?.last_updated_at || new Date().toISOString(),
    };
    storage.setUnityNetworkConfig(next);
    toast.success("Unity Network configuration saved");
    onSaved(next);
  };

  const handleDisable = () => {
    const next = { ...(config || {}), enabled: false };
    storage.setUnityNetworkConfig(next);
    toast.success("Unity Network tracking disabled");
    onSaved(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-lg" data-testid="unity-network-config-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="w-4 h-4 text-indigo-400" strokeWidth={1.5} />
            Configure Unity Network Tracking
          </DialogTitle>
          <DialogDescription>
            Unity Network doesn't expose a public earnings API, so this is
            manual. Set your current cumulative USD earnings here (starts at
            $0.00), then use "Update balance" whenever you want to log new
            earnings. Earnings will be added to the Phone Farm investment
            project. Baseline edits here don't create transactions — they
            only adjust the reference point.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs">Current USD Balance (baseline)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={baseline}
              onChange={(e) => setBaseline(e.target.value)}
              placeholder="0.00"
              className="bg-background border-border font-mono text-sm"
              data-testid="unity-network-baseline-input"
            />
            <p className="text-[10px] text-muted-foreground">
              The cumulative USD amount currently shown on your Unity Network
              dashboard. Increases from here are treated as earnings;
              decreases as withdrawals.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Investment Project Name</Label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Phone Farm"
              className="bg-background border-border text-sm"
              data-testid="unity-network-project-name-input"
            />
            <p className="text-[10px] text-muted-foreground">
              Earnings will be posted to this project (created if it doesn't exist).
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="accent-indigo-500"
              data-testid="unity-network-enabled-checkbox"
            />
            <span>Enable tracking</span>
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {config?.enabled && (
            <Button
              variant="outline"
              onClick={handleDisable}
              className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 mr-auto"
              data-testid="unity-network-disable-btn"
            >
              Disable
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border/40">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="bg-indigo-500 text-black hover:bg-indigo-400"
            data-testid="unity-network-save-config-btn"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────── Update balance dialog ────────────────────────
function UnityNetworkUpdateDialog({ open, onOpenChange, config, onDone }) {
  const [newBalance, setNewBalance] = useState("");
  const [action, setAction] = useState("earning");
  const [submitting, setSubmitting] = useState(false);

  const baseline = Number(config?.baseline_usd) || 0;
  const parsed = Number(newBalance);
  const hasInput = newBalance !== "" && Number.isFinite(parsed) && parsed >= 0;
  const delta = hasInput ? parsed - baseline : 0;

  // Auto-pick the most likely action as the user types.
  useEffect(() => {
    if (!hasInput) return;
    if (Math.abs(delta) < 0.005) setAction("no_change");
    else if (delta > 0) setAction("earning");
    else setAction("withdrawal");
  }, [newBalance, hasInput, delta]);

  useEffect(() => {
    if (open) {
      setNewBalance("");
      setAction("earning");
      setSubmitting(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!hasInput) {
      toast.error("Enter your current Unity Network USD balance");
      return;
    }
    setSubmitting(true);
    try {
      const result = await applyUnityNetworkBalanceUpdate({
        newBalanceUsd: parsed,
        action,
      });
      if (result.action === "earning") {
        toast.success(
          `+${formatUsd(result.delta_usd)} earned — synced to ${config?.project_name || "Phone Farm"}`,
        );
      } else if (result.action === "withdrawal") {
        toast.info(
          `Withdrawal logged (${result.delta_usd >= 0 ? "+" : ""}${formatUsd(result.delta_usd)}). No earnings recorded.`,
        );
      } else {
        toast.info("No change — update timer reset.");
      }
      onDone();
    } catch (err) {
      toast.error(err?.message || "Failed to update balance");
    } finally {
      setSubmitting(false);
    }
  };

  const ActionOption = ({ value, icon: Icon, title, desc, disabled }) => (
    <label
      className={`flex gap-3 items-start p-3 rounded-md border cursor-pointer transition ${
        action === value
          ? "border-indigo-500/60 bg-indigo-500/5"
          : "border-border/30 hover:border-border/60"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      <input
        type="radio"
        name="unity-network-action"
        value={value}
        checked={action === value}
        onChange={(e) => !disabled && setAction(e.target.value)}
        disabled={disabled}
        className="mt-1 accent-indigo-500"
        data-testid={`unity-network-action-${value}`}
      />
      <div className="flex-1">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-lg" data-testid="unity-network-update-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-indigo-400" strokeWidth={1.5} />
            Update Unity Network Balance
          </DialogTitle>
          <DialogDescription>
            Enter your current cumulative USD earnings from the Unity Network
            dashboard. We'll compute the delta against your baseline and
            either credit it as earnings on Phone Farm or log a withdrawal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label className="text-xs">New USD Balance</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                placeholder={baseline.toFixed(2)}
                autoFocus
                className="bg-background border-border font-mono text-sm"
                data-testid="unity-network-new-balance-input"
              />
            </div>
            <div className="text-right pb-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Baseline</p>
              <p className="font-mono text-sm text-foreground">{formatUsd(baseline)}</p>
            </div>
          </div>

          {hasInput && (
            <div
              className={`p-3 rounded-md border ${
                delta > 0
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : delta < 0
                    ? "border-rose-500/30 bg-rose-500/5"
                    : "border-border/30 bg-secondary/30"
              }`}
              data-testid="unity-network-delta-preview"
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Delta</p>
              <div className="flex items-baseline gap-2 mt-1">
                <p
                  className={`font-mono text-xl font-medium ${
                    delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-foreground"
                  }`}
                >
                  {delta >= 0 ? "+" : ""}{formatUsd(delta)}
                </p>
              </div>
            </div>
          )}

          {hasInput && (
            <div className="space-y-2">
              <Label className="text-xs">What happened?</Label>
              <div className="space-y-2">
                <ActionOption
                  value="earning"
                  icon={TrendingUp}
                  title="Earned from phone farm"
                  desc="Credit the delta as an earning transaction on the Phone Farm project."
                  disabled={delta <= 0}
                />
                <ActionOption
                  value="withdrawal"
                  icon={ArrowDown}
                  title="Withdrew or swapped out"
                  desc="Lower the baseline without creating earnings. Prevents double-counting."
                />
                <ActionOption
                  value="no_change"
                  icon={MinusCircle}
                  title="Just resetting the stale timer"
                  desc="I checked Unity Network and nothing changed — keep baseline, reset the nudge."
                  disabled={Math.abs(delta) >= 0.005}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border/40">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!hasInput || submitting}
            className="bg-indigo-500 text-black hover:bg-indigo-400 disabled:opacity-50"
            data-testid="unity-network-confirm-btn"
          >
            {submitting ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

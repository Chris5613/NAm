import { useEffect, useMemo, useRef, useState } from "react";
import { localStorage as storage } from "@/lib/localStorage";
import {
  applyAcurastBalanceUpdate,
  getAcuPrice,
  getAcuPriceCacheInfo,
  isAcurastStale,
} from "@/lib/acurastSync";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  RefreshCw, Settings, Smartphone, CheckCircle2, AlertCircle, Clock,
  TrendingUp, ArrowDown, MinusCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  installAcurastExtensionListener,
  syncAcurastFromExtensionNow,
  getAcurastExtensionState,
} from "@/lib/acurastExtensionSync";
import { Plug, Zap } from "lucide-react";

function formatUsd(v) {
  const n = Number(v) || 0;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function formatAcu(v, digits = 4) {
  const n = Number(v) || 0;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: Math.min(digits, 2) })} ACU`;
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

export default function AcurastEarningsCard() {
  const [config, setConfig] = useState(() => storage.getAcurastConfig());
  const [acuPrice, setAcuPrice] = useState(0);
  const [configOpen, setConfigOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [tickKey, setTickKey] = useState(0);
  const tickRef = useRef(null);
  const [extState, setExtState] = useState(() =>
  getAcurastExtensionState()
);

const [extSyncing, setExtSyncing] = useState(false);

  // Minute ticker so "Last update: 4m ago" stays fresh and the stale badge
  // flips in real time without needing a page reload.
  useEffect(() => {
    tickRef.current = setInterval(() => setTickKey((k) => k + 1), 60_000);
    return () => clearInterval(tickRef.current);
  }, []);

  useEffect(() => {
  installAcurastExtensionListener();

  const refresh = () => {
    setExtState(getAcurastExtensionState());
  };

  refresh();

  window.addEventListener(
    "acurast-extension-update",
    refresh
  );

  return () => {
    window.removeEventListener(
      "acurast-extension-update",
      refresh
    );
  };
}, []);

  // Fetch ACU price once on mount.
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      const p = await getAcuPrice();
      if (!cancelled) setAcuPrice(p);
    };
    pull();
    return () => { cancelled = true; };
  }, []);

  // Listen for state changes from other tabs/components or balance updates.
  useEffect(() => {
    const refresh = () => setConfig(storage.getAcurastConfig());
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("acurast-sync-complete", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("acurast-sync-complete", refresh);
    };
  }, []);

  const isConfigured = !!(config?.enabled);
  const stale = useMemo(() => isAcurastStale(config), [config, tickKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const baselineUsd = (Number(config?.baseline_acu) || 0) * (Number(acuPrice) || 0);
  const next = {
  baseline_acu: Number(bn.toFixed(6)),
  project_name: (projectName || "Phone Farm").trim() || "Phone Farm",
  enabled,
  created_at: config?.created_at || new Date().toISOString(),
  last_updated_at: config?.last_updated_at || new Date().toISOString(),
};

  const handleManualExtensionSync = async () => {
  setExtSyncing(true);

  try {
    const result =
      await syncAcurastFromExtensionNow();

    console.log("[ACU CARD] sync result", result);

    if (!result.ok) {
      toast.error(
        `Extension sync failed: ${
          result.reason || result.error || "unknown"
        }`
      );
      return;
    }

    if (result.reason === "already_applied") {
      toast.success("Acurast already synced");
      return;
    }

    toast.success("Acurast synced from extension");
  } catch (err) {
    toast.error(
      err?.message || "Acurast extension sync failed"
    );
  } finally {
    setExtSyncing(false);
  }
};

function getDaysTracked(startIso) {
  if (!startIso) return 0;

  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return 0;

  const diffMs = Date.now() - start.getTime();
  return Math.max(1, Math.floor(diffMs / 86_400_000) + 1);
}

const daysTracked = getDaysTracked(config?.created_at || config?.last_updated_at);
const extPayload = extState?.last_payload;

  return (
    <>
      <Card className="border-border/40 bg-card" data-testid="acurast-earnings-card">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                <Smartphone className="w-5 h-5 text-cyan-400" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">
  Acurast
</h3>
<div className="flex items-center gap-2 flex-wrap">
  {isConfigured ? (
    <span
      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono"
      title={extPayload ? "Balance auto-fetched by Chrome extension" : "Manual ACU balance-delta tracking"}
    >
      <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={2} />
      {extPayload ? "auto-sync" : "manual"}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono">
      <AlertCircle className="w-2.5 h-2.5" strokeWidth={2} />
      not configured
    </span>
  )}

  {extPayload && (
    <span
      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 font-mono"
      title="Chrome extension is the data source"
    >
      <Plug className="w-2.5 h-2.5" strokeWidth={2} />
      extension
    </span>
  )}

  {isConfigured && stale && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 font-mono"
                      title="Balance hasn't been updated in over 7 days — pop into Acurast and log your latest ACU"
                      data-testid="acurast-stale-badge"
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
{extPayload && (
  <>
    <span className="mx-2">·</span>
    extension: {formatRelativeTime(extPayload.synced_at)}
  </>
)}
                    </>
                  ) : (
                    "Track ACU earned from Acurast Phone Farm. No public earnings API — enter your ACU balance periodically and we'll convert the delta into earnings at the live ACU price."
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
                data-testid="acurast-configure-btn"
              >
                <Settings className="w-4 h-4 mr-2" strokeWidth={1.5} />
                {isConfigured ? "Edit" : "Configure"}
              </Button>
              <Button
  variant="outline"
  size="sm"
  onClick={handleManualExtensionSync}
  disabled={extSyncing}
  className="border-violet-500/40 text-violet-300 hover:bg-violet-500/10 hover:text-violet-200 disabled:opacity-50"
  data-testid="acurast-extension-sync-btn"
>
  <Zap className={`w-4 h-4 mr-2 ${extSyncing ? "animate-pulse" : ""}`} strokeWidth={1.5} />
  {extSyncing ? "Syncing…" : "Sync from extension"}
</Button>
              <Button
                size="sm"
                onClick={() => setUpdateOpen(true)}
                disabled={!isConfigured}
                className={`${
                  stale ? "bg-orange-500 hover:bg-orange-400" : "bg-cyan-500 hover:bg-cyan-400"
                } text-black disabled:opacity-50`}
                data-testid="acurast-update-btn"
              >
                <RefreshCw className="w-4 h-4 mr-2" strokeWidth={1.5} />
                Update balance
              </Button>
            </div>
          </div>
          {extPayload && (
  <div className="mt-4 pt-4 border-t border-border/30 grid grid-cols-2 sm:grid-cols-3 gap-3">
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Lifetime balance
      </p>
      <p className="font-mono text-base font-medium text-foreground">
        {formatAcu(extPayload.balance_acu)}
      </p>
    </div>
    <div>
  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
    Days tracked
  </p>
  <p className="font-mono text-base font-medium text-foreground">
    {daysTracked}
  </p>
</div>

    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Last push
      </p>
      <p className="font-mono text-sm font-medium text-foreground">
        {formatRelativeTime(extPayload.synced_at)}
      </p>
    </div>
  </div>
)}

          {isConfigured && (
            <div className="mt-4 pt-4 border-t border-border/30 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current balance</p>
                <p className="font-mono text-base font-medium text-foreground" data-testid="acurast-baseline">
                  {formatAcu(config?.baseline_acu)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">USD value (live)</p>
                <p className="font-mono text-base font-medium text-cyan-400">
                  {acuPrice > 0 ? formatUsd(baselineUsd) : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">ACU price</p>
                <p className="font-mono text-base font-medium text-foreground">
                  {acuPrice > 0 ? `$${acuPrice.toFixed(4)}` : "—"}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AcurastConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        config={config}
        onSaved={(next) => {
          setConfig(next);
          setConfigOpen(false);
        }}
      />

      <AcurastUpdateDialog
        open={updateOpen}
        onOpenChange={setUpdateOpen}
        config={config}
        acuPrice={acuPrice}
        onDone={() => {
          setConfig(storage.getAcurastConfig());
          setUpdateOpen(false);
        }}
      />
    </>
  );
}

// ───────────────────────────── Config dialog ─────────────────────────────
function AcurastConfigDialog({ open, onOpenChange, config, onSaved }) {
  const [projectName, setProjectName] = useState(config?.project_name || "Phone Farm");
  const [baseline, setBaseline] = useState(String(config?.baseline_acu ?? "0"));
  const [enabled, setEnabled] = useState(config?.enabled ?? true);

  useEffect(() => {
    if (open) {
      setProjectName(config?.project_name || "Phone Farm");
      setBaseline(String(config?.baseline_acu ?? "0"));
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
      baseline_acu: Number(bn.toFixed(6)),
      project_name: (projectName || "Phone Farm").trim() || "Phone Farm",
      enabled,
      last_updated_at: config?.last_updated_at || new Date().toISOString(),
    };
    storage.setAcurastConfig(next);
    toast.success("Acurast configuration saved");
    onSaved(next);
  };

  const handleDisable = () => {
    const next = { ...(config || {}), enabled: false };
    storage.setAcurastConfig(next);
    toast.success("Acurast tracking disabled");
    onSaved(next);
  };



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-lg" data-testid="acurast-config-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-cyan-400" strokeWidth={1.5} />
            Configure Acurast Tracking
          </DialogTitle>
          <DialogDescription>
            Acurast doesn't expose a public earnings API, so this is manual.
            Set your current ACU balance from the Acurast dashboard here
            (starts at 0), then use "Update balance" whenever you want to
            log new earnings. We'll convert the ACU delta into USD using the
            live CoinGecko price. Baseline edits here don't create
            transactions — they only adjust the reference point.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs">Current ACU Balance (baseline)</Label>
            <Input
              type="number"
              step="0.0001"
              min="0"
              value={baseline}
              onChange={(e) => setBaseline(e.target.value)}
              placeholder="0"
              className="bg-background border-border font-mono text-sm"
              data-testid="acurast-baseline-input"
            />
            <p className="text-[10px] text-muted-foreground">
              The ACU amount currently in your Acurast operator dashboard.
              Increases from here are treated as earnings; decreases as
              withdrawals.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Investment Project Name</Label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Phone Farm"
              className="bg-background border-border text-sm"
              data-testid="acurast-project-name-input"
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
              className="accent-cyan-500"
              data-testid="acurast-enabled-checkbox"
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
              data-testid="acurast-disable-btn"
            >
              Disable
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border/40">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="bg-cyan-500 text-black hover:bg-cyan-400"
            data-testid="acurast-save-config-btn"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────── Update balance dialog ────────────────────────
function AcurastUpdateDialog({ open, onOpenChange, config, acuPrice, onDone }) {
  const [newBalance, setNewBalance] = useState("");
  const [action, setAction] = useState("earning");
  const [submitting, setSubmitting] = useState(false);
  const [manualPrice, setManualPrice] = useState("");
  const [label, setLabel] = useState("");

  const baseline = Number(config?.baseline_acu) || 0;
  const parsed = Number(newBalance);
  const hasInput = newBalance !== "" && Number.isFinite(parsed) && parsed >= 0;
  const delta = hasInput ? parsed - baseline : 0;

  // Effective price: live > manual > cached
  const manualPriceNum = Number(manualPrice) || 0;
  const cachedInfo = getAcuPriceCacheInfo();
  const effectivePrice = acuPrice > 0 ? acuPrice : manualPriceNum > 0 ? manualPriceNum : (cachedInfo?.price || 0);
  const priceSource = acuPrice > 0 ? "live" : manualPriceNum > 0 ? "manual" : cachedInfo?.price ? "cached" : "none";
  const deltaUsd = delta * effectivePrice;

  // Auto-pick the most likely action as the user types.
  useEffect(() => {
    if (!hasInput) return;
    if (Math.abs(delta) < 0.000001) setAction("no_change");
    else if (delta > 0) setAction("earning");
    else setAction("withdrawal");
  }, [newBalance, hasInput, delta]);

  useEffect(() => {
    if (open) {
      setNewBalance("");
      setAction("earning");
      setSubmitting(false);
      setManualPrice("");
      setLabel("");
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!hasInput) {
      toast.error("Enter your current Acurast ACU balance");
      return;
    }
    if (action === "earning" && effectivePrice <= 0) {
      toast.error("ACU price required — enter a manual price below to proceed");
      return;
    }
    setSubmitting(true);
    try {
      const result = await applyAcurastBalanceUpdate({
        newBalance: parsed,
        action,
        acuPriceOverride: effectivePrice > 0 ? effectivePrice : null,
        label: label.trim() || null,
      });
      if (result.action === "earning") {
        toast.success(
          `+${result.delta_acu.toFixed(4)} ACU earned — ${formatUsd(result.delta_usd)} synced to ${config?.project_name || "Phone Farm"}`,
        );
      } else if (result.action === "withdrawal") {
        toast.info(
          `Withdrawal logged (${result.delta_acu >= 0 ? "+" : ""}${result.delta_acu.toFixed(4)} ACU). No earnings recorded.`,
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
          ? "border-cyan-500/60 bg-cyan-500/5"
          : "border-border/30 hover:border-border/60"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      <input
        type="radio"
        name="acurast-action"
        value={value}
        checked={action === value}
        onChange={(e) => !disabled && setAction(e.target.value)}
        disabled={disabled}
        className="mt-1 accent-cyan-500"
        data-testid={`acurast-action-${value}`}
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
      <DialogContent className="bg-card border-border sm:max-w-lg" data-testid="acurast-update-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-cyan-400" strokeWidth={1.5} />
            Update Acurast Balance
          </DialogTitle>
          <DialogDescription>
            Enter your current ACU balance from the Acurast dashboard. We'll
            compute the delta against your baseline and either credit it as
            earnings (priced in USD at the live ACU rate) or log a
            withdrawal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label className="text-xs">New ACU Balance</Label>
              <Input
                type="number"
                step="0.0001"
                min="0"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                placeholder={baseline.toFixed(4)}
                autoFocus
                className="bg-background border-border font-mono text-sm"
                data-testid="acurast-new-balance-input"
              />
            </div>
            <div className="text-right pb-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Baseline</p>
              <p className="font-mono text-sm text-foreground">{formatAcu(baseline)}</p>
            </div>
          </div>

          {/* ACU Price indicator + manual override */}
          <div className="p-3 rounded-md border border-border/30 bg-secondary/20 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">ACU Price</p>
              {priceSource === "live" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">live</span>
              )}
              {priceSource === "cached" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono" title={`Cached from ${cachedInfo?.fetched_at ? new Date(cachedInfo.fetched_at).toLocaleString() : 'unknown'}`}>
                  cached
                </span>
              )}
              {priceSource === "manual" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono">manual</span>
              )}
              {priceSource === "none" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 font-mono">unavailable</span>
              )}
            </div>
            {effectivePrice > 0 ? (
              <p className="font-mono text-sm text-foreground">${effectivePrice.toFixed(4)}</p>
            ) : (
              <p className="text-xs text-rose-400">CoinGecko rate-limited. Enter ACU price manually below.</p>
            )}
            {acuPrice <= 0 && (
              <div className="space-y-1 pt-1">
                <Label className="text-[10px] text-muted-foreground">Manual ACU price (USD)</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  placeholder={cachedInfo?.price ? cachedInfo.price.toFixed(4) : "0.0000"}
                  className="bg-background border-border font-mono text-xs h-8"
                  data-testid="acurast-manual-price-input"
                />
                {cachedInfo?.price > 0 && !manualPriceNum && (
                  <p className="text-[10px] text-muted-foreground">
                    Using cached: ${cachedInfo.price.toFixed(4)} (from {formatRelativeTime(cachedInfo.fetched_at)})
                  </p>
                )}
              </div>
            )}
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
              data-testid="acurast-delta-preview"
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Delta</p>
              <div className="flex items-baseline gap-2 mt-1">
                <p
                  className={`font-mono text-xl font-medium ${
                    delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-foreground"
                  }`}
                >
                  {delta >= 0 ? "+" : ""}{delta.toFixed(4)} ACU
                </p>
                <p className="font-mono text-sm text-muted-foreground">
                  ({effectivePrice > 0
                    ? `${delta >= 0 ? "+" : ""}${formatUsd(deltaUsd)}`
                    : "enter ACU price above"})
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
                  desc="I checked Acurast and nothing changed — keep baseline, reset the nudge."
                  disabled={Math.abs(delta) >= 0.000001}
                />
              </div>
            </div>
          )}
        </div>

        {/* Label for sub-category */}
        {hasInput && delta > 0 && action === "earning" && (
          <div className="space-y-2 pb-2">
            <Label className="text-xs">Label (sub-category)</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`e.g. Mining, Staking (default: "Acurast")`}
              className="bg-background border-border text-sm"
              data-testid="acurast-label-input"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border/40">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!hasInput || submitting}
            className="bg-cyan-500 text-black hover:bg-cyan-400 disabled:opacity-50"
            data-testid="acurast-confirm-btn"
          >
            {submitting ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

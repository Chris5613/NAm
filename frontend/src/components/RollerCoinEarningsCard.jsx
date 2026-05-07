import { useEffect, useMemo, useRef, useState } from "react";
import { localStorage as storage } from "@/lib/localStorage";
import {
  applyRollerCoinBalanceUpdate,
  getTrxPrice,
  getTrxPriceCacheInfo,
  isRollerCoinStale,
} from "@/lib/rollercoinSync";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  RefreshCw,
  Settings,
  Gamepad2,
  CheckCircle2,
  AlertCircle,
  Clock,
  TrendingUp,
  ArrowDown,
  MinusCircle,
  Plug,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  installRollerCoinExtensionListener,
  getRollerCoinExtensionState,
  syncRollerCoinFromExtensionNow,
} from "@/lib/rollercoinExtensionSync";

const ROLLERCOIN_ICON = "https://rollercoin.com/static/img/logo-icon.svg";

function formatUsd(v) {
  const n = Number(v) || 0;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function formatTrx(v, digits = 4) {
  const n = Number(v) || 0;
  return `${n.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: Math.min(digits, 2),
  })} TRX`;
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

export default function RollerCoinEarningsCard() {
  const [config, setConfig] = useState(() => storage.getRollerCoinConfig());
  const [trxPrice, setTrxPrice] = useState(0);
  const [configOpen, setConfigOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [tickKey, setTickKey] = useState(0);
  const [extPayload, setExtPayload] = useState(null);
  const [extSyncing, setExtSyncing] = useState(false);
  const tickRef = useRef(null);
  
  const [extState, setExtState] = useState(() =>
  getRollerCoinExtensionState()
);

useEffect(() => {
  installRollerCoinExtensionListener();
}, []);

  useEffect(() => {
    tickRef.current = setInterval(() => setTickKey((k) => k + 1), 60_000);
    return () => clearInterval(tickRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const pull = async () => {
      const p = await getTrxPrice();
      if (!cancelled) setTrxPrice(p);
    };

    pull();

    return () => {
      cancelled = true;
    };
  }, []);

useEffect(() => {
  const refresh = () => {
    const next = getRollerCoinExtensionState();

    setExtState(next);
    setExtPayload(next.last_payload || null);
  };

  refresh();

  window.addEventListener(
    "rollercoin-extension-update",
    refresh
  );

  return () => {
    window.removeEventListener(
      "rollercoin-extension-update",
      refresh
    );
  };
}, []);

const handleManualExtensionSync = async () => {
  setExtSyncing(true);

  try {
    const result =
      await syncRollerCoinFromExtensionNow();

    console.log("[RC CARD] sync result", result);

    if (!result.ok) {
      toast.error(
        `Extension sync failed: ${
          result.reason || result.error || "unknown"
        }`
      );
      return;
    }

    if (result.reason === "already_applied") {
      toast.success("RollerCoin already synced");
      return;
    }

    toast.success("RollerCoin synced from extension");
  } catch (err) {
    toast.error(
      err?.message || "RollerCoin extension sync failed"
    );
  } finally {
    setExtSyncing(false);
  }
};

  const isConfigured = !!config?.enabled;
  const stale = useMemo(() => isRollerCoinStale(config), [config, tickKey]);
  const hasExtensionData = !!extPayload;
  const baselineUsd = (Number(config?.baseline_trx) || 0) * (Number(trxPrice) || 0);

  const todayTrx =
    extPayload?.rows?.find((r) => r.date === extPayload?.to)?.trx || 0;


  return (
    <>
      <Card className="border-border/40 bg-card" data-testid="rollercoin-earnings-card">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                <img
                  src={ROLLERCOIN_ICON}
                  alt="RollerCoin"
                  className="w-7 h-7"
                  onError={(e) => {
                    e.target.style.display = "none";
                    e.target.nextSibling.style.display = "block";
                  }}
                />
                <Gamepad2 className="w-5 h-5 text-orange-400 hidden" strokeWidth={1.5} />
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground">
                    RollerCoin TRX Earnings
                  </p>

                  {isConfigured ? (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono"
                      title={hasExtensionData ? "Earnings auto-fetched by Chrome extension" : "Manual balance-delta tracking"}
                    >
                      <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={2} />
                      {hasExtensionData ? "auto-sync" : "manual"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono">
                      <AlertCircle className="w-2.5 h-2.5" strokeWidth={2} />
                      not configured
                    </span>
                  )}

                  {hasExtensionData && (
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
                      title="Balance hasn't been updated in over 7 days"
                      data-testid="rollercoin-stale-badge"
                    >
                      <Clock className="w-2.5 h-2.5" strokeWidth={2} />
                      update needed
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground mt-0.5">
                  {isConfigured ? (
                    <>
                      Project:{" "}
                      <span className="font-mono text-foreground">
                        {config.project_name || "RollerCoin"}
                      </span>
                      <span className="mx-2">·</span>
                      last update: {formatRelativeTime(config.last_updated_at)}
                      {hasExtensionData && (
                        <>
                          <span className="mx-2">·</span>
                          extension: {formatRelativeTime(extPayload.synced_at)}
                        </>
                      )}
                    </>
                  ) : (
                    "Track TRX earned on RollerCoin. Configure manual tracking or sync from the extension."
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfigOpen(true)}
                className="border-border/40 hover:bg-secondary"
                data-testid="rollercoin-configure-btn"
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
                data-testid="rollercoin-extension-sync-btn"
              >
                <Zap className={`w-4 h-4 mr-2 ${extSyncing ? "animate-pulse" : ""}`} strokeWidth={1.5} />
                {extSyncing ? "Syncing…" : "Sync from extension"}
              </Button>

              <Button
                size="sm"
                onClick={() => setUpdateOpen(true)}
                disabled={!isConfigured}
                className={`${
                  stale ? "bg-orange-500 hover:bg-orange-400" : "bg-emerald-500 hover:bg-emerald-400"
                } text-black disabled:opacity-50`}
                data-testid="rollercoin-update-btn"
              >
                <RefreshCw className="w-4 h-4 mr-2" strokeWidth={1.5} />
                Update balance
              </Button>
            </div>
          </div>

          {hasExtensionData && (
            <div className="mt-4 pt-4 border-t border-border/30 grid grid-cols-2 sm:grid-cols-4 gap-3">

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Lifetime
                </p>
                <p className="font-mono text-base font-medium text-foreground">
                  {formatTrx(extPayload.total_trx)}
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Days loaded
                </p>
                <p className="font-mono text-base font-medium text-foreground">
                  {extPayload.rows?.length || 0}
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
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Current balance
                </p>
                <p
                  className="font-mono text-base font-medium text-foreground"
                  data-testid="rollercoin-baseline"
                >
                  {formatTrx(config?.baseline_trx)}
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  USD value live
                </p>
                <p className="font-mono text-base font-medium text-emerald-400">
                  {trxPrice > 0 ? formatUsd(baselineUsd) : "—"}
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  TRX price
                </p>
                <p className="font-mono text-base font-medium text-foreground">
                  {trxPrice > 0 ? `$${trxPrice.toFixed(4)}` : "—"}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <RollerCoinConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        config={config}
        onSaved={(next) => {
          setConfig(next);
          setConfigOpen(false);
        }}
      />

      <RollerCoinUpdateDialog
        open={updateOpen}
        onOpenChange={setUpdateOpen}
        config={config}
        trxPrice={trxPrice}
        onDone={() => {
          setConfig(storage.getRollerCoinConfig());
          setUpdateOpen(false);
        }}
      />
    </>
  );
}

// ───────────────────────────── Config dialog ─────────────────────────────
function RollerCoinConfigDialog({ open, onOpenChange, config, onSaved }) {
  const [projectName, setProjectName] = useState(config?.project_name || "RollerCoin");
  const [baseline, setBaseline] = useState(String(config?.baseline_trx ?? ""));
  const [enabled, setEnabled] = useState(config?.enabled ?? true);

  useEffect(() => {
    if (open) {
      setProjectName(config?.project_name || "RollerCoin");
      setBaseline(String(config?.baseline_trx ?? ""));
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
      baseline_trx: Number(bn.toFixed(6)),
      project_name: (projectName || "RollerCoin").trim() || "RollerCoin",
      enabled,
      last_updated_at: config?.last_updated_at || new Date().toISOString(),
    };
    storage.setRollerCoinConfig(next);
    toast.success("RollerCoin configuration saved");
    onSaved(next);
  };

  const handleDisable = () => {
    const next = { ...(config || {}), enabled: false };
    storage.setRollerCoinConfig(next);
    toast.success("RollerCoin tracking disabled");
    onSaved(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-lg" data-testid="rollercoin-config-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-orange-400" strokeWidth={1.5} />
            Configure RollerCoin Tracking
          </DialogTitle>
          <DialogDescription>
            RollerCoin has no public API, so this one is manual. Set your current TRX balance
            here, then use "Update balance" whenever you want to log new earnings. Baseline
            edits here don't create transactions — they only adjust the reference point.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs">Current TRX Balance (baseline)</Label>
            <Input
              type="number"
              step="0.0001"
              min="0"
              value={baseline}
              onChange={(e) => setBaseline(e.target.value)}
              placeholder="68.5938"
              className="bg-background border-border font-mono text-sm"
              data-testid="rollercoin-baseline-input"
            />
            <p className="text-[10px] text-muted-foreground">
              The TRX amount currently in your RollerCoin account. Increases from here are
              treated as earnings; decreases as withdrawals.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Investment Project Name</Label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="RollerCoin"
              className="bg-background border-border text-sm"
              data-testid="rollercoin-project-name-input"
            />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="accent-orange-500"
              data-testid="rollercoin-enabled-checkbox"
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
              data-testid="rollercoin-disable-btn"
            >
              Disable
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border/40">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="bg-orange-500 text-black hover:bg-orange-400"
            data-testid="rollercoin-save-config-btn"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────── Update balance dialog ────────────────────────
function RollerCoinUpdateDialog({ open, onOpenChange, config, trxPrice, onDone }) {
  const [newBalance, setNewBalance] = useState("");
  const [action, setAction] = useState("earning"); // earning | withdrawal | no_change
  const [submitting, setSubmitting] = useState(false);
  const [manualPrice, setManualPrice] = useState("");
  const [label, setLabel] = useState("");

  const baseline = Number(config?.baseline_trx) || 0;
  const parsed = Number(newBalance);
  const hasInput = newBalance !== "" && Number.isFinite(parsed) && parsed >= 0;
  const delta = hasInput ? parsed - baseline : 0;

  // Effective price: live > manual > cached
  const manualPriceNum = Number(manualPrice) || 0;
  const cachedInfo = getTrxPriceCacheInfo();
  const effectivePrice = trxPrice > 0 ? trxPrice : manualPriceNum > 0 ? manualPriceNum : (cachedInfo?.price || 0);
  const priceSource = trxPrice > 0 ? "live" : manualPriceNum > 0 ? "manual" : cachedInfo?.price ? "cached" : "none";
  const deltaUsd = delta * effectivePrice;

  // Auto-pick the most likely action as the user types.
  useEffect(() => {
    if (!hasInput) return;
    if (Math.abs(delta) < 0.00001) setAction("no_change");
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
      toast.error("Enter your current RollerCoin TRX balance");
      return;
    }
    if (action === "earning" && effectivePrice <= 0) {
      toast.error("TRX price required — enter a manual price below to proceed");
      return;
    }
    setSubmitting(true);
    try {
      const result = await applyRollerCoinBalanceUpdate({
        newBalance: parsed,
        action,
        trxPriceOverride: effectivePrice > 0 ? effectivePrice : null,
        label: label.trim() || null,
      });
      if (result.action === "earning") {
        toast.success(
          `+${result.delta_trx.toFixed(4)} TRX earned — ${formatUsd(result.delta_usd)} synced to ${config?.project_name || "RollerCoin"}`,
        );
      } else if (result.action === "withdrawal") {
        toast.info(
          `Withdrawal logged (${result.delta_trx >= 0 ? "+" : ""}${result.delta_trx.toFixed(4)} TRX). No earnings recorded.`,
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
          ? "border-orange-500/60 bg-orange-500/5"
          : "border-border/30 hover:border-border/60"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      <input
        type="radio"
        name="rc-action"
        value={value}
        checked={action === value}
        onChange={(e) => !disabled && setAction(e.target.value)}
        disabled={disabled}
        className="mt-1 accent-orange-500"
        data-testid={`rollercoin-action-${value}`}
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
      <DialogContent className="bg-card border-border sm:max-w-lg" data-testid="rollercoin-update-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-orange-400" strokeWidth={1.5} />
            Update RollerCoin Balance
          </DialogTitle>
          <DialogDescription>
            Enter your current TRX balance from the RollerCoin site. We'll compute the delta
            against your baseline and either credit it as earnings or log a withdrawal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label className="text-xs">New TRX Balance</Label>
              <Input
                type="number"
                step="0.0001"
                min="0"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                placeholder={baseline.toFixed(4)}
                autoFocus
                className="bg-background border-border font-mono text-sm"
                data-testid="rollercoin-new-balance-input"
              />
            </div>
            <div className="text-right pb-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Baseline</p>
              <p className="font-mono text-sm text-foreground">{formatTrx(baseline)}</p>
            </div>
          </div>

          {/* TRX Price indicator + manual override */}
          <div className="p-3 rounded-md border border-border/30 bg-secondary/20 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">TRX Price</p>
              {priceSource === "live" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">live</span>
              )}
              {priceSource === "cached" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono">cached</span>
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
              <p className="text-xs text-rose-400">CoinGecko rate-limited. Enter TRX price manually below.</p>
            )}
            {trxPrice <= 0 && (
              <div className="space-y-1 pt-1">
                <Label className="text-[10px] text-muted-foreground">Manual TRX price (USD)</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  placeholder={cachedInfo?.price ? cachedInfo.price.toFixed(4) : "0.0000"}
                  className="bg-background border-border font-mono text-xs h-8"
                  data-testid="rollercoin-manual-price-input"
                />
                {cachedInfo?.price > 0 && !manualPriceNum && (
                  <p className="text-[10px] text-muted-foreground">
                    Using cached: ${cachedInfo.price.toFixed(4)}
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
              data-testid="rollercoin-delta-preview"
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Delta</p>
              <div className="flex items-baseline gap-2 mt-1">
                <p
                  className={`font-mono text-xl font-medium ${
                    delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-foreground"
                  }`}
                >
                  {delta >= 0 ? "+" : ""}{delta.toFixed(4)} TRX
                </p>
                <p className="font-mono text-sm text-muted-foreground">
                  ({effectivePrice > 0
                    ? `${delta >= 0 ? "+" : ""}${formatUsd(deltaUsd)}`
                    : "enter TRX price above"})
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
                  title="Earned from playing / mining"
                  desc="Credit the delta as an earning transaction on the RollerCoin project."
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
                  desc="I checked RollerCoin and nothing changed — keep baseline, reset the nudge."
                  disabled={Math.abs(delta) >= 0.00001}
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
              placeholder={`e.g. Mining, Game (default: "RollerCoin")`}
              className="bg-background border-border text-sm"
              data-testid="rollercoin-label-input"
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
            className="bg-orange-500 text-black hover:bg-orange-400 disabled:opacity-50"
            data-testid="rollercoin-confirm-btn"
          >
            {submitting ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

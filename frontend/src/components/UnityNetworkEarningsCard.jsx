import { useEffect, useMemo, useRef, useState } from "react";
import { localStorage as storage } from "@/lib/localStorage";
import {
  applyUnityNetworkBalanceUpdate,
  isUnityNetworkStale,
} from "@/lib/unityNetworkSync";
import {
  getExtensionState,
  setAutoSyncEnabled,
  syncFromExtensionNow,
  hasTodayReading,
  onExtensionApply,
  listAccounts,
  removeAccount,
  clearAllAccounts,
} from "@/lib/unityNetworkExtensionSync";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  RefreshCw, Settings, Network, CheckCircle2, AlertCircle, Clock,
  TrendingUp, ArrowDown, MinusCircle, Plug, Zap, Trash2, Mail, Users,
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
  const [extState, setExtState] = useState(() => getExtensionState());
  const [configOpen, setConfigOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [tickKey, setTickKey] = useState(0);
  const [extSyncing, setExtSyncing] = useState(false);
  const tickRef = useRef(null);

  // Minute ticker so "last update" + stale badge stay live.
  useEffect(() => {
    tickRef.current = setInterval(() => setTickKey((k) => k + 1), 60_000);
    return () => clearInterval(tickRef.current);
  }, []);

  useEffect(() => {
    const refresh = () => {
      setConfig(storage.getUnityNetworkConfig());
      setExtState(getExtensionState());
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("unity-network-sync-complete", refresh);
    window.addEventListener("unity-network-extension-update", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("unity-network-sync-complete", refresh);
      window.removeEventListener("unity-network-extension-update", refresh);
    };
  }, []);

  // Toast when the background listener auto-applies an extension push while
  // the user is looking at this card. We only fire for "applied" results so
  // duplicate / no-op pushes don't spam the user.
  useEffect(() => {
    const unsub = onExtensionApply((result) => {
      if (!result?.applied) return;
      if (result.action === "earning") {
        const projectName = (storage.getUnityNetworkConfig()?.project_name) || "Phone Farm";
        const who = result.account_email ? ` (${result.account_email})` : "";
        toast.success(
          `+${formatUsd(result.delta_usd)} from extension${who} → ${projectName}`,
        );
      } else if (result.action === "withdrawal") {
        toast.info("Extension reported a baseline reset (no earnings credited).");
      } else if (result.action === "bootstrap") {
        toast.success("Unity Nodes tracking auto-enabled from extension push.");
      }
    });
    return unsub;
  }, []);

  const isConfigured = !!(config?.enabled);
  const stale = useMemo(() => isUnityNetworkStale(config), [config, tickKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const baselineUsd = Number(config?.baseline_usd) || 0;

  // Extension-driven: a reading dated for today (UTC) means the card should
  // show today's earnings tile sourced from the latest Chrome-extension push.
  const showTodayTile = useMemo(() => hasTodayReading(), [extState, tickKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const todayUsd = Number(extState?.last_today_usd) || 0;
  const lastSeenAt = extState?.last_seen_at;
  const lastAppliedSyncedAt = extState?.last_applied_synced_at;
  const autoSync = extState?.auto_sync_enabled !== false;
  const hasAnyExtensionData = !!(lastSeenAt || lastAppliedSyncedAt);

  // Per-account breakdown — the extension can only hold one Unity Nodes
  // session at a time, so the user signs into each account in turn and the
  // app remembers each one. The lifetime tile sums across all of them.
  const accounts = useMemo(() => listAccounts(), [extState, tickKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasMultipleAccounts = accounts.length > 0;

  const handleRemoveAccount = async (key, email) => {
    const label = email || "this account";
    if (!window.confirm(`Remove ${label} from the tracker? Phone Farm baseline will be lowered to match the new total (no earnings credited).`)) return;
    const result = await removeAccount(key);
    if (result?.ok) {
      setExtState(getExtensionState());
      setConfig(storage.getUnityNetworkConfig());
      toast.success(`Removed ${label}.`);
    } else {
      toast.error("Could not remove account.");
    }
  };

  const handleManualExtensionSync = async () => {
    setExtSyncing(true);
    try {
      const result = await syncFromExtensionNow({
        allowAutoConfigure: !isConfigured,
        timeoutMs: 4000,
      });
      if (!result.ok) {
        if (result.reason === "timeout") {
          toast.error(
            "No response from extension. Make sure the Unity Nodes Earnings Tracker is installed and active on this page.",
          );
        } else {
          toast.error(result.error || "Extension sync failed");
        }
        return;
      }
      if (!result.applied) {
        if (result.reason === "already_applied") {
          toast.info("Already up to date — no new earnings since the last push.");
        } else if (result.reason === "tracking_disabled") {
          toast.info("Tracking is disabled. Enable it in Configure first.");
        } else if (result.reason === "invalid_lifetime") {
          toast.error("Extension payload is missing lifetime_usd.");
        } else if (result.reason === "empty_payload") {
          toast.info("Extension hasn't run a sync yet. Open it and click Sync Now.");
        } else {
          toast.info("No change to apply.");
        }
        return;
      }
      if (result.action === "earning") {
        toast.success(
          `+${formatUsd(result.delta_usd)} synced from extension → ${
            (storage.getUnityNetworkConfig()?.project_name) || "Phone Farm"
          }`,
        );
      } else if (result.action === "withdrawal") {
        toast.info(`Lifetime decreased — baseline reset, no earnings credited.`);
      } else if (result.action === "bootstrap") {
        toast.success(
          `Tracking enabled. Baseline locked to ${formatUsd(getExtensionState().last_lifetime_usd)}.`,
        );
      } else {
        toast.info("Up to date — stale timer reset.");
      }
    } catch (err) {
      toast.error(err?.message || "Extension sync failed");
    } finally {
      setExtSyncing(false);
    }
  };

  const handleAutoSyncToggle = (enabled) => {
    setAutoSyncEnabled(enabled);
    setExtState(getExtensionState());
    toast.info(enabled ? "Auto-sync from extension: on" : "Auto-sync from extension: off");
  };

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
                      title={hasAnyExtensionData ? "Earnings auto-fetched by Chrome extension" : "Manual USD-balance tracking"}
                    >
                      <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={2} />
                      {hasAnyExtensionData ? "auto-sync" : "manual"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono">
                      <AlertCircle className="w-2.5 h-2.5" strokeWidth={2} />
                      not configured
                    </span>
                  )}
                  {hasAnyExtensionData && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 font-mono"
                      title="Chrome extension is the data source"
                      data-testid="unity-network-extension-badge"
                    >
                      <Plug className="w-2.5 h-2.5" strokeWidth={2} />
                      extension
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
                      {hasAnyExtensionData && (
                        <>
                          <span className="mx-2">·</span>
                          extension: {formatRelativeTime(lastSeenAt || lastAppliedSyncedAt)}
                        </>
                      )}
                    </>
                  ) : hasAnyExtensionData ? (
                    "Chrome extension is reporting earnings — click Configure to start tracking and we'll lock the current lifetime as your baseline."
                  ) : (
                    "Track Unity Network earnings in USD. Install the Chrome extension to auto-sync daily, or enter your dashboard's USD total manually below."
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
                data-testid="unity-network-configure-btn"
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
                data-testid="unity-network-extension-sync-btn"
                title="Pull the latest payload pushed by the Chrome extension"
              >
                <Zap className={`w-4 h-4 mr-2 ${extSyncing ? "animate-pulse" : ""}`} strokeWidth={1.5} />
                {extSyncing ? "Syncing…" : "Sync from extension"}
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

          {/* Extension status panel — shows today's earnings + last push when
              the Chrome extension has reported in. Hidden when there's no
              extension data yet so the card stays clean for manual-only users. */}
          {hasAnyExtensionData && (
            <div
              className="mt-4 pt-4 border-t border-border/30 grid grid-cols-2 sm:grid-cols-4 gap-3"
              data-testid="unity-network-extension-panel"
            >
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5 text-violet-400" strokeWidth={2} />
                  Today's earnings
                </p>
                <p
                  className={`font-mono text-lg font-medium ${showTodayTile ? "text-emerald-400" : "text-muted-foreground"}`}
                  data-testid="unity-network-today-usd"
                >
                  {showTodayTile ? formatUsd(todayUsd) : "—"}
                </p>
                {extState?.last_today_date && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                    {extState.last_today_date}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Lifetime</p>
                <p className="font-mono text-base font-medium text-foreground">
                  {formatUsd(extState?.last_lifetime_usd)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Devices</p>
                <p className="font-mono text-base font-medium text-foreground">
                  {extState?.last_device_count || 0}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Last push</p>
                <p className="font-mono text-sm font-medium text-foreground">
                  {formatRelativeTime(lastSeenAt || lastAppliedSyncedAt)}
                </p>
                <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSync}
                    onChange={(e) => handleAutoSyncToggle(e.target.checked)}
                    className="accent-violet-500 w-3 h-3"
                    data-testid="unity-network-auto-sync-toggle"
                  />
                  <span>auto-apply</span>
                </label>
              </div>
            </div>
          )}

          {/* Per-account breakdown — the extension only holds one logged-in
              Unity Nodes session at a time, so we accumulate per-email rows
              here and sum them into the Lifetime tile above. Tap "remove"
              to drop an account (lowers the Phone Farm baseline to match,
              no earnings credited). */}
          {hasMultipleAccounts && (
            <div
              className="mt-4 pt-4 border-t border-border/30"
              data-testid="unity-network-accounts-panel"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Users className="w-2.5 h-2.5 text-violet-400" strokeWidth={2} />
                  Accounts ({accounts.length})
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Sign into each account in the extension and click "Sync from extension" once.
                </p>
              </div>
              <div className="space-y-1.5">
                {accounts.map((acct) => {
                  const todayUtc = new Date().toISOString().split("T")[0];
                  const hasTodayForAcct = acct.last_today_date === todayUtc;
                  const acctTodayUsd = hasTodayForAcct ? Number(acct.last_today_usd) || 0 : 0;
                  const isLegacyKey = acct.key === "_legacy";
                  return (
                    <div
                      key={acct.key}
                      className="flex items-center justify-between gap-3 p-2 rounded-md bg-secondary/30 border border-border/30"
                      data-testid={`unity-network-account-row-${acct.key}`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Mail className="w-3 h-3 text-violet-400 flex-shrink-0" strokeWidth={1.8} />
                        <span
                          className={`text-xs font-mono truncate ${
                            isLegacyKey ? "text-amber-400 italic" : "text-foreground"
                          }`}
                          title={acct.email || "Legacy migration entry — sign into one of your accounts and sync to assign."}
                        >
                          {acct.email || "(unknown — legacy)"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] font-mono flex-shrink-0">
                        <div className="text-right">
                          <p className="text-muted-foreground text-[9px] uppercase tracking-wider">Lifetime</p>
                          <p className="text-foreground">{formatUsd(acct.last_lifetime_usd)}</p>
                        </div>
                        <div className="text-right hidden sm:block">
                          <p className="text-muted-foreground text-[9px] uppercase tracking-wider">Today</p>
                          <p className={hasTodayForAcct ? "text-emerald-400" : "text-muted-foreground"}>
                            {hasTodayForAcct ? formatUsd(acctTodayUsd) : "—"}
                          </p>
                        </div>
                        <div className="text-right hidden md:block">
                          <p className="text-muted-foreground text-[9px] uppercase tracking-wider">Last</p>
                          <p className="text-muted-foreground">{formatRelativeTime(acct.last_seen_at)}</p>
                        </div>
                        <button
                          onClick={() => handleRemoveAccount(acct.key, acct.email)}
                          className="p-1 rounded hover:bg-rose-500/10 text-muted-foreground hover:text-rose-400 transition"
                          title="Remove this account"
                          data-testid={`unity-network-remove-account-${acct.key}`}
                        >
                          <Trash2 className="w-3 h-3" strokeWidth={1.8} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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

  const handleResetExtensionData = () => {
    if (!window.confirm("Wipe every per-account record from the Chrome extension? This does not change your Phone Farm baseline — sign into each account in the extension and click Sync to rebuild the list.")) return;
    clearAllAccounts();
    toast.success("Extension per-account data cleared.");
  };

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
          <Button
            variant="outline"
            onClick={handleResetExtensionData}
            className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
            data-testid="unity-network-reset-extension-btn"
            title="Wipes the per-account list — sign into each account and re-sync to rebuild."
          >
            Reset extension data
          </Button>
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
  const [label, setLabel] = useState("");

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
      setLabel("");
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
        label: label.trim() || null,
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

        {/* Label for sub-category */}
        {hasInput && delta > 0 && action === "earning" && (
          <div className="space-y-2 pb-2">
            <Label className="text-xs">Label (sub-category)</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`e.g. Mining, Bonus (default: "Unity Network")`}
              className="bg-background border-border text-sm"
              data-testid="unity-network-label-input"
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

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

const ROLLERCOIN_ICON =
  "https://rollercoin.com/static/img/logo-icon.svg";

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
  if (diff < 3_600_000)
    return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)
    return `${Math.floor(diff / 3_600_000)}h ago`;

  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function RollerCoinEarningsCard() {
  const [config, setConfig] = useState(() =>
    storage.getRollerCoinConfig()
  );

const [trxPrice, setTrxPrice] = useState(0);  

  const [configOpen, setConfigOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [balanceInput, setBalanceInput] = useState("");
const [updatingBalance, setUpdatingBalance] = useState(false);

  const [tickKey, setTickKey] = useState(0);

  const [extPayload, setExtPayload] =
    useState(null);

  const [extSyncing, setExtSyncing] =
    useState(false);

  const tickRef = useRef(null);

  const [extState, setExtState] = useState(() =>
    getRollerCoinExtensionState()
  );

  useEffect(() => {
    installRollerCoinExtensionListener();
  }, []);

  useEffect(() => {
    tickRef.current = setInterval(
      () => setTickKey((k) => k + 1),
      60_000
    );

    return () => clearInterval(tickRef.current);
  }, []);

  useEffect(() => {
  if (!updateOpen) return;

  setBalanceInput(
    config?.baseline_trx != null
      ? String(config.baseline_trx)
      : ""
  );
}, [updateOpen, config?.baseline_trx]);

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
      const next =
        getRollerCoinExtensionState();

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

  const handleBalanceUpdate = async () => {
  const newBalance = Number(balanceInput);

  if (!Number.isFinite(newBalance) || newBalance < 0) {
    toast.error("Enter a valid TRX balance");
    return;
  }

  const oldBalance = Number(config?.baseline_trx) || 0;

  let action = "no_change";

  if (newBalance > oldBalance) {
    action = "earning";
  } else if (newBalance < oldBalance) {
    action = "withdrawal";
  }

  setUpdatingBalance(true);

  try {
    await applyRollerCoinBalanceUpdate({
      newBalance,
      action,
      trxPriceOverride: trxPrice > 0 ? trxPrice : null,
      label: "RollerCoin",
    });

    const nextConfig = storage.getRollerCoinConfig();
    setConfig(nextConfig);

    window.dispatchEvent(new CustomEvent("crypto-holding-updated"));

    setUpdateOpen(false);
    toast.success("RollerCoin balance updated");
  } catch (err) {
    toast.error(err?.message || "Failed to update RollerCoin balance");
  } finally {
    setUpdatingBalance(false);
  }
};

  const handleManualExtensionSync =
    async () => {
      setExtSyncing(true);

      try {
        const result =
          await syncRollerCoinFromExtensionNow();

        if (!result.ok) {
          toast.error(
            `Extension sync failed: ${
              result.reason ||
              result.error ||
              "unknown"
            }`
          );

          return;
        }

        if (
          result.reason === "already_applied"
        ) {
          toast.success(
            "RollerCoin already synced"
          );

          return;
        }

        toast.success(
          "RollerCoin synced from extension"
        );
      } catch (err) {
        toast.error(
          err?.message ||
            "RollerCoin extension sync failed"
        );
      } finally {
        setExtSyncing(false);
      }
    };

  const isConfigured = !!config?.enabled;

  const stale = useMemo(
    () => isRollerCoinStale(config),
    [config, tickKey]
  );

  const hasExtensionData = !!extPayload;

const baselineUsd =
  (Number(config?.baseline_trx) || 0) *
  (Number(trxPrice) || 0);

  return (

    
    <>
    <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
  <DialogContent className="bg-card border-border sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Update RollerCoin Balance</DialogTitle>
      <DialogDescription>
        Enter your current total RollerCoin TRX balance.
      </DialogDescription>
    </DialogHeader>

    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Current TRX balance</Label>

        <Input
          type="number"
          step="any"
          value={balanceInput}
          onChange={(e) => setBalanceInput(e.target.value)}
          placeholder="Example: 123.4567"
          className="bg-background border-border font-mono"
        />
      </div>

      <div className="rounded-md border border-border/40 bg-secondary/20 p-3 text-xs text-muted-foreground space-y-1">
        <p>
          Previous balance:{" "}
          <span className="font-mono text-foreground">
            {formatTrx(config?.baseline_trx || 0)}
          </span>
        </p>

        <p>
          New balance:{" "}
          <span className="font-mono text-foreground">
            {formatTrx(balanceInput || 0)}
          </span>
        </p>
      </div>
    </div>

    <DialogFooter>
      <Button
        variant="outline"
        onClick={() => setUpdateOpen(false)}
        disabled={updatingBalance}
      >
        Cancel
      </Button>

      <Button
        onClick={handleBalanceUpdate}
        disabled={updatingBalance}
      >
        {updatingBalance ? "Updating..." : "Save update"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
      <Card className="border-border/40 bg-card">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-md bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                <img
                  src={ROLLERCOIN_ICON}
                  alt="RollerCoin"
                  className="w-7 h-7"
                />
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">

                  <p className="text-sm font-medium text-foreground">
                    RollerCoin
                  </p>

                  {isConfigured ? (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      {hasExtensionData
                        ? "auto-sync"
                        : "manual"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono">
                      <AlertCircle className="w-2.5 h-2.5" />
                      not configured
                    </span>
                  )}

                  {hasExtensionData && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 font-mono">
                      <Plug className="w-2.5 h-2.5" />
                      extension
                    </span>
                  )}

                </div>

                <p className="text-xs text-muted-foreground mt-0.5">
                  {isConfigured ? (
                    <>
                      Project:
                      <span className="font-mono text-foreground ml-1">
                        {config.project_name ||
                          "RollerCoin"}
                      </span>
                    </>
                  ) : (
                    "Track SOL earned on RollerCoin."
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">

              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setConfigOpen(true)
                }
              >
                <Settings className="w-4 h-4 mr-2" />
                {isConfigured
                  ? "Edit"
                  : "Configure"}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={
                  handleManualExtensionSync
                }
                disabled={extSyncing}
              >
                <Zap className="w-4 h-4 mr-2" />
                {extSyncing
                  ? "Syncing…"
                  : "Sync from extension"}
              </Button>

              <Button
                size="sm"
                onClick={() =>
                  setUpdateOpen(true)
                }
                disabled={!isConfigured}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Update balance
              </Button>
            </div>
          </div>

          {hasExtensionData && (
            <div className="mt-4 pt-4 border-t border-border/30 grid grid-cols-2 sm:grid-cols-3 gap-3">

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Lifetime
                </p>

                <p className="font-mono text-base font-medium text-foreground">
                  {formatTrx(
                    extPayload.total_trx
                  )}
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Days loaded
                </p>

                <p className="font-mono text-base font-medium text-foreground">
                  {extPayload.rows?.length ||
                    0}
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Last push
                </p>

                <p className="font-mono text-sm font-medium text-foreground">
                  {formatRelativeTime(
                    extPayload.synced_at
                  )}
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

                <p className="font-mono text-base font-medium text-foreground">
                  {formatTrx(
                    config?.baseline_trx
                  )}
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  USD value live
                </p>

                <p className="font-mono text-base font-medium text-emerald-400">
                  {trxPrice > 0
                    ? formatUsd(
                        baselineUsd
                      )
                    : "—"}
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  TRX price
                </p>

                <p className="font-mono text-base font-medium text-foreground">
                  {trxPrice > 0
                    ? `$${trxPrice.toFixed(
                        4
                      )}`
                    : "—"}
                </p>
              </div>

            </div>
          )}

        </CardContent>
      </Card>
    </>
  );
}
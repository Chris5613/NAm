import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Cpu, Fan, Gauge, RefreshCw, Settings, Thermometer, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localStorage as storage } from "@/lib/localStorage";
import { syncKryptex } from "@/lib/kryptexSync";
import {
  getKryptexExtensionState,
  installKryptexExtensionListener,
  syncKryptexFromExtensionNow,
} from "@/lib/kryptexExtensionSync";

function formatUsd(value) {
  return (Number(value) || 0).toLocaleString("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function formatHashrate(value) {
  const units = ["H/s", "kH/s", "MH/s", "GH/s", "TH/s", "PH/s"];
  let amount = Number(value) || 0;
  let unitIndex = 0;
  while (amount >= 1000 && unitIndex < units.length - 1) {
    amount /= 1000;
    unitIndex += 1;
  }
  return `${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${units[unitIndex]}`;
}

function relativeTime(value) {
  if (!value) return "never";
  const difference = Date.now() - new Date(value).getTime();
  if (difference < 60_000) return "just now";
  if (difference < 3_600_000) return `${Math.floor(difference / 60_000)}m ago`;
  if (difference < 86_400_000) return `${Math.floor(difference / 3_600_000)}h ago`;
  return `${Math.floor(difference / 86_400_000)}d ago`;
}

export default function KryptexEarningsCard() {
  const [config, setConfig] = useState(() => storage.getKryptexConfig());
  const [extState, setExtState] = useState(() => getKryptexExtensionState());
  const [configOpen, setConfigOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    installKryptexExtensionListener();
  }, []);

  useEffect(() => {
    const refresh = () => {
      setConfig(storage.getKryptexConfig());
      setExtState(getKryptexExtensionState());
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("kryptex-sync-complete", refresh);
    window.addEventListener("kryptex-extension-update", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("kryptex-sync-complete", refresh);
      window.removeEventListener("kryptex-extension-update", refresh);
    };
  }, []);

  const hasExtension = !!extState?.extension_detected;

  const runSync = async (quiet = false) => {
    if (!config?.enabled) return setConfigOpen(true);
    setSyncing(true);
    try {
      const result = hasExtension
        ? await syncKryptexFromExtensionNow()
        : await syncKryptex();
      setConfig(storage.getKryptexConfig());
      if (!quiet && result.action === "earning") toast.success(`Kryptex synced +${formatUsd(result.delta_usd)}`);
      else if (!quiet && result.action === "withdrawal") toast.info("Kryptex payout detected; baseline updated");
      else if (!quiet) toast.info("Kryptex is current");
    } catch (error) {
      if (!quiet) toast.error(error?.message || "Could not reach the Kryptex app");
    } finally {
      setSyncing(false);
    }
  };

  const status = config?.latest_status;
  const miners = status?.miners || [];
  const isConfigured = !!config?.enabled;

  return (
    <>
      <Card className="border-border/40 bg-card" data-testid="kryptex-earnings-card">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                <Cpu className="w-5 h-5 text-cyan-400" strokeWidth={1.5} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground">Kryptex Desktop</p>
                  {isConfigured ? (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                      <CheckCircle2 className="w-2.5 h-2.5" /> local auto-sync
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono">
                      <AlertCircle className="w-2.5 h-2.5" /> not configured
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isConfigured
                    ? `${miners.length} active ${miners.length === 1 ? "device" : "devices"} · ${hasExtension ? "via extension" : "via local backend"} · last sync ${relativeTime(config.last_synced_at)}`
                    : "Tracks CPU and GPU mining from the Kryptex app running on this PC."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)} className="border-border/40">
                <Settings className="w-4 h-4 mr-2" />{isConfigured ? "Edit" : "Configure"}
              </Button>
              <Button size="sm" onClick={() => runSync()} disabled={!isConfigured || syncing} className="bg-cyan-500 text-black hover:bg-cyan-400">
                <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing..." : "Sync now"}
              </Button>
            </div>
          </div>

          {isConfigured && status && (
            <div className="mt-4 pt-4 border-t border-border/30 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Metric label="Balance" value={formatUsd(status.balance_usd)} accent />
                <Metric label="Withdrawable" value={formatUsd(status.withdrawable_usd)} />
                <Metric label="Combined / day" value={formatUsd(status.profitability_usd_day)} />
                <Metric label="Active devices" value={miners.length} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {miners.map((miner) => <MinerRow key={`${miner.device}-${miner.coin}-${miner.algorithm}`} miner={miner} />)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <KryptexConfigDialog open={configOpen} onOpenChange={setConfigOpen} config={config} onSaved={(next) => {
        setConfig(next);
        setConfigOpen(false);
      }} />
    </>
  );
}

function Metric({ label, value, accent = false }) {
  return <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className={`font-mono text-base font-medium ${accent ? "text-cyan-400" : "text-foreground"}`}>{value}</p></div>;
}

function MinerRow({ miner }) {
  return (
    <div className="rounded-md border border-border/30 bg-secondary/20 p-3 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{miner.device}</p>
          <p className="text-[10px] font-mono text-muted-foreground uppercase">{miner.coin} · {miner.algorithm} · {miner.miner}</p>
        </div>
        <span className="text-xs font-mono text-emerald-400 whitespace-nowrap">{formatUsd(miner.profitability_usd_day)}/d</span>
      </div>
      <div className="mt-2 flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Gauge className="w-3.5 h-3.5" />{formatHashrate(miner.hashrate)}</span>
        {miner.temperature_c != null && <span className="inline-flex items-center gap-1"><Thermometer className="w-3.5 h-3.5 text-orange-400" />{miner.temperature_c}°C</span>}
        {miner.power_w != null && <span className="inline-flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-yellow-400" />{miner.power_w} W</span>}
        {miner.fan_percent != null && <span className="inline-flex items-center gap-1"><Fan className="w-3.5 h-3.5" />{miner.fan_percent}%</span>}
        <span>Shares {miner.accepted_shares}/{miner.rejected_shares}</span>
      </div>
    </div>
  );
}

function KryptexConfigDialog({ open, onOpenChange, config, onSaved }) {
  const [projectName, setProjectName] = useState(config?.project_name || "Kryptex");
  const [label, setLabel] = useState(config?.label || "Mining");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setProjectName(config?.project_name || "Kryptex");
      setLabel(config?.label || "Mining");
    }
  }, [open, config]);

  const save = async () => {
    setSubmitting(true);
    const next = { ...(config || {}), enabled: true, project_name: projectName.trim() || "Kryptex", label: label.trim() || "Mining" };
    storage.setKryptexConfig(next);
    try {
      // No baseline yet on first connect either way, so both paths just
      // record the current balance without treating it as an earning.
      if (getKryptexExtensionState().extension_detected) {
        await syncKryptexFromExtensionNow();
      } else {
        await syncKryptex({ initialize: !Number.isFinite(Number(config?.baseline_balance_usd)) });
      }
      const fresh = storage.getKryptexConfig();
      toast.success("Kryptex connected; current balance set as the baseline");
      onSaved(fresh);
    } catch (error) {
      if (config) storage.setKryptexConfig(config);
      else storage.remove("networth_kryptex_config");
      toast.error(error?.message || "Start Kryptex and try again");
    } finally {
      setSubmitting(false);
    }
  };

  const disable = () => {
    const next = { ...(config || {}), enabled: false };
    storage.setKryptexConfig(next);
    toast.success("Kryptex auto-sync disabled");
    onSaved(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect Kryptex Desktop</DialogTitle>
          <DialogDescription>
            Reads Kryptex's local service without storing your login. The current account balance becomes the baseline; future increases become earnings and payouts only reset the baseline.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2"><Label className="text-xs">Investment Project Name</Label><Input value={projectName} onChange={(event) => setProjectName(event.target.value)} className="bg-background border-border" /></div>
          <div className="space-y-2"><Label className="text-xs">Earnings Label</Label><Input value={label} onChange={(event) => setLabel(event.target.value)} className="bg-background border-border" /></div>
          <p className="text-xs text-muted-foreground">Kryptex and this site's backend must be running on this PC. Live CPU and GPU telemetry refreshes every minute.</p>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          {config?.enabled && <Button variant="outline" onClick={disable} className="mr-auto border-rose-500/30 text-rose-400">Disable</Button>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={submitting} className="bg-cyan-500 text-black hover:bg-cyan-400">{submitting ? "Connecting..." : "Connect"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

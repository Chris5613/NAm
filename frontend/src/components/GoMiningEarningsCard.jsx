import { useEffect, useMemo, useRef, useState } from "react";
import { localStorage as storage } from "@/lib/localStorage";
import {
  applyGoMiningBalanceUpdate,
  getGoMiningPrices,
  getGoMiningPriceCacheInfo,
  isGoMiningTokenStale,
} from "@/lib/goMiningTokenSync";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  RefreshCw, Settings, Pickaxe, CheckCircle2, AlertCircle, Clock,
  TrendingUp, ArrowDown, MinusCircle, Zap,
} from "lucide-react";
import { toast } from "sonner";

const GMT_ICON = "https://coin-images.coingecko.com/coins/images/15662/small/GoMining_Logo.webp?1769225542";
const BTC_ICON = "https://assets.coingecko.com/coins/images/1/small/bitcoin.png";

function formatUsd(v) {
  const n = Number(v) || 0;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function formatGmt(v, digits = 4) {
  const n = Number(v) || 0;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: Math.min(digits, 2) })} GMT`;
}

function formatBtc(v, digits = 8) {
  const n = Number(v) || 0;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: Math.min(digits, 4) })} BTC`;
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

export default function GoMiningEarningsCard() {
  const [config, setConfig] = useState(() => storage.getGoMiningTokenConfig());
  const [prices, setPrices] = useState({ gmt: 0, btc: 0 });
  const [configOpen, setConfigOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [tickKey, setTickKey] = useState(0);
  const tickRef = useRef(null);

  useEffect(() => {
    tickRef.current = setInterval(() => setTickKey((k) => k + 1), 60_000);
    return () => clearInterval(tickRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getGoMiningPrices();
      if (!cancelled) setPrices(p);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const refresh = () => setConfig(storage.getGoMiningTokenConfig());
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("gomining-token-sync-complete", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("gomining-token-sync-complete", refresh);
    };
  }, []);

  const isConfigured = !!(config?.enabled);
  const stale = useMemo(() => isGoMiningTokenStale(config), [config, tickKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const gmtUsd = (Number(config?.baseline_gmt) || 0) * (Number(prices.gmt) || 0);
  const btcUsd = (Number(config?.baseline_btc) || 0) * (Number(prices.btc) || 0);
  const totalUsd = gmtUsd + btcUsd;

  return (
    <>
      <Card className="border-border/40 bg-card" data-testid="gomining-earnings-card">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-yellow-500/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                <img src={GMT_ICON} alt="GoMining" className="w-7 h-7 object-contain" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground">GoMining (GMT + BTC)</p>
                  {isConfigured ? (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono"
                      title="Manual GMT + BTC balance tracking with boost-spend support"
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
                      title="Balance hasn't been updated in over 7 days — pop into GoMining and log your latest GMT + BTC"
                      data-testid="gomining-stale-badge"
                    >
                      <Clock className="w-2.5 h-2.5" strokeWidth={2} />
                      update needed
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isConfigured ? (
                    <>
                      Project: <span className="font-mono text-foreground">{config.project_name || "GoMining"}</span>
                      <span className="mx-2">·</span>
                      last update: {formatRelativeTime(config.last_updated_at)}
                    </>
                  ) : (
                    "Track GoMining (GMT) tokens + BTC earnings, plus boost spend. Boost-spend is recorded as additional invested capital, not a withdrawal."
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
                data-testid="gomining-configure-btn"
              >
                <Settings className="w-4 h-4 mr-2" strokeWidth={1.5} />
                {isConfigured ? "Edit" : "Configure"}
              </Button>
              <Button
                size="sm"
                onClick={() => setUpdateOpen(true)}
                disabled={!isConfigured}
                className={`${
                  stale ? "bg-orange-500 hover:bg-orange-400" : "bg-yellow-500 hover:bg-yellow-400"
                } text-black disabled:opacity-50`}
                data-testid="gomining-update-btn"
              >
                <RefreshCw className="w-4 h-4 mr-2" strokeWidth={1.5} />
                Update balances
              </Button>
            </div>
          </div>

          {isConfigured && (
            <div className="mt-4 pt-4 border-t border-border/30 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <BalanceTile
                  iconUrl={GMT_ICON}
                  label="GMT balance"
                  amount={formatGmt(config?.baseline_gmt)}
                  usd={prices.gmt > 0 ? formatUsd(gmtUsd) : "—"}
                  price={prices.gmt > 0 ? `$${prices.gmt.toFixed(4)}` : "—"}
                  testid="gomining-gmt-baseline"
                />
                <BalanceTile
                  iconUrl={BTC_ICON}
                  label="BTC balance"
                  amount={formatBtc(config?.baseline_btc)}
                  usd={prices.btc > 0 ? formatUsd(btcUsd) : "—"}
                  price={prices.btc > 0 ? `$${prices.btc.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}
                  testid="gomining-btc-baseline"
                />
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Combined USD value </span>
                <span className="font-mono text-sm font-medium text-yellow-400 ml-1" data-testid="gomining-combined-usd">
                  {prices.gmt > 0 || prices.btc > 0 ? formatUsd(totalUsd) : "—"}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <GoMiningConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        config={config}
        onSaved={(next) => {
          setConfig(next);
          setConfigOpen(false);
        }}
      />

      <GoMiningUpdateDialog
        open={updateOpen}
        onOpenChange={setUpdateOpen}
        config={config}
        prices={prices}
        onDone={() => {
          setConfig(storage.getGoMiningTokenConfig());
          setUpdateOpen(false);
        }}
      />
    </>
  );
}

function BalanceTile({ iconUrl, label, amount, usd, price, testid }) {
  return (
    <div className="rounded-md border border-border/30 bg-secondary/20 p-3">
      <div className="flex items-center gap-2 mb-1">
        <img src={iconUrl} alt="" className="w-4 h-4" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className="font-mono text-sm font-medium text-foreground" data-testid={testid}>
        {amount}
      </p>
      <div className="flex items-center justify-between mt-1">
        <p className="font-mono text-[11px] text-yellow-400">{usd}</p>
        <p className="font-mono text-[10px] text-muted-foreground">@ {price}</p>
      </div>
    </div>
  );
}

// ───────────────────────────── Config dialog ─────────────────────────────
function GoMiningConfigDialog({ open, onOpenChange, config, onSaved }) {
  const [projectName, setProjectName] = useState(config?.project_name || "GoMining");
  const [gmtBaseline, setGmtBaseline] = useState(String(config?.baseline_gmt ?? "0"));
  const [btcBaseline, setBtcBaseline] = useState(String(config?.baseline_btc ?? "0"));
  const [enabled, setEnabled] = useState(config?.enabled ?? true);

  useEffect(() => {
    if (open) {
      setProjectName(config?.project_name || "GoMining");
      setGmtBaseline(String(config?.baseline_gmt ?? "0"));
      setBtcBaseline(String(config?.baseline_btc ?? "0"));
      setEnabled(config?.enabled ?? true);
    }
  }, [open, config]);

  const handleSave = () => {
    const gmt = Number(gmtBaseline);
    const btc = Number(btcBaseline);
    if (!Number.isFinite(gmt) || gmt < 0 || !Number.isFinite(btc) || btc < 0) {
      toast.error("Baselines must be non-negative numbers");
      return;
    }
    const next = {
      baseline_gmt: Number(gmt.toFixed(6)),
      baseline_btc: Number(btc.toFixed(8)),
      project_name: (projectName || "GoMining").trim() || "GoMining",
      enabled,
      last_updated_at: config?.last_updated_at || new Date().toISOString(),
    };
    storage.setGoMiningTokenConfig(next);
    toast.success("GoMining configuration saved");
    onSaved(next);
  };

  const handleDisable = () => {
    const next = { ...(config || {}), enabled: false };
    storage.setGoMiningTokenConfig(next);
    toast.success("GoMining tracking disabled");
    onSaved(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-lg" data-testid="gomining-config-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pickaxe className="w-4 h-4 text-yellow-400" strokeWidth={1.5} />
            Configure GoMining Tracking
          </DialogTitle>
          <DialogDescription>
            Track your GoMining account's GMT and BTC balances. Boost spends
            (when GMT decreases because you upgraded a miner) are recorded
            as additional invested capital on the GoMining project — not as
            withdrawals — so your ROI math stays accurate.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                <img src={GMT_ICON} alt="" className="w-3.5 h-3.5" />
                Current GMT Balance
              </Label>
              <Input
                type="number"
                step="0.0001"
                min="0"
                value={gmtBaseline}
                onChange={(e) => setGmtBaseline(e.target.value)}
                placeholder="0"
                className="bg-background border-border font-mono text-sm"
                data-testid="gomining-gmt-baseline-input"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                <img src={BTC_ICON} alt="" className="w-3.5 h-3.5" />
                Current BTC Balance
              </Label>
              <Input
                type="number"
                step="0.00000001"
                min="0"
                value={btcBaseline}
                onChange={(e) => setBtcBaseline(e.target.value)}
                placeholder="0"
                className="bg-background border-border font-mono text-sm"
                data-testid="gomining-btc-baseline-input"
              />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            The amounts currently shown in your GoMining dashboard. Increases
            from here are treated as earnings; GMT decreases as boost spend
            (investment); BTC decreases as withdrawals.
          </p>

          <div className="space-y-2">
            <Label className="text-xs">Investment Project Name</Label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="GoMining"
              className="bg-background border-border text-sm"
              data-testid="gomining-project-name-input"
            />
            <p className="text-[10px] text-muted-foreground">
              Earnings + boost spend will be posted to this project (created if it doesn't exist).
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="accent-yellow-500"
              data-testid="gomining-enabled-checkbox"
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
              data-testid="gomining-disable-btn"
            >
              Disable
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border/40">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="bg-yellow-500 text-black hover:bg-yellow-400"
            data-testid="gomining-save-config-btn"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────── Update balance dialog ────────────────────────
function GoMiningUpdateDialog({ open, onOpenChange, config, prices, onDone }) {
  const [newGmt, setNewGmt] = useState("");
  const [newBtc, setNewBtc] = useState("");
  const [gmtAction, setGmtAction] = useState("skip");
  const [btcAction, setBtcAction] = useState("skip");
  const [submitting, setSubmitting] = useState(false);
  const [livePrices, setLivePrices] = useState(prices);
  const [refetching, setRefetching] = useState(false);
  const [manualGmtPrice, setManualGmtPrice] = useState("");
  const [manualBtcPrice, setManualBtcPrice] = useState("");

  // On open, re-fetch prices if either is missing so the user isn't stuck
  // when the card's initial mount-time fetch hit a flaky CoinGecko reply.
  useEffect(() => {
    if (!open) return;
    setLivePrices(prices);
    setManualGmtPrice("");
    setManualBtcPrice("");
    if ((Number(prices?.gmt) || 0) > 0 && (Number(prices?.btc) || 0) > 0) return;
    let cancelled = false;
    setRefetching(true);
    (async () => {
      const fresh = await getGoMiningPrices();
      if (!cancelled) {
        setLivePrices(fresh);
        setRefetching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, prices]);

  const baselineGmt = Number(config?.baseline_gmt) || 0;
  const baselineBtc = Number(config?.baseline_btc) || 0;

  const parsedGmt = Number(newGmt);
  const parsedBtc = Number(newBtc);
  const gmtTouched = newGmt !== "" && Number.isFinite(parsedGmt) && parsedGmt >= 0;
  const btcTouched = newBtc !== "" && Number.isFinite(parsedBtc) && parsedBtc >= 0;
  const deltaGmt = gmtTouched ? parsedGmt - baselineGmt : 0;
  const deltaBtc = btcTouched ? parsedBtc - baselineBtc : 0;

  // Effective prices: live > manual > cached
  const manualGmtNum = Number(manualGmtPrice) || 0;
  const manualBtcNum = Number(manualBtcPrice) || 0;
  const cachedInfo = getGoMiningPriceCacheInfo();
  const effectiveGmtPrice = (Number(livePrices?.gmt) || 0) > 0 ? livePrices.gmt : manualGmtNum > 0 ? manualGmtNum : (cachedInfo?.gmt || 0);
  const effectiveBtcPrice = (Number(livePrices?.btc) || 0) > 0 ? livePrices.btc : manualBtcNum > 0 ? manualBtcNum : (cachedInfo?.btc || 0);
  const gmtPriceSource = (Number(livePrices?.gmt) || 0) > 0 ? "live" : manualGmtNum > 0 ? "manual" : cachedInfo?.gmt ? "cached" : "none";
  const btcPriceSource = (Number(livePrices?.btc) || 0) > 0 ? "live" : manualBtcNum > 0 ? "manual" : cachedInfo?.btc ? "cached" : "none";

  const deltaGmtUsd = deltaGmt * effectiveGmtPrice;
  const deltaBtcUsd = deltaBtc * effectiveBtcPrice;

  // Auto-pick the most likely action as the user types each side.
  useEffect(() => {
    if (!gmtTouched) { setGmtAction("skip"); return; }
    if (Math.abs(deltaGmt) < 0.000001) setGmtAction("no_change");
    else if (deltaGmt > 0) setGmtAction("earning");
    else setGmtAction("boost");      // GMT down → assume boost spend (most common)
  }, [newGmt, gmtTouched, deltaGmt]);

  useEffect(() => {
    if (!btcTouched) { setBtcAction("skip"); return; }
    if (Math.abs(deltaBtc) < 0.00000001) setBtcAction("no_change");
    else if (deltaBtc > 0) setBtcAction("earning");
    else setBtcAction("withdrawal");
  }, [newBtc, btcTouched, deltaBtc]);

  useEffect(() => {
    if (open) {
      setNewGmt("");
      setNewBtc("");
      setGmtAction("skip");
      setBtcAction("skip");
      setSubmitting(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!gmtTouched && !btcTouched) {
      toast.error("Enter at least one new balance");
      return;
    }
    // Check if prices are available for the actions that need them
    if (gmtTouched && (gmtAction === "earning" || gmtAction === "boost") && effectiveGmtPrice <= 0) {
      toast.error("GMT price required — enter a manual price below to proceed");
      return;
    }
    if (btcTouched && btcAction === "earning" && effectiveBtcPrice <= 0) {
      toast.error("BTC price required — enter a manual price below to proceed");
      return;
    }
    setSubmitting(true);
    try {
      const result = await applyGoMiningBalanceUpdate({
        newGmtBalance: gmtTouched ? parsedGmt : 0,
        newBtcBalance: btcTouched ? parsedBtc : 0,
        gmtAction: gmtTouched ? gmtAction : "skip",
        btcAction: btcTouched ? btcAction : "skip",
        gmtPriceOverride: effectiveGmtPrice > 0 ? effectiveGmtPrice : null,
        btcPriceOverride: effectiveBtcPrice > 0 ? effectiveBtcPrice : null,
      });

      // Compose a single toast that summarizes whichever sides moved.
      const lines = [];
      if (result.gmt.action === "earning") {
        lines.push(`+${result.gmt.delta_gmt.toFixed(4)} GMT earned (${formatUsd(result.gmt.delta_usd)})`);
      } else if (result.gmt.action === "boost") {
        lines.push(`Boost: ${result.gmt.delta_gmt.toFixed(4)} GMT spent — ${formatUsd(Math.abs(result.gmt.delta_usd))} added to invested`);
      } else if (result.gmt.action === "withdrawal") {
        lines.push(`GMT withdrawal logged (${result.gmt.delta_gmt.toFixed(4)} GMT). No earnings recorded.`);
      }
      if (result.btc.action === "earning") {
        lines.push(`+${result.btc.delta_btc.toFixed(8)} BTC earned (${formatUsd(result.btc.delta_usd)})`);
      } else if (result.btc.action === "withdrawal") {
        lines.push(`BTC withdrawal logged (${result.btc.delta_btc.toFixed(8)} BTC). No earnings recorded.`);
      }
      if (lines.length > 0) {
        toast.success(lines.join(" · "));
      } else {
        toast.info("No change — update timer reset.");
      }
      onDone();
    } catch (err) {
      toast.error(err?.message || "Failed to update balances");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-2xl" data-testid="gomining-update-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-yellow-400" strokeWidth={1.5} />
            Update GoMining Balances
            {refetching && (
              <span className="text-[10px] font-normal text-muted-foreground font-mono ml-2">
                fetching prices…
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Enter your current GMT + BTC balances from the GoMining dashboard.
            We compute deltas, classify each side independently, and post
            the right transactions to the GoMining project. Leave a side
            blank if it didn't change.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Price indicators + manual overrides */}
          <div className="p-3 rounded-md border border-border/30 bg-secondary/20 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Token Prices</p>
              {refetching && <span className="text-[10px] text-muted-foreground font-mono">fetching…</span>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <img src={GMT_ICON} alt="" className="w-3 h-3" /> GMT
                  </span>
                  {gmtPriceSource === "live" && <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">live</span>}
                  {gmtPriceSource === "cached" && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono">cached</span>}
                  {gmtPriceSource === "manual" && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono">manual</span>}
                  {gmtPriceSource === "none" && <span className="text-[9px] px-1 py-0.5 rounded bg-rose-500/10 text-rose-400 font-mono">n/a</span>}
                </div>
                {effectiveGmtPrice > 0 ? (
                  <p className="font-mono text-xs text-foreground">${effectiveGmtPrice.toFixed(4)}</p>
                ) : (
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={manualGmtPrice}
                    onChange={(e) => setManualGmtPrice(e.target.value)}
                    placeholder="Enter GMT price"
                    className="bg-background border-border font-mono text-[11px] h-7"
                    data-testid="gomining-manual-gmt-price"
                  />
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <img src={BTC_ICON} alt="" className="w-3 h-3" /> BTC
                  </span>
                  {btcPriceSource === "live" && <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">live</span>}
                  {btcPriceSource === "cached" && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono">cached</span>}
                  {btcPriceSource === "manual" && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono">manual</span>}
                  {btcPriceSource === "none" && <span className="text-[9px] px-1 py-0.5 rounded bg-rose-500/10 text-rose-400 font-mono">n/a</span>}
                </div>
                {effectiveBtcPrice > 0 ? (
                  <p className="font-mono text-xs text-foreground">${effectiveBtcPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
                ) : (
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={manualBtcPrice}
                    onChange={(e) => setManualBtcPrice(e.target.value)}
                    placeholder="Enter BTC price"
                    className="bg-background border-border font-mono text-[11px] h-7"
                    data-testid="gomining-manual-btc-price"
                  />
                )}
              </div>
            </div>
            {(gmtPriceSource === "none" || btcPriceSource === "none") && (
              <p className="text-[10px] text-rose-400">CoinGecko rate-limited. Enter prices manually above to proceed.</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BalanceSide
              kind="gmt"
              icon={GMT_ICON}
              label="New GMT Balance"
              baseline={baselineGmt}
              baselineLabel={formatGmt(baselineGmt)}
              value={newGmt}
              onChange={setNewGmt}
              touched={gmtTouched}
              delta={deltaGmt}
              deltaUsd={deltaGmtUsd}
              price={effectiveGmtPrice}
              action={gmtAction}
              setAction={setGmtAction}
              deltaUnit="GMT"
              deltaDigits={4}
              actionOptions={[
                { value: "earning", title: "Earned from mining", desc: "Credit the +GMT delta as an earning transaction.", icon: TrendingUp, requiresPositive: true },
                { value: "boost", title: "Spent on a boost", desc: "Record the −GMT delta as additional invested capital (raises project.invested).", icon: Zap, requiresNegative: true },
                { value: "withdrawal", title: "Withdrew or swapped out", desc: "Lower the baseline without creating earnings.", icon: ArrowDown },
                { value: "no_change", title: "Just resetting the stale timer", desc: "Nothing actually moved — keep baseline.", icon: MinusCircle, requiresZero: true },
              ]}
              testidPrefix="gomining-gmt"
            />
            <BalanceSide
              kind="btc"
              icon={BTC_ICON}
              label="New BTC Balance"
              baseline={baselineBtc}
              baselineLabel={formatBtc(baselineBtc)}
              value={newBtc}
              onChange={setNewBtc}
              touched={btcTouched}
              delta={deltaBtc}
              deltaUsd={deltaBtcUsd}
              price={effectiveBtcPrice}
              action={btcAction}
              setAction={setBtcAction}
              deltaUnit="BTC"
              deltaDigits={8}
              actionOptions={[
                { value: "earning", title: "Earned from mining", desc: "Credit the +BTC delta as an earning transaction.", icon: TrendingUp, requiresPositive: true },
                { value: "withdrawal", title: "Withdrew or cashed out", desc: "Lower the baseline without creating earnings.", icon: ArrowDown },
                { value: "no_change", title: "Just resetting the stale timer", desc: "Nothing actually moved — keep baseline.", icon: MinusCircle, requiresZero: true },
              ]}
              testidPrefix="gomining-btc"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border/40">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting || (!gmtTouched && !btcTouched)}
            className="bg-yellow-500 text-black hover:bg-yellow-400 disabled:opacity-50"
            data-testid="gomining-confirm-btn"
          >
            {submitting ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BalanceSide({
  icon, label, baseline, baselineLabel, value, onChange, touched,
  delta, deltaUsd, price, action, setAction, deltaUnit, deltaDigits,
  actionOptions, testidPrefix,
}) {
  return (
    <div className="space-y-3 rounded-md border border-border/30 p-3">
      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-2">
          <Label className="text-xs flex items-center gap-1.5">
            <img src={icon} alt="" className="w-3.5 h-3.5" />
            {label}
          </Label>
          <Input
            type="number"
            step="0.00000001"
            min="0"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={Number(baseline).toFixed(deltaDigits)}
            className="bg-background border-border font-mono text-sm"
            data-testid={`${testidPrefix}-new-balance-input`}
          />
        </div>
        <div className="text-right pb-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Baseline</p>
          <p className="font-mono text-xs text-foreground">{baselineLabel}</p>
        </div>
      </div>

      {touched && (
        <div
          className={`p-2 rounded-md border ${
            delta > 0
              ? "border-emerald-500/30 bg-emerald-500/5"
              : delta < 0
                ? "border-rose-500/30 bg-rose-500/5"
                : "border-border/30 bg-secondary/30"
          }`}
          data-testid={`${testidPrefix}-delta-preview`}
        >
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Delta</p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <p
              className={`font-mono text-lg font-medium ${
                delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-foreground"
              }`}
            >
              {delta >= 0 ? "+" : ""}{delta.toFixed(deltaDigits)} {deltaUnit}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              ({price > 0 ? `${delta >= 0 ? "+" : ""}${deltaUsd.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 })}` : `${deltaUnit} price unavailable`})
            </p>
          </div>
        </div>
      )}

      {touched && (
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">What happened?</Label>
          <div className="space-y-1.5">
            {actionOptions.map((opt) => {
              const disabled =
                (opt.requiresPositive && delta <= 0) ||
                (opt.requiresNegative && delta >= 0) ||
                (opt.requiresZero && Math.abs(delta) >= Math.pow(10, -deltaDigits));
              const Icon = opt.icon;
              return (
                <label
                  key={opt.value}
                  className={`flex gap-2 items-start p-2 rounded-md border cursor-pointer transition ${
                    action === opt.value
                      ? "border-yellow-500/60 bg-yellow-500/5"
                      : "border-border/30 hover:border-border/60"
                  } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  <input
                    type="radio"
                    name={`${testidPrefix}-action`}
                    value={opt.value}
                    checked={action === opt.value}
                    onChange={(e) => !disabled && setAction(e.target.value)}
                    disabled={disabled}
                    className="mt-0.5 accent-yellow-500"
                    data-testid={`${testidPrefix}-action-${opt.value}`}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-3 h-3" strokeWidth={1.8} />
                      <span className="text-xs font-medium">{opt.title}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{opt.desc}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

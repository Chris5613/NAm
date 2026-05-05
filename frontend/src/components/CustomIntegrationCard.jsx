import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus, Settings, Trash2, TrendingUp, ArrowDown, MinusCircle, Zap,
} from "lucide-react";
import * as customSync from "@/lib/customIntegrationSync";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatUsd(v) {
  return `$${Math.abs(Number(v) || 0).toFixed(2)}`;
}

function formatRelativeTime(iso) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Add Integration Dialog ────────────────────────────────────────────────

export function AddIntegrationDialog({ open, onOpenChange, onCreated }) {
  const [name, setName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [mode, setMode] = useState("usd");
  const [symbol, setSymbol] = useState("");
  const [baseline, setBaseline] = useState("");
  const [coingeckoId, setCoingeckoId] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setProjectName("");
      setMode("usd");
      setSymbol("");
      setBaseline("");
      setCoingeckoId("");
    }
  }, [open]);

  const handleCreate = () => {
    if (!name.trim()) { toast.error("Enter an integration name"); return; }
    if (!projectName.trim()) { toast.error("Enter the target project name"); return; }
    const integration = customSync.create({
      name: name.trim(),
      project_name: projectName.trim(),
      mode,
      symbol: symbol.trim().toUpperCase(),
      baseline: Number(baseline) || 0,
      coingecko_id: coingeckoId.trim(),
    });
    toast.success(`"${integration.name}" integration created`);
    onCreated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Add Custom Integration</DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Create a new integration that syncs earnings to an Investment Overview project.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs">Integration Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Helium, Flux, etc."
              className="bg-background border-border text-sm"
              data-testid="custom-int-name"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Target Project (Investment Overview)</Label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Phone Farm"
              className="bg-background border-border text-sm"
              data-testid="custom-int-project"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Balance Mode</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={mode === "usd" ? "default" : "outline"}
                onClick={() => setMode("usd")}
                className={mode === "usd" ? "bg-white text-black" : "border-border/40"}
              >
                USD ($)
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "token" ? "default" : "outline"}
                onClick={() => setMode("token")}
                className={mode === "token" ? "bg-white text-black" : "border-border/40"}
              >
                Token
              </Button>
            </div>
          </div>
          {mode === "token" && (
            <>
              <div className="space-y-2">
                <Label className="text-xs">Token Symbol</Label>
                <Input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="e.g. HNT, FLX"
                  className="bg-background border-border text-sm"
                  data-testid="custom-int-symbol"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">CoinGecko ID (optional, for auto-pricing)</Label>
                <Input
                  value={coingeckoId}
                  onChange={(e) => setCoingeckoId(e.target.value)}
                  placeholder="e.g. helium, flux"
                  className="bg-background border-border text-sm"
                  data-testid="custom-int-coingecko"
                />
                <p className="text-[10px] text-muted-foreground">
                  Find the ID on coingecko.com/en/coins/[id]. Leave blank to always enter price manually.
                </p>
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label className="text-xs">
              Current Balance ({mode === "usd" ? "USD" : symbol || "tokens"})
            </Label>
            <Input
              type="number"
              step="any"
              min="0"
              value={baseline}
              onChange={(e) => setBaseline(e.target.value)}
              placeholder="0"
              className="bg-background border-border font-mono text-sm"
              data-testid="custom-int-baseline"
            />
          </div>
          <Button onClick={handleCreate} className="w-full bg-white text-black hover:bg-neutral-200" data-testid="custom-int-create-btn">
            <Plus className="w-4 h-4 mr-2" /> Create Integration
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Custom Integration Card ───────────────────────────────────────────────

export function CustomIntegrationCard({ integration, onUpdated }) {
  const [updateOpen, setUpdateOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  return (
    <div className="border border-border/40 rounded-lg p-4 bg-card" data-testid={`custom-int-card-${integration.id}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-violet-500/10 flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-violet-400" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">{integration.name}</h3>
            <p className="text-[11px] text-muted-foreground">
              {integration.mode === "usd" ? "USD" : integration.symbol} → {integration.project_name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">
            configured
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Balance</p>
          <p className="font-mono text-foreground">
            {integration.mode === "usd"
              ? `$${(Number(integration.baseline) || 0).toFixed(2)}`
              : `${(Number(integration.baseline) || 0).toFixed(4)} ${integration.symbol}`}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Last Update</p>
          <p className="font-mono text-foreground">{formatRelativeTime(integration.last_updated_at)}</p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          onClick={() => setUpdateOpen(true)}
          className="flex-1 bg-white text-black hover:bg-neutral-200 text-xs"
          data-testid={`custom-int-update-${integration.id}`}
        >
          <TrendingUp className="w-3 h-3 mr-1" /> Update Balance
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setConfigOpen(true)}
          className="border-border/40 text-xs"
        >
          <Settings className="w-3 h-3" />
        </Button>
      </div>

      <CustomUpdateDialog
        open={updateOpen}
        onOpenChange={setUpdateOpen}
        integration={integration}
        onDone={onUpdated}
      />
      <CustomConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        integration={integration}
        onDone={onUpdated}
      />
    </div>
  );
}

// ─── Update Balance Dialog ─────────────────────────────────────────────────

function CustomUpdateDialog({ open, onOpenChange, integration, onDone }) {
  const [newBalance, setNewBalance] = useState("");
  const [action, setAction] = useState("earning");
  const [submitting, setSubmitting] = useState(false);
  const [manualPrice, setManualPrice] = useState("");
  const [livePrice, setLivePrice] = useState(0);
  const [label, setLabel] = useState("");

  const baseline = Number(integration.baseline) || 0;
  const parsed = Number(newBalance);
  const hasInput = newBalance !== "" && Number.isFinite(parsed) && parsed >= 0;
  const delta = hasInput ? parsed - baseline : 0;

  const manualPriceNum = Number(manualPrice) || 0;
  const effectivePrice = integration.mode === "usd" ? 1 : (livePrice > 0 ? livePrice : manualPriceNum);
  const deltaUsd = delta * effectivePrice;

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
      // Fetch live price for token mode
      if (integration.mode === "token" && integration.coingecko_id) {
        customSync.getTokenPrice(integration.coingecko_id).then((p) => setLivePrice(p));
      }
    }
  }, [open, integration]);

  const handleConfirm = async () => {
    if (!hasInput) { toast.error("Enter a balance"); return; }
    if (action === "earning" && integration.mode === "token" && effectivePrice <= 0) {
      toast.error("Enter a manual price to proceed");
      return;
    }
    setSubmitting(true);
    try {
      const result = await customSync.applyBalanceUpdate({
        integrationId: integration.id,
        newBalance: parsed,
        action,
        priceOverride: effectivePrice > 0 ? effectivePrice : null,
        label: label.trim() || null,
      });
      if (result.action === "earning") {
        toast.success(`+${formatUsd(result.delta_usd)} earned — synced to ${integration.project_name}`);
      } else if (result.action === "withdrawal") {
        toast.info("Withdrawal logged. Baseline updated.");
      } else {
        toast.info("No change.");
      }
      onDone();
      onOpenChange(false);
    } catch (err) {
      toast.error(err?.message || "Failed to update");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Update {integration.name}</DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Enter your new balance. The delta will sync to {integration.project_name}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label className="text-xs">
                New Balance ({integration.mode === "usd" ? "USD" : integration.symbol})
              </Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                placeholder={baseline.toFixed(integration.mode === "usd" ? 2 : 4)}
                autoFocus
                className="bg-background border-border font-mono text-sm"
                data-testid="custom-int-new-balance"
              />
            </div>
            <div className="text-right pb-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Baseline</p>
              <p className="font-mono text-sm text-foreground">
                {integration.mode === "usd" ? `$${baseline.toFixed(2)}` : `${baseline.toFixed(4)} ${integration.symbol}`}
              </p>
            </div>
          </div>

          {/* Price section for token mode */}
          {integration.mode === "token" && (
            <div className="p-3 rounded-md border border-border/30 bg-secondary/20 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{integration.symbol} Price</p>
                {livePrice > 0 ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">live</span>
                ) : manualPriceNum > 0 ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono">manual</span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 font-mono">unavailable</span>
                )}
              </div>
              {livePrice > 0 ? (
                <p className="font-mono text-sm text-foreground">${livePrice.toFixed(4)}</p>
              ) : (
                <div className="space-y-1">
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                    placeholder="Enter price in USD"
                    className="bg-background border-border font-mono text-xs h-8"
                    data-testid="custom-int-manual-price"
                  />
                </div>
              )}
            </div>
          )}

          {/* Delta preview */}
          {hasInput && (
            <div className={`p-3 rounded-md border ${
              delta > 0 ? "border-emerald-500/30 bg-emerald-500/5"
                : delta < 0 ? "border-rose-500/30 bg-rose-500/5"
                  : "border-border/30 bg-secondary/30"
            }`}>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Delta</p>
              <div className="flex items-baseline gap-2 mt-1">
                <p className={`font-mono text-xl font-medium ${
                  delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-foreground"
                }`}>
                  {delta >= 0 ? "+" : ""}{integration.mode === "usd" ? `$${delta.toFixed(2)}` : `${delta.toFixed(4)} ${integration.symbol}`}
                </p>
                {integration.mode === "token" && effectivePrice > 0 && (
                  <p className="font-mono text-sm text-muted-foreground">
                    ({delta >= 0 ? "+" : ""}{formatUsd(deltaUsd)})
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Label / Sub-category for Investment Overview */}
          {hasInput && delta > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Label (sub-category in Investment Overview)</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={`e.g. Mining, Bonus, Referral (default: "${integration.name}")`}
                className="bg-background border-border text-sm"
                data-testid="custom-int-label"
              />
              <p className="text-[10px] text-muted-foreground">
                This becomes the sub-category name. Leave blank to use "{integration.name}".
              </p>
            </div>
          )}

          {/* Action selector */}
          {hasInput && (
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Action</Label>
              <div className="space-y-1">
                {delta > 0 && (
                  <ActionOption
                    selected={action === "earning"}
                    onClick={() => setAction("earning")}
                    icon={TrendingUp}
                    title="Earned"
                    desc={`Credit as earning to ${integration.project_name}`}
                  />
                )}
                {delta < 0 && (
                  <ActionOption
                    selected={action === "withdrawal"}
                    onClick={() => setAction("withdrawal")}
                    icon={ArrowDown}
                    title="Withdrawal"
                    desc="Lower baseline without recording earnings"
                  />
                )}
                <ActionOption
                  selected={action === "no_change"}
                  onClick={() => setAction("no_change")}
                  icon={MinusCircle}
                  title="No change"
                  desc="Just resetting timer"
                />
              </div>
            </div>
          )}

          <Button
            onClick={handleConfirm}
            disabled={!hasInput || submitting}
            className="w-full bg-white text-black hover:bg-neutral-200"
            data-testid="custom-int-confirm"
          >
            {submitting ? "Syncing…" : "Confirm"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Config/Edit Dialog ────────────────────────────────────────────────────

function CustomConfigDialog({ open, onOpenChange, integration, onDone }) {
  const [name, setName] = useState(integration.name);
  const [projectName, setProjectName] = useState(integration.project_name);
  const [mode, setMode] = useState(integration.mode);
  const [symbol, setSymbol] = useState(integration.symbol);
  const [coingeckoId, setCoingeckoId] = useState(integration.coingecko_id);
  const [baseline, setBaseline] = useState(String(integration.baseline));
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setName(integration.name);
      setProjectName(integration.project_name);
      setMode(integration.mode);
      setSymbol(integration.symbol);
      setCoingeckoId(integration.coingecko_id);
      setBaseline(String(integration.baseline));
      setConfirmDelete(false);
    }
  }, [open, integration]);

  const handleSave = () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    if (!projectName.trim()) { toast.error("Project name required"); return; }
    customSync.update(integration.id, {
      name: name.trim(),
      project_name: projectName.trim(),
      mode,
      symbol: symbol.trim().toUpperCase(),
      coingecko_id: coingeckoId.trim(),
      baseline: Number(baseline) || 0,
    });
    toast.success("Integration updated");
    onDone();
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    customSync.remove(integration.id);
    toast.success(`"${integration.name}" removed`);
    onDone();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Edit {integration.name}</DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Update settings or remove this integration.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-background border-border text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Target Project</Label>
            <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} className="bg-background border-border text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Mode</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={mode === "usd" ? "default" : "outline"} onClick={() => setMode("usd")} className={mode === "usd" ? "bg-white text-black" : "border-border/40"}>USD ($)</Button>
              <Button type="button" size="sm" variant={mode === "token" ? "default" : "outline"} onClick={() => setMode("token")} className={mode === "token" ? "bg-white text-black" : "border-border/40"}>Token</Button>
            </div>
          </div>
          {mode === "token" && (
            <>
              <div className="space-y-2">
                <Label className="text-xs">Token Symbol</Label>
                <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} className="bg-background border-border text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">CoinGecko ID</Label>
                <Input value={coingeckoId} onChange={(e) => setCoingeckoId(e.target.value)} placeholder="optional" className="bg-background border-border text-sm" />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label className="text-xs">Baseline ({mode === "usd" ? "USD" : symbol || "tokens"})</Label>
            <Input type="number" step="any" value={baseline} onChange={(e) => setBaseline(e.target.value)} className="bg-background border-border font-mono text-sm" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} className="flex-1 bg-white text-black hover:bg-neutral-200">Save</Button>
            <Button onClick={handleDelete} variant="outline" className={`border-border/40 ${confirmDelete ? "bg-rose-500/10 text-rose-400 border-rose-500/30" : ""}`}>
              <Trash2 className="w-4 h-4 mr-1" /> {confirmDelete ? "Confirm Delete" : "Delete"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Action Option Button ──────────────────────────────────────────────────

function ActionOption({ selected, onClick, icon: Icon, title, desc }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-md border transition-colors ${
        selected
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-border/30 bg-secondary/20 hover:bg-secondary/40"
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${selected ? "text-emerald-400" : "text-muted-foreground"}`} strokeWidth={1.5} />
        <div>
          <p className={`text-xs font-medium ${selected ? "text-foreground" : "text-muted-foreground"}`}>{title}</p>
          <p className="text-[10px] text-muted-foreground">{desc}</p>
        </div>
      </div>
    </button>
  );
}

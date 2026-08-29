import { useState, useEffect } from "react";
import { projectsApi } from "@/lib/api";
import { coinGeckoApi } from "@/lib/external-apis";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

function formatPreviewCurrency(val) {
  const n = parseFloat(val) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

export default function EditProjectDialog({
  project,
  open,
  onOpenChange,
  onUpdated,
}) {
  const [form, setForm] = useState({
    name: project.name || "",
    icon_url: project.icon_url || "",
    custom_tag: project.custom_tag || project.tag_label || project.category_label || "",
    invested: project.invested?.toString() || "",
    earned: project.earned?.toString() || "",
    per_day: project.per_day?.toString() || "",
    apy: project.apy?.toString() || "",
    daily_trx: project.daily_trx?.toString() || "",
    yield_tracking: project.yield_tracking || "standard",
    inf_amount: project.inf_amount?.toString() || "",
    jupiter_wallet_address: project.jupiter_wallet_address || "",
    jupiter_position_id: project.jupiter_position_id?.toString() || "",
    lulo_wallet_address: project.lulo_wallet_address || "",
    inactive: project.inactive === true || project.is_inactive === true,
  });

  const [trxPrice, setTrxPrice] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    coinGeckoApi.getPrice("tron").then((price) => {
      if (price > 0) setTrxPrice(price);
    }).catch(() => {});
  }, []);

  const investedNum = parseFloat(form.invested) || 0;
  const apyNum = parseFloat(form.apy) || 0;
  const dailyTrxNum = parseFloat(form.daily_trx) || 0;
  const isInfTracking = form.yield_tracking === "sanctum_inf";
  const isJupiterLoop = form.yield_tracking === "jupiter_inf_loop";
  const isLuloLending = form.yield_tracking === "lulo_lending";
  const isAutomaticYield = isInfTracking || isJupiterLoop || isLuloLending;

  const calculatedPerDayFromTrx = dailyTrxNum > 0 && trxPrice ? dailyTrxNum * trxPrice : 0;
  const calculatedPerDayFromApy = investedNum > 0 && apyNum > 0 ? (investedNum * (apyNum / 100)) / 365 : 0;

  const perDayNum = isAutomaticYield
    ? 0
    : parseFloat(form.per_day) || calculatedPerDayFromTrx || calculatedPerDayFromApy;
  const perWeek = perDayNum * 7;
  const perMonth = perDayNum * 30;
  const perYear = perDayNum * 365;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) {
      toast.error("Project name is required");
      return;
    }
    if (isInfTracking && !(parseFloat(form.inf_amount) > 0)) {
      toast.error("INF quantity must be greater than 0");
      return;
    }
    if (isJupiterLoop && (!form.jupiter_wallet_address.trim() || !form.jupiter_position_id.trim())) {
      toast.error("Jupiter wallet address and position ID are required");
      return;
    }
    if (isJupiterLoop && !(parseFloat(form.invested) > 0)) {
      toast.error("Starting equity must be greater than 0");
      return;
    }
    if (isLuloLending && !form.lulo_wallet_address.trim()) {
      toast.error("Lulo wallet address is required");
      return;
    }
    setSubmitting(true);

    try {
      await projectsApi.update(project.id, {
        name: form.name,
        icon_url: form.icon_url || null,
        custom_tag: (form.custom_tag || "").trim() || null,
        invested: parseFloat(form.invested) || 0,
        earned: parseFloat(form.earned) || 0,
        apy: isAutomaticYield ? null : parseFloat(form.apy) || null,
        daily_trx: isAutomaticYield ? null : parseFloat(form.daily_trx) || null,
        yield_tracking: isInfTracking ? "sanctum_inf" : isJupiterLoop ? "jupiter_inf_loop" : isLuloLending ? "lulo_lending" : null,
        inf_amount: isInfTracking ? parseFloat(form.inf_amount) : null,
        jupiter_wallet_address: isJupiterLoop ? form.jupiter_wallet_address.trim() : null,
        jupiter_position_id: isJupiterLoop ? form.jupiter_position_id.trim() : null,
        jupiter_initial_earned: isJupiterLoop
          ? project.yield_tracking === "jupiter_inf_loop"
            ? Number(project.jupiter_initial_earned) || 0
            : parseFloat(form.earned) || 0
          : null,
        lulo_wallet_address: isLuloLending ? form.lulo_wallet_address.trim() : null,
        lulo_initial_earned: isLuloLending
          ? project.yield_tracking === "lulo_lending"
            ? project.lulo_initial_earned
            : null
          : undefined,
        per_day: perDayNum,
        per_week: perWeek,
        per_month: perMonth,
        per_year: perYear,
        inactive: !!form.inactive,
      });

      toast.success(`${form.name} updated`);
      onUpdated();
    } catch {
      toast.error("Failed to update project");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-card border-border sm:max-w-md max-h-[90vh] overflow-y-auto"
        data-testid="edit-project-dialog"
      >
        <DialogHeader>
          <DialogTitle>Edit Earner</DialogTitle>
          <DialogDescription>
            Update earner details and daily returns
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-end gap-3">
            {form.icon_url && (
              <img
                src={form.icon_url}
                alt=""
                className="w-10 h-10 rounded-md object-contain border border-border/40"
              />
            )}

            <div className="flex-1 space-y-2">
              <Label>Name</Label>

              <Input
                value={form.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value,
                  })
                }
                data-testid="edit-project-input-name"
                className="bg-background border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Logo URL (optional)</Label>

            <Input
              placeholder="https://example.com/logo.png"
              value={form.icon_url}
              onChange={(e) =>
                setForm({
                  ...form,
                  icon_url: e.target.value,
                })
              }
              data-testid="edit-project-input-icon"
              className="bg-background border-border text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label>Tag / Label Override (optional)</Label>

            <Input
              placeholder="e.g. TRX Rewards, Dividend Growth, BTC Staking"
              value={form.custom_tag}
              onChange={(e) =>
                setForm({
                  ...form,
                  custom_tag: e.target.value,
                })
              }
              data-testid="edit-project-input-custom-tag"
              className="bg-background border-border text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label>Yield Tracking</Label>
            <Select
              value={form.yield_tracking}
              onValueChange={(value) => setForm({ ...form, yield_tracking: value })}
            >
              <SelectTrigger className="bg-background border-border" data-testid="edit-project-yield-tracking">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="standard">Standard / APY</SelectItem>
                <SelectItem value="sanctum_inf">Sanctum INF Liquid Staking</SelectItem>
                <SelectItem value="jupiter_inf_loop">Jupiter INF Loop</SelectItem>
                <SelectItem value="lulo_lending">Lulo Lending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isInfTracking && (
            <div className="space-y-2">
              <Label>INF Quantity</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={form.inf_amount}
                onChange={(e) => setForm({ ...form, inf_amount: e.target.value })}
                data-testid="edit-project-input-inf-amount"
                className="bg-background border-border font-mono"
              />
            </div>
          )}

          {isJupiterLoop && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Jupiter Wallet Address</Label>
                <Input
                  value={form.jupiter_wallet_address}
                  onChange={(e) => setForm({ ...form, jupiter_wallet_address: e.target.value })}
                  data-testid="edit-project-input-jupiter-wallet"
                  className="bg-background border-border font-mono text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label>Jupiter Position ID</Label>
                <Input
                  inputMode="numeric"
                  value={form.jupiter_position_id}
                  onChange={(e) => setForm({ ...form, jupiter_position_id: e.target.value })}
                  data-testid="edit-project-input-jupiter-position"
                  className="bg-background border-border font-mono"
                />
              </div>
            </div>
          )}

          {isLuloLending && (
            <div className="space-y-2">
              <Label>Lulo Wallet Address</Label>
              <Input
                value={form.lulo_wallet_address}
                onChange={(e) => setForm({ ...form, lulo_wallet_address: e.target.value })}
                data-testid="edit-project-input-lulo-wallet"
                className="bg-background border-border font-mono text-xs"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Total Invested ($)</Label>

              <Input
                type="number"
                step="any"
                value={form.invested}
                onChange={(e) =>
                  setForm({
                    ...form,
                    invested: e.target.value,
                  })
                }
                data-testid="edit-project-input-invested"
                className="bg-background border-border font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label>Total Earned ($)</Label>

              <Input
                type="number"
                step="any"
                value={form.earned}
                onChange={(e) =>
                  setForm({
                    ...form,
                    earned: e.target.value,
                  })
                }
                data-testid="edit-project-input-earned"
                className="bg-background border-border font-mono"
              />
            </div>
          </div>

          {!isAutomaticYield && <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Daily TRX Reward (optional)</Label>
              <Input
                type="number"
                step="any"
                placeholder="e.g. 50"
                value={form.daily_trx}
                onChange={(e) => setForm({ ...form, daily_trx: e.target.value })}
                data-testid="edit-project-input-dailytrx"
                className="bg-background border-border font-mono"
              />
              {trxPrice && dailyTrxNum > 0 && (
                <p className="text-[10px] text-emerald-400 font-mono">
                  ≈ {formatPreviewCurrency(dailyTrxNum * trxPrice)}/day (@ ${trxPrice.toFixed(4)}/TRX)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>APY %</Label>
              <Input
                type="number"
                step="any"
                placeholder="e.g. 5.5"
                value={form.apy}
                onChange={(e) =>
                  setForm({
                    ...form,
                    apy: e.target.value,
                  })
                }
                data-testid="edit-project-input-apy"
                className="bg-background border-border font-mono"
              />
            </div>
          </div>}

          {!isAutomaticYield && <div className="space-y-2">
            <Label>Per Day ($) {calculatedPerDayFromTrx > 0 && !form.per_day ? "(auto from TRX)" : calculatedPerDayFromApy > 0 && !form.per_day ? "(auto from APY)" : ""}</Label>
            <Input
              type="number"
              step="any"
              placeholder={calculatedPerDayFromTrx > 0 ? calculatedPerDayFromTrx.toFixed(2) : calculatedPerDayFromApy > 0 ? calculatedPerDayFromApy.toFixed(2) : "0.00"}
              value={form.per_day}
              onChange={(e) =>
                setForm({
                  ...form,
                  per_day: e.target.value,
                })
              }
              className="bg-background border-border font-mono"
            />
          </div>}

          {perDayNum > 0 && (
            <div className="rounded-lg border border-border/40 bg-secondary/30 p-3 space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                Auto-calculated Projections
              </p>
              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div className="rounded bg-background/50 p-2">
                  <span className="block text-[10px] text-muted-foreground uppercase">Per Week</span>
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {formatPreviewCurrency(perWeek)}
                  </span>
                </div>
                <div className="rounded bg-background/50 p-2">
                  <span className="block text-[10px] text-muted-foreground uppercase">Per Month</span>
                  <span className="font-mono text-xs font-semibold text-emerald-400">
                    {formatPreviewCurrency(perMonth)}
                  </span>
                </div>
                <div className="rounded bg-background/50 p-2">
                  <span className="block text-[10px] text-muted-foreground uppercase">Per Year</span>
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {formatPreviewCurrency(perYear)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-md border border-border/40 bg-secondary/20 p-3">
            <input
              id="inactive-project"
              type="checkbox"
              checked={!!form.inactive}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  inactive: e.target.checked,
                }))
              }
              className="h-4 w-4"
            />

            <Label htmlFor="inactive-project" className="text-sm">
              Inactive
            </Label>
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-white text-black hover:bg-neutral-200"
            data-testid="submit-edit-project"
          >
            {submitting ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
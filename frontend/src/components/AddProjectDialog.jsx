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

function formatPreviewCurrency(val) {
  const n = parseFloat(val) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

export default function AddProjectDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    icon_url: "",
    invested: "",
    earned: "",
    per_day: "",
    apy: "",
    daily_trx: "",
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

  // Auto-calculate per day from TRX if provided, else APY, else manual per_day
  const calculatedPerDayFromTrx = dailyTrxNum > 0 && trxPrice ? dailyTrxNum * trxPrice : 0;
  const calculatedPerDayFromApy = investedNum > 0 && apyNum > 0 ? (investedNum * (apyNum / 100)) / 365 : 0;
  
  const perDayNum = parseFloat(form.per_day) || calculatedPerDayFromTrx || calculatedPerDayFromApy;
  const perWeek = perDayNum * 7;
  const perMonth = perDayNum * 30;
  const perYear = perDayNum * 365;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) {
      toast.error("Project name is required");
      return;
    }
    setSubmitting(true);
    try {
      await projectsApi.create({
        name: form.name,
        icon_url: form.icon_url || null,
        invested: parseFloat(form.invested) || 0,
        earned: parseFloat(form.earned) || 0,
        apy: parseFloat(form.apy) || null,
        daily_trx: parseFloat(form.daily_trx) || null,
        per_day: perDayNum,
        per_week: perWeek,
        per_month: perMonth,
        per_year: perYear,
      });
      toast.success(`${form.name} added`);
      setForm({ name: "", icon_url: "", invested: "", earned: "", per_day: "", apy: "", daily_trx: "" });
      onCreated();
    } catch {
      toast.error("Failed to add project");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-card border-border sm:max-w-md max-h-[90vh] overflow-y-auto"
        data-testid="add-project-dialog"
      >
        <DialogHeader>
          <DialogTitle>Add Earner</DialogTitle>
          <DialogDescription>Track a project or investment you're earning from</DialogDescription>
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
              <Label>Project Name</Label>
              <Input
                placeholder="e.g. ETH Staking, S&P 500, GoMining"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="project-input-name"
                className="bg-background border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Logo URL (optional)</Label>
            <Input
              placeholder="https://example.com/logo.png"
              value={form.icon_url}
              onChange={(e) => setForm({ ...form, icon_url: e.target.value })}
              data-testid="project-input-icon"
              className="bg-background border-border text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Total Invested ($)</Label>
              <Input
                type="number"
                step="any"
                placeholder="0.00"
                value={form.invested}
                onChange={(e) => setForm({ ...form, invested: e.target.value })}
                data-testid="project-input-invested"
                className="bg-background border-border font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Total Earned ($)</Label>
              <Input
                type="number"
                step="any"
                placeholder="0.00"
                value={form.earned}
                onChange={(e) => setForm({ ...form, earned: e.target.value })}
                data-testid="project-input-earned"
                className="bg-background border-border font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Daily TRX Reward (optional)</Label>
              <Input
                type="number"
                step="any"
                placeholder="e.g. 50"
                value={form.daily_trx}
                onChange={(e) => setForm({ ...form, daily_trx: e.target.value })}
                data-testid="project-input-dailytrx"
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
                onChange={(e) => setForm({ ...form, apy: e.target.value })}
                data-testid="project-input-apy"
                className="bg-background border-border font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Per Day ($) {calculatedPerDayFromTrx > 0 && !form.per_day ? "(auto from TRX)" : calculatedPerDayFromApy > 0 && !form.per_day ? "(auto from APY)" : ""}</Label>
            <Input
              type="number"
              step="any"
              placeholder={calculatedPerDayFromTrx > 0 ? calculatedPerDayFromTrx.toFixed(2) : calculatedPerDayFromApy > 0 ? calculatedPerDayFromApy.toFixed(2) : "0.00"}
              value={form.per_day}
              onChange={(e) => setForm({ ...form, per_day: e.target.value })}
              data-testid="project-input-perday"
              className="bg-background border-border font-mono"
            />
          </div>

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

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-white text-black hover:bg-neutral-200"
            data-testid="submit-add-project"
          >
            {submitting ? "Adding..." : "Add Project"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

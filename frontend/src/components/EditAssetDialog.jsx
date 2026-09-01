import { useState } from "react";
import { assetsApi } from "@/lib/api";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORIES = [
  { value: "stocks", label: "Stocks" },
  { value: "crypto", label: "Crypto" },
  { value: "cash", label: "Cash / Bank" },
  { value: "debts", label: "Debts / Liabilities" },
  { value: "other", label: "Other Assets" },
];

export default function EditAssetDialog({ asset, open, onOpenChange, onUpdated }) {
  const [form, setForm] = useState({
    name: asset.name || "",
    category: asset.category || "stocks",
    symbol: asset.symbol || "",
    quantity: asset.quantity?.toString() || "",
    current_price: asset.current_price?.toString() || "",
    manual_value: asset.manual_value?.toString() || "",
    cost_basis: asset.cost_basis?.toString() || "",
    notes: asset.notes || "",
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        name: form.name,
        category: form.category,
        symbol: form.symbol || null,
        quantity: parseFloat(form.quantity) || 0,
        current_price: parseFloat(form.current_price) || 0,
        manual_value: form.manual_value ? parseFloat(form.manual_value) : null,
        cost_basis: parseFloat(form.cost_basis) || 0,
        notes: form.notes || null,
      };
      await assetsApi.update(asset.id, payload);
      toast.success(`${form.name} updated`);
      onUpdated();
    } catch (err) {
      toast.error("Failed to update asset");
    } finally {
      setSubmitting(false);
    }
  };

  const showQuantityFields = ["stocks", "crypto"].includes(form.category);
  const showManualValue = ["cash", "crypto_projects", "debts", "other"].includes(form.category);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-md" data-testid="edit-asset-dialog">
        <DialogHeader>
          <DialogTitle>Edit Asset</DialogTitle>
          <DialogDescription>Update asset details</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              data-testid="edit-input-name"
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-category">Category</Label>
            <Select
              value={form.category}
              onValueChange={(val) => setForm({ ...form, category: val })}
            >
              <SelectTrigger data-testid="edit-select-category" className="bg-background border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(showQuantityFields || form.category === "crypto_projects") && (
            <div className="space-y-2">
              <Label htmlFor="edit-symbol">Symbol</Label>
              <Input
                id="edit-symbol"
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                data-testid="edit-input-symbol"
                className="bg-background border-border"
              />
            </div>
          )}

          {showQuantityFields && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-quantity">Quantity</Label>
                <Input
                  id="edit-quantity"
                  type="number"
                  step="any"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  data-testid="edit-input-quantity"
                  className="bg-background border-border font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-price">Current Price ($)</Label>
                <Input
                  id="edit-price"
                  type="number"
                  step="any"
                  value={form.current_price}
                  onChange={(e) => setForm({ ...form, current_price: e.target.value })}
                  data-testid="edit-input-price"
                  className="bg-background border-border font-mono"
                />
              </div>
            </div>
          )}

          {showManualValue && (
            <div className="space-y-2">
              <Label htmlFor="edit-manual-value">
                {form.category === "debts" ? "Amount Owed ($)" : "Total Value ($)"}
              </Label>
              <Input
                id="edit-manual-value"
                type="number"
                step="any"
                value={form.manual_value}
                onChange={(e) => setForm({ ...form, manual_value: e.target.value })}
                data-testid="edit-input-manual-value"
                className="bg-background border-border font-mono"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-cost-basis">Cost Basis ($)</Label>
            <Input
              id="edit-cost-basis"
              type="number"
              step="any"
              value={form.cost_basis}
              onChange={(e) => setForm({ ...form, cost_basis: e.target.value })}
              data-testid="edit-input-cost-basis"
              className="bg-background border-border font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Input
              id="edit-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              data-testid="edit-input-notes"
              className="bg-background border-border"
            />
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-white text-black hover:bg-neutral-200"
            data-testid="submit-edit-asset"
          >
            {submitting ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

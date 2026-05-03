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
  { value: "crypto_projects", label: "Crypto Projects" },
  { value: "debts", label: "Debts / Liabilities" },
];

export default function AddAssetDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    category: "stocks",
    symbol: "",
    quantity: "",
    current_price: "",
    manual_value: "",
    cost_basis: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.category) {
      toast.error("Name and category are required");
      return;
    }

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
      await assetsApi.create(payload);
      toast.success(`${form.name} added`);
      setForm({
        name: "",
        category: "stocks",
        symbol: "",
        quantity: "",
        current_price: "",
        manual_value: "",
        cost_basis: "",
        notes: "",
      });
      onCreated();
    } catch (err) {
      toast.error("Failed to add asset");
    } finally {
      setSubmitting(false);
    }
  };

  const showQuantityFields = ["stocks", "crypto"].includes(form.category);
  const showManualValue = ["cash", "crypto_projects", "debts"].includes(form.category);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-md" data-testid="add-asset-dialog">
        <DialogHeader>
          <DialogTitle>Add Asset</DialogTitle>
          <DialogDescription>Track a new asset or liability</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g. Apple Inc, Bitcoin, Savings Account"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              data-testid="input-name"
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={form.category}
              onValueChange={(val) => setForm({ ...form, category: val })}
            >
              <SelectTrigger data-testid="select-category" className="bg-background border-border">
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
              <Label htmlFor="symbol">
                {form.category === "stocks" ? "Ticker Symbol" : "Coin ID (CoinGecko)"}
              </Label>
              <Input
                id="symbol"
                placeholder={form.category === "stocks" ? "AAPL" : "bitcoin"}
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                data-testid="input-symbol"
                className="bg-background border-border"
              />
            </div>
          )}

          {showQuantityFields && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="any"
                  placeholder="0"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  data-testid="input-quantity"
                  className="bg-background border-border font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Current Price ($)</Label>
                <Input
                  id="price"
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={form.current_price}
                  onChange={(e) => setForm({ ...form, current_price: e.target.value })}
                  data-testid="input-price"
                  className="bg-background border-border font-mono"
                />
              </div>
            </div>
          )}

          {showManualValue && (
            <div className="space-y-2">
              <Label htmlFor="manual_value">
                {form.category === "debts" ? "Amount Owed ($)" : "Total Value ($)"}
              </Label>
              <Input
                id="manual_value"
                type="number"
                step="any"
                placeholder="0.00"
                value={form.manual_value}
                onChange={(e) => setForm({ ...form, manual_value: e.target.value })}
                data-testid="input-manual-value"
                className="bg-background border-border font-mono"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="cost_basis">Cost Basis ($)</Label>
            <Input
              id="cost_basis"
              type="number"
              step="any"
              placeholder="0.00"
              value={form.cost_basis}
              onChange={(e) => setForm({ ...form, cost_basis: e.target.value })}
              data-testid="input-cost-basis"
              className="bg-background border-border font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              placeholder="Optional notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              data-testid="input-notes"
              className="bg-background border-border"
            />
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-white text-black hover:bg-neutral-200"
            data-testid="submit-add-asset"
          >
            {submitting ? "Adding..." : "Add Asset"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

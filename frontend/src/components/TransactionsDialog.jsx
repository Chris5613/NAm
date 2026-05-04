import { useState, useEffect } from "react";
import { projectsApi } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";

function formatCurrency(value) {
  if (!value && value !== 0) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value);
}

export default function TransactionsDialog({ project, open, onOpenChange, onUpdated }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    type: "earning",
    amount: "",
    category: "",
    notes: "",
    date: new Date().toISOString().split("T")[0],
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && project) {
      loadTransactions();
    }
  }, [open, project]);

  const loadTransactions = async () => {
    try {
      const res = await projectsApi.getTransactions(project.id);
      setTransactions(res.data || []);
    } catch {
      toast.error("Failed to load transactions");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    setSubmitting(true);
    try {
      await projectsApi.addTransaction(project.id, {
        type: form.type,
        amount: parseFloat(form.amount),
        category: form.category || null,
        notes: form.notes || null,
        date: form.date || null,
      });
      toast.success(`${form.type === "earning" ? "Earning" : "Investment"} of $${form.amount} added`);
      setForm({ type: "earning", amount: "", category: "", notes: "", date: new Date().toISOString().split("T")[0] });
      loadTransactions();
      onUpdated();
    } catch {
      toast.error("Failed to add transaction");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (txnId) => {
    try {
      await projectsApi.deleteTransaction(txnId);
      toast.success("Transaction removed");
      loadTransactions();
      onUpdated();
    } catch {
      toast.error("Failed to delete transaction");
    }
  };

  const categoryOptions = (project?.categories || []).map(c => c.name);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-lg max-h-[85vh] overflow-y-auto" data-testid="transactions-dialog">
        <DialogHeader>
          <DialogTitle>Transactions — {project?.name}</DialogTitle>
          <DialogDescription>Add earnings or investments. Numbers auto-update.</DialogDescription>
        </DialogHeader>

        {/* Add Transaction Form */}
        <form onSubmit={handleSubmit} className="space-y-3 pb-4 border-b border-border/40">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={form.type} onValueChange={(val) => setForm({ ...form, type: val })}>
                <SelectTrigger className="bg-background border-border" data-testid="txn-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="earning">Earning</SelectItem>
                  <SelectItem value="investment">Investment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amount ($)</Label>
              <Input
                type="number" step="any" placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                data-testid="txn-amount-input"
                className="bg-background border-border font-mono"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Category (optional)</Label>
              {categoryOptions.length > 0 ? (
                <Select value={form.category} onValueChange={(val) => setForm({ ...form, category: val })}>
                  <SelectTrigger className="bg-background border-border" data-testid="txn-category-select">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {categoryOptions.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="e.g. Mining, Bounty"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="bg-background border-border"
                />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                data-testid="txn-date-input"
                className="bg-background border-border font-mono"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Input
              placeholder="Optional note"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="bg-background border-border"
            />
          </div>
          <Button
            type="submit" disabled={submitting} size="sm"
            className="w-full bg-white text-black hover:bg-neutral-200"
            data-testid="submit-transaction-btn"
          >
            {submitting ? "Adding..." : "Add Transaction"}
          </Button>
        </form>

        {/* Transaction History */}
        <div className="space-y-2 pt-2">
          <p className="text-xs text-muted-foreground font-medium">Recent Transactions</p>
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : transactions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No transactions yet</p>
          ) : (
            <div className="space-y-1 max-h-[250px] overflow-y-auto">
              {transactions.map((txn) => (
                <div
                  key={txn.id}
                  className="flex items-center justify-between px-3 py-2 rounded-md bg-secondary/50"
                  data-testid={`txn-row-${txn.id}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-mono font-medium px-1.5 py-0.5 rounded ${
                      txn.type === "earning" ? "bg-emerald-500/10 text-emerald-400" : "bg-blue-500/10 text-blue-400"
                    }`}>
                      {txn.type === "earning" ? "+" : "INV"}
                    </span>
                    <div>
                      <span className="font-mono text-sm text-foreground">{formatCurrency(txn.amount)}</span>
                      {txn.category && (
                        <span className="text-xs text-muted-foreground ml-2">{txn.category}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{txn.date}</span>
                    <button
                      onClick={() => handleDelete(txn.id)}
                      className="text-rose-400 hover:text-rose-300"
                      data-testid={`delete-txn-${txn.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

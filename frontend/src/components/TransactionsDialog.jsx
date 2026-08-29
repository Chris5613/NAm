import { useState, useEffect, useCallback } from "react";
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
import { Trash2, Pencil, Check, X, Pickaxe, Cpu, Gamepad2 } from "lucide-react";

function formatCurrency(value) {
  if (!value && value !== 0) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value);
}

export default function TransactionsDialog({ project, open, onOpenChange, onUpdated }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ amount: "", category: "", notes: "", date: "" });
  const [form, setForm] = useState({
    type: "earning",
    amount: "",
    category: "",
    notes: "",
    date: new Date().toISOString().split("T")[0],
  });
  const [submitting, setSubmitting] = useState(false);

  const loadTransactions = useCallback(async () => {
    try {
      const res = await projectsApi.getTransactions(project.id);
      setTransactions(res.data || []);
    } catch {
      toast.error("Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, [project?.id]);

  useEffect(() => {
    if (open && project) {
      loadTransactions();
    }
  }, [open, project, loadTransactions]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    setSubmitting(true);
    try {
      const amount = parseFloat(form.amount);
      await projectsApi.addTransaction(project.id, {
        type: form.type,
        amount,
        category: form.category || null,
        notes: form.notes || null,
        date: form.date || null,
      });

      const freshProjects = (await projectsApi.getAll()).data || [];
      const currentProject = freshProjects.find((p) => p.id === project.id) || project;

      if (form.type === "earning") {
        await projectsApi.update(project.id, {
          earned: Math.max(0, (Number(currentProject.earned) || 0) + amount),
        });
      } else if (form.type === "investment") {
        await projectsApi.update(project.id, {
          invested: Math.max(0, (Number(currentProject.invested) || 0) + amount),
        });
      }
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
      // Find the transaction to know its type/amount for reversal
      const txn = transactions.find((t) => t.id === txnId);
      await projectsApi.deleteTransaction(txnId);
      // If it's a manual transaction (no source), reverse the earned/invested
      if (txn && !txn.source) {
        const freshProjects = (await projectsApi.getAll()).data || [];
        const currentProject = freshProjects.find((p) => p.id === project.id);
        if (currentProject) {
          if (txn.type === "earning") {
            await projectsApi.update(project.id, {
              earned: Math.max(0, (Number(currentProject.earned) || 0) - (Number(txn.amount) || 0)),
            });
          } else if (txn.type === "investment") {
            await projectsApi.update(project.id, {
              invested: Math.max(0, (Number(currentProject.invested) || 0) - (Number(txn.amount) || 0)),
            });
          }
        }
      }
      toast.success("Transaction removed");
      loadTransactions();
      onUpdated();
    } catch {
      toast.error("Failed to delete transaction");
    }
  };

  const startEdit = (txn) => {
    setEditingId(txn.id);
    setEditForm({
      amount: String(txn.amount ?? ""),
      category: txn.category || "",
      notes: txn.notes || "",
      date: txn.date || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ amount: "", category: "", notes: "", date: "" });
  };

  const saveEdit = async (txnId) => {
    const amt = parseFloat(editForm.amount);
    if (!isFinite(amt) || amt <= 0) { toast.error("Amount must be greater than 0"); return; }
    try {
      // Find the original txn to compute the difference
      const original = transactions.find((t) => t.id === txnId);
      await projectsApi.updateTransaction(txnId, {
        amount: amt,
        category: editForm.category || null,
        notes: editForm.notes || null,
        date: editForm.date || null,
      });
      // If it's a manual transaction (no source), adjust earned/invested by the diff
      if (original && !original.source) {
        const diff = amt - (Number(original.amount) || 0);
        if (diff !== 0) {
          const freshProjects = (await projectsApi.getAll()).data || [];
          const currentProject = freshProjects.find((p) => p.id === project.id);
          if (currentProject) {
            if (original.type === "earning") {
              await projectsApi.update(project.id, {
                earned: Math.max(0, (Number(currentProject.earned) || 0) + diff),
              });
            } else if (original.type === "investment") {
              await projectsApi.update(project.id, {
                invested: Math.max(0, (Number(currentProject.invested) || 0) + diff),
              });
            }
          }
        }
      }
      toast.success("Transaction updated");
      cancelEdit();
      loadTransactions();
      onUpdated();
    } catch {
      toast.error("Failed to update transaction");
    }
  };

  const categoryOptions = (project?.categories || []).map(c => c.name);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="transactions-dialog">
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
              {transactions.map((txn) => {
                const isEditing = editingId === txn.id;
                const isAutoSync = txn.source === "gomining";
                const isNosanaSync = txn.source === "nosana";
                const isRollerCoinSync = txn.source === "rollercoin";
                if (isEditing) {
                  return (
                    <div
                      key={txn.id}
                      className="px-3 py-2 rounded-md bg-secondary border border-border/40 space-y-2"
                      data-testid={`txn-edit-${txn.id}`}
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number" step="any" placeholder="Amount"
                          value={editForm.amount}
                          onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                          data-testid={`edit-txn-amount-${txn.id}`}
                          className="bg-background border-border font-mono h-8 text-sm"
                        />
                        <Input
                          type="date"
                          value={editForm.date}
                          onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                          data-testid={`edit-txn-date-${txn.id}`}
                          className="bg-background border-border font-mono h-8 text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="Category"
                          value={editForm.category}
                          onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                          data-testid={`edit-txn-category-${txn.id}`}
                          className="bg-background border-border h-8 text-sm"
                        />
                        <Input
                          placeholder="Notes"
                          value={editForm.notes}
                          onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                          data-testid={`edit-txn-notes-${txn.id}`}
                          className="bg-background border-border h-8 text-sm"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={cancelEdit}
                          className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs px-2 py-1 rounded hover:bg-secondary transition-colors"
                          data-testid={`cancel-edit-${txn.id}`}
                        >
                          <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                          <span>Cancel</span>
                        </button>
                        <button
                          onClick={() => saveEdit(txn.id)}
                          className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-xs px-2 py-1 rounded hover:bg-emerald-500/10 transition-colors"
                          data-testid={`save-edit-${txn.id}`}
                        >
                          <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
                          <span>Save</span>
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
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
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-foreground">{formatCurrency(txn.amount)}</span>
                        {txn.category && (
                          <span className="text-xs text-muted-foreground">{txn.category}</span>
                        )}
                        {isAutoSync && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono"
                            title="Auto-synced from GoMining"
                            data-testid={`auto-sync-badge-${txn.id}`}
                          >
                            <Pickaxe className="w-2.5 h-2.5" strokeWidth={2} />
                            auto
                          </span>
                        )}
                        {isNosanaSync && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono"
                            title="Auto-synced from Nosana dashboard API"
                            data-testid={`nosana-sync-badge-${txn.id}`}
                          >
                            <Cpu className="w-2.5 h-2.5" strokeWidth={2} />
                            nosana
                          </span>
                        )}
                        {isRollerCoinSync && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 font-mono"
                            title={`RollerCoin balance update (${Number(txn.source_trx_delta || 0).toFixed(4)} TRX)`}
                            data-testid={`rollercoin-sync-badge-${txn.id}`}
                          >
                            <Gamepad2 className="w-2.5 h-2.5" strokeWidth={2} />
                            rollercoin
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-muted-foreground">{txn.date}</span>
                      {txn.notes && <span className="text-xs text-muted-foreground truncate max-w-[100px]">{txn.notes}</span>}
                      <button
                        onClick={() => startEdit(txn)}
                        className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs px-2 py-1 rounded hover:bg-secondary transition-colors"
                        data-testid={`edit-txn-${txn.id}`}
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                      <button
                        onClick={() => handleDelete(txn.id)}
                        className="flex items-center gap-1 text-rose-400 hover:text-rose-300 text-xs px-2 py-1 rounded hover:bg-rose-500/10 transition-colors"
                        data-testid={`delete-txn-${txn.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

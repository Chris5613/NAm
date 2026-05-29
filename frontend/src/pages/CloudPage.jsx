import { useMemo, useState } from "react";
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
  Plus,
  Trash2,
  X,
  TrendingUp,
  TrendingDown,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";

const CLOUD_BETS_KEY = "cloud_manual_bets";

function getSavedBets() {
  try {
    const saved = JSON.parse(localStorage.getItem(CLOUD_BETS_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveBets(bets) {
  try {
    localStorage.setItem(CLOUD_BETS_KEY, JSON.stringify(bets || []));
  } catch {
    // localStorage unavailable
  }
}

function formatCurrency(value) {
  const n = Number(value) || 0;

  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatRecord(wins, losses) {
  return `${wins}W · ${losses}L`;
}

function getBetMonthKey(bet) {
  const date = bet.date || bet.created_at;
  if (!date) return "";

  return date.slice(0, 7); // YYYY-MM
}

function formatMonthLabel(monthKey) {
  if (!monthKey) return "All Months";

  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export default function CloudPage() {
  const [bets, setBets] = useState(() => getSavedBets());
  const [addOpen, setAddOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("all");

  const [form, setForm] = useState({
    title: "",
    matchup: "",
    amount: "",
    result: "win",
    date: new Date().toISOString().slice(0, 10),
    note: "",
  });

  const monthOptions = useMemo(() => {
  const months = [...new Set(bets.map(getBetMonthKey).filter(Boolean))];

  return months.sort((a, b) => b.localeCompare(a));
}, [bets]);

const filteredBets = useMemo(() => {
  const sorted = [...bets].sort((a, b) => {
    const dateA = new Date(a.date || a.created_at || 0).getTime();
    const dateB = new Date(b.date || b.created_at || 0).getTime();

    if (dateB !== dateA) return dateB - dateA;

    return (
      new Date(b.created_at || 0).getTime() -
      new Date(a.created_at || 0).getTime()
    );
  });

  if (selectedMonth === "all") return sorted;

  return sorted.filter((bet) => getBetMonthKey(bet) === selectedMonth);
}, [bets, selectedMonth]);

  const stats = useMemo(() => {
    let wins = 0;
    let losses = 0;
    let wagered = 0;
    let netPnl = 0;

    filteredBets.forEach((bet) => {
      const amount = Number(bet.amount) || 0;
      wagered += Math.abs(amount);

      if (amount >= 0) {
        wins += 1;
      } else {
        losses += 1;
      }

      netPnl += amount;
    });

    const total = wins + losses;
    const winRate = total > 0 ? (wins / total) * 100 : 0;

    return {
      wins,
      losses,
      wagered,
      netPnl,
      winRate,
    };
  }, [filteredBets]);

  const handleAddBet = () => {
    const amountRaw = Number(form.amount);

    if (!form.title.trim()) {
      toast.error("Enter a bet title");
      return;
    }

    if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    const finalAmount =
      form.result === "loss" ? -Math.abs(amountRaw) : Math.abs(amountRaw);

    const nextBet = {
      id: crypto.randomUUID(),
      title: form.title.trim(),
      matchup: form.matchup.trim(),
      amount: finalAmount,
      result: form.result,
      date: form.date,
      note: form.note.trim(),
      created_at: new Date().toISOString(),
    };

    const next = [nextBet, ...bets];

    setBets(next);
    saveBets(next);

    setForm({
      title: "",
      matchup: "",
      amount: "",
      result: "win",
      date: new Date().toISOString().slice(0, 10),
      note: "",
    });

    setAddOpen(false);
    toast.success("Bet added");
  };

  const handleDeleteBet = (id) => {
    const next = bets.filter((bet) => bet.id !== id);

    setBets(next);
    saveBets(next);

    toast.success("Bet removed");
  };

  return (
<div className="min-h-[calc(100vh-4rem)] bg-background text-foreground p-0">
  <Card className="w-full min-h-[calc(100vh-4rem)] rounded-none border-0 bg-card shadow-none">
        <CardContent className="p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-violet-600 flex items-center justify-center">
                <span className="text-2xl font-bold text-white">C</span>
              </div>

              <div>
                <h1 className="text-2xl font-bold tracking-tight">Cloud</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => setAddOpen(true)}
                className="bg-white text-black hover:bg-neutral-200"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Bet
              </Button>

              <Button
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          <div className="mt-8">
<div className="flex items-center justify-between gap-3 mb-3">
  <p className="text-xs uppercase tracking-wider text-muted-foreground">
    {selectedMonth === "all" ? "All Months" : formatMonthLabel(selectedMonth)}
  </p>

  <select
    value={selectedMonth}
    onChange={(e) => setSelectedMonth(e.target.value)}
    className="h-9 rounded-md border border-border/40 bg-background px-3 text-xs font-mono text-foreground outline-none"
  >
    <option value="all">All Months</option>

    {monthOptions.map((monthKey) => (
      <option key={monthKey} value={monthKey}>
        {formatMonthLabel(monthKey)}
      </option>
    ))}
  </select>
</div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg bg-secondary/60 border border-border/40 p-4 text-center">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Net P/L
                </p>

                <p
                  className={`font-mono text-xl font-bold mt-1 ${
                    stats.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {stats.netPnl >= 0 ? "+" : ""}
                  {formatCurrency(stats.netPnl)}
                </p>
              </div>

              <div className="rounded-lg bg-secondary/60 border border-border/40 p-4 text-center">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Win Rate
                </p>

                <p className="font-mono text-xl font-bold mt-1 text-foreground">
                  {stats.winRate.toFixed(0)}%
                </p>
              </div>

              <div className="rounded-lg bg-secondary/60 border border-border/40 p-4 text-center">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Record
                </p>

                <p className="font-mono text-xl font-bold mt-1 text-foreground">
                  {formatRecord(stats.wins, stats.losses)}
                </p>
              </div>

              <div className="rounded-lg bg-secondary/60 border border-border/40 p-4 text-center">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Wagered
                </p>

                <p className="font-mono text-xl font-bold mt-1 text-foreground">
                  {formatCurrency(stats.wagered)}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <p className="text-sm font-semibold text-muted-foreground mb-3">
              Bets
            </p>

            {filteredBets.length === 0 ? (
              <div className="rounded-lg border border-border/40 bg-secondary/30 p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No bets added yet.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[calc(100vh-360px)] overflow-y-auto pr-2">
{filteredBets.map((bet) => {
  const won = Number(bet.amount) >= 0;

  return (
                    <div
                      key={bet.id}
                      className={`rounded-lg border p-4 bg-secondary/40 ${
                        won
                          ? "border-emerald-500/40"
                          : "border-rose-500/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              won
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-rose-500/10 text-rose-400"
                            }`}
                          >
                            {won ? (
                              <TrendingUp className="w-5 h-5" />
                            ) : (
                              <TrendingDown className="w-5 h-5" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="text-sm font-bold text-foreground">
                              Cloud {won ? "won" : "lost"}{" "}
                              <span
                                className={
                                  won ? "text-emerald-400" : "text-rose-400"
                                }
                              >
                                {won ? "+" : "-"}
                                {formatCurrency(Math.abs(bet.amount))}
                              </span>
                            </p>

                            <p className="text-xs text-muted-foreground truncate mt-1">
                              {bet.title}
                              {bet.matchup ? ` · ${bet.matchup}` : ""}
                            </p>

                            <p className="text-[11px] text-muted-foreground/70 mt-1">
                              {bet.date}
                              {bet.note ? ` · ${bet.note}` : ""}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-mono px-3 py-1 rounded border ${
                              won
                                ? "border-emerald-500/40 text-emerald-400"
                                : "border-rose-500/40 text-rose-400"
                            }`}
                          >
                            {won ? "Win" : "Loss"}
                          </span>

                          <button
                            onClick={() => handleDeleteBet(bet.id)}
                            className="text-muted-foreground hover:text-rose-400 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Cloud Bet</DialogTitle>
            <DialogDescription>
              Manually enter a win or loss.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Bet title</Label>
              <Input
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    title: e.target.value,
                  }))
                }
                placeholder="Example: Yuta Tomida Set 2"
                className="bg-background border-border"
              />
            </div>

            <div className="space-y-2">
              <Label>Matchup or details</Label>
              <Input
                value={form.matchup}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    matchup: e.target.value,
                  }))
                }
                placeholder="Example: Sora Fukuda vs Yuta Tomida"
                className="bg-background border-border"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="any"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      amount: e.target.value,
                    }))
                  }
                  placeholder="458.34"
                  className="bg-background border-border font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      date: e.target.value,
                    }))
                  }
                  className="bg-background border-border font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Result</Label>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={form.result === "win" ? "default" : "outline"}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      result: "win",
                    }))
                  }
                  className={
                    form.result === "win"
                      ? "bg-emerald-500 text-black hover:bg-emerald-400"
                      : "border-border/40"
                  }
                >
                  <Trophy className="w-4 h-4 mr-2" />
                  Win
                </Button>

                <Button
                  type="button"
                  variant={form.result === "loss" ? "default" : "outline"}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      result: "loss",
                    }))
                  }
                  className={
                    form.result === "loss"
                      ? "bg-rose-500 text-white hover:bg-rose-400"
                      : "border-border/40"
                  }
                >
                  <TrendingDown className="w-4 h-4 mr-2" />
                  Loss
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Note</Label>
              <Input
                value={form.note}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    note: e.target.value,
                  }))
                }
                placeholder="Optional"
                className="bg-background border-border"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>

            <Button onClick={handleAddBet}>Save Bet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
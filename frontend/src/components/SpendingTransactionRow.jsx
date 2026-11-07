import { useState } from "react";
import { ArrowDownRight, EyeOff, ShoppingBag, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { humanDate, money } from "@/lib/spendingMetrics";

function getTransactionIcon(category) {
  return category === "Food & drink"
    ? Utensils
    : category === "Shopping"
      ? ShoppingBag
      : ArrowDownRight;
}

export default function SpendingTransactionRow({
  item,
  color,
  categories,
  showDate,
  onRecategorize,
  onHide,
  onAddCategory,
}) {
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const Icon = getTransactionIcon(item.category);
  const options = categories.includes(item.category)
    ? categories
    : [item.category, ...categories];

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ background: `${color}22`, color }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {item.merchant}
          {item.pending && <span className="ml-1 text-muted-foreground">| Pending</span>}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <button
            type="button"
            className="-ml-1 rounded border border-transparent px-1 py-0 text-xs text-muted-foreground hover:border-border/70 hover:text-foreground"
            onClick={() => setCategoryOpen(true)}
            aria-label={`Change category for ${item.merchant}`}
          >
            {item.category}
          </button>
          {showDate && <span className="text-xs text-muted-foreground">{humanDate(item.date)}</span>}
        </div>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums">{money(item.amount)}</span>
      <button
        title="Hide transaction"
        className="shrink-0 text-muted-foreground hover:text-amber-400"
        onClick={() => onHide(item.id)}
      >
        <EyeOff className="h-3.5 w-3.5" />
      </button>
      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
        <DialogContent className="w-[min(92vw,42rem)] max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose category</DialogTitle>
            <DialogDescription>{item.merchant}</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
            {options.map((category) => (
              <Button
                key={category}
                type="button"
                variant={category === item.category ? "default" : "outline"}
                className="justify-start"
                onClick={() => {
                  onRecategorize(item.id, category);
                  setCategoryOpen(false);
                }}
              >
                {category}
              </Button>
            ))}
          </div>
          <div className="flex gap-2 border-t border-border/60 pt-4">
            <Input
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              placeholder="New category"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  const added = onAddCategory(newCategory);
                  if (added) {
                    onRecategorize(item.id, added);
                    setNewCategory("");
                    setCategoryOpen(false);
                  }
                }
              }}
            />
            <Button
              type="button"
              onClick={() => {
                const added = onAddCategory(newCategory);
                if (added) {
                  onRecategorize(item.id, added);
                  setNewCategory("");
                  setCategoryOpen(false);
                }
              }}
            >
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

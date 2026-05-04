import { useState } from "react";
import { assetsApi } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Landmark,
  CreditCard,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import EditAssetDialog from "@/components/EditAssetDialog";

const CATEGORY_META = {
  stocks: { label: "Stocks", Icon: TrendingUp, color: "text-emerald-400" },
  cash: { label: "Cash", Icon: Landmark, color: "text-blue-400" },
  debts: { label: "Debts", Icon: CreditCard, color: "text-rose-400" },
};

function formatCurrency(v) {
  if (!v && v !== 0) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);
}

function getAssetValue(a) {
  if (a.manual_value !== null && a.manual_value !== undefined) return a.manual_value;
  return (a.quantity || 0) * (a.current_price || 0);
}

export default function AssetBreakdown({
  category,
  assets,
  onUpdate,
  onDelete,
  defaultOpen = false,
  emptyMessage,
}) {
  const meta = CATEGORY_META[category] || CATEGORY_META.cash;
  const Icon = meta.Icon;
  const [open, setOpen] = useState(defaultOpen);
  const [expandedId, setExpandedId] = useState(null);
  const [editAsset, setEditAsset] = useState(null);

  const items = assets
    .filter((a) => a.category === category)
    .sort((a, b) => getAssetValue(b) - getAssetValue(a));

  const total = items.reduce((s, a) => s + getAssetValue(a), 0);

  const handleDelete = async (a) => {
    if (!window.confirm(`Delete ${a.name}?`)) return;
    try {
      await assetsApi.delete(a.id);
      toast.success(`${a.name} deleted`);
      onDelete?.();
    } catch {
      toast.error("Failed to delete");
    }
  };

  if (items.length === 0 && !defaultOpen) {
    // In collapsed/All view, just show a compact empty-ish top card
    return (
      <Card
        className="border-border/40 bg-card hover:border-white/10 transition-colors cursor-pointer"
        data-testid={`${category}-top-card`}
        onClick={() => setOpen(!open)}
      >
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ChevronRight className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                <Icon className={`w-4 h-4 ${meta.color}`} strokeWidth={1.5} />
              </div>
              <div>
                <span className="font-semibold text-foreground text-lg">{meta.label}</span>
                <p className="text-xs text-muted-foreground mt-0.5">No entries yet</p>
              </div>
            </div>
            <div className="text-right min-w-[120px]">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="font-mono text-base font-bold text-foreground">{formatCurrency(0)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3" data-testid={`${category}-breakdown`}>
      {/* Level 1 */}
      <Card
        className="border-border/40 bg-card hover:border-white/10 transition-colors cursor-pointer"
        data-testid={`${category}-top-card`}
        onClick={() => setOpen(!open)}
      >
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {open ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
              )}
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                <Icon className={`w-4 h-4 ${meta.color}`} strokeWidth={1.5} />
              </div>
              <div>
                <span className="font-semibold text-foreground text-lg">{meta.label}</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {items.length} {items.length === 1 ? "entry" : "entries"}
                </p>
              </div>
            </div>
            <div className="text-right min-w-[120px]">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className={`font-mono text-base font-bold ${category === "debts" ? "text-rose-400" : "text-foreground"}`}>
                {category === "debts" && total > 0 ? "-" : ""}{formatCurrency(total)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Level 2 */}
      {open && items.length === 0 && (
        <div className="ml-6">
          <Card className="border-border/30 bg-secondary/30">
            <CardContent className="p-5 text-center">
              <p className="text-sm text-muted-foreground">{emptyMessage || `No ${meta.label.toLowerCase()} added yet.`}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {open && items.length > 0 && (
        <div className="ml-6 space-y-2" data-testid={`${category}-items-list`}>
          {items.map((a) => {
            const value = getAssetValue(a);
            const expanded = expandedId === a.id;
            const hasDetails = category === "stocks" && a.quantity > 0;
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
            return (
              <div key={a.id}>
                <Card
                  className="border-border/30 bg-secondary/30 hover:border-white/10 transition-colors cursor-pointer"
                  data-testid={`item-box-${a.id}`}
                  onClick={() => setExpandedId(expanded ? null : a.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {hasDetails ? (
                          expanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                          )
                        ) : (
                          <span className="w-3.5 flex-shrink-0" />
                        )}
                        <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                          <Icon className={`w-3 h-3 ${meta.color}`} strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-foreground truncate">{a.name}</span>
                            {a.symbol && (
                              <span className="text-[10px] font-mono uppercase text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">
                                {a.symbol}
                              </span>
                            )}
                            <span className="text-xs font-mono text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded">{pct}%</span>
                          </div>
                          {a.notes && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{a.notes}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right min-w-[100px]">
                          <p className="text-[10px] text-muted-foreground">Value</p>
                          <p className={`font-mono text-sm font-medium ${category === "debts" ? "text-rose-400" : "text-foreground"}`}>
                            {category === "debts" ? "-" : ""}{formatCurrency(value)}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <button className="p-1 hover:bg-secondary rounded" data-testid={`item-menu-${a.id}`}>
                              <MoreVertical className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="bg-card border-border">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditAsset(a); }} data-testid={`item-edit-${a.id}`}>
                              <Pencil className="w-3.5 h-3.5 mr-2" strokeWidth={1.5} />Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDelete(a); }} className="text-rose-400" data-testid={`item-delete-${a.id}`}>
                              <Trash2 className="w-3.5 h-3.5 mr-2" strokeWidth={1.5} />Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Level 3: Details for stocks */}
                {expanded && hasDetails && (
                  <div className="ml-8 mt-2 mb-2" data-testid={`item-details-${a.id}`}>
                    <Card className="border-border/20 bg-secondary/20">
                      <CardContent className="px-4 py-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                          <div>
                            <p className="text-muted-foreground">Quantity</p>
                            <p className="font-mono text-foreground mt-0.5">{a.quantity?.toLocaleString(undefined, { maximumFractionDigits: 6 })}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Price</p>
                            <p className="font-mono text-foreground mt-0.5">{formatCurrency(a.current_price || 0)}</p>
                          </div>
                          {a.cost_basis > 0 && (
                            <div>
                              <p className="text-muted-foreground">Cost Basis</p>
                              <p className="font-mono text-foreground mt-0.5">{formatCurrency(a.cost_basis)}</p>
                            </div>
                          )}
                          {a.cost_basis > 0 && (
                            <div>
                              <p className="text-muted-foreground">P/L</p>
                              <p className={`font-mono mt-0.5 ${value - a.cost_basis >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {value - a.cost_basis >= 0 ? "+" : ""}{formatCurrency(value - a.cost_basis)}
                              </p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editAsset && (
        <EditAssetDialog
          asset={editAsset}
          open={!!editAsset}
          onOpenChange={(o) => !o && setEditAsset(null)}
          onUpdated={() => { setEditAsset(null); onUpdate?.(); }}
        />
      )}
    </div>
  );
}

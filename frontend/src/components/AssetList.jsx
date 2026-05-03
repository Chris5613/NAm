import { useState } from "react";
import { assetsApi } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import EditAssetDialog from "@/components/EditAssetDialog";

const CATEGORY_LABELS = {
  stocks: "Stocks",
  crypto: "Crypto",
  cash: "Cash",
  crypto_projects: "Projects",
  debts: "Debts",
};

function formatCurrency(value) {
  if (value === undefined || value === null) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function getAssetValue(asset) {
  if (asset.manual_value) return asset.manual_value;
  return asset.quantity * asset.current_price;
}

function getPnL(asset) {
  const currentValue = getAssetValue(asset);
  const costBasis = asset.cost_basis || 0;
  if (costBasis === 0) return null;
  return currentValue - costBasis;
}

export default function AssetList({ assets, onUpdate, onDelete }) {
  const [editingAsset, setEditingAsset] = useState(null);

  const handleDelete = async (asset) => {
    try {
      await assetsApi.delete(asset.id);
      toast.success(`${asset.name} deleted`);
      onDelete();
    } catch (err) {
      toast.error("Failed to delete asset");
    }
  };

  if (!assets || assets.length === 0) {
    return (
      <Card className="border-border/40 bg-card" data-testid="asset-list-empty">
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-muted-foreground text-sm">No assets in this category</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2" data-testid="asset-list">
        {assets.map((asset) => {
          const value = getAssetValue(asset);
          const pnl = getPnL(asset);
          return (
            <Card
              key={asset.id}
              className="border-border/40 bg-card hover:border-white/10 transition-colors"
              data-testid={`asset-row-${asset.id}`}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground truncate">
                        {asset.name}
                      </span>
                      {asset.symbol && (
                        <span className="font-mono text-xs text-muted-foreground uppercase">
                          {asset.symbol}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {CATEGORY_LABELS[asset.category] || asset.category}
                      </span>
                      {asset.quantity > 0 && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {asset.quantity} @ {formatCurrency(asset.current_price)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-mono text-sm font-medium text-foreground">
                      {formatCurrency(value)}
                    </p>
                    {pnl !== null && (
                      <p
                        className={`font-mono text-xs ${pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                      >
                        {pnl >= 0 ? "+" : ""}
                        {formatCurrency(pnl)}
                      </p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        data-testid={`asset-menu-${asset.id}`}
                      >
                        <MoreVertical className="w-4 h-4" strokeWidth={1.5} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-card border-border">
                      <DropdownMenuItem
                        onClick={() => setEditingAsset(asset)}
                        data-testid={`edit-asset-${asset.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-2" strokeWidth={1.5} />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(asset)}
                        className="text-rose-400 focus:text-rose-400"
                        data-testid={`delete-asset-${asset.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" strokeWidth={1.5} />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {editingAsset && (
        <EditAssetDialog
          asset={editingAsset}
          open={!!editingAsset}
          onOpenChange={(open) => !open && setEditingAsset(null)}
          onUpdated={() => {
            setEditingAsset(null);
            onUpdate();
          }}
        />
      )}
    </>
  );
}

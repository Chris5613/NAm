import { useState, useEffect, useCallback } from "react";
import { assetsApi, pricesApi } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

function formatCurrency(value) {
  if (!value && value !== 0) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

export default function CryptoPage() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCryptoAssets = useCallback(async () => {
    try {
      const res = await assetsApi.getAll();
      const crypto = (res.data || []).filter(
        (a) => a.category === "crypto" || a.category === "crypto_projects"
      );
      setAssets(crypto);
    } catch {
      toast.error("Failed to load crypto assets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCryptoAssets();
  }, [fetchCryptoAssets]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await pricesApi.refreshAll();
      await fetchCryptoAssets();
      toast.success("Crypto prices refreshed");
    } catch {
      toast.error("Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground font-mono animate-pulse">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="crypto-page">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-medium tracking-tight">Crypto</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="border-border/40 hover:bg-secondary"
          data-testid="crypto-refresh-btn"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.5} />
          Refresh
        </Button>
      </div>

      {assets.length === 0 ? (
        <Card className="border-border/40 bg-card">
          <CardContent className="p-6 text-center text-muted-foreground text-sm">
            No crypto assets yet. Add some from the Net Worth page.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {assets.map((asset) => {
            const value = asset.manual_value != null
              ? asset.manual_value
              : (asset.quantity || 0) * (asset.current_price || 0);
            return (
              <Card
                key={asset.id}
                className="border-border/40 bg-card hover:border-white/10 transition-colors"
                data-testid={`crypto-asset-${asset.id}`}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {asset.icon_url ? (
                      <div className="w-9 h-9 rounded-md overflow-hidden bg-secondary flex items-center justify-center">
                        <img src={asset.icon_url} alt="" className="w-6 h-6 object-contain" />
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded-md bg-amber-500/10 flex items-center justify-center">
                        <span className="font-mono text-xs text-amber-400 font-bold">
                          {(asset.symbol || "?").slice(0, 3).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-foreground">{asset.name}</p>
                      {asset.quantity > 0 && (
                        <p className="font-mono text-xs text-muted-foreground mt-0.5">
                          {asset.quantity} {asset.symbol ? asset.symbol.toUpperCase() : ""}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-medium text-foreground">
                      {formatCurrency(value)}
                    </p>
                    {asset.current_price > 0 && (
                      <p className="font-mono text-xs text-muted-foreground">
                        @ {formatCurrency(asset.current_price)}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

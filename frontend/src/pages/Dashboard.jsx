import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { assetsApi, netWorthApi, pricesApi, walletSyncApi } from "@/lib/api";
import { localStorage as storage } from "@/lib/localStorage";
import { toast } from "sonner";
import NetWorthHero from "@/components/NetWorthHero";
import PortfolioChart from "@/components/PortfolioChart";
import NetWorthHistory from "@/components/NetWorthHistory";
import CryptoBreakdown from "@/components/CryptoBreakdown";
import AssetBreakdown from "@/components/AssetBreakdown";
import AddAssetDialog from "@/components/AddAssetDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Plus, Camera, Radio } from "lucide-react";


const LIVE_HISTORY_MAX_POINTS = 200;      // rolling window persisted to localStorage
const SUPPORTED_TABS = new Set(["all", "stocks", "crypto", "cash", "debts", "other"]);

function calculateNetWorth(assets = [], cryptoTotal = 0) {
  const breakdown = {
    stocks: 0,
    crypto: cryptoTotal,
    cash: 0,
    other: 0,
    debts: 0,
  };

  assets.forEach((asset) => {
    const value =
      asset.manual_value != null
        ? Number(asset.manual_value) || 0
        : (Number(asset.quantity) || 0) * (Number(asset.current_price) || 0);

    if (asset.category === "debts") {
      breakdown.debts += value;
    } else if (breakdown[asset.category] !== undefined) {
      breakdown[asset.category] += value;
    }
  });

  const total_net_worth =
    breakdown.stocks +
    breakdown.crypto +
    breakdown.cash +
    breakdown.other -
    breakdown.debts;

  return {
    total_net_worth,
    breakdown,
    asset_count: assets.length,
  };
}

export default function Dashboard() {
  const [assets, setAssets] = useState([]);
  const [netWorth, setNetWorth] = useState(null);
  const [history, setHistory] = useState([]);
  // Hydrate live history from localStorage so the chart isn't blank on reload.
  const [liveHistory, setLiveHistory] = useState(() => {
    const persisted = storage.getLiveHistory();
    return Array.isArray(persisted) ? persisted : [];
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [lastUpdated, setLastUpdated] = useState(null);
 
  // Persist liveHistory whenever it changes (capped to last N points).
  useEffect(() => {
    if (!Array.isArray(liveHistory)) return;
    const trimmed = liveHistory.slice(-LIVE_HISTORY_MAX_POINTS);
    storage.setLiveHistory(trimmed);
  }, [liveHistory]);

const fetchData = useCallback(async () => {
  try {
    const assets = storage.getAssets?.() || [];
    const history = storage.getNetWorthHistory?.() || [];

    const cryptoCache = storage.getCryptoCache?.() || {};
    const cryptoTotal = Number(cryptoCache.total) || 0;

    const calculatedNetWorth = calculateNetWorth(assets, cryptoTotal);

    setAssets(assets);
    setNetWorth(calculatedNetWorth);
    setHistory(history);
    setLastUpdated(new Date());

    setLiveHistory((prev) => {
      if (prev.length === 0) {
        return [
          {
            timestamp: new Date().toISOString(),
            value: calculatedNetWorth.total_net_worth,
          },
        ];
      }
      return prev;
    });
  } catch (err) {
    toast.error("Failed to load data");
  } finally {
    setLoading(false);
  }
}, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);


  const handleSnapshot = async () => {
    try {
      await netWorthApi.saveSnapshot();
      const historyRes = await netWorthApi.getHistory();
      setHistory(historyRes.data);
      toast.success("Snapshot saved");
    } catch (err) {
      toast.error("Failed to save snapshot");
    }
  };

  const handleAssetCreated = () => {
    setAddDialogOpen(false);
    fetchData();
  };

  const handleAssetUpdated = () => fetchData();
  const handleAssetDeleted = () => fetchData();

  // For the "All" tab — render the category cards sorted by value descending.
  // Crypto comes from netWorth.breakdown.crypto (which already includes wallets).
  const sortedAllSections = useMemo(() => {
    const stocksTotal = (assets || [])
      .filter((a) => a.category === "stocks")
      .reduce((s, a) => s + (a.quantity || 0) * (a.current_price || 0), 0);
    const cashTotal = (assets || [])
      .filter((a) => a.category === "cash")
      .reduce((s, a) => s + (a.quantity || 0) * (a.current_price || 0), 0);
    const debtsTotal = (assets || [])
      .filter((a) => a.category === "debts")
      .reduce((s, a) => s + (a.quantity || 0) * (a.current_price || 0), 0);
    const otherTotal = (assets || [])
      .filter((a) => a.category === "other")
      .reduce((s, a) => s + (a.quantity || 0) * (a.current_price || 0), 0);
    const cryptoTotal = netWorth?.breakdown?.crypto || 0;

    return [
      { kind: "stocks", total: stocksTotal },
      { kind: "crypto", total: cryptoTotal },
      { kind: "cash",   total: cashTotal },
      { kind: "other",  total: otherTotal },
      { kind: "debts",  total: debtsTotal },
    ].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }, [assets, netWorth]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" data-testid="loading-spinner">
        <div className="animate-pulse text-muted-foreground font-mono">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-4xl font-medium tracking-tight" data-testid="page-title">
            Net Worth
          </h1>
          <button
            onClick={() => setLiveEnabled(!liveEnabled)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              liveEnabled
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-secondary text-muted-foreground border border-border/40"
            }`}
            data-testid="live-toggle-btn"
          >
            <Radio className={`w-3 h-3 ${liveEnabled ? "animate-pulse" : ""}`} strokeWidth={2} />
            {liveEnabled ? "LIVE" : "PAUSED"}
          </button>
          {lastUpdated && (
            <span className="text-xs text-muted-foreground font-mono" data-testid="last-updated">
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSnapshot}
            data-testid="snapshot-btn"
            className="border-border/40 hover:bg-secondary"
          >
            <Camera className="w-4 h-4 mr-2" strokeWidth={1.5} />
            Snapshot
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshPrices}
            disabled={refreshing}
            data-testid="refresh-prices-btn"
            className="border-border/40 hover:bg-secondary"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.5} />
            Refresh Prices
          </Button>
          <Button
            size="sm"
            onClick={() => setAddDialogOpen(true)}
            data-testid="add-asset-btn"
            className="bg-white text-black hover:bg-neutral-200"
          >
            <Plus className="w-4 h-4 mr-2" strokeWidth={1.5} />
            Add Asset
          </Button>
        </div>
      </div>

      {/* Net Worth Hero + Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <div className="md:col-span-2 lg:col-span-2">
          <NetWorthHero netWorth={netWorth} />
        </div>
        <div className="md:col-span-1 lg:col-span-2">
          <PortfolioChart netWorth={netWorth} />
        </div>
      </div>

      {/* History Chart */}
      <NetWorthHistory history={history} liveData={liveHistory} />

      {/* Asset List with Tabs */}
      <div className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-secondary" data-testid="category-tabs">
            <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
            <TabsTrigger value="stocks" data-testid="tab-stocks">Stocks</TabsTrigger>
            <TabsTrigger value="crypto" data-testid="tab-crypto">Crypto</TabsTrigger>
            <TabsTrigger value="cash" data-testid="tab-cash">Cash</TabsTrigger>
            <TabsTrigger value="other" data-testid="tab-other">Other</TabsTrigger>
            <TabsTrigger value="debts" data-testid="tab-debts">Debts</TabsTrigger>
          </TabsList>
          <TabsContent value={activeTab}>
            {activeTab === "crypto" && (
              <CryptoBreakdown key="crypto" defaultOpen={true} />
            )}
            {activeTab === "stocks" && (
              <AssetBreakdown category="stocks" assets={assets} onUpdate={handleAssetUpdated} onDelete={handleAssetDeleted} defaultOpen={true} />
            )}
            {activeTab === "cash" && (
              <AssetBreakdown category="cash" assets={assets} onUpdate={handleAssetUpdated} onDelete={handleAssetDeleted} defaultOpen={true} />
            )}
            {activeTab === "debts" && (
              <AssetBreakdown category="debts" assets={assets} onUpdate={handleAssetUpdated} onDelete={handleAssetDeleted} defaultOpen={true} />
            )}
            {activeTab === "other" && (
              <AssetBreakdown category="other" assets={assets} onUpdate={handleAssetUpdated} onDelete={handleAssetDeleted} defaultOpen={true} />
            )}
            {activeTab === "all" && (
              <div className="space-y-4">
                {sortedAllSections.map((section) => {
                  if (section.kind === "crypto") {
                    return <CryptoBreakdown key="all-crypto" defaultOpen={false} />;
                  }
                  return (
                    <AssetBreakdown
                      key={`all-${section.kind}`}
                      category={section.kind}
                      assets={assets}
                      onUpdate={handleAssetUpdated}
                      onDelete={handleAssetDeleted}
                      defaultOpen={false}
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <AddAssetDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCreated={handleAssetCreated}
        defaultCategory={SUPPORTED_TABS.has(activeTab) && activeTab !== "all" ? activeTab : "stocks"}
      />
    </div>
  );
}

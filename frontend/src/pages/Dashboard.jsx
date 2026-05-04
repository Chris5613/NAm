import { useState, useEffect, useCallback, useRef } from "react";
import { assetsApi, netWorthApi, pricesApi } from "@/lib/api";
import { toast } from "sonner";
import NetWorthHero from "@/components/NetWorthHero";
import PortfolioChart from "@/components/PortfolioChart";
import NetWorthHistory from "@/components/NetWorthHistory";
import AssetList from "@/components/AssetList";
import AddAssetDialog from "@/components/AddAssetDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Plus, Camera, Radio } from "lucide-react";

const REFRESH_INTERVAL = 30000; // 30 seconds

export default function Dashboard() {
  const [assets, setAssets] = useState([]);
  const [netWorth, setNetWorth] = useState(null);
  const [history, setHistory] = useState([]);
  const [liveHistory, setLiveHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const intervalRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [assetsRes, netWorthRes, historyRes] = await Promise.all([
        assetsApi.getAll(),
        netWorthApi.getCurrent(),
        netWorthApi.getHistory(),
      ]);
      setAssets(assetsRes.data);
      setNetWorth(netWorthRes.data);
      setHistory(historyRes.data);
      setLastUpdated(new Date());
      // Add initial point to live history
      setLiveHistory(prev => {
        if (prev.length === 0) {
          return [{ timestamp: new Date().toISOString(), value: netWorthRes.data.total_net_worth }];
        }
        return prev;
      });
    } catch (err) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh prices at interval
  const refreshPricesQuiet = useCallback(async () => {
    try {
      await pricesApi.refreshAll();
      const [assetsRes, netWorthRes] = await Promise.all([
        assetsApi.getAll(),
        netWorthApi.getCurrent(),
      ]);
      setAssets(assetsRes.data);
      setNetWorth(netWorthRes.data);
      setLastUpdated(new Date());
      // Append to live history for real-time chart
      setLiveHistory(prev => [
        ...prev,
        { timestamp: new Date().toISOString(), value: netWorthRes.data.total_net_worth }
      ]);
    } catch {
      // Silent fail for auto-refresh
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Set up live polling
  useEffect(() => {
    if (liveEnabled) {
      intervalRef.current = setInterval(refreshPricesQuiet, REFRESH_INTERVAL);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [liveEnabled, refreshPricesQuiet]);

  const handleRefreshPrices = async () => {
    setRefreshing(true);
    try {
      await pricesApi.refreshAll();
      await fetchData();
      toast.success("Prices refreshed");
    } catch (err) {
      toast.error("Failed to refresh prices");
    } finally {
      setRefreshing(false);
    }
  };

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

  const handleAssetUpdated = () => {
    fetchData();
  };

  const handleAssetDeleted = () => {
    fetchData();
  };

  const getAssetValue = (a) => {
    if (a.manual_value !== null && a.manual_value !== undefined) return a.manual_value;
    return (a.quantity || 0) * (a.current_price || 0);
  };

  const filteredAssets = (activeTab === "all" 
    ? assets 
    : assets.filter(a => a.category === activeTab)
  ).sort((a, b) => getAssetValue(b) - getAssetValue(a));

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
            <TabsTrigger value="crypto_projects" data-testid="tab-projects">Projects</TabsTrigger>
            <TabsTrigger value="debts" data-testid="tab-debts">Debts</TabsTrigger>
          </TabsList>
          <TabsContent value={activeTab}>
            <AssetList
              assets={filteredAssets}
              onUpdate={handleAssetUpdated}
              onDelete={handleAssetDeleted}
            />
          </TabsContent>
        </Tabs>
      </div>

      <AddAssetDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCreated={handleAssetCreated}
      />
    </div>
  );
}

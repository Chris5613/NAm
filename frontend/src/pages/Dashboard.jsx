import { useState, useEffect, useCallback } from "react";
import { assetsApi, netWorthApi, pricesApi } from "@/lib/api";
import { toast } from "sonner";
import NetWorthHero from "@/components/NetWorthHero";
import PortfolioChart from "@/components/PortfolioChart";
import NetWorthHistory from "@/components/NetWorthHistory";
import AssetList from "@/components/AssetList";
import AddAssetDialog from "@/components/AddAssetDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Plus, Camera } from "lucide-react";

export default function Dashboard() {
  const [assets, setAssets] = useState([]);
  const [netWorth, setNetWorth] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

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
    } catch (err) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const filteredAssets = activeTab === "all" 
    ? assets 
    : assets.filter(a => a.category === activeTab);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" data-testid="loading-spinner">
        <div className="animate-pulse text-muted-foreground font-mono">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8 space-y-6" data-testid="dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-medium tracking-tight" data-testid="page-title">
          Net Worth
        </h1>
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
      <NetWorthHistory history={history} />

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

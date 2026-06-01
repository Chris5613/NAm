import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { netWorthApi, pricesApi } from "@/lib/api";
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
import { RefreshCw, Plus, Camera } from "lucide-react";

const DAILY_BASELINE_KEY = "daily_net_worth_baseline_pst";
const DAILY_CATEGORY_BASELINE_KEY = "daily_category_baseline_pst";
const MONTHLY_NET_WORTH_HISTORY_KEY = "monthly_net_worth_history_v1";
const LIVE_HISTORY_MAX_POINTS = 200;
const SUPPORTED_TABS = new Set(["all", "stocks", "crypto", "cash", "debts", "other"]);


  const exportAllLocalStorage = () => {
  const backup = {};

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    backup[key] = localStorage.getItem(key);
  }

  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = "dashboard-backup.json";
  a.click();

  URL.revokeObjectURL(url);
};

const importAllLocalStorage = (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (e) => {
    const backup = JSON.parse(e.target.result);

    Object.entries(backup).forEach(([key, value]) => {
      localStorage.setItem(key, value);
    });

    window.location.reload();
  };

  reader.readAsText(file);
};

function getPstDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getMonthKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
  }).format(date);
}

function getMonthLabel(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    year: "numeric",
  }).format(date);
}
function getCategoryDailyChanges(breakdown) {
  const todayKey = getPstDateKey();

  const saved = JSON.parse(
    localStorage.getItem(DAILY_CATEGORY_BASELINE_KEY) || "null"
  );

  if (!saved || saved.dateKey !== todayKey) {
    const baseline = {
      stocks: breakdown?.stocks || 0,
      crypto: breakdown?.crypto || 0,
      cash: breakdown?.cash || 0,
      other: breakdown?.other || 0,
      debts: breakdown?.debts || 0,
    };

    localStorage.setItem(
      DAILY_CATEGORY_BASELINE_KEY,
      JSON.stringify({
        dateKey: todayKey,
        baseline,
      })
    );

    return {
      stocks: 0,
      crypto: 0,
      cash: 0,
      other: 0,
      debts: 0,
    };
  }

  return {
    stocks: (breakdown?.stocks || 0) - (saved.baseline.stocks || 0),
    crypto: (breakdown?.crypto || 0) - (saved.baseline.crypto || 0),
    cash: (breakdown?.cash || 0) - (saved.baseline.cash || 0),
    other: (breakdown?.other || 0) - (saved.baseline.other || 0),
    debts: (breakdown?.debts || 0) - (saved.baseline.debts || 0),
  };
}

function getDailyNetWorthChange(currentNetWorth) {
  const todayKey = getPstDateKey();
  const value = Number(currentNetWorth) || 0;

  if (value <= 0) {
    return {
      baseline: 0,
      change: 0,
      percentChange: 0,
      dateKey: todayKey,
    };
  }

  let saved = null;

  try {
    saved = JSON.parse(localStorage.getItem(DAILY_BASELINE_KEY) || "null");
  } catch {
    saved = null;
  }

  if (!saved || saved.dateKey !== todayKey || Number(saved.baseline) <= 0) {
    localStorage.setItem(
      DAILY_BASELINE_KEY,
      JSON.stringify({
        dateKey: todayKey,
        baseline: value,
      })
    );

    return {
      baseline: value,
      change: 0,
      percentChange: 0,
      dateKey: todayKey,
    };
  }

  const baseline = Number(saved.baseline) || 0;
  const change = value - baseline;
  const percentChange = baseline !== 0 ? (change / baseline) * 100 : 0;

  return {
    baseline,
    change,
    percentChange,
    dateKey: todayKey,
  };
}

function getMonthlyNetWorthHistory(currentNetWorth) {
  const value = Number(currentNetWorth) || 0;
  const monthKey = getMonthKey();
  const monthLabel = getMonthLabel();

  const fallback = [
    { monthKey: "2025-01", month: "Jan 2025", value: 10800 },
    { monthKey: "2025-02", month: "Feb 2025", value: 10700 },
    { monthKey: "2025-03", month: "Mar 2025", value: 9900 },
    { monthKey: "2025-04", month: "Apr 2025", value: 9200 },
    { monthKey: "2025-05", month: "May 2025", value: 10900 },
    { monthKey: "2025-06", month: "Jun 2025", value: 9500 },
    { monthKey: "2025-07", month: "Jul 2025", value: 11600 },
    { monthKey: "2025-08", month: "Aug 2025", value: 13100 },
    { monthKey: "2025-09", month: "Sep 2025", value: 11300 },
    { monthKey: "2025-10", month: "Oct 2025", value: 13700 },
    { monthKey: "2025-11", month: "Nov 2025", value: 13400 },
    { monthKey: "2025-12", month: "Dec 2025", value: 11300 },
    { monthKey: "2026-01", month: "Jan 2026", value: 14200 },
    { monthKey: "2026-02", month: "Feb 2026", value: 15300 },
    { monthKey: "2026-03", month: "Mar 2026", value: 16400 },
    { monthKey: "2026-04", month: "Apr 2026", value: 17244 },
  ];

  let saved = null;

  try {
    saved = JSON.parse(
      localStorage.getItem(MONTHLY_NET_WORTH_HISTORY_KEY) || "null"
    );
  } catch {
    saved = null;
  }

  let history =
    Array.isArray(saved) && saved.length > 0
      ? saved
      : fallback;

  const currentIndex = history.findIndex((m) => m.monthKey === monthKey);

  if (currentIndex >= 0) {
    history[currentIndex] = {
      ...history[currentIndex],
      value,
      live: true,
    };
  } else {
    history.push({
      monthKey,
      month: monthLabel,
      value,
      live: true,
    });
  }

  localStorage.setItem(
    MONTHLY_NET_WORTH_HISTORY_KEY,
    JSON.stringify(history)
  );

  return history;
}

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
  asset.category !== "stocks" && asset.manual_value != null
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
  const [liveHistory, setLiveHistory] = useState(() => {
    const persisted = storage.getLiveHistory();
    return Array.isArray(persisted) ? persisted : [];
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [dailyNetWorthChange, setDailyNetWorthChange] = useState(null);
  const [dailyCategoryChanges, setDailyCategoryChanges] = useState(null);

  useEffect(() => {
    if (!Array.isArray(liveHistory)) return;
    const trimmed = liveHistory.slice(-LIVE_HISTORY_MAX_POINTS);
    storage.setLiveHistory(trimmed);
  }, [liveHistory]);

  const fetchData = useCallback(async () => {
    try {
      const assets = storage.getAssets?.() || [];

      const cryptoCache = storage.getCryptoCache?.() || {};
      const cryptoTotal = Number(cryptoCache.total) || 0;

      const calculatedNetWorth = calculateNetWorth(assets, cryptoTotal);

      const categoryChanges = getCategoryDailyChanges(
        calculatedNetWorth.breakdown
      );

      const monthlyHistory = getMonthlyNetWorthHistory(
        calculatedNetWorth.total_net_worth
      );

      const dailyChange = getDailyNetWorthChange(
        calculatedNetWorth.total_net_worth
      );

      setAssets(assets);
      setNetWorth(calculatedNetWorth);
      setDailyNetWorthChange(dailyChange);
      setDailyCategoryChanges(categoryChanges);
      setHistory(monthlyHistory);
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
      console.error(err);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    const interval = setInterval(() => {
      fetchData();
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
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
      { kind: "cash", total: cashTotal },
      { kind: "other", total: otherTotal },
      { kind: "debts", total: debtsTotal },
    ].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }, [assets, netWorth]);

const handleRefreshPrices = async () => {
  setRefreshing(true);

  try {
    const currentAssets = storage.getAssets?.() || [];
    let updatedCount = 0;

    const nextAssets = await Promise.all(
      currentAssets.map(async (asset) => {
        if (asset.category !== "stocks" || !asset.symbol) {
          return asset;
        }

        try {
          const quote = await pricesApi.getStock(asset.symbol);
          const price = Number(quote?.c || quote?.price || quote?.current_price || 0);

          if (price > 0) {
            updatedCount += 1;

            return {
              ...asset,
              current_price: price,
              manual_value: null,
              updated_at: new Date().toISOString(),
            };
          }

          return asset;
        } catch (error) {
          console.warn(`Failed to refresh ${asset.symbol}:`, error);
          return asset;
        }
      })
    );

    storage.setAssets?.(nextAssets);

    const cryptoCache = storage.getCryptoCache?.() || {};
    const cryptoTotal = Number(cryptoCache.total) || 0;
    const calculatedNetWorth = calculateNetWorth(nextAssets, cryptoTotal);

    setAssets(nextAssets);
    setNetWorth(calculatedNetWorth);
    setDailyNetWorthChange(getDailyNetWorthChange(calculatedNetWorth.total_net_worth));
    setDailyCategoryChanges(getCategoryDailyChanges(calculatedNetWorth.breakdown));
    setHistory(getMonthlyNetWorthHistory(calculatedNetWorth.total_net_worth));
    setLastUpdated(new Date());

    toast.success(`Refreshed ${updatedCount} stock price${updatedCount === 1 ? "" : "s"}`);
  } catch (error) {
    console.error("Failed to refresh stock prices:", error);
    toast.error("Failed to refresh stock prices");
  } finally {
    setRefreshing(false);
  }
};

  if (loading) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        data-testid="loading-spinner"
      >
        <div className="animate-pulse text-muted-foreground font-mono">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="dashboard">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1
            className="text-4xl font-medium tracking-tight"
            data-testid="page-title"
          >
            Net Worth
          </h1>

          {lastUpdated && (
            <span
              className="text-xs text-muted-foreground font-mono"
              data-testid="last-updated"
            >
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
  <button
    type="button"
    onClick={exportAllLocalStorage}
    className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-black hover:bg-cyan-400"
  >
    Export JSON
  </button>

  <label className="cursor-pointer rounded-lg bg-violet-500 px-4 py-2 text-sm font-bold text-white hover:bg-violet-400">
    Import JSON
    <input
      type="file"
      accept=".json,application/json"
      onChange={importAllLocalStorage}
      className="hidden"
    />
  </label>
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
            <RefreshCw
              className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
              strokeWidth={1.5}
            />
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

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <div className="md:col-span-2 lg:col-span-2">
          <NetWorthHero
            netWorth={netWorth}
            dailyNetWorthChange={dailyNetWorthChange}
          />
        </div>

        <div className="md:col-span-1 lg:col-span-2">
          <PortfolioChart netWorth={netWorth} />
        </div>
      </div>

      <NetWorthHistory history={history} />

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
              <CryptoBreakdown
                key="all-crypto"
                defaultOpen={false}
                dailyChange={dailyCategoryChanges?.crypto || 0}
              />
            )}

            {activeTab === "stocks" && (
              <AssetBreakdown
                category="stocks"
                assets={assets}
                onUpdate={handleAssetUpdated}
                onDelete={handleAssetDeleted}
                defaultOpen={true}
              />
            )}

            {activeTab === "cash" && (
              <AssetBreakdown
                category="cash"
                assets={assets}
                onUpdate={handleAssetUpdated}
                onDelete={handleAssetDeleted}
                defaultOpen={true}
              />
            )}

            {activeTab === "debts" && (
              <AssetBreakdown
                category="debts"
                assets={assets}
                onUpdate={handleAssetUpdated}
                onDelete={handleAssetDeleted}
                defaultOpen={true}
              />
            )}

            {activeTab === "other" && (
              <AssetBreakdown
                category="other"
                assets={assets}
                onUpdate={handleAssetUpdated}
                onDelete={handleAssetDeleted}
                defaultOpen={true}
              />
            )}

            {activeTab === "all" && (
              <div className="space-y-4">
                {sortedAllSections.map((section) => {
                  switch (section.kind) {
                    case "crypto":
                      return (
                        <CryptoBreakdown
                          key="crypto"
                          defaultOpen={false}
                          dailyChange={dailyCategoryChanges?.crypto || 0}
                        />
                      );

                    default:
                      return (
                        <AssetBreakdown
                          key={`all-${section.kind}`}
                          category={section.kind}
                          assets={assets}
                          onUpdate={handleAssetUpdated}
                          onDelete={handleAssetDeleted}
                          defaultOpen={false}
                          dailyChange={dailyCategoryChanges?.[section.kind] || 0}
                        />
                      );
                  }
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
        defaultCategory={
          SUPPORTED_TABS.has(activeTab) && activeTab !== "all"
            ? activeTab
            : "stocks"
        }
      />
    </div>
  );
}
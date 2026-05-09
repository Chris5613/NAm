import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import {
  Wallet,
  TrendingUp,
  Calendar,
  BarChart3,
  RefreshCw,
  Search,
} from "lucide-react";

export default function UnityDevicesPage() {
  const [devices, setDevices] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [lastSync, setLastSync] = useState(null);

  const [chartType, setChartType] = useState("bar");
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;

      const data = event.data;

      if (!data || data.source !== "unity-nodes-tracker-ext") return;

      if (data.type === "EARNINGS_PUSH_MULTI") {
        const payload = data.payload || {};

        setDevices(Array.isArray(payload.devices) ? payload.devices : []);
        setAccounts(Array.isArray(payload.accounts) ? payload.accounts : []);

        setLastSync(new Date());
        setSyncing(false);
      }
    };

    window.addEventListener("message", handleMessage);

    window.postMessage(
      {
        source: "unity-nodes-tracker-app",
        type: "REQUEST_LATEST",
      },
      window.location.origin
    );

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const syncExtension = async () => {
    try {
      setSyncing(true);

      window.postMessage(
        {
          source: "unity-nodes-tracker-app",
          type: "REQUEST_LATEST",
        },
        window.location.origin
      );

      setTimeout(() => {
        setSyncing(false);
      }, 2500);
    } catch (err) {
      console.error(err);
      setSyncing(false);
    }
  };

  const formatUsd = (value) => {
    const num = Number(value || 0);

    return num.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const shortId = (id) => {
    if (!id) return "Unknown";

    const str = String(id);

    if (str.length <= 14) return str;

    return `${str.slice(0, 6)}...${str.slice(-4)}`;
  };

  const filteredDevices = useMemo(() => {
    return devices
      .filter((device) => {
        const id = String(
          device.license_id || device.device_id || device.id || ""
        );

        const account = String(
          device.account || device.account_name || device.wallet || ""
        );

        const query = search.toLowerCase();

        return (
          id.toLowerCase().includes(query) ||
          account.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => Number(b.amount_usd || 0) - Number(a.amount_usd || 0));
  }, [devices, search]);

  const totalRecent = useMemo(() => {
    return devices.reduce(
      (sum, device) => sum + Number(device.amount_usd || 0),
      0
    );
  }, [devices]);

  const lifetimeTotal = useMemo(() => {
    return devices.reduce((sum, device) => {
      return (
        sum +
        Number(
          device.lifetime_usd ||
            device.total_usd ||
            device.lifetime_earnings_usd ||
            device.amount_usd ||
            0
        )
      );
    }, 0);
  }, [devices]);

  const totalAllocations = useMemo(() => {
    return devices.reduce(
      (sum, device) => sum + Number(device.allocation_count || 0),
      0
    );
  }, [devices]);

  const chartData = useMemo(() => {
    const dailyMap = new Map();

    devices.forEach((device) => {
      const history =
        device.history ||
        device.daily_earnings ||
        device.earnings_by_day ||
        device.daily ||
        [];

      if (!Array.isArray(history)) return;

      history.forEach((item) => {
        const rawDate =
          item.date || item.day || item.created_at || item.timestamp;

        const amount = Number(
          item.amount_usd ||
            item.earnings_usd ||
            item.usd ||
            item.amount ||
            0
        );

        if (!rawDate || Number.isNaN(amount)) return;

        const dateObj = new Date(rawDate);

        if (Number.isNaN(dateObj.getTime())) return;

        const dateKey = dateObj.toISOString().slice(0, 10);

        const label = dateObj.toLocaleDateString("en-US", {
          month: "numeric",
          day: "numeric",
        });

        const existing = dailyMap.get(dateKey);

        if (existing) {
          existing.earnings += amount;
        } else {
          dailyMap.set(dateKey, {
            dateKey,
            date: label,
            earnings: amount,
          });
        }
      });
    });

    return Array.from(dailyMap.values())
      .sort((a, b) => new Date(a.dateKey) - new Date(b.dateKey))
      .slice(-7)
      .map((row) => ({
        date: row.date,
        earnings: Number(row.earnings.toFixed(2)),
      }));
  }, [devices]);

  const sevenDayTotal = useMemo(() => {
    return chartData.reduce(
      (sum, row) => sum + Number(row.earnings || 0),
      0
    );
  }, [chartData]);

  const sevenDayAverage =
    chartData.length > 0 ? sevenDayTotal / chartData.length : 0;

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;

    return (
      <div className="rounded-lg border border-[#333] bg-[#111] px-3 py-2 shadow-xl">
        <p className="text-xs text-gray-400">{label}</p>

        <p className="text-sm font-semibold text-orange-400">
          {formatUsd(payload[0].value)}
        </p>
      </div>
    );
  };

  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 20, right: 20, left: 0, bottom: 5 },
    };

    if (chartType === "line") {
      return (
        <LineChart {...commonProps}>
          <CartesianGrid stroke="#1f2937" vertical={false} />

          <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />

          <YAxis
            stroke="#6b7280"
            fontSize={12}
            tickFormatter={(value) => `$${value}`}
          />

          <Tooltip content={<CustomTooltip />} />

          <Line
            type="monotone"
            dataKey="earnings"
            stroke="#f97316"
            strokeWidth={2}
            dot={{ r: 4, fill: "#f97316" }}
          />
        </LineChart>
      );
    }

    if (chartType === "area") {
      return (
        <AreaChart {...commonProps}>
          <defs>
            <linearGradient id="unityArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f97316" stopOpacity={0.55} />
              <stop offset="95%" stopColor="#f97316" stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="#1f2937" vertical={false} />

          <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />

          <YAxis
            stroke="#6b7280"
            fontSize={12}
            tickFormatter={(value) => `$${value}`}
          />

          <Tooltip content={<CustomTooltip />} />

          <Area
            type="monotone"
            dataKey="earnings"
            stroke="#f97316"
            fill="url(#unityArea)"
            strokeWidth={2}
          />
        </AreaChart>
      );
    }

    return (
      <BarChart {...commonProps}>
        <defs>
          <linearGradient id="unityBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f97316" stopOpacity={0.75} />
            <stop offset="100%" stopColor="#7c2d12" stopOpacity={0.25} />
          </linearGradient>
        </defs>

        <CartesianGrid stroke="#1f2937" vertical={false} />

        <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />

        <YAxis
          stroke="#6b7280"
          fontSize={12}
          tickFormatter={(value) => `$${value}`}
        />

        <Tooltip content={<CustomTooltip />} />

        <Bar
          dataKey="earnings"
          fill="url(#unityBar)"
          stroke="#f97316"
          radius={[6, 6, 0, 0]}
        />
      </BarChart>
    );
  };

  return (
    <div className="min-h-screen bg-[#070b12] p-6 text-white">
      <div className="mx-auto max-w-7xl space-y-5">

        {/* HEADER */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">Unity Devices</h1>

              <span className="inline-flex items-center gap-1 rounded bg-violet-500/10 px-2 py-1 text-[10px] font-mono text-violet-400">
                <span className="h-2 w-2 rounded-full bg-violet-400" />
                extension sync
              </span>

              {lastSync && (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-1 text-[10px] font-mono text-emerald-400">
                  synced {lastSync.toLocaleTimeString()}
                </span>
              )}
            </div>

            <p className="mt-1 text-sm text-gray-400">
              Overview of all your Unity Network devices and earnings
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={syncExtension}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-300 transition hover:bg-violet-500/20 hover:text-violet-200 disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={syncing ? "animate-spin" : ""}
              />

              {syncing ? "Syncing..." : "Sync from extension"}
            </button>
          </div>
        </div>

        {/* TOP CARDS */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard
            title="Balance"
            value={formatUsd(totalRecent)}
            subText="Current synced balance"
            icon={<Wallet size={22} />}
            accent="orange"
            showBar
          />

          <StatCard
            title="Lifetime"
            value={formatUsd(lifetimeTotal)}
            subText="Total earnings"
            icon={<TrendingUp size={22} />}
            accent="yellow"
          />

          <StatCard
            title="Recent"
            value={formatUsd(totalRecent)}
            subText={`${totalAllocations} payouts`}
            icon={<Calendar size={22} />}
            accent="green"
          />

          <StatCard
            title="7-Day Avg"
            value={`${formatUsd(sevenDayAverage)}/d`}
            subText="From extension history"
            icon={<BarChart3 size={22} />}
            accent="orange"
          />
        </div>

        {/* CHART */}
        <section className="rounded-xl border border-[#1f2937] bg-[#0b111c] p-4 shadow-xl">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-300">
                Earnings Over Time
              </h2>

              <div className="mt-4 flex gap-2">
                {["bar", "line", "area"].map((type) => (
                  <button
                    key={type}
                    onClick={() => setChartType(type)}
                    className={`rounded-md border px-4 py-2 text-sm capitalize ${
                      chartType === type
                        ? "border-orange-500 bg-orange-500/10 text-orange-400"
                        : "border-[#263041] bg-[#0d1420] text-gray-300 hover:bg-[#131c2b]"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="h-[320px]">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                Waiting for earnings history from extension...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                {renderChart()}
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* DEVICE TABLE */}
        <section className="overflow-hidden rounded-xl border border-[#1f2937] bg-[#0b111c] shadow-xl">
          <div className="flex flex-col gap-3 border-b border-[#1f2937] p-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-300">
              Devices ({filteredDevices.length})
            </h2>

            <div className="relative">
              <Search
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
              />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search devices..."
                className="w-full rounded-lg border border-[#263041] bg-[#0d1420] px-3 py-2 pr-9 text-sm text-gray-200 outline-none placeholder:text-gray-500 sm:w-64"
              />
            </div>
          </div>

          {filteredDevices.length === 0 ? (
            <div className="p-6 text-sm text-gray-400">
              No device data found yet. Click Sync from extension.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-[#111827] text-xs uppercase tracking-wider text-gray-400">
                  <tr>
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">Device ID</th>
                    <th className="px-4 py-3 text-left">Account</th>
                    <th className="px-4 py-3 text-left">Recent</th>
                    <th className="px-4 py-3 text-left">Lifetime</th>
                    <th className="px-4 py-3 text-left">Allocations</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredDevices.map((device, index) => {
                    const id =
                      device.license_id || device.device_id || device.id;

                    const account =
                      device.account ||
                      device.account_name ||
                      device.wallet ||
                      accounts[index]?.wallet ||
                      "Unknown";

                    const lifetime =
                      device.lifetime_usd ||
                      device.total_usd ||
                      device.lifetime_earnings_usd ||
                      device.amount_usd ||
                      0;

                    return (
                      <tr
                        key={`${id || index}`}
                        className="border-t border-[#1f2937] text-gray-300 hover:bg-[#111827]"
                      >
                        <td className="px-4 py-3 text-gray-400">
                          {index + 1}
                        </td>

                        <td className="px-4 py-3 font-mono">
                          <div>{shortId(id)}</div>

                          <div className="text-xs text-gray-600">
                            {id || "No ID"}
                          </div>
                        </td>

                        <td className="px-4 py-3 font-mono text-gray-400">
                          {shortId(account)}
                        </td>

                        <td className="px-4 py-3 font-semibold text-white">
                          {formatUsd(device.amount_usd)}
                        </td>

                        <td className="px-4 py-3">
                          {formatUsd(lifetime)}
                        </td>

                        <td className="px-4 py-3">
                          {device.allocation_count ?? 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  subText,
  icon,
  accent = "orange",
  showBar = false,
}) {
  const colors = {
    orange: {
      border: "border-orange-500/50",
      text: "text-orange-400",
      bg: "bg-orange-500/10",
      bar: "bg-orange-500",
    },

    yellow: {
      border: "border-yellow-500/50",
      text: "text-yellow-400",
      bg: "bg-yellow-500/10",
      bar: "bg-yellow-500",
    },

    green: {
      border: "border-green-500/50",
      text: "text-green-400",
      bg: "bg-green-500/10",
      bar: "bg-green-500",
    },
  };

  const color = colors[accent] || colors.orange;

  return (
    <div
      className={`rounded-xl border ${color.border} bg-[#0b111c] p-5 shadow-xl`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gray-400">
            {title}
          </p>

          <p className={`mt-4 text-3xl font-bold ${color.text}`}>
            {value}
          </p>
        </div>

        <div
          className={`rounded-lg border ${color.border} ${color.bg} p-3 ${color.text}`}
        >
          {icon}
        </div>
      </div>

      {showBar && (
        <div className="mt-5">
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-semibold text-white">100%</span>
          </div>

          <div className="h-2 rounded-full bg-[#1f2937]">
            <div className={`h-2 w-full rounded-full ${color.bar}`} />
          </div>
        </div>
      )}

      <p className="mt-4 text-sm text-gray-400">{subText}</p>
    </div>
  );
}
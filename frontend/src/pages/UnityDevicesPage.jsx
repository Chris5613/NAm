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
  Search,
  Zap,
  Eye,
  EyeOff,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { syncFromExtensionNow } from "@/lib/unityNetworkExtensionSync";

const DEVICE_LABELS_KEY = "unity_device_labels";
const HIDDEN_DEVICES_KEY = "unity_hidden_devices";
const DEVICE_LEASES_KEY = "unity_device_leases";

function getStoredJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function setStoredJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export default function UnityDevicesPage() {
  const [devices, setDevices] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [chartType, setChartType] = useState("bar");
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const [deviceLabels, setDeviceLabels] = useState(() =>
    getStoredJson(DEVICE_LABELS_KEY, {})
  );

  const [hiddenDevices, setHiddenDevices] = useState(() =>
    getStoredJson(HIDDEN_DEVICES_KEY, {})
  );

  const [deviceLeases, setDeviceLeases] = useState(() =>
    getStoredJson(DEVICE_LEASES_KEY, {})
  );

  const [editingDeviceId, setEditingDeviceId] = useState(null);
  const [editingLabel, setEditingLabel] = useState("");

  const getDeviceId = (device) =>
    String(device.license_id || device.device_id || device.id || "unknown");

  const normalizePayload = (payload = {}) => {
    const accountList = Array.isArray(payload.accounts) ? payload.accounts : [];

    let deviceList = [];

    if (Array.isArray(payload.devices)) {
      deviceList = payload.devices;
    } else if (Array.isArray(payload.combined_payload?.devices)) {
      deviceList = payload.combined_payload.devices;
    } else if (accountList.length > 0) {
      deviceList = accountList.flatMap((account) =>
        Array.isArray(account.devices)
          ? account.devices.map((device) => ({
              ...device,
              account_id: account.account_id,
              account_label: account.account_label,
              account_email: account.email,
            }))
          : []
      );
    }

    return {
      devices: deviceList,
      accounts: accountList,
      summary: payload.combined_payload || payload,
    };
  };

  const applyPayload = (payload) => {
    const normalized = normalizePayload(payload);

    setDevices(normalized.devices);
    setAccounts(normalized.accounts);
    setSummary(normalized.summary);
    setLastSync(new Date());
    setSyncing(false);
  };

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;

      const data = event.data;
      if (!data || data.source !== "unity-nodes-tracker-ext") return;

      if (data.type === "EARNINGS_PUSH_MULTI" || data.type === "EARNINGS_PUSH") {
        applyPayload(data.payload || {});
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

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const syncExtension = async () => {
    setSyncing(true);

    try {
      const result = await syncFromExtensionNow({
        allowAutoConfigure: true,
        timeoutMs: 5000,
      });

      window.postMessage(
        {
          source: "unity-nodes-tracker-app",
          type: "REQUEST_LATEST",
        },
        window.location.origin
      );

      if (!result?.ok) {
        toast.error(result?.error || "Extension sync failed.");
      } else {
        toast.success("Synced from extension.");
      }
    } catch (err) {
      toast.error(err?.message || "Extension sync failed.");
    } finally {
      setTimeout(() => setSyncing(false), 1000);
    }
  };

  const getTodayKey = () => {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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

  const saveDeviceLabel = (deviceId) => {
    const cleanLabel = editingLabel.trim();

    const next = {
      ...deviceLabels,
      [deviceId]: cleanLabel,
    };

    if (!cleanLabel) {
      delete next[deviceId];
    }

    setDeviceLabels(next);
    setStoredJson(DEVICE_LABELS_KEY, next);
    setEditingDeviceId(null);
    setEditingLabel("");
  };

  const saveDeviceLease = (deviceId, value) => {
    const next = {
      ...deviceLeases,
      [deviceId]: value.trim(),
    };

    if (!value.trim()) {
      delete next[deviceId];
    }

    setDeviceLeases(next);
    setStoredJson(DEVICE_LEASES_KEY, next);
  };

  const startEditLabel = (device) => {
    const deviceId = getDeviceId(device);
    setEditingDeviceId(deviceId);
    setEditingLabel(deviceLabels[deviceId] || "");
  };

  const cancelEditLabel = () => {
    setEditingDeviceId(null);
    setEditingLabel("");
  };

  const toggleHideDevice = (device) => {
    const deviceId = getDeviceId(device);

    const next = {
      ...hiddenDevices,
      [deviceId]: !hiddenDevices[deviceId],
    };

    if (!next[deviceId]) {
      delete next[deviceId];
    }

    setHiddenDevices(next);
    setStoredJson(HIDDEN_DEVICES_KEY, next);
  };

  const getDeviceLabel = (device) => {
    const deviceId = getDeviceId(device);
    return String(deviceLabels[deviceId] || "").trim();
  };

  const getDeviceGroup = (device) => {
    const label = getDeviceLabel(device);
    const lowerLabel = label.toLowerCase();

    if (!label) return "Other";
    if (lowerLabel.includes("iphone")) return "iPhones";

    return "Androids";
  };

  const visibleDevices = useMemo(() => {
    return devices.filter((device) => {
      const deviceId = getDeviceId(device);
      return showHidden || !hiddenDevices[deviceId];
    });
  }, [devices, hiddenDevices, showHidden]);

  const filteredDevices = useMemo(() => {
    return visibleDevices
      .filter((device) => {
        const deviceId = getDeviceId(device);
        const label = String(deviceLabels[deviceId] || "");
        const lease = String(deviceLeases[deviceId] || "");

        const account = String(
          device.account_email ||
            device.account_label ||
            device.account ||
            device.wallet ||
            ""
        );

        const group = getDeviceGroup(device);
        const query = search.toLowerCase();

        return (
          deviceId.toLowerCase().includes(query) ||
          label.toLowerCase().includes(query) ||
          lease.toLowerCase().includes(query) ||
          account.toLowerCase().includes(query) ||
          group.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => Number(b.amount_usd || 0) - Number(a.amount_usd || 0));
  }, [visibleDevices, search, deviceLabels, deviceLeases]);

  const balanceUsd = Number(summary?.balance_usd || 0);
  const lifetimeUsd = Number(summary?.lifetime_usd || 0);
const todayUsd = useMemo(() => {
  const todayKey = getTodayKey();

  const dailyRows =
    Array.isArray(summary?.daily_earnings)
      ? summary.daily_earnings
      : Array.isArray(summary?.combined_payload?.daily_earnings)
        ? summary.combined_payload.daily_earnings
        : [];

  const directToday = dailyRows.reduce((sum, row) => {
    const rowDate = row.date || row.day;

    if (rowDate !== todayKey) return sum;

    return (
      sum +
      Number(
        row.earnings_usd ||
          row.amount_usd ||
          row.total_usd ||
          row.amount ||
          0
      )
    );
  }, 0);

  if (directToday > 0) return directToday;

  return devices.reduce((sum, device) => {
    return sum + Number(device.amount_usd || 0);
  }, 0);
}, [summary, devices]);  

  const chartData = useMemo(() => {
    let rows = [];

    if (Array.isArray(summary?.daily_earnings) && summary.daily_earnings.length > 0) {
      rows = summary.daily_earnings;
    } else if (
      Array.isArray(summary?.combined_payload?.daily_earnings) &&
      summary.combined_payload.daily_earnings.length > 0
    ) {
      rows = summary.combined_payload.daily_earnings;
    } else {
      const accountMap = new Map();

      accounts.forEach((account) => {
        (account.daily_earnings || []).forEach((row) => {
          const date = row.date || row.day;
          if (!date) return;

          const amount = Number(row.earnings_usd || row.amount_usd || 0);

          if (!accountMap.has(date)) {
            accountMap.set(date, {
              date,
              earnings_usd: 0,
            });
          }

          accountMap.get(date).earnings_usd += amount;
        });
      });

      rows = Array.from(accountMap.values());
    }

    return rows
      .map((row) => {
        const dateKey = row.date || row.day;
        const amount = Number(row.earnings_usd || row.amount_usd || 0);

        if (!dateKey || Number.isNaN(amount)) return null;

        const dateObj = new Date(`${dateKey}T00:00:00`);

        if (Number.isNaN(dateObj.getTime())) return null;

        return {
          dateKey,
          date: dateObj.toLocaleDateString("en-US", {
            month: "numeric",
            day: "numeric",
          }),
          earnings: Number(amount.toFixed(2)),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .slice(-14);
  }, [summary, accounts]);

  const sevenDayTotal = chartData
    .slice(-7)
    .reduce((sum, row) => sum + Number(row.earnings || 0), 0);

  const sevenDayAverage = chartData.length > 0 ? sevenDayTotal / 7 : 0;

  const iphoneDevices = filteredDevices.filter(
    (device) => getDeviceGroup(device) === "iPhones"
  );

  const androidDevices = filteredDevices.filter(
    (device) => getDeviceGroup(device) === "Androids"
  );

  const otherDevices = filteredDevices.filter(
    (device) => getDeviceGroup(device) === "Other"
  );

  const renderDeviceTable = (title, deviceList) => (
    <section className="overflow-hidden rounded-xl border border-[#1f2937] bg-[#0b111c] shadow-xl">
      <div className="flex items-center justify-between border-b border-[#1f2937] p-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-300">
          {title} ({deviceList.length})
        </h2>
      </div>

      {deviceList.length === 0 ? (
        <div className="p-6 text-sm text-gray-400">
          No {title.toLowerCase()} found.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="bg-[#111827] text-xs uppercase tracking-wider text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Label</th>
                <th className="px-4 py-3 text-left">Device ID</th>
                <th className="px-4 py-3 text-left">Lease</th>
                <th className="px-4 py-3 text-left">Section</th>
                <th className="px-4 py-3 text-left">Recent</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>

            <tbody>
              {deviceList.map((device, index) => {
                const deviceId = getDeviceId(device);
                const hidden = !!hiddenDevices[deviceId];
                const section = getDeviceGroup(device);

                return (
                  <tr
                    key={`${title}-${deviceId || index}`}
                    className={`border-t border-[#1f2937] text-gray-300 hover:bg-[#111827] ${
                      hidden ? "opacity-45" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-gray-400">{index + 1}</td>

                    <td className="px-4 py-3">
                      {editingDeviceId === deviceId ? (
                        <div className="flex items-center gap-2">
                          <input
                            value={editingLabel}
                            onChange={(event) =>
                              setEditingLabel(event.target.value)
                            }
                            placeholder="ex: iPhone 15 or Android 1"
                            className="w-44 rounded-md border border-[#263041] bg-[#0d1420] px-2 py-1 text-xs text-gray-200 outline-none"
                            autoFocus
                          />

                          <button
                            onClick={() => saveDeviceLabel(deviceId)}
                            className="text-emerald-400 hover:text-emerald-300"
                            title="Save label"
                          >
                            <Save size={15} />
                          </button>

                          <button
                            onClick={cancelEditLabel}
                            className="text-gray-500 hover:text-gray-300"
                            title="Cancel"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">
                            {deviceLabels[deviceId] || "Unlabeled"}
                          </span>

                          <button
                            onClick={() => startEditLabel(device)}
                            className="text-gray-500 hover:text-violet-300"
                            title="Edit label"
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 font-mono">
                      {shortId(deviceId)}
                    </td>

                    <td className="px-4 py-3">
                      <input
                        value={deviceLeases[deviceId] || ""}
                        onChange={(event) =>
                          saveDeviceLease(deviceId, event.target.value)
                        }
                        placeholder="Add lease"
                        className="w-32 border-0 border-b border-transparent bg-transparent px-0 py-1 text-sm text-gray-200 outline-none placeholder:text-gray-600 hover:border-gray-600 focus:border-violet-400"
                      />
                    </td>

                    <td className="px-4 py-3 font-medium text-gray-300">
                      {section}
                    </td>

                    <td className="px-4 py-3 font-semibold text-white">
                      {formatUsd(device.amount_usd)}
                    </td>

                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleHideDevice(device)}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                          hidden
                            ? "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                            : "border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
                        }`}
                      >
                        {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                        {hidden ? "Unhide" : "Hide"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
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

          <Button
            variant="outline"
            size="sm"
            onClick={syncExtension}
            disabled={syncing}
            className="border-violet-500/40 text-violet-300 hover:bg-violet-500/10 hover:text-violet-200 disabled:opacity-50"
          >
            <Zap className={`mr-2 h-4 w-4 ${syncing ? "animate-pulse" : ""}`} />
            {syncing ? "Syncing…" : "Sync from extension"}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard
            title="Balance"
            value={formatUsd(balanceUsd)}
            subText="Current synced balance"
            icon={<Wallet size={22} />}
            accent="orange"
            showBar
          />

          <StatCard
            title="Lifetime"
            value={formatUsd(lifetimeUsd)}
            subText="Total earnings"
            icon={<TrendingUp size={22} />}
            accent="yellow"
          />

<StatCard
  title="Today"
  value={formatUsd(todayUsd)}
  subText="Today’s synced earnings"
  icon={<Calendar size={22} />}
  accent="green"
/>

          <StatCard
            title="7-Day Avg"
            value={`${formatUsd(sevenDayAverage)}/d`}
            subText="From daily earnings"
            icon={<BarChart3 size={22} />}
            accent="orange"
          />
        </div>

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

            <div className="text-xs text-gray-500">
              {chartData.length > 0
                ? "Using one daily source only"
                : "Waiting for daily earnings history"}
            </div>
          </div>

          <div className="h-[320px]">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                No day-by-day earnings history found yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                {renderChart()}
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[#1f2937] bg-[#0b111c] shadow-xl">
          <div className="flex flex-col gap-3 border-b border-[#1f2937] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-300">
                Devices ({filteredDevices.length})
              </h2>

              <button
                onClick={() => setShowHidden((value) => !value)}
                className="inline-flex items-center gap-1 rounded-md border border-[#263041] bg-[#0d1420] px-2 py-1 text-xs text-gray-300 hover:bg-[#131c2b]"
              >
                {showHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                {showHidden ? "Hide hidden" : "Show hidden"}
              </button>
            </div>

            <div className="relative">
              <Search
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
              />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search devices, labels, leases, sections..."
                className="w-full rounded-lg border border-[#263041] bg-[#0d1420] px-3 py-2 pr-9 text-sm text-gray-200 outline-none placeholder:text-gray-500 sm:w-64"
              />
            </div>
          </div>

          {filteredDevices.length === 0 && (
            <div className="p-6 text-sm text-gray-400">
              No device data found yet. Click Sync from extension.
            </div>
          )}
        </section>

        <div className="space-y-5">
          {renderDeviceTable("iPhones", iphoneDevices)}
          {renderDeviceTable("Androids", androidDevices)}
          {renderDeviceTable("Other", otherDevices)}
        </div>
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
          <p className={`mt-4 text-3xl font-bold ${color.text}`}>{value}</p>
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
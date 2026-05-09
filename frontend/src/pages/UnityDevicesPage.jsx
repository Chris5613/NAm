import React, { useEffect, useMemo, useState } from "react";

export default function UnityDevicesPage() {
  const [devices, setDevices] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [lastSync, setLastSync] = useState(null);

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

  const totalEarnings = useMemo(() => {
    return devices.reduce((sum, device) => {
      return sum + Number(device.amount_usd || 0);
    }, 0);
  }, [devices]);

  const totalAllocations = useMemo(() => {
    return devices.reduce((sum, device) => {
      return sum + Number(device.allocation_count || 0);
    }, 0);
  }, [devices]);

  const formatUsd = (value) => {
    const num = Number(value || 0);

    return num.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  };

  const shortId = (id) => {
    if (!id) return "Unknown";
    const str = String(id);
    if (str.length <= 12) return str;
    return `${str.slice(0, 6)}...${str.slice(-4)}`;
  };

  const getAccountName = (device) => {
    if (device.account_name) return device.account_name;
    if (device.account) return device.account;
    if (device.wallet) return shortId(device.wallet);
    return "Unknown Account";
  };

  const refreshData = () => {
    window.postMessage(
      {
        source: "unity-nodes-tracker-app",
        type: "REQUEST_LATEST",
      },
      window.location.origin
    );
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Unity Devices</h1>
            <p className="text-sm text-gray-400">
              Device earnings synced from your Unity Network extension.
            </p>
          </div>

          <button
            onClick={refreshData}
            className="rounded-xl bg-[#222] border border-[#333] px-4 py-2 text-sm hover:bg-[#2b2b2b]"
          >
            Refresh Data
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl bg-[#151515] border border-[#2a2a2a] p-4">
            <p className="text-sm text-gray-400">Total Devices</p>
            <p className="text-2xl font-bold">{devices.length}</p>
          </div>

          <div className="rounded-2xl bg-[#151515] border border-[#2a2a2a] p-4">
            <p className="text-sm text-gray-400">Total Earnings</p>
            <p className="text-2xl font-bold">{formatUsd(totalEarnings)}</p>
          </div>

          <div className="rounded-2xl bg-[#151515] border border-[#2a2a2a] p-4">
            <p className="text-sm text-gray-400">Total Allocations</p>
            <p className="text-2xl font-bold">{totalAllocations}</p>
          </div>
        </div>

        <div className="rounded-2xl bg-[#151515] border border-[#2a2a2a] overflow-hidden">
          <div className="p-4 border-b border-[#2a2a2a] flex items-center justify-between">
            <h2 className="font-semibold">Device Earnings</h2>
            <p className="text-xs text-gray-500">
              Last sync: {lastSync ? lastSync.toLocaleTimeString() : "Waiting for extension"}
            </p>
          </div>

          {devices.length === 0 ? (
            <div className="p-6 text-sm text-gray-400">
              No device data found yet. Make sure the Unity Network extension is running,
              then click Refresh Data.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#111] text-gray-400">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Device</th>
                    <th className="text-left px-4 py-3 font-medium">Account</th>
                    <th className="text-right px-4 py-3 font-medium">Earnings</th>
                    <th className="text-right px-4 py-3 font-medium">Allocations</th>
                  </tr>
                </thead>

                <tbody>
                  {devices
                    .slice()
                    .sort((a, b) => Number(b.amount_usd || 0) - Number(a.amount_usd || 0))
                    .map((device, index) => (
                      <tr
                        key={`${device.license_id || device.device_id || index}`}
                        className="border-t border-[#242424] hover:bg-[#1b1b1b]"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium">
                            {shortId(device.license_id || device.device_id || device.id)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {device.license_id || device.device_id || device.id || "No ID"}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-gray-300">
                          {getAccountName(device)}
                        </td>

                        <td className="px-4 py-3 text-right font-semibold">
                          {formatUsd(device.amount_usd)}
                        </td>

                        <td className="px-4 py-3 text-right text-gray-300">
                          {device.allocation_count ?? 0}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {accounts.length > 0 && (
          <div className="rounded-2xl bg-[#151515] border border-[#2a2a2a] p-4">
            <h2 className="font-semibold mb-3">Synced Accounts</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {accounts.map((account, index) => (
                <div
                  key={account.wallet || account.account || index}
                  className="rounded-xl bg-[#111] border border-[#2a2a2a] p-3"
                >
                  <p className="text-sm font-medium">
                    {account.name || account.account || `Account ${index + 1}`}
                  </p>
                  <p className="text-xs text-gray-500">
                    {account.wallet ? shortId(account.wallet) : "No wallet"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
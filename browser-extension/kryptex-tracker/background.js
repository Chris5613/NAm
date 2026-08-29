// Background service worker — the only part of the extension with
// host_permissions for Kryptex's local service, so it's the only part that
// can reach it without CORS/mixed-content restrictions. Polls once a minute
// and caches the summary in chrome.storage.local for the content script.
const KRYPTEX_BASE = "http://127.0.0.1:8107";
const STORAGE_KEY = "kryptex_latest";
const POLL_ALARM = "kryptex-poll";

function summarize(balance, devices) {
  const miners = [];
  for (const entry of devices || []) {
    const device = entry?.device || {};
    const process = entry?.process || {};
    const combination = process.algorithm_combination || {};
    for (const algorithm of combination.algorithms || []) {
      const reading = algorithm.reading || {};
      miners.push({
        device: device.name || device.model || device.id || "Device",
        device_type: device.type || "",
        miner: process.miner_version?.miner?.name || "Miner",
        coin: algorithm.coin || "",
        algorithm: algorithm.algorithm || "",
        hashrate: Number(reading.hashrate) || 0,
        profitability_usd_day: Number(reading.profitability) || 0,
        accepted_shares: Number(reading.shares?.accepted) || 0,
        rejected_shares: Number(reading.shares?.rejected) || 0,
        temperature_c: Number(entry?.reading?.core_temperature) || null,
        power_w: Number(entry?.reading?.power_usage) || null,
        fan_percent: Number(entry?.reading?.fan_speed) || null,
        state: entry?.state?.state || "unknown",
      });
    }
  }
  miners.sort((a, b) => b.profitability_usd_day - a.profitability_usd_day);
  return {
    balance_usd: Number(balance?.total) || 0,
    withdrawable_usd: Number(balance?.withdrawable) || 0,
    profitability_usd_day: miners.reduce((sum, m) => sum + m.profitability_usd_day, 0),
    miners,
  };
}

async function pollKryptex() {
  try {
    const [balanceRes, devicesRes] = await Promise.all([
      fetch(`${KRYPTEX_BASE}/balance`),
      fetch(`${KRYPTEX_BASE}/devices`),
    ]);
    if (!balanceRes.ok || !devicesRes.ok) throw new Error("Kryptex not reachable");
    const status = summarize(await balanceRes.json(), await devicesRes.json());
    await chrome.storage.local.set({
      [STORAGE_KEY]: { status, synced_at: new Date().toISOString(), reachable: true },
    });
  } catch {
    // Kryptex isn't running right now — keep the last-known reading, just
    // flag it unreachable so the page doesn't post a stale delta as new.
    const current = (await chrome.storage.local.get([STORAGE_KEY]))[STORAGE_KEY];
    await chrome.storage.local.set({
      [STORAGE_KEY]: { ...(current || {}), reachable: false },
    });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 });
  pollKryptex();
});
chrome.runtime.onStartup.addListener(() => pollKryptex());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) pollKryptex();
});

import { projectsApi } from "./api";
import { localStorage as storage } from "./localStorage";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8001";
const DEFAULT_PROJECT_NAME = "Kryptex";
const AMOUNT_EPSILON = 0.000001;

export function summarizeKryptexStatus(payload) {
  const devices = Array.isArray(payload?.devices) ? payload.devices : [];
  const miners = [];

  for (const entry of devices) {
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

  miners.sort((left, right) => right.profitability_usd_day - left.profitability_usd_day);
  return {
    balance_usd: Number(payload?.balance?.total) || 0,
    withdrawable_usd: Number(payload?.balance?.withdrawable) || 0,
    profitability_usd_day: miners.reduce((sum, miner) => sum + miner.profitability_usd_day, 0),
    miners,
  };
}

export async function getKryptexStatus() {
  const response = await fetch(`${BACKEND_URL}/api/kryptex/status`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || "Kryptex local service is unavailable");
  }
  return summarizeKryptexStatus(await response.json());
}

async function findOrCreateProject(name) {
  const response = await projectsApi.getAll();
  const project = (response.data || []).find(
    (item) => (item.name || "").trim().toLowerCase() === name.toLowerCase(),
  );
  if (project) return project;
  return (await projectsApi.create({
    name,
    icon_url: null,
    invested: 0,
    earned: 0,
    per_day: 0,
    per_week: 0,
    per_month: 0,
    per_year: 0,
    categories: [],
  })).data;
}

// Shared reconciliation: applies a status snapshot (from either the local
// backend proxy or the browser-extension bridge) against the stored balance
// baseline. Only positive deltas post an earning transaction; drops just
// reset the baseline (payout), never negative income.
export async function reconcileKryptexStatus(status, { initialize = false } = {}) {
  const config = storage.getKryptexConfig();
  if (!config?.enabled) throw new Error("Kryptex integration is not enabled");

  const now = new Date().toISOString();
  const hasBaseline = Number.isFinite(Number(config.baseline_balance_usd));
  const baselineBefore = hasBaseline ? Number(config.baseline_balance_usd) : status.balance_usd;
  const delta = Number((status.balance_usd - baselineBefore).toFixed(6));
  const nextConfig = {
    ...config,
    baseline_balance_usd: status.balance_usd,
    latest_status: status,
    last_synced_at: now,
  };

  // Create the project up front so it shows on Monthly Earners immediately,
  // even before the first balance increase posts an earning transaction.
  const projectName = config.project_name || DEFAULT_PROJECT_NAME;
  const project = await findOrCreateProject(projectName);

  // Mirrors device telemetry onto the project itself (not just local config)
  // so Monthly Earners can render the same GPU/CPU breakdown as Integrations.
  const telemetryPatch = {
    yield_tracking: "kryptex",
    kryptex_balance_usd: status.balance_usd,
    kryptex_withdrawable_usd: status.withdrawable_usd,
    kryptex_profitability_usd_day: status.profitability_usd_day,
    kryptex_miners: status.miners,
    kryptex_last_synced_at: now,
  };

  if (initialize || !hasBaseline || Math.abs(delta) < AMOUNT_EPSILON) {
    storage.setKryptexConfig(nextConfig);
    await projectsApi.update(project.id, telemetryPatch);
    window.dispatchEvent(new CustomEvent("kryptex-sync-complete"));
    return { action: initialize || !hasBaseline ? "initialized" : "no_change", delta_usd: 0, status, project_id: project.id };
  }

  if (delta < 0) {
    storage.setKryptexConfig(nextConfig);
    await projectsApi.update(project.id, telemetryPatch);
    window.dispatchEvent(new CustomEvent("kryptex-sync-complete"));
    return { action: "withdrawal", delta_usd: delta, status, project_id: project.id };
  }

  const category = config.label || "GPU Mining";
  const date = now.split("T")[0];
  await projectsApi.addTransaction(project.id, {
    type: "earning",
    amount: delta,
    category,
    notes: `Kryptex balance increase (${date})`,
    date,
    source: "kryptex",
    source_balance_before: baselineBefore,
    source_balance_after: status.balance_usd,
  });
  await projectsApi.update(project.id, { ...telemetryPatch, earned: (Number(project.earned) || 0) + delta });
  await projectsApi.addToCategory(project.id, category, delta);
  storage.setKryptexConfig(nextConfig);
  window.dispatchEvent(new CustomEvent("kryptex-sync-complete"));
  return { action: "earning", delta_usd: delta, status, project_id: project.id };
}

// Local-backend path — used when running the app on the same PC as Kryptex
// with `npm start` (backend proxy at REACT_APP_BACKEND_URL).
export async function syncKryptex({ initialize = false, silent = false } = {}) {
  const config = storage.getKryptexConfig();
  if (!config?.enabled) {
    if (silent) return { action: "disabled" };
    throw new Error("Kryptex integration is not enabled");
  }

  let status;
  try {
    status = await getKryptexStatus();
  } catch (error) {
    if (silent) return { action: "unavailable", error: error.message };
    throw error;
  }

  try {
    return await reconcileKryptexStatus(status, { initialize });
  } catch (error) {
    if (silent) return { action: "unavailable", error: error.message };
    throw error;
  }
}
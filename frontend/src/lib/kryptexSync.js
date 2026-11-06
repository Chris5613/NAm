import { kryptexIncrease } from "./kryptexEarnings";
import { projectsApi } from "./api";
import { localStorage as storage } from "./localStorage";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8001";
const DEFAULT_PROJECT_NAME = "Kryptex";
const AMOUNT_EPSILON = 0.000001;
const KRYPTEX_MACHINE_STALE_MS = 5 * 60 * 1000;

function buildAggregatedMachineStatus(project, status, machine, observedAt) {
  const nowMs = Date.now();
  const machineId = String(machine?.id || "legacy");
  const seenAt = observedAt || new Date().toISOString();
  const existing = project?.kryptex_machines && typeof project.kryptex_machines === "object"
    ? project.kryptex_machines : {};

  const nextMachines = {
    ...existing,
    [machineId]: {
      id: machineId,
      name: machine?.name || existing?.[machineId]?.name || "Kryptex PC",
      last_seen_at: seenAt,
      profitability_usd_day: Math.max(0, Number(status?.profitability_usd_day) || 0),
      miners: Array.isArray(status?.miners) ? status.miners : [],
      reachable: true,
    },
  };

  const freshEntries = Object.values(nextMachines).filter(entry => {
    const at = Date.parse(entry?.last_seen_at || "");
    return entry?.reachable !== false && Number.isFinite(at) &&
      nowMs - at >= 0 && nowMs - at <= KRYPTEX_MACHINE_STALE_MS;
  });

  const miners = freshEntries.flatMap(entry =>
    (Array.isArray(entry?.miners) ? entry.miners : []).map(miner => ({
      ...miner,
      machine_id: entry.id,
      machine_name: entry.name,
    }))
  );

  return {
    machines: nextMachines,
    activeMachineCount: freshEntries.length,
    status: {
      ...status,
      profitability_usd_day: freshEntries.reduce(
        (sum, entry) => sum + Math.max(0, Number(entry?.profitability_usd_day) || 0), 0
      ),
      miners,
    },
  };
}

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
  const response = await fetch(`${BACKEND_URL}/api/kryptex/status`, { credentials: "include" });
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
// baseline and high-water mark. A payout or recovery below the old peak
// updates telemetry without creating an earning transaction.
export async function reconcileKryptexStatus(status, { initialize = false, machine = null, observedAt = null } = {}) {
  const config = storage.getKryptexConfig();
  if (!config?.enabled) throw new Error("Kryptex integration is not enabled");

  const now = new Date().toISOString();
  const hasBaseline = config.baseline_balance_usd != null && Number.isFinite(Number(config.baseline_balance_usd));
  const baselineBefore = hasBaseline ? Number(config.baseline_balance_usd) : status.balance_usd;
  const observedDelta = Number((status.balance_usd - baselineBefore).toFixed(6));
  const { earned, peak } = kryptexIncrease(status.balance_usd, baselineBefore, config.peak_balance_usd);
  const delta = Number(earned.toFixed(6));
  const nextConfig = {
    ...config,
    baseline_balance_usd: status.balance_usd,
    peak_balance_usd: peak,
    latest_status: status,
    last_synced_at: now,
  };

  // Create the project up front so it shows on Monthly Earners immediately,
  // even before the first balance increase posts an earning transaction.
  const projectName = config.project_name || DEFAULT_PROJECT_NAME;
  const project = await findOrCreateProject(projectName);

  // Keep each PC's local profitability separately, then expose one combined
  // status. Balance and dated account earnings remain account-wide.
  const aggregate = buildAggregatedMachineStatus(
    project,
    status,
    machine,
    observedAt || now,
  );
  const combinedStatus = aggregate.status;

  const telemetryPatch = {
    yield_tracking: "kryptex",
    kryptex_balance_usd: status.balance_usd,
    kryptex_withdrawable_usd: status.withdrawable_usd,
    kryptex_profitability_usd_day: combinedStatus.profitability_usd_day,
    kryptex_miners: combinedStatus.miners,
    kryptex_machines: aggregate.machines,
    kryptex_active_machine_count: aggregate.activeMachineCount,
    kryptex_last_synced_at: now,
  };

  if (initialize || !hasBaseline) {
    storage.setKryptexConfig(nextConfig);
    await projectsApi.update(project.id, telemetryPatch);
    window.dispatchEvent(new CustomEvent("kryptex-sync-complete"));
    return { action: "initialized", delta_usd: 0, status: combinedStatus, project_id: project.id, machine_count: aggregate.activeMachineCount };
  }

  if (observedDelta < 0 || (observedDelta > 0 && delta < AMOUNT_EPSILON)) {
    storage.setKryptexConfig(nextConfig);
    await projectsApi.update(project.id, telemetryPatch);
    window.dispatchEvent(new CustomEvent("kryptex-sync-complete"));
    return { action: observedDelta < 0 ? "withdrawal" : "recovery", delta_usd: observedDelta, status: combinedStatus, project_id: project.id, machine_count: aggregate.activeMachineCount };
  }

  if (delta < AMOUNT_EPSILON) {
    storage.setKryptexConfig(nextConfig);
    await projectsApi.update(project.id, telemetryPatch);
    window.dispatchEvent(new CustomEvent("kryptex-sync-complete"));
    return { action: "no_change", delta_usd: 0, status: combinedStatus, project_id: project.id, machine_count: aggregate.activeMachineCount };
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
  return { action: "earning", delta_usd: delta, status: combinedStatus, project_id: project.id, machine_count: aggregate.activeMachineCount };
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

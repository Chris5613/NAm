// Unity Network manual sync — no public earnings API, so the user enters
// their current USD balance from the Unity Network dashboard periodically.
// Mirrors the RollerCoin/Acurast balance-delta pattern but keeps everything
// in plain USD (no token-price hop).
//
// Posts earnings to the **same** "Phone Farm" investment project as Acurast,
// so the user has one consolidated phone-farm P&L line. The `source: 'unity_network'`
// tag keeps Unity-Network txns distinguishable from Acurast ones for the
// edit/delete reversal hooks in api.js.
//
// Anti-double-dip:
//   Withdrawals lower the baseline without creating earnings.
//
// Edit/delete reversal:
//   Synced txns carry `source: 'unity_network'` + `source_usd_delta`.
//   Deleting a synced txn lowers `baseline_usd` by that delta and
//   decrements `project.earned`, so the next "Update balance" re-arms.
import { projectsApi } from "./api";
import { localStorage as storage } from "./localStorage";

const UNITY_NETWORK_PROJECT_NAME_DEFAULT = "Phone Farm";
const STALE_DAYS = 7;
const AMOUNT_EPSILON = 0.005; // sub-cent drift

async function findOrCreateProject(name) {
  const res = await projectsApi.getAll();
  const list = res.data || [];
  const target = (name || "").trim().toLowerCase();
  let project = list.find((p) => (p.name || "").trim().toLowerCase() === target);
  if (project) return project;
  const created = await projectsApi.create({
    name,
    icon_url: "",
    invested: 0,
    earned: 0,
    per_day: 0,
    per_week: 0,
    per_month: 0,
    per_year: 0,
    categories: [],
  });
  return created.data;
}

// Returns true if the user hasn't entered a balance in >= STALE_DAYS or has
// never entered one — drives the orange "update me" badge on the card.
export function isUnityNetworkStale(config = null) {
  const c = config || storage.getUnityNetworkConfig();
  if (!c?.enabled) return false;
  if (!c?.last_updated_at) return true;
  const ageMs = Date.now() - new Date(c.last_updated_at).getTime();
  return ageMs >= STALE_DAYS * 24 * 60 * 60 * 1000;
}

// Apply a new-balance entry. `action`:
//   - "earning"    → delta > 0 credited as a new earning transaction
//   - "withdrawal" → baseline lowered, no transaction
//   - "no_change"  → bump `last_updated_at` only (resets the stale nudge)
// Returns: { txn, delta_usd, action, baseline_before, baseline_after }
export async function applyUnityNetworkBalanceUpdate({ newBalanceUsd, action }) {
  const config = storage.getUnityNetworkConfig();
  if (!config?.enabled) throw new Error("Unity Network integration is disabled");

  const baselineBefore = Number(config.baseline_usd) || 0;
  const nextBalance = Math.max(0, Number(newBalanceUsd) || 0);
  const deltaUsd = Number((nextBalance - baselineBefore).toFixed(6));

  if (action === "no_change" || Math.abs(deltaUsd) < AMOUNT_EPSILON) {
    const next = { ...config, last_updated_at: new Date().toISOString() };
    storage.setUnityNetworkConfig(next);
    window.dispatchEvent(new CustomEvent("unity-network-sync-complete"));
    return {
      txn: null, delta_usd: 0, action: "no_change",
      baseline_before: baselineBefore, baseline_after: baselineBefore,
    };
  }

  if (action === "withdrawal") {
    const next = {
      ...config,
      baseline_usd: nextBalance,
      last_updated_at: new Date().toISOString(),
    };
    storage.setUnityNetworkConfig(next);
    window.dispatchEvent(new CustomEvent("unity-network-sync-complete"));
    return {
      txn: null, delta_usd: deltaUsd, action: "withdrawal",
      baseline_before: baselineBefore, baseline_after: nextBalance,
    };
  }

  if (action === "earning" && deltaUsd <= 0) {
    throw new Error("Cannot record an earning when the new balance is lower than the baseline.");
  }

  // 1. Locate (or create) the Phone Farm investment project.
  const projectName = config.project_name || UNITY_NETWORK_PROJECT_NAME_DEFAULT;
  const project = await findOrCreateProject(projectName);

  // 2. Post the earning transaction tagged with the source metadata.
  const today = new Date().toISOString().split("T")[0];
  const txnsRes = await projectsApi.addTransaction(project.id, {
    type: "earning",
    amount: deltaUsd,
    category: "Unity Network",
    notes: `Unity Network balance update: +$${deltaUsd.toFixed(2)}`,
    date: today,
    source: "unity_network",
    source_usd_delta: deltaUsd,
  });
  const txns = txnsRes.data || [];
  const created = [...txns]
    .reverse()
    .find((t) => t.source === "unity_network" && t.source_usd_delta === deltaUsd);

  // 3. Bump project.earned by the USD amount.
  const nextEarned = Math.max(0, (Number(project.earned) || 0) + deltaUsd);
  await projectsApi.update(project.id, { earned: nextEarned });

  // 3b. Auto-update sub-category breakdown.
  await projectsApi.addToCategory(project.id, "Unity Network", deltaUsd);

  // 4. Update baseline + last_updated_at.
  const nextConfig = {
    ...config,
    baseline_usd: nextBalance,
    last_updated_at: new Date().toISOString(),
  };
  storage.setUnityNetworkConfig(nextConfig);

  window.dispatchEvent(new CustomEvent("unity-network-sync-complete"));

  return {
    txn: created || null,
    delta_usd: deltaUsd,
    action: "earning",
    baseline_before: baselineBefore,
    baseline_after: nextBalance,
  };
}

/**
 * Custom Integration Sync
 * Allows users to create their own integrations (USD or token-based)
 * that auto-sync earnings to Investment Overview projects + sub-categories.
 */
import { projectsApi } from "./api";
import { localStorage as storage } from "./localStorage";
import { coinGeckoApi } from "./external-apis";

const AMOUNT_EPSILON = 0.000001;

// ─── CRUD for custom integrations ──────────────────────────────────────────

export function getAll() {
  return storage.getCustomIntegrations();
}

export function getById(id) {
  return getAll().find((i) => i.id === id) || null;
}

export function create(data) {
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`;
  const integration = {
    id,
    name: data.name || "Custom",
    project_name: data.project_name || "",
    mode: data.mode || "usd", // "usd" | "token"
    symbol: data.symbol || "",
    baseline: Number(data.baseline) || 0,
    coingecko_id: data.coingecko_id || "",
    last_updated_at: null,
    enabled: true,
  };
  const all = getAll();
  storage.setCustomIntegrations([...all, integration]);
  return integration;
}

export function update(id, data) {
  const all = getAll();
  const updated = all.map((i) => (i.id === id ? { ...i, ...data } : i));
  storage.setCustomIntegrations(updated);
  return updated.find((i) => i.id === id) || null;
}

export function remove(id) {
  const all = getAll();
  storage.setCustomIntegrations(all.filter((i) => i.id !== id));
}

// ─── Price fetching for token-based integrations ───────────────────────────

export async function getTokenPrice(coingeckoId) {
  if (!coingeckoId) return 0;
  try {
    const price = await coinGeckoApi.getPrice(coingeckoId);
    return Number(price) || 0;
  } catch {
    return 0;
  }
}

// ─── Find or create the target project ─────────────────────────────────────

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
    categories: [],
    transactions: [],
  });
  return created.data;
}

// ─── Apply balance update ──────────────────────────────────────────────────

export async function applyBalanceUpdate({ integrationId, newBalance, action, priceOverride, label }) {
  const integration = getById(integrationId);
  if (!integration?.enabled) throw new Error("Integration is disabled");

  const baselineBefore = Number(integration.baseline) || 0;
  const nextBalance = Math.max(0, Number(newBalance) || 0);
  const delta = Number((nextBalance - baselineBefore).toFixed(6));

  // Determine USD value of the delta
  let deltaUsd = 0;
  let price = 0;

  if (integration.mode === "usd") {
    deltaUsd = delta;
    price = 1; // 1:1 USD
  } else {
    // Token mode — need a price
    price = priceOverride > 0 ? priceOverride : await getTokenPrice(integration.coingecko_id);
    if (action === "earning" && !(price > 0)) {
      throw new Error(`${integration.symbol || "Token"} price unavailable — enter a manual price to proceed`);
    }
    deltaUsd = delta * price;
  }

  // No change
  if (action === "no_change" || Math.abs(delta) < AMOUNT_EPSILON) {
    update(integrationId, { last_updated_at: new Date().toISOString() });
    window.dispatchEvent(new CustomEvent("custom-integration-sync-complete"));
    return { action: "no_change", delta: 0, delta_usd: 0, baseline_before: baselineBefore, baseline_after: baselineBefore };
  }

  // Withdrawal
  if (action === "withdrawal") {
    update(integrationId, { baseline: nextBalance, last_updated_at: new Date().toISOString() });
    window.dispatchEvent(new CustomEvent("custom-integration-sync-complete"));
    return { action: "withdrawal", delta, delta_usd: 0, baseline_before: baselineBefore, baseline_after: nextBalance };
  }

  // Earning
  if (action === "earning" && delta > 0) {
    const projectName = integration.project_name;
    if (!projectName) throw new Error("No target project set — configure the integration first");

    const project = await findOrCreateProject(projectName);

    // Use label for sub-category, fall back to integration name
    const categoryName = label || integration.name;

    // Post the transaction
    await projectsApi.addTransaction(project.id, {
      type: "earning",
      amount: Math.abs(deltaUsd),
      source: `custom:${integration.name.toLowerCase().replace(/\s+/g, "_")}`,
      category: categoryName,
      date: new Date().toISOString(),
      notes: integration.mode === "token"
        ? `+${delta.toFixed(4)} ${integration.symbol} @ $${price.toFixed(4)}`
        : `+$${Math.abs(deltaUsd).toFixed(2)}`,
    });

    // Bump project.earned
    const nextEarned = Math.max(0, (Number(project.earned) || 0) + Math.abs(deltaUsd));
    await projectsApi.update(project.id, { earned: nextEarned });

    // Auto-update sub-category with the label
    await projectsApi.addToCategory(project.id, categoryName, Math.abs(deltaUsd));

    // Update baseline
    update(integrationId, { baseline: nextBalance, last_updated_at: new Date().toISOString() });

    window.dispatchEvent(new CustomEvent("custom-integration-sync-complete"));
    return {
      action: "earning",
      delta,
      delta_usd: Math.abs(deltaUsd),
      price,
      baseline_before: baselineBefore,
      baseline_after: nextBalance,
      category: categoryName,
    };
  }

  // Fallback: just update baseline
  update(integrationId, { baseline: nextBalance, last_updated_at: new Date().toISOString() });
  window.dispatchEvent(new CustomEvent("custom-integration-sync-complete"));
  return { action: "no_change", delta, delta_usd: 0, baseline_before: baselineBefore, baseline_after: nextBalance };
}

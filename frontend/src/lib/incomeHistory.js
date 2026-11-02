import { stockPayoutTotal } from "./stockDividendPayouts";

const TRACKED_SOURCES = new Set(["lulo", "loopscale", "salad", "rollercoin", "unetwork", "kryptex"]);
const TRACKED_TYPES = new Set(["lulo_lending", "jupiter_inf_loop", "sanctum_inf", "kryptex"]);

function transactionMonth(row) {
  const date = row?.source_date || row?.date || row?.created_at || row?.occurred_at;
  if (!date) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return String(date).slice(0, 7);
  const instant = new Date(date);
  if (!Number.isFinite(instant.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit" }).format(instant);
}

export function legacyProjectIncome(projects) {
  const months = new Map();
  const undated = [];
  for (const project of projects || []) {
    const name = String(project?.name || "").trim();
    if (!name || TRACKED_SOURCES.has(name.toLowerCase()) || TRACKED_TYPES.has(project?.yield_tracking)) continue;
    const earnings = (Array.isArray(project.transactions) ? project.transactions : []).filter(row => {
      const amount = Number(row?.amount);
      return (row?.type === "earning" || row?.type === "earned" || !row?.type) &&
        Number.isFinite(amount) && amount > 0;
    });
    if (!earnings.length) {
      const lifetime = Number(project.earned);
      if (Number.isFinite(lifetime) && lifetime > 0) undated.push({ name, amount: lifetime });
      continue;
    }
    for (const row of earnings) {
      const month = transactionMonth(row);
      if (!month) { undated.push({ name, amount: Number(row.amount) }); continue; }
      if (!months.has(month)) months.set(month, {});
      const sources = months.get(month);
      sources[name] = (sources[name] || 0) + Number(row.amount);
    }
  }
  return { months: Object.fromEntries(months), undated };
}

export function shiftMonth(monthKey, offset) {
  const date = new Date(`${monthKey}-15T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

// The backend's accepted Lulo interest can arrive after a monthly snapshot
// has been locked, or when the Passive Income page has not populated its
// quick project cache yet. Treat local and backend month totals as alternate
// records of the same interest, never as amounts to add together.
export function reconcileLuloIncome(months, localBackfills, backendBackfills, currentMonth) {
  const projects = new Map();
  for (const source of [localBackfills, backendBackfills]) {
    for (const [projectId, records] of Object.entries(source || {})) {
      if (!records || typeof records !== "object" || Array.isArray(records)) continue;
      const project = projects.get(projectId) || {};
      for (const [month, rawAmount] of Object.entries(records)) {
        const amount = Number(rawAmount);
        if (!/^\d{4}-\d{2}$/.test(month) || month > currentMonth ||
          !Number.isFinite(amount) || amount < 0) continue;
        project[month] = Math.max(project[month] || 0, amount);
      }
      projects.set(projectId, project);
    }
  }

  const expected = new Map();
  for (const records of projects.values()) {
    for (const [month, amount] of Object.entries(records)) {
      expected.set(month, (expected.get(month) || 0) + amount);
    }
  }

  const byMonth = new Map((months || []).map(month => [month.monthKey, month]));
  for (const [monthKey, amount] of expected) {
    if (amount <= 0) continue;
    const month = byMonth.get(monthKey) || { monthKey, total: 0, platforms: [] };
    const current = (month.platforms || []).reduce((sum, row) =>
      sum + (row.platform === "Lulo" ? Number(row.amount) || 0 : 0), 0);
    if (current >= amount - 0.000001) continue;
    const platforms = (month.platforms || []).filter(row => row.platform !== "Lulo");
    platforms.push({ platform: "Lulo", amount });
    const listedBefore = (month.platforms || []).reduce((sum, row) =>
      sum + (Number(row.amount) || 0), 0);
    const unlisted = Math.max(0, (Number(month.total) || 0) - listedBefore);
    // An older snapshot may already include Lulo in its total without a
    // source label. Use that unassigned amount before increasing the total.
    byMonth.set(monthKey, {
      ...month, platforms,
      total: Number(((Number(month.total) || 0) + Math.max(0, amount - current - unlisted)).toFixed(6)),
    });
  }
  return [...byMonth.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

export function buildIncomeHistory(projectMonths, payouts, currentMonth, legacy = {}) {
  const months = new Map();
  for (const month of projectMonths || []) {
    const key = String(month?.monthKey || "");
    if (!/^\d{4}-\d{2}$/.test(key) || key > currentMonth) continue;
    const sources = {};
    for (const platform of month.platforms || []) {
      const name = String(platform?.platform || "").trim();
      const value = Number(platform?.amount);
      if (name && Number.isFinite(value) && value !== 0) sources[name] = (sources[name] || 0) + value;
    }
    // Match the Passive Income chart's project total. Its stored monthly
    // snapshot may contain more than the individually listed platforms.
    const projectTotal = Math.max(0, Number(month.total) || 0);
    const listed = Object.values(sources).reduce((sum, value) => sum + value, 0);
    if (projectTotal > listed + 0.005) sources["Other projects"] = projectTotal - listed;
    months.set(key, { monthKey: key, sources, projectTotal });
  }
  for (const record of Object.values(payouts || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record?.date || "") || record.date.slice(0, 7) > currentMonth) continue;
    if (!["VTI", "VOO"].includes(record.symbol) || !(Number(record.amount) > 0)) continue;
    const key = record.date.slice(0, 7);
    if (!months.has(key)) months.set(key, { monthKey: key, sources: {}, projectTotal: 0 });
  }
  for (const [key, additions] of Object.entries(legacy.months || {})) {
    if (!/^\d{4}-\d{2}$/.test(key) || key > currentMonth) continue;
    if (!months.has(key)) months.set(key, { monthKey: key, sources: {}, projectTotal: 0 });
    const month = months.get(key);
    for (const [name, rawAmount] of Object.entries(additions)) {
      const amount = Number(rawAmount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      month.sources[name] = (month.sources[name] || 0) + amount;
      month.projectTotal += amount;
    }
  }
  return [...months.values()].map(month => {
    const stocks = stockPayoutTotal(payouts, month.monthKey);
    const sources = { ...month.sources, ...(stocks > 0 ? { Stocks: stocks } : {}) };
    return { ...month, stocks, sources, total: month.projectTotal + stocks };
  }).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

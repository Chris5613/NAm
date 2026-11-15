import { remoteStorage as localStorage } from "@/lib/serverStore";

const DAILY_BASELINE_KEY = "daily_net_worth_baseline_pst";
const DAILY_CATEGORY_BASELINE_KEY = "daily_category_baseline_pst";
const MONTHLY_NET_WORTH_HISTORY_KEY = "monthly_net_worth_history_v2";

/* =========================================================
   DATE HELPERS
========================================================= */

export function getPstDateKey(
  date = new Date()
) {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone:
        "America/Los_Angeles",

      year: "numeric",

      month: "2-digit",

      day: "2-digit",
    }
  ).format(date);
}

export function getMonthKey(
  date = new Date()
) {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone:
        "America/Los_Angeles",

      year: "numeric",

      month: "2-digit",
    }
  ).format(date);
}

export function getMonthLabel(
  date = new Date()
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        "America/Los_Angeles",

      month: "short",

      year: "numeric",
    }
  ).format(date);
}

/* =========================================================
   CURRENCY
========================================================= */

export function formatCurrency(
  value
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",

      currency: "USD",

      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2,
    }
  ).format(
    Number(value) || 0
  );
}

/* =========================================================
   DAILY CATEGORY CHANGE
========================================================= */

// Legacy names remain as read-only compatibility helpers. Only
// /api/net-worth/home-trends may write baseline and monthly history settings.
export function getCategoryDailyChanges(breakdown) {
  return readOnlyNetWorthTrends({
    total_net_worth: 0, breakdown,
  }).categoryChanges;
}

export function getDailyNetWorthChange(currentNetWorth) {
  return readOnlyNetWorthTrends({
    total_net_worth: currentNetWorth, breakdown: {},
  }).dailyChange;
}

export function getMonthlyNetWorthHistory(currentNetWorth) {
  return readOnlyNetWorthTrends({
    total_net_worth: currentNetWorth, breakdown: {},
  }).monthlyHistory;
}

// Home net-worth and business cash-overlap calculations now run exclusively
// in backend/financial_core.py; no browser accounting fallback is retained.

export function readOnlyNetWorthTrends(netWorth) {
  const value = Number(netWorth?.total_net_worth) || 0;
  const breakdown = netWorth?.breakdown || {};
  const today = getPstDateKey();
  const month = getMonthKey();
  const label = getMonthLabel();
  const read = (key, fallback) => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      return saved ?? fallback;
    } catch { return fallback; }
  };
  const daily = read(DAILY_BASELINE_KEY, {});
  const savedBase = Number(daily?.baseline);
  const baseline = daily?.dateKey === today &&
    Number.isFinite(savedBase) && savedBase > 0 ? savedBase : value;
  const dailyChange = {
    baseline,
    change: value - baseline,
    percentChange: baseline > 0 ? ((value - baseline) / baseline) * 100 : 0,
    dateKey: today,
  };
  const savedCategories = read(DAILY_CATEGORY_BASELINE_KEY, {});
  const categoryChange = {};
  for (const category of ["stocks", "crypto", "cash", "other", "debts"]) {
    const current = Number(breakdown[category]) || 0;
    const previous = savedCategories?.dateKey === today
      ? Number(savedCategories?.baseline?.[category]) : NaN;
    categoryChange[category] = Number.isFinite(previous)
      ? current - previous : 0;
  }
  const previousMonths = read(MONTHLY_NET_WORTH_HISTORY_KEY, []);
  const monthlyHistory = (Array.isArray(previousMonths) ? previousMonths : [])
    .filter(row => row && typeof row.monthKey === "string")
    .map(row => ({
      monthKey: row.monthKey,
      month: row.month || row.label || row.time || row.monthKey,
      value: row.monthKey === month ? value : row.value,
      live: row.monthKey === month,
    }));
  if (!monthlyHistory.some(row => row.monthKey === month)) {
    monthlyHistory.push({ monthKey: month, month: label, value, live: true });
  }
  monthlyHistory.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  return { dailyChange, categoryChanges: categoryChange, monthlyHistory };
}

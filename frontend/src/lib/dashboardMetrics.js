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

export function calculateNetWorth(
  assets = [],
  cryptoTotal = 0
) {
  const breakdown = {
    stocks: 0,

    crypto:
      cryptoTotal,

    cash: 0,

    other: 0,

    debts: 0,
  };

  assets.forEach(
    (asset) => {
      // Quoted stock positions use shares × price. A stock holding entered
      // with only an explicit manual valuation must not silently vanish.
      const validQuote = asset.quantity != null && asset.current_price != null &&
        Number.isFinite(Number(asset.quantity)) &&
        Number.isFinite(Number(asset.current_price));
      const useManual = asset.manual_value != null &&
        (asset.category !== "stocks" || !validQuote);
      const value = useManual
        ? Number(asset.manual_value) || 0
        : (Number(asset.quantity) || 0) * (Number(asset.current_price) || 0);

      if (
        asset.category ===
        "debts"
      ) {
        breakdown.debts +=
          value;
      } else if (
        breakdown[
          asset.category
        ] !== undefined
      ) {
        breakdown[
          asset.category
        ] += value;
      }
    }
  );

  const total_net_worth =
    breakdown.stocks +
    breakdown.crypto +
    breakdown.cash +
    breakdown.other -
    breakdown.debts;

  return {
    total_net_worth,

    breakdown,

    asset_count:
      assets.length,
  };
}

// The Balance Sheet already contains crypto holdings: use it instead of
// adding a second copy of the same portfolio to net worth.
export function getCryptoBusinessValue(financialAssets, cryptoTotal = 0, personalCash = 0) {
  const value = financialAssets?.netValue;
  // Unknown asset or liability balances must not be silently treated as zero.
  // Until a complete business net worth is known, retain the old crypto subtotal.
  if (financialAssets?.incomplete === true ||
      financialAssets?.liabilitiesIncomplete === true ||
      typeof value !== "number" || !Number.isFinite(value) ||
      !(Number(financialAssets?.count) > 0)) {
    return Number(cryptoTotal) || 0;
  }
  // The business bank cash was moved from Lulo into a bank account already
  // tracked under Home > Cash. It remains an asset on the business Balance
  // Sheet, but must appear only once in combined personal net worth.
  const overlap = Math.min(
    Math.max(0, Number(financialAssets.bankCashValue) || 0),
    Math.max(0, Number(personalCash) || 0),
  );
  return Math.round((value - overlap) * 100) / 100;
}


/**
 * Read-only display fallback when backend Home trend calculation is unavailable.
 * Never creates a new baseline or modifies a historical month; only the
 * backend home-trends endpoint is allowed to write those records.
 */
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

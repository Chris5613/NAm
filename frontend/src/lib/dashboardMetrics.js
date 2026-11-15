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

export function getCategoryDailyChanges(
  breakdown
) {
  const todayKey =
    getPstDateKey();

  let saved = null;

  try {
    saved = JSON.parse(
      localStorage.getItem(
        DAILY_CATEGORY_BASELINE_KEY
      ) || "null"
    );
  } catch {
    saved = null;
  }

  if (
    !saved ||
    saved.dateKey !==
      todayKey
  ) {
    const baseline = {
      stocks:
        breakdown?.stocks ||
        0,

      crypto:
        breakdown?.crypto ||
        0,

      cash:
        breakdown?.cash ||
        0,

      other:
        breakdown?.other ||
        0,

      debts:
        breakdown?.debts ||
        0,
    };

    localStorage.setItem(
      DAILY_CATEGORY_BASELINE_KEY,

      JSON.stringify({
        dateKey:
          todayKey,

        baseline,
      })
    );

    return {
      stocks: 0,

      crypto: 0,

      cash: 0,

      other: 0,

      debts: 0,
    };
  }

  return {
    stocks:
      (breakdown?.stocks ||
        0) -
      (saved.baseline
        ?.stocks || 0),

    crypto:
      (breakdown?.crypto ||
        0) -
      (saved.baseline
        ?.crypto || 0),

    cash:
      (breakdown?.cash ||
        0) -
      (saved.baseline
        ?.cash || 0),

    other:
      (breakdown?.other ||
        0) -
      (saved.baseline
        ?.other || 0),

    debts:
      (breakdown?.debts ||
        0) -
      (saved.baseline
        ?.debts || 0),
  };
}

/* =========================================================
   DAILY NET WORTH CHANGE
========================================================= */

export function getDailyNetWorthChange(
  currentNetWorth
) {
  const todayKey =
    getPstDateKey();

  const value =
    Number(
      currentNetWorth
    ) || 0;

  if (value <= 0) {
    return {
      baseline: 0,

      change: 0,

      percentChange: 0,

      dateKey:
        todayKey,
    };
  }

  let saved = null;

  try {
    saved = JSON.parse(
      localStorage.getItem(
        DAILY_BASELINE_KEY
      ) || "null"
    );
  } catch {
    saved = null;
  }

  if (
    !saved ||
    saved.dateKey !==
      todayKey ||
    Number(
      saved.baseline
    ) <= 0
  ) {
    localStorage.setItem(
      DAILY_BASELINE_KEY,

      JSON.stringify({
        dateKey:
          todayKey,

        baseline:
          value,
      })
    );

    return {
      baseline:
        value,

      change: 0,

      percentChange: 0,

      dateKey:
        todayKey,
    };
  }

  const baseline =
    Number(
      saved.baseline
    ) || 0;

  const change =
    value -
    baseline;

  const percentChange =
    baseline !== 0
      ? (change /
          baseline) *
        100
      : 0;

  return {
    baseline,

    change,

    percentChange,

    dateKey:
      todayKey,
  };
}

/* =========================================================
   MONTHLY HISTORY

   Current month:
   - stays in the same chart position
   - value keeps updating

   When a new month starts:
   - previous month remains
   - a new chart point is created automatically
========================================================= */

export function getMonthlyNetWorthHistory(
  currentNetWorth
) {
  const value =
    Number(
      currentNetWorth
    ) || 0;

  const monthKey =
    getMonthKey();

  const monthLabel =
    getMonthLabel();

  let saved = null;

  try {
    saved = JSON.parse(
      localStorage.getItem(
        MONTHLY_NET_WORTH_HISTORY_KEY
      ) || "null"
    );
  } catch {
    saved = null;
  }

  let history =
    Array.isArray(saved)
      ? saved
          .filter(
            (item) =>
              item &&
              typeof item.monthKey ===
                "string"
          )
          .map(
            (item) => ({
              monthKey:
                item.monthKey,

              month:
                item.month ||
                item.label ||
                item.time ||
                item.monthKey,

              // Do not turn missing historical values into a fabricated $0.
              value: item.value,

              live:
                item.monthKey ===
                monthKey,
            })
          )
      : [];

  const currentIndex =
    history.findIndex(
      (item) =>
        item.monthKey ===
        monthKey
    );

  if (
    currentIndex >= 0
  ) {
    history =
      history.map(
        (
          item,
          index
        ) => ({
          ...item,

          live:
            index ===
            currentIndex,
        })
      );

    history[
      currentIndex
    ] = {
      ...history[
        currentIndex
      ],

      month:
        monthLabel,

      value,

      live: true,
    };
  } else {
    history = [
      ...history.map(
        (item) => ({
          ...item,

          live: false,
        })
      ),

      {
        monthKey,

        month:
          monthLabel,

        value,

        live: true,
      },
    ];
  }

  history.sort(
    (a, b) =>
      String(
        a.monthKey
      ).localeCompare(
        String(
          b.monthKey
        )
      )
  );

  localStorage.setItem(
    MONTHLY_NET_WORTH_HISTORY_KEY,

    JSON.stringify(
      history
    )
  );

  return history;
}

/* =========================================================
   NET WORTH
========================================================= */

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

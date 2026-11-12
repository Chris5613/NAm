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
      const value =
        asset.category !==
          "stocks" &&
        asset.manual_value !=
          null
          ? Number(
              asset.manual_value
            ) || 0
          : (Number(
              asset.quantity
            ) || 0) *
            (Number(
              asset.current_price
            ) || 0);

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
export function getCryptoBusinessValue(financialAssets, cryptoTotal = 0) {
  const value = financialAssets?.value;
  return financialAssets?.incomplete !== true && typeof value === "number" &&
    Number.isFinite(value) && Number(financialAssets?.count) > 0
    ? value : (Number(cryptoTotal) || 0);
}

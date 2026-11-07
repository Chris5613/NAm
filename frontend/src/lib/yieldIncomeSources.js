import { withKryptexDailyBalance } from "./kryptexDailyBalance";
import { withUnetworkDatedEarnings } from "./unetworkDailyIncome";
import { luloSourcesForChartDay } from "./luloUtcDaily";
import { stockPayoutTotal } from "./stockDividendPayouts";

/**
 * Build the earnings source map for a specific calendar day.
 * This is pure calculation logic: it never writes storage or mutates trackers.
 */
export function buildSourceTotalsForDay(key, context) {
  const {
    todayKey,
    luloProjects,
    currentLuloUtc,
    unetworkTracker,
    kryptexTracker,
    saladTracker,
    rollerCoinTracker,
    earningsLedger,
    stockPayouts,
    loopscaleHistory,
    recoveredEarningsByDay,
    projectRecovery,
    savedLoopscaleReference,
    currentLoopscaleReference,
    SALAD_FIXED_DAY,
    SALAD_FIXED_TOTAL,
    LULO_FIXED_DAY,
    LULO_FIXED_TOTAL,
    ROLLERCOIN_OCT30_ANCHOR_DAY,
    ROLLERCOIN_OCT30_ANCHOR_TRX,
    ROLLERCOIN_OCT30_ANCHOR_AT,
    ROLLERCOIN_OCT30_ESTIMATED_MORNING_TRX,
    LOOPSCALE_FIXED_DISPLAY_DAY,
    LOOPSCALE_FIXED_DISPLAY_USD,
  } = context;

  if (key === todayKey) {
    const income = luloSourcesForChartDay({}, luloProjects, key, todayKey, currentLuloUtc);
    const allocation = unetworkTracker?.daily?.[key];
    const datedAmounts = {
      Kryptex: Number(kryptexTracker?.kryptexMiningDaily?.[key]) || 0,
      Salad: saladTracker?.daily?.[key],
      RollerCoin: rollerCoinTracker?.daily?.[key]?.usd
        ?? earningsLedger.days?.[key]?.sources?.RollerCoin
        ?? (Number(rollerCoinTracker?.walletDaily?.[key]?.usd) > 0
          ? rollerCoinTracker.walletDaily[key].usd : 0),
      Stocks: stockPayoutTotal(stockPayouts, key),
      Unetwork: allocation?.count > 0 || allocation?.micros > 0 ? allocation.usd : 0,
    };

    for (const [source, amount] of Object.entries(datedAmounts)) {
      if (Number.isFinite(Number(amount)) && Number(amount) > 0) {
        income[source] = Number(amount);
      }
    }

    const observedLoopscale = Object.values(loopscaleHistory?.positions || {})
      .reduce((sum, position) => sum + (Number(position?.observedDaily?.[key]) || 0), 0);
    const recordedLoopscale = Number(earningsLedger.days?.[key]?.sources?.Loopscale) || 0;
    const loopscaleIncome = Math.max(0, observedLoopscale, recordedLoopscale);
    if (loopscaleIncome > 0) income.Loopscale = loopscaleIncome;
    return income;
  }

  if (key > todayKey) {
    return key === currentLuloUtc.utcDay
      ? luloSourcesForChartDay({}, luloProjects, key, todayKey, currentLuloUtc)
      : {};
  }

  const sources = withKryptexDailyBalance(
    withUnetworkDatedEarnings(
      { ...(earningsLedger.days[key]?.sources || {}) },
      unetworkTracker,
      key
    ),
    kryptexTracker,
    key
  );

  const walletDay = rollerCoinTracker?.walletDaily?.[key];
  const minedEntry = rollerCoinTracker?.daily?.[key];

  if (key === todayKey || walletDay || recoveredEarningsByDay?.[key]?.RollerCoin) {
    const priorLedgerUsd = Number(sources.RollerCoin) || 0;
    const datedUsd = Number(minedEntry?.usd) || 0;
    const changeTrx = Number(walletDay?.trx) || 0;
    const price = Number(rollerCoinTracker?.lastTrxPrice) || 0;
    const preAnchorEstimateUsd = key === ROLLERCOIN_OCT30_ANCHOR_DAY
      ? ROLLERCOIN_OCT30_ESTIMATED_MORNING_TRX * price
      : 0;

    const previouslyRecordedUsd = Math.max(
      0,
      priorLedgerUsd,
      datedUsd,
      preAnchorEstimateUsd
    );

    let walletChangeUsd = walletDay?.usd != null &&
      Number.isFinite(Number(walletDay.usd))
      ? Number(walletDay.usd)
      : changeTrx * price;

    if (key === todayKey && key === ROLLERCOIN_OCT30_ANCHOR_DAY) {
      const balanceTime = Date.parse(rollerCoinTracker?.balanceSyncedAt || "");
      const confirmedBalance = Number(rollerCoinTracker?.currentTrxBalance);

      if (
        Number.isFinite(balanceTime) &&
        balanceTime >= ROLLERCOIN_OCT30_ANCHOR_AT &&
        Number.isFinite(confirmedBalance) &&
        confirmedBalance >= 0 &&
        price > 0
      ) {
        walletChangeUsd = (confirmedBalance - ROLLERCOIN_OCT30_ANCHOR_TRX) * price;
      } else {
        walletChangeUsd = 0;
      }
    }

    const includeWalletChange = walletDay ||
      (key === todayKey && key === ROLLERCOIN_OCT30_ANCHOR_DAY);
    const trackedTotalUsd =
      previouslyRecordedUsd + (includeWalletChange ? walletChangeUsd : 0);

    const yesterday = new Date(todayKey + "T12:00:00Z");
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const previousDate = yesterday.toISOString().slice(0, 10);
    const candidate = (projectRecovery?.candidates || [])
      .find(item => item.id === "rollercoin-project" && item.eligibleForGuardedRecovery);
    const recoveredUsd = key === todayKey &&
      projectRecovery?.referenceDate === previousDate &&
      candidate &&
      Number.isFinite(Number(candidate.usdAtCurrentPrice))
      ? Number(candidate.usdAtCurrentPrice)
      : 0;

    const persistedRecoveryUsd =
      Number(recoveredEarningsByDay?.[key]?.RollerCoin) || 0;
    const totalUsd = Math.max(trackedTotalUsd, recoveredUsd, persistedRecoveryUsd);

    if (totalUsd !== 0) sources.RollerCoin = totalUsd;
    else delete sources.RollerCoin;
  } else if (minedEntry) {
    const recordedUsd = Number(minedEntry.usd);
    if (Number.isFinite(recordedUsd) && recordedUsd > 0) {
      sources.RollerCoin = recordedUsd;
    }
  }

  if (key === SALAD_FIXED_DAY) {
    const datedTotal = Number(saladTracker?.daily?.[key]);
    const observedIncrease = Math.max(0, Number(sources.Salad) || 0);
    const postMorningTotal = SALAD_FIXED_TOTAL +
      Math.max(0, Number(saladTracker?.saladPostMorningEarned) || 0);

    sources.Salad = Math.max(
      SALAD_FIXED_TOTAL,
      Number.isFinite(datedTotal) ? datedTotal : 0,
      postMorningTotal,
      observedIncrease
    );
  }

  if (key === LULO_FIXED_DAY) {
    sources.Lulo = Math.max(LULO_FIXED_TOTAL, Number(sources.Lulo) || 0);
  }

  const luloDaySources = luloSourcesForChartDay(
    sources,
    luloProjects,
    key,
    todayKey,
    currentLuloUtc
  );
  if (Object.prototype.hasOwnProperty.call(luloDaySources, "Lulo")) {
    sources.Lulo = luloDaySources.Lulo;
  } else if (luloProjects.length) {
    delete sources.Lulo;
  }

  if (key === LULO_FIXED_DAY) {
    sources.Lulo = Math.max(LULO_FIXED_TOTAL, Number(sources.Lulo) || 0);
  }

  const loopscalePositions = Object.values(loopscaleHistory?.positions || {})
    .filter(position =>
      Object.prototype.hasOwnProperty.call(position?.observedDaily || {}, key)
    );
  if (loopscalePositions.length) {
    sources.Loopscale = loopscalePositions.reduce(
      (sum, position) => sum + (Number(position.observedDaily[key]) || 0),
      0
    );
  }

  const paidStocks = stockPayoutTotal(stockPayouts, key);
  if (paidStocks > 0) sources.Stocks = paidStocks;
  else delete sources.Stocks;

  if (key === todayKey && todayKey === LOOPSCALE_FIXED_DISPLAY_DAY) {
    const reference = savedLoopscaleReference ?? currentLoopscaleReference;
    sources.Loopscale = Number((
      LOOPSCALE_FIXED_DISPLAY_USD +
      (currentLoopscaleReference - reference)
    ).toFixed(8));
  }

  return sources;
}

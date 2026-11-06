// Today's Kryptex row follows the observed balance movement. Mining income
// remains separately tracked by the high-water ledger, so a withdrawal and
// later recovery do not become new lifetime mining earnings.
export function recordKryptexDailyBalance(tracker, balance, day, recordedToday = 0) {
  const current = Number(balance);
  if (!Number.isFinite(current) || current < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(day))
    return tracker?.dailyBalanceDays || {};

  const days = tracker?.dailyBalanceDays || {};
  const savedOpening = Number(days[day]?.openingBalanceUsd);
  const priorBalance = Number(tracker?.lastBalance);
  const priorPeak = Number(tracker?.peakBalance);
  const priorSync = Date.parse(tracker?.lastSyncedAt || "");
  const priorParts = Number.isFinite(priorSync)
    ? new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" })
        .formatToParts(new Date(priorSync)) : [];
  const part = type => priorParts.find(item => item.type === type)?.value;
  const priorDay = priorParts.length ? `${part("year")}-${part("month")}-${part("day")}` : null;
  const existingIncome = Number(recordedToday);
  const recorded = Number.isFinite(existingIncome) ? Math.max(0, existingIncome) : 0;

  // When upgrading during a day, retain the earnings already shown as the
  // starting change. If the previous reading is the peak, it also lets an
  // immediate downward reading reduce today's figure.
  const opening = Number.isFinite(savedOpening)
    ? savedOpening
    : Number.isFinite(priorBalance)
      ? priorDay === day ? (Number.isFinite(priorPeak) && Math.abs(priorPeak - priorBalance) < 0.000001
          ? priorPeak - recorded : priorBalance - recorded) : priorBalance
      : current;
  return {
    ...days,
    [day]: {
      openingBalanceUsd: opening,
      lastBalanceUsd: current,
      changeUsd: Number((current - opening).toFixed(8)),
    },
  };
}

export function withKryptexDailyBalance(sources, tracker, day) {
  const result = { ...sources };
  // The balance is a holding denominated in USD. Its movement is not income.
  delete result.Kryptex;
  const value = Number(tracker?.kryptexMiningDaily?.[day]);
  if (tracker?.kryptexConfirmedDays?.[day] && Number.isFinite(value) && value >= 0)
    result.Kryptex = value;
  return result;
}

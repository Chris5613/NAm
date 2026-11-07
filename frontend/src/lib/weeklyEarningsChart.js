export function buildWeeklyEarningsChart({
  todayKey,
  luloUtcDay,
  sourceTotalsForDay,
  earningsClock,
}) {
  const weekMonday = new Date(todayKey + "T12:00:00Z");
  weekMonday.setUTCDate(
    weekMonday.getUTCDate() - ((weekMonday.getUTCDay() + 6) % 7)
  );

  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekMonday);
    day.setUTCDate(weekMonday.getUTCDate() + index);
    const key = day.toISOString().slice(0, 10);
    const sources = sourceTotalsForDay(key);
    const value = Object.keys(sources).length
      ? Object.values(sources).reduce(
          (sum, amount) => sum + (Number(amount) || 0),
          0
        )
      : null;

    return {
      key,
      day: new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        timeZone: "UTC",
      }).format(day),
      date: new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(day),
      value:
        key > todayKey && key !== luloUtcDay
          ? null
          : value ?? (key === todayKey || key === luloUtcDay ? 0 : null),
      live: key === todayKey || (key === luloUtcDay && key > todayKey),
    };
  });

  const weekEarnings = weekDays.reduce(
    (total, day) => total + (day.value || 0),
    0
  );
  const observedWeekMaximum = Math.max(
    1,
    ...weekDays.map(day => day.value || 0)
  );

  const pacificClockParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(earningsClock));
  const clockPart = key =>
    Number(pacificClockParts.find(part => part.type === key)?.value || 0);
  const currentHour = clockPart("hour") + clockPart("minute") / 60;

  return {
    weekDays,
    weekEarnings,
    observedWeekMaximum,
    currentHour,
  };
}

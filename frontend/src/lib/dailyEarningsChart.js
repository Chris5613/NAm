/** Pure chart display shaping. Does not write or alter accounting observations. */
export function buildDailyEarningsChart(observations, todayKey, hourNow, totalToday) {
  // Today's intraday chart follows the same cumulative high-water rule as
  // the card. Repair any earlier same-day dip already saved before this rule.
  const storedDailyChartPointsRaw = Array.isArray(observations[todayKey])
    ? observations[todayKey] : [];
  let runningDailyHigh = 0;
  const dailyChartPoints = storedDailyChartPointsRaw
    .filter(point => Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.value)))
    .map(point => ({
      x: Math.max(0, Math.min(24, Number(point.x))),
      value: Math.max(0, Number(point.value)),
    }))
    .sort((a, b) => a.x - b.x)
    .map(point => {
      runningDailyHigh = Math.max(runningDailyHigh, point.value);
      return { ...point, value: runningDailyHigh };
    });
  // Several extensions can update almost simultaneously, making brief
  // down/up corrections draw needle-like spikes. Consolidate the *visual*
  // readings into fifteen-minute windows; the saved raw observations and
  // real earnings totals remain untouched.
  const chartBuckets = new Map();
  dailyChartPoints.forEach(point => {
    const bucket = Math.floor(point.x * 4);
    if (!chartBuckets.has(bucket)) chartBuckets.set(bucket, []);
    chartBuckets.get(bucket).push(point);
  });
  const bucketPoints = [...chartBuckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, points]) => {
      const sortedValues = points.map(point => point.value).sort((a, b) => a - b);
      const mid = Math.floor(sortedValues.length / 2);
      const median = sortedValues.length % 2
        ? sortedValues[mid]
        : (sortedValues[mid - 1] + sortedValues[mid]) / 2;
      return { x: points[points.length - 1].x, value: median };
    });
  // A single outlier bracketed by similar readings is an update artifact,
  // not a sustained change. Keep actual changes and recovery trends.
  const cleanPoints = bucketPoints.map((point, index) => {
    if (index === 0 || index === bucketPoints.length - 1) return point;
    const left = bucketPoints[index - 1];
    const right = bucketPoints[index + 1];
    const neighborDifference = Math.abs(left.value - right.value);
    const spikeSize = Math.abs(point.value - (left.value + right.value) / 2);
    return neighborDifference < 0.03 && spikeSize > 0.06
      ? { ...point, value: (left.value + right.value) / 2 } : point;
  });
  const dailyChartData = cleanPoints.length ? [...cleanPoints] : [{ x: hourNow, value: totalToday }];
  // Always end at the authoritative current total, not a smoothed estimate.
  if (dailyChartData[dailyChartData.length - 1].x < hourNow) {
    dailyChartData.push({ x: hourNow, value: totalToday });
  } else {
    dailyChartData[dailyChartData.length - 1] = {
      x: dailyChartData[dailyChartData.length - 1].x,
      value: totalToday,
    };
  }
  // Draw an explicitly labeled display baseline until the first reading.
  // This makes the line visible from midnight without changing saved earnings.
  const firstReadingHour = cleanPoints[0]?.x ?? hourNow;
  if (firstReadingHour > 0) {
    const baselineEnd = Math.max(0, firstReadingHour - 1 / 60);
    dailyChartData.unshift(...(baselineEnd > 0
      ? [{ x: 0, value: 0, displayBaseline: true }, { x: baselineEnd, value: 0, displayBaseline: true }]
      : [{ x: 0, value: 0, displayBaseline: true }]));
  }
  const dailyChartMax = Math.max(0.1, totalToday, ...dailyChartData.map(point => point.value)) * 1.2;
  const dailyChartMin = 0;
  // Show the whole day from midnight while ending at the present hour.
  const dailyChartEnd = Math.max(1, Math.min(24, Math.ceil(hourNow)));
  const dailyChartTicks = Array.from({ length: 25 }, (_, hour) => hour)
    .filter(hour => hour <= dailyChartEnd && (hour === 0 || hour === dailyChartEnd || hour % 4 === 0));
  return { dailyChartData, dailyChartMax, dailyChartMin, dailyChartEnd, dailyChartTicks };
}

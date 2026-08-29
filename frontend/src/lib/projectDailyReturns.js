export function normalizeDailyReturns(raw = {}, projects = []) {
  const next = {};
  const idKeys = new Set();

  for (const project of projects) {
    const projectId = project?.id != null ? String(project.id) : "";
    const projectName = project?.name ? String(project.name) : "";

    if (!projectId && !projectName) continue;

    const rawValue = raw[projectId];
    if (rawValue !== undefined && rawValue !== null && Number.isFinite(Number(rawValue))) {
      next[projectId] = Number(rawValue);
      idKeys.add(projectId);
    }
  }

  for (const [key, value] of Object.entries(raw || {})) {
    if (value === undefined || value === null || !Number.isFinite(Number(value))) continue;

    const normalizedValue = Number(value);
    const project = projects.find((p) => String(p.id) === String(key) || String(p.name) === String(key));

    if (project) {
      const projectId = String(project.id);
      if (!idKeys.has(projectId)) {
        next[projectId] = normalizedValue;
      }
      continue;
    }

    if (!(key in next)) {
      next[key] = normalizedValue;
    }
  }

  return next;
}

export function getAutoCalculatedDailyReturn(project, trxPrice = null) {
  const invested = Number(project?.invested) || 0;
  const apy = Number(project?.apy) || 0;
  const dailyTrx = Number(project?.daily_trx) || 0;
  const explicitPerDay = Number(project?.per_day) || 0;

  if (Number.isFinite(explicitPerDay) && explicitPerDay > 0) {
    return explicitPerDay;
  }

  if (Number.isFinite(dailyTrx) && dailyTrx > 0) {
    const resolvedTrxPrice = Number(trxPrice) || 0;
    if (resolvedTrxPrice > 0) {
      return dailyTrx * resolvedTrxPrice;
    }
  }

  if (Number.isFinite(invested) && invested > 0 && Number.isFinite(apy) && apy > 0) {
    return (invested * (apy / 100)) / 365;
  }

  return 0;
}

export function getDailyReturnValue(project, dailyReturns = {}, trxPrice = null) {
  const idKey = project?.id != null ? String(project.id) : "";
  const nameKey = project?.name ? String(project.name) : "";

  if (idKey && dailyReturns[idKey] !== undefined && dailyReturns[idKey] !== null) {
    const idValue = Number(dailyReturns[idKey]);
    if (Number.isFinite(idValue) && idValue >= 0) return idValue;
  }

  if (nameKey && dailyReturns[nameKey] !== undefined && dailyReturns[nameKey] !== null) {
    const nameValue = Number(dailyReturns[nameKey]);
    if (Number.isFinite(nameValue) && nameValue >= 0) return nameValue;
  }

  return getAutoCalculatedDailyReturn(project, trxPrice);
}

function toDayKey(date) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function nextDayKey(dayKey) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const next = new Date(year, month - 1, day + 1, 12);
  return toDayKey(next);
}

export function applyApyTransactionAccruals(projects = [], now = new Date()) {
  const currentDayKey = toDayKey(now);

  return projects.map((project) => {
    if (
      project?.yield_tracking === "sanctum_inf" ||
      project?.yield_tracking === "jupiter_inf_loop" ||
      project?.yield_tracking === "lulo_lending"
    ) {
      return project;
    }

    const invested = Number(project?.invested) || 0;
    const apy = Number(project?.apy) || 0;
    const dailyAmount = (invested * (apy / 100)) / 365;
    const lastDayKey = toDayKey(project?.last_accrued_at);

    if (!(dailyAmount > 0) || !currentDayKey) return project;

    if (project?.inactive === true || project?.is_inactive === true || !lastDayKey) {
      return { ...project, last_accrued_at: now.toISOString() };
    }

    const transactions = [...(project.transactions || [])];
    const accruedDates = new Set(
      transactions
        .filter((transaction) => transaction.source === "apy" && transaction.source_date)
        .map((transaction) => transaction.source_date)
    );
    let earnedDelta = 0;

    for (let dayKey = nextDayKey(lastDayKey); dayKey <= currentDayKey; dayKey = nextDayKey(dayKey)) {
      if (accruedDates.has(dayKey)) continue;

      const amount = Number(dailyAmount.toFixed(6));
      transactions.push({
        type: "earning",
        amount,
        category: "APY",
        notes: `APY daily accrual (${dayKey})`,
        date: dayKey,
        source: "apy",
        source_date: dayKey,
      });
      accruedDates.add(dayKey);
      earnedDelta += amount;
    }

    return {
      ...project,
      transactions,
      earned: (Number(project.earned) || 0) + earnedDelta,
      last_accrued_at: now.toISOString(),
    };
  });
}

export function applyDailyAccrual(project, trxPrice = null, now = new Date()) {
  const rate = getAutoCalculatedDailyReturn(project, trxPrice);
  if (!(rate > 0)) {
    return {
      ...project,
      last_accrued_at: project?.last_accrued_at || now.toISOString(),
    };
  }

  const lastAccruedAt = project?.last_accrued_at ? new Date(project.last_accrued_at) : null;
  const lastKey = lastAccruedAt && !Number.isNaN(lastAccruedAt.getTime()) ? toDayKey(lastAccruedAt) : null;
  const currentKey = toDayKey(now);

  if (lastKey && lastKey === currentKey) {
    return { ...project, last_accrued_at: project.last_accrued_at || now.toISOString() };
  }

  const elapsedDays = lastAccruedAt && !Number.isNaN(lastAccruedAt.getTime())
    ? Math.max(1, Math.ceil((now.getTime() - lastAccruedAt.getTime()) / (24 * 60 * 60 * 1000)))
    : 1;

  return {
    ...project,
    earned: (Number(project.earned) || 0) + (rate * elapsedDays),
    last_accrued_at: now.toISOString(),
  };
}

export function applyDailyAccruals(projects = [], trxPrice = null, now = new Date()) {
  return projects.map((project) => applyDailyAccrual(project, trxPrice, now));
}

export function setDailyReturn(project, dailyReturns = {}, value) {
  const next = { ...dailyReturns };
  const projectId = project?.id != null ? String(project.id) : null;
  const projectName = project?.name ? String(project.name) : null;

  if (projectId) {
    next[projectId] = Number(value) || 0;
  }

  if (projectName) {
    delete next[projectName];
  }

  return next;
}

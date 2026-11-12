// Dynamic, read-only accruals from Crypto Dashboard's reconciled monthly income.
// They are recomputed from the same source, never persisted as journal records:
// a provider refresh must replace—not append to—previous estimates.
const cents = value => Math.round((Number(value) || 0) * 100) / 100;
const normalize = value => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const keyFor = name => {
  const key = normalize(name);
  if (/roller\s*coin/.test(key)) return "rollercoin";
  if (/unity\s*network|unitynetwork|unetwork/.test(key)) return "unetwork";
  if (/kryptex/.test(key)) return "kryptex";
  if (/loopscale/.test(key)) return "loopscale";
  if (/\blulo\b/.test(key)) return "lulo";
  if (/\bsalad\b/.test(key)) return "salad";
  if (/stocks|dividend|\bvoo\b|\bvti\b/.test(key)) return "stocks";
  return key;
};
function debitAccountFor(sourceKey) {
  if (sourceKey === "lulo") return "luloCash";
  if (sourceKey === "loopscale") return "defi";
  if (sourceKey === "stocks") return "brokerage";
  if (["kryptex", "rollercoin", "salad", "unetwork"].includes(sourceKey)) return "platform:" + sourceKey;
  return "platform";
}
function lastDay(month) {
  const [year, number] = String(month).split("-").map(Number);
  return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
}

export function buildAutoIncomeJournal(month, incomeMonth, manualJournal = [], currentMonth = month, todayKey = null) {
  const syncedTotal = incomeMonth ? Math.max(0, cents(incomeMonth.total)) : null;
  const blank = {
    entries: [], syncedTotal, manualRevenueTotal: 0,
    generatedRevenueTotal: 0, unexplainedManualRevenue: 0,
  };
  if (!/^\d{4}-\d{2}$/.test(String(month)) || syncedTotal === null) return blank;

  const sources = new Map();
  for (const [name, raw] of Object.entries(incomeMonth.sources || {})) {
    const value = Math.max(0, cents(raw));
    const key = keyFor(name);
    if (value <= 0 || !key) continue;
    if (sources.has(key)) sources.get(key).amount = cents(sources.get(key).amount + value);
    else sources.set(key, { key, label: name, amount: value });
  }
  const reportedSources = cents([...sources.values()].reduce((sum, source) => sum + source.amount, 0));
  if (syncedTotal > reportedSources) {
    sources.set("unallocated-income", {
      key: "unallocated-income", label: "Unallocated tracked income",
      amount: cents(syncedTotal - reportedSources),
    });
  }

  // Recognize only manual entries explicitly credited to income. A withdrawal
  // or wallet transfer credits an ASSET account and does not cancel accruals.
  const manualRevenue = (manualJournal || []).filter(entry =>
    String(entry.date || "").slice(0, 7) === month &&
    ["revenue", "dividendRevenue"].includes(entry.creditAccount) &&
    Number(entry.amount) > 0);
  const manualRevenueTotal = cents(manualRevenue.reduce((sum, entry) => sum + Number(entry.amount), 0));
  const remainingBySource = [...sources.values()].map(source => ({ ...source }));
  let unattributedManual = 0;
  for (const entry of manualRevenue) {
    const description = keyFor(entry.description);
    const source = remainingBySource.find(row => description.includes(row.key) ||
      (row.key === "stocks" && /dividend|\bvoo\b|\bvti\b/.test(description)));
    if (!source) {
      unattributedManual = cents(unattributedManual + entry.amount);
      continue;
    }
    const offset = Math.min(source.amount, cents(entry.amount));
    source.amount = cents(source.amount - offset);
    unattributedManual = cents(unattributedManual + Math.max(0, cents(entry.amount) - offset));
  }

  // Anonymous manual revenue still replaces the same amount of automatic
  // income; prioritize consuming unallocated rows before named providers.
  const priority = [...remainingBySource].sort((a, b) =>
    Number(b.key === "unallocated-income") - Number(a.key === "unallocated-income"));
  for (const source of priority) {
    const offset = Math.min(unattributedManual, source.amount);
    source.amount = cents(source.amount - offset);
    unattributedManual = cents(unattributedManual - offset);
  }

  const totalAllowed = Math.max(0, cents(syncedTotal - manualRevenueTotal));
  let remaining = totalAllowed;
  const date = month === currentMonth && todayKey?.startsWith(month) ? todayKey : lastDay(month);
  const entries = [];
  for (const source of remainingBySource) {
    const value = Math.min(remaining, Math.max(0, cents(source.amount)));
    if (value <= 0) continue;
    const debitAccount = debitAccountFor(source.key);
    entries.push({
      id: "synced-income:" + month + ":" + encodeURIComponent(source.key),
      date, description: "Synced " + source.label + " income",
      automatic: true, origin: "crypto-income", amount: value,
      lines: [
        { account: debitAccount, debit: value, credit: 0 },
        { account: source.key === "stocks" ? "dividendRevenue" : "revenue", debit: 0, credit: value },
      ],
    });
    remaining = cents(remaining - value);
  }
  const generatedRevenueTotal = cents(entries.reduce((sum, row) => sum + row.amount, 0));
  return {
    entries, syncedTotal, manualRevenueTotal, generatedRevenueTotal,
    unexplainedManualRevenue: Math.max(0, cents(manualRevenueTotal - syncedTotal)),
  };
}

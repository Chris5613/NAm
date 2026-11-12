// Transaction-level accounting: never infer a withdrawal or fee from a
// declining account balance. Only explicit, dated, identified events qualify.
const round = n => Math.round((Number(n) || 0) * 100) / 100;
const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;
const sourceKey = name => String(name || "").toLowerCase().trim().replace(/[\s_-]/g, "");
export const ACCOUNT_OPTIONS = [
  { id: "cash", name: "Cash / Bank" },
  { id: "crypto", name: "BTC / Crypto Wallet" },
  { id: "luloCash", name: "Lulo" },
  { id: "defi", name: "Loopscale / DeFi" },
  { id: "platform:kryptex", name: "Kryptex" },
  { id: "platform:rollercoin", name: "RollerCoin" },
  { id: "platform:salad", name: "Salad" },
  { id: "platform:unetwork", name: "Unetwork" },
  { id: "platform", name: "Other Platform" },
  { id: "brokerage", name: "Brokerage" },
];

export function resolveFinancialAccount(value) {
  const key = sourceKey(value);
  if (!key) return null;
  const known = {
    cash: "cash", bank: "cash", checking: "cash", savings: "cash",
    btc: "crypto", bitcoin: "crypto", btcwallet: "crypto", cryptowallet: "crypto",
    lulo: "luloCash", lulosavings: "luloCash", loopscale: "defi",
    defi: "defi", brokerage: "brokerage", stock: "brokerage",
    kryptex: "platform:kryptex", kryptexwallet: "platform:kryptex", rollercoin: "platform:rollercoin", rollercoinwallet: "platform:rollercoin",
    salad: "platform:salad", unetwork: "platform:unetwork",
    unitynetwork: "platform:unetwork", platform: "platform",
  };
  return known[key] || (ACCOUNT_OPTIONS.some(item => item.id === value) ? value : null);
}

function recordId(row, project) {
  const raw = row?.id ?? row?.transactionId ?? row?.txid ?? row?.hash ?? row?.signature;
  const id = String(raw ?? "").trim();
  return id && id.length <= 180 ? "project:" + String(project?.id || project?.name || "other") + ":" + id : null;
}

export function collectMovementCandidates(projects) {
  const candidates = new Map();
  for (const project of projects || []) {
    const provider = String(project?.name || "").trim();
    for (const row of Array.isArray(project?.transactions) ? project.transactions : []) {
      const type = String(row?.type || "").trim().toLowerCase();
      if (!["withdraw", "withdrawal", "transfer", "deposit", "fee", "transaction_fee", "network_fee"].includes(type)) continue;
      const id = recordId(row, project);
      const date = String(row.source_date || row.date || row.occurred_at || row.created_at || "").slice(0, 10);
      const amount = Math.abs(Number(row.amountUsd ?? row.amount));
      if (!id || !VALID_DATE.test(date) || !Number.isFinite(amount) || amount <= 0) continue;
      const unit = String(row.currency || row.unit || "USD").toUpperCase();
      if (unit !== "USD") continue; // Never silently treat a coin amount as USD.
      const metadata = row.data && typeof row.data === "object" ? row.data : {};
      const from = resolveFinancialAccount(row.fromAccount || row.from || row.sourceAccount ||
        metadata.fromAccount || metadata.from ||
        (type === "fee" || type.endsWith("_fee") || type.startsWith("withdraw") ? provider : null));
      const to = resolveFinancialAccount(row.toAccount || row.to || row.destinationAccount ||
        metadata.toAccount || metadata.to);
      const fee = Number(row.feeUsd ?? row.networkFeeUsd ?? metadata.feeUsd ?? 0);
      const feeUsd = Number.isFinite(fee) && fee >= 0 ? round(fee) : 0;
      const isFee = type === "fee" || type === "transaction_fee" || type === "network_fee";
      // A single confirmed provider event may carry both transfer and fee.
      const matchable = isFee ? Boolean(from) : Boolean(from && to && from !== to);
      candidates.set(id, {
        id, date, amount: round(amount), type, provider, from, to, feeUsd,
        matchable, issue: matchable ? "" : isFee
          ? "Verify which account paid the fee"
          : "Confirm the destination and source before posting",
      });
    }
  }
  return [...candidates.values()].sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

// Bank transactions are a review source, not automatically business spending.
// Signed amounts/categories alone cannot establish that money moved between
// two user's mining accounts, or that a personal bank fee is a business fee.
export function collectBankMovementCandidates(transactions) {
  const seen = new Map();
  for (const row of transactions || []) {
    const id = String(row?.id || "").trim();
    const date = String(row?.date || "").slice(0, 10);
    const amount = Math.abs(Number(row?.amount));
    const label = String(row?.merchant || row?.description || "").trim();
    const category = String(row?.category || "").toLowerCase();
    if (!id || !VALID_DATE.test(date) || !Number.isFinite(amount) || amount <= 0 ||
      row?.pending || row?.hidden) continue;
    const fee = /\b(fee|commission)\b/i.test(label) || /\bfees?\b/i.test(category);
    const transfer = /\b(transfers?|payments?)\b/i.test(category);
    const miningPayout = /kryptex|roller\s?coin|salad|unetwork|unity network|loopscale|lulo/i.test(label) &&
      /\bincome\b/i.test(category);
    if (!fee && !transfer && !miningPayout) continue;
    const payoutFrom = miningPayout
      ? resolveFinancialAccount(label.match(/kryptex|roller\s?coin|salad|unetwork|unity network|loopscale|lulo/i)?.[0])
      : null;
    seen.set("bank:" + id, {
      id: "bank:" + id, date, amount: round(amount),
      type: fee ? "fee" : "transfer", provider: label || "Bank record",
      from: payoutFrom, to: miningPayout ? "cash" : null, feeUsd: 0, matchable: false,
      issue: "Confirm this is a mining-business transaction and select its account(s)",
      bankSource: true,
    });
  }
  return [...seen.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function movementJournal(movements, month, excludeIds = new Set()) {
  const entries = [];
  for (const m of movements || []) {
    if (String(m.date).slice(0, 7) !== month || excludeIds.has(m.id)) continue;
    const from = resolveFinancialAccount(m.from);
    const to = resolveFinancialAccount(m.to);
    const amount = round(m.amount);
    const isFee = ["fee","transaction_fee","network_fee"].includes(m.type);
    if (!VALID_DATE.test(m.date) || !(amount > 0) || !from || (!isFee && (!to || from === to))) continue;
    const description = isFee ? ("Transaction fee — " + (m.provider || "Transfer"))
      : ("Transfer " + (m.provider || "") + " · " + from + " → " + to);
    entries.push({
      id: "auto-movement:" + m.id, date: m.date, description,
      automatic: true, origin: "confirmed-movement",
      lines: isFee
        ? [{account:"fees",debit:amount,credit:0},{account:from,debit:0,credit:amount}]
        : [{account:to,debit:amount,credit:0},{account:from,debit:0,credit:amount}],
    });
    if (!isFee && Number(m.feeUsd) > 0) {
      const fee = round(m.feeUsd);
      entries.push({
        id: "auto-fee:" + m.id, date: m.date,
        description: "Transfer fee — " + (m.provider || "Transfer"),
        automatic: true, origin: "confirmed-movement",
        lines: [{account:"fees",debit:fee,credit:0},{account:from,debit:0,credit:fee}],
      });
    }
  }
  return entries;
}

// Find account changes that might be explained by a transfer, payment,
// valuation difference, or missing transaction. Never auto-post this variance.
export function reconcileBalances(balanceRows, incomeMonth, movements, month) {
  const result = [];
  const earningByKey = {};
  for (const [name, amount] of Object.entries(incomeMonth?.sources || {})) {
    const key = sourceKey(name);
    earningByKey[key] = round((earningByKey[key] || 0) + Number(amount || 0));
  }
  const movedByAccount = {};
  for (const entry of movementJournal(movements, month)) {
    for (const part of entry.lines) {
      movedByAccount[part.account] = round((movedByAccount[part.account] || 0) + part.debit - part.credit);
    }
  }
  for (const row of balanceRows || []) {
    if (row.start == null || row.end == null || row.category === "equipment" || row.category === "liabilities") continue;
    const acct = resolveFinancialAccount(row.name);
    if (!acct) continue;
    const delta = round(row.end - row.start);
    const estimatedIncome = earningByKey[sourceKey(row.name)] || 0;
    const transfers = movedByAccount[acct] || 0;
    const unexplained = round(delta - estimatedIncome - transfers);
    result.push({ name: row.name, account: acct, start: row.start, end: row.end,
      delta, estimatedIncome, transfers, unexplained,
      // BTC is USD-marked-to-market, and DeFi can have market price changes.
      valuationSensitive: row.name.toLowerCase() === "btc" || row.category === "defi",
    });
  }
  return result;
}

export function movementFromReview(candidate, overrides = {}) {
  const next = {...candidate,...overrides};
  const from = resolveFinancialAccount(next.from), to = resolveFinancialAccount(next.to);
  const isFee = ["fee","transaction_fee","network_fee"].includes(next.type);
  if (!next.id || !VALID_DATE.test(next.date) || !(Number(next.amount) > 0) ||
    !from || (!isFee && (!to || from === to))) return null;
  return {...next, from, to, amount: round(next.amount), feeUsd: round(next.feeUsd || 0),
    matchable: true, issue: "", reviewed: true};
}

// Deterministic sample data so the spending views can be explored before a real
// Plaid account is linked.

const ACCOUNTS = [
  { id: "sample-checking", name: "Checking", type: "checking", currentBalance: 5848, sample: true },
  { id: "sample-card", name: "Card Balance", type: "credit", currentBalance: 2001, sample: true },
  { id: "sample-savings", name: "Savings", type: "savings", currentBalance: 267, sample: true },
];

const MERCHANTS = [
  { merchant: "Whole Foods", category: "Food & drink", min: 42, max: 165, account: "sample-card" },
  { merchant: "McDonald's", category: "Food & drink", min: 9, max: 24, account: "sample-card" },
  { merchant: "Blue Bottle Coffee", category: "Food & drink", min: 6, max: 19, account: "sample-card" },
  { merchant: "Costco", category: "Shopping", min: 120, max: 640, account: "sample-checking" },
  { merchant: "Nordstrom", category: "Shopping", min: 75, max: 320, account: "sample-card" },
  { merchant: "Amazon", category: "Shopping", min: 18, max: 210, account: "sample-card" },
  { merchant: "Shell", category: "Transport", min: 38, max: 92, account: "sample-card" },
  { merchant: "Uber", category: "Transport", min: 12, max: 58, account: "sample-card" },
  { merchant: "Walgreens", category: "Health", min: 14, max: 86, account: "sample-checking" },
  { merchant: "Netflix", category: "Entertainment", min: 16, max: 23, account: "sample-card" },
  { merchant: "AMC Theatres", category: "Entertainment", min: 26, max: 74, account: "sample-card" },
];

const RECURRING = [
  { merchant: "Rent", category: "Home", amount: 2150, day: 1, account: "sample-checking" },
  { merchant: "City Utilities", category: "Bills", amount: 148, day: 8, account: "sample-checking" },
  { merchant: "Verizon", category: "Bills", amount: 92, day: 14, account: "sample-checking" },
];

// Small LCG keeps the generated set stable across reloads.
function createRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function toDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function createSampleSpendingData(now = new Date()) {
  const random = createRandom(20260906);
  const year = now.getFullYear();
  const transactions = [];

  for (let month = 0; month <= now.getMonth(); month += 1) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lastDay = month === now.getMonth() ? now.getDate() : daysInMonth;

    RECURRING.forEach((bill) => {
      if (bill.day > lastDay) return;
      transactions.push({
        id: `sample-${bill.merchant}-${year}-${month}`,
        merchant: bill.merchant,
        category: bill.category,
        amount: bill.amount,
        date: toDateKey(year, month, bill.day),
        accountId: bill.account,
        sample: true,
      });
    });

    const count = 7 + Math.floor(random() * 5);
    for (let index = 0; index < count; index += 1) {
      const template = MERCHANTS[Math.floor(random() * MERCHANTS.length)];
      const day = 1 + Math.floor(random() * lastDay);
      transactions.push({
        id: `sample-${month}-${index}`,
        merchant: template.merchant,
        category: template.category,
        amount: Math.round(template.min + random() * (template.max - template.min)),
        date: toDateKey(year, month, day),
        accountId: template.account,
        sample: true,
      });
    }
  }

  const upcoming = [
    { merchant: "Spotify", category: "Entertainment", amount: 12, offset: 1 },
    { merchant: "Car Insurance", category: "Bills", amount: 186, offset: 3 },
    { merchant: "Gym Membership", category: "Health", amount: 45, offset: 5 },
  ].map((item, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + item.offset);
    return {
      id: `sample-upcoming-${index}`,
      merchant: item.merchant,
      category: item.category,
      amount: item.amount,
      date: toDateKey(date.getFullYear(), date.getMonth(), date.getDate()),
      accountId: "sample-checking",
      sample: true,
    };
  });

  return {
    accounts: ACCOUNTS,
    transactions: [...transactions, ...upcoming].sort((first, second) => second.date.localeCompare(first.date)),
    budget: 4000,
  };
}

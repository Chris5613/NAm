export const CATEGORIES = [
  "Housing", "Utilities", "Groceries", "Dining", "Gas & Fuel", "Transportation", "Travel",
  "Shopping", "Subscriptions", "Entertainment", "Health", "Personal Care", "Pets", "Education",
  "Insurance", "Taxes", "Fees", "Income", "Transfers", "Payments", "Other",
];

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const CATEGORY_COLORS = ["#60a5fa", "#34d399", "#a78bfa", "#f472b6", "#22d3ee", "#818cf8", "#2dd4bf", "#94a3b8"];
export const SIMPLEFIN_REQUEST_HOUR_KEY = "simplefin_request_hour";

export const dayKey = (date) => date.toISOString().slice(0, 10);
export const monthKeyOf = (date = new Date()) => date.toISOString().slice(0, 7);

export const hourKeyOf = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}`;
};

export const nextHourOf = (date = new Date()) => {
  const nextHour = new Date(date);
  nextHour.setHours(date.getHours() + 1, 0, 0, 0);
  return nextHour;
};

export const timeLabel = (date) =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);

export const simplefinHourLock = (date = new Date()) => {
  const nextHour = nextHourOf(date);
  const currentHour = hourKeyOf(date);
  return {
    isLocked: false,
    currentHour,
    nextHourLabel: timeLabel(nextHour),
  };
};

export const reserveSimplefinHour = () => undefined;

export const money = (amount, fallback = "$0") =>
  amount === null || amount === undefined || Number.isNaN(Number(amount))
    ? fallback
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(amount);

export const humanDate = (date) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));

export const emptyTransaction = () => ({
  merchant: "",
  amount: "",
  category: "Dining",
  date: dayKey(new Date()),
  accountId: "",
});

export function shiftMonth(key, amount) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function daysInMonth(key) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

export function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return `${new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long" })} ${year}`;
}

export const isIncome = (item) => item.category === "Income";
export const isExpense = (item) => !["Income", "Transfers", "Payments"].includes(item.category);

export function cumulativeByDay(items, key, length, predicate = isExpense) {
  const totals = new Map();
  items
    .filter((item) => item.date?.startsWith(key) && predicate(item))
    .forEach((item) => {
      const day = Number(item.date.slice(-2));
      totals.set(day, (totals.get(day) || 0) + Math.abs(Number(item.amount || 0)));
    });
  let running = 0;
  return Array.from({ length }, (_, index) => {
    running += totals.get(index + 1) || 0;
    return running;
  });
}

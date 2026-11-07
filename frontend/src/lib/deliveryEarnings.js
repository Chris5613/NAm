export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function currentMonthKey(date = new Date()) {
  return todayKey(date).slice(0, 7);
}

export function formatDeliveryMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export function prettyDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function shiftMonth(monthKey, delta) {
  const [year, month] = monthKey.split("-").map(Number);
  const next = new Date(year, month - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

export function addDaysKey(dateKey, days) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const date = new Date(year, month - 1, day + days, 12, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function getWeekStartKey(dateKey = todayKey()) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  return addDaysKey(dateKey, -daysSinceMonday);
}

export function weekRangeLabel(startKey) {
  const endKey = addDaysKey(startKey, 6);
  const start = new Date(`${startKey}T12:00:00`);
  const end = new Date(`${endKey}T12:00:00`);
  const sameMonth = start.getMonth() === end.getMonth();

  if (sameMonth) {
    return `${start.toLocaleDateString("en-US", { month: "short" })} ${start.getDate()} – ${end.getDate()}`;
  }

  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export function getEarnings(entry) {
  if (Number.isFinite(Number(entry?.earnings))) return Number(entry.earnings);
  if (Number.isFinite(Number(entry?.gross))) return Number(entry.gross);
  if (Number.isFinite(Number(entry?.total))) return Number(entry.total);

  return (
    (Number(entry?.basePay) || 0) +
    (Number(entry?.tips) || 0) +
    (Number(entry?.promo) || 0)
  );
}

export function getExpenses(entry) {
  return Math.max(0, Number(entry?.expenses) || 0);
}

export function getNet(entry) {
  return getEarnings(entry) - getExpenses(entry);
}

export function getDeliveryApp(entry) {
  const app = String(entry?.app || entry?.platform || "Uber Eats").trim();
  if (app === "Instacart") return "Instacart";
  if (app === "Shipt") return "Shipt";
  if (app === "Uber Eats") return "Uber Eats";
  return "DoorDash";
}

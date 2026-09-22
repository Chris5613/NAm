import { useMemo, useState } from "react";
import { remoteStorage } from "@/lib/serverStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Car,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Plus,
  ReceiptText,
  Trash2,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const STORAGE_KEY = "doordash_earnings_v1";
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function readEntries() {
  try {
    const value = JSON.parse(
      remoteStorage.getItem(STORAGE_KEY) || "[]"
    );

    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveEntries(value) {
  remoteStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(value)
  );
}

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");
  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function monthKey(date = new Date()) {
  return dateKey(date).slice(0, 7);
}

function shiftMonth(key, amount) {
  const [year, month] =
    key.split("-").map(Number);

  return monthKey(
    new Date(
      year,
      month - 1 + amount,
      1
    )
  );
}

function monthLabel(key) {
  const [year, month] =
    key.split("-").map(Number);

  return new Date(
    year,
    month - 1,
    1
  ).toLocaleDateString(
    "en-US",
    {
      month: "long",
      year: "numeric",
    }
  );
}

function money(value) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  ).format(
    Number(value) || 0
  );
}

function compactMoney(value) {
  return money(value).replace(
    ".00",
    ""
  );
}

function prettyDate(key) {
  return new Date(
    `${key}T12:00:00`
  ).toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );
}

function getGross(entry) {
  if (
    Number.isFinite(
      Number(entry?.gross)
    )
  ) {
    return Number(
      entry.gross
    );
  }

  if (
    Number.isFinite(
      Number(entry?.total)
    )
  ) {
    return Number(
      entry.total
    );
  }

  return (
    (Number(
      entry?.basePay
    ) || 0) +
    (Number(
      entry?.tips
    ) || 0)
  );
}

function getExpenses(entry) {
  return Math.max(
    0,
    Number(
      entry?.expenses
    ) || 0
  );
}

function getNet(entry) {
  if (
    Number.isFinite(
      Number(entry?.net)
    )
  ) {
    return Number(
      entry.net
    );
  }

  return (
    getGross(entry) -
    getExpenses(entry)
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="h-4 w-4" />
          {label}
        </div>

        <div className="mt-3 text-[28px] font-semibold tracking-tight">
          {value}
        </div>

        <div className="mt-1 text-xs text-muted-foreground">
          {detail}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DoorDashPage() {
  const [
    entries,
    setEntries,
  ] = useState(
    readEntries
  );

  const [
    selectedMonth,
    setSelectedMonth,
  ] = useState(
    monthKey()
  );

  const [
    addOpen,
    setAddOpen,
  ] = useState(false);

  const [
    form,
    setForm,
  ] = useState({
    date: dateKey(),
    basePay: "",
    tips: "",
    expenses: "",
    hours: "",
    deliveries: "",
  });

  const selectedYear =
    selectedMonth.slice(
      0,
      4
    );

  const monthEntries =
    useMemo(
      () =>
        entries
          .filter(
            (entry) =>
              entry.date?.startsWith(
                selectedMonth
              )
          )
          .sort(
            (a, b) =>
              b.date.localeCompare(
                a.date
              )
          ),
      [
        entries,
        selectedMonth,
      ]
    );

  const yearEntries =
    useMemo(
      () =>
        entries.filter(
          (entry) =>
            entry.date?.startsWith(
              selectedYear
            )
        ),
      [
        entries,
        selectedYear,
      ]
    );

  const monthGross =
    monthEntries.reduce(
      (sum, entry) =>
        sum +
        getGross(entry),
      0
    );

  const monthExpenses =
    monthEntries.reduce(
      (sum, entry) =>
        sum +
        getExpenses(entry),
      0
    );

  const monthNet =
    monthEntries.reduce(
      (sum, entry) =>
        sum +
        getNet(entry),
      0
    );

  const yearNet =
    yearEntries.reduce(
      (sum, entry) =>
        sum +
        getNet(entry),
      0
    );

  const allTimeNet =
    entries.reduce(
      (sum, entry) =>
        sum +
        getNet(entry),
      0
    );

  const hours =
    monthEntries.reduce(
      (sum, entry) =>
        sum +
        (Number(
          entry.hours
        ) || 0),
      0
    );

  const deliveries =
    monthEntries.reduce(
      (sum, entry) =>
        sum +
        (Number(
          entry.deliveries
        ) || 0),
      0
    );

  const hourly =
    hours > 0
      ? monthNet /
        hours
      : 0;

  const perDelivery =
    deliveries > 0
      ? monthNet /
        deliveries
      : 0;

  const chartData =
    useMemo(
      () => {
        const byDay = {};

        monthEntries.forEach(
          (entry) => {
            const date =
              entry.date;

            if (
              !byDay[date]
            ) {
              byDay[
                date
              ] = {
                gross: 0,
                expenses: 0,
                net: 0,
              };
            }

            byDay[
              date
            ].gross +=
              getGross(
                entry
              );

            byDay[
              date
            ].expenses +=
              getExpenses(
                entry
              );

            byDay[
              date
            ].net +=
              getNet(
                entry
              );
          }
        );

        return Object.entries(
          byDay
        )
          .sort(
            ([a], [b]) =>
              a.localeCompare(
                b
              )
          )
          .map(
            ([
              date,
              values,
            ]) => ({
              date,
              label:
                new Date(
                  `${date}T12:00:00`
                ).toLocaleDateString(
                  "en-US",
                  {
                    month:
                      "short",
                    day:
                      "numeric",
                  }
                ),
              ...values,
            })
          );
      },
      [
        monthEntries,
      ]
    );

  const monthTiles =
    useMemo(
      () => {
        const totals = {};

        yearEntries.forEach(
          (entry) => {
            const key =
              entry.date.slice(
                0,
                7
              );

            totals[key] =
              (
                totals[
                  key
                ] || 0
              ) +
              getNet(
                entry
              );
          }
        );

        return MONTHS.map(
          (
            label,
            index
          ) => {
            const key =
              `${selectedYear}-${String(
                index + 1
              ).padStart(
                2,
                "0"
              )}`;

            return {
              key,
              label,
              net:
                totals[
                  key
                ] || 0,
              hasEntries:
                entries.some(
                  (entry) =>
                    entry.date?.startsWith(
                      key
                    )
                ),
            };
          }
        );
      },
      [
        entries,
        selectedYear,
        yearEntries,
      ]
    );

  const formGross =
    (
      Number(
        form.basePay
      ) || 0
    ) +
    (
      Number(
        form.tips
      ) || 0
    );

  const formExpenses =
    Math.max(
      0,
      Number(
        form.expenses
      ) || 0
    );

  const formNet =
    formGross -
    formExpenses;

  function update(
    field,
    value
  ) {
    setForm(
      (current) => ({
        ...current,
        [field]:
          value,
      })
    );
  }

  function resetForm(
    keepDate = true
  ) {
    setForm(
      (current) => ({
        date:
          keepDate
            ? current.date
            : dateKey(),
        basePay: "",
        tips: "",
        expenses: "",
        hours: "",
        deliveries: "",
      })
    );
  }

  function addEntry(
    event
  ) {
    event.preventDefault();

    if (
      !form.date ||
      formGross <= 0
    ) {
      return;
    }

    const entry = {
      id:
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(
            2,
            8
          )}`,
      date:
        form.date,
      basePay:
        Number(
          form.basePay
        ) || 0,
      tips:
        Number(
          form.tips
        ) || 0,
      expenses:
        formExpenses,
      gross:
        formGross,
      net:
        formNet,
      hours:
        Math.max(
          0,
          Number(
            form.hours
          ) || 0
        ),
      deliveries:
        Math.max(
          0,
          Math.round(
            Number(
              form.deliveries
            ) || 0
          )
        ),
    };

    setEntries(
      (current) => {
        const next = [
          entry,
          ...current,
        ];

        saveEntries(
          next
        );

        return next;
      }
    );

    setSelectedMonth(
      form.date.slice(
        0,
        7
      )
    );

    resetForm();
    setAddOpen(false);
  }

  function removeEntry(
    id
  ) {
    if (
      !window.confirm(
        "Delete this DoorDash earnings entry?"
      )
    ) {
      return;
    }

    setEntries(
      (current) => {
        const next =
          current.filter(
            (entry) =>
              entry.id !==
              id
          );

        saveEntries(
          next
        );

        return next;
      }
    );
  }

  return (
    <div
      className="space-y-8"
      data-testid="doordash-page"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-red-400">
            DoorDash
          </p>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Earnings Tracker
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Track pay, tips,
            expenses, hours, and
            deliveries.
          </p>
        </div>

        <Button
          onClick={() =>
            setAddOpen(true)
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          Add earnings
        </Button>
      </div>

      {/* Gamble-page style month selector */}
      <Card className="border-border/60">
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() =>
                setSelectedMonth(
                  (value) =>
                    shiftMonth(
                      value,
                      -1
                    )
                )
              }
              className="h-10 w-10 rounded-lg border border-border/40 bg-secondary/40 text-2xl font-bold text-foreground hover:bg-secondary"
              aria-label="Previous month"
            >
              &lt;
            </button>

            <div className="flex-1 text-center">
              <h2 className="text-3xl font-bold tracking-wide text-foreground">
                {monthLabel(
                  selectedMonth
                )}
              </h2>

              <p className="mt-1 font-mono text-xs font-semibold text-white">
                {selectedYear} Yearly Net:{" "}
                <span
                  className={
                    yearNet >= 0
                      ? "text-emerald-300"
                      : "text-rose-300"
                  }
                >
                  {yearNet >= 0
                    ? "+"
                    : ""}
                  {money(
                    yearNet
                  )}
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setSelectedMonth(
                  (value) =>
                    shiftMonth(
                      value,
                      1
                    )
                )
              }
              disabled={
                selectedMonth >=
                monthKey()
              }
              className="h-10 w-10 rounded-lg border border-border/40 bg-secondary/40 text-2xl font-bold text-foreground hover:bg-secondary disabled:opacity-40"
              aria-label="Next month"
            >
              &gt;
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6 lg:grid-cols-12">
            {monthTiles.map(
              (month) => {
                const isActive =
                  month.key ===
                  selectedMonth;

                const isPositive =
                  month.net >= 0;

                return (
                  <button
                    key={
                      month.key
                    }
                    type="button"
                    onClick={() =>
                      setSelectedMonth(
                        month.key
                      )
                    }
                    className={`min-w-0 rounded-md border px-2 py-3 text-center transition-colors ${
                      isActive
                        ? "border-emerald-400/70 bg-emerald-500/10"
                        : "border-border/40 bg-secondary/30 hover:bg-secondary/60"
                    }`}
                  >
                    <span className="block text-xs uppercase text-muted-foreground">
                      {
                        month.label
                      }
                    </span>

                    <span
                      className={`mt-1 block truncate text-xs font-mono font-semibold ${
                        month.hasEntries
                          ? isPositive
                            ? "text-emerald-300"
                            : "text-rose-300"
                          : "text-muted-foreground"
                      }`}
                    >
                      {month.hasEntries
                        ? `${month.net >= 0 ? "+" : ""}${compactMoney(month.net)}`
                        : "-"}
                    </span>
                  </button>
                );
              }
            )}
          </div>

          <div className="h-px bg-border/50" />

          <div className="flex items-center justify-between rounded-lg border border-border/40 bg-secondary/40 p-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {monthLabel(
                  selectedMonth
                )} net
              </p>

              <p
                className={`mt-1 text-lg font-bold font-mono ${
                  monthNet >= 0
                    ? "text-emerald-300"
                    : "text-rose-300"
                }`}
              >
                {monthNet >= 0
                  ? "+"
                  : ""}
                {money(
                  monthNet
                )}
              </p>
            </div>

            <div className="text-right text-xs text-muted-foreground">
              <div>
                Gross{" "}
                {money(
                  monthGross
                )}
              </div>

              <div className="mt-1">
                Expenses{" "}
                {money(
                  monthExpenses
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={
            CircleDollarSign
          }
          label="Net This Month"
          value={money(
            monthNet
          )}
          detail={`Gross ${money(monthGross)} · Expenses ${money(monthExpenses)}`}
        />

        <Metric
          icon={
            TrendingUp
          }
          label={`${selectedYear} Net`}
          value={money(
            yearNet
          )}
          detail={`All-time net ${money(allTimeNet)}`}
        />

        <Metric
          icon={Clock3}
          label="Net / Hour"
          value={money(
            hourly
          )}
          detail={`${hours.toFixed(1)} hours this month`}
        />

        <Metric
          icon={Car}
          label="Net / Delivery"
          value={money(
            perDelivery
          )}
          detail={`${deliveries} deliveries this month`}
        />
      </div>

      <Card className="border-border/60">
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold">
            Daily Net Earnings
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            {monthLabel(
              selectedMonth
            )}
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="p-0">
          <div className="flex items-center gap-2 border-b border-border/60 px-6 py-5">
            <ReceiptText className="h-5 w-5" />

            <div>
              <h2 className="font-semibold">
                Earnings Log
              </h2>

              <p className="text-xs text-muted-foreground">
                {monthLabel(
                  selectedMonth
                )}
              </p>
            </div>
          </div>

          {monthEntries.length ? (
            <div className="divide-y divide-border/50">
              {monthEntries.map(
                (entry) => {
                  const gross =
                    getGross(
                      entry
                    );

                  const expenses =
                    getExpenses(
                      entry
                    );

                  const net =
                    getNet(
                      entry
                    );

                  return (
                    <div
                      key={
                        entry.id
                      }
                      className="flex flex-wrap items-center gap-5 px-6 py-4"
                    >
                      <div className="min-w-[150px] flex-1">
                        <div className="text-sm font-medium">
                          {prettyDate(
                            entry.date
                          )}
                        </div>

                        <div className="mt-1 text-xs text-muted-foreground">
                          {Number(
                            entry.deliveries
                          ) || 0}{" "}
                          deliveries
                          {Number(
                            entry.hours
                          ) > 0
                            ? ` · ${Number(entry.hours).toFixed(1)} hrs`
                            : ""}
                        </div>
                      </div>

                      <div className="text-right text-xs text-muted-foreground">
                        <div>
                          Pay{" "}
                          {money(
                            entry.basePay
                          )}
                        </div>

                        <div>
                          Tips{" "}
                          {money(
                            entry.tips
                          )}
                        </div>

                        <div>
                          Expenses{" "}
                          {money(
                            expenses
                          )}
                        </div>
                      </div>

                      <div className="min-w-[120px] text-right">
                        <div className="text-xs text-muted-foreground">
                          Gross{" "}
                          {money(
                            gross
                          )}
                        </div>

                        <div
                          className={`mt-1 font-semibold font-mono ${
                            net >= 0
                              ? "text-emerald-300"
                              : "text-rose-300"
                          }`}
                        >
                          {net >= 0
                            ? "+"
                            : ""}
                          {money(
                            net
                          )}{" "}
                          net
                        </div>

                        {Number(
                          entry.hours
                        ) > 0 && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {money(
                              net /
                                Number(
                                  entry.hours
                                )
                            )}
                            /hr
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          removeEntry(
                            entry.id
                          )
                        }
                        className="text-muted-foreground hover:text-red-400"
                        title="Delete entry"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                }
              )}
            </div>
          ) : (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              No DoorDash
              earnings logged
              for this month
              yet.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add earnings popup */}
      <Dialog
        open={addOpen}
        onOpenChange={
          setAddOpen
        }
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Add DoorDash
              earnings
            </DialogTitle>

            <DialogDescription>
              Log your pay,
              tips, expenses,
              hours, and
              deliveries for
              this dash.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={
              addEntry
            }
          >
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Date
              </label>

              <Input
                type="date"
                value={
                  form.date
                }
                onChange={(
                  event
                ) =>
                  update(
                    "date",
                    event
                      .target
                      .value
                  )
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  DoorDash pay
                </label>

                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="$0.00"
                  value={
                    form.basePay
                  }
                  onChange={(
                    event
                  ) =>
                    update(
                      "basePay",
                      event
                        .target
                        .value
                    )
                  }
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Tips
                </label>

                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="$0.00"
                  value={
                    form.tips
                  }
                  onChange={(
                    event
                  ) =>
                    update(
                      "tips",
                      event
                        .target
                        .value
                    )
                  }
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Expenses
              </label>

              <div className="relative">
                <WalletCards className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                <Input
                  className="pl-9"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Gas, parking, etc."
                  value={
                    form.expenses
                  }
                  onChange={(
                    event
                  ) =>
                    update(
                      "expenses",
                      event
                        .target
                        .value
                    )
                  }
                />
              </div>

              <p className="mt-1.5 text-xs text-muted-foreground">
                Example: gas,
                parking, tolls,
                or other delivery
                costs.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Hours
                </label>

                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="0.0"
                  value={
                    form.hours
                  }
                  onChange={(
                    event
                  ) =>
                    update(
                      "hours",
                      event
                        .target
                        .value
                    )
                  }
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Deliveries
                </label>

                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={
                    form.deliveries
                  }
                  onChange={(
                    event
                  ) =>
                    update(
                      "deliveries",
                      event
                        .target
                        .value
                    )
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-lg border border-border/60 bg-secondary/30 p-4 text-center">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Gross
                </p>

                <p className="mt-1 font-mono text-sm font-semibold">
                  {money(
                    formGross
                  )}
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Expenses
                </p>

                <p className="mt-1 font-mono text-sm font-semibold text-rose-300">
                  -
                  {money(
                    formExpenses
                  )}
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Net
                </p>

                <p
                  className={`mt-1 font-mono text-sm font-semibold ${
                    formNet >= 0
                      ? "text-emerald-300"
                      : "text-rose-300"
                  }`}
                >
                  {formNet >= 0
                    ? "+"
                    : ""}
                  {money(
                    formNet
                  )}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setAddOpen(
                    false
                  )
                }
              >
                Cancel
              </Button>

              <Button
                type="submit"
                disabled={
                  formGross <=
                  0
                }
              >
                Add earnings
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

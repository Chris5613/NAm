import { Bitcoin, Box, ChevronRight, CreditCard, TrendingUp, WalletCards } from "lucide-react";
import { formatCurrency } from "@/lib/dashboardMetrics";

export const CATEGORY_CONFIG = {
  stocks: {
    label: "Stocks",
    shortLabel: "Stocks",
    icon: TrendingUp,
    color: "text-cyan-400",
    bar: "bg-cyan-400",
  },
  crypto: {
    label: "Crypto",
    shortLabel: "Crypto",
    icon: Bitcoin,
    color: "text-violet-400",
    bar: "bg-violet-400",
  },
  cash: {
    label: "Cash",
    shortLabel: "Cash",
    icon: WalletCards,
    color: "text-blue-400",
    bar: "bg-blue-400",
  },
  other: {
    label: "Other assets",
    shortLabel: "Other",
    icon: Box,
    color: "text-amber-400",
    bar: "bg-amber-400",
  },
  debts: {
    label: "Debts",
    shortLabel: "Debts",
    icon: CreditCard,
    color: "text-rose-400",
    bar: "bg-rose-400",
  },
};

/* =========================================================
   ALLOCATION BAR
========================================================= */

export function AllocationBar({
  category,
  value,
  maxValue,
  label,
  unverified = false,
}) {
  const config =
    CATEGORY_CONFIG[
      category
    ];

  const Icon =
    label === "Total Assets" ? WalletCards : config.icon;

  const width =
    maxValue > 0
      ? Math.max(
          4,

          (Math.abs(
            value
          ) /
            maxValue) *
            100
        )
      : 0;

  return (
    <div className="flex items-center gap-4">
      <Icon
        className={`h-5 w-5 shrink-0 ${config.color}`}
        strokeWidth={
          1.8
        }
      />

      <div className="min-w-0 flex-1">
        <div
          className="
            mb-1.5
            flex
            items-center
            justify-between
            gap-3
          "
        >
          <span className="text-sm text-foreground">
            {
              label || config.shortLabel
            }
          </span>

          <span className="text-sm font-medium text-foreground">
            {unverified ? "—" : formatCurrency(value)}
          </span>
        </div>

        <div
          className="
            h-2
            overflow-hidden
            rounded-full
            bg-secondary
          "
        >
          <div
            className={`h-full rounded-full ${config.bar}`}
            style={{
              width:
                `${unverified ? 0 : width}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   HOLDING ROW
========================================================= */

export function HoldingRow({
  category,
  value,
  subtitle,
  dailyChange = 0,
  onClick,
}) {
  const config =
    CATEGORY_CONFIG[
      category
    ];

  const Icon =
    config.icon;

  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className="
        group
        flex
        w-full
        items-center
        gap-5
        border-t
        border-border/40
        px-6
        py-4
        text-left
        transition-colors
        hover:bg-white/[0.03]
        focus:outline-none
        focus-visible:bg-white/[0.04]
      "
    >
      <div className="flex w-11 justify-center">
        <Icon
          className={`h-6 w-6 ${config.color}`}
          strokeWidth={
            1.8
          }
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          {
            config.label
          }
        </p>

        <p className="mt-0.5 text-sm text-muted-foreground">
          {subtitle}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-lg font-medium text-foreground">
          {category ===
          "debts"
            ? "−"
            : ""}

          {formatCurrency(
            Math.abs(
              value
            )
          )}
        </p>

        <p
          className={`mt-1 text-xs font-medium tabular-nums ${
            dailyChange > 0
              ? "text-emerald-400"
              : dailyChange < 0
                ? "text-rose-400"
                : "text-muted-foreground"
          }`}
        >
          {dailyChange > 0
            ? "+"
            : dailyChange < 0
              ? "−"
              : ""}

          {formatCurrency(
            Math.abs(
              dailyChange
            )
          )}{" "}
          today
        </p>
      </div>

      <ChevronRight
        className="
          h-5
          w-5
          text-muted-foreground
          transition
          group-hover:translate-x-0.5
          group-hover:text-foreground
        "
      />
    </button>
  );
}

/* =========================================================
   MONTHLY NET WORTH MINI CHART
========================================================= */

export function MonthlyNetWorthMiniChart({
  history = [],
}) {
  const points =
    Array.isArray(history)
      ? history
          .filter(
            (item) =>
              item &&
              Number.isFinite(
                Number(
                  item.value
                )
              )
          )
          .slice(-6)
      : [];

  if (!points.length) {
    return (
      <div className="flex h-[145px] items-center justify-center text-xs text-muted-foreground">
        Waiting for monthly history…
      </div>
    );
  }

  const width = 720;
  const height = 245;
  const padX = 42;
  const padTop = 34;
  const padBottom = 34;

  const values =
    points.map(
      (item) =>
        Number(
          item.value
        ) || 0
    );

  const minValue =
    Math.min(
      ...values
    );

  const maxValue =
    Math.max(
      ...values
    );

  const range =
    Math.max(
      1,
      maxValue -
        minValue
    );

  const chartPoints =
    points.map(
      (
        item,
        index
      ) => {
        const x =
          points.length ===
          1
            ? width / 2
            : padX +
              (
                index /
                (
                  points.length -
                  1
                )
              ) *
                (
                  width -
                  padX * 2
                );

        const usableHeight =
          height -
          padTop -
          padBottom;

        const normalized =
          (
            (
              Number(
                item.value
              ) || 0
            ) -
            minValue
          ) /
          range;

        const y =
          maxValue ===
          minValue
            ? padTop +
              usableHeight /
                2
            : padTop +
              (
                1 -
                normalized
              ) *
                usableHeight;

        return {
          ...item,
          x,
          y,
        };
      }
    );

  const polylinePoints =
    chartPoints
      .map(
        (point) =>
          `${point.x},${point.y}`
      )
      .join(" ");

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[245px] w-full overflow-visible"
        role="img"
        aria-label="Monthly net worth history"
      >
        <line
          x1={padX}
          y1={
            height -
            padBottom
          }
          x2={
            width -
            padX
          }
          y2={
            height -
            padBottom
          }
          stroke="currentColor"
          className="text-border/50"
          strokeWidth="1"
        />

        {chartPoints.length >
          1 && (
          <polyline
            points={
              polylinePoints
            }
            fill="none"
            stroke="#22d3ee"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {chartPoints.map(
          (point) => (
            <g
              key={
                point.monthKey
              }
            >
              {point.live && (
                <circle
                  cx={
                    point.x
                  }
                  cy={
                    point.y
                  }
                  r="9"
                  fill="rgba(34, 211, 238, 0.15)"
                  stroke="#22d3ee"
                  strokeWidth="1"
                />
              )}

              <circle
                cx={
                  point.x
                }
                cy={
                  point.y
                }
                r={
                  point.live
                    ? 5
                    : 4
                }
                fill="#22d3ee"
              />

              <text
                x={
                  point.x
                }
                y={
                  Math.max(
                    12,
                    point.y -
                      12
                  )
                }
                textAnchor="middle"
                fill="currentColor"
                className="text-foreground"
                fontSize="10"
                fontWeight={
                  point.live
                    ? "700"
                    : "500"
                }
              >
                {formatCurrency(
                  point.value
                )}
              </text>

              <text
                x={
                  point.x
                }
                y={
                  height - 8
                }
                textAnchor="middle"
                fill="currentColor"
                className="text-muted-foreground"
                fontSize="10"
              >
                {
                  String(
                    point.month ||
                      point.monthKey
                  ).split(
                    " "
                  )[0]
                }
              </text>
            </g>
          )
        )}
      </svg>
    </div>
  );
}

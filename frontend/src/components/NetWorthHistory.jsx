import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Activity } from "lucide-react";

const CHART_MARGIN = { top: 5, right: 10, left: 10, bottom: 5 };
const Y_AXIS_DOMAIN = ["dataMin - 100", "dataMax + 100"];
const AREA_DOT = { r: 3.5, fill: "#FAFAFA", stroke: "#52525B", strokeWidth: 1.5 };
const AREA_ACTIVE_DOT = { r: 5.5, fill: "#FAFAFA", stroke: "#FACC15", strokeWidth: 2 };

const TOOLTIP_BOX_STYLE = {
  background: "#121214",
  border: "1px solid #27272A",
  borderRadius: "6px",
  padding: "8px 10px",
  fontFamily: "'Space Mono', monospace",
  fontSize: "12px",
};

const TOOLTIP_LABEL_STYLE = { color: "#A1A1AA", marginBottom: 4 };
const TOOLTIP_VALUE_STYLE = { color: "#FAFAFA" };

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(value);
}

function formatAxisLabel(label) {
  return label || "";
}

function normalizeHistoryPoint(item) {
  return {
    ...item,
    time:
      item.time ||
      item.label ||
      item.month ||
      item.monthKey ||
      "",
    value: Number(item.value) || 0,
  };
}

export default function NetWorthHistory({ history = [] }) {
const chartData = useMemo(() => {
  const dailyMap = new Map();

  const addRows = (rows = []) => {
    if (!Array.isArray(rows)) return;

    rows.forEach((row) => {
      const dateKey = row.date || row.day;

      const amount = Number(
        row.earnings_usd ||
        row.amount_usd ||
        row.usd ||
        row.amount ||
        0
      );

      if (!dateKey || Number.isNaN(amount)) return;

      const dateObj = new Date(`${dateKey}T00:00:00`);

      if (Number.isNaN(dateObj.getTime())) return;

      const label = dateObj.toLocaleDateString("en-US", {
        month: "numeric",
        day: "numeric",
      });

      dailyMap.set(dateKey, {
        dateKey,
        date: label,
        earnings: amount,
      });
    });
  };

  // ONLY use combined daily earnings
  addRows(summary?.daily_earnings);

  return Array.from(dailyMap.values())
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    .slice(-14)
    .map((row) => ({
      date: row.date,
      earnings: Number(row.earnings.toFixed(2)),
    }));
}, [summary]);

  if (chartData.length === 0) {
    return (
      <Card className="border-border/40 bg-card" data-testid="net-worth-history">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Net Worth — Live
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[200px]">
          <p className="text-muted-foreground text-sm">Waiting for live data…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/40 bg-card" data-testid="net-worth-history">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Net Worth — Live
          <span className="text-[10px] text-muted-foreground/60 font-normal flex items-center gap-1">
            <Activity className="w-3 h-3" strokeWidth={1.5} />
            {chartData.length} pts
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={CHART_MARGIN}>
            <defs>
              <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FAFAFA" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#FAFAFA" stopOpacity={0} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="date"
              stroke="#52525B"
              fontSize={11}
              fontFamily="'Space Mono', monospace"
              tickLine={false}
              axisLine={false}
              minTickGap={32}
              tickFormatter={formatAxisLabel}
            />

            <YAxis
              stroke="#52525B"
              fontSize={11}
              fontFamily="'Space Mono', monospace"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v}`}
              domain={Y_AXIS_DOMAIN}
            />

            <Tooltip
              labelFormatter={formatAxisLabel}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;

                const point = payload[0]?.payload;
                const value = point?.earnings ?? payload[0]?.value;
                const itemLabel = point?.date ?? label;

                return (
                  <div style={TOOLTIP_BOX_STYLE}>
                    <div style={TOOLTIP_LABEL_STYLE}>
                      {itemLabel}
                      {point?.live ? " · live" : ""}
                    </div>
                    <div style={TOOLTIP_VALUE_STYLE}>
                      Net Worth: {formatCurrency(value)}
                    </div>
                  </div>
                );
              }}
            />

            <Area
              type="monotone"
              dataKey="earnings"
              stroke="#FAFAFA"
              strokeWidth={2}
              fill="url(#netWorthGradient)"
              dot={AREA_DOT}
              activeDot={AREA_ACTIVE_DOT}
              isAnimationActive={true}
              animationDuration={400}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
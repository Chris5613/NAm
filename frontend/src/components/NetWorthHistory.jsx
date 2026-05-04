import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(value);
}

function formatSignedCurrency(value) {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${formatCurrency(Math.abs(value))}`;
}

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function NetWorthHistory({ history, liveData }) {
  // Merge saved history with live session data.
  const chartData = useMemo(() => {
    const savedPoints = (history || []).map((item) => ({
      time: formatTime(item.timestamp),
      value: Number(item.total_net_worth) || 0,
    }));
    const livePoints = (liveData || []).map((item) => ({
      time: formatTime(item.timestamp),
      value: Number(item.value) || 0,
    }));
    return [...savedPoints, ...livePoints];
  }, [history, liveData]);

  // Session delta: change since the FIRST live point this session.
  const sessionDelta = useMemo(() => {
    const live = (liveData || []).filter((p) => Number.isFinite(Number(p.value)));
    if (live.length < 2) return null;
    const first = Number(live[0].value);
    const last = Number(live[live.length - 1].value);
    if (!first) return null;
    const diff = last - first;
    const pct = (diff / first) * 100;
    return { diff, pct, first, last };
  }, [liveData]);

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

  let DeltaIcon = Minus;
  let deltaColor = "text-muted-foreground";
  if (sessionDelta) {
    if (sessionDelta.diff > 0) { DeltaIcon = TrendingUp; deltaColor = "text-emerald-400"; }
    else if (sessionDelta.diff < 0) { DeltaIcon = TrendingDown; deltaColor = "text-rose-400"; }
  }

  return (
    <Card className="border-border/40 bg-card" data-testid="net-worth-history">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
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
          {sessionDelta && (
            <div className={`flex items-center gap-1.5 text-xs font-mono ${deltaColor}`} data-testid="session-delta">
              <DeltaIcon className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span className="font-semibold">{formatSignedCurrency(sessionDelta.diff)}</span>
              <span className="opacity-80">({sessionDelta.diff >= 0 ? "+" : "−"}{Math.abs(sessionDelta.pct).toFixed(2)}%)</span>
              <span className="text-muted-foreground/60 ml-1">since session start</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FAFAFA" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#FAFAFA" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              stroke="#52525B"
              fontSize={11}
              fontFamily="'Space Mono', monospace"
              tickLine={false}
              axisLine={false}
              minTickGap={32}
            />
            <YAxis
              stroke="#52525B"
              fontSize={11}
              fontFamily="'Space Mono', monospace"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              domain={["dataMin - 100", "dataMax + 100"]}
            />
            <Tooltip
              contentStyle={{
                background: "#121214",
                border: "1px solid #27272A",
                borderRadius: "6px",
                fontFamily: "'Space Mono', monospace",
                fontSize: "12px",
              }}
              labelStyle={{ color: "#A1A1AA" }}
              formatter={(value) => [formatCurrency(value), "Net Worth"]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#FAFAFA"
              strokeWidth={2}
              fill="url(#netWorthGradient)"
              dot={false}
              activeDot={{ r: 4, fill: "#FAFAFA" }}
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

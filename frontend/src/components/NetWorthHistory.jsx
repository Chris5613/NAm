import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(value);
}

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function NetWorthHistory({ history, liveData }) {
  // Merge saved history with live session data
  const savedPoints = (history || []).map((item) => ({
    time: formatTime(item.timestamp),
    value: item.total_net_worth,
  }));

  const livePoints = (liveData || []).map((item) => ({
    time: formatTime(item.timestamp),
    value: item.value,
  }));

  const chartData = [...savedPoints, ...livePoints];

  if (chartData.length === 0) {
    return (
      <Card className="border-border/40 bg-card" data-testid="net-worth-history">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Net Worth — Live
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[200px]">
          <p className="text-muted-foreground text-sm">
            Waiting for live data...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/40 bg-card" data-testid="net-worth-history">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Net Worth — Live
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FAFAFA" stopOpacity={0.15} />
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
            />
            <YAxis
              stroke="#52525B"
              fontSize={11}
              fontFamily="'Space Mono', monospace"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              domain={["dataMin - 1000", "dataMax + 1000"]}
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
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

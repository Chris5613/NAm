import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(value);
}

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function NetWorthHistory({ history }) {
  if (!history || history.length === 0) {
    return (
      <Card className="border-border/40 bg-card" data-testid="net-worth-history">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Net Worth Over Time
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[200px]">
          <p className="text-muted-foreground text-sm">
            Take snapshots to build history
          </p>
        </CardContent>
      </Card>
    );
  }

  const chartData = history.map((item) => ({
    date: formatDate(item.timestamp),
    value: item.total_net_worth,
  }));

  return (
    <Card className="border-border/40 bg-card" data-testid="net-worth-history">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Net Worth Over Time
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <XAxis
              dataKey="date"
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
            <Line
              type="monotone"
              dataKey="value"
              stroke="#FAFAFA"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#FAFAFA" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

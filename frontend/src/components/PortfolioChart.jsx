import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["#FAFAFA", "#A1A1AA", "#52525B", "#3F3F46", "#27272A"];

// Hoisted out of render so Recharts gets stable refs across re-renders.
const TOOLTIP_CONTENT_STYLE = {
  background: "#121214",
  border: "1px solid #27272A",
  borderRadius: "6px",
  fontFamily: "'Space Mono', monospace",
  fontSize: "12px",
};
const TOOLTIP_LABEL_STYLE = { color: "#FAFAFA" };

const CATEGORY_LABELS = {
  stocks: "Stocks",
  crypto: "Crypto",
  cash: "Cash",
  other: "Other",
  phones: "Phones",
  investments: "Investments",
  crypto_projects: "Projects",
  debts: "Debts",
};

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(value);
}

export default function PortfolioChart({ netWorth }) {
  if (!netWorth || !netWorth.breakdown) return null;

  const { breakdown } = netWorth;
  const data = Object.entries(breakdown)
    .filter(([key, val]) => val > 0 && key !== "debts" && key !== "investments" && key !== "crypto_projects")
    .map(([key, val]) => ({
      name: CATEGORY_LABELS[key] || key,
      value: val,
    }))
    .sort((a, b) => b.value - a.value);

  if (data.length === 0) {
    return (
      <Card className="border-border/40 bg-card h-full" data-testid="portfolio-chart">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Portfolio Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[200px]">
          <p className="text-muted-foreground text-sm">Add assets to see breakdown</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/40 bg-card h-full" data-testid="portfolio-chart">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Portfolio Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <ResponsiveContainer width={160} height={160}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                dataKey="value"
                strokeWidth={1}
                stroke="#09090B"
              >
                {data.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_CONTENT_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                formatter={(value) => [formatCurrency(value), ""]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 flex-1">
            {data.map((entry, index) => (
              <div key={entry.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-xs text-muted-foreground">{entry.name}</span>
                </div>
                <span className="font-mono text-xs text-foreground">
                  {formatCurrency(entry.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet } from "lucide-react";

function formatCurrency(value) {
  if (value === undefined || value === null) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

export default function NetWorthHero({ netWorth }) {
  if (!netWorth) return null;

  const { total_net_worth, breakdown, asset_count } = netWorth;
  const isPositive = total_net_worth >= 0;

  return (
    <Card className="border-border/40 bg-card" data-testid="net-worth-hero">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Wallet className="w-4 h-4" strokeWidth={1.5} />
          <span className="text-sm">Total Net Worth</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span
            className="font-mono text-4xl sm:text-5xl font-bold tracking-tight text-foreground"
            data-testid="total-net-worth"
          >
            {formatCurrency(total_net_worth)}
          </span>
          {isPositive ? (
            <TrendingUp className="w-5 h-5 text-emerald-500" strokeWidth={1.5} />
          ) : (
            <TrendingDown className="w-5 h-5 text-rose-500" strokeWidth={1.5} />
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
          <MetricItem label="Stocks" value={breakdown?.stocks || 0} />
          <MetricItem label="Crypto" value={breakdown?.crypto || 0} />
          <MetricItem label="Cash" value={breakdown?.cash || 0} />
          <MetricItem label="Investments" value={breakdown?.investments || 0} />
          <MetricItem label="Debts" value={breakdown?.debts || 0} negative />
        </div>
      </CardContent>
    </Card>
  );
}

function MetricItem({ label, value, negative, isCount }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-mono text-sm font-medium ${negative ? "text-rose-400" : "text-foreground"}`}>
        {isCount ? value : formatCurrency(value)}
      </p>
    </div>
  );
}

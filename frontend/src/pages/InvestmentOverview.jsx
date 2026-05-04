import { Card, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default function InvestmentOverview() {
  return (
    <div className="space-y-6" data-testid="investment-overview-page">
      <h1 className="text-4xl font-medium tracking-tight">Investment Overview</h1>
      <Card className="border-border/40 bg-card">
        <CardContent className="p-6 flex flex-col items-center justify-center min-h-[300px] text-center">
          <BarChart3 className="w-10 h-10 text-muted-foreground mb-4" strokeWidth={1.5} />
          <p className="text-muted-foreground text-sm">
            Investment overview and performance analytics coming soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// Integrations tab — central place for "auto-sync" connectors that pull
// data from external project APIs (e.g. Nosana node earnings) and reconcile
// them into the Investment Overview.
//
// Add a new integration: drop another card component into the grid below.
import NosanaEarningsCard from "@/components/NosanaEarningsCard";
import RollerCoinEarningsCard from "@/components/RollerCoinEarningsCard";
import AcurastEarningsCard from "@/components/AcurastEarningsCard";
import UnityNetworkEarningsCard from "@/components/UnityNetworkEarningsCard";
import { Zap } from "lucide-react";

export default function IntegrationsPage() {
  return (
    <div className="space-y-6" data-testid="integrations-page">
      {/* Page header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Integrations
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.5} />
            Auto-sync earnings from external project APIs into your Investment Overview.
          </p>
        </div>
      </div>

      {/* Integration cards. Each card is self-contained — config, status,
          manual sync, and (where relevant) a daily-history grid. */}
      <div className="space-y-4">
        <NosanaEarningsCard />
        <RollerCoinEarningsCard />
        <AcurastEarningsCard />
        <UnityNetworkEarningsCard />
        {/* Future integrations go here (e.g. Helium, Akash, Render Network). */}
      </div>
    </div>
  );
}

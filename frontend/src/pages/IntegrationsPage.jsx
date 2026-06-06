// Integrations tab — central place for "auto-sync" connectors that pull
// data from external project APIs (e.g. Nosana node earnings) and reconcile
// them into the Investment Overview.
//
// Add a new integration: drop another card component into the grid below.

import { useState, useCallback } from "react";
import NosanaEarningsCard from "@/components/NosanaEarningsCard";
import RollerCoinEarningsCard from "@/components/RollerCoinEarningsCard";
import AcurastEarningsCard from "@/components/AcurastEarningsCard";
import UnityNetworkEarningsCard from "@/components/UnityNetworkEarningsCard";
import GoMiningEarningsCard from "@/components/GoMiningEarningsCard";
import {
  AddIntegrationDialog,
  CustomIntegrationCard,
} from "@/components/CustomIntegrationCard";
import * as customSync from "@/lib/customIntegrationSync";
import { Zap, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function IntegrationsPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [customIntegrations, setCustomIntegrations] = useState(
    customSync.getAll()
  );

  const refresh = useCallback(() => {
    setCustomIntegrations(customSync.getAll());
  }, []);

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
            Auto-sync earnings from external project APIs into your Investment
            Overview.
          </p>
        </div>

        <Button
          onClick={() => setAddOpen(true)}
          className="bg-white text-black hover:bg-neutral-200"
          data-testid="add-custom-integration-btn"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Integration
        </Button>
      </div>

      {/* Integration cards. Each card is self-contained — config, status,
          manual sync, and daily-history where relevant. */}
      <div className="space-y-4">
        <NosanaEarningsCard />
        <UnityNetworkEarningsCard />
        <RollerCoinEarningsCard />
        {/* <AcurastEarningsCard /> */}
        {/* <GoMiningEarningsCard /> */}

        {/* Custom integrations */}
        {customIntegrations.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider pt-2">
              Custom Integrations
            </h2>

            {customIntegrations.map((integration) => (
              <CustomIntegrationCard
                key={integration.id}
                integration={integration}
                onUpdated={refresh}
              />
            ))}
          </div>
        )}
      </div>

      <AddIntegrationDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={refresh}
      />
    </div>
  );
}
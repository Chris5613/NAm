import MiningPowerCard from "@/components/MiningPowerCard";

export default function MiningPowerPage() {
  const panel = "min-w-0 overflow-hidden rounded-[14px] border border-border/50 bg-card shadow-[0_8px_24px_rgba(0,0,0,0.08)]";

  return (
    <div className="min-w-0 space-y-4 pb-8 text-white" data-testid="mining-power-page">
      <header className="px-1">
        <h1 className="text-[32px] font-semibold tracking-tight">Mining Power</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live Tapo P115 wall-power readings, electricity cost, and mining profitability.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <MiningPowerCard className={panel} />

        <section className={panel + " p-5"}>
          <h2 className="text-sm font-semibold">How it works</h2>
          <div className="mt-3 space-y-3 text-xs leading-relaxed text-muted-foreground">
            <p>Your Windows bridge reads each Tapo P115 locally over your home network and sends only power telemetry to NAm.</p>
            <p>Your Tapo email and password stay in the local bridge config on your PC and are never sent to NAm or stored in GitHub.</p>
            <p>The card refreshes automatically while the bridge is running.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

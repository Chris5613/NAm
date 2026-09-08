import { useEffect, useState } from "react";
import { BriefcaseBusiness, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { snaptradeApi } from "@/lib/apiClient";

export default function SnaptradeCard() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = async () => {
    try {
      setStatus(await snaptradeApi.status());
    } catch (error) {
      toast.error(error.message || "Could not load SnapTrade status.");
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const result = await snaptradeApi.connect();
      window.open(result.redirect_uri, "snaptrade-authorization", "width=520,height=760");
      toast.success("Finish connecting Fidelity in the SnapTrade window, then sync.");
      await loadStatus();
    } catch (error) {
      toast.error(error.message || "Could not start SnapTrade authorization.");
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    try {
      const result = await snaptradeApi.sync();
      toast.success(`${result.synced || 0} stock holdings synced.`);
      await loadStatus();
    } catch (error) {
      toast.error(error.message || "Could not sync SnapTrade holdings.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-border/40 bg-card">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-3 text-base">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
            <BriefcaseBusiness className="h-4 w-4" />
          </span>
          Fidelity via SnapTrade
        </CardTitle>
        {status?.last_synced_at && (
          <span className="text-xs text-muted-foreground">Synced {new Date(status.last_synced_at).toLocaleString()}</span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Import Fidelity positions and keep share quantities and stock values in Net Worth.
        </p>
        {!status?.configured && (
          <p className="text-sm text-amber-300">Add SnapTrade credentials to the backend before connecting.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={connect} disabled={busy || !status?.configured}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            <ExternalLink className="h-4 w-4" />
            {status?.connected ? "Reconnect Fidelity" : "Connect Fidelity"}
          </Button>
          {status?.connected && (
            <Button variant="outline" onClick={sync} disabled={busy}>
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
              Sync holdings
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
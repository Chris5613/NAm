import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";

export default function BixberryCard() {
  const [tracker, setTracker] = useState(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await api.get("/api/project-tracking/bixberry");
        if (active) { setTracker(result); setError(""); }
      } catch (e) { if (active) setError(e.message); }
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  async function pair() {
    if (!window.confirm("Generate a new bridge key? This replaces any previously paired Bixberry bridge.")) return;
    setBusy(true);
    try {
      const result = await api.post("/api/project-tracking/bixberry/pair", {});
      setToken(result.bridgeToken);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <div className="rounded-xl border border-[#303842] p-3 space-y-2">
    <div className="flex items-center justify-between gap-2">
      <div><h3 className="font-semibold">Bixberry</h3><p className="text-xs text-muted-foreground">Network sharing · Account balance</p></div>
      <span className="tabular-nums font-semibold">{tracker?.currentBalance == null ? "—" : "$" + Number(tracker.currentBalance).toFixed(4)}</span>
    </div>
    <p className="text-xs text-muted-foreground">{tracker?.lastSyncedAt ? "Last read: " + new Date(tracker.lastSyncedAt).toLocaleString() : "Waiting for first balance reading"}</p>
    <Button size="sm" variant="outline" disabled={busy} onClick={pair}>Pair Windows bridge</Button>
    {token && <div className="space-y-1"><p className="text-xs">Copy this NAm-only key into the Windows bridge. Do not share it.</p><input className="w-full bg-transparent border rounded p-1 text-xs" type="password" readOnly value={token}/><Button size="sm" onClick={async () => {try { await navigator.clipboard.writeText(token); setToken(""); } catch { setError("Clipboard unavailable; select and copy the key."); }}}>Copy key</Button></div>}
    {error && <p className="text-xs text-amber-400">{error}</p>}
  </div>;
}

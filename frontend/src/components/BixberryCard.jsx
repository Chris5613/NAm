import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { ProjectLogoButton } from "@/components/YieldFarmingComponents";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function BixberryCard({ tracker, logo, onLogoChange, todayUsd }) {
  const [expanded, setExpanded] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const stamp = Date.parse(tracker?.lastSyncedAt);
  const connected = Number.isFinite(stamp) && clock - stamp < 5 * 60 * 1000;
  const balance = tracker?.currentBalance == null ? "—" : "$" + Number(tracker.currentBalance).toFixed(4);
  async function pair() {
    if (!window.confirm("Generate a new bridge key? This replaces any previously paired Bixberry bridge.")) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.post("/api/project-tracking/bixberry/pair", {});
      setToken(result.bridgeToken);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <div className="overflow-hidden rounded-2xl border border-border/60 bg-[#13181e] shadow-sm transition-all duration-200 hover:border-border hover:bg-[#171d24]">
    <div className="flex w-full min-w-0 items-start gap-2 px-3.5 py-2.5">
        <ProjectLogoButton platform="Bixberry" logo={logo} onLogoChange={onLogoChange}/>
        <button type="button" onClick={() => setExpanded(true)} className="flex min-w-0 flex-1 items-start gap-2 text-left" aria-label="Bixberry project details">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="min-w-0 truncate text-[12px] font-semibold">Bixberry</span>
            <span className={`shrink-0 text-[9px] ${connected ? "text-emerald-400" : "text-amber-300"}`}>● {connected ? "Online" : "Offline"}</span>
          </div>
          <div className="mt-0.5 truncate text-[14px] font-semibold tabular-nums">{balance}</div>
        </div>
        <ChevronRight className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground"/>
        </button>
    </div>
    <Dialog open={expanded} onOpenChange={open => {setExpanded(open); if (!open) {setToken(""); setError("");}}}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Bixberry</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Network sharing · Account balance</p>
          <div className="rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Current balance</div><div className="mt-1 text-lg font-semibold tabular-nums">{balance}</div></div>
          <div className="rounded-xl border border-border/50 px-4 py-3"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Today’s earnings</div><div className="mt-1 text-lg font-semibold tabular-nums">{todayUsd == null ? "—" : "$" + Number(todayUsd).toFixed(4)}</div></div>
          <p className="text-xs text-muted-foreground">{tracker?.lastSyncedAt ? "Last read: " + new Date(tracker.lastSyncedAt).toLocaleString() : "Waiting for first balance reading"}</p>
          <Button size="sm" variant="outline" disabled={busy} onClick={pair}>Pair Windows bridge</Button>
          {token && <div className="space-y-1"><p className="text-xs">Copy this NAm-only key into the Windows bridge. Do not share it.</p><input className="w-full bg-transparent border rounded p-1 text-xs" type="password" readOnly value={token}/><Button size="sm" onClick={async () => {try {await navigator.clipboard.writeText(token); setToken("");} catch {setError("Clipboard unavailable; select and copy the key.");}}}>Copy key</Button></div>}
          {error && <p className="text-xs text-amber-400">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}

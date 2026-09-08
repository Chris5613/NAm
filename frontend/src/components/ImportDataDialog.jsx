import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { migrationApi } from "@/lib/apiClient";
import { hydrate } from "@/lib/serverStore";
import { Download, Loader2, Upload } from "lucide-react";

// Every key this app has ever written to browser storage starts with one of these.
const KEY_PREFIXES = ["networth_", "cloud_", "crypto_", "daily_", "monthly_", "rollercoin:", "projectDailyReturns"];

function collectLocalData() {
  const dump = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      dump[key] = JSON.parse(raw);
    } catch {
      dump[key] = raw;
    }
  }
  return dump;
}

export default function ImportDataDialog({ open, onOpenChange }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const fileInput = useRef(null);
  const localCount = Object.keys(collectLocalData()).length;

  const applyDump = async (dump, label) => {
    setBusy(true);
    setResult(null);
    try {
      const response = await migrationApi.importDump(dump);
      const counts = response?.imported || {};
      const total = Object.values(counts).reduce((sum, count) => sum + Number(count || 0), 0);
      await hydrate();
      setResult({ counts, skipped: response?.skipped_samples || 0, label });
      toast.success(`Imported ${total} records from ${label}.`);
    } catch (error) {
      toast.error(error.message || "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const importFromFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        toast.error("That file is not a storage backup.");
        return;
      }
      await applyDump(parsed, file.name);
    } catch {
      toast.error("Could not read that file as JSON.");
    }
  };

  const downloadBackup = () => {
    const blob = new Blob([JSON.stringify(collectLocalData(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `networth-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import data</DialogTitle>
          <DialogDescription>
            Load a backup file, or pull data still saved in this browser. Importing is safe to repeat — records are matched by
            id and updated rather than duplicated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input accept="application/json,.json" className="hidden" onChange={importFromFile} ref={fileInput} type="file" />
          <Button className="w-full" disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Choose a backup file
          </Button>

          {localCount > 0 && (
            <div className="rounded-md border border-border/60 p-3">
              <p className="text-sm font-medium">This browser has {localCount} saved entries</p>
              <p className="mt-1 text-xs text-muted-foreground">Left over from before the server move. Your local copy is not deleted.</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={downloadBackup}>
                  <Download className="h-4 w-4" /> Download
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => applyDump(collectLocalData(), "this browser")}>
                  Import from browser
                </Button>
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-950/10 p-3 text-sm">
              <p className="font-medium">Imported from {result.label}</p>
              <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {Object.entries(result.counts).map(([name, count]) => (
                  <li key={name}>
                    {name.replace(/_/g, " ")}: {count}
                  </li>
                ))}
                {result.skipped > 0 && <li>skipped sample/demo records: {result.skipped}</li>}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">Reload the page to see everything applied.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

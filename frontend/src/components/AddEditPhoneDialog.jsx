import { useState, useEffect, useRef } from "react";
import { phonesApi } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { X, Loader2 } from "lucide-react";
import { colorForTag } from "@/lib/colorHash";

const OS_OPTIONS = ["iOS", "Android"];
const COMMON_CARRIERS = ["Helium", "Tello", "TracFone", "Verizon", "T-Mobile", "AT&T", "US Mobile", "Mint", "Cricket", "Other"];

export default function AddEditPhoneDialog({ open, onOpenChange, phone, onSaved, allTags = [] }) {
  const isEdit = !!phone;
  const [submitting, setSubmitting] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [os, setOs] = useState("");
  const [model, setModel] = useState("");
  const [unityId, setUnityId] = useState("");
  const [carrier, setCarrier] = useState("");
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [marketValue, setMarketValue] = useState("");
  const [useManualPrice, setUseManualPrice] = useState(false);
  const [notes, setNotes] = useState("");
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);

  const tagInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    if (phone) {
      setDeviceId(phone.device_id || "");
      setOs(phone.os || "");
      setModel(phone.model || "");
      setUnityId(phone.unity_id || "");
      setCarrier(phone.carrier || "");
      setTags(phone.tags || []);
      setMarketValue(phone.market_value ? String(phone.market_value) : "");
      setUseManualPrice(phone.market_value_source === "manual" && phone.market_value > 0);
      setNotes(phone.notes || "");
    } else {
      setDeviceId(""); setOs(""); setModel(""); setUnityId(""); setCarrier("");
      setTags([]); setMarketValue(""); setUseManualPrice(false); setNotes("");
    }
    setTagInput("");
  }, [phone, open]);

  const addTag = (raw) => {
    const t = (raw || "").trim();
    if (!t) return;
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    setTags([...tags, t]);
    setTagInput("");
  };

  const removeTag = (t) => setTags(tags.filter((x) => x !== t));

  const handleTagKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === "Backspace" && !tagInput && tags.length) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const tagSuggestions = allTags.filter(
    (t) => t.toLowerCase().includes(tagInput.toLowerCase()) && !tags.some((x) => x.toLowerCase() === t.toLowerCase())
  ).slice(0, 8);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!model.trim()) { toast.error("Model is required"); return; }
    setSubmitting(true);
    try {
      const payload = {
        device_id: deviceId.trim(),
        os: os.trim(),
        model: model.trim(),
        unity_id: unityId.trim(),
        carrier: carrier.trim(),
        tags,
        notes: notes.trim(),
      };
      if (useManualPrice && marketValue) {
        payload.market_value = parseFloat(marketValue) || 0;
        payload.market_value_source = "manual";
      }
      if (isEdit) {
        // For edit, include market_value even if 0 to allow clearing manual override (then re-fetch via refresh button)
        if (!useManualPrice) {
          payload.market_value_source = "ebay";
        }
        await phonesApi.update(phone.id, payload);
        toast.success("Phone updated");
      } else {
        await phonesApi.create(payload);
        toast.success(useManualPrice ? "Phone added" : "Phone added — fetching market price…");
      }
      onSaved?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to save phone");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-lg max-h-[92vh] overflow-y-auto" data-testid="phone-dialog">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Phone" : "Add Phone"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this device's details" : "Add a new device to your inventory"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="device_id">Device ID</Label>
              <Input id="device_id" placeholder="e.g. DEV-001" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="bg-background border-border font-mono" data-testid="phone-device-id" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="os">OS</Label>
              <Select value={os || undefined} onValueChange={setOs}>
                <SelectTrigger className="bg-background border-border" data-testid="phone-os">
                  <SelectValue placeholder="iOS / Android" />
                </SelectTrigger>
                <SelectContent>
                  {OS_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">Model *</Label>
            <Input id="model" placeholder="e.g. iPhone 8, Moto G, Galaxy S22" required value={model} onChange={(e) => setModel(e.target.value)} className="bg-background border-border" data-testid="phone-model" />
            <p className="text-[11px] text-muted-foreground">We'll auto-fetch market value from eBay using this model name (unless you set a manual price).</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="unity_id">Unity ID</Label>
              <Input id="unity_id" placeholder="Unity device id" value={unityId} onChange={(e) => setUnityId(e.target.value)} className="bg-background border-border font-mono text-xs" data-testid="phone-unity-id" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="carrier">Carrier</Label>
              <Input id="carrier" placeholder="Helium, Tello, TracFone…" list="carrier-list" value={carrier} onChange={(e) => setCarrier(e.target.value)} className="bg-background border-border" data-testid="phone-carrier" />
              <datalist id="carrier-list">
                {COMMON_CARRIERS.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags <span className="text-muted-foreground text-xs">(press Enter or comma)</span></Label>
            <div className="flex flex-wrap gap-1.5 px-2 py-2 bg-background border border-border rounded-md min-h-[42px] focus-within:border-white/30 transition-colors relative">
              {tags.map((t) => {
                const c = colorForTag(t);
                return (
                  <span key={t} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${c.bg} ${c.text} ${c.border}`} data-testid={`tag-chip-${t}`}>
                    {t}
                    <button type="button" onClick={() => removeTag(t)} className="hover:opacity-70">
                      <X className="w-3 h-3" strokeWidth={2} />
                    </button>
                  </span>
                );
              })}
              <input
                ref={tagInputRef}
                value={tagInput}
                onChange={(e) => { setTagInput(e.target.value); setShowTagSuggestions(true); }}
                onKeyDown={handleTagKeyDown}
                onFocus={() => setShowTagSuggestions(true)}
                onBlur={() => setTimeout(() => setShowTagSuggestions(false), 150)}
                placeholder={tags.length === 0 ? "Add a tag (project name)…" : ""}
                className="flex-1 min-w-[100px] bg-transparent outline-none text-sm"
                data-testid="phone-tag-input"
              />
              {showTagSuggestions && tagInput && tagSuggestions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                  {tagSuggestions.map((t) => {
                    const c = colorForTag(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); addTag(t); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-secondary text-left text-sm"
                      >
                        <span className={`px-1.5 py-0.5 rounded text-xs ${c.bg} ${c.text} ${c.border} border`}>{t}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="market_value">Market Value</Label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={useManualPrice}
                  onChange={(e) => setUseManualPrice(e.target.checked)}
                  className="rounded"
                  data-testid="phone-manual-price-toggle"
                />
                Use manual price
              </label>
            </div>
            {useManualPrice ? (
              <Input id="market_value" type="number" step="any" placeholder="e.g. 150" value={marketValue} onChange={(e) => setMarketValue(e.target.value)} className="bg-background border-border font-mono" data-testid="phone-market-value" />
            ) : (
              <p className="text-xs text-muted-foreground italic">eBay average sold price will be fetched automatically using the Model field.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" placeholder="Optional notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-background border-border" />
          </div>

          <Button type="submit" disabled={submitting} className="w-full bg-white text-black hover:bg-neutral-200" data-testid="phone-submit">
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{isEdit ? "Saving…" : "Adding…"}</> : (isEdit ? "Save Changes" : "Add Phone")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

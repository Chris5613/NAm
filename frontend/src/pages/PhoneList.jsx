import { useEffect, useState, useCallback } from "react";
import { phonesApi } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Plus, RefreshCw, MoreVertical, Pencil, Trash2, Smartphone, DollarSign, Loader2, Search, ExternalLink,
} from "lucide-react";
import AddEditPhoneDialog from "@/components/AddEditPhoneDialog";
import { colorForTag, colorForCarrier } from "@/lib/colorHash";

function formatCurrency(v) {
  if (v == null) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);
}

export default function PhoneList() {
  const [phones, setPhones] = useState([]);
  const [totalValue, setTotalValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPhone, setEditingPhone] = useState(null);
  const [search, setSearch] = useState("");
  const [allTags, setAllTags] = useState([]);
  const [filterTag, setFilterTag] = useState(null);

  const fetchPhones = useCallback(async () => {
    try {
      const res = await phonesApi.list();
      setPhones(res.data.phones || []);
      setTotalValue(res.data.total_value || 0);
    } catch (err) {
      toast.error("Failed to load phones");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const res = await phonesApi.tags();
      setAllTags(res.data || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchPhones();
    fetchTags();
  }, [fetchPhones, fetchTags]);

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      const res = await phonesApi.refreshAllPrices();
      const { updated, failed, skipped } = res.data;
      toast.success(`${updated} updated · ${skipped} skipped (manual) · ${failed} failed`);
      await fetchPhones();
    } catch {
      toast.error("Failed to refresh prices");
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefreshOne = async (phone) => {
    setRefreshingId(phone.id);
    try {
      await phonesApi.refreshPrice(phone.id);
      toast.success(`${phone.model} price refreshed`);
      await fetchPhones();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to refresh price");
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDelete = async (phone) => {
    if (!window.confirm(`Delete ${phone.model || "phone"} (${phone.device_id || phone.id.slice(0, 8)})?`)) return;
    try {
      await phonesApi.delete(phone.id);
      toast.success("Phone deleted");
      await fetchPhones();
      await fetchTags();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleEdit = (phone) => {
    setEditingPhone(phone);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingPhone(null);
    setDialogOpen(true);
  };

  const handleSaved = async () => {
    setDialogOpen(false);
    setEditingPhone(null);
    await fetchPhones();
    await fetchTags();
  };

  // Apply search + tag filter
  const filteredPhones = phones.filter((p) => {
    if (filterTag && !(p.tags || []).some((t) => t.toLowerCase() === filterTag.toLowerCase())) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (p.device_id || "").toLowerCase().includes(q) ||
      (p.model || "").toLowerCase().includes(q) ||
      (p.os || "").toLowerCase().includes(q) ||
      (p.unity_id || "").toLowerCase().includes(q) ||
      (p.carrier || "").toLowerCase().includes(q) ||
      (p.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-4xl font-medium tracking-tight">Phone List</h1>
        <p className="text-muted-foreground mt-1">Track every device, tag it by project, and watch the inventory value live.</p>
      </header>

      {/* Inventory value card */}
      <Card className="border-border/40 bg-card" data-testid="inventory-value-card">
        <CardContent className="p-6 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-emerald-400" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Phone Inventory Value</p>
              <p className="text-3xl font-bold font-mono mt-0.5" data-testid="inventory-total">
                {formatCurrency(totalValue)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {phones.length} {phones.length === 1 ? "device" : "devices"} · prices via eBay
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleRefreshAll} disabled={refreshing || phones.length === 0} data-testid="refresh-all-prices">
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.5} />
              Refresh prices
            </Button>
            <Button className="bg-white text-black hover:bg-neutral-200" onClick={handleAdd} data-testid="add-phone-btn">
              <Plus className="w-4 h-4 mr-2" strokeWidth={1.5} />
              Add Phone
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search + tag filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
          <Input
            placeholder="Search device id, model, carrier, tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background border-border"
            data-testid="phone-search"
          />
        </div>
        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setFilterTag(null)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                !filterTag ? "bg-white/15 border-white/30 text-foreground" : "border-border/40 text-muted-foreground hover:bg-secondary"
              }`}
              data-testid="filter-tag-all"
            >
              All
            </button>
            {allTags.map((t) => {
              const c = colorForTag(t);
              const active = filterTag === t;
              return (
                <button
                  key={t}
                  onClick={() => setFilterTag(active ? null : t)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                    active
                      ? `${c.bg} ${c.text} ${c.border} ring-1 ring-white/20`
                      : `${c.bg} ${c.text} ${c.border} opacity-60 hover:opacity-100`
                  }`}
                  data-testid={`filter-tag-${t}`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <Card className="border-border/40 bg-card">
          <CardContent className="p-12 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : phones.length === 0 ? (
        <Card className="border-border/40 bg-card border-dashed">
          <CardContent className="p-12 flex flex-col items-center justify-center text-center">
            <Smartphone className="w-10 h-10 text-muted-foreground mb-3" strokeWidth={1.5} />
            <p className="text-foreground font-medium">No phones yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Add your first device to start tracking inventory value.</p>
            <Button className="bg-white text-black hover:bg-neutral-200" onClick={handleAdd}>
              <Plus className="w-4 h-4 mr-2" strokeWidth={1.5} />
              Add Phone
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/40 bg-card overflow-hidden" data-testid="phones-table-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40 hover:bg-transparent">
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Device ID</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">OS</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Model</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Unity ID</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Carrier</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Tags</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Market Value</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPhones.map((p) => {
                  const carrierColor = colorForCarrier(p.carrier);
                  return (
                    <TableRow key={p.id} className="border-border/30 hover:bg-secondary/30" data-testid={`phone-row-${p.id}`}>
                      <TableCell className="font-mono text-xs">{p.device_id || "—"}</TableCell>
                      <TableCell className="text-sm">{p.os || "—"}</TableCell>
                      <TableCell className="text-sm font-medium">{p.model || "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        <span className="block max-w-[140px] truncate">{p.unity_id || "—"}</span>
                      </TableCell>
                      <TableCell>
                        {p.carrier ? (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${carrierColor.bg} ${carrierColor.text} ${carrierColor.border}`}>
                            {p.carrier}
                          </span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap max-w-[220px]">
                          {(p.tags || []).map((t) => {
                            const c = colorForTag(t);
                            return (
                              <span key={t} className={`px-1.5 py-0.5 rounded text-[11px] font-medium border ${c.bg} ${c.text} ${c.border}`}>
                                {t}
                              </span>
                            );
                          })}
                          {(p.tags || []).length === 0 && <span className="text-muted-foreground text-xs">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-mono text-sm font-medium">{formatCurrency(p.market_value)}</span>
                          <span className="text-[10px] text-muted-foreground uppercase">
                            {p.market_value_source === "ebay" ? "eBay avg" : "manual"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 hover:bg-secondary rounded" data-testid={`phone-menu-${p.id}`}>
                              {refreshingId === p.id ? (
                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                              ) : (
                                <MoreVertical className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                              )}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="bg-card border-border" align="end">
                            <DropdownMenuItem onClick={() => handleEdit(p)} data-testid={`phone-edit-${p.id}`}>
                              <Pencil className="w-3.5 h-3.5 mr-2" strokeWidth={1.5} />Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleRefreshOne(p)} data-testid={`phone-refresh-${p.id}`}>
                              <RefreshCw className="w-3.5 h-3.5 mr-2" strokeWidth={1.5} />Refresh price
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => window.open(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(p.model || "")}&LH_Sold=1&LH_Complete=1`, "_blank")}>
                              <ExternalLink className="w-3.5 h-3.5 mr-2" strokeWidth={1.5} />View sold listings
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDelete(p)} className="text-rose-400" data-testid={`phone-delete-${p.id}`}>
                              <Trash2 className="w-3.5 h-3.5 mr-2" strokeWidth={1.5} />Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredPhones.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8 text-sm">
                      No phones match your search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AddEditPhoneDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingPhone(null); }}
        phone={editingPhone}
        onSaved={handleSaved}
        allTags={allTags}
      />
    </div>
  );
}

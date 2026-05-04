import { useState } from "react";
import { projectsApi } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";

export default function EditProjectDialog({ project, open, onOpenChange, onUpdated }) {
  const [form, setForm] = useState({
    name: project.name || "",
    icon_url: project.icon_url || "",
    invested: project.invested?.toString() || "",
    earned: project.earned?.toString() || "",
    per_day: project.per_day?.toString() || "",
    per_week: project.per_week?.toString() || "",
    per_month: project.per_month?.toString() || "",
    per_year: project.per_year?.toString() || "",
  });
  const [categories, setCategories] = useState(project.categories || []);
  const [newCat, setNewCat] = useState({ name: "", earned: "" });
  const [submitting, setSubmitting] = useState(false);

  const addCategory = () => {
    if (!newCat.name) return;
    setCategories([...categories, { name: newCat.name, earned: parseFloat(newCat.earned) || 0 }]);
    setNewCat({ name: "", earned: "" });
  };

  const removeCategory = (idx) => {
    setCategories(categories.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await projectsApi.update(project.id, {
        name: form.name,
        icon_url: form.icon_url || null,
        invested: parseFloat(form.invested) || 0,
        earned: parseFloat(form.earned) || 0,
        per_day: parseFloat(form.per_day) || 0,
        per_week: parseFloat(form.per_week) || 0,
        per_month: parseFloat(form.per_month) || 0,
        per_year: parseFloat(form.per_year) || 0,
        categories,
      });
      toast.success(`${form.name} updated`);
      onUpdated();
    } catch {
      toast.error("Failed to update project");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="edit-project-dialog">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>Update project details and categories</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-end gap-3">
            {form.icon_url && (
              <img src={form.icon_url} alt="" className="w-10 h-10 rounded-md object-contain border border-border/40" />
            )}
            <div className="flex-1 space-y-2">
              <Label>Project Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="edit-project-input-name"
                className="bg-background border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Logo URL (optional)</Label>
            <Input
              placeholder="https://example.com/logo.png"
              value={form.icon_url}
              onChange={(e) => setForm({ ...form, icon_url: e.target.value })}
              data-testid="edit-project-input-icon"
              className="bg-background border-border text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Total Invested ($)</Label>
              <Input
                type="number" step="any"
                value={form.invested}
                onChange={(e) => setForm({ ...form, invested: e.target.value })}
                data-testid="edit-project-input-invested"
                className="bg-background border-border font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Total Earned ($)</Label>
              <Input
                type="number" step="any"
                value={form.earned}
                onChange={(e) => setForm({ ...form, earned: e.target.value })}
                data-testid="edit-project-input-earned"
                className="bg-background border-border font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-2">
              <Label>Per Day ($)</Label>
              <Input
                type="number" step="any"
                value={form.per_day}
                onChange={(e) => setForm({ ...form, per_day: e.target.value })}
                className="bg-background border-border font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Per Week ($)</Label>
              <Input
                type="number" step="any"
                value={form.per_week}
                onChange={(e) => setForm({ ...form, per_week: e.target.value })}
                className="bg-background border-border font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Per Month ($)</Label>
              <Input
                type="number" step="any"
                value={form.per_month}
                onChange={(e) => setForm({ ...form, per_month: e.target.value })}
                className="bg-background border-border font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Per Year ($)</Label>
              <Input
                type="number" step="any"
                value={form.per_year}
                onChange={(e) => setForm({ ...form, per_year: e.target.value })}
                className="bg-background border-border font-mono"
              />
            </div>
          </div>

          {/* Categories */}
          <div className="space-y-3 pt-2 border-t border-border/40">
            <Label>Earning Categories</Label>
            {categories.length > 0 && (
              <div className="space-y-1">
                {categories.map((cat, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-secondary/50 rounded-md px-3 py-2">
                    <span className="text-sm text-foreground">{cat.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">${(cat.earned || 0).toFixed(2)}</span>
                      <button type="button" onClick={() => removeCategory(idx)} className="text-rose-400 hover:text-rose-300">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Input
                  placeholder="Category name"
                  value={newCat.name}
                  onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
                  className="bg-background border-border text-sm"
                />
              </div>
              <div className="w-28 space-y-1">
                <Input
                  type="number" step="any" placeholder="Earned"
                  value={newCat.earned}
                  onChange={(e) => setNewCat({ ...newCat, earned: e.target.value })}
                  className="bg-background border-border font-mono text-sm"
                />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addCategory} className="border-border/40">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <Button
            type="submit" disabled={submitting}
            className="w-full bg-white text-black hover:bg-neutral-200"
            data-testid="submit-edit-project"
          >
            {submitting ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect, useCallback } from "react";
import { projectsApi } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ChevronDown, ChevronRight, Trash2, Pencil, Timer, Receipt } from "lucide-react";
import AddProjectDialog from "@/components/AddProjectDialog";
import EditProjectDialog from "@/components/EditProjectDialog";
import TransactionsDialog from "@/components/TransactionsDialog";
import EarningsTable from "./EarningsTable";

function formatCurrency(value) {
  if (!value && value !== 0) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

export default function InvestmentOverview() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [txnProject, setTxnProject] = useState(null);

  const [dailyReturns, setDailyReturns] = useState(() => {
  const saved = localStorage.getItem("projectDailyReturns");
  return saved ? JSON.parse(saved) : {};
});

  const fetchProjects = useCallback(async () => {
    try {
      const res = await projectsApi.getAll();
      setProjects(res.data || []);
    } catch {
      toast.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Live-refresh: re-fetch projects whenever an integration card posts a
  // new earning (Acurast / Unity Network / RollerCoin / Nosana / GoMining),
  // or when the tab regains focus or another tab updates localStorage.
  // Without this, posting a balance update from the Integrations tab and
  // navigating back to Investment Overview without a full remount would
  // show stale earned/Net P&L numbers.
  useEffect(() => {
    const refresh = () => { fetchProjects(); };
    const events = [
      "focus",
      "storage",
      "acurast-sync-complete",
      "unity-network-sync-complete",
      "rollercoin-sync-complete",
      "nosana-sync-complete",
      "gomining-sync-complete",
      "gomining-token-sync-complete",
    ];
    events.forEach((e) => window.addEventListener(e, refresh));
    return () => events.forEach((e) => window.removeEventListener(e, refresh));
  }, [fetchProjects]);

  const handleDelete = async (project) => {
    try {
      await projectsApi.delete(project.id);
      toast.success(`${project.name} deleted`);
      fetchProjects();
    } catch {
      toast.error("Failed to delete project");
    }
  };

  useEffect(() => {
  const refreshDailyReturns = () => {
    const saved = localStorage.getItem("projectDailyReturns");
    setDailyReturns(saved ? JSON.parse(saved) : {});
  };

  window.addEventListener("project-daily-returns-updated", refreshDailyReturns);
  window.addEventListener("storage", refreshDailyReturns);

  return () => {
    window.removeEventListener("project-daily-returns-updated", refreshDailyReturns);
    window.removeEventListener("storage", refreshDailyReturns);
  };
}, []);

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Totals
  const totals = projects.reduce(
    (acc, p) => ({
      invested: acc.invested + (p.invested || 0),
      earned: acc.earned + (p.earned || 0),
      per_day: acc.per_day + (p.per_day || 0),
      per_week: acc.per_week + (p.per_week || 0),
      per_month: acc.per_month + (p.per_month || 0),
      per_year: acc.per_year + (p.per_year || 0),
    }),
    { invested: 0, earned: 0, per_day: 0, per_week: 0, per_month: 0, per_year: 0 }
  );
  const totalPnl = totals.earned - totals.invested;

function getRoiDays(project) {
  const remaining = (project.invested || 0) - (project.earned || 0);

  const tableDaily = Number(dailyReturns?.[project.name]);
  const daily = Number.isFinite(tableDaily) && tableDaily > 0
    ? tableDaily
    : project.per_day || 0;

  if (daily <= 0) return null;
  if (remaining <= 0) return 0;

  return Math.ceil(remaining / daily);
}
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground font-mono animate-pulse">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="investment-overview-page">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-medium tracking-tight">Investment Overview</h1>
        <Button
          size="sm"
          onClick={() => setAddDialogOpen(true)}
          className="bg-white text-black hover:bg-neutral-200"
          data-testid="add-project-btn"
        >
          <Plus className="w-4 h-4 mr-2" strokeWidth={1.5} />
          Add Project
        </Button>
      </div>

      {/* Totals Summary */}
      {projects.length > 0 && (
        <Card className="border-border/40 bg-card" data-testid="totals-card">
          <CardContent className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Total Invested</p>
                <p className="font-mono text-sm font-medium text-foreground">{formatCurrency(totals.invested)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Earned</p>
                <p className="font-mono text-sm font-medium text-foreground">{formatCurrency(totals.earned)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Net P&L</p>
                <p className={`font-mono text-sm font-medium ${totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {totalPnl >= 0 ? "+" : ""}{formatCurrency(totalPnl)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Per Day</p>
                <p className="font-mono text-sm font-medium text-foreground">{formatCurrency(totals.per_day)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Per Week</p>
                <p className="font-mono text-sm font-medium text-foreground">{formatCurrency(totals.per_week)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Per Month</p>
                <p className="font-mono text-sm font-medium text-foreground">{formatCurrency(totals.per_month)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Per Year</p>
                <p className="font-mono text-sm font-medium text-foreground">{formatCurrency(totals.per_year)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Project List */}
      {projects.length === 0 ? (
        <Card className="border-border/40 bg-card">
          <CardContent className="p-6 text-center text-muted-foreground text-sm">
            No projects yet. Add your first investment project.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {[...projects]
            .sort((a, b) => ((b.earned || 0) - (b.invested || 0)) - ((a.earned || 0) - (a.invested || 0)))
            .map((project) => {
            const pnl = (project.earned || 0) - (project.invested || 0);
            const isExpanded = expandedId === project.id;
            const roiDays = getRoiDays(project);
            return (
              <div key={project.id}>
                {/* Main Project Box */}
                <Card
                  className="border-border/40 bg-card hover:border-white/10 transition-colors cursor-pointer"
                  data-testid={`project-box-${project.id}`}
                  onClick={() => toggleExpand(project.id)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                        )}
                        {project.icon_url ? (
                          <img src={project.icon_url} alt="" className="w-7 h-7 rounded-md object-contain" />
                        ) : (
                          <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center">
                            <span className="text-xs font-bold text-muted-foreground">{(project.name || "?")[0]}</span>
                          </div>
                        )}
                        <span className="font-medium text-foreground text-lg">{project.name}</span>
                        {/* ROI Countdown */}
                        {roiDays !== null && (
                          <span className={`flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded ${
                            roiDays <= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                          }`} data-testid={`roi-badge-${project.id}`}>
                            <Timer className="w-3 h-3" strokeWidth={2} />
                            {roiDays <= 0 ? "ROI reached" : `${roiDays}d to ROI`}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Invested</p>
                          <p className="font-mono text-sm text-foreground">{formatCurrency(project.invested)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Earned</p>
                          <p className="font-mono text-sm text-foreground">{formatCurrency(project.earned)}</p>
                        </div>
                        <div className="text-right min-w-[100px]">
                          <p className="text-xs text-muted-foreground">Net P&L</p>
                          <p className={`font-mono text-sm font-bold ${pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {pnl >= 0 ? "+" : ""}{formatCurrency(pnl)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); setTxnProject(project); }}
                            data-testid={`txn-project-${project.id}`}
                            title="Add Transaction"
                          >
                            <Receipt className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); setEditingProject(project); }}
                            data-testid={`edit-project-${project.id}`}
                          >
                            <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-rose-400 hover:text-rose-300"
                            onClick={(e) => { e.stopPropagation(); handleDelete(project); }}
                            data-testid={`delete-project-${project.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Expanded Sub-categories — sorted highest to lowest */}
                {isExpanded && project.categories && project.categories.length > 0 && (
                  <div className="ml-10 mt-2 mb-2 space-y-1.5" data-testid={`project-categories-${project.id}`}>
                    {[...project.categories]
                      .sort((a, b) => (Number(b.earned) || 0) - (Number(a.earned) || 0))
                      .map((cat, idx) => (
                      <Card key={idx} className="border-border/20 bg-secondary/50">
                        <CardContent className="px-5 py-3 flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{cat.name}</span>
                          <span className="font-mono text-sm text-foreground">{formatCurrency(cat.earned)}</span>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {isExpanded && (!project.categories || project.categories.length === 0) && (
                  <div className="ml-10 mt-2 mb-2">
                    <Card className="border-border/20 bg-secondary/50">
                      <CardContent className="px-5 py-3">
                        <p className="text-xs text-muted-foreground">No sub-categories added yet</p>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AddProjectDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCreated={() => { setAddDialogOpen(false); fetchProjects(); }}
      />

      {editingProject && (
        <EditProjectDialog
          project={editingProject}
          open={!!editingProject}
          onOpenChange={(open) => !open && setEditingProject(null)}
          onUpdated={() => { setEditingProject(null); fetchProjects(); }}
        />
      )}

      {txnProject && (
        <TransactionsDialog
          project={txnProject}
          open={!!txnProject}
          onOpenChange={(open) => !open && setTxnProject(null)}
          onUpdated={fetchProjects}
        />
      )}

      <EarningsTable />
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

const DEFAULT_RETURNS = {
  Nosana: 1.36,
  "Phone Farm": 11.0,
  RollerCoin: 1.44,
  GoMining: 3.53,
};

function formatUsd(value) {
  const n = Number(value) || 0;
  return `$${n.toFixed(2)}`;
}

function EarningsTable({ excludedProjectNames = [] }) {
  const [dailyReturns, setDailyReturns] = useState(() => {
    const saved = localStorage.getItem("projectDailyReturns");
    return saved ? JSON.parse(saved) : DEFAULT_RETURNS;
  });

  const [newProject, setNewProject] = useState("");
  const [newDaily, setNewDaily] = useState("");

  const visibleReturns = useMemo(() => {
    return Object.entries(dailyReturns)
      .filter(([project]) => !excludedProjectNames.includes(project))
      .sort((a, b) => Number(b[1]) - Number(a[1]));
  }, [dailyReturns, excludedProjectNames]);

  const updateDaily = (project, value) => {
    setDailyReturns((prev) => ({
      ...prev,
      [project]: Number(value) || 0,
    }));
  };

  const addProject = () => {
    const name = newProject.trim();
    const daily = Number(newDaily) || 0;

    if (!name) return;

    setDailyReturns((prev) => ({
      ...prev,
      [name]: daily,
    }));

    setNewProject("");
    setNewDaily("");
  };

  const deleteProject = (project) => {
    setDailyReturns((prev) => {
      const next = { ...prev };
      delete next[project];
      return next;
    });
  };

  useEffect(() => {
    localStorage.setItem("projectDailyReturns", JSON.stringify(dailyReturns));
    window.dispatchEvent(new Event("project-daily-returns-updated"));
  }, [dailyReturns]);

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-[#111] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Project Earnings</h2>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-[1fr_160px_auto]">
        <input
          type="text"
          value={newProject}
          onChange={(e) => setNewProject(e.target.value)}
          placeholder="Project name"
          className="rounded-md border border-white/10 bg-[#111] px-3 py-2 text-sm text-white outline-none focus:bg-[#151515]"
        />

        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
            $
          </span>

          <input
            type="number"
            step="0.01"
            value={newDaily}
            onChange={(e) => setNewDaily(e.target.value)}
            placeholder="Daily"
            className="w-full rounded-md border border-white/10 bg-[#111] py-2 pl-7 pr-3 text-sm text-white outline-none focus:bg-[#151515]"
          />
        </div>

        <button
          type="button"
          onClick={addProject}
          className="inline-flex items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add
        </button>
      </div>

      {visibleReturns.length === 0 ? (
        <div className="rounded-md border border-white/10 bg-[#151515] p-5 text-center text-sm text-gray-400">
          No active project earnings yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-white/10 text-gray-400">
              <tr>
                <th className="w-[22%] py-3 text-left">Project</th>
                <th className="w-[18%] py-3 text-left">Daily Return</th>
                <th className="w-[18%] py-3 text-left">Weekly</th>
                <th className="w-[18%] py-3 text-left">Monthly</th>
                <th className="w-[18%] py-3 text-left">Yearly</th>
                <th className="w-[6%] py-3 text-right"></th>
              </tr>
            </thead>

            <tbody>
              {visibleReturns.map(([project, daily]) => {
                const dailyValue = Number(daily) || 0;
                const weekly = dailyValue * 7;
                const monthly = dailyValue * 30;
                const yearly = dailyValue * 365;

                return (
                  <tr key={project} className="h-[72px] border-b border-white/5">
                    <td className="py-3 font-medium">{project}</td>

                    <td className="py-3">
                      <div className="relative max-w-[140px]">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                          $
                        </span>

                        <input
                          type="number"
                          step="0.01"
                          value={daily}
                          onChange={(e) => updateDaily(project, e.target.value)}
                          className="w-full rounded-md border-0 bg-[#111] py-2 pl-7 pr-3 text-sm text-white shadow-none outline-none ring-0 focus:border-0 focus:bg-[#151515] focus:outline-none focus:ring-0"
                        />
                      </div>
                    </td>

                    <td className="py-3 font-mono">{formatUsd(weekly)}</td>
                    <td className="py-3 font-mono">{formatUsd(monthly)}</td>
                    <td className="py-3 font-mono">{formatUsd(yearly)}</td>

                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => deleteProject(project)}
                        className="inline-flex rounded-md p-1 text-gray-400 hover:text-rose-400"
                        title="Remove from earnings table"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default EarningsTable;
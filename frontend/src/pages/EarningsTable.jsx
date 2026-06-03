import { useEffect, useMemo, useState } from "react";

function formatUsd(value) {
  const n = Number(value) || 0;
  return `$${n.toFixed(2)}`;
}

function EarningsTable({ projects = [] }) {
  const [dailyReturns, setDailyReturns] = useState(() => {
    const saved = localStorage.getItem("projectDailyReturns");
    return saved ? JSON.parse(saved) : {};
  });

  const visibleProjects = useMemo(() => {
    return [...projects]
      .filter((project) => project?.name)
      .sort((a, b) => {
        const aDaily =
          Number(dailyReturns?.[a.name]) || Number(a.per_day) || 0;

        const bDaily =
          Number(dailyReturns?.[b.name]) || Number(b.per_day) || 0;

        return bDaily - aDaily;
      });
  }, [projects, dailyReturns]);

  const updateDaily = (projectName, value) => {
    setDailyReturns((prev) => ({
      ...prev,
      [projectName]: Number(value) || 0,
    }));
  };

  useEffect(() => {
    localStorage.setItem("projectDailyReturns", JSON.stringify(dailyReturns));
    window.dispatchEvent(new Event("project-daily-returns-updated"));
  }, [dailyReturns]);

  if (visibleProjects.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-[#111] p-5">
      <h2 className="mb-4 text-lg font-semibold">Project Earnings</h2>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-sm">
          <thead className="border-b border-white/10 text-gray-400">
            <tr>
              <th className="w-[22%] py-3 text-left">Project</th>
              <th className="w-[18%] py-3 text-left">Daily Return</th>
              <th className="w-[20%] py-3 text-left">Weekly</th>
              <th className="w-[20%] py-3 text-left">Monthly</th>
              <th className="w-[20%] py-3 text-left">Yearly</th>
            </tr>
          </thead>

          <tbody>
            {visibleProjects.map((project) => {
              const daily =
                Number(dailyReturns?.[project.name]) ||
                Number(project.per_day) ||
                0;

              const weekly = daily * 7;
              const monthly = daily * 30;
              const yearly = daily * 365;

              return (
                <tr
                  key={project.id || project.name}
                  className="h-[72px] border-b border-white/5"
                >
                  <td className="py-3 font-medium">{project.name}</td>

                  <td className="py-3">
                    <div className="relative max-w-[140px]">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                        $
                      </span>

                      <input
                        type="number"
                        step="0.01"
                        value={daily}
                        onChange={(e) =>
                          updateDaily(project.name, e.target.value)
                        }
                        className="w-full rounded-md border-0 bg-[#111] py-2 pl-7 pr-3 text-sm text-white shadow-none outline-none ring-0 focus:border-0 focus:bg-[#151515] focus:outline-none focus:ring-0"
                      />
                    </div>
                  </td>

                  <td className="py-3 font-mono">{formatUsd(weekly)}</td>
                  <td className="py-3 font-mono">{formatUsd(monthly)}</td>
                  <td className="py-3 font-mono">{formatUsd(yearly)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default EarningsTable;
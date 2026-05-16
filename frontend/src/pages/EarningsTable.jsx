import { useEffect, useState } from "react";

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

function EarningsTable() {
  const [dailyReturns, setDailyReturns] = useState(() => {
    const saved = localStorage.getItem("projectDailyReturns");
    return saved ? JSON.parse(saved) : DEFAULT_RETURNS;
  });

  useEffect(() => {
    localStorage.setItem("projectDailyReturns", JSON.stringify(dailyReturns));
  }, [dailyReturns]);

  const updateDaily = (project, value) => {
    setDailyReturns((prev) => ({
      ...prev,
      [project]: Number(value) || 0,
    }));
  };

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-[#111] p-5">
      <h2 className="text-lg font-semibold mb-4">Project Earnings</h2>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-sm">
          <thead className="text-gray-400 border-b border-white/10">
            <tr>
                <th className="text-left py-3 w-[22%]">Project</th>
                <th className="text-left py-3 w-[18%]">Daily Return</th>
                <th className="text-left py-3 w-[20%]">Weekly</th>
                <th className="text-left py-3 w-[20%]">Monthly</th>
                <th className="text-left py-3 w-[20%]">Yearly</th>
            </tr>
            </thead>

          <tbody>
            {Object.entries(dailyReturns)
  .sort((a, b) => b[1] - a[1])
  .map(([project, daily]) => {
              const weekly = daily * 7;
              const monthly = daily * 30;
              const yearly = daily * 365;

              return (
                <tr key={project} className="border-b border-white/5 h-[72px]">
                  <td className="py-3 font-medium">{project}</td>

<td className="py-3">
  <div className="relative max-w-[140px]">
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
      $
    </span>

    <input
                    type="number"
                    step="0.01"
                    value={daily}
                    onChange={(e) => updateDaily(project, e.target.value)}
className="
  w-full
  max-w-[140px]
  rounded-md
  bg-[#111]
  px-3
  py-2
  text-sm
  text-white
  shadow-none
  outline-none
  ring-0
  border-0
  focus:outline-none
  focus:ring-0
  focus:border-0
  focus:bg-[#151515]
"
                    
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
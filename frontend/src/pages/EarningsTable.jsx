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
        <table className="w-full text-sm">
          <thead className="text-gray-400 border-b border-white/10">
            <tr>
              <th className="text-left py-3">Project</th>
              <th className="text-left py-3">Daily Return</th>
              <th className="text-left py-3">Weekly</th>
              <th className="text-left py-3">Monthly</th>
              <th className="text-left py-3">Yearly</th>
            </tr>
          </thead>

          <tbody>
            {Object.entries(dailyReturns).map(([project, daily]) => {
              const weekly = daily * 7;
              const monthly = daily * 30;
              const yearly = daily * 365;

              return (
                <tr key={project} className="border-b border-white/5">
                  <td className="py-3 font-medium">{project}</td>

                  <td className="py-3">
                    <input
                      type="number"
                      step="0.01"
                      value={daily}
                      onChange={(e) => updateDaily(project, e.target.value)}
                      className="w-24 rounded-md bg-black border border-white/10 px-2 py-1 text-white"
                    />
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
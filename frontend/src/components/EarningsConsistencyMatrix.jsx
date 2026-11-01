import { formatCurrency } from "@/lib/yieldFarmingAccounting";

const labelDate = key => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
  .format(new Date(`${key}T12:00:00Z`));

export default function EarningsConsistencyMatrix({ matrix }) {
  const { days, best, average, earningDays, recordedDays } = matrix;
  const largest = Math.max(0.01, ...days.filter(day => day.complete && day.value > 0).map(day => day.value));

  return (
    <section className="min-w-0 rounded-2xl border border-[#263342] bg-[#101925] p-4 sm:p-5" aria-label="30 days of earnings consistency">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#819bbc]">Consistency matrix</p>
          <h2 className="mt-1 text-[16px] font-semibold">30 days of earnings</h2>
        </div>
        <p className="text-[11px] text-[#8aa4c3]">Brighter days earned more · Pacific Time</p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="border-l-2 border-[#416381] pl-3">
          <p className="text-[11px] text-[#8aa4c3]">Best completed day</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{best ? formatCurrency(best.value) : "—"}</p>
          <p className="text-[10px] text-[#718aab]">{best ? labelDate(best.key) : "No completed readings yet"}</p>
        </div>
        <div className="border-l-2 border-[#416381] pl-3">
          <p className="text-[11px] text-[#8aa4c3]">Average / recorded day</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{average === null ? "—" : formatCurrency(average)}</p>
          <p className="text-[10px] text-[#718aab]">{recordedDays} completed {recordedDays === 1 ? "day" : "days"} with history</p>
        </div>
        <div className="border-l-2 border-[#416381] pl-3">
          <p className="text-[11px] text-[#8aa4c3]">Days earning</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{earningDays}<span className="ml-1 text-sm font-normal text-[#8aa4c3]">/ {recordedDays}</span></p>
          <p className="text-[10px] text-[#718aab]">Completed days with history</p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1 sm:grid-cols-6 lg:grid-cols-10" role="list" aria-label="Daily earnings for the last 30 days">
        {days.map((day, index) => {
          const positive = day.value !== null && day.value > 0;
          const intensity = !positive ? "bg-[#0d1622]" : day.value / largest >= 0.75
            ? "bg-emerald-500/40" : day.value / largest >= 0.4
              ? "bg-emerald-500/25" : day.value / largest >= 0.15
                ? "bg-emerald-500/15" : "bg-emerald-500/10";
          const today = index === days.length - 1;
          return <div key={day.key} role="listitem"
            aria-label={`${labelDate(day.key)}${today ? ", today" : ""}: ${day.value === null ? "no recorded earnings data" : formatCurrency(day.value)}${today ? ", in progress" : ""}`}
            className={`flex min-h-11 min-w-0 flex-col justify-between rounded-lg border p-1.5 ${day.value === null ? "border-dashed border-[#2a4057]" : "border-[#30485d]"} ${intensity} ${today ? "ring-1 ring-sky-400" : ""}`}>
            <span className="truncate text-[9px] text-[#91aac8]">{labelDate(day.key)}</span>
            <span className={`truncate text-[10px] font-semibold tabular-nums ${day.value === null ? "text-[#536a84]" : day.value < 0 ? "text-rose-300" : "text-white"}`}>{day.value === null ? "—" : formatCurrency(day.value)}</span>
          </div>;
        })}
      </div>
      <p className="mt-2 text-[10px] text-[#718aab]">— means no recorded data. Today is outlined and is excluded from completed-day stats.</p>
    </section>
  );
}

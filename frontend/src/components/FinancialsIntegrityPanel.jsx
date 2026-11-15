import { useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, RefreshCw } from "lucide-react";
import { api } from "@/lib/apiClient";

const statusNames = {
  pass: "Verified",
  warning: "Needs review",
  error: "Discrepancy",
  info: "Informational",
};

export function validateFinancialIntegrityReport(result) {
  return result?.sourceOfCalculation === "backend-cross-page-integrity-v1" &&
    result.readOnly === true && result.financialLedgerMutated === false &&
    /^\d{4}-\d{2}$/.test(result.month || "") &&
    /^\d{4}-\d{2}-\d{2}$/.test(result.asOfDay || "") &&
    ["pass", "warning", "error"].includes(result.status) &&
    Array.isArray(result.checks) &&
    result.checks.length > 0 &&
    result.checks.every(check =>
      check && typeof check.code === "string" &&
      typeof check.message === "string" &&
      ["pass", "warning", "error", "info"].includes(check.status)
    );
}

/** Runs against this person's authenticated production session, without writes. */
export default function FinancialsIntegrityPanel() {
  const [report, setReport] = useState(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const runAudit = async () => {
    if (pending) return;
    setPending(true);
    setFailure("");
    setReport(null);
    setCopied(false);
    try {
      // Do not route through Financials fast cache: a real-time audit
      // must re-query the backend on every explicit button press.
      const fresh = await api.get("/api/project-tracking/cross-page-integrity");
      if (!validateFinancialIntegrityReport(fresh)) {
        throw new Error("The backend returned an incomplete audit report.");
      }
      setReport(fresh);
      setOpen(true);
    } catch (error) {
      setFailure(error?.message || "The authenticated integrity audit is unavailable.");
    } finally {
      setPending(false);
    }
  };

  const copyAudit = async () => {
    if (!report) return;
    const lines = [
      "NAm authenticated read-only Financials integrity audit",
      "Calculated at: " + (report.calculatedAt || report.asOfDay),
      "Status: " + report.status,
      ...report.checks.map(check =>
        "[" + check.status.toUpperCase() + "] " + check.code + ": " +
        check.message +
        (Array.isArray(check.missingEvidence) && check.missingEvidence.length
          ? " | Missing: " + check.missingEvidence.join("; ") : "") +
        (Array.isArray(check.differingFields) && check.differingFields.length
          ? " | Different fields: " + check.differingFields.join(", ") : "")
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
      setFailure("Could not copy the report. Select the checks below to share them.");
    }
  };

  const problems = report?.checks.filter(
    check => check.status === "error" || check.status === "warning"
  ) || [];
  const passCount = report?.checks.filter(check => check.status === "pass").length || 0;

  return <section className="rounded-2xl border border-[#263342] bg-[#0b1017] p-4"
    data-testid="financials-integrity-panel" aria-label="Financials integrity audit">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <ClipboardCheck size={17} className="text-sky-300"/>
          Live accounting integrity audit
        </div>
        <p className="mt-1 text-xs text-[#99b0c2]">
          Verify the current signed-in account against the backend. Read-only;
          no income, hardware credits, or journal entries are changed.
        </p>
      </div>
      <button type="button" onClick={runAudit} disabled={pending}
        className="inline-flex items-center gap-2 rounded-xl border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-200 disabled:opacity-50">
        <RefreshCw size={14} className={pending ? "animate-spin" : ""}/>
        {pending ? "Checking…" : report ? "Run again" : "Run live audit"}
      </button>
    </div>
    {failure && <p role="alert" className="mt-3 text-sm text-rose-300">
      {failure} No audit result was certified.
    </p>}
    {report && <div className="mt-4 space-y-3">
      <p role="status" className="flex flex-wrap items-center gap-2 text-xs text-slate-200">
        {report.status === "pass"
          ? <CheckCircle2 size={16} className="text-emerald-300"/>
          : <AlertTriangle size={16} className="text-amber-300"/>}
        <strong>{passCount} verified · {problems.length} needing review</strong>
        <span className="text-[#9fb4c6]">Report day: {report.asOfDay} (Pacific)</span>
        {report.calculatedAt &&
          <span className="text-[#9fb4c6]">Checked: {new Date(report.calculatedAt).toLocaleString()}</span>}
      </p>
      <p className="text-xs text-[#99b0c2]">
        This check compares provider evidence and account calculations.
        A warning may reflect incomplete historical evidence rather than
        an incorrect balance. It does not certify missing receipts or closes.
      </p>
      <button type="button" onClick={copyAudit}
        className="mr-4 rounded-md border border-[#345063] px-2 py-1 text-xs text-sky-300">
        {copied ? "Audit copied" : "Copy audit results"}
      </button>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="text-xs font-semibold text-sky-300 underline decoration-dotted">
        {open ? "Hide" : "Show"} individual audit checks
      </button>
      {open && <ul className="max-h-80 space-y-2 overflow-y-auto text-xs">
        {report.checks.map((check, index) => <li key={check.code + ":" + index}
          className="rounded-lg border border-[#293947] bg-[#111a24] p-2">
          <p className="font-medium text-white">
            <span className={
              check.status === "pass" ? "text-emerald-300" :
              check.status === "error" ? "text-rose-300" :
              check.status === "warning" ? "text-amber-300" : "text-[#a6b9c9]"
            }>{statusNames[check.status]}</span>
            {" · "}{check.code}
          </p>
          <p className="mt-1 text-[#b7c9d6]">{check.message}</p>
          {Array.isArray(check.missingEvidence) && check.missingEvidence.length > 0 &&
            <p className="mt-1 text-amber-200">
              Missing evidence: {check.missingEvidence.join("; ")}
            </p>}
          {Array.isArray(check.differingFields) && check.differingFields.length > 0 &&
            <p className="mt-1 text-rose-200">
              Differing fields: {check.differingFields.join(", ")}
            </p>}
        </li>)}
      </ul>}
    </div>}
  </section>;
}

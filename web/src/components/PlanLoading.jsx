import { Check, LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Skeleton } from "./ui.jsx";

/** "1:07" from milliseconds. */
export function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const fallbackStages = [
  { id: "reading", label: "Reading the project", state: "running" },
  { id: "dependencies", label: "Checking dependencies and versions", state: "waiting" },
  { id: "risky-code", label: "Finding code that could break", state: "waiting" },
  { id: "writing", label: "Writing the plan", state: "waiting" },
];

/**
 * Full loading panel while a plan is created: real stages from the server
 * (GET /plan-jobs/:id), a live elapsed timer and skeletons of the plan page.
 */
export function PlanLoading({ job, startedAt, repoLabel, onCancel }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const stages = job?.stages?.length ? job.stages : fallbackStages;
  const current = stages.find((stage) => stage.state === "running");
  const doneCount = stages.filter((stage) => stage.state === "done").length;
  const percent = Math.round(((doneCount + (current ? 0.5 : 0)) / stages.length) * 100);
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="plan-loading fixed inset-0 z-40 overflow-y-auto bg-bg/85 backdrop-blur-sm">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center gap-5 px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-border-strong bg-surface p-5 shadow-lg sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Creating your migration plan</p>
              <h2 className="mt-1 text-xl font-semibold text-fg sm:text-2xl">{current?.label ?? "Almost done"}…</h2>
              {repoLabel ? <p className="mt-1 truncate font-mono text-sm text-fg-muted" title={repoLabel}>{repoLabel}</p> : null}
            </div>
            <div className="text-right">
              <p className="font-mono text-2xl font-semibold tabular-nums text-fg" aria-label="Time elapsed">{formatElapsed(now - startedAt)}</p>
              <p className="text-xs text-fg-subtle">elapsed</p>
            </div>
          </div>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.max(6, percent)}%` }} />
          </div>
          <ol className="mt-5 flex flex-col gap-2.5">
            {stages.map((stage, index) => (
              <li key={stage.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${stage.state === "running" ? "border-info/30 bg-info-soft text-fg" : stage.state === "failed" ? "border-danger/30 bg-danger-soft text-danger" : "border-border bg-surface-2/60 text-fg-muted"}`}>
                <span className={`grid size-6 shrink-0 place-items-center rounded-full border ${stage.state === "done" ? "border-success/30 bg-success-soft text-success" : stage.state === "running" ? "border-info/40 text-info" : stage.state === "failed" ? "border-danger/40 text-danger" : "border-border text-fg-subtle"}`}>
                  {stage.state === "done" ? <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} /> : stage.state === "running" ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : stage.state === "failed" ? <X aria-hidden="true" className="size-3.5" /> : <span className="text-[11px] font-semibold">{index + 1}</span>}
                </span>
                <span className="min-w-0 flex-1">{stage.label}</span>
                <span className="text-xs text-fg-subtle">{stage.state === "done" ? "Done" : stage.state === "running" ? "Working" : stage.state === "failed" ? "Failed" : "Waiting"}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-fg-muted">Read-only: nothing in your project is changed while we plan.</p>
            {onCancel ? <Button variant="ghost" size="sm" onClick={onCancel}>Hide</Button> : null}
          </div>
        </div>
        <div aria-hidden="true" className="grid gap-3 rounded-2xl border border-border bg-surface/60 p-5">
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

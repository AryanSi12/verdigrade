import { Check, LoaderCircle, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { formatElapsed } from "./PlanLoading.jsx";

/** Short stage names for the banner chips (the server's labels are longer). */
const shortLabels = {
  clone: "Get repo",
  reading: "Read project",
  dependencies: "Dependencies",
  "risky-code": "Risky code",
  writing: "Write plan",
  "ai-review": "AI review",
};

/** Stages for a finished deterministic plan whose AI review is still running (or done). */
export function reviewStages(plan, reviewState) {
  const base = [...(plan?.source ? ["clone"] : []), "reading", "dependencies", "risky-code", "writing"].map((id) => ({ id, state: "done" }));
  return [...base, { id: "ai-review", state: reviewState }];
}

/**
 * Sticky "Planning… (stage, elapsed)" bar at the top of the plan. Findings
 * render underneath as soon as they exist; this bar shows what is still running.
 */
export function PlanningBanner({ title, detail, stages, startedAt, done = false, failed = false }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (done || failed) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [done, failed]);
  const doneCount = stages.filter((stage) => stage.state === "done").length;
  const running = stages.some((stage) => stage.state === "running");
  const percent = done ? 100 : Math.round(((doneCount + (running ? 0.5 : 0)) / Math.max(1, stages.length)) * 100);
  const current = stages.find((stage) => stage.state === "running" || stage.state === "failed");
  const step = Math.min(stages.length, doneCount + (current ? 1 : 0));
  const tone = failed ? "text-danger" : done ? "text-success" : "text-accent";
  // One slim line: icon, what is happening, stage count, elapsed time, then a thin bar. The page shows beneath it.
  return (
    <div className="planning-banner sticky top-[4.5rem] z-30 mb-5 lg:top-4">
      <section
        role="status"
        aria-live="polite"
        aria-busy={!done && !failed}
        aria-label="Planning progress"
        title={detail ?? undefined}
        className="overflow-hidden rounded-lg border border-border bg-surface/95 backdrop-blur"
      >
        <div className="flex h-10 items-center gap-2.5 px-3.5 text-sm">
          <span className={`shrink-0 ${tone}`}>
            {failed ? <X aria-hidden="true" className="size-4" /> : done ? <Check aria-hidden="true" className="size-4" strokeWidth={2.5} /> : current?.id === "ai-review" ? <Sparkles aria-hidden="true" className="pulse-soft size-4" /> : <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium text-fg">{title}</span>
          {failed && detail ? <span className="hidden max-w-[40%] truncate text-xs text-danger sm:inline">{detail}</span> : null}
          {!done && !failed ? (
            <span className="hidden shrink-0 text-xs text-fg-muted sm:inline">
              Step {step} of {stages.length}
              {current ? ` · ${shortLabels[current.id] ?? current.label ?? current.id}` : ""}
            </span>
          ) : null}
          {startedAt ? (
            <span className="shrink-0 text-xs text-fg-muted tabular-nums" aria-label="Time elapsed">
              {formatElapsed((done || failed ? now : Date.now()) - startedAt)}
            </span>
          ) : null}
        </div>
        <div className="h-0.5 bg-surface-2" aria-hidden="true">
          <div className={`h-full transition-[width] duration-500 ${failed ? "bg-danger" : done ? "bg-success" : "bg-accent"}`} style={{ width: `${Math.max(6, percent)}%` }} />
        </div>
      </section>
    </div>
  );
}

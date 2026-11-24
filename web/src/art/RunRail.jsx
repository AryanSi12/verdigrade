import { stepIcons, stepMeta, stepOrder } from "../pipeline.js";

const nodeTone = {
  passed: "border-success/40 bg-success-soft text-success",
  failed: "border-danger/50 bg-danger-soft text-danger shadow-[0_0_18px_-2px_var(--lf-danger)]",
  running: "border-accent/60 bg-accent-soft text-accent shadow-[0_0_18px_-2px_var(--lf-accent)]",
  skipped: "border-border bg-surface-2 text-fg-subtle",
  waiting: "border-border bg-surface-2 text-fg-subtle",
};

/** The run's pipeline as a beam line: lit segments for finished steps, a travelling pulse into the running one. */
export default function RunRail({ steps }) {
  const ids = stepOrder.filter((id) => steps[id]);
  return (
    <ol className="flex w-full items-start" aria-label="Pipeline progress">
      {ids.map((id, index) => {
        const status = steps[id]?.status ?? "waiting";
        const Icon = stepIcons[id];
        const next = ids[index + 1] ? steps[ids[index + 1]]?.status : null;
        const lit = status === "passed" || status === "skipped";
        return (
          <li key={id} className="flex min-w-0 flex-1 items-start last:flex-none">
            <div className="flex w-8 shrink-0 flex-col items-center gap-1.5 sm:w-auto">
              <span title={`${(steps?.[id]?.label ?? stepMeta[id]?.label)}: ${status}`} className={`grid size-8 place-items-center rounded-lg border ${nodeTone[status] ?? nodeTone.waiting} ${status === "running" ? "pulse-soft" : ""}`}>
                <Icon aria-hidden="true" className="size-4" />
                <span className="sr-only">
                  {(steps?.[id]?.label ?? stepMeta[id]?.label)}: {status}
                </span>
              </span>
              <span className="hidden text-2xs leading-none whitespace-nowrap text-fg-subtle lg:block">{(steps?.[id]?.label ?? stepMeta[id]?.label)}</span>
            </div>
            {index < ids.length - 1 ? (
              <span aria-hidden="true" className="relative mx-1 mt-4 h-px min-w-2 flex-1 overflow-hidden bg-border-strong sm:mx-2">
                {lit ? <span className={`absolute inset-0 ${next === "failed" ? "bg-[linear-gradient(90deg,var(--lf-success),var(--lf-danger))]" : "bg-success/70"}`} /> : null}
                {lit && next === "running" ? <span className="rail-pulse absolute inset-y-0 w-1/2 bg-[linear-gradient(90deg,transparent,var(--lf-accent),transparent)]" /> : null}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

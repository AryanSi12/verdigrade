import { Link } from "react-router";
import { ArrowUpRight, Ban, ClipboardList, FileCode2, Hand, LockKeyhole, MessageSquareQuote, TriangleAlert } from "lucide-react";
import { RiskChip } from "./PlanExplain.jsx";
import { Card } from "./ui.jsx";

const actionWord = { skipped: "skipped", restored: "reverted", removed: "removed" };

/** Lock violations repeat per edit; fold them into one row per file, step and action. */
export function groupViolations(violations = []) {
  const map = new Map();
  for (const v of violations) {
    const key = `${v.file}|${v.step}|${v.action}`;
    const row = map.get(key) ?? { ...v, count: 0 };
    row.count += 1;
    map.set(key, row);
  }
  return [...map.values()];
}

export function followUpCounts(run) {
  const items = (run.plan?.followUps ?? []).filter((item) => item.id !== "plan-note");
  const blocked = run.lockViolations?.length ?? 0;
  const pipeline = run.followUps?.length ?? 0;
  return { items, blocked, pipeline, total: items.length + groupViolations(run.lockViolations).length + pipeline };
}

/**
 * The run's "Manual follow-up": what the plan kept for a human, every edit a lock blocked,
 * and the pipeline's own follow-ups. Mirrors the report section of the same name.
 */
export default function FollowUps({ run, stepLabel }) {
  const { items, pipeline } = followUpCounts(run);
  const blocked = groupViolations(run.lockViolations);
  const note = run.plan?.followUps?.find((item) => item.id === "plan-note")?.note;
  if (!run.plan && !blocked.length && !pipeline) return null;
  const planLink = run.plan ? `/plan/${run.plan.planId}` : null;
  return (
    <Card as="section" aria-labelledby="followup-title" className="reveal mt-6 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-px grid size-9 shrink-0 place-items-center rounded-lg border border-warning/30 bg-warning-soft text-warning">
            <Hand aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 id="followup-title" className="text-lg leading-6 font-semibold tracking-[-0.015em] text-fg">
              Manual follow-up
            </h2>
            <p className="mt-0.5 text-sm text-fg-muted">
              {items.length} kept for a human · {run.lockViolations?.length ?? 0} edit{run.lockViolations?.length === 1 ? "" : "s"} blocked by locks · {pipeline} from the pipeline
            </p>
          </div>
        </div>
        {planLink ? (
          <Link to={planLink} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-medium text-fg transition-colors duration-150 hover:bg-surface-2">
            <ClipboardList aria-hidden="true" className="size-4" /> View plan <ArrowUpRight aria-hidden="true" className="size-3.5 text-fg-muted" />
          </Link>
        ) : null}
      </div>

      <div className="grid gap-px bg-border md:grid-cols-2">
        <div className="min-w-0 bg-surface p-5 sm:px-6">
          <h3 className="eyebrow flex items-center gap-2">
            <LockKeyhole aria-hidden="true" className="size-3.5 text-accent" /> Protected by the plan
          </h3>
          {items.length ? (
            <ul className="mt-3 space-y-3">
              {items.map((item) => (
                <li key={item.id} className="flex gap-3">
                  <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border ${item.decision === "lock" ? "border-accent/30 bg-accent-soft text-accent" : "border-warning/30 bg-warning-soft text-warning"}`} title={item.decision === "lock" ? "Locked" : "Manual"}>
                    {item.decision === "lock" ? <LockKeyhole aria-hidden="true" className="size-3.5" /> : <Hand aria-hidden="true" className="size-3.5" />}
                    <span className="sr-only">{item.decision === "lock" ? "Locked" : "Manual"}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium break-words text-fg">
                      {item.plainTitle ?? item.title}
                      {item.riskIfSkipped && item.riskIfSkipped !== "none" ? <RiskChip risk={item.riskIfSkipped} prefix="Risk if left" /> : null}
                    </p>
                    {item.file ? (
                      <code className="code-chip mt-1">
                        <FileCode2 aria-hidden="true" className="size-3 shrink-0" />
                        <span className="truncate">{item.file}{item.line ? `:${item.line}` : ""}</span>
                      </code>
                    ) : null}
                    {item.note ? <p className="mt-1 text-sm text-fg-muted"><span className="font-medium text-fg">Note: </span>{item.note}</p> : null}
                    {item.consequence ? (
                      <p className="mt-1 text-sm text-fg-muted">
                        <span className="font-medium text-fg">What this means: </span>
                        {item.consequence}
                      </p>
                    ) : !item.note && item.suggestion ? (
                      <p className="mt-1 text-sm text-fg-muted">{item.suggestion}</p>
                    ) : null}
                    {item.manualSteps?.length ? (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-fg-subtle">To do by hand{item.effort ? ` · ${item.effort}` : ""}</p>
                        <ul className="mt-1 space-y-1 text-sm text-fg-muted">
                          {item.manualSteps.map((step) => (
                            <li key={step} className="flex gap-2">
                              <span aria-hidden="true" className="mt-1 size-3.5 shrink-0 rounded-[4px] border border-border-strong" />
                              <span>{step}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-fg-muted">{run.plan ? "Every plan item was approved." : "This run had no plan."}</p>
          )}
        </div>

        <div className="min-w-0 space-y-5 bg-surface p-5 sm:px-6">
          <div>
            <h3 className="eyebrow flex items-center gap-2">
              <Ban aria-hidden="true" className="size-3.5 text-danger" /> Blocked by locks
            </h3>
            {blocked.length ? (
              <ul className="mt-3 space-y-2">
                {blocked.map((row) => (
                  <li key={`${row.file}|${row.step}|${row.action}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-sm">
                    <span className="font-medium text-fg tabular-nums">{row.count}×</span>
                    <span className="text-fg-muted">
                      {actionWord[row.action] ?? row.action} in <span className="font-medium text-fg">{stepLabel(row.step)}</span>
                    </span>
                    <code className="code-chip">
                      <span className="truncate">{row.file}</span>
                    </code>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-fg-muted">No step tried to touch a protected path.</p>
            )}
          </div>
          {run.followUps?.length ? (
            <div>
              <h3 className="eyebrow flex items-center gap-2">
                <TriangleAlert aria-hidden="true" className="size-3.5 text-warning" /> From the pipeline
              </h3>
              <ul className="mt-3 space-y-1.5 text-sm text-fg-muted">
                {run.followUps.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-warning" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {note ? (
            <blockquote className="flex gap-2.5 border-t border-border pt-4 text-sm text-fg-muted">
              <MessageSquareQuote aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
              <span>
                <span className="font-medium text-fg">Reviewer note: </span>
                {note}
              </span>
            </blockquote>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

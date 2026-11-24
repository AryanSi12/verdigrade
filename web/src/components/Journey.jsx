import { Link } from "react-router";
import { ClipboardList, FileCheck2, FlaskConical, FolderOpen, ShieldCheck } from "lucide-react";

/** The product flow, in order. Shared by the home page, New, Plan and Run. */
export const journeyStages = [
  { id: "new", label: "Project", long: "Choose a project", icon: FolderOpen, blurb: "Pick a folder or sample. The language and versions are detected from the build files." },
  { id: "plan", label: "Plan", long: "Read-only plan", icon: ClipboardList, blurb: "The adapter reads the whole project and sorts every finding: automatic, risky, manual." },
  { id: "approve", label: "Approve", long: "You approve", icon: ShieldCheck, blurb: "Approve, lock or keep each item for yourself. Locked paths are enforced in code." },
  { id: "dryrun", label: "Dry run", long: "Dry run", icon: FlaskConical, blurb: "The pipeline runs on a temporary copy with its own git history. Tests decide." },
  { id: "review", label: "Review", long: "Review & report", icon: FileCheck2, blurb: "Read the diff, the blocked edits and the manual follow-up, then run it for real." },
];

/**
 * Compact segmented progress bar: one segment per stage, filled when done, accent when current.
 * `links` maps a stage id to a path so finished stages are navigable. `state`: active | running | failed | done.
 */
export default function Journey({ current, links = {}, state = "active", labels = {}, className = "" }) {
  const activeIndex = journeyStages.findIndex((stage) => stage.id === current);
  return (
    <nav aria-label="Migration progress" className={`journey ${className}`}>
      <ol className="grid grid-cols-5 gap-2">
        {journeyStages.map((stage, index) => {
          const done = index < activeIndex || (index === activeIndex && state === "done");
          const active = index === activeIndex && state !== "done";
          const failed = active && state === "failed";
          const bar = failed ? "bg-danger" : done ? "bg-accent/30" : active ? `bg-accent ${state === "running" ? "pulse-soft" : ""}` : "bg-surface-3";
          const text = active ? (failed ? "text-danger" : "text-fg") : done ? "text-fg-muted" : "text-fg-subtle";
          const body = (
            <>
              <span aria-hidden="true" className={`block h-[3px] rounded-full ${bar}`} />
              <span className={`mt-2 flex items-center gap-1.5 truncate text-xs font-medium ${text}`}>
                <span className="tabular-nums opacity-70">{index + 1}</span>
                {labels[stage.id] ?? stage.label}
              </span>
              <span className="sr-only">{failed ? " (failed)" : active ? (state === "running" ? " (in progress)" : " (current step)") : done ? " (done)" : ""}</span>
            </>
          );
          const to = links[stage.id];
          return (
            <li key={stage.id} className="min-w-0" aria-current={active ? "step" : undefined}>
              {to && !active ? (
                <Link to={to} className="block rounded outline-offset-4 hover:opacity-80">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

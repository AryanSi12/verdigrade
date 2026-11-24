import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { ChevronDown, History } from "lucide-react";
import { api } from "../api.js";
import { useMigration } from "../migrationContext.js";
import { folderName, formatRelative, formatTime } from "../pipeline.js";
import { sourceName } from "./SourceBadge.jsx";

const runDot = { passed: "bg-success", failed: "bg-danger", running: "bg-accent", cancelled: "bg-fg-subtle" };

/**
 * Compact "History" dropdown: recent runs and plans with status and time; click one to open it.
 * Closed by default; plans load when it opens. `placement` "side" opens to the right of the sidebar.
 */
export default function HistoryMenu({ placement = "side", className = "", buttonClass = "" }) {
  const { history } = useMigration();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("runs");
  const [more, setMore] = useState(false);
  const [plans, setPlans] = useState(null);
  const root = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    api.plans(controller.signal, 12).then((result) => setPlans(result?.plans ?? []), () => setPlans((old) => old ?? []));
    const onDown = (event) => {
      if (root.current && !root.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      controller.abort();
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const runs = (history?.migrations ?? []).slice(0, 12);
  const rows =
    tab === "runs"
      ? runs.map((run) => ({
          key: run.sessionId,
          to: `/runs/${run.sessionId}`,
          name: sourceName(run.source, folderName(run.repoPath)),
          dot: runDot[run.status] ?? "bg-fg-subtle",
          status: run.status === "passed" ? "Passed" : run.status === "failed" ? "Failed" : run.status === "running" ? "Running" : run.status,
          detail: run.dryRun ? "Dry run" : "Run",
          time: run.startedAt,
        }))
      : (plans ?? []).map((plan) => ({
          key: plan.planId,
          to: `/plan/${plan.planId}`,
          name: sourceName(plan.source, plan.repoName),
          dot: plan.status === "approved" ? "bg-success" : "bg-warning",
          status: plan.status === "approved" ? "Approved" : "Draft",
          detail: plan.targetLabel ?? "Plan",
          time: plan.createdAt,
        }));
  const panelPos = placement === "side" ? "left-full top-0 ml-3" : "right-0 top-full mt-2";

  return (
    <div ref={root} className={`relative ${className}`}>
      <button type="button" aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen((value) => !value)} className={buttonClass}>
        <History aria-hidden="true" className="size-4 shrink-0" />
        <span className="flex-1 text-left">History</span>
        <ChevronDown aria-hidden="true" className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div id={`${id}-panel`} className={`absolute z-50 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border border-border bg-elevated text-fg shadow-pop ${panelPos}`}>
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="inline-flex rounded-md bg-surface-2 p-0.5" role="tablist" aria-label="History type">
              {[
                ["runs", `Runs${runs.length ? ` (${runs.length})` : ""}`],
                ["plans", `Plans${plans?.length ? ` (${plans.length})` : ""}`],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => {
                    setTab(value);
                    setMore(false);
                  }}
                  className={`h-7 rounded px-3 text-xs font-medium ${tab === value ? "bg-surface text-fg shadow-xs ring-1 ring-border" : "text-fg-muted hover:text-fg"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Link to="/" onClick={() => setOpen(false)} className="text-xs font-medium text-accent hover:underline">
              View all
            </Link>
          </div>
          <ul className="max-h-[22rem] overflow-y-auto py-1" role="list">
            {tab === "plans" && plans === null ? <li className="px-3 py-3 text-sm text-fg-muted">Loading…</li> : null}
            {rows.length === 0 && !(tab === "plans" && plans === null) ? <li className="px-3 py-3 text-sm text-fg-muted">Nothing yet.</li> : null}
            {(more ? rows : rows.slice(0, 3)).map((row) => (
              <li key={row.key}>
                <Link to={row.to} onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-2">
                  <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${row.dot}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{row.name}</span>
                    <span className="block truncate text-xs text-fg-muted">
                      {row.status} · {row.detail}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-fg-subtle tabular-nums" title={row.time ? formatTime(row.time) : undefined}>
                    {row.time ? formatRelative(row.time) : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {rows.length > 3 ? (
            <button
              type="button"
              onClick={() => setMore((value) => !value)}
              aria-expanded={more}
              className="block w-full border-t border-border px-3 py-2 text-center text-xs font-medium text-accent hover:bg-surface-2"
            >
              {more ? "Show less" : `Show more (${rows.length - 3})`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

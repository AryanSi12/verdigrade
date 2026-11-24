import { Link } from "react-router";
import { sourceName } from "./SourceBadge.jsx";
import { ArrowRight, ChevronRight, History } from "lucide-react";
import { folderName, formatRelative, formatTime } from "../pipeline.js";
import { buttonClass, EmptyState, ErrorState, Skeleton, StatusPill } from "./ui.jsx";

function Version({ fact }) {
  if (!fact) return <span className="text-xs text-fg-subtle">—</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs tabular-nums">
      <span className="truncate text-fg-muted">{fact.label}</span>
      <span className="inline-flex items-center gap-1 tabular-nums">
        <span className="text-fg-subtle">{fact.before || "?"}</span>
        <ArrowRight aria-hidden="true" className="size-3 shrink-0 text-fg-subtle" />
        <span className="text-fg">{fact.after || fact.target || "?"}</span>
      </span>
    </span>
  );
}

/** Older rows have no versions[]; rebuild the Java pair from the flat columns. */
function versionsOf(item) {
  if (item.versions?.length) return item.versions;
  return [
    { key: "java", label: "Java", before: item.javaBefore, after: item.javaAfter, target: item.targetJava },
    { key: "boot", label: "Boot", before: item.springBefore, after: item.springAfter, target: item.targetBoot },
  ];
}

const shortLabel = (label) => (label === "Spring Boot" ? "Boot" : label === "TypeScript" ? "TS" : label);

export default function HistoryList({ history, error, loading, onRetry, plans = null, limit = 0 }) {
  if (error && !history) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading && !history) {
    return (
      <div className="divide-y divide-border">
        {[0, 1, 2].map((key) => (
          <div key={key} className="flex items-center gap-4 px-5 py-4">
            <Skeleton className="h-6 w-20 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="hidden h-3.5 w-32 sm:block" />
          </div>
        ))}
      </div>
    );
  }
  const items = history?.migrations ?? [];
  if (!items.length) {
    return (
      <div className="p-5">
        <EmptyState
          icon={History}
          title="No migrations yet"
          action={
            <Link to="/new" className={buttonClass({ variant: "primary", size: "sm" })}>
              Start a migration
            </Link>
          }
        >
          Create a plan, approve it, and the dry run shows up here from any browser.
        </EmptyState>
      </div>
    );
  }
  const planStatus = new Map((plans ?? []).map((plan) => [plan.planId, plan.status]));
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Project</th>
            <th scope="col">Status</th>
            <th scope="col" className="hidden md:table-cell">Upgrade</th>
            <th scope="col" className="hidden lg:table-cell">Engine</th>
            <th scope="col" className="text-right">Started</th>
            <th scope="col" className="w-8"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((item) => {
            const [first, second] = versionsOf(item).map((fact) => ({ ...fact, label: shortLabel(fact.label) }));
            const plan = item.planId ? planStatus.get(item.planId) ?? "approved" : null;
            const to = `/runs/${item.sessionId}`;
            return (
              <tr key={item.sessionId} className="group relative">
                <td className="max-w-0 min-w-[12rem]">
                  <Link to={to} className="block truncate font-medium text-fg after:absolute after:inset-0" title={item.source?.url || item.repoPath}>
                    {sourceName(item.source, folderName(item.repoPath))}
                  </Link>
                  <span className="mt-0.5 block truncate text-xs text-fg-subtle">
                    {item.dryRun ? "Dry run" : "Applied"}
                    {plan ? ` · plan ${plan}` : " · no plan"}
                  </span>
                </td>
                <td className="whitespace-nowrap">
                  <StatusPill status={item.status} />
                </td>
                <td className="hidden whitespace-nowrap md:table-cell">
                  <span className="flex flex-col gap-0.5">
                    <Version fact={first} />
                    {second?.before || second?.after || second?.target ? <Version fact={second} /> : null}
                  </span>
                </td>
                <td className="hidden whitespace-nowrap text-fg-muted lg:table-cell" title={item.model ? `Model ${item.model}` : "No AI model used"}>
                  {item.engine === "ai" ? "Full AI" : item.engine === "hybrid" ? "Hybrid" : item.engine ? "Free step" : "—"}
                  {item.engine && item.engine !== "classic" && item.tokens != null ? <span className="block text-xs text-fg-subtle tabular-nums">{item.tokens.toLocaleString("en-US")} tokens</span> : null}
                </td>
                <td className="text-right whitespace-nowrap text-fg-subtle tabular-nums" title={formatTime(item.startedAt)}>
                  {formatRelative(item.startedAt)}
                </td>
                <td className="w-8 text-fg-subtle">
                  <ChevronRight aria-hidden="true" className="size-4 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-fg" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {history.total > shown.length && !limit ? <p className="border-t border-border px-5 py-2.5 text-center text-xs text-fg-subtle tabular-nums">Showing {shown.length} of {history.total}</p> : null}
    </div>
  );
}

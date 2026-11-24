import { useState } from "react";
import { ArrowUp, Folder, FolderCheck, HardDrive } from "lucide-react";
import { api } from "../api.js";
import { useAsync } from "../useAsync.js";
import { buttonClass, ErrorState, Skeleton } from "./ui.jsx";

/** Browses only inside the server's allowed roots (VERDIGRADE_ROOTS). */
export default function FolderPicker({ value, onPick }) {
  const [current, setCurrent] = useState("");
  const listing = useAsync((signal) => api.browse(current, signal), [current]);
  const data = listing.data;
  const atRoots = !current;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
      <div className="flex h-11 items-center gap-2 border-b border-border bg-surface-2/60 px-2">
        <button
          type="button"
          onClick={() => setCurrent(data?.parent ?? "")}
          disabled={atRoots}
          className={buttonClass({ variant: "ghost", size: "sm", className: "px-2" })}
        >
          <ArrowUp aria-hidden="true" /> Up
        </button>
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-fg-subtle" title={current || "Allowed roots"}>
          {current || "Allowed roots"}
        </p>
        {current ? (
          <button type="button" onClick={() => onPick(current)} className={buttonClass({ variant: "primary", size: "sm" })}>
            Use this folder
          </button>
        ) : null}
      </div>
      <div className="max-h-64 overflow-y-auto p-1" aria-busy={listing.loading}>
        {listing.error ? (
          <div className="p-2">
            <ErrorState error={listing.error} onRetry={listing.reload} compact />
          </div>
        ) : !data ? (
          <div className="space-y-1.5 p-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ) : data.entries.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-fg-muted">No sub-folders here.</p>
        ) : (
          <ul className="space-y-0.5">
            {data.entries
              .filter((entry) => entry.isDirectory)
              .map((entry) => {
                const Icon = atRoots ? HardDrive : entry.buildTool ? FolderCheck : Folder;
                const selected = value === entry.path;
                return (
                  <li key={entry.path} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCurrent(entry.path)}
                      className={`flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 text-left text-sm leading-none transition-colors duration-150 hover:bg-surface-2 ${selected ? "bg-accent-soft" : ""}`}
                    >
                      <Icon aria-hidden="true" className={`size-4 shrink-0 ${entry.buildTool ? "text-accent" : "text-fg-subtle"}`} />
                      <span className="truncate text-fg">{entry.name}</span>
                      {entry.buildTool ? <span className="inline-flex h-5 shrink-0 items-center rounded bg-accent-soft px-1.5 font-mono text-2xs leading-none text-accent">{entry.buildTool}</span> : null}
                    </button>
                    {entry.buildTool ? (
                      <button type="button" onClick={() => onPick(entry.path)} className={buttonClass({ variant: "ghost", size: "sm", className: "text-accent hover:text-accent" })}>
                        Select
                      </button>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </div>
  );
}

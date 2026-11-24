import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, FileCode2, FileDiff } from "lucide-react";
import { api } from "../api.js";
import { useAsync } from "../useAsync.js";
import { buttonClass, EmptyState, ErrorState, Pill, Skeleton } from "./ui.jsx";

const LINES_PER_FILE = 600;

export function parseDiff(text) {
  const files = [];
  let current = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const match = / b\/(.+)$/.exec(line);
      current = { path: match ? match[1] : line.slice(11), lines: [], added: 0, removed: 0 };
      files.push(current);
      continue;
    }
    if (!current) continue;
    if (/^(index |--- |\+\+\+ |new file mode|deleted file mode|similarity index|rename (from|to) )/.test(line)) {
      if (line.startsWith("new file")) current.status = "added";
      if (line.startsWith("deleted file")) current.status = "deleted";
      continue;
    }
    if (line.startsWith("+")) current.added += 1;
    else if (line.startsWith("-")) current.removed += 1;
    current.lines.push(line);
  }
  return files;
}

/** Numbers each line of a parsed file: old/new line numbers taken from the @@ hunk headers. */
function numberLines(lines) {
  let oldNo = 0;
  let newNo = 0;
  return lines.map((text) => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      return { kind: "hunk", text };
    }
    if (text.startsWith("+")) return { kind: "add", text: text.slice(1), newNo: newNo++ };
    if (text.startsWith("-")) return { kind: "del", text: text.slice(1), oldNo: oldNo++ };
    if (text.startsWith("\\")) return { kind: "meta", text };
    return { kind: "ctx", text: text.slice(1), oldNo: oldNo++, newNo: newNo++ };
  });
}

function Bar({ added, removed }) {
  const total = added + removed || 1;
  const green = Math.round((added / total) * 5);
  return (
    <span aria-hidden="true" className="hidden gap-px sm:flex">
      {[0, 1, 2, 3, 4].map((index) => (
        <span key={index} className={`size-2 rounded-[2px] ${index < green ? "bg-success" : index < 5 && removed ? "bg-danger" : "bg-surface-3"}`} />
      ))}
    </span>
  );
}

export default function DiffViewer({ runId, version }) {
  const diff = useAsync((signal) => api.diff(runId, signal), [runId, version]);
  const files = useMemo(() => parseDiff(diff.data?.text ?? ""), [diff.data]);
  const downloadUrl = useMemo(() => (diff.data ? URL.createObjectURL(new Blob([diff.data.text], { type: "text/x-diff" })) : ""), [diff.data]);
  useEffect(() => () => downloadUrl && URL.revokeObjectURL(downloadUrl), [downloadUrl]);

  if (diff.error) return <ErrorState error={diff.error} onRetry={diff.reload} />;
  if (!diff.data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (!files.length) return <EmptyState icon={FileDiff} title="No changes yet">The diff appears once a step commits a change.</EmptyState>;

  const added = files.reduce((sum, file) => sum + file.added, 0);
  const removed = files.reduce((sum, file) => sum + file.removed, 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted tabular-nums">
          <span className="font-medium text-fg">{files.length} file(s) changed</span>
          <span className="font-mono text-xs text-success">+{added}</span>
          <span className="font-mono text-xs text-danger">−{removed}</span>
          {diff.data.truncated ? <Pill tone="warning">truncated · download for the full diff</Pill> : null}
        </p>
        <a href={downloadUrl} download={`${runId}.diff`} className={buttonClass({ variant: "secondary", size: "sm" })}>
          <Download aria-hidden="true" /> Download .diff
        </a>
      </div>
      {files.map((file, index) => (
        <DiffFile key={`${file.path}-${index}`} file={file} defaultOpen={index < 8} />
      ))}
    </div>
  );
}

const rowTone = {
  add: "bg-success/[0.09]",
  del: "bg-danger/[0.09]",
  hunk: "bg-info/[0.07] text-info",
  meta: "text-fg-subtle",
  ctx: "",
};
const gutterTone = {
  add: "bg-success/[0.16] text-success border-success/40",
  del: "bg-danger/[0.16] text-danger border-danger/40",
  hunk: "bg-info/[0.07] border-transparent",
  meta: "border-transparent",
  ctx: "border-transparent text-fg-subtle",
};

function DiffFile({ file, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const [all, setAll] = useState(false);
  const rows = useMemo(() => numberLines(all ? file.lines : file.lines.slice(0, LINES_PER_FILE)), [file, all]);
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex h-11 w-full items-center gap-2.5 bg-surface-2/50 px-3 text-left hover:bg-surface-2">
        <ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-fg-subtle transition-transform duration-150 ${open ? "" : "-rotate-90"}`} />
        <FileCode2 aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg" title={file.path}>
          {file.path}
        </span>
        {file.status ? (
          <Pill tone={file.status === "added" ? "passed" : "failed"} className="h-5 px-2 text-2xs">
            {file.status}
          </Pill>
        ) : null}
        <span className="font-mono text-xs text-success tabular-nums">+{file.added}</span>
        <span className="font-mono text-xs text-danger tabular-nums">−{file.removed}</span>
        <Bar added={file.added} removed={file.removed} />
      </button>
      {open ? (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-max border-collapse font-mono text-xs leading-5">
            <tbody>
              {rows.map((row, index) =>
                row.kind === "hunk" ? (
                  <tr key={index} className={rowTone.hunk}>
                    <td colSpan={4} className="px-3 py-1 whitespace-pre">
                      {row.text}
                    </td>
                  </tr>
                ) : (
                  <tr key={index} className={rowTone[row.kind]}>
                    <td aria-hidden="true" className={`w-[1%] border-l-2 pr-2 pl-3 text-right tabular-nums select-none ${gutterTone[row.kind]}`}>
                      {row.oldNo ?? ""}
                    </td>
                    <td aria-hidden="true" className={`w-[1%] pr-2 pl-2 text-right tabular-nums select-none ${gutterTone[row.kind]} border-l-0`}>
                      {row.newNo ?? ""}
                    </td>
                    <td aria-hidden="true" className={`w-4 pl-2 text-center select-none ${row.kind === "add" ? "text-success" : row.kind === "del" ? "text-danger" : "text-fg-subtle"}`}>
                      {row.kind === "add" ? "+" : row.kind === "del" ? "−" : ""}
                    </td>
                    <td className={`pr-6 pl-1 whitespace-pre ${row.kind === "ctx" ? "text-fg-muted" : "text-fg"}`}>
                      <span className="sr-only">{row.kind === "add" ? "added: " : row.kind === "del" ? "removed: " : ""}</span>
                      {row.text || " "}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
          {!all && file.lines.length > LINES_PER_FILE ? (
            <button type="button" onClick={() => setAll(true)} className="h-9 w-full border-t border-border text-xs font-medium text-accent hover:bg-surface-2">
              Show {file.lines.length - LINES_PER_FILE} more line(s)
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

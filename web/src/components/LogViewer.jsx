import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { api } from "../api.js";
import { useAsync } from "../useAsync.js";
import { ErrorState, Spinner } from "./ui.jsx";

const MAX_RENDER = 400_000;

function lineTone(line) {
  if (/\b(ERROR|FAILURE|FAILED|BUILD FAILURE)\b/.test(line)) return "text-danger";
  if (/\b(WARN|WARNING)\b/.test(line)) return "text-warning";
  if (/\b(BUILD SUCCESS|SUCCESS|PASSED)\b/.test(line)) return "text-success";
  if (/^\s*[$>]/.test(line)) return "text-accent";
  return "";
}

/** Full step log from the server; refetched while the step runs. Monospace with a line-number gutter. */
export default function LogViewer({ runId, step, running, fallback }) {
  // While the step runs, refetch every 3 s (one interval, cleared when the step finishes).
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setTick((value) => value + 1), 3000);
    return () => clearInterval(timer);
  }, [running]);
  const log = useAsync((signal) => api.log(runId, step, signal), [runId, step, running, tick]);
  const box = useRef(null);
  const [copied, setCopied] = useState(false);
  const text = log.data?.text ?? fallback ?? "";
  const shown = text.length > MAX_RENDER ? text.slice(-MAX_RENDER) : text;
  const lines = useMemo(() => (shown ? shown.replace(/\n$/, "").split("\n") : []), [shown]);
  const gutter = String(lines.length || 1).length;

  useEffect(() => {
    if (running && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [shown, running]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="space-y-2">
      {log.error ? <ErrorState error={log.error} onRetry={log.reload} compact /> : null}
      <div className="overflow-hidden rounded-lg border border-border bg-code">
        <div className="flex h-9 items-center justify-between gap-3 border-b border-border px-3 text-xs leading-none text-code-gutter">
          <span className="flex items-center gap-2">
            <span className="font-mono">{step}.log</span>
          </span>
          <span className="flex items-center gap-3 tabular-nums">
            {log.loading && !log.data ? (
              <Spinner label="Loading…" className="text-xs text-code-gutter" />
            ) : (
              <span>
                {lines.length.toLocaleString()} lines{log.data?.truncated || text.length > MAX_RENDER ? " · tail" : ""}
              </span>
            )}
            <button type="button" onClick={copy} disabled={!text} aria-label="Copy log" className="grid size-6 place-items-center rounded text-code-gutter hover:bg-fg/10 hover:text-code-fg disabled:opacity-40">
              {copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
            </button>
          </span>
        </div>
        <div ref={box} tabIndex={0} role="log" aria-label={`${step} log`} className="max-h-96 overflow-auto py-2 font-mono text-xs leading-5 text-code-fg">
          {lines.length ? (
            <table className="w-full border-collapse">
              <tbody>
                {lines.map((line, index) => (
                  <tr key={index} className="align-top hover:bg-fg/[0.04]">
                    <td aria-hidden="true" className="sticky left-0 bg-code pr-3 pl-3 text-right text-code-gutter tabular-nums select-none" style={{ width: `${gutter + 2}ch` }}>
                      {index + 1}
                    </td>
                    <td className={`pr-4 whitespace-pre-wrap break-all ${lineTone(line)}`}>{line || " "}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-3 text-code-gutter">No output.</p>
          )}
        </div>
      </div>
    </div>
  );
}

import { ExternalLink, Info, Play, Square, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { useToast } from "./Toaster.jsx";
import { Button, Card, CardHeader, ErrorState, Spinner, StatusPill } from "./ui.jsx";

const pillFor = {
  idle: { status: "waiting", label: "Not started" },
  preparing: { status: "running", label: "Preparing" },
  starting: { status: "running", label: "Starting" },
  running: { status: "passed", label: "Running" },
  failed: { status: "failed", label: "Failed" },
  unavailable: { status: "failed", label: "Can't run" },
  stopped: { status: "skipped", label: "Stopped" },
};
const busy = (status) => status === "preparing" || status === "starting";
const live = (status) => busy(status) || status === "running";

const sideInfo = {
  before: { title: "Before", hint: "The original code, as it was when the run started.", edge: "border-t-fg-subtle" },
  after: { title: "After", hint: "The migrated code from this run.", edge: "border-t-accent" },
};

/** Line diff (longest common subsequence): which lines of each side are not in the other. */
export function diffLines(a, b) {
  const left = a.split("\n").slice(0, 400);
  const right = b.split("\n").slice(0, 400);
  const table = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const leftMark = left.map(() => true);
  const rightMark = right.map(() => true);
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      leftMark[i] = false;
      rightMark[j] = false;
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) i += 1;
    else j += 1;
  }
  return { left: left.map((text, index) => ({ text, changed: leftMark[index] })), right: right.map((text, index) => ({ text, changed: rightMark[index] })) };
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  return value;
}

/** Pretty-print JSON with sorted keys, so spacing or key order alone never shows up as a change. */
function pretty(reply) {
  if (!reply?.body) return "";
  try {
    return JSON.stringify(sortKeys(JSON.parse(reply.body)), null, 2);
  } catch {
    return reply.body;
  }
}

function SideCard({ side, view, busyAction, onStart, onStop, onFallback }) {
  const info = sideInfo[side];
  const pill = pillFor[view.status] ?? pillFor.idle;
  return (
    <Card className={`flex min-w-0 flex-col border-t-4 ${info.edge}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-md font-semibold text-fg">{info.title}</h3>
            <StatusPill status={pill.status} label={pill.label} />
          </div>
          <p className="mt-1 text-sm text-fg-muted">{info.hint}</p>
        </div>
        {live(view.status) ? (
          <Button size="sm" onClick={onStop} disabled={busyAction}>
            <Square aria-hidden="true" /> Stop
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={onStart} disabled={busyAction}>
            <Play aria-hidden="true" /> Start
          </Button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 px-5 py-4 text-sm">
        {view.url ? (
          <a href={view.url} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1.5 font-mono text-sm font-medium text-accent hover:underline">
            {view.url}
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        ) : null}
        <p className="flex items-center gap-2 text-fg">
          {busy(view.status) ? <Spinner label="" className="text-base" /> : null}
          <span>{view.message}</span>
        </p>
        {view.runtime ? <p className="text-fg-muted">Runtime: <span className="font-medium text-fg">{view.runtime}</span></p> : null}
        {view.needs ? (
          <div className="rounded-lg border border-warning/35 bg-warning-soft px-4 py-3">
            <p className="flex items-start gap-2 font-semibold text-fg">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
              {view.needs.title}
            </p>
            <p className="mt-1.5 text-fg-muted">{view.needs.detail}</p>
            {view.needs.fallback ? (
              <div className="mt-3">
                <Button size="sm" onClick={onFallback} disabled={busyAction}>{view.needs.fallback}</Button>
                <p className="mt-1.5 text-xs text-fg-subtle">It may behave differently or not start at all. The log will say so.</p>
              </div>
            ) : null}
          </div>
        ) : null}
        {view.note && !view.needs ? (
          <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-fg-muted">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {view.note}
          </p>
        ) : null}
        {view.log?.length ? (
          <details className="group mt-auto">
            <summary className="w-fit cursor-pointer text-sm font-medium text-fg-muted select-none hover:text-fg">Log ({view.log.length} lines)</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-fg">{view.log.join("\n")}</pre>
          </details>
        ) : null}
      </div>
    </Card>
  );
}

function ReplyPane({ title, reply, lines }) {
  const ok = reply && reply.status != null && reply.status < 400;
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="text-sm font-semibold text-fg">{title}</span>
        {reply ? (
          reply.error ? (
            <span className="text-xs font-medium text-danger">{reply.error}</span>
          ) : (
            <span className="flex items-center gap-2 text-xs text-fg-muted">
              <span className={`rounded-md border px-1.5 py-0.5 font-mono font-semibold ${ok ? "border-success/30 bg-success-soft text-success" : "border-danger/30 bg-danger-soft text-danger"}`}>{reply.status}</span>
              {reply.ms} ms
            </span>
          )
        ) : (
          <span className="text-xs text-fg-subtle">not running</span>
        )}
      </div>
      <pre className="max-h-80 overflow-auto p-0 font-mono text-xs leading-relaxed">
        {lines.length ? lines.map((line, index) => (
          <div key={index} className={`px-4 whitespace-pre-wrap break-words ${line.changed ? "bg-warning-soft text-fg" : "text-fg-muted"}`}>{line.text || " "}</div>
        )) : <div className="px-4 py-3 text-fg-subtle">{reply?.error ? "" : "(empty body)"}</div>}
      </pre>
      {reply?.truncated ? <p className="border-t border-border px-4 py-1.5 text-xs text-fg-subtle">Body cut after the first part.</p> : null}
    </div>
  );
}

function Compare({ runId, preview, bothRunning }) {
  const [path, setPath] = useState("");
  const [auth, setAuth] = useState("");
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(
    async (target) => {
      const value = target.trim();
      if (!value) return;
      setLoading(true);
      setError(null);
      try {
        const result = await api.previewFetch(runId, value.startsWith("/") ? value : `/${value}`, auth.trim() ? { Authorization: auth.trim() } : undefined);
        setCurrent(result.result);
        setPath(value);
      } catch (caught) {
        setError(caught);
      } finally {
        setLoading(false);
      }
    },
    [runId, auth],
  );

  const diff = useMemo(() => {
    if (!current) return null;
    const before = pretty(current.before);
    const after = pretty(current.after);
    if (!current.before || !current.after) return { left: before ? diffLines(before, "").left : [], right: after ? diffLines("", after).right : [] };
    return diffLines(before, after);
  }, [current]);

  const identical = Boolean(current?.before && current?.after && current.before.status === current.after.status && pretty(current.before) === pretty(current.after));
  return (
    <Card>
      <CardHeader title="Compare an endpoint" description="Fetches the same path on Before and After through the agent, then shows both answers side by side. Lines that differ are highlighted (JSON key order is ignored)." />
      <div className="space-y-4 px-5 py-4 sm:px-6">
        {preview.endpoints?.length ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested endpoints">
            {preview.endpoints.map((endpoint) => (
              <button
                key={endpoint}
                type="button"
                disabled={!bothRunning || loading}
                onClick={() => run(endpoint)}
                className={`rounded-md border px-2.5 py-1 font-mono text-xs font-medium transition-colors disabled:opacity-50 ${current?.path === endpoint ? "border-accent bg-accent-soft text-accent" : "border-border-strong bg-surface text-fg hover:border-accent/60"}`}
              >
                GET {endpoint}
              </button>
            ))}
          </div>
        ) : null}
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(path);
          }}
        >
          <label className="sr-only" htmlFor="preview-path">Path</label>
          <input id="preview-path" value={path} onChange={(event) => setPath(event.target.value)} placeholder="/api/events?limit=5" className="h-9 min-w-48 flex-1 rounded-lg border border-border-strong bg-surface px-3 font-mono text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none" />
          <label className="sr-only" htmlFor="preview-auth">Authorization header</label>
          <input id="preview-auth" value={auth} onChange={(event) => setAuth(event.target.value)} placeholder="Authorization header (optional)" autoComplete="off" className="h-9 w-60 rounded-lg border border-border-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none" />
          <Button type="submit" variant="primary" disabled={!bothRunning || loading || !path.trim()}>{loading ? "Fetching…" : "Compare"}</Button>
        </form>
        {!bothRunning ? <p className="text-sm text-fg-muted">Start Before and After to compare. One side alone can still be opened with its link.</p> : null}
        {preview.credentials?.length ? (
          <div className="rounded-lg border border-border bg-surface-2/60 px-4 py-3 text-sm">
            <p className="font-semibold text-fg">Sample login from the project's own notes</p>
            <ul className="mt-1.5 space-y-1 font-mono text-xs text-fg-muted">
              {preview.credentials.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        ) : null}
        {error ? <ErrorState error={error} compact /> : null}
        {current && diff ? (
          <div className="space-y-3">
            <p className={`text-sm font-medium ${identical ? "text-success" : "text-warning"}`}>
              {identical ? "Identical: same status and body on both sides." : current.before && current.after ? "Different: the highlighted lines (or the status) are not the same on both sides." : "Only one side answered."}
            </p>
            <div className="grid gap-3 lg:grid-cols-2">
              <ReplyPane title="Before" reply={current.before} lines={diff.left} />
              <ReplyPane title="After" reply={current.after} lines={diff.right} />
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export default function LivePreview({ run }) {
  const toast = useToast();
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [action, setAction] = useState(false);
  const alive = useRef(true);
  const anyLive = preview ? live(preview.sides.before.status) || live(preview.sides.after.status) : false;

  const load = useCallback(async () => {
    try {
      const result = await api.preview(run.runId);
      if (alive.current) {
        setPreview(result.preview);
        setError(null);
      }
    } catch (caught) {
      if (alive.current) setError(caught);
    }
  }, [run.runId]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (!anyLive) return undefined;
    const timer = setInterval(load, 1500);
    return () => clearInterval(timer);
  }, [anyLive, load]);

  const call = async (fn, failTitle) => {
    setAction(true);
    try {
      const result = await fn();
      setPreview(result.preview);
    } catch (caught) {
      toast.error(failTitle, caught?.message || String(caught));
    } finally {
      setAction(false);
    }
  };

  if (error && !preview) return <ErrorState error={error} onRetry={load} />;
  if (!preview) return <Spinner label="Loading the preview…" />;
  const { before, after } = preview.sides;
  return (
    <section aria-label="Live preview" className="space-y-5">
      <Card>
        <CardHeader
          title="Live preview"
          description="Run the original app and the migrated app side by side on this computer (127.0.0.1 only) and check them in the browser."
          action={
            <>
              {anyLive ? (
                <Button size="sm" onClick={() => call(() => api.previewStop(run.runId, "both"), "Could not stop")} disabled={action}>
                  <Square aria-hidden="true" /> Stop all
                </Button>
              ) : null}
              <Button size="sm" variant="secondary" onClick={() => call(() => api.previewStart(run.runId, "both"), "Could not start")} disabled={action || !preview.canPreview || (live(before.status) && live(after.status))}>
                <Play aria-hidden="true" /> Start both
              </Button>
            </>
          }
        />
        {!preview.canPreview ? (
          <p className="flex items-start gap-2 px-5 py-4 text-sm text-fg-muted sm:px-6">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {preview.reason}
          </p>
        ) : (
          <p className="px-5 py-3 text-sm text-fg-muted sm:px-6">
            {run.dryRun ? "This was a dry run: After runs from the temporary copy the run migrated." : "After runs the migrated project."} Servers stop when you press Stop, delete the run, or shut the agent down.
          </p>
        )}
      </Card>
      {preview.canPreview ? (
        <>
          <div className="grid gap-5 lg:grid-cols-2" aria-label="Before and after, side by side">
            {["before", "after"].map((side) => (
              <SideCard
                key={side}
                side={side}
                view={preview.sides[side]}
                busyAction={action}
                onStart={() => call(() => api.previewStart(run.runId, side), "Could not start")}
                onStop={() => call(() => api.previewStop(run.runId, side), "Could not stop")}
                onFallback={() => call(() => api.previewStart(run.runId, side, true), "Could not start")}
              />
            ))}
          </div>
          <Compare runId={run.runId} preview={preview} bothRunning={before.status === "running" && after.status === "running"} />
        </>
      ) : null}
    </section>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Activity, ArrowRight, CheckCircle2, ChevronRight, Copy, Eye, FileCode2, FlaskConical, ListChecks, RotateCcw, ScanSearch, ShieldCheck, Sparkles, Timer, Wand2, Wrench } from "lucide-react";
import { api } from "../api.js";
import { sourceName } from "./SourceBadge.jsx";
import { folderName, formatRelative } from "../pipeline.js";
import { useAsync } from "../useAsync.js";

/**
 * Overview showcase: a light hero with an example code change, the upgrade routes this server
 * targets, an animated six-step timeline, and real numbers from GET /history (KPI tiles, a chart
 * of recent runs and the latest run). Nothing is estimated; motion respects reduced motion.
 */

const steps = [
  { id: "scan", label: "Scan", icon: ScanSearch, caption: "Reads versions, dependencies and old javax use across every module." },
  { id: "plan", label: "Plan", icon: ListChecks, caption: "Sorts findings into will break, might break and safe, and recommends Hybrid or Full AI." },
  { id: "upgrade", label: "Upgrade", icon: Wrench, caption: "OpenRewrite recipes and rules first, then the AI for what they can't change." },
  { id: "test", label: "Test", icon: FlaskConical, caption: "Your own build and tests decide pass or fail, with AI fix-up rounds if needed." },
  { id: "refactor", label: "Refactor", icon: Wand2, caption: "Your refactor quiz picks, verified by build and tests and undone if they break." },
  { id: "preview", label: "Preview", icon: Eye, caption: "Live preview: Before and After running side by side." },
];

const guarantees = [
  { icon: ShieldCheck, title: "You approve", text: "Read-only plan first; nothing changes until you say go." },
  { icon: Copy, title: "Dry run on a copy", text: "Try the whole upgrade without touching your project." },
  { icon: RotateCcw, title: "Safe refactors", text: "A refactor that breaks the build is undone automatically." },
];

/** Typical starting points per line (what the bundled recipes and adapters accept). */
const fromRanges = { Java: "8–17", "Spring Boot": "2.x", Node: "14–22", Python: "3.8–3.13" };

/** An illustrative diff of the kind of change Verdigrade makes (Jakarta move + DTO-to-record refactor). */
const diff = [
  { t: "file", text: "src/main/java/com/acme/orders/dto/OrderDto.java" },
  { t: "del", text: "import javax.validation.constraints.NotNull;" },
  { t: "add", text: "import jakarta.validation.constraints.NotNull;" },
  { t: "ctx", text: "" },
  { t: "del", text: "public class OrderDto {" },
  { t: "del", text: "    private final String id;" },
  { t: "del", text: "    private final BigDecimal total;" },
  { t: "del", text: "    public String getId() { return id; }" },
  { t: "del", text: "    public BigDecimal getTotal() { return total; }" },
  { t: "del", text: "}" },
  { t: "add", text: "public record OrderDto(@NotNull String id," },
  { t: "add", text: "        BigDecimal total) {}" },
];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return undefined;
    const onChange = () => setReduced(query.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

/** Counts from 0 up to `target` once (ease-out); jumps straight there under reduced motion. */
function useCountUp(target, reduced, duration = 900) {
  const [value, setValue] = useState(reduced ? target : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced || !Number.isFinite(target)) {
      setValue(target);
      return undefined;
    }
    const start = performance.now();
    const begin = from.current;
    let frame = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(begin + (target - begin) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, reduced, duration]);
  return value;
}

function CodeWindow() {
  return (
    <div className="ov-code ov-pop" style={{ "--pop-delay": "160ms" }} role="img" aria-label="Example change: javax import moved to jakarta, and a DTO class refactored into a Java record">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ec6a5e]" />
          <span className="size-2.5 rounded-full bg-[#f4bf4f]" />
          <span className="size-2.5 rounded-full bg-[#61c554]" />
        </span>
        <span className="ml-2 truncate font-mono text-[11.5px] text-fg-muted">OrderDto.java</span>
        <span className="ml-auto shrink-0 rounded-full border border-border px-2 py-0.5 text-[10.5px] font-medium text-fg-subtle">Example</span>
      </div>
      <div className="overflow-hidden py-2 font-mono text-[10.5px] leading-[1.75] sm:text-[12px]">
        {diff.map((line, index) =>
          line.t === "file" ? (
            <p key={index} className="px-4 pb-1 text-[11px] break-all text-fg-subtle">{line.text}</p>
          ) : (
            <p key={index} className={`ov-line ov-line-${line.t} flex min-w-0 gap-3 px-4`} style={{ "--pop-delay": `${300 + index * 70}ms` }}>
              <span aria-hidden="true" className="w-3 shrink-0 select-none text-right opacity-70">{line.t === "del" ? "−" : line.t === "add" ? "+" : ""}</span>
              <span className="min-w-0 whitespace-pre-wrap break-words">{line.text || " "}</span>
            </p>
          ),
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5 text-[11.5px]">
        {["Upgrade", "Test", "Refactor"].map((label, index) => (
          <span key={label} className="ov-check ov-pop inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 font-medium text-success" style={{ "--pop-delay": `${1150 + index * 120}ms` }}>
            <CheckCircle2 aria-hidden="true" className="size-3.5" /> {label}
          </span>
        ))}
        <span className="ml-auto text-fg-subtle">Build and tests decide</span>
      </div>
    </div>
  );
}

function RouteChips({ targets }) {
  if (!targets.length) return null;
  return (
    <ul className="ov-pop mt-8 flex flex-wrap gap-2" style={{ "--pop-delay": "200ms" }} aria-label="Upgrade routes on this server">
      {targets.map(([label, value]) => (
        <li key={label} className="ov-chip inline-flex min-w-0 items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px]">
          <span className="font-medium text-fg">{label}</span>
          <span className="text-fg-subtle tabular-nums">{fromRanges[label] ?? "older"}</span>
          <ArrowRight aria-hidden="true" className="size-3 text-accent" />
          <span className="font-semibold text-accent tabular-nums">{value}</span>
        </li>
      ))}
    </ul>
  );
}

function Hero({ targets, orderDesk }) {
  const navigate = useNavigate();
  return (
    <section aria-labelledby="hero-title" className="ov-hero relative isolate overflow-hidden">
      <div aria-hidden="true" className="ov-hero-bg" />
      <div className="relative z-10 grid min-w-0 gap-10 p-6 sm:p-10 lg:p-12 xl:grid-cols-12 xl:items-center xl:gap-8">
        <div className="min-w-0 xl:col-span-6">
          <span className="ov-pop inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[12px] font-medium text-fg-muted shadow-xs" style={{ "--pop-delay": "0ms" }}>
            <Sparkles aria-hidden="true" className="size-3.5 shrink-0 text-accent" />
            <span className="truncate">New: refactor quiz after every upgrade</span>
          </span>
          <h1 id="hero-title" className="ov-title ov-pop mt-5" style={{ "--pop-delay": "50ms" }}>
            Upgrade legacy apps <span className="text-accent">in one guided run.</span>
          </h1>
          <p className="ov-pop mt-5 max-w-[34rem] text-[15px] leading-relaxed text-fg-muted" style={{ "--pop-delay": "90ms" }}>
            Verdigrade plans the upgrade, runs the free deterministic tools first, lets the AI handle the rest, and proves it with your own build and tests. Then it refactors what you pick and shows Before and After side by side.
          </p>
          <div className="ov-pop mt-7 flex flex-wrap items-center gap-3" style={{ "--pop-delay": "130ms" }}>
            <button type="button" onClick={() => navigate("/new")} className="ov-btn-primary inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-medium">
              Start a migration <ArrowRight aria-hidden="true" className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate("/new", orderDesk ? { state: { repoPath: orderDesk } } : undefined)}
              className="ov-btn-secondary inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-medium"
            >
              Try the Order Desk sample
            </button>
          </div>
          <RouteChips targets={targets} />
          <p className="mt-6 text-[12px] text-fg-subtle">Built with Cursor and Grok · SpaceX AI CoE</p>
        </div>
        <div className="min-w-0 xl:col-span-6">
          <CodeWindow />
        </div>
      </div>
    </section>
  );
}

function SectionHead({ eyebrow, title, text, id, aside = null }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="ov-eyebrow">{eyebrow}</p>
        <h2 id={id} className="mt-1.5 text-[22px] leading-tight font-semibold tracking-[-0.02em] text-fg">{title}</h2>
        {text ? <p className="mt-1 text-[13.5px] text-fg-muted">{text}</p> : null}
      </div>
      {aside}
    </div>
  );
}

function Timeline() {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (reduced || paused) return undefined;
    const timer = setInterval(() => setActive((value) => (value + 1) % steps.length), 2400);
    return () => clearInterval(timer);
  }, [reduced, paused]);
  const lit = reduced ? steps.length - 1 : active;
  const progress = (lit / (steps.length - 1)) * 100;
  return (
    <section className="reveal mt-14" aria-labelledby="flow-title">
      <SectionHead eyebrow="How it works" title="One guided run, six steps" text="Nothing in your project changes until you approve the plan." id="flow-title" />
      <div className="ov-card mt-5 p-5 sm:p-7" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div className="relative">
          <div aria-hidden="true" className="ov-track absolute top-[19px] right-[calc(100%/12)] left-[calc(100%/12)] hidden h-[2px] md:block">
            <div className="ov-track-fill h-full" style={{ width: `${progress}%` }} />
          </div>
          <ol className="relative grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-6">
            {steps.map((step, index) => {
              const state = index < lit ? "done" : index === lit ? "active" : "todo";
              return (
                <li key={step.id} className="min-w-0 md:text-center">
                  <button
                    type="button"
                    onClick={() => setActive(index)}
                    aria-current={state === "active" ? "step" : undefined}
                    className={`ov-node ov-node-${state} grid size-10 place-items-center rounded-full md:mx-auto`}
                  >
                    <step.icon aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
                    <span className="sr-only">{step.label}</span>
                  </button>
                  <p className="mt-3 font-mono text-[10.5px] tracking-[0.08em] text-fg-subtle">{String(index + 1).padStart(2, "0")}</p>
                  <p className={`mt-0.5 text-[14px] font-semibold ${state === "todo" ? "text-fg-muted" : "text-fg"}`}>{step.label}</p>
                  <p className={`mt-1 text-[12.5px] leading-snug transition-colors duration-300 ${state === "active" ? "text-fg-muted" : "text-fg-subtle"}`}>{step.caption}</p>
                </li>
              );
            })}
          </ol>
        </div>
        <ul className="mt-7 grid gap-3 border-t border-border pt-5 md:grid-cols-3">
          {guarantees.map((item) => (
            <li key={item.title} className="flex min-w-0 items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                <item.icon aria-hidden="true" className="size-4" strokeWidth={1.9} />
              </span>
              <span className="min-w-0 text-[13px] leading-snug">
                <span className="block font-semibold text-fg">{item.title}</span>
                <span className="block text-fg-muted">{item.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const durationOf = (run) => {
  const start = Date.parse(run.startedAt);
  const end = Date.parse(run.finishedAt);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null;
};

function formatSpan(ms) {
  if (ms == null) return "–";
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** Real numbers from the run history; nothing estimated. */
export function runStats(migrations = [], total = 0) {
  const finished = migrations.filter((run) => run.status === "passed" || run.status === "failed");
  const passed = finished.filter((run) => run.status === "passed").length;
  const durations = finished.map(durationOf).filter((value) => value != null);
  const runTime = durations.reduce((sum, value) => sum + value, 0);
  return {
    total: Math.max(total, migrations.length),
    loaded: migrations.length,
    finished: finished.length,
    passed,
    passRate: finished.length ? Math.round((passed / finished.length) * 100) : null,
    files: migrations.reduce((sum, run) => sum + (Number(run.changedFiles) || 0), 0),
    runTime: durations.length ? runTime : null,
    average: durations.length ? runTime / durations.length : null,
    projects: new Set(migrations.map((run) => run.repoPath)).size,
    recent: migrations.slice(0, 16).reverse(),
  };
}

function Kpi({ icon: Icon, label, target, format, sub, reduced, bar = null }) {
  const value = useCountUp(target, reduced);
  return (
    <div className="min-w-0 px-5 py-4">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-fg-muted">
        <Icon aria-hidden="true" className="size-3.5 text-fg-subtle" strokeWidth={1.9} /> {label}
      </p>
      <p className="mt-2 truncate text-[30px] leading-none font-semibold tracking-[-0.03em] text-fg tabular-nums">{format(value)}</p>
      {bar != null ? (
        <div aria-hidden="true" className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-success transition-[width] duration-700" style={{ width: `${bar}%` }} />
        </div>
      ) : null}
      <p className="mt-2 truncate text-[12px] text-fg-subtle">{sub}</p>
    </div>
  );
}

function RunChart({ runs }) {
  const shown = runs.slice(0, 24).reverse();
  const max = Math.max(1, ...shown.map((run) => Number(run.changedFiles) || 0));
  return (
    <div className="border-t border-border px-5 pt-4 pb-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-fg-muted">Last {shown.length} runs · bar height is files changed</p>
        <p className="flex items-center gap-3 text-[11.5px] text-fg-subtle">
          <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-sm bg-success" />Passed</span>
          <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-sm bg-danger" />Failed</span>
        </p>
      </div>
      <div className="mt-3 flex h-24 items-end gap-1.5" role="list" aria-label="Recent runs, oldest first">
        {shown.map((run, index) => {
          const files = Number(run.changedFiles) || 0;
          return (
            <Link
              role="listitem"
              key={run.sessionId}
              to={`/runs/${run.sessionId}`}
              title={`${folderName(run.repoPath)} · ${run.status} · ${files} files · ${formatRelative(run.startedAt)}`}
              aria-label={`${folderName(run.repoPath)}, ${run.status}, ${files} files changed`}
              style={{ height: `${Math.max(8, (files / max) * 100)}%`, "--pop-delay": `${index * 25}ms` }}
              className={`ov-bar max-w-10 min-w-0 flex-1 rounded-t-[4px] ${run.status === "passed" ? "ov-bar-pass" : run.status === "failed" ? "ov-bar-fail" : "ov-bar-run"}`}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-fg-subtle">
        <span>Older</span>
        <span>Newest</span>
      </div>
    </div>
  );
}

const engineName = (run) => (run.engine === "ai" ? "Full AI" : run.engine === "hybrid" ? "Hybrid" : run.engine ? "Free step" : "Free step");

function LatestRun({ run }) {
  const duration = durationOf(run);
  const versions = run.versions?.length
    ? run.versions
    : [
        { label: "Java", before: run.javaBefore, after: run.javaAfter },
        { label: "Spring Boot", before: run.springBefore, after: run.springAfter },
      ];
  const facts = [
    ["Engine", engineName(run)],
    ["Files changed", (Number(run.changedFiles) || 0).toLocaleString()],
    ["Run time", duration != null ? formatSpan(duration) : "–"],
    ["Started", formatRelative(run.startedAt)],
  ];
  const tone = run.status === "passed" ? "text-success bg-success-soft" : run.status === "failed" ? "text-danger bg-danger-soft" : "text-accent bg-accent-soft";
  return (
    <div className="ov-card flex h-full min-w-0 flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="ov-eyebrow">Latest run</p>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium capitalize ${tone}`}>
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> {run.status}
        </span>
      </div>
      <p className="mt-3 truncate text-[20px] font-semibold tracking-[-0.02em] text-fg">{sourceName(run.source, folderName(run.repoPath))}</p>
      <p className="mt-0.5 text-[12.5px] text-fg-subtle">{run.dryRun ? "Dry run on a copy" : "Real run"}</p>
      <ul className="mt-4 space-y-1.5">
        {versions
          .filter((fact) => fact.before || fact.after)
          .slice(0, 2)
          .map((fact) => (
            <li key={fact.label} className="flex min-w-0 items-center gap-2 text-[13px]">
              <span className="w-24 shrink-0 truncate text-fg-muted">{fact.label}</span>
              <span className="text-fg-subtle tabular-nums">{fact.before || "?"}</span>
              <ArrowRight aria-hidden="true" className="size-3 shrink-0 text-accent" />
              <span className="truncate font-semibold text-fg tabular-nums">{fact.after || "?"}</span>
            </li>
          ))}
      </ul>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[11.5px] text-fg-subtle">{label}</dt>
            <dd className="mt-0.5 truncate text-[14px] font-medium text-fg tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <Link to={`/runs/${run.sessionId}`} className="group mt-auto inline-flex items-center gap-1 pt-5 text-[13px] font-medium text-accent">
        Open run <ChevronRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

function Numbers({ data, error }) {
  const reduced = usePrefersReducedMotion();
  const stats = useMemo(() => runStats(data?.migrations ?? [], data?.total ?? 0), [data]);
  const runs = data?.migrations ?? [];
  const tiles = [
    { icon: Activity, label: "Runs", target: stats.total, format: (v) => Math.round(v).toLocaleString(), sub: stats.projects ? `across ${stats.projects} project${stats.projects === 1 ? "" : "s"}` : "none yet" },
    { icon: CheckCircle2, label: "Pass rate", target: stats.passRate ?? 0, format: (v) => (stats.passRate == null ? "–" : `${Math.round(v)}%`), sub: stats.finished ? `${stats.passed} of ${stats.finished} finished` : "no finished runs", bar: stats.passRate },
    { icon: FileCode2, label: "Files changed", target: stats.files, format: (v) => Math.round(v).toLocaleString(), sub: "by Verdigrade, in total" },
    { icon: Timer, label: "Run time", target: stats.runTime ?? 0, format: (v) => (stats.runTime == null ? "–" : formatSpan(v)), sub: stats.average != null ? `about ${formatSpan(stats.average)} per run` : "no timed runs" },
  ];
  return (
    <section className="reveal mt-14" aria-labelledby="numbers-title">
      <SectionHead eyebrow="Your numbers" title="Real runs on this server" text="Straight from the run history. Nothing estimated." id="numbers-title" />
      {error ? (
        <div className="ov-card mt-5 p-6 text-sm text-fg-muted">Run history is not available right now ({error.message}). Check that the agent server is running.</div>
      ) : !data ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-12">
          <div className="skeleton h-[300px] rounded-2xl lg:col-span-8" />
          <div className="skeleton h-[300px] rounded-2xl lg:col-span-4" />
        </div>
      ) : !stats.total ? (
        <div className="ov-card mt-5 flex flex-col items-start gap-3 p-6">
          <p className="text-[15px] font-semibold text-fg">No runs yet</p>
          <p className="text-[13.5px] text-fg-muted">Your numbers appear here after the first migration: runs, pass rate, files changed and run time.</p>
          <Link to="/new" className="ov-btn-primary mt-1 inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] font-medium">
            Start a migration <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      ) : (
        <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-12">
          <div className="ov-card min-w-0 lg:col-span-8">
            <div className="grid grid-cols-2 divide-border sm:grid-cols-4 sm:divide-x [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-border sm:[&>*:nth-child(n+3)]:border-t-0">
              {tiles.map((tile) => (
                <Kpi key={tile.label} {...tile} reduced={reduced} />
              ))}
            </div>
            <RunChart runs={runs} />
            <p className="border-t border-border px-5 py-3 text-[11.5px] text-fg-subtle">
              {stats.loaded < stats.total ? `Rates and totals cover the latest ${stats.loaded} of ${stats.total} runs. ` : ""}Run time is measured start to finish; time saved is not shown because there is no measured manual baseline.
            </p>
          </div>
          <div className="min-w-0 lg:col-span-4">{runs[0] ? <LatestRun run={runs[0]} /> : null}</div>
        </div>
      )}
    </section>
  );
}

export default function Showcase({ targets = [], samples = [], historyKey = null }) {
  const stats = useAsync((signal) => api.history({ limit: 200 }, signal), [historyKey]);
  const orderDesk = samples.find((sample) => sample.name === "orderdesk")?.path ?? null;
  return (
    <>
      <Hero targets={targets} orderDesk={orderDesk} />
      <Timeline />
      <Numbers data={stats.data} error={stats.error} />
    </>
  );
}

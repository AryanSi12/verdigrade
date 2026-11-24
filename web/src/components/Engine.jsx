import { Bot, Check, Globe, Layers, Scale, Sparkles, Trophy, TriangleAlert, Wrench } from "lucide-react";
import { useState } from "react";
import { Button, Pill, Spinner, StatusText } from "./ui.jsx";

/**
 * The two upgrade engines people choose between: Hybrid (default) and Full AI.
 * "classic" stays here only to label older saved runs and Hybrid's own free first step.
 */
export const engineMeta = {
  classic: {
    label: "Free step only",
    short: "Free step",
    icon: Wrench,
    tagline: "Deterministic tools only: OpenRewrite for Java, codemods for Node, rules for Python.",
    detail: "No AI and no tokens. Older runs and Hybrid without an AI login.",
  },
  hybrid: {
    label: "Hybrid",
    short: "Hybrid",
    icon: Layers,
    tagline: "OpenRewrite first (free), then the AI fixes what it can't and any build or test failure.",
    detail: "The AI reads only the files that need it, so it uses far fewer tokens than Full AI. Bounded fix-up rounds.",
    badge: "Recommended",
  },
  ai: {
    label: "Full AI",
    short: "Full AI",
    icon: Sparkles,
    tagline: "Cursor / Grok does the whole upgrade and fixes its own build and test failures.",
    detail: "Nothing is required from you. Handles the most, uses the most tokens: the AI makes the upgrade, then gets bounded build/test-fix rounds.",
  },
};

export const engineOrder = ["hybrid", "ai"];

export function formatTokens(value) {
  return value == null ? "n/a" : value.toLocaleString("en-US");
}

/** Config entry for one engine ({ available, reason }), tolerant of an older server without engines. */
export function engineState(config, id) {
  const entry = config?.engines?.list?.find((item) => item.id === id);
  return entry ?? { id, available: id !== "ai" || !config?.engines, reason: null };
}

/** "~1,200–9,500" for an estimate { low, high }. */
export function formatRange(estimate) {
  return estimate ? `~${estimate.low.toLocaleString("en-US")}–${estimate.high.toLocaleString("en-US")}` : "n/a";
}

/** "~230k–420k" for one direction { low, high }. */
function directionRange(range) {
  return `~${formatTokens(range.low)}–${formatTokens(range.high)}`;
}

/** "in ~230k–420k / out ~6k–19k" when the estimate has both directions, else the total range. */
export function formatInOut(estimate) {
  if (!estimate) return "n/a";
  return estimate.input && estimate.output ? `in ${directionRange(estimate.input)} / out ${directionRange(estimate.output)}` : formatRange(estimate);
}

/** A token estimate with input and output apart and the method on hover. Never a price. */
export function EstimateText({ estimate, className = "" }) {
  if (!estimate) return <span className={className}>n/a</span>;
  const title = `Estimate, not a measurement.\n${(estimate.method ?? []).join("\n")}`;
  if (!(estimate.input && estimate.output)) {
    return (
      <span className={className} title={title}>
        {formatRange(estimate)} tokens <span className="text-fg-subtle">(estimate)</span>
      </span>
    );
  }
  return (
    <span className={`block ${className}`} title={title}>
      <span className="block">Input {directionRange(estimate.input)} tokens</span>
      <span className="block">Output {directionRange(estimate.output)} tokens</span>
      <span className="block text-xs font-normal text-fg-subtle">estimate</span>
    </span>
  );
}

export function defaultEngineFor(config) {
  return config?.engines?.default ?? "hybrid";
}

/** Radio cards for Hybrid / Full AI. Full AI is disabled (with the reason) when the AI isn't set up. */
export function EnginePicker({ value, onChange, config, disabled = false, compact = false, idBase = "engine" }) {
  const ai = config?.engines?.ai;
  return (
    <div>
      <div role="radiogroup" aria-label="Upgrade engine" className={`grid gap-2.5 ${compact ? "" : "sm:grid-cols-2"}`}>
        {engineOrder.map((id) => {
          const meta = engineMeta[id];
          const state = engineState(config, id);
          const off = disabled || !state.available;
          const selected = value === id;
          return (
            <label
              key={id}
              htmlFor={`${idBase}-${id}`}
              title={!state.available ? state.reason ?? "Not available" : undefined}
              className={`relative flex min-w-0 cursor-pointer gap-3 rounded-lg border p-3.5 transition-colors ${
                selected ? "border-accent/60 bg-accent-soft ring-1 ring-accent/40" : "border-border bg-surface hover:border-border-strong"
              } ${off ? "cursor-not-allowed opacity-55" : ""}`}
            >
              <input id={`${idBase}-${id}`} type="radio" name={idBase} value={id} checked={selected} disabled={off} onChange={() => onChange(id)} className="sr-only" />
              <meta.icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${selected ? "text-accent" : "text-fg-muted"}`} />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-fg">
                  {meta.label}
                  {meta.badge && state.available ? <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-2xs font-medium text-accent">{meta.badge}</span> : null}
                  {selected ? <Check aria-hidden="true" className="size-3.5 text-accent" /> : null}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-fg-muted">{meta.tagline}</span>
                {!compact ? <span className="mt-1.5 block text-xs leading-relaxed text-fg-subtle">{meta.detail}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
      {config?.engines && !ai?.configured ? (
        <p role="status" className="mt-3 flex gap-2.5 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-fg">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            Full AI is turned off: {ai?.message ?? "the AI isn't set up on this computer."} Hybrid still runs, but only its free OpenRewrite / rules step.
          </span>
        </p>
      ) : config?.engines?.model ? (
        <p className="mt-2.5 text-xs text-fg-subtle">
          The AI uses <span className="font-mono text-fg-muted">{config.engines.model}</span>
          {config.engines.ai?.source ? ` (${config.engines.ai.source})` : ""}. Hybrid and Full AI get bounded build/test-fix rounds (Full AI: up to {config.engines.aiAttempts}).
        </p>
      ) : null}
    </div>
  );
}

/** Pills for a run's header: engine, model, tokens. Older runs without an engine show nothing. */
export function EnginePills({ run }) {
  const engine = run.engine;
  if (!engine) return null;
  const meta = engineMeta[engine.engine] ?? engineMeta.classic;
  const usesAi = engine.engine !== "classic";
  const tokens = engine.ai?.tokensIn == null || engine.ai?.tokensOut == null ? null : engine.ai.tokensIn + engine.ai.tokensOut;
  return (
    <>
      <Pill icon={meta.icon} tone="accent" className="" >
        {meta.label}
        {engine.requested !== engine.engine ? <span className="font-normal text-fg-subtle"> (asked for {engineMeta[engine.requested]?.label ?? engine.requested})</span> : null}
      </Pill>
      {usesAi ? (
        <Pill icon={Bot} mono>
          {engine.model ?? (engine.ai?.calls === 0 && run.status !== "running" ? "AI not needed" : "model n/a")}
        </Pill>
      ) : null}
      <Pill mono title={usesAi ? "AI tokens in + out, as reported by the SDK" : "No AI was used"}>
        {usesAi ? (tokens == null ? "tokens n/a" : `${formatTokens(engine.ai.tokensIn)} in / ${formatTokens(engine.ai.tokensOut)} out`) : "0 tokens"}
      </Pill>
      {engine.estimate ? (
        <Pill mono title={`Estimate made from the repo's file sizes before the run.\n${(engine.estimate.method ?? []).join("\n")}`}>
          est. {formatInOut(engine.estimate)}
          {tokens != null ? <span className="font-normal text-fg-subtle"> · {tokens < engine.estimate.low ? "under" : tokens > engine.estimate.high ? "over" : "within"}</span> : null}
        </Pill>
      ) : null}
    </>
  );
}

/** "Page check: 2 problems" for Java apps with a page: the app was started and the page's API calls were tried. */
export function PageCheckPill({ run }) {
  const page = run.pageCheck;
  if (!page?.ran) return null;
  const problems = page.problems?.length ?? 0;
  const detail = [
    page.initialProblems && page.initialProblems !== problems ? `${page.initialProblems} problem(s) found at first` : null,
    page.fixAttempted ? `${page.rounds} AI fix-up round(s) on the page` : problems ? "reported only: this engine's AI does not edit the page" : null,
  ].filter(Boolean);
  return (
    <Pill icon={Globe} tone={problems ? "warning" : "passed"} title={`The packaged app was started and the page's API calls were tried.${detail.length ? `\n${detail.join("\n")}` : ""}`}>
      {problems ? `Page check: ${problems} problem${problems === 1 ? "" : "s"}` : page.initialProblems ? `Page check: fixed ${page.initialProblems}` : "Page check: ok"}
    </Pill>
  );
}

/** One-line note under the header (OpenRewrite fell back to the built-in rules, or Hybrid ran without an AI login). */
export function EngineNotes({ run }) {
  const notes = run.engine?.notes ?? [];
  if (!notes.length) return null;
  return (
    <ul className="space-y-1 text-xs text-fg-muted">
      {notes.map((note) => (
        <li key={note} className="flex gap-2">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning" /> {note}
        </li>
      ))}
    </ul>
  );
}

/** "Compare both": run Hybrid and Full AI on temporary copies and put the results side by side. */
export function ComparePanel({ config, busy, onCompare, className = "", variant = "secondary" }) {
  const fullAi = engineState(config, "ai");
  const ready = fullAi.available;
  return (
    <div className={className}>
      <Button variant={variant} className="w-full sm:w-auto" onClick={() => onCompare(["hybrid", "ai"])} disabled={!ready || busy} title={!ready ? (fullAi.reason ?? "Full AI is not available") : undefined}>
        {busy ? <Spinner label="Starting…" /> : <><Scale aria-hidden="true" /> Compare both</>}
      </Button>
      <p className="mt-2 text-xs text-fg-subtle">
        {ready
          ? "Runs Hybrid, then Full AI, on temporary copies (your folder is never changed) and compares build, tests, files, time and tokens (estimated vs actual). Takes about the sum of both runs."
          : (fullAi.reason ?? "Set up the AI to compare.")}
      </p>
    </div>
  );
}

// ---- scorecard ----------------------------------------------------------------------------

function duration(ms) {
  if (ms == null) return "n/a";
  const seconds = Math.round(ms / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
}

const rows = [
  { id: "buildOk", label: "Build + tests ok", text: (m) => (m.buildOk == null ? "n/a" : m.buildOk ? "Yes" : "No") },
  { id: "testsPassed", label: "Tests passed", text: (m) => (m.testsPassed == null ? "n/a" : `${m.testsPassed}${m.testsRun != null ? ` / ${m.testsRun}` : ""}`) },
  { id: "testsFailed", label: "Tests failed", text: (m) => (m.testsFailed == null ? "n/a" : String(m.testsFailed)) },
  { id: "filesChanged", label: "Files changed", text: (m) => String(m.filesChanged), hint: "Fewer is a smaller diff to review (compared between runs that build)." },
  { id: "manualLeft", label: "Items left for manual fix", text: (m) => String(m.manualLeft) },
  { id: "wallMs", label: "Wall time", text: (m) => duration(m.wallMs) },
  { id: "tokensEstimate", label: "Tokens: estimate before the run", text: (m) => formatInOut(m.estimate), hint: "Input and output ranges from the repo's file sizes and the agent's turns; not a measurement and not a price." },
  {
    id: "tokens",
    label: "Tokens: actual (in + out)",
    text: (m) => (m.tokensIn == null || m.tokensOut == null ? "n/a" : `${formatTokens(m.tokensIn + m.tokensOut)}`),
    sub: (m) => {
      if (m.tokensIn == null || m.tokensOut == null) return "SDK did not report";
      const total = m.tokensIn + m.tokensOut;
      if (total === 0) return "no AI used";
      const vs = m.estimate ? (total < m.estimate.low ? " · under the estimate" : total > m.estimate.high ? " · over the estimate" : " · within the estimate") : "";
      return `${formatTokens(m.tokensIn)} in / ${formatTokens(m.tokensOut)} out${vs}`;
    },
  },
  { id: "costUsd", label: "Estimated cost", text: (m) => (m.costUsd == null ? "n/a" : `$${m.costUsd.toFixed(4)}`), hint: "Only shown when the SDK reports a cost; never estimated by Verdigrade." },
];

const runTone = { passed: "passed", failed: "failed", running: "running", queued: "waiting", error: "failed" };

/** Side-by-side table with the winner per row highlighted. `comparison` is the server's saved document. */
export function Scorecard({ comparison }) {
  const runs = comparison.runs ?? [];
  const overall = comparison.overall;
  return (
    <div>
      {overall ? (
        <p className="mb-4 flex items-center gap-2.5 text-[13.5px] text-fg-muted">
          <Trophy aria-hidden="true" className="size-4 shrink-0 text-success" />
          <span>
            <span className="font-medium text-fg">{engineMeta[overall]?.label ?? overall} wins overall.</span> It builds and wins the most rows.
          </span>
        </p>
      ) : comparison.status === "done" ? (
        <p className="mb-4 text-[13.5px] text-fg-muted">No single winner: the engines are tied or none of them built.</p>
      ) : null}
      <div className="overflow-x-auto rounded-[10px] border border-border">
        <table className="data-table min-w-[30rem]">
          <thead>
            <tr>
              <th scope="col" className="w-[34%]">
                Metric
              </th>
              {runs.map((run) => {
                const meta = engineMeta[run.engine] ?? engineMeta.classic;
                return (
                  <th key={run.engine} scope="col" className={`!h-auto !py-3 align-top !normal-case !tracking-normal ${overall === run.engine ? "bg-success-soft/50" : ""}`}>
                    <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-fg">
                      {meta.label}
                      {overall === run.engine ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                          <Trophy aria-hidden="true" className="size-3.5" /> Winner
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs font-normal text-fg-subtle">{run.engine === "classic" ? "no model (free step)" : (run.metrics?.model ?? (run.metrics?.aiCalls === 0 ? "AI not needed" : "model n/a"))}</span>
                    <span className="mt-1.5 block">
                      <StatusText tone={runTone[run.status] ?? "neutral"} className="!text-xs">{run.status === "queued" ? "Queued" : run.status === "running" ? "Running…" : run.status === "passed" ? "Run passed" : run.status === "failed" ? "Run failed" : "Could not run"}</StatusText>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const winners = comparison.winners?.[row.id] ?? [];
              return (
                <tr key={row.id}>
                  <th scope="row" className="!h-auto border-b border-border !bg-transparent !py-2.5 text-left align-top !text-[13px] !font-medium !tracking-normal !normal-case !text-fg-muted">
                    {row.label}
                    {row.hint ? <span className="mt-0.5 block text-2xs font-normal text-fg-subtle">{row.hint}</span> : null}
                  </th>
                  {runs.map((run) => {
                    const win = winners.includes(run.engine);
                    const metrics = run.metrics;
                    return (
                      <td key={run.engine} className={`align-top tabular-nums ${win ? "font-semibold !text-success" : "text-fg"} ${overall === run.engine ? "bg-success-soft/30" : ""}`}>
                        <span className="flex items-center gap-1.5">
                          {metrics ? row.text(metrics) : run.status === "running" || run.status === "queued" ? "…" : "n/a"}
                          {win ? (
                            <>
                              <Trophy aria-hidden="true" className="size-3.5 shrink-0" />
                              <span className="sr-only">(best in this row)</span>
                            </>
                          ) : null}
                        </span>
                        {metrics && row.sub ? <span className="mt-0.5 block text-2xs font-normal text-fg-subtle">{row.sub(metrics)}</span> : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {runs.some((run) => run.error) ? (
        <ul className="mt-3 space-y-1 text-xs text-fg-muted">
          {runs
            .filter((run) => run.error)
            .map((run) => (
              <li key={run.engine}>
                <span className="font-medium text-fg">{engineMeta[run.engine]?.label}:</span> {run.error}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}

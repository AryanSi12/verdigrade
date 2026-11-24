import { readFileSync } from "node:fs";
import path from "node:path";
import { agentRoot, envSetting } from "./config.js";
import type { RunState } from "./types.js";

/**
 * The upgrade engine a run uses:
 * - classic: deterministic tools only (OpenRewrite / codemods / rules). No model, no tokens. Leftovers are reported.
 * - ai:      the AI agent does the upgrade and iterates build/test-fix rounds (bounded).
 * - hybrid:  classic first, then the AI only on what still fails (bounded rounds).
 */
export type Engine = "classic" | "ai" | "hybrid";
/** The engines people can choose: Hybrid (default) and Full AI. Classic is Hybrid's internal first stage (and the fallback without an AI login). */
export const engineList: Engine[] = ["hybrid", "ai"];
const internalEngines: Engine[] = ["classic", "hybrid", "ai"];
export const defaultEngine: Engine = "hybrid";

export const engineLabels: Record<Engine, string> = { classic: "Classic", hybrid: "Hybrid", ai: "Full AI" };

export function parseEngine(value: unknown): Engine | null {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (internalEngines as string[]).includes(text) ? (text as Engine) : null;
}

export function usesAi(engine: Engine): boolean {
  return engine !== "classic";
}

/** Max build/test-fix rounds the AI gets in the AI engine (the Hybrid engine keeps the fix-round setting). */
export function defaultAiAttempts(): number {
  const raw = envSetting("AI_ATTEMPTS");
  const value = Number(raw);
  return raw != null && Number.isInteger(value) && value >= 1 && value <= 8 ? value : 3;
}

/** Model name shown in headers and reports: VERDIGRADE_MODEL, else the id declared in bot/agent.ts. */
export function configuredModel(): string | null {
  const override = envSetting("MODEL")?.trim();
  if (override) return override;
  try {
    const source = readFileSync(path.join(agentRoot, "bot", "agent.ts"), "utf8");
    return /model:\s*\{\s*id:\s*"([^"]+)"/.exec(source)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** The token estimate recorded on a run (see estimate.ts); shown next to the actual usage. */
export type RunEstimate = { low: number; high: number; input?: { low: number; high: number }; output?: { low: number; high: number }; method: string[] };

export type TokenUsage = { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number; reasoningTokens?: number };

/** What the run records about its engine (state.engine). Older saved runs have none. */
export type EngineRun = {
  /** The engine that actually ran. */
  engine: Engine;
  /** What was asked for (differs when Hybrid ran without an AI login: it fell back to Classic). */
  requested: Engine;
  /** Model used for AI calls; null when no AI call was made. */
  model: string | null;
  /** The deterministic tool for this ecosystem. */
  classicTool: string;
  /** Java only: did OpenRewrite run, or did Classic fall back to the built-in rules? */
  openRewrite: "ran" | "unavailable" | "not-used";
  notes: string[];
  /** Token estimate made before the run, from the plan. Absent for runs without a plan. */
  estimate?: RunEstimate;
  ai: {
    /** Model calls made (upgrade + fix-up rounds). */
    calls: number;
    /** Calls that reported token usage. */
    reportedCalls: number;
    /** Fix-up rounds allowed / used. */
    maxRounds: number;
    roundsUsed: number;
    upgraded: boolean;
    tokensIn: number | null;
    tokensOut: number | null;
    /** Only when the SDK reports a cost for the run (it does not per turn, so normally null). Never estimated here. */
    costUsd: number | null;
  };
};

export const classicToolLabels = { java: "OpenRewrite + rules", node: "codemods + rules", python: "rules" } as const;

export function initialEngineRun(options: { engine?: Engine; hasAi: boolean; ecosystem: keyof typeof classicToolLabels; maxRounds: number }): EngineRun {
  const requested = options.engine ?? (options.hasAi ? defaultEngine : "classic");
  const engine: Engine = requested !== "classic" && !options.hasAi && requested === "hybrid" ? "classic" : requested;
  const notes: string[] = [];
  if (engine !== requested) notes.push("AI is not available (no model login), so Hybrid ran only its free step (OpenRewrite and rules). The plan's AI items were not changed; run again with the AI set up, or fix them by hand.");
  return {
    engine,
    requested,
    model: null,
    classicTool: classicToolLabels[options.ecosystem] ?? "rules",
    openRewrite: "not-used",
    notes,
    ai: { calls: 0, reportedCalls: 0, maxRounds: engine === "classic" ? 0 : options.maxRounds, roundsUsed: 0, upgraded: false, tokensIn: engine === "classic" ? 0 : null, tokensOut: engine === "classic" ? 0 : null, costUsd: null },
  };
}

/** Add one model call's usage (undefined usage = the SDK did not report it). */
export function recordAiCall(run: EngineRun, call: { model?: string | null; usage?: TokenUsage | null; costUsd?: number | null }): void {
  run.ai.calls += 1;
  if (call.model) run.model = call.model;
  if (call.usage) {
    run.ai.reportedCalls += 1;
    run.ai.tokensIn = (run.ai.tokensIn ?? 0) + (call.usage.inputTokens ?? 0);
    run.ai.tokensOut = (run.ai.tokensOut ?? 0) + (call.usage.outputTokens ?? 0);
  }
  if (typeof call.costUsd === "number" && Number.isFinite(call.costUsd)) run.ai.costUsd = (run.ai.costUsd ?? 0) + call.costUsd;
}

// ---- metrics ---------------------------------------------------------------------------

export type RunMetrics = {
  engine: Engine | null;
  model: string | null;
  /** Model calls made (0 = the AI was not needed, or Classic). */
  aiCalls: number;
  tokensIn: number | null;
  tokensOut: number | null;
  /** The estimate made before the run (null = none). */
  estimate: { low: number; high: number; input?: { low: number; high: number }; output?: { low: number; high: number } } | null;
  costUsd: number | null;
  wallMs: number | null;
  /** True when the test (or, with tests skipped, package) step passed; null while running. */
  buildOk: boolean | null;
  /** The run passed its checks, i.e. the project really reached the target versions (a build can pass on an un-upgraded project). */
  targetReached: boolean | null;
  testsRun: number | null;
  testsPassed: number | null;
  testsFailed: number | null;
  filesChanged: number;
  /** Manual follow-ups + locked/manual plan items + failed error checks + failed steps' leftovers. */
  manualLeft: number;
  status: RunState["status"];
};

export function runMetrics(state: RunState): RunMetrics {
  const engine = state.engine ?? null;
  const tests = state.tests;
  const finished = state.status !== "running";
  let buildOk: boolean | null = null;
  if (finished) {
    const testStep = state.steps.test.status;
    const packageStep = state.steps.package.status;
    buildOk = testStep === "passed" ? packageStep !== "failed" : testStep === "skipped" ? packageStep === "passed" : false;
  }
  const failed = tests ? (tests.failures ?? 0) + (tests.errors ?? 0) : null;
  const passed = tests && tests.testsRun != null ? Math.max(0, tests.testsRun - (failed ?? 0) - (tests.skipped ?? 0)) : null;
  const manualPlan = (state.plan?.followUps ?? []).filter((item) => item.decision !== "approve").length;
  const failedChecks = state.checks.filter((check) => !check.ok && check.level === "error").length;
  return {
    engine: engine?.engine ?? null,
    model: engine?.model ?? null,
    aiCalls: engine?.ai.calls ?? 0,
    tokensIn: engine ? engine.ai.tokensIn : null,
    tokensOut: engine ? engine.ai.tokensOut : null,
    estimate: engine?.estimate ? { low: engine.estimate.low, high: engine.estimate.high, input: engine.estimate.input, output: engine.estimate.output } : null,
    costUsd: engine?.ai.costUsd ?? null,
    wallMs: state.durationMs,
    buildOk,
    targetReached: finished ? state.status === "passed" : null,
    testsRun: tests?.testsRun ?? null,
    testsPassed: passed,
    testsFailed: failed,
    filesChanged: state.changedFiles.length,
    manualLeft: state.followUps.length + manualPlan + failedChecks,
    status: state.status,
  };
}

// ---- comparison ---------------------------------------------------------------------------

export type CompareRowId = "targetReached" | "buildOk" | "testsPassed" | "testsFailed" | "filesChanged" | "manualLeft" | "wallMs" | "tokens" | "tokensEstimate" | "costUsd";

export type CompareRow = { id: CompareRowId; label: string; better: "higher" | "lower" | "true" | "none"; note?: string };

export const compareRows: CompareRow[] = [
  { id: "targetReached", label: "Upgrade target reached", better: "true", note: "the run passed its checks: the project really is on the target versions" },
  { id: "buildOk", label: "Build + tests ok", better: "true" },
  { id: "testsPassed", label: "Tests passed", better: "higher" },
  { id: "testsFailed", label: "Tests failed", better: "lower" },
  { id: "filesChanged", label: "Files changed", better: "lower", note: "fewer = a smaller diff to review (only compared between runs that build)" },
  { id: "manualLeft", label: "Items left for manual fix", better: "lower" },
  { id: "wallMs", label: "Wall time", better: "lower" },
  { id: "tokensEstimate", label: "Tokens: estimate before the run", better: "none", note: "from the repo's file sizes; a range, not a measurement" },
  { id: "tokens", label: "Tokens: actual (in + out)", better: "lower", note: "as reported by the model SDK" },
  { id: "costUsd", label: "Estimated cost (USD)", better: "lower", note: "only when the SDK reports one" },
];

export type ComparedRun = { engine: Engine; runId: string | null; status: "queued" | "running" | "passed" | "failed" | "error"; error: string | null; metrics: RunMetrics | null };

export function metricValue(metrics: RunMetrics | null, id: CompareRowId): number | null {
  if (!metrics) return null;
  switch (id) {
    case "buildOk":
      return metrics.buildOk === null ? null : metrics.buildOk ? 1 : 0;
    case "targetReached":
      return metrics.targetReached === null ? null : metrics.targetReached ? 1 : 0;
    case "tokensEstimate":
      return null;
    case "tokens":
      return metrics.tokensIn == null || metrics.tokensOut == null ? null : metrics.tokensIn + metrics.tokensOut;
    case "wallMs":
      return metrics.wallMs;
    default:
      return metrics[id];
  }
}

/** A run that built, tested and reached the target versions. */
const reached = (run: ComparedRun) => Boolean(run.metrics?.buildOk && run.metrics.targetReached !== false);

/** Per row: the engines with the best value (empty when nothing to compare or every value ties). */
export function compareWinners(runs: ComparedRun[]): Record<CompareRowId, Engine[]> {
  const winners = {} as Record<CompareRowId, Engine[]>;
  const done = runs.filter((run) => run.metrics && run.status !== "error");
  for (const row of compareRows) {
    winners[row.id] = [];
    if (row.better === "none") continue;
    let candidates = done;
    if (row.id === "filesChanged") candidates = done.filter(reached);
    const values = candidates.map((run) => ({ engine: run.engine, value: metricValue(run.metrics, row.id) })).filter((entry): entry is { engine: Engine; value: number } => entry.value !== null);
    if (values.length < 2) continue;
    const best = row.better === "lower" ? Math.min(...values.map((entry) => entry.value)) : Math.max(...values.map((entry) => entry.value));
    if (values.every((entry) => entry.value === best)) continue;
    winners[row.id] = values.filter((entry) => entry.value === best).map((entry) => entry.engine);
  }
  return winners;
}

/** Overall: engines that build and reach the target first, then the most row wins. Null when nothing builds or it is a tie. */
export function overallWinner(runs: ComparedRun[]): Engine | null {
  const winners = compareWinners(runs);
  const score = new Map<Engine, number>();
  for (const run of runs) if (reached(run)) score.set(run.engine, 0);
  if (!score.size) return null;
  for (const entries of Object.values(winners)) for (const engine of entries) if (score.has(engine)) score.set(engine, (score.get(engine) ?? 0) + 1);
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null;
  return ranked[0][0];
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return "n/a";
  const seconds = Math.round(ms / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
}

/** Display text for one cell (shared by the Markdown report; the web has its own renderer with the same rules). */
export function metricText(metrics: RunMetrics | null, id: CompareRowId): string {
  if (!metrics) return "n/a";
  switch (id) {
    case "buildOk":
      return metrics.buildOk === null ? "n/a" : metrics.buildOk ? "yes" : "no";
    case "targetReached":
      return metrics.targetReached === null ? "n/a" : metrics.targetReached ? "yes" : "no";
    case "wallMs":
      return formatDuration(metrics.wallMs);
    case "tokensEstimate":
      return metrics.estimate
        ? `~${metrics.estimate.low.toLocaleString("en-US")}–${metrics.estimate.high.toLocaleString("en-US")}${metrics.estimate.input && metrics.estimate.output ? ` (in ~${metrics.estimate.input.low.toLocaleString("en-US")}–${metrics.estimate.input.high.toLocaleString("en-US")} / out ~${metrics.estimate.output.low.toLocaleString("en-US")}–${metrics.estimate.output.high.toLocaleString("en-US")})` : ""}`
        : "n/a";
    case "tokens": {
      const value = metricValue(metrics, "tokens");
      return value === null ? "n/a" : `${value.toLocaleString("en-US")} (${(metrics.tokensIn ?? 0).toLocaleString("en-US")} in / ${(metrics.tokensOut ?? 0).toLocaleString("en-US")} out)`;
    }
    case "costUsd":
      return metrics.costUsd == null ? "n/a" : `$${metrics.costUsd.toFixed(4)}`;
    default: {
      const value = metrics[id];
      return value == null ? "n/a" : String(value);
    }
  }
}

/** Markdown section describing a run's engine (used in the run report). */
export function engineSection(state: RunState): string[] {
  const engine = state.engine;
  if (!engine) return [];
  const metrics = runMetrics(state);
  const out = ["## Upgrade engine", `- Engine: ${engineLabels[engine.engine]}${engine.requested !== engine.engine ? ` (requested ${engineLabels[engine.requested]})` : ""}`];
  out.push(`- Deterministic tool: ${engine.classicTool}${state.ecosystem === "java" ? ` (OpenRewrite: ${engine.openRewrite === "ran" ? "ran" : engine.openRewrite === "unavailable" ? "could not be resolved, built-in rules were used instead" : "not used"})` : ""}`);
  out.push(`- Model: ${engine.model ?? (engine.engine === "classic" ? "none (no AI)" : engine.ai.calls === 0 && state.status !== "running" ? "not needed (no AI call was made)" : "n/a")}`);
  out.push(`- AI tokens: ${engine.engine === "classic" ? "0 (no AI)" : metrics.tokensIn == null ? "n/a (the SDK did not report usage)" : `${metrics.tokensIn.toLocaleString("en-US")} in / ${(metrics.tokensOut ?? 0).toLocaleString("en-US")} out over ${engine.ai.reportedCalls} of ${engine.ai.calls} call(s)`}`);
  if (engine.estimate) {
    const actual = metrics.tokensIn == null ? null : metrics.tokensIn + (metrics.tokensOut ?? 0);
    const verdict = actual == null ? "" : actual < engine.estimate.low ? " (under the estimate)" : actual > engine.estimate.high ? " (over the estimate)" : " (within the estimate)";
    out.push(`- Token estimate before the run: ~${engine.estimate.low.toLocaleString("en-US")}–${engine.estimate.high.toLocaleString("en-US")}; actual ${actual == null ? "n/a" : actual.toLocaleString("en-US")}${verdict}`);
    const e = engine.estimate;
    if (e.input && e.output) out.push(`- Estimate by direction: input ~${e.input.low.toLocaleString("en-US")}–${e.input.high.toLocaleString("en-US")}, output ~${e.output.low.toLocaleString("en-US")}–${e.output.high.toLocaleString("en-US")}; actual input ${metrics.tokensIn == null ? "n/a" : metrics.tokensIn.toLocaleString("en-US")}, output ${metrics.tokensOut == null ? "n/a" : metrics.tokensOut.toLocaleString("en-US")}`);
  }
  out.push(`- Estimated cost: ${engine.ai.costUsd == null ? "n/a (not reported by the SDK; none is estimated)" : `$${engine.ai.costUsd.toFixed(4)}`}`);
  if (engine.engine !== "classic") out.push(`- AI fix-up rounds: ${engine.ai.roundsUsed} of ${engine.ai.maxRounds} allowed${engine.engine === "ai" ? "; the AI also made the initial upgrade" : ""}`);
  out.push(`- Wall time: ${formatDuration(metrics.wallMs)}`);
  out.push(`- Target reached (checks passed): ${metrics.targetReached === null ? "n/a" : metrics.targetReached ? "yes" : "no"}`);
  out.push(`- Build ok: ${metrics.buildOk === null ? "n/a" : metrics.buildOk ? "yes" : "no"}`);
  out.push(`- Tests: ${metrics.testsPassed ?? "n/a"} passed, ${metrics.testsFailed ?? "n/a"} failed`);
  out.push(`- Files changed: ${metrics.filesChanged}`);
  out.push(`- Items left for manual fix: ${metrics.manualLeft}`);
  for (const note of engine.notes) out.push(`- Note: ${note}`);
  out.push("");
  return out;
}

/** Output of openrewrite/maven when the recipe artifacts or plugin could not be downloaded (offline, proxy, blocked). */
export function isResolutionFailure(output: string): boolean {
  return /could not (?:resolve|transfer)|failed to (?:read|collect dependencies)|unknownhost|unknown host|connection (?:refused|timed out|reset)|nested exception is java\.net|nonresolvable|non-resolvable|plugin .* or one of its dependencies could not be resolved|artifactresolutionexception|network is unreachable|no route to host|temporary failure in name resolution|offline mode/i.test(output);
}

/** Maven/Gradle output of a failed compile step: the project's own code does not compile (not a download or recipe problem). */
export function isCompileFailure(output: string): boolean {
  return /compilation (?:error|failure)|failed to execute goal [^\n]*compiler[^\n]*:(?:test)?compile|cannot find symbol|package [\w.]+ does not exist|error: cannot access|compilejava failed|execution failed for task ':[\w:-]*compile/i.test(output);
}

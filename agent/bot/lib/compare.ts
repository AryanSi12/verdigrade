import { randomUUID } from "node:crypto";
import path from "node:path";
import type { RunEstimate } from "./engine.js";
import { compareRows, compareWinners, engineLabels, formatDuration, metricText, metricValue, overallWinner, runMetrics, type CompareRowId, type ComparedRun, type Engine } from "./engine.js";
import { failStaleComparisons, listComparisons, loadComparison, saveComparison } from "./history.js";
import { cancelRun, getRun, runPromise, startRun, updateRun, type StartOptions } from "./runs.js";
import type { Fixer } from "./pipeline.js";
import type { Ecosystem } from "./types.js";

/** One saved comparison: the same repository through two engines (Hybrid and Full AI) (dry-run copies). */
export type Comparison = {
  id: string;
  repoPath: string;
  repoName: string;
  createdAt: string;
  finishedAt: string | null;
  status: "running" | "done" | "failed" | "cancelled";
  error: string | null;
  planId: string | null;
  ecosystem: Ecosystem | null;
  engines: Engine[];
  runs: ComparedRun[];
  winners: Record<CompareRowId, Engine[]>;
  overall: Engine | null;
};

const active = new Map<string, { cancelled: boolean; runId: string | null }>();
failStaleComparisons((id) => active.has(id));

export type CompareOptions = {
  engines: Engine[];
  /** Everything a normal start takes (repo, targets, plan…). dryRun is forced on; engine and fixer are set per run. */
  base: Omit<StartOptions, "engine" | "dryRun" | "fixer" | "onFinish">;
  /** The AI fixer; required when any chosen engine uses the model. */
  fixer?: Fixer;
  planId?: string | null;
  /** Token estimates per engine (from the plan); recorded on each run so the scorecard can show estimate vs actual. */
  estimates?: Partial<Record<Engine, RunEstimate>>;
};

function refresh(comparison: Comparison): void {
  comparison.winners = compareWinners(comparison.runs);
  comparison.overall = overallWinner(comparison.runs);
  saveComparison(comparison);
}

/** Start the comparison in the background; runs go one after another (they share the repository and the machine). */
export function startComparison(options: CompareOptions): Comparison {
  const engines = [...new Set(options.engines)];
  const id = randomUUID();
  const comparison: Comparison = {
    id,
    repoPath: options.base.repoPath,
    repoName: path.basename(options.base.repoPath) || options.base.repoPath,
    createdAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    error: null,
    planId: options.planId ?? null,
    ecosystem: options.base.ecosystem ?? null,
    engines,
    runs: engines.map((engine) => ({ engine, runId: null, status: "queued", error: null, metrics: null })),
    winners: compareWinners([]),
    overall: null,
  };
  const control = { cancelled: false, runId: null as string | null };
  active.set(id, control);
  refresh(comparison);
  void (async () => {
    try {
      for (const entry of comparison.runs) {
        if (control.cancelled) {
          entry.status = "error";
          entry.error = "Cancelled.";
          continue;
        }
        entry.status = "running";
        refresh(comparison);
        try {
          const started = startRun({
            ...options.base,
            dryRun: true,
            engine: entry.engine,
            fixer: entry.engine === "classic" ? undefined : options.fixer,
            estimate: options.estimates?.[entry.engine],
            onFinish: (state) => {
              updateRun(state.runId, (draft) => {
                draft.narrative = { status: "skipped", text: "", sessionId: null };
              });
            },
          });
          entry.runId = started.runId;
          control.runId = started.runId;
          refresh(comparison);
          const done = (await runPromise(started.runId)) ?? getRun(started.runId);
          const state = getRun(started.runId) ?? done;
          if (state) {
            entry.metrics = runMetrics(state);
            entry.status = state.status === "passed" ? "passed" : "failed";
            entry.error = state.error;
          }
        } catch (error) {
          entry.status = "error";
          entry.error = (error as Error).message;
        }
        control.runId = null;
        refresh(comparison);
      }
      comparison.status = control.cancelled ? "cancelled" : comparison.runs.every((run) => run.status === "error") ? "failed" : "done";
      if (comparison.status === "failed") comparison.error = comparison.runs.find((run) => run.error)?.error ?? "No engine could run.";
    } catch (error) {
      comparison.status = "failed";
      comparison.error = (error as Error).message;
    } finally {
      comparison.finishedAt = new Date().toISOString();
      active.delete(id);
      refresh(comparison);
    }
  })();
  return comparison;
}

export function cancelComparison(id: string): boolean {
  const control = active.get(id);
  if (!control) return false;
  control.cancelled = true;
  if (control.runId) cancelRun(control.runId);
  return true;
}

export function getComparison(id: string): Comparison | null {
  return loadComparison<Comparison>(id);
}

export function listAllComparisons(limit = 50): Comparison[] {
  return listComparisons<Comparison>(limit);
}

// ---- reports ----------------------------------------------------------------------------------

export function comparisonJson(comparison: Comparison) {
  return {
    schemaVersion: 1,
    tool: "leapfrog",
    kind: "engine-comparison",
    ...comparison,
    rows: compareRows.map((row) => ({
      id: row.id,
      label: row.label,
      winners: comparison.winners[row.id] ?? [],
      values: Object.fromEntries(comparison.runs.map((run) => [run.engine, metricValue(run.metrics, row.id)])),
    })),
  };
}

export function comparisonMarkdown(comparison: Comparison): string {
  const columns = comparison.runs;
  const out = [`# Engine comparison: ${comparison.repoName}`, "", "Generated by Verdigrade. Every engine ran on its own dry-run copy; the repository was not modified.", ""];
  out.push(`- Started: ${comparison.createdAt}`);
  out.push(`- Status: ${comparison.status}${comparison.error ? ` (${comparison.error})` : ""}`);
  if (comparison.planId) out.push(`- Plan: ${comparison.planId}`);
  out.push(`- Overall: ${comparison.overall ? `${engineLabels[comparison.overall]} (builds and wins the most rows)` : "no single winner"}`);
  out.push("");
  out.push(`| Metric | ${columns.map((run) => engineLabels[run.engine]).join(" | ")} |`);
  out.push(`| --- | ${columns.map(() => "---").join(" | ")} |`);
  const model = (run: ComparedRun) => (run.engine === "classic" ? "none" : (run.metrics?.model ?? (run.metrics && run.metrics.aiCalls === 0 && run.status !== "running" ? "not needed (0 AI calls)" : "n/a")));
  out.push(`| Model | ${columns.map(model).join(" | ")} |`);
  out.push(`| Run result | ${columns.map((run) => run.status).join(" | ")} |`);
  for (const row of compareRows) {
    const winners = comparison.winners[row.id] ?? [];
    out.push(`| ${row.label} | ${columns.map((run) => (winners.includes(run.engine) ? `**${metricText(run.metrics, row.id)}** (best)` : metricText(run.metrics, row.id))).join(" | ")} |`);
  }
  out.push("");
  for (const run of columns) {
    if (run.error) out.push(`- ${engineLabels[run.engine]}: ${run.error}`);
  }
  out.push("");
  out.push("Notes: Classic uses no AI tokens. Token counts come from the SDK; \"n/a\" means the SDK did not report them. Cost is shown only when the SDK reports one; Verdigrade never estimates prices.");
  out.push(`Wall time is the whole run (${columns.map((run) => `${engineLabels[run.engine]} ${formatDuration(run.metrics?.wallMs ?? null)}`).join(", ")}).`);
  out.push("");
  return out.join("\n");
}

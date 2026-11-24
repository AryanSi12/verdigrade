import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { GitSafety } from "./git.js";
import { loadRunState, saveRun } from "./history.js";
import { createRunState, runPipeline, writeReports, type PipelineOptions } from "./pipeline.js";
import { reportMarkdown } from "./report.js";
import { safeRealpath } from "./repo.js";
import type { RunState } from "./types.js";

type ActiveRun = { state: RunState; controller: AbortController; done: Promise<RunState> };

const active = new Map<string, ActiveRun>();
const repoLocks = new Map<string, string>();
const saveTimers = new Map<string, NodeJS.Timeout>();

export class RepoBusyError extends Error {
  constructor(readonly runId: string) {
    super(`Another migration (${runId}) is already running on this repository.`);
  }
}

function lockKey(repoPath: string): string {
  const real = safeRealpath(repoPath);
  return process.platform === "win32" ? real.toLowerCase() : real;
}

function persistSoon(state: RunState) {
  if (saveTimers.has(state.runId)) return;
  saveTimers.set(
    state.runId,
    setTimeout(() => {
      saveTimers.delete(state.runId);
      try {
        saveRun(state);
      } catch {
        /* the next save retries */
      }
    }, 1500),
  );
}

function persistNow(state: RunState) {
  const timer = saveTimers.get(state.runId);
  if (timer) clearTimeout(timer);
  saveTimers.delete(state.runId);
  saveRun(state, safeReport(state));
}

function safeReport(state: RunState): string {
  try {
    return reportMarkdown(state);
  } catch {
    return "";
  }
}

export type StartOptions = Omit<PipelineOptions, "runId" | "onChange" | "signal"> & {
  onFinish?: (state: RunState) => void | Promise<void>;
};

/**
 * Start a pipeline in the background. One run per repository at a time; every
 * run gets its own id (and its own model session for fix-up / narrative).
 */
export function startRun(options: StartOptions): RunState {
  const key = lockKey(options.repoPath);
  const holder = repoLocks.get(key);
  if (holder) throw new RepoBusyError(holder);
  const runId = randomUUID();
  const controller = new AbortController();
  const placeholder = createRunState({ ...options, runId });
  repoLocks.set(key, runId);
  const entry: ActiveRun = { state: placeholder, controller, done: Promise.resolve(placeholder) };
  active.set(runId, entry);
  persistNow(placeholder);
  entry.done = runPipeline({
    ...options,
    runId,
    signal: controller.signal,
    onChange: (state) => {
      entry.state = state;
      persistSoon(state);
    },
  })
    .then(async (state) => {
      entry.state = state;
      persistNow(state);
      try {
        await options.onFinish?.(state);
      } finally {
        persistNow(state);
      }
      return state;
    })
    .catch((error) => {
      entry.state.status = "failed";
      entry.state.error = (error as Error).message;
      entry.state.finishedAt = new Date().toISOString();
      persistNow(entry.state);
      return entry.state;
    })
    .finally(() => {
      repoLocks.delete(key);
      setTimeout(() => active.delete(runId), 10 * 60_000).unref?.();
    });
  return placeholder;
}

export function getRun(runId: string): RunState | null {
  return active.get(runId)?.state ?? loadRunState(runId).state;
}

export function runPromise(runId: string): Promise<RunState> | null {
  return active.get(runId)?.done ?? null;
}

export function cancelRun(runId: string): boolean {
  const entry = active.get(runId);
  if (!entry || entry.state.status !== "running") return false;
  entry.controller.abort();
  return true;
}

/** The running (non-finished) run whose work folder contains `dir`, if any. */
export function activeRunFor(dir: string): RunState | null {
  const real = safeRealpath(dir);
  for (const entry of active.values()) {
    if (entry.state.status !== "running") continue;
    const work = safeRealpath(entry.state.workPath);
    if (real === work || real.startsWith(work + path.sep)) return entry.state;
  }
  return null;
}

/** A running run whose work folder is `dir` or anywhere inside it (e.g. a project subfolder of a clone). */
export function activeRunInside(dir: string): RunState | null {
  const real = safeRealpath(dir);
  for (const entry of active.values()) {
    if (entry.state.status !== "running") continue;
    const work = safeRealpath(entry.state.workPath);
    if (work === real || work.startsWith(real + path.sep)) return entry.state;
  }
  return null;
}

/** Update a finished run (narrative, rollback) and re-write its reports. */
export function updateRun(runId: string, change: (state: RunState) => void): RunState | null {
  const state = getRun(runId);
  if (!state) return null;
  change(state);
  const entry = active.get(runId);
  if (entry) entry.state = state;
  try {
    writeReports(state);
  } catch {
    /* artifacts dir may be gone; the DB copy still updates */
  }
  persistNow(state);
  return state;
}

export async function rollbackRun(runId: string): Promise<{ ok: boolean; message: string; state: RunState | null }> {
  const state = getRun(runId);
  if (!state) return { ok: false, message: "Unknown run.", state: null };
  if (state.status === "running") return { ok: false, message: "The run is still in progress.", state };
  if (state.dryRun) return { ok: false, message: "Dry runs never touched the repository.", state };
  if (state.git.rolledBack) return { ok: false, message: "This run was already rolled back.", state };
  if (state.git.mode === "none" || !state.git.baseCommit) return { ok: false, message: "No git safety net was recorded for this run.", state };
  const key = lockKey(state.repoPath);
  if (repoLocks.has(key)) return { ok: false, message: "Another run is using this repository.", state };
  const safety = GitSafety.reopen(state.git.mode, state.repoPath, state.git.shadowGitDir, state.git.baseCommit, state.git.branch, state.git.originalBranch);
  repoLocks.set(key, runId);
  try {
    const message = await safety.rollback();
    const updated = updateRun(runId, (draft) => {
      draft.git.rolledBack = true;
      draft.warnings.push(`Rolled back: ${message}`);
    });
    return { ok: true, message, state: updated };
  } catch (error) {
    return { ok: false, message: (error as Error).message, state };
  } finally {
    repoLocks.delete(key);
  }
}

export function readLog(state: RunState, stepId: string, maxChars = 2_000_000): { text: string; truncated: boolean } {
  const step = state.steps[stepId as keyof RunState["steps"]];
  if (!step?.logFile) return { text: step?.logTail ?? "", truncated: false };
  try {
    const text = readFileSync(step.logFile, "utf8");
    return text.length > maxChars ? { text: text.slice(-maxChars), truncated: true } : { text, truncated: false };
  } catch {
    return { text: step.logTail, truncated: false };
  }
}

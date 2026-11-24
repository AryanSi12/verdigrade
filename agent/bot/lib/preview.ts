import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { releaseDryCopy, setPreviewInUse, sweepOldDryCopies } from "./dryCopies.js";
import { loadRunState, onMigrationDeleted } from "./history.js";
import { findInterpreter, ensureVenv, venvPython, pythonEnv } from "./adapters/pythonEnv.js";
import {
  activeJdk, chooseJdk, copyProject, detectPythonApp, discoverJdks, exportCommit, findRunnableJar, javaBuildStep, javaMajor, javaRunStep,
  maskLogLine, nodeBuildStep, nodeInstallStep, nodeRunStep, pickFreePort, previewEnv, previewHost, proxyGet, pythonInstallArgs, pythonRunStep,
  sampleCredentials, suggestEndpoints, waitForHealth, writeBindLocal, type Jdk, type ProxyReply, type Step,
} from "./previewKit.js";
import { runCommand, startServerProcess, type ServerProcess } from "./process.js";
import type { RunState } from "./types.js";

/**
 * Live preview: start the original app ("before", at the run's starting commit, on its old runtime) and the
 * migrated app ("after") as local servers, so both can be opened and compared in the browser.
 */

export type Side = "before" | "after";
export type SideStatus = "idle" | "preparing" | "starting" | "running" | "failed" | "stopped" | "unavailable";

export type SideView = {
  side: Side;
  status: SideStatus;
  message: string;
  url: string | null;
  port: number | null;
  runtime: string | null;
  /** Set when the needed runtime is missing: what is missing and whether an honest fallback exists. */
  needs: { title: string; detail: string; fallback: string | null } | null;
  note: string | null;
  log: string[];
  startedAt: string | null;
};

export type PreviewView = {
  runId: string;
  ecosystem: string;
  canPreview: boolean;
  reason: string | null;
  sides: Record<Side, SideView>;
  endpoints: string[];
  credentials: string[];
};

type SideRuntime = {
  side: Side;
  status: SideStatus;
  message: string;
  port: number | null;
  runtime: string | null;
  needs: SideView["needs"];
  note: string | null;
  lines: string[];
  partial: string;
  startedAt: string | null;
  generation: number;
  abort: AbortController | null;
  proc: ServerProcess | null;
};

const maxLines = 400;
const sessions = new Map<string, Record<Side, SideRuntime>>();

function emptySide(side: Side): SideRuntime {
  return { side, status: "idle", message: "Not started.", port: null, runtime: null, needs: null, note: null, lines: [], partial: "", startedAt: null, generation: 0, abort: null, proc: null };
}

function session(runId: string): Record<Side, SideRuntime> {
  let found = sessions.get(runId);
  if (!found) {
    found = { before: emptySide("before"), after: emptySide("after") };
    sessions.set(runId, found);
  }
  return found;
}

function addLog(side: SideRuntime, chunk: string): void {
  const text = side.partial + chunk.replace(/\r\n?/g, "\n");
  const parts = text.split("\n");
  side.partial = parts.pop() ?? "";
  for (const part of parts) {
    if (!part.trim()) continue;
    side.lines.push(maskLogLine(part).slice(0, 600));
  }
  if (side.lines.length > maxLines) side.lines.splice(0, side.lines.length - maxLines);
  if (side.partial.length > 2000) side.partial = side.partial.slice(-2000);
}

const info = (side: SideRuntime, text: string) => addLog(side, `[verdigrade] ${text}\n`);

function setStatus(side: SideRuntime, status: SideStatus, message: string): void {
  side.status = status;
  side.message = message;
}

export const isActive = (side: SideRuntime) => side.status === "preparing" || side.status === "starting" || side.status === "running";

/** Is a preview of this run open (the dry-run copy must be kept while it is)? */
export function previewOpen(runId: string): boolean {
  const found = sessions.get(runId);
  return Boolean(found && (isActive(found.before) || isActive(found.after)));
}

setPreviewInUse(previewOpen);

function previewDir(state: RunState): string {
  return path.join(state.artifactsDir, "preview");
}

// ---- views -----------------------------------------------------------------------------------------------------------

function sideView(side: SideRuntime): SideView {
  return {
    side: side.side,
    status: side.status,
    message: side.message,
    url: side.status === "running" && side.port ? `http://${previewHost}:${side.port}/` : null,
    port: side.port,
    runtime: side.runtime,
    needs: side.needs,
    note: side.note,
    log: side.lines.slice(-60),
    startedAt: side.startedAt,
  };
}

function scanRecord(state: RunState): Record<string, unknown> {
  return (state.scan ?? {}) as unknown as Record<string, unknown>;
}

/** Why a preview is not possible for this run at all, or null. */
export function previewBlocker(state: RunState): string | null {
  if (state.status === "running") return "Wait until the run has finished.";
  if (!existsSync(state.workPath)) return state.dryRun ? "The temporary copy of this dry run has been removed (the newest few are kept). Run it again to preview it." : "The project folder no longer exists.";
  return null;
}

/** The project folder to read endpoints and sample credentials from (the migrated copy, which still has the source). */
function sourceDir(state: RunState): string {
  return state.workPath;
}

export function previewView(state: RunState): PreviewView {
  const reason = previewBlocker(state);
  const found = session(state.runId);
  let endpoints: string[] = [];
  let credentials: string[] = [];
  if (!reason) {
    try {
      endpoints = suggestEndpoints(state.ecosystem, sourceDir(state));
      credentials = sampleCredentials(sourceDir(state));
    } catch {
      /* hints are optional */
    }
  }
  return { runId: state.runId, ecosystem: state.ecosystem, canPreview: !reason, reason, sides: { before: sideView(found.before), after: sideView(found.after) }, endpoints, credentials };
}

// ---- starting ----------------------------------------------------------------------------------------------------------

export type StartOptions = { useAvailableRuntime?: boolean };

class Stopped extends Error {}
class Gate extends Error {
  constructor(readonly needs: NonNullable<SideView["needs"]>) {
    super(needs.title);
  }
}

function usedPorts(): Set<number> {
  const used = new Set<number>();
  for (const pair of sessions.values()) for (const side of Object.values(pair)) if (side.port && isActive(side)) used.add(side.port);
  return used;
}

/** Begin starting one or both servers. Returns at once; the status moves on as the build and the start-up go on. */
export function startPreview(state: RunState, which: Side | "both", options: StartOptions = {}): PreviewView {
  const blocker = previewBlocker(state);
  if (blocker) return previewView(state);
  void sweepPendingPreviewFolders();
  const found = session(state.runId);
  for (const side of which === "both" ? (["before", "after"] as const) : [which]) {
    const current = found[side];
    if (isActive(current)) continue;
    void launchSide(state, current, options);
  }
  return previewView(state);
}

/** Stop one or both servers: kill the process tree, then wait (up to 10 s) until the processes have really ended. */
export async function stopPreview(runId: string, which: Side | "both" = "both"): Promise<void> {
  const found = sessions.get(runId);
  if (!found) return;
  const exits = (which === "both" ? (["before", "after"] as const) : [which]).map((side) => killSide(found[side], "Stopped."));
  await Promise.all(exits);
}

/** Mark the side stopped and kill its tree at once; the promise settles when the process has exited (or after `waitMs`). */
function killSide(side: SideRuntime, message: string, waitMs = 10_000): Promise<void> {
  side.generation += 1;
  side.abort?.abort();
  side.abort = null;
  const proc = side.proc;
  side.proc = null;
  proc?.stop();
  if (isActive(side) || side.status === "preparing") {
    setStatus(side, "stopped", message);
    side.port = null;
  }
  if (!proc) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, waitMs);
    timer.unref?.();
    void proc.exited.then(() => {
      clearTimeout(timer);
      // Windows releases the working folder a moment after the last process of the tree has gone.
      setTimeout(resolve, process.platform === "win32" ? 300 : 0);
    });
  });
}

/** Synchronous kill for process exit (nothing can be awaited there). */
export function stopAllPreviews(): void {
  for (const pair of sessions.values()) for (const side of Object.values(pair)) void killSide(side, "Stopped (the server is shutting down).", 0);
}

/** Empty a scratch folder before a (re)start; retries while Windows holds handles, then says what to do. */
function clearFolder(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch (error) {
    throw new Error(`Could not clear the old preview folder ${dir} (${error instanceof Error ? error.message : String(error)}). Stop the preview, wait a moment and start again.`);
  }
}

const pendingRemovals = new Set<string>();

/** Remove a folder, retrying while Windows still holds handles. Never throws: a folder that cannot go yet is retried later. */
async function removeFolder(dir: string): Promise<boolean> {
  try {
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    pendingRemovals.delete(dir);
    return true;
  } catch (error) {
    pendingRemovals.add(dir);
    console.warn(`[verdigrade] could not remove preview folder ${dir} yet (${error instanceof Error ? error.message : String(error)}); it will be removed later.`);
    return false;
  }
}

/** Try again the folders an earlier cleanup could not remove (called on the next start or cleanup). */
export async function sweepPendingPreviewFolders(): Promise<number> {
  let removed = 0;
  for (const dir of [...pendingRemovals]) if (await removeFolder(dir)) removed += 1;
  return removed;
}

/** The run was deleted: stop its servers, wait for them to end, remove the scratch folders. Never throws. */
export async function cleanupPreview(runId: string, artifactsDir?: string): Promise<void> {
  try {
    await stopPreview(runId);
  } catch (error) {
    console.warn(`[verdigrade] could not stop the preview of ${runId}: ${error instanceof Error ? error.message : String(error)}`);
  }
  sessions.delete(runId);
  if (artifactsDir) await removeFolder(path.join(artifactsDir, "preview"));
  await sweepPendingPreviewFolders();
}

let hooked = false;
function installExitHooks(): void {
  if (hooked) return;
  hooked = true;
  process.on("exit", stopAllPreviews);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      stopAllPreviews();
      process.kill(process.pid, signal);
    });
  }
}

async function launchSide(state: RunState, side: SideRuntime, options: StartOptions): Promise<void> {
  installExitHooks();
  side.generation += 1;
  const generation = side.generation;
  side.abort = new AbortController();
  side.lines = [];
  side.partial = "";
  side.needs = null;
  side.note = null;
  side.port = null;
  side.runtime = null;
  side.startedAt = new Date().toISOString();
  setStatus(side, "preparing", side.side === "before" ? "Getting the original code ready…" : "Getting the migrated code ready…");
  const alive = () => side.generation === generation;
  const guard = () => {
    if (!alive()) throw new Stopped();
  };
  try {
    const dir = path.join(previewDir(state), side.side);
    mkdirSync(dir, { recursive: true });
    if (state.ecosystem === "node") await launchNode(state, side, options, guard);
    else if (state.ecosystem === "python") await launchPython(state, side, options, guard);
    else await launchJava(state, side, options, guard);
  } catch (error) {
    if (error instanceof Stopped || !alive()) return;
    side.proc?.stop();
    side.proc = null;
    side.port = null;
    if (error instanceof Gate) {
      side.needs = error.needs;
      info(side, `${error.needs.title}. ${error.needs.detail}`);
      setStatus(side, "unavailable", error.needs.title);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    info(side, message);
    setStatus(side, "failed", message.split("\n")[0].slice(0, 300));
  }
}

async function runStep(side: SideRuntime, step: Step, guard: () => void, extraEnv: Record<string, string> = {}): Promise<void> {
  guard();
  setStatus(side, "preparing", `${step.label}…`);
  info(side, `$ ${[step.command, ...step.args].join(" ")}`);
  const result = await runCommand(step.command, step.args, {
    cwd: step.cwd,
    env: previewEnv(process.env, { ...step.env, ...extraEnv }),
    timeoutMs: step.timeoutMs ?? 10 * 60_000,
    signal: side.abort?.signal,
    onOutput: (chunk) => addLog(side, chunk),
    tailChars: 4000,
  });
  guard();
  if (!result.ok) {
    const tail = result.output.trim().split(/\r?\n/).slice(-3).join(" ").slice(0, 240);
    throw new Error(`${step.label} failed${result.exitCode != null ? ` (exit ${result.exitCode})` : result.failure ? ` (${result.failure})` : ""}. ${tail}`.trim());
  }
}

/** Start the long-running process, wait until it answers, and keep watching it. */
async function serve(state: RunState, side: SideRuntime, step: Step, guard: () => void, health: string[], waitMs = 120_000): Promise<void> {
  guard();
  setStatus(side, "starting", `Starting (${step.label}) on port ${side.port}…`);
  info(side, `$ ${[step.command, ...step.args].join(" ")}`);
  let exited = false;
  const generation = side.generation;
  const proc = startServerProcess(step.command, step.args, { cwd: step.cwd, env: previewEnv(process.env, step.env), onOutput: (chunk) => addLog(side, chunk) });
  side.proc = proc;
  void proc.exited.then((code) => {
    exited = true;
    if (side.generation !== generation || side.proc !== proc) return;
    side.proc = null;
    side.port = null;
    info(side, `The process ended${code != null ? ` (exit ${code})` : ""}.`);
    setStatus(side, side.status === "running" ? "stopped" : "failed", side.status === "running" ? "The server ended." : `The server exited before it answered${code != null ? ` (exit ${code})` : ""}.`);
  });
  const result = await waitForHealth(side.port as number, { timeoutMs: waitMs, paths: health, isAlive: () => !exited });
  guard();
  if (!result.up) {
    proc.stop();
    side.proc = null;
    const why = result.exited ? "The server exited before it answered (see the log)." : `No answer within ${Math.round(waitMs / 1000)} s${result.lastStatus ? ` (last status ${result.lastStatus})` : ""}.`;
    side.port = null;
    throw new Error(why);
  }
  setStatus(side, "running", `Running on port ${side.port}.`);
  info(side, `Up: ${result.path} answered ${result.status}.`);
}

async function allocatePort(side: SideRuntime): Promise<number> {
  const port = await pickFreePort(usedPorts());
  side.port = port;
  return port;
}

// ---- Java ------------------------------------------------------------------------------------------------------------

function majorOf(value: unknown): number | null {
  return typeof value === "string" || typeof value === "number" ? javaMajor(String(value)) : null;
}

async function beforeProject(state: RunState, side: SideRuntime): Promise<string> {
  const dest = path.join(previewDir(state), "before", "src");
  clearFolder(dest);
  if (state.dryRun) {
    // A dry run never changed the user's folder: the original is still there.
    info(side, "Copying the original project…");
    copyProject(state.repoPath, dest);
    return dest;
  }
  const base = state.git.baseCommit;
  if (!base) throw new Error("This run has no starting commit recorded, so the original cannot be rebuilt.");
  let gitDir: string;
  let subdir = "";
  if (state.git.mode === "shadow" && state.git.shadowGitDir) {
    gitDir = state.git.shadowGitDir;
  } else if (state.git.mode === "repo") {
    const top = await runCommand("git", ["rev-parse", "--absolute-git-dir"], { cwd: state.repoPath, timeoutMs: 30_000 });
    const prefix = await runCommand("git", ["rev-parse", "--show-prefix"], { cwd: state.repoPath, timeoutMs: 30_000 });
    if (!top.ok) throw new Error("Could not find the project's git folder.");
    gitDir = top.output.trim().split(/\r?\n/).pop() ?? "";
    subdir = prefix.ok ? prefix.output.trim().replace(/\/$/, "") : "";
  } else {
    throw new Error("This run had no version control, so the original code was not saved and cannot be previewed.");
  }
  info(side, `Restoring the original code (${base.slice(0, 8)}) into a scratch folder…`);
  return exportCommit({ gitDir, commit: base, dest, subdir });
}

function javaChoice(state: RunState, side: SideRuntime, options: StartOptions): { jdk: Jdk | null; label: string } {
  const jdks = discoverJdks();
  const installed = jdks.length ? jdks.map((jdk) => `JDK ${jdk.major}`).join(", ") : "none found";
  if (side.side === "after") {
    const wanted = majorOf(state.after?.java) ?? majorOf(state.request.targetJava) ?? 21;
    const jdk = chooseJdk(jdks, wanted, "atLeast") ?? activeJdk(jdks);
    if (jdk && jdk.major < wanted) side.note = `Needs JDK ${wanted}; running on JDK ${jdk.major}, which may not work.`;
    return { jdk, label: jdk ? `JDK ${jdk.major}` : "the JDK on PATH" };
  }
  const wanted = majorOf(state.from.java) ?? majorOf(scanRecord(state).javaVersion);
  if (wanted == null) return { jdk: activeJdk(jdks), label: "the JDK on PATH" };
  const exact = chooseJdk(jdks, wanted, "exact");
  if (exact) return { jdk: exact, label: `JDK ${exact.major}` };
  const fallback = activeJdk(jdks) ?? jdks[jdks.length - 1] ?? null;
  if (options.useAvailableRuntime && fallback) {
    side.note = `The original ran on JDK ${wanted}, which is not installed. This is the original code on JDK ${fallback.major}; it may behave differently or fail to start.`;
    return { jdk: fallback, label: `JDK ${fallback.major} (not JDK ${wanted})` };
  }
  throw new Gate({
    title: `Before needs JDK ${wanted} — not installed`,
    detail: `This computer has: ${installed}. Install JDK ${wanted} (or point VERDIGRADE_JDK_DIRS at a folder that holds it) to run the original exactly as it was.`,
    fallback: fallback ? `Try on JDK ${fallback.major} anyway` : null,
  });
}

async function launchJava(state: RunState, side: SideRuntime, options: StartOptions, guard: () => void): Promise<void> {
  const choice = javaChoice(state, side, options);
  side.runtime = choice.label;
  const home = choice.jdk?.home ?? null;
  const root = path.join(previewDir(state), side.side);
  let dir: string;
  let cwd: string;
  if (side.side === "before") {
    dir = await beforeProject(state, side);
    cwd = path.join(root, "run");
  } else if (state.dryRun) {
    dir = state.workPath;
    cwd = dir;
  } else {
    dir = state.workPath;
    cwd = path.join(root, "run");
  }
  guard();
  mkdirSync(cwd, { recursive: true });
  let jar = side.side === "after" ? findRunnableJar(dir) : null;
  if (!jar) {
    let buildDir = dir;
    if (side.side === "after" && !state.dryRun) {
      buildDir = path.join(root, "src");
      clearFolder(buildDir);
      info(side, "No built jar found; building in a scratch copy so your folder stays clean.");
      copyProject(dir, buildDir);
    }
    await runStep(side, javaBuildStep(buildDir, home), guard);
    jar = findRunnableJar(buildDir);
    if (!jar) throw new Error("The build finished but produced no runnable jar (is this a Spring Boot application?).");
  }
  const port = await allocatePort(side);
  await serve(state, side, javaRunStep({ jar, port, jdkHome: home, cwd }), guard, ["/actuator/health", "/"]);
}

// ---- Node ------------------------------------------------------------------------------------------------------------------

async function launchNode(state: RunState, side: SideRuntime, options: StartOptions, guard: () => void): Promise<void> {
  void options;
  const root = path.join(previewDir(state), side.side);
  let dir: string;
  let needsInstall = true;
  if (side.side === "before") {
    dir = await beforeProject(state, side);
    const from = scanRecord(state).nodeVersion ? String(scanRecord(state).nodeVersion) : null;
    side.note = `Runs on the Node ${process.versions.node} installed here${from ? ` (the project used ${from})` : ""}.`;
  } else if (state.dryRun) {
    dir = state.workPath;
    needsInstall = !existsSync(path.join(dir, "node_modules"));
  } else {
    dir = path.join(root, "src");
    clearFolder(dir);
    copyProject(state.workPath, dir);
  }
  side.runtime = `Node ${process.versions.node}`;
  guard();
  let pkg: { scripts?: Record<string, string>; main?: string } = {};
  try {
    pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    throw new Error("No readable package.json in this project.");
  }
  const bind = writeBindLocal(root);
  const port = await allocatePort(side);
  const run = nodeRunStep({ dir, port, start: pkg.scripts?.start ?? null, main: pkg.main ?? (existsSync(path.join(dir, "index.js")) ? "index.js" : existsSync(path.join(dir, "server.js")) ? "server.js" : null), bindLocal: bind });
  if (!run) throw new Error('This project has no "start" script and no main file, so there is nothing to run.');
  if (needsInstall) await runStep(side, nodeInstallStep(dir), guard);
  if (pkg.scripts?.build) await runStep(side, nodeBuildStep(dir), guard);
  await serve(state, side, run, guard, ["/", "/health"]);
}

// ---- Python ----------------------------------------------------------------------------------------------------------------

async function launchPython(state: RunState, side: SideRuntime, options: StartOptions, guard: () => void): Promise<void> {
  const root = path.join(previewDir(state), side.side);
  const cwdForTools = state.workPath;
  const env = pythonEnv(previewEnv(process.env), path.join(root, "pycache"));
  let dir: string;
  let python: string | null = null;
  let installAlready = false;
  if (side.side === "before") {
    dir = await beforeProject(state, side);
  } else {
    dir = path.join(root, "src");
    clearFolder(dir);
    copyProject(state.workPath, dir);
    const runVenv = venvPython(path.join(state.artifactsDir, "venv"));
    if (existsSync(runVenv)) {
      python = runVenv;
      installAlready = true;
      side.runtime = "the run's own virtual environment";
    }
  }
  guard();
  if (!python) {
    const line = side.side === "before"
      ? (state.request.from?.python || String(scanRecord(state).pythonVersion ?? "")).trim()
      : (state.route?.targets?.python || state.request.targets?.python || "").trim();
    const wanted = line.match(/\d+\.\d+/)?.[0] ?? null;
    setStatus(side, "preparing", "Looking for a Python interpreter…");
    const search = await findInterpreter(wanted ?? "3", { cwd: cwdForTools, env: previewEnv(process.env) });
    guard();
    const found = search.found;
    if (!found) {
      throw new Gate({ title: `${side.side === "before" ? "Before" : "After"} needs Python${wanted ? ` ${wanted}` : ""} — not installed`, detail: `Tried: ${search.tried.join("; ")}`, fallback: null });
    }
    if (wanted && found.line !== wanted) {
      if (side.side === "before" && !options.useAvailableRuntime) {
        throw new Gate({
          title: `Before needs Python ${wanted} — not installed`,
          detail: `Found Python ${found.version} instead. Tried: ${search.tried.join("; ")}`,
          fallback: `Try on Python ${found.line} anyway`,
        });
      }
      side.note = `Needs Python ${wanted}; running on Python ${found.version}, which may behave differently.`;
    }
    side.runtime = `Python ${found.version}`;
    const venvDir = path.join(root, "venv");
    const venv = await ensureVenv(found.executable, venvDir, { cwd: cwdForTools, env, timeoutMs: 5 * 60_000, signal: side.abort?.signal });
    guard();
    if (!venv.ok) throw new Error(`Could not create a virtual environment: ${venv.output.trim().slice(-200)}`);
    python = venv.python;
    const args = pythonInstallArgs(dir);
    if (args.length) await runStep(side, { label: "pip install", command: python, args: ["-m", "pip", "install", "--no-input", ...args], cwd: dir, env: { PIP_DISABLE_PIP_VERSION_CHECK: "1" }, timeoutMs: 15 * 60_000 }, guard);
  } else if (installAlready) {
    info(side, "Using the virtual environment the run already built.");
  }
  const app = detectPythonApp(dir);
  if (!app) throw new Error("Could not find a Flask app (app.py, wsgi.py, create_app) or a Django manage.py in this project.");
  const port = await allocatePort(side);
  await serve(state, side, pythonRunStep({ dir, python, port, app }), guard, ["/", "/health"], 60_000);
}

// ---- compare ------------------------------------------------------------------------------------------------------------------

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]));
  return value;
}

/** JSON with sorted keys (key order alone is not a difference); any other body as it is. */
export function canonicalBody(body: string): string {
  try {
    return JSON.stringify(sortKeys(JSON.parse(body)));
  } catch {
    return body;
  }
}

export type CompareReply = { path: string; before: ProxyReply | null; after: ProxyReply | null; same: boolean };

/** GET one path on both running servers (through the agent, so the browser needs no cross-origin access). */
export async function compareEndpoint(runId: string, urlPath: string, headers: Record<string, string> = {}): Promise<CompareReply> {
  const found = sessions.get(runId);
  const ask = async (side: SideRuntime | undefined) => (side && side.status === "running" && side.port ? proxyGet(side.port, urlPath, headers) : null);
  const [before, after] = await Promise.all([ask(found?.before), ask(found?.after)]);
  const same = Boolean(before && after && before.status === after.status && canonicalBody(before.body) === canonicalBody(after.body));
  return { path: urlPath, before, after, same };
}

let initialised = false;

/** Called once when the server starts: remove old dry-run copies and wire the delete hook. */
export function initPreview(): void {
  if (initialised) return;
  initialised = true;
  sweepOldDryCopies();
  onMigrationDeleted((runId) => {
    const artifactsDir = loadRunState(runId).state?.artifactsDir;
    void cleanupPreview(runId, artifactsDir).then(() => releaseDryCopy(runId));
  });
}

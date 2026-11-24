import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir, pythonOverride } from "../config.js";
import { runCommand, type RunOptions } from "../process.js";
import { compareVersions } from "./pythonMatrix.js";

/**
 * Interpreters and virtual environments for the Python adapter.
 *
 * - Windows: the `py` launcher (`py -3.14`) first, then `python` / `python3`;
 *   venv executables live in `Scripts\python.exe`.
 * - macOS / Linux: `python3.14`, then `python3` / `python`; venv executables
 *   live in `bin/python`.
 * - VERDIGRADE_PYTHON (legacy: JAVA_MIGRATOR_PYTHON) overrides discovery; `uv python find` is the last fallback.
 *
 * Nothing is installed into the project folder: the rewrite tools get their own
 * cached venv under the data dir, and each run gets a venv in its artifacts dir.
 */

export type Platform = NodeJS.Platform;

/** Path of an executable inside a venv ("Scripts\\pytest.exe" on Windows, "bin/pytest" elsewhere). */
export function venvBin(venvDir: string, name: string, platform: Platform = process.platform): string {
  return platform === "win32" ? path.win32.join(venvDir, "Scripts", `${name}.exe`) : path.posix.join(venvDir, "bin", name);
}

export function venvPython(venvDir: string, platform: Platform = process.platform): string {
  return venvBin(venvDir, "python", platform);
}

export type InterpreterCandidate = { command: string; args: string[] };

/** Commands tried, in order, to find a Python for the target line. */
export function interpreterCandidates(target: string, platform: Platform = process.platform, override: string | null = pythonOverride()): InterpreterCandidate[] {
  const list: InterpreterCandidate[] = [];
  if (override) list.push({ command: override, args: [] });
  if (platform === "win32") {
    list.push({ command: "py", args: [`-${target}`] }, { command: "python", args: [] }, { command: "python3", args: [] });
  } else {
    list.push({ command: `python${target}`, args: [] }, { command: "python3", args: [] }, { command: "python", args: [] });
  }
  return list;
}

export type Interpreter = { executable: string; version: string; line: string; via: string };

const probe = "import sys; print('%d.%d.%d' % sys.version_info[:3]); print(sys.executable)";

async function probeInterpreter(candidate: InterpreterCandidate, options: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<Interpreter | null> {
  const run = await runCommand(candidate.command, [...candidate.args, "-c", probe], { cwd: options.cwd, timeoutMs: 60_000, env: options.env });
  if (!run.ok) return null;
  const [version, executable] = run.output.trim().split(/\r?\n/).map((line) => line.trim());
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? "");
  if (!match || !executable) return null;
  return { executable, version, line: `${match[1]}.${match[2]}`, via: [candidate.command, ...candidate.args].join(" ") };
}

/**
 * Find a Python for `target` ("3.14"). Prefers the exact line; accepts a newer
 * one; returns everything tried so preflight can explain what is missing.
 */
export async function findInterpreter(target: string, options: { cwd: string; env?: NodeJS.ProcessEnv; platform?: Platform }): Promise<{ found: Interpreter | null; tried: string[] }> {
  const tried: string[] = [];
  let newer: Interpreter | null = null;
  for (const candidate of interpreterCandidates(target, options.platform)) {
    const found = await probeInterpreter(candidate, options);
    tried.push(`${[candidate.command, ...candidate.args].join(" ")}: ${found ? found.version : "not found"}`);
    if (!found) continue;
    if (found.line === target) return { found, tried };
    if (!newer && compareVersions(found.line, target) > 0) newer = found;
  }
  const uv = await runCommand("uv", ["python", "find", target], { cwd: options.cwd, timeoutMs: 60_000, env: options.env });
  if (uv.ok) {
    const executable = uv.output.trim().split(/\r?\n/).at(-1)?.trim() ?? "";
    const found = executable ? await probeInterpreter({ command: executable, args: [] }, options) : null;
    tried.push(`uv python find ${target}: ${found ? found.version : "not found"}`);
    if (found && found.line === target) return { found: { ...found, via: `uv python find ${target}` }, tried };
  } else {
    tried.push(`uv python find ${target}: ${uv.failure === "spawn" ? "uv not installed" : "not found"}`);
  }
  return { found: newer, tried };
}

/** pip / Python settings for every command: no prompts, no bytecode in the project, no version nag. */
export function pythonEnv(base: NodeJS.ProcessEnv | undefined, pycachePrefix: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...(base ?? process.env),
    PIP_DISABLE_PIP_VERSION_CHECK: "1",
    PIP_NO_INPUT: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONPYCACHEPREFIX: pycachePrefix,
    PYTHONUTF8: "1",
  };
  // A venv activated in the server's shell must not leak into the project's venv.
  delete env.VIRTUAL_ENV;
  delete env.PYTHONHOME;
  return env;
}

/** Create a venv with `interpreter -m venv` unless it already exists. */
export async function ensureVenv(interpreter: string, dir: string, options: Omit<RunOptions, "cwd"> & { cwd: string }) {
  const python = venvPython(dir);
  if (existsSync(python)) return { ok: true as const, python, created: false, command: "", output: "" };
  mkdirSync(path.dirname(dir), { recursive: true });
  const run = await runCommand(interpreter, ["-m", "venv", dir], options);
  return run.ok && existsSync(python)
    ? { ok: true as const, python, created: true, command: run.command, output: run.output }
    : { ok: false as const, python, created: false, command: run.command, output: run.output };
}

/** Cached tools venv (pyupgrade, django-upgrade) for one interpreter line and pin set. */
export function toolsVenvDir(interpreterLine: string, pins: string[]): string {
  const hash = createHash("sha1").update([...pins].sort().join("\n")).digest("hex").slice(0, 10);
  return path.join(dataDir(), "python-tools", `py${interpreterLine}-${hash}`);
}

export async function ensureToolsVenv(interpreter: Interpreter, pins: string[], options: Omit<RunOptions, "cwd"> & { cwd: string }) {
  const dir = toolsVenvDir(interpreter.line, pins);
  const marker = path.join(dir, "leapfrog-tools.txt");
  const python = venvPython(dir);
  const wanted = [...pins].sort().join("\n");
  if (existsSync(python) && existsSync(marker) && readFileSync(marker, "utf8") === wanted) return { ok: true as const, python, dir, log: `reused ${dir}` };
  const venv = await ensureVenv(interpreter.executable, dir, options);
  if (!venv.ok) return { ok: false as const, python, dir, log: venv.output };
  const install = await runCommand(python, ["-m", "pip", "install", "--quiet", ...pins], options);
  if (!install.ok) return { ok: false as const, python, dir, log: `${install.command}\n${install.output}` };
  writeFileSync(marker, wanted, "utf8");
  return { ok: true as const, python, dir, log: `${venv.command}\n${install.command}` };
}

// ---- per-run venv registry (so run_build in a fix-up uses the run's venv) -----------

const runVenvs = new Map<string, string>();

export function registerRunVenv(workPath: string, python: string): void {
  runVenvs.set(path.resolve(workPath), python);
}

export function runVenvFor(workPath: string): string | null {
  return runVenvs.get(path.resolve(workPath)) ?? null;
}

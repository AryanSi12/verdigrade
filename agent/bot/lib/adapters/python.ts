import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWorkCopy, removeWorkCopy } from "../git.js";
import { runCommand, type CommandResult } from "../process.js";
import type { CheckResult, RunState, VersionFact } from "../types.js";
import { isPythonScan } from "../types.js";
import { commonFindings, finding, firstLine, listRepoFiles, readText, testsFinding } from "./findings.js";
import { ensureToolsVenv, ensureVenv, findInterpreter, pythonEnv, registerRunVenv, runVenvFor, venvPython, type Interpreter } from "./pythonEnv.js";
import { compareVersions, loadPythonMatrix, normalizePython, pythonMatrixView, resetPythonMatrixCache, resolvePythonRoute, type PythonCodemod, type PythonResolveOk } from "./pythonMatrix.js";
import { applyPythonRules, type PyRuleEdit } from "./pythonRules.js";
import { firstPythonFailure, hitApplies, parsePytestTotals, pySkipDirs, pythonFilesOf, scanPythonProject, type PyApiHit, type PythonScanResult } from "./pythonScan.js";
import { StepFailed, type AdapterPlan, type LanguageAdapter, type PlanFinding, type PlanInput, type Snippet, type StepContext, type TargetRequest } from "./types.js";
import type { FindingKind } from "./kinds.js";

/** Interpreter and tools found in preflight, per run (the pipeline runs steps in order on one process). */
const runTools = new Map<string, { interpreter: Interpreter; tools: string }>();

function scanOf(state: RunState): PythonScanResult {
  if (!isPythonScan(state.scan)) throw new StepFailed("The Python scan is missing.");
  return state.scan;
}

function resolveFor(state: RunState): PythonResolveOk {
  const resolved = resolvePythonRoute({ python: state.route?.targets?.python });
  if (!resolved.ok) throw new StepFailed(resolved.error);
  return resolved;
}

function toolsOf(state: RunState) {
  const tools = runTools.get(state.runId);
  if (!tools) throw new StepFailed("Preflight did not prepare the Python tools.");
  return tools;
}

function pythonRequest(request: TargetRequest) {
  return { python: request.targets.python, fromPython: request.from.python };
}

export function pyupgradeFlag(target: string): string {
  return `--py${target.replace(".", "")}-plus`;
}

function frameworkTargets(resolved: PythonResolveOk) {
  return { python: resolved.targets.python, django: resolved.route.frameworks.django, flask: resolved.route.frameworks.flask };
}

function targetLabel(resolved: PythonResolveOk, scan: PythonScanResult | null): string {
  const parts = [`Python ${resolved.targets.python}`];
  if (!scan || scan.django || scan.hasManagePy) parts.push(`Django ${resolved.route.frameworks.django}${resolved.route.frameworks.django === "5.2" ? " LTS" : ""}`);
  if (!scan || scan.flask) parts.push(`Flask ${resolved.route.frameworks.flask}`);
  return parts.join(" · ");
}

export function codemodApplies(codemod: PythonCodemod, scan: PythonScanResult, resolved: PythonResolveOk): { run: boolean; reason: string } {
  if (codemod.when === "always") return pythonFilesOf(scan.repoPath).code.length ? { run: true, reason: `target Python ${resolved.targets.python}` } : { run: false, reason: "no .py files" };
  if (!scan.django && !scan.hasManagePy) return { run: false, reason: "Django is not used" };
  if (scan.djangoVersion && compareVersions(scan.djangoVersion, resolved.route.frameworks.django) >= 0) return { run: false, reason: `Django ${scan.djangoVersion} is already at ${resolved.route.frameworks.django}+` };
  return { run: true, reason: scan.djangoVersion ? `Django ${scan.djangoVersion} < ${resolved.route.frameworks.django}` : "Django version not pinned" };
}

function codemodArgs(codemod: PythonCodemod, resolved: PythonResolveOk): string[] {
  return codemod.tool === "pyupgrade"
    ? ["-m", "pyupgrade", pyupgradeFlag(resolved.targets.python), "--exit-zero-even-if-changed"]
    : ["-m", "django_upgrade", "--target-version", resolved.route.frameworks.django, "--exit-zero-even-if-changed"];
}

function codemodLabel(codemod: PythonCodemod): string {
  return codemod.package.replace(/==.*$/, "");
}

/** Run a tool over files in batches (Windows command lines are limited to ~32k characters). */
async function runOverFiles(python: string, args: string[], files: string[], options: Parameters<typeof runCommand>[2]): Promise<CommandResult> {
  let last: CommandResult | null = null;
  const outputs: string[] = [];
  for (let index = 0; index < files.length; index += 100) {
    last = await runCommand(python, [...args, ...files.slice(index, index + 100)], options);
    outputs.push(last.output);
    if (!last.ok) break;
  }
  if (!last) return { ok: true, command: `${python} ${args.join(" ")}`, exitCode: 0, failure: null, output: "no files", outputChars: 0, durationMs: 0, logFile: null };
  return { ...last, command: `${python} ${args.join(" ")} <${files.length} file(s)>`, output: outputs.join("\n") };
}

function pythonVersions(state: RunState): VersionFact[] {
  const before = isPythonScan(state.scan) ? state.scan : null;
  const after = isPythonScan(state.scanAfter) ? state.scanAfter : null;
  const targets = state.route?.targets ?? state.request.targets ?? {};
  const resolved = targets.python ? resolvePythonRoute({ python: targets.python }) : null;
  const facts: VersionFact[] = [{ key: "python", label: "Python", before: before?.pythonVersion ?? null, after: after?.pythonVersion ?? null, target: targets.python ?? null }];
  if (before?.django || after?.django) {
    facts.push({ key: "django", label: "Django", before: before?.djangoVersion ?? null, after: after?.djangoVersion ?? null, target: resolved?.ok ? resolved.route.frameworks.django : null });
  }
  if (before?.flask || after?.flask) {
    facts.push({ key: "flask", label: "Flask", before: before?.flaskVersion ?? null, after: after?.flaskVersion ?? null, target: resolved?.ok ? resolved.route.frameworks.flask : null });
  }
  return facts;
}

/** pip install arguments for the project: requirement files (dev/test ones too), else the project itself. */
export function installArgs(scan: PythonScanResult): string[] {
  if (scan.installSource === "requirements") {
    const root = scan.requirementFiles.filter((file) => !file.includes("/"));
    const files = root.length ? root : scan.requirementFiles;
    const primary = files.filter((file) => /^requirements\.(txt|in)$/i.test(file));
    const extra = files.filter((file) => /^(requirements[-_.]?(dev|test|tests|ci)|(dev|test)[-_.]requirements)\.txt$/i.test(file));
    const chosen = [...new Set([...primary, ...extra])].filter((file) => file.endsWith(".txt"));
    return (chosen.length ? chosen : files.filter((file) => file.endsWith(".txt"))).flatMap((file) => ["-r", file]);
  }
  if (scan.installSource === "pyproject" || scan.installSource === "setup") {
    const text = `${readText(scan.repoPath, "pyproject.toml")}\n${readText(scan.repoPath, "setup.py")}\n${readText(scan.repoPath, "setup.cfg")}`;
    const extras = ["test", "tests", "dev"].filter((name) => new RegExp(`^\\s*["']?${name}["']?\\s*[=:]\\s*\\[?`, "m").test(text));
    return ["-e", extras.length ? `.[${extras.join(",")}]` : "."];
  }
  return [];
}

function testCommand(scan: PythonScanResult): { args: string[]; label: string } | null {
  if (scan.testRunner === "pytest") return { args: ["-m", "pytest", "-p", "no:cacheprovider"], label: "pytest" };
  if (scan.testRunner === "django") return { args: ["manage.py", "test", "--noinput"], label: "manage.py test" };
  if (scan.testRunner === "unittest") {
    return { args: ["-m", "unittest", "discover", ...(existsSync(path.join(scan.repoPath, "tests")) ? ["-s", "tests", "-t", "."] : []), "-v"], label: "unittest" };
  }
  return null;
}

function toTestRun(result: CommandResult, prefix = "") {
  const output = `${prefix}${result.output}`;
  const totals = parsePytestTotals(output);
  return {
    ok: result.ok,
    exitCode: result.exitCode,
    failure: result.failure,
    command: result.command,
    firstFailure: result.ok ? "" : firstPythonFailure(output) || output.trim().split(/\r?\n/).slice(-10).join("\n"),
    outputTail: output,
    tests: totals ? { ...totals, testSets: [] as string[] } : null,
  };
}

function envFor(ctx: StepContext): NodeJS.ProcessEnv {
  return pythonEnv(ctx.env, path.join(ctx.state.artifactsDir, "pycache"));
}

async function projectVenv(ctx: StepContext, step: "modernize" | "test"): Promise<{ python: string; install: CommandResult | null; error: string | null }> {
  const { interpreter } = toolsOf(ctx.state);
  const dir = path.join(ctx.state.artifactsDir, "venv");
  const exec = { ...ctx.exec(step), env: envFor(ctx) };
  const venv = await ensureVenv(interpreter.executable, dir, { cwd: ctx.work, ...exec });
  if (!venv.ok) return { python: venv.python, install: null, error: `python -m venv failed:\n${venv.output}` };
  registerRunVenv(ctx.work, venv.python);
  const scan = isPythonScan(ctx.state.scanAfter) ? ctx.state.scanAfter : scanPythonProject(ctx.work);
  const args = installArgs(scan);
  if (!args.length) return { python: venv.python, install: null, error: "No dependency list pip can install." };
  const install = await runCommand(venv.python, ["-m", "pip", "install", "--no-input", ...args], { cwd: ctx.work, ...exec });
  return { python: venv.python, install, error: null };
}

/** compileall -x: skip virtual environments, caches and node_modules (either path separator). */
function compileExclude(): string {
  return `(^|[\\\\/])(${pySkipDirs.map((dir) => dir.replace(/\./g, "\\.")).join("|")}|node_modules|\\.git)([\\\\/]|$)`;
}

/**
 * The run_build tool's Python path (used by the AI fix-up loop): the run's own
 * venv (registered when the modernize/test step created it) re-installs the
 * dependencies and runs the tests, or byte-compiles for "package".
 */
export async function runPythonGoal(repoPath: string, goal: "test" | "package", timeoutMs: number) {
  const python = runVenvFor(repoPath);
  const env = pythonEnv(process.env, path.join(os.tmpdir(), "leapfrog-pycache"));
  if (!python) {
    const error = "No virtual environment for this folder yet. run_build works on a migration's working copy after its Test step created the venv.";
    return { ok: false, exitCode: null, failure: null, command: "python -m venv", durationMs: 0, tests: null, firstFailure: error, outputTail: error };
  }
  if (goal === "package") {
    const compile = await runCommand(python, ["-m", "compileall", "-q", "-x", compileExclude(), "."], { cwd: repoPath, env, timeoutMs });
    return { ...toTestRun(compile), tests: null, durationMs: compile.durationMs };
  }
  const scan = scanPythonProject(repoPath);
  const install = await runCommand(python, ["-m", "pip", "install", "--no-input", ...installArgs(scan)], { cwd: repoPath, env, timeoutMs });
  if (!install.ok) return { ...toTestRun(install), ok: false, tests: null, durationMs: install.durationMs };
  const command = testCommand(scan);
  if (!command) return { ok: false, exitCode: null, failure: null, command: "pytest", durationMs: 0, tests: null, firstFailure: "No tests were found (test_*.py / tests/).", outputTail: "" };
  const test = await runCommand(python, command.args, { cwd: repoPath, env, timeoutMs });
  return { ...toTestRun(test), durationMs: test.durationMs };
}

const nativePackages = new Set(["numpy", "pandas", "scipy", "psycopg2", "psycopg2-binary", "lxml", "pillow", "cryptography", "grpcio", "pyyaml", "uvloop", "orjson", "pydantic-core", "greenlet", "gevent", "mysqlclient", "cffi", "matplotlib", "scikit-learn", "regex", "ujson", "msgpack", "markupsafe"]);

/** Old-syntax lines pyupgrade typically rewrites (an estimate for the plan; preview gives the exact list). */
const pyupgradeHints = /\bsuper\(\s*\w+\s*,\s*(self|cls)\s*\)|^\s*class\s+\w+\(\s*object\s*\)|(^|[^\w])u["']|\.format\(|from\s+typing\s+import\s+[^#]*\b(List|Dict|Set|Tuple|Optional|Union|FrozenSet|Type)\b|^from\s+__future__\s+import|coding[:=]\s*utf-?8|\bsix\b|\bIOError\b|\bopen\([^)]*["']rU?["']\)/m;

function editKind(edit: PyRuleEdit): FindingKind {
  if (edit.rule === "requirements") return "rules.requirements";
  if (edit.rule === "pyproject" || edit.rule === "setup") return /requires-python|python_requires|^python:/.test(edit.detail) ? "rules.pyproject" : "rules.requirements";
  if (edit.rule === "python-version-file") return "rules.python-version";
  if (edit.rule === "flask:markup-import") return "rules.flask-imports";
  if (edit.rule === "flask:json-config") return "rules.flask-json-config";
  return "rules.stdlib";
}

function hitKind(hit: PyApiHit): FindingKind {
  if (hit.kind === "removed-module") return "python-module.removed";
  if (hit.kind === "stdlib-api") return hit.removedIn ? "python-api.removed" : "python-api.deprecated";
  if (hit.kind === "flask-api") return hit.removedIn ? "flask-api.removed" : "flask-api.deprecated";
  if (hit.kind === "werkzeug-api") return "werkzeug-api.removed";
  return "django-api.removed";
}

function hashFiles(root: string, files: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of files) {
    try {
      out.set(file, createHash("sha1").update(readFileSync(path.join(root, file))).digest("hex"));
    } catch {
      /* unreadable */
    }
  }
  return out;
}

/** Older-than-target Python in CI / Docker: "3.8", "3.13" for target 3.14 (never 3.14+). */
function olderPythonPattern(target: string): string {
  const minor = Number(target.split(".")[1]);
  const older = Array.from({ length: minor }, (_value, index) => String(index)).join("|");
  return `(?:2\\.\\d+|3\\.(?:${older}))(?![\\d])`;
}

/** Deterministic plan for a Python project. Read-only: a preview runs the tools on a temporary copy. */
async function pythonPlan(input: PlanInput): Promise<AdapterPlan> {
  const { repoPath, request } = input;
  const scan = scanPythonProject(repoPath);
  const resolved = resolvePythonRoute({ ...pythonRequest(request), fromPython: request.from.python || scan.pythonVersion || undefined });
  if (!resolved.ok) throw new StepFailed(resolved.error);
  const targets = frameworkTargets(resolved);
  const findings: PlanFinding[] = [];
  const notes: string[] = [];
  const files = listRepoFiles(repoPath).filter((file) => !file.split("/").some((part) => pySkipDirs.includes(part)));
  const { code } = pythonFilesOf(repoPath);
  const frameworkParams = { python: resolved.targets.python, django: targets.django, flask: targets.flask, fromDjango: scan.djangoVersion ?? "unknown", fromFlask: scan.flaskVersion ?? "unknown" };

  // ---- preview (optional): run the rewrite tools on a temporary copy ------------------
  const exact = new Map<string, string[]>();
  if (input.preview) {
    const found = await findInterpreter(resolved.targets.python, { cwd: repoPath, env: input.env });
    if (!found.found) {
      notes.push(`Preview skipped: Python ${resolved.targets.python} was not found (${found.tried.join("; ")}). File lists are estimates.`);
    } else {
      const matrix = loadPythonMatrix();
      const tools = await ensureToolsVenv(found.found, [matrix.tools.pyupgrade, matrix.tools.djangoUpgrade], { cwd: repoPath, timeoutMs: 15 * 60_000, signal: input.signal, env: pythonEnv(input.env, path.join(os.tmpdir(), "leapfrog-pycache")) });
      if (!tools.ok) {
        notes.push(`Preview skipped: the rewrite tools could not be installed (${tools.log.split(/\r?\n/).slice(-2).join(" ")}).`);
      } else {
        const copy = createWorkCopy(repoPath, pySkipDirs);
        try {
          for (const codemod of resolved.codemods) {
            if (!codemodApplies(codemod, scan, resolved).run) continue;
            const before = hashFiles(copy, code);
            const run = await runOverFiles(tools.python, codemodArgs(codemod, resolved), code, { cwd: copy, timeoutMs: 15 * 60_000, signal: input.signal, env: pythonEnv(input.env, path.join(os.tmpdir(), "leapfrog-pycache")) });
            if (!run.ok) {
              notes.push(`${codemodLabel(codemod)} preview failed (exit ${run.exitCode ?? run.failure}); the file list is an estimate.`);
              continue;
            }
            const after = hashFiles(copy, code);
            exact.set(codemod.id, code.filter((file) => before.get(file) !== after.get(file)));
          }
        } finally {
          removeWorkCopy(copy);
        }
      }
    }
  }

  // ---- (a) automatic ---------------------------------------------------------------------
  input.onStage?.("dependencies");
  const djangoRuns = resolved.codemods.some((codemod) => codemod.tool === "django-upgrade" && codemodApplies(codemod, scan, resolved).run);
  for (const codemod of resolved.codemods) {
    const decision = codemodApplies(codemod, scan, resolved);
    if (!decision.run) {
      notes.push(`${codemodLabel(codemod)} will be skipped: ${decision.reason}.`);
      continue;
    }
    const estimate =
      codemod.tool === "pyupgrade"
        ? code.filter((file) => pyupgradeHints.test(readText(repoPath, file)))
        : [...new Set(scan.hits.filter((hit) => hit.fix === "django-upgrade" && hitApplies(hit, targets)).map((hit) => hit.file))];
    const touched = exact.get(codemod.id) ?? estimate;
    if (codemod.tool === "pyupgrade" && !touched.length && exact.has(codemod.id)) {
      notes.push("pyupgrade preview found nothing to rewrite.");
      continue;
    }
    findings.push(
      finding({
        group: "auto",
        kind: codemod.tool === "pyupgrade" ? "codemod.pyupgrade" : "codemod.django-upgrade",
        params: { name: codemod.package.replace("==", " "), flag: codemod.tool === "pyupgrade" ? pyupgradeFlag(resolved.targets.python) : `--target-version ${targets.django}`, count: String(touched.length), ...frameworkParams },
        category: "codemod",
        severity: "info",
        title: `${codemodLabel(codemod)} ${codemod.tool === "pyupgrade" ? pyupgradeFlag(resolved.targets.python) : `--target-version ${targets.django}`}`,
        file: touched[0] ?? null,
        line: null,
        files: touched,
        why: `${codemod.description} Runs because ${decision.reason}. ${exact.has(codemod.id) ? "Files come from a preview run on a temporary copy." : "Files are an estimate from the scanner; turn on preview for the exact list."}`,
        suggestion: "Approve to run it. A locked file is left out of the run and restored if anything touches it.",
        defaultDecision: "approve",
      }),
    );
  }
  for (const hit of scan.hits.filter((item) => item.fix === "django-upgrade" && djangoRuns && hitApplies(item, targets))) {
    findings.push(
      finding({
        group: "auto",
        kind: "django-api.codemod",
        params: { api: hit.api, replacement: hit.replacement, removedIn: hit.removedIn ?? "", ...frameworkParams },
        snippets: [{ file: hit.file, line: hit.line, before: hit.text, after: null, note: `django-upgrade rewrites this to ${hit.replacement}.` }],
        category: "django-api",
        severity: "low",
        title: `${hit.api} → ${hit.replacement}`,
        file: hit.file,
        line: hit.line,
        why: `Removed in Django ${hit.removedIn}; django-upgrade rewrites it.`,
        suggestion: "Approve, or lock the file and port it by hand.",
        evidence: hit.text,
        defaultDecision: "approve",
      }),
    );
  }

  const edits = applyPythonRules(repoPath, { route: resolved.route, latestPatch: resolved.latestPatch, flaskDeclared: Boolean(scan.flask), write: false });
  const covered = new Set(edits.filter((edit) => edit.line !== null).map((edit) => `${edit.file}|${edit.rule}`));
  const groups = new Map<string, PyRuleEdit[]>();
  for (const edit of edits) {
    if (edit.line === null) {
      findings.push(
        finding({
          group: "review",
          kind: "dependency.manual",
          params: { detail: edit.detail },
          category: "dependency",
          severity: "medium",
          title: "Dependency the rules leave alone",
          file: edit.file,
          line: null,
          why: edit.detail,
          suggestion: "Make this change by hand before or after the run.",
          defaultDecision: "approve",
        }),
      );
      continue;
    }
    const key = `${edit.file}|${editKind(edit)}`;
    groups.set(key, [...(groups.get(key) ?? []), edit]);
  }
  for (const [key, list] of groups) {
    const [file, kind] = key.split("|") as [string, FindingKind];
    const details = list.map((edit) => edit.detail);
    const snippets: Snippet[] = list.slice(0, 12).map((edit) => ({ file, line: edit.line, before: edit.before, after: edit.after }));
    findings.push(
      finding({
        group: "auto",
        kind,
        params: { count: String(list.length), fileName: file, details: details.join("; "), latestPatch: resolved.latestPatch, ...frameworkParams },
        snippets,
        category: "rules",
        severity: "info",
        title: `${list.length} edit${list.length === 1 ? "" : "s"} in ${file}${kind === "rules.stdlib" || kind.startsWith("rules.flask") ? ` (${kind.replace("rules.", "")})` : ""}`,
        file,
        line: list[0].line,
        files: [file],
        why: details.join("; "),
        suggestion: "Approve to apply. Lock the file to keep it (the edits are skipped and listed as manual follow-up).",
        evidence: list[0].before,
        defaultDecision: "approve",
      }),
    );
  }
  findings.push(
    finding({
      group: "auto",
      kind: "install.venv",
      params: { python: resolved.targets.python, source: scan.installSource === "requirements" ? scan.requirementFiles.join(", ") : scan.installSource === "none" ? "nothing" : "the project (pip install -e .)" },
      category: "install",
      severity: "info",
      title: `Fresh Python ${resolved.targets.python} venv + pip install`,
      file: null,
      line: null,
      files: [],
      why: "Dependencies are installed with the new versions into a throwaway virtual environment outside the project, so the tests run against them.",
      suggestion: "Nothing to review: nothing is installed into the project folder.",
      defaultDecision: "approve",
    }),
  );

  // ---- (b) review ---------------------------------------------------------------------------
  input.onStage?.("risky-code");
  for (const hit of scan.hits) {
    if (!hitApplies(hit, targets)) continue;
    if (hit.fix === "django-upgrade" && djangoRuns) continue;
    if (hit.fix && hit.fix !== "django-upgrade" && covered.has(`${hit.file}|${hit.fix}`)) continue;
    const kind = hitKind(hit);
    const removed = hit.removedIn !== null;
    const where = hit.kind === "removed-module" || hit.kind === "stdlib-api" ? `Python ${hit.removedIn}` : hit.kind === "django-api" ? `Django ${hit.removedIn}` : hit.kind === "werkzeug-api" ? `Werkzeug ${hit.removedIn}` : `Flask ${hit.removedIn}`;
    findings.push(
      finding({
        group: "review",
        kind,
        params: { api: hit.api, replacement: hit.replacement, removedIn: hit.removedIn ?? "", ...frameworkParams },
        snippets: [{ file: hit.file, line: hit.line, before: hit.text, after: null, note: `Replace with ${hit.replacement} (by hand, or by the AI fix-up if a test fails).` }],
        category: removed ? "removed-api" : "deprecated-api",
        severity: removed ? "high" : "medium",
        title: removed ? `${hit.api} was removed in ${where}` : `${hit.api} is deprecated`,
        file: hit.file,
        line: hit.line,
        why: removed ? `This fails on the target (ImportError / AttributeError) and no rewrite tool changes it.` : "Deprecated: it still works but warns and will be removed in a later release.",
        suggestion: `Use ${hit.replacement}.`,
        evidence: hit.text,
        defaultDecision: "approve",
        fix: { summary: `Replace ${hit.api} with ${hit.replacement} in ${hit.file} line ${hit.line}.`, before: hit.text },
      }),
    );
  }
  for (const settings of scan.settingsFiles) {
    const text = readText(repoPath, settings);
    if (!/INSTALLED_APPS/.test(text)) continue;
    if (!/DEFAULT_AUTO_FIELD/.test(text)) {
      findings.push(
        finding({
          group: "review",
          kind: "django.default-auto-field",
          params: frameworkParams,
          category: "django-settings",
          severity: "medium",
          title: "DEFAULT_AUTO_FIELD is not set",
          file: settings,
          line: firstLine(text, /INSTALLED_APPS/)?.line ?? null,
          why: "Since Django 3.2 an unset DEFAULT_AUTO_FIELD warns (models.W042), and switching it later makes makemigrations alter every primary key.",
          suggestion: "Set DEFAULT_AUTO_FIELD = \"django.db.models.AutoField\" to keep today's id columns.",
          defaultDecision: "approve",
        }),
      );
    }
    if (!/^\s*USE_TZ\s*=/m.test(text) && (scan.djangoVersion === null || compareVersions(scan.djangoVersion, "5.0") < 0)) {
      findings.push(
        finding({
          group: "review",
          kind: "django.use-tz",
          params: frameworkParams,
          category: "django-settings",
          severity: "high",
          title: "USE_TZ default changes to True in Django 5.0",
          file: settings,
          line: firstLine(text, /INSTALLED_APPS/)?.line ?? null,
          why: "The settings rely on the old default (USE_TZ = False). From Django 5.0 datetimes become timezone-aware unless you set it.",
          suggestion: "Set USE_TZ = False to keep the old behaviour, or plan the switch to aware datetimes.",
          defaultDecision: "approve",
        }),
      );
    }
  }
  const pydantic = scan.requirements.find((item) => item.key === "pydantic");
  if (pydantic?.version && compareVersions(pydantic.version, "2") < 0) {
    findings.push(
      finding({
        group: "review",
        kind: "dependency.pydantic-v1",
        params: { spec: pydantic.spec },
        category: "dependency",
        severity: "high",
        title: `pydantic ${pydantic.spec} (v1)`,
        file: pydantic.file,
        line: pydantic.line,
        why: "pydantic 1.x has no releases for current Python lines and v2 changed the model API; this route doesn't bump it.",
        suggestion: "Migrate to pydantic v2 separately (bump-pydantic helps), then re-run.",
        evidence: pydantic.text,
        defaultDecision: "approve",
      }),
    );
  }
  for (const item of scan.requirements) {
    if (!nativePackages.has(item.key) || !/^==|<|~=/.test(item.spec) || resolved.route.packages.some((rule) => rule.name.toLowerCase() === item.key)) continue;
    findings.push(
      finding({
        group: "review",
        kind: "dependency.native-wheel",
        params: { name: item.name, spec: item.spec, ...frameworkParams },
        category: "dependency",
        severity: "medium",
        title: `${item.name}${item.spec} needs a build for Python ${resolved.targets.python}`,
        file: item.file,
        line: item.line,
        why: `${item.name} ships compiled code. An old pin often has no wheel for a new Python, so pip tries to compile it and fails.`,
        suggestion: `Check PyPI for a ${item.name} release with Python ${resolved.targets.python} wheels and bump the pin.`,
        evidence: item.text,
        defaultDecision: "approve",
      }),
    );
  }
  if (scan.testRunner !== null && scan.testRunner !== "pytest" && !scan.pytest && code.some((file) => /^\s*import pytest|^\s*from pytest\b/m.test(readText(repoPath, file)))) {
    findings.push(
      finding({
        group: "review",
        kind: "tests.pytest-undeclared",
        category: "tests",
        severity: "high",
        title: "Tests import pytest, but pytest is not a declared dependency",
        file: null,
        line: null,
        why: "The venv only gets declared dependencies, so the tests fail with ModuleNotFoundError: pytest.",
        suggestion: "Add pytest to requirements-dev.txt (or an optional test extra).",
        defaultDecision: "approve",
      }),
    );
  }
  const tests = testsFinding({ tests: scan.testFiles, sources: scan.sourceFiles, testHint: "a pytest test that calls the app's main entry point" });
  if (tests) findings.push(tests);
  if (scan.installSource === "none") {
    findings.push(
      finding({
        group: "review",
        kind: "install.none",
        category: "package-manager",
        severity: "high",
        title: "No dependency list pip can install",
        file: scan.dependencyFiles[0] ?? null,
        line: null,
        why: "The Python adapter installs with pip from requirements*.txt, pyproject [project] or setup.py. Preflight refuses the run without one.",
        suggestion: "Export a requirements.txt (pipenv requirements > requirements.txt) or add a [project] table.",
        defaultDecision: "approve",
      }),
    );
  } else if (scan.lockfile) {
    findings.push(
      finding({
        group: "review",
        kind: "package-manager.python",
        params: { manager: scan.packageManager, lockfile: scan.lockfile },
        category: "package-manager",
        severity: "medium",
        title: `${scan.packageManager} lockfile (${scan.lockfile}) is not updated`,
        file: scan.lockfile,
        line: null,
        why: `The run installs with pip; ${scan.lockfile} keeps the old pins until you re-lock.`,
        suggestion: `After the run, re-lock with ${scan.packageManager} (for example ${scan.packageManager === "poetry" ? "poetry lock" : scan.packageManager === "pipenv" ? "pipenv lock" : scan.packageManager === "uv" ? "uv lock" : "pdm lock"}).`,
        defaultDecision: "approve",
      }),
    );
  }

  // ---- (c) manual ---------------------------------------------------------------------------
  const older = olderPythonPattern(resolved.targets.python);
  findings.push(
    ...commonFindings(repoPath, files, {
      runtimeLabel: "Python",
      targetRuntime: resolved.targets.python,
      ciVersionKey: new RegExp(`python-version:\\s*\\[?\\s*['"]?${older}|image:\\s*\\S*python:${older}`, "i"),
      dockerImage: new RegExp(`^FROM\\s+\\S*python:${older}`, "i"),
    }),
  );

  return {
    routeId: resolved.route.id,
    description: resolved.route.description,
    targets: resolved.targets,
    targetLabel: targetLabel(resolved, scan),
    detected: {
      python: scan.pythonVersion,
      pythonSource: scan.pythonSource,
      django: scan.djangoVersion,
      flask: scan.flaskVersion,
      framework: scan.framework,
      packageManager: scan.packageManager,
      lockfile: scan.lockfile,
      testRunner: scan.testRunner,
      buildTool: "pip",
    },
    findings,
    stats: {
      filesScanned: scan.filesScanned,
      sourceFiles: scan.sourceFiles,
      testFiles: scan.testFiles,
      removedApis: scan.hits.filter((hit) => hit.removedIn !== null && hitApplies(hit, targets)).length,
      deprecatedApis: scan.hits.filter((hit) => hit.removedIn === null).length,
    },
    notes: [...notes, ...resolved.notes, ...scan.notes],
  };
}

export const pythonAdapter: LanguageAdapter = {
  id: "python",
  label: "Python / Django · Flask",
  stepLabels: { rewrite: "Codemods", package: "Compile" },
  ignorePatterns: ["__pycache__/", "*.pyc", ".pytest_cache/", ".venv/", "venv/", ".tox/", ".mypy_cache/", ".ruff_cache/", "*.egg-info/", "htmlcov/", ".coverage"],
  workCopySkip: pySkipDirs,

  detect(repoPath) {
    try {
      return scanPythonProjectDetect(repoPath);
    } catch {
      return false;
    }
  },

  validateProfiles() {
    resetPythonMatrixCache();
    try {
      const matrix = loadPythonMatrix();
      return { ok: true, problems: [], routes: matrix.routes.length, packs: [] };
    } catch (error) {
      return { ok: false, problems: [(error as Error).message], routes: 0, packs: [] };
    }
  },

  matrixView() {
    return pythonMatrixView();
  },

  resolveTargets(request) {
    const resolved = resolvePythonRoute(pythonRequest({ ...request, from: {} }));
    if (!resolved.ok) return { ok: false, error: resolved.error };
    return { ok: true, targets: resolved.targets, routeId: resolved.route.id, timeoutMinutes: resolved.route.timeoutMinutes };
  },

  preview(request, repoPath) {
    let detected: Record<string, unknown> | null = null;
    let scanError: string | null = null;
    let scan: PythonScanResult | null = null;
    if (repoPath) {
      try {
        scan = scanPythonProject(repoPath);
        detected = {
          python: scan.pythonVersion,
          pythonSource: scan.pythonSource,
          django: scan.djangoVersion,
          flask: scan.flaskVersion,
          framework: scan.framework,
          packageManager: scan.packageManager,
          testRunner: scan.testRunner,
          buildTool: "pip",
          removedApis: scan.hits.filter((hit) => hit.removedIn !== null).length,
        };
      } catch (error) {
        scanError = (error as Error).message;
      }
    }
    const resolved = resolvePythonRoute({ ...pythonRequest(request), fromPython: request.from.python || scan?.pythonVersion || undefined });
    if (!resolved.ok) return { ok: false, ecosystem: "python", error: resolved.error, detected, scanError };
    return {
      ok: true,
      ecosystem: "python",
      routeId: resolved.route.id,
      description: resolved.route.description,
      targets: resolved.targets,
      targetLabel: targetLabel(resolved, scan),
      targetJava: "",
      targetBoot: "",
      parentHint: "",
      modernizerRules: `${resolved.route.id} (requirements, pyproject, version files, stdlib + Flask rules)`,
      recipePlan: resolved.codemods.map((codemod) => ({ when: codemod.when, artifact: codemod.package, recipe: `${codemod.package} ${codemod.tool === "pyupgrade" ? pyupgradeFlag(resolved.targets.python) : `--target-version ${resolved.route.frameworks.django}`}`, label: codemodLabel(codemod) })),
      packages: resolved.route.packages.map((rule) => `${rule.name}==${rule.version}`),
      frameworks: resolved.route.frameworks,
      notes: resolved.notes,
      detected,
      scanError,
    };
  },

  async preflight(ctx, targets) {
    const repo = ctx.state.repoPath;
    const target = targets.targets.python;
    const { found, tried } = await findInterpreter(target, { cwd: repo, env: ctx.env });
    const git = await runCommand("git", ["--version"], { cwd: repo, timeoutMs: 30_000 });
    const log = [`Looking for Python ${target}:`, ...tried.map((line) => `  ${line}`), git.command, git.output.trim()].join("\n");
    ctx.state.steps.preflight.logTail = log.slice(-16_000);
    if (!found) {
      throw new StepFailed(
        `Python ${target} was not found. Install Python ${target} (Windows: the python.org installer adds the "py" launcher, check with: py -${target} --version; macOS/Linux: python${target} --version), or set VERDIGRADE_PYTHON to its interpreter. Tried: ${tried.join("; ")}.`,
      );
    }
    if (found.line !== target) ctx.state.warnings.push(`Python ${target} was not found; using Python ${found.version} (${found.via}), which is newer than the target.`);
    if (!git.ok) throw new StepFailed("git is required for the safety net (per-step commits, diff and rollback). Install git.");
    const scan = scanPythonProject(repo);
    if (scan.installSource === "none") throw new StepFailed("No dependency list pip can install (requirements*.txt, pyproject [project] or setup.py). Export one and retry.");
    if (scan.lockfile) ctx.state.warnings.push(`${scan.lockfile} (${scan.packageManager}) is not updated by the run; re-lock after merging.`);
    const matrix = loadPythonMatrix();
    ctx.event("preflight", `Preparing the rewrite tools (${matrix.tools.pyupgrade}, ${matrix.tools.djangoUpgrade}) in a cached venv`);
    const tools = await ensureToolsVenv(found, [matrix.tools.pyupgrade, matrix.tools.djangoUpgrade], { cwd: repo, ...ctx.exec("preflight"), env: pythonEnv(ctx.env, path.join(ctx.state.artifactsDir, "pycache")) });
    if (!tools.ok) throw new StepFailed(`Could not install the Python rewrite tools into ${tools.dir}: ${tools.log.trim().split(/\r?\n/).slice(-3).join(" ")}`);
    runTools.set(ctx.state.runId, { interpreter: found, tools: tools.python });
    ctx.state.buildTool = "pip";
    return { buildTool: "pip", wrapper: false, command: found.via, log: `${log}\n${tools.log}`, summary: `Python ${found.version} (${found.via}), pip, rewrite tools ready` };
  },

  async scan(ctx, targets) {
    const { state, work } = ctx;
    ctx.begin("scan", "Reading requirements, pyproject, version files and .py sources");
    const scan = scanPythonProject(work);
    state.scan = scan;
    const fromPython = state.request.from?.python || scan.pythonVersion || null;
    state.from = { java: null, boot: null, source: state.request.from?.python ? "user" : scan.pythonVersion ? "detected" : "unknown" };
    for (const note of scan.notes) state.warnings.push(note);
    const resolved = resolvePythonRoute({ python: targets.targets.python, fromPython: fromPython ?? undefined });
    if (!resolved.ok) throw new StepFailed(resolved.error);
    state.route = {
      id: resolved.route.id,
      description: resolved.route.description,
      targetJava: "",
      targetBoot: "",
      parentHint: "",
      targets: resolved.targets,
      targetLabel: targetLabel(resolved, scan),
      rulePacks: [`${resolved.route.id}:requirements`, "python-version-files", "stdlib-removals", ...(scan.flask ? ["flask-3"] : [])],
      recipePlan: resolved.codemods.map((codemod) => ({ when: codemod.when, artifact: codemod.package, recipe: codemod.tool, label: codemodLabel(codemod) })),
      notes: resolved.notes,
    };
    state.versions = pythonVersions(state);
    state.steps.scan.exitCode = 0;
    const removed = scan.hits.filter((hit) => hit.removedIn !== null && hitApplies(hit, frameworkTargets(resolved))).length;
    ctx.end(
      "scan",
      "passed",
      `Python ${scan.pythonVersion ?? "unknown"} (${scan.pythonSource ?? "not declared"}), ${scan.framework ? `${scan.framework} ${scan.framework === "django" ? scan.djangoVersion ?? "" : scan.flaskVersion ?? ""}`.trim() : "no web framework"}, ` +
        `${removed} removed API use(s), tests: ${scan.testRunner ?? "none"}`,
    );
  },

  async rewrite(ctx) {
    const { state, work } = ctx;
    const scan = scanOf(state);
    const resolved = resolveFor(state);
    const { tools } = toolsOf(state);
    ctx.begin("rewrite", `${resolved.codemods.length} rewrite tool(s) in the plan`);
    const code = pythonFilesOf(work).code;
    const unlocked = ctx.locks.patterns.length ? code.filter((file) => !ctx.locks.isLocked(file)) : code;
    if (unlocked.length < code.length) ctx.event("rewrite", `${code.length - unlocked.length} locked .py file(s) are left out of the rewrite tools`);
    for (const codemod of resolved.codemods) {
      const decision = codemodApplies(codemod, scan, resolved);
      const step = { when: codemod.when, artifact: codemod.package, recipe: codemod.package, label: codemodLabel(codemod) };
      if (!decision.run) {
        state.recipes.push({ ...step, ran: false, reason: decision.reason, ok: true, exitCode: null, durationMs: 0, changedFiles: [], commit: null });
        ctx.event("rewrite", `Skipped ${codemod.package}: ${decision.reason}`);
        continue;
      }
      const args = codemodArgs(codemod, resolved);
      ctx.event("rewrite", `Running ${codemodLabel(codemod)} ${args.slice(2).join(" ")} on ${unlocked.length} file(s) (${decision.reason})`);
      const run = await runOverFiles(tools, args, unlocked, { cwd: work, ...ctx.exec("rewrite"), env: envFor(ctx) });
      state.steps.rewrite.command = run.command;
      state.steps.rewrite.exitCode = run.exitCode;
      const made = run.ok ? await ctx.commit("rewrite", `${codemodLabel(codemod)} ${args.slice(2, -1).join(" ")}`) : null;
      state.recipes.push({ ...step, ran: true, reason: decision.reason, ok: run.ok, exitCode: run.exitCode, durationMs: run.durationMs, changedFiles: made?.files ?? [], commit: made?.sha ?? null });
      ctx.emit();
      if (!run.ok) throw new StepFailed(`${codemodLabel(codemod)} failed (${run.failure ?? `exit ${run.exitCode}`}): ${firstPythonFailure(run.output) || run.output.trim().split(/\r?\n/).slice(-3).join(" ")}`);
    }
    const ran = state.recipes.filter((item) => item.ran).length;
    ctx.end("rewrite", "passed", `${ran} tool(s) applied, ${state.steps.rewrite.changedFiles.length} file(s) changed`);
  },

  async modernize(ctx) {
    const { state, work } = ctx;
    const scan = scanOf(state);
    const resolved = resolveFor(state);
    ctx.begin("modernize", "Dependency pins, requires-python, version files, removed stdlib and Flask APIs");
    state.ruleEdits = applyPythonRules(work, {
      route: resolved.route,
      latestPatch: resolved.latestPatch,
      flaskDeclared: Boolean(scan.flask),
      write: true,
      isLocked: ctx.locks.patterns.length ? ctx.locks.isLocked : undefined,
    });
    ctx.emit();
    state.scanAfter = scanPythonProject(work);
    ctx.event("modernize", `Creating a Python ${resolved.targets.python} venv and installing the new versions (pip install)`);
    const venv = await projectVenv(ctx, "modernize");
    state.steps.modernize.command = venv.install?.command ?? null;
    state.steps.modernize.exitCode = venv.install?.exitCode ?? null;
    const installed = Boolean(venv.install?.ok);
    if (!installed) {
      state.warnings.push(`pip install failed after the rules (${venv.error ?? `exit ${venv.install?.exitCode ?? venv.install?.failure}`}); the test step retries it and the model may fix it.`);
      ctx.event("modernize", "pip install failed; the test step will retry it", "warning");
    }
    await ctx.commit("modernize", `rules ${resolved.route.id}`);
    const applied = state.ruleEdits.filter((edit) => edit.applied).length;
    ctx.end("modernize", "passed", `${applied} edit(s)${installed ? ", dependencies installed" : ", pip install failed"}`);
  },

  testSummary(state) {
    const scan = isPythonScan(state.scan) ? state.scan : null;
    return `pip install into a fresh venv, then ${scan?.testRunner === "django" ? "manage.py test" : scan?.testRunner === "unittest" ? "python -m unittest" : "pytest"}`;
  },

  async runTests(ctx) {
    ctx.state.scanAfter = scanPythonProject(ctx.work);
    const scan = ctx.state.scanAfter as PythonScanResult;
    const venv = await projectVenv(ctx, "test");
    if (venv.error) return { ok: false, exitCode: null, failure: null, command: "python -m venv", firstFailure: venv.error, outputTail: venv.error, tests: null };
    if (!venv.install?.ok) {
      const run = toTestRun(venv.install!);
      return { ...run, ok: false, firstFailure: firstPythonFailure(venv.install!.output) || run.firstFailure, tests: null };
    }
    const command = testCommand(scan);
    if (!command) return { ok: false, exitCode: null, failure: null, command: "pytest", firstFailure: "No tests were found (test_*.py / tests/).", outputTail: "", tests: null };
    const test = await runCommand(venv.python, command.args, { cwd: ctx.work, ...ctx.exec("test"), env: envFor(ctx) });
    return toTestRun(test, `$ pip install ${installArgs(scan).join(" ")}: ok\n`);
  },

  packageSummary() {
    return "python -m compileall (byte-compile every module), wheel when [build-system] is declared";
  },

  async runPackage(ctx) {
    const python = runVenvFor(ctx.work) ?? venvPython(path.join(ctx.state.artifactsDir, "venv"));
    const compile = await runCommand(python, ["-m", "compileall", "-q", "-x", compileExclude(), "."], { cwd: ctx.work, ...ctx.exec("package"), env: envFor(ctx) });
    const count = pythonFilesOf(ctx.work).code.length;
    if (!compile.ok || !/^\s*\[build-system\]/m.test(readText(ctx.work, "pyproject.toml"))) {
      return { ok: compile.ok, exitCode: compile.exitCode, failure: compile.failure, command: compile.command, artifacts: [], summary: `compileall: ${count} module(s) compiled` };
    }
    const out = path.join(ctx.state.artifactsDir, "dist");
    mkdirSync(out, { recursive: true });
    const wheel = await runCommand(python, ["-m", "pip", "wheel", "--no-deps", "--wheel-dir", out, "."], { cwd: ctx.work, ...ctx.exec("package"), env: envFor(ctx) });
    return { ok: wheel.ok, exitCode: wheel.exitCode, failure: wheel.failure, command: `${compile.command} && ${wheel.command}`, artifacts: wheel.ok ? [out] : [], summary: `compileall: ${count} module(s); wheel in ${out}` };
  },

  async checks(ctx) {
    const { state } = ctx;
    const before = scanOf(state);
    const resolved = resolveFor(state);
    const targets = frameworkTargets(resolved);
    const after = scanPythonProject(state.workPath);
    state.scanAfter = after;
    state.after = { java: null, boot: null };
    const checks: CheckResult[] = [];
    const target = resolved.targets.python;
    const metadata = after.versionSources.filter((item) => item.kind === "metadata");
    const files = after.versionSources.filter((item) => item.kind === "version-file");
    if (metadata.length) {
      const low = metadata.filter((item) => compareVersions(item.version, target) < 0);
      checks.push({
        id: "python-declared",
        ok: low.length === 0,
        level: "error",
        message: low.length ? `Python is still declared below ${target}: ${low.map((item) => `${item.file} ${item.value}`).join(", ")}.` : `Packaging metadata declares Python ${metadata.map((item) => item.value).join(", ")} (target ${target}).`,
      });
    } else {
      checks.push({ id: "python-declared", ok: false, level: "warning", message: `No requires-python / python_requires declared (target ${target}).` });
    }
    const lowFiles = files.filter((item) => compareVersions(item.version, target) < 0);
    if (files.length) {
      checks.push({ id: "python-version-files", ok: lowFiles.length === 0, level: "warning", message: lowFiles.length ? `${lowFiles.map((item) => `${item.file} (${item.value})`).join(", ")} still name an older Python.` : `${files.map((item) => item.file).join(", ")} name Python ${target}.` });
    }
    for (const [name, line, targetLine] of [
      ["Django", after.djangoVersion, targets.django],
      ["Flask", after.flaskVersion, targets.flask],
    ] as const) {
      const had = name === "Django" ? before.django : before.flask;
      if (!had || had === "(unpinned)") continue;
      checks.push({
        id: `${name.toLowerCase()}-version`,
        ok: line !== null && compareVersions(line, targetLine) >= 0,
        level: "error",
        message: `${name} is ${(name === "Django" ? after.djangoVersion ?? after.django : after.flaskVersion ?? after.flask) ?? "missing"} (target ${targetLine}).`,
      });
    }
    const lagging = after.requirements.filter((item) => resolved.route.packages.some((rule) => rule.name.toLowerCase() === item.key && item.version && compareVersions(item.version, rule.minimum) < 0));
    if (lagging.length) {
      checks.push({ id: "dependency-pins", ok: false, level: "warning", message: `${lagging.length} pin(s) are still below the route minimum: ${lagging.slice(0, 6).map((item) => `${item.file}:${item.line} ${item.name}${item.spec}`).join(", ")}.` });
    }
    const applies = after.hits.filter((hit) => hitApplies(hit, targets));
    const stdlib = applies.filter((hit) => (hit.kind === "removed-module" || hit.kind === "stdlib-api") && hit.removedIn !== null);
    checks.push({
      id: "python-removed-apis",
      ok: stdlib.length === 0,
      level: "error",
      message: stdlib.length ? `${stdlib.length} use(s) of standard-library APIs removed by Python ${target} remain (${stdlib.slice(0, 5).map((hit) => `${hit.file}:${hit.line} ${hit.api}`).join(", ")}).` : `No standard-library modules or APIs removed by Python ${target} are used.`,
    });
    const framework = applies.filter((hit) => (hit.kind === "flask-api" || hit.kind === "werkzeug-api" || hit.kind === "django-api") && hit.removedIn !== null);
    if (before.framework || framework.length) {
      checks.push({
        id: "framework-removed-apis",
        ok: framework.length === 0,
        level: "error",
        message: framework.length ? `${framework.length} removed framework API use(s) remain (${framework.slice(0, 5).map((hit) => `${hit.file}:${hit.line} ${hit.api}`).join(", ")}).` : "No removed Django / Flask / Werkzeug APIs remain.",
      });
    }
    const deprecated = applies.filter((hit) => hit.removedIn === null);
    if (deprecated.length) {
      checks.push({ id: "python-deprecated-apis", ok: false, level: "warning", message: `${deprecated.length} deprecated API use(s) remain (${deprecated.slice(0, 5).map((hit) => `${hit.file}:${hit.line} ${hit.api}`).join(", ")}).` });
    }
    state.versions = pythonVersions(state);
    const followUps: string[] = [];
    const older = new RegExp(`^FROM\\s+\\S*python:(${olderPythonPattern(target)})`, "im");
    for (const file of listRepoFiles(state.workPath).filter((item) => /(^|\/)(Dockerfile[^/]*|Containerfile)$/i.test(item))) {
      const match = older.exec(readText(state.workPath, file));
      if (match) followUps.push(`${file} uses a Python ${match[1]} base image; move it to python:${target}.`);
    }
    for (const file of listRepoFiles(state.workPath).filter((item) => item.startsWith(".github/workflows/"))) {
      const match = new RegExp(`python-version:\\s*\\[?\\s*['"]?(${olderPythonPattern(target)})`).exec(readText(state.workPath, file));
      if (match) followUps.push(`${file} tests with Python ${match[1]}; update it to ${target}.`);
    }
    if (after.lockfile) followUps.push(`${after.lockfile} still pins the old versions; re-lock with ${after.packageManager}.`);
    for (const edit of state.ruleEdits.filter((item) => !item.applied)) followUps.push(`${edit.file}: ${edit.detail}`);
    for (const hit of deprecated.slice(0, 10)) followUps.push(`${hit.file}:${hit.line} ${hit.api} is deprecated; use ${hit.replacement}.`);
    return { checks, followUps };
  },

  plan(input) {
    return pythonPlan(input);
  },

  fixupFacts(state) {
    const scan = isPythonScan(state.scan) ? state.scan : null;
    return [
      `Route ${state.route?.id}: ${state.route?.targetLabel}.`,
      `This is a Python project (${scan?.framework ?? "no web framework"}). Dependencies: ${scan?.requirementFiles.join(", ") || scan?.installSource || "unknown"}; tests run with ${scan?.testRunner ?? "pytest"} in a fresh venv. The pipeline already ran pyupgrade${scan?.django ? ", django-upgrade" : ""} and the rules (pins, requires-python, removed stdlib and Flask APIs).`,
      "Typical fixes: an import of a module removed in Python 3.12/3.13 (distutils, imp, cgi, telnetlib…), a Flask 2.3/3.0 removal (before_first_request, json_encoder, flask.Markup), a Werkzeug 3 helper (url_quote), or a pin that has no wheel for the new Python. Use the python-migration skill.",
    ];
  },
};

/** Cheap detection (no full scan): any root marker file. */
function scanPythonProjectDetect(repoPath: string): boolean {
  if (["pyproject.toml", "setup.py", "setup.cfg", "Pipfile", "manage.py"].some((name) => existsSync(path.join(repoPath, name)))) return true;
  try {
    return readdirSync(repoPath).some((name) => /^requirements[\w.-]*\.txt$/i.test(name));
  } catch {
    return false;
  }
}

export { normalizePython };

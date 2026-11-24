import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createWorkCopy, removeWorkCopy } from "../git.js";
import { ConfigError } from "../matrixBase.js";
import { runCommand, type CommandResult } from "../process.js";
import type { CheckResult, RunState, VersionFact } from "../types.js";
import { isNodeScan } from "../types.js";
import { commonFindings, finding, firstLine, listRepoFiles, readText, ruleSnippets, testsFinding } from "./findings.js";
import { loadNodeMatrix, nodeMatrixView, normalizeNode, normalizeTs, resetNodeMatrixCache, resolveNodeRoute, type CodemodRef, type NodeResolveOk } from "./nodeMatrix.js";
import { applyNodeRules } from "./nodeRules.js";
import { firstNodeFailure, parseNodeTestTotals, rangeMajor, readPackageJson, scanNodeProject, type NodeScanResult } from "./nodeScan.js";
import { StepFailed, type AdapterPlan, type LanguageAdapter, type PlanFinding, type PlanInput, type Snippet, type StepContext, type TargetRequest } from "./types.js";

const windows = process.platform === "win32";
export const npmCommand = windows ? "npm.cmd" : "npm";
export const npxCommand = windows ? "npx.cmd" : "npx";

function scanOf(state: RunState): NodeScanResult {
  if (!isNodeScan(state.scan)) throw new StepFailed("The Node scan is missing.");
  return state.scan;
}

function resolveFor(state: RunState): NodeResolveOk {
  const resolved = resolveNodeRoute({ node: state.route?.targets?.node, typescript: state.route?.targets?.typescript });
  if (!resolved.ok) throw new StepFailed(resolved.error);
  return resolved;
}

function codemodApplies(codemod: CodemodRef, scan: NodeScanResult): { run: boolean; reason: string } {
  if (codemod.when === "always") return { run: true, reason: "always" };
  if (scan.expressMajor === null) return { run: false, reason: "Express is not a dependency" };
  return scan.expressMajor < 5 ? { run: true, reason: `Express ${scan.express} < 5` } : { run: false, reason: `Express ${scan.express} is already 5+` };
}

function codemodArgs(codemod: CodemodRef): string[] {
  const cli = loadNodeMatrix().tools.codemodCli;
  return ["--yes", cli, "run", codemod.package, "--target", ".", "--no-interactive", "--allow-dirty", "--disable-analytics"];
}

function codemodLabel(codemod: CodemodRef): string {
  return codemod.package.replace(/@\d+\.\d+\.\d+$/, "");
}

function nodeVersions(state: RunState): VersionFact[] {
  const before = isNodeScan(state.scan) ? state.scan : null;
  const after = isNodeScan(state.scanAfter) ? state.scanAfter : null;
  const targets = state.route?.targets ?? state.request.targets ?? {};
  const facts: VersionFact[] = [
    { key: "node", label: "Node", before: before?.nodeVersion ?? null, after: after?.nodeVersion ?? null, target: targets.node ?? null },
  ];
  if (before?.typescript || after?.typescript) {
    facts.push({ key: "typescript", label: "TypeScript", before: before?.typescriptVersion ?? null, after: after?.typescriptVersion ?? null, target: targets.typescript ?? null });
  }
  if (before?.express || after?.express) {
    facts.push({
      key: "express",
      label: "Express",
      before: before?.expressMajor != null ? String(before.expressMajor) : null,
      after: after?.expressMajor != null ? String(after.expressMajor) : null,
      target: before?.expressMajor != null && before.expressMajor < 5 ? "5" : null,
    });
  }
  return facts;
}

function toTestRun(result: CommandResult, prefixOutput = "") {
  const output = `${prefixOutput}${result.output}`;
  const totals = parseNodeTestTotals(output);
  return {
    ok: result.ok,
    exitCode: result.exitCode,
    failure: result.failure,
    command: result.command,
    firstFailure: result.ok ? "" : firstNodeFailure(output) || output.trim().split(/\r?\n/).slice(-8).join("\n"),
    outputTail: output,
    tests: totals ? { ...totals, testSets: [] as string[] } : null,
  };
}

async function npmInstall(ctx: StepContext, step: "modernize" | "test", hadLockfile: boolean): Promise<CommandResult> {
  const args = ["install", "--no-audit", "--no-fund", ...(hadLockfile ? [] : ["--no-package-lock"])];
  return runCommand(npmCommand, args, { cwd: ctx.work, ...ctx.exec(step) });
}

function targetLabel(targets: { node: string; typescript: string }): string {
  return `Node ${targets.node} · TypeScript ${targets.typescript}`;
}

function nodeRequest(request: TargetRequest) {
  return { node: request.targets.node, typescript: request.targets.typescript, fromNode: request.from.node };
}

function fileHashes(root: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of listRepoFiles(root)) {
    try {
      out.set(file, createHash("sha1").update(readFileSync(path.join(root, file))).digest("hex"));
    } catch {
      /* unreadable */
    }
  }
  return out;
}

/** Exact before → after for the Express 5 APIs whose codemod output is fixed; others show the line only. */
function expressSnippet(hit: { file: string; line: number; api: string; text: string; replacement: string }): Snippet[] {
  let after: string | null = null;
  if (hit.api === "res.send(status)") after = hit.text.replace(/\bres\.send\s*\(\s*(\d{3})\s*\)/g, "res.sendStatus($1)");
  else if (hit.api === "res.redirect('back')") after = hit.text.replace(/\bres\.redirect\s*\(\s*['"]back['"]\s*\)/, "res.redirect(req.get(\"Referrer\") || \"/\")");
  else if (hit.api === "app.del()") after = hit.text.replace(/\b(app|router)\.del\s*\(/, "$1.delete(");
  else if (hit.api === "res.sendfile()") after = hit.text.replace(/\bres\.sendfile\s*\(/, "res.sendFile(");
  if (after === hit.text) after = null;
  return [{ file: hit.file, line: hit.line, before: hit.text, after, note: after ? undefined : `The codemod rewrites this to ${hit.replacement}.` }];
}

const nativePackages = /^(node-sass|bcrypt|sqlite3|better-sqlite3|canvas|sharp|node-gyp|grpc|fibers|deasync|ffi-napi|ref-napi|leveldown|zeromq|serialport|re2|argon2)$/;

/** Deterministic plan for a Node project. Read-only: the codemod preview runs on a temporary copy. */
async function nodePlan(input: PlanInput): Promise<AdapterPlan> {
  const { repoPath, request } = input;
  const scan = scanNodeProject(repoPath);
  const resolved = resolveNodeRoute({ ...nodeRequest(request), fromNode: request.from.node || scan.nodeVersion || undefined });
  if (!resolved.ok) throw new StepFailed(resolved.error);
  const pkg = readPackageJson(repoPath) ?? {};
  const findings: PlanFinding[] = [];
  const notes: string[] = [];
  const files = listRepoFiles(repoPath);

  // ---- (a) automatic ---------------------------------------------------------
  input.onStage?.("dependencies");
  for (const codemod of resolved.codemods) {
    const decision = codemodApplies(codemod, scan);
    if (!decision.run) {
      notes.push(`${codemodLabel(codemod)} will be skipped: ${decision.reason}.`);
      continue;
    }
    let touched = [...new Set(scan.expressDeprecated.map((hit) => hit.file)), "package.json"];
    let exact = false;
    if (input.preview) {
      const copy = createWorkCopy(repoPath, ["dist", "coverage"]);
      try {
        const before = fileHashes(copy);
        const run = await runCommand(npxCommand, codemodArgs(codemod), { cwd: copy, timeoutMs: 15 * 60_000, signal: input.signal, env: input.env });
        if (run.ok) {
          const after = fileHashes(copy);
          touched = [...new Set([...before.keys(), ...after.keys()])].filter((file) => before.get(file) !== after.get(file)).sort();
          exact = true;
        } else {
          notes.push(`Codemod preview failed (exit ${run.exitCode ?? run.failure}); the file list is an estimate.`);
        }
      } finally {
        removeWorkCopy(copy);
      }
    }
    findings.push(
      finding({
        group: "auto",
        kind: "codemod.express5",
        params: { name: codemodLabel(codemod), count: String(touched.length) },
        category: "codemod",
        severity: "info",
        title: `Codemod ${codemodLabel(codemod)}`,
        file: touched[0] ?? null,
        line: null,
        files: touched,
        why: `${codemod.description} Runs because ${decision.reason}. ${exact ? "Files come from a preview run on a temporary copy." : "Files are an estimate from the scanner; turn on preview for the exact list."}`,
        suggestion: "Approve to run it. A locked file that the codemod changes is restored right after the step.",
        defaultDecision: "approve",
      }),
    );
    for (const hit of scan.expressDeprecated) {
      findings.push(
        finding({
          group: "auto",
          kind: "express-api.codemod",
          params: { api: hit.api, replacement: hit.replacement },
          snippets: expressSnippet(hit),
          category: "express-api",
          severity: "low",
          title: `${hit.api} → ${hit.replacement}`,
          file: hit.file,
          line: hit.line,
          why: "Removed in Express 5; the codemod rewrites it.",
          suggestion: "Approve, or lock the file and port it by hand.",
          evidence: hit.text,
          defaultDecision: "approve",
        }),
      );
    }
  }
  const edits = applyNodeRules(repoPath, { route: resolved.route, tsconfig: resolved.tsconfig, write: false });
  const byFile = new Map<string, string[]>();
  for (const edit of edits) {
    if (/^left |by hand|could not/.test(edit.detail)) {
      findings.push(
        finding({
          group: "review",
          kind: edit.rule === "tsconfig" ? "tsconfig.manual" : "dependency.manual",
          params: { detail: edit.detail },
          category: edit.rule === "tsconfig" ? "tsconfig" : "dependency",
          severity: "medium",
          title: edit.rule === "tsconfig" ? "tsconfig change the rules cannot make" : "Dependency the rules leave alone",
          file: edit.file,
          line: null,
          why: edit.detail,
          suggestion: "Make this change by hand before or after the run.",
          defaultDecision: "approve",
        }),
      );
      continue;
    }
    byFile.set(edit.file, [...(byFile.get(edit.file) ?? []), edit.detail]);
  }
  for (const [file, details] of byFile) {
    const text = readText(repoPath, file);
    const key = /^(?:\w+\.)?([@\w/.-]+):/.exec(details[0])?.[1] ?? null;
    const hit = key ? firstLine(text, new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}"`)) : null;
    findings.push(
      finding({
        group: "auto",
        kind: file === "package.json" ? "rules.package-json" : /tsconfig[\w.-]*\.json$/.test(file) ? "rules.tsconfig" : file === ".nvmrc" || file === ".node-version" ? "rules.nvmrc" : "rules.other",
        params: { count: String(details.length), fileName: file, details: details.join("; "), node: resolved.targets.node, typescript: resolved.targets.typescript },
        snippets: ruleSnippets(text, file, details),
        category: "rules",
        severity: "info",
        title: `${details.length} edit${details.length === 1 ? "" : "s"} in ${file}`,
        file,
        line: hit?.line ?? null,
        files: [file],
        why: details.join("; "),
        suggestion: "Approve to apply. Lock the file to keep it (the edits are skipped and listed as manual follow-up).",
        evidence: hit?.text,
        defaultDecision: "approve",
      }),
    );
  }
  findings.push(
    finding({
      group: "auto",
      kind: "install",
      params: { lockfile: scan.lockfile ?? "" },
      category: "install",
      severity: "info",
      title: scan.lockfile ? `npm install refreshes ${scan.lockfile}` : "npm install (no lockfile is created)",
      file: scan.lockfile,
      line: null,
      files: scan.lockfile ? [scan.lockfile] : [],
      why: "Dependencies are installed with the new versions so the tests run against them.",
      suggestion: scan.lockfile ? "Approve. Review the lockfile diff for unexpected major bumps." : "Nothing to review.",
      defaultDecision: "approve",
    }),
  );

  // ---- (b) review ------------------------------------------------------------
  input.onStage?.("risky-code");
  for (const hit of scan.nodeDeprecated) {
    const removed = hit.removedIn !== null && hit.removedIn !== undefined && Number(resolved.targets.node) >= hit.removedIn;
    findings.push(
      finding({
        group: "review",
        kind: removed ? "node-api.removed" : "node-api.deprecated",
        params: { api: hit.api, replacement: hit.replacement, removedIn: String(hit.removedIn ?? ""), node: resolved.targets.node },
        snippets: [{ file: hit.file, line: hit.line, before: hit.text, after: null, note: `Replace with ${hit.replacement} (by hand, or by the AI fix-up if a test fails).` }],
        category: removed ? "removed-api" : "deprecated-api",
        severity: removed ? "high" : "medium",
        title: removed ? `${hit.api} was removed in Node ${hit.removedIn}` : `${hit.api} is deprecated`,
        file: hit.file,
        line: hit.line,
        why: removed
          ? `This call throws on Node ${resolved.targets.node}; no codemod rewrites it.`
          : "Deprecated Node API; it still works but prints a warning or may be removed later. No codemod rewrites it.",
        suggestion: `Use ${hit.replacement}.`,
        evidence: hit.text,
        defaultDecision: "approve",
        fix: { summary: `Replace ${hit.api} with ${hit.replacement} in ${hit.file} line ${hit.line}.`, before: hit.text, after: simpleNodeRewrite(hit.text) ?? undefined },
      }),
    );
  }
  const code = files.filter((file) => /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(file) && !file.endsWith(".d.ts"));
  if (scan.framework === "express" && (scan.expressMajor ?? 5) < 5) {
    for (const file of code) {
      const text = readText(repoPath, file);
      const wildcard = firstLine(text, /\.(get|post|put|patch|delete|all|use|route)\s*\(\s*['"`][^'"`]*(\*|\?|\(|\))[^'"`]*['"`]/);
      if (wildcard) {
        findings.push(
          finding({
            group: "review",
            kind: "express-routing",
            category: "express-routing",
            severity: "high",
            title: "Route path syntax changed in Express 5",
            file,
            line: wildcard.line,
            why: "Express 5 uses path-to-regexp 8: a bare * must be named (/*splat), optional segments use braces ({/:id}) and regex groups are gone. The codemod does not rewrite paths.",
            suggestion: "Rewrite the path in the Express 5 syntax and add a test that hits it.",
            evidence: wildcard.text,
            defaultDecision: "approve",
          }),
        );
      }
      const query = firstLine(text, /\breq\.query\s*=[^=]/);
      if (query) {
        findings.push(
          finding({
            group: "review",
            kind: "express-api.req-query",
            category: "express-api",
            severity: "high",
            title: "req.query is read-only in Express 5",
            file,
            line: query.line,
            why: "req.query is now a getter; assigning to it throws or is ignored.",
            suggestion: "Store the parsed value elsewhere (res.locals or a new variable).",
            evidence: query.text,
            defaultDecision: "approve",
          }),
        );
      }
    }
  }
  const pkgText = readText(repoPath, "package.json");
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}), ...(pkg.optionalDependencies ?? {}) };
  for (const [name, range] of Object.entries(deps)) {
    const line = firstLine(pkgText, new RegExp(`"${name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}"\\s*:`));
    if (nativePackages.test(name)) {
      findings.push(
        finding({
          group: "manual",
          kind: name === "node-sass" ? "native-addon.node-sass" : "native-addon",
          params: { name, range: String(range), node: resolved.targets.node },
          category: "native-addon",
          severity: name === "node-sass" ? "high" : "medium",
          title: name === "node-sass" ? "node-sass (deprecated native addon)" : `Native addon ${name}`,
          file: "package.json",
          line: line?.line ?? null,
          why:
            name === "node-sass"
              ? "node-sass is deprecated and has no builds for current Node versions."
              : `Native addons are compiled for one Node ABI; ${name}@${range} needs a release with prebuilt binaries (or a working toolchain) for Node ${resolved.targets.node}.`,
          suggestion: name === "node-sass" ? "Replace it with the sass package." : `Check ${name} supports Node ${resolved.targets.node} and bump it by hand if needed.`,
          evidence: line?.text,
          defaultDecision: "manual",
        }),
      );
    } else if (name === "request" || name === "request-promise") {
      findings.push(
        finding({
          group: "review",
          kind: "dependency.request",
          params: { name },
          category: "dependency",
          severity: "medium",
          title: `${name} is deprecated`,
          file: "package.json",
          line: line?.line ?? null,
          why: "The request package has been deprecated since 2020 and gets no fixes.",
          suggestion: "Move to the built-in fetch (Node 18+) or undici.",
          evidence: line?.text,
          defaultDecision: "approve",
        }),
      );
    } else if (name === "ts-node" && resolved.targets.typescript.startsWith("6")) {
      findings.push(
        finding({
          group: "review",
          kind: "dependency.ts-node",
          params: { typescript: resolved.targets.typescript },
          category: "dependency",
          severity: "medium",
          title: "ts-node with TypeScript 6",
          file: "package.json",
          line: line?.line ?? null,
          why: "ts-node 10.9 is the last release and predates TypeScript 6's new defaults; scripts that run through it may break.",
          suggestion: "Try the scripts after the run; consider tsx or Node's built-in type stripping.",
          evidence: line?.text,
          defaultDecision: "approve",
        }),
      );
    } else if (name === "ts-jest" && (rangeMajor(range) ?? 0) < 29) {
      findings.push(
        finding({
          group: "review",
          kind: "dependency.ts-jest",
          params: { range: String(range), typescript: resolved.targets.typescript },
          category: "dependency",
          severity: "high",
          title: `ts-jest ${range} may not accept TypeScript ${resolved.targets.typescript}`,
          file: "package.json",
          line: line?.line ?? null,
          why: "Old ts-jest majors declare a TypeScript peer range below the target, so npm install fails with ERESOLVE.",
          suggestion: "Upgrade ts-jest (and jest) to a release whose peer range includes the target TypeScript.",
          evidence: line?.text,
          defaultDecision: "approve",
        }),
      );
    }
  }
  if (scan.tsconfig?.extends) {
    findings.push(
      finding({
        group: "review",
        kind: "tsconfig.extends",
        params: { base: String(scan.tsconfig.extends), typescript: resolved.targets.typescript },
        category: "tsconfig",
        severity: "medium",
        title: `tsconfig.json extends ${scan.tsconfig.extends}`,
        file: "tsconfig.json",
        line: firstLine(readText(repoPath, "tsconfig.json"), /"extends"/)?.line ?? null,
        why: "Inherited options (moduleResolution, baseUrl, types) are not rewritten; deprecated values there still break TypeScript 6.",
        suggestion: "Check the base config, or override the options in tsconfig.json.",
        defaultDecision: "approve",
      }),
    );
  }
  if (!scan.scripts.test) {
    findings.push(
      finding({
        group: "review",
        kind: "tests.no-script",
        category: "tests",
        severity: "high",
        title: "No npm test script",
        file: "package.json",
        line: firstLine(pkgText, /"scripts"\s*:/)?.line ?? null,
        why: "The pipeline runs npm test to decide pass or fail. Without it the run cannot prove behaviour.",
        suggestion: "Add a test script (node --test, vitest or jest) before migrating.",
        defaultDecision: "approve",
      }),
    );
  } else {
    const tests = testsFinding({ tests: scan.testFiles, sources: scan.sourceFiles, testHint: "an HTTP test with node:test and fetch" });
    if (tests) findings.push(tests);
  }
  if (scan.packageManager !== "npm") {
    findings.push(
      finding({
        group: "review",
        kind: "package-manager",
        params: { manager: scan.packageManager, lockfile: scan.lockfile ?? "" },
        category: "package-manager",
        severity: "high",
        title: `${scan.packageManager} project`,
        file: scan.lockfile,
        line: null,
        why: `The Node adapter installs and tests with npm; ${scan.lockfile} would not be updated and preflight refuses the run.`,
        suggestion: "Use npm for this migration, or update with your package manager by hand.",
        defaultDecision: "approve",
      }),
    );
  }

  // ---- (c) manual --------------------------------------------------------------
  findings.push(
    ...commonFindings(repoPath, files, {
      runtimeLabel: "Node",
      targetRuntime: resolved.targets.node,
      ciVersionKey: /node-version:\s*['"]?(1[0-9]|2[0-3]|[4-9])(\.x)?\b|image:\s*node:(1[0-9]|2[0-3])\b/i,
      dockerImage: /^FROM\s+\S*node:(1[0-9]|2[0-3]|[4-9])\b/i,
    }),
  );

  return {
    routeId: resolved.route.id,
    description: resolved.route.description,
    targets: resolved.targets,
    targetLabel: targetLabel(resolved.targets),
    detected: {
      node: scan.nodeVersion,
      nodeSource: scan.nodeSource,
      typescript: scan.typescriptVersion,
      express: scan.express,
      packageManager: scan.packageManager,
      lockfile: scan.lockfile,
      buildTool: "npm",
    },
    findings,
    stats: {
      filesScanned: files.length,
      sourceFiles: scan.sourceFiles,
      testFiles: scan.testFiles,
      expressDeprecated: scan.expressDeprecated.length,
      nodeDeprecated: scan.nodeDeprecated.length,
    },
    notes: [...notes, ...resolved.notes, ...scan.notes],
  };
}

export const nodeAdapter: LanguageAdapter = {
  id: "node",
  label: "Node.js / TypeScript",
  stepLabels: { rewrite: "Codemods" },
  ignorePatterns: ["dist/", "coverage/", ".nyc_output/", "*.tsbuildinfo"],
  workCopySkip: ["dist", "coverage", ".nyc_output"],

  detect(repoPath) {
    return existsSync(path.join(repoPath, "package.json"));
  },

  validateProfiles() {
    resetNodeMatrixCache();
    try {
      const matrix = loadNodeMatrix();
      return { ok: true, problems: [], routes: matrix.routes.length, packs: [] };
    } catch (error) {
      return { ok: false, problems: [(error as Error).message], routes: 0, packs: [] };
    }
  },

  matrixView() {
    return nodeMatrixView();
  },

  resolveTargets(request) {
    const resolved = resolveNodeRoute(nodeRequest({ ...request, from: {} }));
    if (!resolved.ok) return { ok: false, error: resolved.error };
    return { ok: true, targets: resolved.targets, routeId: resolved.route.id, timeoutMinutes: resolved.route.timeoutMinutes };
  },

  preview(request, repoPath) {
    let detected: Record<string, unknown> | null = null;
    let scanError: string | null = null;
    let scan: NodeScanResult | null = null;
    if (repoPath) {
      try {
        scan = scanNodeProject(repoPath);
        detected = {
          node: scan.nodeVersion,
          nodeSource: scan.nodeSource,
          typescript: scan.typescriptVersion,
          express: scan.express,
          packageManager: scan.packageManager,
          buildTool: "npm",
          expressDeprecated: scan.expressDeprecated.length,
          nodeDeprecated: scan.nodeDeprecated.length,
        };
      } catch (error) {
        scanError = (error as Error).message;
      }
    }
    const resolved = resolveNodeRoute({ ...nodeRequest(request), fromNode: request.from.node || scan?.nodeVersion || undefined });
    if (!resolved.ok) return { ok: false, ecosystem: "node", error: resolved.error, detected, scanError };
    return {
      ok: true,
      ecosystem: "node",
      routeId: resolved.route.id,
      description: resolved.route.description,
      targets: resolved.targets,
      targetLabel: targetLabel(resolved.targets),
      targetJava: "",
      targetBoot: "",
      parentHint: "",
      modernizerRules: `${resolved.route.id} (package.json, tsconfig ${resolved.route.tsconfigProfile})`,
      recipePlan: resolved.codemods.map((codemod) => ({ when: codemod.when, artifact: loadNodeMatrix().tools.codemodCli, recipe: codemod.package, label: codemodLabel(codemod) })),
      packages: resolved.route.packages.map((rule) => `${rule.name}@${rule.version}`),
      notes: resolved.notes,
      detected,
      scanError,
    };
  },

  async preflight(ctx, targets) {
    const repo = ctx.state.repoPath;
    const node = await runCommand("node", ["--version"], { cwd: repo, timeoutMs: 60_000, env: ctx.env });
    const npm = await runCommand(npmCommand, ["--version"], { cwd: repo, timeoutMs: 120_000, env: ctx.env });
    const git = await runCommand("git", ["--version"], { cwd: repo, timeoutMs: 30_000 });
    const log = [node.command, node.output.trim(), npm.command, npm.output.trim(), git.command, git.output.trim()].join("\n");
    ctx.state.steps.preflight.logTail = log.slice(-16_000);
    if (!node.ok) throw new StepFailed("Node.js was not found on PATH. Install Node.js and retry.");
    const major = Number(normalizeNode(node.output.trim()));
    if (!Number.isFinite(major) || major < Number(targets.targets.node)) {
      throw new StepFailed(`Node ${node.output.trim()} is active but the route targets Node ${targets.targets.node}. Install Node ${targets.targets.node}+ (or pick a lower target).`);
    }
    if (!npm.ok) throw new StepFailed(`npm could not run (${npm.command}).`);
    if (!git.ok) throw new StepFailed("git is required for the safety net (per-step commits, diff and rollback). Install git.");
    const manager = scanNodeProject(repo).packageManager;
    if (manager !== "npm") throw new StepFailed(`This is a ${manager} project. The Node adapter installs and tests with npm only for now.`);
    ctx.state.buildTool = "npm";
    return { buildTool: "npm", wrapper: false, command: npm.command, log, summary: `Node ${node.output.trim()}, npm ${npm.output.trim()}` };
  },

  async scan(ctx, targets) {
    const { state, work } = ctx;
    ctx.begin("scan", "Reading package.json, tsconfig and source files");
    const scan = scanNodeProject(work);
    state.scan = scan;
    const fromNode = state.request.from?.node || scan.nodeVersion || null;
    state.from = { java: null, boot: null, source: state.request.from?.node ? "user" : scan.nodeVersion ? "detected" : "unknown" };
    for (const note of scan.notes) state.warnings.push(note);
    const resolved = resolveNodeRoute({ node: targets.targets.node, typescript: targets.targets.typescript, fromNode: fromNode ?? undefined });
    if (!resolved.ok) throw new StepFailed(resolved.error);
    state.route = {
      id: resolved.route.id,
      description: resolved.route.description,
      targetJava: "",
      targetBoot: "",
      parentHint: "",
      targets: resolved.targets,
      targetLabel: targetLabel(resolved.targets),
      rulePacks: [`${resolved.route.id}:package.json`, `tsconfig-${resolved.route.tsconfigProfile}`],
      recipePlan: resolved.codemods.map((codemod) => ({ when: codemod.when, artifact: loadNodeMatrix().tools.codemodCli, recipe: codemod.package, label: codemodLabel(codemod) })),
      notes: resolved.notes,
    };
    state.versions = nodeVersions(state);
    state.steps.scan.exitCode = 0;
    ctx.end(
      "scan",
      "passed",
      `Node ${scan.nodeVersion ?? "unknown"} (${scan.nodeSource ?? "not declared"}), TypeScript ${scan.typescriptVersion ?? "none"}, ` +
        `Express ${scan.express ?? "none"}, ${scan.expressDeprecated.length} Express 4 API use(s), ${scan.nodeDeprecated.length} deprecated Node API use(s)`,
    );
  },

  async rewrite(ctx) {
    const { state, work } = ctx;
    const scan = scanOf(state);
    const resolved = resolveFor(state);
    ctx.begin("rewrite", `${resolved.codemods.length} codemod(s) in the plan`);
    for (const codemod of resolved.codemods) {
      const decision = codemodApplies(codemod, scan);
      const step = { when: codemod.when, artifact: loadNodeMatrix().tools.codemodCli, recipe: codemod.package, label: codemodLabel(codemod) };
      if (!decision.run) {
        state.recipes.push({ ...step, ran: false, reason: decision.reason, ok: true, exitCode: null, durationMs: 0, changedFiles: [], commit: null });
        ctx.event("rewrite", `Skipped ${codemod.package}: ${decision.reason}`);
        continue;
      }
      ctx.event("rewrite", `Running ${codemod.package} (${decision.reason})`);
      const run = await runCommand(npxCommand, codemodArgs(codemod), { cwd: work, ...ctx.exec("rewrite") });
      state.steps.rewrite.command = run.command;
      state.steps.rewrite.exitCode = run.exitCode;
      const made = run.ok ? await ctx.commit("rewrite", codemodLabel(codemod)) : null;
      state.recipes.push({
        ...step,
        ran: true,
        reason: decision.reason,
        ok: run.ok,
        exitCode: run.exitCode,
        durationMs: run.durationMs,
        changedFiles: made?.files ?? [],
        commit: made?.sha ?? null,
      });
      ctx.emit();
      if (!run.ok) throw new StepFailed(`${codemod.package} failed (${run.failure ?? `exit ${run.exitCode}`}).`);
    }
    const ran = state.recipes.filter((item) => item.ran).length;
    ctx.end("rewrite", "passed", `${ran} codemod(s) applied, ${state.steps.rewrite.changedFiles.length} file(s) changed`);
  },

  async modernize(ctx) {
    const { state, work } = ctx;
    const scan = scanOf(state);
    const resolved = resolveFor(state);
    ctx.begin("modernize", `package.json, engines, .nvmrc and tsconfig (${resolved.route.tsconfigProfile})`);
    state.ruleEdits = applyNodeRules(work, {
      route: resolved.route,
      tsconfig: resolved.tsconfig,
      write: true,
      isLocked: ctx.locks.patterns.length ? ctx.locks.isLocked : undefined,
    });
    ctx.emit();
    ctx.event("modernize", "Installing dependencies with the new versions (npm install)");
    const install = await npmInstall(ctx, "modernize", Boolean(scan.lockfile));
    state.steps.modernize.command = install.command;
    state.steps.modernize.exitCode = install.exitCode;
    if (!install.ok) {
      state.warnings.push(`npm install failed after the rules (exit ${install.exitCode ?? install.failure}); the test step retries it and the model may fix it.`);
      ctx.event("modernize", "npm install failed; the test step will retry it", "warning");
    }
    await ctx.commit("modernize", `rules ${resolved.route.id}`);
    const applied = state.ruleEdits.filter((edit) => edit.applied).length;
    ctx.end("modernize", "passed", applied ? `${applied} edit(s)${install.ok ? ", dependencies installed" : ", npm install failed"}` : "No edits remained");
  },

  testSummary() {
    return "npm install, then npm test";
  },

  async runTests(ctx) {
    const scan = scanOf(ctx.state);
    const install = await npmInstall(ctx, "test", Boolean(scan.lockfile));
    if (!install.ok) {
      const run = toTestRun(install);
      return { ...run, firstFailure: firstNodeFailure(install.output) || run.firstFailure, tests: null };
    }
    if (!scan.scripts.test) {
      return { ok: false, exitCode: null, failure: null, command: "npm test", firstFailure: "package.json has no test script.", outputTail: "", tests: null };
    }
    const test = await runCommand(npmCommand, ["test"], { cwd: ctx.work, ...ctx.exec("test") });
    return toTestRun(test);
  },

  packageSummary(state) {
    return isNodeScan(state.scan) && state.scan.scripts.build ? "npm run build" : "No build script";
  },

  async runPackage(ctx) {
    const scan = scanOf(ctx.state);
    if (!scan.scripts.build) {
      return { ok: true, exitCode: null, failure: null, command: "", artifacts: [], skipped: "package.json has no build script" };
    }
    const build = await runCommand(npmCommand, ["run", "build"], { cwd: ctx.work, ...ctx.exec("package") });
    const artifacts = ["dist", "build", "lib"].map((dir) => path.join(ctx.work, dir)).filter(existsSync);
    return {
      ok: build.ok,
      exitCode: build.exitCode,
      failure: build.failure,
      command: build.command,
      artifacts,
      summary: `exit 0; ${artifacts.map((item) => `${path.basename(item)}/`).join(", ") || "build finished"}`,
    };
  },

  async checks(ctx) {
    const { state } = ctx;
    const before = scanOf(state);
    const resolved = resolveFor(state);
    const after = scanNodeProject(state.workPath);
    state.scanAfter = after;
    state.after = { java: null, boot: null };
    const checks: CheckResult[] = [];
    const node = Number(resolved.targets.node);
    const enginesMajor = rangeMajor(after.engines);
    checks.push({
      id: "node-engines",
      ok: enginesMajor !== null && enginesMajor >= node,
      level: "error",
      message: `engines.node is ${after.engines ?? "not set"} (target Node ${node}).`,
    });
    if (before.typescript) {
      const line = normalizeTs(after.typescript);
      checks.push({
        id: "typescript-version",
        ok: line !== "unknown" && (Number(line.split(".")[0]) > Number(resolved.targets.typescript.split(".")[0]) || line === resolved.targets.typescript || Number(line) >= Number(resolved.targets.typescript)),
        level: "error",
        message: `TypeScript is ${after.typescript ?? "not declared"} (target ${resolved.targets.typescript}).`,
      });
    }
    if (after.typesNode) {
      const typesMajor = rangeMajor(after.typesNode);
      checks.push({
        id: "types-node",
        ok: typesMajor === node,
        level: "warning",
        message: `@types/node is ${after.typesNode} (should match Node ${node}).`,
      });
    }
    if (before.express) {
      checks.push({
        id: "express-version",
        ok: (after.expressMajor ?? 0) >= 5,
        level: "error",
        message: `Express is ${after.express ?? "missing"} (target 5).`,
      });
      checks.push({
        id: "express-apis",
        ok: after.expressDeprecated.length === 0,
        level: "error",
        message: after.expressDeprecated.length
          ? `${after.expressDeprecated.length} Express 4 API use(s) remain (${after.expressDeprecated
              .slice(0, 5)
              .map((hit) => `${hit.file}:${hit.line} ${hit.api}`)
              .join(", ")}).`
          : "No Express 4 APIs remain.",
      });
    }
    const removed = after.nodeDeprecated.filter((hit) => hit.removedIn != null && node >= hit.removedIn);
    const deprecated = after.nodeDeprecated.filter((hit) => !(hit.removedIn != null && node >= hit.removedIn));
    checks.push({
      id: "node-removed-apis",
      ok: removed.length === 0,
      level: "error",
      message: removed.length
        ? `${removed.length} call(s) to APIs removed by Node ${node} remain (${removed.slice(0, 5).map((hit) => `${hit.file}:${hit.line} ${hit.api}`).join(", ")}).`
        : `No APIs removed by Node ${node} are used.`,
    });
    if (deprecated.length) {
      checks.push({
        id: "node-deprecated-apis",
        ok: false,
        level: "warning",
        message: `${deprecated.length} deprecated Node API use(s) remain (${deprecated.slice(0, 5).map((hit) => `${hit.file}:${hit.line} ${hit.api}`).join(", ")}).`,
      });
    }
    if (resolved.tsconfig.migrateModuleResolution && after.tsconfig) {
      const bad = [
        ["node", "node10", "classic"].includes(after.tsconfig.moduleResolution ?? "") ? `moduleResolution ${after.tsconfig.moduleResolution}` : null,
        after.tsconfig.downlevelIteration ? "downlevelIteration" : null,
        after.tsconfig.baseUrl !== null && !after.tsconfig.hasPaths ? "baseUrl" : null,
      ].filter(Boolean);
      checks.push({
        id: "tsconfig-deprecations",
        ok: bad.length === 0,
        level: "error",
        message: bad.length ? `tsconfig.json still uses options deprecated in TypeScript 6: ${bad.join(", ")}.` : "tsconfig.json has no TypeScript 6 deprecations.",
      });
    }
    state.versions = nodeVersions(state);
    const followUps: string[] = [];
    for (const file of ["Dockerfile", "docker/Dockerfile"]) {
      const text = readText(state.workPath, file);
      const from = /^FROM\s+\S*node:(\d+)/im.exec(text);
      if (from && Number(from[1]) < node) followUps.push(`${file} uses a Node ${from[1]} base image; move it to Node ${node}.`);
    }
    const workflows = listRepoFiles(state.workPath).filter((file) => file.startsWith(".github/workflows/"));
    for (const file of workflows) {
      const match = /node-version:\s*['"]?(\d+)/.exec(readText(state.workPath, file));
      if (match && Number(match[1]) < node) followUps.push(`${file} builds with Node ${match[1]}; update it to ${node}.`);
    }
    for (const edit of state.ruleEdits.filter((item) => !item.applied)) followUps.push(`${edit.file}: ${edit.detail}`);
    return { checks, followUps };
  },

  plan(input) {
    return nodePlan(input);
  },

  fixupFacts(state) {
    return [
      `Route ${state.route?.id}: ${state.route?.targetLabel}.`,
      "This is a Node.js project: build files are package.json and tsconfig.json; sources are under src/ and tests under test/. npm install and npm test are run by the pipeline.",
    ];
  },
};

export { ConfigError };

/** Exact one-line rewrites for the simplest removed/deprecated Node and Express calls (null = needs thought). */
export function simpleNodeRewrite(line: string): string | null {
  const rules: Array<[RegExp, string]> = [
    [/\bnew\s+Buffer\s*\(\s*(\d+)\s*\)/, "Buffer.alloc($1)"],
    [/\bnew\s+Buffer\s*\(/, "Buffer.from("],
    [/\butil\.isArray\s*\(/, "Array.isArray("],
    [/\butil\._extend\s*\(/, "Object.assign("],
    [/\b(app|router)\.del\s*\(/, "$1.delete("],
    [/\bres\.sendfile\s*\(/, "res.sendFile("],
    [/\bres\.send\s*\(\s*(\d{3})\s*\)/, "res.sendStatus($1)"],
    [/\bres\.(json|jsonp|send)\s*\(\s*([^(),]+),\s*(\d{3})\s*\)/, "res.status($3).$1($2)"],
  ];
  for (const [pattern, replacement] of rules) if (pattern.test(line)) return line.replace(pattern, replacement);
  return null;
}

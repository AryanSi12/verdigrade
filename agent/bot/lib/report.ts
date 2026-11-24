import { engineSection, runMetrics } from "./engine.js";
import { isNodeScan, isPythonScan, javaScan, type RunState } from "./types.js";

function line(label: string, value: string | number | null | undefined): string {
  return `- ${label}: ${value === null || value === undefined || value === "" ? "unknown" : value}`;
}

function list(items: string[], empty: string, limit = 200): string[] {
  if (!items.length) return [`- ${empty}`];
  const shown = items.slice(0, limit).map((item) => `- ${item}`);
  if (items.length > limit) shown.push(`- … and ${items.length - limit} more`);
  return shown;
}

/** Machine-readable report: the facts every other format (Markdown, PDF, PR body) is generated from. */
export function reportJson(state: RunState) {
  const scan = javaScan(state.scan);
  const scanAfter = javaScan(state.scanAfter);
  const node = isNodeScan(state.scan) ? state.scan : null;
  const nodeAfter = isNodeScan(state.scanAfter) ? state.scanAfter : null;
  const python = isPythonScan(state.scan) ? state.scan : null;
  const pythonAfter = isPythonScan(state.scanAfter) ? state.scanAfter : null;
  const pythonFacts = (value: NonNullable<typeof python>) => ({
    python: value.pythonVersion,
    django: value.django,
    flask: value.flask,
    packageManager: value.packageManager,
    removedApis: value.hits.filter((hit) => hit.removedIn !== null),
    deprecatedApis: value.hits.filter((hit) => hit.removedIn === null),
  });
  return {
    schemaVersion: 1,
    tool: "leapfrog",
    ecosystem: state.ecosystem ?? "java",
    runId: state.runId,
    status: state.status,
    dryRun: state.dryRun,
    repoPath: state.repoPath,
    source: state.source ?? null,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    durationMs: state.durationMs,
    error: state.error,
    route: state.route,
    request: state.request,
    before: { java: state.from.java, boot: state.from.boot, source: state.from.source, springVersion: scan?.springVersion ?? null },
    after: state.after,
    buildTool: state.buildTool,
    wrapper: state.wrapper,
    versions: state.versions ?? [],
    modules: scan?.modules ?? [],
    javax: {
      before: { files: scan?.javaxFiles.length ?? 0, packages: scan?.javaxPackageCounts ?? {} },
      after: { files: scanAfter?.javaxFiles.length ?? null, packages: scanAfter?.javaxPackageCounts ?? null },
    },
    node: node
      ? {
          before: { node: node.nodeVersion, typescript: node.typescriptVersion, express: node.express, expressDeprecated: node.expressDeprecated, nodeDeprecated: node.nodeDeprecated },
          after: nodeAfter
            ? { node: nodeAfter.nodeVersion, typescript: nodeAfter.typescriptVersion, express: nodeAfter.express, expressDeprecated: nodeAfter.expressDeprecated, nodeDeprecated: nodeAfter.nodeDeprecated }
            : null,
        }
      : null,
    python: python ? { before: pythonFacts(python), after: pythonAfter ? pythonFacts(pythonAfter) : null } : null,
    plan: state.plan ?? null,
    engine: state.engine ?? null,
    metrics: runMetrics(state),
    lockViolations: state.lockViolations ?? [],
    steps: Object.values(state.steps).map((step) => ({
      id: step.id,
      status: step.status,
      exitCode: step.exitCode,
      durationMs: step.durationMs,
      command: step.command,
      summary: step.summary,
      commit: step.commit,
      logFile: step.logFile,
    })),
    recipes: state.recipes,
    ruleEdits: state.ruleEdits,
    fixRounds: state.fixRounds,
    tests: state.tests,
    artifacts: state.artifacts,
    checks: state.checks,
    pageCheck: state.pageCheck ?? null,
    followUps: state.followUps,
    warnings: state.warnings,
    git: state.git,
    changedFiles: state.changedFiles,
  };
}

function versionSummary(state: RunState): string {
  return (state.versions ?? [])
    .map((fact) => `${fact.label} ${fact.before ?? "unknown"} → ${fact.after ?? fact.target ?? "unchanged"}`)
    .join(", ");
}

function planSection(state: RunState): string[] {
  const out: string[] = [];
  const plan = state.plan;
  if (plan) {
    out.push("");
    out.push(`### From the approved plan (${plan.planId})`);
    if (!plan.followUps.length) out.push("- No item was marked manual or locked.");
    for (const item of plan.followUps) {
      const where = item.file ? `${item.file}${item.line ? `:${item.line}` : ""}` : "project-wide";
      const risk = item.riskIfSkipped && item.riskIfSkipped !== "none" ? ` (risk if left: ${item.riskIfSkipped})` : "";
      out.push(`- [${item.decision === "lock" ? "locked" : "manual"}] ${where}: ${item.plainTitle ?? item.title}${risk}${item.note ? `. Note: ${item.note}` : ""}`);
      if (item.consequence) out.push(`  - What this means: ${item.consequence}`);
      if (item.manualSteps?.length) {
        out.push(`  - To do by hand${item.effort ? ` (${item.effort})` : ""}:`);
        for (const step of item.manualSteps) out.push(`    - [ ] ${step}`);
      } else if (item.suggestion) out.push(`  - Suggested: ${item.suggestion}`);
    }
    if (plan.lockedPaths.length) out.push(`- Locked paths (kept unchanged): ${plan.lockedPaths.join(", ")}`);
    if (plan.aiPreFixes?.length) {
      out.push("");
      out.push("### AI pre-fixes made in plan mode (kept by the reviewer)");
      for (const fix of plan.aiPreFixes) out.push(`- ${fix.title} (${fix.files.join(", ")})${fix.summary ? `: ${fix.summary}` : ""}`);
    }
  }
  const violations = state.lockViolations ?? [];
  if (violations.length) {
    out.push("");
    out.push("### Changes the plan's locks blocked");
    for (const item of violations) {
      out.push(`- ${item.file} (${item.pattern || "locked"}): ${item.action === "skipped" ? "rule edit skipped" : item.action === "restored" ? "change reverted" : "new file removed"} after ${item.step}`);
    }
  }
  return out;
}

function nodeSections(state: RunState, out: string[]): void {
  const scan = isNodeScan(state.scan) ? state.scan : null;
  const after = isNodeScan(state.scanAfter) ? state.scanAfter : null;
  out.push("## Before the migration");
  out.push(line("Node", scan?.nodeVersion ? `${scan.nodeVersion} (${scan.nodeSource ?? "declared"})` : null));
  out.push(line("TypeScript", scan?.typescript ?? "none"));
  out.push(line("@types/node", scan?.typesNode ?? "none"));
  out.push(line("Express", scan?.express ?? "none"));
  out.push(line("Package manager", scan ? `${scan.packageManager}${scan.lockfile ? ` (${scan.lockfile})` : " (no lockfile)"}` : null));
  out.push(line("Express 4 API uses", scan?.expressDeprecated.length ?? 0));
  for (const hit of scan?.expressDeprecated.slice(0, 50) ?? []) out.push(`  - ${hit.file}:${hit.line} ${hit.api} → ${hit.replacement}`);
  out.push(line("Deprecated Node API uses", scan?.nodeDeprecated.length ?? 0));
  for (const hit of scan?.nodeDeprecated.slice(0, 50) ?? []) out.push(`  - ${hit.file}:${hit.line} ${hit.api} → ${hit.replacement}`);
  out.push(line("Files scanned", scan?.filesScanned ?? 0));
  out.push("");
  out.push("## Codemods");
  if (!state.recipes.length) out.push("- No codemod ran.");
  for (const recipe of state.recipes) {
    out.push(
      `- ${recipe.recipe}: ${recipe.ran ? `${recipe.ok ? "applied" : "FAILED"}, exit ${recipe.exitCode ?? "none"}, ${recipe.changedFiles.length} file(s)` : `skipped (${recipe.reason})`}`,
    );
    for (const file of recipe.changedFiles.slice(0, 50)) out.push(`  - ${file}`);
  }
  out.push("");
  out.push("## Modernizer");
  if (!state.ruleEdits.length) out.push("- No edits remained.");
  for (const edit of state.ruleEdits) out.push(`- ${edit.file}: ${edit.detail}${edit.applied || edit.detail.includes("not applied") ? "" : " (not applied)"}`);
  out.push(line("Edits applied", state.ruleEdits.filter((edit) => edit.applied).length));
  out.push(line("Model fix-up rounds", state.fixRounds.length));
  for (const round of state.fixRounds) out.push(`  - Round ${round.round}: ${round.status}; ${round.changedFiles.length} file(s). ${round.note}`.trim());
  out.push("");
  out.push("## After the migration");
  out.push(line("Node (engines)", after?.nodeVersion));
  out.push(line("TypeScript", after?.typescript ?? "none"));
  out.push(line("@types/node", after?.typesNode ?? "none"));
  out.push(line("Express", after?.express ?? "none"));
  out.push(line("Express 4 API uses left", after?.expressDeprecated.length ?? null));
  out.push(line("Deprecated Node API uses left", after?.nodeDeprecated.length ?? null));
}

function toolSections(state: RunState, out: string[]): void {
  out.push("## Codemods");
  if (!state.recipes.length) out.push("- No codemod ran.");
  for (const recipe of state.recipes) {
    out.push(
      `- ${recipe.recipe}: ${recipe.ran ? `${recipe.ok ? "applied" : "FAILED"}, exit ${recipe.exitCode ?? "none"}, ${recipe.changedFiles.length} file(s)` : `skipped (${recipe.reason})`}`,
    );
    for (const file of recipe.changedFiles.slice(0, 50)) out.push(`  - ${file}`);
  }
  out.push("");
  out.push("## Modernizer");
  if (!state.ruleEdits.length) out.push("- No edits remained.");
  for (const edit of state.ruleEdits) out.push(`- ${edit.file}: ${edit.detail}${edit.applied || edit.detail.includes("not applied") ? "" : " (not applied)"}`);
  out.push(line("Edits applied", state.ruleEdits.filter((edit) => edit.applied).length));
  out.push(line("Model fix-up rounds", state.fixRounds.length));
  for (const round of state.fixRounds) out.push(`  - Round ${round.round}: ${round.status}; ${round.changedFiles.length} file(s). ${round.note}`.trim());
}

function pythonSections(state: RunState, out: string[]): void {
  const scan = isPythonScan(state.scan) ? state.scan : null;
  const after = isPythonScan(state.scanAfter) ? state.scanAfter : null;
  const removed = (value: typeof scan) => value?.hits.filter((hit) => hit.removedIn !== null) ?? [];
  const deprecated = (value: typeof scan) => value?.hits.filter((hit) => hit.removedIn === null) ?? [];
  out.push("## Before the migration");
  out.push(line("Python", scan?.pythonVersion ? `${scan.pythonVersion} (${scan.pythonSource ?? "declared"})` : null));
  out.push(line("Django", scan?.djangoVersion ?? scan?.django ?? "none"));
  out.push(line("Flask", scan?.flaskVersion ?? scan?.flask ?? "none"));
  out.push(line("Dependencies from", scan ? `${scan.dependencyFiles.join(", ") || scan.installSource}` : null));
  out.push(line("Package manager", scan ? `${scan.packageManager}${scan.lockfile ? ` (${scan.lockfile})` : ""}` : null));
  out.push(line("Test runner", scan?.testRunner ?? "none found"));
  out.push(line("Removed API uses", removed(scan).length));
  for (const hit of removed(scan).slice(0, 50)) out.push(`  - ${hit.file}:${hit.line} ${hit.api} → ${hit.replacement}`);
  out.push(line("Deprecated API uses", deprecated(scan).length));
  for (const hit of deprecated(scan).slice(0, 50)) out.push(`  - ${hit.file}:${hit.line} ${hit.api} → ${hit.replacement}`);
  out.push(line("Files scanned", scan?.filesScanned ?? 0));
  out.push("");
  toolSections(state, out);
  out.push("");
  out.push("## After the migration");
  out.push(line("Python (declared)", after?.pythonVersion));
  out.push(line("Django", after?.djangoVersion ?? after?.django ?? "none"));
  out.push(line("Flask", after?.flaskVersion ?? after?.flask ?? "none"));
  out.push(line("Removed API uses left", after ? removed(after).length : null));
  out.push(line("Deprecated API uses left", after ? deprecated(after).length : null));
}

export function reportMarkdown(state: RunState): string {
  const route = state.route;
  const pythonRun = state.ecosystem === "python";
  const nodeRun = state.ecosystem === "node" || pythonRun;
  const scan = javaScan(state.scan);
  const scanAfter = javaScan(state.scanAfter);
  const result = state.status === "passed" ? "PASSED" : state.status === "failed" ? "FAILED" : "RUNNING";
  const tests = state.tests;
  const out: string[] = [];
  out.push(`# Migration report: ${state.repoPath.split(/[\\/]/).filter(Boolean).at(-1) ?? state.repoPath}`);
  out.push("");
  out.push("Generated by Verdigrade.");
  out.push("");
  out.push("## Executive summary");
  const moved = !route
    ? "No route was resolved"
    : nodeRun
      ? versionSummary(state) || route.targetLabel || route.id
      : `Java ${state.from.java ?? "unknown"} → ${state.after?.java ?? route.targetJava}, Spring Boot ${state.from.boot ?? "none"} → ${state.after?.boot ?? (route.targetBoot === "none" ? "unchanged" : route.targetBoot)}`
  out.push(
    `${result}${state.dryRun ? " (dry run: the repository was not modified)" : ""}. ${moved}. ` +
      `${state.changedFiles.length} file(s) changed in ${state.git.commits.length} commit(s). ` +
      (tests ? `Tests: ${tests.testsRun ?? "?"} run, ${tests.failures ?? "?"} failures, ${tests.errors ?? "?"} errors.` : "Tests did not run.") +
      (state.error ? ` Stopped because: ${state.error}` : ""),
  );
  out.push("");
  out.push("## Repository");
  out.push(line("Path", state.repoPath));
  if (state.source?.type === "github") {
    out.push(line("Source", `GitHub ${state.source.url}${state.source.branch ? ` (branch ${state.source.branch})` : ""}${state.source.commit ? ` at ${state.source.commit.slice(0, 12)}` : ""}`));
    if (state.source.subdir) out.push(line("Project folder", `${state.source.subdir}${state.source.autoDetected ? " (found automatically)" : ""}`));
    out.push(line("Local clone", `${state.source.clonePath ?? state.source.localPath} (changes stay in this clone; nothing is pushed to GitHub)`));
  }
  if (state.dryRun) out.push(line("Dry-run copy", state.workPath));
  out.push(line("Build tool", state.buildTool ? `${state.buildTool}${state.wrapper ? " (wrapper)" : ""}` : null));
  if (!nodeRun) out.push(line("Modules", scan?.modules.map((item) => item.path || "(root)").join(", ")));
  out.push(line("Started", state.startedAt));
  out.push(line("Finished", state.finishedAt));
  out.push(line("Result", result));
  out.push("");
  out.push(...engineSection(state));
  out.push("## Route");
  if (route) {
    out.push(line("Route id", route.id));
    if (nodeRun) {
      out.push(line("Targets", route.targetLabel));
    } else {
      out.push(line("Target Java", route.targetJava));
      out.push(line("Target Spring Boot", route.targetBoot));
    }
    if (route.parentHint) out.push(line("Boot parent", route.parentHint));
    out.push(line("Rules packs", route.rulePacks.join(", ")));
    for (const note of route.notes) out.push(`- Note: ${note}`);
    out.push(nodeRun ? "- Codemod plan:" : "- Recipe plan:");
    for (const step of route.recipePlan) out.push(`  - ${step.recipe} (${step.artifact}, when ${step.when})`);
  } else {
    out.push("- No route resolved.");
  }
  out.push("");
  if (pythonRun) {
    pythonSections(state, out);
  } else if (nodeRun) {
    nodeSections(state, out);
  } else {
    out.push("## Before the migration");
    out.push(line("Java", state.from.java ? `${state.from.java} (${state.from.source})` : null));
    out.push(line("Spring Boot", state.from.boot ?? (scan?.springVersion ? `none (classic Spring ${scan.springVersion})` : "none")));
    out.push(line("web.xml", scan?.hasWebXml ? scan.webXmlFiles.join(", ") : "not present"));
    const counts = scan?.javaxPackageCounts ?? {};
    out.push(line("Jakarta EE javax references", Object.keys(counts).length ? Object.entries(counts).map(([pkg, count]) => `${pkg} ×${count}`).join(", ") : "none"));
    out.push(line("Files with Jakarta EE javax imports", scan?.javaxFiles.length ?? 0));
    out.push(...list(scan?.javaxFiles ?? [], "none").map((item) => `  ${item}`));
    out.push(line("Files with only JDK-owned javax (not migrated)", scan?.jdkJavaxFiles.length ?? 0));
    out.push(line("Files already on jakarta", scan?.jakartaFiles.length ?? 0));
    out.push(line("Files scanned", scan?.filesScanned ?? 0));
    out.push("");
    out.push("## OpenRewrite");
    if (!state.recipes.length) out.push("- No recipe ran.");
    for (const recipe of state.recipes) {
      out.push(
        `- ${recipe.recipe}: ${recipe.ran ? `${recipe.ok ? "applied" : "FAILED"}, exit ${recipe.exitCode ?? "none"}, ${recipe.changedFiles.length} file(s)` : `skipped (${recipe.reason})`}`,
      );
      for (const file of recipe.changedFiles.slice(0, 50)) out.push(`  - ${file}`);
    }
    out.push("");
    out.push("## Modernizer");
    const applied = state.ruleEdits.filter((edit) => edit.applied);
    if (!state.ruleEdits.length) out.push("- No checklist items remained.");
    for (const edit of state.ruleEdits) out.push(`- ${edit.file}: ${edit.detail}${edit.applied ? "" : " (not applied)"}`);
    out.push(line("Edits applied", applied.length));
    out.push(line("Model fix-up rounds", state.fixRounds.length));
    for (const round of state.fixRounds) out.push(`  - Round ${round.round}: ${round.status}; ${round.changedFiles.length} file(s). ${round.note}`.trim());
    out.push("");
    out.push("## After the migration");
    out.push(line("Java", state.after?.java));
    out.push(line("Spring Boot", state.after?.boot ?? "none"));
    out.push(line("Jakarta EE javax files left", scanAfter?.javaxFiles.length ?? null));
  }
  out.push("");
  out.push("## Tests");
  if (tests) {
    out.push(line("Result", tests.ok ? "passed" : "failed"));
    out.push(line("Exit code", tests.exitCode));
    out.push(line("Tests run", tests.testsRun));
    out.push(line("Failures", tests.failures));
    out.push(line("Errors", tests.errors));
    out.push(line("Skipped", tests.skipped));
    out.push(line("Counted from", tests.source));
    out.push("- Test sets:");
    out.push(...list(tests.testSets, "none reported").map((item) => `  ${item}`));
    if (tests.firstFailure) out.push("- First failure:", "```", tests.firstFailure, "```");
  } else {
    out.push(`- ${state.steps.test.status === "skipped" ? state.steps.test.summary || "Skipped." : "Tests did not run."}`);
  }
  out.push("");
  out.push("## Package");
  out.push(line("Exit code", state.steps.package.exitCode));
  out.push(...list(state.artifacts, state.steps.package.status === "skipped" ? "skipped" : "no artifact reported"));
  out.push("");
  out.push("## Checks");
  out.push(...list(state.checks.map((check) => `[${check.ok ? "ok" : check.level}] ${check.message}`), "no checks ran"));
  out.push("");
  if (state.pageCheck) {
    const page = state.pageCheck;
    out.push("## Page check");
    if (!page.ran) {
      out.push(`- Not run: ${page.note}`);
    } else {
      out.push(`- ${page.problems.length ? `${page.problems.length} problem(s) on the running page` : "The page loaded and its API calls worked"}${page.initialProblems && page.initialProblems !== page.problems.length ? ` (first run: ${page.initialProblems})` : page.initialProblems && !page.problems.length ? ` (it first had ${page.initialProblems} problem(s))` : ""}.`);
      out.push(`- ${page.fixAttempted ? `AI fix-up rounds on the page: ${page.rounds}` : "Reported only: this engine's AI does not edit the page, so these were not fixed."}`);
      out.push(...list(page.problems.map((problem) => `[${problem.kind}] ${problem.message}`), "no problems"));
    }
    out.push("");
  }
  out.push("## Changes");
  out.push(line("Git mode", state.git.mode === "repo" ? `branch ${state.git.branch} (from ${state.git.originalBranch ?? state.git.baseCommit})` : state.git.mode));
  for (const commit of state.git.commits) out.push(`- ${commit.sha.slice(0, 10)} ${commit.step}: ${commit.message} (${commit.files.length} file(s))`);
  out.push(line("Files changed", state.changedFiles.length));
  out.push(...list(state.changedFiles, "none"));
  out.push("");
  out.push("## Manual follow-up");
  out.push(...list(state.followUps, "Nothing else was found."));
  out.push(...planSection(state));
  if (state.warnings.length) {
    out.push("");
    out.push("## Warnings");
    out.push(...list(state.warnings, "none"));
  }
  if (state.narrative.status === "done" && state.narrative.text) {
    out.push("");
    out.push("## Narrative (model-written, secondary to the facts above)");
    out.push(state.narrative.text);
  }
  out.push("");
  return out.join("\n");
}

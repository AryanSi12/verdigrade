import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isCompileFailure, isResolutionFailure } from "../engine.js";
import { preflight as javaPreflight, runBuild, runRecipes, type RecipeRun } from "../build.js";
import { loadModernizerRules, matrixPublicView, normalizeJava, resolveRoute, validateProfiles, type RecipeStep } from "../matrix.js";
import { loadRepoConfig } from "../repoConfig.js";
import { detectBuildTool, type BuildTool } from "../repo.js";
import { applyRules, mergeRules } from "../rules.js";
import { renameJavaxReferences, scanJavax, scanProject, type ScanResult } from "../scanner.js";
import { javaScan, type CheckResult, type RunState, type VersionFact } from "../types.js";
import { rewriteExclusionGlobs } from "../locks.js";
import { javaPlan } from "./javaPlan.js";
import { StepFailed, type LanguageAdapter, type StepContext, type TargetRequest } from "./types.js";

/** Evaluate a matrix `when` condition against the current scan. Unknown Java runs the upgrade (it is idempotent). */
export function shouldRun(step: RecipeStep, facts: { javaVersion: string | null; bootPresent: boolean; javaxFiles: number }, targetJava: string): { run: boolean; reason: string } {
  switch (step.when) {
    case "always":
      return { run: true, reason: "always" };
    case "javaBelowTarget": {
      const java = normalizeJava(facts.javaVersion);
      if (java === "unknown") return { run: true, reason: "Java level unknown; running the idempotent upgrade" };
      return Number(java) < Number(targetJava)
        ? { run: true, reason: `Java ${java} < ${targetJava}` }
        : { run: false, reason: `Java ${java} is already at or above ${targetJava}` };
    }
    case "bootPresent":
      return facts.bootPresent ? { run: true, reason: "Spring Boot detected" } : { run: false, reason: "no Spring Boot parent/plugin detected" };
    case "javaxFiles":
      return facts.javaxFiles > 0
        ? { run: true, reason: `${facts.javaxFiles} file(s) still use Jakarta EE javax packages` }
        : { run: false, reason: "no Jakarta EE javax references left" };
  }
}

export const knownBadDependencies: Array<{ pattern: RegExp; level: "error" | "warning"; message: string }> = [
  { pattern: /io\.springfox|springfox-/, level: "warning", message: "springfox is not compatible with Spring Boot 3+; move to springdoc-openapi." },
  { pattern: /javax\.servlet:javax\.servlet-api|<artifactId>\s*javax\.servlet-api\s*</, level: "warning", message: "javax.servlet-api is still declared; use jakarta.servlet-api." },
  { pattern: /<groupId>\s*javax\.validation\s*<\/groupId>|javax\.validation:validation-api/, level: "warning", message: "javax.validation:validation-api is still declared; use jakarta.validation-api." },
  { pattern: /<groupId>\s*javax\.persistence\s*<\/groupId>|javax\.persistence:/, level: "warning", message: "A javax.persistence API is still declared; use jakarta.persistence-api." },
  { pattern: /<artifactId>\s*jjwt\s*<\/artifactId>|io\.jsonwebtoken:jjwt:/, level: "warning", message: "The monolithic io.jsonwebtoken:jjwt (0.9.x) is not Jakarta-ready; use jjwt-api/jjwt-impl 0.12+." },
  { pattern: /<groupId>\s*junit\s*<\/groupId>|["']junit:junit:/, level: "warning", message: "JUnit 4 (junit:junit) is still declared; consider rewrite-testing-frameworks JUnit4to5Migration." },
  { pattern: /spring-boot-properties-migrator/, level: "warning", message: "spring-boot-properties-migrator is still declared; remove it after fixing the reported properties." },
];

function readIfExists(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/** Java/Kotlin sources outside build output (shared by follow-ups and the plan). */
export function javaSources(root: string, limit = 5000): string[] {
  const sources: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 20 || sources.length > limit) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!["target", "build", ".git", "node_modules", ".gradle"].includes(entry.name)) walk(path.join(dir, entry.name), depth + 1);
      } else if (entry.name.endsWith(".java") || entry.name.endsWith(".kt")) {
        sources.push(path.join(dir, entry.name));
      }
    }
  };
  walk(root, 0);
  return sources;
}

function findFollowUps(workPath: string, state: RunState): string[] {
  const items: string[] = [];
  const scan = javaScan(state.scanAfter) ?? javaScan(state.scan);
  if (scan?.classicSpring) {
    items.push(
      `Classic Spring app: add spring-boot-starter-parent ${state.route?.parentHint || state.route?.targetBoot || ""}`.trim() +
        ", a @SpringBootApplication class, and replace XML bean config.",
    );
  }
  if (scan?.hasWebXml) items.push(`web.xml is still present (${scan.webXmlFiles.join(", ")}); move servlet config to Spring Boot.`);
  const sources = javaSources(workPath);
  const security = sources.filter((file) => /WebSecurityConfigurerAdapter|antMatchers\(|authorizeRequests\(/.test(readIfExists(file)));
  if (security.length) {
    items.push(
      `Spring Security config needs the component-based lambda DSL (WebSecurityConfigurerAdapter / antMatchers / authorizeRequests found in ${security
        .slice(0, 5)
        .map((file) => path.relative(workPath, file))
        .join(", ")}).`,
    );
  }
  const docker = ["Dockerfile", "docker/Dockerfile"].map((name) => path.join(workPath, name)).filter(existsSync);
  for (const file of docker) {
    const text = readIfExists(file);
    const from = /^FROM\s+\S*(openjdk|temurin|corretto|jdk|jre)\S*?[:-](8|11|17)\b/im.exec(text);
    if (from && Number(from[2]) < Number(state.route?.targetJava ?? 21)) {
      items.push(`${path.relative(workPath, file)} uses a Java ${from[2]} base image; move it to Java ${state.route?.targetJava}.`);
    }
  }
  const workflows = path.join(workPath, ".github", "workflows");
  if (existsSync(workflows)) {
    for (const name of readdirSync(workflows)) {
      const match = /java-version:\s*['"]?(8|11|17)\b/.exec(readIfExists(path.join(workflows, name)));
      if (match && Number(match[1]) < Number(state.route?.targetJava ?? 21)) {
        items.push(`.github/workflows/${name} builds with Java ${match[1]}; update it to ${state.route?.targetJava}.`);
      }
    }
  }
  return items;
}

function javaVersions(state: RunState): VersionFact[] {
  const route = state.route;
  return [
    { key: "java", label: "Java", before: state.from.java, after: state.after?.java ?? null, target: route?.targetJava ?? state.request.targetJava ?? null },
    {
      key: "boot",
      label: "Spring Boot",
      before: state.from.boot,
      after: state.after?.boot ?? null,
      target: route ? (route.targetBoot === "none" ? null : route.parentHint || route.targetBoot) : state.request.targetBoot || null,
    },
  ];
}

/** Locked paths as OpenRewrite exclusions (the post-step revert is the backstop). */
function rewriteExclusions(ctx: StepContext): string[] {
  return rewriteExclusionGlobs(ctx.locks.patterns);
}

function buildToolOf(state: RunState): BuildTool {
  return (state.buildTool as BuildTool) ?? "maven";
}

function legacyRequest(request: TargetRequest) {
  return {
    targetJava: request.targets.java,
    targetBoot: request.targets.boot,
    fromJava: request.from.java,
    fromBoot: request.from.boot,
  };
}

/** Record that OpenRewrite is unavailable (once) so the UI and report can say Classic used the built-in rules. */
function openRewriteUnavailable(ctx: StepContext, recipe: string): void {
  const engine = ctx.state.engine;
  if (engine?.openRewrite === "unavailable") return;
  if (engine) {
    engine.openRewrite = "unavailable";
    engine.classicTool = "built-in rules (OpenRewrite unavailable)";
    engine.notes.push("OpenRewrite could not be resolved (offline or blocked network), so the deterministic part used Verdigrade's built-in rules only.");
  }
  ctx.state.warnings.push(`OpenRewrite could not be resolved while running ${recipe}; Verdigrade's built-in rules were used instead.`);
  ctx.event("rewrite", "OpenRewrite could not be resolved (offline?). Falling back to Verdigrade's built-in rules.", "warning");
}

type RecipeOutcome = { kind: "ok" | "failed" | "unavailable" | "left-for-ai"; run: RecipeRun };

/**
 * Run recipes in one pass and keep a project that does not compile yet from failing the run.
 *  1. Normal pass (rewrite:run compiles the original project first).
 *  2. A compile error: retry without the compile lifecycle (rewrite:runNoFork). Recipes still
 *     edit the build files and the code they can type-resolve.
 *  3. Still failing for compile errors and the engine is Hybrid (an AI step and build/test fix-up
 *     rounds follow): not a failure, the rest is left for the AI. Anything else fails as before.
 */
async function runRecipesLeniently(ctx: StepContext, steps: Array<{ artifact: string; recipe: string }>, exclusions: string[], stepId: "rewrite" | "modernize"): Promise<RecipeOutcome> {
  const { state, work } = ctx;
  const buildTool = buildToolOf(state);
  const pass = async (noFork: boolean) => {
    const run = await runRecipes(work, buildTool, steps, "run", { ...ctx.exec(stepId), exclusions, noFork });
    state.steps[stepId].command = run.result.command;
    state.steps[stepId].exitCode = run.result.exitCode;
    return run;
  };
  let run = await pass(false);
  if (!run.result.ok && isResolutionFailure(run.result.output)) return { kind: "unavailable", run };
  if (!run.result.ok && isCompileFailure(run.result.output) && buildTool === "maven") {
    ctx.event(stepId, "The project does not compile yet, so OpenRewrite could not start; retrying without the compile step", "warning");
    run = await pass(true);
    if (!run.result.ok && isResolutionFailure(run.result.output)) return { kind: "unavailable", run };
  }
  if (run.result.ok) return { kind: "ok", run };
  if (isCompileFailure(run.result.output) && state.engine?.engine === "hybrid") {
    state.warnings.push("OpenRewrite could not finish because the project does not compile yet; the AI step and build/test fix-up rounds handle what is left.");
    ctx.event(stepId, "OpenRewrite could not finish (compile errors); continuing with the AI step", "warning");
    return { kind: "left-for-ai", run };
  }
  return { kind: "failed", run };
}

export const javaAdapter: LanguageAdapter = {
  id: "java",
  label: "Java / Spring Boot",
  stepLabels: { rewrite: "OpenRewrite" },
  ignorePatterns: [],
  workCopySkip: [],

  detect(repoPath) {
    try {
      detectBuildTool(repoPath);
      return true;
    } catch {
      return false;
    }
  },

  validateProfiles() {
    return validateProfiles();
  },

  matrixView() {
    return matrixPublicView();
  },

  resolveTargets(request, repoConfig) {
    const resolved = resolveRoute({
      targetJava: request.targets.java || repoConfig.targetJava,
      targetBoot: request.targets.boot || repoConfig.targetBoot,
    });
    if (!resolved.ok) return { ok: false, error: resolved.error };
    return {
      ok: true,
      targets: { java: resolved.targetJava, boot: resolved.targetBoot },
      routeId: resolved.route.id,
      timeoutMinutes: resolved.route.timeoutMinutes ?? repoConfig.timeoutMinutes,
    };
  },

  preview(request, repoPath, repoConfig) {
    let detected: { java: string | null; boot: string | null; buildTool: string; modules: number; javaxFiles: number; classicSpring: boolean } | null = null;
    let scanError: string | null = null;
    if (repoPath) {
      try {
        const scan = scanProject(repoPath, { excludeModules: repoConfig.excludeModules });
        detected = {
          java: scan.javaVersion,
          boot: scan.springBootVersion,
          buildTool: scan.buildTool,
          modules: scan.modules.length,
          javaxFiles: scan.javaxFiles.length,
          classicSpring: scan.classicSpring,
        };
      } catch (error) {
        scanError = (error as Error).message;
      }
    }
    const legacy = legacyRequest(request);
    const resolved = resolveRoute({
      targetJava: legacy.targetJava,
      targetBoot: legacy.targetBoot,
      fromJava: legacy.fromJava || detected?.java || undefined,
      fromBoot: legacy.fromBoot || detected?.boot || (detected?.classicSpring ? "none" : undefined),
    });
    if (!resolved.ok) return { ...resolved, ecosystem: "java", detected, scanError };
    return {
      ok: true,
      ecosystem: "java",
      routeId: resolved.route.id,
      description: resolved.route.description,
      targetJava: resolved.targetJava,
      targetBoot: resolved.targetBoot,
      targets: { java: resolved.targetJava, boot: resolved.targetBoot },
      targetLabel: `Java ${resolved.targetJava} · ${resolved.targetBoot === "none" ? "no Boot change" : `Spring Boot ${resolved.targetBoot}`}`,
      parentHint: resolved.parentHint,
      modernizerRules: resolved.rules.id,
      recipePlan: resolved.recipePlan.map((step) => ({ ...step, label: step.recipe.split(".").slice(-2).join(".") })),
      notes: resolved.notes,
      detected,
      scanError,
    };
  },

  async preflight(ctx, targets) {
    const buildTool = detectBuildTool(ctx.state.repoPath);
    ctx.state.buildTool = buildTool;
    const tools = await javaPreflight(ctx.state.repoPath, buildTool, { needGit: true, env: ctx.env });
    if (!tools.javaOk || tools.javaMajor === null) throw new StepFailed("Java was not found. Install a JDK and set JAVA_HOME (or put java on PATH).");
    if (tools.javaMajor < Number(targets.targets.java)) {
      throw new StepFailed(`JDK ${tools.javaMajor} is active but the route targets Java ${targets.targets.java}. Point JAVA_HOME at JDK ${targets.targets.java}+.`);
    }
    if (!tools.buildToolOk) {
      throw new StepFailed(`${buildTool === "maven" ? "Maven" : "Gradle"} could not run (${tools.buildToolCommand}). Add the wrapper or install it on PATH.`);
    }
    if (!tools.gitOk) throw new StepFailed("git is required for the safety net (per-step commits, diff and rollback). Install git.");
    return {
      buildTool,
      wrapper: tools.wrapper,
      command: tools.buildToolCommand,
      log: tools.log,
      summary: `JDK ${tools.javaMajor}, ${buildTool}${tools.wrapper ? " wrapper" : ""}`,
    };
  },

  async scan(ctx, targets) {
    const { state, work, repoConfig } = ctx;
    const request = state.request;
    ctx.begin("scan", "Reading build files, modules and javax usage");
    const scan = scanProject(work, { excludeModules: repoConfig.excludeModules });
    state.scan = scan;
    const fromJava = request.fromJava || scan.javaVersion || null;
    const fromBoot = request.fromBoot || scan.springBootVersion || (scan.classicSpring ? "none" : null);
    state.from = {
      java: fromJava,
      boot: fromBoot,
      source: request.fromJava || request.fromBoot ? "user" : scan.javaVersion || scan.springBootVersion ? "detected" : "unknown",
    };
    if (request.fromJava && scan.javaVersion && normalizeJava(request.fromJava) !== normalizeJava(scan.javaVersion)) {
      state.warnings.push(`From Java ${request.fromJava} was chosen but the build declares ${scan.javaVersion}.`);
    }
    for (const note of scan.notes) state.warnings.push(note);
    const resolved = resolveRoute({ targetJava: targets.targets.java, targetBoot: targets.targets.boot, fromJava: fromJava ?? undefined, fromBoot: fromBoot ?? undefined });
    if (!resolved.ok) throw new StepFailed(resolved.error);
    const packs = [resolved.rules, ...repoConfig.extraRulePacks.map((id) => loadModernizerRules(id))];
    state.route = {
      id: resolved.route.id,
      description: resolved.route.description,
      targetJava: resolved.targetJava,
      targetBoot: resolved.targetBoot,
      parentHint: resolved.parentHint,
      targets: { java: resolved.targetJava, boot: resolved.targetBoot },
      targetLabel: `Java ${resolved.targetJava} · ${resolved.targetBoot === "none" ? "no Boot change" : `Spring Boot ${resolved.targetBoot}`}`,
      rulePacks: packs.map((pack) => pack.id),
      recipePlan: resolved.recipePlan.map((step) => ({ ...step, label: step.recipe.split(".").slice(-2).join(".") })),
      notes: resolved.notes,
    };
    state.versions = javaVersions(state);
    state.steps.scan.exitCode = 0;
    ctx.end(
      "scan",
      "passed",
      `Java ${scan.javaVersion ?? "unknown"}, Boot ${scan.springBootVersion ?? (scan.classicSpring ? `none (Spring ${scan.springVersion})` : "none")}, ` +
        `${scan.modules.length} module(s), ${scan.javaxFiles.length} Jakarta EE javax file(s)`,
    );
  },

  async rewrite(ctx) {
    const { state, work, repoConfig } = ctx;
    const scan = javaScan(state.scan)!;
    const route = state.route!;
    const buildTool = buildToolOf(state);
    const exclusions = rewriteExclusions(ctx);
    const plan = route.recipePlan as RecipeStep[];
    ctx.begin("rewrite", `${plan.length} recipe(s) in the plan`);
    const record = (step: RecipeStep, patch: Partial<RunState["recipes"][number]>) => {
      state.recipes.push({ ...step, ran: false, reason: "", ok: true, exitCode: null, durationMs: 0, changedFiles: [], commit: null, ...patch });
    };
    // Decide every step against the original project (no recipe has run yet), then run
    // the chosen ones in ONE invocation: they all see the original, compiling sources.
    const chosen: Array<{ step: RecipeStep; reason: string }> = [];
    for (const step of plan) {
      const javax = step.when === "javaxFiles" ? scanJavax(work, repoConfig.excludeModules).javaxFiles.length : scan.javaxFiles.length;
      const decision = shouldRun(step, { javaVersion: scan.javaVersion, bootPresent: Boolean(scan.springBootVersion), javaxFiles: javax }, route.targetJava);
      if (!decision.run) {
        record(step, { reason: decision.reason });
        ctx.event("rewrite", `Skipped ${step.recipe}: ${decision.reason}`);
      } else chosen.push({ step, reason: decision.reason });
    }
    if (chosen.length) {
      ctx.event("rewrite", `Running ${chosen.length} recipe(s) in one OpenRewrite pass: ${chosen.map((entry) => entry.step.recipe.split(".").at(-1)).join(", ")}`);
      const outcome = await runRecipesLeniently(ctx, chosen.map((entry) => entry.step), exclusions, "rewrite");
      if (outcome.kind === "unavailable") {
        for (const entry of chosen) record(entry.step, { reason: "OpenRewrite could not be resolved (no network?); built-in rules used instead", exitCode: outcome.run.result.exitCode, durationMs: outcome.run.result.durationMs });
        ctx.emit();
        ctx.end("rewrite", "passed", "OpenRewrite could not be resolved; Verdigrade's built-in rules were used instead");
        return;
      }
      const { run } = outcome;
      const failedForAi = outcome.kind === "left-for-ai";
      if (run.result.ok && state.engine) state.engine.openRewrite = "ran";
      const made = run.result.ok ? await ctx.commit("rewrite", chosen.map((entry) => entry.step.recipe.split(".").at(-1) ?? entry.step.recipe).join(" + ")) : null;
      chosen.forEach((entry, index) => {
        record(entry.step, {
          ran: !failedForAi,
          reason: failedForAi ? "OpenRewrite could not compile the project; left for the AI step" : entry.reason,
          ok: run.result.ok || failedForAi,
          exitCode: run.result.exitCode,
          // One pass: the combined time and files are shown on the first recipe only.
          durationMs: index === 0 ? run.result.durationMs : 0,
          changedFiles: index === 0 ? (made?.files ?? []) : [],
          commit: index === 0 ? (made?.sha ?? null) : null,
        });
      });
      ctx.emit();
      if (failedForAi) {
        ctx.end("rewrite", "passed", "OpenRewrite could not finish (the project does not compile yet); left for the AI step");
        return;
      }
      if (!run.result.ok) {
        ctx.end("rewrite", "failed", `${run.recipe.split(",").map((name) => name.split(".").at(-1)).join(", ")} failed`);
        throw new StepFailed(`${chosen[0].step.recipe}${chosen.length > 1 ? ` (+${chosen.length - 1} more)` : ""} failed (${run.result.failure ?? `exit ${run.result.exitCode}`}).`);
      }
    }
    const ranCount = state.recipes.filter((item) => item.ran).length;
    ctx.end("rewrite", "passed", `${ranCount} recipe(s) applied, ${state.steps.rewrite.changedFiles.length} file(s) changed`);
  },

  async modernize(ctx) {
    const { state, work, repoConfig } = ctx;
    const scan = javaScan(state.scan)!;
    const packs = state.route!.rulePacks.map((id) => loadModernizerRules(id));
    ctx.begin("modernize", `Rules packs: ${packs.map((pack) => pack.id).join(", ")}`);
    const merged = mergeRules(packs);
    // What the type-aware OpenRewrite recipe leaves (a javax name in a comment, a string or a config file):
    // renamed deterministically, so the "no Jakarta EE javax references" check can pass.
    const renameLeftovers = async () => {
      if (!merged.javaxToJakarta) return;
      const left = scanJavax(work, repoConfig.excludeModules).javaxFiles;
      if (!left.length) return;
      const edits = renameJavaxReferences(work, left, ctx.locks.patterns.length ? ctx.locks.isLocked : undefined);
      for (const edit of edits) state.ruleEdits.push({ file: edit.file, rule: "javaxToJakarta", detail: `renamed ${edit.references} leftover javax reference(s) to jakarta`, applied: true });
      if (edits.length) ctx.event("modernize", `Renamed leftover Jakarta EE javax references in ${edits.length} file(s): ${edits.slice(0, 3).map((edit) => edit.file).join(", ")}${edits.length > 3 ? ", …" : ""}`);
      ctx.emit();
    };
    const modules = scan.modules.map((item) => item.path);
    const buildFiles = scan.modules.map((item) => item.buildFile).filter((file) => /(pom\.xml|build\.gradle(\.kts)?)$/.test(file));
    state.ruleEdits = applyRules(work, merged, { modules, buildFiles, write: true, isLocked: ctx.locks.patterns.length ? ctx.locks.isLocked : undefined });
    ctx.emit();
    if (merged.javaxToJakarta && merged.jakartaRecipe) {
      const left = scanJavax(work, repoConfig.excludeModules).javaxFiles.length;
      if (left > 0 && state.engine?.openRewrite === "unavailable") {
        ctx.event("modernize", `${left} file(s) still use Jakarta EE javax packages; OpenRewrite is unavailable, so they are left for follow-up`, "warning");
      } else if (left > 0) {
        ctx.event("modernize", `${left} file(s) still use Jakarta EE javax packages; running ${merged.jakartaRecipe.recipe}`);
        const outcome = await runRecipesLeniently(ctx, [merged.jakartaRecipe], rewriteExclusions(ctx), "modernize");
        const run = outcome.run;
        state.steps.modernize.command = run.result.command;
        state.steps.modernize.exitCode = run.result.exitCode;
        if (outcome.kind === "unavailable") {
          openRewriteUnavailable(ctx, merged.jakartaRecipe.recipe);
          await renameLeftovers();
          await ctx.commit("modernize", `rules ${merged.id}`);
          ctx.end("modernize", "passed", "Built-in rules applied; the javax -> jakarta OpenRewrite recipe could not be resolved (no network?)");
          return;
        }
        if (outcome.kind === "left-for-ai") {
          await renameLeftovers();
          await ctx.commit("modernize", `rules ${merged.id}`);
          ctx.end("modernize", "passed", "Built-in rules applied; the javax -> jakarta recipe could not compile the project yet, so the AI step and build fix-up rounds handle what is left");
          return;
        }
        if (run.result.ok && state.engine) state.engine.openRewrite = "ran";
        if (!run.result.ok) throw new StepFailed(`${merged.jakartaRecipe.recipe} failed (${run.result.failure ?? `exit ${run.result.exitCode}`}).`);
        state.ruleEdits.push({ file: "(OpenRewrite)", rule: "javaxToJakarta", detail: merged.jakartaRecipe.recipe, applied: true });
      }
    }
    await renameLeftovers();
    await ctx.commit("modernize", `rules ${merged.id}`);
    const appliedEdits = state.ruleEdits.filter((edit) => edit.applied).length;
    ctx.end("modernize", "passed", appliedEdits ? `${appliedEdits} checklist edit(s)` : "No checklist items remained");
  },

  testSummary() {
    return "Running the test suite";
  },

  async runTests(ctx) {
    const build = await runBuild(ctx.work, buildToolOf(ctx.state), "test", ctx.exec("test"));
    return {
      ok: build.result.ok,
      exitCode: build.result.exitCode,
      failure: build.result.failure,
      command: build.result.command,
      firstFailure: build.failure,
      outputTail: build.result.output,
      tests: build.tests,
    };
  },

  packageSummary(state) {
    return buildToolOf(state) === "maven" ? "mvn package -DskipTests" : "gradle assemble";
  },

  async runPackage(ctx) {
    const packaged = await runBuild(ctx.work, buildToolOf(ctx.state), "package", ctx.exec("package"));
    return {
      ok: packaged.result.ok,
      exitCode: packaged.result.exitCode,
      failure: packaged.result.failure,
      command: packaged.result.command,
      artifacts: packaged.artifacts,
      summary: `exit 0; ${packaged.artifacts.map((item) => path.basename(item)).join(", ") || "no artifact reported"}`,
    };
  },

  async checks(ctx) {
    const { state } = ctx;
    const before = javaScan(state.scan)!;
    const after: ScanResult = scanProject(state.workPath, { excludeModules: loadRepoConfig(state.workPath).excludeModules });
    state.scanAfter = after;
    state.after = { java: after.javaVersion, boot: after.springBootVersion };
    const checks: CheckResult[] = [];
    const route = state.route!;
    const javaAfter = normalizeJava(after.javaVersion);
    checks.push({
      id: "java-level",
      ok: javaAfter !== "unknown" && Number(javaAfter) >= Number(route.targetJava),
      level: "error",
      message: `Java level is ${after.javaVersion ?? "unknown"} (target ${route.targetJava}).`,
    });
    if (route.targetBoot !== "none" && before.springBootVersion) {
      const prefix = route.targetBoot.replace(/x$/, "");
      checks.push({
        id: "boot-version",
        ok: Boolean(after.springBootVersion?.startsWith(prefix)),
        level: "error",
        message: `Spring Boot is ${after.springBootVersion ?? "unknown"} (target ${route.targetBoot}${route.parentHint ? `, hint ${route.parentHint}` : ""}).`,
      });
    }
    if (route.targetBoot !== "none") {
      checks.push({
        id: "jakarta",
        ok: after.javaxFiles.length === 0,
        level: "error",
        message: after.javaxFiles.length
          ? `${after.javaxFiles.length} file(s) still reference Jakarta EE javax packages (${after.javaxFiles.slice(0, 5).join(", ")}).`
          : "No Jakarta EE javax references remain.",
      });
    }
    const buildText = after.modules.map((module) => readIfExists(path.join(state.workPath, module.buildFile))).join("\n");
    for (const bad of knownBadDependencies) {
      if (bad.pattern.test(buildText)) checks.push({ id: "dependency", ok: false, level: bad.level, message: bad.message });
    }
    state.versions = javaVersions(state);
    return { checks, followUps: findFollowUps(state.workPath, state) };
  },

  plan(input) {
    return javaPlan(input);
  },

  fixupFacts(state) {
    return [`Route ${state.route?.id}: Java ${state.route?.targetJava}, Spring Boot ${state.route?.targetBoot}.`];
  },
};


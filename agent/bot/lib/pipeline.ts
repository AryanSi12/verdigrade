import { sourceForPath } from "./github.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { adapterFor, detectEcosystem, getAdapter } from "./adapters/index.js";
import { StepFailed, type StepContext, type TargetRequest } from "./adapters/types.js";
import { dataDir, defaultFixRounds, defaultTimeoutMinutes, samplesRoot } from "./config.js";
import { retainOrRemoveDryCopy } from "./dryCopies.js";
import { createWorkCopy, GitSafety, type Commit } from "./git.js";
import { checkJarPage, describeProblems, hasStaticFrontend, readFrontendSources } from "./pageCheck.js";
import { findRunnableJar } from "./previewKit.js";
import { configuredModel, defaultAiAttempts, initialEngineRun, recordAiCall, type Engine, type RunEstimate, type TokenUsage } from "./engine.js";
import { createLockSet, registerLocks } from "./locks.js";
import { applyChanges, keptChanges } from "./planFix.js";
import { RingBuffer } from "./process.js";
import { runRefactorStep } from "./refactor.js";
import { loadRepoConfig } from "./repoConfig.js";
import { isInside, registerWorkRoot, safeRealpath } from "./repo.js";
import { reportJson, reportMarkdown } from "./report.js";
import { stepLabels, stepOrder, type Ecosystem, type PageCheckState, type PlanAiItem, type RunPlanInfo, type RunState, type StepId, type StepState } from "./types.js";

// Kept here so existing imports (tests, tools) keep working; the logic lives in the Java adapter.
export { shouldRun } from "./adapters/java.js";

export type FixerContext = {
  /**
   * "upgrade": the Full AI engine's initial upgrade of the project.
   * "items": Hybrid's AI step, after OpenRewrite: change the plan items labelled "AI".
   * "fix": a build/test fix-up round.
   * "refactor": the refactors picked in the plan's quiz, after the upgrade passed its tests.
   */
  phase: "upgrade" | "items" | "fix" | "refactor";
  /** For phase "fix": what failed. "tests" (default) = the build or test step; "checks" = the post-run checks (build and tests passed); "page" = the page check found problems in the running page (Full AI only). */
  reason?: "tests" | "checks" | "page";
  runId: string;
  workPath: string;
  round: number;
  failure: string;
  logTail: string;
  state: RunState;
  /** Plan items the AI should change ("items" phase; also passed to "upgrade" as known risk areas). */
  items?: PlanAiItem[];
  /** Refactors picked in the plan ("refactor" phase). */
  refactors?: RunPlanInfo["refactors"];
};

export type FixerResult = {
  status: "finished" | "error";
  note: string;
  sessionId: string | null;
  /** Model that answered and its token usage, when the SDK reports them. */
  model?: string | null;
  usage?: TokenUsage | null;
};

/** The only place a model touches the pipeline: diagnose and patch a failing test step. */
export type Fixer = (context: FixerContext) => Promise<FixerResult>;

export type PipelineOptions = {
  runId: string;
  repoPath: string;
  dryRun: boolean;
  /** "java" | "node"; detected from the folder when omitted. */
  ecosystem?: Ecosystem;
  targetJava?: string;
  targetBoot?: string;
  fromJava?: string;
  fromBoot?: string;
  /** Ecosystem-neutral targets/from, e.g. { node: "24", typescript: "6.0" }. Java keys mirror targetJava/targetBoot. */
  targets?: Record<string, string | undefined>;
  from?: Record<string, string | undefined>;
  /** The approved plan: its locked paths are enforced after every step and its follow-ups go into the report. */
  plan?: RunPlanInfo | null;
  allowDirty?: boolean;
  skipTests?: boolean;
  fixRounds?: number;
  /** Upgrade engine; default Hybrid (Classic when no `fixer` is given). */
  engine?: Engine;
  /** "auto" uses the repository's git when it is a work tree (not a bundled sample). */
  gitMode?: "auto" | "shadow";
  fixer?: Fixer;
  /** Token estimate made from the plan before the run; recorded next to the actual usage. */
  estimate?: RunEstimate;
  onChange?: (state: RunState) => void;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  /** Override where logs, reports and shadow git dirs go. */
  artifactsDir?: string;
};

const pageFixRounds = 2;
const logTailChars = 16_000;
const diffCap = 1_500_000;
const lockedRuleNote = "(not applied: the file is locked by the migration plan)";

function now(): string {
  return new Date().toISOString();
}

function readIfExists(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function compact(record: Record<string, string | undefined | null>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).filter((entry): entry is [string, string] => Boolean(entry[1])));
}

function blankStep(id: StepId, label: string): StepState {
  return {
    id,
    label,
    status: "waiting",
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    exitCode: null,
    command: null,
    summary: "",
    logTail: "",
    logFile: null,
    commit: null,
    changedFiles: [],
  };
}

type StateOptions = Pick<
  PipelineOptions,
  "runId" | "repoPath" | "dryRun" | "ecosystem" | "targetJava" | "targetBoot" | "fromJava" | "fromBoot" | "targets" | "from" | "plan" | "artifactsDir" | "engine" | "fixer" | "fixRounds" | "estimate"
>;

function requestedTargets(options: StateOptions): { targets: Record<string, string>; from: Record<string, string> } {
  return {
    targets: compact({ ...(options.targets ?? {}), java: options.targetJava || options.targets?.java, boot: options.targetBoot || options.targets?.boot }),
    from: compact({ ...(options.from ?? {}), java: options.fromJava || options.from?.java, boot: options.fromBoot || options.from?.boot }),
  };
}

export function createRunState(options: StateOptions): RunState {
  const ecosystem = options.ecosystem ?? detectEcosystem(options.repoPath) ?? "java";
  const labels = { ...stepLabels, ...getAdapter(ecosystem).stepLabels };
  const steps = {} as Record<StepId, StepState>;
  for (const id of stepOrder) steps[id] = blankStep(id, labels[id]);
  const request = requestedTargets(options);
  return {
    runId: options.runId,
    repoPath: options.repoPath,
    workPath: options.repoPath,
    dryRun: options.dryRun,
    ecosystem,
    status: "running",
    startedAt: now(),
    finishedAt: null,
    durationMs: null,
    error: null,
    request: {
      targetJava: options.targetJava ?? "",
      targetBoot: options.targetBoot ?? "",
      fromJava: options.fromJava || null,
      fromBoot: options.fromBoot || null,
      targets: request.targets,
      from: request.from,
    },
    route: null,
    from: { java: null, boot: null, source: "unknown" },
    after: null,
    buildTool: null,
    wrapper: false,
    steps,
    scan: null,
    scanAfter: null,
    versions: [],
    plan: options.plan ?? null,
    source: sourceForPath(options.repoPath),
    engine: { ...initialEngineRun({ engine: options.engine, hasAi: Boolean(options.fixer), ecosystem, maxRounds: options.fixRounds ?? (options.engine === "ai" ? defaultAiAttempts() : defaultFixRounds()) }), ...(options.estimate ? { estimate: options.estimate } : {}) },
    lockViolations: [],
    recipes: [],
    ruleEdits: [],
    fixRounds: [],
    tests: null,
    artifacts: [],
    checks: [],
    followUps: [],
    warnings: [],
    git: { mode: "none", branch: null, originalBranch: null, baseCommit: null, headCommit: null, shadowGitDir: null, commits: [], rolledBack: false },
    changedFiles: [],
    diffChars: 0,
    diffTruncated: false,
    artifactsDir: options.artifactsDir ?? path.join(dataDir(), "runs", options.runId),
    narrative: { status: "pending", text: "", sessionId: null },
    events: [],
  };
}

/**
 * The deterministic migration pipeline, shared by every ecosystem:
 * preflight → scan → rewrite (OpenRewrite / codemods) → modernize (rules) →
 * test (with optional model fix-up) → package → checks → report. The language
 * adapter supplies each step's ecosystem work; this driver owns ordering, the
 * git safety net, locked-path enforcement, the fix-up loop and the report.
 * Pass/fail comes only from exit codes and checks.
 */
export async function runPipeline(options: PipelineOptions): Promise<RunState> {
  const state = createRunState(options);
  const started = Date.now();
  const emit = () => options.onChange?.(state);
  let preFixCommit: string | null = null;
  const event = (step: StepId | null, message: string, level: "info" | "warning" | "error" = "info") => {
    state.events.push({ index: state.events.length, at: now(), step, level, message });
    if (state.events.length > 500) state.events.splice(0, state.events.length - 500);
    emit();
  };
  mkdirSync(path.join(state.artifactsDir, "logs"), { recursive: true });
  const env = options.env ?? process.env;
  const locks = createLockSet(options.plan?.lockedPaths ?? []);
  let git: GitSafety | null = null;
  let unregister: (() => void) | null = null;
  let unregisterLocks: (() => void) | null = null;
  let timeoutMs = defaultTimeoutMinutes() * 60_000;
  let current: StepId | null = null;

  const begin = (id: StepId, summary = "") => {
    const step = state.steps[id];
    step.status = "running";
    step.startedAt = now();
    step.summary = summary;
    step.logFile = path.join(state.artifactsDir, "logs", `${stepOrder.indexOf(id) + 1}-${id}.log`);
    current = id;
    event(id, `${step.label} started`);
    return step;
  };
  const end = (id: StepId, status: StepState["status"], summary?: string) => {
    const step = state.steps[id];
    step.status = status;
    step.finishedAt = now();
    step.durationMs = step.startedAt ? Date.now() - Date.parse(step.startedAt) : null;
    if (summary !== undefined) step.summary = summary;
    current = null;
    event(id, `${step.label} ${status}${step.summary ? `: ${step.summary}` : ""}`, status === "failed" ? "error" : "info");
  };
  const skip = (id: StepId, why: string) => {
    if (state.steps[id].status !== "waiting") return;
    state.steps[id].status = "skipped";
    state.steps[id].summary = why;
  };
  const tailFor = (id: StepId) => {
    const ring = new RingBuffer(logTailChars);
    ring.push(state.steps[id].logTail);
    let last = 0;
    return (chunk: string) => {
      ring.push(chunk);
      state.steps[id].logTail = ring.toString();
      if (Date.now() - last > 500) {
        last = Date.now();
        emit();
      }
    };
  };
  const exec = (id: StepId) => ({
    timeoutMs,
    logFile: state.steps[id].logFile ?? undefined,
    onOutput: tailFor(id),
    signal: options.signal,
    env,
  });
  /** Revert anything a step did to locked paths, record it, then commit the rest. */
  const commit = async (id: StepId, message: string): Promise<Commit | null> => {
    if (!git) return null;
    const reverted = await git.revertLocked(locks);
    for (const item of reverted) {
      state.lockViolations.push({ step: id, ...item });
      event(id, `${item.file} is locked by the plan (${item.pattern}); the change was ${item.action === "restored" ? "reverted" : "removed"}`, "warning");
    }
    const made = await git.commitStep(id, message);
    if (made) {
      state.git.commits.push(made);
      state.git.headCommit = made.sha;
      state.steps[id].commit = made.sha;
      state.steps[id].changedFiles = [...new Set([...state.steps[id].changedFiles, ...made.files])];
      emit();
    }
    return made;
  };

  /** Record one model call (tokens and model) on the run. */
  const recordAi = (result: FixerResult) => {
    if (state.engine) recordAiCall(state.engine, { model: result.model ?? configuredModel(), usage: result.usage });
  };

  const adapter = (() => {
    try {
      return adapterFor(options.repoPath, options.ecosystem ?? state.ecosystem);
    } catch {
      return getAdapter(state.ecosystem);
    }
  })();
  const repoConfig = (() => {
    try {
      return loadRepoConfig(options.repoPath);
    } catch (error) {
      return error as Error;
    }
  })();
  const ctx = (work: string): StepContext => ({
    state,
    work,
    repoConfig: repoConfig instanceof Error ? loadRepoConfig(work) : repoConfig,
    env,
    signal: options.signal,
    locks,
    begin,
    end,
    skip,
    event,
    emit,
    exec,
    commit,
    timeoutMs: () => timeoutMs,
  });

  try {
    // ---- preflight ------------------------------------------------------
    const pre = begin("preflight", "Checking tools, targets and the git safety net");
    // First, before anything path- or project-related: the AI engine cannot run without a model.
    if (state.engine?.engine === "ai" && !options.fixer) {
      throw new StepFailed("The AI engine needs a model login (CURSOR_API_KEY or \"npx agent-sdk login\"). Choose Classic to run without AI.");
    }
    if (repoConfig instanceof Error) throw new StepFailed(repoConfig.message);
    if (!adapter.detect(options.repoPath)) throw new StepFailed(`${options.repoPath} does not look like a ${adapter.label} project.`);
    const request = requestedTargets(options);
    const targets = adapter.resolveTargets(request, repoConfig);
    if (!targets.ok) throw new StepFailed(targets.error);
    state.request.targets = targets.targets;
    if (adapter.id === "java") {
      state.request.targetJava = targets.targets.java;
      state.request.targetBoot = targets.targets.boot;
    }
    timeoutMs = (targets.timeoutMinutes ?? repoConfig.timeoutMinutes ?? defaultTimeoutMinutes()) * 60_000;
    const tools = await adapter.preflight(ctx(options.repoPath), targets);
    pre.logTail = tools.log.slice(-logTailChars);
    pre.command = tools.command;
    state.buildTool = tools.buildTool;
    state.wrapper = tools.wrapper;

    if (options.dryRun) {
      state.workPath = createWorkCopy(options.repoPath, adapter.workCopySkip);
      unregister = registerWorkRoot(state.workPath);
      git = await GitSafety.openShadow(state.workPath, path.join(path.dirname(state.workPath), "shadow.git"), adapter.ignorePatterns);
      event("preflight", `Dry run: working on a temporary copy at ${state.workPath}`);
    } else {
      const underSamples = isInside(safeRealpath(samplesRoot), safeRealpath(options.repoPath));
      const useRepoGit = options.gitMode !== "shadow" && !underSamples && (await GitSafety.isWorkTree(options.repoPath));
      if (useRepoGit) {
        git = await GitSafety.openRepo(options.repoPath, { branchName: `migrate/${targets.routeId}`, allowDirty: options.allowDirty });
        event("preflight", `Created branch ${git.branch}`);
      } else {
        git = await GitSafety.openShadow(options.repoPath, path.join(state.artifactsDir, "shadow.git"), adapter.ignorePatterns);
        event("preflight", "Not a git work tree (or a bundled sample): tracking changes in a private shadow git dir; rollback is available.");
      }
    }
    unregisterLocks = registerLocks(state.workPath, locks);
    if (locks.patterns.length) event("preflight", `Plan ${options.plan?.planId}: ${locks.patterns.length} locked path(s) will be kept unchanged`);
    state.git.mode = git.mode;
    state.git.branch = git.branch;
    state.git.originalBranch = git.originalBranch;
    state.git.baseCommit = git.baseCommit;
    state.git.headCommit = git.baseCommit;
    state.git.shadowGitDir = git.shadowGitDir;
    pre.exitCode = 0;
    end("preflight", "passed", `${tools.summary}, git ${git.mode === "repo" ? `branch ${git.branch}` : "shadow"}`);

    // ---- scan, rewrite, modernize (adapter-owned) ------------------------
    const step = ctx(state.workPath);
    await adapter.scan(step, targets);
    // The AI engine replaces the deterministic rewrite and modernize steps with one AI upgrade.
    const aiEngine = state.engine?.engine === "ai";
    if (aiEngine && options.fixer) {
      const rewrite = begin("rewrite", "The AI agent upgrades the project (no OpenRewrite in this engine)");
      rewrite.label = "AI upgrade";
      let outcome: FixerResult;
      try {
        outcome = await options.fixer({ phase: "upgrade", runId: state.runId, workPath: state.workPath, round: 0, failure: "", logTail: "", state, items: options.plan?.aiItems });
      } catch (error) {
        outcome = { status: "error", note: (error as Error).message, sessionId: null };
      }
      recordAi(outcome);
      if (state.engine) state.engine.ai.upgraded = outcome.status === "finished";
      const made = await commit("rewrite", "AI upgrade");
      state.fixRounds.push({ round: 0, status: outcome.status, note: `AI upgrade: ${outcome.note}`.slice(0, 2000), changedFiles: made?.files ?? [], sessionId: outcome.sessionId });
      rewrite.exitCode = outcome.status === "finished" ? 0 : 1;
      if (outcome.status !== "finished") {
        end("rewrite", "failed", outcome.note || "The AI upgrade did not finish");
        throw new StepFailed(`The AI upgrade did not finish: ${outcome.note || "unknown error"}`);
      }
      end("rewrite", "passed", `AI agent changed ${made?.files.length ?? 0} file(s)`);
      skip("modernize", "AI engine: the AI agent made the changes instead of the rules packs");
    } else {
      await adapter.rewrite(step);
    }
    // "Fix with AI" edits the reviewer kept in plan mode go in right after the rewrite tools:
    // they are written for the target versions (applying them earlier breaks the recipe's own
    // compile), and they are merged with whatever the recipe changed in the same file.
    const preFixes = options.plan?.aiPreFixes ?? [];
    if (preFixes.length && options.plan) {
      for (const { fixId, changes } of keptChanges(options.plan.planId, preFixes.map((fix) => fix.fixId))) {
        const title = preFixes.find((fix) => fix.fixId === fixId)?.title ?? fixId;
        const result = applyChanges(state.workPath, changes, { merge: true });
        if (result.applied.length) event("rewrite", `AI pre-fix applied (${title}): ${result.applied.join(", ")}`);
        if (result.skipped.length) event("rewrite", `AI pre-fix skipped for ${result.skipped.join(", ")} (${title}): it could not be merged`, "warning");
      }
      // Committed directly (not through the lock revert): these are the reviewer's own kept edits,
      // and the lock check below compares against this commit, so locked files keep the fixed version.
      const made = git ? await git.commitStep("rewrite", `AI pre-fixes from plan ${options.plan.planId}`) : null;
      if (made) {
        preFixCommit = made.sha;
        state.git.commits.push(made);
        state.git.headCommit = made.sha;
        state.steps.rewrite.changedFiles = [...new Set([...state.steps.rewrite.changedFiles, ...made.files])];
        emit();
      }
    }
    if (!aiEngine) await adapter.modernize(step);
    // Hybrid's AI step: the free tools have run; now the AI changes every plan item labelled "AI"
    // (one bounded call), then the build/test rounds below fix whatever still fails.
    const aiItems = options.plan?.aiItems ?? [];
    if (state.engine?.engine === "hybrid" && options.fixer && aiItems.length) {
      event(null, `AI step: changing ${aiItems.length} plan item(s) the free tools cannot fix`);
      let outcome: FixerResult;
      try {
        outcome = await options.fixer({ phase: "items", runId: state.runId, workPath: state.workPath, round: 0, failure: "", logTail: "", state, items: aiItems });
      } catch (error) {
        outcome = { status: "error", note: (error as Error).message, sessionId: null };
      }
      recordAi(outcome);
      const made = await commit("test", "AI plan items");
      state.fixRounds.push({ round: 0, status: outcome.status, note: `AI plan items: ${outcome.note}`.slice(0, 2000), changedFiles: made?.files ?? [], sessionId: outcome.sessionId });
      if (outcome.status !== "finished") event(null, `The AI step did not finish (${outcome.note || "unknown error"}); the build and tests decide what happens next`, "warning");
      emit();
    }
    for (const edit of state.ruleEdits) {
      if (edit.detail.endsWith(lockedRuleNote)) {
        const pattern = locks.match(edit.file) ?? "";
        state.lockViolations.push({ step: "modernize", file: edit.file, pattern, action: "skipped" });
      }
    }

    // ---- test (+ model fix-up) -----------------------------------------
    const skipTests = options.skipTests ?? step.repoConfig.skipTests;
    if (skipTests) {
      skip("test", "Skipped by configuration (skipTests)");
      state.warnings.push("Tests were skipped by configuration; the package step does not prove behaviour.");
      emit();
    } else {
      begin("test", adapter.testSummary(state));
      // Classic never calls the model; AI and Hybrid get a bounded number of build/test-fix rounds.
      const fixer = state.engine?.engine === "classic" ? undefined : options.fixer;
      const maxRounds = fixer ? options.fixRounds ?? step.repoConfig.fixRounds ?? (aiEngine ? defaultAiAttempts() : defaultFixRounds()) : 0;
      if (state.engine) state.engine.ai.maxRounds = maxRounds;
      let build = await adapter.runTests(step);
      for (let round = 1; !build.ok && build.failure !== "cancelled" && round <= maxRounds && fixer; round += 1) {
        event("test", `Tests failed; asking the model for fix-up round ${round} of ${maxRounds}`, "warning");
        let outcome: FixerResult;
        try {
          outcome = await fixer({
            phase: "fix",
            runId: state.runId,
            workPath: state.workPath,
            round,
            failure: build.firstFailure,
            logTail: build.outputTail.slice(-12_000),
            state,
          });
        } catch (error) {
          outcome = { status: "error", note: (error as Error).message, sessionId: null };
        }
        recordAi(outcome);
        if (state.engine) state.engine.ai.roundsUsed = round;
        const made = await commit("test", `model fix-up round ${round}`);
        state.fixRounds.push({ round, status: outcome.status, note: outcome.note, changedFiles: made?.files ?? [], sessionId: outcome.sessionId });
        emit();
        if (!made) {
          event("test", `Fix-up round ${round} changed no files; stopping retries`, "warning");
          break;
        }
        build = await adapter.runTests(step);
      }
      const tests = build.tests;
      state.tests = {
        ok: build.ok,
        exitCode: build.exitCode,
        testsRun: tests?.testsRun ?? null,
        failures: tests?.failures ?? null,
        errors: tests?.errors ?? null,
        skipped: tests?.skipped ?? null,
        testSets: tests?.testSets ?? [],
        source: tests?.source ?? "none",
        firstFailure: build.firstFailure,
      };
      state.steps.test.exitCode = build.exitCode;
      state.steps.test.command = build.command;
      const counts = tests ? `${tests.testsRun} run, ${tests.failures} failed, ${tests.errors} errors, ${tests.skipped} skipped` : "no test report found";
      if (!build.ok) {
        end("test", "failed", `exit ${build.exitCode ?? build.failure}; ${counts}`);
        throw new StepFailed(`Tests failed (exit ${build.exitCode ?? build.failure}).`);
      }
      end("test", "passed", `exit 0; ${counts}`);
    }

    // ---- refactor (plan quiz picks; after the upgrade passed) ----------------
    {
      const picks = options.plan?.refactors ?? [];
      const fixer = state.engine?.engine === "classic" ? undefined : options.fixer;
      if (picks.length && skipTests) {
        skip("refactor", "Tests are skipped by configuration, so the picked refactors could not be verified");
        state.warnings.push(`The plan picked ${picks.length} refactor(s), but tests are skipped by configuration, so they were not applied.`);
      } else if (picks.length && fixer && !git) {
        skip("refactor", "No git safety net for this run, so refactors were not applied");
        state.warnings.push(`The plan picked ${picks.length} refactor(s), but they need git to undo a bad refactor; they were not applied.`);
      } else {
        if (picks.length && fixer) begin("refactor", `${picks.length} refactor(s) from the plan, verified by build and tests`);
        const outcome = await runRefactorStep(picks, Boolean(fixer), {
          apply: async () => {
            event("refactor", `Asking the AI to apply ${picks.length} refactor(s): ${picks.map((pick) => pick.title).join("; ")}`);
            let result: FixerResult;
            try {
              result = await fixer!({ phase: "refactor", runId: state.runId, workPath: state.workPath, round: 0, failure: "", logTail: "", state, refactors: picks });
            } catch (error) {
              result = { status: "error", note: (error as Error).message, sessionId: null };
            }
            recordAi(result);
            return { finished: result.status === "finished", note: result.note };
          },
          commit: async () => {
            const made = await commit("refactor", `refactors picked in plan ${options.plan?.planId ?? ""}`.trim());
            return made ? { sha: made.sha, files: made.files } : null;
          },
          verify: async () => {
            event("refactor", "Verifying the refactor with the build and tests (output in the test log)");
            const check = await adapter.runTests(step);
            return { ok: check.ok, detail: check.ok ? "passed" : (check.firstFailure || `exit ${check.exitCode ?? check.failure}`).slice(0, 200) };
          },
          revert: async (sha) => {
            const undone = await git!.revertCommit(sha, "refactor", "revert refactors that broke the build or tests");
            if (undone) {
              state.git.commits.push(undone);
              state.git.headCommit = undone.sha;
            }
            state.steps.refactor.changedFiles = [];
            event("refactor", "The refactor broke the build or tests; reverted it", "warning");
          },
        });
        if (outcome.warning) state.warnings.push(outcome.warning);
        if (state.steps.refactor.status === "running") end("refactor", outcome.status, outcome.summary);
        else skip("refactor", outcome.summary);
      }
      emit();
    }

    // ---- package ----------------------------------------------------------
    begin("package", adapter.packageSummary(state));
    const packaged = await adapter.runPackage(step);
    if (packaged.skipped) {
      state.steps.package.status = "skipped";
      state.steps.package.finishedAt = now();
      state.steps.package.summary = packaged.skipped;
      current = null;
      event("package", `Package skipped: ${packaged.skipped}`);
    } else {
      state.steps.package.exitCode = packaged.exitCode;
      state.steps.package.command = packaged.command;
      state.artifacts = dryRunArtifacts(packaged.artifacts, options.dryRun);
      if (!packaged.ok) {
        end("package", "failed", `exit ${packaged.exitCode ?? packaged.failure}`);
        throw new StepFailed(`Packaging failed (exit ${packaged.exitCode ?? packaged.failure}).`);
      }
      end("package", "passed", packaged.summary ?? `exit 0; ${packaged.artifacts.map((item) => path.basename(item)).join(", ") || "no artifact reported"}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.error = options.signal?.aborted ? "Cancelled." : message;
    if (current) end(current, "failed", message);
    else event(null, message, "error");
  }

  // ---- checks (always, best effort) -------------------------------------
  try {
    if (state.scan && state.route) {
      begin("checks", "Verifying the target was reached");
      const evaluate = async () => {
        const outcome = await adapter.checks(ctx(state.workPath));
        const checks = outcome.checks;
        if (locks.patterns.length && git) {
          const touched = (await git.changedFiles(preFixCommit ?? undefined)).filter((file) => locks.isLocked(file));
          checks.push({
            id: "locked-paths",
            ok: touched.length === 0,
            level: "error",
            message: touched.length
              ? `Locked paths changed: ${touched.slice(0, 5).join(", ")}.`
              : `${locks.patterns.length} locked path pattern(s) unchanged${state.lockViolations.length ? ` (${state.lockViolations.length} change(s) reverted or skipped)` : ""}.`,
          });
        }
        state.checks = checks;
        state.followUps = outcome.followUps;
        return checks.filter((check) => !check.ok && check.level === "error");
      };
      let failedChecks = await evaluate();
      // Hybrid / Full AI: a failed check (for example leftover javax references) gets the same bounded
      // AI fix-up as a failed build, but only when the build, tests and package themselves passed.
      const checkFixer = state.engine?.engine === "classic" ? undefined : options.fixer;
      if (failedChecks.length && !state.error && checkFixer && state.engine) {
        const step = ctx(state.workPath);
        while (failedChecks.length && state.engine.ai.roundsUsed < state.engine.ai.maxRounds) {
          const round = state.engine.ai.roundsUsed + 1;
          event("checks", `Checks failed; asking the model for fix-up round ${round} of ${state.engine.ai.maxRounds}`, "warning");
          const failure = failedChecks.map((check) => check.message).join("\n");
          let outcome: FixerResult;
          try {
            outcome = await checkFixer({ phase: "fix", reason: "checks", runId: state.runId, workPath: state.workPath, round, failure, logTail: failure, state });
          } catch (error) {
            outcome = { status: "error", note: (error as Error).message, sessionId: null };
          }
          recordAi(outcome);
          state.engine.ai.roundsUsed = round;
          const made = await commit("checks", `model fix-up round ${round} (checks)`);
          state.fixRounds.push({ round, status: outcome.status, note: `Checks: ${outcome.note}`.slice(0, 2000), changedFiles: made?.files ?? [], sessionId: outcome.sessionId });
          emit();
          if (!made) {
            event("checks", `Fix-up round ${round} changed no files; stopping retries`, "warning");
            break;
          }
          // The fix must not break the build: re-run the tests (and package) before judging the checks again.
          if (!(options.skipTests ?? step.repoConfig.skipTests)) {
            const again = await adapter.runTests(step);
            if (!again.ok) {
              state.error = `Tests failed after the checks fix-up (exit ${again.exitCode ?? again.failure}).`;
              state.tests = { ...(state.tests ?? { exitCode: null, testsRun: null, failures: null, errors: null, skipped: null, testSets: [], source: "none" as const, firstFailure: "" }), ok: false, exitCode: again.exitCode, firstFailure: again.firstFailure };
              break;
            }
            const tests = again.tests;
            if (tests && state.tests) state.tests = { ...state.tests, ok: true, exitCode: again.exitCode, testsRun: tests.testsRun, failures: tests.failures, errors: tests.errors, skipped: tests.skipped };
          }
          const repackaged = await adapter.runPackage(step);
          if (!repackaged.skipped) {
            if (!repackaged.ok) {
              state.error = `Packaging failed after the checks fix-up (exit ${repackaged.exitCode ?? repackaged.failure}).`;
              break;
            }
            state.artifacts = dryRunArtifacts(repackaged.artifacts, options.dryRun);
          }
          failedChecks = await evaluate();
        }
      }
      if (failedChecks.length && !state.error) state.error = `Checks failed: ${failedChecks.map((check) => check.message).join(" ")}`;

      // ---- page check (Java apps with a static page): start the jar, load the page, try its API calls ----------
      let pageNote = "";
      if (!failedChecks.length && !state.error && state.ecosystem === "java" && hasStaticFrontend(state.workPath)) {
        const pageStep = ctx(state.workPath);
        const tryPage = async (): Promise<Omit<PageCheckState, "initialProblems" | "rounds" | "fixAttempted"> | null> => {
          const jar = findRunnableJar(state.workPath);
          if (!jar) return null;
          event("checks", "Page check: starting the packaged app and trying the page's API calls");
          return checkJarPage({ jar, cwd: state.workPath, jdkHome: env.JAVA_HOME?.trim() || null, sources: readFrontendSources(state.workPath), signal: options.signal });
        };
        const first = await tryPage();
        if (first) {
          // Full AI also fixes what the page check finds (it reads the whole repository, the page included);
          // Hybrid's AI is limited to the plan's backend items, so Hybrid reports the problems and moves on.
          const pageFixer = state.engine?.engine === "ai" ? options.fixer : undefined;
          let page: PageCheckState = { ...first, initialProblems: first.problems.length, rounds: 0, fixAttempted: Boolean(pageFixer) };
          state.pageCheck = page;
          emit();
          event("checks", `Page check: ${page.note}`, page.problems.length ? "warning" : "info");
          for (let round = 1; pageFixer && page.ran && page.problems.length && round <= pageFixRounds && !state.error; round += 1) {
            event("checks", `Page check found ${page.problems.length} problem(s); asking the model to fix them (page round ${round} of ${pageFixRounds})`, "warning");
            const failure = describeProblems(page.problems);
            let outcome: FixerResult;
            try {
              outcome = await pageFixer({ phase: "fix", reason: "page", runId: state.runId, workPath: state.workPath, round, failure, logTail: failure, state });
            } catch (error) {
              outcome = { status: "error", note: (error as Error).message, sessionId: null };
            }
            recordAi(outcome);
            const made = await commit("checks", `model fix-up (page check) round ${round}`);
            state.fixRounds.push({ round: state.fixRounds.length + 1, status: outcome.status, note: `Page check: ${outcome.note}`.slice(0, 2000), changedFiles: made?.files ?? [], sessionId: outcome.sessionId });
            emit();
            if (!made) {
              event("checks", `Page fix-up round ${round} changed no files; stopping retries`, "warning");
              break;
            }
            // The fix must not break the build: test and package again, then look at the page again.
            if (!(options.skipTests ?? pageStep.repoConfig.skipTests)) {
              const again = await adapter.runTests(pageStep);
              if (!again.ok) {
                state.error = `Tests failed after the page check fix-up (exit ${again.exitCode ?? again.failure}).`;
                break;
              }
            }
            const repackaged = await adapter.runPackage(pageStep);
            if (!repackaged.skipped) {
              if (!repackaged.ok) {
                state.error = `Packaging failed after the page check fix-up (exit ${repackaged.exitCode ?? repackaged.failure}).`;
                break;
              }
              state.artifacts = dryRunArtifacts(repackaged.artifacts, options.dryRun);
            }
            const again = await tryPage();
            if (!again) break;
            page = { ...again, initialProblems: page.initialProblems, rounds: round, fixAttempted: true };
            state.pageCheck = page;
            emit();
            event("checks", `Page check after round ${round}: ${page.note}`, page.problems.length ? "warning" : "info");
          }
          state.pageCheck = page;
          if (page.ran) {
            state.checks.push({
              id: "page-check",
              ok: page.problems.length === 0,
              level: "warning",
              message: page.problems.length
                ? `Page check: ${page.problems.length} problem(s) on the running page. ${page.problems.slice(0, 3).map((problem) => problem.message).join(" ")}`
                : `Page check: the page loaded and its ${page.calls.filter((call) => call.status !== null).length} requests worked${page.initialProblems ? ` (after ${page.rounds} AI fix-up round(s); it first had ${page.initialProblems} problem(s))` : ""}.`,
            });
            pageNote = ` · page check: ${page.problems.length ? `${page.problems.length} problem${page.problems.length === 1 ? "" : "s"}` : "ok"}`;
            if (page.problems.length && state.engine && !page.fixAttempted) {
              state.engine.notes.push(`Page check found ${page.problems.length} problem${page.problems.length === 1 ? "" : "s"} on the running page. ${state.engine.engine === "hybrid" ? "Hybrid's AI only edits the plan's backend items, so it reports them and does not fix them; Full AI would." : "They were not fixed."}`);
            }
          } else {
            pageNote = " · page check not run";
            state.warnings.push(`Page check did not run: ${page.note}`);
          }
        }
      }
      end("checks", failedChecks.length ? "failed" : "passed", `${state.checks.filter((check) => check.ok).length}/${state.checks.length} checks ok${pageNote}`);
    }
  } catch (error) {
    state.warnings.push(`Checks could not run: ${(error as Error).message}`);
    if (state.steps.checks.status === "running") end("checks", "failed", (error as Error).message);
  }

  // The AI engines made no model call (Hybrid: the classic tools were enough): that is 0 tokens, not "unknown".
  if (state.engine && state.engine.engine !== "classic" && state.engine.ai.calls === 0) {
    state.engine.ai.tokensIn = 0;
    state.engine.ai.tokensOut = 0;
    if (state.engine.engine === "hybrid" && state.status !== "running" && !state.error) state.engine.notes.push("The AI was not needed: the classic tools alone passed.");
  }

  // ---- report -------------------------------------------------------------
  try {
    begin("report", "Writing the diff and reports");
    if (git) {
      await commit("report", "uncommitted leftovers");
      const diff = await git.diff();
      state.diffChars = diff.length;
      state.diffTruncated = diff.length > diffCap;
      writeFileSync(path.join(state.artifactsDir, "changes.diff"), diff, "utf8");
      state.changedFiles = await git.changedFiles();
      state.git.headCommit = await git.head();
    }
  } catch (error) {
    state.warnings.push(`Could not collect the diff: ${(error as Error).message}`);
  }
  for (const id of stepOrder) skip(id, state.error ? "Not run because an earlier step failed" : "Not run");
  const failed = stepOrder.some((id) => state.steps[id].status === "failed");
  state.status = failed || state.error ? "failed" : "passed";
  state.finishedAt = now();
  state.durationMs = Date.now() - started;
  try {
    writeReports(state);
    state.steps.report.exitCode = 0;
    end("report", "passed", `${state.changedFiles.length} file(s) changed; report.md and report.json written`);
  } catch (error) {
    end("report", "failed", (error as Error).message);
  }
  unregisterLocks?.();
  if (options.dryRun) {
    // The copy stays for the live preview (see dryCopies.ts); it is deleted at once when keeping is switched off.
    const kept = retainOrRemoveDryCopy(state.runId, state.workPath);
    if (kept) state.artifacts = state.artifacts.map((item) => item.replace("temporary dry-run copy, deleted after the run", "temporary dry-run copy, kept for the live preview"));
    unregister?.();
    state.git.shadowGitDir = null;
  }
  emit();
  return state;
}

function dryRunArtifacts(artifacts: string[], dryRun: boolean): string[] {
  return dryRun ? artifacts.map((item) => `${item} (temporary dry-run copy, deleted after the run)`) : artifacts;
}

export function writeReports(state: RunState): void {
  mkdirSync(state.artifactsDir, { recursive: true });
  writeFileSync(path.join(state.artifactsDir, "report.json"), `${JSON.stringify(reportJson(state), null, 2)}\n`, "utf8");
  writeFileSync(path.join(state.artifactsDir, "report.md"), reportMarkdown(state), "utf8");
}

export function readDiff(state: Pick<RunState, "artifactsDir">, cap = diffCap): { diff: string; truncated: boolean } {
  const text = readIfExists(path.join(state.artifactsDir, "changes.diff"));
  return text.length > cap ? { diff: text.slice(0, cap), truncated: true } : { diff: text, truncated: false };
}

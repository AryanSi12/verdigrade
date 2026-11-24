import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bearerAuth, defineChannel, GET, localDevStrict, POST, PUT } from "@grok/agent-sdk/channels";
import * as z from "zod/v4";
import { browsePath } from "../lib/browse.js";
import { adapterFor, adapters, detectEcosystem, getAdapter } from "../lib/adapters/index.js";
import { loadNodeMatrix, nodeMatrixView } from "../lib/adapters/nodeMatrix.js";
import { loadPythonMatrix, pythonMatrixView } from "../lib/adapters/pythonMatrix.js";
import type { LanguageAdapter, PlanStage, TargetRequest } from "../lib/adapters/types.js";
import { cancelComparison, comparisonJson, comparisonMarkdown, getComparison, listAllComparisons, startComparison } from "../lib/compare.js";
import { configuredModel, defaultAiAttempts, defaultEngine, engineLabels, engineList, recordAiCall, usesAi, type Engine, type RunEstimate } from "../lib/engine.js";
import { aiFixability, aiStatus, fixableItems, isSecretFix, keepFix, plainAiError, runFixesConcurrently, startPlanFix, undoFix, type AskModel } from "../lib/planFix.js";
import { agentRoot, allowedRoots, apiToken, defaultFixRounds, envSetting, planAiEnabled, requirePlan } from "../lib/config.js";
import { listMigrations, loadRunState } from "../lib/history.js";
import { estimateTokens } from "../lib/estimate.js";
import { chooseEngine, fixerReason, planDetails, recommendEngine, type PastRun } from "../lib/recommend.js";
import { lockedBlockers, predictImpact } from "../lib/impact.js";
import { hasStaticFrontend } from "../lib/pageCheck.js";
import { applyRefactorUpdate, generateRefactorQuiz, mergeAiQuiz, refactorInstructions, refactorQuizPrompt, refactorUpdateSchema } from "../lib/refactor.js";
import { compareEndpoint, initPreview, previewView, startPreview, stopPreview } from "../lib/preview.js";
import { validProxyPath } from "../lib/previewKit.js";
import { loadMatrix, matrixPublicView } from "../lib/matrix.js";
import {
  aiReviewSchema,
  approvePlan,
  extractJson,
  generatePlan,
  listPlans,
  parsePlanText,
  readPlanFile,
  loadPlan,
  mergeAiReview,
  planIdPattern,
  planProblem,
  planReviewPrompt,
  planSummary,
  planUpdateSchema,
  recheckPlan,
  runPlanInfo,
  savePlan,
  updatePlan,
  writePlanFile,
  type MigrationPlan,
} from "../lib/plan.js";
import { readDiff, type Fixer } from "../lib/pipeline.js";
import { reportJson, reportMarkdown } from "../lib/report.js";
import { reposDir, cloneGitHubRepo, GitHubSourceError, isGitHubInput, parseGitHubUrl, clonePathFor, type RepoSource } from "../lib/github.js";
import { assertRepo, safeRealpath } from "../lib/repo.js";
import { loadRepoConfig, repoConfigSchema } from "../lib/repoConfig.js";
import { activeRunInside, cancelRun, getRun, readLog, RepoBusyError, rollbackRun, startRun, updateRun } from "../lib/runs.js";
import { listSamples, samplesRootPath } from "../lib/samples.js";
import { stepOrder, type RunState } from "../lib/types.js";

// Fail at startup (not mid-run) when a matrix or a rules pack is invalid.
loadMatrix();
loadNodeMatrix();
loadPythonMatrix();

const token = apiToken();
const agentVersion = (() => {
  try {
    return (JSON.parse(readFileSync(path.join(agentRoot, "package.json"), "utf8")) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

const version = z.string().trim().max(20).regex(/^[0-9A-Za-z.x-]*$/, "version may only contain digits, letters, dots and dashes");
const runIdParam = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const planIdParam = z.string().regex(planIdPattern);
// /start still accepts "classic" (the deterministic stage on its own; used by tests and the CLI), but it is not offered.
const engineField = z.enum(["classic", "hybrid", "ai"]);
const choosableEngine = z.enum(engineList as [Engine, ...Engine[]]);
const ecosystemField = z.enum(adapters.map((adapter) => adapter.id) as ["java", "node", "python"]);

/** Target/from fields shared by /resolve, /plan and /start (Java keys and Node keys; the adapter reads its own). */
const targetFields = {
  ecosystem: ecosystemField.optional(),
  targetJava: version.optional(),
  targetBoot: version.optional(),
  fromJava: version.optional(),
  fromBoot: version.optional(),
  targetNode: version.optional(),
  targetTypescript: version.optional(),
  fromNode: version.optional(),
  targetPython: version.optional(),
  fromPython: version.optional(),
};

type TargetBody = { [K in keyof typeof targetFields]?: string };

function targetRequest(body: TargetBody): TargetRequest {
  return {
    targets: { java: body.targetJava, boot: body.targetBoot, node: body.targetNode, typescript: body.targetTypescript, python: body.targetPython },
    from: { java: body.fromJava, boot: body.fromBoot, node: body.fromNode, python: body.fromPython },
  };
}

/** Optional GitHub fields next to repoPath (repoPath may be a GitHub link). The token is used once and never stored. */
const githubFields = {
  branch: z.string().trim().max(200).optional(),
  subdir: z.string().trim().max(300).optional(),
  githubToken: z.string().trim().max(255).optional(),
};

/**
 * Turn repoPath into a checked local folder. A GitHub link is cloned (or the
 * existing clone reused / refreshed) into data/repos/<owner>__<repo> first.
 */
async function resolveRepoInput(
  input: string,
  options: { branch?: string; subdir?: string; githubToken?: string; refresh: boolean },
): Promise<{ repoPath: string; source: RepoSource | null }> {
  // Any other URL (GitLab, Bitbucket…) gets a clear "GitHub only" message from the parser.
  if (!isGitHubInput(input) && !/^(?:[a-z][a-z0-9+.-]*:\/\/|git@)/i.test(input.trim())) return { repoPath: await assertRepo(input), source: null };
  const source = await cloneGitHubRepo({
    url: input,
    branch: options.branch,
    subdir: options.subdir,
    token: options.githubToken,
    refresh: options.refresh,
    detect: detectEcosystem,
    beforeReset: (localPath) => {
      if (activeRunInside(localPath)) throw new GitHubSourceError("A migration is running on this repository's clone right now. Wait for it to finish, then try again.", "busy");
    },
  });
  return { repoPath: await assertRepo(source.localPath), source };
}

/** Error body; a "which project?" error also lists the folders so the screen can offer them. */
function sourceError(error: unknown): Response {
  const body: Record<string, unknown> = { ok: false, error: error instanceof Error ? error.message : String(error) };
  if (error instanceof GitHubSourceError) {
    body.code = error.code;
    if (error.candidates.length) body.candidates = error.candidates;
  }
  return json(body, sourceErrorStatus(error));
}

function sourceErrorStatus(error: unknown): number {
  if (!(error instanceof GitHubSourceError)) return 400;
  return error.code === "busy" ? 409 : error.code === "choose" || error.code === "no-project" ? 422 : error.code === "not-found" ? 404 : error.code === "git-missing" || error.code === "network" || error.code === "timeout" ? 502 : 400;
}

function lookupPlan(params: Record<string, string>): MigrationPlan | Response {
  const parsed = planIdParam.safeParse(params.planId);
  if (!parsed.success) return json({ ok: false, error: "Invalid plan id." }, 400);
  try {
    return loadPlan(parsed.data) ?? json({ ok: false, error: "Unknown plan." }, 404);
  } catch (error) {
    return errorResponse(error, 500);
  }
}

function pastRuns(): PastRun[] {
  try {
    return listMigrations({ limit: 100 }).items.map((record) => ({ ecosystem: record.ecosystem, engine: record.engine, status: record.status, dryRun: record.dryRun, startedAt: record.startedAt, finishedAt: record.finishedAt }));
  } catch {
    return [];
  }
}

function planResponse(plan: MigrationPlan, extra: Record<string, unknown> = {}): Response {
  // fixability: per item, why "Fix with AI" can't help (null = it can), so the screen can say why instead of offering a button.
  const fixability = Object.fromEntries(plan.items.map((item) => [item.id, aiFixability(plan, item)]));
  // estimates: token ranges per engine from the repo's file sizes (heuristic; see estimate.ts).
  const estimates = estimateTokens(plan);
  const recommendation = recommendEngine(plan, estimates);
  const history = pastRuns();
  // details: the extra plan facts for each engine (steps, risk, needs-you, time from past runs), so the screen can switch engines without another call.
  const details = { hybrid: planDetails(plan, "hybrid", history), ai: planDetails(plan, "ai", history) };
  const fixerReasons = Object.fromEntries(plan.items.map((item) => [item.id, fixerReason(item)]));
  return json({ ok: true, plan, summary: planSummary(plan), impact: predictImpact(plan), fixability, estimates, recommendedEngine: recommendation.recommendedEngine, recommendation, details, fixerReasons, ...extra });
}
const emptyQuery = z.object({});

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function errorResponse(error: unknown, status = 400): Response {
  return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, status);
}

function lookupRun(params: Record<string, string>): RunState | Response {
  const parsed = runIdParam.safeParse(params.runId);
  if (!parsed.success) return json({ ok: false, error: "Invalid run id." }, 400);
  const state = getRun(parsed.data);
  return state ?? json({ ok: false, error: "Unknown run." }, 404);
}

function loadRepoConfigSafe(repo: string | null) {
  return repo ? loadRepoConfig(repo) : repoConfigSchema.parse({});
}

function narrativeEnabled(): boolean {
  return envSetting("NARRATIVE") !== "0";
}

type SendFn = Parameters<Parameters<typeof POST>[1]["handler"]>[1]["send"];

/** The background AI plan review (adds only code-verified findings). */
async function runPlanReview(plan: MigrationPlan, repoPath: string, send: SendFn): Promise<void> {
  const planId = plan.planId;
  const mark = (change: (draft: MigrationPlan) => void) => {
    const latest = loadPlan(planId);
    if (!latest) return null;
    change(latest);
    return savePlan(latest);
  };
  mark((draft) => {
    if (draft.ai.status !== "pending") return;
    draft.ai.status = "running";
    draft.ai.startedAt ??= new Date().toISOString();
  });
  const stillRunning = () => loadPlan(planId)?.ai.status === "running";
  try {
    const session = await send(planReviewPrompt(plan), { continuationToken: `plan:${planId}`, title: `Plan review: ${plan.repoName}`, dryRun: true });
    mark((draft) => {
      draft.ai.sessionId = session.id;
    });
    const outcome = await withTimeout(session.waitForCompletion(), 8 * 60_000, "AI plan review");
    if (outcome.status !== "finished" || !outcome.result) throw new Error(outcome.errorMessage || `AI review ended with status ${outcome.status}.`);
    const parsed = aiReviewSchema.parse(extractJson(outcome.result));
    const latest = loadPlan(planId);
    // Skipped meanwhile (the plan was approved without waiting): drop the late result.
    if (latest && latest.ai.status === "running") savePlan(mergeAiReview(latest, parsed, repoPath));
    const done = loadPlan(planId)?.ai;
    if (done?.startedAt && done.finishedAt) console.info(`[plan ${planId}] AI review ${done.status} in ${Math.round((Date.parse(done.finishedAt) - Date.parse(done.startedAt)) / 1000)}s`);
  } catch (error) {
    if (!stillRunning()) return;
    mark((draft) => {
      draft.ai.status = "failed";
      draft.ai.error = plainAiError((error as Error).message).slice(0, 2000);
      draft.ai.finishedAt = new Date().toISOString();
    });
  }
}

// ---- async plan jobs (for the loading screen) -----------------------------------------

type PlanJob = {
  jobId: string;
  status: "running" | "done" | "failed";
  stage: PlanStage;
  stages: PlanStage[];
  startedAt: number;
  stageStartedAt: Record<string, number>;
  finishedAt: number | null;
  planId: string | null;
  error: string | null;
  code: string | null;
  candidates: unknown[] | null;
};

const planJobs = new Map<string, PlanJob>();
const stageLabels: Record<PlanStage, string> = {
  clone: "Getting the repo from GitHub",
  reading: "Reading the project",
  dependencies: "Checking dependencies and versions",
  "risky-code": "Finding code that could break",
  writing: "Writing the plan",
  done: "Done",
};

function newPlanJob(github: boolean): PlanJob {
  for (const [id, job] of planJobs) if (job.finishedAt && Date.now() - job.finishedAt > 30 * 60_000) planJobs.delete(id);
  const job: PlanJob = {
    jobId: `pj-${randomUUID().slice(0, 12)}`,
    status: "running",
    stage: github ? "clone" : "reading",
    stages: [...(github ? (["clone"] as PlanStage[]) : []), "reading", "dependencies", "risky-code", "writing"],
    startedAt: Date.now(),
    stageStartedAt: {},
    finishedAt: null,
    planId: null,
    error: null,
    code: null,
    candidates: null,
  };
  job.stageStartedAt[job.stage] = job.startedAt;
  planJobs.set(job.jobId, job);
  return job;
}

function setStage(job: PlanJob, stage: PlanStage): void {
  job.stage = stage;
  job.stageStartedAt[stage] ??= Date.now();
  if (stage === "done") {
    job.finishedAt = Date.now();
    const timings = stageTimings(job);
    console.info(`[plan job ${job.jobId}] ${Object.entries(timings).map(([id, ms]) => `${id} ${ms}ms`).join(", ")}; total ${job.finishedAt - job.startedAt}ms`);
  }
}

/** Milliseconds spent in each stage so far (for the banner and for measuring). */
function stageTimings(job: PlanJob): Record<string, number> {
  const out: Record<string, number> = {};
  const started = job.stages.filter((id) => job.stageStartedAt[id] !== undefined);
  started.forEach((id, index) => {
    const next = started[index + 1];
    const end = next ? job.stageStartedAt[next] : (job.stageStartedAt.done ?? job.finishedAt ?? Date.now());
    out[id] = Math.max(0, end - job.stageStartedAt[id]);
  });
  return out;
}

function failJob(job: PlanJob, error: unknown): void {
  job.status = "failed";
  job.finishedAt = Date.now();
  job.error = error instanceof Error ? error.message : String(error);
  if (error instanceof GitHubSourceError) {
    job.code = error.code;
    job.candidates = error.candidates.length ? error.candidates : null;
  }
}

function jobView(job: PlanJob) {
  const current = job.stages.indexOf(job.stage);
  return {
    jobId: job.jobId,
    status: job.status,
    stage: job.stage,
    stageLabel: stageLabels[job.stage],
    stages: job.stages.map((id, index) => ({
      id,
      label: stageLabels[id],
      state: job.status === "done" || job.stage === "done" || index < current ? "done" : index === current ? (job.status === "failed" ? "failed" : "running") : "waiting",
    })),
    startedAt: new Date(job.startedAt).toISOString(),
    elapsedMs: (job.finishedAt ?? Date.now()) - job.startedAt,
    timings: stageTimings(job),
    planId: job.planId,
    error: job.error,
    code: job.code,
    candidates: job.candidates,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 60000)} min`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type StartBody = TargetBody & { repoPath: string; planId?: string; branch?: string; subdir?: string; githubToken?: string };

type PreparedStart = {
  repoPath: string;
  plan: MigrationPlan | null;
  adapter: LanguageAdapter;
  request: TargetRequest;
  targets: Extract<ReturnType<LanguageAdapter["resolveTargets"]>, { ok: true }>;
};

/** Shared by /start and /compare: the checked repository, its approved plan, the adapter and the resolved targets. */
async function resolveStart(body: StartBody): Promise<PreparedStart | Response> {
    let repoPath: string;
    try {
      if (isGitHubInput(body.repoPath)) {
        // Run on the clone the plan was reviewed on (never re-fetch under an approved plan);
        // without a plan, reuse the existing clone or make a fresh one.
        const planned = body.planId ? lookupPlan({ planId: body.planId }) : null;
        const ref = parseGitHubUrl(body.repoPath, body.branch, body.subdir);
        const clone = safeRealpath(clonePathFor(ref));
        const plannedPath = planned && !(planned instanceof Response) ? safeRealpath(planned.repoPath) : null;
        if (plannedPath && (plannedPath === clone || plannedPath.startsWith(clone + path.sep))) repoPath = await assertRepo(plannedPath);
        else repoPath = (await resolveRepoInput(body.repoPath, { branch: body.branch, subdir: body.subdir, githubToken: body.githubToken, refresh: false })).repoPath;
      } else {
        repoPath = await assertRepo(body.repoPath);
      }
    } catch (error) {
      return sourceError(error);
    }
    let plan: MigrationPlan | null = null;
    if (body.planId) {
      // A plan made and approved by the CLI lives in the project's migration-plan.json, not in this server's store: import it.
      if (planIdPattern.test(body.planId) && !loadPlan(body.planId)) {
        try {
          const local = readPlanFile(repoPath);
          if (local?.planId === body.planId) savePlan(local);
        } catch {
          /* an unreadable file falls through to "Unknown plan." */
        }
      }
      const found = lookupPlan({ planId: body.planId });
      if (found instanceof Response) return found;
      plan = found;
      const problem = planProblem(plan, repoPath);
      if (problem) return json({ ok: false, error: problem, planRequired: true }, 409);
    } else if (requirePlan()) {
      return json(
        { ok: false, planRequired: true, error: "An approved migration plan is required: create one with POST /plan, approve it, then start with its planId (or set VERDIGRADE_REQUIRE_PLAN=false)." },
        409,
      );
    }
    let adapter: LanguageAdapter;
    try {
      adapter = adapterFor(repoPath, plan?.ecosystem ?? body.ecosystem);
    } catch (error) {
      return errorResponse(error, 400);
    }
    // An approved plan fixes the targets it was reviewed for.
    const request: TargetRequest = plan ? { targets: plan.targets, from: plan.request.from } : targetRequest(body);
    const targets = adapter.resolveTargets(request, loadRepoConfigSafe(repoPath));
    if (!targets.ok) return json(targets, 400);
    if (plan && targets.routeId !== plan.routeId) {
      return json({ ok: false, error: `Plan ${plan.planId} was made for route ${plan.routeId}, but the targets now resolve to ${targets.routeId}. Create a new plan.` }, 409);
    }
    return { repoPath, plan, adapter, request, targets };
}

/** Why an engine cannot run right now (null = it can). Hybrid always runs: without an AI login it does only the free OpenRewrite/rules step. */
function engineUnavailable(engine: Engine): string | null {
  if (engine !== "ai") return null;
  const ai = aiStatus();
  return ai.configured ? null : `Full AI needs the AI. ${ai.message} Hybrid still runs without it (OpenRewrite and rules only).`;
}

/** Hybrid without an AI login runs only its free step: say so (null = nothing to say). */
function engineNote(engine: Engine): string | null {
  return engine === "hybrid" && !aiStatus().configured ? "AI is not set up, so Hybrid will run only the free OpenRewrite / rules step and list what the AI would have fixed." : null;
}

/** The estimate a run records for its engine (hybrid or ai). */
function estimateFor(plan: MigrationPlan, engine: Engine): RunEstimate | undefined {
  if (engine !== "hybrid" && engine !== "ai") return undefined;
  const { low, high, input, output, method } = estimateTokens(plan)[engine];
  return { low, high, input, output, method };
}

/**
 * The AI side of a run: the upgrade (AI engine) and the build/test fix-up rounds (AI and Hybrid).
 * Reports the model and the SDK's token usage for each call so the run can record them.
 */
function makeFixer(send: SendFn, adapter: LanguageAdapter): Fixer {
  return async ({ phase, runId, workPath, round, failure, logTail, state, items, reason, refactors }) => {
    const locked = state.plan?.lockedPaths ?? [];
    const upgrade = phase === "upgrade";
    const planItems = phase === "items";
    const refactor = phase === "refactor";
    const itemLines = (items ?? []).slice(0, 60).map((item, index) => `${index + 1}. [${item.tier === "breaks" ? "will break" : "might break"}] ${item.title}${item.file ? ` (${item.file}${item.line ? `:${item.line}` : ""})` : ""}. Why: ${item.why || "see the file"} Suggested change: ${item.suggestion || "use your judgement"}`);
    const targets = Object.entries(state.request.targets ?? {}).map(([key, value]) => `${key} ${value}`).join(", ");
    const lines = [
      upgrade ? `UPGRADE run ${runId} (AI engine).` : refactor ? `REFACTOR run ${runId} (after the upgrade).` : planItems ? `PLAN ITEMS run ${runId} (Hybrid AI step).` : `FIX-UP run ${runId}, round ${round}.`,
      `Ecosystem: ${state.ecosystem}.`,
      `Repository (work folder): ${workPath}`,
      ...adapter.fixupFacts(state),
      ...(locked.length ? [`Locked by the approved plan (do not edit; apply_text_patch refuses them): ${locked.join(", ")}`] : []),
    ];
    if (upgrade) {
      lines.push(
        `Upgrade this project to: ${targets || "the route's targets"}. No deterministic rewrite tools ran: you do the whole upgrade.`,
        `Detected before: ${(state.versions ?? []).map((fact) => `${fact.label} ${fact.before ?? "unknown"}`).join(", ") || "see the project"}.`,
        "Use read_project_file / scan_project to look at the code and apply_text_patch on the work folder above to edit build files and sources (versions, dependencies, removed or renamed APIs, javax -> jakarta, configuration properties). Do not run OpenRewrite recipes or the build yourself; the pipeline builds and tests afterwards and calls you again with any failure.",
        ...(itemLines.length ? ["The approved plan flagged these risk areas; make sure your upgrade handles each one:", ...itemLines] : []),
        ...(hasStaticFrontend(workPath)
          ? [
              "This project ships a page (src/main/resources/static). It is part of the repository you are upgrading: read its JavaScript and check the API calls it makes against what the new Spring versions do (paths with a trailing slash no longer match, how the CSRF token cookie reaches the page, JSON property names and value types). Update the JavaScript together with the Java where the page would otherwise break. The pipeline starts the packaged app afterwards and tries the page's API calls.",
            ]
          : []),
        "Make focused edits only; never touch locked paths. Reply with one short paragraph naming the files you changed and why.",
      );
    } else if (refactor) {
      lines.push(
        "The upgrade is done and its build and tests pass. The reviewer picked these code-quality refactors in the plan; apply each one to the files named (they come from a scan of this project):",
        ...refactorInstructions(refactors ?? []),
        "Use read_project_file to look at each file and apply_text_patch on the work folder above. Keep behaviour the same: this is a refactor, not a feature change. Keep public APIs that other modules or clients call unless the refactor says otherwise, and update every caller you change. Never touch locked paths and never read or edit files that hold credentials. Do not run the build or tests; the pipeline runs them next and reverts the whole refactor if they fail. Reply with one short paragraph naming the files you changed and why.",
      );
    } else if (planItems) {
      lines.push(
        "The free deterministic tools (OpenRewrite recipes, rules, codemods) already ran on this work folder. The approved plan lists these items they cannot fix; change the code for each one, in the files named:",
        ...itemLines,
        "Use read_project_file to look at each file and apply_text_patch on the work folder above to make the smallest correct edit. Skip an item whose file no longer needs the change. Never touch locked paths and never read or edit files that hold credentials. Do not run the build or tests; the pipeline does that next and calls you again with any failure. Reply with one short paragraph naming the files you changed and why.",
      );
    } else if (reason === "page") {
      lines.push(
        "The build, tests and package passed, and the packaged app was started on loopback. The page check then loaded the page and made the API calls its JavaScript makes, the way the page makes them (the CSRF cookie goes back as a header). It found these problems on the running page:",
        failure || "(not detected)",
        "The Java tests cannot see these: they call canonical paths and never run the page's JavaScript. The cause can be on either side, so read both: the Java (security config, controllers, DTOs, serialization) and the page's files under src/main/resources/static (api.js, app.js, index.html). Make the smallest correct edit that makes each problem go away; changing the page's JavaScript is allowed and often the right fix (for example paths without a trailing slash, or reading the property name the server now sends). Use read_project_file to look at the files and apply_text_patch on the work folder above. Never touch locked paths or secrets. Do not run the build or tests yourself; the pipeline re-runs the tests, packages again and repeats the page check. Reply with one short paragraph naming the files you changed and why.",
      );
    } else if (reason === "checks") {
      lines.push(
        "The build, tests and package all passed, but the post-run checks failed. The failed checks (they name the files):",
        failure || "(not detected)",
        "Make the smallest edit that makes each failed check pass: for example rename a leftover javax.* Jakarta EE reference (code, comment or string) to jakarta.*, or bring a remaining version to the target. Use read_project_file to look at the named files and apply_text_patch on the work folder above. Never touch locked paths or secrets. Do not run the build or tests yourself; the pipeline re-runs them and the checks. Reply with one short paragraph naming the files you changed and why.",
      );
    } else {
      lines.push(
        "The deterministic pipeline already ran the rewrite tools and rules. The test step failed.",
        "First failure:",
        failure || "(not detected; see the log tail)",
        "Log tail:",
        "```",
        logTail.slice(-8000),
        "```",
        "Make the smallest source or build-file edit that fixes this failure, using apply_text_patch on the work folder above. Do not run recipes that are not needed. Do not run the tests yourself; the pipeline re-runs them. Reply with one short paragraph naming the files you changed and why.",
      );
    }
    const session = await send(lines.join("\n"), { continuationToken: `run:${runId}`, title: `${upgrade ? "AI upgrade" : refactor ? "AI refactor" : planItems ? "AI plan items" : reason === "page" ? `Page fix-up ${round}` : `Fix-up ${round}`}: ${path.basename(state.repoPath)}` });
    const outcome = await withTimeout(session.waitForCompletion(), upgrade ? 30 * 60_000 : planItems || refactor ? 20 * 60_000 : 15 * 60_000, upgrade ? "AI upgrade" : refactor ? "AI refactor" : planItems ? "AI plan items" : "Model fix-up");
    return {
      status: outcome.status === "finished" ? "finished" : "error",
      note: plainAiError(outcome.result || outcome.errorMessage || "").slice(0, 2000),
      sessionId: session.id,
      model: configuredModel(),
      usage: outcome.usage ?? null,
    };
  };
}

initPreview();

export default defineChannel({
  // Set VERDIGRADE_TOKEN (or the legacy JAVA_MIGRATOR_TOKEN) to require "Authorization: Bearer <token>" on every route.
  auth: token ? [bearerAuth(token)] : [localDevStrict()],
  routes: [
    GET("/config", {
      description: "Server settings the screen needs: version, allowed roots, defaults.",
      querySchema: emptyQuery,
      handler: async () => {
        const matrix = loadMatrix();
        return json({
          version: agentVersion,
          authRequired: Boolean(token),
          roots: allowedRoots(),
          samplesRoot: samplesRootPath(),
          defaults: matrix.defaults,
          nodeDefaults: loadNodeMatrix().defaults,
          pythonDefaults: loadPythonMatrix().defaults,
          ecosystems: adapters.map((adapter) => ({ id: adapter.id, label: adapter.label, stepLabels: adapter.stepLabels })),
          requirePlan: requirePlan(),
          planAi: planAiEnabled(),
          fixRounds: defaultFixRounds(),
          narrative: narrativeEnabled(),
          engines: {
            default: defaultEngine,
            list: engineList.map((id) => ({ id, label: engineLabels[id], available: !engineUnavailable(id), reason: engineUnavailable(id), note: engineNote(id) })),
            ai: { configured: aiStatus().configured, source: aiStatus().source, message: aiStatus().message },
            model: configuredModel(),
            aiAttempts: defaultAiAttempts(),
          },
          platform: process.platform,
          github: { reposDir: reposDir(), tokenConfigured: Boolean(envSetting("GITHUB_TOKEN") || process.env.GITHUB_TOKEN) },
        });
      },
    }),
    GET("/matrix", {
      description: "List supported From/To migration routes and target dropdowns (ecosystem=java by default, node or python).",
      querySchema: z.object({ ecosystem: ecosystemField.optional() }),
      handler: async (_request, { query }) => json(query.ecosystem === "node" ? nodeMatrixView() : query.ecosystem === "python" ? pythonMatrixView() : { ...matrixPublicView(), ecosystems: adapters.map((adapter) => adapter.id) }),
    }),
    GET("/samples", {
      description: "List the bundled sample projects under samples/.",
      querySchema: emptyQuery,
      handler: async () => json({ root: samplesRootPath(), samples: listSamples() }),
    }),
    POST("/resolve", {
      description:
        "Resolve From/To against the ecosystem's matrix. With repoPath, the repository is scanned (read-only), its ecosystem detected and its From versions used.",
      bodySchema: z.object({ ...targetFields, ...githubFields, repoPath: z.string().min(1).max(1000).optional() }),
      handler: async (_request, { body }) => {
        let repo: string | null = null;
        let adapter = getAdapter(body.ecosystem ?? "java");
        if (body.repoPath) {
          try {
            repo = (await resolveRepoInput(body.repoPath, { branch: body.branch, subdir: body.subdir, githubToken: body.githubToken, refresh: false })).repoPath;
            adapter = adapterFor(repo, body.ecosystem);
          } catch (error) {
            return json(
              { ok: false, error: (error as Error).message, detected: null, scanError: (error as Error).message, candidates: error instanceof GitHubSourceError && error.candidates.length ? error.candidates : undefined },
              400,
            );
          }
        }
        let repoConfig;
        try {
          repoConfig = repo ? loadRepoConfigSafe(repo) : loadRepoConfigSafe(null);
        } catch (error) {
          return errorResponse(error, 400);
        }
        const preview = adapter.preview(targetRequest(body), repo, repoConfig);
        return json({ ecosystem: adapter.id, ecosystemLabel: adapter.label, ...preview }, preview.ok ? 200 : 400);
      },
    }),
    POST("/github/clone", {
      description:
        "Clone a GitHub repository (shallow) into the agent's data/repos folder, or refresh the existing clone, and return its local path. The optional token is used for this call only and is never stored or logged. Nothing is ever pushed to GitHub.",
      bodySchema: z.object({ url: z.string().min(1).max(500), ...githubFields, refresh: z.boolean().default(true) }),
      handler: async (_request, { body }) => {
        try {
          const { repoPath, source } = await resolveRepoInput(body.url, { branch: body.branch, subdir: body.subdir, githubToken: body.githubToken, refresh: body.refresh });
          if (!source) return json({ ok: false, error: "That is not a GitHub link. Use https://github.com/owner/repo." }, 400);
          let ecosystem: string | null = null;
          try {
            ecosystem = adapterFor(repoPath).id;
          } catch {
            ecosystem = null;
          }
          return json({ ok: true, repoPath, source, ecosystem });
        } catch (error) {
          return sourceError(error);
        }
      },
    }),
    POST("/plan", {
      description:
        "Plan mode: analyse the whole project (read-only) and return a migration plan with three groups (auto, review, manual) and tiers (will break / might break / safe). With async=true it returns a jobId at once; poll GET /plan-jobs/:jobId for the stages. The optional AI review runs in the background and only adds code-verified findings.",
      bodySchema: z.object({
        ...targetFields,
        ...githubFields,
        repoPath: z.string().min(1).max(1000),
        preview: z.boolean().default(false),
        ai: z.boolean().default(true),
        async: z.boolean().default(false),
      }),
      handler: async (_request, { body, send, waitUntil }) => {
        const job = newPlanJob(isGitHubInput(body.repoPath));
        const work = (async (): Promise<Response> => {
          let repoPath: string;
          try {
            // A GitHub link is refreshed to its latest commit before planning.
            setStage(job, isGitHubInput(body.repoPath) ? "clone" : "reading");
            repoPath = (await resolveRepoInput(body.repoPath, { branch: body.branch, subdir: body.subdir, githubToken: body.githubToken, refresh: true })).repoPath;
          } catch (error) {
            failJob(job, error);
            return sourceError(error);
          }
          const useAi = body.ai && planAiEnabled();
          let plan: MigrationPlan;
          try {
            plan = savePlan(
              await generatePlan({ repoPath, ecosystem: body.ecosystem, request: targetRequest(body), preview: body.preview, ai: useAi, onStage: (stage) => setStage(job, stage) }),
            );
          } catch (error) {
            failJob(job, error);
            return errorResponse(error, 400);
          }
          if (useAi) waitUntil(runPlanReview(plan, repoPath, send));
          job.planId = plan.planId;
          setStage(job, "done");
          job.status = "done";
          return planResponse(plan, { requirePlan: requirePlan() });
        })();
        if (!body.async) return work;
        waitUntil(work.then(() => undefined, () => undefined));
        return json({ ok: true, jobId: job.jobId, job: jobView(job) }, 202);
      },
    }),
    GET("/plan-jobs/:jobId", {
      description: "Progress of an async plan: status, current stage, the stage list, elapsed time, and the planId when done.",
      querySchema: emptyQuery,
      handler: async (_request, { params }) => {
        const job = planJobs.get(params.jobId ?? "");
        return job ? json({ ok: true, job: jobView(job) }) : json({ ok: false, error: "Unknown or expired plan job." }, 404);
      },
    }),
    POST("/plans/:planId/recheck", {
      description: "Re-scan the project after you changed code by hand. Decisions carry over; will-break items that are gone move to 'Fixed'. The plan returns to draft.",
      bodySchema: z.object({}).default({}),
      handler: async (_request, { params }) => {
        const plan = lookupPlan(params);
        if (plan instanceof Response) return plan;
        try {
          return planResponse(savePlan(await recheckPlan(plan)));
        } catch (error) {
          return errorResponse(error, 400);
        }
      },
    }),
    GET("/ai/status", {
      description: "Is a model credential available for Fix with AI and the plan review? (Only reports where it comes from, never the key.)",
      querySchema: emptyQuery,
      handler: async () => json({ ok: true, ...aiStatus() }),
    }),
    POST("/plans/:planId/ai-fix", {
      description:
        "Fix with AI (opt-in): the agent proposes edits for the given will-break / might-break items on a private copy of the project (never your folder), limited to each item's files and never touching locked paths. Credentials in config files are swapped for an environment placeholder by code (the value never reaches the model). Each fix is re-checked; keep or undo it afterwards. Omit itemIds to fix every open item in scope: high (will break / high risk, the default), risky (might break) or all.",
      bodySchema: z.object({ itemIds: z.array(z.string().max(40)).max(100).optional(), scope: z.enum(["high", "risky", "all"]).default("high") }),
      handler: async (_request, { params, body, send, waitUntil }) => {
        const plan = lookupPlan(params);
        if (plan instanceof Response) return plan;
        const ids = body.itemIds?.length ? body.itemIds : fixableItems(plan, body.scope).map((item) => item.id);
        if (!ids.length) return json({ ok: false, error: body.scope === "risky" ? "Nothing to fix: no open might-break item can be fixed by editing code." : "Nothing to fix: no open will-break or high-risk item can be fixed by editing code." }, 400);
        // Secret → environment variable fixes are done by code; only the others need a model.
        const needsModel = ids.some((id) => {
          const item = plan.items.find((entry) => entry.id === id);
          return !item || !isSecretFix(item);
        });
        const status = aiStatus();
        if (needsModel && !status.configured) return json({ ok: false, code: "ai-not-configured", error: status.message, envVar: status.envVar }, 412);
        const started: string[] = [];
        try {
          for (const id of ids) started.push(startPlanFix(plan.planId, id).fixId);
        } catch (error) {
          if (!started.length) return errorResponse(error, 400);
        }
        const ask: AskModel = async (prompt, info) => {
          const session = await send(prompt, { continuationToken: `plan:${info.planId}:${info.fixId}`, title: `AI fix: ${info.title.slice(0, 60)}`, dryRun: true });
          const outcome = await withTimeout(session.waitForCompletion(), 10 * 60_000, "AI fix");
          if (outcome.status !== "finished" || !outcome.result) throw new Error(outcome.errorMessage || `The AI fix ended with status ${outcome.status}.`);
          return { text: outcome.result, sessionId: session.id };
        };
        // Up to 3 at a time; fixes that touch the same files run one after another, so each sees the one before.
        waitUntil(runFixesConcurrently(plan.planId, started, ask, 3).catch(() => undefined));
        const latest = loadPlan(plan.planId) ?? plan;
        return planResponse(latest, { fixIds: started });
      },
    }),
    POST("/plans/:planId/ai-fix/:fixId/keep", {
      description: "Keep an AI fix: it is applied to the work copy before the dry run / migration starts.",
      bodySchema: z.object({}).default({}),
      handler: async (_request, { params }) => {
        const plan = lookupPlan(params);
        if (plan instanceof Response) return plan;
        try {
          return planResponse(keepFix(plan.planId, params.fixId ?? ""));
        } catch (error) {
          return errorResponse(error, 400);
        }
      },
    }),
    POST("/plans/:planId/ai-fix/:fixId/undo", {
      description: "Undo an AI fix: its edits are dropped and the item goes back to its earlier decision.",
      bodySchema: z.object({}).default({}),
      handler: async (_request, { params }) => {
        const plan = lookupPlan(params);
        if (plan instanceof Response) return plan;
        try {
          return planResponse(undoFix(plan.planId, params.fixId ?? ""));
        } catch (error) {
          return errorResponse(error, 400);
        }
      },
    }),
    POST("/plans/:planId/refactor-quiz", {
      description:
        "Refactor quiz: scan the project for code-quality refactors and ask 2-3-answer questions (each answer with its migration risk). Counts and files come from the scan; when AI is set up it only rewords them. Saved on the plan; regenerate replaces the questions.",
      bodySchema: z.object({ regenerate: z.boolean().default(false) }).default({ regenerate: false }),
      handler: async (_request, { params, body, send }) => {
        const plan = lookupPlan(params);
        if (plan instanceof Response) return plan;
        if (plan.refactor && !body.regenerate) return planResponse(plan);
        try {
          let quiz = generateRefactorQuiz({ repoPath: plan.repoPath, ecosystem: plan.ecosystem, targets: plan.targets as Record<string, string> });
          if (quiz.questions.length > 1 && aiStatus().configured && planAiEnabled()) {
            try {
              const session = await send(refactorQuizPrompt(quiz, { repoName: plan.repoName, ecosystem: plan.ecosystem, targetLabel: plan.targetLabel }), { continuationToken: `plan:${plan.planId}:refactor`, title: `Refactor quiz: ${plan.repoName}`, dryRun: true });
              const outcome = await withTimeout(session.waitForCompletion(), 90_000, "Refactor quiz");
              if (outcome.status !== "finished" || !outcome.result) throw new Error(outcome.errorMessage || `ended with status ${outcome.status}`);
              quiz = mergeAiQuiz(quiz, extractJson(outcome.result), configuredModel());
            } catch (error) {
              quiz = { ...quiz, aiNote: `AI wording unavailable (${plainAiError((error as Error).message).slice(0, 200)}); showing the scan's own wording.` };
            }
          }
          const latest = loadPlan(plan.planId) ?? plan;
          latest.refactor = quiz;
          return planResponse(savePlan(latest));
        } catch (error) {
          return errorResponse(error, 400);
        }
      },
    }),
    PUT("/plans/:planId/refactor-quiz", {
      description: "Save the refactor quiz answers. status \"added\" puts the picks into the plan (a Refactor step after the upgrade), \"skipped\" drops them, \"open\" keeps editing.",
      bodySchema: refactorUpdateSchema,
      handler: async (_request, { params, body }) => {
        const plan = lookupPlan(params);
        if (plan instanceof Response) return plan;
        if (!plan.refactor) return json({ ok: false, error: "Start the refactor quiz first." }, 400);
        try {
          plan.refactor = applyRefactorUpdate(plan.refactor, body);
          return planResponse(savePlan(plan));
        } catch (error) {
          return errorResponse(error, 400);
        }
      },
    }),
    GET("/plans", {
      description: "Recent migration plans, newest first.",
      querySchema: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }),
      handler: async (_request, { query }) => json({ plans: listPlans(query.limit) }),
    }),
    GET("/plans/:planId", {
      description: "One migration plan with every item, decision and note (poll it while ai.status is pending or running).",
      querySchema: emptyQuery,
      handler: async (_request, { params }) => {
        const plan = lookupPlan(params);
        return plan instanceof Response ? plan : planResponse(plan);
      },
    }),
    PUT("/plans/:planId", {
      description: "Save reviewer decisions (approve / lock / manual per item), notes and extra locked paths. Editing an approved plan returns it to draft.",
      bodySchema: planUpdateSchema,
      handler: async (_request, { params, body }) => {
        const plan = lookupPlan(params);
        if (plan instanceof Response) return plan;
        try {
          return planResponse(savePlan(updatePlan(plan, body)));
        } catch (error) {
          return errorResponse(error, 400);
        }
      },
    }),
    POST("/plans/:planId/impact", {
      description:
        "Impact preview: predict the dry-run outcome for draft decisions and locked paths without saving them (a prediction from the explanation catalogue, not a run result).",
      bodySchema: planUpdateSchema.pick({ decisions: true, lockedPaths: true }),
      handler: async (_request, { params, body }) => {
        const plan = lookupPlan(params);
        if (plan instanceof Response) return plan;
        const prediction = predictImpact(plan, body);
        return json({ ok: true, impact: prediction, blockers: lockedBlockers(prediction) });
      },
    }),
    POST("/plans/import", {
      description: "Give the server a plan made elsewhere (the CLI's migration-plan.json). The plan must be for a project inside the allowed roots. It is stored under its own planId, so /start can use it.",
      bodySchema: z.object({ plan: z.record(z.string(), z.unknown()) }),
      handler: async (_request, { body }) => {
        try {
          const plan = parsePlanText(JSON.stringify(body.plan), "the imported plan");
          await assertRepo(plan.repoPath);
          return planResponse(savePlan(plan));
        } catch (error) {
          return errorResponse(error, 400);
        }
      },
    }),
    POST("/plans/:planId/approve", {
      description: "Approve the plan (optionally saving decisions in the same call). With exportFile, migration-plan.json is also written to the project root.",
      bodySchema: planUpdateSchema.extend({ exportFile: z.boolean().default(false), skipAiReview: z.boolean().default(false) }),
      handler: async (_request, { params, body }) => {
        const plan = lookupPlan(params);
        if (plan instanceof Response) return plan;
        try {
          const approved = savePlan(approvePlan(updatePlan(plan, body), { skipAiReview: body.skipAiReview }));
          const exported = body.exportFile ? writePlanFile(approved.repoPath, approved) : null;
          // Approving with blocker-level items locked is allowed (the UI confirms first); the warnings are returned.
          return planResponse(approved, { exportedTo: exported, warnings: lockedBlockers(predictImpact(approved)) });
        } catch (error) {
          return errorResponse(error, 400);
        }
      },
    }),
    POST("/start", {
      description:
        "Start the deterministic migration pipeline for a local repository. Needs an approved planId unless VERDIGRADE_REQUIRE_PLAN=false. Returns immediately with the run id.",
      bodySchema: z.object({
        ...targetFields,
        ...githubFields,
        repoPath: z.string().min(1).max(1000),
        planId: planIdParam.optional(),
        dryRun: z.boolean().default(true),
        allowDirty: z.boolean().default(false),
        skipTests: z.boolean().optional(),
        fixRounds: z.number().int().min(0).max(5).optional(),
        engine: engineField.optional(),
      }),
      handler: async (_request, { body, send, waitUntil }) => {
        const prepared = await resolveStart(body);
        if (prepared instanceof Response) return prepared;
        const { repoPath, plan, adapter, request, targets } = prepared;
        // No engine given: the plan's own recommendation (Hybrid without a plan, or when Full AI has no AI login:
        // Hybrid still runs its free step then).
        const engine: Engine = chooseEngine<Engine>(body.engine, plan ? recommendEngine(plan).recommendedEngine : null, defaultEngine, (candidate) => Boolean(engineUnavailable(candidate)));
        const unavailable = engineUnavailable(engine);
        if (unavailable) return json({ ok: false, aiUnavailable: true, error: unavailable }, 409);
        const fixer = makeFixer(send, adapter);
        const writeNarrative = async (state: RunState) => {
          // Classic uses no AI at all, so it gets no AI-written narrative either.
          if (!narrativeEnabled() || state.engine?.engine === "classic") {
            updateRun(state.runId, (draft) => {
              draft.narrative = { status: "skipped", text: "", sessionId: null };
            });
            return;
          }
          updateRun(state.runId, (draft) => {
            draft.narrative = { ...draft.narrative, status: "running" };
          });
          try {
            const facts = reportJson(state);
            const session = await send(
              [
                `NARRATIVE for run ${state.runId}.`,
                "Write the human narrative for this migration from the facts below. The facts (status, exit codes, counts) are authoritative: never contradict them and never change the pass/fail result.",
                "Use short sections: Summary, What changed, Risks and manual follow-up. Plain language. Name files and versions. Do not call tools.",
                "```json",
                JSON.stringify({ ...facts, steps: facts.steps.map(({ logFile: _logFile, ...rest }) => rest) }).slice(0, 60_000),
                "```",
              ].join("\n"),
              { continuationToken: `run:${state.runId}`, title: `Report: ${path.basename(state.repoPath)}` },
            );
            const outcome = await withTimeout(session.waitForCompletion(), 10 * 60_000, "Narrative");
            updateRun(state.runId, (draft) => {
              if (draft.engine) recordAiCall(draft.engine, { model: configuredModel(), usage: outcome.usage ?? null });
              draft.narrative = {
                status: outcome.status === "finished" && outcome.result ? "done" : "failed",
                text: outcome.result ?? outcome.errorMessage ?? "",
                sessionId: session.id,
              };
            });
          } catch (error) {
            updateRun(state.runId, (draft) => {
              draft.narrative = { status: "failed", text: (error as Error).message, sessionId: draft.narrative.sessionId };
            });
          }
        };

        let started: RunState;
        try {
          started = startRun({
            repoPath,
            dryRun: body.dryRun,
            ecosystem: adapter.id,
            targetJava: request.targets.java,
            targetBoot: request.targets.boot,
            fromJava: request.from.java,
            fromBoot: request.from.boot,
            targets: request.targets,
            from: request.from,
            plan: plan ? runPlanInfo(plan, "store") : null,
            allowDirty: body.allowDirty,
            skipTests: body.skipTests,
            fixRounds: body.fixRounds,
            engine,
            // Classic never calls the model; Full AI and Hybrid share the same fixer (Hybrid without an AI login runs without it).
            fixer: usesAi(engine) && aiStatus().configured ? fixer : undefined,
            estimate: plan && usesAi(engine) && aiStatus().configured ? estimateFor(plan, engine) : undefined,
            onFinish: writeNarrative,
          });
        } catch (error) {
          return errorResponse(error, error instanceof RepoBusyError ? 409 : 400);
        }
        const done = new Promise<void>((resolve) => {
          const poll = setInterval(() => {
            const state = getRun(started.runId);
            if (!state || (state.status !== "running" && state.narrative.status !== "running" && state.narrative.status !== "pending")) {
              clearInterval(poll);
              resolve();
            }
          }, 2000);
        });
        waitUntil(done);
        const preview = adapter.preview(request, repoPath, loadRepoConfigSafe(repoPath));
        return json({
          accepted: true,
          runId: started.runId,
          sessionId: started.runId,
          dryRun: started.dryRun,
          ecosystem: adapter.id,
          planId: plan?.planId ?? null,
          routeId: targets.routeId,
          targets: targets.targets,
          targetJava: targets.targets.java,
          targetBoot: targets.targets.boot,
          targetLabel: preview.targetLabel,
          parentHint: preview.parentHint,
          recipePlan: preview.recipePlan,
          notes: preview.notes,
        });
      },
    }),
    GET("/runs/:runId", {
      description: "Live or saved state of one run (status per step, exit codes, tests, changed files).",
      querySchema: emptyQuery,
      handler: async (_request, { params }) => {
        const state = lookupRun(params);
        if (!(state instanceof Response)) return json(state);
        // Rows saved by the old browser-driven version have no run state: return what was stored.
        const legacy = runIdParam.safeParse(params.runId).success ? loadRunState(params.runId) : null;
        if (legacy?.record) return json({ legacy: true, record: legacy.record, reportText: legacy.reportText });
        return state;
      },
    }),
    GET("/runs/:runId/log", {
      description: "Full log of one step (text/plain).",
      querySchema: z.object({ step: z.enum(stepOrder as [string, ...string[]]) }),
      handler: async (_request, { params, query }) => {
        const state = lookupRun(params);
        if (state instanceof Response) return state;
        const log = readLog(state, query.step);
        return new Response(log.text, {
          headers: { "content-type": "text/plain; charset=utf-8", "x-truncated": String(log.truncated), "cache-control": "no-store" },
        });
      },
    }),
    GET("/runs/:runId/diff", {
      description: "Unified diff of every change the run made (git base..HEAD).",
      querySchema: emptyQuery,
      handler: async (_request, { params }) => {
        const state = lookupRun(params);
        if (state instanceof Response) return state;
        const { diff, truncated } = readDiff(state);
        return new Response(diff, {
          headers: { "content-type": "text/plain; charset=utf-8", "x-truncated": String(truncated), "cache-control": "no-store" },
        });
      },
    }),
    GET("/runs/:runId/report", {
      description: "Migration report generated from the run facts (format=md or json).",
      querySchema: z.object({ format: z.enum(["md", "json"]).default("md") }),
      handler: async (_request, { params, query }) => {
        const state = lookupRun(params);
        if (state instanceof Response) return state;
        if (query.format === "json") return json(reportJson(state));
        return new Response(reportMarkdown(state), { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" } });
      },
    }),
    POST("/runs/:runId/cancel", {
      description: "Cancel a running migration (kills the build process tree).",
      bodySchema: z.object({}),
      handler: async (_request, { params }) => {
        const state = lookupRun(params);
        if (state instanceof Response) return state;
        return cancelRun(state.runId) ? json({ ok: true }) : json({ ok: false, error: "The run is not running." }, 409);
      },
    }),
    GET("/runs/:runId/preview", {
      description: "Live preview status of a finished run: the Before and After servers (status, URL, port, last log lines), suggested endpoints and sample credentials.",
      querySchema: emptyQuery,
      handler: async (_request, { params }) => {
        const state = lookupRun(params);
        if (state instanceof Response) return state;
        return json({ ok: true, preview: previewView(state) });
      },
    }),
    POST("/runs/:runId/preview/start", {
      description:
        "Start the original app (before: the starting commit on its old JDK) and/or the migrated app (after) as local servers on 127.0.0.1. Returns at once; poll GET /runs/:runId/preview. useAvailableRuntime accepts running 'before' on the runtime that is installed when the old one is missing.",
      bodySchema: z.object({ side: z.enum(["before", "after", "both"]).default("both"), useAvailableRuntime: z.boolean().optional() }),
      handler: async (_request, { params, body }) => {
        const state = lookupRun(params);
        if (state instanceof Response) return state;
        const { side, useAvailableRuntime } = body;
        const view = previewView(state);
        if (!view.canPreview) return json({ ok: false, error: view.reason ?? "Preview is not available for this run.", preview: view }, 409);
        return json({ ok: true, preview: startPreview(state, side, { useAvailableRuntime }) }, 202);
      },
    }),
    POST("/runs/:runId/preview/stop", {
      description: "Stop the preview servers of a run (one side or both) and kill their process trees.",
      bodySchema: z.object({ side: z.enum(["before", "after", "both"]).default("both") }),
      handler: async (_request, { params, body }) => {
        const state = lookupRun(params);
        if (state instanceof Response) return state;
        await stopPreview(state.runId, body.side);
        return json({ ok: true, preview: previewView(state) });
      },
    }),
    POST("/runs/:runId/preview/fetch", {
      description: "GET one path on the running Before and After servers (through the agent, so the browser needs no cross-origin access) and return both answers.",
      bodySchema: z.object({ path: z.string().min(1).max(500), headers: z.record(z.string(), z.string()).optional() }),
      handler: async (_request, { params, body }) => {
        const state = lookupRun(params);
        if (state instanceof Response) return state;
        if (!validProxyPath(body.path)) return json({ ok: false, error: "The path must start with / and contain no spaces." }, 400);
        return json({ ok: true, result: await compareEndpoint(state.runId, body.path, body.headers) });
      },
    }),
    POST("/runs/:runId/rollback", {
      description: "Undo a finished run: restore the baseline (shadow git) or switch back to the original branch.",
      bodySchema: z.object({}),
      handler: async (_request, { params }) => {
        const state = lookupRun(params);
        if (state instanceof Response) return state;
        const result = await rollbackRun(state.runId);
        return json({ ok: result.ok, message: result.message }, result.ok ? 200 : 409);
      },
    }),
    POST("/compare", {
      description:
        "Compare engines: run the same repository (dry-run copies, one after another) through two or three engines (classic, ai, hybrid) and save a side-by-side scorecard. Needs an approved planId unless VERDIGRADE_REQUIRE_PLAN=false.",
      bodySchema: z.object({
        ...targetFields,
        ...githubFields,
        repoPath: z.string().min(1).max(1000),
        planId: planIdParam.optional(),
        engines: z.array(choosableEngine).min(2).max(2).default(["hybrid", "ai"]),
        skipTests: z.boolean().optional(),
        fixRounds: z.number().int().min(0).max(5).optional(),
      }),
      handler: async (_request, { body, send, waitUntil }) => {
        const engines = [...new Set(body.engines)];
        if (engines.length < 2) return json({ ok: false, error: "Pick at least two different engines to compare." }, 400);
        for (const engine of engines) {
          const unavailable = engineUnavailable(engine);
          if (unavailable) return json({ ok: false, aiUnavailable: true, error: unavailable }, 409);
        }
        const prepared = await resolveStart(body);
        if (prepared instanceof Response) return prepared;
        const { repoPath, plan, adapter, request } = prepared;
        let comparison;
        try {
          comparison = startComparison({
            engines,
            planId: plan?.planId ?? null,
            fixer: makeFixer(send, adapter),
            estimates: plan ? { hybrid: estimateFor(plan, "hybrid"), ai: estimateFor(plan, "ai") } : undefined,
            base: {
              repoPath,
              ecosystem: adapter.id,
              targetJava: request.targets.java,
              targetBoot: request.targets.boot,
              fromJava: request.from.java,
              fromBoot: request.from.boot,
              targets: request.targets,
              from: request.from,
              plan: plan ? runPlanInfo(plan, "store") : null,
              skipTests: body.skipTests,
              fixRounds: body.fixRounds,
            },
          });
        } catch (error) {
          return errorResponse(error, 400);
        }
        const id = comparison.id;
        waitUntil(
          new Promise<void>((resolve) => {
            const poll = setInterval(() => {
              const current = getComparison(id);
              if (!current || current.status !== "running") {
                clearInterval(poll);
                resolve();
              }
            }, 2000);
          }),
        );
        return json({ ok: true, accepted: true, comparisonId: id, comparison });
      },
    }),
    GET("/comparisons", {
      description: "Saved engine comparisons, newest first.",
      querySchema: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }),
      handler: async (_request, { query }) => json({ ok: true, comparisons: listAllComparisons(query.limit) }),
    }),
    GET("/comparisons/:comparisonId", {
      description: "One engine comparison (live while running).",
      querySchema: emptyQuery,
      handler: async (_request, { params }) => {
        const found = runIdParam.safeParse(params.comparisonId).success ? getComparison(params.comparisonId) : null;
        return found ? json({ ok: true, comparison: found }) : json({ ok: false, error: "Unknown comparison." }, 404);
      },
    }),
    GET("/comparisons/:comparisonId/report", {
      description: "The comparison scorecard as a report (format=md or json).",
      querySchema: z.object({ format: z.enum(["md", "json"]).default("md") }),
      handler: async (_request, { params, query }) => {
        const found = runIdParam.safeParse(params.comparisonId).success ? getComparison(params.comparisonId) : null;
        if (!found) return json({ ok: false, error: "Unknown comparison." }, 404);
        if (query.format === "json") return json(comparisonJson(found));
        return new Response(comparisonMarkdown(found), { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" } });
      },
    }),
    POST("/comparisons/:comparisonId/cancel", {
      description: "Cancel a running comparison (stops the current run and skips the rest).",
      bodySchema: z.object({}),
      handler: async (_request, { params }) =>
        runIdParam.safeParse(params.comparisonId).success && cancelComparison(params.comparisonId) ? json({ ok: true }) : json({ ok: false, error: "That comparison is not running." }, 409),
    }),
    GET("/browse", {
      description: "List folders inside the configured roots so the screen can pick a project.",
      querySchema: z.object({ path: z.string().max(1000).optional() }),
      handler: async (_request, { query }) => {
        try {
          return json(browsePath(query.path ?? ""));
        } catch (error) {
          return errorResponse(error, 400);
        }
      },
    }),
    GET("/history", {
      description: "Finished and running migrations, newest first (server-built records; there is no write route).",
      querySchema: z.object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).max(100_000).default(0),
        runId: runIdParam.optional(),
        sessionId: runIdParam.optional(),
      }),
      handler: async (_request, { query }) => {
        const { items, total } = listMigrations({ limit: query.limit, offset: query.offset });
        const wanted = query.runId ?? query.sessionId;
        const migrations = wanted ? items.filter((item) => item.sessionId === wanted) : items;
        return json({ migrations, total, limit: query.limit, offset: query.offset });
      },
    }),
  ],
});

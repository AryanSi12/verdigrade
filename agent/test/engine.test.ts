import path from "node:path";
import { describe, expect, it } from "vitest";
import { comparisonJson, comparisonMarkdown, type Comparison } from "../bot/lib/compare.js";
import {
  compareWinners,
  engineSection,
  initialEngineRun,
  isResolutionFailure,
  overallWinner,
  parseEngine,
  recordAiCall,
  runMetrics,
  type ComparedRun,
  type RunMetrics,
} from "../bot/lib/engine.js";
import { createRunState, runPipeline } from "../bot/lib/pipeline.js";
import { reportJson, reportMarkdown } from "../bot/lib/report.js";
import { tempDir } from "./helpers.js";

const blank = (patch: Partial<RunMetrics>): RunMetrics => ({
  engine: "classic",
  model: null,
  aiCalls: 0,
  tokensIn: 0,
  tokensOut: 0,
  estimate: null,
  costUsd: null,
  wallMs: 10_000,
  buildOk: true,
  targetReached: true,
  testsRun: 10,
  testsPassed: 10,
  testsFailed: 0,
  filesChanged: 5,
  manualLeft: 0,
  status: "passed",
  ...patch,
});
const run = (engine: ComparedRun["engine"], patch: Partial<RunMetrics>, status: ComparedRun["status"] = "passed"): ComparedRun => ({ engine, runId: engine, status, error: null, metrics: blank({ engine, ...patch }) });

describe("engine selection", () => {
  it("parses the three engines and rejects anything else", () => {
    expect(parseEngine("Classic")).toBe("classic");
    expect(parseEngine(" hybrid ")).toBe("hybrid");
    expect(parseEngine("ai")).toBe("ai");
    expect(parseEngine("magic")).toBeNull();
    expect(parseEngine(undefined)).toBeNull();
  });

  it("runs Hybrid as Classic (with a note) when no AI is available, and keeps Classic and AI as asked", () => {
    const hybrid = initialEngineRun({ engine: "hybrid", hasAi: false, ecosystem: "java", maxRounds: 2 });
    expect(hybrid).toMatchObject({ engine: "classic", requested: "hybrid", ai: { maxRounds: 0, tokensIn: 0 } });
    expect(hybrid.notes[0]).toMatch(/not available/);
    expect(initialEngineRun({ engine: "hybrid", hasAi: true, ecosystem: "java", maxRounds: 2 })).toMatchObject({ engine: "hybrid", ai: { maxRounds: 2, tokensIn: null } });
    expect(initialEngineRun({ engine: "ai", hasAi: true, ecosystem: "node", maxRounds: 3 })).toMatchObject({ engine: "ai", classicTool: "codemods + rules" });
    // No engine given: Hybrid with a model, Classic without (the CLI and old callers).
    expect(initialEngineRun({ hasAi: true, ecosystem: "python", maxRounds: 2 }).engine).toBe("hybrid");
    expect(initialEngineRun({ hasAi: false, ecosystem: "python", maxRounds: 2 }).engine).toBe("classic");
  });
});

describe("AI usage", () => {
  it("sums reported tokens and keeps n/a when the SDK reported none; never invents a cost", () => {
    const engine = initialEngineRun({ engine: "hybrid", hasAi: true, ecosystem: "java", maxRounds: 2 });
    recordAiCall(engine, { model: "grok-4.7", usage: null });
    expect(engine).toMatchObject({ model: "grok-4.7", ai: { calls: 1, reportedCalls: 0, tokensIn: null, tokensOut: null, costUsd: null } });
    recordAiCall(engine, { model: "grok-4.7", usage: { inputTokens: 1200, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0 } });
    recordAiCall(engine, { usage: { inputTokens: 800, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 } });
    expect(engine.ai).toMatchObject({ calls: 3, reportedCalls: 2, tokensIn: 2000, tokensOut: 400, costUsd: null });
  });
});

describe("run metrics and the run report", () => {
  it("derives build, tests, files and manual leftovers from the run state", () => {
    const state = createRunState({ runId: "r1", repoPath: "/x/tickets", dryRun: true, engine: "classic" });
    state.status = "passed";
    state.durationMs = 61_000;
    state.steps.test.status = "passed";
    state.steps.package.status = "passed";
    state.tests = { ok: true, exitCode: 0, testsRun: 12, failures: 1, errors: 0, skipped: 2, testSets: [], source: "junit-xml", firstFailure: "" };
    state.changedFiles = ["pom.xml", "src/A.java"];
    state.followUps = ["Check the Redis config"];
    state.checks = [{ id: "c", ok: false, level: "error", message: "x" }];
    expect(runMetrics(state)).toMatchObject({ engine: "classic", tokensIn: 0, tokensOut: 0, buildOk: true, testsRun: 12, testsPassed: 9, testsFailed: 1, filesChanged: 2, manualLeft: 2, wallMs: 61_000 });
    state.steps.test.status = "failed";
    expect(runMetrics(state).buildOk).toBe(false);
    state.status = "running";
    expect(runMetrics(state).buildOk).toBeNull();
  });

  it("shows engine, model and tokens in the Markdown and JSON reports", () => {
    const state = createRunState({ runId: "r2", repoPath: "/x/tickets", dryRun: true, engine: "hybrid", fixer: async () => ({ status: "finished", note: "", sessionId: null }) });
    recordAiCall(state.engine!, { model: "grok-4.7", usage: { inputTokens: 1500, outputTokens: 250, cacheReadTokens: 0, cacheWriteTokens: 0 } });
    const text = reportMarkdown(state);
    expect(text).toContain("## Upgrade engine");
    expect(text).toContain("- Engine: Hybrid");
    expect(text).toContain("- Model: grok-4.7");
    expect(text).toContain("1,500 in / 250 out");
    expect(text).toContain("none is estimated");
    expect(reportJson(state)).toMatchObject({ engine: { engine: "hybrid", model: "grok-4.7" }, metrics: { tokensIn: 1500, tokensOut: 250, costUsd: null } });
    expect(engineSection(createRunState({ runId: "r3", repoPath: "/x", dryRun: true, engine: "classic" })).join("\n")).toContain("0 (no AI)");
  });

  it("older saved runs without an engine still produce a report", () => {
    const state = createRunState({ runId: "r4", repoPath: "/x/old", dryRun: true });
    delete (state as { engine?: unknown }).engine;
    expect(reportMarkdown(state)).not.toContain("## Upgrade engine");
    expect(runMetrics(state)).toMatchObject({ engine: null, tokensIn: null });
  });
});

describe("pipeline engine rules", () => {
  it("fails the AI engine at once (before touching anything) when no model is available", async () => {
    // Hermetic: a throw-away folder that is not even a project, and no `fixer` (the model), whatever login this machine has.
    // The model check comes first, so neither the folder nor the machine's AI login can change the outcome.
    const folder = tempDir("leapfrog-engine-noai-");
    const state = await runPipeline({ runId: "no-ai", repoPath: folder, dryRun: true, engine: "ai", artifactsDir: path.join(folder, "artifacts") });
    expect(state.status).toBe("failed");
    expect(state.error).toMatch(/needs a model login/);
    expect(state.engine).toMatchObject({ engine: "ai", ai: { calls: 0 } });
  });
});

describe("OpenRewrite offline detection", () => {
  it("recognises download failures but not a compile error", () => {
    expect(isResolutionFailure("[ERROR] Plugin org.openrewrite.maven:rewrite-maven-plugin:6.46.1 or one of its dependencies could not be resolved")).toBe(true);
    expect(isResolutionFailure("Could not transfer artifact org.openrewrite.recipe:rewrite-spring:pom:6.37.1 from/to central: Connect to repo.maven.apache.org failed")).toBe(true);
    expect(isResolutionFailure("java.net.UnknownHostException: repo.maven.apache.org")).toBe(true);
    expect(isResolutionFailure("[ERROR] COMPILATION ERROR: cannot find symbol")).toBe(false);
  });
});

describe("comparison scorecard", () => {
  const classic = run("classic", { tokensIn: 0, tokensOut: 0, wallMs: 30_000, testsPassed: 8, testsFailed: 2, buildOk: false, targetReached: false, filesChanged: 4, manualLeft: 3 });
  const ai = run("ai", { tokensIn: 9000, tokensOut: 2000, model: "grok-4.7", wallMs: 240_000, testsPassed: 10, testsFailed: 0, buildOk: true, filesChanged: 9, manualLeft: 0 });
  const hybrid = run("hybrid", { tokensIn: 1500, tokensOut: 300, model: "grok-4.7", wallMs: 90_000, testsPassed: 10, testsFailed: 0, buildOk: true, filesChanged: 7, manualLeft: 0 });

  it("highlights the best engine per row and ignores ties and runs that do not build for the diff size", () => {
    const winners = compareWinners([classic, ai, hybrid]);
    expect(winners.buildOk).toEqual(["ai", "hybrid"]);
    expect(winners.targetReached).toEqual(["ai", "hybrid"]);
    expect(winners.testsPassed).toEqual(["ai", "hybrid"]);
    expect(winners.testsFailed).toEqual(["ai", "hybrid"]);
    expect(winners.manualLeft).toEqual(["ai", "hybrid"]);
    expect(winners.wallMs).toEqual(["classic"]);
    expect(winners.tokens).toEqual(["classic"]);
    // Classic's 4 files do not count: it does not build. Hybrid changed fewer files than AI.
    expect(winners.filesChanged).toEqual(["hybrid"]);
    expect(winners.costUsd).toEqual([]);
    expect(overallWinner([classic, ai, hybrid])).toBe("hybrid");
  });

  it("does not let a run that builds but never reached the target win (the AI changed nothing)", () => {
    const lazy = run("ai", { buildOk: true, targetReached: false, filesChanged: 0, tokensIn: 10, tokensOut: 1 }, "failed");
    expect(overallWinner([lazy, run("classic", { filesChanged: 5 })])).toBe("classic");
    expect(compareWinners([lazy, run("classic", { filesChanged: 5 }), run("hybrid", { filesChanged: 7 })]).filesChanged).toEqual(["classic"]);
  });

  it("has no winner for a row where every value ties or only one engine reports", () => {
    const tied = compareWinners([run("classic", {}), run("hybrid", {})]);
    expect(Object.values(tied).every((list) => list.length === 0)).toBe(true);
    expect(compareWinners([classic, { ...ai, metrics: null, status: "error" }]).tokens).toEqual([]);
    expect(overallWinner([classic])).toBeNull();
  });

  it("renders the saved scorecard as Markdown and JSON", () => {
    const runs = [classic, hybrid];
    const comparison: Comparison = {
      id: "c1",
      repoPath: "/x/tickets",
      repoName: "tickets",
      createdAt: "2026-11-20T10:00:00.000Z",
      finishedAt: "2026-11-20T10:05:00.000Z",
      status: "done",
      error: null,
      planId: null,
      ecosystem: "java",
      engines: ["classic", "hybrid"],
      runs,
      winners: compareWinners(runs),
      overall: overallWinner(runs),
    };
    const md = comparisonMarkdown(comparison);
    expect(md).toContain("# Engine comparison: tickets");
    expect(md).toContain("| Metric | Classic | Hybrid |");
    expect(md).toContain("| Model | none | grok-4.7 |");
    expect(md).toContain("**10** (best)");
    expect(md).toContain("**0 (0 in / 0 out)** (best)");
    expect(md).toContain("Overall: Hybrid");
    expect(comparisonJson(comparison)).toMatchObject({ kind: "engine-comparison", rows: expect.arrayContaining([expect.objectContaining({ id: "tokens", winners: ["classic"] })]) });
  });
});

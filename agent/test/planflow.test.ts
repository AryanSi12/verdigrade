import { cpSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compareRows, compareWinners, engineLabels, engineList, engineSection, metricText, parseEngine, runMetrics, type ComparedRun, type RunMetrics } from "../bot/lib/engine.js";
import { estimateTokens } from "../bot/lib/estimate.js";
import { approvePlan, generatePlan, itemFixer, runPlanInfo, tierCounts, type MigrationPlan, type PlanItem } from "../bot/lib/plan.js";
import { createRunState } from "../bot/lib/pipeline.js";
import { tempDir } from "./helpers.js";

const samplesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../samples");
const request = { targets: { boot: "4.0" }, from: {} };

function item(patch: Partial<PlanItem> & { id: string }): PlanItem {
  return {
    group: "review",
    category: "api",
    severity: "high",
    title: "t",
    file: "src/A.java",
    line: 1,
    why: "w",
    suggestion: "s",
    source: "deterministic",
    decision: "approve",
    note: "",
    tier: "breaks",
    ...patch,
  } as PlanItem;
}

function fakePlan(repoPath: string, items: PlanItem[]): MigrationPlan {
  return { repoPath, items, aiFixes: [] } as unknown as MigrationPlan;
}

describe("two engines", () => {
  it("offers Hybrid and Full AI only, but still understands classic internally", () => {
    expect(engineList).toEqual(["hybrid", "ai"]);
    expect(engineLabels.ai).toBe("Full AI");
    expect(parseEngine("classic")).toBe("classic");
    expect(parseEngine("nope")).toBeNull();
  });
});

describe("the library sample no longer needs Fix with AI to run Hybrid", () => {
  it("has no locked 'will break' items by default and hands them to the AI step", async () => {
    const repo = path.join(tempDir("leapfrog-planflow-"), "library");
    cpSync(path.join(samplesRoot, "library"), repo, { recursive: true });
    const plan = await generatePlan({ repoPath: repo, request: { targets: {}, from: {} } });
    const breaks = plan.items.filter((entry) => entry.tier === "breaks");
    expect(breaks.length).toBeGreaterThan(0);
    for (const entry of breaks.filter((candidate) => candidate.fixer === "ai")) expect(entry.decision).toBe("approve");
    expect(plan.items.filter((entry) => entry.fixer === "needs-you" && entry.tier === "breaks").every((entry) => entry.decision !== "approve")).toBe(true);
    const approved = approvePlan(plan);
    const info = runPlanInfo(approved, "store");
    expect(info.aiItems!.length).toBeGreaterThan(0);
    expect(info.lockedPaths.some((pattern) => breaks.some((entry) => entry.fixer === "ai" && entry.file === pattern))).toBe(false);
    expect(tierCounts(plan).mustFix).toBe(0);
    // Estimates exist for both engines and Full AI never reads fewer files than Hybrid.
    const estimates = estimateTokens(plan, { fixRounds: 3, aiAttempts: 3, narrative: true });
    expect(estimates.hybrid.items).toBe(info.aiItems!.length);
    expect(estimates.ai.files).toBeGreaterThanOrEqual(estimates.hybrid.files);
    for (const entry of [estimates.hybrid, estimates.ai]) {
      expect(entry.low).toBeGreaterThan(0);
      expect(entry.high).toBeGreaterThanOrEqual(entry.low);
      expect(entry.method.join(" ")).not.toMatch(/[$]\d|USD/);
    }
  });
});

describe("token estimate", () => {
  it("grows with the size of the files the AI must read and with the allowed rounds", () => {
    const dir = tempDir("leapfrog-est-");
    mkdirSync(path.join(dir, "src"), { recursive: true });
    writeFileSync(path.join(dir, "src/A.java"), "x".repeat(4000));
    writeFileSync(path.join(dir, "src/B.java"), "y".repeat(40_000));
    const small = estimateTokens(fakePlan(dir, [item({ id: "F-0000000001", file: "src/A.java" })]), { fixRounds: 3, aiAttempts: 3, narrative: false });
    const big = estimateTokens(fakePlan(dir, [item({ id: "F-0000000001", file: "src/A.java" }), item({ id: "F-0000000002", file: "src/B.java" })]), { fixRounds: 3, aiAttempts: 3, narrative: false });
    expect(statSync(path.join(dir, "src/B.java")).size).toBe(40_000);
    expect(big.hybrid.bytes).toBe(44_000);
    expect(big.hybrid.high).toBeGreaterThan(small.hybrid.high);
    expect(big.hybrid.low).toBeGreaterThan(small.hybrid.low);
    // Input dominates (the agent re-reads its context every turn) and is shown apart from output.
    expect(big.hybrid.input.low).toBeGreaterThan(big.hybrid.output.low * 10);
    expect(big.hybrid.low).toBe(big.hybrid.input.low + big.hybrid.output.low);
    expect(big.hybrid.high).toBe(big.hybrid.input.high + big.hybrid.output.high);
    // The allowed rounds are named in the method (each adds its own cost), not folded into the range.
    const noRounds = estimateTokens(fakePlan(dir, [item({ id: "F-0000000001", file: "src/A.java" })]), { fixRounds: 0, aiAttempts: 3, narrative: false });
    expect(noRounds.hybrid.rounds).toBe(0);
    expect(small.hybrid.rounds).toBe(3);
    expect(small.hybrid.method.join(" ")).toMatch(/Each fix-up round .* adds about \d+k on top \(up to 3 allowed\)/);
  });

  it("counts OpenRewrite's items for Full AI only, and nothing the user must do", () => {
    const dir = tempDir("leapfrog-est2-");
    mkdirSync(path.join(dir, "src"), { recursive: true });
    writeFileSync(path.join(dir, "src/A.java"), "a".repeat(8000));
    writeFileSync(path.join(dir, "src/B.java"), "b".repeat(8000));
    writeFileSync(path.join(dir, "application.properties"), "c".repeat(8000));
    const plan = fakePlan(dir, [
      item({ id: "F-0000000001", file: "src/A.java" }),
      item({ id: "F-0000000002", group: "auto", tier: "safe", file: "src/B.java", files: ["src/B.java"] }),
      item({ id: "F-0000000003", group: "manual", file: "application.properties", kind: "secrets.file" }),
    ]);
    expect(plan.items.map(itemFixer)).toEqual(["ai", "openrewrite", "needs-you"]);
    const { hybrid, ai } = estimateTokens(plan, { fixRounds: 3, aiAttempts: 3, narrative: false });
    expect(hybrid).toMatchObject({ items: 1, files: 1 });
    expect(ai).toMatchObject({ items: 2, files: 2 });
  });

  it("has a 0 low end for Hybrid when there is nothing for the AI (the AI only runs when tests fail)", () => {
    const dir = tempDir("leapfrog-est3-");
    const { hybrid } = estimateTokens(fakePlan(dir, [item({ id: "F-0000000001", group: "auto", tier: "safe" })]), { fixRounds: 3, aiAttempts: 3, narrative: false });
    expect(hybrid.low).toBe(0);
    expect(hybrid.high).toBe(0);
    expect(hybrid.method.join(" ")).toMatch(/only called when the build, tests or checks fail/);
  });

  it("lets the reviewer lock an AI item, which removes it from the AI's work", () => {
    const dir = tempDir("leapfrog-est4-");
    const plan = fakePlan(dir, [item({ id: "F-0000000001" })]);
    expect(estimateTokens(plan, { fixRounds: 0, narrative: false }).hybrid.items).toBe(1);
    plan.items[0].decision = "lock";
    expect(estimateTokens(plan, { fixRounds: 0, narrative: false }).hybrid.items).toBe(0);
  });
});

describe("scorecard with two engines and estimate vs actual", () => {
  const metrics = (patch: Partial<RunMetrics>): RunMetrics => ({
    engine: "hybrid",
    model: "m",
    aiCalls: 1,
    tokensIn: 100,
    tokensOut: 10,
    estimate: { low: 1000, high: 5000 },
    costUsd: null,
    wallMs: 1000,
    buildOk: true,
    targetReached: true,
    testsRun: 10,
    testsPassed: 10,
    testsFailed: 0,
    filesChanged: 3,
    manualLeft: 0,
    status: "passed",
    ...patch,
  });
  const run = (engine: "hybrid" | "ai", patch: Partial<RunMetrics>): ComparedRun => ({ engine, runId: engine, status: "passed", error: null, metrics: metrics({ engine, ...patch }) });

  it("shows the estimate as a range with no winner, next to the actual tokens", () => {
    const hybrid = run("hybrid", { tokensIn: 800, tokensOut: 100, estimate: { low: 1000, high: 5000 } });
    const ai = run("ai", { tokensIn: 9000, tokensOut: 2000, estimate: { low: 8000, high: 30_000 }, filesChanged: 5 });
    const winners = compareWinners([hybrid, ai]);
    expect(winners.tokensEstimate).toEqual([]);
    expect(winners.tokens).toEqual(["hybrid"]);
    expect(compareRows.map((row) => row.id)).toEqual(expect.arrayContaining(["tokensEstimate", "tokens"]));
    expect(metricText(hybrid.metrics, "tokensEstimate")).toBe("~1,000–5,000");
    expect(metricText(run("ai", { estimate: null }).metrics, "tokensEstimate")).toBe("n/a");
  });

  it("records the estimate on the run and reports actual vs estimate", () => {
    const state = createRunState({ runId: "est1", repoPath: "/x/lib", dryRun: true, engine: "hybrid", fixer: async () => ({ status: "finished", note: "", sessionId: null }), estimate: { low: 1000, high: 5000, method: ["m"] } });
    state.engine!.ai.calls = 1;
    state.engine!.ai.reportedCalls = 1;
    state.engine!.ai.tokensIn = 900;
    state.engine!.ai.tokensOut = 100;
    expect(runMetrics(state).estimate).toEqual({ low: 1000, high: 5000 });
    expect(engineSection(state).join("\n")).toContain("Token estimate before the run: ~1,000–5,000; actual 1,000 (within the estimate)");
    state.engine!.ai.tokensIn = 90_000;
    expect(engineSection(state).join("\n")).toContain("(over the estimate)");
  });
});

describe("calibration on the real library run", () => {
  it("puts Hybrid on the library sample around 200k-450k input and the real 291k/13k run inside the range", async () => {
    const repo = path.join(tempDir("leapfrog-calib-"), "library");
    cpSync(path.join(samplesRoot, "library"), repo, { recursive: true });
    const plan = await generatePlan({ repoPath: repo, request: { targets: {}, from: {} } });
    const { hybrid, ai } = estimateTokens(plan, { fixRounds: 3, aiAttempts: 3, narrative: true });
    expect(hybrid.input.low).toBeGreaterThanOrEqual(150_000);
    expect(hybrid.input.high).toBeLessThanOrEqual(500_000);
    expect(290_611).toBeGreaterThanOrEqual(hybrid.input.low);
    expect(290_611).toBeLessThanOrEqual(hybrid.input.high);
    expect(12_912).toBeGreaterThanOrEqual(hybrid.output.low);
    expect(12_912).toBeLessThanOrEqual(hybrid.output.high);
    expect(ai.input.low).toBeGreaterThan(hybrid.input.high);
  });
});

describe("leftover javax references", () => {
  it("renames Jakarta EE javax names anywhere in a file (comments too), never JDK ones, and skips locked files", async () => {
    const { renameJavaxReferences, scanJavax } = await import("../bot/lib/scanner.js");
    const dir = tempDir("leapfrog-javax-");
    mkdirSync(path.join(dir, "src"), { recursive: true });
    writeFileSync(path.join(dir, "src/A.java"), 'import jakarta.servlet.Filter;\nimport javax.crypto.Cipher;\n/** Plain javax.servlet.Filter: becomes jakarta.servlet. */\nclass A { String s = "javax.persistence.Entity"; }\r\n');
    writeFileSync(path.join(dir, "src/B.java"), "// javax.validation.Valid\n");
    expect(scanJavax(dir).javaxFiles.sort()).toEqual(["src/A.java", "src/B.java"]);
    const edits = renameJavaxReferences(dir, ["src/A.java", "src/B.java"], (file) => file === "src/B.java");
    expect(edits).toEqual([{ file: "src/A.java", references: 2 }]);
    const text = readFileSync(path.join(dir, "src/A.java"), "utf8");
    expect(text).toContain("/** Plain jakarta.servlet.Filter: becomes jakarta.servlet. */");
    expect(text).toContain('"jakarta.persistence.Entity"');
    expect(text).toContain("import javax.crypto.Cipher;");
    expect(text.endsWith("}\r\n")).toBe(true);
    expect(scanJavax(dir).javaxFiles).toEqual(["src/B.java"]);
  });
});

describe("hybrid rewrite fixes", () => {
  it("tells a compile failure from a download failure", async () => {
    const { isCompileFailure, isResolutionFailure } = await import("../bot/lib/engine.js");
    const compile = "[ERROR] COMPILATION ERROR : \n[ERROR] SecurityConfig.java:[10,72] cannot find symbol\n[ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.14.1:compile (default-compile)";
    expect(isCompileFailure(compile)).toBe(true);
    expect(isResolutionFailure(compile)).toBe(false);
    expect(isCompileFailure("Could not transfer artifact org.openrewrite.recipe:rewrite-spring:pom:6.37.1")).toBe(false);
    expect(isCompileFailure("java.lang.IllegalStateException: recipe not found")).toBe(false);
  });

  it("builds one Gradle init script for several recipes", async () => {
    const { gradleInitScript } = await import("../bot/lib/build.js");
    const script = gradleInitScript("org.openrewrite:plugin:7.41.0", ["org.openrewrite.recipe:a:1", "org.openrewrite.recipe:b:2", "org.openrewrite.recipe:a:1"], ["x.One", "x.Two"]);
    expect(script.match(/rewrite\("/g)).toHaveLength(2);
    expect(script).toContain('activeRecipe("x.One")');
    expect(script).toContain('activeRecipe("x.Two")');
    expect(() => gradleInitScript("org.openrewrite:plugin:7.41.0", "x:y:1", ["ok.One", 'bad"); x']))
      .toThrow();
  });

  it("finds the routes under /agent or at the root, and keeps a full URL as given", async () => {
    const { discoverBase } = await import("../cli/server.js");
    const seen: string[] = [];
    const mounted = (prefix: string) =>
      (async (url: string | URL | Request) => {
        const text = String(url);
        seen.push(text);
        return text.startsWith(`${prefix}/v1/channels/migrate/config`) ? new Response('{"version":"1","engines":{}}', { status: 200 }) : new Response("not_found", { status: 404 });
      }) as typeof fetch;
    expect((await discoverBase("http://h:3000/", null, mounted("http://h:3000/agent"))).base).toBe("http://h:3000/agent/v1/channels/migrate");
    expect((await discoverBase("http://h:3000", null, mounted("http://h:3000"))).base).toBe("http://h:3000/v1/channels/migrate");
    expect((await discoverBase("http://h:3000/agent", null, mounted("http://h:3000/agent"))).base).toBe("http://h:3000/agent/v1/channels/migrate");
    expect((await discoverBase("http://h:3000/agent/v1/channels/migrate", null, mounted("http://x"))).base).toBe("http://h:3000/agent/v1/channels/migrate");
    expect((await discoverBase("http://h:3000", null, mounted("http://nowhere"))).tried).toEqual(["http://h:3000/agent/v1/channels/migrate", "http://h:3000/v1/channels/migrate"]);
    expect(seen.length).toBeGreaterThan(3);
  });
});

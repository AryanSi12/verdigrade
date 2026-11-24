import { afterAll, describe, expect, it } from "vitest";
import { tempDir } from "./helpers.js";

process.env.LEAPFROG_DATA_DIR = tempDir("leapfrog-engine-history-");

// Close the SQLite file first: Windows cannot delete a folder with an open database in it.
afterAll(async () => {
  (await import("../bot/lib/history.js")).closeHistory();
});

describe("history keeps the engine", () => {
  it("saves engine, model and tokens with a run and lists them", async () => {
    const { listMigrations, loadRunState, saveRun } = await import("../bot/lib/history.js");
    const { createRunState } = await import("../bot/lib/pipeline.js");
    const { recordAiCall } = await import("../bot/lib/engine.js");
    const state = createRunState({ runId: "run-h1", repoPath: "/x/tickets", dryRun: true, engine: "hybrid", fixer: async () => ({ status: "finished", note: "", sessionId: null }) });
    recordAiCall(state.engine!, { model: "grok-4.7", usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 } });
    state.status = "passed";
    saveRun(state);
    const classic = createRunState({ runId: "run-h2", repoPath: "/x/tickets", dryRun: true, engine: "classic" });
    saveRun(classic);
    const { items } = listMigrations();
    expect(items.find((item) => item.sessionId === "run-h1")).toMatchObject({ engine: "hybrid", model: "grok-4.7", tokens: 120 });
    expect(items.find((item) => item.sessionId === "run-h2")).toMatchObject({ engine: "classic", tokens: 0 });
    expect(loadRunState("run-h1").state?.engine?.model).toBe("grok-4.7");
  });

  it("saves, updates and lists engine comparisons; a stale 'running' one is failed on restart", async () => {
    const { listComparisons, loadComparison, saveComparison, failStaleComparisons } = await import("../bot/lib/history.js");
    saveComparison({ id: "cmp-1", repoPath: "/x/tickets", createdAt: "2026-11-20T10:00:00.000Z", status: "running" });
    expect(loadComparison<{ status: string }>("cmp-1")?.status).toBe("running");
    failStaleComparisons(() => true);
    expect(loadComparison<{ status: string }>("cmp-1")?.status).toBe("running");
    failStaleComparisons(() => false);
    expect(loadComparison<{ status: string; error: string }>("cmp-1")).toMatchObject({ status: "failed" });
    expect(listComparisons<{ id: string }>().map((item) => item.id)).toContain("cmp-1");
  });
});

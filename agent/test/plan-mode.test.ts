import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectEcosystem } from "../bot/lib/adapters/index.js";
import { editTsconfig } from "../bot/lib/adapters/nodeRules.js";
import { loadNodeMatrix, resolveNodeRoute } from "../bot/lib/adapters/nodeMatrix.js";
import { scanNodeProject } from "../bot/lib/adapters/nodeScan.js";
import { GitSafety } from "../bot/lib/git.js";
import { createLockSet, registerLocks } from "../bot/lib/locks.js";
import { applyTextPatch } from "../bot/lib/patch.js";
import { approvePlan, generatePlan, lockedPatterns, mergeAiReview, migrationPlanSchema, updatePlan } from "../bot/lib/plan.js";
import { isPlanReview } from "../bot/lib/toolGuards.js";
import applyTextPatchTool from "../bot/tools/apply_text_patch.js";
import { tempDir } from "./helpers.js";

const samples = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../samples");

describe("adapter detection and Node scan", () => {
  it("prefers Java when Maven/Gradle and package.json coexist", () => {
    const dir = tempDir("leapfrog-detect-");
    writeFileSync(path.join(dir, "package.json"), "{}");
    expect(detectEcosystem(dir)).toBe("node");
    writeFileSync(path.join(dir, "pom.xml"), "<project/>");
    expect(detectEcosystem(dir)).toBe("java");
  });

  it("scans node-orders and resolves the default Node route", () => {
    const scan = scanNodeProject(path.join(samples, "node-orders"));
    expect(scan).toMatchObject({ nodeVersion: "18", typescriptVersion: "4.9", expressMajor: 4, packageManager: "npm" });
    expect(scan.expressDeprecated.map((hit) => hit.api)).toContain("req.param(name)");
    const route = resolveNodeRoute({ fromNode: "18" });
    expect(route.ok && route.route.id).toBe(loadNodeMatrix().routes.find((item) => item.node === "24" && item.typescript === "6.0")?.id);
  });

  it("makes TypeScript 6 tsconfig edits idempotently", () => {
    const route = resolveNodeRoute({ node: "24", typescript: "6.0" });
    if (!route.ok) throw new Error(route.error);
    const input = '{\n  "compilerOptions": {\n    "module": "commonjs",\n    "moduleResolution": "node",\n    "baseUrl": ".",\n    "downlevelIteration": true,\n    "strict": true\n  }\n}\n';
    const first = editTsconfig(input, route.tsconfig, ["node"]);
    expect(first.text).toContain('"moduleResolution": "nodenext"');
    expect(first.text).not.toContain("baseUrl");
    expect(first.text).toContain('"types": ["node"]');
    expect(editTsconfig(first.text, route.tsconfig, ["node"]).changed).toBe(false);
  });
});

describe("migration plan", () => {
  it("groups Node findings and validates as migration-plan.json", async () => {
    const plan = await generatePlan({ repoPath: path.join(samples, "node-orders"), request: { targets: {}, from: {} } });
    expect(migrationPlanSchema.parse(plan).ecosystem).toBe("node");
    expect(plan.items.some((item) => item.group === "auto" && item.category === "codemod")).toBe(true);
    expect(plan.items.some((item) => item.group === "review" && item.file === "src/links.ts")).toBe(true);
    expect(plan.items.find((item) => item.category === "db-migration")).toMatchObject({ group: "manual", decision: "lock", file: "db/migrations/" });
  });

  it("stores decisions, paths and approval; directory locks are not sampled", async () => {
    const plan = await generatePlan({ repoPath: path.join(samples, "node-orders"), request: { targets: {}, from: {} } });
    const docker = plan.items.find((item) => item.category === "container")!;
    const updated = approvePlan(updatePlan(plan, { decisions: [{ id: docker.id, decision: "manual", note: "Ops owns it" }], lockedPaths: [{ pattern: "src/generated/**", note: "" }] }));
    expect(updated.status).toBe("approved");
    expect(lockedPatterns(updated)).toEqual(expect.arrayContaining(["db/migrations/", "Dockerfile", "src/generated/**"]));
    expect(() => updatePlan(plan, { decisions: [], lockedPaths: [{ pattern: "../outside", note: "" }] })).toThrow();
  });

  it("keeps only AI findings whose file, line and evidence verify", async () => {
    const repo = path.join(samples, "node-orders");
    const plan = await generatePlan({ repoPath: repo, request: { targets: {}, from: {} }, ai: true });
    const merged = mergeAiReview(plan, {
      summary: "Check redirects.",
      comments: [],
      findings: [
        { group: "review", category: "express-redirect", severity: "medium", title: "Back redirect", file: "src/app.ts", line: 35, evidence: 'res.redirect("back")', why: "Changed", suggestion: "Test it" },
        { group: "review", category: "invented", severity: "high", title: "Invented", file: "src/missing.ts", line: 1, evidence: "nothing", why: "", suggestion: "" },
        { group: "review", category: "wrong-line", severity: "low", title: "Wrong line", file: "src/app.ts", line: 1, evidence: 'res.redirect("back")', why: "", suggestion: "" },
      ],
    });
    expect(merged.items.filter((item) => item.source === "ai")).toHaveLength(1);
    expect(merged.ai).toMatchObject({ status: "done", added: 1, dropped: 2 });
  });
});

describe("lock enforcement", () => {
  it("reverts locked paths after a step and keeps unlocked changes", async () => {
    const dir = tempDir("leapfrog-lock-");
    writeFileSync(path.join(dir, "keep.txt"), "old\n");
    writeFileSync(path.join(dir, "change.txt"), "old\n");
    const git = await GitSafety.openShadow(dir, path.join(tempDir("leapfrog-git-"), "shadow.git"));
    writeFileSync(path.join(dir, "keep.txt"), "new\n");
    writeFileSync(path.join(dir, "change.txt"), "new\n");
    mkdirSync(path.join(dir, "locked"));
    writeFileSync(path.join(dir, "locked", "new.txt"), "new\n");
    const reverted = await git.revertLocked(createLockSet(["keep.txt", "locked/**"]));
    expect(reverted).toEqual(expect.arrayContaining([{ file: "keep.txt", pattern: "keep.txt", action: "restored" }, { file: "locked/new.txt", pattern: "locked/**", action: "removed" }]));
    expect(readFileSync(path.join(dir, "keep.txt"), "utf8")).toBe("old\n");
    expect(readFileSync(path.join(dir, "change.txt"), "utf8")).toBe("new\n");
  });

  it("refuses AI patches to locked paths and every write during plan review", async () => {
    const dir = tempDir("leapfrog-ai-lock-");
    mkdirSync(path.join(dir, "src"), { recursive: true });
    writeFileSync(path.join(dir, "pom.xml"), "<project/>");
    writeFileSync(path.join(dir, "src", "A.java"), "class A {}\n");
    const unregister = registerLocks(dir, createLockSet(["src/A.java"]));
    try {
      expect(applyTextPatch(dir, "src/A.java", "class A", "class B")).toMatchObject({ ok: false, error: expect.stringMatching(/locked/) });
    } finally {
      unregister();
    }
    expect(isPlanReview({ session: { continuationKey: "plan:abc" } })).toBe(true);
    const execute = applyTextPatchTool.execute as unknown as (input: unknown, context: unknown) => Promise<unknown>;
    const result = await execute({ repoPath: dir, filePath: "src/A.java", oldText: "class A", newText: "class B" }, { session: { continuationKey: "plan:abc" } });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/read-only/) });
  });
});

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { boot4Breaks } from "../bot/lib/adapters/javaPlan.js";
import { secretFix } from "../bot/lib/adapters/findings.js";
import { simpleNodeRewrite } from "../bot/lib/adapters/node.js";
import { predictImpact } from "../bot/lib/impact.js";
import { applyTierDefaults, approvePlan, breakSettled, generatePlan, itemFixer, itemTier, loadPlan, mergeRecheck, recheckPlan, runPlanInfo, savePlan, tierCounts, updatePlan, withExcerpts, type MigrationPlan } from "../bot/lib/plan.js";
import { aiStatus, applyChanges, applyFixEdits, blockedReason, fixScope, keepFix, keptChanges, prepareWorkspace, runPlanFix, startPlanFix, undoFix, unifiedDiff, type AskModel } from "../bot/lib/planFix.js";
import { tempDir } from "./helpers.js";

const request = { targets: { boot: "4.0" }, from: {} };

const redisConfig = `package com.acme.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;

public class RedisConfig {
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory factory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        template.setValueSerializer(new GenericJackson2JsonRedisSerializer(objectMapper));
        return template;
    }
}
`;

const securityConfig = `package com.acme.config;

import org.springframework.security.config.annotation.web.builders.HttpSecurity;

public class SecurityConfig {
    private UserDetailServiceImpl userDetailServiceImpl;

    public AuthenticationManager authenticationManager() {
        DaoAuthenticationProvider authProvider = new DaoAuthenticationProvider();
        authProvider.setUserDetailsService(userDetailServiceImpl);
        authProvider.setPasswordEncoder(passwordEncoder());
        return new ProviderManager(authProvider);
    }

    public SecurityFilterChain chain(HttpSecurity http) throws Exception {
        http.csrf().disable().and().cors();
        return http.build();
    }
}
`;

const pom = `<project>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.11</version>
  </parent>
  <properties><java.version>21</java.version></properties>
  <dependencies>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>
  </dependencies>
</project>
`;

const redisPath = "src/main/java/com/acme/config/RedisConfig.java";
const securityPath = "src/main/java/com/acme/config/SecurityConfig.java";
const propsPath = "src/main/resources/application.properties";

function makeProject(): string {
  const root = tempDir("leapfrog-plan3-");
  const files: Record<string, string> = {
    "pom.xml": pom,
    [redisPath]: redisConfig,
    [securityPath]: securityConfig,
    "src/main/java/com/acme/App.java": "package com.acme;\npublic class App {}\n",
    [propsPath]: "spring.application.name=demo\nspring.data.redis.password=SuperSecret123\n",
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

beforeAll(() => {
  process.env.LEAPFROG_DATA_DIR = tempDir("leapfrog-plan3-data-");
});

describe("Boot 4 'will break' detectors", () => {
  it("finds the Jackson 2 Redis serializer with the mapper setup and a Jackson 3 fix", () => {
    const [item] = boot4Breaks(redisPath, redisConfig);
    expect(item).toMatchObject({ kind: "api.jackson2-spring-bridge", tier: "breaks", defaultDecision: "lock", line: 12 });
    expect(item.fix!.before).toContain("new ObjectMapper()");
    expect(item.fix!.before).toContain("registerModule(new JavaTimeModule())");
    expect(item.fix!.after).toContain("JsonMapper objectMapper = JsonMapper.builder().build();");
    expect(item.fix!.after).toContain("new GenericJacksonJsonRedisSerializer(objectMapper)");
    expect(item.fix!.after).not.toContain("JavaTimeModule");
  });

  it("finds new DaoAuthenticationProvider() and fills in the real UserDetailsService", () => {
    const items = boot4Breaks(securityPath, securityConfig);
    const dao = items.find((item) => item.kind === "api.dao-auth-provider")!;
    expect(dao).toMatchObject({ tier: "breaks", line: 9 });
    expect(dao.fix!.after).toBe("DaoAuthenticationProvider authProvider = new DaoAuthenticationProvider(userDetailServiceImpl);");
    expect(dao.snippets!.map((snippet) => snippet.line)).toEqual([9, 10]);
    expect(items.find((item) => item.kind === "api.security-and")).toMatchObject({ tier: "breaks", line: 16 });
  });

  it("ignores code that is already fixed", () => {
    expect(boot4Breaks(securityPath, "new DaoAuthenticationProvider(userDetailsService);")).toEqual([]);
    expect(boot4Breaks(redisPath, "new GenericJacksonJsonRedisSerializer(mapper);")).toEqual([]);
  });

  it("gives an environment-variable fix for secrets without showing the value", () => {
    const fix = secretFix("spring.data.redis.password=SuperSecret123");
    expect(fix.before).toBe("spring.data.redis.password=***");
    expect(fix.after).toBe("spring.data.redis.password=${SPRING_DATA_REDIS_PASSWORD}");
    expect(JSON.stringify(fix)).not.toContain("SuperSecret123");
  });

  it("rewrites the simplest removed Node calls exactly", () => {
    expect(simpleNodeRewrite("const b = new Buffer(10);")).toBe("const b = Buffer.alloc(10);");
    expect(simpleNodeRewrite("app.del('/x', h)")).toBe("app.delete('/x', h)");
    expect(simpleNodeRewrite("res.json(body, 201)")).toBe("res.status(201).json(body)");
    expect(simpleNodeRewrite("url.parse(x)")).toBeNull();
  });
});

describe("tiers and lock defaults", () => {
  it("does not lock 'will break' items the run can fix; labels who fixes each item", async () => {
    const plan = await generatePlan({ repoPath: makeProject(), request });
    const breaks = plan.items.filter((item) => item.tier === "breaks");
    expect(breaks.map((item) => item.kind).sort()).toEqual(["api.dao-auth-provider", "api.jackson2-spring-bridge", "api.security-and"]);
    // Code changes the AI can make stay approved: Hybrid's AI step and Full AI fix them.
    for (const item of breaks) expect(item).toMatchObject({ decision: "approve", fixer: "ai" });
    expect(plan.items.filter((item) => item.group === "auto").every((item) => item.tier === "safe" && item.fixer === "openrewrite")).toBe(true);
    expect(plan.items.find((item) => item.kind === "inline-secret")!.fixer).toBe("needs-you");
    expect(tierCounts(plan)).toMatchObject({ breaks: 3, mustFix: 0 });
    expect(tierCounts(plan).byFixer.ai).toBeGreaterThanOrEqual(3);
    expect(runPlanInfo(approvePlan(plan), "store").aiItems!.map((item) => item.title).length).toBeGreaterThanOrEqual(3);
    const dao = breaks.find((item) => item.kind === "api.dao-auth-provider")!;
    expect(dao.excerpt).toMatchObject({ focusLine: 9, startLine: 7 });
    expect(dao.excerpt!.lines.join("\n")).toContain("new DaoAuthenticationProvider()");
  });

  it("never shows secret values in excerpts", async () => {
    const plan = await generatePlan({ repoPath: makeProject(), request });
    expect(JSON.stringify(plan)).not.toContain("SuperSecret123");
    const secret = plan.items.find((item) => item.kind === "inline-secret")!;
    expect(secret.tier).toBe("review");
    expect(secret.excerpt!.lines.join("\n")).toContain("spring.data.redis.password=***");
  });

  it("only items that need you are locked by default and need an explicit accept-risk", () => {
    const base = {
      group: "review" as const,
      category: "api",
      severity: "high" as const,
      title: "web.xml needs a decision",
      file: null,
      line: null,
      why: "x",
      suggestion: "y",
      source: "deterministic" as const,
      decision: "approve" as const,
      note: "",
      tier: "breaks" as const,
    };
    const item = { ...base, id: "F-aaaaaaaaaa" };
    expect(itemFixer(item)).toBe("needs-you");
    expect(itemFixer({ ...item, file: "src/A.java" })).toBe("ai");
    expect(itemFixer({ ...item, file: "db/migrations/", group: "review" })).toBe("needs-you");
    expect(itemFixer({ ...item, file: "src/A.java", group: "manual" })).toBe("needs-you");
    expect(itemFixer({ ...item, file: "src/A.java", kind: "inline-secret" })).toBe("needs-you");
    const sample = { ...({} as MigrationPlan), items: [item, { ...item, id: "F-bbbbbbbbbb", file: "src/A.java", line: 3 }] } as MigrationPlan;
    const defaults = applyTierDefaults(sample);
    expect(defaults.items[0]).toMatchObject({ decision: "manual", fixer: "needs-you" });
    expect(defaults.items[1]).toMatchObject({ decision: "approve", fixer: "ai" });
    expect(breakSettled(defaults.items[1] as never)).toBe(true);
    expect(breakSettled({ ...defaults.items[0], decision: "approve" } as never)).toBe(false);
  });

  it("an AI-labelled 'will break' item approves without accepting a risk, and approval passes", async () => {
    const plan = await generatePlan({ repoPath: makeProject(), request });
    const dao = plan.items.find((item) => item.kind === "api.dao-auth-provider")!;
    const locked = updatePlan(plan, { decisions: [{ id: dao.id, decision: "lock" }] });
    expect(locked.items.find((item) => item.id === dao.id)!.decision).toBe("lock");
    const again = updatePlan(locked, { decisions: [{ id: dao.id, decision: "approve" }] });
    expect(again.items.find((item) => item.id === dao.id)!.decision).toBe("approve");
    expect(approvePlan(again).status).toBe("approved");
    // Locking an item still keeps its file unchanged.
    expect(approvePlan(locked).status).toBe("approved");
  });

  it("re-check moves a hand-fixed break to Fixed and keeps other decisions", async () => {
    const repo = makeProject();
    const plan = savePlan(await generatePlan({ repoPath: repo, request }));
    const jackson = plan.items.find((item) => item.kind === "api.jackson2-spring-bridge")!;
    const withNote = updatePlan(plan, { decisions: [{ id: jackson.id, note: "keep me" }] });
    writeFileSync(path.join(repo, securityPath), securityConfig.replace("new DaoAuthenticationProvider()", "new DaoAuthenticationProvider(userDetailServiceImpl)").replace("        authProvider.setUserDetailsService(userDetailServiceImpl);\n", ""));
    const next = await recheckPlan(withNote);
    expect(next.items.some((item) => item.kind === "api.dao-auth-provider")).toBe(false);
    expect(next.resolved!.map((entry) => entry.title)).toEqual(["new DaoAuthenticationProvider() won't compile on Spring Security 7"]);
    expect(next.items.find((item) => item.kind === "api.jackson2-spring-bridge")!.note).toBe("keep me");
    expect(tierCounts(next)).toMatchObject({ breaks: 2, resolved: 1 });
    // Merge is idempotent.
    expect(mergeRecheck(next, await generatePlan({ repoPath: repo, request })).resolved).toHaveLength(1);
  });

  it("fills a tier for plans saved before tiers existed", () => {
    expect(itemTier({ group: "auto", tier: undefined, explain: undefined })).toBe("safe");
    expect(itemTier({ group: "review", tier: undefined, explain: { approvedEffect: "fails-build" } as never })).toBe("breaks");
    expect(itemTier({ group: "review", tier: undefined, explain: { approvedEffect: "runtime" } as never })).toBe("review");
  });
});

describe("Fix with AI (mocked model)", () => {
  const goodReply = JSON.stringify({
    summary: "Passed the UserDetailsService to the constructor and removed the setter.",
    edits: [
      { file: securityPath, oldText: "new DaoAuthenticationProvider();\n        authProvider.setUserDetailsService(userDetailServiceImpl);", newText: "new DaoAuthenticationProvider(userDetailServiceImpl);" },
    ],
  });

  async function setup() {
    const repo = makeProject();
    const plan = savePlan(await generatePlan({ repoPath: repo, request }));
    const dao = plan.items.find((item) => item.kind === "api.dao-auth-provider")!;
    return { repo, plan, dao };
  }

  it("reports plainly when no model credential is set", () => {
    const status = aiStatus({ HOME: "/nonexistent", XDG_CONFIG_HOME: "/nonexistent" });
    expect(status.configured).toBe(false);
    expect(status.message).toContain("CURSOR_API_KEY");
    expect(aiStatus({ CURSOR_API_KEY: "x" })).toMatchObject({ configured: true, source: "CURSOR_API_KEY" });
  });

  it("limits edits to the finding's files and refuses locked paths", async () => {
    const { plan, dao } = await setup();
    expect(fixScope(dao)).toEqual([securityPath]);
    expect(blockedReason(plan, dao, redisPath)).toMatch(/outside this finding/);
    expect(blockedReason(plan, dao, "../etc/passwd")).toMatch(/not a project-relative path/);
    expect(blockedReason(plan, dao, securityPath)).toBeNull();
    const locked = updatePlan(plan, { decisions: [], lockedPaths: [{ pattern: "src/main/java/com/acme/config/**", note: "" }] });
    expect(blockedReason(locked, dao, securityPath)).toMatch(/you locked it/);

    const work = prepareWorkspace(plan);
    const result = applyFixEdits(plan, dao, work, {
      summary: "",
      edits: [
        { file: redisPath, oldText: "GenericJackson2JsonRedisSerializer(objectMapper)", newText: "X" },
        { file: securityPath, oldText: "not in the file", newText: "Y" },
      ],
    });
    expect(result.changes).toEqual([]);
    expect(result.refused[0]).toMatch(/outside this finding/);
    // All or nothing: one good edit plus one bad one changes nothing.
    const mixed = applyFixEdits(plan, dao, work, {
      summary: "",
      edits: [
        { file: securityPath, oldText: "new DaoAuthenticationProvider();", newText: "new DaoAuthenticationProvider(userDetailServiceImpl);" },
        { file: securityPath, oldText: "not in the file", newText: "Y" },
      ],
    });
    expect(mixed.changes).toEqual([]);
    expect(readFileSync(path.join(work, securityPath), "utf8")).toBe(securityConfig);
    expect(result.refused[1]).toMatch(/not found/);
    expect(readFileSync(path.join(work, redisPath), "utf8")).toBe(redisConfig);
  });

  it("fixes on a private copy, re-checks, unlocks, and keep/undo work", async () => {
    const { repo, plan, dao } = await setup();
    const prompts: string[] = [];
    const ask: AskModel = async (prompt) => {
      prompts.push(prompt);
      return { text: "```json\n" + goodReply + "\n```", sessionId: "s-1" };
    };
    const { fixId } = startPlanFix(plan.planId, dao.id);
    expect(loadPlan(plan.planId)!.items.find((item) => item.id === dao.id)!.aiFix!.status).toBe("running");
    const done = await runPlanFix(plan.planId, fixId, ask);
    expect(prompts[0]).toContain(`You may only change these files: ${securityPath}`);
    const record = done.aiFixes!.find((entry) => entry.fixId === fixId)!;
    expect(record).toMatchObject({ status: "proposed", resolved: true });
    expect(record.files[0].diff).toContain("+        DaoAuthenticationProvider authProvider = new DaoAuthenticationProvider(userDetailServiceImpl);");
    const item = done.items.find((entry) => entry.id === dao.id)!;
    expect(item).toMatchObject({ decision: "approve", aiFix: { status: "proposed", resolved: true, previousDecision: "approve" } });
    // The user's folder is untouched.
    expect(readFileSync(path.join(repo, securityPath), "utf8")).toBe(securityConfig);
    // A proposed fix must be kept or undone before approval.
    expect(() => approvePlan(done)).toThrow(/Keep or undo/);

    const kept = keepFix(plan.planId, fixId);
    expect(kept.items.find((entry) => entry.id === dao.id)!.aiFix!.status).toBe("kept");
    expect(tierCounts(kept)).toMatchObject({ fixedByAi: 1, mustFix: 0, breaks: 2 });
    // The kept fix leaves the impact preview: no warning for that item any more.
    const keptImpact = predictImpact(kept);
    expect(keptImpact.items[dao.id]).toMatchObject({ state: "fixed", risk: "none" });
    expect(keptImpact.consequences.some((entry) => entry.id === dao.id)).toBe(false);
    expect(keptImpact.counts.fixed).toBe(1);
    const approved = approvePlan(kept);
    const info = runPlanInfo(approved, "store");
    expect(info.aiPreFixes).toEqual([expect.objectContaining({ fixId, files: [securityPath] })]);
    // Nothing is locked any more: the other break in SecurityConfig (.and()) is left to the run's AI step, which starts from the kept fix.
    expect(info.lockedPaths).not.toContain(securityPath);
    expect(info.aiItems!.some((entry) => entry.id === dao.id)).toBe(false);
    expect(info.aiItems!.length).toBeGreaterThanOrEqual(2);

    // Kept fixes apply to a run's work folder.
    const copy = tempDir("leapfrog-plan3-run-");
    mkdirSync(path.dirname(path.join(copy, securityPath)), { recursive: true });
    writeFileSync(path.join(copy, securityPath), securityConfig);
    const [content] = keptChanges(plan.planId, [fixId]);
    expect(applyChanges(copy, content.changes)).toEqual({ applied: [securityPath], skipped: [] });
    expect(readFileSync(path.join(copy, securityPath), "utf8")).toContain("new DaoAuthenticationProvider(userDetailServiceImpl);");

    const undone = undoFix(plan.planId, fixId);
    expect(undone.items.find((entry) => entry.id === dao.id)).toMatchObject({ decision: "approve", aiFix: { status: "undone" } });
    expect(predictImpact(undone).items[dao.id].state).not.toBe("fixed");
    expect(tierCounts(undone)).toMatchObject({ breaks: 3, fixedByAi: 0 });
    expect(runPlanInfo(undone, "store").aiPreFixes).toBeUndefined();
    // The next workspace no longer carries the undone edit.
    expect(readFileSync(path.join(prepareWorkspace(undone), securityPath), "utf8")).toBe(securityConfig);
  });

  it("matches CRLF files (Windows checkouts) when the model writes \\n", async () => {
    const { repo, plan, dao } = await setup();
    writeFileSync(path.join(repo, securityPath), securityConfig.replace(/\n/g, "\r\n"));
    const { fixId } = startPlanFix(plan.planId, dao.id);
    const done = await runPlanFix(plan.planId, fixId, async () => ({ text: goodReply }));
    expect(done.aiFixes!.find((entry) => entry.fixId === fixId)).toMatchObject({ status: "proposed", resolved: true });
    const [content] = keptChanges(plan.planId, [fixId]);
    expect(content.changes[0].after).toContain("new DaoAuthenticationProvider(userDetailServiceImpl);\r\n");
  });

  it("records a failure when the model's edits are all refused or it is unreachable", async () => {
    const { plan, dao } = await setup();
    const { fixId } = startPlanFix(plan.planId, dao.id);
    const refused = await runPlanFix(plan.planId, fixId, async () => ({ text: JSON.stringify({ summary: "x", edits: [{ file: redisPath, oldText: "a", newText: "b" }] }) }));
    expect(refused.aiFixes!.find((entry) => entry.fixId === fixId)).toMatchObject({ status: "failed" });
    expect(refused.items.find((entry) => entry.id === dao.id)!.decision).toBe("approve");

    const second = startPlanFix(plan.planId, dao.id);
    const failed = await runPlanFix(plan.planId, second.fixId, async () => {
      throw new Error("401 Unauthorized: missing API key");
    });
    expect(failed.aiFixes!.find((entry) => entry.fixId === second.fixId)!.error).toMatch(/CURSOR_API_KEY/);
  });

  it("merges a kept fix with what the recipe changed in the same file (AI wins on overlaps)", () => {
    const pad = "  // a\n  // b\n  // c\n";
    const base = `import com.fasterxml.jackson.databind.ObjectMapper;\nclass A {\n${pad}  int keep = 1;\n${pad}  Object m = new ObjectMapper();\n}\n`;
    const recipe = `import tools.jackson.databind.ObjectMapper;\nclass A {\n${pad}  int keep = 2;\n${pad}  Object m = new ObjectMapper();\n}\n`;
    const ai = `import tools.jackson.databind.ObjectMapper;\nimport tools.jackson.databind.json.JsonMapper;\nclass A {\n${pad}  int keep = 1;\n${pad}  Object m = JsonMapper.builder().build();\n}\n`;
    const root = tempDir("leapfrog-plan3-merge-");
    writeFileSync(path.join(root, "A.java"), recipe);
    expect(applyChanges(root, [{ file: "A.java", before: base, after: ai }])).toEqual({ applied: [], skipped: ["A.java"] });
    expect(applyChanges(root, [{ file: "A.java", before: base, after: ai }], { merge: true })).toEqual({ applied: ["A.java"], skipped: [] });
    const merged = readFileSync(path.join(root, "A.java"), "utf8");
    expect(merged).toContain("int keep = 2;");
    expect(merged).toContain("JsonMapper.builder().build()");
    expect(merged).toContain("import tools.jackson.databind.json.JsonMapper;");
    expect(merged).not.toContain("<<<<<<<");
  });

  it("makes a readable unified diff", () => {
    const diff = unifiedDiff("A.java", "a\nb\nc\nd\n", "a\nB\nc\nd\n");
    expect(diff).toContain("-b\n+B");
    expect(diff.startsWith("--- a/A.java\n+++ b/A.java\n@@ -1,")).toBe(true);
    // Far-apart changes become separate hunks (no wall of unchanged lines).
    const long = Array.from({ length: 40 }, (_, index) => `line ${index + 1}`);
    const edited = [...long];
    edited[1] = "changed 2";
    edited[37] = "changed 38";
    const hunks = unifiedDiff("B.java", long.join("\n"), edited.join("\n")).split("\n").filter((line) => line.startsWith("@@"));
    expect(hunks).toEqual(["@@ -1,5 +1,5 @@", "@@ -35,6 +35,6 @@"]);
  });

  it("excerpts survive a plan without files", () => {
    expect(existsSync).toBeDefined();
    const plan = { items: [] } as unknown as MigrationPlan;
    expect(withExcerpts(plan, "/nonexistent").items).toEqual([]);
  });
});

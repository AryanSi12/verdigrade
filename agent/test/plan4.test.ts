import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cloneGitHubRepo } from "../bot/lib/github.js";
import { approvePlan, findingKey, generatePlan, loadPlan, maskSecretLine, savePlan, type MigrationPlan, type PlanItem } from "../bot/lib/plan.js";
import { aiFixability, applySecretFix, editLimit, fixableItems, fixScope, prepareWorkspace, runFixesConcurrently, runPlanFix, startPlanFix, type AskModel } from "../bot/lib/planFix.js";
import { tempDir } from "./helpers.js";

const request = { targets: { boot: "4.0" }, from: {} };
const redisPath = "src/main/java/com/acme/config/RedisConfig.java";
const securityPath = "src/main/java/com/acme/config/SecurityConfig.java";
const serializerPath = "src/main/java/com/acme/json/ObjectIdSerializer.java";
const propsPath = "src/main/resources/application.properties";
const secretValue = "SuperSecret123";

const files: Record<string, string> = {
  "pom.xml": `<project>
  <parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>3.3.11</version></parent>
  <properties><java.version>21</java.version></properties>
  <dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies>
</project>
`,
  [redisPath]: `package com.acme.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;

public class RedisConfig {
    public Object serializer() {
        ObjectMapper objectMapper = new ObjectMapper();
        return new GenericJackson2JsonRedisSerializer(objectMapper);
    }
}
`,
  [securityPath]: `package com.acme.config;

public class SecurityConfig {
    public Object chain(HttpSecurity http) throws Exception {
        http.csrf().disable().and().cors();
        return http.build();
    }
}
`,
  [serializerPath]: `package com.acme.json;

import com.fasterxml.jackson.databind.JsonSerializer;

public class ObjectIdSerializer extends JsonSerializer<Object> {
}
`,
  "src/main/java/com/acme/App.java": "package com.acme;\npublic class App {}\n",
  [propsPath]: `spring.application.name=demo\r\nspring.data.redis.password=${secretValue}\r\nserver.port=8080\r\n`,
};

function makeProject(): string {
  const root = tempDir("leapfrog-plan4-");
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

async function setup() {
  const repo = makeProject();
  const plan = savePlan(await generatePlan({ repoPath: repo, request }));
  const find = (kind: string) => plan.items.find((item) => item.kind === kind)!;
  return { repo, plan, jackson: find("api.jackson2"), secret: find("inline-secret"), find };
}

const noModel: AskModel = async () => {
  throw new Error("the model must not be called");
};

beforeAll(() => {
  process.env.LEAPFROG_DATA_DIR = tempDir("leapfrog-plan4-data-");
});

describe("Fix with AI for 'might break' items", () => {
  it("offers a fix for code items and says why for the rest", async () => {
    const { plan, jackson, secret } = await setup();
    expect(jackson.tier).toBe("review");
    expect(aiFixability(plan, jackson)).toBeNull();
    expect(aiFixability(plan, secret)).toBeNull();
    const tests = plan.items.find((item) => item.kind?.startsWith("tests."))!;
    expect(aiFixability(plan, tests)).toMatch(/how many tests/);
    const credentials = { ...secret, kind: "secrets.file", file: "src/main/resources/credentials.json" } as PlanItem;
    expect(aiFixability(plan, credentials)).toMatch(/holds credentials/);
    const folder = { ...jackson, file: "src/main/resources/db/", files: undefined } as PlanItem;
    expect(aiFixability(plan, folder)).toMatch(/whole folder/);
    const docker = { ...jackson, file: "Dockerfile", files: undefined, snippets: undefined, fix: undefined } as PlanItem;
    expect(aiFixability(plan, docker)).toMatch(/only edits source and build files/);
    expect(() => startPlanFix(plan.planId, tests.id)).toThrow(/how many tests/);
  });

  it("picks the right items for 'Fix all high risks' and 'Fix all risky items'", async () => {
    const { plan, jackson, secret } = await setup();
    const risky = fixableItems(plan, "risky").map((item) => item.id);
    expect(risky).toEqual(expect.arrayContaining([jackson.id, secret.id]));
    expect(fixableItems(plan, "risky").every((item) => item.tier === "review")).toBe(true);
    const high = fixableItems(plan, "high");
    expect(high.length).toBeGreaterThan(0);
    expect(high.every((item) => item.tier === "breaks" || item.severity === "high")).toBe(true);
    expect(fixableItems(plan, "all")).toHaveLength(new Set([...risky, ...high.map((item) => item.id)]).size);
  });

  it("moves a password to an environment variable by code, never showing the value", async () => {
    const { repo, plan, secret } = await setup();
    const { fixId } = startPlanFix(plan.planId, secret.id);
    const done = await runPlanFix(plan.planId, fixId, noModel);
    const record = done.aiFixes!.find((entry) => entry.fixId === fixId)!;
    expect(record).toMatchObject({ status: "proposed", resolved: true });
    expect(record.summary).toContain("${SPRING_DATA_REDIS_PASSWORD}");
    expect(record.files[0].diff).toContain("+spring.data.redis.password=${SPRING_DATA_REDIS_PASSWORD}");
    // The value never appears in the plan (summary, diff, notes) or in what the screen gets.
    expect(JSON.stringify(done)).not.toContain(secretValue);
    // The user's folder is untouched; CRLF line endings are kept on the copy.
    expect(readFileSync(path.join(repo, propsPath), "utf8")).toContain(secretValue);
    const work = prepareWorkspace(loadPlan(plan.planId)!);
    expect(readFileSync(path.join(work, propsPath), "utf8")).toBe("spring.application.name=demo\r\nspring.data.redis.password=${SPRING_DATA_REDIS_PASSWORD}\r\nserver.port=8080\r\n");
    expect(done.items.find((item) => item.id === secret.id)!.aiFix).toMatchObject({ status: "proposed", resolved: true });
  });

  it("refuses a secret fix on a path you locked, and when the value is already a placeholder", async () => {
    const { plan, secret } = await setup();
    const locked = { ...plan, lockedPaths: [{ pattern: "src/main/resources/**", note: "" }] } as MigrationPlan;
    const work = prepareWorkspace(plan);
    expect(applySecretFix(locked, secret, work).refused[0]).toMatch(/you locked it/);
    writeFileSync(path.join(work, propsPath), "spring.application.name=demo\nspring.data.redis.password=${X}\n");
    expect(applySecretFix(plan, secret, work).refused[0]).toMatch(/already reads/);
  });

  it("fixes the 13-file style Jackson item across its files; partial fixes are not 'resolved'", async () => {
    const { plan, jackson } = await setup();
    expect(fixScope(jackson)).toEqual(expect.arrayContaining([redisPath, serializerPath]));
    expect(editLimit(jackson)).toBeGreaterThanOrEqual(20);
    const both = JSON.stringify({
      summary: "Moved the Jackson 2 imports to Jackson 3.",
      edits: [
        { file: redisPath, oldText: "import com.fasterxml.jackson.databind.ObjectMapper;", newText: "import tools.jackson.databind.ObjectMapper;" },
        { file: serializerPath, oldText: "import com.fasterxml.jackson.databind.JsonSerializer;", newText: "import tools.jackson.databind.ValueSerializer;" },
      ],
    });
    const prompts: string[] = [];
    const first = startPlanFix(plan.planId, jackson.id);
    const done = await runPlanFix(plan.planId, first.fixId, async (prompt) => {
      prompts.push(prompt);
      return { text: both };
    });
    expect(prompts[0]).toContain(serializerPath);
    expect(done.aiFixes!.find((entry) => entry.fixId === first.fixId)).toMatchObject({ status: "proposed", resolved: true });

    const other = await setup();
    const partial = JSON.stringify({ summary: "Only one file.", edits: [{ file: redisPath, oldText: "import com.fasterxml.jackson.databind.ObjectMapper;", newText: "import tools.jackson.databind.ObjectMapper;" }] });
    const second = startPlanFix(other.plan.planId, other.jackson.id);
    const half = await runPlanFix(other.plan.planId, second.fixId, async () => ({ text: partial }));
    const record = half.aiFixes!.find((entry) => entry.fixId === second.fixId)!;
    expect(record.status).toBe("proposed");
    expect(record.resolved).toBe(false);
    expect(record.recheckNote).toContain(serializerPath);
  });

  it("runs fixes on different files at the same time and same-file fixes one after another", async () => {
    const { plan, secret, find, jackson } = await setup();
    const and = find("api.security-and");
    const redis = plan.items.find((item) => item.tier === "breaks" && item.file === redisPath)!;
    const ids = [and.id, secret.id, redis.id, jackson.id].map((id) => startPlanFix(plan.planId, id).fixId);
    let active = 0;
    let peak = 0;
    const order: string[] = [];
    const ask: AskModel = async (_prompt, info) => {
      active += 1;
      peak = Math.max(peak, active);
      order.push(`start ${info.title}`);
      await new Promise((resolve) => setTimeout(resolve, 40));
      order.push(`end ${info.title}`);
      active -= 1;
      return { text: JSON.stringify({ summary: "no change", edits: [] }) };
    };
    await runFixesConcurrently(plan.planId, ids, ask, 3);
    expect(peak).toBe(2); // SecurityConfig and RedisConfig together; the Jackson item touches RedisConfig too, so it waits.
    expect(order.indexOf(`start ${jackson.title}`)).toBeGreaterThan(order.indexOf(`end ${redis.title}`));
    const final = loadPlan(plan.planId)!;
    expect(final.aiFixes!.every((entry) => entry.status !== "running")).toBe(true);
  });
});

describe("planning without waiting", () => {
  it("lets you approve before the AI review finishes, and then skips it", async () => {
    const { plan } = await setup();
    const reviewing = { ...plan, ai: { ...plan.ai, status: "running" as const } };
    expect(() => approvePlan(reviewing)).toThrow(/skipAiReview/);
    const approved = approvePlan(reviewing, { skipAiReview: true });
    expect(approved.status).toBe("approved");
    expect(approved.ai.status).toBe("skipped");
    expect(approved.ai.summary).toMatch(/before the AI review finished/);
  });

  it("keeps placeholders readable but masks real values", () => {
    expect(maskSecretLine("spring.data.redis.password=${SPRING_DATA_REDIS_PASSWORD}")).toBe("spring.data.redis.password=${SPRING_DATA_REDIS_PASSWORD}");
    expect(maskSecretLine(`spring.data.redis.password=${secretValue}`)).toBe("spring.data.redis.password=***");
  });

  it("treats an aggregate finding as the same item when its first file changes", () => {
    const base = { kind: "api.jackson2", category: "changed-api", params: {} };
    expect(findingKey({ ...base, file: "a/A.java", files: ["a/A.java", "b/B.java"] })).toBe(findingKey({ ...base, file: "b/B.java", files: ["b/B.java"] }));
  });
});

describe("faster GitHub refresh (local stand-in for GitHub)", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env.LEAPFROG_CLONE_FRESH_SECONDS = saved.LEAPFROG_CLONE_FRESH_SECONDS;
    if (saved.LEAPFROG_CLONE_FRESH_SECONDS === undefined) delete process.env.LEAPFROG_CLONE_FRESH_SECONDS;
    if (saved.GIT_CONFIG_GLOBAL === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    else process.env.GIT_CONFIG_GLOBAL = saved.GIT_CONFIG_GLOBAL;
  });

  function fakeGitHub() {
    const root = tempDir("leapfrog-fakegh-");
    const bare = path.join(root, "acme", "shop.git");
    const seed = path.join(root, "seed");
    const run = (args: string[], cwd?: string) => execFileSync("git", args, { cwd, stdio: "pipe", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).toString();
    mkdirSync(seed, { recursive: true });
    run(["init", "-q", "-b", "main"], seed);
    writeFileSync(path.join(seed, "package.json"), '{"name":"shop","version":"1.0.0"}\n');
    run(["add", "."], seed);
    run(["commit", "-qm", "one"], seed);
    run(["clone", "-q", "--bare", seed, bare]);
    const config = path.join(root, "gitconfig");
    writeFileSync(config, `[url "${pathToFileURL(root).href}/"]\n\tinsteadOf = https://github.com/\n[protocol "file"]\n\tallow = always\n[safe]\n\tdirectory = *\n`);
    process.env.GIT_CONFIG_GLOBAL = config;
    const push = (text: string) => {
      writeFileSync(path.join(seed, "README.md"), text);
      run(["add", "."], seed);
      run(["commit", "-qm", text], seed);
      run(["push", "-q", bare, "main"], seed);
      return run(["rev-parse", "HEAD"], seed).trim();
    };
    return { push, head: () => run(["rev-parse", "HEAD"], seed).trim() };
  }

  it("reuses a clone refreshed minutes ago without asking GitHub, and skips the fetch when nothing changed", async () => {
    const gh = fakeGitHub();
    const url = "https://github.com/acme/shop";
    const first = await cloneGitHubRepo({ url, refresh: true });
    expect(first.commit).toBe(gh.head());
    const newer = gh.push("two");
    // Within the fresh window: no network, same commit.
    const again = await cloneGitHubRepo({ url, refresh: true });
    expect(again.commit).toBe(first.commit);
    expect(again.clonedAt).toBe(first.clonedAt);
    // Window off: one ls-remote sees the new commit and fetches it.
    process.env.LEAPFROG_CLONE_FRESH_SECONDS = "0";
    const latest = await cloneGitHubRepo({ url, refresh: true });
    expect(latest.commit).toBe(newer);
    // Nothing new on GitHub: the fetch is skipped (FETCH_HEAD untouched), local edits are still undone.
    const fetchHead = path.join(latest.clonePath!, ".git", "FETCH_HEAD");
    const before = statSync(fetchHead).mtimeMs;
    writeFileSync(path.join(latest.localPath, "package.json"), "edited\n");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const same = await cloneGitHubRepo({ url, refresh: true });
    expect(same.commit).toBe(newer);
    expect(statSync(fetchHead).mtimeMs).toBe(before);
    expect(readFileSync(path.join(same.localPath, "package.json"), "utf8")).toContain('"shop"');
  });
});

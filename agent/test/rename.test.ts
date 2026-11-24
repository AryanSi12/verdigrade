import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { allowedRoots, apiToken, defaultFixRounds, envSetting, requirePlan } from "../bot/lib/config.js";
import { removeWorkCopy, workCopyPrefix, createWorkCopy } from "../bot/lib/git.js";
import { legacyRepoConfigFile, loadRepoConfig, repoConfigFile, repoConfigPath } from "../bot/lib/repoConfig.js";
import { tempDir } from "./helpers.js";

// Verdigrade was called java-migrator (then Leapfrog): the old env names, config file and temp prefix keep working.
const names = ["TOKEN", "ROOTS", "FIX_ROUNDS", "REQUIRE_PLAN"];
const saved = new Map<string, string | undefined>();
for (const name of names) for (const prefix of ["LEAPFROG_", "JAVA_MIGRATOR_"]) saved.set(prefix + name, process.env[prefix + name]);

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function clear() {
  for (const key of saved.keys()) delete process.env[key];
}

describe("LEAPFROG_* settings with JAVA_MIGRATOR_* fallback", () => {
  it("reads the legacy name when the new one is unset", () => {
    clear();
    process.env.JAVA_MIGRATOR_TOKEN = "old";
    process.env.JAVA_MIGRATOR_FIX_ROUNDS = "0";
    process.env.JAVA_MIGRATOR_REQUIRE_PLAN = "false";
    expect(apiToken()).toBe("old");
    expect(defaultFixRounds()).toBe(0);
    expect(requirePlan()).toBe(false);
  });

  it("prefers the new name when both are set, and treats empty as unset", () => {
    clear();
    const a = tempDir("leapfrog-root-a-");
    const b = tempDir("leapfrog-root-b-");
    process.env.JAVA_MIGRATOR_ROOTS = a;
    process.env.LEAPFROG_ROOTS = b;
    expect(allowedRoots()).toEqual([path.resolve(b)]);
    process.env.LEAPFROG_TOKEN = "new";
    process.env.JAVA_MIGRATOR_TOKEN = "old";
    expect(apiToken()).toBe("new");
    process.env.LEAPFROG_TOKEN = "  ";
    expect(envSetting("TOKEN")).toBe("old");
  });
});

describe("per-repository config file", () => {
  it("uses .leapfrog.json, then the legacy .java-migrator.json", () => {
    const dir = tempDir("leapfrog-config-");
    expect(repoConfigPath(dir)).toBeNull();
    writeFileSync(path.join(dir, legacyRepoConfigFile), JSON.stringify({ fixRounds: 1 }));
    expect(loadRepoConfig(dir).fixRounds).toBe(1);
    writeFileSync(path.join(dir, repoConfigFile), JSON.stringify({ fixRounds: 3 }));
    expect(path.basename(repoConfigPath(dir)!)).toBe(".leapfrog.json");
    expect(loadRepoConfig(dir).fixRounds).toBe(3);
  });

  it("names the file in use when it is invalid", () => {
    const dir = tempDir("leapfrog-config-bad-");
    writeFileSync(path.join(dir, legacyRepoConfigFile), "{");
    expect(() => loadRepoConfig(dir)).toThrow(/\.java-migrator\.json is not valid JSON/);
  });
});

describe("dry-run work copies", () => {
  it("use the leapfrog- prefix and are removed; legacy java-migrator-dry- folders are cleaned too", () => {
    const repo = tempDir("leapfrog-src-");
    writeFileSync(path.join(repo, "pom.xml"), "<project/>");
    const copy = createWorkCopy(repo);
    expect(path.basename(path.dirname(copy)).startsWith(workCopyPrefix)).toBe(true);
    removeWorkCopy(copy);
    expect(existsSync(path.dirname(copy))).toBe(false);

    const legacy = path.join(os.tmpdir(), `java-migrator-dry-test-${process.pid}`, "repo");
    mkdirSync(legacy, { recursive: true });
    removeWorkCopy(legacy);
    expect(existsSync(path.dirname(legacy))).toBe(false);

    const other = tempDir("not-ours-");
    const inner = path.join(other, "repo");
    mkdirSync(inner);
    removeWorkCopy(inner);
    expect(existsSync(other)).toBe(true);
  });
});

describe("saved plans", () => {
  it("are written with tool leapfrog, and java-migrator plans still load", async () => {
    const { generatePlan, parsePlanText } = await import("../bot/lib/plan.js");
    const { samplesRoot } = await import("../bot/lib/config.js");
    process.env.LEAPFROG_ROOTS = samplesRoot;
    const plan = await generatePlan({ repoPath: path.join(samplesRoot, "shipping"), request: { targets: {}, from: {} } });
    expect(plan.tool).toBe("leapfrog");
    const legacy = parsePlanText(JSON.stringify({ ...plan, tool: "java-migrator" }));
    expect(legacy.tool).toBe("java-migrator");
    expect(legacy.items.length).toBe(plan.items.length);
    expect(() => parsePlanText(JSON.stringify({ ...plan, tool: "something-else" }))).toThrow();
  });
});

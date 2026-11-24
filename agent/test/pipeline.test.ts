import { describe, expect, it } from "vitest";
import { createRunState, shouldRun } from "../bot/lib/pipeline.js";
import { reportMarkdown } from "../bot/lib/report.js";

const step = (when: "javaBelowTarget" | "bootPresent" | "javaxFiles" | "always") => ({ when, artifact: "a:b:1", recipe: "x.Y" });

describe("when conditions are evaluated in code", () => {
  it("javaBelowTarget", () => {
    expect(shouldRun(step("javaBelowTarget"), { javaVersion: "1.8", bootPresent: true, javaxFiles: 0 }, "21").run).toBe(true);
    expect(shouldRun(step("javaBelowTarget"), { javaVersion: "21", bootPresent: true, javaxFiles: 0 }, "21").run).toBe(false);
    expect(shouldRun(step("javaBelowTarget"), { javaVersion: null, bootPresent: true, javaxFiles: 0 }, "21").run).toBe(true);
  });

  it("bootPresent and javaxFiles", () => {
    expect(shouldRun(step("bootPresent"), { javaVersion: "17", bootPresent: false, javaxFiles: 3 }, "21").run).toBe(false);
    expect(shouldRun(step("javaxFiles"), { javaVersion: "17", bootPresent: false, javaxFiles: 3 }, "21").run).toBe(true);
    expect(shouldRun(step("javaxFiles"), { javaVersion: "17", bootPresent: false, javaxFiles: 0 }, "21").run).toBe(false);
    expect(shouldRun(step("always"), { javaVersion: "17", bootPresent: false, javaxFiles: 0 }, "21").run).toBe(true);
  });
});

describe("report", () => {
  it("states the facts and never invents a pass", () => {
    const state = createRunState({ runId: "r1", repoPath: "/x/shipping", dryRun: true, targetJava: "21", targetBoot: "4.0.x" });
    state.status = "failed";
    state.error = "Tests failed (exit 1).";
    state.steps.test.status = "failed";
    state.tests = { ok: false, exitCode: 1, testsRun: 4, failures: 1, errors: 0, skipped: 0, testSets: ["A"], source: "junit-xml", firstFailure: "expected 1" };
    const text = reportMarkdown(state);
    expect(text).toContain("FAILED (dry run");
    expect(text).toContain("- Tests run: 4");
    expect(text).toContain("Stopped because: Tests failed (exit 1).");
  });
});

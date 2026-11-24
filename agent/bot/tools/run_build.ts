import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { npmCommand } from "../lib/adapters/node.js";
import { runPythonGoal } from "../lib/adapters/python.js";
import { firstNodeFailure, parseNodeTestTotals } from "../lib/adapters/nodeScan.js";
import { runBuild } from "../lib/build.js";
import { repoEcosystem } from "../lib/patch.js";
import { runCommand } from "../lib/process.js";
import { assertRepo, detectBuildTool } from "../lib/repo.js";
import { isPlanReview, planReviewRefusal } from "../lib/toolGuards.js";

export default defineTool({
  description:
    "Run the repository tests (goal test) or package it (goal package). Java: the project's wrapper when present, otherwise Maven/Gradle on PATH, with test totals from the JUnit XML reports. Node: npm test / npm run build. Python: pip install + pytest (or manage.py test / unittest) in the run's venv, or compileall for package. Returns the exit code and the end of the log.",
  effect: "idempotent",
  inputSchema: z.object({
    repoPath: z.string().min(1),
    goal: z.enum(["test", "package"]),
  }),
  async execute({ repoPath, goal }, context) {
    if (isPlanReview(context)) return { ok: false, error: planReviewRefusal };
    const resolved = await assertRepo(repoPath);
    const ecosystem = repoEcosystem(resolved);
    if (ecosystem === "python") {
      const result = await runPythonGoal(resolved, goal, 30 * 60_000);
      return { ...result, buildTool: "pip", wrapper: false, goal, artifacts: [], outputTail: result.outputTail.slice(-6000) };
    }
    if (ecosystem === "node") {
      const result = await runCommand(npmCommand, goal === "test" ? ["test"] : ["run", "build"], { cwd: resolved, timeoutMs: 30 * 60_000 });
      return {
        ok: result.ok,
        buildTool: "npm",
        wrapper: false,
        goal,
        exitCode: result.exitCode,
        failure: result.failure,
        command: result.command,
        durationMs: result.durationMs,
        tests: goal === "test" ? parseNodeTestTotals(result.output) : null,
        artifacts: [],
        firstFailure: result.ok ? "" : firstNodeFailure(result.output),
        outputTail: result.output.slice(-6000),
      };
    }
    const build = await runBuild(resolved, detectBuildTool(resolved), goal, { timeoutMs: 30 * 60_000 });
    return {
      ok: build.result.ok,
      buildTool: build.buildTool,
      wrapper: build.wrapper,
      goal,
      exitCode: build.result.exitCode,
      failure: build.result.failure,
      command: build.result.command,
      durationMs: build.result.durationMs,
      tests: build.tests,
      artifacts: build.artifacts,
      firstFailure: build.failure,
      outputTail: build.result.output.slice(-6000),
    };
  },
});

import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { runRecipe } from "../lib/build.js";
import { recipeArtifactSchema } from "../lib/toolSchemas.js";
import { assertAllowedRecipe } from "../lib/recipeGuard.js";
import { assertRepo, detectBuildTool } from "../lib/repo.js";
import { locksFor, rewriteExclusionGlobs } from "../lib/locks.js";
import { runCommand } from "../lib/process.js";
import { isPlanReview, planReviewRefusal } from "../lib/toolGuards.js";

export default defineTool({
  description:
    "Apply one OpenRewrite recipe to a repository (writes source files). Only recipes from the migration matrix or a rules pack are allowed; during a pipeline run only that run's plan. Paths locked by the approved migration plan are excluded (and reverted after the step). Use preview_openrewrite first when unsure.",
  effect: "write",
  inputSchema: z.object({
    repoPath: z.string().min(1),
    recipeArtifact: recipeArtifactSchema,
    activeRecipe: z.string().min(1),
  }),
  async execute({ repoPath, recipeArtifact, activeRecipe }, context) {
    if (isPlanReview(context)) return { ok: false, error: planReviewRefusal };
    const resolved = await assertRepo(repoPath);
    const { artifact, recipe } = assertAllowedRecipe(resolved, recipeArtifact, activeRecipe);
    const lockInfo = locksFor(resolved);
    const exclusions = lockInfo ? rewriteExclusionGlobs(lockInfo.locks.patterns) : [];
    const run = await runRecipe(resolved, detectBuildTool(resolved), artifact, recipe, "run", { timeoutMs: 30 * 60_000, exclusions });
    const status = await runCommand("git", ["status", "--porcelain"], { cwd: resolved, timeoutMs: 60_000 });
    return {
      ok: run.result.ok,
      dryRun: false,
      excludedLockedPaths: exclusions,
      recipe,
      artifact,
      exitCode: run.result.exitCode,
      failure: run.result.failure,
      command: run.result.command,
      changedFiles: status.ok
        ? status.output.split(/\r?\n/).map((line) => line.slice(3).trim()).filter(Boolean)
        : [],
      outputTail: run.result.output.slice(-6000),
    };
  },
});

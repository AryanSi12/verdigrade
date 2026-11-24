import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { runRecipe } from "../lib/build.js";
import { recipeArtifactSchema } from "../lib/toolSchemas.js";
import { assertAllowedRecipe } from "../lib/recipeGuard.js";
import { assertRepo, detectBuildTool } from "../lib/repo.js";
import { isPlanReview, planReviewRefusal } from "../lib/toolGuards.js";

export default defineTool({
  description:
    "Preview one OpenRewrite recipe (dry run): returns the patch it would apply and the files it would change. Source files are not modified. Only recipes listed in the migration matrix or a rules pack are allowed.",
  effect: "read",
  inputSchema: z.object({
    repoPath: z.string().min(1),
    recipeArtifact: recipeArtifactSchema,
    activeRecipe: z.string().min(1),
  }),
  async execute({ repoPath, recipeArtifact, activeRecipe }, context) {
    // The plan already carries the preview; a dry run still writes target/rewrite/ inside the project.
    if (isPlanReview(context)) return { ok: false, error: planReviewRefusal };
    const resolved = await assertRepo(repoPath);
    const { artifact, recipe } = assertAllowedRecipe(resolved, recipeArtifact, activeRecipe);
    const run = await runRecipe(resolved, detectBuildTool(resolved), artifact, recipe, "dryRun", { timeoutMs: 30 * 60_000 });
    return {
      ok: run.result.ok,
      dryRun: true,
      recipe,
      artifact,
      exitCode: run.result.exitCode,
      failure: run.result.failure,
      command: run.result.command,
      changedFiles: run.changedFiles,
      patch: run.patch.length > 24_000 ? `${run.patch.slice(0, 24_000)}\n… patch truncated` : run.patch,
      outputTail: run.result.output.slice(-6000),
    };
  },
});

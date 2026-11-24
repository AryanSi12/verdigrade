import { allowedRecipePairs, loadModernizerRules, resolveArtifact, loadMatrix } from "./matrix.js";
import { activeRunFor } from "./runs.js";

/**
 * Only (artifact, recipe) pairs from the matrix or a rules pack may run. While a
 * pipeline run owns the folder, only that run's route plan and rules packs.
 */
export function assertAllowedRecipe(repoPath: string, artifactRef: string, recipe: string): { artifact: string; recipe: string } {
  const matrix = loadMatrix();
  const artifact = resolveArtifact(matrix, artifactRef);
  const run = activeRunFor(repoPath);
  let allowed = allowedRecipePairs();
  if (run?.route) {
    allowed = [
      ...run.route.recipePlan.map((step) => ({ artifact: step.artifact, recipe: step.recipe })),
      ...run.route.rulePacks.map((id) => loadModernizerRules(id).jakartaRecipe).filter((item): item is { artifact: string; recipe: string } => Boolean(item)),
    ];
  }
  if (!allowed.some((pair) => pair.artifact === artifact && pair.recipe === recipe)) {
    const listed = allowed.map((pair) => `${pair.recipe} (${pair.artifact})`).join("; ");
    throw new Error(`Recipe ${recipe} from ${artifact} is not allowed${run ? ` for run ${run.runId}` : ""}. Allowed: ${listed}`);
  }
  return { artifact, recipe };
}

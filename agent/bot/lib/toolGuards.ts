/**
 * Plan review sessions (continuation key "plan:<planId>") are read-only: the
 * channel sends them with dryRun, and every write or build tool also refuses
 * here, so a plan review can never change a project.
 */
export type ToolSessionLike = { session?: { continuationKey?: string | null } } | undefined;

export const planReviewPrefix = "plan:";

export function isPlanReview(context: ToolSessionLike): boolean {
  return Boolean(context?.session?.continuationKey?.startsWith(planReviewPrefix));
}

export const planReviewRefusal = "Plan review is read-only: this tool is not available while reviewing a migration plan. Use read_project_file and scan_project.";

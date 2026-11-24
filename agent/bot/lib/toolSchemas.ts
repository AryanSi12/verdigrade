import * as z from "zod/v4";

/** An artifact key from matrices/java.json (e.g. "rewrite-spring") or a pinned group:artifact:version. */
export const recipeArtifactSchema = z
  .string()
  .min(1)
  .describe('A key from matrices/java.json "artifacts" (e.g. "rewrite-spring") or its pinned group:artifact:version.');

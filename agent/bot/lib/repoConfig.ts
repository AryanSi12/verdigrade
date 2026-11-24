import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as z from "zod/v4";

export const repoConfigFile = ".leapfrog.json";
/** Older name, still read when a repository has no .leapfrog.json. */
export const legacyRepoConfigFile = ".java-migrator.json";

/** The per-repository settings file in use: .leapfrog.json, else the legacy .java-migrator.json, else null. */
export function repoConfigPath(repoPath: string): string | null {
  for (const name of [repoConfigFile, legacyRepoConfigFile]) {
    const file = path.join(repoPath, name);
    if (existsSync(file)) return file;
  }
  return null;
}

export const repoConfigSchema = z.object({
  $comment: z.string().optional(),
  /** Default targets for this repository (the UI/CLI can still override). */
  targetJava: z.string().optional(),
  targetBoot: z.string().optional(),
  /** Additional rules packs from profiles/modernizer-rules (e.g. a team's internal-library renames). */
  extraRulePacks: z.array(z.string().regex(/^[a-z0-9-]+$/)).default([]),
  /** Module folders (relative, "/"-separated) to leave out of scanning and rules. */
  excludeModules: z.array(z.string()).default([]),
  /** Skip the test step (package still runs). Reported as a warning. */
  skipTests: z.boolean().default(false),
  timeoutMinutes: z.number().positive().max(240).optional(),
  /** Max model fix-up rounds after a failing test step. */
  fixRounds: z.number().int().min(0).max(5).optional(),
});

export type RepoConfig = z.infer<typeof repoConfigSchema>;

export function loadRepoConfig(repoPath: string): RepoConfig {
  const file = repoConfigPath(repoPath);
  if (!file) return repoConfigSchema.parse({});
  const name = path.basename(file);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${name} is not valid JSON: ${(error as Error).message}`);
  }
  const parsed = repoConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${name} is invalid: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }
  return parsed.data;
}

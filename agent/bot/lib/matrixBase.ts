import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as z from "zod/v4";
import { profilesRoot } from "./config.js";
import type { Ecosystem } from "./types.js";

/**
 * Shared envelope for every ecosystem matrix (profiles/matrices/<ecosystem>.json).
 * Each adapter extends it with its own targets and routes; the envelope fields
 * and the route basics (id, description) mean the same thing everywhere.
 */
export const matrixEnvelopeSchema = z.object({
  $comment: z.string().optional(),
  ecosystem: z.enum(["java", "node", "python"]),
  schemaVersion: z.number().int().positive(),
});

/** Fields every route has, whatever the ecosystem. */
export const routeBaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9.-]+$/, "route id must be lowercase letters, digits, dots or dashes"),
  description: z.string().min(1),
  timeoutMinutes: z.number().positive().optional(),
});

export function matricesDir(): string {
  return path.join(profilesRoot, "matrices");
}

/**
 * The matrix file for an ecosystem. Java falls back to the pre-adapter location
 * (profiles/migration-matrix.json) so an older checkout keeps working.
 */
export function matrixFile(ecosystem: Ecosystem): string {
  const file = path.join(matricesDir(), `${ecosystem}.json`);
  if (ecosystem === "java" && !existsSync(file)) {
    const legacy = path.join(profilesRoot, "migration-matrix.json");
    if (existsSync(legacy)) return legacy;
  }
  return file;
}

export class ConfigError extends Error {}

export function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new ConfigError(`${file} could not be read as JSON: ${(error as Error).message}`);
  }
}

export function formatIssues(file: string, error: z.ZodError): string {
  const lines = error.issues.map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  return `${file} is invalid:\n${lines.join("\n")}`;
}

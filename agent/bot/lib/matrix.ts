import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import * as z from "zod/v4";
import { profilesRoot } from "./config.js";
import { ConfigError, formatIssues, matrixEnvelopeSchema, matrixFile, readJson, routeBaseSchema } from "./matrixBase.js";

export { ConfigError };

const coordinate = /^[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+$/;
const recipeName = /^[A-Za-z0-9_.]+$/;
const propertyKey = /^[A-Za-z0-9_.\-[\]]+$/;
const mavenId = /^[A-Za-z0-9_.-]+$/;

const artifactRef = z.string().min(1);
const whenSchema = z.enum(["javaBelowTarget", "bootPresent", "javaxFiles", "always"]);

const recipeSchema = z.object({
  when: whenSchema,
  artifact: artifactRef,
  recipe: z.string().regex(recipeName, "recipe must be a fully-qualified OpenRewrite recipe name"),
});

const bootTargetSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  parentHint: z.string().default(""),
});

const routeSchema = routeBaseSchema.extend({
  id: z.string().regex(/^[a-z0-9-]+$/),
  targetJava: z.string().min(1),
  targetBoot: z.string().min(1),
  fromJava: z.array(z.string()).default([]),
  fromBoot: z.array(z.string()).default([]),
  modernizerRules: z.string().min(1),
  recipes: z.array(recipeSchema),
});

export const matrixSchema = matrixEnvelopeSchema.extend({
  // Optional so a pre-adapter migration-matrix.json (no ecosystem field) still validates.
  ecosystem: z.literal("java").default("java"),
  schemaVersion: z.literal(2),
  plugin: z.string().regex(coordinate, "plugin must be group:artifact:version"),
  gradlePlugin: z.string().regex(coordinate, "gradlePlugin must be group:artifact:version"),
  artifacts: z.record(z.string(), z.string().regex(coordinate, "artifact must be group:artifact:version")),
  defaults: z.object({ targetJava: z.string(), targetBoot: z.string() }),
  supportedJavaTargets: z.array(z.string()).min(1),
  supportedBootTargets: z.array(bootTargetSchema).min(1),
  bootTargetAliases: z.record(z.string(), z.string()).default({}),
  routes: z.array(routeSchema).min(1),
});

export const rulesSchema = z.object({
  $comment: z.string().optional(),
  id: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string(),
  sampleOnly: z.boolean().default(false),
  javaxToJakarta: z.boolean(),
  jakartaRecipe: z.object({ artifact: artifactRef, recipe: z.string().regex(recipeName) }).nullable(),
  dependencyRenames: z
    .array(
      z.object({
        groupId: z.string().regex(mavenId),
        from: z.string().regex(mavenId),
        to: z.string().regex(mavenId),
      }),
    )
    .default([]),
  propertyRenames: z
    .array(z.object({ from: z.string().regex(propertyKey), to: z.string().regex(propertyKey) }))
    .default([]),
  removeProperties: z.array(z.string().regex(propertyKey)).default([]),
});

export type MatrixRecipe = z.infer<typeof recipeSchema>;
export type MatrixRoute = z.infer<typeof routeSchema>;
export type BootTarget = z.infer<typeof bootTargetSchema>;
export type MigrationMatrix = z.infer<typeof matrixSchema>;
export type ModernizerRules = z.infer<typeof rulesSchema>;
export type RecipeStep = { when: MatrixRecipe["when"]; artifact: string; recipe: string };

export type ResolveOk = {
  ok: true;
  route: MatrixRoute;
  rules: ModernizerRules;
  targetJava: string;
  targetBoot: string;
  parentHint: string;
  recipePlan: RecipeStep[];
  notes: string[];
};

export type ResolveErr = {
  ok: false;
  error: string;
  supportedJavaTargets: string[];
  supportedBootTargets: BootTarget[];
};


/** Resolve an artifact reference (a key in matrix.artifacts, or a full coordinate). */
export function resolveArtifact(matrix: MigrationMatrix, ref: string): string {
  if (matrix.artifacts[ref]) return matrix.artifacts[ref];
  if (coordinate.test(ref)) {
    if (/:(LATEST|RELEASE)$/i.test(ref)) throw new ConfigError(`Artifact ${ref} must be pinned to a version.`);
    return ref;
  }
  throw new ConfigError(`Artifact "${ref}" is neither a key in matrix.artifacts nor group:artifact:version.`);
}

let cachedMatrix: MigrationMatrix | null = null;
const cachedRules = new Map<string, ModernizerRules>();

export function rulesDir(): string {
  return path.join(profilesRoot, "modernizer-rules");
}

/** Load and validate a rules pack. Unknown ids fail loudly (no silent fallback to "none"). */
export function loadModernizerRules(id: string): ModernizerRules {
  const cached = cachedRules.get(id);
  if (cached) return cached;
  if (!/^[a-z0-9-]+$/.test(id)) throw new ConfigError(`Rules pack id "${id}" is not a valid id.`);
  const file = path.join(rulesDir(), `${id}.json`);
  if (!existsSync(file)) throw new ConfigError(`Rules pack "${id}" does not exist (${file}).`);
  const parsed = rulesSchema.safeParse(readJson(file));
  if (!parsed.success) throw new ConfigError(formatIssues(file, parsed.error));
  if (parsed.data.id !== id) throw new ConfigError(`${file} declares id "${parsed.data.id}" but the file name says "${id}".`);
  const matrix = loadMatrix();
  const rules = parsed.data;
  if (rules.jakartaRecipe) {
    rules.jakartaRecipe = { ...rules.jakartaRecipe, artifact: resolveArtifact(matrix, rules.jakartaRecipe.artifact) };
  }
  cachedRules.set(id, rules);
  return rules;
}

/** Load, validate and cross-check the matrix. Throws ConfigError with every problem listed. */
export function loadMatrix(): MigrationMatrix {
  if (cachedMatrix) return cachedMatrix;
  const file = matrixFile("java");
  const parsed = matrixSchema.safeParse(readJson(file));
  if (!parsed.success) throw new ConfigError(formatIssues(file, parsed.error));
  const matrix = parsed.data;
  const problems: string[] = [];
  const bootIds = new Set(matrix.supportedBootTargets.map((item) => item.id));
  for (const [alias, target] of Object.entries(matrix.bootTargetAliases)) {
    if (!bootIds.has(target)) problems.push(`bootTargetAliases.${alias} points at unknown Boot target ${target}`);
  }
  const routeIds = new Set<string>();
  for (const route of matrix.routes) {
    if (routeIds.has(route.id)) problems.push(`duplicate route id ${route.id}`);
    routeIds.add(route.id);
    if (!matrix.supportedJavaTargets.includes(route.targetJava)) problems.push(`route ${route.id}: targetJava ${route.targetJava} is not in supportedJavaTargets`);
    if (!bootIds.has(route.targetBoot)) problems.push(`route ${route.id}: targetBoot ${route.targetBoot} is not in supportedBootTargets`);
    for (const step of route.recipes) {
      try {
        step.artifact = resolveArtifact(matrix, step.artifact);
      } catch (error) {
        problems.push(`route ${route.id}: ${(error as Error).message}`);
      }
    }
  }
  if (!matrix.supportedJavaTargets.includes(matrix.defaults.targetJava)) problems.push("defaults.targetJava is not supported");
  if (!bootIds.has(matrix.defaults.targetBoot)) problems.push("defaults.targetBoot is not supported");
  if (problems.length) throw new ConfigError(`${file} is invalid:\n${problems.map((item) => `  - ${item}`).join("\n")}`);
  cachedMatrix = matrix;
  for (const route of matrix.routes) {
    try {
      loadModernizerRules(route.modernizerRules);
    } catch (error) {
      cachedMatrix = null;
      throw new ConfigError(`route ${route.id}: ${(error as Error).message}`);
    }
  }
  return matrix;
}

/** Validate the matrix and every rules pack on disk. Returns a list of human-readable problems. */
export function validateProfiles(): { ok: boolean; problems: string[]; routes: number; packs: string[] } {
  resetProfileCache();
  const problems: string[] = [];
  let routes = 0;
  const packs: string[] = [];
  try {
    routes = loadMatrix().routes.length;
  } catch (error) {
    problems.push((error as Error).message);
  }
  for (const name of existsSync(rulesDir()) ? readdirSync(rulesDir()) : []) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -5);
    try {
      loadModernizerRules(id);
      packs.push(id);
    } catch (error) {
      problems.push((error as Error).message);
    }
  }
  return { ok: problems.length === 0, problems, routes, packs };
}

export function resetProfileCache(): void {
  cachedMatrix = null;
  cachedRules.clear();
}

/** "1.8" → "8", "11.0.2" → "11", "${java.version}" → "unknown". */
export function normalizeJava(value: string | undefined | null): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw || raw === "unknown" || raw.includes("${")) return "unknown";
  const legacy = /^1\.(\d+)/.exec(raw);
  if (legacy) return legacy[1];
  const match = /^(\d+)/.exec(raw);
  return match ? String(Number(match[1])) : "unknown";
}

/** Map a detected Boot version to a From family: "2.7.18" → "2.x", "" → "unknown", "none" → "none". */
export function normalizeBoot(value: string | undefined | null): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw || raw === "unknown" || raw.includes("${")) return "unknown";
  if (raw === "none" || raw === "classic") return "none";
  const match = /^(\d+)(?:\.|$|x)/.exec(raw);
  return match ? `${match[1]}.x` : "unknown";
}

/**
 * Map a requested Boot target to a configured target line. Exact ids win,
 * then bootTargetAliases, then the "major.minor.x" spelling. Anything else is
 * returned as-is so resolveRoute reports it as unsupported (no silent remap).
 */
export function normalizeBootTarget(
  value: string | undefined | null,
  matrix: MigrationMatrix = loadMatrix(),
): { id: string; note: string | null } {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw || raw === "none") return { id: "none", note: null };
  const ids = matrix.supportedBootTargets.map((item) => item.id);
  if (ids.includes(raw)) return { id: raw, note: null };
  const alias = matrix.bootTargetAliases[raw];
  if (alias) return { id: alias, note: `Boot target ${value} maps to ${alias} (bootTargetAliases in matrices/java.json).` };
  const minor = /^(\d+)\.(\d+)/.exec(raw);
  if (minor && ids.includes(`${minor[1]}.${minor[2]}.x`)) {
    const id = `${minor[1]}.${minor[2]}.x`;
    return { id, note: id === raw ? null : `Boot target ${value} uses the ${id} line.` };
  }
  return { id: raw, note: null };
}

function fail(matrix: MigrationMatrix, error: string): ResolveErr {
  return {
    ok: false,
    error,
    supportedJavaTargets: matrix.supportedJavaTargets,
    supportedBootTargets: matrix.supportedBootTargets,
  };
}

export function resolveRoute(input: {
  targetJava?: string;
  targetBoot?: string;
  fromJava?: string;
  fromBoot?: string;
}): ResolveOk | ResolveErr {
  const matrix = loadMatrix();
  const targetJava = normalizeJava(input.targetJava || matrix.defaults.targetJava);
  const boot = normalizeBootTarget(input.targetBoot || matrix.defaults.targetBoot, matrix);
  const targetBoot = boot.id;
  const fromJava = normalizeJava(input.fromJava);
  const fromBoot = normalizeBoot(input.fromBoot);

  if (!matrix.supportedJavaTargets.includes(targetJava)) {
    return fail(matrix, `Java ${input.targetJava} is not in the supported target matrix.`);
  }
  if (!matrix.supportedBootTargets.some((item) => item.id === targetBoot)) {
    return fail(matrix, `Spring Boot target ${input.targetBoot} is not in the supported matrix.`);
  }
  const route = matrix.routes.find((item) => item.targetJava === targetJava && item.targetBoot === targetBoot);
  if (!route) {
    return fail(matrix, `No migration route for Java ${targetJava} + Boot ${targetBoot}. Add a row to profiles/matrices/java.json.`);
  }
  if (fromJava !== "unknown" && route.fromJava.length && !route.fromJava.includes(fromJava)) {
    return fail(matrix, `Route ${route.id} does not support From Java ${fromJava} (supported: ${route.fromJava.join(", ")}).`);
  }
  if (fromBoot !== "unknown" && route.fromBoot.length && !route.fromBoot.includes(fromBoot)) {
    return fail(matrix, `Route ${route.id} does not support From Boot ${fromBoot} (supported: ${route.fromBoot.join(", ")}).`);
  }
  const bootMeta = matrix.supportedBootTargets.find((item) => item.id === targetBoot);
  return {
    ok: true,
    route,
    rules: loadModernizerRules(route.modernizerRules),
    targetJava,
    targetBoot,
    parentHint: bootMeta?.parentHint || "",
    recipePlan: route.recipes.map((step) => ({ when: step.when, artifact: step.artifact, recipe: step.recipe })),
    notes: boot.note ? [boot.note] : [],
  };
}

/** Every (artifact, recipe) pair the matrix or a rules pack allows run_openrewrite to execute. */
export function allowedRecipePairs(): Array<{ artifact: string; recipe: string }> {
  const matrix = loadMatrix();
  const pairs = new Map<string, { artifact: string; recipe: string }>();
  for (const route of matrix.routes) {
    for (const step of route.recipes) pairs.set(`${step.artifact}|${step.recipe}`, { artifact: step.artifact, recipe: step.recipe });
  }
  for (const id of listRulePackIds()) {
    const rules = loadModernizerRules(id);
    if (rules.jakartaRecipe) pairs.set(`${rules.jakartaRecipe.artifact}|${rules.jakartaRecipe.recipe}`, rules.jakartaRecipe);
  }
  return [...pairs.values()];
}

export function listRulePackIds(): string[] {
  if (!existsSync(rulesDir())) return [];
  return readdirSync(rulesDir())
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -5))
    .sort();
}

export function matrixPublicView() {
  const matrix = loadMatrix();
  return {
    ecosystem: "java" as const,
    schemaVersion: matrix.schemaVersion,
    plugin: matrix.plugin,
    gradlePlugin: matrix.gradlePlugin,
    artifacts: matrix.artifacts,
    defaults: matrix.defaults,
    supportedJavaTargets: matrix.supportedJavaTargets,
    supportedBootTargets: matrix.supportedBootTargets,
    bootTargetAliases: matrix.bootTargetAliases,
    fromJavaOptions: [...new Set(matrix.routes.flatMap((route) => route.fromJava))].sort((a, b) => Number(a) - Number(b)),
    fromBootOptions: [...new Set(matrix.routes.flatMap((route) => route.fromBoot))].sort(),
    routes: matrix.routes.map((route) => ({
      id: route.id,
      description: route.description,
      targetJava: route.targetJava,
      targetBoot: route.targetBoot,
      fromJava: route.fromJava,
      fromBoot: route.fromBoot,
      modernizerRules: route.modernizerRules,
      recipes: route.recipes.map((step) => step.recipe),
    })),
  };
}

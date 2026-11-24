import * as z from "zod/v4";
import { ConfigError, formatIssues, matrixEnvelopeSchema, matrixFile, readJson, routeBaseSchema } from "../matrixBase.js";

const npmName = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const pinnedRange = /^[~^]?\d+\.\d+\.\d+$/;
const pinnedPackage = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+$/;
const major = /^\d+$/;
const tsLine = /^\d+\.\d+$/;

const packageRuleSchema = z.object({
  name: z.string().regex(npmName, "package name must be a valid npm name"),
  version: z.string().regex(pinnedRange, "version must be a pinned range like ^5.3.0 or ~6.0.3"),
  /** present: set whenever the package is declared; belowMajor: only when the declared major is below `major`. */
  when: z.enum(["present", "belowMajor"]),
  major: z.number().int().positive().optional(),
});

const codemodSchema = z.object({
  package: z.string().regex(pinnedPackage, "codemod must be a pinned registry package like @scope/name@1.2.3"),
  when: z.enum(["expressBelow5", "always"]),
  description: z.string().min(1),
});

const tsconfigProfileSchema = z.object({
  description: z.string(),
  removeOptions: z.array(z.string().regex(/^[A-Za-z]+$/)).default([]),
  migrateModuleResolution: z.boolean().default(false),
  dropBaseUrlWithoutPaths: z.boolean().default(false),
  ensureTypes: z.boolean().default(false),
  minimumTarget: z.string().regex(/^es\d{4}$/).nullable().default(null),
});

const nodeRouteSchema = routeBaseSchema.extend({
  node: z.string().regex(major),
  typescript: z.string().regex(tsLine),
  fromNode: z.array(z.string().regex(major)).default([]),
  engines: z.string().min(1),
  nvmrc: z.string().regex(major),
  tsconfigProfile: z.string(),
  codemods: z.array(z.string()).default([]),
  packages: z.array(packageRuleSchema),
});

export const nodeMatrixSchema = matrixEnvelopeSchema.extend({
  ecosystem: z.literal("node"),
  schemaVersion: z.literal(1),
  tools: z.object({ codemodCli: z.string().regex(pinnedPackage, "codemodCli must be pinned, e.g. codemod@1.18.7") }),
  defaults: z.object({ node: z.string().regex(major), typescript: z.string().regex(tsLine) }),
  supportedNodeTargets: z.array(z.object({ id: z.string().regex(major), label: z.string().min(1) })).min(1),
  supportedTypescriptTargets: z.array(z.object({ id: z.string().regex(tsLine), label: z.string().min(1) })).min(1),
  codemods: z.record(z.string().regex(/^[a-z0-9-]+$/), codemodSchema),
  tsconfigProfiles: z.record(z.string(), tsconfigProfileSchema),
  routes: z.array(nodeRouteSchema).min(1),
});

export type NodeMatrix = z.infer<typeof nodeMatrixSchema>;
export type NodeRoute = z.infer<typeof nodeRouteSchema>;
export type PackageRule = z.infer<typeof packageRuleSchema>;
export type TsconfigProfile = z.infer<typeof tsconfigProfileSchema>;
export type CodemodRef = z.infer<typeof codemodSchema> & { id: string };

let cached: NodeMatrix | null = null;

export function resetNodeMatrixCache(): void {
  cached = null;
}

/** Load, validate and cross-check profiles/matrices/node.json. */
export function loadNodeMatrix(): NodeMatrix {
  if (cached) return cached;
  const file = matrixFile("node");
  const parsed = nodeMatrixSchema.safeParse(readJson(file));
  if (!parsed.success) throw new ConfigError(formatIssues(file, parsed.error));
  const matrix = parsed.data;
  const problems: string[] = [];
  const nodeIds = new Set(matrix.supportedNodeTargets.map((item) => item.id));
  const tsIds = new Set(matrix.supportedTypescriptTargets.map((item) => item.id));
  if (!nodeIds.has(matrix.defaults.node)) problems.push("defaults.node is not in supportedNodeTargets");
  if (!tsIds.has(matrix.defaults.typescript)) problems.push("defaults.typescript is not in supportedTypescriptTargets");
  const routeIds = new Set<string>();
  const pairs = new Set<string>();
  for (const route of matrix.routes) {
    if (routeIds.has(route.id)) problems.push(`duplicate route id ${route.id}`);
    routeIds.add(route.id);
    const pair = `${route.node}|${route.typescript}`;
    if (pairs.has(pair)) problems.push(`route ${route.id}: another route already targets Node ${route.node} + TypeScript ${route.typescript}`);
    pairs.add(pair);
    if (!nodeIds.has(route.node)) problems.push(`route ${route.id}: node ${route.node} is not in supportedNodeTargets`);
    if (!tsIds.has(route.typescript)) problems.push(`route ${route.id}: typescript ${route.typescript} is not in supportedTypescriptTargets`);
    if (!matrix.tsconfigProfiles[route.tsconfigProfile]) problems.push(`route ${route.id}: unknown tsconfigProfile ${route.tsconfigProfile}`);
    for (const id of route.codemods) if (!matrix.codemods[id]) problems.push(`route ${route.id}: unknown codemod ${id}`);
    for (const rule of route.packages) {
      if (rule.when === "belowMajor" && !rule.major) problems.push(`route ${route.id}: ${rule.name} uses belowMajor without "major"`);
    }
    if (route.nvmrc !== route.node) problems.push(`route ${route.id}: nvmrc ${route.nvmrc} differs from node ${route.node}`);
  }
  if (!matrix.routes.some((route) => route.node === matrix.defaults.node && route.typescript === matrix.defaults.typescript)) {
    problems.push("no route matches the defaults");
  }
  if (problems.length) throw new ConfigError(`${file} is invalid:\n${problems.map((item) => `  - ${item}`).join("\n")}`);
  cached = matrix;
  return matrix;
}

export type NodeResolveOk = {
  ok: true;
  route: NodeRoute;
  targets: { node: string; typescript: string };
  codemods: CodemodRef[];
  tsconfig: TsconfigProfile;
  notes: string[];
};

export type NodeResolveErr = { ok: false; error: string };

/** "v18.19.0" / "18" / ">=18" → "18". */
export function normalizeNode(value: string | null | undefined): string {
  const match = /(\d+)/.exec(String(value ?? ""));
  return match ? String(Number(match[1])) : "unknown";
}

export function normalizeTs(value: string | null | undefined): string {
  const match = /(\d+)\.(\d+)/.exec(String(value ?? ""));
  if (match) return `${Number(match[1])}.${Number(match[2])}`;
  const majorOnly = /^(\d+)$/.exec(String(value ?? "").trim());
  return majorOnly ? `${majorOnly[1]}.0` : "unknown";
}

export function resolveNodeRoute(input: { node?: string; typescript?: string; fromNode?: string }): NodeResolveOk | NodeResolveErr {
  const matrix = loadNodeMatrix();
  const node = normalizeNode(input.node || matrix.defaults.node);
  const typescript = normalizeTs(input.typescript || matrix.defaults.typescript);
  if (!matrix.supportedNodeTargets.some((item) => item.id === node)) {
    return { ok: false, error: `Node ${input.node} is not a supported target (supported: ${matrix.supportedNodeTargets.map((item) => item.id).join(", ")}).` };
  }
  if (!matrix.supportedTypescriptTargets.some((item) => item.id === typescript)) {
    return { ok: false, error: `TypeScript ${input.typescript} is not a supported target (supported: ${matrix.supportedTypescriptTargets.map((item) => item.id).join(", ")}).` };
  }
  const route = matrix.routes.find((item) => item.node === node && item.typescript === typescript);
  if (!route) return { ok: false, error: `No route for Node ${node} + TypeScript ${typescript}. Add one to profiles/matrices/node.json.` };
  const from = normalizeNode(input.fromNode);
  if (from !== "unknown" && route.fromNode.length && !route.fromNode.includes(from)) {
    return { ok: false, error: `Route ${route.id} does not support From Node ${from} (supported: ${route.fromNode.join(", ")}).` };
  }
  return {
    ok: true,
    route,
    targets: { node, typescript },
    codemods: route.codemods.map((id) => ({ id, ...matrix.codemods[id] })),
    tsconfig: matrix.tsconfigProfiles[route.tsconfigProfile],
    notes: [],
  };
}

export function nodeMatrixView() {
  const matrix = loadNodeMatrix();
  return {
    ecosystem: "node" as const,
    schemaVersion: matrix.schemaVersion,
    tools: matrix.tools,
    defaults: matrix.defaults,
    supportedNodeTargets: matrix.supportedNodeTargets,
    supportedTypescriptTargets: matrix.supportedTypescriptTargets,
    fromNodeOptions: [...new Set(matrix.routes.flatMap((route) => route.fromNode))].sort((a, b) => Number(a) - Number(b)),
    codemods: matrix.codemods,
    routes: matrix.routes.map((route) => ({
      id: route.id,
      description: route.description,
      node: route.node,
      typescript: route.typescript,
      fromNode: route.fromNode,
      codemods: route.codemods.map((id) => matrix.codemods[id].package),
      packages: route.packages.map((rule) => `${rule.name}@${rule.version}`),
    })),
  };
}

import * as z from "zod/v4";
import { ConfigError, formatIssues, matrixEnvelopeSchema, matrixFile, readJson, routeBaseSchema } from "../matrixBase.js";

/** PEP 508 distribution name (letters, digits, . _ -). */
const distName = /^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const exactVersion = /^\d+(\.\d+){1,3}$/;
const pythonLine = /^3\.\d{1,2}$/;
const pinnedTool = /^[A-Za-z0-9][A-Za-z0-9._-]*==\d+(\.\d+){1,3}$/;

const packageRuleSchema = z.object({
  name: z.string().regex(distName, "package name must be a valid distribution name"),
  /** Version written into requirements / pyproject (exact release, checked on PyPI). */
  version: z.string().regex(exactVersion, "version must be an exact release like 3.1.3"),
  /** Declared versions below this are bumped; at or above it the line is left alone (never downgraded). */
  minimum: z.string().regex(exactVersion, "minimum must look like 3.1 or 3.1.2"),
});

const codemodSchema = z.object({
  tool: z.enum(["pyupgrade", "django-upgrade"]),
  when: z.enum(["always", "djangoBelowTarget"]),
  description: z.string().min(1),
});

const pythonRouteSchema = routeBaseSchema.extend({
  python: z.string().regex(pythonLine),
  fromPython: z.array(z.string().regex(pythonLine)).default([]),
  /** Written to requires-python / python_requires. */
  requiresPython: z.string().regex(/^>=3\.\d{1,2}$/),
  /** Framework target lines (major.minor) the route moves to when the framework is used. */
  frameworks: z.object({ django: z.string().regex(/^\d+\.\d+$/), flask: z.string().regex(/^\d+\.\d+$/) }),
  codemods: z.array(z.string()).default([]),
  packages: z.array(packageRuleSchema),
});

export const pythonMatrixSchema = matrixEnvelopeSchema.extend({
  ecosystem: z.literal("python"),
  schemaVersion: z.literal(1),
  tools: z.object({
    pyupgrade: z.string().regex(pinnedTool, "pyupgrade must be pinned, e.g. pyupgrade==3.22.0"),
    djangoUpgrade: z.string().regex(pinnedTool, "djangoUpgrade must be pinned, e.g. django-upgrade==1.33.0"),
  }),
  defaults: z.object({ python: z.string().regex(pythonLine) }),
  supportedPythonTargets: z.array(z.object({ id: z.string().regex(pythonLine), label: z.string().min(1), latest: z.string().regex(/^3\.\d+\.\d+$/) })).min(1),
  codemods: z.record(z.string().regex(/^[a-z0-9-]+$/), codemodSchema),
  routes: z.array(pythonRouteSchema).min(1),
});

export type PythonMatrix = z.infer<typeof pythonMatrixSchema>;
export type PythonRoute = z.infer<typeof pythonRouteSchema>;
export type PythonPackageRule = z.infer<typeof packageRuleSchema>;
export type PythonCodemod = z.infer<typeof codemodSchema> & { id: string; package: string };

let cached: PythonMatrix | null = null;

export function resetPythonMatrixCache(): void {
  cached = null;
}

/** Load, validate and cross-check profiles/matrices/python.json. */
export function loadPythonMatrix(): PythonMatrix {
  if (cached) return cached;
  const file = matrixFile("python");
  const parsed = pythonMatrixSchema.safeParse(readJson(file));
  if (!parsed.success) throw new ConfigError(formatIssues(file, parsed.error));
  const matrix = parsed.data;
  const problems: string[] = [];
  const targetIds = new Set(matrix.supportedPythonTargets.map((item) => item.id));
  if (!targetIds.has(matrix.defaults.python)) problems.push("defaults.python is not in supportedPythonTargets");
  const ids = new Set<string>();
  const targets = new Set<string>();
  for (const route of matrix.routes) {
    if (ids.has(route.id)) problems.push(`duplicate route id ${route.id}`);
    ids.add(route.id);
    if (targets.has(route.python)) problems.push(`route ${route.id}: another route already targets Python ${route.python}`);
    targets.add(route.python);
    if (!targetIds.has(route.python)) problems.push(`route ${route.id}: python ${route.python} is not in supportedPythonTargets`);
    if (route.requiresPython !== `>=${route.python}`) problems.push(`route ${route.id}: requiresPython ${route.requiresPython} should be >=${route.python}`);
    for (const id of route.codemods) if (!matrix.codemods[id]) problems.push(`route ${route.id}: unknown codemod ${id}`);
    const names = new Set<string>();
    for (const rule of route.packages) {
      const key = normalizeDist(rule.name);
      if (names.has(key)) problems.push(`route ${route.id}: package ${rule.name} listed twice`);
      names.add(key);
      if (compareVersions(rule.version, rule.minimum) < 0) problems.push(`route ${route.id}: ${rule.name} version ${rule.version} is below its minimum ${rule.minimum}`);
    }
    const django = route.packages.find((rule) => normalizeDist(rule.name) === "django");
    if (django && !django.version.startsWith(`${route.frameworks.django}.`)) problems.push(`route ${route.id}: Django ${django.version} does not match frameworks.django ${route.frameworks.django}`);
    const flask = route.packages.find((rule) => normalizeDist(rule.name) === "flask");
    if (flask && !flask.version.startsWith(`${route.frameworks.flask}.`)) problems.push(`route ${route.id}: Flask ${flask.version} does not match frameworks.flask ${route.frameworks.flask}`);
  }
  if (!matrix.routes.some((route) => route.python === matrix.defaults.python)) problems.push("no route matches the defaults");
  if (problems.length) throw new ConfigError(`${file} is invalid:\n${problems.map((item) => `  - ${item}`).join("\n")}`);
  cached = matrix;
  return matrix;
}

/** PEP 503 normalised name: "Flask_SQLAlchemy" → "flask-sqlalchemy". */
export function normalizeDist(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

/** Compare dotted numeric versions ("3.1" < "3.1.2" < "3.10"). Non-numeric parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(pa.length, pb.length); index += 1) {
    const diff = (pa[index] ?? 0) - (pb[index] ?? 0);
    if (diff) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/** "3.8.18" / "python-3.8" / ">=3.8" / "3" → "3.8" (or "unknown"). */
export function normalizePython(value: string | null | undefined): string {
  const match = /(\d+)\.(\d+)/.exec(String(value ?? ""));
  if (match) return `${Number(match[1])}.${Number(match[2])}`;
  return "unknown";
}

export type PythonResolveOk = {
  ok: true;
  route: PythonRoute;
  targets: { python: string };
  codemods: PythonCodemod[];
  latestPatch: string;
  notes: string[];
};

export type PythonResolveErr = { ok: false; error: string };

export function resolvePythonRoute(input: { python?: string; fromPython?: string }): PythonResolveOk | PythonResolveErr {
  const matrix = loadPythonMatrix();
  const python = normalizePython(input.python || matrix.defaults.python);
  const target = matrix.supportedPythonTargets.find((item) => item.id === python);
  if (!target) {
    return { ok: false, error: `Python ${input.python} is not a supported target (supported: ${matrix.supportedPythonTargets.map((item) => item.id).join(", ")}).` };
  }
  const route = matrix.routes.find((item) => item.python === python);
  if (!route) return { ok: false, error: `No route for Python ${python}. Add one to profiles/matrices/python.json.` };
  const from = normalizePython(input.fromPython);
  if (from !== "unknown" && route.fromPython.length && !route.fromPython.includes(from)) {
    return { ok: false, error: `Route ${route.id} does not support From Python ${from} (supported: ${route.fromPython.join(", ")}).` };
  }
  const notes: string[] = [];
  if (from !== "unknown" && compareVersions(from, python) > 0) notes.push(`The project declares Python ${from}, newer than the target ${python}.`);
  return {
    ok: true,
    route,
    targets: { python },
    codemods: route.codemods.map((id) => {
      const codemod = matrix.codemods[id];
      return { id, ...codemod, package: codemod.tool === "pyupgrade" ? matrix.tools.pyupgrade : matrix.tools.djangoUpgrade };
    }),
    latestPatch: target.latest,
    notes,
  };
}

export function pythonMatrixView() {
  const matrix = loadPythonMatrix();
  return {
    ecosystem: "python" as const,
    schemaVersion: matrix.schemaVersion,
    tools: matrix.tools,
    defaults: matrix.defaults,
    supportedPythonTargets: matrix.supportedPythonTargets,
    fromPythonOptions: [...new Set(matrix.routes.flatMap((route) => route.fromPython))].sort(compareVersions),
    codemods: matrix.codemods,
    routes: matrix.routes.map((route) => ({
      id: route.id,
      description: route.description,
      python: route.python,
      fromPython: route.fromPython,
      frameworks: route.frameworks,
      codemods: route.codemods.map((id) => (matrix.codemods[id].tool === "pyupgrade" ? matrix.tools.pyupgrade : matrix.tools.djangoUpgrade)),
      packages: route.packages.map((rule) => `${rule.name}==${rule.version}`),
    })),
  };
}

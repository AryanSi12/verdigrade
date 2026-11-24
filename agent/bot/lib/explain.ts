import { readFileSync } from "node:fs";
import path from "node:path";
import * as z from "zod/v4";
import type { Snippet } from "./adapters/types.js";
import { profilesRoot } from "./config.js";
import type { Ecosystem } from "./types.js";

/**
 * Plain-language explanations for plan items.
 *
 * The text lives in data (profiles/explanations/<ecosystem>.json plus
 * common.json), keyed by the finding's `kind`. Rendering is deterministic and
 * always present; the AI plan review may add a separate, labelled comment but
 * never replaces this text.
 */

export const riskLevels = ["none", "low", "medium", "high", "blocker"] as const;
export const riskSchema = z.enum(riskLevels);
export type Risk = z.infer<typeof riskSchema>;

/**
 * What goes wrong. fails-* effects happen inside the run (the step that fails is
 * in effectStep); runtime / after-merge / unverified don't fail the run.
 */
export const effectSchema = z.enum(["none", "unverified", "runtime", "after-merge", "fails-preflight", "fails-install", "fails-build", "fails-tests", "fails-checks"]);
export type Effect = z.infer<typeof effectSchema>;

export const effectStep: Partial<Record<Effect, { step: string; order: number }>> = {
  "fails-preflight": { step: "Preflight", order: 0 },
  "fails-install": { step: "Test", order: 1 },
  "fails-build": { step: "Test", order: 1 },
  "fails-tests": { step: "Test", order: 1 },
  "fails-checks": { step: "Checks", order: 2 },
};

/** Only official documentation hosts may be linked (checked by the catalogue test too). */
export const officialDocHosts = [
  "github.com",
  "docs.spring.io",
  "jakarta.ee",
  "docs.openrewrite.org",
  "docs.oracle.com",
  "openjdk.org",
  "projectlombok.org",
  "maven.apache.org",
  "docs.gradle.org",
  "nodejs.org",
  "expressjs.com",
  "www.typescriptlang.org",
  "devblogs.microsoft.com",
  "docs.npmjs.com",
  "sass-lang.com",
  "kulshekhar.github.io",
  "hub.docker.com",
  "cheatsheetseries.owasp.org",
  "documentation.red-gate.com",
  "docs.liquibase.com",
  "docs.python.org",
  "peps.python.org",
  "packaging.python.org",
  "pip.pypa.io",
  "docs.djangoproject.com",
  "flask.palletsprojects.com",
  "werkzeug.palletsprojects.com",
  "docs.pytest.org",
  "docs.pydantic.dev",
];

const linkSchema = z.object({
  label: z.string().min(1).max(120),
  url: z
    .string()
    .url()
    .refine((value) => value.startsWith("https://") && officialDocHosts.includes(new URL(value).hostname), "learnMore links must be https and point at official documentation (officialDocHosts)"),
});

export const catalogueEntrySchema = z.object({
  plainTitle: z.string().min(1).max(200),
  inPlainWords: z.string().min(1).max(400),
  whatWeFound: z.string().min(1).max(600),
  whyItMatters: z.string().min(1).max(800),
  whatWillHappen: z.string().min(1).max(600),
  ifApproved: z.string().min(1).max(600),
  ifLocked: z.string().min(1).max(800),
  /** Defaults to ifLocked (both keep the files unchanged). */
  ifManual: z.string().min(1).max(800).optional(),
  manualSteps: z.array(z.string().min(1).max(300)).min(1).max(8),
  effort: z.string().min(1).max(40),
  confidence: z.enum(["high", "medium", "low"]),
  /** What happens if the item is locked / marked manual (or blocked by another lock). */
  riskIfSkipped: riskSchema,
  skipEffect: effectSchema,
  /** For review/manual items the tool doesn't fix: the risk that stays even when approved. */
  riskIfApproved: riskSchema.default("none"),
  approvedEffect: effectSchema.default("none"),
  /** Multi-file items: is the item skipped when any of its files is locked, or only its main file? */
  skipWhen: z.enum(["any-file", "primary-file"]).default("any-file"),
  learnMore: z.array(linkSchema).max(5),
});

export const catalogueSchema = z.object({
  $comment: z.string().optional(),
  ecosystem: z.enum(["common", "java", "node", "python"]),
  entries: z.record(z.string().regex(/^[a-z0-9.-]+$/), catalogueEntrySchema),
});

export type CatalogueEntry = z.infer<typeof catalogueEntrySchema>;
export type Catalogue = z.infer<typeof catalogueSchema>;

const snippetSchema = z.object({
  file: z.string().max(500),
  line: z.number().int().positive().nullable(),
  before: z.string().max(1000),
  after: z.string().max(1000).nullable(),
  note: z.string().max(400).optional(),
});

/** The rendered explanation stored on each plan item (`item.explain`). */
export const explanationSchema = z.object({
  kind: z.string().nullable(),
  /** catalogue = from profiles/explanations; generic = built from the item's own text (AI items, unknown kinds). */
  source: z.enum(["catalogue", "generic"]),
  plainTitle: z.string(),
  inPlainWords: z.string(),
  whatWeFound: z.string(),
  whyItMatters: z.string(),
  whatWillHappen: z.string(),
  snippets: z.array(snippetSchema).max(20).default([]),
  ifApproved: z.string(),
  ifLocked: z.string(),
  ifManual: z.string(),
  manualSteps: z.array(z.string()),
  effort: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  riskIfSkipped: riskSchema,
  skipEffect: effectSchema,
  riskIfApproved: riskSchema,
  approvedEffect: effectSchema,
  skipWhen: z.enum(["any-file", "primary-file"]),
  learnMore: z.array(z.object({ label: z.string(), url: z.string() })),
});

export type Explanation = z.infer<typeof explanationSchema>;

// ---- loading ---------------------------------------------------------------------

const cache = new Map<string, Catalogue>();

export function explanationsDir(): string {
  return path.join(profilesRoot, "explanations");
}

export function loadCatalogue(id: "common" | Ecosystem): Catalogue {
  const cached = cache.get(id);
  if (cached) return cached;
  const file = path.join(explanationsDir(), `${id}.json`);
  const parsed = catalogueSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) {
    throw new Error(`${file} is invalid: ${parsed.error.issues.slice(0, 6).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }
  cache.set(id, parsed.data);
  return parsed.data;
}

export function resetCatalogueCache(): void {
  cache.clear();
}

export function catalogueEntry(ecosystem: Ecosystem, kind: string): CatalogueEntry | null {
  return loadCatalogue(ecosystem).entries[kind] ?? loadCatalogue("common").entries[kind] ?? null;
}

// ---- rendering ---------------------------------------------------------------------

/** What the renderer needs from a plan item (deterministic or AI). */
export type ExplainItem = {
  kind?: string;
  params?: Record<string, string>;
  snippets?: Snippet[];
  group: "auto" | "review" | "manual";
  category: string;
  severity: "info" | "low" | "medium" | "high";
  title: string;
  file: string | null;
  line: number | null;
  files?: string[];
  why: string;
  suggestion: string;
  evidence?: string;
  source: "deterministic" | "ai";
};

export type ExplainPlan = {
  ecosystem: Ecosystem;
  targets: Record<string, string>;
  detected: Record<string, unknown>;
};

const clean = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value).replace(/^[\^~>=<\s]+/, "").replace(/\.x$/, "");
};

/** Placeholder values every template may use. */
function context(plan: ExplainPlan, item: ExplainItem): Record<string, string> {
  const where = item.file ? `${item.file}${item.line ? `:${item.line}` : ""}` : "project-wide";
  const base: Record<string, string> = {
    title: item.title,
    file: item.file ?? "",
    line: item.line ? String(item.line) : "",
    where,
    evidence: item.evidence ?? "",
    fileCount: String(item.files?.length ?? (item.file ? 1 : 0)),
    targetJava: clean(plan.targets.java),
    targetBoot: clean(plan.targets.boot),
    targetNode: clean(plan.targets.node),
    targetTs: clean(plan.targets.typescript),
    fromJava: clean(plan.detected.java),
    fromBoot: clean(plan.detected.boot),
    fromNode: clean(plan.detected.node),
    fromTs: clean(plan.detected.typescript),
    fromExpress: clean(plan.detected.express),
    targetPython: clean(plan.targets.python),
    fromPython: clean(plan.detected.python),
  };
  for (const [key, value] of Object.entries(item.params ?? {})) base[key] = value;
  return base;
}

const placeholder = /\{([a-z][A-Za-z]*)\}/g;

/** Fill {placeholders}; null when any is missing or empty (the caller then falls back). */
export function renderTemplate(template: string, values: Record<string, string>): string | null {
  let missing = false;
  const text = template.replace(placeholder, (_match, key: string) => {
    const value = values[key];
    if (value === undefined || value === "") {
      missing = true;
      return "";
    }
    return value;
  });
  return missing ? null : text;
}

const severityRisk: Record<ExplainItem["severity"], Risk> = { info: "low", low: "low", medium: "medium", high: "high" };

/** Explanation built from the item's own text: AI findings and kinds without a catalogue entry. */
function genericExplanation(item: ExplainItem): Explanation {
  const ai = item.source === "ai";
  const consequence = item.group === "auto" ? "The planned change is not applied to these files; it becomes manual work." : "Nothing is changed automatically either way; the lock only stops the AI fix-up from editing the file.";
  return {
    kind: item.kind ?? null,
    source: "generic",
    plainTitle: item.title,
    inPlainWords: ai ? `AI-suggested risk: ${item.why || item.title}`.slice(0, 400) : item.why || item.title,
    whatWeFound: item.evidence ? `${item.file ?? "Project"}${item.line ? ` line ${item.line}` : ""}: ${item.evidence}` : item.why || item.title,
    whyItMatters: item.why || "Review it before the run.",
    whatWillHappen: item.group === "auto" ? "The pipeline applies this step." : "Nothing is changed automatically.",
    snippets: item.snippets ?? [],
    ifApproved: item.group === "auto" ? "The step runs." : "You accept the risk; check it after the run.",
    ifLocked: consequence,
    ifManual: consequence,
    manualSteps: item.suggestion ? [item.suggestion] : ["Review it by hand."],
    effort: "unknown",
    confidence: ai ? "low" : "medium",
    riskIfSkipped: severityRisk[item.severity],
    skipEffect: "runtime",
    riskIfApproved: item.group === "auto" ? "none" : severityRisk[item.severity],
    approvedEffect: item.group === "auto" ? "none" : "runtime",
    skipWhen: "any-file",
    learnMore: [],
  };
}

/** Explain one item. Deterministic: same plan + item → same text. */
export function explainItem(plan: ExplainPlan, item: ExplainItem): Explanation {
  const kind = item.kind ?? (item.source === "deterministic" ? legacyKind(plan.ecosystem, item) : null);
  const entry = kind ? catalogueEntry(plan.ecosystem, kind) : null;
  if (!entry || item.source === "ai") return genericExplanation({ ...item, kind: kind ?? undefined });
  const values = context(plan, item);
  const render = (template: string, fallback: string) => renderTemplate(template, values) ?? fallback;
  const ifLocked = render(entry.ifLocked, item.group === "auto" ? "The planned change is not applied to the locked files; it becomes manual work." : "Nothing is changed automatically; the AI fix-up may not edit the file.");
  return {
    kind,
    source: "catalogue",
    plainTitle: render(entry.plainTitle, item.title),
    inPlainWords: render(entry.inPlainWords, item.why),
    whatWeFound: render(entry.whatWeFound, item.evidence ? `${item.file ?? ""}${item.line ? ` line ${item.line}` : ""}: ${item.evidence}` : item.why),
    whyItMatters: render(entry.whyItMatters, item.why),
    whatWillHappen: render(entry.whatWillHappen, item.suggestion),
    snippets: (item.snippets ?? []).slice(0, 20),
    ifApproved: render(entry.ifApproved, "The pipeline goes ahead with this item."),
    ifLocked,
    ifManual: entry.ifManual ? render(entry.ifManual, ifLocked) : ifLocked,
    manualSteps: entry.manualSteps.map((step) => render(step, item.suggestion || step.replace(placeholder, "it"))),
    effort: entry.effort,
    confidence: entry.confidence,
    riskIfSkipped: entry.riskIfSkipped,
    skipEffect: entry.skipEffect,
    riskIfApproved: entry.riskIfApproved,
    approvedEffect: entry.approvedEffect,
    skipWhen: entry.skipWhen,
    learnMore: entry.learnMore,
  };
}

/**
 * Kind for items saved before kinds existed (older migration-plan.json files),
 * from their category, title and file. Unknown → null (generic explanation).
 */
export function legacyKind(ecosystem: Ecosystem, item: Pick<ExplainItem, "category" | "title" | "file" | "group">): string | null {
  // Python plans were created with kinds from the start; nothing to map back.
  if (ecosystem === "python") return null;
  const title = item.title;
  const file = item.file ?? "";
  switch (item.category) {
    case "recipe":
      if (/jakarta/i.test(title)) return "recipe.jakarta";
      if (/SpringBoot/i.test(title)) return "recipe.boot";
      if (/UpgradeToJava|UpgradeJavaVersion/i.test(title)) return "recipe.java";
      return "recipe.other";
    case "rules":
      if (ecosystem === "java") return /\.(properties|ya?ml)$/.test(file) ? "rules.config" : "rules.build";
      if (file === "package.json") return "rules.package-json";
      if (/tsconfig[\w.-]*\.json$/.test(file)) return "rules.tsconfig";
      if (file === ".nvmrc" || file === ".node-version") return "rules.nvmrc";
      return "rules.other";
    case "codemod":
      return "codemod.express5";
    case "install":
      return "install";
    case "express-api":
      return item.group === "auto" ? "express-api.codemod" : "express-api.req-query";
    case "secrets":
      return /^Example/.test(title) ? "secrets.example" : "secrets.file";
    case "native-code":
      return /\.java$/.test(file) ? "native-method" : "native-code.dir";
    case "tests":
      if (/No npm test script/.test(title)) return "tests.no-script";
      return /No tests/.test(title) ? "tests.none" : "tests.few";
    case "custom-build":
      return file.startsWith("buildSrc") ? "custom-build.buildsrc" : "custom-build.plugin";
    case "tsconfig":
      return /extends/.test(title) ? "tsconfig.extends" : "tsconfig.manual";
    case "native-addon":
      return /node-sass/.test(title) ? "native-addon.node-sass" : "native-addon";
    case "build-config":
      return "build-config.java-level";
    case "dependency":
      if (ecosystem === "java") return /Lombok/.test(title) ? "dependency.lombok" : "dependency.no-jakarta";
      if (/ts-node/.test(title)) return "dependency.ts-node";
      if (/ts-jest/.test(title)) return "dependency.ts-jest";
      if (/is deprecated/.test(title)) return "dependency.request";
      return "dependency.manual";
    case "removed-api":
    case "deprecated-api":
    case "changed-api":
    case "jdk-internal":
      if (ecosystem === "node") return item.category === "removed-api" ? "node-api.removed" : "node-api.deprecated";
      if (/spring\.factories/.test(title)) return "spring-factories";
      if (/Spring Security/.test(title)) return "api.security-config";
      if (/Spring MVC adapter/.test(title)) return "api.mvc-adapter";
      if (/CommonsMultipartResolver/.test(title)) return "api.commons-multipart";
      if (/MockBean/.test(title)) return "api.mockbean";
      if (/Jackson/.test(title)) return "api.jackson2";
      if (/EnableGlobalMethodSecurity/.test(title)) return "api.global-method-security";
      if (/Hibernate/.test(title)) return "api.hibernate-type";
      if (/getErrorPath/.test(title)) return "api.error-path";
      if (/JDK-internal/.test(title)) return "api.jdk-internal";
      if (/SecurityManager/.test(title)) return "api.security-manager";
      if (/Boxed-primitive/.test(title)) return "api.boxed-constructor";
      if (/finalize/.test(title)) return "api.finalize";
      return null;
    default:
      return ["inline-secret", "db-migration", "container", "ci", "property-conflict", "reflection", "javax-string", "generated-code", "generator-plugin", "build-plugin", "jvm-flags", "web-xml", "classic-spring", "express-routing", "package-manager"].includes(item.category)
        ? item.category
        : null;
  }
}

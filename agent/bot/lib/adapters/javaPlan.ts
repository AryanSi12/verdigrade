import path from "node:path";
import { runRecipe } from "../build.js";
import { createWorkCopy, removeWorkCopy } from "../git.js";
import { loadModernizerRules, normalizeJava, resolveRoute, type RecipeStep } from "../matrix.js";
import { applyRules, mergeRules } from "../rules.js";
import { scanProject } from "../scanner.js";
import { commonFindings, finding, firstLine, listRepoFiles, matchingLines, readText, ruleSnippets, testsFinding } from "./findings.js";
import { knownBadDependencies, shouldRun } from "./java.js";
import type { JavaKind } from "./kinds.js";
import { StepFailed, type AdapterPlan, type Fix, type PlanFinding, type PlanInput, type Snippet } from "./types.js";

type ApiRule = {
  kind: JavaKind;
  pattern: RegExp;
  category: string;
  severity: PlanFinding["severity"];
  title: string;
  why: string;
  suggestion: string;
  /** Only when the target Boot line starts with this (e.g. "4."). */
  boot?: string;
  files?: RegExp;
  /** Generic before → after example (the project's own line is shown as the code excerpt). */
  fix?: Fix;
};

/** APIs removed or changed in the target lines that the pinned recipes do not (fully) handle. */
const apiRules: ApiRule[] = [
  {
    kind: "api.security-config",
    fix: {
      summary: "Replace the adapter class with a SecurityFilterChain bean and the lambda style (authorizeHttpRequests + requestMatchers).",
      before: "class SecurityConfig extends WebSecurityConfigurerAdapter {\n  protected void configure(HttpSecurity http) throws Exception {\n    http.authorizeRequests().antMatchers(\"/api/**\").authenticated();\n  }\n}",
      after: "@Bean\nSecurityFilterChain filterChain(HttpSecurity http) throws Exception {\n  http.authorizeHttpRequests(auth -> auth.requestMatchers(\"/api/**\").authenticated());\n  return http.build();\n}",
    },
    pattern: /\bWebSecurityConfigurerAdapter\b|\.antMatchers\(|\.authorizeRequests\(|\.mvcMatchers\(/,
    category: "removed-api",
    severity: "high",
    title: "Spring Security configuration uses APIs removed in Spring Security 6",
    why: "WebSecurityConfigurerAdapter, antMatchers/mvcMatchers and authorizeRequests were removed. Recipes cover simple cases only; custom filter chains usually need hand edits.",
    suggestion: "Rewrite as a SecurityFilterChain @Bean with the lambda DSL (authorizeHttpRequests, requestMatchers) and re-test every protected endpoint.",
  },
  {
    kind: "api.mvc-adapter",
    fix: { summary: "Implement the interface directly instead of extending the removed adapter class.", before: "class WebConfig extends WebMvcConfigurerAdapter {", after: "class WebConfig implements WebMvcConfigurer {" },
    pattern: /\b(WebMvcConfigurerAdapter|HandlerInterceptorAdapter)\b/,
    category: "removed-api",
    severity: "high",
    title: "Spring MVC adapter class removed in Spring Framework 6",
    why: "WebMvcConfigurerAdapter and HandlerInterceptorAdapter no longer exist; the class will not compile.",
    suggestion: "Implement WebMvcConfigurer / HandlerInterceptor directly (they have default methods).",
  },
  {
    kind: "api.commons-multipart",
    fix: { summary: "Delete the CommonsMultipartResolver bean; Spring Boot configures the servlet multipart resolver for you.", before: "@Bean\npublic CommonsMultipartResolver multipartResolver() { … }", after: "# application.properties (optional)\nspring.servlet.multipart.max-file-size=10MB" },
    pattern: /\bCommonsMultipartResolver\b/,
    category: "removed-api",
    severity: "high",
    title: "CommonsMultipartResolver was removed in Spring Framework 6",
    why: "Commons FileUpload support is gone; multipart parsing now uses the servlet container.",
    suggestion: "Remove the bean and use StandardServletMultipartResolver (Boot configures it).",
  },
  {
    kind: "api.mockbean",
    fix: { summary: "Switch to the Mockito bean-override annotations.", before: "@MockBean\nprivate BookingService bookingService;", after: "@MockitoBean\nprivate BookingService bookingService;" },
    pattern: /@(MockBean|SpyBean)\b/,
    category: "removed-api",
    severity: "high",
    boot: "4.",
    title: "@MockBean / @SpyBean are removed in Spring Boot 4",
    why: "They were deprecated in Boot 3.4 and removed in 4.0, so tests using them stop compiling.",
    suggestion: "Use @MockitoBean / @MockitoSpyBean from org.springframework.test.context.bean.override.mockito.",
  },
  {
    kind: "api.jackson2",
    pattern: /\bcom\.fasterxml\.jackson\.databind\b/,
    category: "changed-api",
    severity: "medium",
    boot: "4.",
    title: "Jackson 2 API in use; Spring Boot 4 defaults to Jackson 3",
    why: "Boot 4 auto-configures Jackson 3 (tools.jackson.*). Custom ObjectMapper beans, modules and serializers written for Jackson 2 may no longer be picked up.",
    suggestion: "Review custom Jackson configuration; migrate to Jackson 3 types or keep Jackson 2 deliberately with Boot's compatibility support.",
  },
  {
    kind: "api.global-method-security",
    fix: { summary: "Use the new annotation (pre/post annotations are on by default).", before: "@EnableGlobalMethodSecurity(prePostEnabled = true)", after: "@EnableMethodSecurity" },
    pattern: /@EnableGlobalMethodSecurity\b/,
    category: "deprecated-api",
    severity: "medium",
    title: "@EnableGlobalMethodSecurity is deprecated",
    why: "Replaced by @EnableMethodSecurity (pre/post annotations enabled by default).",
    suggestion: "Switch to @EnableMethodSecurity and check prePostEnabled/securedEnabled settings.",
  },
  {
    kind: "api.hibernate-type",
    fix: { summary: "Use the Hibernate 6 form of @Type, or @JdbcTypeCode for JSON columns.", before: "@Type(type = \"json\")", after: "@JdbcTypeCode(SqlTypes.JSON)" },
    pattern: /@Type\s*\(\s*type\s*=/,
    category: "removed-api",
    severity: "high",
    title: "Hibernate @Type(type = …) is not supported in Hibernate 6",
    why: "Boot 3+ ships Hibernate 6, where custom types use @Type(SomeUserType.class) or @JdbcTypeCode.",
    suggestion: "Port the custom type to the Hibernate 6 UserType API or @JdbcTypeCode.",
  },
  {
    kind: "api.error-path",
    fix: { summary: "Delete getErrorPath() and set server.error.path in application.properties if you need a custom path.", before: "@Override\npublic String getErrorPath() { return \"/error\"; }", after: "# application.properties\nserver.error.path=/error" },
    pattern: /\bgetErrorPath\s*\(/,
    category: "removed-api",
    severity: "medium",
    title: "ErrorController.getErrorPath() no longer exists",
    why: "The method was removed from ErrorController; an @Override on it fails to compile.",
    suggestion: "Delete the method and configure server.error.path instead.",
  },
  {
    kind: "api.jdk-internal",
    pattern: /\b(sun\.misc\.|sun\.reflect\.|com\.sun\.(?!net\.httpserver))/,
    category: "jdk-internal",
    severity: "high",
    title: "JDK-internal API in use",
    why: "JDK internals are strongly encapsulated since Java 17; access fails at runtime unless --add-opens is set.",
    suggestion: "Replace with a supported API (VarHandle, java.util.Base64, …) or document the required --add-opens flags.",
  },
  {
    kind: "api.security-manager",
    pattern: /System\.(get|set)SecurityManager\s*\(|\bextends\s+SecurityManager\b/,
    category: "deprecated-api",
    severity: "medium",
    title: "SecurityManager is deprecated for removal",
    why: "Deprecated for removal since Java 17 and permanently disabled in Java 24.",
    suggestion: "Remove the SecurityManager usage and enforce the policy another way.",
  },
  {
    kind: "api.boxed-constructor",
    pattern: /\bnew\s+(Integer|Long|Short|Byte|Double|Float|Character|Boolean)\s*\(/,
    category: "deprecated-api",
    severity: "low",
    title: "Boxed-primitive constructor (deprecated for removal)",
    why: "new Integer(…) and friends are deprecated for removal; javac warns on Java 21.",
    suggestion: "Use Integer.valueOf(…) / autoboxing. Low risk; can be done with the migration.",
  },
  {
    kind: "api.finalize",
    pattern: /\bvoid\s+finalize\s*\(\s*\)/,
    category: "deprecated-api",
    severity: "low",
    title: "finalize() override (finalization is deprecated for removal)",
    why: "Finalization is deprecated for removal (JEP 421) and may stop running in a future JDK.",
    suggestion: "Use try-with-resources or java.lang.ref.Cleaner.",
  },
];

const reflection = /\bClass\.forName\s*\(|\.getDeclared(Method|Field|Constructor)s?\s*\(|\.setAccessible\s*\(\s*true/;
const javaxString = /["']javax\.(servlet|persistence|validation|annotation|transaction|xml\.bind|ws\.rs|inject|ejb|faces|mail|jms|websocket)\b/;
const nativeMethod = /^\s*(public|private|protected|static|final|synchronized|\s)*\bnative\b[^;=]*\(/;

/** Standard plugins whose behaviour the route understands; anything else gets a review item. */
const knownPlugins = new Set([
  "maven-compiler-plugin",
  "maven-surefire-plugin",
  "maven-failsafe-plugin",
  "spring-boot-maven-plugin",
  "maven-jar-plugin",
  "maven-war-plugin",
  "maven-resources-plugin",
  "maven-install-plugin",
  "maven-deploy-plugin",
  "maven-clean-plugin",
  "maven-site-plugin",
  "maven-source-plugin",
  "maven-javadoc-plugin",
  "jacoco-maven-plugin",
  "maven-enforcer-plugin",
  "versions-maven-plugin",
  "maven-dependency-plugin",
]);
const scriptPlugins = /^(maven-antrun-plugin|exec-maven-plugin|gmavenplus-plugin|groovy-maven-plugin|maven-shade-plugin|maven-assembly-plugin|frontend-maven-plugin)$/;
const generatorPlugins = /^(jaxb2-maven-plugin|maven-jaxb2-plugin|jaxws-maven-plugin|cxf-codegen-plugin|openapi-generator-maven-plugin|swagger-codegen-maven-plugin|maven-processor-plugin|querydsl-maven-plugin|jsonschema2pojo-maven-plugin)$/;

function pluginsOf(pom: string): Array<{ artifactId: string; line: number; text: string }> {
  const found: Array<{ artifactId: string; line: number; text: string }> = [];
  const lines = pom.split(/\r?\n/);
  let inPlugin = false;
  for (let index = 0; index < lines.length; index += 1) {
    if (/<plugin>/.test(lines[index])) inPlugin = true;
    if (inPlugin) {
      const match = /<artifactId>\s*([^<\s]+)\s*<\/artifactId>/.exec(lines[index]);
      if (match) {
        found.push({ artifactId: match[1], line: index + 1, text: lines[index].trim() });
        inPlugin = false;
      }
    }
    if (/<\/plugin>/.test(lines[index])) inPlugin = false;
  }
  return found;
}

function lombokVersion(pom: string): { version: string; line: number } | null {
  const lines = pom.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!/<artifactId>\s*lombok\s*<\/artifactId>/.test(lines[index])) continue;
    for (let next = index; next < Math.min(lines.length, index + 4); next += 1) {
      const version = /<version>\s*([\d.]+)\s*<\/version>/.exec(lines[next]);
      if (version) return { version: version[1], line: next + 1 };
    }
  }
  const property = /<lombok\.version>\s*([\d.]+)\s*</.exec(pom);
  if (property) return { version: property[1], line: firstLine(pom, /<lombok\.version>/)?.line ?? 1 };
  return null;
}

function versionBelow(version: string, minimum: number[]): boolean {
  const parts = version.split(".").map((part) => Number(part) || 0);
  for (let index = 0; index < minimum.length; index += 1) {
    if ((parts[index] ?? 0) !== minimum[index]) return (parts[index] ?? 0) < minimum[index];
  }
  return false;
}

function recipeKind(recipe: string): JavaKind {
  if (/jakarta/i.test(recipe)) return "recipe.jakarta";
  if (/SpringBoot/i.test(recipe)) return "recipe.boot";
  if (/UpgradeToJava|UpgradeJavaVersion/i.test(recipe)) return "recipe.java";
  return "recipe.other";
}

/** Jakarta EE packages the javax → jakarta recipe renames (javax.annotation only for the Jakarta Annotations types). */
const jakartaImport = /^(\s*import\s+(?:static\s+)?)javax\.(servlet|persistence|validation|transaction|ws\.rs|inject|ejb|faces|mail|jms|websocket|xml\.bind|annotation\.(?:PostConstruct|PreDestroy|Resource|Priority|security|sql|ManagedBean))\b/;

/**
 * Expected before → after lines for the pinned recipes, from what each recipe is
 * documented to do (java.version / release level, the Boot parent version,
 * javax → jakarta imports). The real diff is shown after the run.
 */
function recipeSnippets(repoPath: string, step: RecipeStep, touched: string[], target: { java: string; parent: string }): Snippet[] {
  const out: Snippet[] = [];
  if (/jakarta/i.test(step.recipe)) {
    for (const file of touched.filter((item) => item.endsWith(".java"))) {
      for (const hit of matchingLines(readText(repoPath, file), jakartaImport, 6)) {
        out.push({ file, line: hit.line, before: hit.text, after: hit.text.replace(/\bjavax\./, "jakarta.") });
        if (out.length >= 8) return out;
      }
    }
    return out;
  }
  for (const file of touched.filter((item) => /(pom\.xml|build\.gradle(\.kts)?)$/.test(item))) {
    const text = readText(repoPath, file);
    if (/UpgradeToJava|UpgradeJavaVersion/i.test(step.recipe)) {
      for (const hit of matchingLines(text, /<(java\.version|maven\.compiler\.(source|target|release)|release|source|target)>\s*[\d.]+\s*</, 4)) {
        out.push({ file, line: hit.line, before: hit.text, after: hit.text.replace(/>\s*[\d.]+\s*</, `>${target.java}<`) });
      }
      for (const hit of matchingLines(text, /(sourceCompatibility|targetCompatibility)\s*=|languageVersion\s*=\s*JavaLanguageVersion\.of\(/, 3)) {
        out.push({ file, line: hit.line, before: hit.text, after: null, note: `Set to Java ${target.java} by the recipe.` });
      }
    } else if (/SpringBoot/i.test(step.recipe)) {
      const lines = text.split(/\r?\n/);
      const parent = lines.findIndex((line) => /<artifactId>\s*spring-boot-starter-parent\s*<\/artifactId>/.test(line));
      if (parent >= 0) {
        for (let index = parent; index < Math.min(lines.length, parent + 4); index += 1) {
          if (/<version>/.test(lines[index])) {
            const before = lines[index].trim();
            out.push({ file, line: index + 1, before, after: target.parent && /\d/.test(target.parent) && !/x/.test(target.parent) ? before.replace(/<version>[^<]*</, `<version>${target.parent}<`) : null, note: `Spring Boot parent moves to the ${target.parent} line.` });
            break;
          }
        }
      }
      const plugin = firstLine(text, /id\s*\(?\s*["']org\.springframework\.boot["']\s*\)?\s*version/);
      if (plugin) out.push({ file, line: plugin.line, before: plugin.text, after: null, note: `Spring Boot plugin moves to the ${target.parent} line.` });
    }
  }
  return out;
}

/** Files a recipe is expected to touch when no OpenRewrite preview ran. */
function estimateRecipeFiles(step: RecipeStep, buildFiles: string[], javaxFiles: string[], configFiles: string[]): string[] {
  if (/jakarta/i.test(step.recipe)) return javaxFiles;
  if (/SpringBoot/i.test(step.recipe)) return [...buildFiles, ...configFiles];
  return buildFiles;
}

/** Deterministic plan for a Java/Spring project. Read-only: the preview runs on a temporary copy. */
export async function javaPlan(input: PlanInput): Promise<AdapterPlan> {
  const { repoPath, request, repoConfig } = input;
  const scan = scanProject(repoPath, { excludeModules: repoConfig.excludeModules });
  const resolved = resolveRoute({
    targetJava: request.targets.java || repoConfig.targetJava,
    targetBoot: request.targets.boot || repoConfig.targetBoot,
    fromJava: request.from.java || scan.javaVersion || undefined,
    fromBoot: request.from.boot || scan.springBootVersion || (scan.classicSpring ? "none" : undefined),
  });
  if (!resolved.ok) throw new StepFailed(resolved.error);
  const files = listRepoFiles(repoPath);
  const findings: PlanFinding[] = [];
  const notes: string[] = [];
  const buildFiles = scan.modules.map((module) => module.buildFile);
  const configFiles = files.filter((file) => /(^|\/)src\/[^/]+\/resources\/(application|bootstrap)[\w.-]*\.(properties|ya?ml)$/.test(file));
  const bootTarget = resolved.targetBoot;

  // ---- (a) will change automatically --------------------------------------
  input.onStage?.("dependencies");
  let preview: Map<string, string[]> | null = null;
  if (input.preview) {
    preview = new Map();
    const copy = createWorkCopy(repoPath);
    try {
      for (const step of resolved.recipePlan) {
        const run = await runRecipe(copy, scan.buildTool, step.artifact, step.recipe, "dryRun", { timeoutMs: 30 * 60_000, signal: input.signal, env: input.env });
        if (run.result.ok) preview.set(step.recipe, run.changedFiles);
        else notes.push(`OpenRewrite preview of ${step.recipe} failed (exit ${run.result.exitCode ?? run.result.failure}); file list is an estimate.`);
      }
    } finally {
      removeWorkCopy(copy);
    }
  }
  for (const step of resolved.recipePlan) {
    const decision = shouldRun(step, { javaVersion: scan.javaVersion, bootPresent: Boolean(scan.springBootVersion), javaxFiles: scan.javaxFiles.length }, resolved.targetJava);
    const name = step.recipe.split(".").slice(-2).join(".");
    if (!decision.run) {
      notes.push(`${name} will be skipped: ${decision.reason}.`);
      continue;
    }
    const exact = preview?.get(step.recipe);
    const touched = exact ?? estimateRecipeFiles(step, buildFiles, scan.javaxFiles, configFiles);
    findings.push(
      finding({
        group: "auto",
        kind: recipeKind(step.recipe),
        params: { recipe: step.recipe, name, count: String(touched.length), reason: decision.reason },
        snippets: recipeSnippets(repoPath, step, touched, { java: resolved.targetJava, parent: resolved.parentHint || bootTarget }),
        category: "recipe",
        severity: "info",
        title: `OpenRewrite ${name}`,
        file: touched[0] ?? null,
        line: null,
        files: touched,
        why: `Pinned recipe from the matrix (${decision.reason}). ${exact ? "Files come from an OpenRewrite dry run." : "Files are an estimate; turn on preview for the exact list."}`,
        suggestion: "Approve to let the recipe run. Lock a file to keep the recipe away from it (it is excluded and any change is reverted).",
        defaultDecision: "approve",
      }),
    );
  }
  const packs = [loadModernizerRules(resolved.route.modernizerRules), ...repoConfig.extraRulePacks.map((id) => loadModernizerRules(id))];
  const merged = mergeRules(packs);
  const edits = applyRules(repoPath, merged, {
    modules: scan.modules.map((module) => module.path),
    buildFiles: buildFiles.filter((file) => /(pom\.xml|build\.gradle(\.kts)?)$/.test(file)),
    write: false,
  });
  const byFile = new Map<string, string[]>();
  for (const edit of edits) {
    if (/^both .* are set/.test(edit.detail)) {
      findings.push(
        finding({
          group: "review",
          kind: "property-conflict",
          category: "property-conflict",
          severity: "medium",
          title: "Old and new property keys are both set",
          file: edit.file,
          line: null,
          why: `Rules pack ${merged.id}: ${edit.detail}. The rename would lose one of the values, so it is left alone.`,
          suggestion: "Keep the value you want under the new key and delete the old one.",
          defaultDecision: "approve",
        }),
      );
      continue;
    }
    byFile.set(edit.file, [...(byFile.get(edit.file) ?? []), edit.detail]);
  }
  for (const [file, details] of byFile) {
    const text = readText(repoPath, file);
    const keys = details.map((detail) => detail.split(/ → |removed /).filter(Boolean)[0]?.trim()).filter(Boolean) as string[];
    const hit = keys.map((key) => firstLine(text, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).find(Boolean) ?? null;
    findings.push(
      finding({
        group: "auto",
        kind: /\.(properties|ya?ml)$/.test(file) ? "rules.config" : "rules.build",
        params: { pack: merged.id, count: String(details.length), fileName: path.posix.basename(file), details: details.join("; ") },
        snippets: ruleSnippets(text, file, details),
        category: "rules",
        severity: "info",
        title: `Rules pack ${merged.id}: ${details.length} edit${details.length === 1 ? "" : "s"} in ${path.posix.basename(file)}`,
        file,
        line: hit?.line ?? null,
        files: [file],
        why: details.join("; "),
        suggestion: "Approve to apply. Lock the file to keep it as is (the edits are skipped and listed as manual follow-up).",
        evidence: hit?.text,
        defaultDecision: "approve",
      }),
    );
  }

  // ---- (b) risky: review ----------------------------------------------------
  input.onStage?.("risky-code");
  const sources = files.filter((file) => /\.(java|kt)$/.test(file));
  const mainSources = sources.filter((file) => !/(^|\/)src\/test\//.test(file));
  const testSources = sources.filter((file) => /(^|\/)src\/test\//.test(file));
  const jackson2Files: Array<{ file: string; line: number; text: string }> = [];
  for (const file of sources) {
    const text = readText(repoPath, file);
    for (const rule of apiRules) {
      if (rule.boot && !bootTarget.startsWith(rule.boot)) continue;
      const hit = firstLine(text, rule.pattern);
      if (!hit) continue;
      if (rule.kind === "api.jackson2") {
        // One project-wide item instead of one per file (the Boot 4 recipe renames most of these).
        jackson2Files.push({ file, ...hit });
        continue;
      }
      findings.push(finding({ group: "review", kind: rule.kind, category: rule.category, severity: rule.severity, title: rule.title, file, line: hit.line, why: rule.why, suggestion: rule.suggestion, evidence: hit.text, defaultDecision: "approve", fix: rule.fix }));
    }
    if (bootTarget.startsWith("4.")) findings.push(...boot4Breaks(file, text));
    const reflective = firstLine(text, reflection);
    if (reflective) {
      findings.push(
        finding({
          group: "review",
          kind: "reflection",
          category: "reflection",
          severity: javaxString.test(text) ? "high" : "medium",
          title: "Reflection",
          file,
          line: reflective.line,
          why: "Class and member names in strings are invisible to OpenRewrite, so a javax → jakarta rename or a removed API is only found at runtime.",
          suggestion: "Check the reflected names against the target versions and cover the path with a test.",
          evidence: reflective.text,
          defaultDecision: "approve",
        }),
      );
    }
    const javaxLiteral = firstLine(text, javaxString);
    if (javaxLiteral) {
      findings.push(
        finding({
          group: "review",
          kind: "javax-string",
          category: "javax-string",
          severity: "high",
          title: "javax package name inside a string",
          file,
          line: javaxLiteral.line,
          why: "String literals are not rewritten by the Jakarta recipe; the code will look up a class that no longer exists.",
          suggestion: "Change the literal to the jakarta.* name by hand.",
          evidence: javaxLiteral.text,
          defaultDecision: "approve",
        }),
      );
    }
    if (/(^|\/)(generated|generated-sources|gen)\//.test(file) || /@(javax\.annotation\.)?Generated\b|generated by/i.test(text.slice(0, 2000))) {
      const javax = firstLine(text, /^\s*import\s+javax\.(xml\.bind|annotation|servlet|persistence|validation|ws)\b/);
      if (javax) {
        findings.push(
          finding({
            group: "review",
            kind: "generated-code",
          category: "generated-code",
            severity: "high",
            title: "javax imports in generated code",
            file,
            line: javax.line,
            why: "Generated sources are overwritten on the next generator run, so rewriting them does not stick.",
            suggestion: "Upgrade the generator (or its jakarta option) and regenerate; lock this file so the recipe leaves it alone.",
            evidence: javax.text,
            defaultDecision: "lock",
          }),
        );
      }
    }
    if (/\.java$/.test(file)) {
      const native = firstLine(text, nativeMethod);
      if (native) {
        findings.push(
          finding({
            group: "manual",
            kind: "native-method",
            category: "native-code",
            severity: "high",
            title: "JNI native method",
            file,
            line: native.line,
            why: "The native library behind this method must be rebuilt and tested against the target JDK.",
            suggestion: "Rebuild the native library for the target JDK and test it by hand.",
            evidence: native.text,
            defaultDecision: "manual",
          }),
        );
      }
    }
  }
  for (const module of scan.modules) {
    const pomText = readText(repoPath, module.buildFile);
    for (const bad of knownBadDependencies) {
      const hit = firstLine(pomText, bad.pattern);
      if (!hit) continue;
      findings.push(
        finding({
          group: "review",
          kind: "dependency.no-jakarta",
          params: { message: bad.message },
          category: "dependency",
          severity: "medium",
          title: "Dependency without a Jakarta/Boot-ready version",
          file: module.buildFile,
          line: hit.line,
          why: bad.message,
          suggestion: bad.message.split("; ").slice(1).join("; ") || "Replace or upgrade the dependency.",
          evidence: hit.text,
          defaultDecision: "approve",
        }),
      );
    }
    const lombok = lombokVersion(pomText);
    if (lombok && versionBelow(lombok.version, [1, 18, 30])) {
      findings.push(
        finding({
          group: "review",
          kind: "dependency.lombok",
          params: { version: lombok.version },
          category: "dependency",
          severity: "high",
          title: `Lombok ${lombok.version} does not support Java 21`,
          file: module.buildFile,
          line: lombok.line,
          why: "Lombok needs 1.18.30 or later to compile on JDK 21; older versions fail with an annotation-processor error.",
          suggestion: "Upgrade Lombok to 1.18.30+ (or drop the explicit version and use Boot's managed one).",
          evidence: readText(repoPath, module.buildFile).split(/\r?\n/)[lombok.line - 1]?.trim(),
          defaultDecision: "approve",
        }),
      );
    }
    if (module.buildFile.endsWith("pom.xml")) {
      for (const plugin of pluginsOf(pomText)) {
        if (knownPlugins.has(plugin.artifactId)) continue;
        if (generatorPlugins.test(plugin.artifactId)) {
          findings.push(
            finding({
              group: "review",
              kind: "generator-plugin",
          category: "generator-plugin",
              severity: "high",
              title: `Code generator ${plugin.artifactId}`,
              file: module.buildFile,
              line: plugin.line,
              why: "Generated sources may still use javax.* packages; recipes only see the output, which is regenerated on every build.",
              suggestion: "Upgrade the generator to a Jakarta-ready version or enable its jakarta option.",
              evidence: plugin.text,
              defaultDecision: "approve",
            }),
          );
        } else if (scriptPlugins.test(plugin.artifactId)) {
          findings.push(
            finding({
              group: "manual",
              kind: "custom-build.plugin",
              params: { plugin: plugin.artifactId },
              category: "custom-build",
              severity: "medium",
              title: `Custom build step ${plugin.artifactId}`,
              file: module.buildFile,
              line: plugin.line,
              why: "Scripts and packaging plugins can hard-code Java versions, paths or javax classes that no recipe updates.",
              suggestion: "Read the plugin configuration and update it by hand if it depends on the old Java or Boot version.",
              evidence: plugin.text,
              defaultDecision: "manual",
            }),
          );
        } else {
          findings.push(
            finding({
              group: "review",
              kind: "build-plugin",
          category: "build-plugin",
              severity: "low",
              title: `Build plugin ${plugin.artifactId}`,
              file: module.buildFile,
              line: plugin.line,
              why: "Not one of the standard plugins the route knows; it may need a newer version for the target JDK.",
              suggestion: "Check the plugin supports the target JDK (bump its version if needed).",
              evidence: plugin.text,
              defaultDecision: "approve",
            }),
          );
        }
      }
      const opens = firstLine(pomText, /--add-opens|--illegal-access|--add-exports/);
      if (opens) {
        findings.push(
          finding({
            group: "review",
            kind: "jvm-flags",
          category: "jvm-flags",
            severity: "medium",
            title: "JVM module flags in the build",
            file: module.buildFile,
            line: opens.line,
            why: "--illegal-access is gone since Java 17 (the JVM refuses to start with it); --add-opens lists may need updating.",
            suggestion: "Remove --illegal-access and re-check every --add-opens entry on the target JDK.",
            evidence: opens.text,
            defaultDecision: "approve",
          }),
        );
      }
    }
  }
  for (const file of files.filter((item) => /(^|\/)META-INF\/spring\.factories$/.test(item))) {
    const hit = firstLine(readText(repoPath, file), /EnableAutoConfiguration/);
    if (!hit) continue;
    findings.push(
      finding({
        group: "review",
        kind: "spring-factories",
        category: "removed-api",
        severity: "high",
        title: "Auto-configuration registered in spring.factories",
        file,
        line: hit.line,
        why: "Boot 3+ no longer reads EnableAutoConfiguration entries from spring.factories, so the auto-configuration silently stops loading.",
        suggestion: "Move the classes to META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports.",
        evidence: hit.text,
        defaultDecision: "approve",
      }),
    );
  }
  for (const webXml of scan.webXmlFiles) {
    findings.push(
      finding({
        group: "review",
        kind: "web-xml",
          category: "web-xml",
        severity: "high",
        title: "web.xml deployment descriptor",
        file: webXml,
        line: 1,
        why: "Servlet configuration in web.xml is not migrated to Spring Boot by the recipes.",
        suggestion: "Move servlets, filters and listeners to @Bean registrations, then delete web.xml.",
        defaultDecision: "approve",
      }),
    );
  }
  if (scan.classicSpring) {
    findings.push(
      finding({
        group: "review",
        kind: "classic-spring",
          category: "classic-spring",
        severity: "high",
        title: `Classic Spring ${scan.springVersion} app (no Spring Boot parent)`,
        file: buildFiles[0] ?? null,
        line: null,
        why: "Boot recipes only apply to Boot apps; a classic Spring app needs a Boot parent, an application class and its XML config replaced.",
        suggestion: `Add spring-boot-starter-parent ${resolved.parentHint || bootTarget} and a @SpringBootApplication class by hand.`,
        defaultDecision: "approve",
      }),
    );
  }
  for (const module of scan.modules) {
    if (module.javaVersion?.includes("${")) {
      findings.push(
        finding({
          group: "review",
          kind: "build-config.java-level",
          category: "build-config",
          severity: "medium",
          title: `Java level ${module.javaVersion} could not be resolved`,
          file: module.buildFile,
          line: firstLine(readText(repoPath, module.buildFile), /java\.version|maven\.compiler|<release>|<source>/)?.line ?? null,
          why: "The scanner could not read the Java level, so the Java upgrade recipe runs unconditionally.",
          suggestion: "Check the property chain (parent POM, profiles) after the run.",
          defaultDecision: "approve",
        }),
      );
    }
  }
  const tests = testsFinding({ tests: testSources.length, sources: mainSources.length, testHint: "a @SpringBootTest that starts the context" });
  if (tests) findings.push(tests);
  if (normalizeJava(scan.javaVersion) === "8") {
    notes.push("Java 8 → 21 crosses the module system (Java 9) and strong encapsulation (Java 17); watch for reflection and JDK-internal findings.");
  }

  // ---- (c) manual ----------------------------------------------------------
  findings.push(
    ...jackson2Item(jackson2Files),
    ...commonFindings(repoPath, files, {
      runtimeLabel: "Java",
      targetRuntime: resolved.targetJava,
      ciVersionKey: /java-version:\s*['"]?(1\.)?(6|7|8|9|10|11|12|13|14|15|16|17|18|19|20)\b|jdk(8|11|17)\b/i,
      dockerImage: /^FROM\s+\S*(openjdk|temurin|corretto|jdk|jre|zulu|liberica)\S*?[:-](8|11|17)\b/i,
    }),
  );
  if (files.some((file) => file.startsWith("buildSrc/"))) {
    findings.push(
      finding({
        group: "manual",
        kind: "custom-build.buildsrc",
        category: "custom-build",
        severity: "medium",
        title: "Gradle buildSrc build logic",
        file: "buildSrc/",
        line: null,
        why: "Custom Gradle plugins and convention scripts are not rewritten by the recipes.",
        suggestion: "Update toolchain/Java versions in buildSrc by hand.",
        defaultDecision: "manual",
      }),
    );
  }

  return {
    routeId: resolved.route.id,
    description: resolved.route.description,
    targets: { java: resolved.targetJava, boot: resolved.targetBoot },
    targetLabel: `Java ${resolved.targetJava} · ${bootTarget === "none" ? "no Boot change" : `Spring Boot ${bootTarget}`}`,
    detected: {
      java: scan.javaVersion,
      boot: scan.springBootVersion,
      buildTool: scan.buildTool,
      modules: scan.modules.length,
      javaxFiles: scan.javaxFiles.length,
      classicSpring: scan.classicSpring,
    },
    findings,
    stats: {
      filesScanned: files.length,
      sourceFiles: mainSources.length,
      testFiles: testSources.length,
      buildFiles: buildFiles.length,
      configFiles: configFiles.length,
      javaxFiles: scan.javaxFiles.length,
    },
    notes: [...notes, ...resolved.notes, ...scan.notes],
  };
}


/** Jackson 2 imports across the project, as one review item listing every file. */
function jackson2Item(hits: Array<{ file: string; line: number; text: string }>): PlanFinding[] {
  if (!hits.length) return [];
  const rule = apiRules.find((item) => item.kind === "api.jackson2")!;
  return [
    finding({
      group: "review",
      kind: "api.jackson2",
      category: rule.category,
      severity: "medium",
      tier: "review",
      title: `Jackson 2 code in ${hits.length} file(s); Spring Boot 4 uses Jackson 3`,
      file: hits[0].file,
      line: hits[0].line,
      files: hits.map((hit) => hit.file),
      params: { count: String(hits.length) },
      snippets: hits.slice(0, 20).map((hit) => ({ file: hit.file, line: hit.line, before: hit.text, after: hit.text.replace(/\bcom\.fasterxml\.jackson\.(databind|core)\b/, "tools.jackson.$1"), note: "Renamed by the Boot 4 recipe." })),
      why: rule.why,
      suggestion: rule.suggestion,
      evidence: hits[0].text,
      defaultDecision: "approve",
      fix: {
        summary: "Usually nothing: the Boot 4 recipe renames these imports. Afterwards, compare your API's JSON (dates, nulls, field names) with the old version.",
        before: "import com.fasterxml.jackson.databind.ObjectMapper;",
        after: "import tools.jackson.databind.ObjectMapper;",
      },
    }),
  ];
}

const jackson2Bridges: Array<{ pattern: RegExp; api: string; replacement: string; rewrite: (line: string) => string }> = [
  {
    pattern: /new\s+GenericJackson2JsonRedisSerializer\s*\(\s*[^)\s]/,
    api: "GenericJackson2JsonRedisSerializer",
    replacement: "GenericJacksonJsonRedisSerializer (the Jackson 3 version in Spring Data Redis 4)",
    rewrite: (line) => line.replace(/GenericJackson2JsonRedisSerializer/, "GenericJacksonJsonRedisSerializer"),
  },
  {
    pattern: /new\s+Jackson2JsonRedisSerializer\s*<?[^>(]*>?\s*\(/,
    api: "Jackson2JsonRedisSerializer",
    replacement: "JacksonJsonRedisSerializer (the Jackson 3 version in Spring Data Redis 4)",
    rewrite: (line) => line.replace(/Jackson2JsonRedisSerializer/, "JacksonJsonRedisSerializer"),
  },
  {
    pattern: /new\s+MappingJackson2HttpMessageConverter\s*\(\s*[^)\s]/,
    api: "MappingJackson2HttpMessageConverter",
    replacement: "JacksonJsonHttpMessageConverter (Spring Framework 7)",
    rewrite: (line) => line.replace(/MappingJackson2HttpMessageConverter/, "JacksonJsonHttpMessageConverter"),
  },
  {
    pattern: /\bJackson2ObjectMapperBuilder\b/,
    api: "Jackson2ObjectMapperBuilder",
    replacement: "JsonMapper.builder() (Jackson 3) or a JsonMapperBuilderCustomizer bean",
    rewrite: (line) => line.replace(/Jackson2ObjectMapperBuilder(\.json\(\))?/, "JsonMapper.builder()"),
  },
];

/**
 * Code that is known to stop compiling on Spring Boot 4 / Spring Framework 7 /
 * Spring Security 7 and that the pinned recipes do not rewrite. One item per
 * file and rule, every matching line as a before → after snippet.
 */
export function boot4Breaks(file: string, text: string): PlanFinding[] {
  const out: PlanFinding[] = [];
  const lines = text.split(/\r?\n/);
  for (const bridge of jackson2Bridges) {
    const hits = matchingLines(text, bridge.pattern, 10);
    if (!hits.length) continue;
    const first = hits[0];
    const mapper = mapperSetup(lines, first.text);
    out.push(
      finding({
        group: "review",
        kind: "api.jackson2-spring-bridge",
        category: "changed-api",
        severity: "high",
        tier: "breaks",
        title: `${bridge.api} gets a Jackson 2 mapper; it won't compile on Spring Boot 4`,
        file,
        line: first.line,
        params: { api: bridge.api, replacement: bridge.replacement },
        snippets: [
          ...mapper.lines.map((entry) => ({ file, line: entry.line, before: entry.text, after: entry.after, note: entry.after ? "Build a Jackson 3 JsonMapper." : "Delete: Jackson 3 handles java.time already." })),
          ...hits.map((hit) => ({ file, line: hit.line, before: hit.text, after: bridge.rewrite(hit.text), note: "Change by hand." })),
        ].slice(0, 20),
        why: `Spring Boot 4 moves to Jackson 3. ${bridge.api} is the Jackson 2 variant, so passing the (renamed) Jackson 3 mapper to it fails to compile.`,
        suggestion: `Use ${bridge.replacement}, and build the mapper with JsonMapper.builder().`,
        evidence: first.text,
        defaultDecision: "lock",
        fix: {
          summary: `Use ${bridge.replacement}. Build the mapper with JsonMapper.builder(); Jackson 3 already handles java.time, so drop registerModule(new JavaTimeModule()).`,
          before: [...mapper.lines.map((entry) => entry.text), first.text].join("\n"),
          after: [...mapper.lines.flatMap((entry) => (entry.after ? [entry.after] : [])), bridge.rewrite(first.text)].join("\n"),
        },
      }),
    );
  }
  const dao = matchingLines(text, /new\s+DaoAuthenticationProvider\s*\(\s*\)/, 5);
  for (const hit of dao) {
    // Find the UserDetailsService the code sets right after, to show the exact fix.
    let setter: { line: number; text: string; arg: string } | null = null;
    for (let index = hit.line; index < Math.min(lines.length, hit.line + 8); index += 1) {
      const match = /\.setUserDetailsService\s*\(\s*([^)]+?)\s*\)/.exec(lines[index]);
      if (match) {
        setter = { line: index + 1, text: lines[index].trim(), arg: match[1] };
        break;
      }
    }
    const userDetails = setter?.arg ?? "userDetailsService";
    const after = hit.text.replace(/new\s+DaoAuthenticationProvider\s*\(\s*\)/, `new DaoAuthenticationProvider(${userDetails})`);
    out.push(
      finding({
        group: "review",
        kind: "api.dao-auth-provider",
        category: "removed-api",
        severity: "high",
        tier: "breaks",
        title: "new DaoAuthenticationProvider() won't compile on Spring Security 7",
        file,
        line: hit.line,
        params: { userDetails },
        snippets: [
          { file, line: hit.line, before: hit.text, after, note: "Pass the UserDetailsService to the constructor." },
          ...(setter ? [{ file, line: setter.line, before: setter.text, after: null, note: "Delete this line (the setter was removed)." }] : []),
        ],
        why: "Spring Boot 4 ships Spring Security 7, which removed the no-argument constructor and setUserDetailsService().",
        suggestion: `Use new DaoAuthenticationProvider(${userDetails}) and delete setUserDetailsService(...).`,
        evidence: hit.text,
        defaultDecision: "lock",
        fix: {
          summary: `Pass ${userDetails} to the constructor and delete the setUserDetailsService(...) line.`,
          before: setter ? `${hit.text}\n${setter.text}` : hit.text,
          after,
        },
      }),
    );
  }
  if (/\bHttpSecurity\b/.test(text)) {
    const and = matchingLines(text, /\.and\(\s*\)/, 10);
    if (and.length) {
      out.push(
        finding({
          group: "review",
          kind: "api.security-and",
          category: "removed-api",
          severity: "high",
          tier: "breaks",
          title: `.and() in the security config (${and.length}×) won't compile on Spring Security 7`,
          file,
          line: and[0].line,
          snippets: and.map((hit) => ({ file, line: hit.line, before: hit.text, after: null, note: "Rewrite in the lambda style." })),
          why: "Spring Security 7 removed the and() chaining methods.",
          suggestion: "Rewrite the chain in the lambda style and remove every .and().",
          evidence: and[0].text,
          defaultDecision: "lock",
          fix: {
            summary: "Rewrite each section with a lambda and remove .and().",
            before: "http.csrf().disable().and().cors();",
            after: "http.csrf(csrf -> csrf.disable()).cors(Customizer.withDefaults());",
          },
        }),
      );
    }
  }
  return out;
}

/** The ObjectMapper passed on `line` (declaration + registerModule calls), with the Jackson 3 version. */
function mapperSetup(lines: string[], line: string): { lines: Array<{ line: number; text: string; after: string | null }> } {
  const arg = /\(\s*([A-Za-z_$][\w$]*)\s*\)\s*\)?\s*;?\s*$/.exec(line)?.[1];
  if (!arg) return { lines: [] };
  const out: Array<{ line: number; text: string; after: string | null }> = [];
  const declaration = new RegExp(`^(.*?)\\bObjectMapper\\s+${arg}\\s*=\\s*new\\s+ObjectMapper\\s*\\(\\s*\\)\\s*;`);
  const register = new RegExp(`\\b${arg}\\s*\\.\\s*(registerModule|findAndRegisterModules)\\s*\\(`);
  lines.forEach((text, index) => {
    const trimmed = text.trim();
    const match = declaration.exec(trimmed);
    if (match) out.push({ line: index + 1, text: trimmed, after: `${match[1]}JsonMapper ${arg} = JsonMapper.builder().build();` });
    else if (register.test(trimmed) && /JavaTimeModule|Jdk8Module|findAndRegisterModules|ParameterNamesModule/.test(trimmed)) out.push({ line: index + 1, text: trimmed, after: null });
  });
  return { lines: out.slice(0, 6) };
}

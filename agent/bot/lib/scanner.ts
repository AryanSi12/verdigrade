import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildLauncher, detectBuildTool, type BuildTool } from "./repo.js";
import { normalizeJava } from "./matrix.js";

export type ModuleInfo = {
  /** Module folder relative to the repository root, "/"-separated ("" = root). */
  path: string;
  buildFile: string;
  javaVersion: string | null;
  springBootVersion: string | null;
  springVersion: string | null;
  hasWebXml: boolean;
};

export type ScanResult = {
  repoPath: string;
  buildTool: BuildTool;
  wrapper: boolean;
  modules: ModuleInfo[];
  /** Lowest Java level across modules (raw, e.g. "1.8"). */
  javaVersion: string | null;
  springBootVersion: string | null;
  springVersion: string | null;
  classicSpring: boolean;
  hasWebXml: boolean;
  webXmlFiles: string[];
  /** Files that reference Jakarta-EE-owned javax packages (these must migrate). */
  javaxFiles: string[];
  /** Usage count per Jakarta-EE javax package family, e.g. { "javax.servlet": 3 }. */
  javaxPackageCounts: Record<string, number>;
  /** Files that only use JDK-owned javax packages (javax.crypto, javax.sql…): never migrated. */
  jdkJavaxFiles: string[];
  jakartaFiles: string[];
  filesScanned: number;
  versionCatalog: string | null;
  notes: string[];
};

/** Jakarta EE package families that moved from javax.* to jakarta.* (EE 9+). */
export const jakartaEePackages = [
  "javax.activation",
  "javax.batch",
  "javax.decorator",
  "javax.ejb",
  "javax.el",
  "javax.enterprise",
  "javax.faces",
  "javax.inject",
  "javax.interceptor",
  "javax.jms",
  "javax.json",
  "javax.jws",
  "javax.mail",
  "javax.persistence",
  "javax.resource",
  "javax.security.auth.message",
  "javax.security.enterprise",
  "javax.security.jacc",
  "javax.servlet",
  "javax.transaction",
  "javax.validation",
  "javax.websocket",
  "javax.ws.rs",
  "javax.xml.bind",
  "javax.xml.soap",
  "javax.xml.ws",
  "javax.annotation.security",
  "javax.annotation.sql",
  "javax.annotation.PostConstruct",
  "javax.annotation.PreDestroy",
  "javax.annotation.Resource",
  "javax.annotation.Resources",
  "javax.annotation.Generated",
  "javax.annotation.Priority",
  "javax.annotation.ManagedBean",
];

/** javax packages that look like EE but belong to the JDK and must stay javax. */
const jdkOwnedExceptions = ["javax.transaction.xa", "javax.annotation.processing"];

/** Classify one javax reference: the Jakarta EE family it belongs to, or null (JDK-owned or third party). */
export function classifyJavax(reference: string): string | null {
  if (!reference.startsWith("javax.")) return null;
  if (jdkOwnedExceptions.some((prefix) => reference === prefix || reference.startsWith(`${prefix}.`))) return null;
  for (const family of jakartaEePackages) {
    if (reference === family || reference.startsWith(`${family}.`)) {
      return family.startsWith("javax.annotation.") && /[A-Z]/.test(family.split(".")[2] ?? "") ? "javax.annotation" : family;
    }
  }
  return null;
}

const skipDirs = new Set(["target", "build", "node_modules", ".git", ".gradle", ".idea", ".vscode", ".mvn", "out", ".settings"]);
const scanExtensions = new Set([".java", ".kt", ".groovy", ".xml", ".properties", ".yml", ".yaml", ".jsp", ".tld"]);
const maxFileBytes = 2_000_000;

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function read(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function stripXmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

function tag(text: string, name: string): string | null {
  const match = new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`).exec(text);
  return match ? match[1] : null;
}

function block(text: string, name: string): string {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text);
  return match ? match[1] : "";
}

function pomProperties(pom: string): Record<string, string> {
  const props: Record<string, string> = {};
  const body = block(pom, "properties");
  for (const match of body.matchAll(/<([A-Za-z0-9_.-]+)>\s*([^<]*?)\s*<\/\1>/g)) props[match[1]] = match[2];
  return props;
}

function resolveProps(value: string | null, props: Record<string, string>, depth = 0): string | null {
  if (value == null) return null;
  const resolved = value.replace(/\$\{([^}]+)\}/g, (whole, key: string) => (key in props ? props[key] : whole));
  if (resolved !== value && resolved.includes("${") && depth < 5) return resolveProps(resolved, props, depth + 1);
  return resolved;
}

type PomFacts = { props: Record<string, string>; java: string | null; boot: string | null; spring: string | null };

function compilerPluginSetting(pom: string, name: "release" | "source"): string | null {
  for (const match of pom.matchAll(/<plugin>([\s\S]*?)<\/plugin>/g)) {
    if (/<artifactId>\s*maven-compiler-plugin\s*<\/artifactId>/.test(match[1])) {
      const value = tag(match[1], name);
      if (value) return value;
    }
  }
  return null;
}

function localParent(pomFile: string, pom: string): string | null {
  const parent = block(pom, "parent");
  if (!parent) return null;
  if (/<relativePath\s*\/>/.test(parent)) return null;
  const relative = tag(parent, "relativePath") ?? "../pom.xml";
  let candidate = path.resolve(path.dirname(pomFile), relative);
  if (existsSync(candidate) && statSync(candidate).isDirectory()) candidate = path.join(candidate, "pom.xml");
  if (!existsSync(candidate)) return null;
  const parentArtifact = tag(parent, "artifactId");
  const candidateArtifact = tag(stripXmlComments(read(candidate)).replace(/<parent>[\s\S]*?<\/parent>/, ""), "artifactId");
  return parentArtifact && parentArtifact === candidateArtifact ? candidate : null;
}

/** Effective-ish POM facts: walks local parents and resolves ${property} indirection. */
export function pomFacts(pomFile: string, seen = new Set<string>()): PomFacts {
  if (seen.has(pomFile)) return { props: {}, java: null, boot: null, spring: null };
  seen.add(pomFile);
  const pom = stripXmlComments(read(pomFile));
  const parentFile = localParent(pomFile, pom);
  const inherited = parentFile ? pomFacts(parentFile, seen) : { props: {}, java: null, boot: null, spring: null };
  const props = { ...inherited.props, ...pomProperties(pom) };
  const parent = block(pom, "parent");
  const parentArtifact = tag(parent, "artifactId");
  const parentGroup = tag(parent, "groupId");
  let boot: string | null = null;
  if (parentGroup === "org.springframework.boot" && /^spring-boot-(starter-parent|dependencies)$/.test(parentArtifact ?? "")) {
    boot = tag(parent, "version");
    props["spring-boot.version"] ??= boot ?? "";
  }
  if (!boot) {
    const managed = block(pom, "dependencyManagement");
    const bom = /<artifactId>\s*spring-boot-dependencies\s*<\/artifactId>\s*<version>\s*([^<]+?)\s*<\/version>/.exec(managed);
    if (bom) boot = bom[1];
  }
  if (!boot && props["spring-boot.version"]) boot = props["spring-boot.version"];
  // Explicit compiler-plugin configuration in this POM wins over (inherited) properties.
  const java =
    compilerPluginSetting(pom, "release") ??
    props["maven.compiler.release"] ??
    compilerPluginSetting(pom, "source") ??
    props["maven.compiler.source"] ??
    props["java.version"] ??
    null;
  const springDirect = /<artifactId>\s*spring-(?:core|context|webmvc|framework-bom)\s*<\/artifactId>\s*<version>\s*([^<]+?)\s*<\/version>/.exec(pom);
  const spring = props["spring.version"] ?? props["spring-framework.version"] ?? springDirect?.[1] ?? null;
  return {
    props,
    java: resolveProps(java, props) ?? inherited.java,
    boot: resolveProps(boot, props) ?? inherited.boot,
    spring: resolveProps(spring, props) ?? inherited.spring,
  };
}

export function mavenModules(repoPath: string, relative = "", depth = 0, found: string[] = []): string[] {
  const pomFile = path.join(repoPath, relative, "pom.xml");
  if (!existsSync(pomFile) || depth > 8 || found.includes(relative)) return found;
  found.push(relative);
  const pom = stripXmlComments(read(pomFile));
  for (const match of pom.matchAll(/<module>\s*([^<]+?)\s*<\/module>/g)) {
    const child = toPosix(path.normalize(path.join(relative, match[1].replace(/\/pom\.xml$/, ""))));
    if (child.startsWith("..")) continue;
    mavenModules(repoPath, child, depth + 1, found);
  }
  return found;
}

export function gradleModules(repoPath: string): string[] {
  const modules = [""];
  for (const name of ["settings.gradle", "settings.gradle.kts"]) {
    const text = read(path.join(repoPath, name)).replace(/\/\/.*$/gm, "");
    for (const statement of text.matchAll(/\binclude\b\s*\(?([^\n]*)/g)) {
      for (const quoted of statement[1].matchAll(/["']([^"']+)["']/g)) {
        const relative = quoted[1].replace(/^:/, "").split(":").join("/");
        if (relative && !relative.includes("..") && !modules.includes(relative)) modules.push(relative);
      }
    }
  }
  return modules;
}

function gradleCatalog(repoPath: string): string {
  return read(path.join(repoPath, "gradle", "libs.versions.toml"));
}

export function gradleFacts(buildText: string, catalog: string, gradleProps: string): { java: string | null; boot: string | null; spring: string | null } {
  const first = (patterns: RegExp[], text: string) => {
    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (match) return match[1];
    }
    return null;
  };
  let boot = first(
    [
      /id\s*\(?\s*["']org\.springframework\.boot["']\s*\)?\s*version\s*\(?\s*["']([^"']+)["']/,
      /org\.springframework\.boot:spring-boot-gradle-plugin:([^"'\s)]+)/,
      /org\.springframework\.boot:spring-boot-dependencies:([^"'\s)]+)/,
      /springBootVersion\s*=\s*["']([^"']+)["']/,
    ],
    buildText,
  );
  if (!boot && /alias\s*\(\s*libs\.plugins\.spring\.?boot/i.test(buildText) || (!boot && /org\.springframework\.boot/.test(buildText))) {
    boot = first([/^\s*spring[-_.]?boot\s*=\s*"([^"]+)"/im, /^\s*springBoot\s*=\s*"([^"]+)"/m], catalog) ??
      first([/^\s*spring[-_.]?boot[-_.]?version\s*=\s*(\S+)/im, /^\s*springBootVersion\s*=\s*(\S+)/m], gradleProps);
  }
  const javaRaw = first(
    [
      /JavaLanguageVersion\.of\(\s*["']?(\d+)/,
      /sourceCompatibility\s*=\s*JavaVersion\.VERSION_([\d_]+)/,
      /sourceCompatibility\s*=\s*["']?([\d.]+)/,
      /options\.release\.set\(\s*(\d+)/,
      /\brelease\s*=\s*(\d+)/,
      /jvmTarget\s*=\s*["'](?:JVM_)?([\d.]+)/,
    ],
    buildText,
  );
  const java = javaRaw ? javaRaw.replace(/_/g, ".") : null;
  const spring = first([/org\.springframework:spring-(?:core|context|webmvc):([^"'\s)]+)/, /springVersion\s*=\s*["']([^"']+)["']/], buildText);
  return { java, boot, spring };
}

function walk(dir: string, repoRoot: string, excluded: string[], out: string[], depth = 0): void {
  if (depth > 40) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      const relative = toPosix(path.relative(repoRoot, full));
      if (excluded.some((item) => relative === item || relative.startsWith(`${item}/`))) continue;
      walk(full, repoRoot, excluded, out, depth + 1);
    } else if (entry.isFile()) {
      const inServices = toPosix(dir).endsWith("META-INF/services");
      if (inServices || scanExtensions.has(path.extname(entry.name).toLowerCase())) out.push(full);
    }
  }
}

/** Scan every source/config file for javax and jakarta references (no sampling). */
export function scanJavax(repoPath: string, excluded: string[] = []) {
  const files: string[] = [];
  walk(repoPath, repoPath, excluded, files);
  const javaxFiles: string[] = [];
  const jdkJavaxFiles: string[] = [];
  const jakartaFiles: string[] = [];
  const counts: Record<string, number> = {};
  let scanned = 0;
  for (const file of files) {
    let size = 0;
    try {
      size = statSync(file).size;
    } catch {
      continue;
    }
    if (size > maxFileBytes) continue;
    const relative = toPosix(path.relative(repoPath, file));
    if (relative === "pom.xml" || relative.endsWith("/pom.xml")) {
      // Build files are covered by the dependency checks; javax groupIds there are not source references.
      continue;
    }
    scanned += 1;
    const text = read(file);
    const references = [...text.matchAll(/\bjavax\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*/g)].map((match) => match[0]);
    if (toPosix(path.dirname(file)).endsWith("META-INF/services") && path.basename(file).startsWith("javax.")) {
      references.push(path.basename(file));
    }
    let ee = false;
    let jdk = false;
    for (const reference of references) {
      const family = classifyJavax(reference);
      if (family) {
        ee = true;
        counts[family] = (counts[family] ?? 0) + 1;
      } else {
        jdk = true;
      }
    }
    if (ee) javaxFiles.push(relative);
    else if (jdk) jdkJavaxFiles.push(relative);
    if (/\bjakarta\.[a-z]+/.test(text)) jakartaFiles.push(relative);
  }
  return { javaxFiles, jdkJavaxFiles, jakartaFiles, javaxPackageCounts: counts, filesScanned: scanned };
}

/**
 * Rename every remaining Jakarta EE `javax.` reference to `jakarta.` in the given files
 * (code, comments, strings, XML, properties): what OpenRewrite's type-aware recipe leaves
 * behind (a comment, a string, a class name in a config file) and the checks still count.
 * JDK-owned javax packages (javax.crypto, javax.sql, ...) are never touched. Locked files are skipped.
 */
export function renameJavaxReferences(repoPath: string, files: string[], isLocked?: (file: string) => boolean): Array<{ file: string; references: number }> {
  const edits: Array<{ file: string; references: number }> = [];
  for (const relative of files) {
    if (isLocked?.(relative)) continue;
    const full = path.join(repoPath, relative);
    const text = read(full);
    if (!text) continue;
    let references = 0;
    const next = text.replace(/\bjavax\.([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)/g, (all) => {
      if (!classifyJavax(all)) return all;
      references += 1;
      return `jakarta.${all.slice("javax.".length)}`;
    });
    if (references) {
      writeFileSync(full, next, "utf8");
      edits.push({ file: relative, references });
    }
  }
  return edits;
}

function lowestJava(values: Array<string | null>): string | null {
  let best: string | null = null;
  for (const value of values) {
    if (!value) continue;
    const normalized = normalizeJava(value);
    if (normalized === "unknown") continue;
    if (best === null || Number(normalized) < Number(normalizeJava(best))) best = value;
  }
  return best;
}

export function scanProject(repoPath: string, options: { excludeModules?: string[] } = {}): ScanResult {
  const buildTool = detectBuildTool(repoPath);
  const excluded = (options.excludeModules ?? []).map((item) => item.replace(/\\/g, "/").replace(/\/$/, ""));
  const notes: string[] = [];
  const modules: ModuleInfo[] = [];
  let versionCatalog: string | null = null;
  if (buildTool === "maven") {
    for (const relative of mavenModules(repoPath)) {
      if (excluded.includes(relative)) continue;
      const facts = pomFacts(path.join(repoPath, relative, "pom.xml"));
      modules.push({
        path: relative,
        buildFile: relative ? `${relative}/pom.xml` : "pom.xml",
        javaVersion: facts.java,
        springBootVersion: facts.boot,
        springVersion: facts.spring,
        hasWebXml: existsSync(path.join(repoPath, relative, "src", "main", "webapp", "WEB-INF", "web.xml")),
      });
    }
  } else {
    const catalog = gradleCatalog(repoPath);
    if (catalog) versionCatalog = "gradle/libs.versions.toml";
    const gradleProps = read(path.join(repoPath, "gradle.properties"));
    const rootText = ["build.gradle", "build.gradle.kts"].map((name) => read(path.join(repoPath, name))).join("\n");
    const rootFacts = gradleFacts(rootText, catalog, gradleProps);
    for (const relative of gradleModules(repoPath)) {
      if (excluded.includes(relative)) continue;
      const buildName = ["build.gradle.kts", "build.gradle"].find((name) => existsSync(path.join(repoPath, relative, name)));
      if (!buildName && relative) continue;
      const text = relative ? read(path.join(repoPath, relative, buildName!)) : rootText;
      const facts = relative ? gradleFacts(text, catalog, gradleProps) : rootFacts;
      modules.push({
        path: relative,
        buildFile: relative ? `${relative}/${buildName}` : buildName ?? "settings.gradle",
        javaVersion: facts.java ?? rootFacts.java,
        springBootVersion: facts.boot ?? rootFacts.boot,
        springVersion: facts.spring ?? rootFacts.spring,
        hasWebXml: existsSync(path.join(repoPath, relative, "src", "main", "webapp", "WEB-INF", "web.xml")),
      });
    }
  }
  if (modules.length > 1) notes.push(`Multi-module build with ${modules.length} modules.`);
  if (excluded.length) notes.push(`Excluded modules: ${excluded.join(", ")}.`);
  for (const module of modules) {
    if (module.javaVersion?.includes("${")) notes.push(`${module.buildFile}: Java level ${module.javaVersion} could not be resolved.`);
  }
  const signals = scanJavax(repoPath, excluded);
  const bootVersions = modules.map((item) => item.springBootVersion).filter((item): item is string => Boolean(item));
  const springBootVersion = bootVersions[0] ?? null;
  if (new Set(bootVersions).size > 1) notes.push(`Modules declare different Boot versions: ${[...new Set(bootVersions)].join(", ")}.`);
  const springVersion = modules.map((item) => item.springVersion).find(Boolean) ?? null;
  const webXmlFiles = modules
    .filter((item) => item.hasWebXml)
    .map((item) => (item.path ? `${item.path}/` : "") + "src/main/webapp/WEB-INF/web.xml");
  return {
    repoPath,
    buildTool,
    wrapper: buildLauncher(repoPath, buildTool).wrapper,
    modules,
    javaVersion: lowestJava(modules.map((item) => item.javaVersion)),
    springBootVersion,
    springVersion,
    classicSpring: springBootVersion === null && springVersion !== null,
    hasWebXml: webXmlFiles.length > 0,
    webXmlFiles,
    javaxFiles: signals.javaxFiles,
    javaxPackageCounts: signals.javaxPackageCounts,
    jdkJavaxFiles: signals.jdkJavaxFiles,
    jakartaFiles: signals.jakartaFiles,
    filesScanned: signals.filesScanned,
    versionCatalog,
    notes,
  };
}

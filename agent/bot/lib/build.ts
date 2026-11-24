import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadMatrix } from "./matrix.js";
import { firstFailure, parseArtifactPaths, parseMavenTestTotals, runCommand, type CommandResult, type TestTotals } from "./process.js";
import { assertArtifact, assertRecipe, buildLauncher, type BuildTool } from "./repo.js";

export type ExecOptions = {
  timeoutMs?: number;
  logFile?: string;
  onOutput?: (chunk: string) => void;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
};

const skipDirs = new Set(["node_modules", ".git", ".gradle", ".idea", "src"]);

function findFiles(root: string, accept: (file: string, dir: string) => boolean, depth = 0, out: string[] = []): string[] {
  if (depth > 12 || !existsSync(root)) return out;
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) findFiles(full, accept, depth + 1, out);
    } else if (accept(full, root)) {
      out.push(full);
    }
  }
  return out;
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

/** Remove stale OpenRewrite patches (root and module target/ or build/ folders). */
export function deleteRewritePatches(repoPath: string): number {
  const patches = findFiles(repoPath, (file) => /[\\/](target|build)[\\/](reports[\\/])?rewrite[\\/]rewrite\.patch$/.test(file));
  for (const file of patches) rmSync(file, { force: true });
  return patches.length;
}

export function readRewritePatches(repoPath: string, cap = 400_000): string {
  const patches = findFiles(repoPath, (file) => /[\\/](target|build)[\\/](reports[\\/])?rewrite[\\/]rewrite\.patch$/.test(file));
  const text = patches.map((file) => readFileSync(file, "utf8")).join("\n");
  return text.length <= cap ? text : `${text.slice(0, cap)}\n… patch truncated`;
}

export function changedFilesFromPatch(patch: string): string[] {
  const files = new Set<string>();
  for (const match of patch.matchAll(/^diff --git a\/(.+?) b\//gm)) files.add(match[1]);
  return [...files];
}

/** Gradle init script that applies the OpenRewrite plugin without editing the build. */
const exclusionPattern = /^[A-Za-z0-9_.\/*?-]+$/;

/** Locked-path globs passed to OpenRewrite as exclusions; anything with other characters is refused. */
export function assertExclusions(exclusions: string[]): string[] {
  for (const item of exclusions) {
    if (!exclusionPattern.test(item)) throw new Error(`OpenRewrite exclusion ${JSON.stringify(item)} may only contain letters, digits, _ . / * ? -`);
  }
  return exclusions;
}

export function gradleInitScript(pluginCoordinate: string, artifact: string | string[], recipe: string | string[], exclusions: string[] = []): string {
  const artifacts = [...new Set([artifact].flat())];
  const recipes = [...new Set([recipe].flat())];
  assertArtifact(pluginCoordinate);
  artifacts.forEach(assertArtifact);
  recipes.forEach(assertRecipe);
  assertExclusions(exclusions);
  const excluded = exclusions.map((item) => `\n        exclusion("${item}")`).join("");
  return `initscript {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
    dependencies { classpath("${pluginCoordinate}") }
}
rootProject {
    plugins.apply(org.openrewrite.gradle.RewritePlugin)
    dependencies {${artifacts.map((item) => `\n        rewrite("${item}")`).join("")}
    }
    rewrite {${recipes.map((item) => `\n        activeRecipe("${item}")`).join("")}
        setExportDatatables(false)${excluded}
    }
    afterEvaluate {
        if (repositories.isEmpty()) {
            repositories { mavenCentral() }
        }
    }
}
`;
}

export type RecipeRun = {
  mode: "dryRun" | "run";
  artifact: string;
  recipe: string;
  result: CommandResult;
  patch: string;
  changedFiles: string[];
};

/**
 * Run OpenRewrite recipes in ONE build invocation. Stale rewrite.patch files are
 * deleted first so a result can never report an earlier recipe's changes. No forced -U.
 *
 * Several recipes belong in one invocation: the plugin parses the project's original
 * sources once, so a later recipe never has to compile a project an earlier recipe
 * already moved to the target versions (which cannot compile until the code is migrated).
 * `noFork` (Maven's rewrite:runNoFork) skips the compile lifecycle the plain goal forks.
 */
export async function runRecipes(
  repoPath: string,
  buildTool: BuildTool,
  steps: Array<{ artifact: string; recipe: string }>,
  mode: "dryRun" | "run",
  options: ExecOptions & { exclusions?: string[]; noFork?: boolean } = {},
): Promise<RecipeRun> {
  const artifacts = [...new Set(steps.map((step) => assertArtifact(step.artifact)))];
  const recipes = [...new Set(steps.map((step) => assertRecipe(step.recipe)))];
  if (!recipes.length) throw new Error("No recipe to run.");
  const { exclusions: rawExclusions = [], noFork = false, ...execOptions } = options;
  const exclusions = assertExclusions(rawExclusions);
  const matrix = loadMatrix();
  deleteRewritePatches(repoPath);
  const launcher = buildLauncher(repoPath, buildTool);
  let result: CommandResult;
  if (buildTool === "maven") {
    result = await runCommand(
      launcher.command,
      [
        ...launcher.prefixArgs,
        "-B",
        `${matrix.plugin}:${noFork ? (mode === "dryRun" ? "dryRunNoFork" : "runNoFork") : mode}`,
        `-Drewrite.recipeArtifactCoordinates=${artifacts.join(",")}`,
        `-Drewrite.activeRecipes=${recipes.join(",")}`,
        "-Drewrite.exportDatatables=false",
        ...(exclusions.length ? [`-Drewrite.exclusions=${exclusions.join(",")}`] : []),
        "-DskipTests",
      ],
      { cwd: repoPath, ...execOptions },
    );
  } else {
    const dir = mkdtempSync(path.join(os.tmpdir(), "leapfrog-rewrite-"));
    const script = path.join(dir, "rewrite.init.gradle");
    writeFileSync(script, gradleInitScript(matrix.gradlePlugin, artifacts, recipes, exclusions), "utf8");
    try {
      result = await runCommand(
        launcher.command,
        [...launcher.prefixArgs, "--no-daemon", "--console=plain", "--init-script", script, mode === "dryRun" ? "rewriteDryRun" : "rewriteRun"],
        { cwd: repoPath, ...execOptions },
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const patch = mode === "dryRun" ? readRewritePatches(repoPath) : "";
  return { mode, artifact: artifacts.join(","), recipe: recipes.join(","), result, patch, changedFiles: changedFilesFromPatch(patch) };
}

/** Run one OpenRewrite recipe (see runRecipes). */
export async function runRecipe(
  repoPath: string,
  buildTool: BuildTool,
  artifact: string,
  recipe: string,
  mode: "dryRun" | "run",
  options: ExecOptions & { exclusions?: string[]; noFork?: boolean } = {},
): Promise<RecipeRun> {
  return runRecipes(repoPath, buildTool, [{ artifact, recipe }], mode, options);
}

export type TestReport = TestTotals & { testSets: string[]; source: "junit-xml" | "console" | "none" };

/** Sum JUnit XML reports (Surefire, Failsafe, Gradle) written at or after `since`. */
export function readJUnitReports(repoPath: string, since = 0): TestReport | null {
  const files = findFiles(repoPath, (file) =>
    /[\\/]TEST-[^\\/]+\.xml$/.test(file) &&
    /[\\/](surefire-reports|failsafe-reports|test-results)[\\/]/.test(file),
  ).filter((file) => {
    try {
      return statSync(file).mtimeMs >= since - 1000;
    } catch {
      return false;
    }
  });
  if (!files.length) return null;
  const report: TestReport = { testsRun: 0, failures: 0, errors: 0, skipped: 0, testSets: [], source: "junit-xml" };
  for (const file of files) {
    const head = readFileSync(file, "utf8").slice(0, 4000);
    const suite = /<testsuite\b([^>]*)>/.exec(head);
    if (!suite) continue;
    const attr = (name: string) => Number(new RegExp(`\\b${name}="(\\d+)"`).exec(suite[1])?.[1] ?? 0);
    report.testsRun += attr("tests");
    report.failures += attr("failures");
    report.errors += attr("errors");
    report.skipped += attr("skipped");
    const name = /\bname="([^"]+)"/.exec(suite[1])?.[1];
    if (name) report.testSets.push(name);
  }
  report.testSets.sort();
  return report;
}

export type BuildRun = {
  goal: "test" | "package";
  buildTool: BuildTool;
  wrapper: boolean;
  result: CommandResult;
  tests: TestReport | null;
  artifacts: string[];
  failure: string;
};

/**
 * Build tool arguments. The test goal always starts from `clean`: earlier steps (OpenRewrite) compile the
 * project against the OLD build, and unchanged sources (e.g. locked files) would otherwise be skipped as
 * "up to date" and never compiled against the migrated dependencies, so the run would pass on stale classes.
 */
export function buildArgs(buildTool: BuildTool, prefixArgs: string[], goal: "test" | "package"): string[] {
  const clean = goal === "test" ? ["clean"] : [];
  return buildTool === "maven"
    ? [...prefixArgs, "-B", ...clean, goal, ...(goal === "package" ? ["-DskipTests"] : [])]
    : [...prefixArgs, "--no-daemon", "--console=plain", ...clean, goal === "test" ? "test" : "assemble"];
}

export async function runBuild(
  repoPath: string,
  buildTool: BuildTool,
  goal: "test" | "package",
  options: ExecOptions & { skipTests?: boolean } = {},
): Promise<BuildRun> {
  const launcher = buildLauncher(repoPath, buildTool);
  const started = Date.now();
  const args = buildArgs(buildTool, launcher.prefixArgs, goal);
  const result = await runCommand(launcher.command, args, { cwd: repoPath, ...options });
  let tests: TestReport | null = null;
  if (goal === "test") {
    tests = readJUnitReports(repoPath, started);
    if (!tests) {
      const fromConsole = parseMavenTestTotals(result.output);
      tests = fromConsole ? { ...fromConsole, testSets: [], source: "console" } : null;
    }
  }
  const artifacts =
    goal === "package"
      ? buildTool === "maven"
        ? parseArtifactPaths(result.output)
        : findFiles(repoPath, (file) => /[\\/]build[\\/]libs[\\/][^\\/]+\.(jar|war)$/.test(file))
      : [];
  return {
    goal,
    buildTool,
    wrapper: launcher.wrapper,
    result,
    tests,
    artifacts: artifacts.map((item) => (path.isAbsolute(item) ? item : path.join(repoPath, item))),
    failure: result.ok ? "" : firstFailure(result.output),
  };
}

/** Preflight: Java major on PATH/JAVA_HOME, build tool launcher, git. */
export async function preflight(repoPath: string, buildTool: BuildTool, options: { needGit: boolean; env?: NodeJS.ProcessEnv }) {
  const javaHome = (options.env ?? process.env).JAVA_HOME;
  const javaCommand = javaHome
    ? path.join(javaHome, "bin", process.platform === "win32" ? "java.exe" : "java")
    : "java";
  const java = await runCommand(javaCommand, ["-version"], { cwd: repoPath, timeoutMs: 60_000, env: options.env });
  const versionMatch = /version "(\d+)(?:\.(\d+))?/.exec(java.output);
  const javaMajor = versionMatch ? (versionMatch[1] === "1" ? Number(versionMatch[2]) : Number(versionMatch[1])) : null;
  const launcher = buildLauncher(repoPath, buildTool);
  const tool = await runCommand(launcher.command, [...launcher.prefixArgs, buildTool === "maven" ? "-v" : "--version"], {
    cwd: repoPath,
    timeoutMs: 180_000,
    env: options.env,
  });
  const git = options.needGit ? await runCommand("git", ["--version"], { cwd: repoPath, timeoutMs: 30_000 }) : null;
  return {
    javaMajor,
    javaOk: java.ok,
    javaOutput: java.output.trim().split(/\r?\n/)[0] ?? "",
    buildToolOk: tool.ok,
    buildToolCommand: tool.command,
    buildToolOutput: tool.output.trim().split(/\r?\n/).slice(0, 3).join("\n"),
    wrapper: launcher.wrapper,
    gitOk: git ? git.ok : null,
    log: [java.command, java.output.trim(), tool.command, tool.output.trim(), git ? `${git.command}\n${git.output.trim()}` : ""]
      .filter(Boolean)
      .join("\n"),
  };
}

export function relativeTo(repoPath: string, file: string): string {
  return toPosix(path.relative(repoPath, file));
}

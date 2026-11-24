import { existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { allowedRoots, dataDir } from "./config.js";

const recipeName = /^[A-Za-z0-9_.]+$/;
const recipeArtifact = /^[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+$/;

export function assertRecipe(name: string): string {
  if (!recipeName.test(name)) throw new Error("Recipe name must be letters, numbers, dots, or underscores.");
  return name;
}

export function assertArtifact(coordinate: string): string {
  if (!recipeArtifact.test(coordinate)) throw new Error("Recipe artifact must look like group:artifact:version.");
  return coordinate;
}

/** Folders that are temporarily allowed (dry-run work copies created by the pipeline). */
const extraRoots = new Set<string>();

export function registerWorkRoot(dir: string): () => void {
  const real = safeRealpath(dir);
  extraRoots.add(real);
  return () => extraRoots.delete(real);
}

export function safeRealpath(target: string): string {
  try {
    return realpathSync.native(path.resolve(target));
  } catch {
    return path.resolve(target);
  }
}

function samePathCase(a: string, b: string): boolean {
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** True when `child` is `root` or inside it (after resolving symlinks). */
export function isInside(root: string, child: string): boolean {
  const relative = path.relative(root, child);
  if (relative === "") return true;
  if (process.platform === "win32" && samePathCase(root, child)) return true;
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function effectiveRoots(): string[] {
  // data/repos holds GitHub clones made by Verdigrade itself, so it is always allowed.
  return [...allowedRoots().map(safeRealpath), safeRealpath(path.join(dataDir(), "repos")), ...extraRoots];
}

/** Throw unless the path (symlinks resolved) is inside one of the configured roots. */
export function assertAllowedPath(target: string): string {
  const real = safeRealpath(target);
  const roots = effectiveRoots();
  if (!roots.some((root) => isInside(root, real))) {
    throw new Error(
      `Path is outside the allowed roots: ${real}. Set VERDIGRADE_ROOTS to allow it (current roots: ${allowedRoots().join(path.delimiter)}).`,
    );
  }
  return real;
}

export async function assertRepo(repoPath: string): Promise<string> {
  const resolved = path.resolve(repoPath);
  if (!existsSync(resolved)) throw new Error(`Repository path does not exist: ${resolved}`);
  if (!statSync(resolved).isDirectory()) throw new Error(`Repository path is not a directory: ${resolved}`);
  return assertAllowedPath(resolved);
}

export type BuildTool = "maven" | "gradle";

export function detectBuildTool(repoPath: string): BuildTool {
  if (existsSync(path.join(repoPath, "pom.xml"))) return "maven";
  for (const name of ["build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"]) {
    if (existsSync(path.join(repoPath, name))) return "gradle";
  }
  throw new Error("No pom.xml or build.gradle(.kts) found in the repository root.");
}

/**
 * Resolve the build launcher, preferring the project's wrapper (mvnw / gradlew).
 * On POSIX the wrapper runs through `sh` so a missing exec bit (common for repos
 * checked out on Windows) does not matter.
 */
export function buildLauncher(repoPath: string, tool: BuildTool, platform: NodeJS.Platform = process.platform): {
  command: string;
  prefixArgs: string[];
  wrapper: boolean;
} {
  const windows = platform === "win32";
  const [unixWrapper, windowsWrapper, globalUnix, globalWindows] =
    tool === "maven" ? ["mvnw", "mvnw.cmd", "mvn", "mvn.cmd"] : ["gradlew", "gradlew.bat", "gradle", "gradle.bat"];
  if (windows && existsSync(path.join(repoPath, windowsWrapper))) {
    return { command: path.join(repoPath, windowsWrapper), prefixArgs: [], wrapper: true };
  }
  if (!windows && existsSync(path.join(repoPath, unixWrapper))) {
    return { command: "sh", prefixArgs: [path.join(repoPath, unixWrapper)], wrapper: true };
  }
  return { command: windows ? globalWindows : globalUnix, prefixArgs: [], wrapper: false };
}

import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { lockedReason } from "./locks.js";
import { isInside } from "./repo.js";

const maxFileBytes = 200_000;
const maxPatchChars = 40_000;

/** Is this a Node project (package.json and no Maven/Gradle build)? Widens the allowlist to Node build files and test folders. */
export function isNodeRepo(repoRoot: string): boolean {
  return (
    existsSync(path.join(repoRoot, "package.json")) &&
    !["pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"].some((name) => existsSync(path.join(repoRoot, name)))
  );
}

export type RepoEcosystem = "java" | "node" | "python";

const javaBuildFiles = ["pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"];
const pythonMetadata = ["pyproject.toml", "setup.py", "setup.cfg", "Pipfile", "manage.py"];

function isPythonRepo(repoRoot: string): boolean {
  if (pythonMetadata.some((name) => existsSync(path.join(repoRoot, name)))) return true;
  try {
    return readdirSync(repoRoot).some((name) => /^requirements[\w.-]*\.txt$/i.test(name));
  } catch {
    return false;
  }
}

/** Same precedence as detectEcosystem (adapters/index.ts), without importing the adapters. */
export function repoEcosystem(repoRoot: string): RepoEcosystem {
  if (javaBuildFiles.some((name) => existsSync(path.join(repoRoot, name)))) return "java";
  const python = isPythonRepo(repoRoot);
  if (existsSync(path.join(repoRoot, "package.json"))) {
    return python && ["pyproject.toml", "setup.py", "manage.py"].some((name) => existsSync(path.join(repoRoot, name))) ? "python" : "node";
  }
  return python ? "python" : "java";
}

/**
 * Relative paths the model may edit: build files (any module) and anything under a module's src/.
 * Node projects also allow package.json, tsconfig*.json, .nvmrc and test/, tests/, __tests__/.
 * Python projects allow any .py file plus the dependency and version files,
 * but never anything inside a virtual environment or bytecode cache.
 */
export function isAllowedRelative(filePath: string, ecosystem: RepoEcosystem = "java"): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  if (!normalized || path.isAbsolute(filePath) || path.win32.isAbsolute(filePath) || /^[A-Za-z]:/.test(normalized)) return false;
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === "." || part === "")) return false;
  if (parts.some((part) => part === ".git" || part === "target" || part === "node_modules")) return false;
  const name = parts[parts.length - 1];
  if (ecosystem === "python") {
    if (parts.some((part) => /^(\.?venv|env|__pycache__|site-packages|\.tox|\.nox|\.eggs|build|dist)$/.test(part) || part.endsWith(".egg-info"))) return false;
    if (/^(requirements[\w.-]*\.txt|constraints[\w.-]*\.txt|pyproject\.toml|setup\.(py|cfg)|Pipfile|\.python-version|runtime\.txt|tox\.ini|pytest\.ini)$/i.test(name)) return true;
    return /\.pyi?$/.test(name);
  }
  if (/^(pom\.xml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?|gradle\.properties|libs\.versions\.toml)$/.test(name)) return true;
  if (ecosystem === "node") {
    if (parts.some((part) => part === "dist" || part === "coverage")) return false;
    if (/^(package\.json|tsconfig(\.[\w-]+)?\.json|\.nvmrc|\.node-version)$/.test(name)) return true;
    if (parts.some((part) => part === "test" || part === "tests" || part === "__tests__")) return true;
  }
  return parts.includes("src");
}

export function looksSecret(filePath: string, text: string): boolean {
  const name = filePath.toLowerCase();
  if (/(^|\/)\.env|secret|credential|\.pem$|\.key$|\.p12$|\.jks$|keystore/.test(name)) return true;
  return /BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}/.test(text);
}

export type PatchResult = { ok: boolean; filePath: string; changed: boolean; error?: string };

/**
 * Replace one exact, unique text span. Fails when the span is missing or
 * ambiguous (appears more than once), so the model cannot accidentally edit
 * the wrong occurrence. Symlinks that leave the repository are refused.
 */
export function applyTextPatch(repoRoot: string, filePath: string, oldText: string, newText: string): PatchResult {
  const relative = filePath.replace(/\\/g, "/");
  const fail = (error: string): PatchResult => ({ ok: false, filePath: relative, changed: false, error });
  if (!isAllowedRelative(relative, repoEcosystem(repoRoot))) return fail("File path is not allowlisted. Use a build file or a path under src/ (Python: any .py file or dependency file).");
  const locked = lockedReason(repoRoot, relative);
  if (locked) return fail(locked);
  if (oldText.length > maxPatchChars || newText.length > maxPatchChars) return fail("Patch text exceeds the size cap.");
  const absolute = path.resolve(repoRoot, relative);
  if (!isInside(repoRoot, absolute)) return fail("Resolved path left the repository.");
  if (!existsSync(absolute)) return fail("File does not exist.");
  let real: string;
  try {
    real = realpathSync.native(absolute);
  } catch {
    return fail("File could not be resolved.");
  }
  const realRoot = realpathSync.native(repoRoot);
  if (!isInside(realRoot, real) || lstatSync(absolute).isSymbolicLink()) return fail("Refusing to follow a symlink.");
  const text = readFileSync(real, "utf8");
  if (Buffer.byteLength(text, "utf8") > maxFileBytes) return fail("File exceeds the size cap.");
  if (looksSecret(relative, text) || looksSecret(relative, newText)) return fail("Refusing to edit a secrets-looking file.");
  const first = text.indexOf(oldText);
  if (first < 0) return fail("oldText was not found in the file.");
  if (text.indexOf(oldText, first + 1) >= 0) return fail("oldText appears more than once; include more surrounding lines so it is unique.");
  const next = text.slice(0, first) + newText + text.slice(first + oldText.length);
  if (next === text) return { ok: true, filePath: relative, changed: false };
  writeFileSync(real, next, "utf8");
  return { ok: true, filePath: relative, changed: true };
}

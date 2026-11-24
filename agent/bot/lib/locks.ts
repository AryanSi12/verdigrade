import path from "node:path";
import { safeRealpath } from "./repo.js";

/**
 * Locked paths: files or folders an approved plan says the pipeline must not
 * change. Patterns are repository-relative and "/"-separated:
 *   - "src/main/resources/application.properties"  one file
 *   - "db/migration" or "db/migration/"            a folder and everything in it
 *   - "**\/*.sql", "src/**\/Legacy*.java"           globs (* within a segment, ** across segments, ? one char)
 */
export type LockSet = {
  patterns: string[];
  isLocked(relative: string): boolean;
  /** The first pattern that locks the path (for messages), or null. */
  match(relative: string): string | null;
};

export function normalizeRelative(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/{2,}/g, "/")
    .trim();
}

/** Validate a user-supplied lock pattern. Returns an error message or null. */
export function lockPatternError(pattern: string): string | null {
  const value = normalizeRelative(pattern);
  if (!value) return "Pattern is empty.";
  if (value.length > 300) return "Pattern is too long.";
  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z]:/.test(value)) return "Use a path relative to the project root.";
  if (value.split("/").some((part) => part === "..")) return "Pattern may not contain '..'.";
  if (/[\0\r\n]/.test(value)) return "Pattern contains control characters.";
  return null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

/** Glob → RegExp over a "/"-separated relative path. */
export function globToRegExp(pattern: string): RegExp {
  let value = normalizeRelative(pattern);
  const folder = value.endsWith("/");
  if (folder) value = value.slice(0, -1);
  let out = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "*") {
      if (value[index + 1] === "*") {
        const slashAfter = value[index + 2] === "/";
        out += slashAfter ? "(?:.*/)?" : ".*";
        index += slashAfter ? 2 : 1;
      } else {
        out += "[^/]*";
      }
    } else if (char === "?") {
      out += "[^/]";
    } else {
      out += escapeRegex(char);
    }
  }
  // A pattern also locks everything below it (a folder, or a glob that names folders).
  return new RegExp(`^${out}(?:/.*)?$`, process.platform === "win32" ? "i" : "");
}

export function createLockSet(patterns: string[]): LockSet {
  const cleaned = [...new Set(patterns.map(normalizeRelative).filter((item) => item && !lockPatternError(item)))];
  const compiled = cleaned.map((pattern) => ({ pattern, regex: globToRegExp(pattern) }));
  const match = (relative: string) => {
    const value = normalizeRelative(relative);
    return compiled.find((item) => item.regex.test(value))?.pattern ?? null;
  };
  return { patterns: cleaned, match, isLocked: (relative) => match(relative) !== null };
}

export const emptyLocks: LockSet = createLockSet([]);

/**
 * Locks for folders a pipeline run is working on, so the model's write tools
 * (apply_text_patch, run_openrewrite) can refuse locked paths. Keyed by the
 * real path of the work folder (the dry-run copy or the repository).
 */
const registry = new Map<string, LockSet>();

function key(dir: string): string {
  const real = safeRealpath(dir);
  return process.platform === "win32" ? real.toLowerCase() : real;
}

export function registerLocks(workRoot: string, locks: LockSet): () => void {
  if (!locks.patterns.length) return () => {};
  const id = key(workRoot);
  registry.set(id, locks);
  return () => {
    if (registry.get(id) === locks) registry.delete(id);
  };
}

/** The locks that apply to `dir` (the folder itself or any registered folder above it). */
export function locksFor(dir: string): { root: string; locks: LockSet } | null {
  const target = key(dir);
  for (const [root, locks] of registry) {
    const relative = path.relative(root, target);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return { root, locks };
  }
  return null;
}

/** Error message when `relative` (inside `repoRoot`) is locked by the active run, else null. */
export function lockedReason(repoRoot: string, relative: string): string | null {
  const found = locksFor(repoRoot);
  if (!found) return null;
  const prefix = normalizeRelative(path.relative(found.root, key(repoRoot)));
  const full = prefix ? `${prefix}/${normalizeRelative(relative)}` : normalizeRelative(relative);
  const pattern = found.locks.match(full);
  return pattern ? `${full} is locked by the approved migration plan (${pattern}); leave it for a human.` : null;
}

/** Locked patterns as rewrite-tool exclusion globs (a plain path also excludes everything below it). */
export function rewriteExclusionGlobs(patterns: string[]): string[] {
  return patterns
    .flatMap((pattern) => (/[*?]/.test(pattern) ? [pattern] : [pattern, `${pattern.replace(/\/$/, "")}/**`]))
    .filter((pattern) => /^[A-Za-z0-9_.\/*?-]+$/.test(pattern));
}

import { existsSync } from "node:fs";
import path from "node:path";
import { ecosystems, type Ecosystem } from "../types.js";
import { javaAdapter } from "./java.js";
import { nodeAdapter } from "./node.js";
import { pythonAdapter } from "./python.js";
import type { LanguageAdapter } from "./types.js";

/**
 * Registered language adapters, in detection priority order. Java comes first:
 * a Maven/Gradle project that also has a package.json (frontend tooling) is a
 * Java project. A folder that looks like both Node and Python is Python when it
 * has Python project metadata (pyproject.toml, setup.py or manage.py: a Django
 * app with frontend tooling), otherwise Node. Add a new adapter here (see
 * docs/adapters.md).
 */
export const adapters: LanguageAdapter[] = [javaAdapter, nodeAdapter, pythonAdapter];

const pythonMarkers = ["pyproject.toml", "setup.py", "manage.py"];

export function isEcosystem(value: unknown): value is Ecosystem {
  return typeof value === "string" && (ecosystems as string[]).includes(value);
}

export function getAdapter(ecosystem: Ecosystem): LanguageAdapter {
  const found = adapters.find((adapter) => adapter.id === ecosystem);
  if (!found) throw new Error(`No adapter for ${ecosystem}.`);
  return found;
}

/** First adapter that recognises the folder, or null. */
export function detectEcosystem(repoPath: string): Ecosystem | null {
  if (!existsSync(repoPath)) return null;
  const found = detectAll(repoPath);
  if (found.includes("node") && found.includes("python") && !found.includes("java")) {
    return pythonMarkers.some((name) => existsSync(path.join(repoPath, name))) ? "python" : "node";
  }
  return found[0] ?? null;
}

/** Every ecosystem the folder looks like (e.g. a Spring app with a package.json for its frontend). */
export function detectAll(repoPath: string): Ecosystem[] {
  return adapters.filter((adapter) => adapter.detect(repoPath)).map((adapter) => adapter.id);
}

/** The adapter for a run: the explicit choice when given (it must match the folder), else detection. */
export function adapterFor(repoPath: string, explicit?: string | null): LanguageAdapter {
  if (explicit) {
    if (!isEcosystem(explicit)) throw new Error(`Unknown ecosystem "${explicit}". Use one of: ${ecosystems.join(", ")}.`);
    const adapter = getAdapter(explicit);
    if (!adapter.detect(repoPath)) {
      throw new Error(`${path.basename(repoPath)} does not look like a ${adapter.label} project.`);
    }
    return adapter;
  }
  const found = detectEcosystem(repoPath);
  if (!found) {
    throw new Error(`No supported project found in ${repoPath}: expected pom.xml / build.gradle(.kts) (Java), package.json (Node) or pyproject.toml / requirements*.txt / setup.py / setup.cfg / Pipfile (Python).`);
  }
  return getAdapter(found);
}

export { javaAdapter, nodeAdapter, pythonAdapter };
export type { LanguageAdapter };

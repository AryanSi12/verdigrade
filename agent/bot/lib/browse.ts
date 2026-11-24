import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { allowedRoots } from "./config.js";
import { repoEcosystem } from "./patch.js";
import { assertAllowedPath } from "./repo.js";

export type BrowseEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  hasPom: boolean;
  buildTool: "maven" | "gradle" | "npm" | "pip" | null;
  /** Detected ecosystem (Java wins when a folder has both a pom/gradle file and a package.json). */
  ecosystem: "java" | "node" | "python" | null;
};

export type BrowseResult = {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
  roots: string[];
};

function buildToolOf(dir: string): "maven" | "gradle" | "npm" | "pip" | null {
  if (existsSync(path.join(dir, "pom.xml"))) return "maven";
  if (["build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"].some((name) => existsSync(path.join(dir, name)))) return "gradle";
  if (hasPythonMarker(dir) && repoEcosystem(dir) === "python") return "pip";
  if (existsSync(path.join(dir, "package.json"))) return "npm";
  return null;
}

function hasPythonMarker(dir: string): boolean {
  return ["pyproject.toml", "setup.py", "setup.cfg", "Pipfile", "manage.py"].some((name) => existsSync(path.join(dir, name))) || safeList(dir).some((name) => /^requirements[\w.-]*\.txt$/i.test(name));
}

function safeList(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function ecosystemOf(tool: ReturnType<typeof buildToolOf>): BrowseEntry["ecosystem"] {
  return tool === "npm" ? "node" : tool === "pip" ? "python" : tool ? "java" : null;
}

const hidden = new Set(["node_modules", ".git", "target", "build", ".gradle", ".idea", ".vscode", ".venv", "venv", "__pycache__", ".tox", "$RECYCLE.BIN", "System Volume Information"]);

/**
 * Browse folders, limited to the configured roots (VERDIGRADE_ROOTS).
 * An empty path lists the roots themselves; "Up" stops at a root.
 */
export function browsePath(requested = ""): BrowseResult {
  const roots = allowedRoots().filter((root) => existsSync(root));
  const trimmed = requested.trim();
  if (!trimmed) {
    return {
      path: "",
      parent: null,
      roots,
      entries: roots.map((root) => ({
        name: root,
        path: root,
        isDirectory: true,
        hasPom: buildToolOf(root) === "maven",
        buildTool: buildToolOf(root),
        ecosystem: ecosystemOf(buildToolOf(root)),
      })),
    };
  }
  const resolved = assertAllowedPath(path.resolve(trimmed));
  if (!statSync(resolved).isDirectory()) throw new Error(`Not a directory: ${resolved}`);
  const isRoot = roots.some((root) => path.resolve(root) === resolved);
  const parentDir = path.dirname(resolved);
  let parent: string | null = null;
  if (!isRoot && parentDir !== resolved) {
    try {
      parent = assertAllowedPath(parentDir);
    } catch {
      parent = "";
    }
  } else {
    parent = "";
  }
  const entries: BrowseEntry[] = [];
  for (const name of readdirSync(resolved)) {
    if (hidden.has(name) || name.startsWith(".")) continue;
    const full = path.join(resolved, name);
    try {
      if (!statSync(full).isDirectory()) continue;
    } catch {
      continue;
    }
    const tool = buildToolOf(full);
    entries.push({ name, path: full, isDirectory: true, hasPom: tool === "maven", buildTool: tool, ecosystem: ecosystemOf(tool) });
  }
  entries.sort((a, b) => {
    if (Boolean(a.buildTool) !== Boolean(b.buildTool)) return a.buildTool ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return { path: resolved, parent, roots, entries: entries.slice(0, 400) };
}

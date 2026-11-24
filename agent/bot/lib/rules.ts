import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ModernizerRules } from "./matrix.js";

export type RuleEdit = {
  file: string;
  rule: string;
  detail: string;
  applied: boolean;
};

type TextEdit = { text: string; changed: boolean; notes: string[] };

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// .properties

function propertiesKeyPattern(key: string): RegExp {
  // Anchored whole key: "logging.file" never matches "logging.file.name" or "xlogging.file".
  return new RegExp(`^(\\s*)${escapeRegex(key)}(\\s*[=:]|\\s+(?=\\S)|\\s*$)`);
}

function isPropertiesComment(line: string): boolean {
  return /^\s*[#!]/.test(line);
}

export function renamePropertiesKey(text: string, from: string, to: string): TextEdit {
  const lines = text.split(/(?<=\n)/);
  const fromPattern = propertiesKeyPattern(from);
  const toPattern = propertiesKeyPattern(to);
  if (lines.some((line) => !isPropertiesComment(line) && toPattern.test(line)) && lines.some((line) => !isPropertiesComment(line) && fromPattern.test(line))) {
    return { text, changed: false, notes: [`both ${from} and ${to} are set; left ${from} for a manual decision`] };
  }
  let changed = false;
  const next = lines.map((line) => {
    if (isPropertiesComment(line) || !fromPattern.test(line)) return line;
    changed = true;
    return line.replace(fromPattern, (_whole, indent: string, separator: string) => `${indent}${to}${separator}`);
  });
  return { text: next.join(""), changed, notes: [] };
}

export function removePropertiesKey(text: string, key: string): TextEdit {
  const lines = text.split(/(?<=\n)/);
  const pattern = propertiesKeyPattern(key);
  const out: string[] = [];
  let changed = false;
  let skippingContinuation = false;
  for (const line of lines) {
    if (skippingContinuation) {
      skippingContinuation = /\\\r?\n?$/.test(line);
      continue;
    }
    if (!isPropertiesComment(line) && pattern.test(line)) {
      changed = true;
      skippingContinuation = /\\\r?\n?$/.test(line);
      continue;
    }
    out.push(line);
  }
  return { text: out.join(""), changed, notes: [] };
}

// ---------------------------------------------------------------------------
// YAML (line based, formatting preserving; handles nested and dotted keys,
// multiple documents, comments and block scalars)

type YamlEntry = {
  line: number;
  indent: number;
  /** Full dotted path of this key. */
  path: string;
  /** Path of the parent mapping ("" at document root). */
  parentPath: string;
  /** The key exactly as written (may itself be dotted). */
  key: string;
  hasValue: boolean;
  doc: number;
};

const yamlKeyLine = /^(\s*)(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_][A-Za-z0-9_.\-[\]]*))\s*:(?:\s+(.*?))?\s*$/;

function parseYaml(lines: string[]): { entries: YamlEntry[]; docEnds: number[] } {
  const entries: YamlEntry[] = [];
  const docEnds: number[] = [];
  let stack: Array<{ indent: number; path: string }> = [];
  let doc = 0;
  let blockIndent: number | null = null;
  lines.forEach((raw, index) => {
    const line = raw.replace(/\r?\n$/, "");
    if (/^---\s*$/.test(line) || /^\.\.\.\s*$/.test(line)) {
      docEnds[doc] = index;
      doc += 1;
      stack = [];
      blockIndent = null;
      return;
    }
    if (!line.trim() || /^\s*#/.test(line)) return;
    const indent = line.length - line.trimStart().length;
    if (blockIndent !== null) {
      if (indent > blockIndent) return;
      blockIndent = null;
    }
    if (/^\s*-(\s|$)/.test(line)) {
      // Sequence item: keep it out of the key paths.
      while (stack.length && stack[stack.length - 1].indent >= indent + 1) stack.pop();
      return;
    }
    const match = yamlKeyLine.exec(line);
    if (!match) return;
    const key = match[2] ?? match[3] ?? match[4];
    const value = (match[5] ?? "").replace(/\s+#.*$/, "");
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parentPath = stack.length ? stack[stack.length - 1].path : "";
    const full = parentPath ? `${parentPath}.${key}` : key;
    const hasValue = value !== "";
    entries.push({ line: index, indent, path: full, parentPath, key, hasValue, doc });
    if (/^[|>][-+0-9]*$/.test(value)) blockIndent = indent;
    else if (!hasValue) stack.push({ indent, path: full });
  });
  docEnds[doc] = lines.length;
  return { entries, docEnds };
}

function hasChildren(lines: string[], entry: YamlEntry, removed: Set<number>): boolean {
  for (let index = entry.line + 1; index < lines.length; index += 1) {
    if (removed.has(index)) continue;
    const line = lines[index].replace(/\r?\n$/, "");
    if (/^---\s*$/.test(line)) return false;
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const indent = line.length - line.trimStart().length;
    return indent > entry.indent;
  }
  return false;
}

/** Remove parents that became empty because their only child line was removed. */
function pruneEmptyParents(lines: string[], entries: YamlEntry[], removed: Set<number>, keep: Set<number> = new Set()): void {
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (const entry of entries) {
      if (entry.hasValue || removed.has(entry.line) || keep.has(entry.line)) continue;
      if (!hasChildren(lines, entry, removed)) {
        removed.add(entry.line);
        pruned = true;
      }
    }
  }
}

function eol(lines: string[]): string {
  return lines.find((line) => line.endsWith("\r\n")) ? "\r\n" : "\n";
}

export function renameYamlKey(text: string, from: string, to: string): TextEdit {
  const lines = text.split(/(?<=\n)/);
  const { entries, docEnds } = parseYaml(lines);
  const notes: string[] = [];
  const removed = new Set<number>();
  const appends = new Map<number, string[]>();
  const inserts = new Map<number, string[]>();
  let changed = false;
  for (const entry of entries) {
    if (entry.path !== from || !entry.hasValue) continue;
    const docHasTarget = entries.some((other) => other.doc === entry.doc && (other.path === to || other.path.startsWith(`${to}.`)));
    if (docHasTarget) {
      notes.push(`both ${from} and ${to} are set; left ${from} for a manual decision`);
      continue;
    }
    const raw = lines[entry.line];
    const valuePart = raw.slice(raw.indexOf(":", raw.indexOf(entry.key) + entry.key.length));
    if (!entry.parentPath || to.startsWith(`${entry.parentPath}.`)) {
      const newKey = entry.parentPath ? to.slice(entry.parentPath.length + 1) : to;
      lines[entry.line] = `${" ".repeat(entry.indent)}${newKey}${valuePart}`;
    } else {
      removed.add(entry.line);
      // Re-home the key under the deepest existing mapping that is an ancestor of the new key.
      const ancestor = entries
        .filter((other) => other.doc === entry.doc && !other.hasValue && to.startsWith(`${other.path}.`))
        .sort((a, b) => b.path.length - a.path.length)[0];
      const value = valuePart.replace(/\r?\n$/, "");
      if (ancestor) {
        const child = entries.find((other) => other.line > ancestor.line && other.indent > ancestor.indent);
        const indent = child ? child.indent : ancestor.indent + 2;
        const list = inserts.get(ancestor.line) ?? [];
        list.push(`${" ".repeat(indent)}${to.slice(ancestor.path.length + 1)}${value}`);
        inserts.set(ancestor.line, list);
      } else {
        const list = appends.get(entry.doc) ?? [];
        list.push(`${to}${value}`);
        appends.set(entry.doc, list);
      }
    }
    changed = true;
  }
  if (!changed) return { text, changed: false, notes };
  pruneEmptyParents(lines, entries, removed, new Set(inserts.keys()));
  const newline = eol(lines);
  const out: string[] = [];
  lines.forEach((line, index) => {
    for (const [doc, extra] of appends) {
      if (docEnds[doc] === index) {
        if (out.length && !out[out.length - 1].endsWith("\n")) out[out.length - 1] += newline;
        out.push(...extra.map((item) => `${item}${newline}`));
        appends.delete(doc);
      }
    }
    if (!removed.has(index)) out.push(line);
    const extra = inserts.get(index);
    if (extra) {
      if (!line.endsWith("\n")) out[out.length - 1] += newline;
      out.push(...extra.map((item) => `${item}${newline}`));
    }
  });
  for (const extra of appends.values()) {
    if (out.length && !out[out.length - 1].endsWith("\n")) out[out.length - 1] += newline;
    out.push(...extra.map((item) => `${item}${newline}`));
  }
  return { text: out.join(""), changed: true, notes };
}

export function removeYamlKey(text: string, key: string): TextEdit {
  const lines = text.split(/(?<=\n)/);
  const { entries } = parseYaml(lines);
  const removed = new Set<number>();
  for (const entry of entries) if (entry.path === key && entry.hasValue) removed.add(entry.line);
  if (!removed.size) return { text, changed: false, notes: [] };
  pruneEmptyParents(lines, entries, removed);
  return { text: lines.filter((_line, index) => !removed.has(index)).join(""), changed: true, notes: [] };
}

// ---------------------------------------------------------------------------
// Build files

/** Rename groupId:from → groupId:to in <dependency> blocks (exact artifactId, exclusions untouched). */
export function renamePomDependency(text: string, groupId: string, from: string, to: string): TextEdit {
  let changed = false;
  const groupPattern = new RegExp(`<groupId>\\s*${escapeRegex(groupId)}\\s*</groupId>`);
  const artifactPattern = new RegExp(`(<artifactId>\\s*)${escapeRegex(from)}(\\s*</artifactId>)`);
  const next = text.replace(/<dependency>([\s\S]*?)<\/dependency>/g, (whole, body: string) => {
    const cut = body.indexOf("<exclusions>");
    const head = cut >= 0 ? body.slice(0, cut) : body;
    const rest = cut >= 0 ? body.slice(cut) : "";
    if (!groupPattern.test(head) || !artifactPattern.test(head)) return whole;
    changed = true;
    return `<dependency>${head.replace(artifactPattern, `$1${to}$2`)}${rest}</dependency>`;
  });
  return { text: next, changed, notes: [] };
}

export function renameGradleDependency(text: string, groupId: string, from: string, to: string): TextEdit {
  const pattern = new RegExp(`(["'])${escapeRegex(groupId)}:${escapeRegex(from)}(:[^"']*)?\\1`, "g");
  let changed = false;
  let next = text.replace(pattern, (_whole, quote: string, version: string | undefined) => {
    changed = true;
    return `${quote}${groupId}:${to}${version ?? ""}${quote}`;
  });
  const mapPattern = new RegExp(`(group\\s*[:=]\\s*["']${escapeRegex(groupId)}["']\\s*,\\s*name\\s*[:=]\\s*["'])${escapeRegex(from)}(["'])`, "g");
  next = next.replace(mapPattern, (_whole, head: string, tail: string) => {
    changed = true;
    return `${head}${to}${tail}`;
  });
  return { text: next, changed, notes: [] };
}

// ---------------------------------------------------------------------------
// Applying a pack to a repository

const configName = /^(application|bootstrap)([-.][A-Za-z0-9_.-]+)?\.(properties|ya?ml)$/i;
const skipDirs = new Set(["target", "build", "node_modules", ".git", ".gradle", ".idea"]);

/** Spring config files (application*.properties|yml) under src/<set>/resources and config/ of every module. */
export function findSpringConfigFiles(repoPath: string, modules: string[] = [""]): string[] {
  const found = new Set<string>();
  const visit = (dir: string, depth: number) => {
    if (depth > 6 || !existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) visit(full, depth + 1);
      } else if (configName.test(entry.name)) {
        found.add(full);
      }
    }
  };
  for (const module of modules) {
    const base = path.join(repoPath, module);
    const src = path.join(base, "src");
    if (existsSync(src)) {
      for (const set of readdirSync(src, { withFileTypes: true })) {
        if (set.isDirectory()) visit(path.join(src, set.name, "resources"), 0);
      }
    }
    visit(path.join(base, "config"), 0);
  }
  return [...found].sort();
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

export function mergeRules(packs: ModernizerRules[]): ModernizerRules {
  const merged: ModernizerRules = {
    id: packs.map((pack) => pack.id).join("+"),
    description: packs.map((pack) => pack.description).join(" | "),
    sampleOnly: packs.some((pack) => pack.sampleOnly),
    javaxToJakarta: packs.some((pack) => pack.javaxToJakarta),
    jakartaRecipe: packs.find((pack) => pack.jakartaRecipe)?.jakartaRecipe ?? null,
    dependencyRenames: packs.flatMap((pack) => pack.dependencyRenames),
    propertyRenames: packs.flatMap((pack) => pack.propertyRenames),
    removeProperties: packs.flatMap((pack) => pack.removeProperties),
  };
  return merged;
}

/**
 * Apply the deterministic parts of a rules pack (dependency renames, property
 * renames and removals). Every edit is anchored, so a second run is a no-op.
 * With `write: false` nothing is written and the edits are only reported.
 */
export function applyRules(
  repoPath: string,
  rules: ModernizerRules,
  options: { modules?: string[]; buildFiles?: string[]; write?: boolean; isLocked?: (relative: string) => boolean } = {},
): RuleEdit[] {
  const writeAll = options.write ?? true;
  const lockedNote = " (not applied: the file is locked by the migration plan)";
  const edits: RuleEdit[] = [];
  const buildFiles = options.buildFiles ?? ["pom.xml", "build.gradle", "build.gradle.kts"];
  for (const relative of buildFiles) {
    const file = path.join(repoPath, relative);
    if (!existsSync(file)) continue;
    let text = readFileSync(file, "utf8");
    const original = text;
    const locked = Boolean(options.isLocked?.(toPosix(relative)));
    const write = writeAll && !locked;
    const suffix = locked ? lockedNote : "";
    for (const rename of rules.dependencyRenames) {
      const result = relative.endsWith(".xml")
        ? renamePomDependency(text, rename.groupId, rename.from, rename.to)
        : renameGradleDependency(text, rename.groupId, rename.from, rename.to);
      if (result.changed) {
        text = result.text;
        edits.push({ file: toPosix(relative), rule: "dependencyRename", detail: `${rename.groupId}:${rename.from} → ${rename.to}${suffix}`, applied: write });
      }
    }
    if (write && text !== original) writeFileSync(file, text, "utf8");
  }
  for (const file of findSpringConfigFiles(repoPath, options.modules)) {
    const relative = toPosix(path.relative(repoPath, file));
    const yaml = /\.ya?ml$/i.test(file);
    let text = readFileSync(file, "utf8");
    const original = text;
    const locked = Boolean(options.isLocked?.(relative));
    const write = writeAll && !locked;
    const suffix = locked ? lockedNote : "";
    for (const rename of rules.propertyRenames) {
      const result = yaml ? renameYamlKey(text, rename.from, rename.to) : renamePropertiesKey(text, rename.from, rename.to);
      for (const note of result.notes) edits.push({ file: relative, rule: "propertyRename", detail: note, applied: false });
      if (result.changed) {
        text = result.text;
        edits.push({ file: relative, rule: "propertyRename", detail: `${rename.from} → ${rename.to}${suffix}`, applied: write });
      }
    }
    for (const key of rules.removeProperties) {
      const result = yaml ? removeYamlKey(text, key) : removePropertiesKey(text, key);
      if (result.changed) {
        text = result.text;
        edits.push({ file: relative, rule: "removeProperty", detail: `removed ${key}${suffix}`, applied: write });
      }
    }
    if (write && text !== original) writeFileSync(file, text, "utf8");
  }
  return edits;
}

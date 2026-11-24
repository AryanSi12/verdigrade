import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RuleEdit } from "../rules.js";
import { readText } from "./findings.js";
import { compareVersions, normalizeDist, normalizePython, type PythonRoute } from "./pythonMatrix.js";
import { impOnlyReload, parseRequirement, pythonFilesOf, requirementFilesOf, specVersion } from "./pythonScan.js";

/** A rule edit with the exact line it changes (for plan snippets). */
export type PyRuleEdit = RuleEdit & { line: number | null; before: string; after: string };

type Change = { line: number; before: string; after: string; detail: string };
type FileResult = { text: string; changes: Change[]; notes: string[] };

const lockedNote = " (not applied: the file is locked by the migration plan)";

/** New specifier for a bump: exact pins stay exact, bounded ranges become compatible releases, the rest a lower bound. */
export function bumpSpec(spec: string, version: string): string {
  if (/^===?/.test(spec)) return `==${version}`;
  if (/^\^/.test(spec)) return `^${version}`;
  if (/<|~=/.test(spec)) return `~=${version}`;
  return `>=${version}`;
}

/** Does the declared requirement need the route's version? Unpinned and newer lines are left alone (never downgrade). */
export function needsBump(spec: string, rule: { version: string; minimum: string }): boolean {
  if (!spec) return false;
  const declared = specVersion(spec);
  if (!declared) {
    // Only an upper bound ("<3"): it blocks the target unless the bound is above it.
    const upper = /<=?\s*(\d+(?:\.\d+)*)/.exec(spec)?.[1];
    return Boolean(upper && compareVersions(upper, rule.version) <= 0);
  }
  if (compareVersions(declared, rule.minimum) < 0) return true;
  const upper = /<\s*(\d+(?:\.\d+)*)/.exec(spec)?.[1];
  return Boolean(upper && compareVersions(upper, rule.version) <= 0);
}

function eolOf(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/** requirements*.txt: bump each matching line in place (extras, markers and comments survive). */
export function editRequirements(text: string, route: Pick<PythonRoute, "packages">): FileResult {
  const eol = eolOf(text);
  const lines = text.split(/\r?\n/);
  const changes: Change[] = [];
  const notes: string[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (/^-e\s|^[\w+.-]+:\/\/|\s@\s/.test(trimmed)) {
      const name = /#egg=([\w.-]+)/.exec(trimmed)?.[1] ?? /^([A-Za-z0-9][\w.-]*)\s*@/.exec(trimmed)?.[1];
      if (name && route.packages.some((rule) => normalizeDist(rule.name) === normalizeDist(name))) notes.push(`left ${trimmed} alone: not a registry requirement (line ${index + 1})`);
      return;
    }
    const parsed = parseRequirement(line);
    if (!parsed) return;
    const rule = route.packages.find((item) => normalizeDist(item.name) === normalizeDist(parsed.name));
    if (!rule || !needsBump(parsed.spec, rule)) return;
    const next = bumpSpec(parsed.spec, rule.version);
    const after = line.replace(parsed.spec ? new RegExp(parsed.spec.split("").map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*")) : /$/, next);
    if (after === line) return;
    lines[index] = after;
    changes.push({ line: index + 1, before: trimmed, after: after.trim(), detail: `${parsed.name}${parsed.spec} → ${parsed.name}${next}` });
  });
  return { text: lines.join(eol), changes, notes };
}

function replaceQuotedRequirements(text: string, route: Pick<PythonRoute, "packages">, inScope: (line: string, section: string) => boolean, toml: boolean): FileResult {
  const eol = eolOf(text);
  const lines = text.split(/\r?\n/);
  const changes: Change[] = [];
  let section = "";
  let open = false;
  lines.forEach((line, index) => {
    const header = toml ? /^\s*\[([^\]]+)\]\s*$/.exec(line) : null;
    if (header) {
      section = header[1].trim();
      open = false;
      return;
    }
    if (toml && section.startsWith("tool.poetry") && /dependencies$/.test(section)) {
      const poetry = /^(\s*)([A-Za-z0-9][\w.-]*)(\s*=\s*)(["'])([^"']*)\4/.exec(line);
      if (!poetry || poetry[2].toLowerCase() === "python") return;
      const rule = route.packages.find((item) => normalizeDist(item.name) === normalizeDist(poetry[2]));
      if (!rule || !needsBump(poetry[5], rule)) return;
      const next = bumpSpec(poetry[5], rule.version);
      const after = line.replace(`${poetry[4]}${poetry[5]}${poetry[4]}`, `${poetry[4]}${next}${poetry[4]}`);
      lines[index] = after;
      changes.push({ line: index + 1, before: line.trim(), after: after.trim(), detail: `${poetry[2]} ${poetry[5]} → ${next}` });
      return;
    }
    const starts = !open && inScope(line, section);
    const active = open || starts;
    const bare = line.replace(/["'][^"']*["']/g, "");
    if (starts) open = !/\]/.test(bare.slice(bare.indexOf("[") + 1));
    else if (open && /\]/.test(bare)) open = false;
    if (!active) return;
    let after = line;
    for (const match of line.matchAll(/(["'])([^"']+)\1/g)) {
      const parsed = parseRequirement(match[2]);
      if (!parsed) continue;
      const rule = route.packages.find((item) => normalizeDist(item.name) === normalizeDist(parsed.name));
      if (!rule || !needsBump(parsed.spec, rule)) continue;
      const next = bumpSpec(parsed.spec, rule.version);
      const replaced = match[2].replace(parsed.spec ? new RegExp(parsed.spec.split("").map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*")) : /$/, next);
      after = after.replace(`${match[1]}${match[2]}${match[1]}`, `${match[1]}${replaced}${match[1]}`);
      changes.push({ line: index + 1, before: line.trim(), after: "", detail: `${parsed.name}${parsed.spec} → ${parsed.name}${next}` });
    }
    if (after !== line) {
      lines[index] = after;
      for (const change of changes) if (change.line === index + 1) change.after = after.trim();
    }
  });
  return { text: lines.join(eol), changes, notes: [] };
}

/** pyproject.toml: requires-python, [project] dependency arrays and Poetry dependency tables. */
export function editPyproject(text: string, route: Pick<PythonRoute, "packages" | "python" | "requiresPython">): FileResult {
  const result = replaceQuotedRequirements(
    text,
    route,
    (line, section) => (section === "project" && /^\s*dependencies\s*=\s*\[/.test(line)) || ((section === "project.optional-dependencies" || section === "dependency-groups") && /^\s*[\w.-]+\s*=\s*\[/.test(line)),
    true,
  );
  const eol = eolOf(text);
  const lines = result.text.split(/\r?\n/);
  let section = "";
  lines.forEach((line, index) => {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (header) {
      section = header[1].trim();
      return;
    }
    const requires = section === "project" ? /^(\s*requires-python\s*=\s*)(["'])([^"']*)\2/.exec(line) : null;
    const poetry = section === "tool.poetry.dependencies" ? /^(\s*python\s*=\s*)(["'])([^"']*)\2/.exec(line) : null;
    const match = requires ?? poetry;
    if (!match) return;
    const declared = normalizePython(match[3]);
    if (declared !== "unknown" && compareVersions(declared, route.python) >= 0 && !/<\s*3\.\d/.test(match[3])) return;
    const value = poetry ? `>=${route.python},<4.0` : route.requiresPython;
    const after = line.replace(`${match[2]}${match[3]}${match[2]}`, `${match[2]}${value}${match[2]}`);
    lines[index] = after;
    result.changes.push({ line: index + 1, before: line.trim(), after: after.trim(), detail: `${poetry ? "python" : "requires-python"}: ${match[3]} → ${value}` });
  });
  return { text: lines.join(eol), changes: result.changes.sort((a, b) => a.line - b.line), notes: result.notes };
}

/** setup.py: python_requires and quoted requirements in install_requires / tests_require / extras_require. */
export function editSetupPy(text: string, route: Pick<PythonRoute, "packages" | "python" | "requiresPython">): FileResult {
  const result = replaceQuotedRequirements(text, route, (line) => /\b(install_requires|tests_require|setup_requires)\s*=\s*\[|\bextras_require\s*=/.test(line), false);
  const eol = eolOf(text);
  const lines = result.text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = /(python_requires\s*=\s*)(["'])([^"']*)\2/.exec(line);
    if (!match) return;
    const declared = normalizePython(match[3]);
    if (declared !== "unknown" && compareVersions(declared, route.python) >= 0) return;
    const after = line.replace(`${match[2]}${match[3]}${match[2]}`, `${match[2]}${route.requiresPython}${match[2]}`);
    lines[index] = after;
    result.changes.push({ line: index + 1, before: line.trim(), after: after.trim(), detail: `python_requires: ${match[3]} → ${route.requiresPython}` });
  });
  return { text: lines.join(eol), changes: result.changes, notes: [] };
}

/** setup.cfg: python_requires and the install_requires block. */
export function editSetupCfg(text: string, route: Pick<PythonRoute, "packages" | "python" | "requiresPython">): FileResult {
  const eol = eolOf(text);
  const lines = text.split(/\r?\n/);
  const changes: Change[] = [];
  let block = false;
  lines.forEach((line, index) => {
    const requires = /^(\s*python_requires\s*=\s*)(.+?)\s*$/.exec(line);
    if (requires) {
      const declared = normalizePython(requires[2]);
      if (declared === "unknown" || compareVersions(declared, route.python) < 0) {
        lines[index] = `${requires[1]}${route.requiresPython}`;
        changes.push({ line: index + 1, before: line.trim(), after: lines[index].trim(), detail: `python_requires: ${requires[2]} → ${route.requiresPython}` });
      }
      return;
    }
    if (/^\s*(install_requires|tests_require)\s*=/.test(line)) {
      block = true;
      return;
    }
    if (block && /^\s+\S/.test(line)) {
      const parsed = parseRequirement(line);
      const rule = parsed && route.packages.find((item) => normalizeDist(item.name) === normalizeDist(parsed.name));
      if (parsed && rule && needsBump(parsed.spec, rule)) {
        const next = bumpSpec(parsed.spec, rule.version);
        lines[index] = line.replace(parsed.spec, next);
        changes.push({ line: index + 1, before: line.trim(), after: lines[index].trim(), detail: `${parsed.name}${parsed.spec} → ${parsed.name}${next}` });
      }
      return;
    }
    if (/^\S/.test(line) || !line.trim()) block = false;
  });
  return { text: lines.join(eol), changes, notes: [] };
}

// ---- code rules ----------------------------------------------------------------------

const unittestAliases: Record<string, string> = {
  assertEquals: "assertEqual",
  assertNotEquals: "assertNotEqual",
  assertAlmostEquals: "assertAlmostEqual",
  assertNotAlmostEquals: "assertNotAlmostEqual",
  failUnlessEqual: "assertEqual",
  failIfEqual: "assertNotEqual",
  failUnlessAlmostEqual: "assertAlmostEqual",
  failIfAlmostEqual: "assertNotAlmostEqual",
  failUnlessRaises: "assertRaises",
  failUnless: "assertTrue",
  failIf: "assertFalse",
  assert_: "assertTrue",
  assertRegexpMatches: "assertRegex",
  assertRaisesRegexp: "assertRaisesRegex",
  assertNotRegexpMatches: "assertNotRegex",
};

export type CodeRuleId = "stdlib:unittest-aliases" | "stdlib:configparser" | "stdlib:imp-reload" | "flask:markup-import" | "flask:json-config";

export type CodeRuleContext = { python: string; flaskTarget: string | null; flaskDeclared: boolean };

/** One-line, exact rewrites for removed APIs the rewrite tools don't cover. Each is idempotent. */
export function editPythonSource(text: string, context: CodeRuleContext): { text: string; changes: Array<Change & { rule: CodeRuleId }> } {
  const eol = eolOf(text);
  const lines = text.split(/\r?\n/);
  const changes: Array<Change & { rule: CodeRuleId }> = [];
  const py312 = compareVersions(context.python, "3.12") >= 0;
  const hasConfigparser = /configparser/.test(text);
  const reloadOnly = py312 && impOnlyReload(text);
  const flask = context.flaskDeclared && context.flaskTarget !== null && /\bflask\b/.test(text);
  lines.forEach((line, index) => {
    if (/^\s*#/.test(line)) return;
    let next = line;
    const record = (rule: CodeRuleId, detail: string) => {
      if (next !== line) changes.push({ line: index + 1, before: line.trim(), after: next.trim(), detail, rule });
    };
    if (py312) {
      const before = next;
      next = next.replace(/\.(assertEquals|assertNotEquals|assertAlmostEquals|assertNotAlmostEquals|failUnlessEqual|failIfEqual|failUnlessAlmostEqual|failIfAlmostEqual|failUnlessRaises|failUnless|failIf|assert_|assertRegexpMatches|assertRaisesRegexp|assertNotRegexpMatches)(\s*\()/g, (_m, name: string, paren: string) => `.${unittestAliases[name]}${paren}`);
      if (next !== before) {
        const names = [...before.matchAll(/\.(\w+)\s*\(/g)].map((m) => m[1]).filter((name) => unittestAliases[name]);
        changes.push({ line: index + 1, before: before.trim(), after: next.trim(), detail: `${[...new Set(names)].map((name) => `${name} → ${unittestAliases[name]}`).join(", ")} (removed in Python 3.12)`, rule: "stdlib:unittest-aliases" });
      }
      if (hasConfigparser) {
        const start = next;
        next = next.replace(/\bSafeConfigParser\b/g, "ConfigParser").replace(/\.readfp(\s*\()/g, ".read_file$1");
        if (next !== start) changes.push({ line: index + 1, before: start.trim(), after: next.trim(), detail: `${/SafeConfigParser/.test(start) ? "SafeConfigParser → ConfigParser" : ""}${/SafeConfigParser/.test(start) && /\.readfp/.test(start) ? ", " : ""}${/\.readfp/.test(start) ? "readfp() → read_file()" : ""} (removed in Python 3.12)`, rule: "stdlib:configparser" });
      }
      if (reloadOnly) {
        const start = next;
        if (/^\s*import\s+imp\s*(#.*)?$/.test(next)) {
          next = /^\s*import\s+importlib\s*$/m.test(text) ? "" : next.replace(/\bimp\b/, "importlib");
        } else {
          next = next.replace(/\bimp\.reload\s*\(/g, "importlib.reload(");
        }
        if (next !== start) changes.push({ line: index + 1, before: start.trim(), after: next.trim(), detail: next === "" ? "removed import imp (importlib is already imported; removed in Python 3.12)" : /import/.test(start) ? "import imp → import importlib (removed in Python 3.12)" : "imp.reload() → importlib.reload()", rule: "stdlib:imp-reload" });
      }
    }
    if (flask) {
      const start = next;
      const imported = /^(\s*)from\s+flask\s+import\s+([^()#\\]+?)\s*(#.*)?$/.exec(next);
      if (imported) {
        const names = imported[2].split(",").map((name) => name.trim()).filter(Boolean);
        const moved = names.filter((name) => /^(Markup|escape)(\s+as\s+\w+)?$/.test(name));
        if (moved.length) {
          const kept = names.filter((name) => !moved.includes(name));
          const markup = `${imported[1]}from markupsafe import ${moved.join(", ")}`;
          next = kept.length ? `${imported[1]}from flask import ${kept.join(", ")}${eol}${markup}` : markup;
          changes.push({ line: index + 1, before: start.trim(), after: next.split(/\r?\n/).map((part) => part.trim()).join("\n"), detail: `${moved.join(", ")} now imported from markupsafe (removed from flask in Flask 3.0)`, rule: "flask:markup-import" });
        }
      }
      const json = /^(\s*)(\w+)\.config\[\s*["'](JSON_SORT_KEYS|JSON_AS_ASCII|JSONIFY_MIMETYPE)["']\s*\]\s*=\s*(.+?)\s*$/.exec(next);
      if (json) {
        const attribute = { JSON_SORT_KEYS: "sort_keys", JSON_AS_ASCII: "ensure_ascii", JSONIFY_MIMETYPE: "mimetype" }[json[3] as "JSON_SORT_KEYS"];
        const startJson = next;
        next = `${json[1]}${json[2]}.json.${attribute} = ${json[4]}`;
        changes.push({ line: index + 1, before: startJson.trim(), after: next.trim(), detail: `${json[2]}.config["${json[3]}"] → ${json[2]}.json.${attribute} (config key removed in Flask 2.3)`, rule: "flask:json-config" });
      }
    }
    lines[index] = next;
  });
  const out = lines.filter((line, index) => !(line === "" && changes.some((change) => change.line === index + 1 && change.after === "")));
  return { text: out.join(eol), changes };
}

export type PythonRuleOptions = {
  route: PythonRoute;
  latestPatch: string;
  flaskDeclared: boolean;
  write: boolean;
  isLocked?: (relative: string) => boolean;
};

/**
 * Apply the route's dependency bumps, Python version declarations and code
 * rules. Locked files are reported but not written. Idempotent: a second run
 * reports no edits.
 */
export function applyPythonRules(root: string, options: PythonRuleOptions): PyRuleEdit[] {
  const out: PyRuleEdit[] = [];
  const handle = (relative: string, produce: (text: string) => { text: string; changes: Array<Change & { rule?: string }>; notes?: string[] }, rule: string) => {
    const file = path.join(root, relative);
    if (!existsSync(file)) return;
    const text = readFileSync(file, "utf8");
    const result = produce(text);
    const locked = Boolean(options.isLocked?.(relative));
    for (const note of result.notes ?? []) out.push({ file: relative, rule, detail: note, applied: false, line: null, before: "", after: "" });
    for (const change of result.changes) {
      out.push({ file: relative, rule: change.rule ?? rule, detail: `${change.detail}${locked ? lockedNote : ""}`, applied: options.write && !locked, line: change.line, before: change.before, after: change.after });
    }
    if (options.write && !locked && result.changes.length && result.text !== text) writeFileSync(file, result.text, "utf8");
  };
  const { all, code } = pythonFilesOf(root);
  for (const file of requirementFilesOf(all)) handle(file, (text) => editRequirements(text, options.route), "requirements");
  handle("pyproject.toml", (text) => editPyproject(text, options.route), "pyproject");
  handle("setup.py", (text) => editSetupPy(text, options.route), "setup");
  handle("setup.cfg", (text) => editSetupCfg(text, options.route), "setup");
  handle(
    ".python-version",
    (text) => {
      const current = text.trim();
      const version = normalizePython(current);
      if (version !== "unknown" && compareVersions(version, options.route.python) >= 0) return { text, changes: [] };
      return { text: `${options.route.python}\n`, changes: [{ line: 1, before: current, after: options.route.python, detail: `${current || "(empty)"} → ${options.route.python}` }] };
    },
    "python-version-file",
  );
  handle(
    "runtime.txt",
    (text) => {
      const current = text.trim();
      const match = /^python-(\d+\.\d+)/.exec(current);
      if (!match || compareVersions(match[1], options.route.python) >= 0) return { text, changes: [] };
      return { text: `python-${options.latestPatch}\n`, changes: [{ line: 1, before: current, after: `python-${options.latestPatch}`, detail: `${current} → python-${options.latestPatch}` }] };
    },
    "python-version-file",
  );
  const context: CodeRuleContext = { python: options.route.python, flaskTarget: options.route.frameworks.flask, flaskDeclared: options.flaskDeclared };
  for (const file of code) handle(file, (text) => editPythonSource(text, context), "code");
  return out;
}

/** Text of a file, for callers that only have the root. */
export function fileText(root: string, relative: string): string {
  return readText(root, relative);
}

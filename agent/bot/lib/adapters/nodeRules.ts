import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RuleEdit } from "../rules.js";
import type { NodeRoute, TsconfigProfile } from "./nodeMatrix.js";
import { parseJsonc, rangeMajor, type PackageJson } from "./nodeScan.js";

type TextEdit = { text: string; changed: boolean; notes: string[] };

const sections = ["dependencies", "devDependencies", "optionalDependencies"] as const;

function detectIndent(text: string): string {
  const match = /^([ \t]+)"/m.exec(text);
  return match ? match[1] : "  ";
}

/** Same version line already? "^5.0.0" vs "^5.3.0" are both major 5 (belowMajor), "~6.0.3" equals itself (present). */
function minorTuple(range: string): [number, number] | null {
  const match = /(\d+)(?:\.(\d+))?/.exec(range);
  return match ? [Number(match[1]), Number(match[2] ?? 0)] : null;
}

function satisfiesRule(current: string, rule: { version: string; when: "present" | "belowMajor"; major?: number }): boolean {
  if (rule.when === "belowMajor") return (rangeMajor(current) ?? 0) >= (rule.major ?? 0);
  if (current.trim() === rule.version) return true;
  // Never downgrade: a declared line newer than the target (e.g. typescript ^7 vs ~6.0.3) is left alone.
  const have = minorTuple(current);
  const want = minorTuple(rule.version);
  return Boolean(have && want && (have[0] > want[0] || (have[0] === want[0] && have[1] > want[1])));
}

/**
 * Bump declared packages, engines.node and keep the file's own formatting
 * (indent, key order, trailing newline). Packages that are not declared are
 * never added. Idempotent: a second run reports no edits.
 */
export function editPackageJson(text: string, route: Pick<NodeRoute, "packages" | "engines" | "node">): TextEdit & { edits: string[] } {
  const pkg = JSON.parse(text) as PackageJson;
  const edits: string[] = [];
  for (const rule of route.packages) {
    for (const section of sections) {
      const deps = pkg[section];
      const current = deps?.[rule.name];
      if (typeof current !== "string") continue;
      if (/^(file:|link:|workspace:|git|https?:|npm:)/.test(current)) {
        edits.push(`left ${rule.name}@${current} (${section}) alone: not a registry range`);
        continue;
      }
      if (satisfiesRule(current, rule)) continue;
      deps![rule.name] = rule.version;
      edits.push(`${section}.${rule.name}: ${current} → ${rule.version}`);
    }
  }
  const engines = pkg.engines ?? {};
  if (engines.node !== route.engines && (rangeMajor(engines.node) ?? 0) < Number(route.node)) {
    const before = engines.node ?? "(none)";
    pkg.engines = { ...engines, node: route.engines };
    edits.push(`engines.node: ${before} → ${route.engines}`);
  }
  const changes = edits.filter((item) => !item.startsWith("left "));
  if (!changes.length) return { text, changed: false, notes: edits, edits: [] };
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const out = JSON.stringify(pkg, null, detectIndent(text)).replace(/\n/g, eol) + (/\r?\n$/.test(text) ? eol : "");
  return { text: out, changed: out !== text, notes: edits.filter((item) => item.startsWith("left ")), edits: changes };
}

// ---- tsconfig (JSONC, edited as text so comments survive) -------------------

function optionLine(lines: string[], option: string): number {
  const pattern = new RegExp(`^\\s*"${option}"\\s*:`);
  return lines.findIndex((line) => pattern.test(line));
}

function setStringOption(text: string, option: string, value: string): TextEdit {
  const pattern = new RegExp(`("${option}"\\s*:\\s*)"[^"]*"`);
  if (!pattern.test(text)) return { text, changed: false, notes: [] };
  const next = text.replace(pattern, `$1"${value}"`);
  return { text: next, changed: next !== text, notes: [] };
}

/** Remove a one-line option ("x": value,). Multi-line values are left with a note. */
function removeOption(text: string, option: string): TextEdit {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const index = optionLine(lines, option);
  if (index < 0) return { text, changed: false, notes: [] };
  const line = lines[index];
  if (/[[{]\s*,?\s*$/.test(line) || !/[^\s,]/.test(line.replace(/^\s*"[^"]+"\s*:/, ""))) {
    return { text, changed: false, notes: [`${option} spans several lines; remove it by hand`] };
  }
  const hadComma = /,\s*(\/\/.*)?$/.test(line);
  lines.splice(index, 1);
  if (!hadComma) {
    // It was the last property: drop the comma the previous property now leaves dangling.
    for (let prev = index - 1; prev >= 0; prev -= 1) {
      if (!lines[prev].trim() || /^\s*\/\//.test(lines[prev])) continue;
      lines[prev] = lines[prev].replace(/,(\s*(\/\/.*)?)$/, "$1");
      break;
    }
  }
  return { text: lines.join(eol), changed: true, notes: [] };
}

/** Insert `"option": value` as the first compilerOptions property. */
function addOption(text: string, option: string, json: string): TextEdit {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => /"compilerOptions"\s*:\s*\{\s*$/.test(line));
  if (index < 0) return { text, changed: false, notes: [`could not find a "compilerOptions": { line to add ${option}`] };
  const next = lines.slice(index + 1).find((line) => line.trim());
  const indent = /^(\s*)/.exec(next ?? "")?.[1] || `${/^(\s*)/.exec(lines[index])?.[1] ?? ""}  `;
  const closesImmediately = next !== undefined && /^\s*\}/.test(next);
  lines.splice(index + 1, 0, `${indent}"${option}": ${json}${closesImmediately ? "" : ","}`);
  return { text: lines.join(eol), changed: true, notes: [] };
}

const esTargets = ["es3", "es5"];

/**
 * TypeScript deprecation fixes for tsconfig.json. Returns the text and a
 * human-readable list of edits. `typesPackages` are the @types/* packages the
 * project declares (TypeScript 6 no longer includes them automatically).
 */
export function editTsconfig(text: string, profile: TsconfigProfile, typesPackages: string[]): TextEdit & { edits: string[] } {
  const json = parseJsonc(text);
  const edits: string[] = [];
  const notes: string[] = [];
  if (!json) return { text, changed: false, notes: ["tsconfig.json could not be parsed"], edits };
  const options = (json.compilerOptions ?? {}) as Record<string, unknown>;
  let current = text;
  const apply = (result: TextEdit, label: string) => {
    notes.push(...result.notes);
    if (result.changed) {
      current = result.text;
      edits.push(label);
    }
  };
  for (const option of profile.removeOptions) {
    if (options[option] !== undefined) apply(removeOption(current, option), `removed ${option}`);
  }
  if (profile.migrateModuleResolution) {
    const resolution = String(options.moduleResolution ?? "").toLowerCase();
    if (["node", "node10", "classic"].includes(resolution)) {
      const module = String(options.module ?? "").toLowerCase();
      const bundler = /^(es\d+|esnext|es6|preserve)$/.test(module);
      if (bundler) {
        apply(setStringOption(current, "moduleResolution", "bundler"), `moduleResolution: ${options.moduleResolution} → bundler`);
      } else {
        apply(setStringOption(current, "moduleResolution", "nodenext"), `moduleResolution: ${options.moduleResolution} → nodenext`);
        if (options.module === undefined) apply(addOption(current, "module", '"nodenext"'), "added module: nodenext");
        else if (module !== "nodenext") apply(setStringOption(current, "module", "nodenext"), `module: ${options.module} → nodenext`);
      }
    }
  }
  if (profile.dropBaseUrlWithoutPaths && options.baseUrl !== undefined) {
    if (options.paths === undefined) apply(removeOption(current, "baseUrl"), "removed baseUrl (no paths use it)");
    else notes.push("baseUrl is used by paths; inline it into each paths entry by hand");
  }
  if (profile.minimumTarget && typeof options.target === "string" && esTargets.includes(options.target.toLowerCase())) {
    apply(setStringOption(current, "target", profile.minimumTarget), `target: ${options.target} → ${profile.minimumTarget}`);
  }
  if (profile.ensureTypes && options.types === undefined && typesPackages.length) {
    apply(addOption(current, "types", JSON.stringify(typesPackages)), `added types: ${typesPackages.join(", ")} (TypeScript 6 no longer loads @types automatically)`);
  }
  return { text: current, changed: current !== text, notes, edits };
}

/** @types packages TypeScript 6 must now be told about (only global ones; module typings resolve on import). */
export function globalTypesPackages(pkg: PackageJson): string[] {
  const declared = new Set(sections.flatMap((section) => Object.keys(pkg[section] ?? {})));
  return ["node", "jest", "mocha", "jasmine"].filter((name) => declared.has(`@types/${name}`));
}

export type NodeRuleOptions = {
  route: NodeRoute;
  tsconfig: TsconfigProfile;
  write: boolean;
  isLocked?: (relative: string) => boolean;
};

/** Apply the route's package, engines, .nvmrc and tsconfig rules. Idempotent. */
export function applyNodeRules(repoPath: string, options: NodeRuleOptions): RuleEdit[] {
  const out: RuleEdit[] = [];
  const lockedNote = " (not applied: the file is locked by the migration plan)";
  const handle = (relative: string, produce: (text: string) => { text: string; changed: boolean; notes: string[]; edits: string[] }, rule: string) => {
    const file = path.join(repoPath, relative);
    if (!existsSync(file)) return;
    const text = readFileSync(file, "utf8");
    const result = produce(text);
    const locked = Boolean(options.isLocked?.(relative));
    for (const note of result.notes) out.push({ file: relative, rule, detail: note, applied: false });
    for (const edit of result.edits) out.push({ file: relative, rule, detail: `${edit}${locked ? lockedNote : ""}`, applied: options.write && !locked });
    if (options.write && !locked && result.changed) writeFileSync(file, result.text, "utf8");
  };
  let pkg: PackageJson = {};
  try {
    pkg = JSON.parse(readFileSync(path.join(repoPath, "package.json"), "utf8")) as PackageJson;
  } catch {
    /* scan already reported it */
  }
  handle("package.json", (text) => editPackageJson(text, options.route), "package");
  handle("tsconfig.json", (text) => editTsconfig(text, options.tsconfig, globalTypesPackages(pkg)), "tsconfig");
  for (const name of [".nvmrc", ".node-version"]) {
    handle(
      name,
      (text) => {
        const current = text.trim();
        if ((rangeMajor(current) ?? 0) >= Number(options.route.nvmrc)) return { text, changed: false, notes: [], edits: [] };
        return { text: `${options.route.nvmrc}\n`, changed: true, notes: [], edits: [`${current || "(empty)"} → ${options.route.nvmrc}`] };
      },
      "node-version-file",
    );
  }
  return out;
}

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { PlanFinding, Snippet } from "./types.js";

/** Folders never scanned for plan findings (build output, dependencies, VCS, IDE). */
export const planSkipDirs = new Set(["node_modules", ".git", "target", "build", "dist", "out", ".gradle", ".idea", ".vscode", "coverage", ".next", ".mvn", ".settings", ".venv", "venv", "__pycache__", ".pytest_cache", ".tox", ".nox", ".mypy_cache", ".ruff_cache", ".eggs", "site-packages"]);

const maxFiles = 20_000;
const maxBytes = 1_000_000;

/** Every file under the repository (relative, "/"-separated), skipping build output and dependencies. */
export function listRepoFiles(root: string, limit = maxFiles): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 25 || out.length >= limit) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= limit) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!planSkipDirs.has(entry.name)) walk(full, depth + 1);
      } else if (entry.isFile()) {
        out.push(path.relative(root, full).split(path.sep).join("/"));
      }
    }
  };
  walk(root, 0);
  return out.sort();
}

export function readText(root: string, relative: string): string {
  try {
    const file = path.join(root, relative);
    if (statSync(file).size > maxBytes) return "";
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/** Stable id from the finding's identity, so re-planning keeps the reviewer's decisions. */
export function findingId(category: string, file: string | null, line: number | null, title: string): string {
  return `F-${createHash("sha1").update(`${category}|${file ?? ""}|${line ?? ""}|${title}`).digest("hex").slice(0, 10)}`;
}

export function finding(input: Omit<PlanFinding, "id"> & { id?: string }): PlanFinding {
  return { ...input, id: input.id ?? findingId(input.category, input.file, input.line, input.title) };
}

/** Every (1-based line, line text) in `text` that matches. */
export function matchingLines(text: string, pattern: RegExp, limit = 50): Array<{ line: number; text: string }> {
  const hits: Array<{ line: number; text: string }> = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length && hits.length < limit; index += 1) {
    pattern.lastIndex = 0;
    if (pattern.test(lines[index])) hits.push({ line: index + 1, text: lines[index].trim().slice(0, 240) });
  }
  return hits;
}

export function firstLine(text: string, pattern: RegExp): { line: number; text: string } | null {
  return matchingLines(text, pattern, 1)[0] ?? null;
}

const secretName = /(^|\/)(\.env(\.[\w.-]+)?|[^/]*\.(pem|key|p12|pfx|jks|keystore)|id_(rsa|dsa|ecdsa|ed25519)|[^/]*(credentials?|secrets?)(\.(json|ya?ml|properties|txt|xml|ini|conf))?)$/i;
const secretExample = /\.(example|sample|template|dist)$/i;
const inlinePassword = /^\s*[\w.-]*(password|passwd|secret|api[-_.]?key|token)[\w.-]*\s*[:=]\s*(?!\s*$)(?!.*\$\{)(?!\s*["']?\s*["']?\s*$)\S/i;
const configFile = /(^|\/)(application|bootstrap)[\w.-]*\.(properties|ya?ml)$|(^|\/)config\/[^/]+\.(json|ya?ml)$/i;
const migrationFolder = /(^|\/)(db\/migration|db\/changelog|db\/migrate|migrations?|liquibase|flyway|prisma\/migrations)\//i;
const migrationFile = /(^|\/)(V\d+[\w.]*__[^/]+\.sql|[^/]*changelog[^/]*\.(xml|ya?ml|json|sql))$/i;
const nativeFile = /\.(c|cc|cpp|cxx|h|hpp|so|dll|dylib|a|lib|node)$|(^|\/)(binding\.gyp|CMakeLists\.txt|Makefile)$/i;

/**
 * Findings every ecosystem shares: credentials, database migration scripts,
 * native code, container images and CI pipelines. These are "manual" (the
 * pipeline never edits them) and mostly default to "lock".
 */
export function commonFindings(root: string, files: string[], options: { runtimeLabel: string; targetRuntime: string; ciVersionKey: RegExp; dockerImage: RegExp }): PlanFinding[] {
  const out: PlanFinding[] = [];

  for (const file of files.filter((item) => secretName.test(item))) {
    const example = secretExample.test(file);
    out.push(
      finding({
        group: "manual",
        kind: example ? "secrets.example" : "secrets.file",
        params: { name: path.posix.basename(file) },
        category: "secrets",
        severity: example ? "low" : "high",
        title: example ? `Example credentials file ${path.posix.basename(file)}` : `Credentials file ${path.posix.basename(file)}`,
        file,
        line: null,
        why: "Credential material. The pipeline never edits it and the model may not read it; locking it makes that explicit.",
        suggestion: "Keep it locked. If it needs new keys for the target version, update it by hand after the run.",
        defaultDecision: "lock",
      }),
    );
  }

  for (const file of files.filter((item) => configFile.test(item))) {
    for (const hit of matchingLines(readText(root, file), inlinePassword, 5)) {
      if (/^\s*[#!]/.test(hit.text) || /^\s*\/\//.test(hit.text)) continue;
      out.push(
        finding({
          group: "review",
          kind: "inline-secret",
          category: "inline-secret",
          severity: "medium",
          title: "Credential-looking value in a config file",
          file,
          line: hit.line,
          why: "A password, token or key appears to be stored in plain text. Rules packs may rewrite this file (property renames), which puts the value in the diff.",
          suggestion: "Move the value to an environment variable or secret store, or lock the file if it must not change.",
          evidence: hit.text.replace(/([:=]\s*)\S.*$/, "$1***"),
          defaultDecision: "approve",
          fix: secretFix(hit.text),
        }),
      );
    }
  }

  const migrationDirs = new Map<string, string[]>();
  for (const file of files) {
    const folder = migrationFolder.exec(file);
    if (folder) {
      const dir = file.slice(0, folder.index + folder[0].length).replace(/\/$/, "");
      migrationDirs.set(dir, [...(migrationDirs.get(dir) ?? []), file]);
    } else if (migrationFile.test(file)) {
      const dir = path.posix.dirname(file);
      migrationDirs.set(dir, [...(migrationDirs.get(dir) ?? []), file]);
    }
  }
  for (const [dir, items] of migrationDirs) {
    out.push(
      finding({
        group: "manual",
        kind: "db-migration",
        params: { dir: `${dir}/`, count: String(items.length) },
        category: "db-migration",
        severity: "high",
        title: `Database migration scripts in ${dir}/ (${items.length} file${items.length === 1 ? "" : "s"})`,
        file: `${dir}/`,
        line: null,
        files: items.slice(0, 50),
        why: "Applied migrations are checksummed by Flyway/Liquibase/Prisma; editing one breaks every environment that already ran it.",
        suggestion: "Keep them locked. Add a new migration by hand if the upgrade needs schema changes.",
        defaultDecision: "lock",
      }),
    );
  }

  const native = files.filter((item) => nativeFile.test(item));
  if (native.length) {
    const dirs = [...new Set(native.map((item) => path.posix.dirname(item)))];
    for (const dir of dirs.slice(0, 10)) {
      const inDir = native.filter((item) => path.posix.dirname(item) === dir);
      out.push(
        finding({
          group: "manual",
          kind: "native-code.dir",
          params: { dir: dir === "." ? "the project root" : `${dir}/`, count: String(inDir.length), runtime: options.runtimeLabel, target: options.targetRuntime },
          category: "native-code",
          severity: "high",
          title: `Native code in ${dir === "." ? "the project root" : `${dir}/`} (${inDir.length} file${inDir.length === 1 ? "" : "s"})`,
          file: dir === "." ? inDir[0] : `${dir}/`,
          line: null,
          files: inDir.slice(0, 50),
          why: `Native code and binaries are outside what the rewrite tools understand, and must be rebuilt and retested for ${options.runtimeLabel} ${options.targetRuntime}.`,
          suggestion: "Rebuild and test it by hand on the target runtime. Locked so nothing edits it.",
          defaultDecision: "lock",
        }),
      );
    }
  }

  for (const file of files.filter((item) => /(^|\/)(Dockerfile[^/]*|[^/]*\.dockerfile|Containerfile)$/i.test(item))) {
    const hit = firstLine(readText(root, file), options.dockerImage);
    if (!hit) continue;
    out.push(
      finding({
        group: "manual",
        kind: "container",
        params: { runtime: options.runtimeLabel, target: options.targetRuntime },
        category: "container",
        severity: "medium",
        title: `Container base image is older than ${options.runtimeLabel} ${options.targetRuntime}`,
        file,
        line: hit.line,
        why: "The image the app ships in also needs the new runtime; the pipeline does not edit Dockerfiles.",
        suggestion: `Move the base image to ${options.runtimeLabel} ${options.targetRuntime} after the migration and rebuild the image.`,
        evidence: hit.text,
        snippets: [{ file, line: hit.line, before: hit.text, after: null, note: `Point this at a ${options.runtimeLabel} ${options.targetRuntime} image (you do this by hand).` }],
        defaultDecision: "manual",
      }),
    );
  }

  for (const file of files.filter((item) => /(^|\/)(\.github\/workflows\/[^/]+\.ya?ml|\.gitlab-ci\.ya?ml|Jenkinsfile|azure-pipelines\.ya?ml|\.circleci\/config\.ya?ml)$/i.test(item))) {
    const hit = firstLine(readText(root, file), options.ciVersionKey);
    if (!hit) continue;
    out.push(
      finding({
        group: "manual",
        kind: "ci",
        params: { runtime: options.runtimeLabel, target: options.targetRuntime },
        category: "ci",
        severity: "medium",
        title: `CI builds with an older ${options.runtimeLabel}`,
        file,
        line: hit.line,
        why: "The pipeline only changes the project's own build files; CI keeps using the old runtime until it is updated.",
        suggestion: `Update the CI runtime to ${options.runtimeLabel} ${options.targetRuntime} in the same pull request as the migration.`,
        evidence: hit.text,
        snippets: [{ file, line: hit.line, before: hit.text, after: null, note: `Change the version to ${options.targetRuntime} (you do this by hand).` }],
        defaultDecision: "manual",
      }),
    );
  }
  return out;
}

/** Test-coverage signal shared by adapters. */
export function testsFinding(input: { tests: number; sources: number; testHint: string }): PlanFinding | null {
  if (input.tests === 0) {
    return finding({
      group: "review",
      kind: "tests.none",
      params: { testHint: input.testHint },
      category: "tests",
      severity: "high",
      title: "No tests found",
      file: null,
      line: null,
      why: "Tests decide pass or fail. Without them the run can only prove the project still builds, not that it behaves the same.",
      suggestion: `Add at least a smoke test (${input.testHint}) before migrating, or accept that behaviour is unverified.`,
      defaultDecision: "approve",
    });
  }
  if (input.sources >= 5 && input.tests / input.sources < 0.2) {
    return finding({
      group: "review",
      kind: "tests.few",
      params: { tests: String(input.tests), sources: String(input.sources), testHint: input.testHint },
      category: "tests",
      severity: "medium",
      title: `Few tests (${input.tests} test file${input.tests === 1 ? "" : "s"} for ${input.sources} source files)`,
      file: null,
      line: null,
      why: "A passing test step proves less when most code has no tests.",
      suggestion: "Review the diff of untested files closely, or add tests for the riskiest paths first.",
      defaultDecision: "approve",
    });
  }
  return null;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * Before → after excerpts for rules-pack edits, built from the edit details the
 * rules engine reports in dry mode ("a → b", "removed k", "group:artifact → x",
 * "section.name: old → new", "added types: node") and the file's own lines.
 * Unknown shapes are skipped: an excerpt is only shown when it is exact.
 */
export function ruleSnippets(text: string, file: string, details: string[], limit = 8): Snippet[] {
  const lines = text.split(/\r?\n/);
  const out: Snippet[] = [];
  const find = (pattern: RegExp) => {
    const index = lines.findIndex((line) => pattern.test(line));
    return index < 0 ? null : { line: index + 1, text: lines[index] };
  };
  for (const raw of details) {
    if (out.length >= limit) break;
    const detail = raw.replace(/ \(locked.*\)$/, "");
    let match: RegExpExecArray | null;
    if ((match = /^removed (.+)$/.exec(detail))) {
      const key = match[1].trim().split(/\s/)[0];
      const hit = find(new RegExp(`^\\s*"?${escapeRegExp(key)}"?\\s*[:=]`));
      if (hit) out.push({ file, line: hit.line, before: hit.text.trim(), after: "" });
      continue;
    }
    if ((match = /^added (\w+): (.+)$/.exec(detail))) {
      const values = match[2].replace(/\s*\(.*\)$/, "").split(/,\s*/).map((value) => `"${value.trim()}"`);
      out.push({ file, line: null, before: "", after: `"${match[1]}": [${values.join(", ")}]` });
      continue;
    }
    if ((match = /^([\w.-]+):([\w.-]+) → ([\w.-]+)$/.exec(detail))) {
      const hit = find(new RegExp(`<artifactId>\\s*${escapeRegExp(match[2])}\\s*</artifactId>`));
      if (hit) out.push({ file, line: hit.line, before: hit.text.trim(), after: hit.text.trim().replace(match[2], match[3]) });
      continue;
    }
    if ((match = /^(?:[\w]+\.)?([@\w/.-]+): (.+?) → (.+)$/.exec(detail))) {
      const [, key, from, to] = match;
      const hit = find(new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*"?${escapeRegExp(from)}"?`));
      if (hit) out.push({ file, line: hit.line, before: hit.text.trim().replace(/,$/, ""), after: hit.text.trim().replace(/,$/, "").replace(from, to) });
      continue;
    }
    if ((match = /^([\w.-]+) → ([\w.-]+)$/.exec(detail))) {
      const [, from, to] = match;
      const hit = find(new RegExp(`^\\s*${escapeRegExp(from)}\\s*([:=]|$)`));
      if (hit) out.push({ file, line: hit.line, before: hit.text.trim(), after: hit.text.trim().replace(from, to) });
    }
  }
  return out;
}

/** "Move it to an environment variable" with the key filled in; the value is never shown. */
export function secretFix(line: string): { summary: string; before: string; after: string } {
  const match = /^\s*([\w.\-\[\]]+)\s*([:=])/.exec(line);
  const key = match?.[1] ?? "secret";
  const env = key.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").toUpperCase() || "SECRET";
  const sep = match?.[2] === ":" ? ": " : "=";
  return {
    summary: `Take the value out of the file and read it from an environment variable (${env}). Set ${env} on your machine or server instead.`,
    before: `${key}${sep}***`,
    after: `${key}${sep}\${${env}}`,
  };
}

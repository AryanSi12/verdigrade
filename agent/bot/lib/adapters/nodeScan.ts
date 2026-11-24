import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { listRepoFiles, matchingLines, readText } from "./findings.js";

export type PackageJson = {
  name?: string;
  version?: string;
  engines?: Record<string, string>;
  volta?: Record<string, string>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  [key: string]: unknown;
};

export type ApiHit = { file: string; line: number; api: string; text: string; replacement: string; removedIn?: number | null };

export type TsconfigFacts = {
  file: string;
  module: string | null;
  moduleResolution: string | null;
  target: string | null;
  baseUrl: string | null;
  hasPaths: boolean;
  downlevelIteration: boolean;
  types: string[] | null;
  extends: string | null;
};

export type NodeScanResult = {
  ecosystem: "node";
  repoPath: string;
  packageManager: "npm" | "yarn" | "pnpm";
  lockfile: string | null;
  name: string | null;
  /** Major Node version the project declares (from engines, .nvmrc, .node-version, volta or @types/node). */
  nodeVersion: string | null;
  nodeSource: string | null;
  engines: string | null;
  typescript: string | null;
  typescriptVersion: string | null;
  typesNode: string | null;
  express: string | null;
  expressMajor: number | null;
  framework: "express" | null;
  scripts: { build: string | null; test: string | null };
  tsconfig: TsconfigFacts | null;
  expressDeprecated: ApiHit[];
  nodeDeprecated: ApiHit[];
  sourceFiles: number;
  testFiles: number;
  filesScanned: number;
  notes: string[];
};

export function readPackageJson(repoPath: string): PackageJson | null {
  const file = path.join(repoPath, "package.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as PackageJson;
  } catch (error) {
    throw new Error(`package.json is not valid JSON: ${(error as Error).message}`);
  }
}

export function dependencyRange(pkg: PackageJson, name: string): string | null {
  for (const section of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const) {
    const value = pkg[section]?.[name];
    if (typeof value === "string") return value;
  }
  return null;
}

/** Lowest major in a semver range: "^4.21.2" → 4, ">=18" → 18, "18.x || 20.x" → 18, "latest" → null. */
export function rangeMajor(range: string | null | undefined): number | null {
  if (!range) return null;
  const majors = [...String(range).matchAll(/(?:^|[\s|=<>~^v])(\d+)(?:\.|\b)/g)].map((match) => Number(match[1]));
  return majors.length ? Math.min(...majors) : null;
}

/** "~4.9.5" → "4.9", "^5" → "5.0". */
export function rangeMinorLine(range: string | null | undefined): string | null {
  if (!range) return null;
  const match = /(\d+)(?:\.(\d+))?/.exec(range);
  return match ? `${Number(match[1])}.${Number(match[2] ?? 0)}` : null;
}

/** Strip // and /* *\/ comments and trailing commas so tsconfig.json (JSONC) parses with JSON.parse. */
export function stripJsonc(text: string): string {
  let out = "";
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inString) {
      out += char;
      if (char === "\\") {
        out += next ?? "";
        index += 1;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
    } else if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      out += "\n";
    } else if (char === "/" && next === "*") {
      index += 2;
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) {
        if (text[index] === "\n") out += "\n";
        index += 1;
      }
      index += 1;
    } else {
      out += char;
    }
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

export function parseJsonc(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(stripJsonc(text));
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function tsconfigFacts(repoPath: string, file = "tsconfig.json"): TsconfigFacts | null {
  const text = readText(repoPath, file);
  if (!text) return null;
  const json = parseJsonc(text);
  if (!json) return null;
  const options = (json.compilerOptions ?? {}) as Record<string, unknown>;
  const str = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    file,
    module: str(options.module)?.toLowerCase() ?? null,
    moduleResolution: str(options.moduleResolution)?.toLowerCase() ?? null,
    target: str(options.target)?.toLowerCase() ?? null,
    baseUrl: str(options.baseUrl),
    hasPaths: Boolean(options.paths && typeof options.paths === "object"),
    downlevelIteration: options.downlevelIteration !== undefined,
    types: Array.isArray(options.types) ? (options.types as unknown[]).map(String) : null,
    extends: str(json.extends),
  };
}

type ApiRule = { pattern: RegExp; api: string; replacement: string; removedIn?: number | null };

/** Express 4 APIs removed in Express 5 (all handled by the official v5 codemod recipe). */
export const expressRules: ApiRule[] = [
  { pattern: /\breq\.param\s*\(/, api: "req.param(name)", replacement: "req.params / req.body / req.query" },
  { pattern: /\bres\.send\s*\(\s*\d{3}\s*\)/, api: "res.send(status)", replacement: "res.sendStatus(status)" },
  { pattern: /\bres\.(json|jsonp|send)\s*\([^()]*,\s*\d{3}\s*\)/, api: "res.json(obj, status)", replacement: "res.status(status).json(obj)" },
  { pattern: /\bres\.(redirect|location)\s*\(\s*['"]back['"]/, api: "res.redirect('back')", replacement: "res.redirect(req.get('Referrer') || '/')" },
  { pattern: /\bres\.redirect\s*\(\s*[^,()]+,\s*\d{3}\s*\)/, api: "res.redirect(url, status)", replacement: "res.redirect(status, url)" },
  { pattern: /\bres\.sendfile\s*\(/, api: "res.sendfile()", replacement: "res.sendFile()" },
  { pattern: /\b(app|router)\.del\s*\(/, api: "app.del()", replacement: "app.delete()" },
  { pattern: /\breq\.accepts(Charset|Encoding|Language)\s*\(/, api: "req.acceptsCharset/Encoding/Language()", replacement: "the plural acceptsCharsets/Encodings/Languages()" },
  { pattern: /\bexpress\.static\.mime\b/, api: "express.static.mime", replacement: "the mime-types package" },
];

/** Node core APIs that are deprecated, or removed in a given major. */
export const nodeRules: ApiRule[] = [
  { pattern: /\bnew\s+Buffer\s*\(/, api: "new Buffer()", replacement: "Buffer.from() / Buffer.alloc()", removedIn: null },
  {
    pattern: /\butil\.(isBoolean|isBuffer|isDate|isError|isFunction|isNull|isNullOrUndefined|isNumber|isObject|isPrimitive|isRegExp|isString|isSymbol|isUndefined)\s*\(/,
    api: "util.is*() type checks",
    replacement: "typeof / instanceof / Array.isArray",
    removedIn: 23,
  },
  { pattern: /\butil\.isArray\s*\(/, api: "util.isArray()", replacement: "Array.isArray()", removedIn: null },
  { pattern: /\bcrypto\.create(Cipher|Decipher)\s*\(/, api: "crypto.createCipher()/createDecipher()", replacement: "crypto.createCipheriv()/createDecipheriv()", removedIn: 22 },
  { pattern: /\butil\._extend\s*\(/, api: "util._extend()", replacement: "Object.assign()", removedIn: null },
  { pattern: /require\(\s*['"]punycode['"]\s*\)|from\s+['"]punycode['"]/, api: "punycode module", replacement: "the userland punycode package or URL / domainToASCII", removedIn: null },
  { pattern: /\burl\.parse\s*\(/, api: "url.parse()", replacement: "new URL()", removedIn: null },
  { pattern: /\bprocess\.binding\s*\(/, api: "process.binding()", replacement: "public APIs", removedIn: null },
  { pattern: /\bfs\.exists\s*\(/, api: "fs.exists()", replacement: "fs.access() / fs.existsSync()", removedIn: null },
  { pattern: /\bfs\.rmdir(Sync)?\s*\([^)]*recursive\s*:\s*true/, api: "fs.rmdir(path, { recursive })", replacement: "fs.rm(path, { recursive: true })", removedIn: null },
];

const sourceExt = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const testPath = /(^|\/)(test|tests|__tests__|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$/;

function scanApis(repoPath: string, files: string[], rules: ApiRule[]): ApiHit[] {
  const hits: ApiHit[] = [];
  for (const file of files) {
    const text = readText(repoPath, file);
    if (!text) continue;
    for (const rule of rules) {
      for (const hit of matchingLines(text, rule.pattern, 20)) {
        if (/^\s*(\/\/|\*)/.test(hit.text)) continue;
        hits.push({ file, line: hit.line, api: rule.api, text: hit.text, replacement: rule.replacement, removedIn: rule.removedIn ?? null });
      }
    }
  }
  return hits;
}

export function sourceFilesOf(repoPath: string): { all: string[]; sources: string[]; tests: string[] } {
  const all = listRepoFiles(repoPath);
  const code = all.filter((file) => sourceExt.test(file) && !file.endsWith(".d.ts"));
  return { all, sources: code.filter((file) => !testPath.test(file)), tests: code.filter((file) => testPath.test(file)) };
}

export function detectPackageManager(repoPath: string): { manager: "npm" | "yarn" | "pnpm"; lockfile: string | null } {
  if (existsSync(path.join(repoPath, "pnpm-lock.yaml"))) return { manager: "pnpm", lockfile: "pnpm-lock.yaml" };
  if (existsSync(path.join(repoPath, "yarn.lock"))) return { manager: "yarn", lockfile: "yarn.lock" };
  if (existsSync(path.join(repoPath, "package-lock.json"))) return { manager: "npm", lockfile: "package-lock.json" };
  if (existsSync(path.join(repoPath, "npm-shrinkwrap.json"))) return { manager: "npm", lockfile: "npm-shrinkwrap.json" };
  return { manager: "npm", lockfile: null };
}

export function scanNodeProject(repoPath: string): NodeScanResult {
  const pkg = readPackageJson(repoPath);
  if (!pkg) throw new Error("No package.json found in the project root.");
  const notes: string[] = [];
  const { manager, lockfile } = detectPackageManager(repoPath);
  const engines = typeof pkg.engines?.node === "string" ? pkg.engines.node : null;
  const nvmrc = readText(repoPath, ".nvmrc").trim() || null;
  const nodeVersionFile = readText(repoPath, ".node-version").trim() || null;
  const volta = typeof pkg.volta?.node === "string" ? pkg.volta.node : null;
  const typesNode = dependencyRange(pkg, "@types/node");
  const candidates: Array<[string | null, string]> = [
    [engines, "engines.node"],
    [nvmrc, ".nvmrc"],
    [nodeVersionFile, ".node-version"],
    [volta, "volta.node"],
    [typesNode, "@types/node"],
  ];
  let nodeVersion: string | null = null;
  let nodeSource: string | null = null;
  for (const [value, source] of candidates) {
    const major = rangeMajor(value);
    if (major !== null) {
      nodeVersion = String(major);
      nodeSource = source;
      break;
    }
  }
  if (!nodeVersion) notes.push("No Node version declared (engines.node, .nvmrc, .node-version or volta).");
  const typescript = dependencyRange(pkg, "typescript");
  const express = dependencyRange(pkg, "express");
  const { all, sources, tests } = sourceFilesOf(repoPath);
  const code = [...sources, ...tests];
  const tsconfig = tsconfigFacts(repoPath);
  if (existsSync(path.join(repoPath, "tsconfig.json")) && !tsconfig) notes.push("tsconfig.json could not be parsed.");
  if (tsconfig?.extends) notes.push(`tsconfig.json extends ${tsconfig.extends}; inherited options are not rewritten.`);
  const scripts = pkg.scripts ?? {};
  const testScript = typeof scripts.test === "string" && !/no test specified/.test(scripts.test) ? scripts.test : null;
  return {
    ecosystem: "node",
    repoPath,
    packageManager: manager,
    lockfile,
    name: typeof pkg.name === "string" ? pkg.name : null,
    nodeVersion,
    nodeSource,
    engines,
    typescript,
    typescriptVersion: rangeMinorLine(typescript),
    typesNode,
    express,
    expressMajor: rangeMajor(express),
    framework: express ? "express" : null,
    scripts: { build: typeof scripts.build === "string" ? scripts.build : null, test: testScript },
    tsconfig,
    expressDeprecated: express ? scanApis(repoPath, code, expressRules) : [],
    nodeDeprecated: scanApis(repoPath, code, nodeRules),
    sourceFiles: sources.length,
    testFiles: tests.length,
    filesScanned: all.length,
    notes,
  };
}

/** Test totals from node:test, Jest, Vitest or Mocha console output. */
export function parseNodeTestTotals(output: string): { testsRun: number; failures: number; errors: number; skipped: number; source: string } | null {
  const plain = output.replace(/\u001b\[[0-9;]*m/g, "");
  const nodeTest = /^[#ℹ]\s*tests\s+(\d+)\s*$/m.exec(plain);
  if (nodeTest) {
    const value = (name: string) => Number(new RegExp(`^[#ℹ]\\s*${name}\\s+(\\d+)\\s*$`, "m").exec(plain)?.[1] ?? 0);
    return { testsRun: Number(nodeTest[1]), failures: value("fail"), errors: value("cancelled"), skipped: value("skipped") + value("todo"), source: "node:test" };
  }
  const jest = /^Tests:\s+(.*?)(\d+)\s+total\s*$/m.exec(plain);
  if (jest) {
    const count = (name: string) => Number(new RegExp(`(\\d+)\\s+${name}`).exec(jest[1])?.[1] ?? 0);
    return { testsRun: Number(jest[2]), failures: count("failed"), errors: 0, skipped: count("skipped") + count("todo"), source: "jest" };
  }
  const vitest = /^\s*Tests\s+(.*?)\((\d+)\)\s*$/m.exec(plain);
  if (vitest) {
    const count = (name: string) => Number(new RegExp(`(\\d+)\\s+${name}`).exec(vitest[1])?.[1] ?? 0);
    return { testsRun: Number(vitest[2]), failures: count("failed"), errors: 0, skipped: count("skipped") + count("todo"), source: "vitest" };
  }
  const passing = /^\s*(\d+)\s+passing\b/m.exec(plain);
  if (passing) {
    const failing = Number(/^\s*(\d+)\s+failing\b/m.exec(plain)?.[1] ?? 0);
    const pending = Number(/^\s*(\d+)\s+pending\b/m.exec(plain)?.[1] ?? 0);
    return { testsRun: Number(passing[1]) + failing, failures: failing, errors: 0, skipped: pending, source: "mocha" };
  }
  return null;
}

/** First failing test, compiler error or thrown error from npm output. */
export function firstNodeFailure(output: string): string {
  const lines = output.replace(/\u001b\[[0-9;]*m/g, "").split(/\r?\n/);
  const index = lines.findIndex((line) => /error TS\d+|^\s*✖ (?!failing tests)|^not ok\b|●\s|AssertionError|^\s*\d+\)\s|Error: |npm ERR!|npm error /.test(line));
  if (index < 0) return "";
  return lines.slice(index, index + 10).join("\n").trim();
}

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { maskSecrets } from "./github.js";
import { maskSecretLine } from "./plan.js";
import { runCommand } from "./process.js";
import { buildLauncher, detectBuildTool, type BuildTool } from "./repo.js";

/** Pure building blocks of the live preview: ports, health, JDKs, commands, endpoints, git export, the fetch proxy. */

export const previewHost = "127.0.0.1";

// ---- environment: nothing of Verdigrade's own configuration or tokens reaches the previewed app --------------------

const passThrough = new Set(
  [
    "PATH", "PATHEXT", "SYSTEMROOT", "COMSPEC", "WINDIR", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "HOMEDRIVE", "HOMEPATH",
    "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMDATA", "LANG", "LC_ALL", "USER", "USERNAME", "SHELL", "TZ", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "SSL_CERT_FILE",
    "MAVEN_OPTS", "MAVEN_ARGS", "JAVA_TOOL_OPTIONS", "M2_HOME", "GRADLE_USER_HOME",
  ].map((name) => name.toUpperCase()),
);
const secretName = /TOKEN|SECRET|PASSW|API_?KEY|CREDENTIAL|CURSOR|LEAPFROG|VERDIGRADE|JAVA_MIGRATOR|GITHUB|^GH_|ASKPASS|PRIVATE|AUTH/i;

/** A small allow-list copy of the environment (no tokens, no VERDIGRADE_* / LEAPFROG_*, no API keys) plus the explicit extras. */
export function previewEnv(base: NodeJS.ProcessEnv, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(base)) {
    if (value == null || !passThrough.has(name.toUpperCase()) || secretName.test(name)) continue;
    env[name] = value;
  }
  return { ...env, ...extra };
}

/** Mask token-shaped text and credential-looking `key=value` lines before a log line is kept or shown. */
export function maskLogLine(line: string): string {
  return maskSecretLine(maskSecrets(line));
}

// ---- ports and health -------------------------------------------------------------------------------------------

export function pickFreePort(avoid: ReadonlySet<number> = new Set(), host = previewHost): Promise<number> {
  return new Promise((resolve, reject) => {
    const attempt = (left: number) => {
      const server = net.createServer();
      server.unref();
      server.once("error", reject);
      server.listen(0, host, () => {
        const address = server.address();
        const port = typeof address === "object" && address ? address.port : 0;
        server.close(() => {
          if (port && !avoid.has(port)) resolve(port);
          else if (left > 0) attempt(left - 1);
          else reject(new Error("Could not find a free port."));
        });
      });
    };
    attempt(10);
  });
}

/** Any answer below 500 means a server is listening and handling requests (200, 401 and 404 included). */
export function isUpStatus(status: number | null | undefined): boolean {
  return typeof status === "number" && status >= 200 && status < 500;
}

export function probe(port: number, urlPath = "/", timeoutMs = 2000, host = previewHost): Promise<number | null> {
  return new Promise((resolve) => {
    const request = http.get({ host, port, path: urlPath, timeout: timeoutMs, headers: { accept: "*/*" } }, (response) => {
      response.resume();
      resolve(response.statusCode ?? null);
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });
    request.on("error", () => resolve(null));
  });
}

export type HealthOptions = { timeoutMs?: number; intervalMs?: number; paths?: string[]; isAlive?: () => boolean; probeFn?: (port: number, path: string) => Promise<number | null> };

/** Poll until one of the paths answers with an "up" status. `lastStatus` explains a timeout ("it answered 500"). */
export async function waitForHealth(port: number, options: HealthOptions = {}): Promise<{ up: boolean; status: number | null; path: string | null; lastStatus: number | null; exited: boolean }> {
  const deadline = Date.now() + (options.timeoutMs ?? 120_000);
  const paths = options.paths?.length ? options.paths : ["/"];
  const check = options.probeFn ?? ((p: number, urlPath: string) => probe(p, urlPath));
  let lastStatus: number | null = null;
  while (Date.now() < deadline) {
    if (options.isAlive && !options.isAlive()) return { up: false, status: null, path: null, lastStatus, exited: true };
    for (const urlPath of paths) {
      const status = await check(port, urlPath);
      if (status != null) lastStatus = status;
      if (isUpStatus(status)) return { up: true, status, path: urlPath, lastStatus: status, exited: false };
    }
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs ?? 500));
  }
  return { up: false, status: null, path: null, lastStatus, exited: false };
}

// ---- JDKs ---------------------------------------------------------------------------------------------------------

export type Jdk = { home: string; major: number; javac: boolean; source: string };

/** "1.8.0_392" → 8, "21.0.3" → 21, "17" → 17. */
export function javaMajor(version: string | null | undefined): number | null {
  const match = /^\s*(?:1\.)?(\d{1,2})(?:[._+-]|$)/.exec(String(version ?? ""));
  return match ? Number(match[1]) : null;
}

/** Major version of a JDK home from its `release` file (no process is started). */
export function jdkMajorFromRelease(home: string): number | null {
  try {
    const text = readFileSync(path.join(home, "release"), "utf8");
    return javaMajor(/JAVA_VERSION\s*=\s*"?([^"\r\n]+)"?/.exec(text)?.[1]);
  } catch {
    return null;
  }
}

function isJdkHome(home: string, windows: boolean): boolean {
  return existsSync(path.join(home, "bin", windows ? "java.exe" : "java"));
}

export type DiscoverOptions = {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  home?: string;
  extraRoots?: string[];
  /** Replaces the per-platform install folders (Program Files\\Java, /usr/lib/jvm, ...). Tests pass `[]` so a JDK installed on the machine is not found. */
  systemRoots?: string[];
};

/** The usual install folders of the platform, each holding one folder per JDK. */
export function systemJdkRoots(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, home: string): string[] {
  const roots: string[] = [];
  if (platform === "win32") {
    for (const base of [env.ProgramFiles, env["ProgramFiles(x86)"], "C:\\Program Files"].filter((item): item is string => Boolean(item))) {
      for (const vendor of ["Java", "Eclipse Adoptium", "Microsoft", "Zulu", "Amazon Corretto", "Semeru", "BellSoft", "Eclipse Foundation"]) roots.push(path.join(base, vendor));
    }
  } else if (platform === "darwin") {
    roots.push("/Library/Java/JavaVirtualMachines", path.join(home, "Library", "Java", "JavaVirtualMachines"), "/opt/homebrew/opt", "/usr/local/opt");
  } else {
    roots.push("/usr/lib/jvm", "/usr/java", "/opt", "/opt/java");
  }
  return roots;
}

/** Folders that hold several JDKs (each child is a JDK home), per platform. */
export function jdkRoots(options: DiscoverOptions = {}): string[] {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.home ?? os.homedir();
  const configured = (env.VERDIGRADE_JDK_DIRS ?? env.LEAPFROG_JDK_DIRS ?? "").split(path.delimiter).filter(Boolean);
  const roots = [...configured, ...(options.extraRoots ?? []), path.join(home, ".jdks"), path.join(home, ".sdkman", "candidates", "java"), path.join(home, "tools")];
  roots.push(...(options.systemRoots ?? systemJdkRoots(env, platform, home)));
  return [...new Set(roots)];
}

/** Every JDK this computer has that Verdigrade can find: JAVA_HOME, java on PATH, and the usual install folders. */
export function discoverJdks(options: DiscoverOptions = {}): Jdk[] {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const windows = platform === "win32";
  const found = new Map<string, Jdk>();
  const add = (candidate: string, source: string) => {
    const homes = [candidate, path.join(candidate, "Contents", "Home")];
    for (const home of homes) {
      if (!isJdkHome(home, windows)) continue;
      let real = home;
      try {
        real = realpathSync(home);
      } catch {
        /* keep as given */
      }
      const key = windows ? path.normalize(real).toLowerCase() : real;
      if (found.has(key)) return;
      const major = jdkMajorFromRelease(real) ?? jdkMajorFromRelease(home);
      if (major == null) return;
      found.set(key, { home: real, major, javac: existsSync(path.join(real, "bin", windows ? "javac.exe" : "javac")), source });
      return;
    }
  };
  if (env.JAVA_HOME) add(env.JAVA_HOME, "JAVA_HOME");
  for (const dir of (env.PATH ?? env.Path ?? "").split(path.delimiter).filter(Boolean)) {
    const java = path.join(dir, windows ? "java.exe" : "java");
    if (!existsSync(java)) continue;
    try {
      add(path.dirname(path.dirname(realpathSync(java))), "PATH");
    } catch {
      /* ignore */
    }
  }
  for (const root of jdkRoots(options)) {
    let children: string[] = [];
    try {
      children = readdirSync(root);
    } catch {
      continue;
    }
    for (const child of children) add(path.join(root, child), root);
  }
  return [...found.values()].sort((a, b) => a.major - b.major);
}

/** exact: the very major (a JDK with javac first). atLeast: the smallest major that is not older. */
export function chooseJdk(jdks: Jdk[], wanted: number, mode: "exact" | "atLeast"): Jdk | null {
  const pool = jdks.filter((jdk) => (mode === "exact" ? jdk.major === wanted : jdk.major >= wanted));
  if (!pool.length) return null;
  return [...pool].sort((a, b) => a.major - b.major || Number(b.javac) - Number(a.javac))[0];
}

/** The JDK on JAVA_HOME / PATH, which is the one Verdigrade itself builds with. */
export function activeJdk(jdks: Jdk[], env: NodeJS.ProcessEnv = process.env): Jdk | null {
  return jdks.find((jdk) => jdk.source === "JAVA_HOME") ?? jdks.find((jdk) => jdk.source === "PATH") ?? (env.JAVA_HOME ? null : jdks[jdks.length - 1] ?? null);
}

// ---- commands ----------------------------------------------------------------------------------------------------------

export type Step = { label: string; command: string; args: string[]; cwd: string; env?: Record<string, string>; timeoutMs?: number };

const isWindows = (platform: NodeJS.Platform) => platform === "win32";

export function javaBin(jdkHome: string | null, platform: NodeJS.Platform = process.platform): string {
  return jdkHome ? path.join(jdkHome, "bin", isWindows(platform) ? "java.exe" : "java") : "java";
}

/** Build the runnable jar (tests skipped: the run already tested it). Maven or Gradle, wrapper first. */
export function javaBuildStep(dir: string, jdkHome: string | null, platform: NodeJS.Platform = process.platform): Step {
  const tool: BuildTool = detectBuildTool(dir);
  const launcher = buildLauncher(dir, tool, platform);
  const args = tool === "maven" ? ["-B", "-q", "package", "-DskipTests"] : ["-q", "bootJar", "-x", "test", "--no-daemon"];
  return { label: `${tool === "maven" ? "mvn package" : "gradle bootJar"} (tests skipped)`, command: launcher.command, args: [...launcher.prefixArgs, ...args], cwd: dir, env: jdkHome ? { JAVA_HOME: jdkHome } : {}, timeoutMs: 15 * 60_000 };
}

/** The Spring Boot jar a build left behind (never a sources/javadoc/plain/original jar). */
export function findRunnableJar(dir: string): string | null {
  const jars: Array<{ file: string; mtime: number }> = [];
  for (const sub of ["target", path.join("build", "libs")]) {
    const folder = path.join(dir, sub);
    let names: string[] = [];
    try {
      names = readdirSync(folder);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!/\.jar$/i.test(name) || /-(sources|javadoc|plain|tests)\.jar$/i.test(name) || /\.original$/i.test(name)) continue;
      const file = path.join(folder, name);
      try {
        jars.push({ file, mtime: statSync(file).mtimeMs });
      } catch {
        /* ignore */
      }
    }
  }
  return jars.sort((a, b) => b.mtime - a.mtime)[0]?.file ?? null;
}

/** `java -jar app.jar --server.port=P --server.address=127.0.0.1` (the app only ever listens on loopback). */
export function javaRunStep(options: { jar: string; port: number; jdkHome: string | null; cwd: string; platform?: NodeJS.Platform }): Step {
  return {
    label: "java -jar",
    command: javaBin(options.jdkHome, options.platform),
    args: ["-jar", options.jar, `--server.port=${options.port}`, `--server.address=${previewHost}`],
    cwd: options.cwd,
    env: { ...(options.jdkHome ? { JAVA_HOME: options.jdkHome } : {}), SERVER_PORT: String(options.port), SERVER_ADDRESS: previewHost },
  };
}

export const npmBin = (platform: NodeJS.Platform = process.platform) => (isWindows(platform) ? "npm.cmd" : "npm");

export function nodeInstallStep(dir: string, platform: NodeJS.Platform = process.platform): Step {
  return { label: "npm install", command: npmBin(platform), args: ["install", "--no-audit", "--no-fund"], cwd: dir, timeoutMs: 15 * 60_000 };
}

export function nodeBuildStep(dir: string, platform: NodeJS.Platform = process.platform): Step {
  return { label: "npm run build", command: npmBin(platform), args: ["run", "build", "--if-present"], cwd: dir, timeoutMs: 10 * 60_000 };
}

/** A tiny preload that forces every server this Node process starts onto 127.0.0.1 (apps that listen on all interfaces included). */
export const bindLocalSource = `"use strict";
const net = require("net");
const original = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  const first = args[0];
  if (first && typeof first === "object" && !("path" in first) && !("fd" in first)) {
    args[0] = Object.assign({}, first, { host: "127.0.0.1" });
  } else if (typeof first === "number" || (typeof first === "string" && /^\\d+$/.test(first))) {
    if (typeof args[1] === "string") args[1] = "127.0.0.1";
    else args.splice(1, 0, "127.0.0.1");
  }
  return original.apply(this, args);
};
`;

export function writeBindLocal(folder: string): string {
  mkdirSync(folder, { recursive: true });
  const file = path.join(folder, "bind-local.cjs");
  writeFileSync(file, bindLocalSource, "utf8");
  return file;
}

export function nodeRunStep(options: { dir: string; port: number; start: string | null; main: string | null; bindLocal: string; platform?: NodeJS.Platform }): Step | null {
  const platform = options.platform ?? process.platform;
  const env = { PORT: String(options.port), HOST: previewHost, NODE_OPTIONS: `--require "${options.bindLocal.replace(/\\/g, "/")}"` };
  if (options.start) return { label: "npm start", command: npmBin(platform), args: ["start"], cwd: options.dir, env };
  if (options.main) return { label: `node ${options.main}`, command: "node", args: [options.main], cwd: options.dir, env };
  return null;
}

export function pythonInstallArgs(dir: string): string[] {
  const files = ["requirements.txt", "requirements-dev.txt", "requirements_dev.txt"].filter((name) => existsSync(path.join(dir, name)));
  if (files.length) return files.flatMap((name) => ["-r", name]);
  if (existsSync(path.join(dir, "pyproject.toml")) || existsSync(path.join(dir, "setup.py"))) return ["."];
  return [];
}

export type PythonApp = { kind: "flask"; module: string } | { kind: "django" };

const skipDirs = new Set(["node_modules", "venv", ".venv", "tests", "test", "__pycache__", ".git", "target", "build", "dist", "docs", "migrations"]);

/** Find the Flask app module (app.py/wsgi.py/… or a package with create_app / Flask(...)), or a Django project. */
export function detectPythonApp(dir: string): PythonApp | null {
  const flaskish = (file: string) => {
    try {
      return /\bFlask\s*\(|def\s+create_app\s*\(/.test(readFileSync(file, "utf8"));
    } catch {
      return false;
    }
  };
  for (const name of ["wsgi", "app", "main", "application", "server"]) {
    if (existsSync(path.join(dir, `${name}.py`)) && flaskish(path.join(dir, `${name}.py`))) return { kind: "flask", module: name };
  }
  let entries: string[] = [];
  try {
    entries = readdirSync(dir).sort();
  } catch {
    return null;
  }
  for (const name of entries) {
    if (skipDirs.has(name) || name.startsWith(".")) continue;
    const init = path.join(dir, name, "__init__.py");
    if (existsSync(init) && flaskish(init)) return { kind: "flask", module: name };
    for (const file of ["app.py", "wsgi.py"]) if (existsSync(path.join(dir, name, file)) && flaskish(path.join(dir, name, file))) return { kind: "flask", module: `${name}.${file.replace(/\.py$/, "")}` };
  }
  if (existsSync(path.join(dir, "manage.py"))) return { kind: "django" };
  return null;
}

export function pythonRunStep(options: { dir: string; python: string; port: number; app: PythonApp }): Step {
  const env = { PORT: String(options.port), FLASK_RUN_PORT: String(options.port), FLASK_RUN_HOST: previewHost, PYTHONUNBUFFERED: "1", PYTHONDONTWRITEBYTECODE: "1", PYTHONUTF8: "1" };
  if (options.app.kind === "django") {
    return { label: "manage.py runserver", command: options.python, args: ["manage.py", "runserver", `${previewHost}:${options.port}`, "--noreload"], cwd: options.dir, env };
  }
  return { label: "flask run", command: options.python, args: ["-m", "flask", "--app", options.app.module, "run", "--host", previewHost, "--port", String(options.port), "--no-reload"], cwd: options.dir, env: { ...env, FLASK_APP: options.app.module } };
}

// ---- copying and git export -----------------------------------------------------------------------------------------------

const copySkip = new Set(["target", ".gradle", "node_modules", ".git", ".idea", ".venv", "venv", "__pycache__", ".pytest_cache"]);

/** Copy a project without build output, dependencies, git history or the plan file. */
export function copyProject(source: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  cpSync(source, dest, {
    recursive: true,
    filter: (file) => {
      if (file === source) return true;
      const name = path.basename(file);
      if (copySkip.has(name)) return false;
      if (name === "migration-plan.json" && path.dirname(file) === source) return false;
      if (name === "build" && !path.relative(source, file).split(path.sep).includes("src")) return false;
      return true;
    },
  });
}

/**
 * Write the files of one commit into `dest` without touching the repository's index or work tree
 * (a temporary index file and `checkout-index --prefix`). Returns the project folder inside `dest`
 * (a sub-folder when the project is not at the repository root).
 */
export async function exportCommit(options: { gitDir: string; commit: string; dest: string; subdir?: string; tmp?: string }): Promise<string> {
  mkdirSync(options.dest, { recursive: true });
  const index = path.join(options.tmp ?? os.tmpdir(), `leapfrog-idx-${process.pid}-${Date.now()}`);
  const env = { ...process.env, GIT_INDEX_FILE: index, GIT_WORK_TREE: options.dest, GIT_DIR: options.gitDir };
  try {
    const read = await runCommand("git", ["read-tree", options.commit], { cwd: options.dest, env, timeoutMs: 120_000 });
    if (!read.ok) throw new Error(`git read-tree failed: ${read.output.trim().slice(-300)}`);
    const prefix = options.dest.split(path.sep).join("/").replace(/\/?$/, "/");
    const out = await runCommand("git", ["checkout-index", "-a", "-f", `--prefix=${prefix}`], { cwd: options.dest, env, timeoutMs: 300_000 });
    if (!out.ok) throw new Error(`git checkout-index failed: ${out.output.trim().slice(-300)}`);
  } finally {
    rmSync(index, { force: true });
  }
  return options.subdir ? path.join(options.dest, options.subdir) : options.dest;
}

// ---- endpoints and credentials ------------------------------------------------------------------------------------------------

function walk(dir: string, accept: (file: string) => boolean, limit = 600): string[] {
  const out: string[] = [];
  const visit = (current: string, depth: number) => {
    if (depth > 12 || out.length >= limit) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= limit) return;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", ".git", "target", "venv", ".venv", "build", "dist", "__pycache__"].includes(entry.name)) visit(full, depth + 1);
      } else if (accept(full)) out.push(full);
    }
  };
  visit(dir, 0);
  return out;
}

const joinPath = (prefix: string, tail: string) => `/${[prefix, tail].map((part) => part.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/")}`;
const annotationValue = /(?:value\s*=\s*|path\s*=\s*)?(?:\{\s*)?"([^"]*)"/;

/** GET paths without variables from Spring controllers (class-level prefix + @GetMapping / @RequestMapping(method = GET)). */
export function springEndpoints(dir: string): string[] {
  const found: string[] = [];
  const pom = readIfExists(path.join(dir, "pom.xml")) + readIfExists(path.join(dir, "build.gradle")) + readIfExists(path.join(dir, "build.gradle.kts"));
  if (/spring-boot-starter-actuator/.test(pom)) found.push("/actuator/health");
  for (const file of walk(path.join(dir, "src", "main"), (name) => name.endsWith(".java"))) {
    const text = readIfExists(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    if (!/@(Rest)?Controller\b/.test(text)) continue;
    const classAt = text.search(/\bclass\s+\w+/);
    const head = classAt >= 0 ? text.slice(0, classAt) : "";
    const prefix = annotationValue.exec(/@RequestMapping\s*\(([^)]*)\)/.exec(head)?.[1] ?? "")?.[1] ?? "";
    const body = classAt >= 0 ? text.slice(classAt) : text;
    for (const match of body.matchAll(/@(GetMapping|RequestMapping)\s*(?:\(([^)]*)\))?/g)) {
      const args = match[2] ?? "";
      if (match[1] === "RequestMapping" && !/RequestMethod\.GET\b/.test(args)) continue;
      const value = annotationValue.exec(args)?.[1] ?? "";
      const full = joinPath(prefix, value);
      if (!/[{}*]/.test(full)) found.push(full);
    }
  }
  return found;
}

export function nodeEndpoints(dir: string): string[] {
  const found: string[] = [];
  for (const file of walk(dir, (name) => /\.(?:[cm]?js|ts)$/.test(name) && !/\.test\.|\.spec\.|\.d\.ts$/.test(name))) {
    const text = readIfExists(file);
    for (const match of text.matchAll(/\b(?:app|router|server|api)\.get\(\s*['"`]([^'"`]+)['"`]/g)) if (!/[:*()]/.test(match[1])) found.push(match[1].startsWith("/") ? match[1] : `/${match[1]}`);
  }
  return found;
}

export function pythonEndpoints(dir: string): string[] {
  const found: string[] = [];
  for (const file of walk(dir, (name) => name.endsWith(".py") && !/(^|[\\/])(test_|conftest)/.test(path.basename(name)))) {
    const text = readIfExists(file);
    const prefix = /url_prefix\s*=\s*["']([^"']*)["']/.exec(text)?.[1] ?? "";
    for (const match of text.matchAll(/@\w+\.(route|get)\(\s*["']([^"']+)["']([^)]*)\)/g)) {
      if (match[1] === "route" && /methods\s*=/.test(match[3]) && !/["']GET["']/i.test(match[3])) continue;
      if (/[<>]/.test(match[2])) continue;
      found.push(joinPath(prefix, match[2]));
    }
  }
  return found;
}

function readIfExists(file: string): string {
  try {
    return statSync(file).size > 1_000_000 ? "" : readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/** A short, ordered list of GET paths worth clicking (health first), at most `limit`. */
export function suggestEndpoints(ecosystem: string, dir: string, limit = 8): string[] {
  const raw = ecosystem === "node" ? nodeEndpoints(dir) : ecosystem === "python" ? pythonEndpoints(dir) : springEndpoints(dir);
  const unique = [...new Set(["/", ...raw])];
  const rank = (item: string) => (/health|status|ping/i.test(item) ? 0 : item === "/" ? 1 : 2);
  return unique.sort((a, b) => rank(a) - rank(b) || a.length - b.length).slice(0, limit);
}

const demoMarker = /not-a-secret|demo|sample|fake|example|dummy|test-only/i;
const loginWord = /\b(?:user(?:name)?|login|log in|sign in)\b/i;
const passwordWord = /\bpass(?:word|wd)?\b/i;
const keyValueSecret = /\b(?:password|passwd|api[-_ ]?key|token)\s*[:=]\s*\S/i;

/** Sample credentials the project documents for its demo (only lines that say they are fake), so the user can log in. */
export function sampleCredentials(dir: string, limit = 4): string[] {
  const files = [] as string[];
  try {
    for (const name of readdirSync(dir)) if (/^readme/i.test(name)) files.push(path.join(dir, name));
  } catch {
    /* none */
  }
  for (const name of ["src/main/resources/application.properties", "src/main/resources/application.yml", ".env.example", "config.example.json"]) files.push(path.join(dir, name));
  const lines: string[] = [];
  for (const file of files) {
    const isReadme = /^readme/i.test(path.basename(file));
    for (const line of readIfExists(file).split(/\r?\n/)) {
      // Comment lines in config files explain settings; they are not logins.
      if (isReadme ? /^\s*#{1,6}\s/.test(line) : /^\s*(#|\/\/|;|<!--)/.test(line)) continue;
      const text = line.replace(/^[\s>*\-|`]+/, "").trim();
      if (!text || text.length > 200 || !((loginWord.test(text) && passwordWord.test(text)) || keyValueSecret.test(text)) || !demoMarker.test(text)) continue;
      const masked = maskLogLine(text);
      if (!lines.includes(masked)) lines.push(masked);
      if (lines.length >= limit) return lines;
    }
  }
  return lines;
}

// ---- the compare proxy ----------------------------------------------------------------------------------------------------

export type ProxyReply = { status: number | null; ms: number; contentType: string | null; body: string; truncated: boolean; error: string | null };

const blockedHeaders = new Set(["host", "content-length", "connection", "transfer-encoding", "upgrade"]);

/** Only simple header names and values; never anything that could change the target or smuggle a request. */
export function cleanHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {}).slice(0, 6)) {
    if (!/^[A-Za-z0-9-]{1,40}$/.test(name) || blockedHeaders.has(name.toLowerCase())) continue;
    if (typeof value !== "string" || value.length > 300 || /[\r\n]/.test(value)) continue;
    out[name] = value;
  }
  return out;
}

export function validProxyPath(urlPath: string): boolean {
  return /^\/[^\s#\\]*$/.test(urlPath) && !urlPath.startsWith("//") && urlPath.length <= 500;
}

/** GET http://127.0.0.1:<port><path> and return status, time and the first part of the body. */
export function proxyGet(port: number, urlPath: string, headers: Record<string, string> = {}, options: { maxChars?: number; timeoutMs?: number } = {}): Promise<ProxyReply> {
  const max = options.maxChars ?? 20_000;
  const started = Date.now();
  return new Promise((resolve) => {
    if (!validProxyPath(urlPath)) return resolve({ status: null, ms: 0, contentType: null, body: "", truncated: false, error: "The path must start with / and contain no spaces." });
    const request = http.get({ host: previewHost, port, path: urlPath, timeout: options.timeoutMs ?? 8000, headers: { accept: "application/json, text/plain, */*", ...cleanHeaders(headers) } }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let truncated = false;
      response.on("data", (chunk: Buffer) => {
        if (size >= max * 4) {
          truncated = true;
          return;
        }
        size += chunk.length;
        chunks.push(chunk);
      });
      response.on("end", () => {
        let body = Buffer.concat(chunks).toString("utf8");
        if (body.length > max) {
          body = body.slice(0, max);
          truncated = true;
        }
        resolve({ status: response.statusCode ?? null, ms: Date.now() - started, contentType: String(response.headers["content-type"] ?? "") || null, body: maskLogLine(body), truncated, error: null });
      });
    });
    request.on("timeout", () => {
      request.destroy();
      resolve({ status: null, ms: Date.now() - started, contentType: null, body: "", truncated: false, error: "Timed out after 8 s." });
    });
    request.on("error", (error) => resolve({ status: null, ms: Date.now() - started, contentType: null, body: "", truncated: false, error: error.message }));
  });
}

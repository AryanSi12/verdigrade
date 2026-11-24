import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { javaRunStep, pickFreePort, previewEnv, previewHost, waitForHealth } from "./previewKit.js";
import { startServerProcess } from "./process.js";
import type { PageCheckState, PageProblem } from "./types.js";

/**
 * Page check: a Java app that ships a static page (src/main/resources/static or public) is started from its packaged
 * jar on loopback, the page is loaded, and the API calls its JavaScript makes are tried the way the page makes them
 * (the CSRF cookie goes back as a header). Unit tests cannot see these problems, because they call the canonical
 * paths and never run the page's JavaScript. It only reports what it saw; it never edits anything.
 */

export type Source = { file: string; text: string };
export type ApiCall = { method: string; path: string; params: string[]; file: string };

// ---- finding and reading the page ------------------------------------------------------------------------------

const staticRoots = [path.join("src", "main", "resources", "static"), path.join("src", "main", "resources", "public")];

/** The page's own HTML and JavaScript files (relative, forward slashes), or [] when the project has none. */
export function frontendSourceFiles(dir: string, limit = 60): string[] {
  const out: string[] = [];
  const visit = (folder: string, depth: number) => {
    if (depth > 6 || out.length >= limit) return;
    let entries;
    try {
      entries = readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== "webjars") visit(full, depth + 1);
      } else if (/\.(?:js|mjs|html?)$/i.test(entry.name) && !/\.min\.js$/i.test(entry.name)) {
        out.push(path.relative(dir, full).split(path.sep).join("/"));
      }
      if (out.length >= limit) return;
    }
  };
  for (const root of staticRoots) visit(path.join(dir, root), 0);
  return out;
}

export function hasStaticFrontend(dir: string): boolean {
  return frontendSourceFiles(dir, 1).length > 0;
}

export function readFrontendSources(dir: string): Source[] {
  const sources: Source[] = [];
  for (const file of frontendSourceFiles(dir)) {
    try {
      const full = path.join(dir, file);
      if (statSync(full).size <= 500_000) sources.push({ file, text: readFileSync(full, "utf8") });
    } catch {
      /* unreadable files are skipped */
    }
  }
  return sources;
}

// ---- reading the JavaScript: API calls, CSRF names, the fields it reads ------------------------------------------

const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\/|(^|[^:"'`\\])\/\/.*$/gm, "$1");
const assetPath = /\.(?:js|mjs|css|png|jpe?g|gif|svg|ico|html?|map|woff2?|ttf)$/i;
const methods = "GET|POST|PUT|PATCH|DELETE";
const queryName = /query|params|search|qs|filter/i;

/** `'/api/tasks/' + id + '/complete/'` or a template literal into "/api/tasks/{id}/complete/" (query parts are dropped). */
function pathFromExpression(expression: string): { path: string; params: string[] } | null {
  const tokens: Array<{ literal: string } | { name: string }> = [];
  const parts = expression.trim().split(/\s*\+\s*/);
  for (const part of parts) {
    const quoted = part.match(/^(['"`])([\s\S]*)\1$/);
    if (quoted) {
      if (quoted[1] === "`") {
        let rest = quoted[2];
        while (rest.length) {
          const hole = rest.match(/\$\{([^}]*)\}/);
          if (!hole || hole.index === undefined) {
            tokens.push({ literal: rest });
            break;
          }
          if (hole.index > 0) tokens.push({ literal: rest.slice(0, hole.index) });
          tokens.push({ name: hole[1].trim() });
          rest = rest.slice(hole.index + hole[0].length);
        }
      } else {
        tokens.push({ literal: quoted[2] });
      }
    } else if (part.trim()) {
      tokens.push({ name: part.trim() });
    }
  }
  let built = "";
  const params: string[] = [];
  for (const token of tokens) {
    if ("literal" in token) {
      built += token.literal;
    } else if (!/\/$/.test(built) || queryName.test(token.name)) {
      // Named like a query string (or not after a "/"): not part of the path.
    } else {
      const base = token.name.replace(/[^A-Za-z0-9_]/g, "") || "id";
      const name = params.includes(base) ? `${base}${params.length}` : base;
      params.push(name);
      built += `{${name}}`;
    }
  }
  const clean = built.split("?")[0];
  if (!clean.startsWith("/") || clean.startsWith("//") || assetPath.test(clean) || clean.length < 2) return null;
  return { path: clean, params };
}

/** The API calls the page's JavaScript makes: path template, HTTP method and the file they are in. */
export function extractApiCalls(sources: Source[]): ApiCall[] {
  const found = new Map<string, ApiCall>();
  const add = (method: string, expression: string, file: string) => {
    const parsed = pathFromExpression(expression);
    if (!parsed) return;
    const key = `${method} ${parsed.path}`;
    if (!found.has(key)) found.set(key, { method, path: parsed.path, params: parsed.params, file });
  };
  for (const source of sources) {
    if (!/\.m?js$/i.test(source.file)) continue;
    const text = stripComments(source.text);
    for (const match of text.matchAll(new RegExp(`(['"])(${methods})\\1\\s*,\\s*([^,)]+?)\\s*[,)]`, "g"))) add(match[2], match[3], source.file);
    for (const match of text.matchAll(/fetch\(\s*([^,)]+?)\s*,\s*\{[^}]*?method\s*:\s*(['"])(\w+)\2/g)) add(match[3].toUpperCase(), match[1], source.file);
    for (const match of text.matchAll(/fetch\(\s*([^,)]+?)\s*\)/g)) add("GET", match[1], source.file);
  }
  // A plain "/api/..." string that no call above used is still something the page asks for (GET).
  for (const source of sources) {
    if (!/\.m?js$/i.test(source.file)) continue;
    for (const match of stripComments(source.text).matchAll(/(['"`])(\/api\/[A-Za-z0-9_\-./{}$]*)\1/g)) {
      const known = [...found.values()].some((call) => call.path.startsWith(match[2].replace(/\$\{[^}]*\}/g, "{x}").split("{")[0]));
      if (!known) add("GET", `'${match[2]}'`, source.file);
    }
  }
  return [...found.values()];
}

export type CsrfNames = { header: string | null; cookie: string | null };

/** The CSRF header the page sends and the cookie it reads it from, when its JavaScript has them. */
export function csrfNames(sources: Source[]): CsrfNames {
  const text = sources.filter((source) => /\.m?js$/i.test(source.file)).map((source) => stripComments(source.text)).join("\n");
  const header = text.match(/['"](X-[A-Za-z-]*(?:XSRF|CSRF)[A-Za-z-]*)['"]/i)?.[1] ?? null;
  const cookie = text.match(/['"]((?:XSRF|CSRF)-TOKEN)['"]/i)?.[1] ?? (header ? "XSRF-TOKEN" : null);
  return { header, cookie };
}

/** Property names the JavaScript reads: every `.name` that is not a call on a global. */
export function readProperties(sources: Source[]): Set<string> {
  const out = new Set<string>();
  for (const source of sources) {
    if (!/\.m?js$/i.test(source.file)) continue;
    for (const match of stripComments(source.text).matchAll(/\.([A-Za-z_$][\w$]*)/g)) out.add(match[1]);
  }
  return out;
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** What the JavaScript does with `.name`: arithmetic (a number) or string methods (a string); null when it cannot tell. */
export function expectedType(sources: Source[], name: string): "number" | "string" | null {
  const key = escapeRegex(name);
  const text = sources.filter((source) => /\.m?js$/i.test(source.file)).map((source) => stripComments(source.text)).join("\n");
  const number = [
    new RegExp(`Math\\.\\w+\\(\\s*[\\w$.]*\\.${key}\\b`),
    new RegExp(`\\.${key}\\s*[<>]=?\\s*-?\\d`),
    new RegExp(`\\.${key}\\s*[-*/%]\\s*[\\w$(]`),
    new RegExp(`[\\w$)\\]]\\s[-*/%]\\s*[\\w$]*[\\w$.]*\\.${key}\\b`),
    new RegExp(`\\.${key}\\.toFixed\\b`),
  ];
  if (number.some((pattern) => pattern.test(text))) return "number";
  if (new RegExp(`\\.${key}\\.(?:charAt|split|toLowerCase|toUpperCase|slice|substring|substr|indexOf|trim|replace|startsWith|endsWith|localeCompare|padStart)\\b`).test(text)) return "string";
  return null;
}

// ---- comparing the JavaScript with a JSON answer ----------------------------------------------------------------------

function collectKeys(value: unknown, into: Map<string, unknown[]>, depth = 0): void {
  if (depth > 4 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 25)) collectKeys(item, into, depth + 1);
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const list = into.get(key) ?? [];
    list.push(item);
    into.set(key, list);
    collectKeys(item, into, depth + 1);
  }
}

const jsType = (value: unknown) => (value === null ? "null" : Array.isArray(value) ? "array" : typeof value);

/** Problems between what the page reads and what one JSON answer holds (a renamed property, a number that became a string). */
export function compareFields(call: string, body: unknown, reads: Set<string>, sources: Source[]): PageProblem[] {
  const keys = new Map<string, unknown[]>();
  collectKeys(body, keys);
  const lower = new Map<string, string>();
  for (const key of keys.keys()) lower.set(key.toLowerCase(), key);
  const problems: PageProblem[] = [];
  for (const read of reads) {
    if (keys.has(read)) continue;
    const other = lower.get(read.toLowerCase());
    if (other && other !== read) {
      problems.push({ kind: "field", call, message: `The page reads ".${read}" but ${call} sends "${other}". The name differs only in letter case, so the page gets undefined (a JSON naming change on the server).` });
    }
  }
  for (const [key, values] of keys) {
    if (!reads.has(key)) continue;
    const expected = expectedType(sources, key);
    if (!expected) continue;
    const bad = values.find((value) => value !== null && value !== undefined && jsType(value) !== expected);
    if (bad !== undefined) {
      problems.push({ kind: "type", call, message: `The page treats ".${key}" as a ${expected} but ${call} sends a ${jsType(bad)} (${JSON.stringify(bad).slice(0, 40)}).` });
    }
  }
  return problems;
}

// ---- talking to the app ---------------------------------------------------------------------------------------------------

type Reply = { status: number | null; contentType: string; body: string; cookies: string[]; error: string | null };

function request(baseUrl: string, method: string, urlPath: string, headers: Record<string, string>, body: string | undefined, timeoutMs: number): Promise<Reply> {
  return new Promise((resolve) => {
    const url = new URL(baseUrl);
    const req = http.request(
      { host: url.hostname, port: url.port, method, path: urlPath, headers: { ...headers, ...(body !== undefined ? { "Content-Length": Buffer.byteLength(body) } : {}) }, timeout: timeoutMs },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size <= 1_000_000) chunks.push(chunk);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? null, contentType: String(res.headers["content-type"] ?? ""), body: Buffer.concat(chunks).toString("utf8"), cookies: [res.headers["set-cookie"] ?? []].flat(), error: null }));
        res.on("error", (error) => resolve({ status: res.statusCode ?? null, contentType: "", body: "", cookies: [], error: error.message }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", (error) => resolve({ status: null, contentType: "", body: "", cookies: [], error: error.message }));
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const dateLike = /^\d{4}-\d{2}-\d{2}/;

/** Candidate request bodies for a throwaway item: the shape of an item the app returned (no id), with and without its dates. */
function bodyCandidates(sample: unknown): string[] {
  const first = Array.isArray(sample) ? sample.find((item) => item && typeof item === "object") : null;
  const out = ["{}"];
  if (first && typeof first === "object") {
    const base: Record<string, unknown> = Object.fromEntries(Object.entries(first as Record<string, unknown>).filter(([key]) => !/^id$/i.test(key)));
    const nameKey = ["title", "name", "subject", "summary"].find((key) => typeof base[key] === "string");
    if (nameKey) base[nameKey] = "Page check (throwaway)";
    const withoutDates = Object.fromEntries(Object.entries(base).filter(([, value]) => !(typeof value === "string" && dateLike.test(value))));
    out.push(JSON.stringify(withoutDates), JSON.stringify(base));
  }
  return [...new Set(out)];
}

const label = (method: string, urlPath: string) => `${method} ${urlPath}`;
const okForWrite = (status: number | null) => status !== null && ((status >= 200 && status < 300) || status === 400 || status === 409 || status === 422);

type Tried = { first: Reply; reply: Reply; usedPath: string };

/** Ask once; a path with a trailing slash that answers 404/405 is asked again without it (Spring Framework 6 no longer matches it). */
async function withSlashFallback(urlPath: string, ask: (path: string) => Promise<Reply>, good: (reply: Reply) => boolean): Promise<Tried> {
  const first = await ask(urlPath);
  if (urlPath.length > 1 && urlPath.endsWith("/") && (first.status === 404 || first.status === 405)) {
    const trimmed = urlPath.slice(0, -1);
    const alt = await ask(trimmed);
    if (good(alt)) return { first, reply: alt, usedPath: trimmed };
  }
  return { first, reply: first, usedPath: urlPath };
}

function failureText(name: string, tried: Tried, tokenSent?: boolean): string {
  const status = tried.first.status;
  const answer = `${name} answers ${status ?? tried.first.error ?? "nothing"}`;
  if (tried.reply !== tried.first) return `${answer}, but ${tried.usedPath} (the same path without the trailing slash) answers ${tried.reply.status}: Spring Framework 6 no longer matches a trailing slash to the same route.`;
  if (status === 404) return `${answer} (the route does not match this path).`;
  if (status === 405) return `${answer} (method not allowed).`;
  if (status === 403) return `${answer} (${tokenSent === false ? "the page sent no CSRF token" : "the server refused the CSRF token the page sent"}).`;
  return `${answer}.`;
}

export type RunOptions = { baseUrl: string; sources: Source[]; timeoutMs?: number; maxCalls?: number };

/** Load the page and try its API calls against a running app. Never throws. */
export async function runPageCheck(options: RunOptions): Promise<Omit<PageCheckState, "initialProblems" | "rounds" | "fixAttempted">> {
  const started = Date.now();
  const timeout = options.timeoutMs ?? 8000;
  const sources = options.sources;
  const problems: PageProblem[] = [];
  const calls: PageCheckState["calls"] = [];
  const jar = new Map<string, string>();
  const remember = (cookies: string[]) => {
    for (const cookie of cookies) {
      const pair = cookie.split(";")[0];
      const index = pair.indexOf("=");
      if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
  };
  const cookieHeader = () => [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  const ask = async (method: string, urlPath: string, headers: Record<string, string> = {}, body?: string) => {
    const reply = await request(options.baseUrl, method, urlPath, { Accept: "application/json, text/html;q=0.8", ...(jar.size ? { Cookie: cookieHeader() } : {}), ...headers }, body, timeout);
    remember(reply.cookies);
    return reply;
  };
  const note = (call: string, status: number | null, text = "") => calls.push({ call, status, note: text });
  const add = (problem: PageProblem) => {
    if (!problems.some((existing) => existing.kind === problem.kind && existing.call === problem.call && existing.message === problem.message)) problems.push(problem);
  };

  // 1. The page and the scripts it loads.
  const page = await ask("GET", "/");
  note("GET /", page.status);
  if (page.status !== 200) add({ kind: "page", call: "GET /", message: `The page itself answers ${page.status ?? page.error ?? "nothing"} instead of 200.` });
  const scripts = [...page.body.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((match) => match[1]).filter((src) => src.startsWith("/") || !/^[a-z]+:/i.test(src));
  for (const src of scripts.slice(0, 20)) {
    const urlPath = src.startsWith("/") ? src : `/${src}`;
    const reply = await ask("GET", urlPath);
    note(label("GET", urlPath), reply.status);
    if (reply.status !== 200) add({ kind: "page", call: label("GET", urlPath), message: `The page loads ${urlPath} but it answers ${reply.status ?? reply.error}.` });
  }

  const apiCalls = extractApiCalls(sources).slice(0, options.maxCalls ?? 30);
  const reads = readProperties(sources);
  const csrf = csrfNames(sources);
  let sample: unknown;

  // 2. Reads (GET). A path with a trailing slash that answers 404 is tried again without it, so the check can go on
  // and find the other problems in the same pass.
  for (const call of apiCalls.filter((item) => item.method === "GET" && !item.params.length)) {
    const name = label("GET", call.path);
    const tried = await withSlashFallback(call.path, (urlPath) => ask("GET", urlPath), (reply) => reply.status !== null && reply.status < 300);
    note(name, tried.first.status, tried.reply !== tried.first ? `without the trailing slash: ${tried.reply.status}` : "");
    if (tried.first.status === null || tried.first.status >= 300) add({ kind: "http", call: name, message: failureText(name, tried) });
    if (tried.reply.status === null || tried.reply.status >= 300) continue;
    const json = parseJson(tried.reply.body);
    if (json === undefined) continue;
    if (Array.isArray(json) && json.length && sample === undefined) sample = json;
    for (const problem of compareFields(name, json, reads, sources)) add(problem);
  }

  // 3. Changes (POST, PUT, PATCH, DELETE), sent the way the page sends them: the CSRF cookie goes back as a header.
  const writes = apiCalls.filter((item) => item.method !== "GET");
  if (writes.length && csrf.cookie && !jar.has(csrf.cookie)) {
    add({ kind: "csrf", call: "GET /", message: `The page reads the ${csrf.cookie} cookie to send ${csrf.header ?? "a CSRF header"}, but the server never set that cookie, so every change is sent without a token.` });
  }
  const tokenHeaders = (): Record<string, string> => {
    const token = csrf.cookie ? jar.get(csrf.cookie) : undefined;
    return token && csrf.header ? { [csrf.header]: decodeURIComponent(token) } : {};
  };
  const send = (method: string, urlPath: string, body?: string) => ask(method, urlPath, { ...tokenHeaders(), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, body);
  const sentToken = () => Object.keys(tokenHeaders()).length > 0;
  const attempt = async (name: string, urlPath: string, method: string, body?: string) => {
    const tokenWasSent = sentToken();
    const tried = await withSlashFallback(urlPath, (candidate) => send(method, candidate, body), (reply) => okForWrite(reply.status));
    note(name, tried.first.status, tried.reply !== tried.first ? `without the trailing slash: ${tried.reply.status}` : "");
    if (!okForWrite(tried.first.status)) add({ kind: "http", call: name, message: failureText(name, tried, tokenWasSent) });
    return tried.reply;
  };

  let createdId: string | null = null;
  for (const call of writes.filter((item) => item.method === "POST" && !item.params.length)) {
    const name = label("POST", call.path);
    const tokenWasSent = sentToken();
    let last: Tried | null = null;
    for (const body of bodyCandidates(sample)) {
      last = await withSlashFallback(call.path, (candidate) => send("POST", candidate, body), (reply) => okForWrite(reply.status));
      if (last.reply.status !== null && last.reply.status >= 200 && last.reply.status < 300) {
        const json = parseJson(last.reply.body) as Record<string, unknown> | undefined;
        const id = json && typeof json === "object" ? Object.entries(json).find(([key]) => key.toLowerCase() === "id")?.[1] : undefined;
        if (id !== undefined && createdId === null) createdId = String(id);
        break;
      }
      if (last.reply.status !== 400 && last.reply.status !== 422) break;
    }
    if (last) {
      note(name, last.first.status, last.reply !== last.first ? `without the trailing slash: ${last.reply.status}` : "");
      if (!okForWrite(last.first.status)) add({ kind: "http", call: name, message: failureText(name, last, tokenWasSent) });
    }
  }
  const fill = (template: string, params: string[]) => params.reduce((text, param) => text.replace(`{${param}}`, encodeURIComponent(createdId ?? "")), template);
  const withParams = writes.filter((item) => item.params.length);
  for (const call of withParams.filter((item) => item.method !== "DELETE")) {
    const name = label(call.method, call.path);
    if (createdId === null) {
      note(name, null, "not tried: no throwaway item could be created");
      continue;
    }
    await attempt(name, fill(call.path, call.params), call.method, call.method === "POST" ? undefined : "{}");
  }
  for (const call of withParams.filter((item) => item.method === "DELETE")) {
    const name = label("DELETE", call.path);
    if (createdId === null) {
      note(name, null, "not tried: no throwaway item could be created");
      continue;
    }
    await attempt(name, fill(call.path, call.params), "DELETE");
    createdId = null;
  }

  const tried = calls.filter((item) => item.status !== null).length;
  return { ran: true, note: `${tried} request(s) made; ${problems.length ? `${problems.length} problem(s)` : "no problems"}.`, calls, problems: problems.slice(0, 12), durationMs: Date.now() - started };
}

// ---- starting the packaged jar ---------------------------------------------------------------------------------------------

export type JarCheckOptions = { jar: string; cwd: string; jdkHome: string | null; sources: Source[]; startTimeoutMs?: number; onLog?: (line: string) => void; signal?: AbortSignal };

/** Start the jar on a free loopback port, run the page check, stop the app. A jar that will not start is "not run", never a failure. */
export async function checkJarPage(options: JarCheckOptions): Promise<Omit<PageCheckState, "initialProblems" | "rounds" | "fixAttempted">> {
  const started = Date.now();
  const skipped = (text: string) => ({ ran: false, note: text, calls: [], problems: [], durationMs: Date.now() - started });
  if (!existsSync(options.jar)) return skipped("No packaged jar to start.");
  let port: number;
  try {
    port = await pickFreePort();
  } catch {
    return skipped("No free local port to start the app on.");
  }
  const step = javaRunStep({ jar: options.jar, port, jdkHome: options.jdkHome, cwd: options.cwd });
  const tail: string[] = [];
  let exited = false;
  const proc = startServerProcess(step.command, step.args, {
    cwd: step.cwd,
    env: previewEnv(process.env, step.env),
    onOutput: (chunk) => {
      for (const line of chunk.split(/\r?\n/)) if (line.trim()) tail.push(line.slice(0, 300));
      if (tail.length > 40) tail.splice(0, tail.length - 40);
    },
  });
  void proc.exited.then(() => {
    exited = true;
  });
  try {
    const health = await waitForHealth(port, { timeoutMs: options.startTimeoutMs ?? 90_000, paths: ["/actuator/health", "/"], isAlive: () => !exited && !options.signal?.aborted });
    if (!health.up) {
      const reason = tail.filter((line) => /error|exception|failed|refused|invalid/i.test(line)).slice(-1)[0] ?? tail.slice(-1)[0] ?? "";
      return skipped(`The app did not start on its own (it may need settings such as a database), so the page was not checked.${reason ? ` Last log line: ${reason.slice(0, 200)}` : ""}`);
    }
    return await runPageCheck({ baseUrl: `http://${previewHost}:${port}`, sources: options.sources });
  } finally {
    proc.stop();
    await Promise.race([proc.exited, new Promise((resolve) => setTimeout(resolve, 8000))]);
    if (process.platform === "win32") await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

/** The problems as plain lines (for the AI's fix-up request and for logs). */
export function describeProblems(problems: PageProblem[]): string {
  return problems.map((problem, index) => `${index + 1}. [${problem.kind}] ${problem.message}`).join("\n");
}

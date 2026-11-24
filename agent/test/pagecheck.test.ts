import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkJarPage, compareFields, csrfNames, describeProblems, expectedType, extractApiCalls, frontendSourceFiles, hasStaticFrontend, readFrontendSources, readProperties, runPageCheck } from "../bot/lib/pageCheck.js";
import { tempDir } from "./helpers.js";

const sampleDir = path.resolve(__dirname, "../../samples/webapp");
const sources = readFrontendSources(sampleDir);
const staticRoot = path.join(sampleDir, "src/main/resources/static");

type Behaviour = {
  /** Spring 5 matched /x/ to /x; Spring 6 does not. */
  trailingSlash: boolean;
  /** Spring Security 5 writes the XSRF-TOKEN cookie on a GET; Security 6 loads the token lazily. */
  cookieOnGet: boolean;
  /** The Security 6 default handler rejects the raw cookie value sent as a header. */
  acceptRawToken: boolean;
  /** Jackson 3 names getETA() "ETA" where Jackson 2 named it "eta". */
  upperNames: boolean;
  /** eta as a string instead of a number. */
  etaAsString: boolean;
};
const healthy: Behaviour = { trailingSlash: true, cookieOnGet: true, acceptRawToken: true, upperNames: false, etaAsString: false };

/** A stand-in for the board app: serves the real page files and a small API whose behaviour can be switched. */
function fakeBoard(behaviour: Behaviour): Promise<{ baseUrl: string; seen: string[]; close: () => Promise<void> }> {
  const seen: string[] = [];
  const tasks = [{ id: 1, title: "Review", priority: "HIGH", dueDate: "2026-11-25", notes: null }];
  const server = http.createServer((req, res) => {
    const method = req.method ?? "GET";
    let url = (req.url ?? "/").split("?")[0];
    seen.push(`${method} ${url}`);
    const headers: Record<string, string | string[]> = {};
    if (behaviour.cookieOnGet) headers["Set-Cookie"] = "XSRF-TOKEN=tok123; Path=/";
    const send = (status: number, body: string, type = "application/json") => {
      res.writeHead(status, { ...headers, "Content-Type": type });
      res.end(body);
    };
    if (url.length > 1 && url.endsWith("/")) {
      if (!behaviour.trailingSlash) return send(404, JSON.stringify({ status: 404, error: "Not Found" }));
      url = url.slice(0, -1);
    }
    const file = url === "/" ? "index.html" : url.replace(/^\//, "");
    if (method === "GET" && /^(index\.html|js\/.*|css\/.*)$/.test(file)) {
      return send(200, readFileSync(path.join(staticRoot, file), "utf8"), file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html");
    }
    const item = (task: (typeof tasks)[number]) => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      dueDate: task.dueDate,
      done: false,
      overdue: false,
      [behaviour.upperNames ? "ETA" : "eta"]: behaviour.etaAsString ? "5" : 5,
      [behaviour.upperNames ? "URL" : "url"]: `/#task-${task.id}`,
    });
    if (method === "GET" && url === "/api/tasks") return send(200, JSON.stringify(tasks.map(item)));
    if (method === "GET" && url === "/api/tasks/stats") return send(200, JSON.stringify({ total: 1, open: 1, done: 0, overdue: 0 }));
    if (method === "GET" && url === "/api/runtime") return send(200, JSON.stringify({ java: "21", springBoot: "4.0.0", springSecurity: "7.0", namespace: "jakarta" }));
    if (method !== "GET") {
      const token = req.headers["x-xsrf-token"];
      if (token !== "tok123" || !behaviour.acceptRawToken) return send(403, JSON.stringify({ status: 403, error: "Forbidden", message: "Invalid CSRF Token" }));
    }
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      if (method === "POST" && url === "/api/tasks") {
        let parsed: { title?: string; priority?: string } = {};
        try {
          parsed = JSON.parse(raw || "{}");
        } catch {
          /* empty */
        }
        if (!parsed.title || !parsed.priority) return send(400, JSON.stringify({ message: "Validation failed" }));
        return send(201, JSON.stringify(item({ id: 99, title: parsed.title, priority: parsed.priority, dueDate: "2026-12-01", notes: null })));
      }
      if (method === "POST" && /^\/api\/tasks\/99\/complete$/.test(url)) return send(200, JSON.stringify(item(tasks[0])));
      if (method === "DELETE" && url === "/api/tasks/99") {
        res.writeHead(204, headers);
        return res.end();
      }
      return send(404, JSON.stringify({ status: 404 }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      resolve({ baseUrl: `http://127.0.0.1:${port}`, seen, close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}

async function check(behaviour: Behaviour) {
  const app = await fakeBoard(behaviour);
  try {
    return { ...(await runPageCheck({ baseUrl: app.baseUrl, sources })), seen: app.seen };
  } finally {
    await app.close();
  }
}

describe("reading the page", () => {
  it("finds the API calls the board's JavaScript makes, with their methods and path parameters", () => {
    const calls = extractApiCalls(sources).map((call) => `${call.method} ${call.path}`).sort();
    expect(calls).toEqual(["DELETE /api/tasks/{id}/", "GET /api/runtime", "GET /api/tasks/", "GET /api/tasks/stats/", "POST /api/tasks/", "POST /api/tasks/{id}/complete/"]);
    expect(extractApiCalls(sources).find((call) => call.path === "/api/tasks/{id}/complete/")?.params).toEqual(["id"]);
  });

  it("reads template literals, fetch with a method, and ignores comments and assets", () => {
    const calls = extractApiCalls([
      { file: "a.js", text: "// fetch('/api/old')\nfetch(`/api/items/${id}/done`, { method: 'PUT' });\nfetch('/api/list');\nvar img = '/img/logo.png';" },
    ]).map((call) => `${call.method} ${call.path}`);
    expect(calls.sort()).toEqual(["GET /api/list", "PUT /api/items/{id}/done"]);
  });

  it("finds the CSRF header and cookie the page uses", () => {
    expect(csrfNames(sources)).toEqual({ header: "X-XSRF-TOKEN", cookie: "XSRF-TOKEN" });
    expect(csrfNames([{ file: "x.js", text: "fetch('/a')" }])).toEqual({ header: null, cookie: null });
  });

  it("knows which properties are read and what the JavaScript does with them", () => {
    expect(readProperties(sources).has("eta")).toBe(true);
    expect(expectedType(sources, "eta")).toBe("number");
    expect(expectedType(sources, "priority")).toBe("string");
    expect(expectedType(sources, "title")).toBeNull();
  });

  it("lists the page files of a project and says when there are none", () => {
    expect(hasStaticFrontend(sampleDir)).toBe(true);
    expect(frontendSourceFiles(sampleDir)).toContain("src/main/resources/static/js/app.js");
    const empty = tempDir("lf-nopage-");
    expect(hasStaticFrontend(empty)).toBe(false);
    mkdirSync(path.join(empty, "src/main/resources/static"), { recursive: true });
    writeFileSync(path.join(empty, "src/main/resources/static/app.css"), "a{}");
    expect(hasStaticFrontend(empty)).toBe(false);
  });
});

describe("comparing the page with an answer", () => {
  const js = [{ file: "a.js", text: "var d = Math.round(t.eta); var s = t.name.toLowerCase(); var l = t.url;" }];
  const reads = readProperties(js);

  it("accepts a matching answer", () => {
    expect(compareFields("GET /x", [{ eta: 3, name: "a", url: "/u" }], reads, js)).toEqual([]);
  });

  it("flags a property that only differs in letter case", () => {
    const problems = compareFields("GET /x", [{ ETA: 3, name: "a", URL: "/u" }], reads, js);
    expect(problems.map((problem) => problem.kind)).toEqual(["field", "field"]);
    expect(problems[0].message).toContain('reads ".eta" but GET /x sends "ETA"');
  });

  it("flags a number that arrives as a string, and a string that arrives as a number", () => {
    expect(compareFields("GET /x", { eta: "3", name: "a", url: "/u" }, reads, js)[0].message).toContain("treats \".eta\" as a number but GET /x sends a string");
    expect(compareFields("GET /x", { eta: 3, name: 5, url: "/u" }, reads, js)[0].message).toContain('".name" as a string');
  });

  it("does not guess about fields the JavaScript only displays or about null values", () => {
    expect(compareFields("GET /x", { eta: null, name: null, url: null }, reads, js)).toEqual([]);
  });
});

describe("page check against a fake board", () => {
  it("passes when the app behaves like Spring 5 / Boot 2", async () => {
    const result = await check(healthy);
    expect(result.problems).toEqual([]);
    expect(result.ran).toBe(true);
    expect(result.seen).toContain("GET /js/app.js");
    expect(result.seen).toContain("POST /api/tasks/99/complete/");
    expect(result.seen).toContain("DELETE /api/tasks/99/");
    expect(result.calls.filter((call) => call.status && call.status >= 400 && call.call.startsWith("POST") && call.status !== 400)).toEqual([]);
  });

  it("finds the trailing-slash calls that Spring 6 no longer matches", async () => {
    const result = await check({ ...healthy, trailingSlash: false });
    expect(result.problems.map((problem) => problem.call)).toEqual(expect.arrayContaining(["GET /api/tasks/", "GET /api/tasks/stats/", "POST /api/tasks/"]));
    expect(result.problems.every((problem) => problem.kind === "http")).toBe(true);
    expect(result.problems[0].message).toContain("404");
  });

  it("keeps going past the 404s and reports every kind of problem in one pass", async () => {
    const result = await check({ ...healthy, trailingSlash: false, upperNames: true });
    const kinds = result.problems.map((problem) => problem.kind);
    expect(kinds.filter((kind) => kind === "http").length).toBe(5);
    expect(kinds.filter((kind) => kind === "field").length).toBe(2);
    const post = result.problems.find((problem) => problem.call === "POST /api/tasks/");
    expect(post?.message).toContain("/api/tasks (the same path without the trailing slash) answers 201");
    expect(result.problems.find((problem) => problem.call === "DELETE /api/tasks/{id}/")?.message).toContain("answers 204");
  });

  it("finds a CSRF cookie that the server never sets", async () => {
    const result = await check({ ...healthy, cookieOnGet: false });
    expect(result.problems.some((problem) => problem.kind === "csrf" && problem.message.includes("XSRF-TOKEN"))).toBe(true);
    expect(result.problems.some((problem) => problem.kind === "http" && problem.call === "POST /api/tasks/" && problem.message.includes("403") && problem.message.includes("sent no CSRF token"))).toBe(true);
  });

  it("finds a CSRF token the server refuses even though the page sent it", async () => {
    const result = await check({ ...healthy, acceptRawToken: false });
    const post = result.problems.find((problem) => problem.call === "POST /api/tasks/");
    expect(post?.message).toContain("refused the CSRF token");
    expect(result.problems.some((problem) => problem.kind === "csrf")).toBe(false);
  });

  it("finds renamed JSON properties the page reads (the Jackson 3 acronym naming)", async () => {
    const result = await check({ ...healthy, upperNames: true });
    const messages = result.problems.filter((problem) => problem.kind === "field").map((problem) => problem.message);
    expect(messages.some((message) => message.includes('".eta"') && message.includes('"ETA"'))).toBe(true);
    expect(messages.some((message) => message.includes('".url"') && message.includes('"URL"'))).toBe(true);
    expect(result.problems.filter((problem) => problem.kind !== "field")).toEqual([]);
  });

  it("finds a number that arrives as a string", async () => {
    const result = await check({ ...healthy, etaAsString: true });
    expect(result.problems.map((problem) => problem.kind)).toEqual(["type"]);
  });

  it("lists the problems as numbered lines for the AI", async () => {
    const result = await check({ ...healthy, upperNames: true });
    expect(describeProblems(result.problems)).toMatch(/^1\. \[field\] The page reads/);
  });

  it("reports a page that does not load", async () => {
    const app = await fakeBoard(healthy);
    await app.close();
    const result = await runPageCheck({ baseUrl: app.baseUrl, sources, timeoutMs: 500 });
    expect(result.problems[0]).toMatchObject({ kind: "page", call: "GET /" });
  });
});

describe("starting the jar", () => {
  it("says so (and does not fail) when there is no jar or the app will not start", async () => {
    const dir = tempDir("lf-jar-");
    const missing = await checkJarPage({ jar: path.join(dir, "none.jar"), cwd: dir, jdkHome: null, sources });
    expect(missing).toMatchObject({ ran: false, problems: [] });
    const notAJar = path.join(dir, "bad.jar");
    writeFileSync(notAJar, "not a jar");
    const failed = await checkJarPage({ jar: notAJar, cwd: dir, jdkHome: null, sources, startTimeoutMs: 15_000 });
    expect(failed.ran).toBe(false);
    expect(failed.problems).toEqual([]);
    expect(failed.note).toMatch(/did not start|No packaged jar/);
  }, 30_000);
});

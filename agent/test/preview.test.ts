import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { keepDryCopies, keptDryCopies, releaseDryCopy, retainOrRemoveDryCopy, setPreviewInUse, sweepOldDryCopies } from "../bot/lib/dryCopies.js";
import { canonicalBody, cleanupPreview, compareEndpoint, previewBlocker, previewView, startPreview, stopPreview } from "../bot/lib/preview.js";
import {
  activeJdk, bindLocalSource, chooseJdk, cleanHeaders, copyProject, detectPythonApp, discoverJdks, exportCommit, findRunnableJar, isUpStatus, javaMajor, javaRunStep,
  maskLogLine, nodeEndpoints, nodeRunStep, pickFreePort, previewEnv, probe, proxyGet, pythonEndpoints, pythonInstallArgs, pythonRunStep, sampleCredentials, springEndpoints,
  suggestEndpoints, systemJdkRoots, jdkRoots, validProxyPath, waitForHealth, writeBindLocal, type Jdk,
} from "../bot/lib/previewKit.js";
import { tempDir } from "./helpers.js";

function write(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text, "utf8");
}

function listen(handler: http.RequestListener): Promise<{ server: http.Server; port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as { port: number }).port, close: () => new Promise((done) => server.close(() => done())) }));
  });
}

describe("ports and health", () => {
  it("picks a free loopback port and avoids the ones it is told to", async () => {
    const first = await pickFreePort();
    expect(first).toBeGreaterThan(0);
    const second = await pickFreePort(new Set([first]));
    expect(second).not.toBe(first);
  });

  it("counts 200, 401 and 404 as up, 5xx and no answer as not up", () => {
    for (const status of [200, 204, 301, 401, 403, 404]) expect(isUpStatus(status)).toBe(true);
    for (const status of [500, 502, 503, null, undefined, 0]) expect(isUpStatus(status)).toBe(false);
  });

  it("waits for the first path that answers, and reports an early exit or a timeout", async () => {
    let calls = 0;
    const up = await waitForHealth(1, { intervalMs: 5, timeoutMs: 2000, paths: ["/actuator/health", "/"], probeFn: async (_port, urlPath) => (++calls <= 4 ? 503 : urlPath === "/" ? 401 : 404) });
    expect(up).toMatchObject({ up: true, status: 404, path: "/actuator/health" });
    const dead = await waitForHealth(1, { intervalMs: 5, timeoutMs: 2000, isAlive: () => false, probeFn: async () => null });
    expect(dead).toMatchObject({ up: false, exited: true });
    const slow = await waitForHealth(1, { intervalMs: 5, timeoutMs: 60, probeFn: async () => 500 });
    expect(slow).toMatchObject({ up: false, exited: false, lastStatus: 500 });
  });

  it("probes a real server", async () => {
    const app = await listen((_req, res) => res.writeHead(401).end("no"));
    expect(await probe(app.port, "/")).toBe(401);
    await app.close();
    expect(await probe(app.port, "/", 300)).toBeNull();
  });
});

describe("environment and log masking", () => {
  it("keeps only the allow-listed variables and never a token or a LEAPFROG_ setting", () => {
    const env = previewEnv(
      { PATH: "/bin", HOME: "/h", GITHUB_TOKEN: "ghp_abc", LEAPFROG_API_TOKEN: "x", CURSOR_API_KEY: "k", OPENAI_API_KEY: "o", MY_SECRET: "s", AWS_SECRET_ACCESS_KEY: "a", JAVA_HOME: "/jdk" },
      { PORT: "1234" },
    );
    expect(env).toEqual({ PATH: "/bin", HOME: "/h", PORT: "1234" });
  });

  it("masks token-shaped text and password lines in logs", () => {
    expect(maskLogLine("cloning with ghp_abcdefghijklmnopqrstuvwxyz0123456789 now")).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(maskLogLine("spring.datasource.password=hunter2")).not.toContain("hunter2");
    expect(maskLogLine("Started App in 2.7 seconds")).toBe("Started App in 2.7 seconds");
  });
});

function fakeJdk(root: string, name: string, version: string, javac = true): string {
  const home = path.join(root, name);
  const windows = process.platform === "win32";
  write(path.join(home, "bin", windows ? "java.exe" : "java"), "");
  if (javac) write(path.join(home, "bin", windows ? "javac.exe" : "javac"), "");
  write(path.join(home, "release"), `JAVA_VERSION="${version}"\nIMPLEMENTOR="Test"\n`);
  return home;
}

describe("JDK discovery", () => {
  it("reads major versions, old (1.8) and new (21)", () => {
    expect(javaMajor("1.8.0_392")).toBe(8);
    expect(javaMajor("8")).toBe(8);
    expect(javaMajor("17.0.9")).toBe(17);
    expect(javaMajor("21")).toBe(21);
    expect(javaMajor("")).toBeNull();
    expect(javaMajor("abc")).toBeNull();
  });

  it("finds JDKs in configured folders and picks exact or not-older ones", () => {
    const root = tempDir("lf-jdks-");
    fakeJdk(root, "jdk8", "1.8.0_402");
    fakeJdk(root, "jdk17", "17.0.9");
    fakeJdk(root, "jdk21", "21.0.3", false);
    write(path.join(root, "not-a-jdk", "readme.txt"), "x");
    const jdks = discoverJdks({ env: { LEAPFROG_JDK_DIRS: root, PATH: "" }, home: tempDir("lf-home-"), systemRoots: [] });
    expect(jdks.map((jdk) => jdk.major)).toEqual([8, 17, 21]);
    expect(chooseJdk(jdks, 8, "exact")?.major).toBe(8);
    expect(chooseJdk(jdks, 11, "exact")).toBeNull();
    expect(chooseJdk(jdks, 11, "atLeast")?.major).toBe(17);
    expect(chooseJdk(jdks, 25, "atLeast")).toBeNull();
    expect(chooseJdk(jdks, 21, "exact")?.javac).toBe(false);
  });

  it("lists one JDK once however it is reached (JAVA_HOME, PATH, two folders, different case on Windows)", () => {
    const root = tempDir("lf-jdks-");
    const home = fakeJdk(root, "jdk21", "21.0.3");
    const windows = process.platform === "win32";
    const jdks = discoverJdks({
      env: { JAVA_HOME: windows ? home.toUpperCase() : home, LEAPFROG_JDK_DIRS: [root, root].join(path.delimiter), PATH: path.join(home, "bin") },
      extraRoots: [root],
      home: tempDir("lf-home-"),
      systemRoots: [],
    });
    expect(jdks.map((jdk) => jdk.major)).toEqual([21]);
  });

  it("scans the platform's install folders by default, and only those the caller does not replace", () => {
    expect(systemJdkRoots({ ProgramFiles: "C:\\PF" }, "win32", "C:\\Users\\a")).toEqual(expect.arrayContaining([path.join("C:\\PF", "Eclipse Adoptium"), path.join("C:\\Program Files", "Java")]));
    expect(systemJdkRoots({}, "linux", "/home/a")).toContain("/usr/lib/jvm");
    expect(jdkRoots({ env: {}, platform: "linux", home: "/h", systemRoots: [] })).not.toContain("/usr/lib/jvm");
    expect(jdkRoots({ env: {}, platform: "linux", home: "/h" })).toContain("/usr/lib/jvm");
  });

  it("uses JAVA_HOME as the active JDK and finds none in an empty setup", () => {
    const root = tempDir("lf-jdks-");
    const home = fakeJdk(root, "jdk21", "21.0.3");
    const jdks = discoverJdks({ env: { JAVA_HOME: home, PATH: "" }, home: tempDir("lf-home-"), systemRoots: [] });
    expect(activeJdk(jdks, { JAVA_HOME: home })?.major).toBe(21);
    expect(discoverJdks({ env: { PATH: "" }, home: tempDir("lf-home-"), platform: "linux", systemRoots: [] }).filter((jdk) => jdk.home.startsWith(root))).toEqual([]);
  });
});

describe("command builders", () => {
  it("builds the Java command on loopback with the chosen JDK", () => {
    const step = javaRunStep({ jar: "/w/app.jar", port: 4100, jdkHome: "/jdks/21", cwd: "/w", platform: "linux" });
    expect(step.command).toBe(path.join("/jdks/21", "bin", "java"));
    expect(step.args).toEqual(["-jar", "/w/app.jar", "--server.port=4100", "--server.address=127.0.0.1"]);
    expect(step.env).toMatchObject({ JAVA_HOME: "/jdks/21", SERVER_PORT: "4100", SERVER_ADDRESS: "127.0.0.1" });
    expect(javaRunStep({ jar: "a.jar", port: 1, jdkHome: null, cwd: "." }).command).toBe("java");
    expect(javaRunStep({ jar: "a.jar", port: 1, jdkHome: "C:\\jdk", cwd: ".", platform: "win32" }).command.endsWith("java.exe")).toBe(true);
  });

  it("builds Node commands: npm start first, main file next, nothing otherwise", () => {
    const base = { dir: "/app", port: 4200, bindLocal: "/tmp/bind-local.cjs", platform: "linux" as const };
    const start = nodeRunStep({ ...base, start: "node server.js", main: null });
    expect(start).toMatchObject({ command: "npm", args: ["start"] });
    expect(start?.env).toMatchObject({ PORT: "4200", HOST: "127.0.0.1" });
    expect(start?.env?.NODE_OPTIONS).toContain("bind-local.cjs");
    expect(nodeRunStep({ ...base, start: null, main: "index.js" })).toMatchObject({ command: "node", args: ["index.js"] });
    expect(nodeRunStep({ ...base, start: null, main: null })).toBeNull();
    expect(nodeRunStep({ ...base, start: "x", main: null, platform: "win32" })?.command).toBe("npm.cmd");
  });

  it("builds Flask and Django commands with the port in every form the app may read", () => {
    const flask = pythonRunStep({ dir: "/p", python: "/v/bin/python", port: 4300, app: { kind: "flask", module: "shortlink" } });
    expect(flask.args).toEqual(["-m", "flask", "--app", "shortlink", "run", "--host", "127.0.0.1", "--port", "4300", "--no-reload"]);
    expect(flask.env).toMatchObject({ PORT: "4300", FLASK_RUN_PORT: "4300", FLASK_RUN_HOST: "127.0.0.1" });
    const django = pythonRunStep({ dir: "/p", python: "py", port: 4301, app: { kind: "django" } });
    expect(django.args).toEqual(["manage.py", "runserver", "127.0.0.1:4301", "--noreload"]);
  });

  it("finds the Flask app and the install arguments in a project", () => {
    const flask = tempDir("lf-flask-");
    write(path.join(flask, "requirements.txt"), "flask\n");
    write(path.join(flask, "shortlink", "__init__.py"), "def create_app():\n    pass\n");
    write(path.join(flask, "tests", "__init__.py"), "app = Flask(__name__)\n");
    expect(detectPythonApp(flask)).toEqual({ kind: "flask", module: "shortlink" });
    expect(pythonInstallArgs(flask)).toEqual(["-r", "requirements.txt"]);
    const flat = tempDir("lf-flat-");
    write(path.join(flat, "app.py"), "from flask import Flask\napp = Flask(__name__)\n");
    expect(detectPythonApp(flat)).toEqual({ kind: "flask", module: "app" });
    const django = tempDir("lf-dj-");
    write(path.join(django, "manage.py"), "#!/usr/bin/env python\n");
    expect(detectPythonApp(django)).toEqual({ kind: "django" });
    expect(detectPythonApp(tempDir("lf-none-"))).toBeNull();
  });

  it("finds the Spring Boot jar and skips sources, plain and original jars", () => {
    const dir = tempDir("lf-jar-");
    for (const name of ["app-1.0.jar", "app-1.0-sources.jar", "app-1.0-plain.jar", "app-1.0.jar.original"]) write(path.join(dir, "target", name), "x");
    expect(findRunnableJar(dir)).toBe(path.join(dir, "target", "app-1.0.jar"));
    expect(findRunnableJar(tempDir("lf-nojar-"))).toBeNull();
  });
});

describe("loopback-only Node preload", () => {
  it("makes a server that asked for all interfaces listen on 127.0.0.1", () => {
    const dir = tempDir("lf-bind-");
    const preload = writeBindLocal(dir);
    expect(bindLocalSource).toContain("127.0.0.1");
    const script = 'const s=require("http").createServer(()=>{}).listen(0,()=>{console.log(s.address().address);s.close()})';
    const run = spawnSync(process.execPath, ["--require", preload, "-e", script], { encoding: "utf8" });
    expect(run.stdout.trim()).toBe("127.0.0.1");
    const wildcard = spawnSync(process.execPath, ["--require", preload, "-e", 'const s=require("http").createServer().listen({port:0,host:"0.0.0.0"},()=>{console.log(s.address().address);s.close()})'], { encoding: "utf8" });
    expect(wildcard.stdout.trim()).toBe("127.0.0.1");
  });
});

describe("restoring the original code from git", () => {
  it("writes the starting commit into a scratch folder without touching the repository", async () => {
    const repo = tempDir("lf-git-");
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
    git("init", "-q");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
    write(path.join(repo, "app", "a.txt"), "original");
    write(path.join(repo, "app", "keep.txt"), "kept");
    git("add", "-A");
    git("commit", "-qm", "base");
    const base = git("rev-parse", "HEAD").trim();
    write(path.join(repo, "app", "a.txt"), "migrated");
    write(path.join(repo, "app", "new.txt"), "new");
    git("add", "-A");
    git("commit", "-qm", "migrate");
    const before = git("status", "--porcelain");
    const dest = path.join(tempDir("lf-dest-"), "src");
    const project = await exportCommit({ gitDir: path.join(repo, ".git"), commit: base, dest, subdir: "app" });
    expect(project).toBe(path.join(dest, "app"));
    expect(execFileSync("node", ["-e", `console.log(require("fs").readFileSync(${JSON.stringify(path.join(project, "a.txt"))},"utf8"))`], { encoding: "utf8" }).trim()).toBe("original");
    expect(existsSync(path.join(project, "new.txt"))).toBe(false);
    expect(existsSync(path.join(project, "keep.txt"))).toBe(true);
    expect(git("status", "--porcelain")).toBe(before);
    expect(readFileOf(path.join(repo, "app", "a.txt"))).toBe("migrated");
  });

  it("copies a project without build output, dependencies or git history", () => {
    const src = tempDir("lf-copy-");
    write(path.join(src, "src", "build", "Keep.java"), "x");
    for (const file of ["target/a.jar", "node_modules/x/i.js", ".git/HEAD", "build/out.txt", "pom.xml", "migration-plan.json"]) write(path.join(src, file), "x");
    const dest = path.join(tempDir("lf-copyd-"), "d");
    copyProject(src, dest);
    expect(existsSync(path.join(dest, "pom.xml"))).toBe(true);
    expect(existsSync(path.join(dest, "src", "build", "Keep.java"))).toBe(true);
    for (const gone of ["target", "node_modules", ".git", "build", "migration-plan.json"]) expect(existsSync(path.join(dest, gone))).toBe(false);
  });
});

function readFileOf(file: string): string {
  return execFileSync("node", ["-e", `process.stdout.write(require("fs").readFileSync(${JSON.stringify(file)},"utf8"))`], { encoding: "utf8" });
}

describe("endpoint and credential suggestions", () => {
  it("reads Spring controller GET mappings with the class prefix and skips variables and POSTs", () => {
    const dir = tempDir("lf-spring-");
    write(path.join(dir, "pom.xml"), "<artifactId>spring-boot-starter-actuator</artifactId>");
    write(
      path.join(dir, "src/main/java/com/a/EventController.java"),
      `@RestController\n@RequestMapping("/api/events")\npublic class EventController {\n  @GetMapping\n  public List<E> all() {}\n  @GetMapping("/{id}")\n  public E one() {}\n  @GetMapping(value = "/upcoming")\n  public List<E> up() {}\n  @PostMapping("/book")\n  public E book() {}\n  @RequestMapping(value = "/old", method = RequestMethod.GET)\n  public E old() {}\n}\n`,
    );
    expect(springEndpoints(dir).sort()).toEqual(["/actuator/health", "/api/events", "/api/events/old", "/api/events/upcoming"]);
    expect(suggestEndpoints("java", dir)[0]).toBe("/actuator/health");
  });

  it("reads Express and Flask routes", () => {
    const node = tempDir("lf-node-");
    write(path.join(node, "server.js"), 'app.get("/health", h);\napp.get("/orders/:id", h);\nrouter.get(\'/orders\', h);\napp.post("/orders", h);\n');
    expect(nodeEndpoints(node).sort()).toEqual(["/health", "/orders"]);
    const py = tempDir("lf-py-");
    write(path.join(py, "shortlink", "routes.py"), '@bp.route("/links")\ndef a(): pass\n@bp.route("/links/<code>")\ndef b(): pass\n@bp.route("/make", methods=["POST"])\ndef c(): pass\n@app.get("/ping")\ndef d(): pass\n');
    expect(pythonEndpoints(py).sort()).toEqual(["/links", "/ping"]);
  });

  it("shows only credentials the project calls demo values, with secrets masked", () => {
    const dir = tempDir("lf-creds-");
    write(path.join(dir, "README.md"), "# App\nLogin as `admin` with password `demo-pass-1` (demo only).\nProduction password: real-secret-9\nspring.datasource.password=not-a-secret-demo\n");
    const lines = sampleCredentials(dir);
    expect(lines.some((line) => line.includes("demo-pass-1"))).toBe(true);
    expect(lines.join("\n")).not.toContain("real-secret-9");
    expect(sampleCredentials(tempDir("lf-nocreds-"))).toEqual([]);
    const cfg = tempDir("lf-cfgcreds-");
    write(path.join(cfg, "src/main/resources/application.properties"), "# The demo password token example is described here\nserver.port=8080\napp.password=demo-only-1\n");
    expect(sampleCredentials(cfg)).toEqual(["app.password=demo-only-1"].map((line) => maskLogLine(line)));
  });
});

describe("the compare proxy", () => {
  it("accepts only plain paths and simple headers", () => {
    expect(validProxyPath("/api/events?x=1")).toBe(true);
    for (const bad of ["api", "//evil.example/x", "/a b", "/a#b", "/a\\b", `/${"x".repeat(600)}`]) expect(validProxyPath(bad)).toBe(false);
    expect(cleanHeaders({ Authorization: "Bearer demo", Host: "evil", "Content-Length": "9", "bad name": "x", "X-A": "line\r\nbreak" })).toEqual({ Authorization: "Bearer demo" });
  });

  it("fetches status, time and a truncated, masked body", async () => {
    const app = await listen((req, res) => {
      if (req.url === "/big") return res.writeHead(200, { "content-type": "text/plain" }).end("a".repeat(500));
      if (req.url === "/secret") return res.writeHead(200).end("token=ghp_abcdefghijklmnopqrstuvwxyz0123456789");
      res.writeHead(404).end("missing");
    });
    expect(await proxyGet(app.port, "/nope")).toMatchObject({ status: 404, body: "missing", error: null });
    const big = await proxyGet(app.port, "/big", {}, { maxChars: 100 });
    expect(big.body).toHaveLength(100);
    expect(big.truncated).toBe(true);
    expect((await proxyGet(app.port, "/secret")).body).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect((await proxyGet(app.port, "//evil")).error).toMatch(/path/);
    await app.close();
    expect((await proxyGet(app.port, "/", {}, { timeoutMs: 300 })).status).toBeNull();
  });
});

describe("comparing bodies", () => {
  it("ignores JSON key order and spacing, not values", () => {
    expect(canonicalBody('{"b":1,"a":[{"y":2,"x":1}]}')).toBe(canonicalBody('{ "a": [ {"x":1,"y":2} ], "b": 1 }'));
    expect(canonicalBody('{"a":1}')).not.toBe(canonicalBody('{"a":2}'));
    expect(canonicalBody("plain text")).toBe("plain text");
  });
});

describe("dry-run copy retention", () => {
  const save = process.env.LEAPFROG_KEEP_DRY_COPIES;
  const restore = () => {
    if (save === undefined) delete process.env.LEAPFROG_KEEP_DRY_COPIES;
    else process.env.LEAPFROG_KEEP_DRY_COPIES = save;
    setPreviewInUse(() => false);
  };

  it("keeps the newest copies, never removes one that a preview uses, and releases on delete", () => {
    process.env.LEAPFROG_KEEP_DRY_COPIES = "2";
    try {
      expect(keepDryCopies()).toBe(2);
      const root = tempDir("lf-dry-");
      const make = (name: string) => {
        const dir = path.join(root, `leapfrog-dry-${name}`, "work");
        mkdirSync(dir, { recursive: true });
        return dir;
      };
      const [a, b, c, d] = ["ra", "rb", "rc", "rd"].map(make);
      setPreviewInUse((runId) => runId === "ra");
      expect([retainOrRemoveDryCopy("ra", a), retainOrRemoveDryCopy("rb", b), retainOrRemoveDryCopy("rc", c)]).toEqual([true, true, true]);
      expect(existsSync(a)).toBe(true); // in use: stays although it is the oldest
      expect(existsSync(b)).toBe(false);
      expect(existsSync(c)).toBe(true);
      retainOrRemoveDryCopy("rd", d);
      expect(keptDryCopies().map((entry) => entry.runId)).toEqual(["ra", "rc", "rd"].filter((id) => keptDryCopies().some((entry) => entry.runId === id)));
      setPreviewInUse(() => false);
      releaseDryCopy("ra");
      expect(existsSync(a)).toBe(false);
      releaseDryCopy("rc");
      releaseDryCopy("rd");
    } finally {
      restore();
    }
  });

  it("deletes at once when keeping is switched off, and the sweep removes only old leftovers", () => {
    process.env.LEAPFROG_KEEP_DRY_COPIES = "0";
    try {
      const root = tempDir("lf-dry0-");
      const dir = path.join(root, "leapfrog-dry-zero", "w");
      mkdirSync(dir, { recursive: true });
      expect(retainOrRemoveDryCopy("r0", dir)).toBe(false);
      expect(existsSync(dir)).toBe(false);
    } finally {
      restore();
    }
    const tmp = tempDir("lf-sweep-");
    const oldDir = path.join(tmp, "leapfrog-dry-old");
    const freshDir = path.join(tmp, "leapfrog-dry-fresh");
    const other = path.join(tmp, "unrelated");
    for (const dir of [oldDir, freshDir, other]) mkdirSync(dir);
    const longAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    utimesSync(oldDir, longAgo, longAgo);
    utimesSync(other, longAgo, longAgo);
    expect(sweepOldDryCopies(24 * 3600 * 1000, Date.now(), tmp)).toBe(1);
    expect([existsSync(oldDir), existsSync(freshDir), existsSync(other)]).toEqual([false, true, true]);
  });
});

describe("preview manager (real Node servers)", () => {
  const server = "const http=require('http');http.createServer((q,r)=>{if(q.url==='/health'){r.end('ok')}else if(q.url==='/who'){r.end(process.env.WHO||'plain')}else{r.writeHead(404);r.end('nope')}}).listen(process.env.PORT);";

  it("starts Before and After, compares an endpoint, stops, and cleans up", async () => {
    const root = tempDir("lf-prev-");
    const repo = path.join(root, "repo");
    const work = path.join(root, "work");
    for (const [dir, label] of [[repo, "old"], [work, "new"]] as const) {
      write(path.join(dir, "package.json"), JSON.stringify({ name: "demo", scripts: { start: "node server.js" } }));
      write(path.join(dir, "server.js"), server.replace("'plain'", `'${label}'`));
      mkdirSync(path.join(dir, "node_modules"));
    }
    const state = {
      runId: "prev-test-1", repoPath: repo, workPath: work, dryRun: true, ecosystem: "node", status: "passed", artifactsDir: path.join(root, "art"),
      request: { targetJava: "21" }, from: { java: null }, after: null, git: { mode: "none", baseCommit: null }, scan: null, route: null,
    } as unknown as Parameters<typeof startPreview>[0];
    process.env.LEAPFROG_API_TOKEN = "must-not-reach-the-app";
    try {
      expect(previewBlocker(state)).toBeNull();
      expect(previewView(state).sides.before.status).toBe("idle");
      startPreview(state, "both");
      expect(["preparing", "starting"]).toContain(previewView(state).sides.after.status);
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        const view = previewView(state);
        if (view.sides.before.status === "running" && view.sides.after.status === "running") break;
        if (view.sides.before.status === "failed" || view.sides.after.status === "failed") throw new Error(JSON.stringify(view.sides));
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      const view = previewView(state);
      expect(view.sides.before.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
      expect(view.sides.after.port).not.toBe(view.sides.before.port);
      const compare = await compareEndpoint(state.runId, "/who");
      expect(compare.before?.body).toBe("old");
      expect(compare.after?.body).toBe("new");
      expect(compare.same).toBe(false);
      expect((await compareEndpoint(state.runId, "/health")).same).toBe(true);
      expect((await compareEndpoint(state.runId, "/missing")).after?.status).toBe(404);
      const afterPort = view.sides.after.port as number;
      await stopPreview(state.runId, "after");
      expect(previewView(state).sides.after.status).toBe("stopped");
      expect(previewView(state).sides.before.status).toBe("running");
      let closed = false;
      for (let i = 0; i < 40 && !closed; i += 1) {
        closed = (await probe(afterPort, "/", 300)) === null;
        if (!closed) await new Promise((resolve) => setTimeout(resolve, 150));
      }
      expect(closed).toBe(true);
      expect((await compareEndpoint(state.runId, "/who")).after).toBeNull();
      await cleanupPreview(state.runId, state.artifactsDir);
      expect(previewView(state).sides.before.status).toBe("idle");
      expect(existsSync(path.join(state.artifactsDir, "preview"))).toBe(false);
    } finally {
      delete process.env.LEAPFROG_API_TOKEN;
      await cleanupPreview(state.runId, state.artifactsDir);
    }
  }, 90_000);

  it("cleanup of a run that never started, or whose folder is gone, resolves and never throws", async () => {
    const root = tempDir("lf-prev3-");
    await expect(cleanupPreview("never-started", path.join(root, "missing-art"))).resolves.toBeUndefined();
    mkdirSync(path.join(root, "art", "preview", "after"), { recursive: true });
    await expect(cleanupPreview("never-started", path.join(root, "art"))).resolves.toBeUndefined();
    expect(existsSync(path.join(root, "art", "preview"))).toBe(false);
    await expect(stopPreview("never-started")).resolves.toBeUndefined();
  });

  it("explains a missing start script, a gone dry-run copy and a running run instead of faking a start", async () => {
    const root = tempDir("lf-prev2-");
    const work = path.join(root, "work");
    write(path.join(work, "package.json"), JSON.stringify({ name: "x" }));
    mkdirSync(path.join(work, "node_modules"));
    const state = { runId: "prev-test-2", repoPath: work, workPath: work, dryRun: true, ecosystem: "node", status: "passed", artifactsDir: path.join(root, "art"), request: {}, from: {}, git: {}, scan: null, route: null } as unknown as Parameters<typeof startPreview>[0];
    startPreview(state, "after");
    for (let i = 0; i < 100 && previewView(state).sides.after.status === "preparing"; i += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    const side = previewView(state).sides.after;
    expect(side.status).toBe("failed");
    expect(side.message).toMatch(/no "start" script/);
    expect(previewBlocker({ ...state, workPath: path.join(root, "gone") })).toMatch(/removed/);
    expect(previewBlocker({ ...state, status: "running" })).toMatch(/finished/);
    await cleanupPreview(state.runId, state.artifactsDir);
  });
});

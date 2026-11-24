import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { commonKinds, javaKinds, kindsByEcosystem, nodeKinds, pythonKinds } from "../bot/lib/adapters/kinds.js";
import { explainItem, legacyKind, loadCatalogue, officialDocHosts } from "../bot/lib/explain.js";
import { lockedBlockers, predictImpact } from "../bot/lib/impact.js";
import { generatePlan, parsePlanText, planFollowUps, updatePlan, type MigrationPlan } from "../bot/lib/plan.js";
import { tempDir } from "./helpers.js";

const samples = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../samples");
const request = { targets: {}, from: {} };
const leftover = /\{[a-z][A-Za-z]*\}/;

function write(root: string, files: Record<string, string>): string {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

/** Every rendered explanation is from the catalogue and has no unfilled {placeholder}. */
function expectFullyExplained(plan: MigrationPlan) {
  for (const item of plan.items.filter((entry) => entry.source === "deterministic")) {
    const explain = item.explain!;
    expect(explain, item.title).toBeDefined();
    expect(explain.source, `${item.kind} ${item.title}`).toBe("catalogue");
    const text = [explain.plainTitle, explain.inPlainWords, explain.whatWeFound, explain.whyItMatters, explain.whatWillHappen, explain.ifApproved, explain.ifLocked, explain.ifManual, ...explain.manualSteps].join("\n");
    expect(text, `${item.kind}`).not.toMatch(leftover);
  }
}

const javaFixture = {
  "pom.xml": `<project>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>2.7.18</version>
  </parent>
  <properties>
    <java.version>1.8</java.version>
  </properties>
  <dependencies>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>
    <dependency>
      <groupId>org.projectlombok</groupId>
      <artifactId>lombok</artifactId>
      <version>1.18.20</version>
    </dependency>
    <dependency><groupId>io.springfox</groupId><artifactId>springfox-boot-starter</artifactId></dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <artifactId>exec-maven-plugin</artifactId>
      </plugin>
      <plugin>
        <artifactId>jaxb2-maven-plugin</artifactId>
      </plugin>
      <plugin>
        <artifactId>some-odd-plugin</artifactId>
        <configuration><argLine>--illegal-access=permit</argLine></configuration>
      </plugin>
    </plugins>
  </build>
</project>
`,
  "src/main/java/com/acme/Security.java": `package com.acme;
import javax.servlet.Filter;
import com.fasterxml.jackson.databind.ObjectMapper;
public class Security extends WebSecurityConfigurerAdapter {
  class Mvc extends WebMvcConfigurerAdapter {}
  Object r = new CommonsMultipartResolver();
  @EnableGlobalMethodSecurity class M {}
  @Type(type = "json") String data;
  public String getErrorPath() { return "/error"; }
  sun.misc.Unsafe unsafe;
  Object sm = System.getSecurityManager();
  Integer i = new Integer(5);
  protected void finalize() {}
  Object c = Class.forName("javax.servlet.http.HttpServlet");
  native int fast();
}
`,
  "src/test/java/com/acme/SecurityTest.java": "package com.acme;\nclass SecurityTest { @MockBean Object x; }\n",
  "src/main/java/com/acme/generated/Dto.java": "package com.acme.generated;\nimport javax.xml.bind.annotation.XmlRootElement;\n@Generated class Dto {}\n",
  "src/main/java/com/acme/A1.java": "class A1 {}\n",
  "src/main/java/com/acme/A2.java": "class A2 {}\n",
  "src/main/java/com/acme/A3.java": "class A3 {}\n",
  "src/main/java/com/acme/A4.java": "class A4 {}\n",
  "src/main/java/com/acme/A5.java": "class A5 {}\n",
  "src/main/resources/META-INF/spring.factories": "org.springframework.boot.autoconfigure.EnableAutoConfiguration=com.acme.Auto\n",
  "src/main/resources/application.properties": "logging.file=a.log\nlogging.file.name=b.log\nspring.datasource.password=hunter2\n",
  "src/main/webapp/WEB-INF/web.xml": "<web-app/>\n",
  ".env": "TOKEN=x\n",
  "config.example.env": "",
  "db/migration/V1__init.sql": "create table a(id int);\n",
  "native/lib.so": "",
  Dockerfile: "FROM eclipse-temurin:8-jre\n",
  ".github/workflows/ci.yml": "jobs:\n  b:\n    steps:\n      - uses: actions/setup-java@v4\n        with:\n          java-version: 8\n",
  "buildSrc/build.gradle": "",
};

const nodeFixture = {
  "package.json": JSON.stringify(
    {
      name: "fixture",
      engines: { node: ">=18" },
      scripts: { build: "tsc" },
      dependencies: { express: "^4.21.2", "node-sass": "^7.0.0", bcrypt: "^5.0.0", request: "^2.88.0" },
      devDependencies: { typescript: "~4.9.5", "ts-node": "^10.9.0", "ts-jest": "^27.0.0" },
    },
    null,
    2,
  ),
  "yarn.lock": "",
  "tsconfig.json": JSON.stringify({ extends: "./tsconfig.base.json", compilerOptions: { moduleResolution: "node" } }, null, 2),
  "tsconfig.base.json": "{}",
  "src/app.ts": `import express from "express";
import crypto from "crypto";
const app = express();
app.get("/files/*", (req, res) => res.send(404));
app.use((req, res, next) => { req.query = {}; next(); });
const b = new Buffer("x");
const c = crypto.createCipher("aes", "k");
app.del("/x", (req, res) => res.sendfile("a"));
`,
};

const pythonFixture = {
  "requirements.txt": "Django==3.2.25\npydantic==1.10.2\nlxml==4.6.0\ngit+https://github.com/pallets/werkzeug.git#egg=Werkzeug\n",
  "poetry.lock": "",
  "pyproject.toml": '[project]\nname = "fixture"\nrequires-python = ">=3.8"\n',
  "manage.py": "",
  "site/settings.py": "INSTALLED_APPS = ['django.contrib.auth']\n",
  "site/views.py": "import cgi\nimport ssl\nfrom django.utils.encoding import force_text\nfrom django.utils.translation import ugettext\nfrom werkzeug.urls import url_quote\nfrom flask import Flask\napp = Flask(__name__)\n@app.before_first_request\ndef warm():\n    ssl.wrap_socket(None)\n",
  "tests/test_views.py": "import pytest\n",
};

describe("explanation catalogue", () => {
  it("has an entry for every finding kind each adapter can produce (and no stale entries)", () => {
    const common = loadCatalogue("common").entries;
    for (const [ecosystem, kinds] of Object.entries(kindsByEcosystem) as Array<["java" | "node" | "python", readonly string[]]>) {
      const own = loadCatalogue(ecosystem).entries;
      const missing = kinds.filter((kind) => !own[kind] && !common[kind]);
      expect(missing, `${ecosystem} kinds without an explanation`).toEqual([]);
    }
    const known = new Set<string>([...commonKinds, ...javaKinds, ...nodeKinds, ...pythonKinds]);
    for (const id of ["common", "java", "node", "python"] as const) {
      expect(Object.keys(loadCatalogue(id).entries).filter((kind) => !known.has(kind)), `${id}.json stale entries`).toEqual([]);
    }
  });

  it("only links to https official documentation", () => {
    for (const id of ["common", "java", "node", "python"] as const) {
      for (const entry of Object.values(loadCatalogue(id).entries)) {
        for (const link of entry.learnMore) {
          expect(link.url.startsWith("https://")).toBe(true);
          expect(officialDocHosts).toContain(new URL(link.url).hostname);
        }
      }
    }
  });

  it("fully explains the shipping and node-orders plans, with before → after snippets", async () => {
    const shipping = await generatePlan({ repoPath: path.join(samples, "shipping"), request });
    expectFullyExplained(shipping);
    const jakarta = shipping.items.find((item) => item.kind === "recipe.jakarta")!;
    expect(jakarta.explain!.snippets).toEqual(expect.arrayContaining([expect.objectContaining({ before: "import javax.servlet.http.HttpServletRequest;", after: "import jakarta.servlet.http.HttpServletRequest;" })]));
    expect(jakarta.explain!.riskIfSkipped).toBe("blocker");
    expect(jakarta.explain!.learnMore.length).toBeGreaterThan(0);
    const props = shipping.items.find((item) => item.kind === "rules.config")!;
    expect(props.explain!.snippets).toEqual(expect.arrayContaining([{ file: "src/main/resources/application.properties", line: 2, before: "logging.file=logs/shipping.log", after: "logging.file.name=logs/shipping.log" }]));

    const node = await generatePlan({ repoPath: path.join(samples, "node-orders"), request });
    expectFullyExplained(node);
    expect(node.items.find((item) => item.kind === "rules.package-json")!.explain!.snippets).toEqual(expect.arrayContaining([expect.objectContaining({ before: '"express": "^4.21.2"', after: '"express": "^5.3.0"' })]));
  });

  it("fills every template for a project that triggers most Java findings", async () => {
    const plan = await generatePlan({ repoPath: write(tempDir("leapfrog-explain-java-"), javaFixture), request });
    expectFullyExplained(plan);
    const kinds = new Set(plan.items.map((item) => item.kind));
    for (const kind of ["api.security-config", "api.mockbean", "dependency.lombok", "spring-factories", "web-xml", "jvm-flags", "generator-plugin", "custom-build.plugin", "secrets.file", "db-migration", "container", "ci", "inline-secret", "reflection", "javax-string", "native-method"]) {
      expect(kinds, kind).toContain(kind);
    }
  });

  it("fills every template for a project that triggers most Node findings", async () => {
    const plan = await generatePlan({ repoPath: write(tempDir("leapfrog-explain-node-"), nodeFixture), request });
    expectFullyExplained(plan);
    const kinds = new Set(plan.items.map((item) => item.kind));
    for (const kind of ["express-routing", "express-api.req-query", "native-addon", "native-addon.node-sass", "dependency.request", "dependency.ts-node", "dependency.ts-jest", "tsconfig.extends", "tests.no-script", "package-manager", "node-api.removed", "node-api.deprecated"]) {
      expect(kinds, kind).toContain(kind);
    }
  });

  it("fully explains the python-inventory plan and a project that triggers most Python findings", async () => {
    const sample = await generatePlan({ repoPath: path.join(samples, "python-inventory"), request });
    expectFullyExplained(sample);
    expect(sample.items.find((item) => item.kind === "rules.flask-imports")!.explain!.snippets).toEqual(
      expect.arrayContaining([expect.objectContaining({ before: "from flask import Flask, Markup, abort, escape, jsonify, request" })]),
    );
    const plan = await generatePlan({ repoPath: write(tempDir("leapfrog-explain-python-"), pythonFixture), request });
    expectFullyExplained(plan);
    const kinds = new Set(plan.items.map((item) => item.kind));
    for (const kind of ["codemod.django-upgrade", "python-module.removed", "python-api.removed", "werkzeug-api.removed", "flask-api.removed", "django.default-auto-field", "django.use-tz", "dependency.pydantic-v1", "dependency.native-wheel", "dependency.manual", "tests.pytest-undeclared", "package-manager.python"]) {
      expect(kinds, kind).toContain(kind);
    }
  });

  it("explains plans saved before explanations existed (schema back-compat)", async () => {
    const plan = await generatePlan({ repoPath: path.join(samples, "shipping"), request });
    const legacy = {
      ...plan,
      items: plan.items.map(({ kind: _kind, params: _params, snippets: _snippets, explain: _explain, ...rest }) => rest),
    };
    const loaded = parsePlanText(JSON.stringify(legacy));
    for (const item of loaded.items) {
      expect(item.explain, item.title).toBeDefined();
      expect(item.explain!.source).toBe("catalogue");
      expect(item.explain!.kind).toBe(plan.items.find((entry) => entry.id === item.id)!.kind);
    }
    // Decisions survive untouched.
    expect(loaded.items.map((item) => item.decision)).toEqual(plan.items.map((item) => item.decision));
  });

  it("maps every legacy category the adapters produce back to its kind", async () => {
    for (const repo of [write(tempDir("leapfrog-legacy-java-"), javaFixture), path.join(samples, "shipping")]) {
      const plan = await generatePlan({ repoPath: repo, request });
      for (const item of plan.items) expect(legacyKind("java", item), item.title).toBe(item.kind);
    }
    for (const repo of [write(tempDir("leapfrog-legacy-node-"), nodeFixture), path.join(samples, "node-orders")]) {
      const plan = await generatePlan({ repoPath: repo, request });
      for (const item of plan.items) expect(legacyKind("node", item), item.title).toBe(item.kind);
    }
  });

  it("labels AI findings as generic (deterministic text stays authoritative)", () => {
    const explain = explainItem(
      { ecosystem: "node", targets: { node: "24" }, detected: {} },
      { group: "review", category: "ai-risk", severity: "high", title: "Back redirect", file: "src/app.ts", line: 35, why: "Changed in Express 5", suggestion: "Test it", source: "ai" },
    );
    expect(explain).toMatchObject({ source: "generic", confidence: "low", manualSteps: ["Test it"] });
    expect(explain.inPlainWords).toMatch(/^AI-suggested/);
  });
});

describe("impact prediction", () => {
  it("predicts a pass for shipping as planned and a Test-step failure when the javax rename is locked", async () => {
    const plan = await generatePlan({ repoPath: path.join(samples, "shipping"), request });
    expect(predictImpact(plan)).toMatchObject({ outcome: "pass", failsAt: null });
    const jakarta = plan.items.find((item) => item.kind === "recipe.jakarta")!;
    const locked = predictImpact(plan, { decisions: [{ id: jakarta.id, decision: "lock" }] });
    expect(locked).toMatchObject({ outcome: "fail", failsAt: "Test", counts: { breaksRun: 1 } });
    expect(locked.items[jakarta.id]).toMatchObject({ state: "skipped", risk: "blocker", effect: "fails-build" });
    expect(lockedBlockers(locked).map((entry) => entry.id)).toEqual([jakarta.id]);
    expect(locked.label).toMatch(/Prediction/);
  });

  it("flags settings that would be silently ignored without failing the run", async () => {
    const plan = await generatePlan({ repoPath: path.join(samples, "shipping"), request });
    const props = plan.items.find((item) => item.kind === "rules.config")!;
    const boot = plan.items.find((item) => item.kind === "recipe.boot")!;
    const prediction = predictImpact(plan, { decisions: [{ id: props.id, decision: "manual" }] });
    expect(prediction).toMatchObject({ outcome: "pass-with-risks", counts: { breaksRun: 0, runtime: 1 } });
    // The Boot recipe only loses application.properties; its main file (pom.xml) still changes.
    expect(prediction.items[boot.id].state).toBe("partial");
  });

  it("follows shared files: locking pom.xml for a dependency rename blocks the Java and Boot recipes", async () => {
    const plan = await generatePlan({ repoPath: path.join(samples, "shipping"), request });
    const rename = plan.items.find((item) => item.kind === "rules.build")!;
    const prediction = predictImpact(plan, { decisions: [{ id: rename.id, decision: "lock" }] });
    const java = plan.items.find((item) => item.kind === "recipe.java")!;
    expect(prediction.items[java.id]).toMatchObject({ state: "skipped", blockedBy: ["pom.xml"] });
    expect(prediction.items[java.id].text).toMatch(/Update dependency names/);
    expect(prediction.items[rename.id].alsoBlocks).toEqual(expect.arrayContaining([java.id]));
    expect(prediction.outcome).toBe("fail");
    // A protected path does the same.
    expect(predictImpact(plan, { lockedPaths: [{ pattern: "src/main/java/**" }] }).outcome).toBe("fail");
  });

  it("treats project-wide manual items as no-effect and unfixed review blockers as at-risk", async () => {
    const node = await generatePlan({ repoPath: path.join(samples, "node-orders"), request });
    const install = node.items.find((item) => item.kind === "install")!;
    const prediction = predictImpact(node, { decisions: [{ id: install.id, decision: "manual" }] });
    expect(prediction.items[install.id].state).toBe("no-effect");
    expect(prediction.counts.afterMerge).toBe(2);
    const tsconfig = node.items.find((item) => item.kind === "rules.tsconfig")!;
    expect(predictImpact(node, { decisions: [{ id: tsconfig.id, decision: "lock" }] })).toMatchObject({ outcome: "fail", failsAt: "Test" });

    const fixture = await generatePlan({ repoPath: write(tempDir("leapfrog-impact-node-"), nodeFixture), request });
    const routing = fixture.items.find((item) => item.kind === "express-routing")!;
    // "Will break" items the AI can fix are no longer locked: the AI step changes them, so no blocker is predicted.
    expect(routing).toMatchObject({ tier: "breaks", decision: "approve", fixer: "ai" });
    expect(predictImpact(fixture).items[routing.id]).toMatchObject({ state: "open", risk: "none" });
    // Locking one keeps its file unchanged, which is a blocker again.
    expect(predictImpact(fixture, { decisions: [{ id: routing.id, decision: "lock" }] }).items[routing.id]).toMatchObject({ risk: "blocker" });
  });

  it("drops a risk from the prediction once a kept fix removed it, and brings it back on undo", async () => {
    const fixture = await generatePlan({ repoPath: write(tempDir("leapfrog-impact-node-"), nodeFixture), request });
    const routing = fixture.items.find((item) => item.kind === "express-routing")!;
    const approved = { decision: "approve" as const };
    // Locked and not fixed: still a prediction.
    const open = { ...fixture, items: fixture.items.map((item) => (item.id === routing.id ? { ...item, decision: "lock" as const } : item)) };
    expect(predictImpact(open).items[routing.id]).toMatchObject({ state: "open", risk: "blocker" });
    expect(predictImpact(open).consequences.some((entry) => entry.id === routing.id)).toBe(true);
    // A proposed (not yet kept) fix is not applied by the run, so it still counts.
    const proposed = { ...open, items: open.items.map((item) => (item.id === routing.id ? { ...item, ...approved, aiFix: { fixId: "fix-0123456789", status: "proposed" as const, resolved: true, note: "" } } : item)) };
    expect(predictImpact(proposed).items[routing.id].state).toBe("open");
    // Kept and re-checked clean: fixed, no consequence, counts follow.
    const kept = { ...proposed, items: proposed.items.map((item) => (item.id === routing.id ? { ...item, aiFix: { ...item.aiFix!, status: "kept" as const } } : item)) };
    const fixed = predictImpact(kept);
    expect(fixed.items[routing.id]).toMatchObject({ state: "fixed", risk: "none", effect: "none" });
    expect(fixed.consequences.some((entry) => entry.id === routing.id)).toBe(false);
    expect(fixed.counts.fixed).toBe(1);
    expect(fixed.counts.breaksRun + fixed.counts.mayBreakRun).toBeLessThan(predictImpact(open).counts.breaksRun + predictImpact(open).counts.mayBreakRun);
    // Locking the fixed item again makes it a risk again.
    expect(predictImpact(kept, { decisions: [{ id: routing.id, decision: "lock" }] }).items[routing.id].state).not.toBe("fixed");
    // A kept fix that the re-check says is NOT resolved stays a warning.
    const notResolved = { ...kept, items: kept.items.map((item) => (item.id === routing.id ? { ...item, aiFix: { ...item.aiFix!, resolved: false } } : item)) };
    expect(predictImpact(notResolved).items[routing.id].state).toBe("open");
  });

  it("carries explanations into the run's manual follow-up", async () => {
    const plan = await generatePlan({ repoPath: path.join(samples, "shipping"), request });
    const props = plan.items.find((item) => item.kind === "rules.config")!;
    const followUps = planFollowUps(updatePlan(plan, { decisions: [{ id: props.id, decision: "lock" }] }));
    expect(followUps[0]).toMatchObject({ plainTitle: props.explain!.plainTitle, consequence: props.explain!.ifLocked, riskIfSkipped: "high" });
    expect(followUps[0].manualSteps!.length).toBeGreaterThan(0);
  });
});

import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectEcosystem } from "../bot/lib/adapters/index.js";
import { pyupgradeFlag } from "../bot/lib/adapters/python.js";
import { interpreterCandidates, toolsVenvDir, venvBin, venvPython } from "../bot/lib/adapters/pythonEnv.js";
import { loadPythonMatrix, resolvePythonRoute } from "../bot/lib/adapters/pythonMatrix.js";
import { applyPythonRules, bumpSpec, editPyproject, editPythonSource, editRequirements, editSetupPy } from "../bot/lib/adapters/pythonRules.js";
import { firstPythonFailure, impOnlyReload, parsePytestTotals, parseRequirement, scanPythonProject, specVersion } from "../bot/lib/adapters/pythonScan.js";
import { predictImpact } from "../bot/lib/impact.js";
import { isAllowedRelative, repoEcosystem } from "../bot/lib/patch.js";
import { generatePlan } from "../bot/lib/plan.js";
import { tempDir } from "./helpers.js";

const samples = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../samples");
const sample = path.join(samples, "python-inventory");
const request = { targets: {}, from: {} };

function write(root: string, files: Record<string, string>): string {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

function route(python = "3.14") {
  const resolved = resolvePythonRoute({ python });
  if (!resolved.ok) throw new Error(resolved.error);
  return resolved;
}

describe("python detection", () => {
  it("detects each kind of Python project marker", () => {
    for (const marker of ["pyproject.toml", "requirements.txt", "requirements-dev.txt", "setup.py", "setup.cfg", "Pipfile"]) {
      const dir = write(tempDir("leapfrog-py-detect-"), { [marker]: "" });
      expect(detectEcosystem(dir), marker).toBe("python");
      expect(repoEcosystem(dir), marker).toBe("python");
    }
  });

  it("keeps Java first, and picks Python over Node only with Python project metadata", () => {
    expect(detectEcosystem(write(tempDir("leapfrog-py-java-"), { "pom.xml": "<project/>", "requirements.txt": "" }))).toBe("java");
    expect(detectEcosystem(write(tempDir("leapfrog-py-node-"), { "package.json": "{}", "requirements.txt": "mkdocs\n" }))).toBe("node");
    expect(detectEcosystem(write(tempDir("leapfrog-py-django-"), { "package.json": "{}", "manage.py": "", "requirements.txt": "Django==4.2\n" }))).toBe("python");
    expect(repoEcosystem(write(tempDir("leapfrog-py-django2-"), { "package.json": "{}", "pyproject.toml": "" }))).toBe("python");
  });
});

describe("python scan", () => {
  it("reads the sample's versions, framework, tests and removed APIs", () => {
    const scan = scanPythonProject(sample);
    expect(scan).toMatchObject({ ecosystem: "python", pythonVersion: "3.8", installSource: "requirements", framework: "flask", flaskVersion: "2.0", testRunner: "pytest", packageManager: "pip" });
    const apis = scan.hits.map((hit) => `${hit.file}:${hit.api}`);
    expect(apis).toEqual(expect.arrayContaining(["inventory/plugins.py:imp module", "inventory/settings.py:configparser.SafeConfigParser"]));
    expect(scan.hits.filter((hit) => hit.removedIn === null).length).toBe(3);
  });

  it("parses requirement lines and specifiers", () => {
    expect(parseRequirement("Flask[async]==2.0.3 ; python_version < '3.12'  # web")).toMatchObject({ name: "Flask", extras: "[async]", spec: "==2.0.3" });
    expect(specVersion("==2.0.3")).toBe("2.0.3");
    expect(specVersion(">=2,<3")).toBe("2");
    expect(specVersion("<3")).toBeNull();
  });

  it("finds Django removals, settings defaults and pydantic v1", () => {
    const dir = write(tempDir("leapfrog-py-django-scan-"), {
      "requirements.txt": "Django==3.2.25\npydantic==1.10.2\n",
      "manage.py": "",
      "app/settings.py": "INSTALLED_APPS = ['django.contrib.auth']\n",
      "app/views.py": "from django.utils.encoding import force_text\nfrom django.conf.urls import url\nimport cgi\n",
      "app/tests.py": "from django.test import TestCase\n",
    });
    const scan = scanPythonProject(dir);
    expect(scan).toMatchObject({ framework: "django", djangoVersion: "3.2", testRunner: "django", hasManagePy: true });
    expect(scan.hits.map((hit) => hit.api)).toEqual(expect.arrayContaining([expect.stringMatching(/force_text/), expect.stringMatching(/cgi/)]));
  });

  it("parses pytest and unittest totals, and the first failure", () => {
    expect(parsePytestTotals("==== 2 failed, 7 passed, 1 skipped in 0.3s ====")).toMatchObject({ testsRun: 10, failures: 2, skipped: 1 });
    expect(parsePytestTotals("Ran 4 tests in 0.01s\n\nOK")).toMatchObject({ testsRun: 4, failures: 0 });
    expect(firstPythonFailure("E   ImportError: cannot import name 'Markup' from 'flask'")).toMatch(/ImportError/);
  });
});

describe("python matrix", () => {
  it("validates, defaults to 3.14 and pins the tools", () => {
    const matrix = loadPythonMatrix();
    expect(matrix.defaults.python).toBe("3.14");
    expect(matrix.tools.pyupgrade).toMatch(/^pyupgrade==\d/);
    expect(matrix.tools.djangoUpgrade).toMatch(/^django-upgrade==\d/);
    expect(route("3.15").route.frameworks.django).toBe("6.1");
    expect(route("3.14").route.frameworks.django).toBe("5.2");
    expect(resolvePythonRoute({ python: "2.7" }).ok).toBe(false);
    expect(resolvePythonRoute({ python: "3.15", fromPython: "3.8" }).ok).toBe(false);
    expect(pyupgradeFlag("3.14")).toBe("--py314-plus");
  });
});

describe("python rules", () => {
  it("bumps pins without downgrading and keeps the pin style", () => {
    expect(bumpSpec("==2.0.3", "3.1.3")).toBe("==3.1.3");
    expect(bumpSpec(">=2.0,<3", "3.1.3")).toMatch(/^~=3\.1/);
    const result = editRequirements("Flask==2.0.3  # web\nWerkzeug>=9.0\nrequests==2.31.0\n", route().route);
    expect(result.text).toContain("Flask==3.1.3  # web");
    expect(result.text).toContain("Werkzeug>=9.0");
    expect(result.text).toContain("requests==2.31.0");
  });

  it("raises requires-python and dependencies in pyproject.toml and setup.py", () => {
    const toml = editPyproject('[project]\nname = "x"\nrequires-python = ">=3.8"\ndependencies = ["Flask==2.0.3", "click>=7"]\n', route().route);
    expect(toml.text).toContain('requires-python = ">=3.14"');
    expect(toml.text).toContain('"Flask==3.1.3"');
    const setup = editSetupPy('setup(name="x", python_requires=">=3.8", install_requires=["Flask==2.0.3"])\n', route().route);
    expect(setup.text).toContain('python_requires=">=3.14"');
    expect(setup.text).toContain('"Flask==3.1.3"');
  });

  it("rewrites removed stdlib and Flask names, and only rewrites imp when reload is all it uses", () => {
    const context = { python: "3.14", flaskTarget: "3.1", flaskDeclared: true };
    const source = 'import imp\nfrom flask import Flask, Markup, escape\nfrom configparser import SafeConfigParser\np = SafeConfigParser()\np.readfp(f)\nimp.reload(m)\napp.config["JSON_SORT_KEYS"] = False\nself.assertEquals(1, 1)\n';
    const out = editPythonSource(source, context).text;
    expect(out).toContain("import importlib");
    expect(out).toContain("importlib.reload(m)");
    expect(out).toContain("from markupsafe import Markup, escape");
    expect(out).toContain("from flask import Flask");
    expect(out).toContain("ConfigParser()");
    expect(out).toContain("read_file(f)");
    expect(out).toContain("app.json.sort_keys = False");
    expect(out).toContain("assertEqual(1, 1)");
    expect(impOnlyReload("import imp\nimp.load_source('a', 'b')\n")).toBe(false);
    expect(editPythonSource(out, context).changes).toEqual([]);
  });

  it("is idempotent on the sample and never writes a locked file", () => {
    const dir = path.join(tempDir("leapfrog-py-rules-"), "repo");
    cpSync(sample, dir, { recursive: true });
    const resolved = route();
    const options = { route: resolved.route, latestPatch: resolved.latestPatch, flaskDeclared: true, write: true };
    const appBefore = readFileSync(path.join(dir, "inventory/app.py"), "utf8");
    const first = applyPythonRules(dir, { ...options, isLocked: (file) => file === "inventory/app.py" });
    expect(first.filter((edit) => edit.applied).length).toBeGreaterThan(5);
    expect(first.filter((edit) => edit.file === "inventory/app.py").every((edit) => !edit.applied)).toBe(true);
    expect(readFileSync(path.join(dir, "inventory/app.py"), "utf8")).toBe(appBefore);
    expect(readFileSync(path.join(dir, ".python-version"), "utf8").trim()).toBe("3.14");
    expect(readFileSync(path.join(dir, "runtime.txt"), "utf8").trim()).toBe(`python-${resolved.latestPatch}`);
    applyPythonRules(dir, options);
    expect(applyPythonRules(dir, options)).toEqual([]);
  });
});

describe("python on Windows and POSIX", () => {
  it("uses Scripts\\*.exe on Windows and bin/ elsewhere", () => {
    expect(venvPython("C:\\runs\\venv", "win32")).toBe("C:\\runs\\venv\\Scripts\\python.exe");
    expect(venvBin("/runs/venv", "pytest", "linux")).toBe("/runs/venv/bin/pytest");
  });

  it("tries the py launcher on Windows and pythonX.Y elsewhere, after the override", () => {
    expect(interpreterCandidates("3.14", "win32", null)[0]).toEqual({ command: "py", args: ["-3.14"] });
    expect(interpreterCandidates("3.14", "linux", null)[0]).toEqual({ command: "python3.14", args: [] });
    expect(interpreterCandidates("3.14", "darwin", "/opt/py/bin/python")[0]).toEqual({ command: "/opt/py/bin/python", args: [] });
  });

  it("keys the tools venv by Python line and pins", () => {
    expect(toolsVenvDir("3.14", ["pyupgrade==3.22.0"])).not.toBe(toolsVenvDir("3.13", ["pyupgrade==3.22.0"]));
    expect(toolsVenvDir("3.14", ["pyupgrade==3.22.0"])).not.toBe(toolsVenvDir("3.14", ["pyupgrade==3.21.0"]));
  });

  it("lets the AI fix-up touch .py and dependency files, never a venv", () => {
    expect(isAllowedRelative("inventory/app.py", "python")).toBe(true);
    expect(isAllowedRelative("requirements-dev.txt", "python")).toBe(true);
    expect(isAllowedRelative("pyproject.toml", "python")).toBe(true);
    expect(isAllowedRelative(".venv/lib/python3.14/site-packages/flask/app.py", "python")).toBe(false);
    expect(isAllowedRelative("pkg/__pycache__/a.py", "python")).toBe(false);
    expect(isAllowedRelative("../outside.py", "python")).toBe(false);
  });
});

describe("python plan", () => {
  it("plans the sample with catalogue explanations and predicts a pass", async () => {
    const plan = await generatePlan({ repoPath: sample, request });
    expect(plan.ecosystem).toBe("python");
    expect(plan.routeId).toBe("to-py314");
    const kinds = plan.items.map((item) => item.kind);
    expect(kinds).toEqual(expect.arrayContaining(["codemod.pyupgrade", "rules.requirements", "rules.pyproject", "rules.stdlib", "rules.flask-imports", "rules.flask-json-config", "install.venv", "python-api.deprecated", "flask-api.deprecated"]));
    expect(kinds).not.toContain("codemod.django-upgrade");
    expect(predictImpact(plan, { decisions: [] }).outcome).not.toBe("fail");
  });

  it("predicts the Test step fails when a blocker is locked", async () => {
    const plan = await generatePlan({ repoPath: sample, request });
    for (const kind of ["rules.flask-imports", "rules.stdlib", "rules.requirements"]) {
      const item = plan.items.find((entry) => entry.kind === kind)!;
      expect(predictImpact(plan, { decisions: [{ id: item.id, decision: "lock" }] }), kind).toMatchObject({ outcome: "fail", failsAt: "Test" });
    }
    const pyproject = plan.items.find((entry) => entry.kind === "rules.pyproject")!;
    expect(predictImpact(plan, { decisions: [{ id: pyproject.id, decision: "lock" }] })).toMatchObject({ outcome: "fail", failsAt: "Checks" });
    const pyupgrade = plan.items.find((entry) => entry.kind === "codemod.pyupgrade")!;
    // Locking pyupgrade keeps its files (app.py among them) unchanged, so the Flask import rule on app.py is blocked too.
    const viaLock = predictImpact(plan, { decisions: [{ id: pyupgrade.id, decision: "lock" }] });
    expect(viaLock).toMatchObject({ outcome: "fail", failsAt: "Test" });
    expect(viaLock.consequences.find((entry) => entry.reason === "blocked-by-lock" && entry.where.startsWith("inventory/app.py"))).toBeDefined();
  });

  it("plans Django projects with django-upgrade and refuses projects pip cannot install", async () => {
    const django = await generatePlan({
      repoPath: write(tempDir("leapfrog-py-plan-django-"), {
        "requirements.txt": "Django==3.2.25\n",
        "manage.py": "",
        "app/settings.py": "INSTALLED_APPS = []\n",
        "app/views.py": "from django.utils.encoding import force_text\n",
      }),
      request,
    });
    expect(django.items.map((item) => item.kind)).toEqual(expect.arrayContaining(["codemod.django-upgrade", "django.default-auto-field", "django.use-tz"]));
    const none = await generatePlan({ repoPath: write(tempDir("leapfrog-py-plan-none-"), { Pipfile: "[packages]\nflask = \"==2.0.3\"\n", "a.py": "" }), request });
    expect(none.items.map((item) => item.kind)).toContain("install.none");
  });
});

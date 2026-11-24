import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { listRepoFiles, matchingLines, readText } from "./findings.js";
import { compareVersions, normalizeDist, normalizePython } from "./pythonMatrix.js";

/** One declared dependency (requirements*.txt line, pyproject / setup.py string, Poetry key). */
export type Requirement = {
  file: string;
  line: number;
  name: string;
  /** Normalised (PEP 503) name. */
  key: string;
  /** Version specifier as written ("==2.0.3", ">=2,<3", "^2.0"), "" when unpinned. */
  spec: string;
  /** Lowest version the specifier allows ("2.0.3"), or null. */
  version: string | null;
  text: string;
};

export type PyHitKind = "removed-module" | "stdlib-api" | "flask-api" | "werkzeug-api" | "django-api";

export type PyApiHit = {
  file: string;
  line: number;
  kind: PyHitKind;
  api: string;
  text: string;
  replacement: string;
  /** Python (stdlib) or framework version that removed it; null = deprecated only. */
  removedIn: string | null;
  /** Which automatic step fixes it: a rule id ("stdlib:unittest-aliases"), "django-upgrade", or null (review / manual). */
  fix: string | null;
};

export type PythonVersionSource = { file: string; line: number | null; value: string; version: string; kind: "metadata" | "version-file" };

export type PythonScanResult = {
  ecosystem: "python";
  repoPath: string;
  name: string | null;
  /** major.minor the project declares (requires-python, python_requires, .python-version, runtime.txt, Pipfile). */
  pythonVersion: string | null;
  pythonSource: string | null;
  versionSources: PythonVersionSource[];
  requiresPython: string | null;
  /** How dependencies are installed: requirements files, pyproject [project], setup.py/cfg, or nothing pip can use. */
  installSource: "requirements" | "pyproject" | "setup" | "none";
  requirementFiles: string[];
  dependencyFiles: string[];
  packageManager: "pip" | "poetry" | "pipenv" | "uv" | "pdm";
  lockfile: string | null;
  requirements: Requirement[];
  framework: "django" | "flask" | "fastapi" | null;
  django: string | null;
  djangoVersion: string | null;
  flask: string | null;
  flaskVersion: string | null;
  werkzeug: string | null;
  fastapi: string | null;
  pydantic: string | null;
  pytest: string | null;
  /** How the tests run: pytest, Django's manage.py test, unittest discovery, or none found. */
  testRunner: "pytest" | "django" | "unittest" | null;
  hasManagePy: boolean;
  settingsFiles: string[];
  hits: PyApiHit[];
  sourceFiles: number;
  testFiles: number;
  filesScanned: number;
  notes: string[];
};

// ---- requirement parsing -------------------------------------------------------

const reqLine = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*(\[[^\]]*\])?\s*((?:===|==|>=|<=|~=|!=|<|>)\s*[^;#\s,]+(?:\s*,\s*(?:===|==|>=|<=|~=|!=|<|>)\s*[^;#\s,]+)*)?\s*(;[^#]*)?(#.*)?$/;

/** Lowest version a specifier allows: "==2.0.3" → 2.0.3, ">=2,<3" → 2, "~=1.4" → 1.4, "^2.0" (Poetry) → 2.0. */
export function specVersion(spec: string): string | null {
  const match = /(?:===|==|>=|~=|\^|~|^)\s*v?(\d+(?:\.\d+)*)/.exec(spec.trim());
  if (!match) return null;
  if (/^\s*(<|<=|!=)/.test(spec) && !/(>=|==|~=)/.test(spec)) return null;
  const lower = /(?:===|==|>=|~=|\^|~)\s*(\d+(?:\.\d+)*)/.exec(spec);
  return lower ? lower[1] : match[1];
}

/** Parse one PEP 508 requirement string ("Flask[async]==2.0.3; python_version<'3.9'"). Null for options, URLs and editables. */
export function parseRequirement(text: string): { name: string; extras: string; spec: string; marker: string; comment: string } | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-") || /^[\w+.-]+:\/\//.test(trimmed) || /\s@\s/.test(trimmed)) return null;
  const match = reqLine.exec(text);
  if (!match) return null;
  return { name: match[1], extras: match[2] ?? "", spec: (match[3] ?? "").replace(/\s+/g, ""), marker: match[4] ?? "", comment: match[5] ?? "" };
}

export function requirementFilesOf(files: string[]): string[] {
  return files.filter((file) => /(^|\/)requirements[\w.-]*\.(txt|in)$/i.test(file) && !file.includes("/site-packages/") && file.split("/").length <= 3);
}

function requirementsFromLines(root: string, file: string): Requirement[] {
  const out: Requirement[] = [];
  readText(root, file)
    .split(/\r?\n/)
    .forEach((text, index) => {
      const parsed = parseRequirement(text);
      if (!parsed) return;
      out.push({ file, line: index + 1, name: parsed.name, key: normalizeDist(parsed.name), spec: parsed.spec, version: specVersion(parsed.spec), text: text.trim() });
    });
  return out;
}

/**
 * Quoted PEP 508 strings inside dependency arrays: pyproject.toml [project]
 * dependencies / optional-dependencies / [dependency-groups], and setup.py
 * install_requires / tests_require / extras_require. Poetry tables use
 * `name = "^2.0"` keys instead.
 */
function requirementsFromQuoted(root: string, file: string): Requirement[] {
  const out: Requirement[] = [];
  const lines = readText(root, file).split(/\r?\n/);
  const toml = file.endsWith("pyproject.toml");
  let section = "";
  let depth = 0;
  let extras = 0;
  lines.forEach((text, index) => {
    const header = toml ? /^\s*\[([^\]]+)\]\s*$/.exec(text) : null;
    if (header) {
      section = header[1].trim();
      depth = 0;
      return;
    }
    if (toml && section.startsWith("tool.poetry") && /dependencies$/.test(section)) {
      const poetry = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=\s*["']([^"']*)["']/.exec(text);
      if (poetry && poetry[1].toLowerCase() !== "python") {
        out.push({ file, line: index + 1, name: poetry[1], key: normalizeDist(poetry[1]), spec: poetry[2], version: specVersion(poetry[2]), text: text.trim() });
      }
      return;
    }
    const opens = toml
      ? (section === "project" && /^\s*dependencies\s*=\s*\[/.test(text)) || ((section === "project.optional-dependencies" || section === "dependency-groups") && /^\s*[\w.-]+\s*=\s*\[/.test(text))
      : /\b(install_requires|tests_require|setup_requires)\s*=\s*\[|\bextras_require\s*=/.test(text);
    if (opens) {
      depth = 1;
      extras = !toml && /\bextras_require\s*=/.test(text) ? 1 : 0;
    }
    if (!depth) return;
    for (const match of text.matchAll(/["']([^"']+)["']/g)) {
      const parsed = parseRequirement(match[1]);
      if (!parsed || (!toml && /^(install_requires|tests_require|extras_require|setup_requires|test|dev|tests)$/.test(parsed.name) && !parsed.spec)) continue;
      out.push({ file, line: index + 1, name: parsed.name, key: normalizeDist(parsed.name), spec: parsed.spec, version: specVersion(parsed.spec), text: text.trim() });
    }
    const bare = text.replace(/["'][^"']*["']/g, "");
    if (extras) {
      if (/\}/.test(bare)) depth = extras = 0;
    } else if (/\]/.test(bare)) {
      depth = 0;
    }
  });
  return out;
}

function requirementsFromSetupCfg(root: string, file: string): Requirement[] {
  const out: Requirement[] = [];
  let inBlock = false;
  readText(root, file)
    .split(/\r?\n/)
    .forEach((text, index) => {
      if (/^\s*(install_requires|tests_require)\s*=/.test(text)) {
        inBlock = true;
        const inline = text.split("=").slice(1).join("=").trim();
        if (inline) {
          const parsed = parseRequirement(inline);
          if (parsed) out.push({ file, line: index + 1, name: parsed.name, key: normalizeDist(parsed.name), spec: parsed.spec, version: specVersion(parsed.spec), text: text.trim() });
        }
        return;
      }
      if (inBlock && /^\s+\S/.test(text)) {
        const parsed = parseRequirement(text);
        if (parsed) out.push({ file, line: index + 1, name: parsed.name, key: normalizeDist(parsed.name), spec: parsed.spec, version: specVersion(parsed.spec), text: text.trim() });
        return;
      }
      if (/^\S/.test(text) || !text.trim()) inBlock = false;
    });
  return out;
}

// ---- version sources ----------------------------------------------------------------

/** Every place the project states its Python version, in priority order (packaging metadata first). */
export function pythonVersionSources(root: string): PythonVersionSource[] {
  const out: PythonVersionSource[] = [];
  const add = (file: string, pattern: RegExp, kind: PythonVersionSource["kind"], group = 1) => {
    const text = readText(root, file);
    if (!text) return;
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const match = pattern.exec(lines[index]);
      if (match) {
        const version = normalizePython(match[group]);
        if (version !== "unknown") out.push({ file, line: index + 1, value: match[group].trim(), version, kind });
        return;
      }
    }
  };
  add("pyproject.toml", /^\s*requires-python\s*=\s*["']([^"']+)["']/, "metadata");
  add("pyproject.toml", /^\s*python\s*=\s*["']([^"']+)["']/, "metadata");
  add("setup.cfg", /^\s*python_requires\s*=\s*(.+)$/, "metadata");
  add("setup.py", /python_requires\s*=\s*["']([^"']+)["']/, "metadata");
  add(".python-version", /^\s*(\d+\.\d+[^\s]*)/, "version-file");
  add("runtime.txt", /^\s*python-(\d+\.\d+[^\s]*)/, "version-file");
  add("Pipfile", /^\s*python_version\s*=\s*["']([^"']+)["']/, "version-file");
  return out;
}

// ---- API rules ---------------------------------------------------------------------------

type ModuleRule = { module: string; removedIn: string; replacement: string };

/** Standard-library modules removed by PEP 632 (3.12), the 3.12 removals and PEP 594 (3.13). */
export const removedModules: ModuleRule[] = [
  { module: "distutils", removedIn: "3.12", replacement: "setuptools, packaging (versions), shutil / sysconfig" },
  { module: "imp", removedIn: "3.12", replacement: "importlib (importlib.reload, importlib.util)" },
  { module: "asynchat", removedIn: "3.12", replacement: "asyncio" },
  { module: "asyncore", removedIn: "3.12", replacement: "asyncio" },
  { module: "smtpd", removedIn: "3.12", replacement: "the aiosmtpd package" },
  ...["aifc", "audioop", "cgi", "cgitb", "chunk", "crypt", "imghdr", "mailcap", "msilib", "nis", "nntplib", "ossaudiodev", "pipes", "sndhdr", "spwd", "sunau", "telnetlib", "uu", "xdrlib"].map((module) => ({
    module,
    removedIn: "3.13",
    replacement:
      ({
        cgi: "urllib.parse / email.message (or the legacy-cgi package)",
        cgitb: "the traceback module",
        crypt: "hashlib or the passlib / bcrypt packages",
        imghdr: "the filetype or Pillow packages",
        pipes: "shlex.quote / subprocess",
        telnetlib: "the telnetlib3 package or paramiko",
        uu: "base64",
        mailcap: "mimetypes",
      } as Record<string, string>)[module] ?? "a maintained package from PyPI (see PEP 594)",
  })),
  { module: "lib2to3", removedIn: "3.13", replacement: "LibCST or parso" },
  { module: "tkinter.tix", removedIn: "3.13", replacement: "tkinter.ttk" },
];

type LineRule = { pattern: RegExp; kind: PyHitKind; api: string; replacement: string; removedIn: string | null; fix: string | null; only?: RegExp };

/** Python 3.12–3.14 removals and deprecations we can see on one line. */
export const stdlibRules: LineRule[] = [
  {
    pattern: /\.(assertEquals|assertNotEquals|assertAlmostEquals|assertNotAlmostEquals|failUnlessEqual|failIfEqual|failUnlessAlmostEqual|failIfAlmostEqual|failUnlessRaises|failUnless|failIf|assert_|assertRegexpMatches|assertRaisesRegexp|assertNotRegexpMatches)\s*\(/,
    kind: "stdlib-api",
    api: "unittest deprecated aliases (assertEquals, assertRaisesRegexp…)",
    replacement: "assertEqual / assertRaisesRegex / assertTrue…",
    removedIn: "3.12",
    fix: "stdlib:unittest-aliases",
  },
  { pattern: /\.assertDictContainsSubset\s*\(/, kind: "stdlib-api", api: "TestCase.assertDictContainsSubset()", replacement: "assertLessEqual(expected.items(), actual.items())", removedIn: "3.12", fix: null },
  { pattern: /\bSafeConfigParser\b/, kind: "stdlib-api", api: "configparser.SafeConfigParser", replacement: "configparser.ConfigParser", removedIn: "3.12", fix: "stdlib:configparser", only: /configparser/ },
  { pattern: /\.readfp\s*\(/, kind: "stdlib-api", api: "ConfigParser.readfp()", replacement: "ConfigParser.read_file()", removedIn: "3.12", fix: "stdlib:configparser", only: /configparser/ },
  { pattern: /\bssl\.wrap_socket\s*\(/, kind: "stdlib-api", api: "ssl.wrap_socket()", replacement: "ssl.SSLContext().wrap_socket()", removedIn: "3.12", fix: null },
  { pattern: /\bssl\.match_hostname\s*\(/, kind: "stdlib-api", api: "ssl.match_hostname()", replacement: "SSLContext hostname checking (check_hostname)", removedIn: "3.12", fix: null },
  { pattern: /\bunittest\.(makeSuite|findTestCases|getTestCaseNames)\s*\(/, kind: "stdlib-api", api: "unittest.makeSuite() / findTestCases()", replacement: "unittest.TestLoader().loadTestsFromTestCase()", removedIn: "3.13", fix: null },
  { pattern: /\blocale\.resetlocale\s*\(/, kind: "stdlib-api", api: "locale.resetlocale()", replacement: "locale.setlocale(locale.LC_ALL, \"\")", removedIn: "3.13", fix: null },
  { pattern: /\btyping\.(io|re)\b|from\s+typing\.(io|re)\s+import/, kind: "stdlib-api", api: "typing.io / typing.re", replacement: "typing.IO / typing.Pattern / typing.Match", removedIn: "3.13", fix: null },
  { pattern: /\bpkgutil\.(find_loader|get_loader)\s*\(/, kind: "stdlib-api", api: "pkgutil.find_loader() / get_loader()", replacement: "importlib.util.find_spec()", removedIn: "3.14", fix: null },
  { pattern: /\bast\.(Num|Str|Bytes|NameConstant|Ellipsis)\b/, kind: "stdlib-api", api: "ast.Num / ast.Str / ast.Bytes / ast.NameConstant", replacement: "ast.Constant", removedIn: "3.14", fix: null },
  { pattern: /\b(FancyURLopener|URLopener)\s*\(/, kind: "stdlib-api", api: "urllib.request.URLopener / FancyURLopener", replacement: "urllib.request.urlopen() / urlretrieve()", removedIn: "3.14", fix: null, only: /urllib/ },
  { pattern: /\bdatetime\.(utcnow|utcfromtimestamp)\s*\(|\b(?<!\.)utcnow\s*\(\)/, kind: "stdlib-api", api: "datetime.utcnow() / utcfromtimestamp()", replacement: "datetime.now(datetime.UTC) / fromtimestamp(ts, datetime.UTC)", removedIn: null, fix: null },
];

/** Flask 2.3 / 3.0 removals and Werkzeug 3 removals (Flask changelog). */
export const flaskRules: LineRule[] = [
  { pattern: /^\s*from\s+flask\s+import\s+[^()#]*\b(Markup|escape)\b/, kind: "flask-api", api: "from flask import Markup / escape", replacement: "from markupsafe import Markup, escape", removedIn: "3.0", fix: "flask:markup-import" },
  { pattern: /\bflask\.(Markup|escape)\b/, kind: "flask-api", api: "flask.Markup / flask.escape", replacement: "markupsafe.Markup / markupsafe.escape", removedIn: "3.0", fix: null },
  { pattern: /\.before_first_request\b|\.before_app_first_request\b/, kind: "flask-api", api: "@app.before_first_request", replacement: "run the setup once inside create_app() with app.app_context()", removedIn: "2.3", fix: null },
  { pattern: /\bjson_(en|de)coder\s*=|from\s+flask\.json\s+import\s+[^#]*\bJSON(En|De)coder\b|\bflask\.json\.JSON(En|De)coder\b/, kind: "flask-api", api: "app.json_encoder / flask.json.JSONEncoder", replacement: "a flask.json.provider.DefaultJSONProvider subclass set on app.json", removedIn: "2.3", fix: null },
  {
    pattern: /\.config\[\s*["'](JSON_SORT_KEYS|JSON_AS_ASCII|JSONIFY_MIMETYPE)["']\s*\]\s*=/,
    kind: "flask-api",
    api: "app.config[\"JSON_SORT_KEYS\" / \"JSON_AS_ASCII\" / \"JSONIFY_MIMETYPE\"]",
    replacement: "app.json.sort_keys / app.json.ensure_ascii / app.json.mimetype",
    removedIn: "2.3",
    fix: "flask:json-config",
  },
  { pattern: /^\s*(JSON_SORT_KEYS|JSON_AS_ASCII|JSONIFY_MIMETYPE|JSONIFY_PRETTYPRINT_REGULAR)\s*=|["']JSONIFY_PRETTYPRINT_REGULAR["']/, kind: "flask-api", api: "JSON_* / JSONIFY_* config keys", replacement: "attributes on app.json (DefaultJSONProvider)", removedIn: "2.3", fix: null },
  { pattern: /\b_(app|request)_ctx_stack\b/, kind: "flask-api", api: "_app_ctx_stack / _request_ctx_stack", replacement: "flask.g or flask.globals.app_ctx / request_ctx", removedIn: "3.0", fix: null },
  { pattern: /\bflask\.__version__\b/, kind: "flask-api", api: "flask.__version__", replacement: "importlib.metadata.version(\"flask\")", removedIn: null, fix: null },
  { pattern: /from\s+werkzeug\.urls\s+import\s+[^#]*\b(url_quote|url_unquote|url_encode|url_decode|url_parse|url_join|url_fix|iri_to_uri)\b|\bwerkzeug\.urls\.(url_quote|url_unquote|url_encode|url_decode|url_parse|url_join|url_fix)\b/, kind: "werkzeug-api", api: "werkzeug.urls helpers (url_quote, url_parse…)", replacement: "urllib.parse (quote, unquote, urlencode, urlsplit, urljoin)", removedIn: "3.0", fix: null },
];

/** Django APIs removed by 4.0–5.1. Most are rewritten by django-upgrade; the rest are review items. */
export const djangoRules: LineRule[] = [
  { pattern: /\b(force_text|smart_text)\b/, kind: "django-api", api: "force_text / smart_text", replacement: "force_str / smart_str", removedIn: "4.0", fix: "django-upgrade", only: /django/ },
  { pattern: /\b(ugettext_lazy|ugettext_noop|ugettext|ungettext_lazy|ungettext)\b/, kind: "django-api", api: "ugettext / ungettext (and _lazy)", replacement: "gettext / ngettext (and _lazy)", removedIn: "4.0", fix: "django-upgrade", only: /django/ },
  { pattern: /from\s+django\.conf\.urls\s+import\s+[^#]*\burl\b|\bconf\.urls\.url\s*\(/, kind: "django-api", api: "django.conf.urls.url()", replacement: "django.urls.path() / re_path()", removedIn: "4.0", fix: "django-upgrade" },
  { pattern: /^\s*USE_L10N\s*=/, kind: "django-api", api: "USE_L10N setting", replacement: "nothing (localisation is always on since Django 5.0)", removedIn: "5.0", fix: "django-upgrade" },
  { pattern: /^\s*default_app_config\s*=/, kind: "django-api", api: "default_app_config", replacement: "nothing (AppConfig is found automatically)", removedIn: "4.1", fix: "django-upgrade" },
  { pattern: /\bNullBooleanField\s*\(/, kind: "django-api", api: "models.NullBooleanField", replacement: "models.BooleanField(null=True)", removedIn: "4.0", fix: "django-upgrade", only: /django|models/ },
  { pattern: /\bindex_together\s*=/, kind: "django-api", api: "Meta.index_together", replacement: "Meta.indexes = [models.Index(fields=…)]", removedIn: "5.1", fix: "django-upgrade" },
  { pattern: /\bdjango\.utils\.six\b|from\s+django\.utils\s+import\s+[^#]*\bsix\b/, kind: "django-api", api: "django.utils.six", replacement: "plain Python 3 (or the six package)", removedIn: "3.0", fix: null },
  { pattern: /\bdjango\.utils\.encoding\s+import\s+[^#]*\bpython_2_unicode_compatible\b/, kind: "django-api", api: "python_2_unicode_compatible", replacement: "nothing (define __str__)", removedIn: "3.0", fix: null },
];

export const pySkipDirs = [".venv", "venv", "__pycache__", ".pytest_cache", ".tox", ".nox", ".mypy_cache", ".ruff_cache", ".eggs", "site-packages", "htmlcov"];
const pyTest = /(^|\/)(tests?)\/|(^|\/)test_[^/]*\.py$|_tests?\.py$|(^|\/)tests?\.py$|(^|\/)conftest\.py$/;

export function pythonFilesOf(root: string): { all: string[]; code: string[]; sources: string[]; tests: string[] } {
  const all = listRepoFiles(root).filter((file) => !file.split("/").some((part) => pySkipDirs.includes(part) || part.endsWith(".egg-info")));
  const code = all.filter((file) => file.endsWith(".py"));
  return { all, code, sources: code.filter((file) => !pyTest.test(file)), tests: code.filter((file) => pyTest.test(file)) };
}

function moduleHits(file: string, text: string): PyApiHit[] {
  const hits: PyApiHit[] = [];
  const lines = text.split(/\r?\n/);
  const onlyReload = impOnlyReload(text);
  lines.forEach((raw, index) => {
    const line = raw.replace(/#.*$/, "");
    const modules: string[] = [];
    const imp = /^\s*import\s+(.+)$/.exec(line);
    if (imp) for (const part of imp[1].split(",")) modules.push(part.trim().split(/\s+as\s+/)[0].trim());
    const from = /^\s*from\s+([\w.]+)\s+import\b/.exec(line);
    if (from) modules.push(from[1]);
    for (const module of modules) {
      const rule = removedModules.find((item) => module === item.module || module.startsWith(`${item.module}.`));
      if (!rule) continue;
      hits.push({
        file,
        line: index + 1,
        kind: "removed-module",
        api: `${rule.module} module`,
        text: raw.trim().slice(0, 240),
        replacement: rule.replacement,
        removedIn: rule.removedIn,
        fix: rule.module === "imp" && onlyReload ? "stdlib:imp-reload" : null,
      });
    }
  });
  return hits;
}

/** `import imp` used only for imp.reload(): the rules can switch it to importlib safely. */
export function impOnlyReload(text: string): boolean {
  if (!/^\s*import\s+imp\s*(#.*)?$/m.test(text)) return false;
  const uses = [...text.matchAll(/\bimp\.(\w+)/g)].map((match) => match[1]);
  return uses.length > 0 && uses.every((name) => name === "reload") && !/\bfrom\s+imp\s+import\b/.test(text);
}

function lineHits(file: string, text: string, rules: LineRule[]): PyApiHit[] {
  const hits: PyApiHit[] = [];
  for (const rule of rules) {
    if (rule.only && !rule.only.test(text)) continue;
    for (const hit of matchingLines(text, rule.pattern, 20)) {
      if (/^\s*#/.test(hit.text)) continue;
      hits.push({ file, line: hit.line, kind: rule.kind, api: rule.api, text: hit.text, replacement: rule.replacement, removedIn: rule.removedIn, fix: rule.fix });
    }
  }
  return hits;
}

/** Minor line of a declared requirement ("==2.0.3" → "2.0"). */
export function minorLine(version: string | null): string | null {
  if (!version) return null;
  const parts = version.split(".");
  return `${Number(parts[0])}.${Number(parts[1] ?? 0)}`;
}

export function detectPythonPackageManager(root: string): { manager: PythonScanResult["packageManager"]; lockfile: string | null } {
  for (const [file, manager] of [
    ["poetry.lock", "poetry"],
    ["Pipfile.lock", "pipenv"],
    ["uv.lock", "uv"],
    ["pdm.lock", "pdm"],
  ] as const) {
    if (existsSync(path.join(root, file))) return { manager, lockfile: file };
  }
  return { manager: "pip", lockfile: null };
}

export function isPythonProject(root: string): boolean {
  if (["pyproject.toml", "setup.py", "setup.cfg", "Pipfile", "manage.py"].some((name) => existsSync(path.join(root, name)))) return true;
  try {
    return readdirSync(root).some((name) => /^requirements[\w.-]*\.txt$/i.test(name));
  } catch {
    return false;
  }
}

export function scanPythonProject(root: string): PythonScanResult {
  if (!isPythonProject(root)) throw new Error("No pyproject.toml, requirements*.txt, setup.py, setup.cfg or Pipfile found in the project root.");
  const notes: string[] = [];
  const { all, code, sources, tests } = pythonFilesOf(root);
  const requirementFiles = requirementFilesOf(all);
  const pyproject = readText(root, "pyproject.toml");
  const hasProjectTable = /^\s*\[project\]\s*$/m.test(pyproject);
  const requirements: Requirement[] = [
    ...requirementFiles.flatMap((file) => requirementsFromLines(root, file)),
    ...(pyproject ? requirementsFromQuoted(root, "pyproject.toml") : []),
    ...(existsSync(path.join(root, "setup.py")) ? requirementsFromQuoted(root, "setup.py") : []),
    ...(existsSync(path.join(root, "setup.cfg")) ? requirementsFromSetupCfg(root, "setup.cfg") : []),
  ];
  const dependencyFiles = [...requirementFiles, ...["pyproject.toml", "setup.py", "setup.cfg", "Pipfile"].filter((name) => existsSync(path.join(root, name)))];
  const sources_ = pythonVersionSources(root);
  const primary = sources_[0] ?? null;
  if (!primary) notes.push("No Python version declared (requires-python, python_requires, .python-version or runtime.txt).");
  const find = (key: string) => requirements.find((item) => item.key === key) ?? null;
  const django = find("django");
  const flask = find("flask");
  const werkzeug = find("werkzeug");
  const fastapi = find("fastapi");
  const pydantic = find("pydantic");
  const pytest = find("pytest");
  const hasManagePy = existsSync(path.join(root, "manage.py"));
  const framework = django || hasManagePy ? "django" : flask ? "flask" : fastapi ? "fastapi" : null;
  const pytestConfigured = Boolean(pytest) || existsSync(path.join(root, "pytest.ini")) || existsSync(path.join(root, "conftest.py")) || /\[tool\.pytest/.test(pyproject) || /\[tool:pytest\]/.test(readText(root, "setup.cfg"));
  const testRunner = tests.length === 0 ? null : pytestConfigured ? "pytest" : hasManagePy ? "django" : "unittest";
  const settingsFiles = code.filter((file) => /(^|\/)settings(\/[\w]+)?\.py$|(^|\/)settings\.py$/.test(file));
  const hits: PyApiHit[] = [];
  for (const file of code) {
    const text = readText(root, file);
    if (!text) continue;
    hits.push(...moduleHits(file, text), ...lineHits(file, text, stdlibRules));
    if (flask || werkzeug || /\bflask\b/.test(text)) hits.push(...lineHits(file, text, flaskRules).filter((hit) => (hit.kind === "werkzeug-api" ? true : Boolean(flask) || /\bimport\s+flask|from\s+flask\b/.test(text))));
    if (django || hasManagePy) hits.push(...lineHits(file, text, djangoRules));
  }
  const { manager, lockfile } = detectPythonPackageManager(root);
  const installSource = requirementFiles.length ? "requirements" : hasProjectTable && /^\s*dependencies\s*=/m.test(pyproject) ? "pyproject" : existsSync(path.join(root, "setup.py")) || existsSync(path.join(root, "setup.cfg")) ? "setup" : hasProjectTable ? "pyproject" : "none";
  if (installSource === "none") notes.push("No dependency list pip can install (requirements*.txt, pyproject [project] or setup.py).");
  const nameMatch = /^\s*name\s*=\s*["']([^"']+)["']/m.exec(pyproject) ?? /name\s*=\s*["']([^"']+)["']/.exec(readText(root, "setup.py"));
  return {
    ecosystem: "python",
    repoPath: root,
    name: nameMatch?.[1] ?? null,
    pythonVersion: primary?.version ?? null,
    pythonSource: primary ? primary.file : null,
    versionSources: sources_,
    requiresPython: sources_.find((item) => item.kind === "metadata")?.value ?? null,
    installSource,
    requirementFiles,
    dependencyFiles,
    packageManager: manager,
    lockfile,
    requirements,
    framework,
    django: django?.spec || (django ? "(unpinned)" : null),
    djangoVersion: minorLine(django?.version ?? null),
    flask: flask?.spec || (flask ? "(unpinned)" : null),
    flaskVersion: minorLine(flask?.version ?? null),
    werkzeug: werkzeug?.spec || (werkzeug ? "(unpinned)" : null),
    fastapi: fastapi?.spec || (fastapi ? "(unpinned)" : null),
    pydantic: pydantic?.spec || (pydantic ? "(unpinned)" : null),
    pytest: pytest?.spec || (pytest ? "(unpinned)" : null),
    testRunner,
    hasManagePy,
    settingsFiles,
    hits,
    sourceFiles: sources.length,
    testFiles: tests.length,
    filesScanned: all.length,
    notes,
  };
}

/** Is a hit still a problem for this target? Stdlib: removedIn ≤ target Python. Frameworks: the target framework line ≥ removedIn. */
export function hitApplies(hit: PyApiHit, target: { python: string; django: string; flask: string }): boolean {
  if (hit.removedIn === null) return true;
  if (hit.kind === "removed-module" || hit.kind === "stdlib-api") return compareVersions(target.python, hit.removedIn) >= 0;
  if (hit.kind === "django-api") return compareVersions(target.django, hit.removedIn) >= 0;
  return compareVersions(target.flask, hit.removedIn) >= 0 || hit.kind === "werkzeug-api";
}

/** Test totals from pytest or unittest output. */
export function parsePytestTotals(output: string): { testsRun: number; failures: number; errors: number; skipped: number; source: string } | null {
  const plain = output.replace(/\u001b\[[0-9;]*m/g, "");
  const summary = [...plain.matchAll(/^=*\s*((?:\d+ (?:passed|failed|errors?|skipped|xfailed|xpassed|warnings?|deselected)(?:, )?)+) in [\d.]+s/gm)].at(-1);
  if (summary) {
    const count = (name: string) => Number(new RegExp(`(\\d+) ${name}`).exec(summary[1])?.[1] ?? 0);
    const failures = count("failed");
    const errors = count("errors?");
    const passed = count("passed");
    const skipped = count("skipped") + count("xfailed");
    return { testsRun: passed + failures + errors + skipped + count("xpassed"), failures, errors, skipped, source: "pytest" };
  }
  const ran = /^Ran (\d+) tests? in [\d.]+s/m.exec(plain);
  if (ran) {
    const failed = /^FAILED \(([^)]*)\)/m.exec(plain)?.[1] ?? "";
    const value = (name: string) => Number(new RegExp(`${name}=(\\d+)`).exec(failed)?.[1] ?? 0);
    const skipped = Number(/skipped=(\d+)/.exec(plain)?.[1] ?? 0);
    return { testsRun: Number(ran[1]), failures: value("failures"), errors: value("errors"), skipped, source: "unittest" };
  }
  return null;
}

/** First failing test, traceback or pip error from the output. */
export function firstPythonFailure(output: string): string {
  const lines = output.replace(/\u001b\[[0-9;]*m/g, "").split(/\r?\n/);
  const markers = [/^_{3,} .* _{3,}$/, /^E\s{2,}\S/, /^ERROR collecting|^ERROR:|^ImportError|^ModuleNotFoundError|^SyntaxError|^\w+Error: /, /^FAIL: |^ERROR: /, /^Traceback \(most recent call last\)/];
  for (const marker of markers) {
    const index = lines.findIndex((line) => marker.test(line));
    if (index >= 0) return lines.slice(index, index + 12).join("\n").trim();
  }
  return "";
}

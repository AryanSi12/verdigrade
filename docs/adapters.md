# Language adapters

The pipeline is generic (`agent/bot/lib/pipeline.ts`). Everything ecosystem-specific lives in a **language adapter**
(`agent/bot/lib/adapters/`):

| Adapter | Detects | Rewrite step | Modernize | Test / Package | Matrix |
| --- | --- | --- | --- | --- | --- |
| `java` | `pom.xml`, `build.gradle(.kts)` | OpenRewrite recipes | rules packs | `mvn clean test` / `mvn package` (or Gradle) | `profiles/matrices/java.json` |
| `node` | `package.json` | Codemods (`@expressjs/v5-migration-recipe`) | `package.json`, `tsconfig.json`, `.nvmrc` rules + `npm install` | `npm test` / `npm run build` | `profiles/matrices/node.json` |
| `python` | `pyproject.toml`, `requirements*.txt`, `setup.py`, `setup.cfg`, `Pipfile` | Codemods (`pyupgrade`, `django-upgrade`) | dependency pins, `requires-python`, `.python-version`, stdlib / Flask source rules + venv `pip install` | pytest (or `manage.py test`, `unittest`) / `python -m compileall` (+ wheel) | `profiles/matrices/python.json` |

Detection order is the order of `adapters` in `adapters/index.ts` (Java first, so a Maven project with a
`package.json` for its front end is still treated as Java). A folder with both a `package.json` and Python files is
Python when it has `pyproject.toml`, `setup.py` or `manage.py` (a Django app with front-end tooling), otherwise Node.
`--ecosystem` / `ecosystem` overrides detection.

The pipeline owns everything shared: the git safety net (branch, one commit per step, rollback, dry-run copies),
locks, the test → fix-up loop, checks bookkeeping, history and reports. An adapter owns: detection, matrix
validation, target resolution, preflight, scan, the rewrite and modernize steps, test and package commands, checks,
deterministic plan findings and the facts given to the model fix-up.

## Node adapter

Routes (`profiles/matrices/node.json`, all pinned):

| Route | Node | TypeScript | From Node |
| --- | --- | --- | --- |
| `to-node24-ts6` (default) | 24 | 6.0 | 14–24 |
| `to-node26-ts6` | 26 | 6.0 | 14–26 |
| `to-node24-ts5` | 24 | 5.9 | 14–24 |
| `to-node22-ts5` | 22 | 5.9 | 14–22 |

What it changes: Express 4 → 5 through the official codemod, declared package versions (never downgrades, only
packages already declared), `engines.node` (only raised), `.nvmrc` / `.node-version`, and TypeScript 6 tsconfig
deprecations (`moduleResolution node` → `nodenext`/`bundler`, `downlevelIteration`, `baseUrl` without `paths`,
`target` below ES2015, explicit `types`). Every edit is idempotent and keeps indentation and line endings.

What it checks: engines, TypeScript and `@types/node` versions, Express version and removed Express 4 APIs, APIs
removed or deprecated in the target Node, and tsconfig deprecations. Dockerfile base images and CI Node versions are
follow-ups.

Limits: npm only (pnpm/yarn projects get a high-severity review finding in the plan and preflight refuses the run), the codemod needs network access to the npm
registry, and the sample uses Express. Other frameworks get the Node/TypeScript upgrade and checks but no codemod yet.

## Python adapter

Routes (`profiles/matrices/python.json`, all pinned; tools `pyupgrade==3.22.0`, `django-upgrade==1.33.0`):

| Route | Python | Django | Flask | From Python |
| --- | --- | --- | --- | --- |
| `to-py314` (default) | 3.14 | 5.2 LTS | 3.1 | 3.8–3.14 |
| `to-py313` | 3.13 | 5.2 LTS | 3.1 | 3.8–3.13 |
| `to-py315` | 3.15 | 6.1 | 3.1 | 3.10–3.15 |

Every route also raises pytest to 9.2 (pytest 7.0 crashes on Python 3.14) and the Flask/Django companions (Werkzeug,
Jinja2, itsdangerous, click, MarkupSafe, blinker, asgiref, sqlparse, pytest-django) when they are declared.

How it runs:

- **Preflight** finds an interpreter for the target line: `VERDIGRADE_PYTHON` if set, then `py -3.X` (Windows
  launcher), `python3.X`, `python3`, `python` (a newer line is accepted; `uv python find` is the last resort). A
  missing Python fails preflight with install instructions instead of a stack trace. The rewrite tools are installed
  once per Python line and pin set into a cached venv under `<data dir>/python-tools/`.
- **Codemods**: `pyupgrade --py3XX-plus` on every unlocked `.py` file; `django-upgrade --target-version <line>` when
  Django is older than the route's line. Locked files are never passed to the tools.
- **Modernize**: pin bumps in `requirements*.txt`, `pyproject.toml` (`[project]` and Poetry tables), `setup.py` and
  `setup.cfg` (exact pins stay exact, ranges become `>=` / `~=`, never a downgrade, only packages already declared);
  `requires-python` / `python_requires`; `.python-version` and `runtime.txt`; source rules for removed names
  (unittest aliases, `SafeConfigParser`/`readfp`, `imp.reload`, `flask.Markup`/`escape`, Flask `JSON_*` config). All
  edits are idempotent and keep comments, extras, markers and line endings.
- **Test**: a fresh venv in the run folder (never in the project), `pip install -r requirements*.txt` (or `-e .[test]`),
  then pytest with `-p no:cacheprovider`, `manage.py test`, or `unittest discover`. `PYTHONPYCACHEPREFIX` keeps
  bytecode out of the project. **Compile**: `python -m compileall`, plus `pip wheel` when `[build-system]` exists.
- **Checks**: declared Python, version files, Django / Flask versions, removed stdlib and framework APIs left,
  deprecated APIs left (warning). Dockerfile base images, CI Python versions and Poetry/Pipenv/uv lockfiles are
  follow-ups.

On Windows the venv layout is `Scripts\python.exe` (not `bin/python`), and the `py` launcher picks the version. Install
Python from python.org with the launcher option on, or point `VERDIGRADE_PYTHON` at an interpreter.

Limits: pip only (Poetry, Pipenv, uv and PDM projects run with pip; their lockfile gets a follow-up to re-lock),
no conversion from pydantic v1, and frameworks other than Django and Flask get the Python upgrade and checks only.

## Adding a language adapter

1. **Matrix**: add `agent/profiles/matrices/<id>.json` with pinned targets and routes, and a zod schema in
   `bot/lib/adapters/<id>Matrix.ts` (reuse the envelope in `bot/lib/matrixBase.ts`). Nothing else may pin a version.
2. **Adapter**: implement `LanguageAdapter` from `bot/lib/adapters/types.ts` in `bot/lib/adapters/<id>.ts`. Use
   `adapters/node.ts` (or `adapters/python.ts`) as the template: `detect`, `resolveTargets`, `preview`, `preflight`, `scan`, `rewrite`,
   `modernize`, `runTests`, `runPackage`, `checks`, `plan`, `fixupFacts`, plus `stepLabels`, `ignorePatterns` and
   `workCopySkip`. Each step uses `ctx.begin/end` and `runCommand` with argument arrays (no shell strings), and
   commits through `ctx.commit` so locks are enforced.
3. **Register** it in `adapters/index.ts` and add the id to the `Ecosystem` type. Order matters for detection.
4. **Plan findings**: return `auto`, `review` and `manual` findings with file, line, evidence and a `kind`
   (`adapters/kinds.ts`; add the ecosystem's kinds there). Add `params` for values the explanation needs and
   `snippets` (before → after) when the change is known. Shared findings (Dockerfile, CI, SQL migrations,
   generated code) come from `adapters/findings.ts`; `ruleSnippets` turns rule-pack details into snippets.
5. **Explanations**: add `agent/profiles/explanations/<id>.json` with one entry per kind: plain title, what we
   found, why it matters, what will happen, if approved / locked / manual, manual steps, effort, confidence,
   `riskIfSkipped`, `skipEffect`, `skipWhen` and `learnMore` (official docs only, validated against the host
   allowlist in `bot/lib/explain.ts`). Templates use `{placeholders}` from the item context and its `params`.
   `test/explanations.test.ts` fails if a kind has no entry, an entry has no kind, a placeholder is left unfilled
   or a link is not official.
6. **Tool limits**: allow the ecosystem's build files in `isAllowedRelative` (`bot/lib/patch.ts`) and its build
   command in `bot/tools/run_build.ts`.
7. **Model guidance**: add `bot/skills/<id>-migration.md` and mention the ecosystem in `bot/instructions.md`.
8. **Sample and tests**: add `samples/<name>/` (intentionally behind, with real tests), unit tests like
   `agent/test/plan-mode.test.ts`, and run `npm run check && npm test && npx leapfrog validate`.
9. **UI**: the New page reads `GET /config` (`ecosystems`) and `GET /matrix?ecosystem=`. Add the ecosystem's target
   fields in `web/src/pages/NewPage.jsx`. Step labels and versions come from the run state.

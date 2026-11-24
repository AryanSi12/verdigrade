<p align="center"><img src="docs/brand/verdigrade.svg" width="88" alt="Verdigrade logo"></p>

<h1 align="center">Verdigrade</h1>

<p align="center"><b>Upgrade legacy Java, Node and Python apps in one guided run.</b><br>Built with Cursor and Grok · SpaceX AI CoE</p>

Verdigrade takes an old app (for example Java 8 / Spring Boot 2.7, Node 18, or Python 3.8 / Flask 2) and moves it to a current
stack (Java 21 / Spring Boot 4, Node 24, Python 3.14). It plans first, runs the free deterministic tools, lets the AI handle what
they can't, and proves the result with your own build and tests. Nothing in your project changes until you approve the plan.

## What it does

1. **Scan**: reads versions, dependencies and old APIs (for example `javax.*`) across every module.
2. **Plan**: sorts every finding into *will break*, *might break* and *automatic*, recommends an engine (Hybrid or Full AI) with reasons, and shows input and output token estimates for both. You approve, lock or keep items for yourself.
3. **Upgrade**: OpenRewrite recipes (Java), codemods (Node) and rules (Python) run first, for free; the AI does the rest.
4. **Test**: your own build and tests decide pass or fail, with bounded AI fix-up rounds when they fail.
5. **Refactor** (optional): a short quiz built from your code (records, dead code, `Optional`, logging, deprecated APIs and more). Each answer shows its migration risk. Picked refactors run after the upgrade and are undone automatically if the build or tests break.
6. **Preview**: start Before and After side by side in the browser and compare.

Every run is protected by git (one commit per step, one-click rollback). A **dry run** works on a temporary copy and never touches your folder. Pass or fail is decided from exit codes and checks, never by a model.

## Hybrid vs Full AI

| | **Hybrid** | **Full AI** |
| --- | --- | --- |
| How it works | Free deterministic step first (OpenRewrite / codemods / rules), then the AI fixes only what is left (plan items labelled **AI**) | The AI does the whole upgrade in one agent run, no recipes first |
| Tokens | Lower: the AI only reads the files it has to change | Higher: the AI reads every file that has to change |
| Best for | Projects the recipes cover well (standard Spring, Express, Django/Flask) | Code the recipes don't know: in-house frameworks, custom security, frontend calls that must change with the backend |
| Without an AI login | Still runs its free step | Disabled, with a message |

The plan recommends one of them and says why; you can switch, or run **Compare both** on dry-run copies for a side-by-side scorecard with actual tokens. No prices are invented: a cost appears only when the SDK reports one.

## Quick start

Needs Node.js 22.13+, git, and for Java projects a JDK at least as new as the target (for example JDK 21).

```bash
git clone https://github.com/AryanSi12/verdigrade.git
cd verdigrade/agent && npm install && npm run dev     # agent server on http://127.0.0.1:3000
cd ../web && npm install && npm run dev               # UI on http://127.0.0.1:5173
```

Open http://127.0.0.1:5173 → **Start a migration** → pick a sample (try `orderdesk` or `webapp`) → **Create migration plan** → review it → **Approve & start dry run**. AI steps need an AI login (`CURSOR_API_KEY`, or `npx agent-sdk login` in `agent/`); without it, the free step still runs.

> Verdigrade was called `java-migrator`, then Leapfrog. The old names still work: `leapfrog` and `java-migrator` are CLI aliases, `LEAPFROG_*` and `JAVA_MIGRATOR_*` environment variables are read when the `VERDIGRADE_*` one is not set, and a repository's `.leapfrog.json` (or `.java-migrator.json`) settings file is still used. The sample repos keep their `leapfrog-sample-*` names.

| Part | What it is |
| --- | --- |
| `agent/` | Agent SDK project: the HTTP API (`bot/channels/migrate.ts`), the pipeline (`bot/lib/`), model tools, the CLI (`cli/`) and unit tests (`test/`). |
| `web/` | React UI: Overview, New migration, Plan (with the refactor quiz), Run (steps, logs, diff, report, Live preview) and Compare. |
| `samples/` | Java / Spring Boot apps (several also published as `AryanSi12/leapfrog-sample-*`), a Node 18 / TypeScript app (`node-orders`) and Python / Flask apps that exercise every step. See [samples/README.md](samples/README.md). |
| `docs/` | [Plan mode](docs/plan-mode.md), [language adapters](docs/adapters.md), [org adoption](docs/adoption.md) and a [CI template](docs/ci/migrate-app.yml). |

The migration pipeline:

```
plan (read-only, human review, approve) → preflight → scan → rewrite (OpenRewrite / codemods) → modernize (rules) → test → package → checks → refactor (optional) → report
```

## Prerequisites

- **Node.js 22.13+** (the run history uses the built-in `node:sqlite`).
- **A JDK** at least as new as the target Java (for example JDK 21 for Java 21 routes). The preflight step checks this.
- **Maven or Gradle** on `PATH`, unless the project has a wrapper (`mvnw` / `gradlew`), which is preferred.
- **git** (used for the safety net, including for folders that are not git repositories: they get a private history).
- Network access to Maven Central (or your mirror) for the OpenRewrite plugin and recipe artifacts.
- Node projects: **npm** and a Node at least as new as the target (for example Node 24), plus network access to the npm registry for `npm install` and the Express codemod. JDK/Maven are not needed for Node projects.
- Python projects: a **Python 3.14** interpreter for the default route (3.13 or 3.15 for the other routes; on Windows install from python.org with the `py` launcher, or set `VERDIGRADE_PYTHON`), plus network access to PyPI for `pip install` and the pinned pyupgrade / django-upgrade. The project's own Python version does not need to be installed. JDK/Maven/npm are not needed for Python projects.

## Quick start (UI)

```bash
cd agent && npm install && npm run dev          # agent server on http://127.0.0.1:3000
cd web && npm install && npm run dev            # UI on http://127.0.0.1:5173
```

Open the UI → **New migration** → pick a sample (Java, `node-orders` or `python-inventory`) → **Create migration plan** → review the plan, lock anything that must not change → **Approve plan & start dry run**. When it passes, review the **Diff** tab and run it for real.

## Quick start (CLI)

```bash
cd agent && npm install
npx verdigrade plan ../samples/shipping                 # read-only analysis → ../samples/shipping/migration-plan.json
npx verdigrade approve ../samples/shipping              # (after reviewing/editing the file) approve it
npx verdigrade migrate ../samples/shipping --dry-run    # full pipeline on a temp copy, honouring the plan's locks
npx verdigrade plan ../samples/node-orders --approve    # Node project: plan and approve in one go
npx verdigrade migrate ../samples/node-orders --dry-run
npx verdigrade plan ../samples/python-inventory --approve   # Python project
npx verdigrade migrate ../samples/python-inventory --dry-run
npx verdigrade migrate /path/to/app --to-java 21 --to-boot 3.5.x --no-plan --out ./migration-report
npx verdigrade validate                                 # check every matrix and rules pack
```

`migrate` needs an approved plan (`<path>/migration-plan.json`, or `--plan <file|id>`) unless you pass `--no-plan` or set `VERDIGRADE_REQUIRE_PLAN=false`. The CLI plan has no AI review (deterministic findings only); the UI/API adds it when a model is configured. The CLI prints progress on stderr and the Markdown report on stdout (`--json` for JSON). Exit codes: `0` passed, `1` failed, `2` usage or configuration error. Logs and reports go to `<tmp>/leapfrog-runs/<run id>/`. For CI, see [`docs/ci/migrate-app.yml`](docs/ci/migrate-app.yml).

## From → To matrix (Java)

| Route | To Java | To Boot | Notes |
| --- | --- | --- | --- |
| `to-java21-boot4` | 21 | 4.0.x | Default. Boot parent 4.0.9. |
| `to-java21-boot3` | 21 | 3.5.x | Boot 3 line. `3`, `3.x`, `3.3.x` and `3.4.x` are accepted and mapped to 3.5.x (configurable in `bootTargetAliases`) with a visible note. |
| `to-java17-boot-none` | 17 | none | Java only. |

Node routes (`to-node24-ts6` default, `to-node26-ts6`, `to-node24-ts5`, `to-node22-ts5`) and Python routes (`to-py314` default, `to-py313`, `to-py315`) are listed in [docs/adapters.md](docs/adapters.md).

Unsupported pairs (for example From Boot 1.x) are rejected before anything runs. To add a route, edit the ecosystem's matrix, add or reuse a rules pack in `agent/profiles/modernizer-rules/`, and run `npx verdigrade validate`. See [docs/adoption.md](docs/adoption.md).

## Per-repository config

Put a `.leapfrog.json` in the project root (all fields optional):

```json
{
  "targetJava": "21",
  "targetBoot": "4.0.x",
  "extraRulePacks": ["my-team-renames"],
  "excludeModules": ["legacy-tools"],
  "skipTests": false,
  "timeoutMinutes": 45,
  "fixRounds": 1
}
```

## Configuration (environment variables of the agent server)

| Variable | Default | Meaning |
| --- | --- | --- |
| `VERDIGRADE_ROOTS` | `samples/` and your home folder | Folders the API may browse and migrate, separated by `:` (`;` on Windows). Paths are `realpath`-checked, so symlinks cannot escape. |
| `VERDIGRADE_TOKEN` | unset | When set, every API call needs `Authorization: Bearer <token>`. The UI asks for it once. Without it, the server only accepts local requests. |
| `VERDIGRADE_DATA_DIR` | `agent/data` | Where `migrations.db`, run logs and reports are stored. |
| `VERDIGRADE_TIMEOUT_MINUTES` | `30` | Timeout per build command. The whole process tree is killed on timeout or cancel. |
| `VERDIGRADE_FIX_ROUNDS` | `3` | Model fix-up rounds when tests fail (`0` = never call the model). |
| `VERDIGRADE_AI_ATTEMPTS` | `3` | Build/test-fix rounds the AI engine gets after its upgrade (1-8). Hybrid uses `VERDIGRADE_FIX_ROUNDS`. |
| `VERDIGRADE_MODEL` | from `bot/agent.ts` | Model name shown in run headers and reports (display only). |
| `VERDIGRADE_URL` (CLI) | `http://127.0.0.1:3000` | Server the CLI uses for `--engine ai\|hybrid` (it holds the AI login). |
| `VERDIGRADE_NARRATIVE` | on | Set to `0` to skip the model-written narrative (facts-only report). |
| `VERDIGRADE_REQUIRE_PLAN` | on | Set to `false` / `0` / `no` to allow runs without an approved plan. |
| `VERDIGRADE_PLAN_AI` | on | Set to `0` to skip the AI plan review (the deterministic plan is unchanged). |
| `VERDIGRADE_PYTHON` | discovered | Python interpreter for the Python adapter (full path or command, e.g. `C:\Python314\python.exe`). Default: Windows `py -3.X`, then `python` / `python3`; macOS/Linux `python3.X`, then `python3` / `python`; `uv python find` last. |
| `VERDIGRADE_KEEP_DRY_COPIES` | `3` | How many dry-run work copies are kept after a run so the live preview can start the migrated app (`0` = delete at once, like before). The oldest are removed first; a copy with an open preview is never removed; copies older than a day are swept at start-up. |
| `VERDIGRADE_JDK_DIRS` | unset | Extra folders (separated by `:` / `;`) that hold JDKs, used to find the old JDK for "Before" in the live preview. JAVA_HOME, PATH, `~/.jdks`, `~/.sdkman`, `Program Files\Java`, Adoptium, Microsoft, Zulu, Corretto and `/usr/lib/jvm` are searched anyway. |
| `VERDIGRADE_AGENT_URL` (web) | `http://127.0.0.1:3000` | Where the Vite dev server proxies the API. |

Each variable also accepts its older `JAVA_MIGRATOR_*` name (for example `JAVA_MIGRATOR_ROOTS`). When both are set, the `VERDIGRADE_*` value wins.

## API

All routes are under `/agent/v1/channels/migrate` on the agent server (the UI proxies `/v1`).

| Route | Purpose |
| --- | --- |
| `GET /config`, `GET /matrix?ecosystem=java\|node\|python`, `GET /samples` | Settings (ecosystems, `requirePlan`, `planAi`), targets and routes, sample folders |
| `POST /resolve` | Preview a route; with `repoPath`, scans it and returns the detected From versions |
| `POST /plan`, `GET /plans`, `GET\|PUT /plans/:planId`, `POST /plans/:planId/approve` | Plan mode (see [docs/plan-mode.md](docs/plan-mode.md)) |
| `POST /start` | Start a run (`dryRun` defaults to `true`) with the `planId` of an approved plan. Returns `runId` immediately; 409 without an approved plan or if the repo already has a run. |
| `POST /compare`, `GET /comparisons`, `GET /comparisons/:id`, `GET /comparisons/:id/report?format=md\|json`, `POST /comparisons/:id/cancel` | Compare engines: the same repo through 2-3 engines on dry-run copies, saved with a side-by-side scorecard |
| `GET /runs/:runId` | Full run state: steps with status, exit code, duration, summary |
| `GET /runs/:runId/log?step=test` | Full log of one step (text) |
| `GET /runs/:runId/diff` | Unified diff of everything the run changed |
| `GET /runs/:runId/report?format=md\|json` | The report |
| `POST /runs/:runId/cancel`, `POST /runs/:runId/rollback` | Cancel a running run; undo a finished one |
| `GET /runs/:runId/preview`, `POST /runs/:runId/preview/start` (`side`: `before\|after\|both`, `useAvailableRuntime`), `POST /runs/:runId/preview/stop`, `POST /runs/:runId/preview/fetch` (`path`) | Live preview: start the original and the migrated app on `127.0.0.1`, read status/URL/log, stop them, and GET one path on both (see below) |
| `GET /browse?path=` | Folder listing, limited to the allowed roots |
| `GET /history?limit=&offset=` | Saved runs (server-side; the browser never writes history) |

## Live preview (check before and after in the browser)

Open a finished run and choose **Live preview**. **Start both** runs the original app (**Before**) and the migrated app (**After**) as local servers; each side shows its status, a link to open it, and a log. Below, pick a suggested endpoint (health first, then the GET routes found in the code) and Verdigrade fetches it on both sides and shows the answers next to each other, with differing lines highlighted (JSON key order is ignored).

- **Before** is the code at the run's starting commit, restored into a scratch folder (your repository is not touched), on its **old runtime**: the JDK found for the project's Java version. If that JDK is not installed the panel says so (for example "Before needs JDK 8 - not installed", with what is installed). It then offers **Try on JDK 21 anyway**, which runs the original on the available JDK and says in the log if it fails; nothing is faked. Python works the same way. Node runs on the installed Node and says so.
- **After** is the migrated project on the target runtime (Java: the built jar on a JDK that is not older than the target).
- Java apps (`java -jar`, Maven or Gradle build when there is no jar), Node apps (`npm start` / `main`) and Flask or Django apps (a virtual environment, `flask run`) are supported.
- Servers bind to `127.0.0.1` only, on free ports, and get a clean environment: no Verdigrade settings, no tokens, no API keys. Log lines are masked. Servers stop with **Stop**, when the run is deleted, and when the agent shuts down (the whole process tree).
- Dry runs keep their work copy for the preview (see `VERDIGRADE_KEEP_DRY_COPIES`).

## Upgrade engines

You do not pick an engine when you choose a folder. **The plan recommends one**: a "Recommended: Hybrid / Full AI" card with a confidence level, 3-5 reasons taken from the plan (ecosystem and whether recipes exist, how many items the free step covers vs the AI, source file count, custom-pattern items such as reflection or JDK internals, Needs-you items, and both token estimates), the pipeline steps for that engine, the run risk, what you need to do, the expected time (only when this computer has passed runs of the same ecosystem and engine) and what happens next. "Use Full AI instead" overrides it and shows the token difference; "Compare both" is kept. `POST /plan` and `GET /plans/:id` return `recommendedEngine`, `recommendation`, `details` (per engine) and `fixerReasons`; `POST /start` and `verdigrade migrate` default to the recommendation when no engine is given (`--engine` still overrides; `verdigrade plan` prints it). The API takes `engine` on `POST /start`; the CLI takes `--engine`:

- **Hybrid** (default): OpenRewrite via Maven/Gradle for Java, codemods for Node, rules for Python run first, for free. Then the AI changes every plan item labelled **AI**, and fixes any build or test failure (bounded rounds, default 3: `VERDIGRADE_FIX_ROUNDS`). If OpenRewrite cannot be downloaded, Verdigrade's built-in rules take over and say so. Without an AI login Hybrid still runs, but only its free step.
- **Full AI**: the model does the whole upgrade (no OpenRewrite), then gets bounded build/test-fix rounds (`VERDIGRADE_AI_ATTEMPTS`, default 3). Nothing is required from you first.

Every plan item has a **fixer** label: *OpenRewrite (free)*, *AI* or *Needs you*. Only **Needs you** items (a secret, project-wide or whole-folder findings, infrastructure, anything manual-only) are locked by default and block a clean result; no engine can change them safely, so both leave them for you and list them in the report. Will break / Might break items the AI can fix are no longer locks. **Fix with AI** in the plan is now an optional "preview the fix": a kept fix is applied first and shows as Fixed.

**Token estimates** (plan screen, both engines): a transparent heuristic from the repo, shown as separate input and output ranges, labelled estimate, with the method on hover. An agent re-reads its whole context on every tool turn, so input dominates (about 20× output). Input ≈ tool turns × average context, where context = the per-call instructions and tool definitions + repo exploration + about half of the file text the AI must read (characters ÷ 4; Hybrid: only the AI items' files, Full AI: every file that has to change). Output = the tool calls per turn + the edits. It is calibrated on a real Hybrid run of `samples/library` (~30 turns, 291k in / 13k out), so Hybrid on that sample estimates ~230k–420k input. Each fix-up round (build, test or check failure) is not in the range; the method states what one adds. After a run the header, report and scorecard show the actual tokens next to the estimate. No prices are estimated; a cost is shown only when the SDK reports one.

**Leftover javax names:** after OpenRewrite, the rules deterministically rename any remaining Jakarta EE `javax.*` names (comments and strings included; JDK-owned packages like `javax.crypto` and locked files are left alone). If a check still fails after the build and tests pass, Hybrid and Full AI get a bounded fix-up round for the failing check before the run is reported.

AI calls need an AI login (`CURSOR_API_KEY` or `npx agent-sdk login`); without it Full AI is disabled with a message. Each run records engine, model, tokens in/out (from the SDK; "n/a" if it does not report them, 0 when no model call was needed), cost only if the SDK reports one, wall time, build ok, tests passed/failed, files changed and items left for manual fix. They appear in the run header, the report (PDF/MD/JSON) and the history.

**Compare both** (plan screen, or `POST /compare`) runs the same project through Hybrid and then Full AI on dry-run copies and shows a two-column scorecard with the best value per row highlighted (including estimated vs actual tokens). It is saved in history and downloadable as PDF/Markdown/JSON.

Java recipes run in one OpenRewrite pass against the project's original sources (later recipes never need a project that only compiles once the AI items are fixed). If the project still does not compile for a later pass (the javax → jakarta clean-up), Verdigrade retries it without the compile step (`rewrite:runNoFork`); if that fails too, Hybrid carries on to the AI step and the build/test fix-up rounds instead of failing the run.

The CLI finds the server at `VERDIGRADE_URL` (default `http://127.0.0.1:3000`) under `/agent/v1/channels/migrate` or at the root, and hands it the approved `migration-plan.json` (`POST /plans/import`). `POST /start` also imports a plan by id from the project's `migration-plan.json` when the server does not know it.

CLI: `verdigrade migrate <path>` runs only the free step locally. `--engine hybrid|ai` starts the run on the Verdigrade server (it holds the AI login); start it with `npm run dev` in `agent/`.

## What it does not migrate (yet)

- Spring Security configuration beyond what the upstream Boot recipes cover (for example custom `WebSecurityConfigurerAdapter` subclasses). These are flagged as follow-ups.
- Hibernate/JPA query and mapping changes, JUnit 4 → 5, springfox → springdoc: no dedicated recipes or samples yet.
- Classic (non-Boot) Spring XML applications, `web.xml` deployments: flagged as follow-ups, not converted.
- Dockerfile base images and CI JDK / Node versions: flagged as follow-ups (and as manual items in the plan).
- Node: npm only (no pnpm/yarn), Express is the only framework with a codemod, no ESM conversion.
- Python: pip only (Poetry/Pipenv/uv lockfiles get a re-lock follow-up), Django and Flask are the only frameworks with rules, no pydantic v1 → v2 conversion.
- A full before/after `dependency:tree` diff: only a known-bad dependency list and the parent/Java checks run today.

## Troubleshooting

- **Preflight failed: JDK too old.** Point `JAVA_HOME` at a JDK ≥ the target Java and restart the agent.
- **"Working tree has uncommitted changes".** Commit or stash, or use a dry run, or pass `allowDirty` / `--allow-dirty`.
- **"Path is outside the allowed roots".** Add the parent folder to `VERDIGRADE_ROOTS`.
- **OpenRewrite step fails downloading artifacts.** Configure your Maven mirror in `~/.m2/settings.xml`; the pipeline never forces `-U`.
- **Tests fail after the recipes.** Open the Test step's log in the UI. If fix-up rounds are enabled, the model's edits are separate commits you can inspect in the Diff tab or roll back.

## Data handling

- Everything runs on this machine. Run state, logs and reports are stored under `VERDIGRADE_DATA_DIR`.
- The model only sees data during the plan review (read-only tools, write tools refuse; `VERDIGRADE_PLAN_AI=0` turns it off), a fix-up round (the first failure, a log tail, and files it explicitly reads through the `read_project_file` tool, which refuses files that look like secrets) and when writing the narrative (the facts report). Set `VERDIGRADE_PLAN_AI=0`, `VERDIGRADE_FIX_ROUNDS=0` and `VERDIGRADE_NARRATIVE=0` to keep all data local.
- The model's edit tool is limited to build files and `src/` (Node: also `package.json`, `tsconfig*.json`, `.nvmrc`, test folders; Python: `.py` files and dependency/version files, never a venv), refuses paths locked by the plan, rejects `..`, absolute paths and symlink escapes, and refuses content that looks like private keys or cloud credentials.
- There is no shared memory between sessions or users.

## Development

```bash
cd agent && npm run check && npm test                  # typecheck + unit tests
cd agent && VERDIGRADE_GOLDEN=1 npm test            # also migrate every sample end to end (needs JDK + Maven)
cd agent && npx agent-sdk validate --dir .             # agent project structure
cd web && npm run build
```

## Continuous integration

A ready GitHub Actions workflow (type-check, unit tests, web build) is in [`docs/ci/ci.yml`](docs/ci/ci.yml). To turn it on, move it to `.github/workflows/ci.yml`.

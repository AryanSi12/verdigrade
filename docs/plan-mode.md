# Plan mode (human in the loop)

Before anything changes, Verdigrade reads the project and writes a **migration plan**. A person reviews it,
protects what must not be touched, and approves it. Only an approved plan can start a run (dry run or real).

```
New migration → Plan (read-only analysis + review) → Approve → Dry run → Real run
```

## What the plan contains

Every finding has a file, a line when it applies, the evidence, a severity, and a source.

| Group | Meaning | Default decision |
| --- | --- | --- |
| **Will change automatically** | Recipes, codemods, rules-pack edits and dependency installs the pipeline will apply. | `approve` (you can `lock` a file to keep it unchanged) |
| **Risky: review** | Things the tools change or depend on that often break at runtime: Express 5 route syntax, deprecated Node APIs, `ts-node`, custom security config, removed Python modules (`cgi`, `distutils`), Flask/Django APIs no rule rewrites, Django `USE_TZ`… | `approve` |
| **Needs manual intervention** | Things the tool will not convert: native addons, Dockerfile/CI runtime versions, SQL migrations, `web.xml`, generated code… | `manual` (protected: never edited) |

Sources:

- **deterministic**: produced by the adapter's scanner and matrix. These are authoritative, and the plan is complete
  without a model.
- **ai**: optional extra risks from a read-only model review, shown as *AI-suggested*. An AI finding is only kept
  if its file exists inside the project, its line is in range and its quoted evidence appears within ±2 lines of that
  line. Everything else is dropped and counted (`ai.dropped`, `ai.droppedReasons`). AI findings never go into the
  automatic group.

## Plain-language explanations

Every item carries an `explain` block, rendered from the adapter's **explanation catalogue**
(`agent/profiles/explanations/{common,java,node,python}.json`, keyed by the finding's `kind`):

| Field | What the reviewer sees |
| --- | --- |
| `plainTitle`, `inPlainWords` | The headline and one sentence without jargon |
| `whatWeFound` | What the scan saw, with the real counts, files and versions filled in |
| `whyItMatters` | Why this breaks or matters on the target versions |
| `whatWillHappen` + `snippets` | What the pipeline will do, with before → after lines (exact for rules, imports and Express APIs; "expected" for recipes) |
| `ifApproved` | The result when you approve |
| `ifLocked`, `ifManual` | **What happens if you don't approve**: coloured by `riskIfSkipped` (`none` · `low` · `medium` · `high` · `blocker`) and its effect (fails install / build / tests / checks, changes behaviour at runtime, follow-up after merge) |
| `manualSteps`, `effort`, `confidence` | The checklist if you do it by hand, a rough time, and how sure the tool is |
| `learnMore` | Links to official docs only (Spring, OpenRewrite, Jakarta EE, Oracle/OpenJDK, Node.js, Express, TypeScript, npm, docs.python.org, PEPs, Django, Flask/Werkzeug, pytest, pip…). The schema refuses any other host. |

The catalogue is deterministic and authoritative. AI findings get a generic explanation marked
*AI-suggested* with low confidence; AI comments are shown separately as "AI-suggested note (not verified)".
Plans saved before explanations existed still load: `kind` is inferred (`legacyKind`) and the explanation
is filled in when the plan is read.

## What if I don't approve? (impact preview)

`predictImpact` (`bot/lib/impact.ts`) combines the decisions and protected paths with each item's
`riskIfSkipped` / `skipEffect` and predicts the dry-run outcome, for example **"Dry run likely FAILS at the Test
step"**, "may fail", "likely passes, with follow-ups" or "likely passes". It understands shared files: locking
`pom.xml` (or protecting `src/main/java/**`) also stops the recipes that edit it, and the preview names the lock
that blocks them. Auto items whose `skipWhen` is `primary-file` (such as the Spring Boot recipe) are only
partly applied when a secondary file is locked.

It is labelled as a **prediction from the plan's rules, not a run result**. Approving with blocker-level items
locked or manual is allowed, but the UI first shows a confirm dialog listing the consequences, the approve
response includes `warnings`, and the CLI prints them.

Checked against real dry runs (AI off, no fix-up rounds):

| Choice | Prediction | Actual dry run |
| --- | --- | --- |
| shipping: everything approved | likely passes | passed |
| shipping: lock "Rename javax imports to jakarta" | likely FAILS at Test | failed at Test (`package javax.validation.constraints does not exist`) |
| node-orders: everything approved | likely passes, with follow-ups (Dockerfile, CI) | passed |
| node-orders: lock the tsconfig edits | likely FAILS at Test | failed at Test |
| python-inventory: everything approved | likely passes, with follow-ups (Dockerfile, CI) | passed (9 tests on Python 3.14) |
| python-inventory: lock "Import Markup and escape from markupsafe" (`inventory/app.py`) | likely FAILS at Test | failed at Test (`ImportError` while collecting `tests/test_inventory.py`) |

The Java test step always runs `clean` first. Without it, classes compiled by OpenRewrite against the *old* build
were reused for unchanged (for example locked) files, and the Test step could pass on stale classes.

## Decisions and locks

Per item: `approve`, `lock` (keep these files exactly as they are) or `manual` (you will handle it; also kept
unchanged). You can also add **protected paths**: any file, directory (`config/`) or glob (`src/generated/**`) with an
optional note. Project-wide items (for example "install dependencies") cannot be locked.

Locks are enforced in code, not by the prompt:

1. Rule edits on locked files are skipped and recorded.
2. OpenRewrite gets the locked paths as exclusions.
3. After **every** step, before its commit, changes to locked paths are reverted (`git.revertLocked`) and recorded
   as lock violations.
4. The model's write tools refuse locked paths.
5. A `locked-paths` check fails the run if a locked file still differs.

The report's **Manual follow-up** section lists the plan's manual items, reviewer notes and every change the locks
blocked. Each item has its plain title, its risk if left, "What this means" (the if-locked/manual consequence) and
a "To do by hand" checklist with the effort.

## Using it

**UI**: New migration → choose project and targets → **Create migration plan** → review the three groups, set
decisions and notes, add protected paths → **Approve plan & start dry run**. Editing an approved plan sets it back to
draft.

On the Plan page each item shows its plain headline and an "In plain words" line. **Explain** opens: What we found →
Why it matters → What we'll do (before/after) → If you lock it or mark it manual → What you'd do by hand → effort,
confidence and Learn more. Switching an item to Lock or Manual shows the consequence right under it. The **Impact
preview** (sticky sidebar on desktop, collapsible on mobile) and the approval bar update as you change decisions.
A toggle switches between **Explain like I'm new** (plain headlines) and **Technical** (original titles, kinds,
evidence); it is remembered in `localStorage` (`leapfrog-plan-mode`).

The CLI `plan` output shows the plain title, the if-locked/manual consequence and an `Impact preview` line.

**CLI**:

```bash
npx leapfrog plan ../samples/node-orders                       # writes ../samples/node-orders/migration-plan.json
npx leapfrog plan ../samples/shipping --lock src/main/resources/application.properties --note "Ops owns this file"
npx leapfrog approve ../samples/shipping --decide F-1234abcd=manual
npx leapfrog migrate ../samples/shipping --dry-run             # uses the approved migration-plan.json
npx leapfrog plan ../samples/shipping --preview                # exact rewrite file lists from a temp-copy preview
```

Edit `migration-plan.json` by hand if you like: it is validated with zod (`bot/lib/plan.ts`) when it is loaded.

**API** (under `/agent/v1/channels/migrate`):

| Route | Purpose |
| --- | --- |
| `POST /plan` | `{ repoPath, ecosystem?, targets…, preview?, ai? }` → a draft plan. The AI review, when enabled, runs in the background (`plan.ai.status`: pending → running → done / failed / skipped). |
| `GET /plans`, `GET /plans/:planId` | List or read plans |
| `PUT /plans/:planId` | Decisions, notes, protected paths, reviewer note |
| `POST /plans/:planId/impact` | `{ decisions: [{ id, decision }], lockedPaths? }` → `{ impact, blockers }` for draft choices. Nothing is saved. Plan responses also include `impact` for the saved decisions. |
| `POST /plans/:planId/approve` | Approve (`{ exportFile: true }` also writes `migration-plan.json` into the project). Refused while the AI review is pending or running. The response has `warnings` when blocker-level items are locked or manual (approval still goes through). |
| `POST /start` | Needs `planId` of an approved plan for the same project; otherwise `409 plan_required`. |

## Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `VERDIGRADE_REQUIRE_PLAN` | on | `false` / `0` / `no` lets runs start without a plan (CLI: `--no-plan`). |
| `VERDIGRADE_PLAN_AI` | on | `0` disables the AI plan review. The deterministic plan is unchanged. |

The older `JAVA_MIGRATOR_REQUIRE_PLAN` / `JAVA_MIGRATOR_PLAN_AI` names still work; the `VERDIGRADE_*` value wins when both are set.
Plans saved before the rename (`"tool": "java-migrator"`) still load.

The plan review runs in its own model session in dry-run mode, and every write tool refuses to run during it.
If the model is unavailable (no credentials, network), the review ends as `failed` with the error, and the plan can
still be approved.

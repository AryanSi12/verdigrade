# Org adoption

## What the platform team owns

1. **The migration matrices** (`agent/profiles/matrices/java.json`, `agent/profiles/matrices/node.json`): approved From → To routes, the pinned OpenRewrite plugin, recipe artifacts and recipe order, Boot target aliases and default targets (Java); Node/TypeScript targets, pinned package versions and codemods (Node). They are the single source of truth: nothing else pins a version.
2. **Rules packs** (`agent/profiles/modernizer-rules/*.json`): deterministic follow-up edits the recipes miss. Every rule is anchored and idempotent:
   - `dependencyRenames`: exact `groupId` + `artifactId` renames in `pom.xml` and Gradle files.
   - `propertyRenames` / `removeProperties`: whole keys in every `application*.properties` and `application*.yml` (nested YAML included).
   - `jakartaRecipe`: the recipe to run if Jakarta EE `javax` usage is left after the main recipes.
   - Packs marked `"sampleOnly": true` (like `acme-samples`) are only used by repositories that opt in through `.leapfrog.json`.
3. **Sample apps** under `samples/` for demos, training and the golden end-to-end tests.

App teams do **not** fork the pipeline. They pick a folder and a supported target, or put a `.leapfrog.json` in their repository.

## How a squad uses it

1. Create and review a **plan** (UI, or `npx leapfrog plan <path>` then `approve`). Lock what must not change and mark what the team will do by hand. See [plan-mode.md](plan-mode.md).
1. Run a **dry run** (UI, or `npx leapfrog migrate <path> --dry-run`). It works on a temporary copy and produces the diff and the report.
2. Review the diff and the report. Follow-ups list what the tool did not change (Security config, `web.xml`, Dockerfile JDK, CI Java version…).
3. Run for real. The tool refuses a dirty tree, creates a `migrate/<route>` branch with one commit per step, and can roll back.
4. Push the branch and open a PR with `report.md` as the description. In CI, use [`docs/ci/migrate-app.yml`](ci/migrate-app.yml).

If their hop is missing, they ask the platform team to **add a matrix route** (with real, published OpenRewrite recipes), not to write a one-off script.

## How to extend

| Change | Edit | Then |
| --- | --- | --- |
| New target or route | `agent/profiles/matrices/<ecosystem>.json` | `npx leapfrog validate` and add a unit test in `agent/test/matrix.test.ts` |
| New follow-up edits | `agent/profiles/modernizer-rules/<pack>.json` | Add a case to `agent/test/rules.test.ts`; the second application must change nothing |
| Team-specific renames | A new pack plus `extraRulePacks` in that repo's `.leapfrog.json` | |
| New demo app | A folder under `samples/` with a `pom.xml`, `build.gradle` or `package.json` | `VERDIGRADE_GOLDEN=1 npm test` (Java samples) |
| New language | A language adapter | Follow [adapters.md](adapters.md#adding-a-language-adapter) |

Recipe artifacts and recipes the model may run are restricted to pairs that appear in the matrix or a rules pack, so adding a route is also how a recipe becomes allowed.

## Running it for many people

The agent server executes the build of whatever project it is pointed at (Maven and Gradle plugins are code). On a shared host:

- set `VERDIGRADE_TOKEN` so every request needs a bearer token,
- set `VERDIGRADE_ROOTS` to the workspace folders it may touch,
- give it its own `VERDIGRADE_DATA_DIR`,
- (older `JAVA_MIGRATOR_*` names are still read when the `VERDIGRADE_*` one is unset),
- prefer the CLI in CI (one container per repository) over one long-lived shared server.

## Honest limits

- Only hops with published OpenRewrite recipes auto-run. Unknown pairs fail clearly before any change.
- No fleet mode yet (inventory scan of many repositories and batched PRs). The CLI plus the CI template is the building block for it.
- No full dependency-tree diff yet; see the README's "What it does not migrate".

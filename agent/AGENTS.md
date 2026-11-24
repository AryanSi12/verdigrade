# agent

Agent SDK project (`@grok/agent-sdk`) plus the Verdigrade pipeline and CLI. This file is for coding
agents editing the project. The served agent's prompt is `bot/instructions.md`.

## Loop

```bash
npm run check                      # tsc --noEmit
npm test                           # vitest unit tests (LEAPFROG_GOLDEN=1 adds end-to-end sample runs)
npm run validate                   # matrix + rules packs
npx agent-sdk validate --dir .
npx agent-sdk eval --dir .
npm run dev                        # agent server on :3000
```

Run everything under Node 22.13+, never Bun.

## Layout

- `profiles/matrices/{java,node,python}.json`: routes, pinned plugin, recipe artifacts, packages and codemods per ecosystem. The only place versions live.
- `profiles/modernizer-rules/*.json`: rules packs (data). Validated by `bot/lib/matrix.ts` (zod).
- `bot/lib/pipeline.ts`: the generic deterministic pipeline (git safety net, locks, test/fix loop, report). Pass/fail comes from exit codes and checks here.
- `bot/lib/adapters/`: one `LanguageAdapter` per ecosystem (`java.ts`, `node.ts`, `python.ts`; interface in `types.ts`, registry in `index.ts`). See `../docs/adapters.md`.
- `bot/lib/plan.ts`: plan mode (zod schema, decisions, locks, AI finding verification). `bot/lib/locks.ts`, `bot/lib/toolGuards.ts`: lock and plan-review enforcement.
- `bot/lib/{scanner,rules,build,git,process,report,history,runs}.ts`: scanning, idempotent rules, Maven/Gradle
  invocation, git safety net, process runner, reports, SQLite history, active runs.
- `bot/channels/migrate.ts`: HTTP API (auth, allowed roots, input validation). Starts runs; the model is only
  called for fix-up rounds and the narrative.
- `bot/tools/<name>.ts`: tools for the model (one per file, filename = tool name). Writes are limited to the active
  run's repository, matrix recipe pairs and build files / `src/`.
- `cli/main.ts` + `bin/leapfrog.mjs`: the headless CLI.
- `test/`: vitest unit tests. `evals/`: SDK evals (each case works on a temp copy of a sample).

## Rules

- Keep decisions in code, not prompts: anything that decides what runs or whether a run passed belongs in
  `bot/lib/`, with a unit test.
- Every rules-pack edit must be idempotent: applying it twice changes nothing the second time (there is a test).
- Never add a version pin outside the matrices.
- Ecosystem-specific logic goes in its adapter, not in `pipeline.ts`. Java behaviour must not change when Node code changes (golden test + `test/plan-mode.test.ts`).
- Locks are enforced in code (revert before every commit, tool refusals); never rely on the prompt for them.
- Spawn processes with argument arrays (`runCommand`), never a shell string.
- Keep paths cross-platform (`path.join`, `mvnw.cmd` / `gradlew.bat`, `npm.cmd` / `npx.cmd` on Windows).

## Pointers

- Package loop: `node_modules/@grok/agent-sdk/AGENTS.md`
- Docs: `npx @grok/agent-sdk docs`

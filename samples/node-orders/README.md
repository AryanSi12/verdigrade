# node-orders

Small order service on **Node 18, TypeScript 4.9 and Express 4**, intentionally behind, for the Node adapter.

| Exercises | Where |
| --- | --- |
| Express 4 → 5 codemod (`res.send(status)`, `req.param`) | `src/app.ts` |
| Deprecated Node API (`url.parse`), flagged for review | `src/links.ts` |
| TypeScript 6 tsconfig deprecations (`moduleResolution node`, `downlevelIteration`, `baseUrl`) | `tsconfig.json` |
| `engines`, `.nvmrc`, `@types/node`, `typescript` bumps | `package.json` |
| Manual follow-ups (Dockerfile `node:18-alpine`, CI Node 18, SQL migration) | `Dockerfile`, `.github/`, `db/` |

`npm test` builds and runs 7 tests with `node --test`.

```bash
cd ../../agent
npx leapfrog plan ../samples/node-orders --approve
npx leapfrog migrate ../samples/node-orders --dry-run
```

Delete the generated `migration-plan.json` afterwards if you do not want to keep it.

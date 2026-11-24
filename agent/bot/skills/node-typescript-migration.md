# Node.js / TypeScript migration notes

Routes, codemod versions and package pins live in `profiles/matrices/node.json` (validated with zod at startup; `npx verdigrade validate`). Do not copy pins into prompts or code.

The Node adapter runs: the official Express v5 codemod (`@expressjs/v5-migration-recipe`) when Express < 5, then package.json bumps (typescript, @types/node, express, @types/express), `engines.node`, `.nvmrc`, tsconfig fixes for TypeScript 6, `npm install`, `npm test`, `npm run build`.

## Express 5 (what the codemod does not fix)

- Route paths use path-to-regexp 8: `*` must be named (`/*splat`), optional parts use braces (`/:file{.:ext}`), regex characters `( ) ? +` in strings are not allowed. Express throws at startup for old syntax.
- `req.query` is a getter: assigning to it fails. Store parsed values in `res.locals`.
- `req.body` is `undefined` (not `{}`) when no body parser ran.
- `app.listen` errors are passed to the callback instead of thrown.
- Rejected promises from async handlers go to the error handler automatically: remove manual `.catch(next)` wrappers only if behaviour stays the same.
- `express.static` `dotfiles` now defaults to "ignore".
- Types: `@types/express` 5 makes `req.params` values `string` per route; handlers that return a value from `res.json(...)` may need `void`.

## TypeScript 6

- Deprecated (error unless `"ignoreDeprecations": "6.0"`): `moduleResolution: node`/`node10`/`classic`, `baseUrl` without `paths` use, `downlevelIteration`, `target: es3/es5`, `module: amd/umd/system`, `outFile`, `esModuleInterop: false`.
- `types` defaults to `[]`: global types such as `@types/node`, `@types/jest`, `@types/mocha` must be listed in `compilerOptions.types`.
- `strict` defaults to true; `rootDir` defaults to the tsconfig folder.
- With `module: nodenext` and no `"type": "module"`, output is CommonJS; relative imports in ESM files need explicit `.js` extensions.

## Node

- Node 22: `crypto.createCipher`/`createDecipher` removed. Node 23: `util.isBoolean`/`isString`/… removed (use `typeof`). `util.isArray` is deprecated (use `Array.isArray`).
- `url.parse()` is deprecated (runtime warning); prefer `new URL(href, base)`.
- `node --test <dir>` no longer accepts a directory on Node 22+: pass files or globs.
- Native addons (bcrypt, sqlite3, sharp, node-sass…) need a release with prebuilds for the new ABI; node-sass has none (move to `sass`).
- `fetch`, `WebSocket` and `navigator` are globals; libraries that polyfill them may conflict.

## Fix-up rules

- Prefer source edits over pinning old versions. Never downgrade a package the route bumped.
- Peer-dependency conflict (ERESOLVE): bump the dependent package in package.json (e.g. ts-jest) rather than adding `--legacy-peer-deps`.
- Do not add `ignoreDeprecations` to silence TypeScript 6 unless the message says the option cannot be removed.

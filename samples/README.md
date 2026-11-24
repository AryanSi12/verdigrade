# Migration sample projects

Five small Spring Boot 2.x Maven apps, three larger ones (`library`, `tickets`, `warehouse-large`), a multi-module one (`payments`), a judgment-heavy one (`legacy-java`), a tangled one built so Full AI can win outright (`tangled`), a Live-preview one with a real HTML/CSS/JS page (`webapp`), a refactor showcase with a page (`orderdesk`), plus Node and Python samples (below). Each is intentionally behind so every pipeline step has work:

| Folder | Java | Boot | Exercises |
| --- | --- | --- | --- |
| `shipping` | 1.8 | 2.7.18 | OpenRewrite, web → webmvc starter, property renames, javax |
| `loyalty` | 1.8 | 2.6.15 | Same checklist, loyalty domain |
| `warehouse` | 11 | 2.5.15 | Java 11 → 21 hop, Boot 2.5 → 4.0 |
| `reservations` | 1.8 | 2.7.18 | javax.validation + javax.servlet leftovers |
| `fleet` | 1.8 | 2.6.15 | Full property set |
| `library` | 1.8 | 2.7.18 | Larger app (75 classes, 70 tests) with 4 small Will break items (security adapter, 2 MVC adapters, @MockBean). Also at github.com/AryanSi12/leapfrog-sample-library |
| `tickets` | 1.8 | 2.7.18 | Medium app (51 classes, 51 tests) with exactly 1 tiny Will break item (`HandlerInterceptorAdapter`). Dry run passes after the fix. Also at github.com/AryanSi12/leapfrog-sample-tickets |
| `warehouse-large` | 1.8 | 2.7.18 | **Hybrid-best.** Large app (101 classes, 131 tests, 42 javax files) with exactly 1 Will break item (`WebMvcConfigurerAdapter`). Also at github.com/AryanSi12/leapfrog-sample-warehouse (the small Java 11 `warehouse` folder above is a different sample) |
| `payments` | 1.8 | 2.7.18 | **Hybrid-best.** 3-module Maven build (common, core, api; 93 tests), 0 Will break items, so Hybrid makes no AI call. Also at github.com/AryanSi12/leapfrog-sample-payments |
| `legacy-java` | 1.8 | 2.7.18 | **Full AI-best.** Small app on an in-house framework (27 tests): custom security setup, in-house MVC base class, `CommonsMultipartResolver`, `sun.misc.Unsafe` (5 AI findings in 4 files). Also at github.com/AryanSi12/leapfrog-sample-legacy-java |
| `tangled` | 1.8 | 2.7.18 | **Full AI demo.** Claims portal with an in-house security and web layer (36 classes, 55 tests): 6 AI findings in 4 files that depend on each other (security configurer, interceptor base class, MVC configurer base class, `@MockBean` test base) plus a session-persistence change no scanner reports. Also at github.com/AryanSi12/leapfrog-sample-tangled |
| `webapp` | 1.8 | 2.7.18 | **Full AI demo, with a page (no login).** Team Task Board: Spring Boot API plus a plain HTML/CSS/JS frontend (34 tests). Security config and interceptor are AI items; the page's JavaScript also breaks under Spring 6 / Boot 4 (trailing-slash calls, CSRF cookie header, Jackson 3 property names like `eta`/`url` becoming `ETA`/`URL`) while the Java tests still pass. Verdigrade's page check starts the packaged app and finds these; only Full AI fixes them. Shows the runtime (Java, Boot, Security, javax or jakarta) read live, so Live preview Before and After look different. Also at github.com/AryanSi12/leapfrog-sample-webapp |
| `orderdesk` | 1.8 | 2.7.18 | **Refactor showcase, with a page (no login).** Order Desk: orders dashboard (KPIs, filterable table, order drawer, new-order form, CSV export) on a plain HTML/CSS/JS page (35 tests). Upgrades with the free step alone (page check ok); the code is written in an older style on purpose so the Refactor quiz asks 6 questions (records, deprecated APIs, logging, Optional, constructor injection, dead code) and the Refactor step has real work. Also at github.com/AryanSi12/leapfrog-sample-orderdesk |

Each sample has a `.leapfrog.json` that opts into the sample-only `acme-samples` rules pack (it removes the
fictional `acme.legacy.boot2-mode` property). Org rules packs never contain sample-specific rules.

## Pipeline coverage

1. **Preflight**: JDK, Maven, git safety net
2. **Scan**: Java level, Boot parent, Jakarta EE javax files (JDK-owned `javax.*` is ignored)
3. **OpenRewrite**: `UpgradeToJava21`, `UpgradeSpringBoot_4_0` (or `_3_5`), `JavaxMigrationToJakarta` when javax remains
4. **Modernize**: `boot4` + `acme-samples` rules packs
5. **Test / Package**: `mvn test`, `mvn package -DskipTests`
6. **Checks / Report**

## Run a migration

- UI: **New migration** → pick a sample card → keep **Dry run** on → Start.
- CLI: `cd agent && npx leapfrog plan ../samples/shipping --approve && npx leapfrog migrate ../samples/shipping --dry-run`

Samples always run with a private git history (never the history of the repository they live in). A dry run never
modifies them; a real run does. To reset a sample after a real run, use **Roll back** on the run page, or regenerate it
with `node samples/_scaffold.mjs`.

## Node sample

`node-orders`: Node 18, TypeScript 4.9, Express 4. Exercises the Express 5 codemod, tsconfig deprecations, a deprecated
Node API and manual follow-ups (Dockerfile, CI, SQL). See [node-orders/README.md](node-orders/README.md).

## Python sample

`python-inventory`: Python 3.8, Flask 2.0, pytest 7.0. Exercises pyupgrade, Flask 3 import and JSON-config removals,
Python 3.12 standard-library removals (`imp`, `SafeConfigParser`, unittest aliases), deprecated APIs flagged for review and
manual follow-ups (Dockerfile, CI). See [python-inventory/README.md](python-inventory/README.md).

## Python: Flask without recipes

`flask-legacy` (**Full AI-best**): Python 3.8, Flask 2.2, pytest 7.2 (21 tests). The breaking items are removed APIs the codemods
do not touch: `before_first_request`, `app.json_encoder`, `_request_ctx_stack`, `werkzeug.urls.url_quote/url_parse`,
`ssl.wrap_socket` (14 findings in 5 files). Also at github.com/AryanSi12/leapfrog-sample-flask-legacy.

## Which engine for which sample

| Sample | Better engine | Why |
| --- | --- | --- |
| `warehouse-large`, `payments` | Hybrid | Almost everything is mechanical; OpenRewrite does it for free and the AI sees 0 or 1 items |
| `legacy-java`, `flask-legacy` | Full AI | The work is redesigning custom or removed APIs that no recipe covers |
| `tangled` | Full AI | The AI items depend on each other (shared base classes and a shared security contract), so they must change together. Hybrid is cheaper in tokens but is expected to need fix-up rounds or fail; see its README |
| `webapp` | Full AI | The page's JavaScript must change with the backend (trailing-slash calls, CSRF cookie header, Jackson 3 property names); Hybrid's AI only sees the backend item files and the page check only reports for it. Plan says "frontend coupled". See its README for what is verified and what is predicted |
| `library`, `tickets` | Hybrid | Few small AI items on top of recipe work |

Use **Compare both** on the plan screen to measure it; the plan screen's token estimates are ranges, not measurements.

Runs need an approved plan: `npx leapfrog plan ../samples/<name> --approve` first, or pass `--no-plan`.

Supported routes: `../agent/profiles/matrices/java.json`, `../agent/profiles/matrices/node.json`, `../agent/profiles/matrices/python.json`, `../docs/adoption.md` and `../docs/adapters.md`.

# leapfrog-sample-webapp

**Team Task Board**: a Java 8 / Spring Boot 2.7 app that serves its own plain HTML, CSS and JavaScript page (no build step).
It is the sample for Verdigrade's **Live preview**: start Before and After side by side and the page itself shows what each
one is running on and whether it still works. Part of the [Verdigrade](https://github.com/AryanSi12) samples.

| | Before (this repo) | After (Verdigrade route) |
| --- | --- | --- |
| Java | 1.8 | 21 |
| Spring Boot | 2.7.18 | 4.0.x |
| Spring Security | 5.7 | 7.0 |
| Namespace | `javax.*` | `jakarta.*` |
| Build | Maven (wrapper included) | Maven |

The page header and footer show the runtime, read from `GET /api/runtime` at run time (`System.getProperty("java.version")`,
`SpringBootVersion`, `SpringSecurityCoreVersion`, and a class-presence check for `jakarta.servlet`). Nothing is hardcoded:
Before shows `Java 1.8 · Boot 2.7 · javax`, After shows `Java 21 · Boot 4.0 · jakarta`.

## No login

The page loads straight into the board. `SecurityConfig` still exists and still has to be migrated: it lets the page, its
assets and every `GET /api/**` through, and protects changes (add, complete, delete) with **CSRF**: the server sets the
`XSRF-TOKEN` cookie and the page sends it back in the `X-XSRF-TOKEN` header. There is no user, no password and nothing to type in.
(Spring Boot logs "Using generated security password" at start-up; it is not used by anything.)

## What the page does

- Add a task (title, notes, priority, due date). The server validates it (`javax.validation` today, `jakarta.validation` after the migration)
  and the page shows each field's message under the field.
- Complete and delete tasks, filter by status and priority, see a stats panel and **"Next due in N days"**.
- Each task shows how long until it is due (**"Due in 3 days"**, **"2 days late"**) and its permanent link. The server sends these as
  `eta` (a number of days) and `url`; the page sorts by `eta` and does arithmetic on it.
- The footer shows the `X-Request-Count` and `X-Uptime-Seconds` headers that an interceptor adds to every `/api` answer.
- Every failed call shows a toast with the **status code**, the method and path, and the server's reason, for example
  `Adding the task failed: 403 Forbidden · POST /api/tasks/`. Every break below is visible on the page: empty lists, `Due in NaN days`,
  `undefined` under the titles.

## What has to be migrated

| Where | Problem | Who can fix it |
| --- | --- | --- |
| `config/SecurityConfig.java` | `WebSecurityConfigurerAdapter`, `.and()`, `antMatchers`, `authorizeRequests` (removed in Spring Security 6) | OpenRewrite converts it to a `SecurityFilterChain`; the plan still lists it as an AI item (judgment code) |
| `web/RequestStatsInterceptor.java` | `HandlerInterceptorAdapter` (removed in Spring Framework 6) | OpenRewrite / the AI item |
| `dto/TaskRequest.java`, `web/*` | `javax.validation` / `javax.servlet` to `jakarta.*` | OpenRewrite |
| `static/js/api.js` | **Calls `/api/tasks/`, `/api/tasks/stats/`, `/api/tasks/{id}/complete/` with a trailing slash**; Spring Framework 6 no longer matches `/x/` to `/x`, so these answer 404 | Either side: remove the slashes in the JavaScript, or add a rewrite on the server |
| `SecurityConfig.java` + `static/js/api.js` | **The page reads the `XSRF-TOKEN` cookie and sends it as `X-XSRF-TOKEN`.** Spring Security 6 loads the token lazily (the cookie is not written on a GET) and its default handler no longer accepts the raw cookie value, so add, complete and delete answer 403 | A config change (a cookie-writing filter plus the single-page-app token handler) |
| `dto/TaskResponse.java` + `static/js/app.js` | **Jackson 3 (Spring Boot 4) names acronym getters differently**: `getETA()` and `getURL()` were `"eta"` and `"url"` with Jackson 2 and are `"ETA"` and `"URL"` now. The page reads `task.eta` and `task.url`: `Due in NaN days`, a list that does not sort, `undefined` under each title | Either side: `@JsonProperty("eta")` on the getters (or `USE_STD_BEAN_NAMING` off), or read `task.ETA` in the JavaScript |

The Java tests use the canonical paths (`/api/tasks`) and `csrf()` from `spring-security-test` (which skips the cookie handshake), and
they check `getETA()` and `getURL()` by calling the getters, not through JSON. So **all 34 tests pass while the page is broken**:
a Java-only fix looks finished, and only something that runs the page notices.

## Verdigrade's page check

After the build, tests and package, Verdigrade starts the packaged jar on loopback, loads `/`, finds the API calls in the page's JavaScript
(paths and methods), makes them the way the page does (the CSRF cookie goes back as a header, a throwaway task is created and deleted)
and checks: no 4xx/5xx, the JSON properties the JavaScript reads exist (a name that only differs in case is reported), and a number
the JavaScript does arithmetic on is not a string. **Both engines run it** and show the result ("Page check: 6 problems") on the run
page and in the report. **Only Full AI acts on it**: a problem starts an AI fix-up round with the failures and the whole repository,
the page included, then Verdigrade tests, packages and checks again (at most 2 rounds). Hybrid's AI is limited to the backend plan items,
so Hybrid reports the problems and does not loop on them.

## Which engine, and what is verified or only predicted

The plan recommends **Full AI** (confidence high): "the AI must also update the frontend; Hybrid only edits backend item files."
Hybrid is still the cheaper run by the plan's token estimate (about 170k to 320k against 400k to 750k; estimates, not measurements).

**Verified** (JDK 21 and Temurin 8, real Maven builds):

- The original: 34 tests pass; the jar starts on JDK 8; the page works.
- Boot 2.7 and Boot 4.0.10 side by side on one controller: acronym getters are `eta` / `url` on 2.7 and `ETA` / `URL` on 4.0.10
  (Jackson 3 also sorts properties alphabetically and writes `java.util.Date` with `Z` instead of `+00:00`). Dates and durations were **not**
  a difference: Spring Boot already wrote ISO strings on 2.7, so there is no epoch-number break to build on.
- OpenRewrite alone (the free step): converts the security config and the interceptor, compiles, **all 34 tests pass, the jar packages**.
  The page check then finds **6 problems** on that green build: `GET /api/tasks/` and `/api/tasks/stats/` answer 404, the `XSRF-TOKEN` cookie
  is never set, `POST /api/tasks/` answers 403, and `eta` and `url` arrive as `ETA` and `URL`.
- The page-check loop itself, with a **script standing in for the AI** (`LEAPFROG_E2E=1`, see `agent/test/pagecheck-e2e.test.ts`): round 1 removes
  the slashes (6 problems to 4), round 2 adds the cookie filter, the token handler and `@JsonProperty` (4 to 0); the tests and the jar are rebuilt each round.
  That proves the plumbing, not what a model would do.

**Predicted, not run here** (no AI login on the box where this was built):

- Hybrid's AI sees the item files and the test output, which is green, so it has no reason to open `TaskResponse.java` or the JavaScript.
  It may still change the security config in a way that happens to fix CSRF. Expect Hybrid to finish green with a page-check warning.
- Full AI reads the whole repository, is told that the page ships with the project, and gets the page-check failures if it misses something.
  Whether it fixes all three in two rounds is not guaranteed: AI edits vary from run to run.
- A reviewer who knows these changes can fix them under either engine. The sample shows what each engine is *shown*.
- An earlier version of this sample (with a login form) was run on both engines on a real PC: both passed, in 192 s (Hybrid, 2 AI calls) and 147 s
  (Full AI, 1 call), and **neither changed `api.js`**: both fixed the page from the Java side. That is why this version has a break that needs the page
  check to be noticed at all.

## Run it

```bash
./mvnw test                  # 34 tests, no external services
./mvnw spring-boot:run       # http://localhost:8080
```

Live preview: run a dry run (or a real run) in Verdigrade, open **Live preview** on the run page and start Before and After.
Before needs JDK 8 on the same machine (Verdigrade finds it in the usual install folders), After runs on JDK 21.
`/`, `/api/tasks`, `/api/tasks/stats` and `/api/runtime` are in the suggested endpoints to compare.

## Layout

```
src/main/java/com/acme/board
  config/     SecurityConfig (item), WebConfig
  web/        TaskController, RuntimeController, RequestStatsInterceptor (item), ApiExceptionHandler
  task/       Task, TaskService, in-memory TaskRepository, seed data
  dto/        TaskRequest (validated), TaskResponse, ApiError
  runtime/    RuntimeInfo (real versions)
src/main/resources/static
  index.html  css/app.css  js/api.js  js/app.js
```

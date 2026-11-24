# leapfrog-sample-library

A library-management REST service used as a **larger, easy migration sample** for
[Verdigrade](https://github.com/AryanSi12) (the Java / Node / Python upgrade tool).

It is big enough to feel real (75 classes, 70 tests) but only has **4 small, deliberate "Will break" issues**.
Each one lives in a single file and is a quick fix for "Fix with AI". Everything else migrates cleanly.

| | Before (this repo) | Target of the Verdigrade route |
| --- | --- | --- |
| Java | 1.8 | 21 |
| Spring Boot | 2.7.18 | 4.0.x |
| Build | Maven (wrapper included) | Maven |
| Database | H2 in memory, no external services | same |

Members borrow and return books, reserve books that are out, and get fined when they are late. Scheduled jobs mark
overdue loans and expire stale reservations. Security is HTTP Basic with roles (MEMBER, LIBRARIAN, ADMIN).

## The 4 intended "Will break" issues

| # | File | Problem | Typical fix |
| --- | --- | --- | --- |
| 1 | `config/SecurityConfig.java` | `extends WebSecurityConfigurerAdapter`, `authorizeRequests()`, `antMatchers()` (removed in Spring Security 6) | A `SecurityFilterChain` bean with `authorizeHttpRequests` and `requestMatchers` |
| 2 | `config/WebMvcConfig.java` | `extends WebMvcConfigurerAdapter` (removed in Spring Framework 6) | `implements WebMvcConfigurer` |
| 3 | `web/AuditInterceptor.java` | `extends HandlerInterceptorAdapter` (removed in Spring Framework 6) | `implements HandlerInterceptor` |
| 4 | `src/test/.../LibraryApiIntegrationTest.java` | `@MockBean` (removed in Spring Boot 4) | `@MockitoBean` |

Verdigrade's planner locks these four by default. Use "Fix with AI" (or "Fix all risky items with AI"), keep each diff,
click "Re-check after fixing", then approve and run the dry run.

## What migrates on its own ("Safe")

- `java.version` 1.8 and the Spring Boot parent bump to 4.0
- `javax.*` to `jakarta.*` imports (`persistence`, `validation`, `servlet`) across 26 files
- Dependency renames in `pom.xml`

## Size

75 main Java classes in 14 packages, 17 test classes and 70 tests (all JUnit 5).

```
com.acme.library
  config/       security, MVC, RestTemplate, scheduling, properties, data seeding
  controller/   auth (register), authors, books, members, loans, reservations, fines, info
  service/      one service per area, plus ISBN lookup (RestTemplate) and notifications
  repository/   Spring Data JPA repositories
  entity/       JPA entities and enums
  dto/          request / response objects
  mapper/       entity to DTO mappers
  security/     user details service, request-id servlet filter
  scheduler/    overdue loans job, reservation expiry job
  exception/    domain exceptions and a @RestControllerAdvice
  validation/   custom @ValidIsbn constraint
  util/         ISBN, checksum, date and report helpers
  web/          audit interceptor and logger
```

## Run it

```bash
./mvnw test                 # 70 tests, no external services
./mvnw spring-boot:run      # http://localhost:8080
```

Seeded users (password `admin-demo-pass`, a fake sample value): `admin` (ADMIN) and `librarian` (LIBRARIAN).

```bash
curl -s localhost:8080/api/books
curl -s -u admin:admin-demo-pass localhost:8080/api/members
```

Main endpoints: `POST /api/auth/register`, `/api/books`, `/api/authors`, `/api/members`, `/api/loans`
(`POST`, `POST /{id}/return`, `/overdue`, `/overdue/report`), `/api/reservations`, `/api/fines`, `/api/info`,
`/actuator/health`.

## Try it with Verdigrade

In Verdigrade choose **GitHub repo** and paste this repository's URL, or clone it and use **New migration** on the folder.

Everything in here is synthetic sample code and carries no real data.

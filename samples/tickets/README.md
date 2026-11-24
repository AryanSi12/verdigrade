# leapfrog-sample-tickets

An event-ticketing REST service used as a **medium, almost-clean migration sample** for
[Verdigrade](https://github.com/AryanSi12) (the Java / Node / Python upgrade tool).

It has exactly **one tiny "Will break" issue** that "Fix with AI" can solve in a few tokens. Everything else
migrates on its own.

| | Before (this repo) | Target of the Verdigrade route |
| --- | --- | --- |
| Java | 1.8 | 21 |
| Spring Boot | 2.7.18 | 4.0.x |
| Build | Maven (wrapper included) | Maven |
| Database | H2 in memory, no external services | same |

Customers buy tickets for events held at venues. Orders start as pending, can be paid (tickets are issued),
cancelled or refunded. A scheduled job cancels unpaid orders after 30 minutes.

## The 1 intended "Will break" issue

| File | Problem | Fix (about 2 lines) |
| --- | --- | --- |
| `src/main/java/com/acme/tickets/web/RequestLoggingInterceptor.java` (20 lines) | `extends HandlerInterceptorAdapter`, removed in Spring Framework 6 | `implements HandlerInterceptor` (and change the import) |

Verdigrade's planner locks it by default. Use "Fix with AI" on that item, keep the diff, click "Re-check after fixing",
then approve and run the dry run.

## What migrates on its own ("Safe")

- `java.version` 1.8 and the Spring Boot parent bump to 4.0
- `javax.*` to `jakarta.*` imports (`persistence`, `validation`, `servlet`) in 17 files
- Dependency renames in `pom.xml`

Nothing else is flagged: no security config, no hardcoded passwords, no deprecated properties, no JUnit 4.

## Size

51 main Java classes in 12 packages, 12 test classes and 51 tests (all JUnit 5).

```
com.acme.tickets
  config/       properties, scheduling, MVC registration, data seeding
  controller/   venues, events, customers, orders, tickets
  service/      one service per area, plus pricing
  repository/   Spring Data JPA repositories
  entity/       JPA entities and enums
  dto/          request / response objects
  mapper/       entity to DTO mappers
  scheduler/    pending order expiry job
  exception/    domain exceptions and a @RestControllerAdvice
  util/         ticket code generator
  web/          request logging interceptor (the one issue)
```

## Run it

```bash
./mvnw test                 # 51 tests, no external services
./mvnw spring-boot:run      # http://localhost:8080
```

```bash
curl -s localhost:8080/api/events
curl -s -X POST localhost:8080/api/orders -H 'Content-Type: application/json' \
  -d '{"eventId":1,"customerId":1,"quantity":2}'
```

Main endpoints: `/api/venues`, `/api/events` (`POST /{id}/publish`, `POST /{id}/cancel`, `GET /{id}/revenue`),
`/api/customers`, `/api/orders` (`POST /{id}/pay`, `/cancel`, `/refund`), `/api/tickets`.

## Try it with Verdigrade

In Verdigrade choose **GitHub repo** and paste this repository's URL, or clone it and use **New migration** on the folder.

Everything in here is synthetic sample code and carries no real data.

# leapfrog-sample-warehouse

A warehouse-management REST service: a **large, mostly mechanical migration sample** for [Verdigrade](https://github.com/AryanSi12) where the **Hybrid** engine is the better fit.

It is big enough to feel like a real service (101 main classes, 30 test classes, 131 tests) but almost everything in it is the
`javax.*` to `jakarta.*` rename, JPA and validation annotations, and a version bump. OpenRewrite does all of that deterministically.
There is **exactly 1 small "Will break" item**, so Hybrid makes one short AI call and Full AI still has to read the whole codebase.

| | Before (this repo) | Target of the Verdigrade route |
| --- | --- | --- |
| Java | 1.8 | 21 |
| Spring Boot | 2.7.18 | 4.0.x |
| Build | Maven (wrapper included) | Maven |
| Database | H2 in memory, no external services | same |

## The 1 intended "Will break" item

| # | File | Problem | Typical fix |
| --- | --- | --- | --- |
| 1 | `config/WebConfig.java` | `extends WebMvcConfigurerAdapter` (removed in Spring Framework 6) | `implements WebMvcConfigurer` |

## What migrates on its own ("Safe")

- `java.version` 1.8 and the Spring Boot parent bump to 4.0
- `javax.*` to `jakarta.*` imports (`persistence`, `validation`, `servlet`) across 42 files
- Dependency renames in `pom.xml`

## Which engine fits

**Hybrid is the better choice here.** OpenRewrite handles the 40-odd files for free, then one AI call fixes `WebConfig.java`.
Full AI would read and rewrite every file that has to change.

Plan-screen token estimates (a range from file sizes, not a measurement, no prices):

| Engine | Input tokens | Output tokens |
| --- | --- | --- |
| Hybrid | about 99k to 185k | about 3k to 8k |
| Full AI | about 1.2M to 2.2M | about 12k to 37k |

Use **Compare both** on the plan screen to see the real numbers side by side.

## What is in it

12 CRUD resources (entity, request and response DTOs, mapper, repository, service, controller, and tests for each), plus stock
movements with an on-hand calculation, a low-stock scheduled job, a request-id servlet filter, an audit interceptor,
validated configuration properties and an error handler.

```
com.acme.warehouse
  entity/ repository/ service/ controller/ dto/ mapper/   warehouses, zones, bins, categories, suppliers, products,
                                                            purchase orders, shipments, carriers, customers,
                                                            employees, stock movements
  config/       WebConfig (the Will break item), scheduling, properties, data seeding
  web/          request-id filter, audit interceptor
  scheduler/    low-stock job
  util/         SKU generator, reorder calculator
  exception/    domain exceptions and a @RestControllerAdvice
```

## Run it

```bash
./mvnw test                 # 131 tests, no external services
./mvnw spring-boot:run      # http://localhost:8080
```

```bash
curl -s localhost:8080/api/warehouses
curl -s -X POST localhost:8080/api/categories -H 'Content-Type: application/json' -d '{"name":"Racking","description":"Shelving"}'
```

## Try it with Verdigrade

In Verdigrade choose **GitHub repo** and paste this repository's URL, or clone it and use **New migration** on the folder.
Pick the Hybrid engine, review the plan (1 Will break item), run the dry run.

Everything in here is synthetic sample code and carries no real data.

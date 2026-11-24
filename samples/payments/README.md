# leapfrog-sample-payments

A payments platform split into **3 Maven modules**: a **multi-module migration sample** for [Verdigrade](https://github.com/AryanSi12) where the **Hybrid** engine is the better fit.

The work is nearly all recipe work spread across modules (`javax` to `jakarta`, JPA and validation, Boot and Java bumps in a
parent plus three module poms). There are **0 "Will break" items**, so Hybrid should finish without any AI call at all.

| | Before (this repo) | Target of the Verdigrade route |
| --- | --- | --- |
| Java | 1.8 | 21 |
| Spring Boot | 2.7.18 (in the parent pom) | 4.0.x |
| Build | Maven multi-module (wrapper included) | Maven |
| Database | H2 in memory, no external services | same |

## Modules

| Module | What it holds |
| --- | --- |
| `payments-common` | `Money`, a custom `@ValidCurrency` constraint (javax.validation `ConstraintValidator`), Luhn card check |
| `payments-core` | JPA entities, repositories, services, DTOs, and the `PaymentProcessor` state machine (authorize, capture, refund) |
| `payments-api` | Spring Boot application, REST controllers, error handler, a servlet filter that adds `X-Request-Id` |

`payments-api` depends on `payments-core`, which depends on `payments-common`.

## Intended items

- "Will break": **none**.
- "Safe": Java and Spring Boot bumps, `javax.*` to `jakarta.*` in 29 files across the modules, dependency renames.
- Verdigrade's plan scan reports a multi-module build (the parent counts as one of the 4 poms).

## Which engine fits

**Hybrid is the better choice here.** There is nothing for an AI to decide, so Hybrid's cost is close to zero, while Full AI would
read every module.

Plan-screen token estimates (a range from file sizes, not a measurement, no prices):

| Engine | Input tokens | Output tokens |
| --- | --- | --- |
| Hybrid | about 4k to 10k (report narrative only) | about 1k |
| Full AI | about 0.9M to 1.6M | about 10k to 30k |

## Verified

A Classic (OpenRewrite only, no AI) dry run of this project passes end to end: 52 files changed, 93 of 93 tests, package and checks ok.

## Size

63 main classes, 21 test classes, 93 tests (12 in common, 41 in core, 40 in api), all JUnit 5.

## Run it

```bash
./mvnw test                                # 93 tests across the 3 modules
./mvnw -pl payments-api -am spring-boot:run   # http://localhost:8080
```

Resources: `/api/accounts`, `/api/merchants`, `/api/payment-methods`, `/api/payments`, `/api/refunds`, `/api/settlements`,
`/api/disputes`, and `POST /api/payment-flow/{id}/capture` and `/refund`.

## Try it with Verdigrade

In Verdigrade choose **GitHub repo** and paste this repository's URL, or clone it and use **New migration** on the folder.

Everything in here is synthetic sample code and carries no real data.

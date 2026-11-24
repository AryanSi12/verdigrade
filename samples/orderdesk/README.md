# leapfrog-sample-orderdesk

**Order Desk** (refactor showcase): a Java 8 / Spring Boot 2.7 orders dashboard with a real HTML/CSS/JS page, written in an older style on purpose.
Part of the [Verdigrade](https://github.com/AryanSi12/verdigrade) samples.

It is a small orders dashboard: KPI tiles, a filterable orders table, an order drawer with status actions
(new → paid → shipped → delivered, or cancelled), a "New order" form with server-side validation, tier discounts and a
CSV export. The page reads `GET /api/runtime`, so Live preview Before and After show the real Java, Boot and javax/jakarta.

It upgrades cleanly (no security layer, no removed MVC adapters, page calls use canonical paths), so the interesting part
is what comes after: the code is written in a believable pre-Java-17 style so Verdigrade's **Refactor quiz** has real work.

| Refactor target | Where |
| --- | --- |
| DTO classes that can be records | `dto/` (7 classes; 4 are already read-only) |
| Deprecated APIs | `new Integer` / `new Long` / `new Double`, `collect(Collectors.toList())`, `StringBuffer` |
| `System.out` / `printStackTrace` logging | `OrderService`, `PricingService`, `ReportService`, `SeedData` |
| `== null` checks that suit `Optional` | `OrderRepository.findById` / `findByNumber` return null |
| Field `@Autowired` | services, mapper, controllers, seed data |
| Classic `switch` with `break` | `PricingService`, `OrderService`, `OrderMapper` |
| Dead private methods | `OrderService`, `PricingService`, `ReportService` |
| Wildcard imports | `OrderRepository`, `OrderService`, `ReportService`, `OrderController` |

The page's JavaScript (`static/js`) is old-style too (`var`, `==`, callbacks).

35 tests (MockMvc API tests, service and pricing tests) make the post-refactor build and test check meaningful.

| | Before | After (Verdigrade route) |
| --- | --- | --- |
| Java | 1.8 | 21 |
| Spring Boot | 2.7.18 | 4.0.x |
| Namespace | `javax.*` | `jakarta.*` |

Run it: `./mvnw spring-boot:run`, then open http://localhost:8080.

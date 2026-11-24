# leapfrog-sample-legacy-java

A support desk built on an **in-house framework**: a small **judgment-heavy migration sample** for [Verdigrade](https://github.com/AryanSi12) where the **Full AI** engine is the better fit.

The app is small (25 classes, 27 tests) but its trouble spots are custom code and removed APIs that need a redesign, not a search
and replace. OpenRewrite only has the generic `javax` rename and version bumps to offer.

| | Before (this repo) | Target of the Verdigrade route |
| --- | --- | --- |
| Java | 1.8 | 21 |
| Spring Boot | 2.7.18 | 4.0.x |
| Build | Maven (wrapper included) | Maven |
| Database | H2 in memory, no external services | same |

## The intended AI items (5 findings in 4 files)

| # | File | Tier | Problem | What the fix needs |
| --- | --- | --- | --- | --- |
| 1 | `config/SecurityConfig.java` | Will break | `WebSecurityConfigurerAdapter`, `antMatchers`, `authorizeRequests`, with a custom `ApiKeyFilter` | A `SecurityFilterChain` bean that keeps the filter order and the 401 behaviour |
| 2 | `config/LegacyWebSupport.java` | Will break | In-house base class that `extends WebMvcConfigurerAdapter`; `WebConfig` extends it | Rework the base class to `implements WebMvcConfigurer` and keep the subclass hook |
| 3 | `config/UploadConfig.java` | Will break | `CommonsMultipartResolver` bean (removed in Spring Framework 6) | Drop the bean, move the 5 MB limit to `spring.servlet.multipart.*` |
| 4 | `util/UnsafeCounter.java` | Review (AI) | JDK-internal `sun.misc.Unsafe` plus reflection on `theUnsafe` | Replace with `AtomicLong` and keep `next()` behaviour |

Item 4 is reported twice (JDK internals, reflection). The in-house wiring that recipes cannot see is also part of the story:
`framework/BaseService` and `BaseEntity` (a custom base-class framework) and `framework/HandlerRegistry`
(reflection-based command wiring). They keep working today; the AI has to keep them working after the redesign above.

## What migrates on its own ("Safe")

- `java.version` 1.8 and the Spring Boot parent bump to 4.0
- `javax.*` to `jakarta.*` imports in 7 files
- Dependency renames in `pom.xml`

## Which engine fits

**Full AI is the better choice here.** The valuable work is the redesign of in-house code. Hybrid still saves the mechanical
part, but nearly all of the cost and risk is the AI items, so the gap between the engines is much smaller than on the warehouse and
payments samples, and Full AI gives one consistent pass over the in-house framework.

Plan-screen token estimates (a range from file sizes, not a measurement, no prices):

| Engine | Input tokens | Output tokens |
| --- | --- | --- |
| Hybrid | about 240k to 440k | about 7k to 23k |
| Full AI | about 550k to 980k | about 12k to 37k |

Use **Compare both** on the plan screen to see the real numbers side by side.

## Run it

```bash
./mvnw test                 # 27 tests, no external services
./mvnw spring-boot:run      # http://localhost:8080
```

Every `/api/**` call needs the sample header `X-Api-Key: demo-api-key-not-a-secret` (a fake value).

```bash
curl -s -H 'X-Api-Key: demo-api-key-not-a-secret' -X POST localhost:8080/api/tickets -H 'Content-Type: application/json' -d '{"title":"Printer jam"}'
curl -s -H 'X-Api-Key: demo-api-key-not-a-secret' -X POST localhost:8080/api/commands/close -H 'Content-Type: application/json' -d '{"id":1}'
```

## Try it with Verdigrade

In Verdigrade choose **GitHub repo** and paste this repository's URL, or clone it and use **New migration** on the folder.
Pick Full AI, or use **Compare both** against Hybrid.

Everything in here is synthetic sample code and carries no real data.

# Java and Spring migration

Routes, recipe names and every version pin live in **one place**: `profiles/matrices/java.json` (validated with zod at startup; run `npx verdigrade validate` after editing). Do not copy pins into prompts or code.

- `plugin`: the rewrite-maven-plugin coordinate used for Maven projects.
- `gradlePlugin`: the OpenRewrite Gradle plugin, applied through an init script so the build file is never edited.
- `artifacts`: recipe artifacts by key (`rewrite-migrate-java`, `rewrite-spring`). Routes and rules packs reference these keys.
- `bootTargetAliases`: how a requested Boot target such as `3.x` maps to a supported line (today `3.5.x`, the last 3.x line with OSS support).

## Recipe `when` conditions (evaluated in code, `bot/lib/pipeline.ts`)

- `javaBelowTarget`: the scanned Java level is below the route target (unknown runs the idempotent upgrade).
- `bootPresent`: a Spring Boot parent, BOM or Gradle plugin was found.
- `javaxFiles`: files still reference **Jakarta EE** `javax.*` packages. JDK-owned packages (`javax.crypto`, `javax.sql`, `javax.naming`, `javax.net`, `javax.xml.parsers`, `javax.annotation.processing`, `javax.transaction.xa` …) never count.
- `always`.

## Classic Spring, no Boot parent

Only the Java (and Jakarta) recipes run. The report lists the manual work: add `spring-boot-starter-parent` for the chosen line, add a `@SpringBootApplication` class, replace `web.xml` and XML bean config.

## Hard parts a fix-up may meet

- Spring Security 6/7: no `WebSecurityConfigurerAdapter`; use a `SecurityFilterChain` bean, `authorizeHttpRequests`, `requestMatchers`, the lambda DSL.
- Hibernate 6/7: HQL/JPQL changes, ID generator defaults, removed dialects, `@Type` changes.
- JUnit 4 → 5, Jackson 3 in Boot 4, renamed auto-config properties (`spring-boot-properties-migrator` reports them at startup).

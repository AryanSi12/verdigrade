# Modernizer follow-ups

Rules packs (`profiles/modernizer-rules/*.json`) are applied **by code** after the OpenRewrite recipes (`bot/lib/rules.ts`). Every rule is anchored and idempotent, so running a pack twice changes nothing the second time:

- `dependencyRenames`: exact `groupId` + `artifactId` match inside `<dependency>` blocks (or Gradle coordinates). `spring-boot-starter-web` → `spring-boot-starter-webmvc` never touches `spring-boot-starter-webmvc` or `-webflux`.
- `propertyRenames`: whole-key renames in `application*.properties` **and** `application*.yml` (nested or dotted keys, every profile file, every module). When both keys exist the rename is skipped and reported.
- `removeProperties`: whole-key removals.
- `javaxToJakarta` + `jakartaRecipe`: when Jakarta EE `javax` references remain, the pipeline runs the recipe.

Org packs must stay generic. Sample- or team-specific rules go in their own pack (for example `acme-samples`, which removes `acme.legacy.boot2-mode`) and are enabled per repository in `.leapfrog.json`:

```json
{ "extraRulePacks": ["acme-samples"] }
```

As a fix-up agent you do not re-apply packs. Fix only what the failing test needs, with `apply_text_patch`.

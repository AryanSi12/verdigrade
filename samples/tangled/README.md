# leapfrog-sample-tangled

A claims portal with an **in-house security and web layer**: a **Full AI demo** for [Verdigrade](https://github.com/AryanSi12). The few things that break on the upgrade are tangled together, so they have to be changed as one piece.

The app is small (36 classes, 55 tests, no database or external services). On token cost Hybrid still wins, as always. This sample is built to show the other axis: **the result**.

| | Before (this repo) | Target of the Verdigrade route |
| --- | --- | --- |
| Java | 1.8 | 21 |
| Spring Boot | 2.7.18 | 4.0.x |
| Build | Maven (wrapper included) | Maven |

## What is tangled

Everything goes through one door, `SecurityContextBridge` (an interface with `javax.servlet` types), which says who is logged in.

```text
LegacySecurityConfigurer  (extends WebSecurityConfigurerAdapter; exposes the AuthenticationManager bean)
        │  logout handler uses the bridge
        ▼
SecurityContextBridge ◄── AbstractSecuredController ◄── SessionController, ClaimController, AdminController
        ▲                  (signIn: authenticationManager → bridge.establish)
        │
AbstractSecuredInterceptor (extends HandlerInterceptorAdapter, calls super.preHandle / afterCompletion)
        ▲                       ▲
 RoleInterceptor         AuditInterceptor ── AuditSink ◄── SecuredApiTestBase (@MockBean AuditSink)
        ▲                                         ▲
SecuredWebConfigurer (extends WebMvcConfigurerAdapter, calls super.addInterceptors) ◄── PortalWebConfig
```

### What the Verdigrade plan finds (6 AI items in 4 files, no Needs-you items)

| # | File | Tier | Finding |
| --- | --- | --- | --- |
| 1 | `security/LegacySecurityConfigurer.java` | Will break | `WebSecurityConfigurerAdapter`, `antMatchers`, `authorizeRequests` |
| 2 | `security/LegacySecurityConfigurer.java` | Will break | `.and()` chains in the security config |
| 3 | `security/LegacySecurityConfigurer.java` | Might break | `@EnableGlobalMethodSecurity(prePostEnabled, securedEnabled)` |
| 4 | `web/AbstractSecuredInterceptor.java` | Will break | `HandlerInterceptorAdapter` |
| 5 | `web/SecuredWebConfigurer.java` | Will break | `WebMvcConfigurerAdapter` |
| 6 | `SecuredApiTestBase.java` (tests) | Will break | `@MockBean` |

The free step handles the version bumps and `javax` → `jakarta` (15 files). The six items are all left for the AI.

### Why fixing them one by one is hard

- **Ripple files that no item names.** `RoleInterceptor` and `AuditInterceptor` extend `AbstractSecuredInterceptor` and rely on its `super` calls; `PortalWebConfig` extends `SecuredWebConfigurer`. When the two base classes switch to `implements HandlerInterceptor` / `WebMvcConfigurer`, those `super.…` calls stop compiling in files outside the plan items. Six more files extend or implement the item types.
- **A bean that only the controllers use.** `AbstractSecuredController` injects an `AuthenticationManager`. Today it comes from `authenticationManagerBean()` in the adapter class; the adapter is going away. Forget to expose the bean elsewhere and the Spring context fails to start, so 30 full-stack tests fail with one error.
- **A change that compiles and no scanner reports.** `SessionSecurityContextBridge.establish(...)` sets the `SecurityContextHolder` and relies on the old filter chain to save it into the session at the end of the request. Spring Security 6 no longer saves it automatically (the documented `requireExplicitSave` default). After a literal migration everything compiles, the login call still returns 200, and the next request is anonymous: 401s in `LoginFlowTest`, `RoleEnforcementTest` and `ClaimFlowTest`. The fix is in a file that is not part of any plan item and changes the `establish` signature, which ripples to `AbstractSecuredController` and `SessionController`.
- **Behaviour asserted across layers.** The tests log in through the controller, hit the interceptors and the URL rules, and verify the audit trail through the mocked sink (`approvalIsAuditedWithTheAdjuster`, `deniedRequestsAreAuditedWithTheActor`). A fix that satisfies one layer breaks the next.

## Expected outcome (not yet measured)

The Verdigrade code was read to design this, but **neither engine has been run on this sample yet**. What follows is what the code suggests, not a result.

| | Hybrid | Full AI |
| --- | --- | --- |
| Free step | Version bumps, `javax` → `jakarta` | none |
| AI input | One call with the six findings and their files; then up to 3 fix-up rounds fed with the failing test output (last 12k characters) | One agent over the whole repository, with its own build/test rounds |
| Likely path | The call fixes the six findings. The first test run then fails on the ripple files or the missing `AuthenticationManager`; later on 401s that nothing in the log explains. Three rounds may not be enough | Reads the controllers, interceptors and bridge together, and changes the contract once |
| Likely end | Fails the tests, or passes after spending most of its fix rounds | Passes in one run |
| Tokens (plan screen estimate, no prices) | about 290k to 550k in, 7k to 23k out, plus the fix rounds | about 750k to 1.4M in, 12k to 37k out |

Hybrid can still get lucky: a strong model may fix the bridge in its first call. That is why the point of the demo is **Compare both**: it shows build, tests, files changed, rounds, time and real tokens side by side.

## What the plan recommends

The plan screen recommends **Full AI** (high confidence): all 6 AI items are in files that depend on each other (shared `SecurityContextBridge` and `AuditSink` contracts, 6 dependent files). It says plainly that Hybrid is about 3× cheaper in tokens, and recommends Full AI for consistency, not for cost.

## Run it

```bash
./mvnw test                 # 55 tests, no external services
./mvnw spring-boot:run      # http://localhost:8080
```

All demo accounts use the fake password `demo-pass-not-a-secret`: `casey` and `jordan` (claimants), `alex` (adjuster), `root` (admin).

```bash
curl -s -c jar -X POST localhost:8080/api/session -H 'Content-Type: application/json' -d '{"username":"casey","password":"demo-pass-not-a-secret"}'
curl -s -b jar -X POST localhost:8080/api/claims -H 'Content-Type: application/json' -d '{"description":"Cracked phone","amountCents":12000}'
curl -s -b jar localhost:8080/api/claims
```

## Try it with Verdigrade

In Verdigrade choose **GitHub repo** and paste this repository's URL, or clone it and use **New migration** on the folder. Accept the recommended engine, or use **Compare both**.

Everything in here is synthetic sample code and carries no real data.

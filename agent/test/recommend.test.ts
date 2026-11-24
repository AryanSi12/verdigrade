import { cpSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { estimateTokens } from "../bot/lib/estimate.js";
import { analyzeFrontend } from "../bot/lib/frontend.js";
import { generatePlan, type PlanItem } from "../bot/lib/plan.js";
import { chooseEngine, expectedTime, fixerReason, planDetails, recommendEngine } from "../bot/lib/recommend.js";
import { tempDir } from "./helpers.js";

const samplesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../samples");

async function planFor(sample: string) {
  const repo = path.join(tempDir("leapfrog-reco-"), sample);
  cpSync(path.join(samplesRoot, sample), repo, { recursive: true });
  const plan = await generatePlan({ repoPath: repo, request: { targets: {}, from: {} }, ai: false });
  return plan;
}

describe("engine recommendation on the samples", () => {
  it("warehouse-large picks Hybrid with high confidence (1 AI item, 42 javax files)", async () => {
    const plan = await planFor("warehouse-large");
    const r = recommendEngine(plan, estimateTokens(plan, { fixRounds: 3, aiAttempts: 3, narrative: true }));
    expect(r.recommendedEngine).toBe("hybrid");
    expect(r.confidence).toBe("high");
    expect(r.signals.aiItems).toBe(1);
    expect(r.reasons.length).toBeGreaterThanOrEqual(3);
    expect(r.reasons.length).toBeLessThanOrEqual(5);
    expect(r.reasons.join(" ")).toContain("42 files");
    expect(r.alternative.engine).toBe("ai");
  }, 60_000);

  it("payments picks Hybrid and says no AI call is needed", async () => {
    const r = recommendEngine(await planFor("payments"));
    expect(r.recommendedEngine).toBe("hybrid");
    expect(r.signals.aiItems).toBe(0);
    expect(r.headline).toMatch(/no AI call/);
  }, 60_000);

  it("legacy-java leans Full AI even though Hybrid is cheaper, and says so", async () => {
    const plan = await planFor("legacy-java");
    const r = recommendEngine(plan, estimateTokens(plan, { fixRounds: 3, aiAttempts: 3, narrative: true }));
    expect(r.recommendedEngine).toBe("ai");
    expect(r.confidence).toBe("medium");
    expect(r.signals.judgmentItems).toBeGreaterThanOrEqual(3);
    expect(r.tokens.cheaper).toBe("hybrid");
    expect(r.reasons.join(" ")).toMatch(/judgment code/);
    expect(r.reasons.join(" ")).toMatch(/Hybrid is about 2× cheaper/);
    expect(r.alternative.text).toMatch(/Hybrid would use about .* fewer tokens/);
  }, 60_000);

  it("flask-legacy picks Full AI (Python has no recipes)", async () => {
    const r = recommendEngine(await planFor("flask-legacy"));
    expect(r.recommendedEngine).toBe("ai");
    expect(r.headline).toMatch(/Python has no recipe library/);
  }, 60_000);

  it("library and tickets stay on Hybrid", async () => {
    expect(recommendEngine(await planFor("library")).recommendedEngine).toBe("hybrid");
    expect(recommendEngine(await planFor("tickets")).recommendedEngine).toBe("hybrid");
  }, 60_000);
});

describe("plan details", () => {
  it("previews the steps for each engine and lists versions and the next step", async () => {
    const plan = await planFor("legacy-java");
    const hybrid = planDetails(plan, "hybrid");
    const ai = planDetails(plan, "ai");
    expect(hybrid.from).toEqual([{ label: "Java", value: "1.8" }, { label: "Spring Boot", value: "2.7.18" }]);
    expect(hybrid.to.map((v) => v.value)).toEqual(["21", "4.0.x"]);
    expect(hybrid.steps.find((s) => s.id === "modernize")?.runs).toBe(true);
    expect(hybrid.steps.find((s) => s.id === "items")?.runs).toBe(true);
    expect(ai.steps.find((s) => s.id === "modernize")?.runs).toBe(false);
    expect(ai.steps.find((s) => s.id === "rewrite")?.engineWork).toBe("ai");
    expect(hybrid.risk.level).toBe("medium");
    expect(hybrid.next).toMatch(/temporary copy/);
    expect(hybrid.expectedTime).toBeNull();
  }, 60_000);

  it("lists what the user must do for Needs-you items", async () => {
    const details = planDetails(await planFor("flask-legacy"), "ai");
    expect(details.needsYou.map((entry) => entry.file)).toEqual(["Dockerfile"]);
  }, 60_000);

  it("derives the time range only from past passed runs of the same ecosystem and engine", () => {
    const run = (ms: number, extra: Record<string, string> = {}) => ({ ecosystem: "java", engine: "hybrid", status: "passed", startedAt: "2026-01-01T10:00:00.000Z", finishedAt: new Date(Date.parse("2026-01-01T10:00:00.000Z") + ms).toISOString(), ...extra });
    expect(expectedTime([], "java", "hybrid")).toBeNull();
    expect(expectedTime([run(90_000), run(210_000), run(50_000, { status: "failed" }), run(30_000, { engine: "ai" })], "java", "hybrid")).toEqual({ minMs: 90_000, maxMs: 210_000, basedOn: 2 });
  });

  it("explains each item's fixer in one line", () => {
    const base = { group: "review", category: "removed-api", kind: "api.mvc-adapter", severity: "high", title: "t", file: "A.java", why: "w", tier: "breaks" } as unknown as PlanItem;
    expect(fixerReason({ ...base, group: "auto", tier: "safe" } as PlanItem)).toMatch(/deterministic/);
    expect(fixerReason(base)).toMatch(/AI rewrites it/);
    expect(fixerReason({ ...base, kind: "api.security-config" } as PlanItem)).toMatch(/design decision/);
    expect(fixerReason({ ...base, kind: "inline-secret", category: "inline-secret" } as PlanItem)).toMatch(/Nobody can change this safely/);
  });
});

describe("engine cards", () => {
  it("only the recommended card carries 'why it is better', only the other one 'when you'd pick it'", async () => {
    for (const sample of ["warehouse-large", "payments", "legacy-java", "flask-legacy"]) {
      const r = recommendEngine(await planFor(sample));
      const rec = r.cards[r.recommendedEngine];
      const other = r.cards[r.alternative.engine];
      expect(rec.recommended).toBe(true);
      expect(other.recommended).toBe(false);
      expect(rec.whyBetter.length).toBeGreaterThan(0);
      expect(rec.whenPick).toBe("");
      expect(other.whyBetter).toEqual([]);
      expect(other.whenPick).toMatch(/^Pick /);
      for (const card of [rec, other]) {
        expect(card.pros.length).toBeGreaterThan(0);
        expect(card.pros.length).toBeLessThanOrEqual(3);
        expect(card.cons.length).toBeGreaterThan(0);
        expect(card.cons.length).toBeLessThanOrEqual(2);
      }
    }
  });

  it("uses real numbers: warehouse-large says Hybrid is far cheaper and the AI touches 1 file; counts add up", async () => {
    const plan = await planFor("warehouse-large");
    const r = recommendEngine(plan);
    expect(r.recommendedEngine).toBe("hybrid");
    expect(r.cards.hybrid.whyBetter.join(" ")).toMatch(/\d+× fewer tokens/);
    expect(r.cards.hybrid.whyBetter.join(" ")).toMatch(/AI touches 1 file instead of about \d+/);
    expect(r.cards.hybrid.fixers).toEqual({ free: r.signals.automaticItems, ai: r.signals.aiItems, you: r.signals.needsYou });
    expect(r.cards.ai.fixers.free).toBe(0);
    expect(r.cards.ai.fixers.ai).toBe(r.signals.automaticItems + r.signals.aiItems);
  });

  it("legacy-java recommends Full AI for consistency and says honestly that Hybrid is cheaper", async () => {
    const r = recommendEngine(await planFor("legacy-java"));
    expect(r.recommendedEngine).toBe("ai");
    expect(r.cards.ai.whyBetter.join(" ")).toMatch(/Hybrid is cheaper/);
    expect(r.cards.ai.cons.join(" ")).toMatch(/more\s+tokens than Hybrid/);
  });
});

describe("which engine a run starts with", () => {
  const ready = () => false;
  const noAi = (engine: string) => engine === "ai";
  it("uses the plan's recommendation when the user selected nothing", () => {
    expect(chooseEngine(undefined, "hybrid", "hybrid", ready)).toBe("hybrid");
    expect(chooseEngine(undefined, "ai", "hybrid", ready)).toBe("ai");
  });
  it("uses the user's selection even when it is not the recommendation", () => {
    expect(chooseEngine("ai", "hybrid", "hybrid", ready)).toBe("ai");
    expect(chooseEngine("hybrid", "ai", "hybrid", ready)).toBe("hybrid");
  });
  it("falls back to Hybrid when Full AI is recommended but there is no AI login; no plan means the default", () => {
    expect(chooseEngine(undefined, "ai", "hybrid", noAi)).toBe("hybrid");
    expect(chooseEngine(undefined, null, "hybrid", ready)).toBe("hybrid");
  });
});

describe("coupled AI items (tangled sample)", () => {
  it("tangled recommends Full AI because its AI items depend on each other, and says Hybrid is cheaper", async () => {
    const r = recommendEngine(await planFor("tangled"));
    expect(r.recommendedEngine).toBe("ai");
    expect(r.confidence).toBe("high");
    expect(r.signals.aiItems).toBeGreaterThanOrEqual(5);
    expect(r.signals.coupledItems).toBe(r.signals.aiItems);
    expect(r.signals.sharedContracts).toEqual(expect.arrayContaining(["SecurityContextBridge"]));
    expect(r.reasons[0]).toMatch(/depend on each other/);
    expect(r.cards.ai.whyBetter.join(" ")).toMatch(/coupled across \d+ files/);
    expect(r.cards.ai.whyBetter.join(" ")).toMatch(/Hybrid is cheaper/);
    expect(r.cards.hybrid.cons.join(" ")).toMatch(/coupled across files/);
  }, 60_000);

  it("the other Java samples are not coupled enough to change their recommendation", async () => {
    for (const [sample, engine] of [["library", "hybrid"], ["tickets", "hybrid"], ["warehouse-large", "hybrid"], ["payments", "hybrid"], ["legacy-java", "ai"]] as const) {
      const r = recommendEngine(await planFor(sample));
      expect(r.recommendedEngine, sample).toBe(engine);
      expect(r.signals.coupledItems, sample).toBeLessThan(3);
    }
  }, 120_000);

  it("Python and Node samples report no coupling", async () => {
    expect(recommendEngine(await planFor("flask-legacy")).signals.coupledItems).toBe(0);
  }, 60_000);
});

describe("frontend coupled (webapp sample)", () => {
  it("webapp recommends Full AI because its page calls the API and the CSRF cookie the AI items configure, and says Hybrid is cheaper", async () => {
    const r = recommendEngine(await planFor("webapp"));
    expect(r.recommendedEngine).toBe("ai");
    expect(r.confidence).toBe("high");
    expect(r.headline).toBe("Full AI: the AI must also update the frontend; Hybrid only edits backend item files.");
    expect(r.signals.frontendCoupled).toBe(true);
    expect(r.signals.frontendFiles).toBeGreaterThanOrEqual(3);
    expect(r.signals.frontendCalls).toBeGreaterThanOrEqual(3);
    expect(r.signals.frontendPatterns.join(" ")).toMatch(/trailing slash/);
    expect(r.signals.frontendPatterns.join(" ")).toMatch(/CSRF/);
    expect(r.reasons[0]).toMatch(/^Frontend coupled: 1 page file calls \d+ API paths/);
    expect(r.reasons[0]).toMatch(/Hybrid's AI only edits the backend item files/);
    expect(r.cards.ai.whyBetter.join(" ")).toMatch(/must also update the frontend/);
    expect(r.cards.hybrid.cons.join(" ")).toMatch(/Frontend coupled/);
    expect(r.tokens.cheaper).toBe("hybrid");
    expect(r.cards.ai.pros[0]).toMatch(/^Full AI also verifies the running page and fixes the frontend/);
    expect(r.cards.hybrid.cons.join(" ")).toMatch(/Hybrid runs the page check too .* only reports the problems/);
    expect(r.cards.ai.whyBetter.join(" ")).toMatch(/Hybrid only reports page problems/);
  }, 60_000);

  it("the same project without its page is a Hybrid project: the signal, not the items, flips the recommendation", async () => {
    const repo = path.join(tempDir("leapfrog-reco-"), "webapp");
    cpSync(path.join(samplesRoot, "webapp"), repo, { recursive: true });
    rmSync(path.join(repo, "src/main/resources/static"), { recursive: true, force: true });
    const r = recommendEngine(await generatePlan({ repoPath: repo, request: { targets: {}, from: {} }, ai: false }));
    expect(r.signals.frontendCoupled).toBe(false);
    expect(r.signals.frontendFiles).toBe(0);
    expect(r.recommendedEngine).toBe("hybrid");
    expect(r.cards.ai.pros.join(" ")).not.toMatch(/running page/);
  }, 60_000);

  it("the other samples are not frontend coupled (tickets only has a static welcome page), so nothing changes for them", async () => {
    for (const sample of ["tickets", "library", "tangled"]) {
      const r = recommendEngine(await planFor(sample));
      expect(r.signals.frontendCoupled, sample).toBe(false);
    }
  }, 120_000);
});

describe("analyzeFrontend", () => {
  const security = { file: "SecurityConfig.java", text: 'http.csrf(c -> c.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())).authorizeHttpRequests(a -> a.requestMatchers("/api/**").authenticated()).httpBasic(b -> {});' };

  it("flags trailing-slash calls, the CSRF cookie header and the login header", () => {
    const js = { file: "src/main/resources/static/js/api.js", text: "fetch('/api/tasks/'); fetch('/api/tasks/' + id + '/complete'); h['X-XSRF-TOKEN'] = cookie('XSRF-TOKEN'); h.Authorization = 'Basic ' + x;" };
    const r = analyzeFrontend([js], [security]);
    expect(r).toMatchObject({ coupled: true, strength: "high", csrf: true, login: true, calls: 1, callers: 1 });
    expect(r.trailingSlash).toEqual(["/api/tasks/"]);
  });

  it("is medium when only API paths overlap with what an item names", () => {
    const js = { file: "src/main/resources/static/app.js", text: "fetch('/api/items')" };
    const r = analyzeFrontend([js], [{ file: "Cfg.java", text: 'registry.addInterceptor(i).addPathPatterns("/api/**");' }]);
    expect(r).toMatchObject({ coupled: true, strength: "medium", csrf: false, trailingSlash: [] });
  });

  it("is not coupled when the page calls nothing the items cover, has no CSRF or login handling, or the item names no paths", () => {
    const js = { file: "src/main/resources/static/app.js", text: "fetch('/health'); const logo = '/img/logo.png'; // fetch('/api/old/')" };
    expect(analyzeFrontend([js], [{ file: "Cfg.java", text: 'x.addPathPatterns("/admin/**");' }]).coupled).toBe(false);
    expect(analyzeFrontend([], [security]).coupled).toBe(false);
    expect(analyzeFrontend([js], []).coupled).toBe(false);
  });

  it("ignores commented-out calls and asset files", () => {
    const js = { file: "src/main/resources/static/app.js", text: "/* fetch('/api/tasks/') */ // fetch('/api/x/')\nconst css = '/css/app.css';" };
    expect(analyzeFrontend([js], [security]).trailingSlash).toEqual([]);
  });
});

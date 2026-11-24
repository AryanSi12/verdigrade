import { defaultAiAttempts, engineLabels } from "./engine.js";
import { defaultFixRounds } from "./config.js";
import { itemCoupling, type ItemCoupling } from "./coupling.js";
import { frontendCoupling, type FrontendCoupling } from "./frontend.js";
import { estimateTokens, type TokenEstimate, type TokenRange } from "./estimate.js";
import { isFixed, itemFixer, itemTier, tierCounts, type MigrationPlan, type PlanItem } from "./plan.js";

/** The two engines a plan can recommend. */
export type PlanEngine = "hybrid" | "ai";
export type Confidence = "high" | "medium" | "low";

export type EngineRecommendation = {
  recommendedEngine: PlanEngine;
  label: string;
  confidence: Confidence;
  /** One sentence: what to run and the main reason. */
  headline: string;
  /** 3–5 short bullets, each tied to a number taken from the plan. */
  reasons: string[];
  /** The facts the decision is made from. */
  signals: {
    ecosystem: string;
    sourceFiles: number | null;
    automaticItems: number;
    aiItems: number;
    /** AI items that are judgment code (security setup, JDK internals, reflection…), not a mechanical swap. */
    judgmentItems: number;
    needsYou: number;
    aiFiles: number;
    /** AI items whose files depend on each other (shared contract or base class); 0 when not Java. */
    coupledItems: number;
    coupledFiles: number;
    sharedContracts: string[];
    /** The page inside the app (static HTML / JS) is tied to what the AI items change; 0 files when there is none. */
    frontendFiles: number;
    frontendCalls: number;
    frontendCoupled: boolean;
    frontendPatterns: string[];
    /** Hybrid's token midpoint divided by Full AI's (null when either is unknown). */
    tokenRatio: number | null;
  };
  tokens: { hybrid: TokenRange; ai: TokenRange; cheaper: PlanEngine | "equal"; text: string };
  /** The other engine, for the "Use X instead" link. */
  alternative: { engine: PlanEngine; label: string; text: string };
  /** One card per engine for the plan screen: what it does, who fixes what, pros and cons for this repo. */
  cards: Record<PlanEngine, EngineCard>;
};

export type EngineCard = {
  engine: PlanEngine;
  label: string;
  tagline: string;
  recommended: boolean;
  /** Who fixes what under this engine: the free step, the AI, or only you. */
  fixers: { free: number; ai: number; you: number };
  /** Files the AI edits under this engine. */
  aiFiles: number;
  pros: string[];
  cons: string[];
  /** Only on the recommended card: a direct comparison with the other engine, with numbers. */
  whyBetter: string[];
  /** Only on the other card: when you would pick it instead. */
  whenPick: string;
};

/** AI items whose fix is a design decision rather than a one-line swap. */
const judgmentKinds = new Set(["api.security-config", "api.jdk-internal", "api.security-manager", "reflection", "api.hibernate-type", "api.jackson2"]);
const judgmentPrefixes = ["reflection", "jdk-internal"];

function isJudgment(item: PlanItem): boolean {
  const kind = item.kind ?? item.category;
  return judgmentKinds.has(kind) || judgmentPrefixes.some((prefix) => kind.startsWith(prefix));
}

const mid = (range: TokenRange) => (range.low + range.high) / 2;
const fmt = (value: number) => (value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 10_000 ? `${Math.round(value / 1000)}k` : value.toLocaleString("en-US"));
const range = (value: TokenRange) => `${fmt(value.low)}–${fmt(value.high)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Files the AI would work on, from the plan items' own files. */
function aiFileCount(items: PlanItem[]): number {
  return new Set(items.flatMap((item) => (item.files?.length ? item.files : item.file ? [item.file] : []))).size;
}

export function recommendEngine(plan: MigrationPlan, estimates = estimateTokens(plan)): EngineRecommendation {
  const open = plan.items.filter((item) => item.decision === "approve" && !isFixed(item));
  const automatic = plan.items.filter((item) => itemFixer(item) === "openrewrite" && item.decision === "approve");
  const aiItems = open.filter((item) => itemFixer(item) === "ai");
  const judgment = aiItems.filter(isJudgment);
  const counts = tierCounts(plan);
  const sourceFiles = plan.stats.sourceFiles ?? null;
  const aiFiles = aiFileCount(aiItems);
  const hybrid: TokenEstimate = estimates.hybrid;
  const full: TokenEstimate = estimates.ai;
  const ratio = mid(full) > 0 ? mid(hybrid) / mid(full) : null;
  const noRecipes = plan.ecosystem !== "java";
  const tool = plan.ecosystem === "python" ? "pyupgrade" : plan.ecosystem === "node" ? "the Express codemod" : "OpenRewrite";
  const judgmentShare = aiItems.length ? judgment.length / aiItems.length : 0;
  const coupling = itemCoupling(plan, aiItems);
  const coupled = coupling.items >= 3 && coupling.items / Math.max(1, aiItems.length) >= 0.6;
  const frontend = frontendCoupling(plan, aiItems);

  let engine: PlanEngine;
  let confidence: Confidence;
  let headline: string;
  const reasons: string[] = [];

  if (aiItems.length === 0) {
    engine = "hybrid";
    confidence = "high";
    headline = `Hybrid: ${tool} and the rules cover everything, so no AI call is needed.`;
  } else if (noRecipes && !(aiItems.length <= 1 && ratio !== null && ratio <= 0.4)) {
    engine = "ai";
    confidence = aiItems.length >= 3 ? "high" : "medium";
    headline = `Full AI: ${plan.ecosystem === "python" ? "Python" : "Node"} has no recipe library, so the breaking changes are the AI's work either way.`;
  } else if (frontend.coupled) {
    engine = "ai";
    confidence = frontend.strength === "high" ? "high" : "medium";
    headline = "Full AI: the AI must also update the frontend; Hybrid only edits backend item files.";
  } else if (coupled) {
    engine = "ai";
    confidence = coupling.items >= 4 && coupling.items === aiItems.length ? "high" : "medium";
    headline = `Full AI: ${coupling.items} of the ${aiItems.length} AI items sit in files that depend on each other, so they have to change together.`;
  } else if (ratio !== null && ratio <= 0.4) {
    engine = "hybrid";
    confidence = ratio <= 0.25 ? "high" : "medium";
    headline = `Hybrid: the free tools do most of the work and the AI only handles ${plural(aiItems.length, "item")}.`;
  } else if (judgmentShare >= 0.4 && aiItems.length >= 3) {
    engine = "ai";
    confidence = "medium";
    headline = "Full AI: most of the AI work is judgment code in custom or removed APIs, which a single agent pass handles more consistently.";
  } else {
    engine = "hybrid";
    confidence = "medium";
    headline = `Hybrid: cheaper than Full AI, with ${plural(aiItems.length, "item")} left for the AI.`;
  }
  if (counts.needsYou > 0 && confidence === "high") confidence = "medium";
  if (!plan.stats.sourceFiles && aiItems.length) confidence = "low";

  // ---- the reasons: each cites a number from this plan
  if (frontend.coupled) reasons.push(frontendReason(frontend));
  if (coupled) reasons.push(couplingReason(coupling, aiItems.length));
  if (noRecipes) {
    reasons.push(`${plan.ecosystem === "python" ? "Python" : "Node"} project: the free step is only ${tool} plus version pins, so it changes little of what actually breaks.`);
  } else {
    reasons.push(`${tool} and the rules already cover ${plural(automatic.length, "automatic change")}${plan.stats.javaxFiles ? ` (including javax → jakarta in ${plural(plan.stats.javaxFiles, "file")})` : ""}; ${plural(aiItems.length, "item")} need${aiItems.length === 1 ? "s" : ""} the AI.`);
  }
  if (aiItems.length) {
    const share = sourceFiles ? ` of ${plural(sourceFiles, "source file")}` : "";
    reasons.push(`The AI would work on ${plural(aiFiles, "file")}${share} under Hybrid; Full AI reads about ${plural(full.files, "file")} because nothing is pre-done.`);
  } else {
    reasons.push(`Nothing is left for the AI: all ${plural(automatic.length, "change")} are deterministic${sourceFiles ? ` across ${plural(sourceFiles, "source file")}` : ""}.`);
  }
  if (aiItems.length) {
    if (judgment.length) {
      reasons.push(
        `${judgment.length} of ${aiItems.length} AI ${judgment.length === 1 ? "item is" : "items are"} judgment code (${[...new Set(judgment.map((item) => item.kind ?? item.category))].slice(0, 3).join(", ")}) rather than a one-line swap${engine === "ai" && !noRecipes ? ", so Hybrid saves less than the token numbers suggest" : ""}.`,
      );
    } else if (!noRecipes) {
      reasons.push("Every AI item is a mechanical swap (rename or annotation change), which Hybrid's single focused call handles well.");
    }
  }
  const cheaper: PlanEngine | "equal" = ratio === null ? "equal" : ratio < 0.95 ? "hybrid" : ratio > 1.05 ? "ai" : "equal";
  reasons.push(
    ratio !== null
      ? `Estimated tokens: Hybrid ${range(hybrid)}, Full AI ${range(full)}${cheaper === "hybrid" ? ` (Hybrid is ${ratio <= 0.5 ? `about ${Math.round(1 / Math.max(ratio, 0.001))}×` : `about ${Math.round((1 - ratio) * 100)}%`} cheaper)` : ""}. Estimates, not measurements.`
      : "Token estimates are not available for this project.",
  );
  if (counts.needsYou > 0) reasons.push(`${plural(counts.needsYou, "item")} only you can handle (no engine touches ${counts.needsYou === 1 ? "it" : "them"}); the run still goes ahead without ${counts.needsYou === 1 ? "it" : "them"}.`);

  const trimmed = reasons.slice(0, 5);
  const other: PlanEngine = engine === "hybrid" ? "ai" : "hybrid";
  const diff = mid(other === "ai" ? full : hybrid) - mid(engine === "ai" ? full : hybrid);
  const alternativeText =
    ratio === null
      ? `${engineLabels[other]} instead`
      : diff >= 0
        ? `${engineLabels[other]} would use about ${fmt(Math.abs(diff))} more tokens (${range(other === "ai" ? full : hybrid)} vs ${range(engine === "ai" ? full : hybrid)})`
        : `${engineLabels[other]} would use about ${fmt(Math.abs(diff))} fewer tokens (${range(other === "ai" ? full : hybrid)} vs ${range(engine === "ai" ? full : hybrid)}), but ${engine === "ai" ? (noRecipes ? "its free step covers little of the breaking work here" : "Full AI handles custom code more consistently in one pass") : "Hybrid keeps the deterministic step"}`;

  const cards = buildCards({ plan, engine, ratio, hybrid, full, automatic: automatic.length, aiItems, judgment, aiFiles, needsYou: counts.needsYou, noRecipes, tool, coupling, coupled, frontend });

  return {
    recommendedEngine: engine,
    label: engineLabels[engine],
    confidence,
    headline,
    reasons: trimmed,
    signals: {
      ecosystem: plan.ecosystem,
      sourceFiles,
      automaticItems: automatic.length,
      aiItems: aiItems.length,
      judgmentItems: judgment.length,
      needsYou: counts.needsYou,
      aiFiles,
      coupledItems: coupling.items,
      coupledFiles: coupling.files,
      sharedContracts: coupling.contracts,
      frontendFiles: frontend.files,
      frontendCalls: frontend.calls,
      frontendCoupled: frontend.coupled,
      frontendPatterns: frontend.patterns,
      tokenRatio: ratio === null ? null : Math.round(ratio * 100) / 100,
    },
    tokens: {
      hybrid: { low: hybrid.low, high: hybrid.high },
      ai: { low: full.low, high: full.high },
      cheaper,
      text: ratio === null ? "n/a" : `Hybrid ${range(hybrid)} vs Full AI ${range(full)}`,
    },
    alternative: { engine: other, label: engineLabels[other], text: alternativeText },
    cards,
  };
}

type CardInput = {
  plan: MigrationPlan;
  engine: PlanEngine;
  ratio: number | null;
  hybrid: TokenEstimate;
  full: TokenEstimate;
  automatic: number;
  aiItems: PlanItem[];
  judgment: PlanItem[];
  aiFiles: number;
  needsYou: number;
  noRecipes: boolean;
  tool: string;
  coupling: ItemCoupling;
  coupled: boolean;
  frontend: FrontendCoupling;
};

function frontendReason(frontend: FrontendCoupling): string {
  const what = frontend.patterns.length ? `: ${frontend.patterns.join("; ")}` : "";
  const calls = frontend.calls ? `${plural(frontend.callers, "page file")} ${frontend.callers === 1 ? "calls" : "call"} ${plural(frontend.calls, "API path")} that the AI items' files also cover` : `${plural(frontend.files, "page file")} ship inside the app`;
  return `Frontend coupled: ${calls}${what}. Hybrid's AI only edits the backend item files, so the page's JavaScript stays as it was and the Java tests cannot show whether the page still works; Full AI reads the whole repository, including the page.`;
}

function couplingReason(coupling: ItemCoupling, aiItems: number): string {
  const contracts = coupling.contracts.length ? ` (shared ${coupling.contracts.join(", ")})` : "";
  const ripple = coupling.rippleFiles ? `; ${plural(coupling.rippleFiles, "more file")} extend or implement them` : "";
  return `${coupling.items} of ${aiItems} AI items sit in ${plural(coupling.files, "file")} that depend on each other${contracts}${ripple}. Fixed one at a time they do not compile or pass tests until the others change too.`;
}

/** "12×" when the gap is large, "28%" when it is small. `ratio` is the cheaper one divided by the dearer one (below 1). */
const gap = (ratio: number) => (ratio <= 0.5 ? `${Math.round(1 / Math.max(ratio, 0.001))}×` : `${Math.round((1 - ratio) * 100)}%`);

function buildCards(input: CardInput): Record<PlanEngine, EngineCard> {
  const { plan, engine, ratio, hybrid, full, automatic, aiItems, judgment, aiFiles, needsYou, noRecipes, tool, coupling, coupled, frontend } = input;
  const ai = aiItems.length;
  const language = plan.ecosystem === "python" ? "Python" : plan.ecosystem === "node" ? "Node" : "Java";
  const hybridCheaper = ratio !== null && ratio < 0.95;
  const fullCheaper = ratio !== null && ratio > 1.05;
  const kinds = [...new Set(judgment.map((item) => item.kind ?? item.category))].slice(0, 3).join(", ");

  const hybridPros: string[] = [];
  const hybridCons: string[] = [];
  if (automatic) hybridPros.push(`${tool} and the rules make ${plural(automatic, "change")} for free: deterministic, repeatable, no model.`);
  if (hybridCheaper && ratio !== null) hybridPros.push(`~About ${gap(ratio)} fewer tokens than Full AI (${range(hybrid)} vs ${range(full)}).`);
  if (ai === 0) hybridPros.push("No AI call at all for this project.");
  else if (aiFiles < full.files) hybridPros.push(`~The AI only edits ${plural(aiFiles, "file")} instead of about ${full.files}, so the diff stays small.`);
  if (ai > 0) hybridCons.push(`${plural(ai, "item")} still ${ai === 1 ? "needs" : "need"} the AI, in a second step after the free one.`);
  if (noRecipes) hybridCons.push(`${language} has no recipe library: the free step changes little of what breaks.`);
  if (judgment.length) hybridCons.push(`${judgment.length} of ${ai} AI ${judgment.length === 1 ? "item is" : "items are"} judgment code (${kinds}), which is harder to do in a narrow pass.`);
  const pageCheck = plan.ecosystem === "java" && frontend.files > 0;
  if (pageCheck) hybridCons.unshift("Hybrid runs the page check too (it starts the app and tries the page's API calls) but only reports the problems: its AI edits the backend item files, so it does not loop on them.");
  if (frontend.coupled) hybridCons.unshift("Frontend coupled: Hybrid's AI only edits the backend item files, so the page's JavaScript is left unchanged and the Java tests cannot tell if the page still works.");
  if (coupled) hybridCons.unshift(`${coupling.items} of ${ai} AI items are coupled across files${coupling.contracts.length ? ` (${coupling.contracts.join(", ")})` : ""}; changing them one by one can fail to compile and burn fix-up rounds.`);
  if (fullCheaper) hybridCons.push(`Estimated to use more tokens than Full AI (${range(hybrid)} vs ${range(full)}).`);

  if (!hybridCons.length) hybridCons.push(plan.ecosystem === "java" ? "If OpenRewrite cannot be downloaded, the built-in rules take over and cover less." : "Only the deterministic rules run, so anything they do not know is left for you.");

  const fullPros: string[] = ["One agent does the whole upgrade, so custom code and the standard changes are handled in one consistent pass."];
  const fullCons: string[] = [];
  if (pageCheck) fullPros.unshift("Full AI also verifies the running page and fixes the frontend: after packaging it starts the app, tries the page's API calls and, on a problem, fixes the Java or the JavaScript in a fix-up round and checks again.");
  if (frontend.coupled) fullPros.push(`Reads the whole repository, including the page (${plural(frontend.files, "static file")}), so it can update the frontend together with the Java.`);
  if (coupled) fullPros.push(`Sees all ${plural(coupling.files, "coupled file")}${coupling.rippleFiles ? ` and their ${plural(coupling.rippleFiles, "dependent")}` : ""} at once and changes them consistently.`);
  if (noRecipes) fullPros.push(`Does not depend on recipes, which ${language} lacks.`);
  if (judgment.length) fullPros.push(`Sees ${plural(judgment.length, "judgment item")} (${kinds}) together with the code around ${judgment.length === 1 ? "it" : "them"}.`);
  if (fullCheaper && ratio !== null) fullPros.push(`~About ${gap(1 / ratio)} fewer tokens than Hybrid (${range(full)} vs ${range(hybrid)}).`);
  if (hybridCheaper && ratio !== null) fullCons.push(`About ${ratio <= 0.5 ? `${Math.round(1 / Math.max(ratio, 0.001))}× more` : `${Math.round((1 / Math.max(ratio, 0.001) - 1) * 100)}% more`} tokens than Hybrid (${range(full)} vs ${range(hybrid)}).`);
  if (automatic) fullCons.push(`The AI redoes ${plural(automatic, "change")} that OpenRewrite-style tools make deterministically, and reads about ${plural(full.files, "file")}.`);
  fullCons.push("AI edits are not deterministic; every change needs a review.");

  // The recommended card compares itself with the other engine, with this plan's numbers.
  const whyHybrid: string[] = [];
  const whyFull: string[] = [];
  if (hybridCheaper && ratio !== null) whyHybrid.push(`${gap(ratio)} fewer tokens: ${range(hybrid)} vs ${range(full)}.`);
  if (aiFiles < full.files) whyHybrid.push(ai ? `The AI touches ${plural(aiFiles, "file")} instead of about ${full.files}.` : `The AI touches 0 files instead of about ${full.files}.`);
  if (automatic) whyHybrid.push(`${plural(automatic, "change")} come from ${tool}, which is deterministic; Full AI would redo them with a model.`);
  if (needsYou) whyHybrid.push(`Both engines leave the same ${plural(needsYou, "item")} to you.`);
  if (ratio !== null && ratio > 0.5 && ai) whyHybrid.push("Hybrid is cheaper, but only by a small margin, so check Full AI if you value one consistent pass.");
  if (frontend.coupled) whyFull.push(`The AI must also update the frontend: ${frontend.patterns.length ? frontend.patterns.join("; ") : `${plural(frontend.callers, "page file")} call API paths the items cover`}. Hybrid's AI only edits backend item files.`);
  if (pageCheck && frontend.coupled) whyFull.push("Full AI also verifies the running page and fixes the frontend; Hybrid only reports page problems.");
  if (coupled) whyFull.push(`${coupling.items} of ${ai} AI items are coupled across ${plural(coupling.files, "file")}${coupling.contracts.length ? ` (${coupling.contracts.join(", ")})` : ""}${coupling.rippleFiles ? `, with ${plural(coupling.rippleFiles, "dependent file")}` : ""}; one agent pass changes them together instead of item by item.`);
  if (judgment.length) whyFull.push(`${judgment.length} of ${ai} AI ${judgment.length === 1 ? "item is" : "items are"} judgment code (${kinds}); one agent pass handles ${judgment.length === 1 ? "it" : "them"} with the surrounding code.`);
  if (noRecipes) whyFull.push(`${language} has no recipe library, so Hybrid's free step covers ${plural(automatic, "item")} while the AI has ${plural(ai, "item")}.`);
  if (hybridCheaper && ratio !== null) whyFull.push(`Hybrid is cheaper (${range(hybrid)} vs ${range(full)}, about ${gap(ratio)} fewer tokens). Full AI is recommended for consistency, not for cost.`);
  else if (fullCheaper && ratio !== null) whyFull.push(`${gap(1 / ratio)} fewer tokens: ${range(full)} vs ${range(hybrid)}.`);
  if (aiFiles && full.files) whyFull.push(`Full AI reads about ${plural(full.files, "file")}; Hybrid's AI would edit ${plural(aiFiles, "file")}.`);

  const whenHybrid = (() => {
    if (hybridCheaper && ratio !== null) return `Pick Hybrid if you want the cheapest run (about ${gap(ratio)} fewer tokens) and deterministic edits first.`;
    return "Pick Hybrid if you want deterministic edits first and the AI only for what is left.";
  })();
  const extra = hybridCheaper && ratio !== null ? `, and accept about ${fmt(Math.max(0, mid(full) - mid(hybrid)))} more tokens` : "";
  const whenFull = `Pick Full AI if you'd rather have one agent handle all ${plural(automatic + ai, "change")} in one pass${extra}.`;

  const make = (id: PlanEngine): EngineCard => ({
    engine: id,
    label: engineLabels[id],
    tagline: id === "hybrid" ? `${tool} and the rules first (free), then the AI fixes only what is left.` : "The AI does the whole upgrade in one agent run, with no recipes first.",
    recommended: id === engine,
    fixers: id === "hybrid" ? { free: automatic, ai, you: needsYou } : { free: 0, ai: automatic + ai, you: needsYou },
    aiFiles: id === "hybrid" ? aiFiles : full.files,
    // On the recommended card the token and file-count pros already appear under "Why it's better", so they are dropped there.
    pros: (id === "hybrid" ? hybridPros : fullPros)
      .filter((line) => !(id === engine && line.startsWith("~")))
      .map((line) => line.replace(/^~/, ""))
      .slice(0, 3),
    cons: (id === "hybrid" ? hybridCons : fullCons).slice(0, 2),
    whyBetter: id === engine ? (id === "hybrid" ? whyHybrid : whyFull).slice(0, 4) : [],
    whenPick: id === engine ? "" : id === "hybrid" ? whenHybrid : whenFull,
  });
  return { hybrid: make("hybrid"), ai: make("ai") };
}

// ---------------------------------------------------------------------------------------------

export type StepPreview = { id: string; label: string; detail: string; runs: boolean; engineWork: "free" | "ai" | "check" | "setup" };

export type PlanDetails = {
  engine: PlanEngine;
  from: Array<{ label: string; value: string }>;
  to: Array<{ label: string; value: string }>;
  steps: StepPreview[];
  risk: { level: "low" | "medium" | "high"; summary: string; bullets: string[] };
  needsYou: Array<{ id: string; title: string; file: string | null; why: string }>;
  /** From this machine's own past passed runs of the same ecosystem and engine; null when there are none. */
  expectedTime: { minMs: number; maxMs: number; basedOn: number } | null;
  next: string;
};

const versionLabels: Record<string, string> = {
  java: "Java",
  boot: "Spring Boot",
  node: "Node",
  typescript: "TypeScript",
  express: "Express",
  python: "Python",
  django: "Django",
  flask: "Flask",
};

function versionsOf(source: Record<string, unknown>): Array<{ label: string; value: string }> {
  return Object.entries(versionLabels)
    .map(([key, label]) => ({ label, value: source[key] == null ? "" : String(source[key]) }))
    .filter((entry) => entry.value);
}

export type PastRun = { ecosystem: string; engine: string; status: string; dryRun?: boolean; startedAt: string; finishedAt: string };

/** Min–max wall time of the most recent passed runs with the same ecosystem and engine (no guess when there are none). */
export function expectedTime(runs: PastRun[], ecosystem: string, engine: PlanEngine): PlanDetails["expectedTime"] {
  const times = runs
    .filter((run) => run.ecosystem === ecosystem && run.engine === engine && run.status === "passed")
    .slice(0, 20)
    .map((run) => Date.parse(run.finishedAt) - Date.parse(run.startedAt))
    .filter((ms) => Number.isFinite(ms) && ms > 0);
  if (!times.length) return null;
  return { minMs: Math.min(...times), maxMs: Math.max(...times), basedOn: times.length };
}

const freeWork = (plan: MigrationPlan) => ({ java: "OpenRewrite recipes and the rules packs", node: "the Express codemod and the Node rules", python: "pyupgrade and the Python rules" })[plan.ecosystem as "java" | "node" | "python"] ?? "the deterministic tools";

export function planDetails(plan: MigrationPlan, engine: PlanEngine, history: PastRun[] = []): PlanDetails {
  const counts = tierCounts(plan);
  const tool = freeWork(plan);
  const aiCount = plan.items.filter((item) => itemFixer(item) === "ai" && item.decision === "approve" && !isFixed(item)).length;
  const hybrid = engine === "hybrid";
  const steps: StepPreview[] = [
    { id: "preflight", label: "Check tools and safety net", detail: "JDK / interpreter, build tool and a git safety net. Dry runs work on a temporary copy.", runs: true, engineWork: "setup" },
    { id: "scan", label: "Scan the project", detail: "Reads versions, source files and tests.", runs: true, engineWork: "setup" },
    hybrid
      ? { id: "rewrite", label: "Free upgrade", detail: `Runs ${tool} (${plan.items.filter((item) => itemFixer(item) === "openrewrite").length} planned changes), no tokens.`, runs: true, engineWork: "free" }
      : { id: "rewrite", label: "AI upgrade", detail: "One agent upgrades the project; there is no recipe step in this engine.", runs: true, engineWork: "ai" },
    hybrid
      ? { id: "modernize", label: "Rules and config", detail: "Version pins, properties and the leftover javax names, deterministic.", runs: true, engineWork: "free" }
      : { id: "modernize", label: "Rules and config", detail: "Skipped: the AI agent makes these changes.", runs: false, engineWork: "free" },
    hybrid
      ? { id: "items", label: "AI items", detail: aiCount ? `One bounded AI call changes ${aiCount} plan item${aiCount === 1 ? "" : "s"} labelled AI.` : "No items are labelled AI, so this step is skipped.", runs: aiCount > 0, engineWork: "ai" }
      : { id: "items", label: "AI items", detail: "Covered by the AI upgrade above.", runs: false, engineWork: "ai" },
    { id: "test", label: "Build and tests", detail: `Runs your tests; failures get up to ${hybrid ? defaultFixRounds() : defaultAiAttempts()} AI fix-up rounds.`, runs: true, engineWork: "check" },
    { id: "package", label: "Package", detail: "Builds the artifact to prove it still packages.", runs: true, engineWork: "check" },
    { id: "checks", label: "Final checks", detail: "Target versions reached, no removed APIs left. A failed check gets one more AI fix-up round.", runs: true, engineWork: "check" },
    { id: "report", label: "Report", detail: "Writes the report with what changed and what is left for you.", runs: true, engineWork: "setup" },
  ];

  const needsYou = plan.items
    .filter((item) => itemFixer(item) === "needs-you" && !isFixed(item))
    .map((item) => ({ id: item.id, title: item.title, file: item.file ?? null, why: item.why }));

  const breaks = counts.breaks;
  const riskBullets: string[] = [];
  riskBullets.push(`${plural(counts.breaks, "item")} will break unless changed${counts.breaks ? ` (${plural(counts.byFixer.ai, "item")} for the AI)` : ""}.`);
  if (counts.review) riskBullets.push(`${plural(counts.review, "item")} might break and are worth a look.`);
  if (counts.needsYou) riskBullets.push(`${plural(counts.needsYou, "item")} need${counts.needsYou === 1 ? "s" : ""} you; they are never touched.`);
  const locked = plan.items.filter((item) => item.decision === "lock").length;
  if (locked) riskBullets.push(`${plural(locked, "item")} locked: ${locked === 1 ? "that file stays" : "those files stay"} unchanged.`);
  const level: "low" | "medium" | "high" = breaks === 0 && counts.review <= 1 && counts.needsYou === 0 ? "low" : breaks >= 6 || counts.needsYou >= 3 ? "high" : "medium";
  const summary = level === "low" ? "Low: recipes cover it and nothing known blocks the run." : level === "medium" ? "Medium: a few changes need the AI or you; the run is checked by your tests." : "High: many breaking changes, so expect fix-up rounds.";

  const time = expectedTime(history, plan.ecosystem, engine);
  const next = `After you approve, Verdigrade runs ${hybrid ? "Hybrid" : "Full AI"} on ${plan.source ? "a temporary clone" : "a temporary copy"} ${"(your folder stays unchanged on a dry run)"}, then shows the report with a diff to review.`;

  return {
    engine,
    from: versionsOf(plan.detected),
    to: versionsOf(plan.targets),
    steps,
    risk: { level, summary, bullets: riskBullets },
    needsYou,
    expectedTime: time,
    next,
  };
}

/** Why an item is labelled the way it is, in one line, for the item rows. */
export function fixerReason(item: PlanItem): string {
  const fixer = itemFixer(item);
  const tier = itemTier(item);
  if (fixer === "openrewrite") return "A deterministic recipe or rule changes this; no AI needed.";
  if (fixer === "needs-you") return item.file && !item.file.endsWith("/") ? "Nobody can change this safely for you (secrets, data, infrastructure or test coverage)." : "This is about the whole project or folder, so only you can act on it.";
  if (isJudgment(item)) return "The AI makes this change: it is a design decision, not a one-line swap.";
  return tier === "breaks" ? "No recipe covers this removed API, so the AI rewrites it." : "The AI can tidy this; nothing deterministic covers it.";
}


/**
 * The engine a run starts with: the one the user selected on the plan screen, else the plan's recommendation
 * (falling back to `fallback` when the recommended engine needs an AI login that is not set up).
 */
export function chooseEngine<E extends string>(requested: E | undefined, recommended: E | null, fallback: E, unavailable: (engine: E) => boolean): E {
  if (requested) return requested;
  if (!recommended) return fallback;
  return recommended !== "hybrid" && unavailable(recommended) ? fallback : recommended;
}

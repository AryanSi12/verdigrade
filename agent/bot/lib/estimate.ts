import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { agentRoot, defaultFixRounds, envSetting } from "./config.js";
import { defaultAiAttempts } from "./engine.js";
import { isFixed, itemFixer, lockTargets, type MigrationPlan, type PlanItem } from "./plan.js";

/**
 * Token estimates for the two engines, computed from the project's own files.
 * A transparent heuristic, not a measurement and never a price:
 *   tokens ≈ characters / 4, summed over the files the AI must read, times how
 *   often the model's context is re-sent across its tool turns, plus the fixed
 *   prompt, plus bounded fix-up rounds. A run records the real usage next to it.
 */
export type TokenRange = { low: number; high: number };

export type TokenEstimate = {
  engine: "hybrid" | "ai";
  /** Input + output. */
  low: number;
  high: number;
  /** Input and output separately: an agent re-reads its context every tool turn, so input is ~20× output. */
  input: TokenRange;
  output: TokenRange;
  /** Files the AI has to read (and mostly edit). */
  files: number;
  bytes: number;
  /** Plan items the AI changes (Hybrid: the "AI" items; Full AI: those plus everything OpenRewrite would do). */
  items: number;
  /** Fix-up rounds the engine allows (not in the range: each one adds its own cost, see method). */
  rounds: number;
  /** Tool turns the main AI call is expected to take, low and high. */
  turns: TokenRange;
  /** One line per assumption, for the hover text. */
  method: string[];
};

/**
 * Calibrated on a real run (Hybrid on the library sample, 4 AI items in 4 files of ~11.7 KB): the agent
 * took ~30 tool turns and used 290,611 input / 12,912 output tokens. Input dominates because every turn
 * re-sends the whole conversation: system prompt + tools, the repo it explores, the files it has read.
 */
export const CHARS_PER_TOKEN = 4;
/** Tool schemas and framing the model gets with every call, besides instructions.md. */
const TOOL_OVERHEAD_TOKENS = 1500;
/** Repo exploration per call: project listing plus neighbouring files the agent opens to understand the code. */
const EXPLORE_TOKENS = 6000;
/** Share of the files read (and edits made) that the average turn already carries in its context. */
const CONTEXT_SHARE = 0.5;
/** Tool turns of the main call: a base for exploring and planning, plus per item and per file. */
const HYBRID_TURNS = { base: 10, perItem: 4, perFile: 1 };
const AI_TURNS = { base: 15, perItem: 2, perFile: 1.5 };
/** Low / high scatter around the calibrated turn count and output sizes. */
const SCATTER = [0.7, 1.25] as const;
/** Output: a tool call per turn plus patch text and reasoning per item. */
const OUT_PER_TURN = [120, 200] as const;
const OUT_PER_ITEM = [800, 2500] as const;
/** The failure + log tail a fix-up round gets (capped at 12,000 characters). */
const FAILURE_TOKENS = 3000;
const ROUND_EXPLORE_TOKENS = 3000;
/** Files a fix-up round reads on average. */
const ROUND_FILES = 2;
const ROUND_TURNS = [6, 14] as const;
const ROUND_OUT = [400, 1200] as const;
/** The report narrative call (facts in, a few paragraphs out). */
const NARRATIVE_IN = [4000, 10_000] as const;
const NARRATIVE_OUT = [500, 1200] as const;

function nice(value: number, direction: "down" | "up"): number {
  const step = value < 10_000 ? 100 : value < 100_000 ? 1000 : 5000;
  return (direction === "down" ? Math.floor(value / step) : Math.ceil(value / step)) * step;
}

function fileBytes(repoPath: string, file: string): number {
  try {
    const stat = statSync(path.join(repoPath, file));
    return stat.isFile() ? stat.size : 0;
  } catch {
    return 0;
  }
}

function itemFiles(item: PlanItem): string[] {
  return lockTargets(item).filter((file) => !file.endsWith("/"));
}

function instructionsTokens(): number {
  try {
    return Math.ceil(readFileSync(path.join(agentRoot, "bot", "instructions.md"), "utf8").length / CHARS_PER_TOKEN);
  } catch {
    return 1500;
  }
}

function measure(repoPath: string, items: PlanItem[]): { files: number; bytes: number } {
  const seen = new Set<string>();
  let bytes = 0;
  for (const item of items) {
    for (const file of itemFiles(item)) {
      if (seen.has(file)) continue;
      seen.add(file);
      bytes += fileBytes(repoPath, file);
    }
  }
  return { files: seen.size, bytes };
}

const k = (value: number) => (value >= 10_000 ? `${Math.round(value / 1000)}k` : value.toLocaleString("en-US"));

export function estimateTokens(plan: MigrationPlan, options: { fixRounds?: number; aiAttempts?: number; narrative?: boolean } = {}): { hybrid: TokenEstimate; ai: TokenEstimate } {
  const fixRounds = options.fixRounds ?? defaultFixRounds();
  const aiAttempts = options.aiAttempts ?? defaultAiAttempts();
  const narrative = options.narrative ?? envSetting("NARRATIVE") !== "0";
  const overhead = instructionsTokens() + TOOL_OVERHEAD_TOKENS;
  const open = plan.items.filter((item) => item.decision === "approve" && !isFixed(item));
  const aiItems = open.filter((item) => itemFixer(item) === "ai");
  const everything = open.filter((item) => itemFixer(item) !== "needs-you");
  const nIn: TokenRange = narrative ? { low: NARRATIVE_IN[0], high: NARRATIVE_IN[1] } : { low: 0, high: 0 };
  const nOut: TokenRange = narrative ? { low: NARRATIVE_OUT[0], high: NARRATIVE_OUT[1] } : { low: 0, high: 0 };

  /** One agent call: turns × the context an average turn carries, plus its output. */
  const agentCall = (shape: typeof HYBRID_TURNS, items: number, files: number, readTokens: number, extraContext: number) => {
    const turns = shape.base + shape.perItem * items + shape.perFile * files;
    const context = overhead + EXPLORE_TOKENS + extraContext + CONTEXT_SHARE * readTokens;
    const turnsRange: TokenRange = { low: turns * SCATTER[0], high: turns * SCATTER[1] };
    return {
      turns: turnsRange,
      input: { low: turnsRange.low * context, high: turnsRange.high * context },
      output: { low: turnsRange.low * OUT_PER_TURN[0] + items * OUT_PER_ITEM[0], high: turnsRange.high * OUT_PER_TURN[1] + items * OUT_PER_ITEM[1] },
    };
  };
  /** One build/test (or checks) fix-up round. */
  const round = (avgFileTokens: number) => {
    const context = overhead + FAILURE_TOKENS + ROUND_EXPLORE_TOKENS + CONTEXT_SHARE * ROUND_FILES * avgFileTokens;
    return { input: { low: ROUND_TURNS[0] * context, high: ROUND_TURNS[1] * context }, output: { low: ROUND_TURNS[0] * OUT_PER_TURN[0] + ROUND_OUT[0], high: ROUND_TURNS[1] * OUT_PER_TURN[1] + ROUND_OUT[1] } };
  };
  const finish = (engine: "hybrid" | "ai", call: ReturnType<typeof agentCall> | null, rounds: number, roundCost: ReturnType<typeof round>, m: { files: number; bytes: number }, items: number, allowed: number, method: string[]): TokenEstimate => {
    const input = {
      low: nice((call?.input.low ?? 0) + nIn.low, "down"),
      high: nice((call?.input.high ?? 0) + rounds * roundCost.input.high + nIn.high, "up"),
    };
    const output = {
      low: nice((call?.output.low ?? 0) + nOut.low, "down"),
      high: nice((call?.output.high ?? 0) + rounds * roundCost.output.high + nOut.high, "up"),
    };
    return {
      engine,
      low: input.low + output.low,
      high: input.high + output.high,
      input,
      output,
      files: m.files,
      bytes: m.bytes,
      items,
      rounds: allowed,
      turns: call?.turns ? { low: Math.round(call.turns.low), high: Math.round(call.turns.high) } : { low: 0, high: 0 },
      method,
    };
  };

  const common = [
    `Tokens ≈ characters ÷ ${CHARS_PER_TOKEN} for file text. ${overhead.toLocaleString("en-US")} tokens of instructions and tool definitions go with every call, plus about ${k(EXPLORE_TOKENS)} of repo exploration.`,
    "An agent re-reads its whole context on every tool turn, so input is roughly 20× output: input ≈ turns × average context. Calibrated on a real Hybrid run of the library sample (~30 turns, 291k in / 13k out).",
    narrative ? `The report narrative adds about ${k(nIn.low + nOut.low)}–${k(nIn.high + nOut.high)}.` : "The AI-written report narrative is off.",
    "An estimate, not a measurement; the run shows the real usage next to it. No price is estimated.",
  ];

  // ---- Hybrid: OpenRewrite first; the AI works through the "AI" items, then fixes failures ----
  const h = measure(plan.repoPath, aiItems);
  const hRead = Math.ceil(h.bytes / CHARS_PER_TOKEN);
  const hAvg = h.files ? hRead / h.files : 1500;
  const hCall = aiItems.length ? agentCall(HYBRID_TURNS, aiItems.length, h.files, hRead, aiItems.length * 150) : null;
  const hRound = round(hAvg);
  const hHighRounds = 0;
  const hybrid = finish("hybrid", hCall, hHighRounds, hRound, h, aiItems.length, fixRounds, [
    `Hybrid: OpenRewrite and the rules run first for free. One AI call then works through the ${aiItems.length} "AI" item(s) in ${h.files} file(s) (${h.bytes.toLocaleString("en-US")} bytes ≈ ${k(hRead)} tokens)${hCall ? `: about ${Math.round(hCall.turns.low)}–${Math.round(hCall.turns.high)} tool turns` : ""}.`,
    `Range: a quick call to a slow one, with every build, test and check passing. Each fix-up round (a build, test or check failure) adds about ${k(hRound.input.high + hRound.output.high)} on top (up to ${fixRounds} allowed).`,
    ...(aiItems.length ? [] : ['There are no "AI" items: the AI is only called when the build, tests or checks fail.']),
    ...common,
  ]);

  // ---- Full AI: the AI reads every file that has to change and does all of it ----
  const a = measure(plan.repoPath, everything);
  const aRead = Math.ceil(a.bytes / CHARS_PER_TOKEN);
  const aAvg = a.files ? aRead / a.files : 1500;
  const aCall = agentCall(AI_TURNS, everything.length, a.files, aRead, everything.length * 150 + PROJECT_LISTING_TOKENS);
  const aRound = round(aAvg);
  const aHighRounds = 0;
  const ai = finish("ai", aCall, aHighRounds, aRound, a, everything.length, aiAttempts, [
    `Full AI: no OpenRewrite. The AI reads and edits every file the upgrade changes: ${a.files} file(s), ${a.bytes.toLocaleString("en-US")} bytes ≈ ${k(aRead)} tokens, about ${Math.round(aCall.turns.low)}–${Math.round(aCall.turns.high)} tool turns.`,
    `Range: a quick call to a slow one, with every build, test and check passing. Each fix-up round adds about ${k(aRound.input.high + aRound.output.high)} on top (up to ${aiAttempts} allowed).`,
    ...common,
  ]);
  return { hybrid, ai };
}

/** The whole-project listing a Full AI run reads first. */
const PROJECT_LISTING_TOKENS = 3000;

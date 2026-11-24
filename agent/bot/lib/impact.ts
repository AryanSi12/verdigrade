import { effectStep, riskLevels, type Effect, type Explanation, type Risk } from "./explain.js";
import { createLockSet } from "./locks.js";
import { refactorPicks, refactorRisk, type RefactorRisk } from "./refactor.js";
import { isFixed, itemFixer, lockedPatterns, lockTargets, type Decision, type MigrationPlan, type PlanItem } from "./plan.js";

/**
 * "What if I don't approve?" — a deterministic prediction of the dry run from
 * the plan's decisions and locks. It is a prediction from the explanation
 * catalogue (riskIfSkipped / skipEffect), not a run result.
 *
 * Locks are per file, so an item can also be skipped because ANOTHER item (or a
 * protected path) locks one of its files: locking pom.xml for a dependency
 * rename also blocks the Java and Spring Boot recipes on pom.xml.
 */

export type ItemState =
  /** The tool applies it. */
  | "applied"
  /** An automatic change that won't happen (its files are locked). */
  | "skipped"
  /** Some of its files are locked; the rest still change. */
  | "partial"
  /** Review/manual item the tool doesn't fix; the risk stays whatever you decide. */
  | "open"
  /** Project-wide item marked manual: the step still runs, only a follow-up is added. */
  | "no-effect"
  /** A kept fix removed the risk: no warning, no lock, nothing left to predict. */
  | "fixed";

export type ItemImpact = {
  id: string;
  state: ItemState;
  risk: Risk;
  effect: Effect;
  /** Plain consequence for the current decision. */
  text: string;
  /** Lock patterns that block this item (when another item or a protected path locks its files). */
  blockedBy: string[];
  /** Locked files of a multi-file item. */
  lockedFiles: string[];
  /** Plan items locked as a side effect of THIS item's lock (they share a file). */
  alsoBlocks: string[];
};

export type Outcome = "pass" | "pass-with-risks" | "at-risk" | "fail";

export type Consequence = {
  id: string;
  title: string;
  where: string;
  risk: Risk;
  effect: Effect;
  text: string;
  /** Why it applies: the item's own decision, a lock elsewhere, or a risk the tool can't fix. */
  reason: "locked" | "manual" | "blocked-by-lock" | "not-fixed-automatically";
};

export type ImpactPrediction = {
  label: string;
  outcome: Outcome;
  /** First step predicted to fail (fail / at-risk), else null. */
  failsAt: string | null;
  headline: string;
  summary: string;
  counts: { fixed: number; breaksRun: number; mayBreakRun: number; runtime: number; afterMerge: number; unverified: number; skipped: number; blockedByOtherLocks: number };
  consequences: Consequence[];
  items: Record<string, ItemImpact>;
  /** Refactors picked in the plan's quiz (they run after the upgrade and are reverted if they break it). */
  refactors: { count: number; risk: RefactorRisk | null; counts: Record<RefactorRisk, number>; picks: Array<{ title: string; topic: string; risk: RefactorRisk }>; text: string };
};

export type ImpactOverrides = {
  decisions?: Array<{ id: string; decision?: Decision }>;
  lockedPaths?: Array<{ pattern: string; note?: string }>;
};

const rank = (risk: Risk) => riskLevels.indexOf(risk);
const inRun = (effect: Effect) => Boolean(effectStep[effect]);

function where(item: PlanItem): string {
  if (item.files && item.files.length > 1) {
    const names = item.files.map((file) => file.split("/").pop());
    return `${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3}` : ""}`;
  }
  return item.file ? `${item.file}${item.line ? `:${item.line}` : ""}` : "project-wide";
}

function explanationOf(item: PlanItem): Explanation | null {
  return item.explain ?? null;
}

/** Apply unsaved decisions / paths (the Plan page sends its draft). */
export function withOverrides(plan: MigrationPlan, overrides: ImpactOverrides = {}): MigrationPlan {
  const decisions = new Map((overrides.decisions ?? []).filter((entry) => entry.decision).map((entry) => [entry.id, entry.decision as Decision]));
  return {
    ...plan,
    items: plan.items.map((item) => (decisions.has(item.id) ? { ...item, decision: decisions.get(item.id)! } : item)),
    lockedPaths: overrides.lockedPaths ? overrides.lockedPaths.map((entry) => ({ pattern: entry.pattern, note: entry.note ?? "" })) : plan.lockedPaths,
  };
}

export function predictImpact(source: MigrationPlan, overrides: ImpactOverrides = {}): ImpactPrediction {
  const plan = withOverrides(source, overrides);
  const locks = createLockSet(lockedPatterns(plan));
  const items: Record<string, ItemImpact> = {};
  const consequences: Consequence[] = [];

  // Which items does each item's own lock block (shared files)?
  const ownTargets = new Map(plan.items.map((item) => [item.id, lockTargets(item)]));
  // Who locked a pattern (for "blocked by …" messages).
  const owners = new Map<string, string>();
  for (const item of plan.items) {
    if (item.decision === "approve") continue;
    for (const target of ownTargets.get(item.id) ?? []) if (!owners.has(target)) owners.set(target, `"${item.explain?.plainTitle ?? item.title}" (${item.decision === "manual" ? "marked manual" : "locked"})`);
  }
  for (const entry of plan.lockedPaths) if (!owners.has(entry.pattern)) owners.set(entry.pattern, "a protected path");
  const sharesFile = (a: PlanItem, b: PlanItem) => {
    const lockA = createLockSet(ownTargets.get(a.id) ?? []);
    return (ownTargets.get(b.id) ?? []).some((file) => lockA.isLocked(file)) || (b.file ? lockA.isLocked(b.file) : false);
  };

  for (const item of plan.items) {
    const explain = explanationOf(item);
    const targets = ownTargets.get(item.id) ?? [];
    const lockedFiles = targets.filter((file) => locks.isLocked(file));
    const blockedBy = [...new Set(lockedFiles.map((file) => locks.match(file)).filter((pattern): pattern is string => Boolean(pattern)))];
    const ownChoice = item.decision !== "approve";
    const alsoBlocks =
      ownChoice && targets.length
        ? plan.items.filter((other) => other.id !== item.id && other.group === "auto" && sharesFile(item, other)).map((other) => other.id)
        : [];
    const skipRisk = explain?.riskIfSkipped ?? "medium";
    const skipEffect = explain?.skipEffect ?? "runtime";
    const decisionText = item.decision === "manual" ? explain?.ifManual : explain?.ifLocked;
    let impact: ItemImpact;

    if (item.group !== "auto" && isFixed(item)) {
      items[item.id] = { id: item.id, state: "fixed", risk: "none", effect: "none", text: "Fixed: the kept change removes this risk, so nothing is expected to go wrong here.", blockedBy: [], lockedFiles: [], alsoBlocks: [] };
      continue;
    }
    if (item.group === "auto") {
      const primary = item.file ? locks.isLocked(item.file) : false;
      const skippedFully = targets.length > 0 && (explain?.skipWhen === "primary-file" ? primary : lockedFiles.length > 0);
      if (!targets.length && ownChoice) {
        impact = { id: item.id, state: "no-effect", risk: "none", effect: "none", text: explain?.ifLocked ?? "This step is project-wide; it still runs and a follow-up note is added.", blockedBy: [], lockedFiles: [], alsoBlocks: [] };
      } else if (skippedFully) {
        const viaOther = !ownChoice;
        const text = viaOther
          ? `Not applied because ${lockedFiles.join(", ")} ${lockedFiles.length === 1 ? "is" : "are"} kept unchanged by ${[...new Set(blockedBy.map((pattern) => owners.get(pattern) ?? pattern))].join(", ")}. ${explain?.ifLocked ?? ""}`.trim()
          : (decisionText ?? "The planned change is not applied.");
        impact = { id: item.id, state: "skipped", risk: skipRisk, effect: skipEffect, text, blockedBy: viaOther ? blockedBy : [], lockedFiles, alsoBlocks };
        consequences.push({ id: item.id, title: explain?.plainTitle ?? item.title, where: where(item), risk: skipRisk, effect: skipEffect, text, reason: viaOther ? "blocked-by-lock" : item.decision === "manual" ? "manual" : "locked" });
      } else if (lockedFiles.length) {
        impact = {
          id: item.id,
          state: "partial",
          risk: "low",
          effect: "none",
          text: `Applied, except to ${lockedFiles.join(", ")} (locked). Those files keep their current content.`,
          blockedBy,
          lockedFiles,
          alsoBlocks,
        };
      } else {
        impact = { id: item.id, state: "applied", risk: "none", effect: "none", text: explain?.ifApproved ?? "Applied.", blockedBy: [], lockedFiles: [], alsoBlocks: [] };
      }
    } else {
      // review / manual: the tool never fixes these automatically; the decision only
      // decides whether the AI fix-up may touch the files.
      if (!ownChoice && itemFixer(item) === "ai") {
        // Approved and labelled "AI": the run's AI step changes it and the build/test step checks the result.
        items[item.id] = { id: item.id, state: "open", risk: "none", effect: "none", text: "The AI changes this during the run (Hybrid's AI step, or Full AI); the build and tests check the result.", blockedBy: [], lockedFiles, alsoBlocks };
        continue;
      }
      const risk = ownChoice ? skipRisk : (explain?.riskIfApproved ?? "none");
      const effect = ownChoice ? skipEffect : (explain?.approvedEffect ?? "none");
      const text = ownChoice ? (decisionText ?? "Kept unchanged.") : (explain?.ifApproved ?? "No automatic change.");
      impact = { id: item.id, state: "open", risk, effect, text, blockedBy: [], lockedFiles, alsoBlocks };
      if (rank(risk) >= rank("low") && effect !== "none") {
        consequences.push({ id: item.id, title: explain?.plainTitle ?? item.title, where: where(item), risk, effect, text, reason: ownChoice ? (item.decision === "manual" ? "manual" : "locked") : "not-fixed-automatically" });
      }
    }
    items[item.id] = impact;
  }

  // ---- outcome ---------------------------------------------------------------
  const certain = consequences.filter((entry) => entry.reason !== "not-fixed-automatically" && entry.risk === "blocker" && inRun(entry.effect));
  const possible = consequences.filter((entry) => !certain.includes(entry) && inRun(entry.effect) && rank(entry.risk) >= rank("high"));
  const runtime = consequences.filter((entry) => entry.effect === "runtime" && rank(entry.risk) >= rank("medium"));
  const afterMerge = consequences.filter((entry) => entry.effect === "after-merge" && rank(entry.risk) >= rank("low"));
  const unverified = consequences.filter((entry) => entry.effect === "unverified");
  const firstStep = (list: Consequence[]) =>
    list
      .map((entry) => effectStep[entry.effect]!)
      .sort((a, b) => a.order - b.order)[0]?.step ?? null;

  let outcome: Outcome;
  let failsAt: string | null = null;
  let headline: string;
  if (certain.length) {
    outcome = "fail";
    failsAt = firstStep(certain);
    headline = `Dry run likely FAILS at the ${failsAt} step`;
  } else if (possible.length) {
    outcome = "at-risk";
    failsAt = firstStep(possible);
    headline = `Dry run may fail at the ${failsAt} step`;
  } else if (runtime.length || afterMerge.length) {
    outcome = "pass-with-risks";
    headline = "Dry run likely passes, with follow-ups";
  } else {
    outcome = "pass";
    headline = "Dry run likely passes";
  }
  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const parts: string[] = [];
  const names = (list: Consequence[]) => {
    const titles = [...new Set(list.map((entry) => entry.title))];
    return `${titles.slice(0, 2).join("; ")}${titles.length > 2 ? ` and ${titles.length - 2} more` : ""}`;
  };
  if (certain.length) parts.push(`${plural(certain.length, "item", "items")} will likely break the run (${names(certain)})`);
  if (possible.length) parts.push(`${plural(possible.length, "risk", "risks")} the tool can't fix automatically may break it (the AI fix-up, when available, gets a few tries)`);
  if (runtime.length) parts.push(`${plural(runtime.length, "item changes", "items change")} behaviour at runtime without failing the run (${names(runtime)})`);
  if (afterMerge.length) parts.push(`${plural(afterMerge.length, "follow-up is", "follow-ups are")} needed after merge (CI, images, tooling)`);
  if (unverified.length) parts.push("behaviour is only partly verified by tests");
  const fixedCount = Object.values(items).filter((entry) => entry.state === "fixed").length;
  if (fixedCount && !parts.length) parts.push(`${plural(fixedCount, "risk is", "risks are")} fixed by kept changes`);
  const baseSummary = parts.length ? `With current choices: ${parts.join("; ")}.` : "With current choices every automatic change is applied and nothing known blocks the run.";
  const picks = refactorPicks(source.refactor);
  const refactorSummary = refactorRisk(picks);
  const summary = picks.length ? `${baseSummary} Plus ${refactorSummary.text}` : baseSummary;

  return {
    label: "Prediction from the plan's rules, not a run result.",
    outcome,
    failsAt,
    headline,
    summary,
    counts: {
      fixed: fixedCount,
      breaksRun: certain.length,
      mayBreakRun: possible.length,
      runtime: runtime.length,
      afterMerge: afterMerge.length,
      unverified: unverified.length,
      skipped: Object.values(items).filter((entry) => entry.state === "skipped").length,
      blockedByOtherLocks: consequences.filter((entry) => entry.reason === "blocked-by-lock").length,
    },
    consequences: consequences.sort((a, b) => rank(b.risk) - rank(a.risk)),
    items,
    refactors: { count: picks.length, risk: refactorSummary.risk, counts: refactorSummary.counts, picks: picks.map((pick) => ({ title: pick.title, topic: pick.topic, risk: pick.risk })), text: refactorSummary.text },
  };
}

/** Blocker-level items that the current choices skip (for the approve warning). */
export function lockedBlockers(prediction: ImpactPrediction): Consequence[] {
  return prediction.consequences.filter((entry) => entry.reason !== "not-fixed-automatically" && entry.risk === "blocker");
}

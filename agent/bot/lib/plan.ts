import { sourceForPath } from "./github.js";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as z from "zod/v4";
import { adapterFor } from "./adapters/index.js";
import { findingId } from "./adapters/findings.js";
import type { PlanFinding, PlanStage, TargetRequest } from "./adapters/types.js";
import { dataDir } from "./config.js";
import { explainItem, explanationSchema } from "./explain.js";
import { planFileName } from "./git.js";
import { createLockSet, lockPatternError, normalizeRelative, type LockSet } from "./locks.js";
import { loadRepoConfig } from "./repoConfig.js";
import { refactorPicks, refactorQuizSchema } from "./refactor.js";
import { isInside, safeRealpath } from "./repo.js";
import { ecosystems, type Ecosystem, type PlanAiItem, type PlanFollowUp, type RunPlanInfo } from "./types.js";

/**
 * Plan mode: a read-only analysis of the whole project before any run.
 *
 * Deterministic findings from the language adapter are authoritative. The
 * optional AI review may only add findings marked source "ai", and only after
 * code has checked that the file exists inside the repository, the line is in
 * range and the quoted evidence is really there.
 *
 * A reviewer sets a decision per item (approve / lock / manual), adds locked
 * paths and notes, then approves. Runs require an approved plan by default;
 * "lock" is enforced during the run, "manual" goes to the report's
 * Manual follow-up.
 */

export const planIdPattern = /^plan-[0-9]{8}-[0-9]{6}-[a-f0-9]{6}$/;

const decisionSchema = z.enum(["approve", "lock", "manual"]);
const groupSchema = z.enum(["auto", "review", "manual"]);
const severitySchema = z.enum(["info", "low", "medium", "high"]);
const tierSchema = z.enum(["breaks", "review", "safe"]);
const fixerSchema = z.enum(["openrewrite", "ai", "needs-you"]);
export type Fixer = z.infer<typeof fixerSchema>;

export const planItemSchema = z.object({
  id: z.string().regex(/^(F|AI)-[0-9a-f]{10}$/),
  group: groupSchema,
  category: z.string().min(1).max(60),
  severity: severitySchema,
  title: z.string().min(1).max(300),
  file: z.string().max(500).nullable(),
  line: z.number().int().positive().nullable(),
  why: z.string().max(4000),
  suggestion: z.string().max(4000),
  files: z.array(z.string().max(500)).max(5000).optional(),
  evidence: z.string().max(1000).optional(),
  source: z.enum(["deterministic", "ai"]),
  decision: decisionSchema,
  note: z.string().max(4000).default(""),
  /** AI explanation attached to a deterministic item (never changes its facts). */
  aiComment: z.string().max(2000).optional(),
  /** Explanation catalogue key (profiles/explanations). Absent in plans saved before plan-mode explanations. */
  kind: z.string().max(80).optional(),
  params: z.record(z.string(), z.string().max(2000)).optional(),
  snippets: z
    .array(z.object({ file: z.string().max(500), line: z.number().int().positive().nullable(), before: z.string().max(1000), after: z.string().max(1000).nullable(), note: z.string().max(400).optional() }))
    .max(20)
    .optional(),
  /** Plain-language explanation, rendered deterministically from the catalogue (filled in on load for older plans). */
  explain: explanationSchema.optional(),
  /** "breaks" = will break unless the code changes (locked by default only when it "needs you"); "review" = might break; "safe" = automatic. */
  tier: tierSchema.optional(),
  /** Who fixes this item during a run: OpenRewrite (free), the AI, or only you. See itemFixer. */
  fixer: fixerSchema.optional(),
  /** What you need to change, with before → after code when known. */
  fix: z
    .object({ summary: z.string().max(2000), before: z.string().max(4000).optional(), after: z.string().max(4000).optional(), file: z.string().max(500).optional(), line: z.number().int().positive().optional() })
    .optional(),
  /** The reviewer approved a "will break" item anyway (explicit confirm). */
  acceptedRisk: z.boolean().optional(),
  /** The project's code around file:line (secret-looking values masked). */
  excerpt: z.object({ file: z.string().max(500), startLine: z.number().int().positive(), focusLine: z.number().int().positive(), lines: z.array(z.string().max(400)).max(9) }).optional(),
  /** The latest "Fix with AI" attempt for this item. */
  aiFix: z
    .object({
      fixId: z.string().max(40),
      status: z.enum(["running", "proposed", "kept", "undone", "failed"]),
      resolved: z.boolean().nullable(),
      note: z.string().max(2000).default(""),
      /** The decision before the AI fix unlocked the item (restored on undo). */
      previousDecision: decisionSchema.optional(),
    })
    .optional(),
});

export const aiFixRecordSchema = z.object({
  fixId: z.string().regex(/^fix-[a-f0-9]{10}$/),
  itemId: z.string().max(40),
  title: z.string().max(300),
  status: z.enum(["running", "proposed", "kept", "undone", "failed"]),
  stage: z.string().max(80).default(""),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  summary: z.string().max(4000).default(""),
  error: z.string().max(2000).nullable(),
  /** One diff per changed file (unified format). */
  files: z.array(z.object({ file: z.string().max(500), diff: z.string().max(40_000) })).max(20).default([]),
  refused: z.array(z.string().max(500)).max(50).default([]),
  resolved: z.boolean().nullable(),
  recheckNote: z.string().max(2000).default(""),
  sessionId: z.string().nullable().default(null),
  /** Optional build/test check on the fix workspace. */
  verify: z.object({ status: z.enum(["running", "passed", "failed"]), summary: z.string().max(4000) }).nullable().optional(),
});

export type AiFixRecord = z.infer<typeof aiFixRecordSchema>;

export const lockedPathSchema = z.object({
  pattern: z.string().min(1).max(300),
  note: z.string().max(2000).default(""),
});

export const migrationPlanSchema = z.object({
  $comment: z.string().optional(),
  schemaVersion: z.literal(1),
  // "java-migrator" plans (saved before the rename from java-migrator) still load.
  tool: z.enum(["leapfrog", "java-migrator"]),
  planId: z.string().regex(planIdPattern),
  ecosystem: z.enum(ecosystems as [Ecosystem, ...Ecosystem[]]),
  repoPath: z.string().min(1),
  repoName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: z.enum(["draft", "approved"]),
  approvedAt: z.string().nullable(),
  routeId: z.string(),
  description: z.string(),
  targets: z.record(z.string(), z.string()),
  targetLabel: z.string(),
  request: z.object({ targets: z.record(z.string(), z.string()), from: z.record(z.string(), z.string()) }),
  detected: z.record(z.string(), z.unknown()),
  stats: z.record(z.string(), z.number()),
  notes: z.array(z.string()),
  preview: z.boolean(),
  items: z.array(planItemSchema),
  lockedPaths: z.array(lockedPathSchema).max(500),
  reviewerNote: z.string().max(8000).default(""),
  /** GitHub source of the project (absent for local folders). Never holds a token. */
  source: z
    .object({
      type: z.literal("github"),
      url: z.string(),
      owner: z.string(),
      repo: z.string(),
      branch: z.string().nullable(),
      commit: z.string().nullable(),
      clonedAt: z.string(),
      localPath: z.string(),
      clonePath: z.string().optional(),
      subdir: z.string().nullable().optional(),
      autoDetected: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  ai: z.object({
    status: z.enum(["pending", "running", "done", "failed", "skipped"]),
    summary: z.string().max(8000),
    error: z.string().nullable(),
    added: z.number().int().min(0),
    dropped: z.number().int().min(0),
    droppedReasons: z.array(z.string()).default([]),
    sessionId: z.string().nullable(),
    /** When the AI review started / ended (for the "Planning… AI review" banner and timings). */
    startedAt: z.string().nullable().optional(),
    finishedAt: z.string().nullable().optional(),
  }),
  /** "Will break" items that a re-check no longer finds (fixed by hand). */
  resolved: z.array(z.object({ id: z.string().max(40), title: z.string().max(300), file: z.string().max(500).nullable(), line: z.number().int().positive().nullable(), at: z.string() })).max(500).optional(),
  checkedAt: z.string().nullable().optional(),
  /** "Fix with AI" attempts (edits live in a separate fix workspace, never in the user's folder). */
  aiFixes: z.array(aiFixRecordSchema).max(500).optional(),
  /** Optional refactor quiz; picks run after the upgrade. */
  refactor: refactorQuizSchema.optional(),
});

export type PlanItem = z.infer<typeof planItemSchema>;
export type MigrationPlan = z.infer<typeof migrationPlanSchema>;
export type Decision = z.infer<typeof decisionSchema>;

export class PlanError extends Error {}

function now(): string {
  return new Date().toISOString();
}

function newPlanId(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `plan-${stamp}-${randomBytes(3).toString("hex")}`;
}

function compact(record: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).filter((entry): entry is [string, string] => Boolean(entry[1])));
}

function defaultDecision(finding: PlanFinding): Decision {
  if (finding.defaultDecision) return finding.defaultDecision;
  return finding.group === "manual" ? "manual" : "approve";
}

function toItem(finding: PlanFinding, source: "deterministic" | "ai"): PlanItem {
  const { defaultDecision: _default, ...rest } = finding;
  return {
    ...rest,
    snippets: finding.snippets?.slice(0, 20).map((snippet) => ({ ...snippet, before: snippet.before.slice(0, 1000), after: snippet.after?.slice(0, 1000) ?? null })),
    file: finding.file ? normalizeRelative(finding.file) : null,
    line: finding.line && finding.line > 0 ? finding.line : null,
    evidence: finding.evidence?.slice(0, 1000),
    source,
    decision: defaultDecision(finding),
    note: "",
  };
}

export type GeneratePlanInput = {
  repoPath: string;
  ecosystem?: string | null;
  request: TargetRequest;
  preview?: boolean;
  /** Will an AI review follow? (sets ai.status pending vs skipped) */
  ai?: boolean;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  onStage?: (stage: PlanStage) => void;
};

/** Deterministic plan for a repository. Read-only. */
export async function generatePlan(input: GeneratePlanInput): Promise<MigrationPlan> {
  const repoPath = safeRealpath(input.repoPath);
  const adapter = adapterFor(repoPath, input.ecosystem);
  const repoConfig = loadRepoConfig(repoPath);
  const request: TargetRequest = { targets: compact(input.request.targets), from: compact(input.request.from) };
  if (adapter.id === "java") {
    request.targets.java ||= repoConfig.targetJava ?? "";
    request.targets.boot ||= repoConfig.targetBoot ?? "";
  }
  input.onStage?.("reading");
  const result = await adapter.plan({ repoPath, request, repoConfig, preview: Boolean(input.preview), signal: input.signal, env: input.env, onStage: input.onStage });
  input.onStage?.("writing");
  const seen = new Set<string>();
  const items: PlanItem[] = [];
  for (const finding of result.findings) {
    if (seen.has(finding.id)) continue;
    seen.add(finding.id);
    items.push(toItem(finding, "deterministic"));
  }
  const created = now();
  const plan: MigrationPlan = {
    $comment: "Verdigrade migration plan. Edit decisions (approve | lock | manual), notes and lockedPaths, then approve it (CLI: verdigrade approve, or the web Plan page).",
    schemaVersion: 1,
    tool: "leapfrog",
    planId: newPlanId(),
    ecosystem: adapter.id,
    repoPath,
    repoName: path.basename(repoPath),
    createdAt: created,
    updatedAt: created,
    status: "draft",
    approvedAt: null,
    routeId: result.routeId,
    description: result.description,
    targets: result.targets,
    targetLabel: result.targetLabel,
    request: { targets: compact(request.targets), from: compact(request.from) },
    detected: result.detected,
    stats: result.stats,
    notes: result.notes,
    preview: Boolean(input.preview),
    items,
    lockedPaths: [],
    reviewerNote: "",
    source: sourceForPath(repoPath),
    ai: { status: input.ai ? "pending" : "skipped", summary: "", error: null, added: 0, dropped: 0, droppedReasons: [], sessionId: null, startedAt: input.ai ? new Date().toISOString() : null, finishedAt: null },
  };
  return migrationPlanSchema.parse(applyTierDefaults(withExcerpts(withExplanations(plan, true), repoPath)));
}

const breakingEffects = new Set(["fails-build", "fails-tests", "fails-install", "fails-preflight"]);

/** breaks / review / safe for one item (explicit adapter tier, else from the catalogue's "if approved" effect). */
export function itemTier(item: Pick<PlanItem, "group" | "tier" | "explain">): "breaks" | "review" | "safe" {
  if (item.tier) return item.tier;
  if (item.group === "auto") return "safe";
  if (item.explain && breakingEffects.has(item.explain.approvedEffect)) return "breaks";
  return "review";
}

/** Finding kinds nobody can safely change for you: secrets, data, infrastructure, test coverage. */
const needsYouKinds = new Set(["secrets.file", "secrets.example", "inline-secret", "db-migration", "native-code.dir", "container", "ci", "tests.none", "tests.few"]);

/**
 * Who fixes an item during a run:
 *  - "openrewrite": the free, deterministic step (recipes, rules, codemods) changes it.
 *  - "ai": a code change the AI can make (Hybrid's AI step, or Full AI).
 *  - "needs-you": no engine can do it safely: a secret or credential, project-wide or
 *    whole-folder findings, infrastructure, or anything the scanner marks manual-only.
 * Only "needs-you" items are locked by default and block approval.
 */
export function itemFixer(item: Pick<PlanItem, "group" | "tier" | "explain" | "kind" | "category" | "file">): Fixer {
  if (item.group === "auto" || itemTier(item) === "safe") return "openrewrite";
  if (item.group === "manual") return "needs-you";
  if (needsYouKinds.has(item.kind ?? item.category)) return "needs-you";
  if (!item.file || item.file.endsWith("/")) return "needs-you";
  return "ai";
}

/**
 * Fill tiers and fixer labels. Only items nobody can safely fix ("needs-you")
 * that will break are locked by default (manual when project-wide); items the
 * run fixes (OpenRewrite or AI) are approved, whatever the scanner's own default
 * was. Only for freshly generated items.
 */
export function applyTierDefaults(plan: MigrationPlan, only?: Set<string>): MigrationPlan {
  return {
    ...plan,
    items: plan.items.map((item) => {
      const tier = itemTier(item);
      const fixer = itemFixer(item);
      if (only && !only.has(item.id)) return { ...item, tier, fixer };
      const fix = item.fix ?? (item.suggestion ? { summary: item.suggestion } : undefined);
      if (tier !== "breaks") return { ...item, tier, fixer, fix };
      // A scanner default of lock/manual on a code change the AI can make is no longer a lock: the run fixes it.
      if (fixer === "ai") return { ...item, tier, fixer, fix, decision: "approve" };
      if (item.decision !== "approve" || fixer !== "needs-you") return { ...item, tier, fixer, fix };
      return { ...item, tier, fixer, fix, decision: lockTargets(item).length ? "lock" : "manual" };
    }),
  };
}

const secretKinds = /secret|credential|password/i;
const secretValue = /((?:password|passwd|pwd|secret|token|api[-_.]?key|private[-_.]?key|access[-_.]?key|credentials?)[\w.\-\[\]"']*\s*[:=]\s*)(\S.*)$/i;

/** Mask anything that looks like a credential value on one line. */
export function maskSecretLine(line: string): string {
  // An environment placeholder like ${DB_PASSWORD} is not a secret: keep it readable.
  return line.replace(secretValue, (all, key: string, value: string) => (/^["']?\$\{[^}]*\}["']?\s*$/.test(value) ? all : `${key}***`));
}

/** Attach ±2 lines of the project's code around each item's file:line. */
export function withExcerpts(plan: MigrationPlan, repoPath: string): MigrationPlan {
  const cache = new Map<string, string[] | null>();
  const read = (file: string) => {
    if (!cache.has(file)) {
      try {
        const full = path.join(repoPath, file);
        cache.set(file, statSync(full).size > 2_000_000 ? null : readFileSync(full, "utf8").split(/\r?\n/));
      } catch {
        cache.set(file, null);
      }
    }
    return cache.get(file) ?? null;
  };
  return {
    ...plan,
    items: plan.items.map((item) => {
      if (!item.file || !item.line || item.group === "auto" || item.file.endsWith("/")) return { ...item, excerpt: undefined };
      const lines = read(item.file);
      if (!lines || item.line > lines.length) return { ...item, excerpt: undefined };
      const masked = secretKinds.test(item.category) || secretKinds.test(item.kind ?? "");
      const start = Math.max(1, item.line - 2);
      const end = Math.min(lines.length, item.line + 2);
      return {
        ...item,
        excerpt: {
          file: item.file,
          startLine: start,
          focusLine: item.line,
          lines: lines.slice(start - 1, end).map((text) => {
            const safe = maskSecretLine(text).slice(0, 400);
            return masked ? safe.replace(/([:=]\s*)\S.*$/, "$1***") : safe;
          }),
        },
      };
    }),
  };
}

/**
 * Has a kept fix (AI, or "move to an env variable") removed this item's risk?
 * A fixed item shows no warning and no lock, and the impact preview and counts
 * leave it out. If the reviewer later locks it or marks it manual again, the
 * item counts as open again.
 */
export function isFixed(item: Pick<PlanItem, "aiFix" | "decision">): boolean {
  return item.aiFix?.status === "kept" && item.aiFix.resolved === true && item.decision === "approve";
}

/** Is this "will break" item settled (the run fixes it, a kept fix removed it, or the reviewer accepted the risk)? */
export function breakSettled(item: PlanItem): boolean {
  // The run fixes it (OpenRewrite or AI): nothing for the reviewer to settle.
  if (itemFixer(item) !== "needs-you") return true;
  if (item.aiFix?.status === "kept" && item.aiFix.resolved) return true;
  return item.decision === "approve" && Boolean(item.acceptedRisk);
}

/** Tier counts and how many "will break" items still need a change before running. */
export function tierCounts(plan: MigrationPlan) {
  const tiers = plan.items.map((item) => ({ item, tier: itemTier(item) }));
  const breaks = tiers.filter((entry) => entry.tier === "breaks");
  const open = (tier: string) => tiers.filter((entry) => entry.tier === tier && !isFixed(entry.item)).length;
  return {
    // Open counts: an item fixed by a kept fix no longer counts as breaking.
    breaks: open("breaks"),
    review: open("review"),
    safe: tiers.filter((entry) => entry.tier === "safe").length,
    // Items only the reviewer can handle ("Needs you") that are still unsettled.
    mustFix: breaks.filter((entry) => !breakSettled(entry.item)).length,
    needsYou: tiers.filter((entry) => entry.tier !== "safe" && itemFixer(entry.item) === "needs-you" && !isFixed(entry.item)).length,
    byFixer: {
      openrewrite: tiers.filter((entry) => itemFixer(entry.item) === "openrewrite").length,
      ai: tiers.filter((entry) => itemFixer(entry.item) === "ai" && !isFixed(entry.item)).length,
      needsYou: tiers.filter((entry) => itemFixer(entry.item) === "needs-you" && !isFixed(entry.item)).length,
    },
    fixedByAi: tiers.filter((entry) => entry.tier !== "safe" && isFixed(entry.item)).length,
    resolved: plan.resolved?.length ?? 0,
  };
}

/**
 * Attach the plain-language explanation to every item (all of them with
 * `refresh`, otherwise only items without one, e.g. plans saved by an older
 * version). Deterministic; never touches decisions or facts.
 */
export function withExplanations(plan: MigrationPlan, refresh = false): MigrationPlan {
  if (!refresh && plan.items.every((item) => item.explain && item.tier && item.fixer)) return plan;
  return {
    ...plan,
    items: plan.items.map((item) => {
      const next = item.explain && !refresh ? item : { ...item, explain: explainItem(plan, item) };
      const tiered = next.tier ? next : { ...next, tier: itemTier(next) };
      return { ...tiered, fixer: itemFixer(tiered) };
    }),
  };
}

// ---- decisions -----------------------------------------------------------------

export const planUpdateSchema = z.object({
  decisions: z
    .array(
      z.object({
        id: z.string().max(40),
        decision: decisionSchema.optional(),
        note: z.string().max(4000).optional(),
        /** Required to approve a "will break" item: the reviewer confirms they accept the risk. */
        acceptRisk: z.boolean().optional(),
      }),
    )
    .max(5000)
    .default([]),
  lockedPaths: z.array(lockedPathSchema).max(500).optional(),
  reviewerNote: z.string().max(8000).optional(),
});

export type PlanUpdate = z.infer<typeof planUpdateSchema>;

/** Apply reviewer edits. Changing an approved plan sends it back to draft. */
export function updatePlan(plan: MigrationPlan, update: PlanUpdate): MigrationPlan {
  const next: MigrationPlan = structuredClone(plan);
  const byId = new Map(next.items.map((item) => [item.id, item]));
  let changed = false;
  for (const change of update.decisions) {
    const item = byId.get(change.id);
    if (!item) throw new PlanError(`Unknown plan item ${change.id}.`);
    if (change.decision && change.decision !== item.decision) {
      if (change.decision === "lock" && !lockTargets(item).length) {
        throw new PlanError(`${item.id} (${item.title}) is project-wide; it can be marked manual but not locked.`);
      }
      const aiFixed = item.aiFix?.resolved && (item.aiFix.status === "kept" || item.aiFix.status === "proposed");
      if (change.decision === "approve" && itemTier(item) === "breaks" && itemFixer(item) === "needs-you" && !aiFixed) {
        if (!change.acceptRisk) {
          throw new PlanError(`"${item.title}" needs you: no engine can change it safely. Change the code and re-check, fix it with AI, or confirm that you accept the risk.`);
        }
        item.acceptedRisk = true;
      }
      if (change.decision !== "approve") item.acceptedRisk = undefined;
      item.decision = change.decision;
      changed = true;
    }
    if (change.note !== undefined && change.note !== item.note) {
      item.note = change.note;
      changed = true;
    }
  }
  if (update.lockedPaths) {
    const seen = new Set<string>();
    const cleaned = [];
    for (const entry of update.lockedPaths) {
      const pattern = normalizeRelative(entry.pattern.trim());
      const problem = lockPatternError(pattern);
      if (problem) throw new PlanError(`Locked path "${entry.pattern}": ${problem}`);
      if (seen.has(pattern)) continue;
      seen.add(pattern);
      cleaned.push({ pattern, note: entry.note ?? "" });
    }
    if (JSON.stringify(cleaned) !== JSON.stringify(next.lockedPaths)) changed = true;
    next.lockedPaths = cleaned;
  }
  if (update.reviewerNote !== undefined && update.reviewerNote !== next.reviewerNote) {
    next.reviewerNote = update.reviewerNote;
    changed = true;
  }
  if (changed) {
    next.updatedAt = now();
    if (next.status === "approved") {
      next.status = "draft";
      next.approvedAt = null;
    }
  }
  return migrationPlanSchema.parse(next);
}

export function approvePlan(plan: MigrationPlan, options: { skipAiReview?: boolean } = {}): MigrationPlan {
  const reviewing = plan.ai.status === "running" || plan.ai.status === "pending";
  if (reviewing && !options.skipAiReview) throw new PlanError("Wait for the AI review to finish, or approve with skipAiReview to go ahead without it.");
  if (plan.aiFixes?.some((fix) => fix.status === "running")) throw new PlanError("Wait for the AI fix to finish before approving.");
  const proposed = plan.items.filter((item) => item.aiFix?.status === "proposed");
  if (proposed.length) throw new PlanError(`Keep or undo the AI fix first: ${proposed.map((item) => item.title).slice(0, 3).join("; ")}.`);
  const unsafe = plan.items.filter((item) => itemTier(item) === "breaks" && item.decision === "approve" && !breakSettled(item));
  if (unsafe.length) {
    throw new PlanError(`These will break and are approved without accepting the risk: ${unsafe.map((item) => item.title).slice(0, 3).join("; ")}. Lock them, fix them, or confirm the risk.`);
  }
  const next = structuredClone(plan);
  if (reviewing) {
    // Approved before the optional AI review finished: it is skipped, and a late result is ignored.
    next.ai = { ...next.ai, status: "skipped", summary: "Skipped: you approved the plan before the AI review finished.", error: null, finishedAt: now() };
  }
  next.status = "approved";
  next.approvedAt = now();
  next.updatedAt = next.approvedAt;
  return migrationPlanSchema.parse(next);
}

/** Paths a "lock" decision on this item locks. */
export function lockTargets(item: Pick<PlanItem, "file" | "files">): string[] {
  // A directory finding protects the entire directory, not just the first 50 sampled files.
  if (item.file?.endsWith("/")) return [item.file];
  if (item.files?.length) return item.files;
  return item.file ? [item.file] : [];
}

/** Every pattern the run must keep unchanged (locked items + reviewer-added paths). */
export function lockedPatterns(plan: MigrationPlan): string[] {
  const patterns = new Set<string>();
  for (const item of plan.items) {
    if (item.decision === "lock" || item.decision === "manual") for (const target of lockTargets(item)) patterns.add(normalizeRelative(target));
  }
  for (const entry of plan.lockedPaths) patterns.add(entry.pattern);
  return [...patterns].filter((pattern) => !lockPatternError(pattern));
}

export function planLocks(plan: MigrationPlan): LockSet {
  return createLockSet(lockedPatterns(plan));
}

export function planFollowUps(plan: MigrationPlan): PlanFollowUp[] {
  const items: PlanFollowUp[] = plan.items
    .filter((item) => item.decision !== "approve")
    .map((item) => ({
      id: item.id,
      title: item.title,
      file: item.file,
      line: item.line,
      group: item.group,
      decision: item.decision,
      note: item.note,
      suggestion: item.suggestion,
      ...(item.explain
        ? {
            plainTitle: item.explain.plainTitle,
            consequence: item.decision === "manual" ? item.explain.ifManual : item.explain.ifLocked,
            riskIfSkipped: item.explain.riskIfSkipped,
            manualSteps: item.explain.manualSteps,
            effort: item.explain.effort,
          }
        : {}),
    }));
  for (const entry of plan.lockedPaths) {
    items.push({
      id: `path:${entry.pattern}`,
      title: `Locked by the reviewer: ${entry.pattern}`,
      file: entry.pattern,
      line: null,
      group: "manual",
      decision: "lock",
      note: entry.note,
      suggestion: "Migrate this path by hand.",
    });
  }
  if (plan.reviewerNote.trim()) {
    items.push({ id: "plan-note", title: "Reviewer note", file: null, line: null, group: "manual", decision: "manual", note: plan.reviewerNote.trim(), suggestion: "" });
  }
  return items;
}

/** Approved items the AI has to change: labelled "AI", not already fixed by a kept fix. */
export function aiPlanItems(plan: MigrationPlan): PlanAiItem[] {
  return plan.items
    .filter((item) => item.decision === "approve" && itemFixer(item) === "ai" && !isFixed(item))
    .map((item) => ({
      id: item.id,
      title: item.title,
      file: item.file,
      line: item.line,
      why: item.why.slice(0, 500),
      suggestion: (item.fix?.summary ?? item.suggestion).slice(0, 500),
      tier: itemTier(item) === "breaks" ? "breaks" : "review",
    }));
}

export function runPlanInfo(plan: MigrationPlan, source: RunPlanInfo["source"]): RunPlanInfo {
  const kept = (plan.aiFixes ?? []).filter((fix) => fix.status === "kept");
  const aiItems = aiPlanItems(plan);
  const refactors = refactorPicks(plan.refactor);
  return {
    planId: plan.planId,
    approvedAt: plan.approvedAt,
    lockedPaths: lockedPatterns(plan),
    followUps: planFollowUps(plan),
    source,
    ...(aiItems.length ? { aiItems } : {}),
    ...(kept.length ? { aiPreFixes: kept.map((fix) => ({ fixId: fix.fixId, itemId: fix.itemId, title: fix.title, summary: fix.summary.slice(0, 600), files: fix.files.map((entry) => entry.file) })) } : {}),
    ...(refactors.length ? { refactors } : {}),
  };
}

/** Why this plan cannot gate a run of `repoPath` (null = it can). */
export function planProblem(plan: MigrationPlan, repoPath: string, ecosystem?: Ecosystem): string | null {
  if (plan.status !== "approved") return `Plan ${plan.planId} is not approved yet. Review it and approve it first.`;
  const a = safeRealpath(plan.repoPath);
  const b = safeRealpath(repoPath);
  const same = process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
  if (!same) return `Plan ${plan.planId} is for ${plan.repoPath}, not ${repoPath}.`;
  if (ecosystem && plan.ecosystem !== ecosystem) return `Plan ${plan.planId} is a ${plan.ecosystem} plan.`;
  return null;
}

/** Group counts for UIs and the CLI. */
export function planSummary(plan: MigrationPlan) {
  const count = (group: PlanItem["group"]) => plan.items.filter((item) => item.group === group).length;
  return {
    planId: plan.planId,
    status: plan.status,
    ecosystem: plan.ecosystem,
    repoPath: plan.repoPath,
    repoName: plan.repoName,
    routeId: plan.routeId,
    targetLabel: plan.targetLabel,
    createdAt: plan.createdAt,
    approvedAt: plan.approvedAt,
    auto: count("auto"),
    review: count("review"),
    manual: count("manual"),
    locked: lockedPatterns(plan).length,
    tiers: tierCounts(plan),
    ai: plan.ai.status,
    source: plan.source ?? null,
  };
}

// ---- storage -----------------------------------------------------------------------

function plansDir(): string {
  return path.join(dataDir(), "plans");
}

export function savePlan(plan: MigrationPlan): MigrationPlan {
  const valid = migrationPlanSchema.parse(plan);
  mkdirSync(plansDir(), { recursive: true });
  const file = path.join(plansDir(), `${valid.planId}.json`);
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(valid, null, 2)}\n`, "utf8");
  renameSync(temp, file);
  return valid;
}

export function loadPlan(planId: string): MigrationPlan | null {
  if (!planIdPattern.test(planId)) return null;
  const file = path.join(plansDir(), `${planId}.json`);
  if (!existsSync(file)) return null;
  return parsePlanText(readFileSync(file, "utf8"), file);
}

export function listPlans(limit = 50): ReturnType<typeof planSummary>[] {
  if (!existsSync(plansDir())) return [];
  return readdirSync(plansDir())
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(plansDir(), name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .slice(0, limit)
    .flatMap((file) => {
      try {
        return [planSummary(parsePlanText(readFileSync(file, "utf8"), file))];
      } catch {
        return [];
      }
    });
}

export function parsePlanText(text: string, source = planFileName): MigrationPlan {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new PlanError(`${source} is not valid JSON: ${(error as Error).message}`);
  }
  const parsed = migrationPlanSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PlanError(`${source} is invalid: ${parsed.error.issues.slice(0, 8).map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")}`);
  }
  return withExplanations(parsed.data);
}

/** migration-plan.json at the project root (excluded from the clean-tree check and never committed). */
export function planFilePath(repoPath: string): string {
  return path.join(repoPath, planFileName);
}

export function writePlanFile(repoPath: string, plan: MigrationPlan): string {
  const file = planFilePath(repoPath);
  writeFileSync(file, `${JSON.stringify(migrationPlanSchema.parse(plan), null, 2)}\n`, "utf8");
  return file;
}

export function readPlanFile(repoPath: string): MigrationPlan | null {
  const file = planFilePath(repoPath);
  if (!existsSync(file)) return null;
  return parsePlanText(readFileSync(file, "utf8"), file);
}

// ---- AI review (grounded) ----------------------------------------------------------

export const aiFindingSchema = z.object({
  group: z.enum(["review", "manual"]).catch("review"),
  category: z.string().min(1).max(60).catch("ai-risk"),
  severity: severitySchema.catch("medium"),
  title: z.string().min(1).max(300),
  file: z.string().min(1).max(500),
  line: z.number().int().positive(),
  evidence: z.string().min(3).max(1000),
  why: z.string().max(4000).default(""),
  suggestion: z.string().max(4000).default(""),
});

export const aiReviewSchema = z.object({
  summary: z.string().max(8000).default(""),
  comments: z.array(z.object({ id: z.string().max(40), comment: z.string().max(2000) })).max(500).default([]),
  findings: z.array(z.unknown()).max(100).default([]),
});

export type AiReview = z.infer<typeof aiReviewSchema>;

/** Pull the JSON object out of a model reply (bare, or inside a ```json fence). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*\n([\s\S]*?)\n```/.exec(text);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (!candidate.trim()) throw new PlanError("The AI review did not contain JSON.");
  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new PlanError(`The AI review JSON could not be parsed: ${(error as Error).message}`);
  }
}

function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Check one AI finding against the repository. Returns the reason it is
 * dropped, or null when file, line and evidence all check out.
 */
export function verifyAiFinding(repoPath: string, finding: { file: string; line: number; evidence: string }): string | null {
  const relative = normalizeRelative(finding.file.replace(/^\.\//, ""));
  if (!relative || path.isAbsolute(finding.file) || relative.split("/").includes("..")) return `${finding.file}: not a repository-relative path`;
  const full = path.join(repoPath, relative);
  if (!existsSync(full) || !statSync(full).isFile()) return `${relative}: file does not exist`;
  if (!isInside(safeRealpath(repoPath), safeRealpath(full))) return `${relative}: outside the repository`;
  if (statSync(full).size > 2_000_000) return `${relative}: file too large to verify`;
  const lines = readFileSync(full, "utf8").split(/\r?\n/);
  if (finding.line < 1 || finding.line > lines.length) return `${relative}:${finding.line}: line out of range (file has ${lines.length})`;
  const evidence = squash(finding.evidence);
  if (evidence.length < 3) return `${relative}:${finding.line}: evidence too short`;
  const window = squash(lines.slice(Math.max(0, finding.line - 3), finding.line + 2).join(" "));
  if (!window.includes(evidence)) return `${relative}:${finding.line}: quoted evidence is not within two lines of that line`;
  return null;
}

/**
 * Merge a parsed AI review into the plan. Deterministic items are never
 * changed except for an attached aiComment. New findings are kept only when
 * verified, deduplicated against existing items, and marked source "ai".
 */
export function mergeAiReview(plan: MigrationPlan, review: AiReview, repoPath = plan.repoPath): MigrationPlan {
  const next = structuredClone(plan);
  const byId = new Map(next.items.map((item) => [item.id, item]));
  for (const comment of review.comments) {
    const item = byId.get(comment.id);
    if (item && comment.comment.trim()) item.aiComment = comment.comment.trim().slice(0, 2000);
  }
  const dropped: string[] = [];
  let added = 0;
  const taken = new Set(next.items.map((item) => `${item.file}:${item.line}:${item.category}`));
  for (const raw of review.findings) {
    const parsed = aiFindingSchema.safeParse(raw);
    if (!parsed.success) {
      dropped.push(`malformed finding (${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message})`);
      continue;
    }
    const finding = parsed.data;
    const problem = verifyAiFinding(repoPath, finding);
    if (problem) {
      dropped.push(problem);
      continue;
    }
    const file = normalizeRelative(finding.file.replace(/^\.\//, ""));
    const key = `${file}:${finding.line}:${finding.category}`;
    if (taken.has(key)) {
      dropped.push(`${file}:${finding.line}: duplicates an existing item`);
      continue;
    }
    taken.add(key);
    const id = `AI-${findingId(finding.category, file, finding.line, finding.title).slice(2)}`;
    if (byId.has(id)) continue;
    const item: PlanItem = {
      id,
      group: finding.group,
      category: finding.category,
      severity: finding.severity,
      title: finding.title,
      file,
      line: finding.line,
      why: finding.why,
      suggestion: finding.suggestion,
      evidence: finding.evidence,
      source: "ai",
      decision: finding.group === "manual" ? "manual" : "approve",
      note: "",
    };
    item.explain = explainItem(next, item);
    next.items.push(item);
    byId.set(id, item);
    added += 1;
  }
  next.ai = {
    ...next.ai,
    status: "done",
    summary: review.summary.slice(0, 8000),
    error: null,
    added,
    dropped: dropped.length,
    droppedReasons: dropped.slice(0, 50),
    finishedAt: now(),
  };
  next.updatedAt = now();
  return migrationPlanSchema.parse(next);
}

/** The prompt for the PLAN-REVIEW session (see instructions.md). */
export function planReviewPrompt(plan: MigrationPlan): string {
  const items = plan.items.map((item) => ({
    id: item.id,
    group: item.group,
    category: item.category,
    severity: item.severity,
    title: item.title,
    file: item.file,
    line: item.line,
    why: item.why.slice(0, 400),
  }));
  return [
    `PLAN-REVIEW ${plan.planId}.`,
    `Repository: ${plan.repoPath}`,
    `Ecosystem: ${plan.ecosystem}. Route ${plan.routeId}: ${plan.targetLabel}.`,
    "The deterministic findings below are authoritative. Read the project with read_project_file / scan_project (read-only; write tools are refused in plan review).",
    "Reply with ONE JSON object and nothing else:",
    '{"summary": "3-6 plain sentences on the main risks", "comments": [{"id": "<existing item id>", "comment": "why it matters / what to check"}], "findings": [{"group": "review|manual", "category": "short-kebab", "severity": "low|medium|high", "title": "...", "file": "relative/path", "line": 12, "evidence": "exact text copied from that line", "why": "...", "suggestion": "..."}]}',
    "Only add findings you saw in a file you read; evidence must be copied verbatim from that line. Unverifiable findings are dropped by code. Do not repeat existing items.",
    "Be quick: the user is waiting. Read at most 8 files, starting with the files of the high-severity and review findings below, and do not walk the whole project file by file. Reply within about 2 minutes, even if you checked less.",
    "```json",
    JSON.stringify({ detected: plan.detected, stats: plan.stats, notes: plan.notes, items }).slice(0, 60_000),
    "```",
  ].join("\n");
}

// ---- re-check -------------------------------------------------------------------------

/** Same finding across scans even when its line moved. */
export function findingKey(item: Pick<PlanItem, "kind" | "category" | "file" | "params" | "files">): string {
  // A project-wide aggregate (e.g. "Jackson 2 code in 13 files") is one finding whatever file comes first.
  const aggregate = Boolean(item.files?.length && item.file && !item.file.endsWith("/"));
  return [item.kind ?? item.category, aggregate ? "*files*" : (item.file ?? ""), item.params?.api ?? ""].join("|");
}

/**
 * Re-scan the project (deterministic findings only) and merge: decisions,
 * notes, accepted risks and AI fixes carry over by id (or by kind + file when
 * the line moved). "Will break" items the scan no longer finds go to
 * `resolved` ("Fixed"). New items get the usual defaults. The plan goes back to draft.
 * `scanPath` is where to scan (the AI fix workspace when one exists).
 */
export async function recheckPlan(plan: MigrationPlan, scanPath?: string): Promise<MigrationPlan> {
  const fresh = await generatePlan({ repoPath: scanPath ?? plan.repoPath, ecosystem: plan.ecosystem, request: { targets: plan.request.targets, from: plan.request.from }, preview: false, ai: false });
  return mergeRecheck(plan, fresh);
}

export function mergeRecheck(plan: MigrationPlan, fresh: MigrationPlan): MigrationPlan {
  const oldById = new Map(plan.items.map((item) => [item.id, item]));
  const oldByKey = new Map(plan.items.map((item) => [findingKey(item), item]));
  const used = new Set<string>();
  const items: PlanItem[] = [];
  for (const item of fresh.items) {
    const previous = oldById.get(item.id) ?? oldByKey.get(findingKey(item));
    if (previous && !used.has(previous.id)) {
      used.add(previous.id);
      items.push({ ...item, decision: previous.decision, note: previous.note, acceptedRisk: previous.acceptedRisk, aiFix: previous.aiFix, aiComment: previous.aiComment });
    } else items.push(item);
  }
  // AI-added items are not re-detected by the scan; keep them as they were.
  for (const item of plan.items) if (item.source === "ai" && !used.has(item.id)) items.push(item);
  const at = now();
  const resolved = [...(plan.resolved ?? [])];
  for (const item of plan.items) {
    if (item.source !== "deterministic" || used.has(item.id) || itemTier(item) !== "breaks") continue;
    if (!resolved.some((entry) => entry.id === item.id)) resolved.push({ id: item.id, title: item.title, file: item.file, line: item.line, at });
  }
  const next: MigrationPlan = {
    ...plan,
    items,
    stats: fresh.stats,
    notes: fresh.notes,
    detected: fresh.detected,
    resolved,
    checkedAt: at,
    updatedAt: at,
    status: "draft",
    approvedAt: null,
  };
  return migrationPlanSchema.parse(next);
}

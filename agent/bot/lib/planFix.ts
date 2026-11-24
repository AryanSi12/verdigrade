import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as z from "zod/v4";
import { dataDir, envSetting } from "./config.js";
import { createLockSet, normalizeRelative } from "./locks.js";
import { applyTextPatch, isAllowedRelative, looksSecret, repoEcosystem } from "./patch.js";
import { planFileName } from "./git.js";
import {
  extractJson,
  findingKey,
  generatePlan,
  itemTier,
  loadPlan,
  lockTargets,
  maskSecretLine,
  PlanError,
  savePlan,
  type AiFixRecord,
  type MigrationPlan,
  type PlanItem,
} from "./plan.js";

/**
 * "Fix with AI" in plan mode.
 *
 * The model never edits the user's folder. Each attempt rebuilds a private fix
 * workspace (data/plan-fixes/<planId>/work/<project>) from the project, re-applies
 * the fixes already proposed or kept, and asks the model (read-only session) for
 * exact text edits as JSON. Code applies them, only to the finding's own files,
 * never to paths the reviewer locked or files other items lock, never to
 * secrets-looking files. Then the finding is re-scanned on the workspace.
 * Kept fixes are applied to the run's work folder before the migration starts.
 */

export const maxEditsPerFix = 20;

/** Edits allowed for one fix: 20, or 3 per file for multi-file findings (at most 50). */
export function editLimit(item: PlanItem): number {
  return Math.min(50, Math.max(maxEditsPerFix, fixScope(item).length * 3));
}

export type AiStatus = { configured: boolean; source: string | null; envVar: string; message: string };

/** Is a model credential available (never reads the key itself, only checks it exists)? */
export function aiStatus(env: NodeJS.ProcessEnv = process.env): AiStatus {
  const envVar = "CURSOR_API_KEY";
  const has = (name: string) => Boolean(env[name] && env[name]!.trim());
  let source: string | null = null;
  if (has("CURSOR_API_KEY")) source = "CURSOR_API_KEY";
  else if (has("CURSOR_API_KEY_FILE") && existsSync(env.CURSOR_API_KEY_FILE!)) source = "CURSOR_API_KEY_FILE";
  else if (has("CURSOR_SERVICE_ACCOUNT_KEY")) source = "CURSOR_SERVICE_ACCOUNT_KEY";
  else {
    const configDir = env.AGENT_SERVE_CONFIG_DIR?.trim() || path.join(env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), ".config"), "agent-serve");
    if (existsSync(path.join(configDir, "credentials.json"))) source = "agent-sdk login";
  }
  if (envSetting("PLAN_FIX_AI") === "0") return { configured: false, source, envVar, message: "Fix with AI is turned off (VERDIGRADE_PLAN_FIX_AI=0)." };
  return {
    configured: Boolean(source),
    source,
    envVar,
    message: source
      ? `AI is set up (${source}).`
      : `AI isn't set up on this computer. Set the ${envVar} environment variable (or run "npx agent-sdk login" in the agent folder), then restart Verdigrade.`,
  };
}

/** Turn an SDK auth failure into the same plain message. */
export function plainAiError(message: string): string {
  if (/api key|unauthenticated|unauthori[sz]ed|401|credential|not logged in|login/i.test(message)) {
    return 'AI couldn\'t sign in. Set the CURSOR_API_KEY environment variable (or run "npx agent-sdk login" in the agent folder), then restart Verdigrade.';
  }
  return message;
}

// ---- workspace ------------------------------------------------------------------------

export function fixRoot(planId: string): string {
  return path.join(dataDir(), "plan-fixes", planId);
}

/** The fix workspace: one per fix (so fixes on different files can run at the same time). */
export function fixWorkPath(plan: MigrationPlan, fixId?: string): string {
  return path.join(fixRoot(plan.planId), fixId ? `work-${fixId}` : "work", path.basename(plan.repoPath) || "project");
}

type FileChange = { file: string; before: string; after: string };
type FixContent = { fixId: string; itemId: string; changes: FileChange[] };

function contentPath(planId: string, fixId: string): string {
  return path.join(fixRoot(planId), `${fixId}.json`);
}

export function loadFixContent(planId: string, fixId: string): FixContent | null {
  const file = contentPath(planId, fixId);
  if (!/^fix-[a-f0-9]{10}$/.test(fixId) || !existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as FixContent;
}

const skipNames = new Set([".git", "node_modules", "target", ".gradle", ".idea", ".venv", "venv", "__pycache__", "dist", "coverage", ".tox", ".mypy_cache", ".pytest_cache"]);

/** Fresh copy of the project plus every fix already proposed or kept (in order). */
export function prepareWorkspace(plan: MigrationPlan, fixId?: string): string {
  const work = fixWorkPath(plan, fixId);
  rmSync(path.dirname(work), { recursive: true, force: true });
  mkdirSync(path.dirname(work), { recursive: true });
  const repo = plan.repoPath;
  cpSync(repo, work, {
    recursive: true,
    filter: (source) => {
      if (source === repo) return true;
      const name = path.basename(source);
      if (skipNames.has(name)) return false;
      if (name === planFileName && path.dirname(source) === repo) return false;
      if (name === "build" && !path.relative(repo, source).split(path.sep).includes("src")) return false;
      return true;
    },
  });
  for (const fix of plan.aiFixes ?? []) {
    if (fix.status !== "kept" && fix.status !== "proposed") continue;
    const content = loadFixContent(plan.planId, fix.fixId);
    if (content) applyChanges(work, content.changes);
  }
  return work;
}

/**
 * Write each change when the file still holds its "before" text. With `merge`,
 * a file that changed since (e.g. the recipe renamed imports) gets a 3-way merge
 * (git merge-file); where both changed the same lines the AI fix wins.
 */
export function applyChanges(root: string, changes: FileChange[], options: { merge?: boolean } = {}): { applied: string[]; skipped: string[] } {
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const change of changes) {
    const full = path.join(root, change.file);
    const current = existsSync(full) ? readFileSync(full, "utf8") : null;
    if (current === change.after) applied.push(change.file);
    else if (current === change.before) {
      writeFileSync(full, change.after, "utf8");
      applied.push(change.file);
    } else if (options.merge && current !== null) {
      const merged = mergeThreeWay(current, change.before, change.after);
      if (merged === null) skipped.push(change.file);
      else {
        writeFileSync(full, merged, "utf8");
        applied.push(change.file);
      }
    } else skipped.push(change.file);
  }
  return { applied, skipped };
}

/** git merge-file: current ← (base → other), conflicts resolved toward `other`. Null when git is missing or fails. */
export function mergeThreeWay(current: string, base: string, other: string): string | null {
  const dir = mkdtempSync(path.join(os.tmpdir(), "leapfrog-merge-"));
  try {
    const files = ["current", "base", "other"].map((name) => path.join(dir, name));
    writeFileSync(files[0], current, "utf8");
    writeFileSync(files[1], base, "utf8");
    writeFileSync(files[2], other, "utf8");
    const result = spawnSync("git", ["merge-file", "-p", "--theirs", ...files], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
    if (result.error || result.status === null || result.status < 0 || result.status > 127) return null;
    return result.stdout;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---- scope ----------------------------------------------------------------------------

/** Files the AI may edit for this item: the finding's own files. */
export function fixScope(item: PlanItem): string[] {
  const files = new Set<string>();
  for (const target of [...lockTargets(item), item.file, item.fix?.file, ...(item.snippets ?? []).map((snippet) => snippet.file)]) {
    if (target) files.add(normalizeRelative(target));
  }
  return [...files];
}

function inScope(scope: string[], file: string): boolean {
  return scope.some((entry) => (entry.endsWith("/") ? file.startsWith(entry) : entry === file));
}

/**
 * Why the AI may not touch `file` for this item, or null. Paths the reviewer
 * locked, and files that another item locks on purpose (not a "will break"
 * default lock), are refused.
 */
export function blockedReason(plan: MigrationPlan, item: PlanItem, file: string, ecosystem = repoEcosystem(plan.repoPath)): string | null {
  const relative = normalizeRelative(file);
  if (!relative || relative.split("/").includes("..") || path.isAbsolute(file) || path.win32.isAbsolute(file)) return `${file}: not a project-relative path`;
  if (!inScope(fixScope(item), relative)) return `${relative}: outside this finding (allowed: ${fixScope(item).join(", ")})`;
  const reviewer = createLockSet(plan.lockedPaths.map((entry) => entry.pattern)).match(relative);
  if (reviewer) return `${relative}: you locked it (${reviewer})`;
  for (const other of plan.items) {
    if (other.id === item.id || (other.decision !== "lock" && other.decision !== "manual") || itemTier(other) === "breaks") continue;
    if (createLockSet(lockTargets(other)).isLocked(relative)) return `${relative}: locked by "${other.title}"`;
  }
  if (!isAllowedRelative(relative, ecosystem)) return `${relative}: not an editable source or build file`;
  return null;
}

export const fixReplySchema = z.object({
  summary: z.string().max(4000).default(""),
  edits: z.array(z.object({ file: z.string().min(1).max(500), oldText: z.string().min(1).max(20_000), newText: z.string().max(20_000) })).max(50).default([]),
});

export type FixReply = z.infer<typeof fixReplySchema>;

/** Apply the model's edits to the workspace (scope- and lock-checked). The user's folder is never touched. */
export function applyFixEdits(plan: MigrationPlan, item: PlanItem, work: string, reply: FixReply): { changes: FileChange[]; refused: string[] } {
  const ecosystem = repoEcosystem(work);
  const refused: string[] = [];
  const before = new Map<string, string>();
  const limit = editLimit(item);
  for (const edit of reply.edits.slice(0, limit)) {
    const file = normalizeRelative(edit.file.replace(/^\.\//, ""));
    const blocked = blockedReason(plan, item, file, ecosystem);
    if (blocked) {
      refused.push(blocked);
      continue;
    }
    const full = path.join(work, file);
    if (!existsSync(full)) {
      refused.push(`${file}: file does not exist`);
      continue;
    }
    const text = readFileSync(full, "utf8");
    if (looksSecret(file, text)) {
      refused.push(`${file}: looks like a secrets file`);
      continue;
    }
    if (!before.has(file)) before.set(file, text);
    // Windows checkouts use CRLF; the model writes "\n". Match the file's line endings.
    const crlf = text.includes("\r\n");
    const oldText = crlf ? edit.oldText.replace(/\r?\n/g, "\r\n") : edit.oldText;
    const newText = crlf ? edit.newText.replace(/\r?\n/g, "\r\n") : edit.newText;
    const result = applyTextPatch(work, file, oldText, newText);
    if (!result.ok) refused.push(`${file}: ${result.error}`);
  }
  if (reply.edits.length > limit) refused.push(`Only the first ${limit} edits were considered.`);
  // All or nothing: a half-applied fix is worse than none.
  if (refused.length) {
    for (const [file, text] of before) writeFileSync(path.join(work, file), text, "utf8");
    return { changes: [], refused };
  }
  const changes: FileChange[] = [];
  for (const [file, text] of before) {
    const after = readFileSync(path.join(work, file), "utf8");
    if (after !== text) changes.push({ file, before: text, after });
  }
  return { changes, refused };
}

// ---- secrets --------------------------------------------------------------------------

const secretAssignment = /^(\s*)([\w.\-\[\]]+)(\s*[:=]\s*)(.*?)(\s*)$/;

/** ENV_NAME for a config key: spring.data.redis.password → SPRING_DATA_REDIS_PASSWORD. */
export function envNameFor(key: string): string {
  return key.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").toUpperCase() || "SECRET";
}

/**
 * Replace the credential on the finding's line with an environment placeholder
 * (key=${ENV_NAME}), on the fix workspace only. Same scope and lock rules as AI
 * edits. The value itself is never returned, logged or sent anywhere.
 */
export function applySecretFix(plan: MigrationPlan, item: PlanItem, work: string): { changes: FileChange[]; refused: string[]; summary: string } {
  const file = normalizeRelative(item.file ?? "");
  const fail = (reason: string) => ({ changes: [], refused: [reason], summary: "" });
  const blocked = blockedReason(plan, item, file);
  if (blocked) return fail(blocked);
  const full = path.join(work, file);
  if (!existsSync(full) || !item.line) return fail(`${file}: file or line not found`);
  const before = readFileSync(full, "utf8");
  const lines = before.split("\n");
  const index = item.line - 1;
  const raw = lines[index];
  if (raw === undefined) return fail(`${file}:${item.line}: line not found`);
  const cr = raw.endsWith("\r") ? "\r" : "";
  const match = secretAssignment.exec(cr ? raw.slice(0, -1) : raw);
  if (!match || !match[4]) return fail(`${file}:${item.line}: no key = value on this line`);
  const [, indent, key, sep, value] = match;
  if (/^["']?\$\{[^}]*\}["']?$/.test(value)) return fail(`${file}:${item.line}: already reads ${key} from an environment variable`);
  const env = envNameFor(key);
  lines[index] = `${indent}${key}${sep}\${${env}}${cr}`;
  const after = lines.join("\n");
  writeFileSync(full, after, "utf8");
  return {
    changes: [{ file, before, after }],
    refused: [],
    summary: `Replaced the value of ${key} with \${${env}}, so it is read from the ${env} environment variable. Set ${env} where the app runs (your machine, CI and server) before starting it. The old value was not shown or sent to the AI.`,
  };
}

// ---- diff -----------------------------------------------------------------------------

/** Small unified diff (LCS over lines, 3 lines of context). */
export function unifiedDiff(file: string, before: string, after: string): string {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const ops: Array<[" " | "-" | "+", string]> = [];
  if (midA.length * midB.length <= 4_000_000) {
    const dp: number[][] = Array.from({ length: midA.length + 1 }, () => new Array<number>(midB.length + 1).fill(0));
    for (let i = midA.length - 1; i >= 0; i -= 1) for (let j = midB.length - 1; j >= 0; j -= 1) dp[i][j] = midA[i] === midB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0;
    let j = 0;
    while (i < midA.length || j < midB.length) {
      if (i < midA.length && j < midB.length && midA[i] === midB[j]) {
        ops.push([" ", midA[i]]);
        i += 1;
        j += 1;
      } else if (i < midA.length && (j >= midB.length || dp[i + 1][j] >= dp[i][j + 1])) ops.push(["-", midA[i++]]);
      else ops.push(["+", midB[j++]]);
    }
  } else {
    for (const line of midA) ops.push(["-", line]);
    for (const line of midB) ops.push(["+", line]);
  }
  // Full op list with line numbers, then hunks with 3 lines of context.
  type Op = { op: " " | "-" | "+"; text: string; a: number; b: number };
  const all: Op[] = [];
  for (let k = 0; k < start; k += 1) all.push({ op: " ", text: a[k], a: k + 1, b: k + 1 });
  let lineA = start;
  let lineB = start;
  for (const [op, text] of ops) {
    if (op === " ") all.push({ op, text, a: ++lineA, b: ++lineB });
    else if (op === "-") all.push({ op, text, a: ++lineA, b: lineB });
    else all.push({ op, text, a: lineA, b: ++lineB });
  }
  for (let k = endA; k < a.length; k += 1) all.push({ op: " ", text: a[k], a: ++lineA, b: ++lineB });
  const context = 3;
  const changed = all.map((entry, index) => (entry.op === " " ? -1 : index)).filter((index) => index >= 0);
  const out = [`--- a/${file}`, `+++ b/${file}`];
  let index = 0;
  while (index < changed.length) {
    let from = Math.max(0, changed[index] - context);
    let to = Math.min(all.length - 1, changed[index] + context);
    while (index + 1 < changed.length && changed[index + 1] - context <= to + 1) {
      index += 1;
      to = Math.min(all.length - 1, changed[index] + context);
    }
    index += 1;
    const slice = all.slice(from, to + 1);
    const startA = slice.find((entry) => entry.op !== "+")?.a ?? slice[0].a;
    const startB = slice.find((entry) => entry.op !== "-")?.b ?? slice[0].b;
    out.push(`@@ -${startA},${slice.filter((entry) => entry.op !== "+").length} +${startB},${slice.filter((entry) => entry.op !== "-").length} @@`);
    for (const entry of slice) out.push(maskSecretLine(`${entry.op}${entry.text}`));
    from = to;
  }
  return out.join("\n").slice(0, 40_000);
}

// ---- prompt ---------------------------------------------------------------------------

export function planFixPrompt(plan: MigrationPlan, item: PlanItem, work: string): string {
  const scope = fixScope(item);
  return [
    `PLAN-FIX ${plan.planId} item ${item.id}.`,
    `Work folder (a private copy; the user's project is not touched): ${work}`,
    `Ecosystem: ${plan.ecosystem}. Route ${plan.routeId}: ${plan.targetLabel}.`,
    "The migration has NOT run yet. Your edits are merged in right after the upgrade tools (recipes / codemods) run, then the project is built and tested on the target versions.",
    "Write code for the TARGET versions that fixes exactly this finding and nothing else.",
    "Where your edit and the upgrade tool change the same lines, your version wins, so keep the lines you touch fully on the target versions (for example, if you edit Jackson imports, move every Jackson import in that block to tools.jackson.*).",
    `You may only change these files: ${scope.join(", ")}. Edits to any other file are refused by code.`,
    "Read them with read_project_file (repoPath = the work folder). Write tools are not available; reply with edits instead.",
    "Finding:",
    "```json",
    JSON.stringify({
      title: item.title,
      tier: itemTier(item),
      file: item.file,
      line: item.line,
      why: item.why.slice(0, 1500),
      suggestion: item.suggestion.slice(0, 1500),
      fix: item.fix,
      snippets: item.snippets?.slice(0, 10),
      evidence: item.evidence,
    }),
    "```",
    "Reply with ONE JSON object and nothing else:",
    '{"summary": "1-3 plain sentences: what you changed and why", "edits": [{"file": "relative/path", "oldText": "exact unique text from the file (include enough lines to be unique)", "newText": "replacement"}]}',
    "oldText must be copied character for character from read_project_file output (same indentation). If any edit does not match, none of them are applied.",
    `At most ${editLimit(item)} edits. Keep imports consistent. Never write secret values. If it cannot be fixed safely, reply with an empty edits list and say why in summary.`,
  ].join("\n");
}

// ---- jobs -----------------------------------------------------------------------------

export type AskModel = (prompt: string, info: { planId: string; fixId: string; title: string }) => Promise<{ text: string; sessionId?: string | null }>;

function now(): string {
  return new Date().toISOString();
}

function mutate(planId: string, change: (plan: MigrationPlan) => void): MigrationPlan {
  const plan = loadPlan(planId);
  if (!plan) throw new PlanError(`Plan ${planId} was not found.`);
  change(plan);
  plan.updatedAt = now();
  return savePlan(plan);
}

function setRecord(plan: MigrationPlan, fixId: string, change: (record: AiFixRecord) => void): void {
  const record = plan.aiFixes?.find((entry) => entry.fixId === fixId);
  if (record) change(record);
}

/**
 * Why "Fix with AI" can't help with this item (plain words), or null when it can.
 * Covers will-break and might-break items; safe/automatic ones need nothing.
 */
export function aiFixability(plan: MigrationPlan, item: PlanItem): string | null {
  if (item.group === "auto" || itemTier(item) === "safe") return "Nothing to fix: the migration changes this automatically.";
  const kind = item.kind ?? item.category;
  if (kind === "secrets.file" || kind === "secrets.example") return "This file holds credentials. Verdigrade never lets the AI read or edit it; keep it locked and update it by hand.";
  if (!item.file) {
    if (/^tests\./.test(kind) || item.category === "tests") return "There's no code to change here: this is about how many tests the project has. Add a few tests yourself before migrating, so the run can prove nothing broke.";
    return "This is about the whole project, not a line of code, so there's nothing for the AI to edit. Read the suggestion and decide.";
  }
  if (item.file.endsWith("/")) return `This covers a whole folder (${item.file}). Change it by hand, or lock the folder.`;
  const ecosystem = repoEcosystem(plan.repoPath);
  const editable = fixScope(item).filter((file) => !file.endsWith("/") && isAllowedRelative(file, ecosystem));
  if (!editable.length) return `The AI only edits source and build files; ${item.file} is neither. Change it by hand.`;
  return null;
}

/** Secret values are fixed by code (value → \${ENV} placeholder); the model never sees them. */
export function isSecretFix(item: PlanItem): boolean {
  return (item.kind ?? item.category) === "inline-secret";
}

export type FixScope = "high" | "risky" | "all";

/**
 * Items "Fix all … with AI" picks: "high" = will break or high severity (the
 * original button), "risky" = might break, "all" = both. Never items that can't
 * be fixed by editing code, or that already have a running / proposed / kept fix.
 */
export function fixableItems(plan: MigrationPlan, scope: FixScope = "high"): PlanItem[] {
  return plan.items.filter((item) => {
    if (aiFixability(plan, item) !== null) return false;
    if (item.aiFix && ["running", "proposed", "kept"].includes(item.aiFix.status)) return false;
    const tier = itemTier(item);
    const high = tier === "breaks" || item.severity === "high";
    return scope === "high" ? high : scope === "risky" ? tier === "review" && !high : high || tier === "review";
  });
}

/**
 * Run fixes with up to `limit` at a time. A fix whose files overlap a running
 * one waits for it, so it starts from (and builds on) the earlier fix.
 */
export async function runFixesConcurrently(planId: string, fixIds: string[], ask: AskModel, limit = 3): Promise<void> {
  const plan = loadPlan(planId);
  const scopeOf = (fixId: string): string[] => {
    const record = plan?.aiFixes?.find((entry) => entry.fixId === fixId);
    const item = plan?.items.find((entry) => entry.id === record?.itemId);
    return item ? fixScope(item) : [];
  };
  const overlaps = (a: string[], b: string[]) => a.some((x) => b.some((y) => x === y || (x.endsWith("/") && y.startsWith(x)) || (y.endsWith("/") && x.startsWith(y))));
  const waiting = [...fixIds];
  const running = new Map<string, Promise<void>>();
  while (waiting.length || running.size) {
    const busy = [...running.keys()].map(scopeOf);
    const index = running.size < limit ? waiting.findIndex((fixId, position) => !busy.some((scope) => overlaps(scope, scopeOf(fixId))) && !waiting.slice(0, position).some((earlier) => overlaps(scopeOf(earlier), scopeOf(fixId)))) : -1;
    if (index >= 0) {
      const [fixId] = waiting.splice(index, 1);
      running.set(
        fixId,
        runPlanFix(planId, fixId, ask).then(
          () => void running.delete(fixId),
          () => void running.delete(fixId),
        ),
      );
      continue;
    }
    if (!running.size) {
      // Should not happen (an empty pool always takes the first waiting fix), but never spin.
      const fixId = waiting.shift()!;
      await runPlanFix(planId, fixId, ask).catch(() => undefined);
      continue;
    }
    await Promise.race(running.values());
  }
}

/** Register a running fix (sync, so the UI sees it at once). Returns the fixId. */
export function startPlanFix(planId: string, itemId: string): { fixId: string; plan: MigrationPlan } {
  const fixId = `fix-${randomBytes(5).toString("hex")}`;
  const plan = mutate(planId, (draft) => {
    const item = draft.items.find((entry) => entry.id === itemId);
    if (!item) throw new PlanError(`Unknown plan item ${itemId}.`);
    const why = aiFixability(draft, item);
    if (why) throw new PlanError(why);
    if (draft.aiFixes?.some((entry) => entry.itemId === itemId && entry.status === "running")) throw new PlanError("An AI fix for this item is already running.");
    if (item.aiFix && (item.aiFix.status === "proposed" || item.aiFix.status === "kept")) throw new PlanError("Undo the current AI fix for this item first.");
    draft.aiFixes = [
      ...(draft.aiFixes ?? []),
      { fixId, itemId, title: item.title, status: "running", stage: "Copying the project", startedAt: now(), finishedAt: null, summary: "", error: null, files: [], refused: [], resolved: null, recheckNote: "", sessionId: null },
    ];
    item.aiFix = { fixId, status: "running", resolved: null, note: "", previousDecision: item.decision };
    if (draft.status === "approved") {
      draft.status = "draft";
      draft.approvedAt = null;
    }
  });
  return { fixId, plan };
}

/** Run one registered fix to the end (never throws; failures are stored on the record). */
export async function runPlanFix(planId: string, fixId: string, ask: AskModel): Promise<MigrationPlan> {
  let work: string | null = null;
  const stage = (text: string) =>
    mutate(planId, (draft) =>
      setRecord(draft, fixId, (record) => {
        record.stage = text;
      }),
    );
  try {
    const plan = loadPlan(planId);
    const record = plan?.aiFixes?.find((entry) => entry.fixId === fixId);
    const item = plan?.items.find((entry) => entry.id === record?.itemId);
    if (!plan || !record || !item) throw new PlanError("The fix or its plan item no longer exists.");
    work = prepareWorkspace(plan, fixId);
    let parsed: FixReply;
    let reply: { text: string; sessionId?: string | null };
    let latest: MigrationPlan;
    let latestItem: PlanItem;
    let changes: FileChange[];
    let refused: string[];
    if (isSecretFix(item)) {
      // No model: code swaps the value for an environment placeholder. The value is never read into a prompt or log.
      stage("Moving the value to an environment variable");
      latest = loadPlan(planId)!;
      latestItem = latest.items.find((entry) => entry.id === item.id)!;
      const result = applySecretFix(latest, latestItem, work);
      ({ changes, refused } = result);
      parsed = { summary: result.summary, edits: [] };
      reply = { text: "", sessionId: null };
    } else {
      stage("AI is writing the fix");
      reply = await ask(planFixPrompt(plan, item, work), { planId, fixId, title: item.title });
      parsed = fixReplySchema.parse(extractJson(reply.text));
      stage("Applying the edits to the copy");
      latest = loadPlan(planId)!;
      latestItem = latest.items.find((entry) => entry.id === item.id)!;
      ({ changes, refused } = applyFixEdits(latest, latestItem, work, parsed));
    }
    if (!changes.length) {
      return mutate(planId, (draft) => {
        setRecord(draft, fixId, (entry) => {
          Object.assign(entry, { status: "failed", stage: "", finishedAt: now(), summary: parsed.summary, refused, sessionId: reply.sessionId ?? null, error: refused.length ? `Nothing was changed, because some edits could not be applied: ${refused.slice(0, 3).join("; ")}` : "The AI did not change anything." });
        });
        const target = draft.items.find((entry) => entry.id === item.id);
        if (target) target.aiFix = { fixId, status: "failed", resolved: null, note: parsed.summary.slice(0, 2000) };
      });
    }
    writeFileSync(contentPath(planId, fixId), JSON.stringify({ fixId, itemId: item.id, changes } satisfies FixContent), "utf8");
    stage("Re-checking this risk");
    const check = await recheckItem(latest, latestItem, work);
    return mutate(planId, (draft) => {
      setRecord(draft, fixId, (entry) => {
        Object.assign(entry, {
          status: "proposed",
          stage: "",
          finishedAt: now(),
          summary: parsed.summary,
          refused,
          sessionId: reply.sessionId ?? null,
          files: changes.map((change) => ({ file: change.file, diff: unifiedDiff(change.file, change.before, change.after) })),
          resolved: check.resolved,
          recheckNote: check.note,
        });
      });
      const target = draft.items.find((entry) => entry.id === item.id);
      if (!target) return;
      const previousDecision = target.aiFix?.previousDecision ?? target.decision;
      target.aiFix = { fixId, status: "proposed", resolved: check.resolved, note: check.note, previousDecision };
      // Fixed: unlock it so the run can carry the fix (undo restores the old decision).
      if (check.resolved) target.decision = "approve";
    });
  } catch (error) {
    const message = plainAiError((error as Error).message).slice(0, 2000);
    try {
      return mutate(planId, (draft) => {
        setRecord(draft, fixId, (entry) => {
          Object.assign(entry, { status: "failed", stage: "", finishedAt: now(), error: message });
        });
        const record = draft.aiFixes?.find((entry) => entry.fixId === fixId);
        const target = draft.items.find((entry) => entry.id === record?.itemId);
        if (target) target.aiFix = { fixId, status: "failed", resolved: null, note: message };
      });
    } catch {
      throw error;
    }
  } finally {
    // The edits live in <fixId>.json; the per-fix copy is only needed while the fix runs.
    if (work) rmSync(path.dirname(work), { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
}

/** Re-scan the workspace: is this finding still there? */
export async function recheckItem(plan: MigrationPlan, item: PlanItem, work: string): Promise<{ resolved: boolean; note: string }> {
  const fresh = await generatePlan({ repoPath: work, ecosystem: plan.ecosystem, request: { targets: plan.request.targets, from: plan.request.from }, preview: false, ai: false });
  const key = findingKey(item);
  const files = new Set(item.files ?? []);
  const still = fresh.items.find(
    (entry) => entry.id === item.id || findingKey(entry) === key || (files.size > 0 && (entry.kind ?? entry.category) === (item.kind ?? item.category) && (entry.files ?? []).some((file) => files.has(file))),
  );
  if (!still) return { resolved: true, note: "The re-check no longer finds this risk." };
  const where = still.file ? `${still.file}${still.line ? `:${still.line}` : ""}` : "the project";
  return { resolved: false, note: `Still found at ${where}${still.evidence ? `: ${maskSecretLine(still.evidence).slice(0, 200)}` : ""}.` };
}

export function keepFix(planId: string, fixId: string): MigrationPlan {
  return mutate(planId, (draft) => {
    const record = draft.aiFixes?.find((entry) => entry.fixId === fixId);
    if (!record) throw new PlanError(`Unknown AI fix ${fixId}.`);
    if (record.status !== "proposed") throw new PlanError(`This AI fix is ${record.status}; only a proposed fix can be kept.`);
    record.status = "kept";
    const target = draft.items.find((entry) => entry.id === record.itemId);
    if (target?.aiFix?.fixId === fixId) target.aiFix.status = "kept";
    if (draft.status === "approved") {
      draft.status = "draft";
      draft.approvedAt = null;
    }
  });
}

export function undoFix(planId: string, fixId: string): MigrationPlan {
  return mutate(planId, (draft) => {
    const record = draft.aiFixes?.find((entry) => entry.fixId === fixId);
    if (!record) throw new PlanError(`Unknown AI fix ${fixId}.`);
    if (record.status !== "proposed" && record.status !== "kept") throw new PlanError(`This AI fix is ${record.status}; nothing to undo.`);
    record.status = "undone";
    const target = draft.items.find((entry) => entry.id === record.itemId);
    if (target?.aiFix?.fixId === fixId) {
      if (target.aiFix.previousDecision) target.decision = target.aiFix.previousDecision;
      target.aiFix = { ...target.aiFix, status: "undone" };
    }
    if (draft.status === "approved") {
      draft.status = "draft";
      draft.approvedAt = null;
    }
    // The workspace is rebuilt from the project on the next fix, so the undone edits disappear there too.
  });
}

/** Kept fixes as file changes, in order (applied to a run's work folder before the migration). */
export function keptChanges(planId: string, fixIds: string[]): Array<{ fixId: string; changes: FileChange[] }> {
  return fixIds.flatMap((fixId) => {
    const content = loadFixContent(planId, fixId);
    return content ? [{ fixId, changes: content.changes }] : [];
  });
}

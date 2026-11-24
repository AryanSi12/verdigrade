import type { Commit } from "../git.js";
import type { LockSet } from "../locks.js";
import type { ExecOptions } from "../build.js";
import type { RepoConfig } from "../repoConfig.js";
import type { CheckResult, Ecosystem, RunState, StepId, StepState } from "../types.js";
import type { FindingKind } from "./kinds.js";

/**
 * A language adapter owns everything that depends on the ecosystem: detection,
 * the matrix and routes, scanning, the rewrite and modernize steps, build/test
 * commands, packaging, checks and plan findings. The pipeline (ordering, git
 * safety, lock enforcement, the model fix-up loop, tests-decide, report) is
 * shared and lives in pipeline.ts.
 */

/** Requested targets/from versions, keyed per ecosystem (java/boot, node/typescript). Empty = matrix default / detect. */
export type TargetRequest = {
  targets: Record<string, string | undefined>;
  from: Record<string, string | undefined>;
};

export type ResolvedTargets = {
  ok: true;
  /** Normalised targets, e.g. { java: "21", boot: "4.0.x" }. */
  targets: Record<string, string>;
  routeId: string;
  timeoutMinutes?: number;
};

export type ResolveFailure = { ok: false; error: string };

/** Thrown by a step to fail the run with a readable message. */
export class StepFailed extends Error {}

export type StepContext = {
  state: RunState;
  /** Folder the pipeline works in (temp copy for dry runs). */
  work: string;
  repoConfig: RepoConfig;
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  locks: LockSet;
  begin(id: StepId, summary?: string): StepState;
  end(id: StepId, status: StepState["status"], summary?: string): void;
  skip(id: StepId, why: string): void;
  event(step: StepId | null, message: string, level?: "info" | "warning" | "error"): void;
  emit(): void;
  exec(id: StepId): ExecOptions;
  /** Commit what the step changed (locked paths are reverted first and recorded). */
  commit(id: StepId, message: string): Promise<Commit | null>;
  timeoutMs(): number;
};

export type PreflightResult = {
  /** "maven", "gradle", "npm"… */
  buildTool: string;
  wrapper: boolean;
  command: string | null;
  log: string;
  /** e.g. "JDK 21, maven" or "Node 24.11.0, npm 11.6.2". */
  summary: string;
};

export type TestRun = {
  ok: boolean;
  exitCode: number | null;
  failure: "spawn" | "timeout" | "cancelled" | null;
  command: string;
  /** First failing assertion / error, for the report and the model. */
  firstFailure: string;
  outputTail: string;
  tests: { testsRun: number; failures: number; errors: number; skipped: number; testSets: string[]; source: string } | null;
};

export type PackageRun = {
  ok: boolean;
  exitCode: number | null;
  failure: "spawn" | "timeout" | "cancelled" | null;
  command: string;
  artifacts: string[];
  /** Summary when the step passes (defaults to the artifact names). */
  summary?: string;
  skipped?: string;
};

export type CheckOutcome = { checks: CheckResult[]; followUps: string[] };

// ---- plan findings ---------------------------------------------------------

export type FindingGroup = "auto" | "review" | "manual";
export type Severity = "info" | "low" | "medium" | "high";
export type Decision = "approve" | "lock" | "manual";

/** A before → after excerpt of what a step will change (from the rule/recipe mapping, not a guess). */
export type Snippet = {
  file: string;
  line: number | null;
  /** Text before the change ("" when a line is added). */
  before: string;
  /** Text after the change ("" when a line is removed; null when the exact result is up to the tool). */
  after: string | null;
  note?: string;
};

export type PlanFinding = {
  id: string;
  /** Keys the plain-language explanation (profiles/explanations/*.json). */
  kind: FindingKind;
  /** Values for the explanation's {placeholders} (api, replacement, target, count…). */
  params?: Record<string, string>;
  /** Expected before → after excerpts for "What we'll do". */
  snippets?: Snippet[];
  group: FindingGroup;
  /** Short machine-friendly category, e.g. "recipe", "rules", "removed-api", "dependency", "secrets". */
  category: string;
  severity: Severity;
  title: string;
  /** Repository-relative, "/"-separated; null for project-wide items. */
  file: string | null;
  /** 1-based line, or null. */
  line: number | null;
  why: string;
  suggestion: string;
  /** For "auto" items: the files the step is expected to touch. */
  files?: string[];
  /** The exact text at file:line (lets code verify a finding). */
  evidence?: string;
  defaultDecision?: Decision;
  /**
   * How bad it is if nothing is done: "breaks" = the build, tests or app fail after the
   * migration unless someone changes the code; "review" = might break; "safe" = automatic.
   * Derived from the explanation catalogue when absent (plan.ts itemTier).
   */
  tier?: Tier;
  /** Concrete "What you need to change", ideally with the project's own code before → after. */
  fix?: Fix;
};

export type Tier = "breaks" | "review" | "safe";

export type Fix = {
  /** One or two plain sentences: what to change. */
  summary: string;
  /** The current code (from the project when possible). */
  before?: string;
  /** The same code after the change. */
  after?: string;
  /** Where the before/after applies, when it differs from the item's file. */
  file?: string;
  line?: number;
};

export type AdapterPlan = {
  routeId: string;
  description: string;
  targets: Record<string, string>;
  targetLabel: string;
  detected: Record<string, unknown>;
  findings: PlanFinding[];
  stats: Record<string, number>;
  notes: string[];
};

export type PlanInput = {
  repoPath: string;
  request: TargetRequest;
  repoConfig: RepoConfig;
  /** Run the rewrite tool in preview mode on a temporary copy (slower, exact file lists). */
  preview: boolean;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  /** Progress for the loading screen: "dependencies" then "risky-code". */
  onStage?: (stage: PlanStage) => void;
};

export type PlanStage = "clone" | "reading" | "dependencies" | "risky-code" | "writing" | "done";

export type ValidateResult = { ok: boolean; problems: string[]; routes: number; packs: string[] };

export interface LanguageAdapter {
  readonly id: Ecosystem;
  /** "Java / Spring Boot", "Node.js / TypeScript". */
  readonly label: string;
  /** Step label overrides (e.g. rewrite: "OpenRewrite" or "Codemods"). */
  readonly stepLabels: Partial<Record<StepId, string>>;
  /** Extra shadow-git ignore patterns (build output of this ecosystem). */
  readonly ignorePatterns: string[];
  /** Extra folder names left out of the dry-run copy. */
  readonly workCopySkip: string[];
  /** Is this folder a project of this ecosystem? */
  detect(repoPath: string): boolean;
  validateProfiles(): ValidateResult;
  /** Public matrix view for GET /matrix. */
  matrixView(): Record<string, unknown>;
  /** Check requested targets before anything runs. */
  resolveTargets(request: TargetRequest, repoConfig: RepoConfig): ResolvedTargets | ResolveFailure;
  /** Read-only route preview (POST /resolve, CLI plan --route-only). */
  preview(request: TargetRequest, repoPath: string | null, repoConfig: RepoConfig): Record<string, unknown> & { ok: boolean };
  preflight(ctx: StepContext, targets: ResolvedTargets): Promise<PreflightResult>;
  /** Scan the work folder, resolve the route, fill state.scan/route/from/versions. Owns begin/end of "scan". */
  scan(ctx: StepContext, targets: ResolvedTargets): Promise<void>;
  /** Owns begin/end of "rewrite". */
  rewrite(ctx: StepContext): Promise<void>;
  /** Owns begin/end of "modernize". */
  modernize(ctx: StepContext): Promise<void>;
  testSummary(state: RunState): string;
  runTests(ctx: StepContext): Promise<TestRun>;
  packageSummary(state: RunState): string;
  runPackage(ctx: StepContext): Promise<PackageRun>;
  /** Re-scan and verify the target; sets state.scanAfter/after/versions. */
  checks(ctx: StepContext): Promise<CheckOutcome>;
  /** Deterministic plan findings for a repository (read-only). */
  plan(input: PlanInput): Promise<AdapterPlan>;
  /** Extra lines for the model fix-up prompt (route facts). */
  fixupFacts(state: RunState): string[];
}

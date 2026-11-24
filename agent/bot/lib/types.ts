import type { EngineRun } from "./engine.js";
import type { RepoSource } from "./github.js";
import type { NodeScanResult } from "./adapters/nodeScan.js";
import type { PythonScanResult } from "./adapters/pythonScan.js";
import type { RuleEdit } from "./rules.js";
import type { ScanResult } from "./scanner.js";

/** Language/framework families with an adapter (bot/lib/adapters). */
export type Ecosystem = "java" | "node" | "python";
export const ecosystems: Ecosystem[] = ["java", "node", "python"];

/** Whatever the ecosystem's scanner reports. Node and Python scans carry their ecosystem id. */
export type ProjectScan = ScanResult | NodeScanResult | PythonScanResult;

export function isNodeScan(scan: ProjectScan | null | undefined): scan is NodeScanResult {
  return Boolean(scan && (scan as NodeScanResult).ecosystem === "node");
}

export function isPythonScan(scan: ProjectScan | null | undefined): scan is PythonScanResult {
  return Boolean(scan && (scan as PythonScanResult).ecosystem === "python");
}

export function javaScan(scan: ProjectScan | null | undefined): ScanResult | null {
  return scan && !isNodeScan(scan) && !isPythonScan(scan) ? (scan as ScanResult) : null;
}

/** One version line shown before/after (Java, Spring Boot, Node, TypeScript, Express…). */
export type VersionFact = { key: string; label: string; before: string | null; after: string | null; target: string | null };

/** A plan item the reviewer marked "manual" or "lock", carried into the run and its report. */
export type PlanFollowUp = {
  id: string;
  title: string;
  file: string | null;
  line: number | null;
  group: "auto" | "review" | "manual";
  decision: "approve" | "lock" | "manual";
  note: string;
  suggestion: string;
  /** From the plan item's explanation (absent for runs from older plans). */
  plainTitle?: string;
  /** What happens because it was locked / left manual. */
  consequence?: string;
  riskIfSkipped?: "none" | "low" | "medium" | "high" | "blocker";
  /** What a person has to do (checklist). */
  manualSteps?: string[];
  effort?: string;
};

/** What the run took from the approved plan (null = the run had no plan). */
export type RunPlanInfo = {
  planId: string;
  approvedAt: string | null;
  lockedPaths: string[];
  followUps: PlanFollowUp[];
  source: "store" | "file";
  /** "Fix with AI" edits the reviewer kept in plan mode; applied to the run's work folder first. */
  aiPreFixes?: Array<{ fixId: string; itemId: string; title: string; summary: string; files: string[] }>;
  /** Plan items labelled "AI" that still need a code change (no kept fix); Hybrid's AI step and Full AI work through them. */
  aiItems?: PlanAiItem[];
  /** Refactors picked in the plan's quiz; the "refactor" step makes them after the upgrade. */
  refactors?: Array<{ questionId: string; answerId: string; topic: string; title: string; change: string; risk: "low" | "medium" | "high"; files: string[]; count: number }>;
};

/** One plan item handed to the AI as an instruction. Excerpts and facts only; never a secret value. */
export type PlanAiItem = { id: string; title: string; file: string | null; line: number | null; why: string; suggestion: string; tier: "breaks" | "review" };

export type LockViolation = { step: StepId; file: string; pattern: string; action: "restored" | "removed" | "skipped" };

export type StepId = "preflight" | "scan" | "rewrite" | "modernize" | "test" | "refactor" | "package" | "checks" | "report";
export type StepStatus = "waiting" | "running" | "passed" | "failed" | "skipped";
export type RunStatus = "running" | "passed" | "failed";

export const stepOrder: StepId[] = ["preflight", "scan", "rewrite", "modernize", "test", "refactor", "package", "checks", "report"];

export const stepLabels: Record<StepId, string> = {
  preflight: "Preflight",
  scan: "Scan",
  rewrite: "OpenRewrite",
  modernize: "Modernize",
  test: "Test",
  refactor: "Refactor",
  package: "Package",
  checks: "Checks",
  report: "Report",
};

export type StepState = {
  id: StepId;
  label: string;
  status: StepStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  /** Exit code of the step's decisive command (null = no command or it never exited). */
  exitCode: number | null;
  command: string | null;
  summary: string;
  /** Last part of the step's output; the full log is in logFile. */
  logTail: string;
  logFile: string | null;
  commit: string | null;
  changedFiles: string[];
};

export type RecipeResult = {
  recipe: string;
  /** Short display name (Java: last recipe segments; Node: the codemod package). */
  label?: string;
  artifact: string;
  when: string;
  ran: boolean;
  reason: string;
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  changedFiles: string[];
  commit: string | null;
};

export type TestSummary = {
  ok: boolean;
  exitCode: number | null;
  testsRun: number | null;
  failures: number | null;
  errors: number | null;
  skipped: number | null;
  testSets: string[];
  source: string;
  firstFailure: string;
};

/** One thing the running page got wrong, as the page check saw it. */
export type PageProblem = { kind: "page" | "http" | "csrf" | "field" | "type"; call: string; message: string };

/** The "page check": the packaged app was started, the page loaded and the API calls its JavaScript makes were tried. */
export type PageCheckState = {
  /** False when the check could not run (no jar, the app did not start); `note` says why. It is then not a failure. */
  ran: boolean;
  note: string;
  calls: Array<{ call: string; status: number | null; note: string }>;
  problems: PageProblem[];
  /** Problems before any AI fix-up (equal to `problems` when nothing was fixed). */
  initialProblems: number;
  /** AI fix-up rounds spent on the page (Full AI only). */
  rounds: number;
  /** Did this engine try to fix page problems? Full AI yes; Hybrid only reports them. */
  fixAttempted: boolean;
  durationMs: number;
};

export type CheckResult = { id: string; ok: boolean; level: "error" | "warning" | "info"; message: string };

export type RunRoute = {
  id: string;
  description: string;
  /** Java routes: the Java and Boot targets. Other ecosystems leave these empty and use `targets`. */
  targetJava: string;
  targetBoot: string;
  parentHint: string;
  targets?: Record<string, string>;
  /** One-line target summary, e.g. "Java 21 · Spring Boot 4.0.x" or "Node 24 · TypeScript 6.0". */
  targetLabel?: string;
  rulePacks: string[];
  recipePlan: Array<{ when: string; artifact: string; recipe: string; label?: string }>;
  notes: string[];
};

export type RunEvent = { index: number; at: string; step: StepId | null; level: "info" | "warning" | "error"; message: string };

export type RunState = {
  runId: string;
  repoPath: string;
  /** Where the pipeline actually ran (a temp copy for dry runs). */
  workPath: string;
  dryRun: boolean;
  /** Which adapter ran (older saved runs have no field and are Java). */
  ecosystem: Ecosystem;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
  request: {
    targetJava: string;
    targetBoot: string;
    fromJava: string | null;
    fromBoot: string | null;
    /** Ecosystem-neutral targets, e.g. { java: "21", boot: "4.0.x" } or { node: "24", typescript: "6.0" }. */
    targets?: Record<string, string>;
    /** Ecosystem-neutral "from" versions the user chose (empty = detect). */
    from?: Record<string, string>;
  };
  route: RunRoute | null;
  from: { java: string | null; boot: string | null; source: "detected" | "user" | "unknown" };
  after: { java: string | null; boot: string | null } | null;
  buildTool: string | null;
  wrapper: boolean;
  steps: Record<StepId, StepState>;
  scan: ProjectScan | null;
  scanAfter: ProjectScan | null;
  /** Before/after per version line, filled by the adapter (the UI renders these). */
  versions: VersionFact[];
  plan: RunPlanInfo | null;
  /** Where the project came from (a GitHub clone); null/absent for local folders. */
  source?: RepoSource | null;
  /** The upgrade engine (Classic / AI / Hybrid), model and AI usage. Absent on runs saved before engines existed. */
  engine?: EngineRun;
  lockViolations: LockViolation[];
  recipes: RecipeResult[];
  ruleEdits: RuleEdit[];
  fixRounds: Array<{ round: number; status: "finished" | "error" | "skipped"; note: string; changedFiles: string[]; sessionId: string | null }>;
  tests: TestSummary | null;
  artifacts: string[];
  checks: CheckResult[];
  /** Java apps with a static page: the result of starting the app and trying the page's API calls. */
  pageCheck?: PageCheckState | null;
  followUps: string[];
  warnings: string[];
  git: {
    mode: "repo" | "shadow" | "none";
    branch: string | null;
    originalBranch: string | null;
    baseCommit: string | null;
    headCommit: string | null;
    shadowGitDir: string | null;
    commits: Array<{ step: string; sha: string; message: string; files: string[] }>;
    rolledBack: boolean;
  };
  changedFiles: string[];
  diffChars: number;
  diffTruncated: boolean;
  artifactsDir: string;
  narrative: { status: "pending" | "running" | "done" | "failed" | "skipped"; text: string; sessionId: string | null };
  events: RunEvent[];
};

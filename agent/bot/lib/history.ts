import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dataDir } from "./config.js";
import type { RepoSource } from "./github.js";
import type { Engine } from "./engine.js";
import type { Ecosystem, RunState, VersionFact } from "./types.js";

/** One row per run. Built on the server from the pipeline's own state, never from the browser. */
export type MigrationRecord = {
  sessionId: string;
  repoPath: string;
  startedAt: string;
  finishedAt: string;
  status: "running" | "passed" | "failed";
  dryRun: boolean;
  javaBefore: string;
  javaAfter: string;
  springBefore: string;
  springAfter: string;
  routeId: string;
  targetJava: string;
  targetBoot: string;
  resolvedRecipes: string[];
  recipes: Array<{ recipe: string; ran: boolean; ok: boolean; exitCode: number | null }>;
  testsSummary: string;
  artifactPath: string;
  changedFiles: number;
  /** "java" for rows saved before adapters existed. */
  ecosystem: Ecosystem;
  /** Before/after per version line (Node, TypeScript, Express… or Java, Spring Boot). */
  versions: VersionFact[];
  targetLabel: string;
  planId: string | null;
  /** GitHub source (null for local folders). */
  source: RepoSource | null;
  /** Upgrade engine ("" for rows saved before engines existed) and the model the AI used. */
  engine: Engine | "";
  model: string;
  tokens: number | null;
};

let database: DatabaseSync | null = null;

function ensureColumn(opened: DatabaseSync, name: string, ddl: string) {
  const rows = opened.prepare("PRAGMA table_info(migrations)").all() as Array<{ name?: string }>;
  if (rows.some((row) => row.name === name)) return;
  opened.exec(`ALTER TABLE migrations ADD COLUMN ${ddl}`);
}

function db(): DatabaseSync {
  if (database) return database;
  const file = path.join(dataDir(), "migrations.db");
  mkdirSync(path.dirname(file), { recursive: true });
  const opened = new DatabaseSync(file);
  opened.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      session_id TEXT PRIMARY KEY,
      repo_path TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      status TEXT NOT NULL,
      java_before TEXT NOT NULL DEFAULT '',
      java_after TEXT NOT NULL DEFAULT '',
      spring_before TEXT NOT NULL DEFAULT '',
      spring_after TEXT NOT NULL DEFAULT '',
      recipes_json TEXT NOT NULL DEFAULT '[]',
      tests_summary TEXT NOT NULL DEFAULT '',
      artifact_path TEXT NOT NULL DEFAULT '',
      report_text TEXT NOT NULL DEFAULT '',
      patch_text TEXT NOT NULL DEFAULT '',
      steps_json TEXT NOT NULL DEFAULT '{}',
      route_id TEXT NOT NULL DEFAULT '',
      target_java TEXT NOT NULL DEFAULT '',
      target_boot TEXT NOT NULL DEFAULT '',
      resolved_recipes_json TEXT NOT NULL DEFAULT '[]'
    );
  `);
  // Columns added after the first release (older databases are migrated in place).
  ensureColumn(opened, "route_id", "route_id TEXT NOT NULL DEFAULT ''");
  ensureColumn(opened, "target_java", "target_java TEXT NOT NULL DEFAULT ''");
  ensureColumn(opened, "target_boot", "target_boot TEXT NOT NULL DEFAULT ''");
  ensureColumn(opened, "resolved_recipes_json", "resolved_recipes_json TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(opened, "state_json", "state_json TEXT NOT NULL DEFAULT ''");
  ensureColumn(opened, "dry_run", "dry_run INTEGER NOT NULL DEFAULT 0");
  ensureColumn(opened, "changed_files", "changed_files INTEGER NOT NULL DEFAULT 0");
  ensureColumn(opened, "ecosystem", "ecosystem TEXT NOT NULL DEFAULT 'java'");
  ensureColumn(opened, "versions_json", "versions_json TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(opened, "target_label", "target_label TEXT NOT NULL DEFAULT ''");
  ensureColumn(opened, "plan_id", "plan_id TEXT NOT NULL DEFAULT ''");
  ensureColumn(opened, "source_json", "source_json TEXT NOT NULL DEFAULT ''");
  ensureColumn(opened, "engine", "engine TEXT NOT NULL DEFAULT ''");
  ensureColumn(opened, "model", "model TEXT NOT NULL DEFAULT ''");
  ensureColumn(opened, "tokens", "tokens INTEGER");
  // Engine comparisons (the same repo through two or three engines): one JSON document per comparison.
  opened.exec(`
    CREATE TABLE IF NOT EXISTS comparisons (
      id TEXT PRIMARY KEY,
      repo_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
  `);
  // A run that was "running" when the server stopped can never finish.
  opened
    .prepare("UPDATE migrations SET status = 'failed', finished_at = ? WHERE status = 'running'")
    .run(new Date().toISOString());
  database = opened;
  return opened;
}

/** Close the SQLite file (tests on Windows cannot delete the data folder while it is open). The next call reopens it. */
export function closeHistory(): void {
  database?.close();
  database = null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toRecord(row: Record<string, unknown>): MigrationRecord {
  const status = row.status === "failed" || row.status === "running" ? row.status : "passed";
  const recipes = parseJson<Array<Record<string, unknown>>>(row.recipes_json, []).map((item) => ({
    recipe: text(item.recipe),
    ran: item.ran !== false && item.dryRun !== true,
    ok: item.ok !== false,
    exitCode: typeof item.exitCode === "number" ? item.exitCode : null,
  }));
  return {
    sessionId: text(row.session_id),
    repoPath: text(row.repo_path),
    startedAt: text(row.started_at),
    finishedAt: text(row.finished_at),
    status,
    dryRun: Number(row.dry_run ?? 0) === 1,
    javaBefore: text(row.java_before),
    javaAfter: text(row.java_after),
    springBefore: text(row.spring_before),
    springAfter: text(row.spring_after),
    routeId: text(row.route_id),
    targetJava: text(row.target_java),
    targetBoot: text(row.target_boot),
    resolvedRecipes: parseJson<string[]>(row.resolved_recipes_json, []),
    recipes,
    testsSummary: text(row.tests_summary),
    artifactPath: text(row.artifact_path),
    changedFiles: Number(row.changed_files ?? 0),
    ecosystem: row.ecosystem === "node" || row.ecosystem === "python" ? row.ecosystem : "java",
    versions: parseJson<VersionFact[]>(row.versions_json, []),
    targetLabel: text(row.target_label),
    planId: text(row.plan_id) || null,
    source: parseJson<RepoSource | null>(row.source_json, null),
    engine: row.engine === "classic" || row.engine === "ai" || row.engine === "hybrid" ? row.engine : "",
    model: text(row.model),
    tokens: typeof row.tokens === "number" ? row.tokens : null,
  };
}

function testsSummary(state: RunState): string {
  const tests = state.tests;
  if (!tests) return state.steps.test.status === "skipped" ? "Tests skipped" : "";
  return `Tests run: ${tests.testsRun ?? "?"}, Failures: ${tests.failures ?? "?"}, Errors: ${tests.errors ?? "?"}, Skipped: ${tests.skipped ?? "?"}`;
}

/** Persist the run (server-side state is the source of truth). */
export function saveRun(state: RunState, reportText = ""): void {
  db()
    .prepare(
      `INSERT INTO migrations (
        session_id, repo_path, started_at, finished_at, status,
        java_before, java_after, spring_before, spring_after,
        recipes_json, tests_summary, artifact_path, report_text, patch_text, steps_json,
        route_id, target_java, target_boot, resolved_recipes_json, state_json, dry_run, changed_files,
        ecosystem, versions_json, target_label, plan_id, source_json, engine, model, tokens
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '{}', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        repo_path = excluded.repo_path,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        status = excluded.status,
        java_before = excluded.java_before,
        java_after = excluded.java_after,
        spring_before = excluded.spring_before,
        spring_after = excluded.spring_after,
        recipes_json = excluded.recipes_json,
        tests_summary = excluded.tests_summary,
        artifact_path = excluded.artifact_path,
        report_text = excluded.report_text,
        route_id = excluded.route_id,
        target_java = excluded.target_java,
        target_boot = excluded.target_boot,
        resolved_recipes_json = excluded.resolved_recipes_json,
        state_json = excluded.state_json,
        dry_run = excluded.dry_run,
        changed_files = excluded.changed_files,
        ecosystem = excluded.ecosystem,
        versions_json = excluded.versions_json,
        target_label = excluded.target_label,
        plan_id = excluded.plan_id,
        source_json = excluded.source_json,
        engine = excluded.engine,
        model = excluded.model,
        tokens = excluded.tokens`,
    )
    .run(
      state.runId,
      state.repoPath,
      state.startedAt,
      state.finishedAt ?? state.startedAt,
      state.status,
      state.from.java ?? "",
      state.after?.java ?? "",
      state.from.boot ?? "",
      state.after?.boot ?? "",
      JSON.stringify(state.recipes.map((item) => ({ recipe: item.recipe, ran: item.ran, ok: item.ok, exitCode: item.exitCode }))),
      testsSummary(state),
      state.artifacts[0] ?? "",
      reportText,
      state.route?.id ?? "",
      state.route?.targetJava ?? state.request.targetJava,
      state.route?.targetBoot ?? state.request.targetBoot,
      JSON.stringify(state.route?.recipePlan.map((item) => item.recipe) ?? []),
      JSON.stringify(state),
      state.dryRun ? 1 : 0,
      state.changedFiles.length,
      state.ecosystem ?? "java",
      JSON.stringify(state.versions ?? []),
      state.route?.targetLabel ?? "",
      state.plan?.planId ?? "",
      state.source ? JSON.stringify(state.source) : "",
      state.engine?.engine ?? "",
      state.engine?.model ?? "",
      state.engine && state.engine.ai.tokensIn != null && state.engine.ai.tokensOut != null ? state.engine.ai.tokensIn + state.engine.ai.tokensOut : null,
    );
}

/** Save (insert or replace) an engine comparison. `data` is the whole comparison document. */
export function saveComparison(comparison: { id: string; repoPath: string; createdAt: string; status: string }): void {
  db()
    .prepare(
      `INSERT INTO comparisons (id, repo_path, created_at, status, data_json) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, data_json = excluded.data_json`,
    )
    .run(comparison.id, comparison.repoPath, comparison.createdAt, comparison.status, JSON.stringify(comparison));
}

export function loadComparison<T>(id: string): T | null {
  const row = db().prepare("SELECT data_json FROM comparisons WHERE id = ?").get(id) as { data_json?: string } | undefined;
  return row ? parseJson<T | null>(row.data_json, null) : null;
}

export function listComparisons<T>(limit = 50): T[] {
  const rows = db().prepare("SELECT data_json FROM comparisons ORDER BY created_at DESC LIMIT ?").all(Math.min(Math.max(limit, 1), 200)) as Array<{ data_json?: string }>;
  return rows.map((row) => parseJson<T | null>(row.data_json, null)).filter((item): item is T => item !== null);
}

/** A comparison left "running" by a server stop can never finish. */
export function failStaleComparisons(isActive: (id: string) => boolean): void {
  const rows = db().prepare("SELECT id, data_json FROM comparisons WHERE status = 'running'").all() as Array<{ id: string; data_json: string }>;
  for (const row of rows) {
    if (isActive(row.id)) continue;
    const data = parseJson<Record<string, unknown> | null>(row.data_json, null);
    if (!data) continue;
    data.status = "failed";
    data.error = "The agent server stopped while this comparison was running.";
    db().prepare("UPDATE comparisons SET status = 'failed', data_json = ? WHERE id = ?").run(JSON.stringify(data), row.id);
  }
}

export function listMigrations(options: { limit?: number; offset?: number; repoPath?: string } = {}): { items: MigrationRecord[]; total: number } {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const where = options.repoPath ? "WHERE repo_path = ?" : "";
  const args = options.repoPath ? [options.repoPath] : [];
  const rows = db()
    .prepare(`SELECT * FROM migrations ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, offset) as Record<string, unknown>[];
  const total = (db().prepare(`SELECT COUNT(*) AS n FROM migrations ${where}`).get(...args) as { n: number }).n;
  return { items: rows.map(toRecord), total };
}

/** Full saved state for one run, or null (older rows written by the browser have no state). */
export function loadRunState(runId: string): { state: RunState | null; record: MigrationRecord | null; reportText: string } {
  const row = db().prepare("SELECT * FROM migrations WHERE session_id = ?").get(runId) as Record<string, unknown> | undefined;
  if (!row) return { state: null, record: null, reportText: "" };
  const state = parseJson<RunState | null>(row.state_json, null);
  if (state && row.status === "failed" && state.status === "running") {
    state.status = "failed";
    state.error = state.error ?? "The agent server stopped while this run was in progress.";
  }
  return { state, record: toRecord(row), reportText: text(row.report_text) };
}

const deleteHooks: Array<(runId: string) => void> = [];

/** Run `hook` whenever a migration is deleted (the live preview stops its servers, the dry-run copy is released). */
export function onMigrationDeleted(hook: (runId: string) => void): void {
  deleteHooks.push(hook);
}

export function deleteMigration(runId: string): boolean {
  for (const hook of deleteHooks) {
    try {
      hook(runId);
    } catch {
      /* cleanup must never block the delete */
    }
  }
  const result = db().prepare("DELETE FROM migrations WHERE session_id = ?").run(runId);
  return Number(result.changes) > 0;
}

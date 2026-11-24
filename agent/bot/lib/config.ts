import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** agent/ folder (this file lives in agent/bot/lib). */
export const agentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const profilesRoot = path.join(agentRoot, "profiles");
export const samplesRoot = path.resolve(agentRoot, "..", "samples");

/**
 * Read a Verdigrade setting: VERDIGRADE_<NAME> wins, then the older
 * LEAPFROG_<NAME> and JAVA_MIGRATOR_<NAME> (kept so existing setups keep working). Empty values count as unset.
 */
export function envSetting(name: string): string | undefined {
  for (const key of [`VERDIGRADE_${name}`, `LEAPFROG_${name}`, `JAVA_MIGRATOR_${name}`]) {
    const value = process.env[key];
    if (value != null && value.trim() !== "") return value;
  }
  return undefined;
}

/** Where run artifacts (logs, reports, shadow git dirs) and the SQLite history live. */
export function dataDir(): string {
  const configured = envSetting("DATA_DIR")?.trim();
  return configured ? path.resolve(configured) : path.join(agentRoot, "data");
}

/**
 * Folders the API may browse and migrate. Configure with LEAPFROG_ROOTS
 * (separated by the platform path delimiter: ";" on Windows, ":" elsewhere).
 * Default: the bundled samples/ folder plus the current user's home folder.
 */
export function allowedRoots(): string[] {
  const configured = envSetting("ROOTS")?.trim();
  const roots = configured
    ? configured.split(path.delimiter).map((item) => item.trim()).filter(Boolean)
    : [samplesRoot, os.homedir()];
  return [...new Set(roots.map((item) => path.resolve(item)))];
}

/** Optional bearer token for the migrate channel. Unset = loopback-only access. */
export function apiToken(): string | null {
  const token = envSetting("TOKEN")?.trim();
  return token ? token : null;
}

export function defaultTimeoutMinutes(): number {
  const value = Number(envSetting("TIMEOUT_MINUTES"));
  return Number.isFinite(value) && value > 0 ? value : 30;
}

/** Max model fix-up rounds after a failing test step (0 disables the model fix-up). Default 3. */
export function defaultFixRounds(): number {
  const raw = envSetting("FIX_ROUNDS");
  if (raw == null || raw === "") return 3;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= 5 ? value : 3;
}

/**
 * Runs need an approved migration plan unless LEAPFROG_REQUIRE_PLAN is
 * "false" or "0" (the CLI also has --no-plan).
 */
export function requirePlan(): boolean {
  const raw = envSetting("REQUIRE_PLAN")?.trim().toLowerCase();
  return !(raw === "false" || raw === "0" || raw === "no");
}

/** The AI plan review (risk explanations and extra, code-verified findings). LEAPFROG_PLAN_AI=0 turns it off. */
export function planAiEnabled(): boolean {
  return envSetting("PLAN_AI") !== "0";
}

/** Optional explicit Python interpreter for the Python adapter (full path or command), e.g. C:\Python314\python.exe. */
export function pythonOverride(): string | null {
  const value = envSetting("PYTHON")?.trim();
  return value ? value : null;
}

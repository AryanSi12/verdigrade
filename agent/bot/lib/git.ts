import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LockSet } from "./locks.js";
import { runCommand } from "./process.js";

/** The human-reviewed plan file. Never committed by the safety net and ignored by the clean-tree check. */
export const planFileName = "migration-plan.json";

/** Paths never committed by the safety net (build output, logs, IDE files). */
export const ignoredPatterns = [
  "target/",
  ".gradle/",
  "node_modules/",
  ".idea/",
  ".vscode/",
  "*.log",
  "/logs/",
  // Gradle output, but never a source package that happens to be called "build".
  "build/",
  "!**/src/**/build/",
  // The plan file at the project root is the reviewer's input, not a migration change.
  "/migration-plan.json",
];

/** Pathspec exclusions used in "repo" mode on top of the repository's own .gitignore. */
const repoPathspecExcludes = ["**/target/**", "**/.gradle/**", "**/node_modules/**", "**/*.log"];
const repoTopExcludes = [planFileName];

export type GitMode = "repo" | "shadow";

export type Commit = { step: string; sha: string; message: string; files: string[] };

/**
 * Git safety net for one run.
 * - "repo": the target is a git work tree. A clean tree is required, a
 *   migrate/<route> branch is created, and every step is its own commit.
 * - "shadow": the target is not a git repo (or is a dry-run copy). A private
 *   git dir outside the project tracks the same per-step commits, so the
 *   full diff and per-step changes are still exact, and nothing is added to
 *   the project folder.
 */
export class GitSafety {
  readonly commits: Commit[] = [];
  baseCommit = "";
  branch: string | null = null;
  originalBranch: string | null = null;

  private constructor(
    readonly mode: GitMode,
    readonly workTree: string,
    private readonly gitDir: string | null,
  ) {}

  private args(extra: string[]): string[] {
    const identity = [
      "-c",
      "user.name=leapfrog",
      "-c",
      "user.email=leapfrog@localhost",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.autocrlf=false",
      "-c",
      "core.quotepath=false",
    ];
    return this.gitDir ? [...identity, `--git-dir=${this.gitDir}`, `--work-tree=${this.workTree}`, ...extra] : [...identity, ...extra];
  }

  async git(extra: string[], allowFail = false): Promise<string> {
    const result = await runCommand("git", this.args(extra), { cwd: this.workTree, timeoutMs: 5 * 60_000, tailChars: 4_000_000 });
    if (!result.ok && !allowFail) throw new Error(`git ${extra.join(" ")} failed (${result.exitCode ?? result.failure}): ${result.output.trim().slice(-800)}`);
    return result.ok ? result.output : "";
  }

  static async isWorkTree(dir: string): Promise<boolean> {
    const result = await runCommand("git", ["rev-parse", "--show-toplevel"], { cwd: dir, timeoutMs: 30_000 });
    return result.ok;
  }

  /** Open the target repo itself. Requires a clean tree unless allowDirty. */
  static async openRepo(dir: string, options: { branchName: string; allowDirty?: boolean }): Promise<GitSafety> {
    const safety = new GitSafety("repo", dir, null);
    // Scoped to the target folder, so a service inside a monorepo only needs its own folder clean.
    const status = await safety.git(["status", "--porcelain", "--untracked-files=normal", "--", ".", ...repoTopExcludes.map((name) => `:(exclude)${name}`)]);
    if (status.trim() && !options.allowDirty) {
      const lines = status.trim().split(/\r?\n/);
      throw new Error(
        `The git working tree is not clean (${lines.length} changed path${lines.length === 1 ? "" : "s"}, e.g. ${lines.slice(0, 3).join(", ")}). Commit or stash first, or use dry-run.`,
      );
    }
    safety.originalBranch = (await safety.git(["rev-parse", "--abbrev-ref", "HEAD"], true)).trim() || null;
    safety.baseCommit = (await safety.git(["rev-parse", "HEAD"])).trim();
    let branch = options.branchName;
    const exists = (name: string) => safety.git(["rev-parse", "--verify", "--quiet", `refs/heads/${name}`], true).then((out) => Boolean(out.trim()));
    for (let attempt = 2; await exists(branch); attempt += 1) branch = `${options.branchName}-${attempt}`;
    await safety.git(["checkout", "-b", branch]);
    safety.branch = branch;
    return safety;
  }

  /** Track a non-git folder (or dry-run copy) with a private git dir. */
  static async openShadow(dir: string, gitDir: string, extraIgnores: string[] = []): Promise<GitSafety> {
    mkdirSync(path.dirname(gitDir), { recursive: true });
    const safety = new GitSafety("shadow", dir, gitDir);
    await runCommand("git", ["init", "--bare", "--quiet", gitDir], { cwd: path.dirname(gitDir), timeoutMs: 60_000 });
    mkdirSync(path.join(gitDir, "info"), { recursive: true });
    writeFileSync(path.join(gitDir, "info", "exclude"), `${[...ignoredPatterns, ...extraIgnores].join("\n")}\n`, "utf8");
    await safety.git(["config", "core.bare", "false"]);
    await safety.git(["add", "-A", "."]);
    await safety.git(["commit", "--quiet", "--allow-empty", "--no-verify", "-m", "leapfrog: baseline"]);
    safety.baseCommit = (await safety.git(["rev-parse", "HEAD"])).trim();
    return safety;
  }

  private pathspec(): string[] {
    if (this.mode === "shadow") return ["."];
    return [".", ...repoPathspecExcludes.map((pattern) => `:(exclude,glob)${pattern}`), ...repoTopExcludes.map((name) => `:(exclude)${name}`)];
  }

  /** Paths changed in the work tree since HEAD (tracked edits, deletions and new untracked files). */
  async pendingChanges(): Promise<string[]> {
    const tracked = await this.git(["diff", "--relative", "--name-only", "HEAD", "--", ...this.pathspec()]);
    const untracked = await this.git(["ls-files", "--others", "--exclude-standard", "--", ...this.pathspec()]);
    return [...new Set(`${tracked}\n${untracked}`.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
  }

  /**
   * Undo uncommitted changes to locked paths: restore tracked files from HEAD and
   * delete new files. Returns what was reverted so the run can record it.
   */
  async revertLocked(locks: LockSet): Promise<Array<{ file: string; pattern: string; action: "restored" | "removed" }>> {
    if (!locks.patterns.length) return [];
    const reverted: Array<{ file: string; pattern: string; action: "restored" | "removed" }> = [];
    for (const file of await this.pendingChanges()) {
      const pattern = locks.match(file);
      if (!pattern) continue;
      const inHead = Boolean((await this.git(["ls-tree", "--name-only", "HEAD", "--", file], true)).trim());
      if (inHead) {
        await this.git(["checkout", "HEAD", "--", file]);
        reverted.push({ file, pattern, action: "restored" });
      } else {
        rmSync(path.join(this.workTree, file), { force: true });
        reverted.push({ file, pattern, action: "removed" });
      }
    }
    return reverted;
  }

  /** Commit everything the step changed. Returns null when the step changed nothing. */
  async commitStep(step: string, message: string): Promise<Commit | null> {
    await this.git(["add", "-A", "--", ...this.pathspec()]);
    // --relative: paths are relative to the project folder (it can be a subfolder of the git root).
    const staged = (await this.git(["diff", "--cached", "--relative", "--name-only"])).trim();
    if (!staged) return null;
    await this.git(["commit", "--quiet", "--no-verify", "-m", `leapfrog(${step}): ${message}`]);
    const sha = (await this.git(["rev-parse", "HEAD"])).trim();
    const commit = { step, sha, message, files: staged.split(/\r?\n/).filter(Boolean) };
    this.commits.push(commit);
    return commit;
  }

  /**
   * Undo one commit with a new commit (git revert), so history and the user's other changes stay intact.
   * Returns the revert commit, or null when there was nothing to undo.
   */
  async revertCommit(sha: string, step: string, message: string): Promise<Commit | null> {
    await this.git(["revert", "--no-commit", sha]);
    return this.commitStep(step, message);
  }

  async diff(from = this.baseCommit, to = "HEAD"): Promise<string> {
    return this.git(["diff", "--relative", "--no-color", "--find-renames", from, to]);
  }

  async changedFiles(from = this.baseCommit, to = "HEAD"): Promise<string[]> {
    return (await this.git(["diff", "--relative", "--name-only", from, to])).split(/\r?\n/).filter(Boolean);
  }

  /**
   * Undo the run. Shadow mode restores the baseline files in place (and removes
   * files the run added). Repo mode switches back to the original branch and
   * leaves the migrate branch for inspection.
   */
  async rollback(): Promise<string> {
    if (this.mode === "repo") {
      if (!this.originalBranch || this.originalBranch === "HEAD") {
        await this.git(["checkout", "--quiet", this.baseCommit]);
        return `Checked out ${this.baseCommit.slice(0, 10)}; branch ${this.branch} is kept.`;
      }
      await this.git(["checkout", "--quiet", this.originalBranch]);
      return `Switched back to ${this.originalBranch}; branch ${this.branch} is kept for inspection.`;
    }
    await this.commitStep("rollback-snapshot", "state before rollback");
    const added = (await this.git(["diff", "--name-only", "--diff-filter=A", this.baseCommit, "HEAD"])).split(/\r?\n/).filter(Boolean);
    await this.git(["checkout", this.baseCommit, "--", "."]);
    for (const file of added) rmSync(path.join(this.workTree, file), { force: true });
    return `Restored ${this.workTree} to the baseline (${added.length} added file(s) removed).`;
  }

  static reopen(mode: GitMode, workTree: string, gitDir: string | null, baseCommit: string, branch: string | null, originalBranch: string | null): GitSafety {
    const safety = new GitSafety(mode, workTree, gitDir);
    safety.baseCommit = baseCommit;
    safety.branch = branch;
    safety.originalBranch = originalBranch;
    return safety;
  }

  get shadowGitDir(): string | null {
    return this.gitDir;
  }

  async head(): Promise<string> {
    return (await this.git(["rev-parse", "HEAD"])).trim();
  }
}

/** Temp-folder prefix for dry-run work copies. */
export const workCopyPrefix = "leapfrog-dry-";
/** Prefix used before the rename from java-migrator; such leftovers are still cleaned up. */
const legacyWorkCopyPrefix = "java-migrator-dry-";

/** Copy a repository into a temp folder for a whole-pipeline dry run (no build output, no .git). */
export function createWorkCopy(repoPath: string, extraSkip: string[] = []): string {
  const root = mkdtempSync(path.join(os.tmpdir(), workCopyPrefix));
  const target = path.join(root, path.basename(repoPath) || "repo");
  const skip = new Set(["target", ".gradle", "node_modules", ".git", ".idea", ...extraSkip]);
  cpSync(repoPath, target, {
    recursive: true,
    filter: (source) => {
      if (source === repoPath) return true;
      const name = path.basename(source);
      if (skip.has(name)) return false;
      if (name === planFileName && path.dirname(source) === repoPath) return false;
      const relative = path.relative(repoPath, source).split(path.sep);
      // Skip Gradle build/ output folders, but keep source packages named "build".
      if (name === "build" && !relative.includes("src")) return false;
      return true;
    },
  });
  return target;
}

export function removeWorkCopy(workPath: string): void {
  const root = path.dirname(workPath);
  const name = path.basename(root);
  if ((name.startsWith(workCopyPrefix) || name.startsWith(legacyWorkCopyPrefix)) && existsSync(root)) rmSync(root, { recursive: true, force: true });
}

import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir, envSetting } from "./config.js";
import { isInside, safeRealpath } from "./repo.js";

/** Where a migrated project came from. Stored on plans and runs (never with a token). */
export type RepoSource = {
  type: "github";
  /** Clean web URL, e.g. https://github.com/owner/repo (no credentials). */
  url: string;
  owner: string;
  repo: string;
  /** The branch that was checked out (the default branch when none was asked for). */
  branch: string | null;
  /** Commit the clone was at after the last clone/refresh. */
  commit: string | null;
  clonedAt: string;
  /** Project folder Verdigrade migrates (the clone, or a subfolder of it). Changes stay here; nothing is pushed to GitHub. */
  localPath: string;
  /** The git clone (the repository root). Equals localPath unless the project is in a subfolder. */
  clonePath?: string;
  /** Project subfolder inside the repository, e.g. "demo" (null = repository root). */
  subdir?: string | null;
  /** True when Verdigrade found the subfolder itself (the link pointed at the repository root). */
  autoDetected?: boolean;
};

/** A project folder found inside a repository (for "which one?" choices). */
export type ProjectCandidate = { subdir: string; ecosystem: string };

export type GitHubRef = {
  owner: string;
  repo: string;
  branch: string | null;
  /** https://github.com/owner/repo (web URL, no .git). */
  webUrl: string;
  /** https://github.com/owner/repo.git (what git clones). */
  cloneUrl: string;
  /** Folder name under data/repos: owner__repo (lower case; GitHub names are case-insensitive). */
  slug: string;
  /** Project subfolder from the link (…/tree/<branch>/<sub/path>) or the explicit field. */
  subdir: string | null;
  /**
   * Segments after /tree/ or /blob/ when the branch could contain slashes
   * (e.g. tree/feature/x/demo). Resolved against the remote branches when cloning.
   */
  treeSegments: string[] | null;
  /** True when the branch came from the explicit field (never re-split). */
  branchExplicit: boolean;
};

export class GitHubSourceError extends Error {
  constructor(
    message: string,
    readonly code: "invalid" | "not-found" | "branch" | "git-missing" | "network" | "timeout" | "busy" | "no-project" | "choose" | "failed" = "failed",
    /** For code "choose": the project folders found in the repository. */
    readonly candidates: ProjectCandidate[] = [],
  ) {
    super(message);
  }
}

const subdirSegment = /^[A-Za-z0-9._ @+-]{1,100}$/;

/** Validate a project subfolder ("demo", "services/api"). Returns a clean "a/b" path or null. */
export function validateSubdir(subdir: string | null | undefined): string | null {
  const value = (subdir ?? "").trim().replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+|\/+$/g, "");
  if (!value) return null;
  const parts = value.split("/");
  if (
    value.length > 300 ||
    parts.length > 12 ||
    parts.some((part) => !subdirSegment.test(part) || part === "." || part === ".." || part.trim() !== part || part === ".git")
  ) {
    throw new GitHubSourceError(`"${value.slice(0, 80)}" is not a valid subfolder. Use a folder path inside the repository, like demo or services/api.`, "invalid");
  }
  return parts.join("/");
}

const ownerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const repoPattern = /^[A-Za-z0-9._-]{1,100}$/;
const branchPattern = /^[A-Za-z0-9._/-]{1,200}$/;
const tokenPattern = /^[A-Za-z0-9_.-]{1,255}$/;
const githubLike = /^(?:(?:https?|ssh|git):\/\/|git@)?(?:[^/@\s]+@)?(?:www\.)?github\.com[/:]/i;

/** True when the text looks like a GitHub repository link (it may still be invalid; parseGitHubUrl says why). */
export function isGitHubInput(input: string | null | undefined): boolean {
  return typeof input === "string" && githubLike.test(input.trim());
}

/** Validate a branch / tag name strictly (no option-looking or path-escaping names). */
export function validateBranch(branch: string | null | undefined): string | null {
  const value = (branch ?? "").trim();
  if (!value) return null;
  if (
    !branchPattern.test(value) ||
    value.startsWith("-") ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.endsWith(".") ||
    value.endsWith(".lock") ||
    value.includes("..") ||
    value.includes("//") ||
    value.includes("/.")
  ) {
    throw new GitHubSourceError(`"${value.slice(0, 80)}" is not a valid branch name. Use letters, numbers, dots, dashes, underscores and slashes.`, "invalid");
  }
  return value;
}

/**
 * Parse a GitHub repository link. Accepts https://github.com/owner/repo(.git),
 * …/tree/<branch>, github.com/owner/repo and git@github.com:owner/repo.git.
 * Only github.com is allowed and owner/repo characters are checked strictly,
 * so nothing user-typed can become a git option or reach another host.
 */
export function parseGitHubUrl(input: string, branchOverride?: string | null, subdirOverride?: string | null): GitHubRef {
  const raw = (input ?? "").trim();
  if (!raw) throw new GitHubSourceError("Paste a GitHub repository link, e.g. https://github.com/owner/repo.", "invalid");
  if (raw.length > 500 || /\s/.test(raw)) throw new GitHubSourceError("That GitHub link has spaces or is too long.", "invalid");
  let rest: string;
  const ssh = /^git@github\.com:(.+)$/i.exec(raw) ?? /^ssh:\/\/git@github\.com\/(.+)$/i.exec(raw);
  if (ssh) {
    rest = ssh[1];
  } else {
    const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
    let url: URL;
    try {
      url = new URL(withScheme);
    } catch {
      throw new GitHubSourceError("That does not look like a GitHub link. Use https://github.com/owner/repo.", "invalid");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new GitHubSourceError("Use an https://github.com/… link.", "invalid");
    const host = url.hostname.toLowerCase();
    if (host !== "github.com" && host !== "www.github.com") throw new GitHubSourceError(`Only github.com links are supported (got ${host}).`, "invalid");
    if (url.username || url.password) {
      throw new GitHubSourceError("Do not put a token or password inside the link. Paste the plain link and use the token field (or VERDIGRADE_GITHUB_TOKEN) for private repos.", "invalid");
    }
    if (url.port) throw new GitHubSourceError("GitHub links must not include a port.", "invalid");
    rest = decodeURIComponent(url.pathname);
  }
  const parts = rest.replace(/^\/+/, "").replace(/\/+$/, "").split("/");
  if (parts.length < 2 || !parts[0] || !parts[1]) throw new GitHubSourceError("The link needs both an owner and a repository name: https://github.com/owner/repo.", "invalid");
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (!ownerPattern.test(owner)) throw new GitHubSourceError(`"${owner.slice(0, 60)}" is not a valid GitHub owner name.`, "invalid");
  if (!repoPattern.test(repo) || repo === "." || repo === ".." || repo.startsWith("-")) {
    throw new GitHubSourceError(`"${repo.slice(0, 100)}" is not a valid GitHub repository name.`, "invalid");
  }
  let treeSegments: string[] | null = null;
  if (parts.length > 2) {
    if ((parts[2] === "tree" || parts[2] === "blob") && parts.length > 3) {
      treeSegments = parts.slice(3).filter(Boolean);
      // A file link (…/blob/main/demo/pom.xml) points at its folder.
      if (parts[2] === "blob") treeSegments = treeSegments.slice(0, -1).length ? treeSegments.slice(0, -1) : treeSegments.slice(0, 1);
    } else {
      throw new GitHubSourceError("Use the repository link (https://github.com/owner/repo), a branch link (…/tree/<branch>) or a folder link (…/tree/<branch>/<folder>).", "invalid");
    }
  }
  const explicitBranch = branchOverride?.trim() ? branchOverride.trim() : null;
  let branch: string | null;
  let urlSubdir: string | null = null;
  if (explicitBranch) {
    branch = validateBranch(explicitBranch);
    // The URL's tree path starts with the branch: what follows is the subfolder.
    const branchParts = explicitBranch.split("/");
    if (treeSegments && branchParts.every((part, index) => treeSegments![index] === part)) urlSubdir = treeSegments.slice(branchParts.length).join("/") || null;
    else if (treeSegments) urlSubdir = treeSegments.slice(1).join("/") || null;
  } else if (treeSegments?.length) {
    // First segment is the branch until the remote branch list says otherwise (see resolveTreeRef).
    branch = validateBranch(treeSegments[0]);
    urlSubdir = treeSegments.slice(1).join("/") || null;
  } else {
    branch = null;
  }
  const subdir = validateSubdir(subdirOverride?.trim() ? subdirOverride : urlSubdir);
  return {
    owner,
    repo,
    branch,
    webUrl: `https://github.com/${owner}/${repo}`,
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
    slug: `${owner}__${repo}`.toLowerCase(),
    subdir,
    treeSegments: treeSegments && treeSegments.length > 1 && !explicitBranch ? treeSegments : null,
    branchExplicit: Boolean(explicitBranch),
  };
}

/**
 * With a link like …/tree/feature/login/demo the branch may be "feature" or "feature/login".
 * Pick the longest remote branch that the path starts with (first segment when none match).
 */
export function resolveTreeRef(ref: GitHubRef, remoteBranches: string[], explicitSubdir: boolean): GitHubRef {
  if (!ref.treeSegments) return ref;
  const segments = ref.treeSegments;
  let best = 1;
  for (const name of remoteBranches) {
    const parts = name.split("/");
    if (parts.length > best && parts.length <= segments.length && parts.every((part, index) => segments[index] === part)) best = parts.length;
  }
  const branch = validateBranch(segments.slice(0, best).join("/"));
  const subdir = explicitSubdir ? ref.subdir : validateSubdir(segments.slice(best).join("/"));
  return { ...ref, branch, subdir };
}

/** Token for private repos: the one given for this request, else VERDIGRADE_GITHUB_TOKEN, else GITHUB_TOKEN. */
export function githubToken(explicit?: string | null): string | null {
  const value = explicit?.trim() || envSetting("GITHUB_TOKEN")?.trim() || process.env.GITHUB_TOKEN?.trim() || "";
  if (!value) return null;
  if (!tokenPattern.test(value)) throw new GitHubSourceError("The GitHub token has unexpected characters. Paste the token exactly as GitHub showed it.", "invalid");
  return value;
}

const secretPatterns: RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /(https?:\/\/)[^/\s:@]+(?::[^/\s@]*)?@/gi,
  /(authorization:\s*(?:basic|bearer|token)\s+)[A-Za-z0-9+/=._-]+/gi,
];

/** Remove tokens (the given ones and anything token-shaped) from text before it is logged, stored or returned. */
export function maskSecrets(text: string, secrets: Array<string | null | undefined> = []): string {
  let out = String(text ?? "");
  for (const secret of secrets) {
    if (!secret || secret.length < 4) continue;
    out = out.split(secret).join("***");
    const basic = Buffer.from(`x-access-token:${secret}`).toString("base64");
    out = out.split(basic).join("***");
  }
  for (const pattern of secretPatterns) {
    out = out.replace(pattern, (match, prefix?: string) => (typeof prefix === "string" && prefix && match.startsWith(prefix) ? `${prefix}***${match.endsWith("@") ? "@" : ""}` : "***"));
  }
  return out;
}

/** Folder that holds GitHub clones (data/repos). Always an allowed root. */
export function reposDir(): string {
  return path.join(dataDir(), "repos");
}

export function clonePathFor(ref: GitHubRef): string {
  return path.join(reposDir(), ref.slug);
}

function sidecarPath(slug: string): string {
  return path.join(reposDir(), `${slug}.source.json`);
}

/** Source info for a folder inside data/repos (null for ordinary local folders). */
export function sourceForPath(repoPath: string | null | undefined): RepoSource | null {
  if (!repoPath) return null;
  try {
    const root = safeRealpath(reposDir());
    const real = safeRealpath(repoPath);
    if (!isInside(root, real) || root === real) return null;
    const slug = path.relative(root, real).split(/[\\/]/)[0];
    if (!slug || slug.includes(".tmp-")) return null;
    const file = sidecarPath(slug.toLowerCase());
    if (!existsSync(file)) return null;
    const data = JSON.parse(readFileSync(file, "utf8")) as RepoSource;
    if (data?.type !== "github") return null;
    const clonePath = path.join(root, slug);
    const subdir = path.relative(safeRealpath(clonePath), real).split(path.sep).filter(Boolean).join("/") || null;
    return { ...data, clonePath: data.clonePath ?? clonePath, localPath: real, subdir, autoDetected: Boolean(data.autoDetected && subdir && data.subdir === subdir) };
  } catch {
    return null;
  }
}

type GitResult = { stdout: string; stderr: string };

function gitEnv(token: string | null): NodeJS.ProcessEnv {
  // Never prompt (a private repo must fail fast, not hang or pop up a credential window).
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never", GIT_ASKPASS: "", SSH_ASKPASS: "" };
  const config: Array<[string, string]> = [["credential.helper", ""], ["core.askPass", ""]];
  // The token travels as an HTTP header through environment config: it is never in the
  // command line, never in .git/config and never in the remote URL.
  if (token) config.push(["http.https://github.com/.extraheader", `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`]);
  env.GIT_CONFIG_COUNT = String(config.length);
  config.forEach(([key, value], index) => {
    env[`GIT_CONFIG_KEY_${index}`] = key;
    env[`GIT_CONFIG_VALUE_${index}`] = value;
  });
  return env;
}

function git(args: string[], options: { cwd?: string; token: string | null; timeoutMs?: number; signal?: AbortSignal }): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd: options.cwd, env: gitEnv(options.token), timeout: options.timeoutMs ?? 10 * 60_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true, signal: options.signal },
      (error, stdout, stderr) => {
        if (error) {
          const failure = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
          reject(Object.assign(failure, { stdout: String(stdout ?? ""), stderr: String(stderr ?? "") }));
          return;
        }
        resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
      },
    );
  });
}

/** Turn a git failure into a plain-English message (tokens masked). */
export function explainGitError(error: unknown, ref: GitHubRef, token: string | null): GitHubSourceError {
  const failure = error as NodeJS.ErrnoException & { stderr?: string; killed?: boolean; signal?: string };
  if (failure?.code === "ENOENT") {
    return new GitHubSourceError("Git is not installed (or not on PATH). Install Git from https://git-scm.com, restart Verdigrade, and try again.", "git-missing");
  }
  if (failure?.name === "AbortError") return new GitHubSourceError("Cloning was cancelled.", "failed");
  if (failure?.killed || failure?.signal === "SIGTERM") {
    return new GitHubSourceError(`Cloning ${ref.owner}/${ref.repo} took too long and was stopped. Check your internet connection, or try a smaller repository.`, "timeout");
  }
  const detail = maskSecrets(`${failure?.stderr ?? ""}\n${failure?.message ?? ""}`, [token]).trim();
  const lower = detail.toLowerCase();
  if (/remote branch .* not found|couldn't find remote ref|could not find remote branch/.test(lower)) {
    return new GitHubSourceError(`The branch "${ref.branch}" does not exist in ${ref.owner}/${ref.repo}. Leave the branch empty to use the default branch.`, "branch");
  }
  if (/repository not found|could not read username|authentication failed|terminal prompts disabled|403|401|invalid username or password|access denied/.test(lower)) {
    return new GitHubSourceError(
      token
        ? `GitHub could not find ${ref.owner}/${ref.repo}, or the token has no access to it. Check the link, and that the token can read this repository (Contents: read).`
        : `GitHub could not find ${ref.owner}/${ref.repo}. Check the link. If the repository is private, add a GitHub token (the token field, or set VERDIGRADE_GITHUB_TOKEN).`,
      "not-found",
    );
  }
  if (/could not resolve host|failed to connect|connection timed out|network is unreachable|unable to access/.test(lower)) {
    return new GitHubSourceError("Could not reach github.com. Check your internet connection (or proxy) and try again.", "network");
  }
  const last = detail.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-3).join(" ");
  return new GitHubSourceError(`Git could not get ${ref.owner}/${ref.repo}: ${last || "unknown error"}`.slice(0, 600), "failed");
}

const pending = new Map<string, Promise<{ source: RepoSource; ref: GitHubRef }>>();

export type CloneOptions = {
  url: string;
  branch?: string | null;
  token?: string | null;
  /** true: fetch the latest commit and reset an existing clone; false: reuse it as it is. */
  refresh?: boolean;
  signal?: AbortSignal;
  /** Called before an existing clone is reset; throw to refuse (e.g. a run is using it). */
  beforeReset?: (localPath: string) => void;
  /** Project subfolder inside the repository (wins over the link's /tree/<branch>/<folder>). */
  subdir?: string | null;
  /** Ecosystem detector (adapters' detectEcosystem). Enables the "find the project in a subfolder" search. */
  detect?: (dir: string) => string | null;
};

const skipDirs = new Set(["node_modules", "target", "build", "dist", "out", "venv", "env", "__pycache__", "vendor", "bin", "obj", "site-packages", "coverage"]);

/** Project folders one or two levels below `root` (a folder that is a project is not searched further). */
export function findProjects(root: string, detect: (dir: string) => string | null, maxDepth = 2, limit = 25): ProjectCandidate[] {
  const found: ProjectCandidate[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth || found.length >= limit) return;
    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || skipDirs.has(entry.name.toLowerCase())) continue;
      const full = path.join(dir, entry.name);
      const ecosystem = detect(full);
      if (ecosystem) {
        found.push({ subdir: path.relative(root, full).split(path.sep).join("/"), ecosystem });
        if (found.length >= limit) return;
      } else {
        walk(full, depth + 1);
      }
    }
  };
  walk(root, 1);
  return found;
}

/** Pick the project folder inside a clone: the asked-for subfolder, the root, or the one project found below it. */
export function projectInClone(clone: RepoSource, ref: Pick<GitHubRef, "owner" | "repo" | "subdir">, detect?: (dir: string) => string | null): RepoSource {
  const clonePath = clone.clonePath ?? clone.localPath;
  const at = (subdir: string | null, autoDetected: boolean): RepoSource => ({
    ...clone,
    clonePath,
    localPath: subdir ? safeRealpath(path.join(clonePath, ...subdir.split("/"))) : clonePath,
    subdir,
    autoDetected,
  });
  const where = `${ref.owner}/${ref.repo}${clone.branch ? ` (branch ${clone.branch})` : ""}`;
  if (ref.subdir) {
    const dir = path.join(clonePath, ...ref.subdir.split("/"));
    let isDir = false;
    try {
      isDir = statSync(dir).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) throw new GitHubSourceError(`The folder "${ref.subdir}" does not exist in ${where}. Check the folder name (it is case-sensitive), or leave the subfolder empty.`, "no-project");
    return at(ref.subdir, false);
  }
  if (!detect || detect(clonePath)) return at(null, false);
  const candidates = findProjects(clonePath, detect);
  if (candidates.length === 1) return at(candidates[0].subdir, true);
  if (candidates.length > 1) {
    throw new GitHubSourceError(
      `${where} has ${candidates.length} projects in subfolders: ${candidates.map((item) => `${item.subdir} (${item.ecosystem})`).join(", ")}. Pick one as the subfolder.`,
      "choose",
      candidates,
    );
  }
  throw new GitHubSourceError(
    `No Java, Node or Python project found in ${where}: there is no pom.xml, build.gradle, package.json, pyproject.toml or requirements.txt in the repository root or the two folder levels below it.`,
    "no-project",
  );
}

/**
 * Clone a GitHub repository into data/repos/<owner>__<repo> (shallow), or reuse /
 * refresh the existing clone. Idempotent; concurrent calls for one repo share the work.
 */
export async function cloneGitHubRepo(options: CloneOptions): Promise<RepoSource> {
  const parsed = parseGitHubUrl(options.url, options.branch, options.subdir);
  const key = `${parsed.slug}#${(parsed.treeSegments ?? [parsed.branch ?? ""]).join("/")}#${options.refresh ? 1 : 0}`;
  let job = pending.get(key);
  if (!job) {
    job = doClone(parsed, options).finally(() => pending.delete(key));
    pending.set(key, job);
  }
  const { source, ref } = await job;
  const project = projectInClone(source, ref, options.detect);
  // Remember the chosen subfolder next to the clone (never a token) so plans and runs can show it.
  writeFileSync(sidecarPath(ref.slug), `${JSON.stringify({ ...project, localPath: project.clonePath }, null, 2)}\n`, "utf8");
  return project;
}

/**
 * Delete a folder tree, best effort. Git marks pack files read-only, which makes a plain
 * delete fail with EPERM on Windows, so files are made writable and the delete retried.
 */
export function removeTree(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    return;
  } catch {
    /* fall through: clear read-only flags and retry */
  }
  const makeWritable = (current: string) => {
    let entries: import("node:fs").Dirent[] = [];
    try {
      chmodSync(current, 0o777);
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) makeWritable(full);
      else {
        try {
          chmodSync(full, 0o666);
        } catch {
          /* ignore */
        }
      }
    }
  };
  makeWritable(dir);
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}

/** Remove temp folders left by older versions (they cloned into <slug>.tmp-xxxx first). Best effort. */
function sweepTempFolders(): void {
  try {
    for (const name of readdirSync(reposDir())) {
      if (name.includes(".tmp-")) {
        try {
          removeTree(path.join(reposDir(), name));
        } catch {
          /* still locked; try again next time */
        }
      }
    }
  } catch {
    /* no repos folder yet */
  }
}

type GitCall = (args: string[], cwd?: string, timeoutMs?: number) => Promise<GitResult>;
type RemoteHeads = { heads: Map<string, string>; defaultBranch: string | null };

/** Branch heads per repository, kept for a minute so back-to-back requests share one round trip. */
const headsCache = new Map<string, { at: number; value: RemoteHeads }>();

/** `git ls-remote --symref <url> HEAD refs/heads/*`: every branch head plus the default branch, in one call. */
async function remoteHeads(call: GitCall, cloneUrl: string): Promise<RemoteHeads> {
  const cached = headsCache.get(cloneUrl);
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  const out = (await call(["ls-remote", "--symref", "--", cloneUrl, "HEAD", "refs/heads/*"], undefined, 120_000)).stdout;
  const heads = new Map<string, string>();
  let defaultBranch: string | null = null;
  for (const line of out.split(/\r?\n/)) {
    const symref = /^ref:\s+refs\/heads\/(\S+)\s+HEAD$/.exec(line.trim());
    if (symref) defaultBranch = symref[1];
    const head = /^([0-9a-f]{40,64})\s+refs\/heads\/(\S+)$/.exec(line.trim());
    if (head) heads.set(head[2], head[1]);
  }
  const value = { heads, defaultBranch };
  headsCache.set(cloneUrl, { at: Date.now(), value });
  return value;
}

/** `git status --porcelain` lines other than an exported migration-plan.json. */
function localEdits(status: string): boolean {
  return status.split(/\r?\n/).some((line) => line.trim() && !/migration-plan\.json$/.test(line.trim()));
}

/** Seconds a refreshed clone counts as current (VERDIGRADE_CLONE_FRESH_SECONDS, default 600; 0 = always ask GitHub). */
export function cloneFreshMs(): number {
  const raw = Number(envSetting("CLONE_FRESH_SECONDS") ?? "600");
  return Number.isFinite(raw) && raw >= 0 ? raw * 1000 : 600_000;
}

/**
 * The existing clone, without touching the network, when it was refreshed from
 * GitHub less than cloneFreshMs() ago, is on the asked-for branch and has no local edits.
 */
async function freshClone(ref: GitHubRef, target: string, call: GitCall, explicitSubdir: boolean): Promise<{ source: RepoSource; ref: GitHubRef } | null> {
  const freshMs = cloneFreshMs();
  if (!freshMs) return null;
  let saved: RepoSource | null = null;
  try {
    saved = JSON.parse(readFileSync(sidecarPath(ref.slug), "utf8")) as RepoSource;
  } catch {
    return null;
  }
  if (!saved?.branch || !saved.commit || Date.now() - Date.parse(saved.clonedAt) > freshMs) return null;
  let resolved = ref;
  if (ref.treeSegments) {
    const known = saved.branch.split("/");
    if (!known.every((part, index) => ref.treeSegments![index] === part)) return null;
    resolved = resolveTreeRef(ref, [saved.branch], explicitSubdir);
  }
  if (resolved.branch && resolved.branch !== saved.branch) return null;
  const current = (await call(["rev-parse", "--abbrev-ref", "HEAD"], target)).stdout.trim();
  const commit = (await call(["rev-parse", "HEAD"], target)).stdout.trim();
  if (current !== saved.branch || commit !== saved.commit) return null;
  if (localEdits((await call(["status", "--porcelain"], target)).stdout)) return null;
  const clonePath = safeRealpath(target);
  return { source: { type: "github", url: ref.webUrl, owner: ref.owner, repo: ref.repo, branch: saved.branch, commit, clonedAt: saved.clonedAt, localPath: clonePath, clonePath, subdir: null }, ref: resolved };
}

async function doClone(parsed: GitHubRef, options: CloneOptions): Promise<{ source: RepoSource; ref: GitHubRef }> {
  const token = githubToken(options.token);
  let ref = parsed;
  const target = clonePathFor(ref);
  mkdirSync(reposDir(), { recursive: true });
  sweepTempFolders();
  const call = (args: string[], cwd?: string, timeoutMs?: number) => git(args, { cwd, token, signal: options.signal, timeoutMs });
  const existing = existsSync(path.join(target, ".git"));
  try {
    if (existing && options.refresh) {
      // Fast path 1: refreshed from GitHub a few minutes ago and untouched since → no network at all.
      const fresh = await freshClone(ref, target, call, Boolean(options.subdir?.trim()));
      if (fresh) return fresh;
    }
    // One round trip tells us every branch, the default branch and each head commit.
    let remote: RemoteHeads | null = null;
    if (ref.treeSegments || (existing && options.refresh)) remote = await remoteHeads(call, ref.cloneUrl);
    if (ref.treeSegments) ref = resolveTreeRef(ref, [...remote!.heads.keys()], Boolean(options.subdir?.trim()));
    if (existing) {
      const current = (await call(["rev-parse", "--abbrev-ref", "HEAD"], target)).stdout.trim();
      const wantBranch = ref.branch;
      const sameBranch = !wantBranch || wantBranch === current || sourceForPath(target)?.branch === wantBranch;
      if (options.refresh || !sameBranch) {
        options.beforeReset?.(target);
        let branch = wantBranch ?? remote?.defaultBranch ?? (current && current !== "HEAD" ? current : null);
        if (branch) validateBranch(branch);
        const remoteSha = branch ? remote?.heads.get(branch) ?? null : null;
        const localSha = (await call(["rev-parse", "HEAD"], target)).stdout.trim();
        if (branch && branch === current && remoteSha && remoteSha === localSha) {
          // Fast path 2: GitHub has nothing new → skip the fetch; only undo local edits if there are any.
          const dirty = localEdits((await call(["status", "--porcelain"], target)).stdout);
          if (dirty) {
            await call(["checkout", "-f", "-B", branch, "HEAD"], target);
            await call(["clean", "-fd", "-e", "migration-plan.json"], target);
          }
        } else {
          await call(["remote", "set-url", "origin", ref.cloneUrl], target);
          await call(["fetch", "--depth", "1", "--no-tags", "origin", branch ? `+refs/heads/${branch}:refs/remotes/origin/${branch}` : "HEAD"], target);
          await call(["checkout", "-f", "-B", branch ?? "main", branch ? `refs/remotes/origin/${branch}` : "FETCH_HEAD"], target);
          // Keep an exported plan file (migration-plan.json) so the CLI plan → migrate flow keeps working.
          await call(["clean", "-fd", "-e", "migration-plan.json"], target);
        }
      }
    } else {
      // A folder without .git is a leftover from an interrupted clone: start clean.
      if (existsSync(target)) removeTree(target);
      // Clone straight into the final folder (git removes it itself when the clone fails).
      // No temp folder + rename: on Windows, antivirus scanning makes renaming a fresh clone fail with EPERM.
      try {
        await call(["clone", "--depth", "1", "--no-tags", "--single-branch", ...(ref.branch ? ["--branch", ref.branch] : []), "--", ref.cloneUrl, target]);
      } catch (error) {
        if (existsSync(target)) removeTree(target);
        throw error;
      }
      // Belt and braces: the remote is the clean URL (the token never went into it).
      await call(["remote", "set-url", "origin", ref.cloneUrl], target);
    }
    const branch = (await call(["rev-parse", "--abbrev-ref", "HEAD"], target)).stdout.trim() || ref.branch;
    const commit = (await call(["rev-parse", "HEAD"], target)).stdout.trim() || null;
    const source: RepoSource = {
      type: "github",
      url: ref.webUrl,
      owner: ref.owner,
      repo: ref.repo,
      branch: branch && branch !== "HEAD" ? branch : ref.branch,
      commit,
      clonedAt: new Date().toISOString(),
      localPath: safeRealpath(target),
      clonePath: safeRealpath(target),
      subdir: null,
    };
    writeFileSync(sidecarPath(ref.slug), `${JSON.stringify(source, null, 2)}\n`, "utf8");
    return { source, ref };
  } catch (error) {
    if (error instanceof GitHubSourceError) throw error;
    throw explainGitError(error, ref, token);
  }
}

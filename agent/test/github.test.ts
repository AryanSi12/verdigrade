import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findProjects, GitHubSourceError, githubToken, isGitHubInput, maskSecrets, parseGitHubUrl, projectInClone, resolveTreeRef, sourceForPath, validateBranch, validateSubdir, type RepoSource } from "../bot/lib/github.js";
import { assertAllowedPath } from "../bot/lib/repo.js";

describe("parseGitHubUrl", () => {
  it.each([
    ["https://github.com/spring-guides/gs-rest-service", "spring-guides", "gs-rest-service", null],
    ["https://github.com/spring-guides/gs-rest-service.git", "spring-guides", "gs-rest-service", null],
    ["https://github.com/spring-guides/gs-rest-service/", "spring-guides", "gs-rest-service", null],
    ["http://www.github.com/Owner/Repo.js", "Owner", "Repo.js", null],
    ["github.com/owner/repo", "owner", "repo", null],
    ["https://github.com/owner/repo/tree/main", "owner", "repo", "main"],
    ["git@github.com:owner/my_repo.git", "owner", "my_repo", null],
    ["ssh://git@github.com/owner/repo.git", "owner", "repo", null],
    ["https://github.com/owner/repo?tab=readme#top", "owner", "repo", null],
  ])("parses %s", (input, owner, repo, branch) => {
    const ref = parseGitHubUrl(input);
    expect(ref).toMatchObject({ owner, repo, branch });
    expect(ref.cloneUrl).toBe(`https://github.com/${owner}/${repo}.git`);
    expect(ref.webUrl).toBe(`https://github.com/${owner}/${repo}`);
    expect(ref.slug).toBe(`${owner}__${repo}`.toLowerCase());
  });

  it("lets an explicit branch win over the /tree/ branch", () => {
    expect(parseGitHubUrl("https://github.com/o/r/tree/main", "dev").branch).toBe("dev");
  });

  it.each([
    "",
    "https://gitlab.com/owner/repo",
    "https://github.com.evil.com/owner/repo",
    "https://evil.com/github.com/owner/repo",
    "https://github.com/owner",
    "https://github.com/-owner/repo",
    "https://github.com/owner/..",
    "https://github.com/owner/repo;rm -rf",
    "https://github.com/owner/$(whoami)",
    "https://github.com/owner/repo/issues/1",
    "https://github.com/owner/repo/tree/main/../../etc",
    "https://user:ghp_secretsecretsecret123@github.com/owner/repo",
    "https://github.com:8443/owner/repo",
    "ftp://github.com/owner/repo",
    "file:///etc/passwd",
  ])("rejects %s", (input) => {
    expect(() => parseGitHubUrl(input)).toThrow(GitHubSourceError);
  });

  it("rejects option-looking or escaping branch names", () => {
    for (const bad of ["--upload-pack=sh", "-b", "a..b", "a b", "a;b", "/abs", "x/", "x.lock", "$(id)"]) {
      expect(() => validateBranch(bad), bad).toThrow(GitHubSourceError);
    }
    expect(validateBranch("release/2.1")).toBe("release/2.1");
    expect(validateBranch("  ")).toBeNull();
    expect(() => parseGitHubUrl("https://github.com/o/r/tree/--upload-pack=x")).toThrow(GitHubSourceError);
  });

  it("tells GitHub links apart from local paths", () => {
    expect(isGitHubInput("https://github.com/o/r")).toBe(true);
    expect(isGitHubInput("git@github.com:o/r.git")).toBe(true);
    expect(isGitHubInput("github.com/o/r")).toBe(true);
    expect(isGitHubInput("C:\\Users\\me\\github.com\\x")).toBe(false);
    expect(isGitHubInput("/home/me/projects/app")).toBe(false);
    expect(isGitHubInput("")).toBe(false);
  });
});

describe("maskSecrets", () => {
  it("removes a given token and its basic-auth form", () => {
    const token = "abcd1234efgh5678";
    const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
    const out = maskSecrets(`fatal: ${token} and header ${basic}`, [token]);
    expect(out).not.toContain(token);
    expect(out).not.toContain(basic);
  });

  it("removes token-shaped strings and URL credentials even when not given", () => {
    const out = maskSecrets(
      "remote: https://x-access-token:ghp_AAAAAAAAAAAAAAAAAAAAAAAA@github.com/o/r.git github_pat_11ABCDEFGHIJKLMNOPQRSTUVWX gho_1234567890abcdefghij Authorization: Basic eC1hY2Nlc3M=",
    );
    expect(out).not.toMatch(/ghp_|github_pat_|gho_|eC1hY2Nlc3M=/);
    expect(out).toContain("https://***@github.com/o/r.git");
  });

  it("leaves ordinary text alone", () => {
    expect(maskSecrets("fatal: repository 'https://github.com/o/r.git/' not found")).toBe("fatal: repository 'https://github.com/o/r.git/' not found");
  });
});

describe("githubToken", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("prefers the request token, then LEAPFROG_GITHUB_TOKEN, then GITHUB_TOKEN", () => {
    delete process.env.LEAPFROG_GITHUB_TOKEN;
    delete process.env.JAVA_MIGRATOR_GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "from_github_env";
    expect(githubToken()).toBe("from_github_env");
    process.env.LEAPFROG_GITHUB_TOKEN = "from_leapfrog_env";
    expect(githubToken()).toBe("from_leapfrog_env");
    expect(githubToken("  from_request ")).toBe("from_request");
  });

  it("rejects tokens with shell or header characters", () => {
    expect(() => githubToken("abc\r\nX-Evil: 1")).toThrow(GitHubSourceError);
    expect(() => githubToken("abc;rm")).toThrow(GitHubSourceError);
  });
});

describe("clone folder", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("is always an allowed root and its source sidecar is read back", () => {
    const data = mkdtempSync(path.join(os.tmpdir(), "leapfrog-gh-"));
    process.env.LEAPFROG_DATA_DIR = data;
    process.env.LEAPFROG_ROOTS = path.join(data, "elsewhere");
    const clone = path.join(data, "repos", "owner__repo");
    mkdirSync(path.join(clone, "src"), { recursive: true });
    const source = { type: "github", url: "https://github.com/owner/repo", owner: "owner", repo: "repo", branch: "main", commit: "abc", clonedAt: "now", localPath: clone };
    writeFileSync(path.join(data, "repos", "owner__repo.source.json"), JSON.stringify(source));
    expect(() => assertAllowedPath(clone)).not.toThrow();
    expect(sourceForPath(path.join(clone, "src"))).toMatchObject({ url: "https://github.com/owner/repo", branch: "main" });
    expect(sourceForPath(data)).toBeNull();
    expect(JSON.stringify(sourceForPath(clone))).not.toMatch(/token/i);
  });
});

describe("subfolder links", () => {
  it("reads the branch and folder from …/tree/<branch>/<folder>", () => {
    const ref = parseGitHubUrl("https://github.com/AryanSi12/BookingApp-BackEnd/tree/main/demo");
    expect(ref).toMatchObject({ owner: "AryanSi12", repo: "BookingApp-BackEnd", branch: "main", subdir: "demo", slug: "aryansi12__bookingapp-backend" });
    expect(ref.treeSegments).toEqual(["main", "demo"]);
  });

  it("uses the folder of a file link", () => {
    expect(parseGitHubUrl("https://github.com/o/r/blob/main/demo/pom.xml")).toMatchObject({ branch: "main", subdir: "demo" });
    expect(parseGitHubUrl("https://github.com/o/r/blob/main/README.md")).toMatchObject({ branch: "main", subdir: null });
  });

  it("resolves branches with slashes against the remote branch list", () => {
    const ref = parseGitHubUrl("https://github.com/o/r/tree/feature/login/services/api");
    expect(resolveTreeRef(ref, ["main", "feature/login"], false)).toMatchObject({ branch: "feature/login", subdir: "services/api" });
    expect(resolveTreeRef(ref, ["main"], false)).toMatchObject({ branch: "feature", subdir: "login/services/api" });
  });

  it("lets explicit branch and subfolder fields win", () => {
    expect(parseGitHubUrl("https://github.com/o/r/tree/feature/login/demo", "feature/login")).toMatchObject({ branch: "feature/login", subdir: "demo", treeSegments: null });
    expect(parseGitHubUrl("https://github.com/o/r/tree/main/demo", null, "other/app")).toMatchObject({ branch: "main", subdir: "other/app" });
    expect(parseGitHubUrl("https://github.com/o/r", null, "./demo/")).toMatchObject({ branch: null, subdir: "demo" });
  });

  it("validates subfolders", () => {
    expect(validateSubdir("services\\api")).toBe("services/api");
    expect(validateSubdir("")).toBeNull();
    for (const bad of ["..", "a/../b", ".git", "C:/x", "a;b", "$(id)", "a/./b"]) expect(() => validateSubdir(bad), bad).toThrow(GitHubSourceError);
  });
});

describe("finding the project inside a clone", () => {
  const detect = (dir: string) => (existsSync(path.join(dir, "pom.xml")) ? "java" : existsSync(path.join(dir, "package.json")) ? "node" : null);
  const make = (files: string[]) => {
    const root = mkdtempSync(path.join(os.tmpdir(), "leapfrog-find-"));
    for (const file of files) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), "{}");
    }
    return root;
  };
  const clone = (root: string): RepoSource => ({ type: "github", url: "https://github.com/o/r", owner: "o", repo: "r", branch: "main", commit: "abc", clonedAt: "now", localPath: root, clonePath: root, subdir: null });

  it("uses the one project in a subfolder and says it found it", () => {
    const root = make(["README.md", "demo/pom.xml", "demo/node_modules/x/package.json"]);
    expect(findProjects(root, detect)).toEqual([{ subdir: "demo", ecosystem: "java" }]);
    const picked = projectInClone(clone(root), { owner: "o", repo: "r", subdir: null }, detect);
    expect(picked).toMatchObject({ subdir: "demo", autoDetected: true, clonePath: root });
    expect(picked.localPath.endsWith(`${path.sep}demo`)).toBe(true);
  });

  it("finds projects two levels down and lists several as choices", () => {
    const root = make(["apps/web/package.json", "apps/api/pom.xml", ".github/x/package.json", "deep/a/b/pom.xml"]);
    let error: GitHubSourceError | null = null;
    try {
      projectInClone(clone(root), { owner: "o", repo: "r", subdir: null }, detect);
    } catch (caught) {
      error = caught as GitHubSourceError;
    }
    expect(error?.code).toBe("choose");
    expect(error?.candidates).toEqual([{ subdir: "apps/api", ecosystem: "java" }, { subdir: "apps/web", ecosystem: "node" }]);
    expect(error?.message).toContain("apps/api (java)");
  });

  it("keeps the root when it is a project, and explains when nothing is found or the folder is missing", () => {
    const root = make(["pom.xml", "module/pom.xml"]);
    expect(projectInClone(clone(root), { owner: "o", repo: "r", subdir: null }, detect)).toMatchObject({ subdir: null, localPath: root });
    const empty = make(["README.md"]);
    expect(() => projectInClone(clone(empty), { owner: "o", repo: "r", subdir: null }, detect)).toThrow(/No Java, Node or Python project/);
    expect(() => projectInClone(clone(root), { owner: "o", repo: "r", subdir: "nope" }, detect)).toThrow(/does not exist/);
  });
});

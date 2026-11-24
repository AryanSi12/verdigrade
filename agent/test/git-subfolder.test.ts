import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createWorkCopy, GitSafety, removeWorkCopy } from "../bot/lib/git.js";
import { createLockSet } from "../bot/lib/locks.js";

function repoWithSubfolder() {
  const root = mkdtempSync(path.join(os.tmpdir(), "leapfrog-sub-"));
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: root, stdio: "pipe" }).toString();
  git("init", "-q", "-b", "main");
  mkdirSync(path.join(root, "demo", "src"), { recursive: true });
  writeFileSync(path.join(root, "README.md"), "root\n");
  writeFileSync(path.join(root, "demo", "pom.xml"), "<project/>\n");
  writeFileSync(path.join(root, "demo", "src", "App.java"), "class App {}\n");
  writeFileSync(path.join(root, "demo", "locked.txt"), "keep\n");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  return { root, demo: path.join(root, "demo"), git };
}

describe("project in a subfolder of the git repository", () => {
  it("branches and commits in the git root, covering only the subfolder, with project-relative paths", async () => {
    const { root, demo, git } = repoWithSubfolder();
    const safety = await GitSafety.openRepo(demo, { branchName: "migrate/test" });
    expect(git("rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("migrate/test");
    writeFileSync(path.join(demo, "pom.xml"), "<project>21</project>\n");
    writeFileSync(path.join(demo, "locked.txt"), "changed\n");
    writeFileSync(path.join(root, "README.md"), "outside change\n");
    expect((await safety.pendingChanges()).sort()).toEqual(["locked.txt", "pom.xml"]);
    const reverted = await safety.revertLocked(createLockSet(["locked.txt"]));
    expect(reverted).toEqual([{ file: "locked.txt", pattern: "locked.txt", action: "restored" }]);
    expect(readFileSync(path.join(demo, "locked.txt"), "utf8")).toBe("keep\n");
    const commit = await safety.commitStep("rewrite", "bump");
    expect(commit?.files).toEqual(["pom.xml"]);
    expect(await safety.changedFiles()).toEqual(["pom.xml"]);
    expect(await safety.diff()).toContain("a/pom.xml");
    // The change outside the project folder is neither committed nor lost.
    expect(git("show", "--name-only", "--format=", "HEAD").trim()).toBe("demo/pom.xml");
    expect(readFileSync(path.join(root, "README.md"), "utf8")).toBe("outside change\n");
  });

  it("refuses a dirty project folder but ignores changes elsewhere in the repository", async () => {
    const { root, demo } = repoWithSubfolder();
    writeFileSync(path.join(root, "README.md"), "outside\n");
    await expect(GitSafety.openRepo(demo, { branchName: "migrate/a" })).resolves.toBeTruthy();
    const second = repoWithSubfolder();
    writeFileSync(path.join(second.demo, "pom.xml"), "dirty\n");
    await expect(GitSafety.openRepo(second.demo, { branchName: "migrate/b" })).rejects.toThrow(/not clean/);
  });

  it("dry-run copies only the project subfolder", () => {
    const { demo } = repoWithSubfolder();
    const copy = createWorkCopy(demo);
    try {
      expect(existsSync(path.join(copy, "pom.xml"))).toBe(true);
      expect(existsSync(path.join(copy, "src", "App.java"))).toBe(true);
      expect(existsSync(path.join(copy, "README.md"))).toBe(false);
      expect(existsSync(path.join(copy, ".git"))).toBe(false);
    } finally {
      removeWorkCopy(copy);
    }
  });
});

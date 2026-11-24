import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { tempDir } from "./helpers.js";
import { describe, expect, it } from "vitest";
import { changedFilesFromPatch, gradleInitScript } from "../bot/lib/build.js";
import { applyTextPatch, isAllowedRelative } from "../bot/lib/patch.js";
import { assertAllowedPath, isInside } from "../bot/lib/repo.js";

function repo(): string {
  const dir = tempDir("leapfrog-patch-");
  mkdirSync(path.join(dir, "src", "main", "resources"), { recursive: true });
  writeFileSync(path.join(dir, "pom.xml"), "<a>one</a>\n<a>two</a>\n<a>two</a>\n");
  writeFileSync(path.join(dir, "src/main/resources/application-prod.yml"), "server:\n  port: 1\n");
  return dir;
}

describe("path guard", () => {
  it("allows build files and src/ only", () => {
    expect(isAllowedRelative("pom.xml")).toBe(true);
    expect(isAllowedRelative("api/pom.xml")).toBe(true);
    expect(isAllowedRelative("src/main/resources/application-prod.yml")).toBe(true);
    expect(isAllowedRelative("src\\main\\java\\A.java")).toBe(true);
    expect(isAllowedRelative("../outside/pom.xml")).toBe(false);
    expect(isAllowedRelative("src/../../etc/passwd")).toBe(false);
    expect(isAllowedRelative("/etc/passwd")).toBe(false);
    expect(isAllowedRelative("C:\\Windows\\win.ini")).toBe(false);
    expect(isAllowedRelative("README.md")).toBe(false);
    expect(isAllowedRelative(".git/config")).toBe(false);
  });
});

describe("applyTextPatch", () => {
  it("replaces a unique span", () => {
    const dir = repo();
    expect(applyTextPatch(dir, "pom.xml", "<a>one</a>", "<a>1</a>")).toMatchObject({ ok: true, changed: true });
    expect(readFileSync(path.join(dir, "pom.xml"), "utf8")).toBe("<a>1</a>\n<a>two</a>\n<a>two</a>\n");
  });

  it("refuses an ambiguous span instead of patching the first match", () => {
    const result = applyTextPatch(repo(), "pom.xml", "<a>two</a>", "<a>2</a>");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/more than once/);
  });

  it("refuses secrets and symlink escapes", () => {
    const dir = repo();
    expect(applyTextPatch(dir, "src/main/resources/application-prod.yml", "port: 1", "-----BEGIN RSA PRIVATE KEY-----").ok).toBe(false);
    const outside = tempDir("leapfrog-out-");
    writeFileSync(path.join(outside, "x.txt"), "secret");
    try {
      symlinkSync(path.join(outside, "x.txt"), path.join(dir, "src", "link.txt"));
    } catch (error) {
      // Windows without Developer Mode / admin cannot create symlinks: skip the escape half.
      if ((error as NodeJS.ErrnoException).code === "EPERM") return;
      throw error;
    }
    expect(applyTextPatch(dir, "src/link.txt", "secret", "pwned").ok).toBe(false);
    expect(readFileSync(path.join(outside, "x.txt"), "utf8")).toBe("secret");
  });
});

describe("allowed roots", () => {
  it("rejects paths outside LEAPFROG_ROOTS", () => {
    const root = tempDir("leapfrog-root-");
    const previous = process.env.LEAPFROG_ROOTS;
    process.env.LEAPFROG_ROOTS = root;
    try {
      mkdirSync(path.join(root, "app"));
      expect(assertAllowedPath(path.join(root, "app"))).toContain("app");
      expect(() => assertAllowedPath(os.tmpdir())).toThrow(/outside the allowed roots/);
      expect(() => assertAllowedPath(path.join(root, "..", path.basename(root) + "-evil"))).toThrow();
    } finally {
      if (previous === undefined) delete process.env.LEAPFROG_ROOTS;
      else process.env.LEAPFROG_ROOTS = previous;
    }
  });

  it("isInside handles prefixes correctly", () => {
    expect(isInside("/a/b", "/a/b/c")).toBe(true);
    expect(isInside("/a/b", "/a/bc")).toBe(false);
  });
});

describe("OpenRewrite helpers", () => {
  it("lists changed files from a patch", () => {
    expect(changedFilesFromPatch("diff --git a/pom.xml b/pom.xml\n--- a\n+++ b\ndiff --git a/src/A.java b/src/A.java\n")).toEqual(["pom.xml", "src/A.java"]);
  });

  it("builds a Gradle init script and refuses injected recipe names", () => {
    expect(gradleInitScript("org.openrewrite:plugin:7.41.0", "org.openrewrite.recipe:rewrite-spring:6.37.1", "a.B")).toContain('activeRecipe("a.B")');
    expect(() => gradleInitScript("org.openrewrite:plugin:7.41.0", "x:y:1", 'a"); println("pwned')).toThrow();
  });
});

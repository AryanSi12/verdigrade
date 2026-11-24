import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GitSafety } from "../bot/lib/git.js";
import { applyRefactorUpdate, generateRefactorQuiz, mergeAiQuiz, refactorPicks, refactorRisk, runRefactorStep, type RefactorPick } from "../bot/lib/refactor.js";
import { tempDir } from "./helpers.js";

function write(root: string, rel: string, text: string) {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function javaProject(): string {
  const root = tempDir("lf-refactor-java-");
  write(root, "pom.xml", "<project/>");
  write(root, "src/main/java/acme/dto/OrderDto.java", "package acme.dto;\npublic class OrderDto {\n  private String id;\n  private int qty;\n  public String getId() { return id; }\n}\n");
  write(root, "src/main/java/acme/dto/CustomerDto.java", "package acme.dto;\npublic class CustomerDto {\n  private String name;\n  public void setName(String n) { this.name = n; }\n}\n");
  write(
    root,
    "src/main/java/acme/OrderService.java",
    [
      "package acme;",
      "import java.util.*;",
      "public class OrderService {",
      "  @Autowired",
      "  private OrderRepo repo;",
      "  public Object find(String id) {",
      "    if (id == null) return null;",
      "    Object o = repo.get(id);",
      "    if (o != null) System.out.println(\"found\");",
      "    if (repo == null) throw new IllegalStateException();",
      "    Integer n = new Integer(5);",
      "    return o;",
      "  }",
      "  private void neverUsed() {}",
      "}",
    ].join("\n"),
  );
  // Tests and build output are not scanned.
  write(root, "src/test/java/acme/OrderServiceTest.java", "class OrderServiceTest { void t() { System.out.println(1); } }");
  write(root, "target/classes/Gen.java", "class Gen { void t() { System.out.println(1); } }");
  return root;
}

describe("refactor quiz (rules)", () => {
  it("builds Java questions from real counts and files, each ending with Keep as is", () => {
    const quiz = generateRefactorQuiz({ repoPath: javaProject(), ecosystem: "java", targets: { java: "21" } });
    expect(quiz.source).toBe("rules");
    expect(quiz.status).toBe("open");
    const ids = quiz.questions.map((entry) => entry.id);
    expect(ids).toContain("dto-records");
    expect(ids.length).toBeLessThanOrEqual(6);
    const dto = quiz.questions.find((entry) => entry.id === "dto-records")!;
    expect(dto.count).toBe(2);
    expect(dto.files).toEqual(["src/main/java/acme/dto/CustomerDto.java", "src/main/java/acme/dto/OrderDto.java"]);
    expect(dto.answers.map((answer) => answer.id)).toEqual(["records-all", "records-immutable", "keep"]);
    const logging = quiz.questions.find((entry) => entry.id === "logging")!;
    expect(logging.count).toBe(1);
    expect(logging.files).toEqual(["src/main/java/acme/OrderService.java"]);
    for (const entry of quiz.questions) {
      expect(entry.answers.length).toBeGreaterThanOrEqual(2);
      expect(entry.answers.length).toBeLessThanOrEqual(3);
      expect(entry.answers.at(-1)!.keep).toBe(true);
      for (const answer of entry.answers) expect(["low", "medium", "high"]).toContain(answer.risk);
    }
  });

  it("skips records when the Java target is older than 16", () => {
    const quiz = generateRefactorQuiz({ repoPath: javaProject(), ecosystem: "java", targets: { java: "11" } });
    expect(quiz.questions.map((entry) => entry.id)).not.toContain("dto-records");
  });

  it("asks nothing for a clean project", () => {
    const root = tempDir("lf-refactor-clean-");
    write(root, "src/main/java/acme/App.java", "package acme;\npublic class App {}\n");
    expect(generateRefactorQuiz({ repoPath: root, ecosystem: "java", targets: { java: "21" } }).questions).toEqual([]);
  });

  it("builds Node and Python questions", () => {
    const node = tempDir("lf-refactor-node-");
    write(node, "package.json", JSON.stringify({ dependencies: { express: "4", lodash: "4" } }));
    write(node, "src/app.js", "var express = require('express');\nif (a == 1) console.log('x');\nfetch(u).then(r => r);\n");
    write(node, "node_modules/x/index.js", "var y = 1;");
    const nodeIds = generateRefactorQuiz({ repoPath: node, ecosystem: "node" }).questions;
    expect(nodeIds.map((entry) => entry.id)).toEqual(expect.arrayContaining(["var-to-const", "unused-deps", "console-logging"]));
    expect(nodeIds.find((entry) => entry.id === "var-to-const")!.count).toBe(1);
    expect(nodeIds.find((entry) => entry.id === "unused-deps")!.context).toContain("lodash");

    const py = tempDir("lf-refactor-py-");
    write(py, "requirements.txt", "flask==1.1\nrequests>=2\npytest\n");
    write(py, "app.py", "import flask\ntry:\n    x = 1\nexcept:\n    print('oops %s' % x)\n");
    write(py, "venv/lib/x.py", "print('ignored')\n");
    const pyQuiz = generateRefactorQuiz({ repoPath: py, ecosystem: "python" }).questions;
    expect(pyQuiz.map((entry) => entry.id)).toEqual(expect.arrayContaining(["bare-except", "print-logging", "unused-reqs"]));
    expect(pyQuiz.find((entry) => entry.id === "unused-reqs")!.context).toContain("requests");
    expect(pyQuiz.find((entry) => entry.id === "unused-reqs")!.context).not.toContain("pytest");
  });
});

describe("refactor quiz (AI wording and fallback)", () => {
  const base = () => generateRefactorQuiz({ repoPath: javaProject(), ecosystem: "java", targets: { java: "21" } });

  it("uses the AI wording and order but keeps ids, counts, files and risks from the scan", () => {
    const quiz = base();
    const [first, second] = quiz.questions;
    const merged = mergeAiQuiz(quiz, { questions: [{ id: second!.id, question: "Tidy this up?", answers: [] }, { id: first!.id, question: "Records for your 2 DTOs?", answers: [{ id: first!.answers[0]!.id, why: "Less code." }] }] }, "grok-x");
    expect(merged.source).toBe("ai");
    expect(merged.model).toBe("grok-x");
    expect(merged.questions[0]!.id).toBe(second!.id);
    expect(merged.questions[0]!.question).toBe("Tidy this up?");
    expect(merged.questions[1]!.question).toBe("Records for your 2 DTOs?");
    expect(merged.questions[1]!.answers[0]!.why).toBe("Less code.");
    expect(merged.questions[1]!.answers[0]!.risk).toBe(first!.answers[0]!.risk);
    expect(merged.questions[1]!.files).toEqual(first!.files);
    expect(merged.questions.length).toBeGreaterThanOrEqual(Math.min(4, quiz.questions.length));
  });

  it("rejects AI text that invents numbers, unknown ids and bad replies", () => {
    const quiz = base();
    const first = quiz.questions[0]!;
    const invented = mergeAiQuiz(quiz, { questions: [{ id: first.id, question: "Convert 57 DTOs?" }, { id: "made-up", question: "New?" }] });
    expect(invented.questions[0]!.question).toBe(first.question);
    expect(invented.questions.some((entry) => entry.id === "made-up")).toBe(false);
    const broken = mergeAiQuiz(quiz, "not json");
    expect(broken.questions).toEqual(quiz.questions);
    expect(broken.source).toBe("rules");
    expect(broken.aiNote).toMatch(/expected format/);
  });
});

describe("refactor picks", () => {
  it("only an added quiz yields picks; Keep as is adds nothing; unknown ids are rejected", () => {
    const quiz = generateRefactorQuiz({ repoPath: javaProject(), ecosystem: "java", targets: { java: "21" } });
    const picks = { "dto-records": "records-immutable", logging: "keep" };
    const open = applyRefactorUpdate(quiz, { status: "open", picks });
    expect(refactorPicks(open)).toEqual([]);
    const added = applyRefactorUpdate(quiz, { status: "added", picks });
    const chosen = refactorPicks(added);
    expect(chosen.map((pick) => pick.answerId)).toEqual(["records-immutable"]);
    expect(refactorRisk(chosen).risk).toBe("low");
    expect(refactorPicks(applyRefactorUpdate(quiz, { status: "skipped", picks }))).toEqual([]);
    expect(() => applyRefactorUpdate(quiz, { status: "added", picks: { "dto-records": "nope" } })).toThrow(/Unknown answer/);
    expect(() => applyRefactorUpdate(quiz, { status: "added", picks: { nope: "keep" } })).toThrow(/Unknown refactor question/);
  });

  it("overall risk is the highest pick", () => {
    const pick = (risk: RefactorPick["risk"]): RefactorPick => ({ questionId: risk, answerId: "a", topic: "t", title: "x", change: "c", risk, files: [], count: 1 });
    const summary = refactorRisk([pick("low"), pick("high"), pick("medium")]);
    expect(summary.risk).toBe("high");
    expect(summary.text).toContain("3 refactors");
  });
});

describe("refactor step", () => {
  const picks: RefactorPick[] = [{ questionId: "logging", answerId: "slf4j", topic: "Logging", title: "Use SLF4J", change: "c", risk: "low", files: ["A.java"], count: 2 }];
  const hooks = (verifyOk: boolean, calls: string[]) => ({
    apply: async () => (calls.push("apply"), { finished: true, note: "" }),
    commit: async () => (calls.push("commit"), { sha: "abc", files: ["A.java"] }),
    verify: async () => (calls.push("verify"), { ok: verifyOk, detail: verifyOk ? "passed" : "compile error" }),
    revert: async (sha: string) => void calls.push(`revert:${sha}`),
  });

  it("skips without picks or without AI, and never calls the hooks", async () => {
    const calls: string[] = [];
    expect((await runRefactorStep([], true, hooks(true, calls))).status).toBe("skipped");
    const noAi = await runRefactorStep(picks, false, hooks(true, calls));
    expect(noAi.status).toBe("skipped");
    expect(noAi.warning).toMatch(/AI/);
    expect(calls).toEqual([]);
  });

  it("passes when build and tests pass", async () => {
    const calls: string[] = [];
    const outcome = await runRefactorStep(picks, true, hooks(true, calls));
    expect(outcome).toMatchObject({ status: "passed", reverted: false, files: ["A.java"] });
    expect(calls).toEqual(["apply", "commit", "verify"]);
  });

  it("reverts when the refactor breaks the build, without failing the run", async () => {
    const calls: string[] = [];
    const outcome = await runRefactorStep(picks, true, hooks(false, calls));
    expect(outcome).toMatchObject({ status: "skipped", reverted: true });
    expect(outcome.summary).toMatch(/Reverted/);
    expect(calls).toEqual(["apply", "commit", "verify", "revert:abc"]);
  });

  it("GitSafety.revertCommit undoes one commit with a new commit", async () => {
    const root = tempDir("lf-refactor-git-");
    write(root, "A.java", "class A {}\n");
    const git = await GitSafety.openShadow(root, path.join(tempDir("lf-refactor-shadow-"), "shadow.git"), []);
    write(root, "A.java", "class A { int x; }\n");
    const made = await git.commitStep("refactor", "change");
    expect(made).not.toBeNull();
    const undone = await git.revertCommit(made!.sha, "refactor", "revert");
    expect(undone?.files).toEqual(["A.java"]);
    expect(readFileSync(path.join(root, "A.java"), "utf8")).toBe("class A {}\n");
  });
});

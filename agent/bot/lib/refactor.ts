/**
 * Refactor quiz (plan mode). Read-only: scans the project's own sources for code-quality
 * opportunities and turns each one into a question with 2-3 answers. Every number and file
 * shown comes from this scan; the optional AI pass may only reword the text (see mergeAiQuiz).
 * The reviewer's picks run as the "refactor" step after the upgrade (see runRefactorStep).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import * as z from "zod/v4";
import type { Ecosystem } from "./types.js";

export const refactorRiskSchema = z.enum(["low", "medium", "high"]);
export type RefactorRisk = z.infer<typeof refactorRiskSchema>;

export const refactorAnswerSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().max(120),
  change: z.string().max(600),
  why: z.string().max(600),
  risk: refactorRiskSchema,
  riskReason: z.string().max(300),
  /** "Keep as is": picking it adds nothing to the plan. */
  keep: z.boolean().default(false),
});

export const refactorQuestionSchema = z.object({
  id: z.string().min(1).max(40),
  topic: z.string().max(60),
  question: z.string().max(300),
  /** What the scan found, in plain words (counts and folders). */
  context: z.string().max(600),
  count: z.number().int().min(0),
  files: z.array(z.string().max(500)).max(12),
  answers: z.array(refactorAnswerSchema).min(2).max(3),
});

export const refactorQuizSchema = z.object({
  version: z.literal(1),
  source: z.enum(["rules", "ai"]),
  model: z.string().max(120).nullable().default(null),
  generatedAt: z.string(),
  status: z.enum(["open", "added", "skipped"]),
  questions: z.array(refactorQuestionSchema).max(8),
  /** questionId -> answerId */
  picks: z.record(z.string(), z.string()).default({}),
  savedAt: z.string().nullable().default(null),
  /** Why the AI wording was not used (null when it was, or when no AI was asked). */
  aiNote: z.string().max(500).nullable().default(null),
});

export type RefactorAnswer = z.infer<typeof refactorAnswerSchema>;
export type RefactorQuestion = z.infer<typeof refactorQuestionSchema>;
export type RefactorQuiz = z.infer<typeof refactorQuizSchema>;

/** One picked refactor, as the run receives it. */
export type RefactorPick = { questionId: string; answerId: string; topic: string; title: string; change: string; risk: RefactorRisk; files: string[]; count: number };

export const maxQuestions = 6;
const maxFiles = 4000;
const maxBytes = 400_000;

const skipDirs = new Set([
  "node_modules", ".git", "target", "build", "dist", "out", ".gradle", ".idea", ".vscode", ".mvn", "coverage",
  "venv", ".venv", "env", "__pycache__", ".tox", ".pytest_cache", "site-packages", ".next", ".settings", "vendor",
]);

type SourceFile = { rel: string; text: string };

/** Project source files with the given extensions (tests included only when `tests`). Bounded and read-only. */
export function sourceFiles(repoPath: string, extensions: string[], options: { tests?: boolean } = {}): SourceFile[] {
  const found: SourceFile[] = [];
  const walk = (dir: string) => {
    if (found.length >= maxFiles) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= maxFiles) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name) || entry.name.startsWith(".")) continue;
        walk(full);
      } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
        const rel = path.relative(repoPath, full).split(path.sep).join("/");
        const isTest = /(^|\/)(src\/test|tests?|__tests__)\//.test(rel) || /(\.test|\.spec)\.[cm]?[jt]sx?$/.test(rel) || /(^|\/)test_[^/]*\.py$|_test\.py$/.test(rel);
        if (isTest && !options.tests) continue;
        try {
          if (statSync(full).size > maxBytes) continue;
          found.push({ rel, text: readFileSync(full, "utf8") });
        } catch {
          /* unreadable file: skip */
        }
      }
    }
  };
  walk(repoPath);
  return found.sort((a, b) => a.rel.localeCompare(b.rel));
}

/** Count regex matches outside line comments; returns total and the files that have any. */
function tally(files: SourceFile[], pattern: RegExp, comment = "//"): { count: number; files: string[] } {
  let count = 0;
  const hits: string[] = [];
  for (const file of files) {
    let inFile = 0;
    for (const line of file.text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith(comment) || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
      const matches = line.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`));
      if (matches) inFile += matches.length;
    }
    if (inFile) {
      count += inFile;
      hits.push(file.rel);
    }
  }
  return { count, files: hits };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function folders(files: string[]): string {
  const dirs = [...new Set(files.map((file) => path.posix.dirname(file)))];
  return `${dirs.slice(0, 2).join(", ")}${dirs.length > 2 ? ` and ${plural(dirs.length - 2, "more folder")}` : ""}`;
}

const keep = (why = "Nothing changes; the upgrade stays exactly as planned."): RefactorAnswer => ({
  id: "keep",
  label: "Keep as is",
  change: "No change.",
  why: "Leave this for later; the migration does not need it.",
  risk: "low",
  riskReason: why,
  keep: true,
});

function question(input: Omit<RefactorQuestion, "files"> & { files: string[] }): RefactorQuestion {
  return { ...input, files: input.files.slice(0, 12) };
}

function majorOf(version: string | undefined | null): number {
  const match = /^(\d+)(?:\.(\d+))?/.exec(version ?? "");
  if (!match) return 0;
  return Number(match[1]) === 1 && match[2] ? Number(match[2]) : Number(match[1]);
}

// ---- Java -----------------------------------------------------------------------------

function javaQuestions(repoPath: string, targets: Record<string, string>): RefactorQuestion[] {
  const files = sourceFiles(repoPath, [".java"]);
  const out: RefactorQuestion[] = [];
  const javaTarget = majorOf(targets.java);

  // DTOs -> records (records exist from Java 16).
  if (!targets.java || javaTarget >= 16) {
    const dtos = files.filter((file) => {
      const name = path.posix.basename(file.rel, ".java");
      const looksDto = /(Dto|DTO|Request|Response|Payload|Form|View)$/.test(name) || /\/dto\//i.test(file.rel);
      if (!looksDto) return false;
      const text = file.text;
      if (!new RegExp(`\\bclass\\s+${name}\\b`).test(text)) return false;
      if (/\b(abstract|extends)\b/.test(text.split(`class ${name}`)[1]?.split("{")[0] ?? "") || /@(Entity|Embeddable|Document|Table|MappedSuperclass)\b/.test(text)) return false;
      return /\bprivate\s+(?!static)[\w<>\[\], ?]+\s+\w+\s*;/.test(text);
    });
    if (dtos.length) {
      const immutable = dtos.filter((file) => !/\bvoid\s+set[A-Z]\w*\s*\(/.test(file.text));
      out.push(
        question({
          id: "dto-records",
          topic: "Records",
          question: dtos.length === 1 ? "1 DTO class could become a Java record. Convert it?" : `${dtos.length} DTO classes could become Java records. Convert them?`,
          context: `Found ${plural(dtos.length, "data class", "data classes")} with private fields and accessors in ${folders(dtos.map((file) => file.rel))}.`,
          count: dtos.length,
          files: dtos.map((file) => file.rel),
          answers: [
            {
              id: "records-all",
              label: `Convert all ${dtos.length} to records`,
              change: "Rewrite each DTO as a record: fields become components, getX() calls become x(), equals/hashCode/toString come for free.",
              why: "Removes boilerplate and makes the data immutable, so it is safer to pass around.",
              risk: "medium",
              riskReason: immutable.length < dtos.length ? `${plural(dtos.length - immutable.length, "class has", "classes have")} setters; their callers and JSON binding must change.` : "Every getter call site changes name; Jackson and validation annotations move to components.",
              keep: false,
            },
            ...(immutable.length && immutable.length < dtos.length
              ? [
                  {
                    id: "records-immutable",
                    label: `Only the ${immutable.length} without setters`,
                    change: `Convert the ${plural(immutable.length, "DTO", "DTOs")} that are already read-only; leave the ones with setters.`,
                    why: "Gets most of the cleanup with no change in behaviour.",
                    risk: "low" as const,
                    riskReason: "They are already immutable; only accessor names change and the build catches every miss.",
                    keep: false,
                  },
                ]
              : []),
            keep(),
          ],
        }),
      );
    }
  }

  // Deprecated APIs.
  const wrappers = tally(files, /\bnew\s+(Integer|Long|Double|Float|Short|Byte|Boolean|Character)\s*\(/);
  const toList = javaTarget >= 16 || !targets.java ? tally(files, /\.collect\(\s*Collectors\.toList\(\)\s*\)/) : { count: 0, files: [] };
  const buffers = tally(files, /\bnew\s+StringBuffer\s*\(/);
  const deprecated = wrappers.count + toList.count + buffers.count;
  if (deprecated) {
    const parts = [
      wrappers.count ? `${plural(wrappers.count, "boxed constructor")} (new Integer(...) and friends, deprecated for removal)` : "",
      toList.count ? `${plural(toList.count, "collect(Collectors.toList())")} call${toList.count === 1 ? "" : "s"}` : "",
      buffers.count ? `${plural(buffers.count, "StringBuffer")}` : "",
    ].filter(Boolean);
    const allFiles = [...new Set([...wrappers.files, ...toList.files, ...buffers.files])];
    out.push(
      question({
        id: "deprecated-apis",
        topic: "Deprecated APIs",
        question: `Replace ${plural(deprecated, "old API use")} with the modern equivalent?`,
        context: `Found ${parts.join(", ")} in ${plural(allFiles.length, "file")}.`,
        count: deprecated,
        files: allFiles,
        answers: [
          {
            id: "modernize-all",
            label: "Modernize all of them",
            change: "valueOf() instead of boxed constructors, Stream.toList() instead of collect(Collectors.toList()), StringBuilder instead of StringBuffer.",
            why: "Keeps the code compiling on future JDKs and reads shorter.",
            risk: toList.count ? "medium" : "low",
            riskReason: toList.count ? "Stream.toList() returns an unmodifiable list; code that adds to it fails at runtime." : "Same behaviour; these are drop-in replacements.",
            keep: false,
          },
          ...(wrappers.count && wrappers.count < deprecated
            ? [{ id: "modernize-removal", label: "Only the ones deprecated for removal", change: `Replace the ${plural(wrappers.count, "boxed constructor")} with valueOf().`, why: "Removes the uses that will stop compiling first.", risk: "low" as const, riskReason: "valueOf() returns an equal value; only identity (==) comparisons could differ.", keep: false }]
            : []),
          keep(),
        ],
      }),
    );
  }

  // Logging.
  const prints = tally(files, /System\.(out|err)\.print(ln)?\s*\(|\.printStackTrace\s*\(\s*\)/);
  if (prints.count) {
    out.push(
      question({
        id: "logging",
        topic: "Logging",
        question: `Swap ${plural(prints.count, "System.out / printStackTrace call")} for a proper logger?`,
        context: `Found in ${plural(prints.files.length, "file")}: ${folders(prints.files)}.`,
        count: prints.count,
        files: prints.files,
        answers: [
          { id: "slf4j", label: "Use SLF4J loggers", change: "Add a private static final Logger per class and log at info / error with the exception attached.", why: "Log levels, timestamps and stack traces end up in the app's log instead of stdout.", risk: "low", riskReason: "Spring Boot already ships SLF4J; only the output format changes.", keep: false },
          keep(),
        ],
      }),
    );
  }

  // Null handling.
  const nulls = tally(files, /[!=]=\s*null\b|\bnull\s*[!=]=/);
  if (nulls.count >= 3) {
    out.push(
      question({
        id: "null-handling",
        topic: "Null handling",
        question: `Tidy up ${plural(nulls.count, "null check")} with Optional?`,
        context: `${plural(nulls.count, "== null / != null check")} across ${plural(nulls.files.length, "file")}.`,
        count: nulls.count,
        files: nulls.files,
        answers: [
          { id: "optional-returns", label: "Return Optional from finders", change: "Methods that return null for \"not found\" return Optional; callers use orElse / orElseThrow.", why: "Makes \"maybe missing\" visible in the type, so a forgotten check becomes a compile error.", risk: "medium", riskReason: "Method signatures change; every caller must be updated in the same pass.", keep: false },
          { id: "require-non-null", label: "Guard inputs with Objects.requireNonNull", change: "Add requireNonNull checks on constructor and public method arguments that must not be null.", why: "Fails fast with a clear message instead of a NullPointerException deep inside.", risk: "low", riskReason: "Only code that already passes null would now fail earlier.", keep: false },
          keep(),
        ],
      }),
    );
  }

  // Field injection.
  let injected = 0;
  const injectedFiles: string[] = [];
  for (const file of files) {
    const lines = file.text.split(/\r?\n/);
    let inFile = 0;
    lines.forEach((line, index) => {
      if (!/^\s*@Autowired\b/.test(line)) return;
      const next = lines.slice(index + 1).find((candidate) => candidate.trim() && !candidate.trim().startsWith("@")) ?? "";
      if (/;\s*$/.test(next) && !/\(/.test(next)) inFile += 1;
    });
    if (inFile) {
      injected += inFile;
      injectedFiles.push(file.rel);
    }
  }
  if (injected) {
    out.push(
      question({
        id: "constructor-injection",
        topic: "Dependency injection",
        question: `Move ${plural(injected, "@Autowired field")} to constructor injection?`,
        context: `Field injection in ${plural(injectedFiles.length, "class", "classes")}: ${folders(injectedFiles)}.`,
        count: injected,
        files: injectedFiles,
        answers: [
          { id: "constructor", label: "Use constructor injection", change: "Make the fields final and inject them through one constructor (no @Autowired needed).", why: "Dependencies are explicit, the class is testable without Spring, and fields cannot be null.", risk: "low", riskReason: "Same beans; a hidden circular dependency would now fail at startup.", keep: false },
          keep(),
        ],
      }),
    );
  }

  // Dead code: private methods referenced only at their declaration.
  let dead = 0;
  const deadFiles: string[] = [];
  for (const file of files) {
    let inFile = 0;
    for (const match of file.text.matchAll(/\bprivate\s+(?:static\s+)?(?:final\s+)?[\w<>\[\], ?]+\s+(\w+)\s*\(/g)) {
      const name = match[1];
      if (!name || name === "readObject" || name === "writeObject" || name === "readResolve") continue;
      const uses = file.text.match(new RegExp(`\\b${name}\\b`, "g"))?.length ?? 0;
      if (uses === 1) inFile += 1;
    }
    if (inFile) {
      dead += inFile;
      deadFiles.push(file.rel);
    }
  }
  if (dead) {
    out.push(
      question({
        id: "dead-code",
        topic: "Dead code",
        question: `Remove ${plural(dead, "private method")} that nothing calls?`,
        context: `Each is declared but never used in its own class (${plural(deadFiles.length, "file")}).`,
        count: dead,
        files: deadFiles,
        answers: [
          { id: "remove-dead", label: "Remove them", change: "Delete the unused private methods (and imports that become unused).", why: "Less code to read and maintain after the upgrade.", risk: "low", riskReason: "Private methods cannot be called from elsewhere; only reflection could notice.", keep: false },
          keep(),
        ],
      }),
    );
  }

  // Local variable type inference (Java 10+): `Foo foo = new Foo(` repeats the type.
  if (!targets.java || javaTarget >= 10) {
    const repeated = tally(files, /\b([A-Z]\w*(?:<[^>=;]*>)?)\s+\w+\s*=\s*new\s+\1\s*[(<]/);
    if (repeated.count >= 2) {
      out.push(
        question({
          id: "local-var",
          topic: "Local variables",
          question: `Use var for ${plural(repeated.count, "local variable")} that repeat their type?`,
          context: `Declarations like Foo foo = new Foo() in ${plural(repeated.files.length, "file")}.`,
          count: repeated.count,
          files: repeated.files,
          answers: [
            { id: "use-var", label: "Use var where the type is obvious", change: "Replace the repeated type on the left with var; fields and method signatures stay as they are.", why: "Shorter lines with the same types; the compiler still checks everything.", risk: "low", riskReason: "Compile-time only; the inferred type is exactly the one written today.", keep: false },
            keep(),
          ],
        }),
      );
    }
  }

  // Switch expressions (Java 14+).
  if (!targets.java || javaTarget >= 14) {
    const switches = tally(files, /\bswitch\s*\(/);
    if (switches.count) {
      out.push(
        question({
          id: "switch-expressions",
          topic: "Switch",
          question: `Rewrite ${plural(switches.count, "switch statement")} as switch expressions?`,
          context: `Classic switch with case/break in ${plural(switches.files.length, "file")}.`,
          count: switches.count,
          files: switches.files,
          answers: [
            { id: "arrow-switch", label: "Use arrow-style switch expressions", change: "case X -> value, with no break statements; switches that assign a value return it directly.", why: "No fall-through bugs, and the compiler checks enum switches are complete.", risk: "medium", riskReason: "Intentional fall-through between cases must be rewritten by hand.", keep: false },
            keep(),
          ],
        }),
      );
    }
  }

  const wildcards = tally(files, /^\s*import\s+(static\s+)?[\w.]+\.\*\s*;/m);
  if (wildcards.count) {
    out.push(
      question({
        id: "wildcard-imports",
        topic: "Imports",
        question: `Expand ${plural(wildcards.count, "wildcard import")}?`,
        context: `import x.*; in ${plural(wildcards.files.length, "file")}.`,
        count: wildcards.count,
        files: wildcards.files,
        answers: [
          { id: "expand-imports", label: "List the classes explicitly", change: "Replace each wildcard import with the classes the file uses.", why: "Avoids name clashes when new JDK or Spring versions add classes with the same name.", risk: "low", riskReason: "Compile-time only; the build catches any mistake.", keep: false },
          keep(),
        ],
      }),
    );
  }
  return out;
}

// ---- Node -----------------------------------------------------------------------------

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function nodeQuestions(repoPath: string): RefactorQuestion[] {
  const files = sourceFiles(repoPath, [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"]).filter((file) => !file.rel.endsWith(".d.ts") && !/\.min\.js$/.test(file.rel));
  const out: RefactorQuestion[] = [];
  const pkg = readJson(path.join(repoPath, "package.json")) ?? {};

  const vars = tally(files, /\bvar\s+[A-Za-z_$]/);
  if (vars.count) {
    out.push(question({
      id: "var-to-const", topic: "Variables", question: `Replace ${plural(vars.count, "var declaration")} with const / let?`, context: `Found in ${plural(vars.files.length, "file")}: ${folders(vars.files)}.`, count: vars.count, files: vars.files,
      answers: [
        { id: "const-let", label: "Use const, or let when reassigned", change: "Each var becomes const; the ones that are reassigned become let.", why: "Block scoping removes a whole class of hoisting bugs.", risk: "low", riskReason: "Only code relying on var hoisting across blocks behaves differently.", keep: false },
        keep(),
      ],
    }));
  }

  const thens = tally(files, /\.then\s*\(/);
  if (thens.count) {
    out.push(question({
      id: "async-await", topic: "Async code", question: `Rewrite ${plural(thens.count, ".then() chain")} with async / await?`, context: `Promise chains in ${plural(thens.files.length, "file")}.`, count: thens.count, files: thens.files,
      answers: [
        { id: "async-await", label: "Use async / await", change: "Turn promise chains into async functions with try / catch.", why: "Reads top to bottom and keeps error handling in one place.", risk: "medium", riskReason: "Error flow changes: a missing await or catch can swallow or surface errors differently.", keep: false },
        keep(),
      ],
    }));
  }

  const loose = tally(files, /[^=!<>]==[^=]|!=[^=]/);
  if (loose.count) {
    out.push(question({
      id: "strict-equality", topic: "Equality", question: `Switch ${plural(loose.count, "loose comparison")} (== / !=) to strict?`, context: `In ${plural(loose.files.length, "file")}.`, count: loose.count, files: loose.files,
      answers: [
        { id: "strict", label: "Use === and !==", change: "Every == becomes === and != becomes !==; x == null checks keep covering undefined explicitly.", why: "No surprise type coercion ('1' == 1, 0 == '').", risk: "medium", riskReason: "Comparisons that relied on coercion (null vs undefined, numbers vs strings) change meaning.", keep: false },
        keep(),
      ],
    }));
  }

  const logs = tally(files, /\bconsole\.(log|debug|info)\s*\(/);
  if (logs.count) {
    out.push(question({
      id: "console-logging", topic: "Logging", question: `Clean up ${plural(logs.count, "console.log call")}?`, context: `In ${plural(logs.files.length, "file")}: ${folders(logs.files)}.`, count: logs.count, files: logs.files,
      answers: [
        { id: "logger", label: "Route through one small logger module", change: "Add a logger.js wrapper with levels and replace console.log / debug / info with it.", why: "One switch controls log levels in production.", risk: "low", riskReason: "Output format only.", keep: false },
        { id: "remove-debug", label: "Remove debug-only logs", change: "Delete console.log calls that only print debug values; keep startup and error messages.", why: "Quieter output with no new code.", risk: "low", riskReason: "Only console output changes.", keep: false },
        keep(),
      ],
    }));
  }

  const concat = tally(files, /["'][^"'\n]*["']\s*\+\s*[A-Za-z_$][\w.$]*\s*\+\s*["']/);
  if (concat.count) {
    out.push(question({
      id: "template-literals", topic: "Strings", question: `Turn ${plural(concat.count, "string concatenation")} into template literals?`, context: `'a' + x + 'b' style strings in ${plural(concat.files.length, "file")}.`, count: concat.count, files: concat.files,
      answers: [
        { id: "templates", label: "Use template literals", change: "Rewrite 'a' + x + 'b' as `a${x}b`.", why: "Easier to read, fewer missing-space bugs.", risk: "low", riskReason: "Same strings; only objects with a custom toString could print differently.", keep: false },
        keep(),
      ],
    }));
  }

  const guards = tally(files, /\b([A-Za-z_$][\w$]*)\s*&&\s*\1\.[A-Za-z_$]/);
  if (guards.count) {
    out.push(question({
      id: "optional-chaining", topic: "Null handling", question: `Simplify ${plural(guards.count, "a && a.b guard")} with optional chaining?`, context: `In ${plural(guards.files.length, "file")}.`, count: guards.count, files: guards.files,
      answers: [
        { id: "optional-chaining", label: "Use ?. and ??", change: "a && a.b becomes a?.b; defaults use ?? instead of ||.", why: "Shorter and clearer about what may be missing.", risk: "medium", riskReason: "a && a.b returns a falsy a (0, '') where a?.b returns undefined; ?? keeps 0 and '' that || replaced.", keep: false },
        keep(),
      ],
    }));
  }

  const deps = Object.keys((pkg.dependencies as Record<string, string> | undefined) ?? {});
  if (deps.length) {
    const all = files.map((file) => file.text).join("\n");
    const unused = deps.filter((dep) => !all.includes(`'${dep}`) && !all.includes(`"${dep}`) && !all.includes(`\`${dep}`));
    if (unused.length) {
      out.push(question({
        id: "unused-deps", topic: "Dependencies", question: `Drop ${plural(unused.length, "dependency", "dependencies")} the code never imports?`, context: `Not imported anywhere: ${unused.slice(0, 5).join(", ")}${unused.length > 5 ? ", …" : ""}.`, count: unused.length, files: ["package.json"],
        answers: [
          { id: "remove-unused", label: "Remove them from package.json", change: `Remove ${unused.slice(0, 5).join(", ")}${unused.length > 5 ? " and the rest" : ""} from dependencies.`, why: "Smaller installs and fewer packages to keep patched.", risk: "medium", riskReason: "Packages loaded indirectly (plugins, CLI scripts, config files) may still be needed.", keep: false },
          keep(),
        ],
      }));
    }
  }

  if (pkg.type !== "module") {
    const requires = tally(files, /\brequire\s*\(\s*['"]/);
    if (requires.count) {
      out.push(question({
        id: "esm", topic: "Modules", question: `Move ${plural(requires.count, "require() call")} to ES modules?`, context: `CommonJS in ${plural(requires.files.length, "file")}.`, count: requires.count, files: requires.files,
        answers: [
          { id: "to-esm", label: "Convert to import / export", change: "Set \"type\": \"module\", use import / export, and replace __dirname with import.meta.", why: "The standard module system; works with top-level await and modern tooling.", risk: "high", riskReason: "Changes how every file loads; JSON imports, __dirname and dynamic requires all need edits.", keep: false },
          keep(),
        ],
      }));
    }
  }
  return out;
}

// ---- Python ---------------------------------------------------------------------------

const pythonToolPackages = new Set(["pytest", "gunicorn", "uvicorn", "black", "flake8", "pylint", "mypy", "isort", "coverage", "pip", "setuptools", "wheel", "tox", "ruff", "pytest-cov"]);
const importNames: Record<string, string> = { pyyaml: "yaml", "python-dotenv": "dotenv", beautifulsoup4: "bs4", pillow: "PIL", "scikit-learn": "sklearn", "flask-sqlalchemy": "flask_sqlalchemy", psycopg2: "psycopg2", "psycopg2-binary": "psycopg2" };

function pythonQuestions(repoPath: string): RefactorQuestion[] {
  const files = sourceFiles(repoPath, [".py"]);
  const out: RefactorQuestion[] = [];

  const formats = tally(files, /\.format\s*\(|["']\s*%\s*[\w(]/, "#");
  if (formats.count) {
    out.push(question({
      id: "f-strings", topic: "Strings", question: `Turn ${plural(formats.count, "old-style format")} into f-strings?`, context: `% formatting and .format() in ${plural(formats.files.length, "file")}.`, count: formats.count, files: formats.files,
      answers: [
        { id: "f-strings", label: "Use f-strings", change: "Rewrite % and .format() string formatting as f-strings.", why: "Shorter, faster and easier to read.", risk: "low", riskReason: "Same output; logging calls keep lazy % arguments.", keep: false },
        keep(),
      ],
    }));
  }

  const bare = tally(files, /^\s*except\s*:/m, "#");
  if (bare.count) {
    out.push(question({
      id: "bare-except", topic: "Error handling", question: `Narrow ${plural(bare.count, "bare except:")}?`, context: `In ${plural(bare.files.length, "file")}.`, count: bare.count, files: bare.files,
      answers: [
        { id: "except-exception", label: "Catch Exception instead", change: "except: becomes except Exception:, and the error is logged.", why: "Ctrl+C and SystemExit are no longer swallowed by accident.", risk: "low", riskReason: "Only KeyboardInterrupt / SystemExit stop being caught.", keep: false },
        keep(),
      ],
    }));
  }

  const prints = tally(files, /^\s*print\s*\(/m, "#");
  if (prints.count) {
    out.push(question({
      id: "print-logging", topic: "Logging", question: `Replace ${plural(prints.count, "print() call")} with logging?`, context: `In ${plural(prints.files.length, "file")}: ${folders(prints.files)}.`, count: prints.count, files: prints.files,
      answers: [
        { id: "logging", label: "Use the logging module", change: "Add logger = logging.getLogger(__name__) per module and log at the right level.", why: "Levels and timestamps; output goes where the app's logs go.", risk: "low", riskReason: "Output format only; scripts that parse stdout would notice.", keep: false },
        keep(),
      ],
    }));
  }

  let untyped = 0;
  const untypedFiles: string[] = [];
  for (const file of files) {
    const count = [...file.text.matchAll(/^\s*def\s+\w+\s*\([^)]*\)\s*:/gm)].length;
    if (count) {
      untyped += count;
      untypedFiles.push(file.rel);
    }
  }
  if (untyped) {
    out.push(question({
      id: "type-hints", topic: "Type hints", question: `Add type hints to ${plural(untyped, "function")} without a return type?`, context: `In ${plural(untypedFiles.length, "file")}.`, count: untyped, files: untypedFiles,
      answers: [
        { id: "hints-public", label: "Add hints to public functions", change: "Annotate arguments and return types of functions without a leading underscore.", why: "Editors and type checkers catch mistakes before runtime.", risk: "low", riskReason: "Hints are not enforced at runtime.", keep: false },
        keep(),
      ],
    }));
  }

  const ospath = tally(files, /\bos\.path\.\w+/, "#");
  if (ospath.count) {
    out.push(question({
      id: "pathlib", topic: "Paths", question: `Move ${plural(ospath.count, "os.path call")} to pathlib?`, context: `In ${plural(ospath.files.length, "file")}.`, count: ospath.count, files: ospath.files,
      answers: [
        { id: "pathlib", label: "Use pathlib.Path", change: "Build paths with Path objects and the / operator.", why: "One object for joining, reading and checking paths.", risk: "medium", riskReason: "Functions that expect str may now get Path objects; str() is needed at those boundaries.", keep: false },
        keep(),
      ],
    }));
  }

  const reqFile = path.join(repoPath, "requirements.txt");
  if (existsSync(reqFile)) {
    const names = readFileSync(reqFile, "utf8").split(/\r?\n/).map((line) => line.trim().split(/[<>=!~;\[ ]/)[0]?.trim() ?? "").filter((name) => name && !name.startsWith("#") && !name.startsWith("-"));
    const all = files.map((file) => file.text).join("\n");
    const unused = names.filter((name) => {
      const lower = name.toLowerCase();
      if (pythonToolPackages.has(lower)) return false;
      const mod = importNames[lower] ?? lower.replace(/-/g, "_");
      return !new RegExp(`^\\s*(import|from)\\s+${mod.replace(/\./g, "\\.")}\\b`, "im").test(all);
    });
    if (unused.length) {
      out.push(question({
        id: "unused-reqs", topic: "Dependencies", question: `Drop ${plural(unused.length, "requirement")} the code never imports?`, context: `Not imported anywhere: ${unused.slice(0, 5).join(", ")}${unused.length > 5 ? ", …" : ""}.`, count: unused.length, files: ["requirements.txt"],
        answers: [
          { id: "remove-unused", label: "Remove them from requirements.txt", change: `Remove ${unused.slice(0, 5).join(", ")}${unused.length > 5 ? " and the rest" : ""}.`, why: "Smaller installs and fewer packages to keep patched.", risk: "medium", riskReason: "Packages used only as plugins or by config (not imported) may still be needed.", keep: false },
          keep(),
        ],
      }));
    }
  }
  return out;
}

// ---- quiz -----------------------------------------------------------------------------

export type QuizInput = { repoPath: string; ecosystem: Ecosystem; targets?: Record<string, string> };

/** The deterministic quiz: no model, every number from the scan. At most `maxQuestions` questions (possibly none). */
export function generateRefactorQuiz(input: QuizInput, now = new Date()): RefactorQuiz {
  const questions = input.ecosystem === "node" ? nodeQuestions(input.repoPath) : input.ecosystem === "python" ? pythonQuestions(input.repoPath) : javaQuestions(input.repoPath, input.targets ?? {});
  return refactorQuizSchema.parse({
    version: 1,
    source: "rules",
    model: null,
    generatedAt: now.toISOString(),
    status: "open",
    questions: questions.slice(0, maxQuestions),
    picks: {},
    savedAt: null,
    aiNote: null,
  });
}

/** Prompt for the optional AI pass: facts only (counts, folders, file names), never file contents or secrets. */
export function refactorQuizPrompt(quiz: RefactorQuiz, info: { repoName: string; ecosystem: Ecosystem; targetLabel: string }): string {
  const facts = quiz.questions.map((entry) => ({
    id: entry.id,
    topic: entry.topic,
    question: entry.question,
    context: entry.context,
    answers: entry.answers.map((answer) => ({ id: answer.id, label: answer.label, change: answer.change, why: answer.why, risk: answer.risk, riskReason: answer.riskReason })),
  }));
  return [
    `You are helping a reviewer of the ${info.ecosystem} project "${info.repoName}" decide optional refactors that run AFTER its upgrade to ${info.targetLabel}.`,
    "A deterministic scan produced these refactor questions (counts and file names are facts from the scan):",
    "```json",
    JSON.stringify(facts, null, 2),
    "```",
    "Rewrite the wording so each question is short, friendly and specific to this project. Keep 4 to 6 of them (all of them if there are fewer), ordered by value for this upgrade.",
    "Rules: keep every id exactly; do not add questions or answers; do not change risk levels; do not introduce any number that is not already in the facts; one sentence per field.",
    'Reply with JSON only: {"questions":[{"id":"...","question":"...","context":"...","answers":[{"id":"...","label":"...","change":"...","why":"...","riskReason":"..."}]}]}',
  ].join("\n");
}

const aiQuizSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string().max(300).optional(),
        context: z.string().max(600).optional(),
        answers: z.array(z.object({ id: z.string(), label: z.string().max(120).optional(), change: z.string().max(600).optional(), why: z.string().max(600).optional(), riskReason: z.string().max(300).optional() })).default([]),
      }),
    )
    .max(12),
});

function numbersIn(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?/g) ?? [];
}

/**
 * Apply the AI's wording to the deterministic quiz. Text is taken only when it keeps to the facts
 * (no number that the original question did not already contain); ids, counts, files and risks
 * always come from the scan. Returns the rules quiz unchanged when the reply is unusable.
 */
export function mergeAiQuiz(base: RefactorQuiz, reply: unknown, model: string | null = null): RefactorQuiz {
  const parsed = aiQuizSchema.safeParse(reply);
  if (!parsed.success) return { ...base, aiNote: "The AI reply was not in the expected format; showing the scan's own wording." };
  const byId = new Map(base.questions.map((entry) => [entry.id, entry]));
  const order = parsed.data.questions.map((entry) => entry.id).filter((id, index, list) => byId.has(id) && list.indexOf(id) === index);
  let applied = 0;
  const questions: RefactorQuestion[] = [];
  for (const id of order) {
    const original = byId.get(id)!;
    const ai = parsed.data.questions.find((entry) => entry.id === id)!;
    const allowed = new Set(numbersIn([original.question, original.context, original.files.join(" "), ...original.answers.flatMap((answer) => [answer.label, answer.change, answer.why, answer.riskReason])].join(" ")));
    const pick = (proposed: string | undefined, fallback: string) => {
      const value = proposed?.trim();
      if (!value || !numbersIn(value).every((number) => allowed.has(number))) return fallback;
      if (value !== fallback) applied += 1;
      return value;
    };
    questions.push({
      ...original,
      question: pick(ai.question, original.question),
      context: pick(ai.context, original.context),
      answers: original.answers.map((answer) => {
        const fromAi = ai.answers.find((entry) => entry.id === answer.id);
        if (!fromAi) return answer;
        return { ...answer, label: answer.keep ? answer.label : pick(fromAi.label, answer.label), change: pick(fromAi.change, answer.change), why: pick(fromAi.why, answer.why), riskReason: pick(fromAi.riskReason, answer.riskReason) };
      }),
    });
  }
  // The AI may trim to 4-6, but never below what the scan found when it found fewer than 4.
  const minimum = Math.min(4, base.questions.length);
  for (const entry of base.questions) if (questions.length < minimum && !questions.some((kept) => kept.id === entry.id)) questions.push(entry);
  if (!questions.length) return { ...base, aiNote: "The AI reply named none of the scan's questions; showing the scan's own wording." };
  return refactorQuizSchema.parse({ ...base, questions: questions.slice(0, maxQuestions), source: applied ? "ai" : "rules", model: applied ? model : null, aiNote: applied ? null : "The AI kept the scan's wording." });
}

export const refactorUpdateSchema = z.object({
  status: z.enum(["open", "added", "skipped"]),
  picks: z.record(z.string().max(40), z.string().max(40)).default({}),
});
export type RefactorUpdate = z.infer<typeof refactorUpdateSchema>;

/** Save the reviewer's answers. Unknown question or answer ids are rejected. */
export function applyRefactorUpdate(quiz: RefactorQuiz, update: RefactorUpdate, now = new Date()): RefactorQuiz {
  for (const [questionId, answerId] of Object.entries(update.picks)) {
    const entry = quiz.questions.find((candidate) => candidate.id === questionId);
    if (!entry) throw new Error(`Unknown refactor question: ${questionId}`);
    if (!entry.answers.some((answer) => answer.id === answerId)) throw new Error(`Unknown answer ${answerId} for ${questionId}`);
  }
  return refactorQuizSchema.parse({ ...quiz, status: update.status, picks: update.status === "skipped" ? {} : update.picks, savedAt: now.toISOString() });
}

const riskRank: Record<RefactorRisk, number> = { low: 1, medium: 2, high: 3 };

/** The refactors the run should make (only when the quiz was added to the plan; "Keep as is" adds nothing). */
export function refactorPicks(quiz: RefactorQuiz | null | undefined): RefactorPick[] {
  if (!quiz || quiz.status !== "added") return [];
  return quiz.questions.flatMap((entry) => {
    const answer = entry.answers.find((candidate) => candidate.id === quiz.picks[entry.id]);
    if (!answer || answer.keep) return [];
    return [{ questionId: entry.id, answerId: answer.id, topic: entry.topic, title: answer.label, change: answer.change, risk: answer.risk, files: entry.files, count: entry.count }];
  });
}

/** Overall risk of the picks (the highest one) plus counts, for the plan's risk summary. */
export function refactorRisk(picks: RefactorPick[]): { risk: RefactorRisk | null; counts: Record<RefactorRisk, number>; text: string } {
  const counts: Record<RefactorRisk, number> = { low: 0, medium: 0, high: 0 };
  for (const pick of picks) counts[pick.risk] += 1;
  const risk = picks.reduce<RefactorRisk | null>((top, pick) => (!top || riskRank[pick.risk] > riskRank[top] ? pick.risk : top), null);
  const parts = (["high", "medium", "low"] as const).filter((level) => counts[level]).map((level) => `${counts[level]} ${level}`);
  const text = picks.length ? `${plural(picks.length, "refactor")} after the upgrade (${parts.join(", ")} risk); a refactor that breaks the build or tests is reverted.` : "";
  return { risk, counts, text };
}

/** The instruction the AI gets for the refactor step (facts only). */
export function refactorInstructions(picks: RefactorPick[]): string[] {
  return picks.map((pick, index) => `${index + 1}. [${pick.risk} risk] ${pick.topic}: ${pick.title}. ${pick.change}${pick.files.length ? ` Files: ${pick.files.slice(0, 12).join(", ")}${pick.files.length > 12 ? ", …" : ""}.` : ""}`);
}

export type RefactorStepHooks = {
  /** Make the refactor (the AI pass). Returns whether it finished. */
  apply: () => Promise<{ finished: boolean; note: string }>;
  /** Commit what the refactor changed; null when it changed nothing. */
  commit: () => Promise<{ sha: string; files: string[] } | null>;
  /** Build and tests on the refactored code. */
  verify: () => Promise<{ ok: boolean; detail: string }>;
  /** Undo the refactor commit. */
  revert: (sha: string) => Promise<void>;
};

export type RefactorStepOutcome = { status: "passed" | "skipped"; summary: string; reverted: boolean; files: string[]; warning: string | null };

/** The refactor step's decisions, separate from git and the model so they can be tested. */
export async function runRefactorStep(picks: RefactorPick[], hasAi: boolean, hooks: RefactorStepHooks): Promise<RefactorStepOutcome> {
  if (!picks.length) return { status: "skipped", summary: "No refactors picked in the plan", reverted: false, files: [], warning: null };
  if (!hasAi) {
    return { status: "skipped", summary: `AI is not set up, so the ${plural(picks.length, "picked refactor")} did not run`, reverted: false, files: [], warning: `The plan picked ${plural(picks.length, "refactor")}, but refactors need the AI and it is not set up; they are listed for later.` };
  }
  let applied: { finished: boolean; note: string };
  try {
    applied = await hooks.apply();
  } catch (error) {
    applied = { finished: false, note: (error as Error).message };
  }
  const made = await hooks.commit();
  if (!made) return { status: "skipped", summary: applied.finished ? "The AI found nothing left to change" : `The refactor did not run: ${applied.note || "unknown error"}`, reverted: false, files: [], warning: applied.finished ? null : `The refactor step did not finish (${applied.note || "unknown error"}); the upgrade is unaffected.` };
  const check = await hooks.verify();
  if (check.ok) return { status: "passed", summary: `${plural(picks.length, "refactor")} applied to ${plural(made.files.length, "file")}; build and tests pass`, reverted: false, files: made.files, warning: null };
  await hooks.revert(made.sha);
  return { status: "skipped", summary: `Reverted: the refactor broke the build or tests (${check.detail}); the upgrade stands`, reverted: true, files: [], warning: `The picked refactors broke the build or tests (${check.detail}), so they were reverted. The upgrade itself passed.` };
}

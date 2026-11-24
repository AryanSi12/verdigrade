import { describe, expect, it } from "vitest";
import { firstFailure, parseArtifactPaths, parseMavenTestTotals, quoteWindowsArg, RingBuffer, runCommand, windowsCommandLine } from "../bot/lib/process.js";
import { buildArgs } from "../bot/lib/build.js";

const multiModule = `
[INFO] Running com.acme.AServiceTest
[INFO] Tests run: 3, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 0.1 s -- in com.acme.AServiceTest
[INFO] Running com.acme.BServiceTest
[INFO] Tests run: 2, Failures: 1, Errors: 0, Skipped: 1, Time elapsed: 0.2 s <<< FAILURE! -- in com.acme.BServiceTest
[INFO]
[INFO] Results:
[INFO]
[ERROR] Tests run: 5, Failures: 1, Errors: 0, Skipped: 1
[INFO] --- module two ---
[INFO] Tests run: 4, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 0.3 s - in com.acme.CTest
[INFO] Results:
[INFO] Tests run: 4, Failures: 0, Errors: 2, Skipped: 0
[INFO] Building jar: /repo/app/target/app-1.0.0.jar
[INFO] Building war: C:\\repo\\web\\target\\web-1.0.0.war
`;

describe("test totals", () => {
  it("sums module Results lines and ignores per-class lines", () => {
    expect(parseMavenTestTotals(multiModule)).toEqual({ testsRun: 9, failures: 1, errors: 2, skipped: 1 });
  });

  it("returns null when no summary was printed", () => {
    expect(parseMavenTestTotals("[INFO] BUILD SUCCESS")).toBeNull();
  });

  it("finds every artifact path, POSIX and Windows", () => {
    expect(parseArtifactPaths(multiModule)).toEqual(["/repo/app/target/app-1.0.0.jar", "C:\\repo\\web\\target\\web-1.0.0.war"]);
  });

  it("extracts the first failure", () => {
    expect(firstFailure(multiModule)).toMatch(/Failures: 1/);
  });
});

describe("RingBuffer", () => {
  it("keeps only the tail and counts everything", () => {
    const ring = new RingBuffer(10);
    for (let index = 0; index < 100; index += 1) ring.push(`${index % 10}`);
    expect(ring.toString()).toBe("0123456789");
    expect(ring.total).toBe(100);
    ring.push("x".repeat(25));
    expect(ring.toString()).toBe("x".repeat(10));
  });
});

describe("windows quoting", () => {
  it("quotes spaces and rejects shell metacharacters", () => {
    expect(quoteWindowsArg("-Drewrite.activeRecipes=a.B")).toBe("-Drewrite.activeRecipes=a.B");
    expect(quoteWindowsArg("C:\\Users\\Jo Doe\\init.gradle")).toBe('"C:\\Users\\Jo Doe\\init.gradle"');
    expect(quoteWindowsArg("a&b")).toBe('"a&b"');
    for (const bad of ['a"b', "%PATH%", "!x!", "a\nb", "a^b"]) expect(() => quoteWindowsArg(bad)).toThrow();
    expect(windowsCommandLine("C:\\p q\\mvnw.cmd", ["-B", "test"])).toBe('"C:\\p q\\mvnw.cmd" -B test');
  });
});

describe("runCommand", () => {
  it("streams output, reports the exit code and never uses a shell", async () => {
    const chunks: string[] = [];
    const result = await runCommand(process.execPath, ["-e", "process.stdout.write('x'.repeat(200000)); console.log(' $(echo hi)'); process.exitCode = 3"], {
      cwd: process.cwd(),
      tailChars: 1000,
      onOutput: (chunk) => chunks.push(chunk),
    });
    expect(result.exitCode).toBe(3);
    expect(result.ok).toBe(false);
    expect(result.failure).toBeNull();
    expect(result.output.length).toBeLessThanOrEqual(1000);
    expect(result.output).toContain("$(echo hi)");
    expect(result.outputChars).toBeGreaterThan(200000);
    expect(chunks.join("").length).toBe(result.outputChars);
  });

  it("reports a timeout and kills the process", async () => {
    const result = await runCommand(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { cwd: process.cwd(), timeoutMs: 300 });
    expect(result.failure).toBe("timeout");
    expect(result.exitCode).toBeNull();
    expect(result.output).toMatch(/timed out/);
  });

  it("reports a missing command as a spawn failure", async () => {
    const result = await runCommand("definitely-not-a-command-jm", [], { cwd: process.cwd() });
    expect(result.failure).toBe("spawn");
    expect(result.ok).toBe(false);
  });
});

describe("build arguments", () => {
  // Regression: OpenRewrite compiles against the OLD build first; without `clean` Maven skipped unchanged
  // (locked) javax files as "up to date" and the Test step passed on stale classes.
  it("always cleans before the test goal so every file compiles against the migrated build", () => {
    expect(buildArgs("maven", [], "test")).toEqual(["-B", "clean", "test"]);
    expect(buildArgs("gradle", [], "test")).toEqual(["--no-daemon", "--console=plain", "clean", "test"]);
  });
  it("packages on top of the fresh test build", () => {
    expect(buildArgs("maven", [], "package")).toEqual(["-B", "package", "-DskipTests"]);
    expect(buildArgs("gradle", [], "package")).toEqual(["--no-daemon", "--console=plain", "assemble"]);
  });
});

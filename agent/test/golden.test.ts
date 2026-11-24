import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadModernizerRules } from "../bot/lib/matrix.js";
import { runPipeline } from "../bot/lib/pipeline.js";
import { applyRules, mergeRules } from "../bot/lib/rules.js";
import { scanProject } from "../bot/lib/scanner.js";

// End-to-end runs need a JDK and Maven and download dependencies, so they are opt-in:
//   LEAPFROG_GOLDEN=1 npm test   (legacy JAVA_MIGRATOR_GOLDEN=1 also works)
const samplesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../samples");
const samples = readdirSync(samplesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
  .map((entry) => entry.name)
  // Java samples only; the Node sample has its own end-to-end check.
  .filter((name) => ["pom.xml", "build.gradle", "build.gradle.kts"].some((file) => existsSync(path.join(samplesRoot, name, file))));

describe.skipIf(!(process.env.LEAPFROG_GOLDEN || process.env.JAVA_MIGRATOR_GOLDEN))("golden sample migrations", () => {
  for (const sample of samples) {
    it(`${sample}: default route passes, then re-applying the rules changes nothing`, async () => {
      const root = mkdtempSync(path.join(os.tmpdir(), "leapfrog-golden-"));
      process.env.LEAPFROG_ROOTS = [samplesRoot, root].join(path.delimiter);
      const repo = path.join(root, sample);
      cpSync(path.join(samplesRoot, sample), repo, { recursive: true });
      try {
        const state = await runPipeline({
          runId: `golden-${sample}`,
          repoPath: repo,
          dryRun: false,
          gitMode: "shadow",
          fixRounds: 0,
          artifactsDir: path.join(root, "artifacts"),
        });
        expect(state.error).toBeNull();
        expect(state.status).toBe("passed");
        expect(state.checks.every((check) => check.ok || check.level !== "error")).toBe(true);
        expect(state.after?.java).toBe("21");
        expect(state.after?.boot).toMatch(/^4\.0\./);
        expect(state.tests?.exitCode).toBe(0);

        const after = scanProject(repo);
        expect(after.javaxFiles).toEqual([]);
        const rules = mergeRules(state.route!.rulePacks.map((id) => loadModernizerRules(id)));
        expect(applyRules(repo, rules)).toEqual([]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }, 600_000);
  }
});

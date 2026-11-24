import { cpSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineEval } from "@grok/agent-sdk/evals";

const shipping = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../samples/shipping");

/** Every case works on its own temporary copy, so evals never modify samples/. */
function freshCopy(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "leapfrog-eval-"));
  const target = path.join(root, "shipping");
  cpSync(shipping, target, { recursive: true });
  // Tools only accept repositories under the allowed roots. When the eval runner serves the agent
  // in another process, export LEAPFROG_ROOTS to include your temp directory instead.
  const roots = new Set((process.env.LEAPFROG_ROOTS ?? "").split(path.delimiter).filter(Boolean));
  roots.add(root);
  roots.add(os.tmpdir());
  process.env.LEAPFROG_ROOTS = [...roots].join(path.delimiter);
  return target;
}

export default defineEval({
  tags: ["smoke"],
  cases: [
    {
      id: "scan",
      description: "A read-only question about a repository scans it and changes nothing.",
      async test(t) {
        const repo = freshCopy();
        await t.send(`Scan ${repo} and tell me its Java level, Spring Boot version and how many files still import Jakarta EE javax packages. Do not change anything.`);
        t.succeeded();
        t.calledTool("scan_project");
        t.notCalledTool("run_openrewrite");
        t.notCalledTool("apply_text_patch");
      },
    },
  ],
});

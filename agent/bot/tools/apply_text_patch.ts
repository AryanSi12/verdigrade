import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { applyTextPatch } from "../lib/patch.js";
import { assertRepo } from "../lib/repo.js";
import { isPlanReview, planReviewRefusal } from "../lib/toolGuards.js";

export default defineTool({
  description:
    "Replace one exact, unique text span in a build file (pom.xml, build.gradle[.kts], settings.gradle, gradle.properties; Node: package.json, tsconfig*.json) or a file under a module's src/ (Node: also test/). Fails if the text is missing or appears more than once, and refuses paths locked by the approved migration plan. Use only for the minimal fix a failing test requires.",
  effect: "write",
  inputSchema: z.object({
    repoPath: z.string().min(1),
    filePath: z.string().min(1).describe("Path relative to repoPath, e.g. src/main/java/com/acme/App.java"),
    oldText: z.string().min(1),
    newText: z.string(),
  }),
  async execute({ repoPath, filePath, oldText, newText }, context) {
    if (isPlanReview(context)) return { ok: false, filePath, changed: false, error: planReviewRefusal };
    const resolved = await assertRepo(repoPath);
    return applyTextPatch(resolved, filePath, oldText, newText);
  },
});

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { isAllowedRelative, looksSecret, repoEcosystem } from "../lib/patch.js";
import { assertRepo, isInside } from "../lib/repo.js";

const maxChars = 60_000;

export default defineTool({
  description:
    "Read one build file or source file (under a module's src/; for Python any .py or dependency file) so a fix can quote the exact text for apply_text_patch. Secrets-looking files are refused. Optional 1-based line range.",
  effect: "read",
  inputSchema: z.object({
    repoPath: z.string().min(1),
    filePath: z.string().min(1),
    fromLine: z.number().int().min(1).optional(),
    toLine: z.number().int().min(1).optional(),
  }),
  async execute({ repoPath, filePath, fromLine, toLine }) {
    const root = await assertRepo(repoPath);
    const relative = filePath.replace(/\\/g, "/");
    if (!isAllowedRelative(relative, repoEcosystem(root))) return { ok: false, error: "Only build files and files under src/ (Node: also test/; Python: any .py or dependency file) can be read." };
    const absolute = path.resolve(root, relative);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) return { ok: false, error: "File does not exist." };
    if (!isInside(root, realpathSync.native(absolute))) return { ok: false, error: "Refusing to follow a symlink out of the repository." };
    const text = readFileSync(absolute, "utf8");
    if (looksSecret(relative, text)) return { ok: false, error: "Refusing to read a secrets-looking file." };
    const lines = text.split(/\r?\n/);
    const start = (fromLine ?? 1) - 1;
    const end = Math.min(lines.length, toLine ?? lines.length);
    const slice = lines.slice(start, end).join("\n");
    return {
      ok: true,
      filePath: relative,
      totalLines: lines.length,
      fromLine: start + 1,
      toLine: end,
      text: slice.length > maxChars ? `${slice.slice(0, maxChars)}\n… truncated` : slice,
    };
  },
});

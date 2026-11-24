import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { scanNodeProject } from "../lib/adapters/nodeScan.js";
import { scanPythonProject } from "../lib/adapters/pythonScan.js";
import { repoEcosystem } from "../lib/patch.js";
import { loadRepoConfig } from "../lib/repoConfig.js";
import { assertRepo } from "../lib/repo.js";
import { scanProject } from "../lib/scanner.js";

const listCap = 200;

export default defineTool({
  description:
    "Read a repository and report its facts. Java (every module): build tool, wrapper, Java level, Spring Boot or Spring version, web.xml, and every file that still uses Jakarta EE javax packages (JDK-owned javax such as javax.crypto is reported separately). Node: Node/TypeScript/Express versions, package manager, tsconfig options, Express 4 and deprecated Node API uses with file and line. Python: Python/Django/Flask versions, dependency files, test runner, removed and deprecated stdlib/framework API uses with file and line. Does not modify files.",
  effect: "read",
  inputSchema: z.object({
    repoPath: z.string().min(1),
  }),
  async execute({ repoPath }) {
    const resolved = await assertRepo(repoPath);
    const ecosystem = repoEcosystem(resolved);
    if (ecosystem === "python") {
      const scan = scanPythonProject(resolved);
      return { ...scan, hitCount: scan.hits.length, hits: scan.hits.slice(0, listCap), listsTruncated: scan.hits.length > listCap };
    }
    if (ecosystem === "node") {
      const scan = scanNodeProject(resolved);
      return { ...scan, expressDeprecated: scan.expressDeprecated.slice(0, listCap), nodeDeprecated: scan.nodeDeprecated.slice(0, listCap) };
    }
    const scan = scanProject(resolved, { excludeModules: loadRepoConfig(resolved).excludeModules });
    return {
      ...scan,
      javaxFileCount: scan.javaxFiles.length,
      jakartaFileCount: scan.jakartaFiles.length,
      javaxFiles: scan.javaxFiles.slice(0, listCap),
      jakartaFiles: scan.jakartaFiles.slice(0, listCap),
      jdkJavaxFiles: scan.jdkJavaxFiles.slice(0, listCap),
      listsTruncated: [scan.javaxFiles, scan.jakartaFiles, scan.jdkJavaxFiles].some((items) => items.length > listCap),
    };
  },
});

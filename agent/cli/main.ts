import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { adapterFor, adapters, detectEcosystem, getAdapter, isEcosystem } from "../bot/lib/adapters/index.js";
import { scanNodeProject } from "../bot/lib/adapters/nodeScan.js";
import { scanPythonProject } from "../bot/lib/adapters/pythonScan.js";
import type { TargetRequest } from "../bot/lib/adapters/types.js";
import { envSetting, requirePlan } from "../bot/lib/config.js";
import { engineLabels, engineList, parseEngine, usesAi, type Engine } from "../bot/lib/engine.js";
import { planDetails, recommendEngine } from "../bot/lib/recommend.js";
import { planFileName } from "../bot/lib/git.js";
import { lockedBlockers, predictImpact } from "../bot/lib/impact.js";
import { readDiff, runPipeline } from "../bot/lib/pipeline.js";
import {
  approvePlan,
  generatePlan,
  loadPlan,
  parsePlanText,
  planFilePath,
  planIdPattern,
  planProblem,
  planSummary,
  readPlanFile,
  runPlanInfo,
  updatePlan,
  writePlanFile,
  type MigrationPlan,
} from "../bot/lib/plan.js";
import { cloneGitHubRepo, isGitHubInput, maskSecrets } from "../bot/lib/github.js";
import { reportJson, reportMarkdown } from "../bot/lib/report.js";
import { loadRepoConfig } from "../bot/lib/repoConfig.js";
import { discoverBase } from "./server.js";
import { scanProject } from "../bot/lib/scanner.js";


const usage = `verdigrade <command> [options]

Verdigrade upgrades Java/Spring Boot, Node.js/TypeScript and Python/Django/Flask apps.
("leapfrog" and "java-migrator" still work as aliases of "verdigrade".)

Commands
  plan <path>        Plan mode: analyse the project (read-only) and write ${planFileName}
                     with three groups: will change automatically, risky (review),
                     needs manual intervention (will not be touched)
  approve <path>     Apply decisions/locks to <path>/${planFileName} and approve it
  <path> can also be a GitHub link (https://github.com/owner/repo, …/tree/<branch>,
                     git@github.com:owner/repo.git): it is cloned into agent/data/repos/
                     owner__repo and migrated there (nothing is pushed). Private repos:
                     set VERDIGRADE_GITHUB_TOKEN (or GITHUB_TOKEN). --branch <name> picks a branch,
                     --subdir <folder> the project folder (…/tree/<branch>/<folder> links
                     work too; one project in a subfolder is found automatically).
  migrate <path>     Run the pipeline (scan, rewrite, rules, test, package, checks, report).
                     Needs an approved plan unless --no-plan or VERDIGRADE_REQUIRE_PLAN=false
  scan <path>        Print what the scanner detects (read-only)
  validate           Validate every ecosystem matrix (profiles/matrices) and rules pack
  matrix             Print supported routes (--ecosystem java|node|python)

Targets (plan / migrate)
  --ecosystem <id>   java | node | python (default: detected; Maven/Gradle wins over package.json)
  --to-java <v>      Java: target Java (default from the matrix)
  --to-boot <v>      Java: target Spring Boot line (e.g. 4.0.x, 3.5.x, none)
  --from-java <v>    Java: override the detected From Java
  --from-boot <v>    Java: override the detected From Boot
  --to-node <v>      Node: target Node major (22, 24, 26)
  --to-ts <v>        Node: target TypeScript line (5.9, 6.0)
  --from-node <v>    Node: override the detected From Node
  --to-python <v>    Python: target Python line (3.13, 3.14, 3.15)
  --from-python <v>  Python: override the detected From Python

Options for plan
  --preview          Run the rewrite tools on a temporary copy for exact file lists (slower)
  --lock <glob>      Lock a path or glob (repeatable or comma-separated); kept unchanged by the run
  --decide <id=d>    Set an item's decision: approve | lock | manual (repeatable)
  --note <text>      Reviewer note for the report's Manual follow-up
  --approve          Approve the plan right away (otherwise review the file, then run approve)
  --out <file>       Write the plan here instead of <path>/${planFileName}
  --print            Do not write a file; print the plan JSON
  --route-only       Only resolve the matrix route (the pre-plan-mode output)

Options for approve
  --lock, --decide, --note as above; --plan <file> to approve a plan file elsewhere

Options for migrate
  --dry-run          Work on a temporary copy; the repository is never modified
  --plan <file|id>   Approved plan file (default <path>/${planFileName}) or a server plan id
  --no-plan          Run without a plan (no locks, no plan follow-ups)
  --allow-dirty      Allow uncommitted changes in a git repository
  --skip-tests       Do not run the test step
  --engine <e>       Upgrade engine: hybrid | ai. Without the flag the plan's recommendation is used (printed by "verdigrade plan");
                     if the Verdigrade server or AI login is missing, the CLI runs only the free OpenRewrite / codemods / rules step locally
                     hybrid  = OpenRewrite / codemods first (free), then the AI fixes the plan's "AI" items and any build/test failure
                     ai      = Full AI: the AI agent does the whole upgrade and fixes build/test failures (bounded rounds)
                     ai and hybrid run through the Verdigrade server (it holds the AI login):
                     start it with "npm run dev" (VERDIGRADE_URL, default http://127.0.0.1:3000).
  --out <dir>        Copy report.md, report.json and changes.diff here
  --json             Print the JSON report instead of Markdown
  --quiet            No progress output

Environment: VERDIGRADE_ROOTS, VERDIGRADE_TOKEN, VERDIGRADE_FIX_ROUNDS, VERDIGRADE_NARRATIVE,
VERDIGRADE_DATA_DIR, VERDIGRADE_REQUIRE_PLAN, VERDIGRADE_PLAN_AI, VERDIGRADE_PYTHON,
VERDIGRADE_TIMEOUT_MINUTES, VERDIGRADE_GITHUB_TOKEN (the older LEAPFROG_* and JAVA_MIGRATOR_* names are still read as a fallback).

Exit codes: 0 passed, 1 migration failed, 2 usage or configuration error.`;

type Flags = Record<string, string | boolean | string[]>;

const valued = new Set(["branch", "subdir", "to-java", "to-boot", "from-java", "from-boot", "to-node", "to-ts", "from-node", "to-python", "from-python", "ecosystem", "out", "plan", "note", "engine"]);
const repeated = new Set(["lock", "decide"]);

function parse(argv: string[]): { command: string; positional: string[]; flags: Flags } {
  const [command = "help", ...rest] = argv;
  const positional: string[] = [];
  const flags: Flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (item.startsWith("--")) {
      const [name, inline] = item.slice(2).split("=", 2);
      if (valued.has(name) || repeated.has(name)) {
        const value = inline ?? rest[index + 1];
        if (value === undefined || (inline === undefined && value.startsWith("--"))) throw new Error(`--${name} needs a value`);
        if (repeated.has(name)) flags[name] = [...((flags[name] as string[] | undefined) ?? []), value];
        else flags[name] = value;
        if (inline === undefined) index += 1;
      } else {
        flags[name] = true;
      }
    } else {
      positional.push(item);
    }
  }
  return { command, positional, flags };
}

function str(flags: Flags, name: string): string | undefined {
  return typeof flags[name] === "string" ? (flags[name] as string) : undefined;
}

function list(flags: Flags, name: string): string[] {
  const value = flags[name];
  const items = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return items.flatMap((item) => item.split(",")).map((item) => item.trim()).filter(Boolean);
}

/**
 * <path> may also be a GitHub link: it is cloned into data/repos/<owner>__<repo>
 * (token from VERDIGRADE_GITHUB_TOKEN / GITHUB_TOKEN). `refresh` fetches the latest
 * commit into an existing clone; otherwise the clone is reused as it is.
 */
async function repoArg(positional: string[], flags: Flags = {}, refresh = false): Promise<string> {
  const target = positional[0];
  if (!target) throw new Error("Missing <path>.");
  if (isGitHubInput(target)) {
    if (!flags.quiet) console.error(`Getting ${target} from GitHub…`);
    const source = await cloneGitHubRepo({ url: target, branch: str(flags, "branch"), subdir: str(flags, "subdir"), refresh, detect: detectEcosystem });
    if (!flags.quiet) {
      if (source.subdir) console.error(`Project folder: ${source.subdir}${source.autoDetected ? " (found automatically; use --subdir to pick another)" : ""}`);
      console.error(`Using the local clone ${source.clonePath ?? source.localPath} (${source.branch ?? "default branch"} @ ${source.commit?.slice(0, 12) ?? "?"}). Changes stay in this clone; nothing is pushed to GitHub.`);
    }
    return source.localPath;
  }
  const resolved = path.resolve(target);
  if (!existsSync(resolved)) throw new Error(`Not found: ${resolved}`);
  return resolved;
}

function targetRequest(flags: Flags): TargetRequest {
  return {
    targets: { java: str(flags, "to-java"), boot: str(flags, "to-boot"), node: str(flags, "to-node"), typescript: str(flags, "to-ts"), python: str(flags, "to-python") },
    from: { java: str(flags, "from-java"), boot: str(flags, "from-boot"), node: str(flags, "from-node"), python: str(flags, "from-python") },
  };
}

function ecosystemFlag(flags: Flags): string | undefined {
  const value = str(flags, "ecosystem");
  if (value && !isEcosystem(value)) throw new Error(`--ecosystem must be one of: ${adapters.map((adapter) => adapter.id).join(", ")}`);
  return value;
}

/** Apply --lock / --decide / --note to a plan. */
function applyReviewFlags(plan: MigrationPlan, flags: Flags): MigrationPlan {
  const decisions = list(flags, "decide").map((entry) => {
    const [id, decision] = entry.split("=", 2);
    if (!id || !["approve", "lock", "manual"].includes(decision)) throw new Error(`--decide needs <id>=approve|lock|manual (got "${entry}")`);
    return { id: id.trim(), decision: decision as "approve" | "lock" | "manual" };
  });
  const locks = list(flags, "lock");
  const note = str(flags, "note");
  if (!decisions.length && !locks.length && note === undefined) return plan;
  return updatePlan(plan, {
    decisions,
    lockedPaths: locks.length ? [...plan.lockedPaths, ...locks.map((pattern) => ({ pattern, note: "" }))] : undefined,
    reviewerNote: note,
  });
}

function printPlan(plan: MigrationPlan, file: string | null): void {
  const summary = planSummary(plan);
  const out: string[] = [];
  out.push(`Plan ${plan.planId} (${plan.status}) for ${plan.repoPath}`);
  out.push(`Ecosystem ${plan.ecosystem}, route ${plan.routeId}: ${plan.targetLabel}`);
  const recommendation = recommendEngine(plan);
  const details = planDetails(plan, recommendation.recommendedEngine);
  out.push(`From ${details.from.map((v) => `${v.label} ${v.value}`).join(", ") || "n/a"} to ${details.to.map((v) => `${v.label} ${v.value}`).join(", ") || plan.targetLabel}`);
  out.push("");
  out.push(`Recommended engine: ${recommendation.label} (${recommendation.confidence} confidence)`);
  out.push(`  ${recommendation.headline}`);
  for (const reason of recommendation.reasons) out.push(`  - ${reason}`);
  out.push(`  Other option: ${recommendation.alternative.text}.`);
  out.push(`Risk: ${details.risk.summary}`);
  if (details.needsYou.length) out.push(`You need to handle: ${details.needsYou.map((entry) => entry.title).join("; ")}`);
  out.push("");
  const groups: Array<[MigrationPlan["items"][number]["group"], string]> = [
    ["auto", "Will change automatically"],
    ["review", "Risky: review"],
    ["manual", "Needs manual intervention: will NOT be touched"],
  ];
  for (const [group, title] of groups) {
    const items = plan.items.filter((item) => item.group === group);
    out.push(`${title} (${items.length})`);
    if (!items.length) out.push("  (none)");
    for (const item of items) {
      const where = item.file ? `${item.file}${item.line ? `:${item.line}` : ""}` : "project-wide";
      out.push(`  [${item.decision}] ${item.id} ${item.severity.padEnd(6)} ${where}  ${item.explain?.plainTitle ?? item.title}${item.source === "ai" ? " (AI-suggested)" : ""}`);
      if (item.explain && item.decision !== "approve") out.push(`      if ${item.decision === "lock" ? "locked" : "manual"}: ${item.decision === "manual" ? item.explain.ifManual : item.explain.ifLocked}`);
    }
    out.push("");
  }
  if (plan.lockedPaths.length) out.push(`Locked paths: ${plan.lockedPaths.map((entry) => entry.pattern).join(", ")}`);
  for (const note of plan.notes) out.push(`Note: ${note}`);
  out.push(`Totals: ${summary.auto} auto, ${summary.review} review, ${summary.manual} manual, ${summary.locked} locked path(s).`);
  const impact = predictImpact(plan);
  out.push(`Impact preview (${impact.label.toLowerCase().replace(/\.$/, "")}): ${impact.headline}. ${impact.summary}`);
  for (const entry of lockedBlockers(impact)) out.push(`  ! ${entry.title} (${entry.where}): ${entry.text}`);
  if (file) {
    out.push(`Written to ${file}.`);
    if (plan.status !== "approved") out.push(`Review it (decision: approve | lock | manual, notes, lockedPaths), then: verdigrade approve ${JSON.stringify(plan.repoPath)}`);
  }
  console.error(out.join("\n"));
}

function loadPlanFor(repo: string, flags: Flags): { plan: MigrationPlan; source: "file" | "store" } | null {
  const ref = str(flags, "plan");
  if (ref && planIdPattern.test(ref)) {
    const stored = loadPlan(ref);
    if (!stored) throw new Error(`Unknown plan id ${ref}.`);
    return { plan: stored, source: "store" };
  }
  if (ref) return { plan: parsePlanText(readFileSync(path.resolve(ref), "utf8"), ref), source: "file" };
  const local = readPlanFile(repo);
  return local ? { plan: local, source: "file" } : null;
}


/** Engine from --engine (undefined without the flag: the CLI runs Classic locally, as it always did). */
function engineFlag(flags: Flags): Engine | undefined {
  const value = str(flags, "engine");
  if (value === undefined) return undefined;
  const engine = parseEngine(value);
  if (!engine) throw new Error(`--engine must be one of: ${engineList.join(", ")}`);
  return engine;
}

/**
 * The AI engines run through the Verdigrade server, which holds the AI login (CURSOR_API_KEY / agent-sdk login).
 * Starts the run there, prints its events and returns the final run state's report.
 */
async function runViaServer(input: { engine: Engine; repo: string; plan: MigrationPlan | null; flags: Flags; request: TargetRequest; ecosystem: string; quiet: boolean; soft?: boolean }): Promise<{ code: number; run: Record<string, unknown> | null; base: string }> {
  const token = envSetting("TOKEN");
  const root = envSetting("URL") ?? "http://127.0.0.1:3000";
  const { base, tried } = await discoverBase(root, token);
  const call = async (route: string, init: { method?: string; body?: unknown } = {}) => {
    const response = await fetch(`${base}${route}`, {
      method: init.method ?? "GET",
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.body !== undefined ? { "content-type": "application/json" } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      /* plain text (diff, markdown) */
    }
    return { ok: response.ok, status: response.status, data, text };
  };
  const unreachable = `The ${engineLabels[input.engine]} engine runs through the Verdigrade server (it holds the AI login), but it is not reachable at ${tried.join(" or ")}. Start it with "npm run dev" in agent/ (set VERDIGRADE_URL if it is not on ${root}), or run without --engine (free step only, no AI).`;
  // soft: the engine came from the plan's recommendation, not from --engine, so an unreachable server or a missing AI login falls back to the free step (code -1).
  const fallback = (why: string) => {
    console.error(`The plan recommends ${engineLabels[input.engine]}, but ${why} Running the free step only (no AI); pass --engine to force one.`);
    return { code: -1, run: null, base };
  };
  let config;
  try {
    config = await call("/config");
  } catch {
    if (input.soft) return fallback(`the Verdigrade server is not reachable at ${tried.join(" or ")} (start it with "npm run dev" in agent/).`);
    console.error(unreachable);
    return { code: 2, run: null, base };
  }
  if (!config.ok || !config.data) {
    if (input.soft && config.status === 404) return fallback(`no Verdigrade server answered at ${base}.`);
    console.error(config.status === 404 ? unreachable : maskSecrets(String(config.data?.error ?? `The server answered ${config.status} for ${base}/config.`)));
    return { code: 2, run: null, base };
  }
  const entry = (config.data?.engines?.list ?? []).find((item: { id: string }) => item.id === input.engine);
  if (entry && !entry.available) {
    if (input.soft) return fallback(`${entry.reason}`);
    console.error(`${entry.reason} Run without --engine to use the free step only (no AI).`);
    return { code: 2, run: null, base };
  }
  const { flags, request } = input;
  // The server only knows plans in its own store: hand it the approved plan this CLI loaded from a file.
  let planId = input.plan?.planId ?? null;
  if (input.plan) {
    const imported = await call("/plans/import", { method: "POST", body: { plan: input.plan } });
    if (!imported.ok) {
      console.error(maskSecrets(`Could not give the plan to the server: ${imported.data?.error ?? imported.text ?? imported.status}`));
      return { code: 2, run: null, base };
    }
    planId = String(imported.data?.plan?.planId ?? planId);
  }
  const started = await call("/start", {
    method: "POST",
    body: {
      repoPath: input.repo,
      planId: planId ?? undefined,
      ecosystem: input.ecosystem,
      dryRun: Boolean(flags["dry-run"]),
      allowDirty: Boolean(flags["allow-dirty"]),
      skipTests: flags["skip-tests"] ? true : undefined,
      engine: input.engine,
      targetJava: request.targets.java,
      targetBoot: request.targets.boot,
      targetNode: request.targets.node,
      targetTypescript: request.targets.typescript,
      targetPython: request.targets.python,
      fromJava: request.from.java,
      fromBoot: request.from.boot,
      fromNode: request.from.node,
      fromPython: request.from.python,
    },
  });
  if (!started.ok) {
    console.error(maskSecrets(String(started.data?.error ?? started.text ?? `Server answered ${started.status}`)));
    return { code: 2, run: null, base };
  }
  const runId = String(started.data.runId);
  let printed = 0;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const current = await call(`/runs/${encodeURIComponent(runId)}`);
    const run = current.data as Record<string, any> | null;
    if (!run) continue;
    if (!input.quiet) for (; printed < (run.events?.length ?? 0); printed += 1) console.error(`[${run.events[printed].step ?? "run"}] ${run.events[printed].message}`);
    if (run.status !== "running") return { code: run.status === "passed" ? 0 : 1, run: { ...run, runId }, base };
  }
}

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parse(process.argv.slice(2));
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
  const { command, positional, flags } = parsed;
  switch (command) {
    case "help":
    case "--help":
    case "-h":
      console.log(usage);
      return 0;
    case "validate": {
      let ok = true;
      for (const adapter of adapters) {
        const result = adapter.validateProfiles();
        if (result.ok) {
          console.log(`OK ${adapter.id}: ${result.routes} route(s)${result.packs.length ? `, rules packs: ${result.packs.join(", ")}` : ""}`);
          for (const route of (adapter.matrixView() as { routes?: { id: string; description?: string }[] }).routes ?? []) console.log(`   - ${route.id}${route.description ? `: ${route.description}` : ""}`);
        } else {
          ok = false;
          console.error(`${adapter.id}:\n${result.problems.join("\n")}`);
        }
      }
      return ok ? 0 : 2;
    }
    case "matrix":
      console.log(JSON.stringify(getAdapter((ecosystemFlag(flags) as "java" | "node" | "python" | undefined) ?? "java").matrixView(), null, 2));
      return 0;
    case "scan": {
      const repo = await repoArg(positional, flags);
      const adapter = adapterFor(repo, ecosystemFlag(flags));
      const scan = adapter.id === "node" ? scanNodeProject(repo) : adapter.id === "python" ? scanPythonProject(repo) : scanProject(repo, { excludeModules: loadRepoConfig(repo).excludeModules });
      console.log(JSON.stringify(scan, null, 2));
      return 0;
    }
    case "plan": {
      const repo = await repoArg(positional, flags, true);
      const ecosystem = ecosystemFlag(flags);
      if (flags["route-only"]) {
        const adapter = adapterFor(repo, ecosystem);
        const preview = adapter.preview(targetRequest(flags), repo, loadRepoConfig(repo));
        console.log(JSON.stringify(preview, null, 2));
        return preview.ok ? 0 : 1;
      }
      let plan = await generatePlan({ repoPath: repo, ecosystem, request: targetRequest(flags), preview: Boolean(flags.preview), ai: false });
      plan = applyReviewFlags(plan, flags);
      if (flags.approve) plan = approvePlan(plan);
      const withRecommendation = () => {
        const recommendation = recommendEngine(plan);
        return { ...plan, recommendedEngine: recommendation.recommendedEngine, recommendation };
      };
      if (flags.print) {
        console.log(JSON.stringify(withRecommendation(), null, 2));
        return 0;
      }
      const out = str(flags, "out");
      let file: string;
      if (out) {
        file = path.resolve(out);
        writeFileSync(file, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
      } else {
        file = writePlanFile(repo, plan);
      }
      printPlan(plan, file);
      if (flags.json) console.log(JSON.stringify(withRecommendation(), null, 2));
      return 0;
    }
    case "approve": {
      const repo = await repoArg(positional, flags);
      const ref = str(flags, "plan");
      const file = ref ? path.resolve(ref) : planFilePath(repo);
      if (!existsSync(file)) {
        console.error(`No plan at ${file}. Run: verdigrade plan ${JSON.stringify(repo)}`);
        return 2;
      }
      const plan = approvePlan(applyReviewFlags(parsePlanText(readFileSync(file, "utf8"), file), flags));
      writeFileSync(file, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
      printPlan(plan, null);
      const blockers = lockedBlockers(predictImpact(plan));
      if (blockers.length) console.error(`Warning: ${blockers.length} blocker-level item(s) are locked or manual; the dry run will likely fail (see the impact preview above).`);
      console.error(`Approved ${plan.planId} (${file}).`);
      return 0;
    }
    case "migrate": {
      const repo = await repoArg(positional, flags);
      const quiet = Boolean(flags.quiet);
      const skipPlan = Boolean(flags["no-plan"]) || !requirePlan();
      let loaded: ReturnType<typeof loadPlanFor> = null;
      try {
        loaded = flags["no-plan"] ? null : loadPlanFor(repo, flags);
      } catch (error) {
        console.error((error as Error).message);
        return 2;
      }
      if (!loaded && !skipPlan) {
        console.error(
          `An approved migration plan is required.\n  verdigrade plan ${JSON.stringify(repo)}      (review ${planFileName})\n  verdigrade approve ${JSON.stringify(repo)}\nor run with --no-plan (or VERDIGRADE_REQUIRE_PLAN=false).`,
        );
        return 2;
      }
      const plan = loaded?.plan ?? null;
      if (plan) {
        const problem = planProblem(plan, repo);
        if (problem) {
          console.error(problem);
          return 2;
        }
      }
      const adapter = adapterFor(repo, plan?.ecosystem ?? ecosystemFlag(flags));
      const request = plan ? { targets: plan.targets, from: plan.request.from } : targetRequest(flags);
      if (plan) {
        const targets = adapter.resolveTargets(request, loadRepoConfig(repo));
        if (!targets.ok || targets.routeId !== plan.routeId) {
          console.error(`Plan ${plan.planId} was made for route ${plan.routeId}; ${targets.ok ? `the targets now resolve to ${targets.routeId}` : targets.error}. Create a new plan.`);
          return 2;
        }
      }
      let engine: Engine | undefined;
      try {
        engine = engineFlag(flags);
      } catch (error) {
        console.error((error as Error).message);
        return 2;
      }
      // No --engine: use what the plan recommends (the same call the web screen makes).
      const recommended = !engine && plan ? recommendEngine(plan) : null;
      if (recommended && !quiet) console.error(`Engine: ${recommended.label} (recommended by the plan, ${recommended.confidence} confidence). ${recommended.headline}`);
      const chosen: Engine | undefined = engine ?? recommended?.recommendedEngine;
      let remote: Awaited<ReturnType<typeof runViaServer>> | null = null;
      if (chosen && usesAi(chosen)) {
        // AI engines need the server's model login; the run is saved in the server's history.
        remote = await runViaServer({ engine: chosen, repo, plan, flags, request, ecosystem: adapter.id, quiet, soft: !engine });
        if (remote.code === -1) remote = null;
      }
      if (chosen && remote) {
        if (!remote.run) return remote.code;
        const server = remote.base;
        const token = envSetting("TOKEN");
        const headers = token ? { authorization: `Bearer ${token}` } : undefined;
        const format = flags.json ? "json" : "md";
        const report = await (await fetch(`${server}/runs/${remote.run.runId}/report?format=${format}`, { headers })).text();
        const out = str(flags, "out");
        if (out) {
          mkdirSync(out, { recursive: true });
          writeFileSync(path.join(out, "report.md"), await (await fetch(`${server}/runs/${remote.run.runId}/report?format=md`, { headers })).text(), "utf8");
          writeFileSync(path.join(out, "report.json"), await (await fetch(`${server}/runs/${remote.run.runId}/report?format=json`, { headers })).text(), "utf8");
          writeFileSync(path.join(out, "changes.diff"), await (await fetch(`${server}/runs/${remote.run.runId}/diff`, { headers })).text(), "utf8");
        }
        console.log(report);
        return remote.code;
      }
      const runId = randomUUID();
      const artifactsDir = path.join(os.tmpdir(), "leapfrog-runs", runId);
      let printed = 0;
      const state = await runPipeline({
        runId,
        repoPath: repo,
        dryRun: Boolean(flags["dry-run"]),
        ecosystem: adapter.id,
        targetJava: request.targets.java,
        targetBoot: request.targets.boot,
        fromJava: request.from.java,
        fromBoot: request.from.boot,
        targets: request.targets,
        from: request.from,
        plan: plan && loaded ? runPlanInfo(plan, loaded.source) : null,
        allowDirty: Boolean(flags["allow-dirty"]),
        skipTests: flags["skip-tests"] ? true : undefined,
        engine: "classic",
        artifactsDir,
        onChange: (current) => {
          if (quiet) return;
          for (; printed < current.events.length; printed += 1) {
            const item = current.events[printed];
            console.error(`[${item.step ?? "run"}] ${item.message}`);
          }
        },
      });
      const out = str(flags, "out");
      if (out) {
        mkdirSync(out, { recursive: true });
        writeFileSync(path.join(out, "report.md"), reportMarkdown(state), "utf8");
        writeFileSync(path.join(out, "report.json"), `${JSON.stringify(reportJson(state), null, 2)}\n`, "utf8");
        writeFileSync(path.join(out, "changes.diff"), readDiff(state).diff, "utf8");
      }
      console.log(flags.json ? JSON.stringify(reportJson(state), null, 2) : reportMarkdown(state));
      if (!quiet) console.error(`\nArtifacts and full logs: ${artifactsDir}`);
      return state.status === "passed" ? 0 : 1;
    }
    default:
      console.error(`Unknown command: ${command}\n\n${usage}`);
      return 2;
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(maskSecrets(error instanceof Error ? error.message : String(error)));
    process.exitCode = 2;
  },
);

import { FileText, FlaskConical, ListChecks, Package, ScanSearch, ShieldCheck, Sparkles, WandSparkles, Wrench } from "lucide-react";

// Display metadata for the pipeline steps the server reports (agent/bot/lib/types.ts stepOrder).
export const stepOrder = ["preflight", "scan", "rewrite", "modernize", "test", "refactor", "package", "checks", "report"];

export const stepIcons = {
  preflight: ShieldCheck,
  scan: ScanSearch,
  rewrite: WandSparkles,
  modernize: Wrench,
  test: FlaskConical,
  refactor: Sparkles,
  package: Package,
  checks: ListChecks,
  report: FileText,
};

export const stepMeta = {
  preflight: { label: "Preflight", blurb: "JDK, build tool and git safety net (clean tree, branch or dry-run copy)." },
  scan: { label: "Scan", blurb: "Java level, Spring Boot version and Jakarta EE javax usage across every module." },
  rewrite: { label: "OpenRewrite", blurb: "Pinned matrix recipes, run only when their condition holds. One commit per recipe." },
  modernize: { label: "Modernize", blurb: "Anchored, idempotent rules packs for leftovers (starters, properties, YAML)." },
  test: { label: "Test", blurb: "mvn/gradle test. On failure the model gets a bounded fix-up round, committed separately." },
  refactor: { label: "Refactor", blurb: "Refactors picked in the plan's quiz, made by the AI after the upgrade passes. Build and tests run again; a refactor that breaks them is reverted." },
  package: { label: "Package", blurb: "Builds the artifact without tests; the jar or war path is recorded." },
  checks: { label: "Checks", blurb: "Asserts the target Java, Boot parent and no Jakarta EE javax left." },
  report: { label: "Report", blurb: "Diff, report.md and report.json written from the facts; narrative added on top." },
};

const nodeBlurbs = {
  preflight: "Node, npm and git safety net (clean tree, branch or dry-run copy).",
  scan: "Node, TypeScript and Express versions, deprecated APIs, Docker and CI runtimes.",
  rewrite: "Pinned codemods (Express 4 → 5) run only when their condition holds. One commit each.",
  modernize: "package.json engines, .nvmrc and tsconfig edits from the Node matrix.",
  test: "npm test. On failure the model gets a bounded fix-up round, committed separately.",
  package: "npm run build when the project has one.",
  checks: "Asserts the target Node, TypeScript and Express versions and the locked paths.",
};

const pythonBlurbs = {
  preflight: "A Python for the target line, git safety net, and pinned pyupgrade / django-upgrade in a cached venv.",
  scan: "Python, Django and Flask versions, removed and deprecated APIs, Docker and CI runtimes.",
  rewrite: "Pinned codemods (pyupgrade, django-upgrade) on unlocked .py files. One commit each.",
  modernize: "Dependency pins, requires-python, .python-version and removed-API rules, then pip install in a fresh venv.",
  test: "pytest (or manage.py test / unittest) in the venv. On failure the model gets a bounded fix-up round.",
  package: "python -m compileall, plus a wheel when the project declares a build system.",
  checks: "Asserts the declared Python, Django and Flask versions, no removed APIs left, and the locked paths.",
};

const blurbsByEcosystem = { node: nodeBlurbs, python: pythonBlurbs };

/** Step description for a given adapter; the server's own step summary wins when present. */
export function stepBlurb(id, ecosystem) {
  return blurbsByEcosystem[ecosystem]?.[id] || stepMeta[id]?.blurb || "";
}

export function formatDuration(ms) {
  if (ms == null) return "";
  if (ms < 1000) return `${ms} ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function formatTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** "3 min ago", "2 h ago", or a date for older runs. */
export function formatRelative(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 0) return formatTime(iso);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function folderName(repoPath) {
  return (repoPath || "").split(/[\\/]/).filter(Boolean).pop() || repoPath || "";
}

import { useState } from "react";
import { Clock, GitCommitHorizontal, TerminalSquare } from "lucide-react";
import { formatDuration, stepBlurb, stepIcons, stepMeta, stepOrder } from "../pipeline.js";
import LogViewer from "./LogViewer.jsx";
import { StatusPill } from "./ui.jsx";

const iconTone = {
  passed: "border-success/30 bg-success-soft text-success",
  failed: "border-danger/35 bg-danger-soft text-danger",
  running: "border-accent/40 bg-accent-soft text-accent",
  skipped: "border-border bg-surface-2 text-fg-subtle",
  waiting: "border-border bg-surface-2 text-fg-subtle",
};

const factTone = { passed: "text-success", failed: "font-medium text-danger", warning: "text-warning" };

/** The last non-empty line of a step's log, shown on the running step. */
function latestLine(text) {
  return (text ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop() ?? "";
}

export default function StepList({ run }) {
  const visible = stepOrder.filter((id) => run.steps[id]);
  const runningStep = visible.find((id) => run.steps[id]?.status === "running");
  const firstFailed = visible.find((id) => run.steps[id]?.status === "failed");
  const lastDone = [...visible].reverse().find((id) => ["passed", "skipped"].includes(run.steps[id]?.status));
  const [picked, setPicked] = useState(null);
  // Follow the live step unless the user picked one; otherwise show the failure, else the last finished step.
  // A finished run opens on the main rewrite step (where the code changed), not the report step.
  const mainStep = run.status !== "running" && run.steps.rewrite?.status === "passed" ? "rewrite" : null;
  const selected = picked && run.steps[picked] ? picked : (runningStep ?? firstFailed ?? mainStep ?? lastDone ?? visible[0]);
  const step = selected ? run.steps[selected] : null;
  const facts = step ? stepFacts(selected, step, run) : [];
  const hasLog = Boolean(step?.logFile || step?.logTail);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <ol className="relative self-start rounded-lg border border-border bg-surface p-2" aria-label="Steps">
        {visible.map((id, index) => {
          const item = run.steps[id];
          const Icon = stepIcons[id];
          const active = id === selected;
          const last = index === visible.length - 1;
          return (
            <li key={id} className="relative">
              {!last ? <span aria-hidden="true" className={`absolute top-10 bottom-0 left-[1.4rem] w-px ${item.status === "passed" ? "bg-success/40" : "bg-border"}`} /> : null}
              <button
                type="button"
                onClick={() => setPicked(id)}
                aria-pressed={active}
                className={`relative flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors ${active ? "bg-accent-soft" : "hover:bg-surface-2"}`}
              >
                <span className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full border ${iconTone[item.status] ?? iconTone.waiting} ${item.status === "running" ? "pulse-soft" : ""}`}>
                  <Icon aria-hidden="true" className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm font-semibold ${active ? "text-fg" : "text-fg"}`}>{item.label ?? stepMeta[id]?.label}</span>
                    <span className="shrink-0 text-xs text-fg-subtle tabular-nums">{item.durationMs != null ? formatDuration(item.durationMs) : statusWord[item.status] ?? ""}</span>
                  </span>
                  <span className={`mt-0.5 block truncate text-xs ${item.status === "failed" ? "text-danger" : "text-fg-muted"}`}>
                    {item.status === "running" && latestLine(item.logTail) ? latestLine(item.logTail) : item.summary || stepBlurb(id, run.ecosystem)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {step ? (
        <section aria-label={`${step.label ?? stepMeta[selected]?.label} details`} className="min-w-0 rounded-lg border border-border bg-surface">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h3 className="text-md font-semibold text-fg">{step.label ?? stepMeta[selected]?.label}</h3>
              <p className="mt-0.5 text-sm text-fg-muted">{step.summary || stepBlurb(selected, run.ecosystem)}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
                {step.exitCode != null ? <span className={`tabular-nums ${step.exitCode === 0 ? "" : "text-danger"}`}>exit {step.exitCode}</span> : null}
                {step.durationMs != null ? (
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Clock aria-hidden="true" className="size-3" />
                    {formatDuration(step.durationMs)}
                  </span>
                ) : null}
                {step.commit ? (
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <GitCommitHorizontal aria-hidden="true" className="size-3.5" />
                    {step.commit.slice(0, 7)}
                  </span>
                ) : null}
              </p>
            </div>
            <StatusPill status={step.status} />
          </div>
          <div className="space-y-3 px-5 py-4">
            {facts.length ? (
              <ul className="space-y-1 text-sm">
                {facts.map((fact) => (
                  <li key={fact.label} className={`flex gap-2 ${factTone[fact.tone] ?? "text-fg-muted"}`}>
                    <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-current opacity-60" />
                    <span className="min-w-0 break-words">{fact.label}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {step.command ? (
              <p className="flex items-start gap-2 rounded-md bg-surface-2 px-3 py-2 font-mono text-xs break-all text-fg-muted">
                <TerminalSquare aria-hidden="true" className="mt-px size-3.5 shrink-0 text-fg-subtle" />
                <span>
                  <span className="text-accent">$</span> {step.command}
                </span>
              </p>
            ) : null}
            {step.changedFiles?.length ? (
              <details className="text-sm">
                <summary className="cursor-pointer text-fg-muted hover:text-fg">{step.changedFiles.length} file(s) changed in this step</summary>
                <ul className="mt-2 space-y-0.5 font-mono text-xs text-fg">
                  {step.changedFiles.slice(0, 200).map((file) => (
                    <li key={file} className="break-all">
                      {file}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {hasLog ? (
              <LogViewer key={selected} runId={run.runId} step={selected} running={step.status === "running"} fallback={step.logTail} />
            ) : (
              <p className="text-sm text-fg-subtle">{step.status === "waiting" ? "Not started yet." : "This step ran no command."}</p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

const statusWord = { waiting: "waiting", running: "running", skipped: "skipped", failed: "failed" };

function stepFacts(id, step, run) {
  const facts = [];
  if (id === "scan" && run.scan?.ecosystem === "python") {
    facts.push({ label: `Python ${run.scan.pythonVersion ?? "?"}` });
    if (run.scan.djangoVersion) facts.push({ label: `Django ${run.scan.djangoVersion}` });
    if (run.scan.flaskVersion) facts.push({ label: `Flask ${run.scan.flaskVersion}` });
    facts.push({ label: `${run.scan.hits?.filter((hit) => hit.removedIn !== null).length ?? 0} removed API use(s)` });
    if (run.scan.testRunner) facts.push({ label: `tests: ${run.scan.testRunner}` });
  } else if (id === "scan" && run.scan?.ecosystem === "node") {
    facts.push({ label: `Node ${run.scan.nodeVersion ?? "?"}` });
    facts.push({ label: `TypeScript ${run.scan.typescriptVersion ?? "none"}` });
    facts.push({ label: `Express ${run.scan.expressMajor ?? "none"}` });
    facts.push({ label: `${run.scan.expressDeprecated?.length ?? 0} Express 4 API(s)` });
  } else if (id === "scan" && run.scan) {
    facts.push({ label: `Java ${run.scan.javaVersion ?? "?"}` });
    facts.push({ label: `Boot ${run.scan.springBootVersion ?? "none"}` });
    facts.push({ label: `${run.scan.modules?.length ?? 1} module(s)` });
    facts.push({ label: `${run.scan.javaxFiles?.length ?? 0} javax file(s)` });
  }
  if (id === "rewrite") {
    for (const recipe of run.recipes ?? []) {
      facts.push({
        label: `${(recipe.label || recipe.recipe.split(".").pop())}: ${recipe.ran ? (recipe.ok ? `${recipe.changedFiles.length} file(s)` : "failed") : "skipped"}`,
        tone: recipe.ran ? (recipe.ok ? "passed" : "failed") : undefined,
      });
    }
  }
  if (id === "modernize" && run.ruleEdits?.length) facts.push({ label: `${run.ruleEdits.filter((edit) => edit.applied).length} rule edit(s)` });
  if (id === "test") {
    if (run.tests && run.tests.testsRun != null) {
      facts.push({ label: `${run.tests.testsRun} run` });
      facts.push({ label: `${run.tests.failures ?? 0} failed`, tone: run.tests.failures ? "failed" : undefined });
      facts.push({ label: `${run.tests.errors ?? 0} errors`, tone: run.tests.errors ? "failed" : undefined });
      if (run.tests.skipped) facts.push({ label: `${run.tests.skipped} skipped` });
    }
    if (run.fixRounds?.length) facts.push({ label: `${run.fixRounds.length} fix-up round(s)`, tone: "warning" });
  }
  const blocked = (run.lockViolations ?? []).filter((v) => v.step === id).length;
  if (blocked) facts.push({ label: `${blocked} protected edit${blocked === 1 ? "" : "s"} blocked`, tone: "warning" });
  if (id === "package") for (const artifact of run.artifacts ?? []) facts.push({ label: artifact.split(/[\\/]/).pop() });
  if (id === "checks") {
    for (const check of run.checks ?? []) {
      if (check.id === "page-check" && !check.ok && run.pageCheck?.problems?.length) continue;
      facts.push({ label: check.message, tone: check.ok ? "passed" : check.level === "error" ? "failed" : "warning" });
    }
    if (run.pageCheck?.ran && run.pageCheck.problems?.length) {
      facts.push({ label: `Page check: ${run.pageCheck.problems.length} problem${run.pageCheck.problems.length === 1 ? "" : "s"} on the running page`, tone: "warning" });
      for (const problem of run.pageCheck.problems) facts.push({ label: `${problem.call}: ${problem.message}`, tone: "warning" });
    } else if (run.pageCheck && !run.pageCheck.ran) {
      facts.push({ label: `Page check not run: ${run.pageCheck.note}` });
    }
  }
  return facts;
}

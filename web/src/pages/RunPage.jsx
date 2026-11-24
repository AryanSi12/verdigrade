import { useEffect, useState } from "react";
import SourceBadge, { LocalCloneNote, sourceName } from "../components/SourceBadge.jsx";
import { Link, NavLink, useParams } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  CircleCheck,
  CircleX,
  LoaderCircle,
  Download,
  FileDiff,
  FileText,
  MonitorPlay,
  ListChecks,
  Play,
  RotateCcw,
  TriangleAlert,
  ClipboardList,
} from "lucide-react";
import FollowUps, { followUpCounts } from "../components/FollowUps.jsx";
import LivePreview from "../components/LivePreview.jsx";
import Journey from "../components/Journey.jsx";
import LangBadge from "../components/LangBadge.jsx";
import DiffViewer from "../components/DiffViewer.jsx";
import { engineMeta, EngineNotes, formatInOut, formatTokens } from "../components/Engine.jsx";
import MarkdownView from "../components/MarkdownView.jsx";
import StepList from "../components/StepList.jsx";
import { useToast } from "../components/Toaster.jsx";
import { Button, buttonClass, Card, ContentHeader, EmptyState, ErrorState, KpiGrid, Skeleton, Spinner, StatusPill } from "../components/ui.jsx";
import { api } from "../api.js";
import { useMigration } from "../migrationContext.js";
import { folderName, formatDuration, formatRelative, formatTime, stepOrder } from "../pipeline.js";
import { downloadReportPdf } from "../reportPdf.js";
import { useAsync } from "../useAsync.js";
import { useRun } from "../useRun.js";

const tabs = [
  { id: "steps", label: "Steps", icon: ListChecks },
  { id: "diff", label: "Diff", icon: FileDiff },
  { id: "report", label: "Report", icon: FileText },
  { id: "preview", label: "Live preview", icon: MonitorPlay },
];

function Versions({ from, to }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-fg-subtle">{from}</span>
      <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-fg-subtle" />
      <span>{to}</span>
    </span>
  );
}

export default function RunPage() {
  const { runId, tab = "steps" } = useParams();
  const { run, error, loading, refresh } = useRun(runId);
  const { refreshHistory } = useMigration();
  const [action, setAction] = useState(null);
  const toast = useToast();

  // Refresh the history list once, when this run finishes.
  const finished = run && !run.legacy && run.status !== "running";
  useEffect(() => {
    if (finished) refreshHistory();
  }, [finished, refreshHistory]);

  if (error && !run) {
    return (
      <Shell>
        <ErrorState error={error} onRetry={refresh} />
        <p className="mt-3 text-sm"><Link to="/" className="font-medium text-accent underline-offset-4 hover:underline">Back to Overview</Link> <span className="text-fg-subtle">·</span> <Link to="/new" className="font-medium text-accent underline-offset-4 hover:underline">Start a migration</Link></p>
      </Shell>
    );
  }
  if (loading && !run) {
    return (
      <Shell>
        <Skeleton className="h-36 rounded-xl" />
        <div className="mt-6 space-y-3">
          {stepOrder.slice(0, 4).map((id) => (
            <Skeleton key={id} className="h-16 rounded-xl" />
          ))}
        </div>
      </Shell>
    );
  }
  if (!run) return null;
  if (run.legacy) return <LegacyRun record={run.record} reportText={run.reportText} />;

  async function act(kind) {
    if (kind === "rollback" && !window.confirm("Roll back every change this run made? The migration commits are undone.")) return;
    setAction(kind);
    try {
      const result = kind === "cancel" ? await api.cancel(run.runId) : await api.rollback(run.runId);
      toast.success(kind === "cancel" ? "Cancel requested" : "Rolled back", result.message || "");
      refresh();
    } catch (caught) {
      toast.error(kind === "cancel" ? "Could not cancel" : "Could not roll back", caught?.message || String(caught));
    } finally {
      setAction(null);
    }
  }

  const running = run.status === "running";
  const canRollback = !running && !run.dryRun && run.git?.mode !== "none" && run.git?.commits?.length > 0 && !run.git?.rolledBack;
  const failedStep = stepOrder.find((id) => run.steps[id]?.status === "failed");
  const doneSteps = stepOrder.filter((id) => ["passed", "failed", "skipped"].includes(run.steps[id]?.status)).length;
  const totalSteps = stepOrder.filter((id) => run.steps[id]).length || stepOrder.length;
  const tests = run.tests;
  const testsFailed = (tests?.failures ?? 0) + (tests?.errors ?? 0);

  const journeyState = running ? "running" : run.status === "failed" ? "failed" : "active";
  const planLink = run.plan ? `/plan/${run.plan.planId}` : null;
  const stepLabel = (id) => run.steps[id]?.label ?? id;
  const versions = run.versions?.length
    ? run.versions.slice(0, 3)
    : [
        { key: "java", label: "Java", before: run.from?.java ?? "?", after: run.after?.java, target: run.route?.targetJava ?? run.request?.targetJava },
        { key: "boot", label: "Spring Boot", before: run.from?.boot ?? "none", after: run.after?.boot, target: run.route?.parentHint ?? run.request?.targetBoot },
      ];

  const currentStep = stepOrder.find((id) => run.steps[id]?.status === "running");
  const lastLine = (text) => (text ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop() ?? "";
  const latest = currentStep ? lastLine(run.steps[currentStep].logTail) : "";
  const engineInfo = run.engine;
  const engineLabel = engineInfo ? (engineMeta[engineInfo.engine] ?? engineMeta.classic).label : null;
  const usesAi = engineInfo && engineInfo.engine !== "classic";
  const tokensKnown = usesAi && engineInfo.ai?.tokensIn != null && engineInfo.ai?.tokensOut != null;
  const page = run.pageCheck;
  const pageProblems = page?.problems?.length ?? 0;
  const shortCount = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : formatTokens(n));
  const status = running
    ? { word: "Running", icon: LoaderCircle, tone: "text-accent", bar: "border-l-accent", spin: true }
    : run.status === "passed"
      ? { word: "Passed", icon: CircleCheck, tone: "text-success", bar: "border-l-success" }
      : { word: "Failed", icon: CircleX, tone: "text-danger", bar: "border-l-danger" };
  const verdict = running
    ? `Step ${Math.min(doneSteps + 1, totalSteps)} of ${totalSteps}: ${currentStep ? stepLabel(currentStep) : "starting"}`
    : run.status === "passed"
      ? run.dryRun
        ? "The upgrade built and tested cleanly on a temporary copy. Review the diff, then run it for real."
        : "The upgrade is applied to your project."
      : failedStep
        ? `Stopped at ${stepLabel(failedStep)}. Open the step below to see why.`
        : "The run did not finish.";
  const kpis = [
    { label: "Engine", value: engineLabel ?? "Free step", hint: usesAi && engineInfo.model ? engineInfo.model : run.dryRun ? "dry run on a copy" : "applied to the folder", title: usesAi && engineInfo.model ? `Model ${engineInfo.model}` : undefined },
    { label: running ? "Elapsed" : "Duration", value: running ? "…" : formatDuration(run.durationMs) || "—", hint: `started ${formatRelative(run.startedAt)}`, title: `Started ${formatTime(run.startedAt)}` },
    {
      label: "Tokens in / out",
      value: !engineInfo ? "—" : !usesAi ? "0" : tokensKnown ? `${shortCount(engineInfo.ai.tokensIn)} / ${shortCount(engineInfo.ai.tokensOut)}` : "n/a",
      hint: engineInfo?.estimate ? `est. ${formatInOut(engineInfo.estimate)}` : usesAi ? "as reported by the SDK" : "no AI used",
      title: tokensKnown ? `${formatTokens(engineInfo.ai.tokensIn)} in / ${formatTokens(engineInfo.ai.tokensOut)} out` : undefined,
    },
    { label: "Files changed", value: run.changedFiles?.length ?? 0, hint: run.git?.commits?.length ? `${run.git.commits.length} commit(s)` : run.dryRun ? "on the dry-run copy" : "" },
    page?.ran
      ? {
          label: "Page check",
          value: pageProblems ? `${pageProblems} issue${pageProblems === 1 ? "" : "s"}` : "OK",
          tone: pageProblems ? "warning" : "success",
          hint: page.initialProblems && page.initialProblems !== pageProblems ? `${page.initialProblems} found at first` : page.fixAttempted ? `${page.rounds} AI fix-up round(s)` : pageProblems ? "reported only" : "page API calls work",
        }
      : {
          label: "Tests",
          value: tests?.testsRun != null ? `${tests.testsRun - testsFailed - (tests.skipped ?? 0)}/${tests.testsRun}` : "—",
          tone: tests?.testsRun != null ? (testsFailed ? "danger" : "success") : undefined,
          hint: tests?.testsRun != null ? `${testsFailed} failed · ${tests.skipped ?? 0} skipped` : run.request?.skipTests ? "skipped" : "not run yet",
        },
  ];
  const stripDot = running ? "bg-accent" : run.status === "passed" ? "bg-success" : "bg-danger";

  return (
    <Shell>
      <ContentHeader
        crumbs={[{ label: "Overview", to: "/" }, { label: run.dryRun ? "Dry run" : "Run" }, { label: run.runId.slice(0, 8) }]}
        title={sourceName(run.source, folderName(run.repoPath))}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <LangBadge ecosystem={run.ecosystem} />
            {versions.map((fact) => (
              <span key={fact.key} className="inline-flex items-center gap-1">
                {fact.label} <Versions from={fact.before ?? "?"} to={fact.after ?? fact.target} />
              </span>
            ))}
            {planLink ? (
              <Link to={planLink} className="font-medium text-accent hover:underline">
                Approved plan
              </Link>
            ) : null}
          </span>
        }
        meta={
          <>
            <p className="font-mono text-xs break-all text-fg-subtle">
              {run.repoPath}
              {run.git?.branch ? ` · ${run.git.branch}` : ""}
            </p>
            {run.source ? <SourceBadge source={run.source} className="mt-1.5" /> : null}
            <LocalCloneNote source={run.source} className="mt-1" />
          </>
        }
        actions={
          <>
            {!running ? <DownloadReportMenu run={run} /> : null}
            {running ? (
              <Button variant="danger" onClick={() => act("cancel")} disabled={Boolean(action)}>
                <Ban aria-hidden="true" /> {action === "cancel" ? "Cancelling…" : "Cancel"}
              </Button>
            ) : null}
            {canRollback ? (
              <Button onClick={() => act("rollback")} disabled={Boolean(action)}>
                <RotateCcw aria-hidden="true" /> {action === "rollback" ? "Rolling back…" : "Roll back"}
              </Button>
            ) : null}
            {!running && run.dryRun && run.status === "passed" ? (
              <Link to="/new" state={{ repoPath: run.repoPath }} className={buttonClass({ variant: "primary", size: "lg" })}>
                <Play aria-hidden="true" /> Run for real…
              </Link>
            ) : null}
          </>
        }
      />
      <Journey
        current={run.status === "passed" ? "review" : "dryrun"}
        state={journeyState}
        labels={run.dryRun ? undefined : { dryrun: "Run" }}
        links={{ new: "/new", ...(planLink ? { plan: planLink, approve: planLink } : {}) }}
        className="mt-6"
      />

      <div className="mt-8 overflow-hidden rounded-[10px] bg-surface shadow-card" role="status" aria-live="polite">
        <div className="flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:items-center sm:gap-5">
          <p className={`flex shrink-0 items-center gap-2.5 font-display text-[17px] font-semibold tracking-[-0.015em] ${status.tone}`}>
            <span className="relative flex size-2.5">
              {running ? <span className={`pulse-soft absolute inline-flex size-full scale-[2] rounded-full opacity-25 ${stripDot}`} /> : null}
              <span className={`relative inline-flex size-2.5 rounded-full ${stripDot}`} />
            </span>
            {status.word}
            {run.git?.rolledBack ? <span className="text-sm font-medium text-fg-muted">· rolled back</span> : null}
          </p>
          <p className="min-w-0 text-[13.5px] text-fg-muted">{verdict}</p>
        </div>
        <div className="h-[3px] bg-surface-2" aria-hidden="true">
          <div className={`h-full transition-[width] duration-500 ${stripDot}`} style={{ width: `${running ? Math.max(4, (doneSteps / totalSteps) * 100) : 100}%`, opacity: running ? 1 : 0.85 }} />
        </div>
      </div>

      <KpiGrid className="mt-4" items={kpis} />

      {run.error || run.warnings?.length || run.engine?.notes?.length ? (
        <div className="mt-4 space-y-3">
          {run.error ? <ErrorState error={{ message: `${failedStep ? `${run.steps[failedStep].label}: ` : ""}${run.error}` }} /> : null}
          {run.warnings?.length ? (
            <ul className="space-y-1 rounded-[10px] border border-warning/25 bg-warning-soft/60 px-4 py-2.5 text-[13px] text-fg-muted">
              {run.warnings.map((warning) => (
                <li key={warning} className="flex gap-2.5">
                  <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning" />
                  {warning}
                </li>
              ))}
            </ul>
          ) : null}
          <EngineNotes run={run} />
        </div>
      ) : null}

      <FollowUps run={run} stepLabel={stepLabel} />

      <nav className="mt-10 mb-6 flex gap-1 overflow-x-auto border-b border-border" aria-label="Run sections">
        {tabs.map((item) => (
          <NavLink
            key={item.id}
            to={`/runs/${run.runId}${item.id === "steps" ? "" : `/${item.id}`}`}
            end
            aria-current={tab === item.id ? "page" : undefined}
            className={() =>
              `-mb-px inline-flex h-10 items-center gap-2 border-b-2 px-3 text-[13.5px] font-medium whitespace-nowrap transition-colors duration-150 ${
                tab === item.id ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg"
              }`
            }
          >
            <item.icon aria-hidden="true" className="size-4 shrink-0 opacity-70" strokeWidth={1.75} />
            {item.label}
            {item.id === "diff" && run.changedFiles?.length ? <span className="text-xs text-fg-subtle tabular-nums">{run.changedFiles.length}</span> : null}
          </NavLink>
        ))}
      </nav>

      {tab === "diff" ? (
        <DiffViewer runId={run.runId} version={`${run.git?.headCommit ?? ""}|${run.status}|${run.git?.rolledBack}`} />
      ) : tab === "report" ? (
        <ReportTab run={run} />
      ) : tab === "preview" ? (
        <LivePreview run={run} />
      ) : (
        <StepList key={run.runId} run={run} />
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 pt-6 pb-8 sm:px-8 sm:pt-8">
      {children}
    </div>
  );
}

function saveBlob(content, fileName, type) {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DownloadReportMenu({ run }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const toast = useToast();
  const name = `${folderName(run.repoPath)}-${run.runId.slice(0, 8)}`;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    const onClick = (event) => !event.target.closest?.("[data-download-menu]") && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const run_ = async (kind) => {
    setBusy(kind);
    setOpen(false);
    try {
      if (kind === "json") {
        const { text } = await api.reportJson(run.runId);
        saveBlob(text, `${name}.json`, "application/json");
      } else {
        const { text } = await api.report(run.runId);
        if (kind === "pdf") await downloadReportPdf(text, `${name}.pdf`);
        else saveBlob(text, `${name}.md`, "text/markdown");
      }
      toast.success("Report downloaded", `${name}.${kind}`);
    } catch (caught) {
      toast.error("Download failed", caught?.message || String(caught));
    } finally {
      setBusy(null);
    }
  };

  const items = [
    { kind: "pdf", label: "PDF report", hint: "For sharing and reviews" },
    { kind: "md", label: "Markdown (.md)", hint: "For PRs, wikis and docs" },
    { kind: "json", label: "JSON (.json)", hint: "For CI and dashboards" },
  ];

  return (
    <div className="relative" data-download-menu>
      <Button variant="secondary" aria-haspopup="menu" aria-expanded={open} disabled={Boolean(busy)} onClick={() => setOpen((value) => !value)}>
        <Download aria-hidden="true" /> {busy ? "Preparing…" : "Download report"}
      </Button>
      {open ? (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-xl border border-border-strong bg-surface p-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.kind}
              type="button"
              role="menuitem"
              onClick={() => run_(item.kind)}
              className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
            >
              <span className="text-sm font-medium text-fg">{item.label}</span>
              <span className="text-xs text-fg-muted">{item.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReportTab({ run }) {
  const version = `${run.status}|${run.narrative?.status}|${run.git?.rolledBack}`;
  const report = useAsync((signal) => api.report(run.runId, signal), [run.runId, version]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const toast = useToast();
  const name = `${folderName(run.repoPath)}-${run.runId.slice(0, 8)}`;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
      <Card as="article" className="min-w-0 p-5 md:p-8">
        {report.error ? (
          <ErrorState error={report.error} onRetry={report.reload} />
        ) : !report.data ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <MarkdownView text={report.data.text} />
        )}
      </Card>
      <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
        {run.plan || run.lockViolations?.length ? <ReportFollowUpCard run={run} /> : null}
        <Card className="space-y-2 p-4">
          <p className="mb-1 text-sm font-semibold text-fg">Export</p>
          <Button
            variant="secondary"
            className="w-full"
            disabled={!report.data || pdfBusy}
            onClick={async () => {
              setPdfBusy(true);
              try {
                await downloadReportPdf(report.data.text, `${name}.pdf`);
              } catch (caught) {
                toast.error("PDF export failed", caught?.message || String(caught));
              } finally {
                setPdfBusy(false);
              }
            }}
          >
            <Download aria-hidden="true" /> {pdfBusy ? "Preparing…" : "Download PDF"}
          </Button>
          {report.data ? (
            <Button variant="secondary" className="w-full" onClick={() => saveBlob(report.data.text, `${name}.md`, "text/markdown")}>
              <FileText aria-hidden="true" /> Download Markdown
            </Button>
          ) : null}
        </Card>
        <p className="px-1 text-xs break-words text-fg-subtle">
          {run.narrative?.status === "running" || run.narrative?.status === "pending" ? (
            <Spinner label="Writing the narrative…" className="text-xs" />
          ) : run.narrative?.status === "skipped" ? (
            "Narrative disabled; the report is facts only."
          ) : run.narrative?.status === "failed" ? (
            "The narrative could not be written; the facts above are complete."
          ) : (
            <>
              Artifacts on the server: <span className="font-mono">{run.artifactsDir}</span>
            </>
          )}
        </p>
      </aside>
    </div>
  );
}

function ReportFollowUpCard({ run }) {
  const { items, blocked, pipeline } = followUpCounts(run);
  return (
    <Card className="p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-fg">
        <TriangleAlert aria-hidden="true" className="size-4 text-warning" /> Manual follow-up
      </p>
      <dl className="mt-3 space-y-1.5 text-sm">
        {[
          ["Kept for a human", items.length],
          ["Edits blocked", blocked],
          ["Pipeline notes", pipeline],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-2">
            <dt className="text-fg-muted">{label}</dt>
            <dd className="font-medium text-fg tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-fg-subtle">Listed in full in the report under “Manual follow-up”.</p>
      {run.plan ? (
        <Link to={`/plan/${run.plan.planId}`} className={buttonClass({ variant: "secondary", size: "sm", className: "mt-3 w-full" })}>
          <ClipboardList aria-hidden="true" /> Open the plan
        </Link>
      ) : null}
    </Card>
  );
}

function LegacyRun({ record, reportText }) {
  return (
    <Shell>
      <Card className="p-5 sm:p-6">
        <StatusPill status={record?.status === "passed" ? "passed" : record?.status === "failed" ? "failed" : "skipped"} label={record?.status ?? "saved"} />
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-fg">{folderName(record?.repoPath)}</h1>
        <p className="mt-1 text-sm text-fg-muted">Saved by an earlier version of Verdigrade: only the summary below was stored, with no step logs or diff.</p>
      </Card>
      <Card as="article" className="mt-6 p-5 md:p-8">
        {reportText ? <MarkdownView text={reportText} /> : <EmptyState title="No report text was saved" />}
      </Card>
    </Shell>
  );
}

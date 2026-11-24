import { ArrowRight, Ban, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Scorecard } from "../components/Engine.jsx";
import { useToast } from "../components/Toaster.jsx";
import { Button, buttonClass, Card, ContentHeader, ErrorState, Skeleton, Spinner, StatusText } from "../components/ui.jsx";
import { api } from "../api.js";
import { formatTime } from "../pipeline.js";
import { downloadReportPdf } from "../reportPdf.js";

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

/** Side-by-side engine scorecard for one comparison (live while it runs, saved in history afterwards). */
export default function ComparePage() {
  const { comparisonId } = useParams();
  const toast = useToast();
  const [comparison, setComparison] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let stopped = false;
    let timer;
    const controller = new AbortController();
    async function load() {
      try {
        const result = await api.comparison(comparisonId, controller.signal);
        if (stopped) return;
        setComparison(result.comparison);
        setError(null);
        if (result.comparison.status === "running") timer = setTimeout(load, 2500);
      } catch (caught) {
        if (!stopped && caught?.name !== "AbortError") setError(caught);
      }
    }
    setComparison(null);
    load();
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [comparisonId]);

  const running = comparison?.status === "running";
  const name = comparison ? `${comparison.repoName}-engines-${comparison.id.slice(0, 8)}` : "comparison";

  async function download(kind) {
    setBusy(kind);
    try {
      if (kind === "json") saveBlob((await api.comparisonReport(comparisonId, "json")).text, `${name}.json`, "application/json");
      else {
        const { text } = await api.comparisonReport(comparisonId, "md");
        if (kind === "pdf") await downloadReportPdf(text, `${name}.pdf`);
        else saveBlob(text, `${name}.md`, "text/markdown");
      }
      toast.success("Scorecard downloaded", `${name}.${kind}`);
    } catch (caught) {
      toast.error("Download failed", caught?.message || String(caught));
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    try {
      await api.cancelComparison(comparisonId);
      toast.success("Cancel requested", "The current run is being stopped; the rest are skipped.");
    } catch (caught) {
      toast.error("Could not cancel", caught?.message || String(caught));
    }
  }

  const statusTone = running ? "running" : comparison?.status === "done" ? "passed" : "failed";
  const statusWord = running ? "Running…" : comparison?.status === "done" ? "Done" : comparison?.status === "cancelled" ? "Cancelled" : "Failed";
  return (
    <div className="mx-auto max-w-[1200px] px-4 pt-6 pb-12 sm:px-8 sm:pt-8">
      {error ? (
        <div>
          <ErrorState error={error} />
          <p className="mt-3 text-sm"><Link to="/" className="font-medium text-accent underline-offset-4 hover:underline">Back to Overview</Link> <span className="text-fg-subtle">·</span> <Link to="/new" className="font-medium text-accent underline-offset-4 hover:underline">Start a migration</Link></p>
        </div>
      ) : !comparison ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-64 rounded-[10px]" />
        </div>
      ) : (
        <>
          <ContentHeader
            crumbs={[{ label: "Overview", to: "/" }, { label: "Engine comparison" }]}
            title={comparison.repoName}
            subtitle={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusText tone={statusTone}>{statusWord}</StatusText>
                <span>Dry-run copies · started {formatTime(comparison.createdAt)} · your folder is never changed</span>
              </span>
            }
            meta={<p className="font-mono text-xs break-all text-fg-subtle">{comparison.repoPath}</p>}
            actions={
              running ? (
                <Button variant="danger" onClick={cancel}>
                  <Ban aria-hidden="true" /> Cancel
                </Button>
              ) : (
                ["pdf", "md", "json"].map((kind) => (
                  <Button key={kind} variant="secondary" disabled={Boolean(busy)} onClick={() => download(kind)}>
                    <Download aria-hidden="true" /> {busy === kind ? "Preparing…" : kind === "pdf" ? "PDF" : kind === "md" ? "Markdown" : "JSON"}
                  </Button>
                ))
              )
            }
          />
          <Card className="mt-8 p-5 sm:p-6">
            {running ? (
              <p className="mb-4 flex items-center gap-2 text-sm text-fg-muted" role="status">
                <Spinner label="Running the engines one after another…" />
              </p>
            ) : null}
            {comparison.error ? <div className="mb-4"><ErrorState error={{ message: comparison.error }} /></div> : null}
            <Scorecard comparison={comparison} />
            <ul className="mt-5 flex flex-wrap gap-2 text-xs">
              {comparison.runs
                .filter((run) => run.runId)
                .map((run) => (
                  <li key={run.engine}>
                    <Link to={`/runs/${run.runId}`} className={buttonClass({ size: "sm" })}>
                      Open the {run.engine === "ai" ? "AI" : run.engine} run <ArrowRight aria-hidden="true" />
                    </Link>
                  </li>
                ))}
            </ul>
            <p className="mt-5 max-w-3xl text-xs leading-relaxed text-fg-subtle">
              The token estimate is a range from the repo's file sizes, made before the run; the actual count comes from the SDK (&quot;n/a&quot; means it did not report it). A cost is shown only when the SDK reports one; Verdigrade never estimates prices. Items left for manual fix = manual follow-ups, locked or manual plan items and failed checks.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

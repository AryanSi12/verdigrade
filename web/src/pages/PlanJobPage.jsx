import { FlaskConical } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import Journey from "../components/Journey.jsx";
import { PlanningBanner } from "../components/PlanningBanner.jsx";
import { Button, ContentHeader, ErrorState, Skeleton } from "../components/ui.jsx";
import { api } from "../api.js";

/**
 * The plan screen while the plan is still being made (GET /plan-jobs/:id).
 * A sticky banner shows the stage and the time; the page below fills in and
 * switches to the real plan the moment it exists. Nothing can be approved yet.
 */
export default function PlanJobPage() {
  const { jobId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [startedAt] = useState(() => location.state?.planning?.startedAt ?? Date.now());

  useEffect(() => {
    let stopped = false;
    let timer;
    const controller = new AbortController();
    async function poll() {
      try {
        const result = await api.planJob(jobId, controller.signal);
        if (stopped) return;
        setJob(result.job);
        if (result.job.status === "done" && result.job.planId) {
          navigate(`/plan/${result.job.planId}`, { replace: true, state: { ...location.state, planning: { startedAt } } });
          return;
        }
        if (result.job.status === "failed") {
          const failure = new Error(result.job.error || "The plan could not be created.");
          failure.body = { error: result.job.error, code: result.job.code, candidates: result.job.candidates };
          setError(failure);
          return;
        }
        timer = setTimeout(poll, 400);
      } catch (e) {
        if (!stopped && e?.name !== "AbortError") setError(e);
      }
    }
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const stages = job?.stages ?? [{ id: "reading", label: "Reading the project", state: "running" }];
  const repoLabel = location.state?.repoLabel;
  return (
    <div className="mx-auto max-w-[1200px] px-4 pt-6 pb-6 sm:px-8 sm:pt-8">
      {error ? (
        <PlanningBanner title="Planning stopped" detail={error.message} stages={stages.map((stage) => (stage.state === "running" ? { ...stage, state: "failed" } : stage))} startedAt={startedAt} failed />
      ) : (
        <PlanningBanner
          title={`Planning… ${job?.stageLabel ?? "Starting"}`}
          detail={`Read-only: nothing in your project changes while we plan.${repoLabel ? ` ${repoLabel}` : ""}`}
          stages={[...stages, { id: "ai-review", label: "AI review", state: "waiting" }]}
          startedAt={startedAt}
        />
      )}
      <ContentHeader
        crumbs={[{ label: "New migration", to: "/new" }, { label: "Plan" }]}
        title={repoLabel || "New plan"}
        subtitle="Read-only: nothing in your project changes while we plan."
      />
      <Journey current="approve" state="active" links={{ new: "/new" }} className="mt-6" />
      {error ? (
        <div className="mt-6">
          <ErrorState error={error} />
          {error.body?.candidates?.length ? (
            <p className="mt-3 text-sm text-fg-muted">
              Projects found: {error.body.candidates.map((entry) => `${entry.subdir} (${entry.ecosystem})`).join(", ")}. Go back and pick one as the subfolder.
            </p>
          ) : null}
          <Link to="/new" className="mt-4 inline-flex text-sm font-medium text-accent underline-offset-4 hover:underline">
            Back to project & targets
          </Link>
        </div>
      ) : (
        <div aria-hidden="true">
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-[5.5rem] rounded-lg" />
            ))}
          </div>
          <Skeleton className="mt-4 h-11 rounded-lg" />
          <Skeleton className="mt-6 h-64 rounded-lg" />
          <div className="mt-6 space-y-3">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-20 rounded-lg" />
            ))}
          </div>
        </div>
      )}
      <div className="pointer-events-none sticky bottom-0 z-30 -mx-1 mt-10 pb-3 sm:pb-5">
        <div role="region" aria-label="Approve the plan" className="approval-bar pointer-events-auto flex flex-col gap-2.5 rounded-xl border border-border-strong p-2.5 shadow-pop sm:flex-row sm:items-center sm:gap-5 sm:p-3.5 sm:pl-5">
          <p className="min-w-0 flex-1 text-sm text-fg-muted">{error ? "No plan to approve." : "Approve unlocks when planning finishes."}</p>
          <Button variant="accent" size="lg" disabled>
            <FlaskConical aria-hidden="true" /> Approve plan & start dry run
          </Button>
        </div>
      </div>
    </div>
  );
}

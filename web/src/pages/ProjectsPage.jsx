import { useState } from "react";
import { Link } from "react-router";
import { ChevronRight, Layers, MonitorPlay, RefreshCw, Sparkles } from "lucide-react";
import Showcase from "../components/Showcase.jsx";
import { sourceName } from "../components/SourceBadge.jsx";
import { LangGlyph, langTones } from "../components/LangBadge.jsx";
import { ecosystemMeta } from "../ecosystems.js";
import { engineMeta } from "../components/Engine.jsx";
import HistoryList from "../components/HistoryList.jsx";
import { Button, Card, EmptyState, ErrorState, Skeleton, StatusText } from "../components/ui.jsx";
import { api } from "../api.js";
import { useMigration } from "../migrationContext.js";
import { formatRelative, formatTime } from "../pipeline.js";
import { useAsync } from "../useAsync.js";

const RECENT = 3;

/** A card with a title row (title, optional count and action) and flush content. */
function Panel({ title, description, action = null, children, id, className = "" }) {
  return (
    <Card id={id} className={`overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[15px] leading-6 text-fg">{title}</h2>
          {description ? <p className="text-xs text-fg-subtle">{description}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      <div className="border-t border-border">{children}</div>
    </Card>
  );
}

function ListSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }, (_, key) => (
        <Skeleton key={key} className="h-9" />
      ))}
    </div>
  );
}

export default function ProjectsPage() {
  const { history, historyError, historyLoading, refreshHistory, matrix, config } = useMigration();
  const defaults = matrix?.defaults;
  const targets = [
    defaults?.targetJava ? ["Java", defaults.targetJava] : null,
    defaults?.targetBoot ? ["Spring Boot", defaults.targetBoot] : null,
    config?.nodeDefaults?.node ? ["Node", config.nodeDefaults.node] : null,
    config?.pythonDefaults?.python ? ["Python", config.pythonDefaults.python] : null,
  ].filter(Boolean);
  const samples = useAsync((signal) => api.samples(signal), []);
  const plans = useAsync((signal) => api.plans(signal, 12), [history]);
  const comparisons = useAsync((signal) => api.comparisons(signal, 5), [history]);
  const [allRuns, setAllRuns] = useState(false);

  const runs = history?.migrations ?? [];
  const drafts = (plans.data?.plans ?? []).filter((plan) => plan.status !== "approved").length;

  return (
    <div className="mx-auto max-w-[1200px] px-4 pt-6 pb-16 sm:px-8 sm:pt-8">
      <Showcase targets={targets} samples={samples.data?.samples ?? []} historyKey={history} />

      <section className="reveal mt-14" aria-labelledby="dash-title">
        <SectionTitle
          id="dash-title"
          title="Your workspace"
          description={`Runs and plans stored on this agent server.${plans.data ? (drafts ? ` ${drafts} plan${drafts === 1 ? "" : "s"} waiting for approval.` : " All plans approved.") : ""}`}
          action={
            <Button variant="ghost" size="sm" onClick={refreshHistory}>
              <RefreshCw aria-hidden="true" /> Refresh
            </Button>
          }
        />
        <div className="mt-6 space-y-6">
          <Panel
            title="Recent runs"
            description="Newest first. Also in History in the sidebar."
            action={
              runs.length > RECENT ? (
                <Button variant="ghost" size="sm" onClick={() => setAllRuns((value) => !value)} aria-expanded={allRuns}>
                  {allRuns ? "Show less" : `Show more (${runs.length - RECENT})`}
                </Button>
              ) : null
            }
          >
            <HistoryList history={history} error={historyError} loading={historyLoading} onRetry={refreshHistory} plans={plans.data?.plans} limit={allRuns ? 0 : RECENT} />
          </Panel>
          <PlansPanel plans={plans} />
          <ComparisonsPanel comparisons={comparisons} />
        </div>
      </section>

      <section className="reveal mt-16" aria-labelledby="cap-title">
        <SectionTitle id="cap-title" title="What it upgrades" description="One plan, approve and dry-run flow for every language." />
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.values(ecosystemMeta).map((meta) => (
            <Card key={meta.id} className="flex flex-col p-5">
              <span className={`grid size-9 place-items-center rounded-lg ${langTones[meta.id]}`}>
                <LangGlyph ecosystem={meta.id} className="size-[18px]" />
              </span>
              <h3 className="mt-4 text-[15px] leading-6 text-fg">{meta.label}</h3>
              <p className="mt-1.5 flex-1 text-[13px] leading-5 text-fg-muted">{meta.blurb}</p>
              <p className="mt-4 border-t border-border pt-3 text-xs text-fg-subtle">
                {meta.engine} · {meta.build}
              </p>
            </Card>
          ))}
          <Card className="flex flex-col p-5">
            <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent">
              <MonitorPlay aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
            </span>
            <h3 className="mt-4 text-[15px] leading-6 text-fg">Live preview &amp; page check</h3>
            <p className="mt-1.5 flex-1 text-[13px] leading-5 text-fg-muted">
              Run the original and the migrated app side by side on this computer, and check that the page's API calls still work after the upgrade.
            </p>
            <p className="mt-4 border-t border-border pt-3 text-xs text-fg-subtle">127.0.0.1 only · before / after</p>
          </Card>
        </div>
      </section>

      <section className="reveal mt-16" aria-labelledby="eng-title">
        <SectionTitle id="eng-title" title="Hybrid or Full AI?" description="The plan recommends one for each project and says why. You can always pick the other." />
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          {[
            {
              id: "hybrid",
              icon: Layers,
              wins: "Wins on cost and speed",
              points: [
                "OpenRewrite, codemods and rules do the bulk of the upgrade for free.",
                "The AI only reads the files that need it, so it uses far fewer tokens and finishes sooner.",
                "Page-check problems are reported, not fixed.",
              ],
              best: "Best for backend-only projects.",
            },
            {
              id: "ai",
              icon: Sparkles,
              wins: "Wins on the result when a web page depends on the backend",
              points: [
                "Cursor / Grok does the whole upgrade, Java and the HTML / JS together.",
                "Loops on build, test and page-check failures until they pass or the rounds run out.",
                "Uses the most tokens and takes longer.",
              ],
              best: "Best for full-stack apps.",
            },
          ].map((engine) => (
            <Card key={engine.id} className="p-5 sm:p-6">
              <div className="flex items-center gap-2.5">
                <engine.icon aria-hidden="true" className="size-4 text-accent" strokeWidth={1.75} />
                <h3 className="text-[15px] leading-6 text-fg">{engineMeta[engine.id].label}</h3>
              </div>
              <p className="mt-1 text-[13px] font-medium text-fg">{engine.wins}</p>
              <ul className="mt-3 space-y-2">
                {engine.points.map((point) => (
                  <li key={point} className="flex gap-2.5 text-[13px] leading-5 text-fg-muted">
                    <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-fg-subtle" />
                    {point}
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-border pt-3 text-xs text-fg-subtle">{engine.best}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="reveal mt-16">
      <Panel id="samples" title="Sample apps" description="Start a plan from a ready-made project" className="scroll-mt-8">
        {samples.error ? (
          <div className="p-5">
            <ErrorState error={samples.error} onRetry={samples.reload} compact />
          </div>
        ) : !samples.data ? (
          <ListSkeleton rows={5} />
        ) : samples.data.samples.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No samples found">The agent looked in {samples.data.root}.</EmptyState>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
            {samples.data.samples.map((sample) => (
              <li key={sample.name}>
                <Link to="/new" state={{ repoPath: sample.path }} className="group flex h-full items-center gap-3 bg-surface px-5 py-2.5 transition-colors duration-150 hover:bg-surface-2">
                  <span className={`grid size-7 shrink-0 place-items-center rounded-md ${langTones[sample.ecosystem] ?? langTones.java}`}>
                    <LangGlyph ecosystem={sample.ecosystem} className="size-3.5" />
                    <span className="sr-only">{ecosystemMeta[sample.ecosystem]?.short ?? "Java"}</span>
                  </span>
                  <span className="min-w-0 flex-1" title={sample.blurb}>
                    <span className="block truncate text-[13.5px] font-medium text-fg">{sample.name}</span>
                    <span className="block truncate text-xs text-fg-subtle tabular-nums">{sample.fromLabel || `${sample.java || "?"} · ${sample.boot || "?"}`}</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-subtle transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-fg" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      </section>
    </div>
  );
}

function SectionTitle({ id, title, description, action = null }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 id={id} className="text-lg leading-7 text-fg">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function PlansPanel({ plans }) {
  const [all, setAll] = useState(false);
  const list = plans.data?.plans ?? [];
  const shown = all ? list : list.slice(0, RECENT);
  return (
    <Panel
      title="Recent plans"
      description="Drafts wait for your approval"
      action={
        list.length > RECENT ? (
          <Button variant="ghost" size="sm" onClick={() => setAll((value) => !value)} aria-expanded={all}>
            {all ? "Show less" : `Show more (${list.length - RECENT})`}
          </Button>
        ) : null
      }
    >
      {plans.error ? (
        <div className="p-5">
          <ErrorState error={plans.error} onRetry={plans.reload} compact />
        </div>
      ) : !plans.data ? (
        <ListSkeleton />
      ) : !list.length ? (
        <p className="px-5 py-6 text-sm text-fg-muted">
          No plans yet.{" "}
          <Link to="/new" className="font-medium text-accent underline-offset-4 hover:underline">
            Create one
          </Link>{" "}
          to review a project before anything changes.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Status</th>
                <th scope="col" className="hidden md:table-cell">Findings</th>
                <th scope="col" className="text-right">Created</th>
                <th scope="col" className="w-8"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((plan) => (
                <tr key={plan.planId} className="group relative">
                  <td className="max-w-0 min-w-[12rem]">
                    <Link to={`/plan/${plan.planId}`} className="block truncate font-medium text-fg after:absolute after:inset-0">
                      {sourceName(plan.source, plan.repoName)}
                    </Link>
                    <span className="mt-0.5 block truncate text-xs text-fg-subtle">{plan.targetLabel || ecosystemMeta[plan.ecosystem]?.label || "Plan"}</span>
                  </td>
                  <td className="whitespace-nowrap">
                    <StatusText tone={plan.status === "approved" ? "passed" : "warning"}>{plan.status === "approved" ? "Approved" : "Draft"}</StatusText>
                  </td>
                  <td className="hidden whitespace-nowrap text-fg-muted md:table-cell">
                    {plan.auto} auto · {plan.review} review · {plan.manual} manual
                  </td>
                  <td className="text-right whitespace-nowrap text-fg-subtle" title={formatTime(plan.createdAt)}>
                    {formatRelative(plan.createdAt)}
                  </td>
                  <td className="w-8 text-fg-subtle">
                    <ChevronRight aria-hidden="true" className="size-4 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-fg" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function ComparisonsPanel({ comparisons }) {
  const [all, setAll] = useState(false);
  const list = comparisons.data?.comparisons ?? [];
  // Hidden until there is something to show (and on older servers without comparisons).
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, RECENT);
  return (
    <Panel
      title="Engine comparisons"
      description="Hybrid vs Full AI on the same plan"
      action={
        list.length > RECENT ? (
          <Button variant="ghost" size="sm" onClick={() => setAll((value) => !value)} aria-expanded={all}>
            {all ? "Show less" : `Show more (${list.length - RECENT})`}
          </Button>
        ) : null
      }
    >
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Project</th>
              <th scope="col">Status</th>
              <th scope="col" className="hidden md:table-cell">Winner</th>
              <th scope="col" className="w-8"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((item) => (
              <tr key={item.id} className="group relative">
                <td className="max-w-0 min-w-[12rem]">
                  <Link to={`/compare/${item.id}`} className="block truncate font-medium text-fg after:absolute after:inset-0">
                    {item.repoName}
                  </Link>
                  <span className="mt-0.5 block truncate text-xs text-fg-subtle">{item.engines.map((id) => engineMeta[id]?.label ?? id).join(" vs ")}</span>
                </td>
                <td className="whitespace-nowrap">
                  <StatusText tone={item.status === "running" ? "running" : item.status === "done" ? "passed" : "failed"}>
                    {item.status === "running" ? "Running" : item.status === "done" ? "Done" : item.status === "cancelled" ? "Cancelled" : "Failed"}
                  </StatusText>
                </td>
                <td className="hidden whitespace-nowrap md:table-cell">{item.overall ? <span className="font-medium text-fg">{engineMeta[item.overall]?.label}</span> : <span className="text-fg-subtle">—</span>}</td>
                <td className="w-8 text-fg-subtle">
                  <ChevronRight aria-hidden="true" className="size-4 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-fg" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

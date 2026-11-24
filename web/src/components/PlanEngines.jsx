import { Check, Clock, Hand, Info, ListChecks, Minus, Scale, TriangleAlert, Zap } from "lucide-react";
import { engineMeta, engineState, formatRange, formatTokens } from "./Engine.jsx";
import { Button, Card, Spinner } from "./ui.jsx";

const confidenceTone = {
  high: { label: "High confidence", chip: "border-success/40 bg-success-soft text-success", hint: "The signals all point the same way." },
  medium: { label: "Medium confidence", chip: "border-warning/45 bg-warning-soft text-warning", hint: "A reasonable call, but the signals are mixed. Compare both if it matters." },
  low: { label: "Low confidence", chip: "border-danger/40 bg-danger-soft text-danger", hint: "Not enough signal. Compare both before you decide." },
};

/** "230k–420k" for one direction of a token estimate. */
function formatDuration(ms) {
  const seconds = Math.round(ms / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
}

const freeLabel = { java: "OpenRewrite", node: "Codemods", python: "Rules" };

/** 165000 -> "165k", 1200000 -> "1.2M" (exact values are in the cell's title). */
function compact(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

/** "~165k–300k" for one direction { low, high } of a token estimate. */
function range(r) {
  return r ? `~${compact(r.low)}–${compact(r.high)}` : null;
}

function timeText(expected) {
  if (!expected) return null;
  const spread = expected.maxMs - expected.minMs > 5000;
  return `${formatDuration(expected.minMs)}${spread ? `–${formatDuration(expected.maxMs)}` : ""}`;
}

const riskDot = { low: "bg-success", medium: "bg-warning", high: "bg-danger" };

/**
 * The top of the plan screen: a Hybrid vs Full AI comparison table. The recommended row is highlighted with
 * the three main reasons above it; the other engine keeps its own "Choose" action. Estimates only, never a price.
 */
export function PlanRecommendation({ plan, recommendation, estimates, details, config, engine, onEngine, busy, onCompare }) {
  if (!recommendation?.cards) return null;
  const recommended = recommendation.recommendedEngine;
  const confidence = confidenceTone[recommendation.confidence] ?? confidenceTone.medium;
  const aiState = engineState(config, "ai");
  const recoCard = recommendation.cards[recommended];
  const why = (recoCard?.whyBetter?.length ? recoCard.whyBetter : recommendation.reasons ?? []).slice(0, 3);
  const alt = recommendation.cards[recommendation.alternative.engine];
  const overridden = engine !== recommended;
  const recommendedOff = !(recommended === "ai" ? aiState : engineState(config, recommended)).available;
  const free = freeLabel[plan.ecosystem] ?? "Free step";
  const recoState = recommended === "ai" ? aiState : engineState(config, recommended);
  const mini = [
    { label: "Input tokens", get: (id) => (estimates?.[id]?.input ? range(estimates[id].input) : estimates?.[id] ? formatRange(estimates[id]) : "n/a") },
    { label: "Output tokens", get: (id) => (estimates?.[id]?.output ? range(estimates[id].output) : "—") },
    { label: "Files AI edits", get: (id) => recommendation.cards[id].aiFiles },
    { label: "Run risk", get: (id) => details?.[id]?.risk?.level ?? "—", capital: true },
  ];
  return (
    <section aria-labelledby="reco-title" className="mt-6 space-y-4">
      <Card className="grid overflow-hidden lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="relative border-b border-border p-6 lg:border-r lg:border-b-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="kpi-label !text-accent">Recommended engine</p>
            <span className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs font-medium text-fg-muted" title={confidence.hint}>
              {confidence.label}
            </span>
          </div>
          <h2 id="reco-title" className="mt-2 text-[28px] leading-9 font-semibold tracking-[-0.02em] text-fg">
            {engineMeta[recommended].label}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">{recoCard?.tagline}</p>
          {why.length ? (
            <ul className="mt-4 space-y-2" aria-label={`Why ${engineMeta[recommended].label}`}>
              {why.map((line) => (
                <li key={line} className="flex gap-2.5 text-sm leading-relaxed text-fg">
                  <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span className="min-w-0">{line}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-fg-muted">{recommendation.headline}</p>
          )}
          <div className="mt-5">
            {!recoState.available ? (
              <p className="text-sm text-fg-muted">Needs the AI login on this computer.</p>
            ) : engine === recommended ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
                <Check aria-hidden="true" className="size-4" /> Selected for this run
              </span>
            ) : (
              <Button variant="secondary" onClick={() => onEngine(recommended)}>
                Use {engineMeta[recommended].label}
              </Button>
            )}
          </div>
        </div>
        <div className="p-6">
          <p className="kpi-label">At a glance</p>
          <table className="mt-3 w-full text-sm">
            <caption className="sr-only">Hybrid and Full AI at a glance. Token counts are estimates.</caption>
            <thead>
              <tr>
                <th scope="col" className="pb-2 text-left"><span className="sr-only">Measure</span></th>
                {["hybrid", "ai"].map((id) => (
                  <th key={id} scope="col" className={`pb-2 text-right text-xs font-semibold ${id === recommended ? "text-accent" : "text-fg-muted"}`}>
                    {engineMeta[id].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mini.map((row) => (
                <tr key={row.label} className="border-t border-border">
                  <th scope="row" className="py-2.5 text-left font-normal text-fg-muted">{row.label}</th>
                  {["hybrid", "ai"].map((id) => (
                    <td key={id} className={`py-2.5 text-right whitespace-nowrap tabular-nums ${row.capital ? "capitalize" : ""} ${id === recommended ? "font-semibold text-fg" : "text-fg-muted"}`}>
                      {row.get(id)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-fg-subtle">Token counts are estimates from the repo's file sizes, not a price.</p>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3.5">
          <h3 className="text-md font-semibold text-fg">Compare engines</h3>
          <span className="text-xs text-fg-subtle">Pick either one; the run uses the selected row.</span>
        </div>
        <div className="overflow-x-auto border-t border-border">
          <table className="data-table min-w-[52rem]">
            <caption className="sr-only">Hybrid compared with Full AI for this project. Token counts are estimates.</caption>
            <thead>
              <tr>
                <th scope="col">Engine</th>
                <th scope="col">Est. time</th>
                <th scope="col">Input tokens</th>
                <th scope="col">Output tokens</th>
                <th scope="col">Files AI edits</th>
                <th scope="col">Who fixes what</th>
                <th scope="col">Run risk</th>
                <th scope="col" className="text-right">
                  <span className="sr-only">Choice</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {["hybrid", "ai"].map((id) => {
                const card = recommendation.cards[id];
                const meta = engineMeta[id];
                const state = id === "ai" ? aiState : engineState(config, id);
                const estimate = estimates?.[id];
                const split = estimate?.input && estimate?.output;
                const time = timeText(details?.[id]?.expectedTime);
                const risk = details?.[id]?.risk?.level;
                const selected = engine === id;
                const method = estimate ? `Estimate, not a measurement.\n${(estimate.method ?? []).join("\n")}` : undefined;
                return (
                  <tr key={id} data-highlight={id === recommended}>
                    <td className="min-w-[13rem]">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold whitespace-nowrap text-fg">{meta.label}</span>
                        {id === recommended ? <span className="rounded bg-accent px-1.5 py-0.5 text-2xs font-semibold whitespace-nowrap text-accent-fg">Recommended</span> : null}
                      </div>
                      <p className="mt-0.5 max-w-[18rem] text-xs leading-snug text-fg-muted">{card.tagline}</p>
                    </td>
                    <td className="whitespace-nowrap" title={time ? `From ${details[id].expectedTime.basedOn} earlier passed ${meta.label} run(s) on this computer` : "No earlier runs on this computer to time from"}>{time ?? <span className="text-fg-subtle">No runs yet</span>}</td>
                    <td className="whitespace-nowrap" title={split ? `${formatTokens(estimate.input.low)}–${formatTokens(estimate.input.high)} input tokens. ${method}` : method}>{split ? range(estimate.input) : estimate ? `${formatRange(estimate)} total` : <span className="text-fg-subtle">n/a</span>}</td>
                    <td className="whitespace-nowrap" title={split ? `${formatTokens(estimate.output.low)}–${formatTokens(estimate.output.high)} output tokens. ${method}` : method}>{split ? range(estimate.output) : <span className="text-fg-subtle">—</span>}</td>
                    <td>{card.aiFiles}</td>
                    <td className="text-sm whitespace-nowrap text-fg-muted">
                      {free} {card.fixers.free} · AI {card.fixers.ai} · You {card.fixers.you}
                    </td>
                    <td>
                      {risk ? (
                        <span className="inline-flex items-center gap-1.5 capitalize">
                          <span aria-hidden="true" className={`size-2 rounded-full ${riskDot[risk] ?? "bg-fg-subtle"}`} />
                          {risk}
                        </span>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </td>
                    <td className="text-right">
                      {!state.available ? (
                        <span className="text-xs text-fg-muted">Needs AI login</span>
                      ) : selected ? (
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent" aria-live="polite">
                          <Check aria-hidden="true" className="size-4" /> Selected
                        </span>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => onEngine(id)} aria-label={`Choose ${meta.label}`}>
                          Choose {meta.label}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 border-t border-border bg-surface-2/50 px-5 py-3.5 sm:px-6">
          {overridden && recommendedOff ? (
            <p className="flex gap-2 text-sm text-fg" role="status">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-muted" />
              <span>
                {engineMeta[recommended].label} needs the AI login on this computer, so {engineMeta[engine].label} is selected for now.
              </span>
            </p>
          ) : overridden ? (
            <p className="flex gap-2 text-sm text-fg" role="status">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-muted" />
              <span>
                You chose {engineMeta[engine].label} instead of the recommended {engineMeta[recommended].label}. {recommendation.alternative.engine === engine ? `${recommendation.alternative.text}.` : ""} Both work; this is your call.
              </span>
            </p>
          ) : alt?.whenPick ? (
            <p className="text-sm text-fg-muted">
              <span className="font-medium text-fg">When to pick {engineMeta[alt.engine].label} instead: </span>
              {alt.whenPick}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button variant="secondary" size="sm" onClick={() => onCompare(["hybrid", "ai"])} disabled={!aiState.available || busy === "compare"} title={!aiState.available ? aiState.reason ?? "Full AI is not available" : undefined}>
              {busy === "compare" ? <Spinner label="Starting…" /> : <><Scale aria-hidden="true" /> Compare both</>}
            </Button>
            <span className="text-sm text-fg-muted">{aiState.available ? "Runs both on temporary copies and scores them side by side. Your folder never changes." : "Needs the AI login."}</span>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-fg-muted hover:text-fg">Pros and cons of each engine</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {["hybrid", "ai"].map((id) => (
                <div key={id}>
                  <p className="font-semibold text-fg">{engineMeta[id].label}</p>
                  <ul className="mt-1.5 space-y-1">
                    {recommendation.cards[id].pros.map((pro) => (
                      <li key={pro} className="flex gap-2 text-fg">
                        <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                        <span><span className="sr-only">Pro: </span>{pro}</span>
                      </li>
                    ))}
                    {recommendation.cards[id].cons.map((con) => (
                      <li key={con} className="flex gap-2 text-fg-muted">
                        <Minus aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
                        <span><span className="sr-only">Con: </span>{con}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        </div>
      </Card>
    </section>
  );
}

const stepTone = {
  free: { label: "free", chip: "border-success/40 bg-success-soft text-success" },
  ai: { label: "AI", chip: "border-accent/40 bg-accent-soft text-accent" },
  check: { label: "check", chip: "border-info/40 bg-info-soft text-info" },
  setup: { label: "setup", chip: "border-border-strong bg-surface-2 text-fg-muted" },
};

const riskTone = {
  low: "border-success/40 bg-success-soft text-success",
  medium: "border-warning/45 bg-warning-soft text-warning",
  high: "border-danger/40 bg-danger-soft text-danger",
};

/** The essentials around the recommendation: what runs, how risky, what you must do, what happens next. */
export function PlanDetails({ details, engine, dryRun }) {
  if (!details) return null;
  const meta = engineMeta[engine];
  return (
    <section aria-labelledby="details-title" className="mt-8">
      <h2 id="details-title" className="text-md font-semibold text-fg">
        What will happen with {meta?.label}
      </h2>
      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <h3 className="flex items-center gap-2 text-base font-semibold text-fg">
            <ListChecks aria-hidden="true" className="size-5 text-accent" /> Steps for this engine
          </h3>
          <ol className="mt-4 space-y-3">
            {details.steps.map((step, index) => {
              const tone = stepTone[step.engineWork] ?? stepTone.setup;
              return (
                <li key={step.id} className={`flex gap-3 ${step.runs ? "" : "opacity-60"}`}>
                  <span aria-hidden="true" className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular-nums ${step.runs ? "border-border-strong bg-surface-2 text-fg" : "border-border bg-surface-2 text-fg-subtle"}`}>
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                      <span className={step.runs ? "" : "line-through decoration-fg-subtle/60"}>{step.label}</span>
                      <span className={`inline-flex h-5 items-center rounded-md border !border-transparent px-2 text-2xs font-semibold ${tone.chip}`}>{tone.label}</span>
                      {step.runs ? null : <span className="text-xs font-normal text-fg-subtle">skipped</span>}
                    </p>
                    <p className="mt-0.5 text-sm leading-relaxed text-fg-muted">{step.detail}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-base font-semibold text-fg">
                <TriangleAlert aria-hidden="true" className="size-5 text-warning" /> Run risk
              </h3>
              <span className={`inline-flex h-7 items-center rounded-md border !border-transparent px-3 text-sm font-semibold capitalize ${riskTone[details.risk.level]}`}>{details.risk.level}</span>
            </div>
            <p className="mt-3 text-sm text-fg">{details.risk.summary}</p>
            <ul className="mt-3 space-y-1.5 text-sm text-fg-muted">
              {details.risk.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-fg-subtle" />
                  {bullet}
                </li>
              ))}
            </ul>
            {details.expectedTime ? (
              <p className="mt-4 flex gap-2 border-t border-border pt-3 text-sm text-fg-muted">
                <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="font-medium text-fg">
                    {formatDuration(details.expectedTime.minMs)}
                    {details.expectedTime.maxMs - details.expectedTime.minMs > 5000 ? `–${formatDuration(details.expectedTime.maxMs)}` : ""}
                  </span>{" "}
                  in {details.expectedTime.basedOn} earlier passed {meta?.label} run{details.expectedTime.basedOn === 1 ? "" : "s"} on this computer.
                </span>
              </p>
            ) : null}
          </Card>

          <Card className="p-5">
            <h3 className="flex items-center gap-2 text-base font-semibold text-fg">
              <Hand aria-hidden="true" className="size-5 text-danger" /> What you need to do
            </h3>
            {details.needsYou.length ? (
              <ul className="mt-3 space-y-3">
                {details.needsYou.map((entry) => (
                  <li key={entry.id} className="text-sm">
                    <p className="font-medium text-fg">{entry.title}</p>
                    {entry.file ? <code className="code-chip mt-1 inline-flex">{entry.file}</code> : null}
                    <p className="mt-1 text-fg-muted">{entry.why}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 flex gap-2 text-sm text-fg">
                <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-success" /> Nothing. Verdigrade handles everything it plans to change.
              </p>
            )}
            <p className="mt-4 flex gap-2 border-t border-border pt-3 text-sm text-fg-muted">
              <Zap aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
              <span>
                <span className="font-medium text-fg">What happens next. </span>
                {details.next}
              </span>
            </p>
          </Card>
        </div>
      </div>
      <p className="sr-only">{dryRun ? "A dry run changes nothing in your folder." : "A real run changes your folder on a new branch."}</p>
    </section>
  );
}

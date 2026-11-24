import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock,
  ExternalLink,
  Gauge,
  Hand,
  Lightbulb,
  LockKeyhole,
  Search,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { Button } from "./ui.jsx";
import { RiskPill } from "./RefactorQuiz.jsx";

/**
 * Plan-mode explanations: the plain-language detail of one plan item, the
 * inline "what if" callout for lock/manual, the plan-level Impact preview and
 * the confirm dialog shown when blocker-level items are locked.
 * All text comes from the agent (profiles/explanations + bot/lib/impact.ts).
 */

export const riskMeta = {
  blocker: { label: "Blocker", long: "Will likely break the run", tone: "text-danger", box: "border-danger/45 bg-danger-soft", chip: "border-danger/40 bg-danger-soft text-danger", icon: ShieldAlert, rank: 4 },
  high: { label: "High", long: "Changes behaviour", tone: "text-danger", box: "border-danger/30 bg-danger-soft", chip: "border-danger/30 bg-danger-soft text-danger", icon: TriangleAlert, rank: 3 },
  medium: { label: "Medium", long: "Needs follow-up", tone: "text-warning", box: "border-warning/35 bg-warning-soft", chip: "border-warning/30 bg-warning-soft text-warning", icon: TriangleAlert, rank: 2 },
  low: { label: "Low", long: "Minor", tone: "text-info", box: "border-info/30 bg-info-soft", chip: "border-info/30 bg-info-soft text-info", icon: CircleAlert, rank: 1 },
  none: { label: "None", long: "Safe", tone: "text-success", box: "border-success/30 bg-success-soft", chip: "border-success/30 bg-success-soft text-success", icon: CircleCheck, rank: 0 },
};

export const effectLabel = {
  none: "No effect on the run",
  unverified: "Less verified by tests",
  runtime: "Changes behaviour at runtime",
  "after-merge": "Breaks later (CI, image, tooling)",
  "fails-preflight": "Run stops at Preflight",
  "fails-install": "Install fails → Test step fails",
  "fails-build": "Won't compile → Test step fails",
  "fails-tests": "Tests fail at the Test step",
  "fails-checks": "Checks step fails",
};

export const outcomeMeta = {
  fail: { label: "Likely fails", tone: "text-danger", box: "border-danger/40 bg-danger-soft", icon: ShieldAlert },
  "at-risk": { label: "May fail", tone: "text-warning", box: "border-warning/40 bg-warning-soft", icon: TriangleAlert },
  "pass-with-risks": { label: "Likely passes · follow-ups", tone: "text-warning", box: "border-warning/30 bg-warning-soft", icon: CircleAlert },
  pass: { label: "Likely passes", tone: "text-success", box: "border-success/35 bg-success-soft", icon: CircleCheck },
};

export function RiskChip({ risk, prefix = "If skipped", className = "" }) {
  const meta = riskMeta[risk] ?? riskMeta.none;
  return (
    <span className={`inline-flex h-5 items-center gap-1 rounded-md border !border-transparent px-2 text-2xs font-medium whitespace-nowrap ${meta.chip} ${className}`} title={`${prefix}: ${meta.long}`}>
      <meta.icon aria-hidden="true" className="size-3" />
      {prefix}: {meta.label}
    </span>
  );
}

export function MetaChip({ icon: Icon, children, title }) {
  return (
    <span title={title} className="inline-flex h-5 items-center gap-1 rounded-md border !border-transparent border-border bg-surface-2 px-2 text-2xs font-medium whitespace-nowrap text-fg-muted">
      {Icon ? <Icon aria-hidden="true" className="size-3" /> : null}
      {children}
    </span>
  );
}

/** Before → after excerpt. */
export function SnippetBlock({ snippets }) {
  if (!snippets?.length) return null;
  return (
    <div className="space-y-2">
      {snippets.map((snippet, index) => (
        <figure key={`${snippet.file}-${snippet.line}-${index}`} className="overflow-hidden rounded-lg border border-border bg-code">
          <figcaption className="flex items-center gap-2 border-b border-border px-3 py-1.5 font-mono text-2xs text-code-gutter">
            <span className="truncate">
              {snippet.file}
              {snippet.line ? `:${snippet.line}` : ""}
            </span>
          </figcaption>
          <div>
            <table className="w-full table-fixed border-collapse font-mono text-xs leading-5">
              <tbody>
                {snippet.before ? (
                  <tr className="bg-danger/[0.09]">
                    <td aria-hidden="true" className="w-5 border-l-2 border-danger/50 pl-2 text-danger select-none">−</td>
                    <td className="pr-3 pl-2 whitespace-pre-wrap text-fg [overflow-wrap:anywhere]">
                      <span className="sr-only">Before: </span>
                      {snippet.before}
                    </td>
                  </tr>
                ) : null}
                {snippet.after ? (
                  <tr className="bg-success/[0.09]">
                    <td aria-hidden="true" className="w-5 border-l-2 border-success/50 pl-2 text-success select-none">+</td>
                    <td className="pr-3 pl-2 whitespace-pre-wrap text-fg [overflow-wrap:anywhere]">
                      <span className="sr-only">After: </span>
                      {snippet.after}
                    </td>
                  </tr>
                ) : snippet.after === "" ? (
                  <tr>
                    <td aria-hidden="true" className="w-5 pl-2 text-fg-subtle select-none">·</td>
                    <td className="pr-4 pl-2 font-sans text-fg-muted italic">Line removed</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {snippet.note ? <p className="border-t border-border px-3 py-1.5 font-sans text-xs text-code-fg">{snippet.note}</p> : null}
        </figure>
      ))}
    </div>
  );
}

function Section({ step, icon: Icon, title, children, tone = "text-fg-subtle" }) {
  return (
    <section className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3">
      <span className={`grid size-7 place-items-center rounded-full border border-border bg-surface-2 ${tone}`} aria-hidden="true">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 pb-1">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <span className="sr-only">Step {step}: </span>
          {title}
        </h4>
        <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-fg-muted">{children}</div>
      </div>
    </section>
  );
}

/** What changes for a non-approve decision (or a lock elsewhere), coloured by risk. */
export function ConsequenceCallout({ item, impact, titleOf }) {
  if (!impact) return null;
  const blockedElsewhere = item.decision === "approve" && impact.state === "skipped";
  if (item.decision === "approve" && !blockedElsewhere) return null;
  const meta = riskMeta[impact.risk] ?? riskMeta.none;
  const Icon = item.decision === "lock" ? LockKeyhole : item.decision === "manual" ? Hand : meta.icon;
  const heading = blockedElsewhere
    ? "Blocked by a lock elsewhere"
    : impact.state === "no-effect"
      ? "Marked manual: the step still runs"
      : `If you ${item.decision === "lock" ? "lock" : "mark manual"}: ${meta.long.toLowerCase()}`;
  return (
    <div role="status" className={`mt-3 rounded-lg border px-3 py-2.5 text-sm ${meta.box}`}>
      <p className={`flex items-start gap-2 font-semibold ${meta.tone}`}>
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0">
          {heading}
          {impact.effect !== "none" ? <span className="block text-xs font-normal text-fg-muted sm:ml-1.5 sm:inline sm:text-sm">· {effectLabel[impact.effect]}</span> : null}
        </span>
      </p>
      <p className="mt-1 text-fg">{impact.text}</p>
      {impact.alsoBlocks?.length ? (
        <p className="mt-1.5 text-xs text-fg-muted">
          <span className="font-medium text-fg">Also blocked (same file):</span> {impact.alsoBlocks.map(titleOf).join("; ")}
        </p>
      ) : null}
      {impact.lockedFiles?.length && impact.state === "partial" ? <p className="mt-1.5 text-xs text-fg-muted">Partly applied: locked files are left out.</p> : null}
    </div>
  );
}

/** The expandable plain-language detail of one item. */
export function ExplainDetail({ item, technical }) {
  const explain = item.explain;
  if (!explain) return null;
  const skip = riskMeta[explain.riskIfSkipped] ?? riskMeta.none;
  return (
    <div className="space-y-4">
      <ol className="space-y-4" aria-label="Explanation">
        <li>
          <Section step={1} icon={Search} title="What we found">
            <p>{explain.whatWeFound}</p>
            {technical && item.evidence ? (
              <pre className="rounded-lg border border-border bg-code px-3 py-2 font-mono text-xs whitespace-pre-wrap text-code-fg [overflow-wrap:anywhere]">
                {item.line ? <span className="mr-3 text-code-gutter select-none">{item.line}</span> : null}
                <code>{item.evidence}</code>
              </pre>
            ) : null}
          </Section>
        </li>
        <li>
          <Section step={2} icon={Lightbulb} title="Why it matters" tone="text-warning">
            <p>{explain.whyItMatters}</p>
          </Section>
        </li>
        <li>
          <Section step={3} icon={Wrench} title={item.group === "auto" ? "What we'll do" : "What the tool does"} tone="text-accent">
            <p>{explain.whatWillHappen}</p>
            <SnippetBlock snippets={explain.snippets} />
            {explain.snippets?.length ? <p className="text-xs text-fg-subtle">Expected change from the {item.group === "auto" ? "rule or recipe mapping" : "scan"}. The run shows the real diff.</p> : null}
          </Section>
        </li>
        <li>
          <Section step={4} icon={TriangleAlert} title="If you lock it or mark it manual" tone={skip.tone}>
            <div className={`rounded-lg border px-3 py-2.5 ${skip.box}`}>
              <p className={`flex flex-wrap items-center gap-2 text-xs font-semibold ${skip.tone}`}>
                <skip.icon aria-hidden="true" className="size-3.5" />
                {skip.label === "None" ? "No risk" : `${skip.label} risk`} · {effectLabel[explain.skipEffect]}
              </p>
              <p className="mt-1 text-fg">{explain.ifLocked}</p>
              {explain.ifManual && explain.ifManual !== explain.ifLocked ? (
                <p className="mt-1.5 text-fg">
                  <span className="font-medium">Manual: </span>
                  {explain.ifManual}
                </p>
              ) : null}
            </div>
            <p>
              <span className="font-medium text-fg">If you approve: </span>
              {explain.ifApproved}
            </p>
          </Section>
        </li>
        <li>
          <Section step={5} icon={Hand} title="What you'd need to do by hand">
            <ul className="space-y-1.5">
              {explain.manualSteps.map((step) => (
                <li key={step} className="flex gap-2">
                  <span aria-hidden="true" className="mt-1 grid size-3.5 shrink-0 place-items-center rounded-[4px] border border-border-strong" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </Section>
        </li>
      </ol>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        <MetaChip icon={Clock} title="Rough effort if you do it by hand">
          Effort {explain.effort}
        </MetaChip>
        <MetaChip icon={Gauge} title="How sure the tool is about this explanation">
          Confidence: {explain.confidence}
        </MetaChip>
        <RiskChip risk={explain.riskIfSkipped} />
        {technical && explain.kind ? <MetaChip title="Explanation catalogue key">{explain.kind}</MetaChip> : null}
        {explain.source === "generic" ? <MetaChip icon={Sparkles}>Generic text</MetaChip> : null}
      </div>
      {explain.learnMore?.length ? (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-fg-subtle">
            <BookOpen aria-hidden="true" className="size-3.5" /> Learn more (official docs)
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {explain.learnMore.map((link) => (
              <li key={link.url}>
                <a href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-accent underline-offset-4 hover:underline">
                  {link.label}
                  <ExternalLink aria-hidden="true" className="size-3" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function OutcomeBadge({ impact, size = "md" }) {
  const meta = outcomeMeta[impact.outcome] ?? outcomeMeta.pass;
  return (
    <span className={`inline-flex items-center gap-2 font-medium whitespace-nowrap ${meta.tone} ${size === "sm" ? "text-xs" : "text-[13.5px]"}`}>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      {impact.failsAt && impact.outcome !== "pass" ? `${meta.label} at ${impact.failsAt}` : meta.label}
    </span>
  );
}

export { OutcomeBadge };

/** Plan-level prediction, updated live from the draft decisions. */
export function ImpactPreview({ impact, loading, onJump, className = "", collapsible = false, idBase = "impact-preview" }) {
  const [open, setOpen] = useState(!collapsible);
  if (!impact) return null;
  const rows = [
    { key: "breaksRun", label: "will likely break the run", tone: "text-danger" },
    { key: "mayBreakRun", label: "may break it (no automatic fix)", tone: "text-warning" },
    { key: "runtime", label: "change behaviour at runtime", tone: "text-warning" },
    { key: "afterMerge", label: "need follow-up after merge", tone: "text-info" },
  ];
  if (impact.counts.fixed) rows.push({ key: "fixed", label: "fixed by kept changes", tone: "text-success" });
  const meta = outcomeMeta[impact.outcome] ?? outcomeMeta.pass;
  const body = (
    <div className="space-y-4 p-5 pt-4">
      <p className="text-sm text-fg-muted">{impact.summary}</p>
      <ul className="grid grid-cols-2 gap-2" aria-label="Predicted consequences">
        {rows.map((row) => (
          <li key={row.key} className="rounded-lg border border-border bg-surface-2/50 px-3 py-2">
            <span className={`block font-display text-xl leading-none font-semibold tabular-nums ${impact.counts[row.key] ? row.tone : "text-fg-subtle"}`}>{impact.counts[row.key]}</span>
            <span className="mt-1 block text-xs leading-snug text-fg-muted">{row.label}</span>
          </li>
        ))}
      </ul>
      {impact.consequences.length ? (
        <ul className="space-y-2" aria-label="Items behind the prediction">
          {impact.consequences.slice(0, 6).map((entry) => {
            const risk = riskMeta[entry.risk] ?? riskMeta.none;
            return (
              <li key={entry.id}>
                <button type="button" onClick={() => onJump?.(entry.id)} className="group flex w-full gap-2.5 rounded-lg px-1.5 py-1 text-left hover:bg-surface-2">
                  <risk.icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${risk.tone}`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium break-words text-fg group-hover:underline">{entry.title}</span>
                    <span className="block text-xs text-fg-muted">
                      {effectLabel[entry.effect]} · {entry.reason === "blocked-by-lock" ? "blocked by a lock" : entry.reason === "not-fixed-automatically" ? "not fixed automatically" : entry.reason === "manual" ? "marked manual" : "locked"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {impact.consequences.length > 6 ? <li className="pl-8 text-xs text-fg-subtle">+{impact.consequences.length - 6} more</li> : null}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-sm text-success">
          <Check aria-hidden="true" className="size-4" /> Nothing you chose is expected to cause a problem.
        </p>
      )}
      {impact.refactors?.count ? (
        <div className="rounded-lg border border-border bg-surface-2/50 px-3 py-2.5" aria-label="Refactors after the upgrade">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
            Refactors after the upgrade ({impact.refactors.count}) <RiskPill risk={impact.refactors.risk} />
          </p>
          <ul className="mt-1.5 space-y-1">
            {impact.refactors.picks.map((pick) => (
              <li key={`${pick.topic}-${pick.title}`} className="flex items-center justify-between gap-2 text-xs text-fg-muted">
                <span className="min-w-0 truncate">{pick.topic}: {pick.title}</span>
                <span className={`shrink-0 font-medium ${pick.risk === "high" ? "text-danger" : pick.risk === "medium" ? "text-warning" : "text-success"}`}>{pick.risk}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-fg-subtle">Reverted if they break the build or tests; the upgrade result does not change.</p>
        </div>
      ) : null}
      <p className="border-t border-border pt-3 text-xs text-fg-subtle">{impact.label} Based on the explanation rules for each item; the dry run is the real test.</p>
    </div>
  );
  return (
    <section id={idBase} aria-labelledby={`${idBase}-title`} aria-busy={loading || undefined} className={`overflow-hidden rounded-[10px] border bg-surface shadow-card ${impact.outcome === "fail" ? "border-danger/40" : impact.outcome === "pass" ? "border-border" : "border-warning/40"} ${className}`}>
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <Gauge aria-hidden="true" className={`mt-1 size-4 shrink-0 ${meta.tone}`} strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <h2 id={`${idBase}-title`} className="text-md leading-6 font-semibold text-fg">
            Impact preview
          </h2>
          <p className="mt-0.5 text-xs text-fg-subtle">Updates as you change decisions · prediction</p>
          <p className={`mt-2 text-sm font-semibold ${meta.tone}`} aria-live="polite">
            {impact.headline}
          </p>
        </div>
        {collapsible ? (
          <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={`${idBase}-body`} className="grid size-8 shrink-0 place-items-center rounded-md border border-border text-fg-muted hover:bg-surface-2 hover:text-fg">
            <ChevronDown aria-hidden="true" className={`size-4 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
            <span className="sr-only">{open ? "Hide details" : "Show details"}</span>
          </button>
        ) : null}
      </div>
      <div id={collapsible ? `${idBase}-body` : undefined} hidden={!open}>
        {body}
      </div>
    </section>
  );
}

/** Confirm approving while blocker-level items are locked / manual. */
export function ConfirmBlockersDialog({ blockers, impact, dryRun, onCancel, onConfirm }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    // No close() in cleanup: it fires onClose → onCancel, which would dismiss the dialog right after
    // StrictMode's re-run. Unmounting removes the element (and its modal state) anyway.
  }, []);
  return (
    <dialog
      ref={dialog}
      onClose={onCancel}
      aria-labelledby="confirm-blockers-title"
      aria-describedby="confirm-blockers-desc"
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-2xl border border-border bg-elevated p-0 text-fg shadow-pop backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-danger/40 bg-danger-soft text-danger">
            <ShieldAlert aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-blockers-title" className="text-lg font-semibold tracking-tight">
              Approve with {blockers.length} blocker{blockers.length === 1 ? "" : "s"} locked?
            </h2>
            <p className="text-sm font-medium text-danger">{impact.headline}</p>
          </div>
        </div>
        <p id="confirm-blockers-desc" className="mt-4 text-sm text-fg-muted">
          These items are locked or marked manual, so the pipeline won't apply them. Based on the plan's rules, this is what to expect:
        </p>
        <ul className="mt-3 max-h-[40vh] space-y-2.5 overflow-y-auto pr-1">
          {blockers.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm">
              <p className="font-semibold text-fg">{entry.title}</p>
              <p className="mt-0.5 font-mono text-xs break-all text-fg-muted">{entry.where}</p>
              <p className="mt-1 text-fg">{entry.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-fg-subtle">{impact.label} You can still go ahead, for example to see exactly what breaks{dryRun ? " in the dry run (your folder is not changed)" : ""}.</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} autoFocus>
            Go back and review
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Approve anyway <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </dialog>
  );
}

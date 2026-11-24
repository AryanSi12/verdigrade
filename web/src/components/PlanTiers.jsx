import { ArrowRight, Check, CircleCheck, LoaderCircle, Hand, LockKeyhole, RefreshCw, ShieldAlert, ShieldCheck, Sparkles, TriangleAlert, Undo2, Wrench, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Card } from "./ui.jsx";

/* "Will break" / "Might break" / "Safe": one badge per plan item. */
export const tiers = {
  breaks: { label: "Will break", icon: ShieldAlert, chip: "border-danger/35 bg-danger-soft text-danger" },
  review: { label: "Might break", icon: TriangleAlert, chip: "border-warning/35 bg-warning-soft text-warning" },
  safe: { label: "Safe · automatic", icon: Zap, chip: "border-success/30 bg-success-soft text-success" },
  fixed: { label: "Fixed", icon: CircleCheck, chip: "border-success/30 bg-success-soft text-success" },
};

export function tierOf(item) {
  return item.tier ?? (item.group === "auto" ? "safe" : "review");
}

/**
 * A kept fix (AI, or "move to an env variable") that the re-check confirmed. A fixed item shows no
 * warning and no lock. Locking it again (a draft change) makes it a risk again. Mirrors isFixed() on the server.
 */
export function isFixed(item) {
  return tierOf(item) !== "safe" && item.aiFix?.status === "kept" && item.aiFix.resolved === true && item.decision === "approve";
}

/** Kinds nobody can safely change for you (mirrors itemFixer() on the server). */
const needsYouKinds = new Set(["secrets.file", "secrets.example", "inline-secret", "db-migration", "native-code.dir", "container", "ci", "tests.none", "tests.few"]);

/** Who fixes this item during a run: "openrewrite" (free), "ai", or "needs-you". Mirrors itemFixer() on the server. */
export function fixerOf(item) {
  if (item.fixer) return item.fixer;
  if (item.group === "auto" || tierOf(item) === "safe") return "openrewrite";
  if (item.group === "manual" || needsYouKinds.has(item.kind ?? item.category) || !item.file || item.file.endsWith("/")) return "needs-you";
  return "ai";
}

export const fixers = {
  openrewrite: { label: "OpenRewrite (free)", short: "OpenRewrite", icon: Zap, chip: "border-success/40 bg-success-soft text-success", hint: "The free, deterministic step (recipes, codemods, rules) makes this change." },
  ai: { label: "AI", short: "AI", icon: Sparkles, chip: "border-accent/40 bg-accent-soft text-accent", hint: "The AI changes the code for this during the run (Hybrid's AI step, or Full AI)." },
  "needs-you": { label: "Needs you", short: "Needs you", icon: Hand, chip: "border-warning/45 bg-warning-soft text-warning", hint: "No engine can do this safely (a secret, a business decision, or manual-only). It is left for you." },
};

export function FixerBadge({ item, className = "" }) {
  const fixer = fixers[fixerOf(item)];
  return (
    <span title={fixer.hint} className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border !border-transparent px-2.5 text-xs font-semibold whitespace-nowrap ${fixer.chip} ${className}`}>
      <fixer.icon aria-hidden="true" className="size-3.5" />
      {fixer.label}
    </span>
  );
}

/** A kept AI fix that removed the risk, an explicitly accepted risk, or something the run fixes itself (not "Needs you"). */
export function isSettled(item) {
  if (fixerOf(item) !== "needs-you") return true;
  if (item.aiFix?.status === "kept" && item.aiFix.resolved) return true;
  return item.decision === "approve" && Boolean(item.acceptedRisk || item.acceptRisk);
}

/**
 * Can "Fix with AI" help with this item? `fixability` comes from the server
 * (item id → null when it can, or a plain reason when it can't). Older servers
 * send nothing: then only will-break / high items with a file qualify.
 */
export function aiFixInfo(item, fixability) {
  const tier = tierOf(item);
  if (tier === "safe" || item.group === "auto") return { can: false, reason: null };
  if (fixability && item.id in fixability) return { can: fixability[item.id] === null, reason: fixability[item.id] };
  return { can: Boolean(item.file) && (tier === "breaks" || item.severity === "high"), reason: null };
}

export function canAiFix(item, fixability) {
  return aiFixInfo(item, fixability).can;
}

/** A credential in a config file: fixed by code (value → environment variable), no model involved. */
export function isSecretItem(item) {
  return (item.kind ?? item.category) === "inline-secret";
}

const openFix = (item) => item.aiFix && ["running", "proposed", "kept"].includes(item.aiFix.status);

/** Items each bulk button would start (mirrors the server's fixableItems). */
export function bulkFixable(items, fixability, scope) {
  return items.filter((item) => {
    if (!canAiFix(item, fixability) || openFix(item)) return false;
    const high = tierOf(item) === "breaks" || item.severity === "high";
    return scope === "high" ? high : tierOf(item) === "review" && !high;
  });
}

export function TierBadge({ item, className = "" }) {
  const tier = isFixed(item) ? tiers.fixed : tiers[tierOf(item)];
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border !border-transparent px-2.5 text-xs font-semibold whitespace-nowrap ${tier.chip} ${className}`}>
      <tier.icon aria-hidden="true" className="size-3.5" />
      {tier.label}
    </span>
  );
}

/** Top-of-plan summary: how many things will break and how many still need a change. */
export function TierSummary({ items, plan, ai, busy, fixability, planning = false, onRecheck, onFixAll, groupFilter = "all", setGroupFilter = null }) {
  // Items fixed by a kept change no longer count as breaking: they get their own "Fixed" tile.
  const fixed = items.filter((item) => isFixed(item));
  const breaks = items.filter((item) => tierOf(item) === "breaks" && !isFixed(item));
  const review = items.filter((item) => tierOf(item) === "review" && !isFixed(item)).length;
  const safe = items.filter((item) => tierOf(item) === "safe").length;
  const open = breaks.filter((item) => !isSettled(item));
  const runFixes = breaks.length - open.length;
  const running = (plan.aiFixes ?? []).filter((fix) => fix.status === "running");
  const resolved = plan.resolved ?? [];
  const headline = open.length
    ? `${open.length} thing${open.length === 1 ? "" : "s"} need${open.length === 1 ? "s" : ""} you. No engine can change ${open.length === 1 ? "it" : "them"} safely.`
    : breaks.length
      ? `${breaks.length} thing${breaks.length === 1 ? "" : "s"} would break, and the run fixes ${breaks.length === 1 ? "it" : "all of them"}.`
      : fixed.length
        ? `Everything that would break is fixed (${fixed.length}).`
        : "Nothing is known to break.";
  const rows = [
    { id: "breaks", label: "Will break", count: breaks.length, dot: "bg-danger", means: open.length ? `${open.length} need${open.length === 1 ? "s" : ""} you; the run fixes the rest` : breaks.length ? "The run fixes these" : "Nothing" },
    { id: "review", label: "Might break", count: review, dot: "bg-warning", means: "Often fine; read the evidence and decide" },
    { id: "safe", label: "Automatic", count: safe, dot: "bg-success", means: "Safe swaps applied by the free step" },
    ...(fixed.length ? [{ id: "fixed", label: "Fixed", count: fixed.length, dot: "bg-success", means: "Fixed by a change you kept", noFilter: true }] : []),
  ];
  return (
    <Card className="mt-6 overflow-hidden" aria-labelledby="tier-summary-title">
      <div className="px-5 py-4 sm:px-6">
        <h2 id="tier-summary-title" className="flex items-center gap-2 text-md font-semibold text-fg">
          {open.length ? <ShieldAlert aria-hidden="true" className="size-4 shrink-0 text-danger" /> : <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-success" />}
          {headline}
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          {open.length
            ? `These are locked, so the run leaves them for you${runFixes ? `; the other ${runFixes} are fixed by OpenRewrite or the AI during the run` : ""}. Change them yourself and press Re-check, or accept the risk.`
            : breaks.length
              ? "Nothing blocks the run. OpenRewrite does what it can for free, then the AI fixes the rest."
              : "You can run the plan."}
        </p>
      </div>
      <div className="overflow-x-auto border-t border-border">
        <table className="data-table">
          <caption className="sr-only">Findings by risk</caption>
          <thead>
            <tr>
              <th scope="col">Risk</th>
              <th scope="col" className="text-right">Items</th>
              <th scope="col">What it means</th>
              {setGroupFilter ? (
                <th scope="col" className="text-right">
                  <span className="sr-only">Filter</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const active = groupFilter === row.id;
              return (
                <tr key={row.id}>
                  <td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-2 font-medium">
                      <span aria-hidden="true" className={`size-2 rounded-full ${row.dot}`} />
                      {row.label}
                    </span>
                  </td>
                  <td className="text-right font-semibold">{row.count}</td>
                  <td className="text-fg-muted">{row.means}</td>
                  {setGroupFilter ? (
                    <td className="text-right">
                      {row.noFilter || !row.count ? null : (
                        <button type="button" aria-pressed={active} onClick={() => setGroupFilter(active ? "all" : row.id)} className="text-sm font-medium text-accent hover:underline">
                          {active ? "Show all" : "Show only"}
                        </button>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2 border-t border-border bg-surface-2/50 px-5 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onRecheck} disabled={Boolean(busy)}>
            {busy === "recheck" ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />} Re-check after fixing
          </Button>
          {plan.checkedAt ? <span className="ml-auto text-xs text-fg-subtle">Last re-checked {new Date(plan.checkedAt).toLocaleTimeString()}</span> : null}
        </div>
        {running.length ? (
          <p role="status" className="flex items-center gap-2 text-sm text-fg">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-accent" /> AI is fixing {running.length} item{running.length === 1 ? "" : "s"} on a private copy…
          </p>
        ) : null}
      </div>
      {resolved.length ? (
        <div className="border-t border-border px-5 py-4 sm:px-6">
          <p className="flex items-center gap-2 text-sm font-semibold text-fg">
            <CircleCheck aria-hidden="true" className="size-4 text-success" /> Fixed ({resolved.length})
          </p>
          <ul className="mt-2 space-y-1.5">
            {resolved.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2 text-sm text-fg-muted">
                <span className="line-through decoration-fg-subtle">{entry.title}</span>
                {entry.file ? <code className="font-mono text-xs break-all">{entry.file}{entry.line ? `:${entry.line}` : ""}</code> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function CodeBlock({ label, tone, text, startLine = null, focusLine = null }) {
  const lines = String(text ?? "").split("\n");
  return (
    <figure className="min-w-0">
      <figcaption className={`mb-1 text-xs font-semibold ${tone}`}>{label}</figcaption>
      <pre className="overflow-x-auto rounded-lg border border-border bg-code px-3 py-2.5 font-mono text-xs leading-relaxed text-code-fg">
        {lines.map((line, index) => {
          const number = startLine ? startLine + index : null;
          return (
            <div key={index} className={number && number === focusLine ? "-mx-3 bg-danger-soft px-3" : ""}>
              {number ? <span className="mr-3 inline-block w-7 text-right text-code-gutter select-none">{number}</span> : null}
              <code>{line || " "}</code>
            </div>
          );
        })}
      </pre>
    </figure>
  );
}

function DiffBlock({ diff }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-code px-3 py-2.5 font-mono text-xs leading-relaxed text-code-fg">
      {diff.split("\n").map((line, index) => (
        <div key={index} className={line.startsWith("+") && !line.startsWith("+++") ? "-mx-3 bg-success-soft px-3" : line.startsWith("-") && !line.startsWith("---") ? "-mx-3 bg-danger-soft px-3" : line.startsWith("@@") ? "text-code-gutter" : ""}>
          <code>{line || " "}</code>
        </div>
      ))}
    </pre>
  );
}

/**
 * "You need to change this": the project's own code, what breaks, and the
 * before → after fix. Per-item "Fix with AI" buttons are gone (the run's AI step fixes
 * these anyway); a fix kept in an earlier version still shows its diff with Keep / Undo,
 * and secrets can still be moved to an environment variable (done by code, not the AI).
 */
export function FixCard({ item, record, ai, disabled, fixability, planning = false, onAiFix, onKeep, onUndo }) {
  const breaks = tierOf(item) === "breaks";
  const settled = isSettled(item);
  const fix = item.fix;
  const aiFix = item.aiFix;
  const running = aiFix?.status === "running";
  const proposed = aiFix?.status === "proposed";
  const kept = aiFix?.status === "kept";
  const aiResolved = (proposed || kept) && Boolean(aiFix?.resolved);
  const fixed = isFixed(item);
  const needsChange = breaks && !settled && !aiResolved;
  const { can } = aiFixInfo(item, fixability);
  const secret = isSecretItem(item);
  const modelMissing = ai?.configured === false && !secret;
  const showFix = (can && secret) || Boolean(aiFix && aiFix.status !== "undone");
  if (!breaks && !fix?.before && !showFix) return null;
  return (
    <section aria-label="What you need to change" className={`mt-3 rounded-xl border p-3.5 sm:p-4 ${needsChange ? "border-danger/35 bg-danger-soft/50" : "border-border bg-surface/60"}`}>
      <div className="flex flex-wrap items-center gap-2">
        {needsChange ? (
          <span className="inline-flex h-6 items-center gap-1.5 rounded-md border !border-transparent border-danger/40 bg-surface px-2.5 text-xs font-semibold text-danger">
            <Wrench aria-hidden="true" className="size-3.5" /> You need to change this
          </span>
        ) : null}
        {breaks && settled && !aiResolved && fixerOf(item) !== "needs-you" ? (
          <span className="inline-flex h-6 items-center gap-1.5 rounded-md border !border-transparent border-accent/35 bg-accent-soft px-2.5 text-xs font-semibold text-accent">
            <Sparkles aria-hidden="true" className="size-3.5" /> {fixerOf(item) === "ai" ? "The AI fixes this during the run" : "OpenRewrite fixes this during the run"}
          </span>
        ) : null}
        {aiResolved ? (
          <span className="inline-flex h-6 items-center gap-1.5 rounded-md border !border-transparent border-success/35 bg-success-soft px-2.5 text-xs font-semibold text-success">
            <Sparkles aria-hidden="true" className="size-3.5" /> {fixed ? (secret ? "Fixed: the change is kept" : "Fixed by AI: the change is kept") : secret ? "Fixed on a copy (review the diff)" : "Fixed by AI (review the diff)"}
          </span>
        ) : null}
        {proposed && aiResolved ? <span className="text-xs text-fg-muted">Keep it or undo it below.</span> : null}
        {breaks && item.decision === "approve" && (item.acceptedRisk || item.acceptRisk) && !kept ? (
          <span className="inline-flex h-6 items-center gap-1.5 rounded-md border !border-transparent border-warning/35 bg-warning-soft px-2.5 text-xs font-semibold text-warning">Risk accepted</span>
        ) : null}
        {needsChange && item.decision === "lock" ? (
          <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
            <LockKeyhole aria-hidden="true" className="size-3.5" /> Locked until fixed
          </span>
        ) : null}
      </div>
      {fix?.summary && !fixed ? <p className="mt-2 text-sm leading-relaxed text-fg"><span className="font-semibold">What to change: </span>{fix.summary}</p> : null}
      {item.excerpt && !fixed ? (
        <div className="mt-3">
          <CodeBlock label={`Your code now · ${item.excerpt.file}`} tone="text-fg-muted" text={item.excerpt.lines.join("\n")} startLine={item.excerpt.startLine} focusLine={item.excerpt.focusLine} />
        </div>
      ) : null}
      {fix?.before && fix?.after && !fixed ? (
        <div className="mt-3 grid gap-3">
          <CodeBlock label="Before" tone="text-danger" text={fix.before} />
          <CodeBlock label="After" tone="text-success" text={fix.after} />
        </div>
      ) : null}
      {showFix ? (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {secret && can && (!aiFix || ["failed", "undone"].includes(aiFix.status)) ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant={breaks ? "accent" : "secondary"} onClick={onAiFix} disabled={disabled || planning || modelMissing} title={modelMissing ? ai.message : planning ? "Available when planning finishes" : "Edits a private copy, never your folder"}>
                <Sparkles aria-hidden="true" className={breaks ? undefined : "text-warning"} /> {secret ? (aiFix ? "Try again: move to an env variable" : "Move to an env variable") : aiFix ? "Preview the AI fix again" : "Preview the AI fix (optional)"}
              </Button>
              <span className="text-xs text-fg-muted">
                {planning
                  ? "Available when planning finishes."
                  : modelMissing
                    ? ai.message
                    : secret
                      ? "Replaces the value with ${…} on a private copy. The value is never shown or sent to the AI."
                      : (item.files?.length ?? 0) > 1
                        ? `Optional: the run's AI step changes this anyway. This shows the diff first, on a private copy of this finding's ${item.files.length} files; a kept fix is applied and shown as Fixed.`
                        : "Optional: the run's AI step changes this anyway. This shows the diff first, on a private copy of this finding's files; a kept fix is applied and shown as Fixed."}
              </span>
            </div>
          ) : null}
          {running ? (
            <p role="status" className="flex items-center gap-2 text-sm text-fg">
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-info" /> {record?.stage || "AI is working"}…
            </p>
          ) : null}
          {aiFix?.status === "failed" ? <p className="text-sm text-danger">AI couldn't fix it: {record?.error || aiFix.note}</p> : null}
          {(proposed || kept) && record ? (
            <div className="space-y-2.5">
              {record.summary ? <p className="text-sm text-fg"><span className="font-semibold">{secret ? "Fix: " : "AI: "}</span>{record.summary}</p> : null}
              <p className={`text-sm font-medium ${record.resolved ? "text-success" : "text-warning"}`}>
                {record.resolved ? "Re-check: the risk is gone." : `Re-check: not fixed yet. ${record.recheckNote}`}
              </p>
              {record.files.map((file) => (
                <div key={file.file}>
                  <p className="mb-1 font-mono text-xs break-all text-fg-muted">{file.file}</p>
                  <DiffBlock diff={file.diff} />
                </div>
              ))}
              {record.refused?.length ? <p className="text-xs text-fg-muted">Refused (outside this finding or locked): {record.refused.join("; ")}</p> : null}
              <div className="flex flex-wrap gap-2">
                {proposed ? (
                  <Button size="sm" variant="primary" onClick={onKeep} disabled={disabled}>
                    <Check aria-hidden="true" /> Keep this fix
                  </Button>
                ) : null}
                <Button size="sm" variant="secondary" onClick={onUndo} disabled={disabled}>
                  <Undo2 aria-hidden="true" /> Undo
                </Button>
              </div>
              <p className="text-xs text-fg-subtle">{kept ? "Kept: the dry run starts from this fixed code, and the report lists it." : "Nothing is applied until you keep it. Your own folder never changes here."}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Confirm before approving something that will break. */
export function AcceptRiskDialog({ item, onCancel, onConfirm }) {
  const dialog = useRef(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      onClose={onCancel}
      aria-labelledby="accept-risk-title"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-border bg-elevated p-0 text-fg shadow-pop backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-danger/40 bg-danger-soft text-danger">
            <ShieldAlert aria-hidden="true" className="size-5" />
          </span>
          <h2 id="accept-risk-title" className="text-lg font-semibold tracking-tight">Approve something that will break?</h2>
        </div>
        <p className="mt-4 text-sm text-fg">{item.explain?.plainTitle ?? item.title}</p>
        <p className="mt-1 font-mono text-xs break-all text-fg-muted">{item.file}{item.line ? `:${item.line}` : ""}</p>
        <p className="mt-3 text-sm text-fg-muted">{item.explain?.ifApproved ?? "The run goes ahead and is expected to fail at this point."}</p>
        <label className="mt-4 flex items-start gap-2.5 text-sm text-fg">
          <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="mt-0.5 size-4 accent-[var(--color-danger)]" />
          I understand this is expected to break the build, and I accept the risk.
        </label>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} autoFocus>
            Keep it locked
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={!checked}>
            Accept the risk <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </dialog>
  );
}

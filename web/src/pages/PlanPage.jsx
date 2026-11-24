import { defaultEngineFor, engineMeta, engineState } from "../components/Engine.jsx";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import SourceBadge, { LocalCloneNote, sourceName } from "../components/SourceBadge.jsx";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { KEYS, readStored, writeStored } from "../storage.js";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleDot,
  ClipboardList,
  FileCode2,
  FlaskConical,
  GraduationCap,
  Hand,
  Info,
  LockKeyhole,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  TriangleAlert,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import Journey from "../components/Journey.jsx";
import LangBadge from "../components/LangBadge.jsx";
import { ConfirmBlockersDialog, ConsequenceCallout, ExplainDetail, ImpactPreview, OutcomeBadge, RiskChip } from "../components/PlanExplain.jsx";
import { PlanDetails, PlanRecommendation } from "../components/PlanEngines.jsx";
import { AcceptRiskDialog, FixCard, FixerBadge, isFixed, isSettled, TierBadge, TierSummary, tierOf } from "../components/PlanTiers.jsx";
import { PlanningBanner, reviewStages } from "../components/PlanningBanner.jsx";
import RefactorQuiz from "../components/RefactorQuiz.jsx";
import { Button, Card, ContentHeader, controlClass, EmptyState, ErrorState, KpiGrid, Pill, Segmented, Skeleton, Spinner, StatusText, Switch } from "../components/ui.jsx";
import { useToast } from "../components/Toaster.jsx";
import { api } from "../api.js";
import { ecosystemOf, severityRank } from "../ecosystems.js";
import { useMigration } from "../migrationContext.js";
import { formatRelative, formatTime } from "../pipeline.js";

const groups = [
  { id: "breaks", title: "Will break", short: "Will break", description: "These stop the build or the app when you upgrade. Fix them, or keep them for yourself.", icon: ShieldAlert, tone: "text-danger", ring: "border-danger/40 bg-danger-soft", open: true },
  { id: "review", title: "Might break", short: "Might break", description: "Often fine, but known to fail at runtime. Read the evidence, then decide.", icon: TriangleAlert, tone: "text-warning", ring: "border-warning/40 bg-warning-soft", open: true },
  { id: "safe", title: "Automatic", short: "Automatic", description: "Safe swaps the free step applies on its own: recipes, codemods, rules and installs. Lock a file to keep it as it is.", icon: Zap, tone: "text-accent", ring: "border-accent/40 bg-accent-soft", open: false },
];

const severity = {
  high: { label: "High", icon: ShieldAlert, chip: "border-danger/30 bg-danger-soft text-danger", bar: "bg-danger" },
  medium: { label: "Medium", icon: TriangleAlert, chip: "border-warning/30 bg-warning-soft text-warning", bar: "bg-warning" },
  low: { label: "Low", icon: Info, chip: "border-info/30 bg-info-soft text-info", bar: "bg-info" },
  info: { label: "Info", icon: CircleDot, chip: "border-border bg-surface-2 text-fg-muted", bar: "bg-fg-subtle/60" },
};

const decisionOptions = (canLock) => [
  { value: "approve", label: "Approve", icon: Check, title: "Let the pipeline apply this", activeClass: "bg-success-soft text-success ring-1 ring-success/40" },
  { value: "lock", label: "Lock", icon: LockKeyhole, disabled: !canLock, title: canLock ? "Keep these files exactly as they are" : "Project-wide items cannot be locked", activeClass: "bg-accent-soft text-accent ring-1 ring-accent/45" },
  { value: "manual", label: "Manual", icon: Hand, title: "I will handle it myself (also kept unchanged)", activeClass: "bg-warning-soft text-warning ring-1 ring-warning/40" },
];

const canLockItem = (item) => Boolean(item.file || item.files?.length);

export default function PlanPage() {
  const { planId } = useParams();
  const location = useLocation();
  const { startMigration, config } = useMigration();
  const navigate = useNavigate();
  const toast = useToast();
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [changes, setChanges] = useState({});
  const [paths, setPaths] = useState(null);
  const [reviewerNote, setReviewerNote] = useState(null);
  const [exportFile, setExportFile] = useState(false);
  const [busy, setBusy] = useState("");
  const [retry, setRetry] = useState(0);
  const [actionError, setActionError] = useState(null);
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [savedImpact, setSavedImpact] = useState(null);
  const [draftImpact, setDraftImpact] = useState(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [focusId, setFocusId] = useState(null);
  const [ai, setAi] = useState(null);
  const [acceptFor, setAcceptFor] = useState(null);
  const [fixability, setFixability] = useState(null);
  const [estimates, setEstimates] = useState(null);
  const [advice, setAdvice] = useState({ recommendation: null, details: null, fixerReasons: {} });
  const [reviewDone, setReviewDone] = useState(false);
  const [technical, setTechnicalState] = useState(() => {
    return readStored(KEYS.planMode) === "technical";
  });
  function setTechnical(value) {
    setTechnicalState(value);
    writeStored(KEYS.planMode, value ? "technical" : "simple");
  }
  // The plan recommends the engine; the folder screen no longer asks. A choice here only overrides it.
  const [engineChoice, setEngineChoice] = useState("");
  const recommendedEngine = advice.recommendation?.recommendedEngine ?? null;
  const engine =
    engineChoice && engineState(config, engineChoice).available
      ? engineChoice
      : recommendedEngine && engineState(config, recommendedEngine).available
        ? recommendedEngine
        : defaultEngineFor(config);
  const options = { ...(location.state?.runOptions ?? { dryRun: true }), engine };
  // When the user pressed "Create plan" (so the banner's timer continues from the planning screen).
  const planningStartedAt = location.state?.planning?.startedAt ?? null;
  const dryRun = options.dryRun !== false;

  useEffect(() => {
    let stopped = false;
    let timer;
    const controller = new AbortController();
    async function load() {
      try {
        const result = await api.plan(planId, controller.signal);
        if (stopped) return;
        setPlan(result.plan);
        if (result.fixability) setFixability(result.fixability);
        if (result.estimates) setEstimates(result.estimates);
        if (result.recommendation) setAdvice({ recommendation: result.recommendation, details: result.details ?? null, fixerReasons: result.fixerReasons ?? {} });
        setSavedImpact(result.impact ?? null);
        setError(null);
        if (["pending", "running"].includes(result.plan.ai.status)) timer = setTimeout(load, 1800);
      } catch (e) {
        if (!stopped && e?.name !== "AbortError") setError(e);
      }
    }
    setPlan(null);
    setChanges({});
    setPaths(null);
    setReviewerNote(null);
    load();
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [planId, retry]);

  // Is a model configured for Fix with AI? (shown plainly on the buttons when not)
  useEffect(() => {
    const controller = new AbortController();
    api.aiStatus(controller.signal).then(setAi, () => setAi(null));
    return () => controller.abort();
  }, []);

  // Poll while an AI fix runs (no skeleton flash: only the plan data is replaced).
  const fixRunning = Boolean(plan?.aiFixes?.some((fix) => fix.status === "running"));
  useEffect(() => {
    if (!fixRunning) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await api.plan(planId, controller.signal);
        setPlan(result.plan);
        if (result.fixability) setFixability(result.fixability);
        if (result.estimates) setEstimates(result.estimates);
        if (result.recommendation) setAdvice({ recommendation: result.recommendation, details: result.details ?? null, fixerReasons: result.fixerReasons ?? {} });
        setSavedImpact(result.impact ?? null);
      } catch {
        /* next render retries */
      }
    }, 1500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [planId, plan, fixRunning]);

  // When the AI review finishes while you watch, the banner says so for a few seconds, then gets out of the way.
  const reviewStatus = plan?.ai.status;
  const wasReviewing = useRef(false);
  useEffect(() => {
    if (!reviewStatus) return undefined;
    const reviewing = ["pending", "running"].includes(reviewStatus);
    if (reviewing) {
      wasReviewing.current = true;
      return undefined;
    }
    if (!wasReviewing.current) return undefined;
    wasReviewing.current = false;
    setReviewDone(true);
    const timer = setTimeout(() => setReviewDone(false), 6000);
    return () => clearTimeout(timer);
  }, [reviewStatus]);

  const items = useMemo(() => (plan ? plan.items.map((item) => ({ ...item, ...changes[item.id] })) : []), [plan, changes]);

  // Impact preview: the saved plan's prediction, or a live one for unsaved decisions / paths (debounced).
  // The key also carries the fix state, so a Keep / Undo / re-check refreshes a draft prediction instead of leaving a stale one.
  const fixState = plan ? plan.items.filter((item) => item.aiFix).map((item) => `${item.id}:${item.aiFix.status}:${item.aiFix.resolved}`).join(",") : "";
  const draftKey = plan ? JSON.stringify({ d: Object.entries(changes).map(([id, edit]) => [id, edit.decision]).filter(([, decision]) => decision), p: paths, f: fixState }) : "";
  const draftBody = useRef(null);
  useEffect(() => {
    if (!plan) return undefined;
    const decisions = Object.entries(changes).filter(([, edit]) => edit.decision).map(([id, edit]) => ({ id, decision: edit.decision }));
    if (!decisions.length && paths === null) {
      setDraftImpact(null);
      setImpactLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    draftBody.current = { decisions, lockedPaths: paths ?? plan.lockedPaths };
    setImpactLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await api.planImpact(planId, draftBody.current, controller.signal);
        setDraftImpact(result.impact);
      } catch (e) {
        if (e?.name !== "AbortError") setDraftImpact(null);
      } finally {
        if (!controller.signal.aborted) setImpactLoading(false);
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, draftKey]);
  const impact = draftImpact ?? savedImpact;

  if (error) {
    return (
      <PlanShell>
        {error.status === 404 ? (
          <EmptyState icon={ClipboardList} title="This plan does not exist" action={<Link to="/new" className="text-sm font-medium text-accent underline-offset-4 hover:underline">Create a new plan</Link>}>
            It may have been created on another agent server, or its data folder was cleared.
          </EmptyState>
        ) : (
          <ErrorState error={error} onRetry={() => setRetry((v) => v + 1)} />
        )}
      </PlanShell>
    );
  }
  if (!plan) return <PlanSkeleton />;

  const lockedPaths = paths ?? plan.lockedPaths ?? [];
  const dirty = Object.keys(changes).length > 0 || paths !== null || reviewerNote !== null;
  const aiRunning = ["pending", "running"].includes(plan.ai.status);
  const approved = plan.status === "approved" && !dirty;

  function change(id, key, value, confirmed = false) {
    const original = plan.items.find((item) => item.id === id);
    const current = items.find((item) => item.id === id);
    // Approving something that will break needs an explicit "I accept the risk".
    if (key === "decision" && value === "approve" && !confirmed && tierOf(original) === "breaks" && !isSettled(original) && !(original.aiFix?.resolved && original.aiFix.status === "proposed")) {
      setAcceptFor(current ?? original);
      return;
    }
    setChanges((old) => {
      const entry = { ...old[id], [key]: value };
      if (key === "decision") {
        if (value === "approve" && confirmed) entry.acceptRisk = true;
        else delete entry.acceptRisk;
      }
      const next = { ...old, [id]: entry };
      if (Object.entries(next[id]).every(([k, v]) => original[k] === v)) delete next[id];
      return next;
    });
  }
  async function planAction(kind, call, success) {
    setBusy(kind);
    setActionError(null);
    try {
      const result = await call();
      setPlan(result.plan);
        if (result.fixability) setFixability(result.fixability);
        if (result.estimates) setEstimates(result.estimates);
        if (result.recommendation) setAdvice({ recommendation: result.recommendation, details: result.details ?? null, fixerReasons: result.fixerReasons ?? {} });
      setSavedImpact(result.impact ?? null);
      if (success) toast.success(...success(result));
    } catch (e) {
      setActionError(e);
      toast.error("That didn't work", e.message);
    } finally {
      setBusy("");
    }
  }
  const recheck = () =>
    planAction("recheck", () => api.recheckPlan(planId), (result) => {
      const left = result.summary?.tiers?.mustFix ?? 0;
      return ["Re-checked", left ? `${left} thing${left === 1 ? "" : "s"} still need${left === 1 ? "s" : ""} a change.` : "Nothing left that will break."];
    });
  const aiFix = (ids, scope) => planAction("ai-fix", () => api.aiFix(planId, ids, scope), (result) => ["Fix started", `Working on ${result.fixIds?.length ?? 0} item(s) on a private copy.`]);
  const generateQuiz = (regenerate) =>
    planAction("refactor", () => api.refactorQuiz(planId, { regenerate }), (result) => {
      const count = result.plan?.refactor?.questions?.length ?? 0;
      return count ? ["Quiz ready", `${count} question${count === 1 ? "" : "s"} from a scan of your code.`] : ["Nothing to refactor", "The scan found nothing worth changing."];
    });
  async function saveQuiz(body, { quiet = false } = {}) {
    if (!quiet) {
      const done = { added: ["Added to the plan", "The Refactor step runs after the upgrade."], skipped: ["Quiz skipped", "The upgrade runs without refactors."], open: null }[body.status];
      return planAction("refactor", () => api.saveRefactorQuiz(planId, body), done ? () => done : undefined);
    }
    const result = await api.saveRefactorQuiz(planId, body);
    setPlan(result.plan);
    setSavedImpact(result.impact ?? null);
  }
  const keepFix = (fixId) => planAction("keep", () => api.keepAiFix(planId, fixId), () => ["Fix kept", "The dry run will start from the fixed code."]);
  const undoFix = (fixId) => planAction("undo", () => api.undoAiFix(planId, fixId), () => ["Fix undone", "The item is back to how it was."]);
  const fixProps = {
    reasons: advice.fixerReasons,
    ai,
    fixability,
    records: plan.aiFixes ?? [],
    onAiFix: (id) => aiFix([id]),
    onKeep: keepFix,
    onUndo: undoFix,
  };
  function bulk(list, decision) {
    const original = new Map(plan.items.map((item) => [item.id, item]));
    setChanges((old) => {
      const next = { ...old };
      for (const item of list) {
        if (decision === "lock" && !canLockItem(item)) continue;
        // Bulk approve never approves something that will break (that needs a per-item confirm).
        if (decision === "approve" && tierOf(item) === "breaks" && !isSettled(item)) continue;
        next[item.id] = { ...next[item.id], decision };
        if (Object.entries(next[item.id]).every(([k, v]) => original.get(item.id)[k] === v)) delete next[item.id];
      }
      return next;
    });
  }
  function reset() {
    setDraftImpact(null);
    setChanges({});
    setPaths(null);
    setReviewerNote(null);
  }
  const payload = () => ({ decisions: Object.entries(changes).map(([id, edit]) => ({ id, ...edit })), lockedPaths, reviewerNote: reviewerNote ?? plan.reviewerNote });

  async function save(start = false, compareEngines = null, engineOverride = null) {
    setBusy(start ? "start" : compareEngines ? "compare" : "save");
    setActionError(null);
    try {
      // Approving while the optional AI review still runs skips it (the button says so).
      // Comparing also approves the plan (the engines run on dry-run copies, never on the folder).
      const result = start || compareEngines ? await api.approvePlan(planId, { ...payload(), exportFile, skipAiReview: aiRunning }) : await api.updatePlan(planId, payload());
      setPlan(result.plan);
        if (result.fixability) setFixability(result.fixability);
        if (result.estimates) setEstimates(result.estimates);
        if (result.recommendation) setAdvice({ recommendation: result.recommendation, details: result.details ?? null, fixerReasons: result.fixerReasons ?? {} });
      setSavedImpact(result.impact ?? null);
      reset();
      if (start) await startMigration({ ...options, ...(engineOverride ? { engine: engineOverride } : {}), repoPath: result.plan.repoPath, planId });
      else if (compareEngines) {
        const started = await api.compare({ repoPath: result.plan.repoPath, planId, engines: compareEngines, skipTests: options.skipTests || undefined, fixRounds: options.fixRounds });
        navigate(`/compare/${started.comparisonId}`);
      }
      else if (!compareEngines) toast.success("Review saved", "Your decisions, locks and notes are saved with this plan.");
    } catch (e) {
      setActionError(e);
      toast.error(start ? "Could not start the run" : compareEngines ? "Could not start the comparison" : "Could not save the review", e.message);
    } finally {
      setBusy("");
    }
  }

  const count = (key, value) => items.filter((item) => item[key] === value).length;
  const willChange = items.filter((item) => item.group !== "manual" && item.decision === "approve").length;
  const lockedCount = count("decision", "lock");
  const manualCount = count("decision", "manual");
  const needle = query.trim().toLowerCase();
  const visible = items.filter(
    (item) =>
      (groupFilter === "all" || tierOf(item) === groupFilter) &&
      (decisionFilter === "all" || item.decision === decisionFilter) &&
      (!needle || [item.title, item.file, item.category, item.why, item.id, item.evidence, item.explain?.plainTitle, item.explain?.inPlainWords].some((text) => text?.toLowerCase().includes(needle))),
  );
  const blockers = (impact?.consequences ?? []).filter((entry) => entry.reason !== "not-fixed-automatically" && entry.risk === "blocker");
  const titleOf = (id) => {
    const item = items.find((entry) => entry.id === id);
    return item ? (technical ? item.title : (item.explain?.plainTitle ?? item.title)) : id;
  };
  function jumpTo(id) {
    setQuery("");
    setGroupFilter("all");
    setDecisionFilter("all");
    setFocusId(id);
    requestAnimationFrame(() => {
      const element = document.getElementById(`item-${id}`);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      element?.querySelector("h3 button, button[aria-expanded]")?.focus({ preventScroll: true });
    });
  }
  function onStart() {
    if (blockers.length) setConfirming(true);
    else save(true);
  }
  const meta = ecosystemOf(plan.ecosystem);

  const reviewStartedAt = planningStartedAt ?? (plan.ai.startedAt ? Date.parse(plan.ai.startedAt) : Date.parse(plan.createdAt));
  const banner = aiRunning ? (
    <PlanningBanner
      title="Planning… AI review"
      detail="Everything below is ready to review. The AI is double-checking the risky parts and may add a few findings; they appear here when it's done. You can fix things now; approving now skips the AI review."
      stages={reviewStages(plan, "running")}
      startedAt={reviewStartedAt}
    />
  ) : reviewDone ? (
    <PlanningBanner
      title={plan.ai.status === "done" ? `Plan ready · AI review added ${plan.ai.added} finding${plan.ai.added === 1 ? "" : "s"}` : plan.ai.status === "failed" ? "Plan ready · AI review didn't run" : "Plan ready"}
      detail={plan.ai.status === "failed" ? "Every finding below comes from the scanner; the plan is complete." : null}
      stages={reviewStages(plan, plan.ai.status === "failed" ? "failed" : "done")}
      startedAt={reviewStartedAt}
      done={plan.ai.status !== "failed"}
      failed={plan.ai.status === "failed"}
    />
  ) : null;

  return (
    <PlanShell>
      {banner}
      <PlanStatusBar
        plan={plan}
        items={items}
        approved={approved}
        dirty={dirty}
        aiRunning={aiRunning}
        ai={ai}
        dryRun={dryRun}
        engineLabel={engineMeta[engine]?.label}
        blockers={blockers.length}
        aiItems={advice.recommendation?.signals?.aiItems}
        busy={busy}
        onStart={onStart}
      />

      <PlanRecommendation
        plan={plan}
        recommendation={advice.recommendation}
        estimates={estimates}
        details={advice.details}
        config={config}
        engine={engine}
        onEngine={setEngineChoice}
        busy={busy}
        onCompare={(engines) => save(false, engines)}
      />

      <RefactorQuiz plan={plan} ai={ai} disabled={Boolean(busy)} onGenerate={generateQuiz} onSave={saveQuiz} />

      <TierSummary items={items} plan={plan} ai={ai} busy={busy} fixability={fixability} onRecheck={recheck} groupFilter={groupFilter} setGroupFilter={setGroupFilter} />

      <PlanDetails details={advice.details?.[engine]} engine={engine} dryRun={dryRun} />

      <AiReview ai={plan.ai} meta={meta} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <ImpactPreview impact={impact} loading={impactLoading} onJump={jumpTo} collapsible idBase="impact-preview-mobile" className="lg:hidden" />
          <ExplainMode technical={technical} setTechnical={setTechnical} />
          <Toolbar
            query={query}
            setQuery={setQuery}
            groupFilter={groupFilter}
            setGroupFilter={setGroupFilter}
            decisionFilter={decisionFilter}
            setDecisionFilter={setDecisionFilter}
            shown={visible.length}
            total={items.length}
            dirty={dirty}
            onReset={reset}
            busy={Boolean(busy)}
          />
          {groups.map((group, index) => {
            const all = items.filter((item) => tierOf(item) === group.id);
            const list = visible.filter((item) => tierOf(item) === group.id).sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || (a.file ?? "").localeCompare(b.file ?? ""));
            if (groupFilter !== "all" && groupFilter !== group.id) return null;
            return (
              <GroupSection
                key={group.id}
                group={group}
                index={index}
                all={all}
                list={list}
                filtered={Boolean(needle) || decisionFilter !== "all"}
                disabled={Boolean(busy)}
                onChange={change}
                onBulk={bulk}
                originals={plan.items}
                impact={impact}
                technical={technical}
                titleOf={titleOf}
                focusId={focusId}
                fixProps={fixProps}
              />
            );
          })}
          {plan.notes.length ? (
            <Card className="space-y-2 p-5 text-sm text-fg-muted">
              <p className="text-sm font-semibold text-fg">Adapter notes</p>
              {plan.notes.map((note) => (
                <p key={note} className="flex gap-2">
                  <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
                  {note}
                </p>
              ))}
            </Card>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-5 lg:sticky lg:top-6 lg:self-start">
          <ImpactPreview impact={impact} loading={impactLoading} onJump={jumpTo} className="hidden lg:block" />
          <ProtectedPaths items={items} lockedPaths={lockedPaths} setPaths={setPaths} disabled={Boolean(busy)} />
          <Card className="space-y-4 p-5">
            <div>
              <label htmlFor="review-note" className="mb-1.5 block text-sm font-medium text-fg">
                Reviewer notes
              </label>
              <textarea id="review-note" rows={3} value={reviewerNote ?? plan.reviewerNote} onChange={(e) => setReviewerNote(e.target.value)} className={`${controlClass} h-auto py-2 text-sm`} placeholder="What should the next reviewer know?" />
              <p className="mt-1.5 text-xs text-fg-subtle">Shown in the report under Manual follow-up.</p>
            </div>
            <div className="flex items-start gap-3 border-t border-border pt-4">
              <Switch checked={exportFile} onChange={setExportFile} label="Export migration-plan.json" />
              <p className="text-sm text-fg-muted">
                <span className="block font-medium text-fg">Export the plan file</span>
                Also writes <span className="font-mono text-xs">migration-plan.json</span> to the project on approval, so the CLI and CI can reuse it.
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs">
              <div>
                <dt className="text-fg-subtle">Created</dt>
                <dd className="mt-0.5 text-fg-muted" title={formatTime(plan.createdAt)}>{formatRelative(plan.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Approved</dt>
                <dd className="mt-0.5 text-fg-muted">{plan.approvedAt ? formatRelative(plan.approvedAt) : "Not yet"}</dd>
              </div>
            </dl>
          </Card>
        </aside>
      </div>

      <ApprovalBar
        willChange={willChange}
        locked={lockedCount}
        manual={manualCount}
        paths={lockedPaths.length}
        dirty={dirty}
        approved={approved}
        wasApproved={plan.status === "approved"}
        aiRunning={aiRunning}
        busy={busy}
        dryRun={dryRun}
        actionError={actionError}
        impact={impact}
        engineLabel={engineMeta[engine]?.label}
        onSave={() => save()}
        onStart={onStart}
      />
      {acceptFor ? (
        <AcceptRiskDialog
          item={acceptFor}
          onCancel={() => setAcceptFor(null)}
          onConfirm={() => {
            const id = acceptFor.id;
            setAcceptFor(null);
            change(id, "decision", "approve", true);
          }}
        />
      ) : null}
      {confirming ? (
        <ConfirmBlockersDialog
          blockers={blockers}
          impact={impact}
          dryRun={dryRun}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            const chosen = typeof confirming === "string" ? confirming : null;
            setConfirming(false);
            save(true, null, chosen);
          }}
        />
      ) : null}
    </PlanShell>
  );
}

function PlanShell({ children }) {
  return <div className="mx-auto max-w-[1200px] px-4 pt-6 pb-6 sm:px-8 sm:pt-8">{children}</div>;
}

function PlanSkeleton() {
  return (
    <PlanShell>
      <Skeleton className="h-14 rounded-xl" />
      <Skeleton className="mt-10 h-28 w-2/3 rounded-xl" />
      <Skeleton className="mt-8 h-56 rounded-2xl" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-3">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <p className="sr-only" role="status">
        Loading the plan…
      </p>
    </PlanShell>
  );
}

/* ------------------------------------------------------------------ */
/* Summary bar: what is happening, how it is going, what to do next    */
/* ------------------------------------------------------------------ */
function PlanStatusBar({ plan, items, approved, dirty, aiRunning, ai, dryRun, engineLabel, blockers, aiItems, busy, onStart }) {
  const detected = Object.entries(plan.detected ?? {}).filter(([key, value]) => ["java", "boot", "node", "typescript", "express", "python", "django", "flask"].includes(key) && value);
  const breaks = items.filter((item) => tierOf(item) === "breaks" && !isFixed(item));
  const open = breaks.filter((item) => !isSettled(item)).length;
  const safe = items.filter((item) => tierOf(item) === "safe").length;
  const runWord = dryRun ? "dry run" : "run";
  const status = approved
    ? { label: "Approved", tone: "passed" }
    : dirty
      ? { label: "Unsaved edits", tone: "warning" }
      : aiRunning
        ? { label: "AI review running", tone: "running" }
        : { label: "Ready for review", tone: "neutral" };
  const next = open || blockers
    ? `Fix or accept the ${open || blockers} blocking item${(open || blockers) === 1 ? "" : "s"} below, then start the ${runWord}.`
    : `Check the engine choice below, then start the ${runWord} with ${engineLabel ?? "the chosen engine"}. Nothing in your project has changed yet.`;
  const aiOff = ai?.configured === false ? ai.message : null;
  const startLabel = `${aiRunning && !approved ? "Skip AI review & start" : approved ? "Start" : "Approve & start"} ${dryRun ? "dry run" : "run"}`;
  return (
    <section aria-label="Plan summary">
      <ContentHeader
        crumbs={[{ label: "New migration", to: "/new" }, { label: "Plan" }, { label: plan.planId, mono: true }]}
        title={sourceName(plan.source, plan.repoName)}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <LangBadge ecosystem={plan.ecosystem} />
            {detected.length ? <span>{detected.map(([key, value]) => `${key} ${String(value).replace(/^\^|~/, "")}`).join(" · ")}</span> : null}
            <ArrowRight aria-hidden="true" className="size-3.5 text-fg-subtle" />
            <span className="font-medium text-fg">{plan.targetLabel}</span>
          </span>
        }
        meta={
          <>
            <p className="font-mono text-xs break-all text-fg-subtle">{plan.repoPath}</p>
            {plan.source ? <SourceBadge source={plan.source} className="mt-1.5" /> : null}
            <LocalCloneNote source={plan.source} className="mt-1" />
          </>
        }
        actions={
          <>
            <StatusText tone={status.tone} className="mr-2">{status.label}</StatusText>
            <Button variant="accent" size="lg" onClick={onStart} disabled={Boolean(busy)}>
              {busy === "start" ? <Spinner label="Starting…" className="text-accent-fg" /> : <><Play aria-hidden="true" /> {startLabel}</>}
            </Button>
          </>
        }
      />
      <Journey current="approve" state={approved ? "done" : "active"} links={{ new: "/new" }} className="mt-6" />
      <KpiGrid
        className="mt-6"
        items={[
          { label: "Files scanned", value: plan.stats.filesScanned ?? "—", hint: plan.stats.sourceFiles != null ? `${plan.stats.sourceFiles} source · ${plan.stats.testFiles ?? 0} test` : "" },
          { label: "Will break", value: breaks.length, tone: open ? "danger" : breaks.length ? "warning" : "success", hint: open ? `${open} need${open === 1 ? "s" : ""} you` : breaks.length ? "the run fixes all of them" : "nothing known" },
          { label: "Automatic", value: safe, hint: "safe swaps, no tokens" },
          { label: "AI items", value: aiItems ?? "—", hint: "need the AI to fix" },
        ]}
      />
      <div className="mt-4 flex items-center gap-3 rounded-[10px] bg-surface px-5 py-3 shadow-card">
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent" />
        <span className="shrink-0 text-xs font-medium text-fg-subtle">Next</span>
        <p className="min-w-0 text-[13.5px] text-fg">{next}</p>
      </div>
      {aiOff ? <AiOffNotice message={aiOff} /> : null}
    </section>
  );
}

/** Slim, dismissible inline notice that the AI login is missing (hidden for this session once dismissed). */
function AiOffNotice({ message }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem("leapfrog-ai-off-dismissed") === "1";
    } catch {
      return false;
    }
  });
  if (hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      sessionStorage.setItem("leapfrog-ai-off-dismissed", "1");
    } catch {
      /* storage unavailable: hide for this view only */
    }
  };
  return (
    <div role="note" className="mt-3 flex items-center gap-2.5 rounded-[10px] border border-warning/25 bg-warning-soft/60 py-1.5 pr-1.5 pl-3.5 text-[13px] text-fg-muted">
      <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0 text-warning" />
      <p className="min-w-0 flex-1 truncate" title={message}>
        <span className="font-medium text-fg">AI isn't set up, so Full AI and AI fixes are off.</span> {message}
      </p>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="grid size-7 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors duration-150 hover:bg-surface hover:text-fg">
        <X aria-hidden="true" className="size-3.5" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AI review: optional, calm when it is off or unavailable            */
/* ------------------------------------------------------------------ */
function AiReview({ ai, meta }) {
  const running = ["pending", "running"].includes(ai.status);
  // Off or unavailable: the plan is complete without it, and the AI-login note above already says why.
  if (!running && ai.status !== "done") return null;
  const credential = /credential|api[_ ]?key|login/i.test(ai.error ?? "");
  const content = running
    ? { title: "AI review in progress", body: "A read-only model session is reading the project. Every deterministic finding below is ready to review now.", tone: "accent" }
    : ai.status === "done"
      ? { title: "AI review", body: ai.summary || "The model found no additional risks.", tone: "accent" }
      : ai.status === "failed"
        ? {
            title: "AI review unavailable",
            body: credential
              ? `This agent server has no model credential, so the optional AI review did not run. Every finding below comes from the ${meta.short} scanner and matrix: the plan is complete and you can approve it.`
              : `The model could not be reached, so the optional AI review did not run. Every finding below comes from the ${meta.short} scanner and matrix: the plan is complete and you can approve it.`,
            tone: "neutral",
          }
        : { title: "AI review off", body: `Every finding comes from the ${meta.short} scanner and matrix. The plan is complete without a model.`, tone: "neutral" };
  return (
    <section aria-live="polite" className="mt-6 flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 sm:flex-row sm:items-start sm:px-6">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface-2 text-fg-muted">
        {running ? <span className="pulse-soft"><Sparkles aria-hidden="true" className="size-5" /></span> : <Sparkles aria-hidden="true" className="size-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-md font-semibold text-fg">{content.title}</h2>
          {running ? <Spinner label="Reading…" className="text-xs" /> : null}
          {ai.status === "done" && (ai.added || ai.dropped) ? (
            <span className="text-xs text-fg-muted">
              {ai.added} added · {ai.dropped} unverified dropped
            </span>
          ) : null}
        </div>
        <p className="mt-1 max-w-3xl text-sm text-fg-muted">{content.body}</p>
        {ai.status === "failed" && ai.error ? (
          <details className="mt-2 text-xs text-fg-subtle">
            <summary className="cursor-pointer text-fg-muted hover:text-fg">Technical details</summary>
            <p className="mt-1.5 rounded-md bg-surface-2 px-3 py-2 font-mono break-words text-fg-muted">{ai.error}</p>
          </details>
        ) : null}
      </div>
      <p className="max-w-[16rem] text-xs text-fg-subtle sm:text-right">AI suggestions are only kept when their file, line and quoted evidence check out. They never land in the automatic group.</p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Search + filters + reset                                            */
/* ------------------------------------------------------------------ */
function Toolbar({ query, setQuery, groupFilter, setGroupFilter, decisionFilter, setDecisionFilter, shown, total, dirty, onReset, busy }) {
  const id = useId();
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor={`${id}-q`} className="sr-only">
          Search findings
        </label>
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
          <input id={`${id}-q`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, file, category…" className={`${controlClass} h-9 pl-9 text-sm`} />
        </div>
        <div className="flex items-center gap-2">
          <span id={`${id}-dec`} className="sr-only">
            Filter by decision
          </span>
          <Segmented
            size="sm"
            labelledBy={`${id}-dec`}
            value={decisionFilter}
            onChange={setDecisionFilter}
            className="w-full sm:w-auto [&>button]:min-w-fit"
            options={[
              { value: "all", label: "All" },
              { value: "approve", label: "Approved" },
              { value: "lock", label: "Locked" },
              { value: "manual", label: "Manual" },
            ]}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
        <span className="tabular-nums" role="status">
          Showing {shown} of {total} finding{total === 1 ? "" : "s"}
        </span>
        {groupFilter !== "all" ? (
          <button type="button" onClick={() => setGroupFilter("all")} className="inline-flex h-6 items-center gap-1 rounded-md border border-border-strong px-2 text-fg hover:bg-surface-2">
            {groups.find((g) => g.id === groupFilter)?.short} only <X aria-hidden="true" className="size-3" />
            <span className="sr-only">Clear group filter</span>
          </button>
        ) : null}
        {dirty ? (
          <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={onReset} disabled={busy}>
            <RotateCcw aria-hidden="true" /> Discard edits
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One group with bulk actions                                         */
/* ------------------------------------------------------------------ */
function GroupSection({ group, index, all, list, filtered, disabled, onChange, onBulk, originals, impact, technical, titleOf, focusId, fixProps }) {
  const bulkActions =
    group.id === "safe"
      ? [{ label: "Approve all", decision: "approve", icon: Check }]
      : group.id === "review"
        ? [
            { label: "Approve all", decision: "approve", icon: Check },
            { label: "Mark all manual", decision: "manual", icon: Hand },
          ]
        : [
            { label: "Lock all", decision: "lock", icon: LockKeyhole },
            { label: "All manual", decision: "manual", icon: Hand },
          ];
  const hasFocus = Boolean(focusId) && all.some((item) => item.id === focusId);
  const [userOpen, setUserOpen] = useState(null);
  // Open by default, except the long Automatic list. A search, filter or jump always opens the section.
  const open = userOpen ?? (group.open || filtered || hasFocus);
  const bodyId = `group-${group.id}-body`;
  return (
    <section id={`group-${group.id}`} aria-labelledby={`group-${group.id}-title`} className="scroll-mt-24">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setUserOpen(!open)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-left"
        >
          <span className={`grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface ${group.tone}`}>
            <group.icon aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span id={`group-${group.id}-title`} className="flex flex-wrap items-baseline gap-x-2 text-md font-semibold text-fg">
              {group.title}
              <span className="text-sm font-medium text-fg-muted tabular-nums">({all.length})</span>
            </span>
            <span className="mt-0.5 block text-sm leading-snug text-fg-muted">{group.description}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-fg-muted">
            <span className="hidden sm:inline">{open ? "Hide" : "Show"}</span>
            <ChevronDown aria-hidden="true" className={`size-5 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
          </span>
        </button>
        {open && all.length ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Bulk actions for ${group.short}`}>
            {bulkActions.map((action) => (
              <Button key={action.label} size="sm" variant="secondary" disabled={disabled} onClick={() => onBulk(all, action.decision)}>
                <action.icon aria-hidden="true" /> {action.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      {open ? (
      <Card id={bodyId} className="overflow-hidden">
        {!list.length ? (
          <p className="flex items-center gap-2.5 px-5 py-6 text-sm text-fg-muted sm:px-6">
            <Check aria-hidden="true" className="size-4 text-success" />
            {all.length && filtered ? "No findings match your filters in this group." : "No findings in this group."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((item) => (
              <li key={item.id} id={`item-${item.id}`} className="scroll-mt-28">
                <PlanItem
                  item={item}
                  original={originals.find((o) => o.id === item.id)}
                  onChange={(key, value) => onChange(item.id, key, value)}
                  disabled={disabled}
                  impact={impact?.items?.[item.id]}
                  technical={technical}
                  titleOf={titleOf}
                  focused={focusId === item.id}
                  fixProps={fixProps}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
      ) : null}
    </section>
  );
}

function PlanItem({ item, original, onChange, disabled, impact, technical, titleOf, focused, fixProps }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const sev = severity[item.severity] ?? severity.info;
  const canLock = canLockItem(item);
  const edited = original && (original.decision !== item.decision || original.note !== item.note);
  const location = item.file ? `${item.file}${item.line ? `:${item.line}` : ""}` : null;
  const explain = item.explain;
  const fixerReason = fixProps?.reasons?.[item.id];
  const fixedItem = isFixed(item);
  const headline = technical || !explain ? item.title : explain.plainTitle;
  useEffect(() => {
    if (focused) setOpen(true);
  }, [focused]);
  return (
    <article aria-labelledby={`${id}-title`} className={`relative px-4 py-4 sm:px-6 ${item.decision === "lock" ? "bg-accent-soft/40" : item.decision === "manual" ? "bg-warning-soft/40" : ""}`}>
      {edited ? <span aria-hidden="true" className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-accent" /> : null}
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-5">
        <div className="flex min-w-0 gap-3">
          <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border ${sev.chip}`} title={`${sev.label} severity`}>
            <sev.icon aria-hidden="true" className="size-4" />
            <span className="sr-only">{sev.label} severity</span>
          </span>
          <div className="min-w-0 flex-1">
            <h3 id={`${id}-title`} className="text-md leading-6 font-semibold break-words text-fg">
              {headline}
            </h3>
            {explain && !technical ? <p className="mt-1.5 text-base leading-relaxed text-fg-muted">{explain.inPlainWords}</p> : null}
            {fixerReason && !fixedItem ? (
              <p className="mt-2 text-sm leading-relaxed text-fg">
                <span className="font-semibold">Who fixes it: </span>
                <span className="text-fg-muted">{fixerReason}</span>
              </p>
            ) : null}
            {technical && explain && explain.plainTitle !== item.title ? <p className="mt-0.5 text-sm text-fg-muted">{explain.plainTitle}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <TierBadge item={item} />
              <FixerBadge item={item} />
              {location ? (
                <code className="code-chip" title={location}>
                  <FileCode2 aria-hidden="true" className="size-3 shrink-0" />
                  <span className="truncate">{location}</span>
                </code>
              ) : (
                <span className="code-chip">Project-wide</span>
              )}
              {item.files?.length > 1 ? <span className="code-chip">+{item.files.length - 1} file{item.files.length > 2 ? "s" : ""}</span> : null}
              {fixedItem ? null : explain ? <RiskChip risk={explain.riskIfSkipped} /> : <span className={`inline-flex h-5 items-center rounded-md border !border-transparent px-2 text-2xs font-medium ${sev.chip}`}>{sev.label}</span>}
              {technical ? <span className="font-mono text-2xs text-fg-subtle">{item.kind ?? item.category}</span> : null}
              {item.source === "ai" ? (
                <Pill icon={Sparkles} tone="accent" className="h-5 px-2 text-2xs">
                  AI-suggested
                </Pill>
              ) : null}
              {edited ? <span className="text-2xs font-medium text-accent">Edited</span> : null}
            </div>
            {item.note && !open ? <p className="mt-2 line-clamp-2 text-sm text-fg-muted"><span className="font-medium text-fg">Note:</span> {item.note}</p> : null}
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={`${id}-detail`} className="mt-2 inline-flex items-center gap-1 rounded text-sm font-medium text-accent hover:text-fg">
              <ChevronDown aria-hidden="true" className={`size-4 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
              {open ? "Hide explanation" : "Explain: why, what changes, and what if I don't approve"}
            </button>
          </div>
        </div>
        <div className="md:pt-0.5">
          <span id={`${id}-decision`} className="sr-only">
            Decision for {headline}
          </span>
          <Segmented size="sm" labelledBy={`${id}-decision`} value={item.decision} onChange={(value) => onChange("decision", value)} disabled={disabled} options={decisionOptions(canLock)} className="w-full md:w-auto [&>button]:min-w-fit" />
        </div>
      </div>
      <div className="md:ml-11">
        {fixedItem ? null : <ConsequenceCallout item={item} impact={impact} titleOf={titleOf} />}
        {fixProps ? (
          <FixCard
            item={item}
            record={fixProps.records.find((record) => record.fixId === item.aiFix?.fixId)}
            ai={fixProps.ai}
            fixability={fixProps.fixability}
            disabled={disabled}
            onAiFix={() => fixProps.onAiFix(item.id)}
            onKeep={() => fixProps.onKeep(item.aiFix.fixId)}
            onUndo={() => fixProps.onUndo(item.aiFix.fixId)}
          />
        ) : null}
      </div>
      {open ? (
        <div id={`${id}-detail`} className="mt-4 space-y-4 rounded-xl border border-border bg-surface/60 p-4 md:ml-11">
          {explain ? <ExplainDetail item={item} technical={technical} /> : null}
          {technical || !explain ? (
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-xs font-medium text-fg-subtle">Technical detail</p>
              {item.why ? <p className="text-sm leading-relaxed text-fg-muted">{item.why}</p> : null}
              {item.suggestion ? (
                <p className="text-sm text-fg-muted">
                  <span className="font-medium text-fg">Suggested action: </span>
                  {item.suggestion}
                </p>
              ) : null}
              {!explain && item.evidence ? (
                <pre className="overflow-x-auto rounded-lg border border-border bg-code px-3 py-2.5 font-mono text-xs text-code-fg">
                  {item.line ? <span className="mr-3 text-code-gutter select-none">{item.line}</span> : null}
                  <code>{item.evidence}</code>
                </pre>
              ) : null}
              <p className="font-mono text-2xs text-fg-subtle">
                {item.id} · {item.category} · severity {item.severity} · {item.source}
              </p>
            </div>
          ) : null}
          {item.aiComment ? (
            <p className="flex gap-2.5 rounded-lg border border-accent/25 bg-accent-soft px-3 py-2.5 text-sm text-fg">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
              <span>
                <span className="font-medium">AI-suggested note (not verified): </span>
                {item.aiComment}
              </span>
            </p>
          ) : null}
          {item.files?.length ? (
            <details className="text-sm text-fg-muted">
              <summary className="cursor-pointer hover:text-fg">Files {item.group === "auto" ? "touched" : "involved"} ({item.files.length})</summary>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {item.files.map((file) => (
                  <li key={file} className="code-chip max-w-full">
                    <span className="truncate">{file}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <div>
            <label htmlFor={`${id}-note`} className="mb-1.5 block text-xs font-medium text-fg-subtle">
              Note for the report (optional)
            </label>
            <input id={`${id}-note`} disabled={disabled} value={item.note} onChange={(e) => onChange("note", e.target.value)} className={`${controlClass} text-sm`} placeholder="Reason or follow-up, e.g. who owns this" />
          </div>
        </div>
      ) : null}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Explain like I'm new  /  Technical                                  */
/* ------------------------------------------------------------------ */
function ExplainMode({ technical, setTechnical }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-sm font-semibold text-fg">
          How should we explain things?
        </p>
        <p className="mt-0.5 text-xs text-fg-muted">{technical ? "Technical: original titles, rule ids, recipes and evidence." : "Explain like I'm new: plain words first, no jargon in the headlines."}</p>
      </div>
      <Segmented
        size="sm"
        labelledBy={`${id}-label`}
        value={technical ? "technical" : "simple"}
        onChange={(value) => setTechnical(value === "technical")}
        className="w-full shrink-0 sm:w-auto [&>button]:min-w-fit"
        options={[
          { value: "simple", label: "Explain like I'm new", icon: GraduationCap },
          { value: "technical", label: "Technical", icon: Terminal },
        ]}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Protected paths: chips + add                                        */
/* ------------------------------------------------------------------ */
function ProtectedPaths({ items, lockedPaths, setPaths, disabled }) {
  const [pattern, setPattern] = useState("");
  const [note, setNote] = useState("");
  const id = useId();
  const fromDecisions = [...new Set(items.filter((item) => item.decision !== "approve" && canLockItem(item)).flatMap((item) => (item.file ? [item.file] : item.files ?? [])))];
  const exists = lockedPaths.some((entry) => entry.pattern === pattern.trim());
  function add(event) {
    event?.preventDefault();
    if (!pattern.trim() || exists) return;
    setPaths([...lockedPaths, { pattern: pattern.trim(), note: note.trim() }]);
    setPattern("");
    setNote("");
  }
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span className="mt-px grid size-8 shrink-0 place-items-center rounded-lg border border-accent/30 bg-accent-soft text-accent">
          <LockKeyhole aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-md leading-6 font-semibold text-fg">Protected paths</h2>
          <p className="mt-0.5 text-sm text-fg-muted">Files, folders or globs no step may edit, AI fix-ups included.</p>
        </div>
      </div>
      <div className="space-y-4 p-5">
        {lockedPaths.length ? (
          <ul className="space-y-2" aria-label="Protected paths you added">
            {lockedPaths.map((entry, index) => (
              <li key={`${entry.pattern}-${index}`} className="min-w-0">
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border !border-transparent border-accent/35 bg-accent-soft py-1 pr-1 pl-2.5" title={entry.pattern}>
                  <LockKeyhole aria-hidden="true" className="size-3 shrink-0 text-accent" />
                  <span className="truncate font-mono text-xs text-fg">{entry.pattern}</span>
                  <button type="button" disabled={disabled} onClick={() => setPaths(lockedPaths.filter((_, n) => n !== index))} aria-label={`Remove protected path ${entry.pattern}`} className="grid size-5 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-surface hover:text-fg">
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </span>
                {entry.note ? <p className="mt-1 pl-2.5 text-xs break-words text-fg-muted">{entry.note}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border-strong px-3 py-3 text-sm text-fg-muted">No extra paths yet. Try <span className="font-mono text-xs text-fg">config/</span> or <span className="font-mono text-xs text-fg">src/generated/**</span>.</p>
        )}
        <form onSubmit={add} className="space-y-2.5">
          <label htmlFor={`${id}-path`} className="block text-sm font-medium text-fg">
            Add a path or glob
          </label>
          <div className="flex gap-2">
            <input id={`${id}-path`} value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="src/generated/**" spellCheck="false" autoComplete="off" className={`${controlClass} font-mono text-sm`} />
            <Button type="submit" size="icon" variant="secondary" disabled={!pattern.trim() || exists || disabled} aria-label="Add protected path">
              <Plus />
            </Button>
          </div>
          <label htmlFor={`${id}-note`} className="sr-only">
            Why keep it (optional)
          </label>
          <input id={`${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why keep it? (optional)" className={`${controlClass} text-sm`} />
          {exists ? <p className="text-xs text-warning">That path is already protected.</p> : <p className="text-xs text-fg-subtle">Press Enter to add.</p>}
        </form>
        {fromDecisions.length ? (
          <div className="border-t border-border pt-4">
            <p className="text-xs font-medium text-fg-subtle">Protected by your decisions ({fromDecisions.length})</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {fromDecisions.slice(0, 12).map((file) => (
                <li key={file} className="code-chip max-w-full">
                  <span className="truncate">{file}</span>
                </li>
              ))}
              {fromDecisions.length > 12 ? <li className="code-chip">+{fromDecisions.length - 12}</li> : null}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Sticky approval bar                                                 */
/* ------------------------------------------------------------------ */
function ApprovalBar({ willChange, locked, manual, paths, dirty, approved, wasApproved, aiRunning, busy, dryRun, actionError, impact, engineLabel, onSave, onStart }) {
  const facts = [
    { value: willChange, label: willChange === 1 ? "auto change" : "auto changes", short: "auto", icon: Zap, tone: "text-accent" },
    { value: locked, label: "locked", short: "locked", icon: LockKeyhole, tone: "text-accent" },
    { value: manual, label: "manual", short: "manual", icon: Hand, tone: "text-warning" },
    { value: paths, label: paths === 1 ? "protected path" : "protected paths", short: paths === 1 ? "path" : "paths", icon: ShieldCheck, tone: "text-success" },
  ];
  const status = aiRunning
    ? "The AI review is still running. Wait for it, or approve now and skip it."
    : dirty
      ? wasApproved
        ? "You edited an approved plan; approving again saves it."
        : "Unsaved edits are saved when you approve."
      : approved
        ? "Approved. Start the run whenever you are ready."
        : dryRun
          ? `${engineLabel ? `${engineLabel} runs ` : "Runs "}on a temporary copy. Your folder stays unchanged.`
          : "Changes your folder on a new migrate/… branch.";
  return (
    <div className="pointer-events-none sticky bottom-0 z-30 -mx-1 mt-10 pb-3 sm:pb-5">
      <div role="region" aria-label="Approve the plan" className="approval-bar pointer-events-auto flex flex-col gap-2.5 rounded-xl border border-border-strong p-2.5 shadow-pop sm:gap-3 sm:p-3.5 lg:flex-row lg:items-center lg:gap-5 lg:pl-5">
        <div className="min-w-0 flex-1">
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base sm:gap-x-5" aria-label="What will happen">
            {impact ? (
              <li className="inline-flex" title={`${impact.headline}. ${impact.label}`}>
                <span className="sr-only">Predicted outcome: </span>
                <OutcomeBadge impact={impact} size="sm" />
              </li>
            ) : null}
            {facts.map((fact) => (
              <li key={fact.label} className="inline-flex items-center gap-1.5 text-fg-muted">
                <fact.icon aria-hidden="true" className={`size-3.5 ${fact.tone}`} />
                <span className="font-semibold text-fg tabular-nums">{fact.value}</span>
                <span className="sm:hidden">{fact.short}</span>
                <span className="hidden sm:inline">{fact.label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 hidden truncate text-sm text-fg-muted sm:block" role="status">
            {actionError ? <span className="text-danger">{actionError.message}</span> : status}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {dirty ? (
            <Button onClick={onSave} disabled={Boolean(busy)} className="h-11 flex-1 lg:flex-none">
              {busy === "save" ? <Spinner label="Saving…" /> : <><Save aria-hidden="true" /> Save</>}
            </Button>
          ) : null}
          <Button variant="accent" size="lg" onClick={onStart} disabled={Boolean(busy)} className="flex-[2] lg:flex-none">
            {busy === "start" ? <Spinner label="Starting…" className="text-accent-fg" /> : <>{dryRun ? <FlaskConical aria-hidden="true" /> : <Play aria-hidden="true" />} {aiRunning && !approved ? "Skip AI review & start" : approved ? "Start" : "Approve & start"} with {engineLabel ?? "the engine"}{dryRun ? <span className="hidden font-normal opacity-80 sm:inline"> · dry run</span> : null}</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleCheck, FileCode2, ListChecks, LoaderCircle, PencilLine, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { Button, Card } from "./ui.jsx";

/**
 * Refactor quiz (plan mode). Optional code-quality refactors that run AFTER the upgrade as a
 * "Refactor" step. Questions, counts and files come from the server's scan of this project.
 * One question at a time; picks are saved on the plan as you go and shown again on reopen.
 */

const riskStyle = {
  low: { label: "Low risk", text: "text-success", bg: "bg-success-soft", dot: "bg-success" },
  medium: { label: "Medium risk", text: "text-warning", bg: "bg-warning-soft", dot: "bg-warning" },
  high: { label: "High risk", text: "text-danger", bg: "bg-danger-soft", dot: "bg-danger" },
};
const riskRank = { low: 1, medium: 2, high: 3 };

export function RiskPill({ risk, className = "" }) {
  const style = riskStyle[risk] ?? riskStyle.low;
  return (
    <span className={`inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-semibold tracking-wide ${style.bg} ${style.text} ${className}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

/** Non-"keep" picks and the highest risk among them. */
export function quizPicks(quiz, picks = quiz?.picks ?? {}) {
  const chosen = (quiz?.questions ?? []).flatMap((question) => {
    const answer = question.answers.find((entry) => entry.id === picks[question.id]);
    return answer && !answer.keep ? [{ question, answer }] : [];
  });
  const risk = chosen.reduce((top, entry) => (!top || riskRank[entry.answer.risk] > riskRank[top] ? entry.answer.risk : top), null);
  return { chosen, risk };
}

function Files({ files }) {
  if (!files?.length) return null;
  const shown = files.slice(0, 3);
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Files">
      {shown.map((file) => (
        <li key={file} title={file} className="inline-flex max-w-[16rem] items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
          <FileCode2 aria-hidden="true" className="size-3 shrink-0 text-fg-subtle" />
          <span className="truncate">{file.split("/").pop()}</span>
        </li>
      ))}
      {files.length > shown.length ? <li className="px-1 py-0.5 text-[11px] text-fg-subtle">+{files.length - shown.length} more</li> : null}
    </ul>
  );
}

function AnswerCard({ answer, selected, onSelect, tabIndex, onKeyDown, refCallback }) {
  return (
    <div
      ref={refCallback}
      role="radio"
      aria-checked={selected}
      tabIndex={tabIndex}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={`group relative cursor-pointer rounded-[10px] border p-4 text-left transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
        selected ? "border-accent bg-accent-soft/40 shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-accent)_14%,transparent)]" : "border-border bg-surface hover:-translate-y-px hover:border-border-strong hover:shadow-[0_6px_16px_-8px_rgb(16_24_40/0.18)]"
      }`}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={`mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border transition-colors ${selected ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-surface group-hover:border-fg-subtle"}`}>
          {selected ? <Check className="size-3" strokeWidth={3} /> : null}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <p className="text-sm font-semibold text-fg">{answer.label}</p>
            <RiskPill risk={answer.risk} />
          </div>
          {answer.keep ? null : <p className="mt-1.5 text-sm leading-relaxed text-fg">{answer.change}</p>}
          <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
            <span className="font-medium text-fg-muted">Why: </span>
            {answer.why}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-fg-subtle">
            <span className="font-medium">Migration risk: </span>
            {answer.riskReason}
          </p>
        </div>
      </div>
    </div>
  );
}

function QuestionStep({ question, picked, onPick, direction }) {
  const titleId = useId();
  const refs = useRef([]);
  const index = Math.max(0, question.answers.findIndex((answer) => answer.id === picked));
  useEffect(() => {
    refs.current = refs.current.slice(0, question.answers.length);
  }, [question.answers.length]);
  const move = (event, at) => {
    const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      onPick(question.answers[at].id);
      return;
    }
    if (!(event.key in keys)) return;
    event.preventDefault();
    const next = (at + keys[event.key] + question.answers.length) % question.answers.length;
    onPick(question.answers[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div key={question.id} className={direction < 0 ? "quiz-in-back" : "quiz-in"}>
      <p className="eyebrow text-accent">{question.topic}</p>
      <h3 id={titleId} className="mt-1.5 font-display text-[20px] leading-snug font-semibold tracking-tight text-fg">
        {question.question}
      </h3>
      <p className="mt-1.5 text-sm text-fg-muted">{question.context}</p>
      <Files files={question.files} />
      <div role="radiogroup" aria-labelledby={titleId} className="mt-5 grid gap-2.5">
        {question.answers.map((answer, at) => (
          <AnswerCard
            key={answer.id}
            answer={answer}
            selected={picked === answer.id}
            tabIndex={at === index ? 0 : -1}
            onSelect={() => onPick(answer.id)}
            onKeyDown={(event) => move(event, at)}
            refCallback={(node) => (refs.current[at] = node)}
          />
        ))}
      </div>
    </div>
  );
}

function Summary({ quiz, picks, ai, direction }) {
  const { chosen, risk } = quizPicks(quiz, picks);
  return (
    <div className={direction < 0 ? "quiz-in-back" : "quiz-in"}>
      <p className="eyebrow text-accent">Your picks</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        <h3 className="font-display text-[20px] leading-snug font-semibold tracking-tight text-fg">
          {chosen.length ? `${chosen.length} refactor${chosen.length === 1 ? "" : "s"} after the upgrade` : "No refactors picked"}
        </h3>
        {risk ? (
          <span className="inline-flex items-center gap-2 text-sm text-fg-muted">
            Overall <RiskPill risk={risk} />
          </span>
        ) : null}
      </div>
      <ul className="mt-4 divide-y divide-border overflow-hidden rounded-[10px] border border-border">
        {quiz.questions.map((question) => {
          const answer = question.answers.find((entry) => entry.id === picks[question.id]);
          return (
            <li key={question.id} className="flex items-center gap-3 bg-surface px-4 py-3">
              <span aria-hidden="true" className={`grid size-5 shrink-0 place-items-center rounded-full ${answer && !answer.keep ? "bg-accent-soft text-accent" : "bg-surface-2 text-fg-subtle"}`}>
                {answer && !answer.keep ? <Check className="size-3" strokeWidth={3} /> : <span className="size-1 rounded-full bg-current" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-fg-subtle">{question.topic}</p>
                <p className={`truncate text-sm font-medium ${answer && !answer.keep ? "text-fg" : "text-fg-muted"}`}>{answer ? answer.label : "Not answered (kept as is)"}</p>
              </div>
              {answer && !answer.keep ? <RiskPill risk={answer.risk} /> : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-fg-muted">
        <ListChecks aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
        <span>
          Runs as a <span className="font-medium text-fg">Refactor</span> step after the upgrade passes its tests, for Hybrid and Full AI. Build and tests run again; if they fail, the refactor is reverted and the upgrade stands.
          {ai?.configured === false ? " AI is not set up on this server, so the step will be skipped with a note until it is." : ""}
        </span>
      </p>
    </div>
  );
}

export default function RefactorQuiz({ plan, ai, disabled = false, onGenerate, onSave }) {
  const quiz = plan?.refactor ?? null;
  const [picks, setPicks] = useState(quiz?.picks ?? {});
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState("");
  const total = quiz?.questions?.length ?? 0;

  // A new or regenerated quiz from the server: start from its saved picks.
  const quizKey = quiz ? `${quiz.generatedAt}` : "";
  useEffect(() => {
    setPicks(quiz?.picks ?? {});
    const firstOpen = (quiz?.questions ?? []).findIndex((question) => !quiz.picks?.[question.id]);
    setStep(firstOpen < 0 ? total : firstOpen);
    setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizKey]);

  const summary = useMemo(() => quizPicks(quiz, quiz?.picks ?? {}), [quiz]);
  const run = async (kind, fn) => {
    setWorking(kind);
    try {
      await fn();
    } finally {
      setWorking("");
    }
  };
  const go = (next) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };
  const pick = (questionId, answerId) => setPicks((old) => ({ ...old, [questionId]: answerId }));
  const saveDraft = (next) => onSave({ status: "open", picks: next }, { quiet: true }).catch(() => undefined);
  const next = () => {
    saveDraft(picks);
    go(step + 1);
  };

  const shell = (children, { tight = false } = {}) => (
    <Card className="mt-6 overflow-hidden" aria-labelledby="refactor-quiz-title">
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-5 sm:px-6 ${tight ? "py-3" : "py-4"}`}>
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-[10px] bg-accent-soft text-accent">
          <Wand2 className="size-4" />
        </span>
        <div className="min-w-[min(100%,15rem)] flex-1 basis-60">
          <h2 id="refactor-quiz-title" className="font-display text-md font-semibold text-fg">
            Refactor quiz <span className="ml-1 align-middle text-xs font-medium text-fg-subtle">Optional</span>
          </h2>
          <p className="text-[13px] text-fg-muted">Improve code quality after the upgrade. Each answer shows what changes and its migration risk.</p>
        </div>
        {quiz && total ? (
          <span className="inline-flex items-center gap-1 text-xs text-fg-subtle" title={quiz.aiNote || undefined}>
            {quiz.source === "ai" ? <Sparkles aria-hidden="true" className="size-3.5 text-accent" /> : <FileCode2 aria-hidden="true" className="size-3.5" />}
            {quiz.source === "ai" ? "Worded by Grok from the scan" : "From a scan of your code"}
          </span>
        ) : null}
      </div>
      {children}
    </Card>
  );

  // 1. Not started yet.
  if (!quiz) {
    return shell(
      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-fg-muted">
          A few quick questions built from your own code: records, dead code, null handling, logging, deprecated APIs and more. Pick what you want; it runs as one verified step after the upgrade.
        </p>
        <Button variant="primary" onClick={() => run("generate", () => onGenerate(false))} disabled={disabled || Boolean(working)}>
          {working === "generate" ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Sparkles aria-hidden="true" />} {working === "generate" ? "Scanning your code…" : "Start the quiz"}
        </Button>
      </div>,
    );
  }

  // 2. Nothing found.
  if (!total) {
    return shell(
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
        <CircleCheck aria-hidden="true" className="size-4 text-success" />
        <p className="min-w-0 flex-1 text-sm text-fg-muted">The scan found nothing worth refactoring. Nothing is added to the plan.</p>
        <Button size="sm" variant="ghost" onClick={() => run("generate", () => onGenerate(true))} disabled={disabled || Boolean(working)}>
          <RotateCcw aria-hidden="true" /> Scan again
        </Button>
      </div>,
      { tight: true },
    );
  }

  // 3. Added or skipped, and not editing: compact state.
  if (!editing && (quiz.status === "added" || quiz.status === "skipped")) {
    const added = quiz.status === "added";
    return shell(
      <div className="px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          {added ? <CircleCheck aria-hidden="true" className="size-4 text-success" /> : <span aria-hidden="true" className="size-2 rounded-full bg-fg-subtle" />}
          <p className="min-w-0 flex-1 text-sm text-fg">
            {added
              ? summary.chosen.length
                ? `Refactor step added: ${summary.chosen.length} pick${summary.chosen.length === 1 ? "" : "s"}, after the upgrade.`
                : "Quiz answered: every topic kept as is, so no Refactor step."
              : "Quiz skipped. The upgrade runs without refactors."}
          </p>
          {summary.risk && added ? <RiskPill risk={summary.risk} /> : null}
          <Button size="sm" variant="secondary" onClick={() => { setEditing(true); go(added ? total : 0); }} disabled={disabled || Boolean(working)}>
            <PencilLine aria-hidden="true" /> {added ? "Edit answers" : "Take the quiz"}
          </Button>
        </div>
        {added && summary.chosen.length ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {summary.chosen.map(({ question, answer }) => (
              <li key={question.id} className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-2/60 py-1 pr-1.5 pl-2.5 text-xs text-fg">
                <span className="text-fg-subtle">{question.topic}</span> {answer.label}
                <RiskPill risk={answer.risk} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>,
      { tight: true },
    );
  }

  // 4. The quiz itself.
  const onSummary = step >= total;
  const current = quiz.questions[Math.min(step, total - 1)];
  const answered = quiz.questions.filter((question) => picks[question.id]).length;
  const progress = onSummary ? 100 : Math.round((step / total) * 100);
  return shell(
    <div>
      <div className="h-[3px] w-full bg-surface-2" role="progressbar" aria-label="Quiz progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={onSummary ? total : step}>
        <div className="h-full rounded-r-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${Math.max(progress, 4)}%` }} />
      </div>
      <div className="flex flex-wrap items-center gap-3 px-5 pt-4 sm:px-6">
        <p className="text-xs font-medium text-fg-subtle tabular-nums">{onSummary ? "Summary" : `Question ${step + 1} of ${total}`}</p>
        <ol className="flex items-center gap-1.5" aria-label="Questions">
          {quiz.questions.map((question, at) => {
            const done = Boolean(picks[question.id]);
            const active = at === step;
            return (
              <li key={question.id}>
                <button
                  type="button"
                  aria-label={`Question ${at + 1}: ${question.topic}${done ? " (answered)" : ""}`}
                  aria-current={active ? "step" : undefined}
                  onClick={() => go(at)}
                  className={`block h-1.5 rounded-full transition-all duration-300 ${active ? "w-5 bg-accent" : done ? "w-1.5 bg-accent/50 hover:bg-accent/70" : "w-1.5 bg-border-strong hover:bg-fg-subtle"}`}
                />
              </li>
            );
          })}
          <li>
            <button type="button" aria-label="Summary" aria-current={onSummary ? "step" : undefined} onClick={() => go(total)} className={`block h-1.5 rounded-full transition-all duration-300 ${onSummary ? "w-5 bg-accent" : "w-1.5 bg-border-strong hover:bg-fg-subtle"}`} />
          </li>
        </ol>
        <button
          type="button"
          className="ml-auto text-xs font-medium text-fg-subtle transition-colors hover:text-fg"
          disabled={Boolean(working)}
          onClick={() => run("skip", () => onSave({ status: "skipped", picks: {} }))}
        >
          Skip quiz
        </button>
      </div>
      <div className="px-5 pt-4 pb-5 sm:px-6">
        {onSummary ? <Summary quiz={quiz} picks={picks} ai={ai} direction={direction} /> : <QuestionStep key={current.id} question={current} picked={picks[current.id]} onPick={(answerId) => pick(current.id, answerId)} direction={direction} />}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-2/40 px-5 py-3 sm:px-6">
        <Button size="sm" variant="ghost" onClick={() => go(step - 1)} disabled={step === 0}>
          <ArrowLeft aria-hidden="true" /> Back
        </Button>
        <span className="text-xs text-fg-subtle tabular-nums">{answered}/{total} answered</span>
        <div className="ml-auto flex items-center gap-2">
          {onSummary ? (
            <Button variant="primary" size="sm" disabled={disabled || Boolean(working)} onClick={() => run("add", async () => { await onSave({ status: "added", picks }); setEditing(false); })}>
              {working === "add" ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />} Add to plan
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={next} disabled={!picks[current.id]}>
              {step === total - 1 ? "Review picks" : "Next"} <ArrowRight aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </div>,
  );
}

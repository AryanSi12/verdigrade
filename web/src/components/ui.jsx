import { ChevronRight } from "lucide-react";
import { Link as RouterLink } from "react-router";
import { AlertTriangle, Check, CircleDashed, CircleMinus, Inbox, LoaderCircle, RefreshCw, X } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Buttons: one height per size, icon and label always centered.       */
/* ------------------------------------------------------------------ */
const buttonBase =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium leading-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:translate-y-px active:scale-[0.985] motion-reduce:active:transform-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

const buttonSizes = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-3.5 text-[13.5px]",
  lg: "h-9 px-4 text-[13.5px]",
  icon: "size-9",
  "icon-sm": "size-8",
};

const buttonVariants = {
  primary: "bg-primary text-primary-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.1)] hover:bg-primary-hover",
  accent: "bg-accent text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-accent-hover",
  secondary: "border border-border bg-surface text-fg hover:border-border-strong hover:bg-surface-2",
  ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
  danger: "border border-border bg-surface text-danger hover:border-danger/40 hover:bg-danger-soft",
};

export function buttonClass({ variant = "secondary", size = "md", className = "" } = {}) {
  return `${buttonBase} ${buttonSizes[size]} ${buttonVariants[variant]} ${className}`;
}

export function Button({ variant, size, className, type = "button", ...props }) {
  return <button type={type} className={buttonClass({ variant, size, className })} {...props} />;
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */
export function Card({ as: Tag = "div", className = "", interactive = false, ...props }) {
  return (
    <Tag
      className={`card-rich rounded-[10px] border border-border bg-surface shadow-card ${interactive ? "spotlight lift hover:border-border-strong" : ""} ${className}`}
      {...props}
    />
  );
}

export function CardHeader({ title, description, action = null, icon: Icon = null, className = "" }) {
  return (
    <div className={`flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6 ${className}`}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <Icon aria-hidden="true" className="mt-1 size-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
        ) : null}
        <div className="min-w-0">
          <h2 className="font-display text-[15px] leading-6 font-semibold tracking-[-0.015em] text-fg">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Editorial section opener: mono index label, big tight heading, optional lede and action. */
export function SectionHeading({ index = null, eyebrow, title, description, action = null, className = "" }) {
  return (
    <div className={`reveal mb-8 grid gap-5 md:mb-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-end ${className}`}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="eyebrow flex items-center gap-3">
            {index ? <span className="text-accent">{index}</span> : null}
            {index ? <span aria-hidden="true" className="h-px w-8 bg-border-strong" /> : null}
            <span>{eyebrow}</span>
          </p>
        ) : null}
        <h2 className="display-md mt-4 text-display">{title}</h2>
        {description ? <p className="lede mt-4 max-w-2xl">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */
const tone = {
  waiting: "border-transparent bg-surface-2 text-fg-subtle",
  running: "border-transparent bg-info-soft text-info",
  passed: "border-transparent bg-success-soft text-success",
  failed: "border-transparent bg-danger-soft text-danger",
  skipped: "border-transparent bg-surface-2 text-fg-subtle",
  neutral: "border-transparent bg-surface-2 text-fg-muted",
  accent: "border-transparent bg-accent-soft text-accent",
  warning: "border-transparent bg-warning-soft text-warning",
};

const statusIcon = { waiting: CircleDashed, running: LoaderCircle, passed: Check, failed: X, skipped: CircleMinus };
const statusWord = { waiting: "Waiting", running: "Running", passed: "Passed", failed: "Failed", skipped: "Skipped" };

export function Pill({ tone: name = "neutral", icon: Icon = null, children, className = "", mono = false, title }) {
  return (
    <span
      title={title}
      className={`inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs leading-none font-medium whitespace-nowrap ${mono ? "font-mono" : ""} ${tone[name] ?? tone.neutral} ${className}`}
    >
      {Icon ? <Icon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
      {children}
    </span>
  );
}

const dotColor = { waiting: "bg-fg-subtle/50", running: "bg-info", passed: "bg-success", failed: "bg-danger", skipped: "bg-fg-subtle/50", warning: "bg-warning", accent: "bg-accent", neutral: "bg-fg-subtle/50" };
const dotText = { waiting: "text-fg-muted", running: "text-info", passed: "text-success", failed: "text-danger", skipped: "text-fg-muted", warning: "text-warning", accent: "text-accent", neutral: "text-fg-muted" };

/** Status as a small dot plus text; no filled badge. */
export function StatusPill({ status, label }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs leading-none font-medium whitespace-nowrap ${dotText[status] ?? "text-fg-muted"}`}>
      <span className="relative flex size-1.5">
        {status === "running" ? <span className="pulse-soft absolute inline-flex size-full scale-[2.2] rounded-full bg-current opacity-25" /> : null}
        <span className={`relative inline-flex size-1.5 rounded-full ${dotColor[status] ?? dotColor.waiting}`} />
      </span>
      {label ?? statusWord[status] ?? status}
    </span>
  );
}

/** Same dot + text, for any tone (used for page-level status). */
export function StatusText({ tone: name = "neutral", children, className = "" }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-2 text-[13px] leading-none font-medium whitespace-nowrap ${dotText[name] ?? "text-fg-muted"} ${className}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dotColor[name] ?? dotColor.neutral}`} />
      {children}
    </span>
  );
}

export function StatusDot({ status, size = "md" }) {
  const Icon = statusIcon[status] ?? CircleDashed;
  const box = size === "sm" ? "size-6" : "size-7";
  return (
    <span className={`grid ${box} shrink-0 place-items-center rounded-full ${tone[status] ?? tone.waiting}`}>
      <Icon aria-hidden="true" className={`size-3.5 ${status === "running" ? "animate-spin" : ""}`} strokeWidth={2.25} />
      <span className="sr-only">{statusWord[status] ?? status}</span>
    </span>
  );
}

export function Spinner({ label = "Loading…", className = "" }) {
  return (
    <span role="status" className={`inline-flex items-center gap-2 text-sm leading-none text-fg-muted ${className}`}>
      <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin" />
      {label}
    </span>
  );
}

export function Skeleton({ className = "" }) {
  return <span aria-hidden="true" className={`skeleton block rounded-md ${className}`} />;
}

export function EmptyState({ title, children, action = null, icon: Icon = Inbox }) {
  return (
    <div className="relative flex flex-col items-center gap-3 overflow-hidden rounded-[10px] border border-dashed border-border px-6 py-12 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-fg-subtle">
        <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
      </span>
      <p className="relative font-display text-[15px] font-semibold text-fg">{title}</p>
      {children ? <div className="relative max-w-md text-sm text-fg-muted">{children}</div> : null}
      {action ? <div className="relative">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry, compact = false }) {
  const message = error?.message || String(error || "Something went wrong.");
  return (
    <div role="alert" className={`flex items-start gap-3 rounded-lg border border-danger/30 bg-danger-soft text-danger ${compact ? "px-3 py-2.5" : "px-4 py-3"}`}>
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0 flex-1 text-sm break-words">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-danger/30 px-2.5 text-xs leading-none font-medium hover:bg-danger/10">
          <RefreshCw aria-hidden="true" className="size-3.5" /> Retry
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Data display                                                        */
/* ------------------------------------------------------------------ */
export function StatCard({ label, value, hint, icon: Icon = null, tone: name = null, mono = false }) {
  const valueTone = name === "success" ? "text-success" : name === "danger" ? "text-danger" : "text-fg";
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface-2/50 px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-fg-subtle">
        {Icon ? <Icon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
        <span className="truncate">{label}</span>
      </div>
      <div className={`mt-1.5 truncate text-lg font-semibold tracking-tight tabular-nums ${mono ? "text-md" : ""} ${valueTone}`} title={String(value)}>
        {value}
      </div>
      {hint ? <div className="mt-0.5 truncate text-xs text-fg-subtle tabular-nums">{hint}</div> : null}
    </div>
  );
}

export function Kbd({ children }) {
  return <kbd className="inline-flex h-5 items-center rounded border border-border bg-surface-2 px-1.5 font-mono text-2xs leading-none text-fg-muted">{children}</kbd>;
}

/* ------------------------------------------------------------------ */
/* Form controls                                                       */
/* ------------------------------------------------------------------ */
export const controlClass =
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-base text-fg shadow-xs transition-[border-color,box-shadow] duration-150 placeholder:text-fg-subtle hover:border-border-strong focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none disabled:opacity-60";

export function Field({ label, hint, children, htmlFor }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

export function Select({ className = "", children, ...props }) {
  return (
    <select className={`select ${controlClass} ${className}`} {...props}>
      {children}
    </select>
  );
}

/**
 * Segmented control: a radio group that looks like a toggle bar.
 * Keyboard: one tab stop (the checked option); arrow keys / Home / End move and select, skipping disabled options.
 * Options may carry `disabled`, `icon`, `title` and an `activeClass` to tint the selected state.
 */
export function Segmented({ label, labelledBy, value, onChange, options, size = "md", className = "", disabled = false }) {
  const height = size === "sm" ? "h-8" : "h-9";
  const enabled = options.filter((option) => !option.disabled && !disabled);
  const focusable = enabled.some((option) => option.value === value) ? value : enabled[0]?.value;
  function onKeyDown(event) {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(event.key in keys) && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (!enabled.length) return;
    const at = Math.max(0, enabled.findIndex((option) => option.value === value));
    const next = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 : (at + keys[event.key] + enabled.length) % enabled.length;
    onChange(enabled[next].value);
    const group = event.currentTarget;
    requestAnimationFrame(() => group.querySelector(`[data-value="${CSS.escape(String(enabled[next].value))}"]`)?.focus());
  }
  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      className={`inline-flex ${height} max-w-full items-stretch rounded-md border border-border bg-surface-2 p-0.5 ${className}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        const off = disabled || option.disabled;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            data-value={option.value}
            aria-checked={active}
            aria-disabled={off || undefined}
            tabIndex={option.value === focusable && !off ? 0 : -1}
            onClick={() => (off ? null : onChange(option.value))}
            title={option.title}
            className={`inline-flex min-w-fit flex-1 items-center justify-center gap-1.5 rounded-[5px] px-3 text-sm leading-none font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-150 ${
              active ? option.activeClass || "bg-surface text-fg shadow-xs ring-1 ring-border-strong/60" : off ? "cursor-not-allowed text-fg-subtle line-through decoration-fg-subtle/50" : "text-fg-muted hover:text-fg"
            }`}
          >
            {Icon ? <Icon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, id, label }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150 ${checked ? "border-accent bg-accent" : "border-border-strong bg-surface-3"}`}
    >
      <span className={`absolute size-4 rounded-full bg-white shadow-xs transition-transform duration-150 ${checked ? "translate-x-[17px]" : "translate-x-px"}`} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Page header and KPI tiles (round 6 shell)                           */
/* ------------------------------------------------------------------ */

/** Breadcrumb, a 28px title with an optional subtitle, and right-aligned actions. */
export function ContentHeader({ crumbs = [], title, subtitle = null, meta = null, actions = null, className = "" }) {
  return (
    <header className={`flex flex-col gap-4 md:flex-row md:items-end md:justify-between ${className}`}>
      <div className="min-w-0">
        {crumbs.length ? (
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs font-medium text-fg-subtle">
            {crumbs.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="inline-flex items-center gap-1">
                {index ? <ChevronRight aria-hidden="true" className="size-3.5" /> : null}
                {crumb.to ? (
                  <RouterLink to={crumb.to} className="hover:text-fg">
                    {crumb.label}
                  </RouterLink>
                ) : (
                  <span className={crumb.mono ? "font-mono" : ""}>{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="mt-2 font-display text-[26px] leading-8 font-semibold tracking-[-0.02em] break-words text-fg">{title}</h1>
        {subtitle ? <div className="mt-1.5 text-sm text-fg-muted">{subtitle}</div> : null}
        {meta ? <div className="mt-1">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

const kpiTone = { success: "text-success", danger: "text-danger", warning: "text-warning", accent: "text-accent" };

/** A grid of big-number tiles: 32px value, tiny uppercase label, optional hint. */
export function KpiGrid({ items, className = "" }) {
  const cols = items.length >= 5 ? "lg:grid-cols-5" : items.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3";
  return (
    <dl className={`grid grid-cols-2 gap-4 sm:grid-cols-3 ${cols} ${className}`}>
      {items.map((item) => (
        <div key={item.label} className="kpi-tile min-w-0 rounded-[10px] bg-surface px-5 py-4 shadow-card" title={item.title}>
          <dt className="kpi-label">{item.label}</dt>
          <dd className={`kpi-value mt-1.5 truncate ${typeof item.value === "string" && /[a-z]/i.test(item.value) && item.value.length > 6 ? "kpi-value-word" : ""} ${kpiTone[item.tone] ?? "text-fg"}`}>{item.value}</dd>
          {item.hint ? <dd className="mt-1 truncate text-xs text-fg-subtle">{item.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

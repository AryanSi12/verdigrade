import { ecosystemOf } from "../ecosystems.js";

/**
 * Simple original glyphs for each language adapter (not the vendors' logos):
 * Java is a steaming cup, Node is a hexagon with a node dot, Python is a coiled snake.
 */
export function LangGlyph({ ecosystem, className = "size-4" }) {
  if (ecosystem === "python") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <path d="M17.5 5.5c-1.2-1.4-3-2-5.2-2-3.1 0-5.3 1.6-5.3 4 0 2.2 1.8 3.3 5 4.1 3.3.8 5.3 1.9 5.3 4.4 0 2.5-2.3 4.5-5.6 4.5-2.3 0-4.3-.8-5.6-2.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="16.2" cy="5.9" r="1.05" fill="currentColor" />
        <path d="M6.1 18.2 4.6 19.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (ecosystem === "node") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <path d="M12 2.6 20.2 7.3v9.4L12 21.4 3.8 16.7V7.3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M9 9.2v5.6M9 9.2l6 5.6M15 9.2v5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M5 10h11v4.5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 14.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M16 11.2h1.3a2.3 2.3 0 0 1 0 4.6H16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8.6 3.5c-.9 1 .9 2 0 3M12.2 3.5c-.9 1 .9 2 0 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 21h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export const langTones = {
  java: "border-warning/30 bg-warning-soft text-warning",
  node: "border-success/30 bg-success-soft text-success",
  python: "border-info/30 bg-info-soft text-info",
};

/** Language pill: glyph + short name ("Java", "Node"), or the long label with `long`. */
const glyphTones = { java: "text-warning", node: "text-success", python: "text-info" };

/** Language label: a tinted glyph plus the short name ("Java", "Node"), or the long label with `long`. No filled badge. */
export default function LangBadge({ ecosystem, long = false, className = "" }) {
  const meta = ecosystemOf(ecosystem);
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 text-[13px] leading-none font-medium whitespace-nowrap text-fg-muted ${className.replace(/\b(h-\S+|px-\S+)\b/g, "")}`}>
      <LangGlyph ecosystem={meta.id} className={`size-3.5 shrink-0 ${glyphTones[meta.id] ?? ""}`} />
      {long ? meta.label : meta.short}
    </span>
  );
}

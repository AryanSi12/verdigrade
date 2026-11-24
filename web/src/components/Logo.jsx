/**
 * Verdigrade mark: a hexagon tile (the verdigris patina) with three rising bars
 * on an amber base line (the upgrade, one grade at a time). Uses the theme's
 * primary colours, so it keeps its contrast in light and dark and at 16-20px.
 */
export default function Logo({ className = "size-7" }) {
  return (
    <svg viewBox="0 0 64 64" className={`shrink-0 ${className}`} aria-hidden="true">
      <path d="M32 4 L56 18 V46 L32 60 L8 46 V18 Z" fill="var(--lf-primary)" />
      <rect x="18" y="36" width="7" height="10" rx="2" fill="var(--lf-primary-fg)" fillOpacity="0.5" />
      <rect x="28.5" y="29" width="7" height="17" rx="2" fill="var(--lf-primary-fg)" fillOpacity="0.78" />
      <rect x="39" y="20" width="7" height="26" rx="2" fill="var(--lf-primary-fg)" />
      <rect x="18" y="49" width="28" height="2.6" rx="1.3" fill="#ffc53d" />
    </svg>
  );
}

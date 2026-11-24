/** Edge-masked ribbon that scrolls a list forever (paused on hover and under prefers-reduced-motion). */
export default function Marquee({ items, label }) {
  if (!items?.length) return null;
  const row = (hidden) => (
    <ul className="flex shrink-0 items-center gap-10 pr-10" aria-hidden={hidden || undefined}>
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex items-center gap-10 font-mono text-xs whitespace-nowrap text-fg-muted">
          <span>{item}</span>
          <span aria-hidden="true" className="size-1 rounded-full bg-accent" />
        </li>
      ))}
    </ul>
  );
  return (
    <div className="marquee overflow-hidden py-4" aria-label={label} role="region">
      <div className="marquee-track">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

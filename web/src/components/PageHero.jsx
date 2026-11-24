import HeroArt from "../art/HeroArt.jsx";

/**
 * Editorial hero: an oversized, tightly tracked headline across the full width, then copy + actions on the left
 * and the pipeline artwork framed as a product window on the right. A mesh glow sits behind it.
 */
export default function PageHero({ eyebrow, title, summary, actions = null, aside = null, meta = null, windowTitle = "migrate/java21-boot4 — pipeline" }) {
  return (
    <section className="relative isolate pt-6 sm:pt-10">
      <div aria-hidden="true" className="mesh pointer-events-none absolute -inset-x-24 -top-32 -z-10 h-[34rem] opacity-80" />

      <div className="reveal flex flex-wrap items-center gap-x-4 gap-y-2">
        {eyebrow ? (
          <span className="surface-glass inline-flex h-8 items-center gap-2 rounded-full border border-border-strong px-3.5 text-xs leading-none font-medium text-fg-muted">
            <span className="bg-gradient-accent size-1.5 rounded-full" />
            {eyebrow}
          </span>
        ) : null}
        {meta}
      </div>

      <h1 className="reveal display-xl mt-7 max-w-[15ch] text-display sm:mt-9" style={{ "--reveal-delay": "80ms" }}>
        {title}
      </h1>

      <div className="mt-10 grid items-start gap-10 lg:mt-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
        <div className="reveal flex min-w-0 flex-col gap-7" style={{ "--reveal-delay": "160ms" }}>
          {summary ? <p className="lede max-w-md">{summary}</p> : null}
          {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
          {aside}
        </div>
        <figure className="reveal window grain relative overflow-hidden rounded-2xl border border-border-strong shadow-pop" style={{ "--reveal-delay": "240ms" }}>
          <figcaption className="flex h-10 items-center gap-2 border-b border-border px-4">
            <span aria-hidden="true" className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-fg/15" />
              <span className="size-2.5 rounded-full bg-fg/15" />
              <span className="size-2.5 rounded-full bg-fg/15" />
            </span>
            <span className="ml-2 truncate font-mono text-xs text-fg-muted">{windowTitle}</span>
          </figcaption>
          <div aria-hidden="true" className="dot-grid pointer-events-none absolute inset-0 top-10" />
          <div className="relative z-[2] px-3 py-4 sm:px-6">
            <HeroArt className="mx-auto h-auto w-full max-w-[34rem]" />
          </div>
        </figure>
      </div>
    </section>
  );
}

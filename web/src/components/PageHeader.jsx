import { BeamStrip } from "../art/FeatureArt.jsx";

/** Inner-page header: mono eyebrow, a large tight title and a lede, with a beam-line artwork panel on the right. */
export default function PageHeader({ eyebrow, icon: Icon = null, title, summary, children = null }) {
  return (
    <header className="relative isolate mb-10 pt-6 sm:mb-14 sm:pt-10">
      <div aria-hidden="true" className="mesh pointer-events-none absolute -top-28 -right-24 -z-10 h-[24rem] w-[70%] opacity-70" />
      <div className="grid items-end gap-8 md:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="reveal flex min-w-0 flex-col">
          {eyebrow ? (
            <p className="eyebrow flex items-center gap-2.5">
              {Icon ? <Icon aria-hidden="true" className="size-3.5 text-accent" /> : null}
              {eyebrow}
            </p>
          ) : null}
          <h1 className="display-lg mt-5 max-w-[18ch] text-display">{title}</h1>
          {summary ? <p className="lede mt-5 max-w-2xl">{summary}</p> : null}
          {children}
        </div>
        <div className="reveal window grain relative hidden overflow-hidden rounded-2xl border border-border-strong shadow-card md:block" style={{ "--reveal-delay": "120ms" }}>
          <div aria-hidden="true" className="dot-grid pointer-events-none absolute inset-0" />
          <BeamStrip className="relative h-36 w-full" />
        </div>
      </div>
    </header>
  );
}

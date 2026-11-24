/**
 * Original hero backdrop: a field of version "ticks". Short grey ticks on the left (legacy builds) rise into
 * tall accent ticks on the right (migrated builds); a soft scan band sweeps across like a pipeline pass.
 * Inspired by the tick-mark system on DeepBook (Awwwards SOTD, Nov 2026), drawn from scratch as one SVG.
 */
const COUNT = 132;
const W = 1200;
const H = 240;

function heights() {
  const out = [];
  for (let i = 0; i < COUNT; i += 1) {
    const t = i / (COUNT - 1);
    const rise = 0.18 + 0.62 * (1 / (1 + Math.exp(-(t - 0.58) * 11)));
    const wave = 0.07 * Math.sin(i * 0.55) + 0.05 * Math.sin(i * 0.17 + 1.3);
    out.push(Math.max(0.06, Math.min(1, rise + wave)));
  }
  return out;
}

const TICKS = heights();

export default function TickField({ className = "" }) {
  const gap = W / COUNT;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="tick-accent" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--lf-beam-1)" />
          <stop offset="0.55" stopColor="var(--lf-accent)" />
          <stop offset="1" stopColor="var(--lf-beam-2)" />
        </linearGradient>
        <linearGradient id="tick-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="tick-right" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.35" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.85" stopColor="#fff" stopOpacity="0.85" />
        </linearGradient>
        <mask id="tick-scan-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
          <rect width={W} height={H} fill="url(#tick-right)" />
          <rect className="tick-scan" x="0" y="0" width={W * 0.28} height={H} fill="url(#tick-fade)" />
        </mask>
      </defs>
      <g stroke="var(--lf-border-strong)" strokeWidth="2" strokeLinecap="round">
        {TICKS.map((h, i) => (
          <line key={i} x1={i * gap + gap / 2} x2={i * gap + gap / 2} y1={H - 4} y2={H - 4 - h * (H - 16)} />
        ))}
      </g>
      <g stroke="url(#tick-accent)" strokeWidth="2" strokeLinecap="round" mask="url(#tick-scan-mask)">
        {TICKS.map((h, i) => (
          <line key={i} x1={i * gap + gap / 2} x2={i * gap + gap / 2} y1={H - 4} y2={H - 4 - h * (H - 16)} />
        ))}
      </g>
    </svg>
  );
}

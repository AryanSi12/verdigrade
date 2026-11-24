/**
 * Original hero artwork: the plan-first migration flow as a beam-line diagram.
 * Java and Node projects feed a read-only plan the reviewer approves, then the rewrite engine
 * (OpenRewrite recipes · codemods) emits the upgraded versions. The step rail sits below.
 * Pure SVG; light pulses are dash animations and stop under prefers-reduced-motion.
 */
const node = { fill: "var(--lf-elevated)", stroke: "var(--lf-border-strong)" };
const sans = { fontFamily: "var(--font-sans)" };
const mono = { fontFamily: "var(--font-mono)" };

function Chip({ x, y, w = 136, label, sub, tone = "from" }) {
  const dot = tone === "to" ? "var(--lf-success)" : "var(--lf-fg-subtle)";
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={w} height="52" rx="12" {...node} />
      <rect x="0.5" y="0.5" width={w - 1} height="20" rx="11.5" fill="url(#hero-sheen)" />
      <circle cx="18" cy="26" r="4" fill={dot} />
      {tone === "to" ? <circle cx="18" cy="26" r="8" fill={dot} opacity="0.18" /> : null}
      <text x="32" y="24" fontSize="13.5" fontWeight="600" fill="var(--lf-fg)" style={sans}>
        {label}
      </text>
      <text x="32" y="40" fontSize="10" fill="var(--lf-fg-subtle)" style={mono}>
        {sub}
      </text>
    </g>
  );
}

const steps = ["plan", "approve", "rewrite", "test", "report"];

export default function HeroArt({ className = "" }) {
  const rails = [
    { d: "M152 86 C 166 86, 158 158, 172 158", color: "var(--lf-beam-1)", delay: "0s" },
    { d: "M152 276 C 166 276, 158 202, 172 202", color: "var(--lf-beam-1)", delay: "-1.6s" },
    { d: "M266 180 L 292 180", color: "var(--lf-accent)", delay: "-1.2s" },
    { d: "M392 160 C 410 160, 410 86, 428 86", color: "var(--lf-beam-2)", delay: "-0.8s" },
    { d: "M392 200 C 410 200, 410 276, 428 276", color: "var(--lf-beam-2)", delay: "-2.4s" },
  ];
  const planRows = [
    { y: 152, w: 46, color: "var(--lf-accent)", label: "auto" },
    { y: 170, w: 34, color: "var(--lf-warning)", label: "review" },
    { y: 188, w: 26, color: "var(--lf-danger)", label: "manual" },
  ];
  return (
    <svg viewBox="0 0 580 400" className={className} role="img" aria-labelledby="hero-art-title">
      <title id="hero-art-title">
        Flow diagram: Java 8 / Spring Boot 2.7 and Node 18 / TypeScript 4.9 projects go through a plan you approve, then recipes and codemods, to Java 21 / Boot 4 and Node 24 / TypeScript 6
      </title>
      <defs>
        <linearGradient id="hero-engine-stroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--lf-beam-1)" />
          <stop offset="0.5" stopColor="var(--lf-accent)" />
          <stop offset="1" stopColor="var(--lf-beam-2)" />
        </linearGradient>
        <linearGradient id="hero-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.06" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="hero-engine-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="var(--lf-accent)" stopOpacity="0.42" />
          <stop offset="1" stopColor="var(--lf-accent)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hero-rail-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--lf-border-strong)" stopOpacity="0" />
          <stop offset="0.12" stopColor="var(--lf-border-strong)" />
          <stop offset="0.88" stopColor="var(--lf-border-strong)" />
          <stop offset="1" stopColor="var(--lf-border-strong)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {rails.map((rail) => (
        <g key={rail.d}>
          <path d={rail.d} fill="none" stroke="var(--lf-border-strong)" strokeWidth="1.25" />
          <path d={rail.d} className="beam beam-glow" stroke={rail.color} strokeWidth="2.25" style={{ color: rail.color, animationDelay: rail.delay }} />
        </g>
      ))}

      {/* plan gate: a read-only checklist the reviewer approves */}
      <g>
        <rect x="172" y="120" width="94" height="120" rx="18" fill="var(--lf-elevated)" stroke="var(--lf-border-strong)" />
        <rect x="172.75" y="120.75" width="92.5" height="32" rx="17" fill="url(#hero-sheen)" />
        <text x="186" y="141" fontSize="11" fontWeight="600" fill="var(--lf-fg)" style={sans}>
          Plan
        </text>
        <rect x="236" y="131" width="18" height="14" rx="4" fill="none" stroke="var(--lf-fg-subtle)" strokeWidth="1.2" />
        <path d="M241 131 v-2.5 a4 4 0 0 1 8 0 V131" fill="none" stroke="var(--lf-fg-subtle)" strokeWidth="1.2" />
        {planRows.map((row) => (
          <g key={row.label}>
            <circle cx="190" cy={row.y + 3} r="3" fill={row.color} />
            <rect x="200" y={row.y} width={row.w} height="6" rx="3" fill={row.color} opacity="0.85" />
          </g>
        ))}
        <rect x="182" y="206" width="74" height="22" rx="11" fill="var(--lf-success-soft)" stroke="var(--lf-success)" strokeOpacity="0.45" />
        <path d="M193 217 l3 3 l6 -6.5" fill="none" stroke="var(--lf-success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <text x="207" y="221" fontSize="9.5" fontWeight="600" fill="var(--lf-success)" style={sans}>
          approved
        </text>
      </g>

      {/* engine */}
      <circle cx="342" cy="180" r="74" fill="url(#hero-engine-glow)" />
      <circle className="spin-slow" cx="342" cy="180" r="62" fill="none" stroke="var(--lf-border-strong)" strokeDasharray="1.5 7" />
      <g className="float-slow">
        <rect x="292" y="134" width="100" height="92" rx="22" fill="var(--lf-elevated)" stroke="url(#hero-engine-stroke)" strokeWidth="1.5" />
        <rect x="292.75" y="134.75" width="98.5" height="34" rx="21" fill="url(#hero-sheen)" />
        <rect x="312" y="156" width="36" height="5" rx="2.5" fill="var(--lf-beam-1)" />
        <rect x="312" y="167" width="50" height="5" rx="2.5" fill="var(--lf-accent)" opacity="0.9" />
        <rect x="312" y="178" width="28" height="5" rx="2.5" fill="var(--lf-beam-2)" opacity="0.85" />
        <path d="M348 180 l5 5 l10 -11" fill="none" stroke="var(--lf-success)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <text x="342" y="206" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--lf-fg)" style={sans}>
          Rewrite
        </text>
        <text x="342" y="218" textAnchor="middle" fontSize="8.5" fill="var(--lf-fg-subtle)" style={mono}>
          recipes · codemods
        </text>
      </g>

      <Chip x={16} y={60} label="Java 8" sub="boot 2.7 · javax" />
      <Chip x={16} y={250} label="Node 18" sub="ts 4.9 · express 4" />
      <Chip x={428} y={60} label="Java 21" sub="boot 4 · jakarta" tone="to" />
      <Chip x={428} y={250} label="Node 24" sub="ts 6 · express 5" tone="to" />

      {/* step rail */}
      <path d="M342 226 C342 300, 290 290, 290 334" fill="none" stroke="var(--lf-border-strong)" strokeDasharray="2 4" />
      <path d="M219 240 C219 300, 194 290, 194 334" fill="none" stroke="var(--lf-border-strong)" strokeDasharray="2 4" />
      <path d="M60 348 L532 348" fill="none" stroke="url(#hero-rail-fade)" strokeWidth="1.25" />
      <path d="M60 348 L532 348" className="beam beam-glow" stroke="var(--lf-accent)" strokeWidth="2" style={{ color: "var(--lf-accent)", animationDuration: "4.2s" }} />
      {steps.map((step, index) => {
        const cx = 98 + index * 96;
        const human = step === "approve";
        return (
          <g key={step} transform={`translate(${cx - 40} 334)`}>
            <rect width="80" height="28" rx="14" fill="var(--lf-elevated)" stroke={human ? "var(--lf-accent)" : "var(--lf-border-strong)"} strokeOpacity={human ? 0.6 : 1} />
            <circle cx="14" cy="14" r="3.5" fill={index < 4 ? "var(--lf-success)" : "var(--lf-accent)"} />
            <text x="24" y="18" fontSize="10.5" fill={human ? "var(--lf-fg)" : "var(--lf-fg-muted)"} style={mono}>
              {step}
            </text>
          </g>
        );
      })}

      {/* floating badges */}
      <g className="float-slow" style={{ animationDelay: "-2s" }}>
        <rect x="402" y="10" width="158" height="30" rx="15" fill="var(--lf-elevated)" stroke="var(--lf-border-strong)" />
        <circle cx="420" cy="25" r="7" fill="var(--lf-success)" opacity="0.18" />
        <path d="M416.5 25 l2.5 2.5 l4.5 -5" fill="none" stroke="var(--lf-success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <text x="434" y="29" fontSize="11" fill="var(--lf-fg)" style={sans}>
          <tspan fontWeight="600">12/12</tspan> tests passed
        </text>
      </g>
      <g className="float-slow" style={{ animationDelay: "-4s" }}>
        <rect x="16" y="14" width="150" height="28" rx="14" fill="var(--lf-elevated)" stroke="var(--lf-border-strong)" />
        <rect x="29" y="25" width="10" height="8" rx="2" fill="none" stroke="var(--lf-accent-2)" strokeWidth="1.4" />
        <path d="M31.5 25 v-2 a2.5 2.5 0 0 1 5 0 v2" fill="none" stroke="var(--lf-accent-2)" strokeWidth="1.4" />
        <text x="46" y="32" fontSize="10.5" fill="var(--lf-fg-muted)" style={mono}>
          2 paths locked
        </text>
      </g>
    </svg>
  );
}

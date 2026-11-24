/* Small original illustrations for the bento grid. Pure SVG, theme-aware via CSS variables. */
const mono = { fontFamily: "var(--font-mono)" };
const sans = { fontFamily: "var(--font-sans)" };
const card = { fill: "var(--lf-elevated)", stroke: "var(--lf-border-strong)" };

function Folder({ x, y, label, dashed = false, tone = "var(--lf-fg-subtle)" }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 14 a8 8 0 0 1 8 -8 h34 l10 10 h66 a8 8 0 0 1 8 8 v62 a8 8 0 0 1 -8 8 h-110 a8 8 0 0 1 -8 -8z" {...card} strokeDasharray={dashed ? "4 4" : undefined} />
      <rect x="14" y="34" width="58" height="5" rx="2.5" fill={tone} opacity="0.7" />
      <rect x="14" y="46" width="86" height="5" rx="2.5" fill="var(--lf-border-strong)" />
      <rect x="14" y="58" width="70" height="5" rx="2.5" fill="var(--lf-border-strong)" />
      <text x="14" y="82" fontSize="10" fill="var(--lf-fg-subtle)" style={mono}>
        {label}
      </text>
    </g>
  );
}

export function DryRunArt({ className = "" }) {
  return (
    <svg viewBox="0 0 420 150" className={className} aria-hidden="true">
      <Folder x={28} y={26} label="your-app/" />
      <Folder x={266} y={26} label="tmp copy/" dashed tone="var(--lf-accent)" />
      <path d="M160 76 H262" stroke="var(--lf-border-strong)" strokeWidth="1.25" fill="none" />
      <path d="M160 76 H262" className="beam beam-glow" stroke="var(--lf-accent-2)" strokeWidth="2.25" style={{ color: "var(--lf-accent-2)", strokeDasharray: "24 160", strokeDashoffset: 184, animationDuration: "2.4s" }} />
      <path d="M254 70 l8 6 l-8 6" fill="none" stroke="var(--lf-fg-subtle)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <g transform="translate(193 102)">
        <path d="M18 0 l15 6 v10 c0 9 -7 15 -15 18 c-8 -3 -15 -9 -15 -18 v-10z" fill="var(--lf-success-soft)" stroke="var(--lf-success)" strokeWidth="1.25" />
        <path d="M12 16 l4.5 4.5 l8 -8.5" fill="none" stroke="var(--lf-success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <text x="211" y="62" textAnchor="middle" fontSize="10" fill="var(--lf-fg-subtle)" style={mono}>
        git clone --local
      </text>
    </svg>
  );
}

export function BranchArt({ className = "" }) {
  const commits = [
    { cx: 150, color: "var(--lf-beam-1)", label: "rewrite" },
    { cx: 210, color: "var(--lf-accent)", label: "rules" },
    { cx: 270, color: "var(--lf-beam-2)", label: "fix-up" },
  ];
  return (
    <svg viewBox="0 0 320 150" className={className} aria-hidden="true">
      <path d="M20 104 H300" stroke="var(--lf-border-strong)" strokeWidth="2" fill="none" />
      <path d="M90 104 C 110 104, 110 56, 130 56 H290" stroke="var(--lf-accent)" strokeOpacity="0.55" strokeWidth="2" fill="none" />
      <path d="M90 104 C 110 104, 110 56, 130 56 H290" className="beam" stroke="var(--lf-accent)" strokeWidth="2.5" style={{ strokeDasharray: "18 300", strokeDashoffset: 318, animationDuration: "3s" }} />
      {[40, 90, 240].map((cx) => (
        <circle key={cx} cx={cx} cy="104" r="5" fill="var(--lf-surface)" stroke="var(--lf-fg-subtle)" strokeWidth="2" />
      ))}
      {commits.map((commit) => (
        <g key={commit.cx}>
          <circle cx={commit.cx} cy="56" r="6" fill="var(--lf-surface)" stroke={commit.color} strokeWidth="2.5" />
          <text x={commit.cx} y="38" textAnchor="middle" fontSize="9.5" fill="var(--lf-fg-subtle)" style={mono}>
            {commit.label}
          </text>
        </g>
      ))}
      <path d="M270 68 C 270 92, 252 98, 246 100" fill="none" stroke="var(--lf-warning)" strokeWidth="1.5" strokeDasharray="3 3" />
      <path d="M252 96 l-6 4 l6 3" fill="none" stroke="var(--lf-warning)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <text x="20" y="128" fontSize="9.5" fill="var(--lf-fg-subtle)" style={mono}>
        main
      </text>
      <text x="300" y="128" textAnchor="end" fontSize="9.5" fill="var(--lf-warning)" style={mono}>
        rollback
      </text>
    </svg>
  );
}

export function TestsArt({ className = "" }) {
  const cells = Array.from({ length: 24 }, (_, index) => index);
  return (
    <svg viewBox="0 0 320 150" className={className} aria-hidden="true">
      {cells.map((index) => {
        const col = index % 8;
        const row = Math.floor(index / 8);
        const skipped = index === 13;
        return (
          <rect
            key={index}
            x={28 + col * 34}
            y={22 + row * 34}
            width="26"
            height="26"
            rx="6"
            fill={skipped ? "var(--lf-surface-3)" : "var(--lf-success-soft)"}
            stroke={skipped ? "var(--lf-border-strong)" : "var(--lf-success)"}
            strokeOpacity={skipped ? 1 : 0.45}
            className={index === 6 || index === 19 ? "blink-cell" : undefined}
            style={index === 19 ? { animationDelay: "-1.2s" } : undefined}
          />
        );
      })}
      <text x="28" y="140" fontSize="10" fill="var(--lf-fg-subtle)" style={mono}>
        Tests run: 24 · Failures: 0 · Skipped: 1
      </text>
    </svg>
  );
}

export function ReportArt({ className = "" }) {
  return (
    <svg viewBox="0 0 420 150" className={className} aria-hidden="true">
      <g transform="translate(40 14)">
        <rect width="190" height="128" rx="10" {...card} />
        <rect x="16" y="16" width="96" height="8" rx="4" fill="var(--lf-fg)" opacity="0.8" />
        <rect x="16" y="32" width="150" height="5" rx="2.5" fill="var(--lf-border-strong)" />
        <rect x="16" y="43" width="128" height="5" rx="2.5" fill="var(--lf-border-strong)" />
        {[0, 1, 2].map((row) => (
          <g key={row} transform={`translate(16 ${62 + row * 18})`}>
            <circle cx="5" cy="5" r="5" fill="var(--lf-success-soft)" stroke="var(--lf-success)" />
            <path d="M2.8 5 l1.6 1.6 l3 -3.2" fill="none" stroke="var(--lf-success)" strokeWidth="1.3" strokeLinecap="round" />
            <rect x="16" y="2.5" width={[110, 88, 120][row]} height="5" rx="2.5" fill="var(--lf-border-strong)" />
          </g>
        ))}
      </g>
      <g transform="translate(250 30)">
        <rect width="134" height="96" rx="10" {...card} />
        {[46, 70, 34, 58, 80].map((height, index) => (
          <rect key={index} x={16 + index * 22} y={80 - height} width="14" height={height} rx="3" fill={index === 4 ? "var(--lf-accent)" : "var(--lf-accent-soft)"} stroke="var(--lf-accent)" strokeOpacity="0.4" />
        ))}
        <path d="M14 82 H120" stroke="var(--lf-border-strong)" />
      </g>
      <g transform="translate(206 106)">
        <rect width="64" height="26" rx="13" fill="var(--lf-elevated)" stroke="url(#report-pdf)" />
        <defs>
          <linearGradient id="report-pdf" x1="0" x2="1">
            <stop offset="0" stopColor="var(--lf-beam-1)" />
            <stop offset="1" stopColor="var(--lf-beam-2)" />
          </linearGradient>
        </defs>
        <text x="32" y="17" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--lf-fg)" style={sans}>
          PDF · MD
        </text>
      </g>
    </svg>
  );
}

/** Compact beam strip used as the decorative band on inner page headers. */
export function BeamStrip({ className = "" }) {
  const lanes = [24, 52, 80];
  return (
    <svg viewBox="0 0 360 104" className={className} aria-hidden="true">
      {lanes.map((y, index) => (
        <g key={y}>
          <path d={`M0 ${y} H360`} stroke="var(--lf-border-strong)" strokeWidth="1" />
          <path
            d={`M0 ${y} H360`}
            className="beam beam-glow"
            stroke={index === 1 ? "var(--lf-beam-2)" : "var(--lf-beam-1)"}
            strokeWidth="2"
            style={{ color: index === 1 ? "var(--lf-beam-2)" : "var(--lf-beam-1)", strokeDasharray: "40 400", strokeDashoffset: 440, animationDelay: `${-index * 1.1}s`, animationDuration: "3.6s" }}
          />
        </g>
      ))}
      {[[70, 24], [170, 52], [250, 24], [300, 80], [120, 80]].map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r="7" fill="var(--lf-elevated)" stroke="var(--lf-border-strong)" />
          <circle cx={cx} cy={cy} r="2.5" fill="var(--lf-accent)" />
        </g>
      ))}
    </svg>
  );
}

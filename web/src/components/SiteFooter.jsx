import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
import { useMigration } from "../migrationContext.js";

/* global __AGENT_URL__ */
const agentUrl = typeof __AGENT_URL__ === "string" ? __AGENT_URL__ : "";

export default function SiteFooter() {
  const { config, matrix } = useMigration();
  const javaTargets = matrix?.supportedJavaTargets?.join(", ");
  const bootTargets = matrix?.supportedBootTargets
    ?.filter((target) => target.id !== "none")
    .map((target) => target.id)
    .join(", ");
  const linkClass = "inline-flex items-center gap-1 text-fg-muted transition-colors duration-150 hover:text-fg";

  return (
    <footer className="mt-24 overflow-hidden border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 pt-10 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className="eyebrow">Local · deterministic · reviewable</p>
          <p className="mt-3 max-w-md text-sm text-fg-muted">
            <span className="font-medium text-fg">Verdigrade</span>
            {config?.version ? <span className="tabular-nums"> v{config.version}</span> : null}
            {javaTargets ? (
              <>
                {" "}
                upgrades Java projects to Java {javaTargets} and Spring Boot {bootTargets}, Node.js projects to current Node and TypeScript, and Python projects to current Python, Django and Flask.
              </>
            ) : null}
          </p>
        </div>
        <nav className="flex flex-wrap items-start gap-x-6 gap-y-2 text-sm" aria-label="Footer">
          <Link className={linkClass} to="/new">
            New migration
          </Link>
          <Link className={linkClass} to="/#recent-runs">
            Recent runs
          </Link>
          {agentUrl ? (
            <a className={linkClass} href={`${agentUrl}/agent/playground`} target="_blank" rel="noreferrer">
              Agent playground <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </a>
          ) : null}
        </nav>
      </div>
      <div aria-hidden="true" className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        {/* Sized so "verdigrade" fills the row at its natural spacing; descenders bleed off the bottom like the original wordmark. */}
        <svg viewBox="0 0 1200 240" className="wordmark block h-auto w-full" focusable="false">
          <text x="2" y="231" style={{ fontSize: 291, letterSpacing: "0" }} textLength="1196" lengthAdjust="spacingAndGlyphs">
            verdigrade
          </text>
        </svg>
      </div>
    </footer>
  );
}

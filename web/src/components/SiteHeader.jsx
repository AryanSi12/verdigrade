import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { History, LayoutGrid, Moon, Plus, Scale, Sun } from "lucide-react";
import { useMigration } from "../migrationContext.js";
import { applyTheme, getPreferredTheme, toggleTheme } from "../theme.js";
import HistoryMenu from "./HistoryMenu.jsx";
import Logo from "./Logo.jsx";

/**
 * App shell navigation: a fixed dark sidebar on wide screens (a dark top bar on small ones).
 * Light in the light theme, dark in the dark theme (colours from the --lf-side-* tokens).
 */
export default function SiteHeader() {
  const { matrix, lastRunId, config } = useMigration();
  const location = useLocation();
  const [theme, setTheme] = useState(getPreferredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const defaults = matrix?.defaults;
  const onCompare = location.pathname.startsWith("/compare/");
  const items = [
    { to: "/", label: "Overview", icon: LayoutGrid, active: location.pathname === "/" },
    { to: "/new", label: "New migration", icon: Plus, active: location.pathname.startsWith("/new") || location.pathname.startsWith("/plan") || location.pathname.startsWith("/planning") },
    ...(lastRunId ? [{ to: `/runs/${lastRunId}`, label: "Last run", icon: History, active: location.pathname.startsWith("/runs/") }] : []),
    ...(onCompare ? [{ to: location.pathname, label: "Compare", icon: Scale, active: true }] : []),
  ];
  const targets = [
    defaults?.targetJava ? ["Java", defaults.targetJava] : null,
    defaults?.targetBoot ? ["Spring Boot", defaults.targetBoot] : null,
    config?.nodeDefaults?.node ? ["Node", config.nodeDefaults.node] : null,
    config?.pythonDefaults?.python ? ["Python", config.pythonDefaults.python] : null,
  ].filter(Boolean);
  const dark = theme === "dark";

  const link = (item, compact = false) => (
    <NavLink
      key={item.label}
      to={item.to}
      aria-current={item.active ? "page" : undefined}
      className={`relative flex items-center gap-2.5 rounded-md text-[13px] font-medium transition-colors duration-150 ${compact ? "h-8 px-2.5" : "h-8 px-2.5"} ${
        item.active ? "bg-[var(--lf-side-active)] text-[var(--lf-side-fg)]" : "text-[var(--lf-side-muted)] hover:bg-[var(--lf-side-hover)] hover:text-[var(--lf-side-fg)]"
      }`}
    >
      {item.active && !compact ? <span aria-hidden="true" className="absolute inset-y-1.5 -left-3 w-[2px] rounded-r-full bg-[var(--lf-side-marker)]" /> : null}
      <item.icon aria-hidden="true" className="size-4 shrink-0 opacity-80" strokeWidth={1.75} />
      <span className={compact ? "hidden sm:inline" : ""}>{item.label}</span>
    </NavLink>
  );
  const toggle = (
    <button
      type="button"
      onClick={() => setTheme((current) => toggleTheme(current))}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-[var(--lf-side-muted)] transition-colors duration-150 hover:bg-[var(--lf-side-hover)] hover:text-[var(--lf-side-fg)]"
    >
      {dark ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
      <span className="hidden lg:inline">{dark ? "Light mode" : "Dark mode"}</span>
    </button>
  );

  return (
    <>
      {/* Wide screens: fixed sidebar */}
      <aside className="side-nav fixed inset-y-0 left-0 z-40 hidden w-[220px] flex-col border-r lg:flex" aria-label="Sidebar">
        <NavLink to="/" className="flex h-14 items-center gap-2.5 px-5" aria-label="Verdigrade home">
          <Logo className="size-6" />
          <span className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--lf-side-fg)]">Verdigrade</span>
          {config?.version ? <span className="text-xs text-[var(--lf-side-muted)]">v{config.version}</span> : null}
        </NavLink>
        <nav className="flex flex-col gap-px px-3 pt-3" aria-label="Primary">
          <p className="px-2.5 pb-2 text-[11px] font-medium tracking-[0.08em] text-[var(--lf-side-muted)]/70 uppercase">Workspace</p>
          {items.map((item) => link(item))}
          <HistoryMenu
            placement="side"
            buttonClass="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors duration-150 text-[var(--lf-side-muted)] hover:bg-[var(--lf-side-hover)] hover:text-[var(--lf-side-fg)] aria-expanded:bg-[var(--lf-side-active)] aria-expanded:text-[var(--lf-side-fg)]"
          />
        </nav>
        <div className="mt-auto space-y-3 border-t border-[var(--lf-side-border)] px-3 py-4">
          {targets.length ? (
            <div className="px-2.5">
              <p className="pb-2 text-[11px] font-medium tracking-[0.08em] text-[var(--lf-side-muted)]/70 uppercase">Default targets</p>
              <dl className="space-y-1 text-xs">
                {targets.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <dt className="text-[var(--lf-side-muted)]">{label}</dt>
                    <dd className="font-medium text-[var(--lf-side-fg)] tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {toggle}
        </div>
      </aside>

      {/* Small screens: dark top bar */}
      <header className="side-nav sticky top-0 z-40 flex h-14 items-center gap-1 border-b px-3 lg:hidden">
        <NavLink to="/" className="mr-2 flex items-center gap-2" aria-label="Verdigrade home">
          <Logo className="size-7" />
          <span className="hidden text-[15px] font-semibold text-[var(--lf-side-fg)] sm:inline">Verdigrade</span>
        </NavLink>
        <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto" aria-label="Primary mobile">
          {items.map((item) => link(item, true))}
        </nav>
        <HistoryMenu
          placement="below"
          buttonClass="flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-[var(--lf-side-muted)] hover:bg-[var(--lf-side-hover)] hover:text-[var(--lf-side-fg)] [&>span]:hidden sm:[&>span]:inline"
        />
        {toggle}
      </header>
    </>
  );
}

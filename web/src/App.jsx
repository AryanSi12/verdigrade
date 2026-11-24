import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { api, AUTH_EVENT } from "./api.js";
import { MigrationContext } from "./migrationContext.js";
import { useAsync } from "./useAsync.js";
import SiteHeader from "./components/SiteHeader.jsx";
import { ToastProvider } from "./components/Toaster.jsx";
import TokenDialog from "./components/TokenDialog.jsx";
import PlanPage from "./pages/PlanPage.jsx";
import PlanJobPage from "./pages/PlanJobPage.jsx";
import NewPage from "./pages/NewPage.jsx";
import ProjectsPage from "./pages/ProjectsPage.jsx";
import RunPage from "./pages/RunPage.jsx";
import ComparePage from "./pages/ComparePage.jsx";
import { KEYS, readStored, writeStored } from "./storage.js";

function readLastRun() {
  return readStored(KEYS.lastRun) || "";
}

export default function App() {
  const navigate = useNavigate();
  const [authNeeded, setAuthNeeded] = useState(false);
  const [lastRunId, setLastRunId] = useState(readLastRun);
  const [historyNonce, setHistoryNonce] = useState(0);

  // Loaded once per (re)authentication; everything version-specific in the UI comes from here.
  const [authNonce, setAuthNonce] = useState(0);
  const config = useAsync((signal) => api.config(signal), [authNonce]);
  const matrix = useAsync((signal) => api.matrix(signal), [authNonce]);
  const history = useAsync((signal) => api.history({ limit: 50 }, signal), [authNonce, historyNonce]);

  useEffect(() => {
    const onAuth = () => setAuthNeeded(true);
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_EVENT, onAuth);
  }, []);

  // Cursor spotlight for every `.spotlight` element: one passive listener writes two CSS variables.
  useEffect(() => {
    if (!window.matchMedia?.("(hover: hover)").matches) return undefined;
    let frame = 0;
    const onMove = (event) => {
      const target = event.target instanceof Element ? event.target.closest(".spotlight") : null;
      if (!target || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = target.getBoundingClientRect();
        target.style.setProperty("--mx", `${event.clientX - rect.left}px`);
        target.style.setProperty("--my", `${event.clientY - rect.top}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Reveal-on-scroll: one IntersectionObserver for every `.reveal`, including ones rendered after data loads.
  const location = useLocation();
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      root.classList.remove("reveal-on");
      return undefined;
    }
    root.classList.add("reveal-on");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    const scan = () => document.querySelectorAll(".reveal:not(.is-visible)").forEach((element) => io.observe(element));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.getElementById("main") ?? document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [location.pathname]);

  const refreshHistory = useCallback(() => setHistoryNonce((value) => value + 1), []);

  const startMigration = useCallback(
    async (payload) => {
      const body = await api.start(payload);
      writeStored(KEYS.lastRun, body.runId);
      setLastRunId(body.runId);
      navigate(`/runs/${body.runId}`);
      return body;
    },
    [navigate],
  );

  const shell = useMemo(
    () => ({
      config: config.data,
      configError: config.error,
      matrix: matrix.data,
      matrixError: matrix.error,
      matrixLoading: matrix.loading,
      reloadMatrix: matrix.reload,
      history: history.data,
      historyError: history.error,
      historyLoading: history.loading,
      refreshHistory,
      lastRunId,
      startMigration,
    }),
    [config.data, config.error, matrix.data, matrix.error, matrix.loading, matrix.reload, history.data, history.error, history.loading, refreshHistory, lastRunId, startMigration],
  );

  return (
    <ToastProvider>
      <MigrationContext.Provider value={shell}>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <div aria-hidden="true" className="app-backdrop" />
        <SiteHeader />
        <div className="flex min-h-screen flex-col lg:pl-[220px]">
          <main id="main" className="flex-1">
            <div key={location.pathname.split("/").slice(0, 3).join("/")} className="route-in">
            <Routes>
              <Route index element={<ProjectsPage />} />
              <Route path="overview" element={<Navigate to="/" replace />} />
              <Route path="new" element={<NewPage />} />
              <Route path="new/:tab" element={<Navigate to="/new" replace />} />
              <Route path="plan/:planId" element={<PlanPage />} />
              <Route path="planning/:jobId" element={<PlanJobPage />} />
              <Route path="compare/:comparisonId" element={<ComparePage />} />
              <Route path="runs/:runId" element={<RunPage />} />
              <Route path="runs/:runId/:tab" element={<RunPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </div>
          </main>
        </div>
        {authNeeded ? (
          <TokenDialog
            onClose={() => setAuthNeeded(false)}
            onSaved={() => {
              setAuthNeeded(false);
              setAuthNonce((value) => value + 1);
            }}
          />
        ) : null}
      </MigrationContext.Provider>
    </ToastProvider>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";

const POLL_MS = 1500;

/**
 * Polls GET /runs/:id while the run is running and stops once it finishes. One timer at a time;
 * state only updates when the server's view actually changed, so idle polling does not re-render.
 */
export function useRun(runId) {
  const [run, setRun] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const last = useRef("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!runId) return undefined;
    let timer = null;
    let stopped = false;
    const controller = new AbortController();
    last.current = "";
    setLoading(true);
    setError(null);

    async function tick() {
      try {
        const data = await api.run(runId, controller.signal);
        if (stopped) return;
        const fingerprint = data.legacy
          ? "legacy"
          : `${data.status}|${data.events?.length ?? 0}|${data.narrative?.status}|${data.git?.rolledBack}|${Object.values(data.steps ?? {})
              .map((step) => step.status)
              .join(",")}`;
        if (fingerprint !== last.current) {
          last.current = fingerprint;
          setRun(data);
        }
        setError(null);
        setLoading(false);
        const live = !data.legacy && (data.status === "running" || ["pending", "running"].includes(data.narrative?.status));
        if (live) timer = setTimeout(tick, POLL_MS);
      } catch (caught) {
        if (stopped || caught?.name === "AbortError") return;
        setError(caught);
        setLoading(false);
        // Network blips: keep trying slowly; a 404 means the run is gone.
        if (caught?.status !== 404 && caught?.status !== 400) timer = setTimeout(tick, POLL_MS * 4);
      }
    }
    tick();
    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [runId, nonce]);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);
  return { run, error, loading, refresh };
}

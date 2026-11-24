import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Runs `load(signal)` when `deps` change. Aborts the previous request, so StrictMode's double
 * mount and quick navigation never race or loop. Returns { data, error, loading, reload }.
 */
export function useAsync(load, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));
    loadRef
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState((current) => ({ data: current.data, error, loading: false }));
      });
    return () => controller.abort();
    // `deps` is the caller's dependency list; `nonce` forces a reload.
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { ...state, reload };
}

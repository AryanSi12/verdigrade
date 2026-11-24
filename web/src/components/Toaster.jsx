import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";

const ToastContext = createContext(null);

const icons = { success: CircleCheck, error: CircleAlert, info: Info };
const tones = { success: "text-success", error: "text-danger", info: "text-accent" };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  const push = useCallback(
    (kind, title, description = "") => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, kind, title, description }]);
      setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4000);
      return id;
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      success: (title, description) => push("success", title, description),
      error: (title, description) => push("error", title, description),
      info: (title, description) => push("info", title, description),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6">
        {toasts.map((toast) => {
          const Icon = icons[toast.kind] ?? Info;
          return (
            <div
              key={toast.id}
              role={toast.kind === "error" ? "alert" : "status"}
              className="toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-border bg-elevated px-4 py-3 shadow-pop"
            >
              <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${tones[toast.kind]}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{toast.title}</p>
                {toast.description ? <p className="mt-0.5 text-sm break-words text-fg-muted">{toast.description}</p> : null}
              </div>
              <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss" className="-m-1 grid size-6 shrink-0 place-items-center rounded text-fg-subtle hover:bg-surface-2 hover:text-fg">
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside <ToastProvider>.");
  return value;
}

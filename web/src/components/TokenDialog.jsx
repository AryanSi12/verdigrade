import { useEffect, useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { getToken, setToken } from "../api.js";
import { useToast } from "./Toaster.jsx";
import { Button, controlClass } from "./ui.jsx";

export default function TokenDialog({ onClose, onSaved }) {
  const dialog = useRef(null);
  const [value, setValue] = useState(getToken);
  const toast = useToast();

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="token-title"
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-border bg-elevated p-0 text-fg shadow-pop backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <form
        method="dialog"
        className="p-6"
        onSubmit={(event) => {
          event.preventDefault();
          setToken(value.trim());
          toast.success("Token saved", "Requests now include your access token.");
          onSaved();
        }}
      >
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg border border-border bg-surface-2 text-accent">
            <KeyRound aria-hidden="true" className="size-4" />
          </span>
          <h2 id="token-title" className="text-lg font-semibold tracking-tight">
            Access token required
          </h2>
        </div>
        <p className="mt-3 text-sm text-fg-muted">
          The agent server was started with <code className="text-fg">VERDIGRADE_TOKEN</code> (or the older <code className="text-fg">JAVA_MIGRATOR_TOKEN</code>). Paste the same value; it is stored in this browser only.
        </p>
        <label htmlFor="token-input" className="mt-5 mb-1.5 block text-sm font-medium">
          Token
        </label>
        <input id="token-input" type="password" autoComplete="off" autoFocus value={value} onChange={(event) => setValue(event.target.value)} className={`${controlClass} font-mono`} />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!value.trim()}>
            Save token
          </Button>
        </div>
      </form>
    </dialog>
  );
}

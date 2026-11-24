// localStorage keys. Before the renames (java-migrator, then Leapfrog) they used a "jm-" prefix;
// readStored() moves an old value to its new key the first time it is read.
export const KEYS = {
  // v2: the redesign made light the default, so an older saved choice is not carried over.
  theme: "leapfrog-theme-v2",
  token: "leapfrog-token",
  planMode: "leapfrog-plan-mode",
  lastRun: "leapfrog-last-run",
};

const LEGACY = {
  [KEYS.token]: "jm-token",
  [KEYS.planMode]: "jm-plan-mode",
  [KEYS.lastRun]: "jm-last-run",
};

/** The stored value (new key first, then the legacy "jm-" key, migrated). Null when unset or storage is unavailable. */
export function readStored(key) {
  try {
    const value = localStorage.getItem(key);
    if (value != null) return value;
    const legacy = LEGACY[key];
    const old = legacy ? localStorage.getItem(legacy) : null;
    if (old == null) return null;
    localStorage.setItem(key, old);
    localStorage.removeItem(legacy);
    return old;
  } catch {
    return null;
  }
}

/** Store (or, with an empty value, remove) a value; also clears the legacy key. Silently ignores unavailable storage. */
export function writeStored(key, value) {
  try {
    if (value == null || value === "") localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    if (LEGACY[key]) localStorage.removeItem(LEGACY[key]);
  } catch {
    /* storage unavailable (private mode): the value lasts for this page only */
  }
}

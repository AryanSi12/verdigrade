import { KEYS, readStored, writeStored } from "./storage.js";

/** Light is the default; an explicit choice from the toggle is remembered. */
export function getPreferredTheme() {
  const saved = readStored(KEYS.theme);
  if (saved === "light" || saved === "dark") return saved;
  return "light";
}

export function applyTheme(theme, persist = false) {
  const next = theme === "light" ? "light" : "dark";
  document.documentElement.classList.toggle("dark", next === "dark");
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  if (persist) {
    writeStored(KEYS.theme, next);
  }
  return next;
}

export function toggleTheme(current) {
  return applyTheme(current === "dark" ? "light" : "dark", true);
}

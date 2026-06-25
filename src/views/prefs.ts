import { signal, effect } from "@matthewp/zebra";

export type ViewMode = "grid" | "table";
export type Theme = "dark" | "light";

const isBrowser = typeof document !== "undefined";

function readInitial(): ViewMode {
  if (!isBrowser) return "grid";
  const v = document.documentElement.dataset.view;
  return v === "table" ? "table" : "grid";
}

function readInitialTheme(): Theme {
  if (!isBrowser) return "dark";
  // The blocking boot script (server-render.ts) has already set data-theme
  // from localStorage before first paint; mirror that as the initial value.
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

// Module-level signal: app-wide view preference. Mirrored to <html data-view>
// (so CSS can target it) and localStorage (so it survives reload).
export const viewMode = signal<ViewMode>(readInitial());

if (isBrowser) {
  effect(() => {
    const v = viewMode();
    document.documentElement.dataset.view = v;
    try { localStorage.setItem("view", v); } catch { /* unavailable */ }
  });
}

// Module-level signal: app-wide color theme. Mirrored to <html data-theme>
// (drives the CSS variable palette) and localStorage. Defaults to dark.
export const theme = signal<Theme>(readInitialTheme());

if (isBrowser) {
  effect(() => {
    const t = theme();
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("theme", t); } catch { /* unavailable */ }
  });
}

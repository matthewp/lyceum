import { signal, effect } from "@matthewp/zebra";

export type ViewMode = "grid" | "table";

const isBrowser = typeof document !== "undefined";

function readInitial(): ViewMode {
  if (!isBrowser) return "grid";
  const v = document.documentElement.dataset.view;
  return v === "table" ? "table" : "grid";
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

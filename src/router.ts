import type { View } from "@matthewp/zebra";
import { matchRoute, type RouteDef } from "./routes.ts";
import type { App } from "./views/app.ts";

// Dynamic-import map. esbuild code-splits each entry into its own chunk under
// public/build/. Adding a new route means: register in routes.ts AND here.
const booksImport = () => import("./pages/books.ts");
const pageImports: Record<string, () => Promise<{ default: new (data: any) => View }>> = {
  books: booksImport,
  search: booksImport,
  series: booksImport,
  author: booksImport,
  tag: booksImport,
  settings: () => import("./pages/settings.ts"),
  devices: () => import("./pages/devices.ts"),
  "device-detail": () => import("./pages/device-detail.ts"),
  bookmarklet: () => import("./pages/bookmarklet.ts"),
  "book-detail": () => import("./pages/book-detail.ts"),
};

interface NavigationEventLike extends Event {
  destination: { url: string };
  canIntercept: boolean;
  hashChange: boolean;
  downloadRequest: string | null;
  formData: FormData | null;
  intercept(opts: { handler: () => Promise<void> }): void;
}

interface NavigationLike {
  addEventListener(type: "navigate", listener: (e: NavigationEventLike) => void): void;
}

declare global {
  interface Window {
    navigation?: NavigationLike;
  }
}

export interface Router {
  start(): void;
}

export function createRouter(app: App): Router {
  let inflight: AbortController | null = null;

  async function load(routeMatch: { route: RouteDef; params: Record<string, string> }, url: URL, signal: AbortSignal): Promise<void> {
    const dataUrl = new URL(url.toString());
    dataUrl.searchParams.set("_data", "1");

    const importer = pageImports[routeMatch.route.name];
    if (!importer) throw new Error(`No client page module for route "${routeMatch.route.name}"`);

    const [res, mod] = await Promise.all([
      fetch(dataUrl.toString(), { signal, headers: { accept: "application/json" } }),
      importer(),
    ]);
    if (signal.aborted) return;
    if (!res.ok) throw new Error(`Data fetch failed: ${res.status}`);
    const data = await res.json();
    if (signal.aborted) return;

    const page = new mod.default(data);
    const swap = () => app.setPage({
      page,
      nav: routeMatch.route.nav,
      pageClass: routeMatch.route.pageClass,
    });

    // `@view-transition { navigation: auto }` doesn't fire on Navigation-API
    // intercepted (same-document) nav — only on real cross-document loads.
    // Pair the matching `view-transition-name` elements ourselves.
    const startVT = (document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    }).startViewTransition;
    if (startVT) await startVT.call(document, swap).finished;
    else swap();
  }

  return {
    start(): void {
      const nav = window.navigation;
      if (!nav) {
        console.warn("[router] Navigation API not available; routing disabled.");
        return;
      }

      nav.addEventListener("navigate", (e) => {
        if (!e.canIntercept) return;
        if (e.hashChange || e.downloadRequest !== null) return;

        const url = new URL(e.destination.url);
        if (url.origin !== location.origin) return;

        const match = matchRoute(url);
        if (!match) return; // let the browser handle (full nav for non-SPA URLs)

        // App layout can only host other app-layout pages — switching to a
        // plain-shell page (e.g. login) needs a full document load.
        if ((match.route.shell ?? "app") !== "app") return;

        if (inflight) inflight.abort();
        const controller = new AbortController();
        inflight = controller;

        e.intercept({
          handler: async () => {
            try {
              await load(match, url, controller.signal);
            } catch (err) {
              if ((err as Error).name === "AbortError") return;
              console.error("[router] navigation failed:", err);
              throw err;
            } finally {
              if (inflight === controller) inflight = null;
            }
          },
        });
      });
    },
  };
}

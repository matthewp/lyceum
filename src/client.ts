import { App } from "./views/app.ts";
import { matchRoute } from "./routes.ts";
import { createRouter } from "./router.ts";
import "./views/prefs.ts"; // initialize view-mode signal + side-effects

interface PageImports {
  [name: string]: () => Promise<{ default: new (data: any) => any }>;
}

const booksImport = () => import("./pages/books.ts");
const pageImports: PageImports = {
  books: booksImport,
  search: booksImport,
  series: booksImport,
  author: booksImport,
  tag: booksImport,
  settings: () => import("./pages/settings.ts"),
  login: () => import("./pages/login.ts"),
  devices: () => import("./pages/devices.ts"),
  "device-detail": () => import("./pages/device-detail.ts"),
  bookmarklet: () => import("./pages/bookmarklet.ts"),
  "book-detail": () => import("./pages/book-detail.ts"),
};

async function boot(): Promise<void> {
  const dataScript = document.getElementById("page-data") as HTMLScriptElement | null;
  if (!dataScript) throw new Error("Missing #page-data script");

  const pageName = dataScript.dataset.page;
  if (!pageName) throw new Error("Missing data-page attribute");
  const shell = dataScript.dataset.shell ?? "app";

  const data = JSON.parse(dataScript.textContent ?? "null");

  const match = matchRoute(new URL(location.href));
  if (!match) throw new Error(`No route matches ${location.pathname}`);

  const importer = pageImports[pageName];
  if (!importer) throw new Error(`No client module for page "${pageName}"`);

  const mod = await importer();
  const page = new mod.default(data);

  const appHost = document.getElementById("app");
  if (!appHost) throw new Error("Missing #app element");
  const root = appHost.firstElementChild as HTMLElement | null;
  if (!root) throw new Error("Missing SSR root child of #app");

  if (shell === "plain") {
    // Standalone page (e.g. login). No App wrapper, no SPA router — leaving
    // a plain page always triggers a full navigation.
    page.hydrate(root);
    return;
  }

  const app = new App({ page, nav: match.route.nav, pageClass: match.route.pageClass });
  app.hydrate(root);
  createRouter(app).start();
}

boot().catch(err => {
  console.error("[client] boot failed:", err);
});

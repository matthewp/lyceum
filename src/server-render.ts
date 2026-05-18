import { App } from "./views/app.ts";
import type { PageClass, NavSection, RouteShell } from "./routes.ts";
import type { View } from "@matthewp/zebra";

const GOOGLE_FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,800;1,700&display=swap" rel="stylesheet">`;

// Blocking inline scripts: set theme + view + sidebar attributes on <html>
// from localStorage BEFORE first paint so CSS that targets them doesn't FOUC.
// Also set data-page from the SSR-known route so first-paint CSS resolves.
const bootScript = (pageClass: string) =>
  `(function(){var d=document.documentElement;d.dataset.theme="dark";d.dataset.page=${JSON.stringify(pageClass)};try{d.dataset.view=localStorage.getItem("view")||"grid";d.dataset.sidebar=localStorage.getItem("sidebar")||"closed";}catch(e){d.dataset.view="grid";d.dataset.sidebar="closed";}})();`;

const APP_STYLESHEETS = [
  "/public/css/base.css",
  "/public/css/layout.css",
  "/public/css/modal.css",
  "/public/css/book-table.css",
  "/public/css/forms.css",
  "/public/css/devices.css",
  "/public/css/book-detail.css",
  "/public/css/settings.css",
];

export interface RenderShellArgs {
  title: string;
  page: View;
  nav: NavSection;
  pageClass: PageClass;
  shell: RouteShell;
  data: unknown;
  pageName: string;
}

export function renderShell({ title, page, nav, pageClass, shell, data, pageName }: RenderShellArgs): string {
  // For "app" shell, the page is nested inside the App layout. For "plain"
  // shell (e.g. login), the page is the hydration root itself.
  const rootHtml = shell === "app"
    ? new App({ page, nav, pageClass }).toString()
    : page.toString();

  const dataJson = JSON.stringify(data).replace(/</g, "\\u003c");
  const styles = APP_STYLESHEETS.map(p => `<link rel="stylesheet" href="${p}">`).join("\n  ");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" type="image/png" href="/public/favicon.png">
${GOOGLE_FONTS}
${styles}
<script>${bootScript(pageClass)}</script>
</head>
<body>
<div id="app">${rootHtml}</div>
<script id="page-data" type="application/json" data-page="${pageName}" data-shell="${shell}">${dataJson}</script>
<script type="module" src="/public/build/client.js"></script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

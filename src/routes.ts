// Route registry shared between server and client.
//
// Each route maps a URLPattern to a page module name (used to locate the
// client bundle at /public/build/pages/<name>.js and the server-side loader
// at src/loaders/<name>.ts).

export type NavSection = "library" | "devices" | "settings" | null;
export type PageClass = "cover-wall-page" | "book-detail-page" | "login-page" | "";
export type RouteAuth = "session" | "public";
export type RouteShell = "app" | "plain";

export const ALL_PAGE_CLASSES: PageClass[] = ["cover-wall-page", "book-detail-page", "login-page"];

export interface RouteDef {
  name: string;
  pattern: URLPattern;
  nav: NavSection;
  pageClass: PageClass;
  // Defaults to "session" (must be logged in) + "app" (wrap in App layout).
  auth?: RouteAuth;
  shell?: RouteShell;
}

export const routes: RouteDef[] = [
  { name: "books", pattern: new URLPattern({ pathname: "/app" }), nav: "library", pageClass: "cover-wall-page" },
  { name: "search", pattern: new URLPattern({ pathname: "/app/search" }), nav: "library", pageClass: "cover-wall-page" },
  { name: "series", pattern: new URLPattern({ pathname: "/app/series/:id" }), nav: "library", pageClass: "cover-wall-page" },
  { name: "author", pattern: new URLPattern({ pathname: "/app/author/:author" }), nav: "library", pageClass: "cover-wall-page" },
  { name: "tag", pattern: new URLPattern({ pathname: "/app/tag/:tag" }), nav: "library", pageClass: "cover-wall-page" },
  { name: "settings", pattern: new URLPattern({ pathname: "/app/settings" }), nav: "settings", pageClass: "cover-wall-page" },
  { name: "devices", pattern: new URLPattern({ pathname: "/app/devices" }), nav: "devices", pageClass: "cover-wall-page" },
  { name: "device-detail", pattern: new URLPattern({ pathname: "/app/devices/:name" }), nav: "devices", pageClass: "cover-wall-page" },
  { name: "bookmarklet", pattern: new URLPattern({ pathname: "/app/bookmarklet" }), nav: "devices", pageClass: "" },
  { name: "book-detail", pattern: new URLPattern({ pathname: "/app/book/:id" }), nav: "library", pageClass: "book-detail-page" },
  { name: "login", pattern: new URLPattern({ pathname: "/app/login" }), nav: null, pageClass: "login-page", auth: "public", shell: "plain" },
];

export function matchRoute(url: URL): { route: RouteDef; params: Record<string, string> } | null {
  for (const route of routes) {
    const result = route.pattern.exec(url);
    if (result) {
      return { route, params: result.pathname.groups as Record<string, string> };
    }
  }
  return null;
}

// Bump on any cacheable-surface change so the new SW evicts old entries.
const SWR_CACHE = "swr-v3";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    // Drop any older swr-* caches so stale bundles/pages from a prior
    // deploy don't survive into a new SW generation.
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("swr-") && k !== SWR_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const path = url.pathname;

  // Mutations: evict the parent page (HTML + JSON) so the next GET is fresh.
  if (e.request.method === "POST" && path.startsWith("/app/")) {
    const parent = path.replace(/\/[^/]+$/, "");
    caches.open(SWR_CACHE).then((c) => {
      c.delete(new Request(url.origin + parent));
      c.delete(new Request(url.origin + parent + "?_data=1"));
    });
    return;
  }

  if (e.request.method !== "GET") return;
  if (path === "/app/login") return;
  if (path.startsWith("/mcp")) return;
  if (path.startsWith("/view/")) return;
  if (path.startsWith("/download/")) return;
  if (path.startsWith("/upload")) return;

  // Always-fresh: SPA data-fetch endpoints. Caching JSON across a mutation
  // would show stale rating/format/etc. data after a write.
  if (url.searchParams.get("_data") === "1") return;

  // Always-fresh: the stable client/page bundles. Their filenames don't
  // change across deploys, so cached JS could be paired with newer SSR HTML
  // and break hydration. Hashed chunks under /public/build/chunks/ are
  // safe to cache (their filenames change with content).
  if (path === "/public/build/client.js") return;
  if (path.startsWith("/public/build/pages/")) return;

  // SWR: app pages, covers, hashed chunks, and other static assets.
  if (path.startsWith("/app") || path.startsWith("/public/")) {
    e.respondWith(staleWhileRevalidate(e.request, SWR_CACHE));
    return;
  }
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}

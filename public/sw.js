const SWR_CACHE = "swr-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const path = url.pathname;

  // Skip: non-GET, login, MCP, signed URLs
  if (e.request.method !== "GET") return;
  if (path === "/app/login") return;
  if (path.startsWith("/mcp")) return;
  if (path.startsWith("/view/")) return;
  if (path.startsWith("/download/")) return;
  if (path.startsWith("/upload")) return;

  // SWR: app pages, covers, and static assets
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

// Tombstone service worker: Lyceum no longer uses a service worker.
// This self-destructing version exists only to clean up installs from the
// previous SWR-caching worker. On the next navigation a browser running an
// older sw.js byte-compares it against this file, installs this version,
// clears the old swr-* caches, and unregisters itself. After that the page
// is no longer controlled by any worker. Keep this file served at the same
// URL until the installed base has cycled through, then it can be deleted.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("swr-")).map(k => caches.delete(k)));
    await self.registration.unregister();
  })());
});
// no fetch handler → nothing is intercepted; next navigation is uncontrolled & fresh

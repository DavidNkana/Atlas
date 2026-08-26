// Atlas Service Worker — DISABLED 2026-08-26.
//
// Why this is a no-op now:
//   - Previous version cached EVERY fetched resource with cache-first semantics.
//   - On every Vercel deploy, new HTML/JS bundles (with new content hashes)
//     would not match the cached HTML's references. The cached page would
//     reference old bundle URLs that no longer existed on the server (404),
//     JS would fail to hydrate, and the page would render broken (notably
//     the News tabs would not respond to clicks and appeared to "disappear").
//   - Atlas does not actually rely on offline functionality. The PWA manifest
//     pre-cached only `/`, `/manifest.json`, `/AI.png` — none critical.
//
// What this SW does:
//   - Installs immediately and calls self.skipWaiting().
//   - On activate, deletes every Cache Storage entry ("atlas-v1", etc.) and
//     unregisters itself. This clears any stale state already in users'
//     browsers from the previous buggy SW.
//   - The app/layout.tsx registration script has ALSO been removed, so new
//     visitors will not install any SW at all.
//
// To re-enable PWA offline later, build a properly-versioned SW with
// network-first for HTML/JS routes and cache versioning on each deploy.
self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      // Clear every cache this origin might have created.
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      // Unregister ourselves so the browser drops us.
      await self.registration.unregister();
      // Force clients to reload so they pick up the unregistration.
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) => c.navigate(c.url));
    })(),
  );
});

// Kill-switch service worker.
//
// The previous /sw.js was meant only for the staff ticket-checker PWA but was
// registered globally in the root layout, so it intercepted every page on
// carferry.online with a cache-first strategy. Returning visitors got stuck on
// stale HTML referencing Next.js chunks that no longer existed, breaking
// hydration (and with it scrolling, navigation, etc.).
//
// This replacement SW takes over the existing registration, clears every
// cached entry, unregisters itself, and reloads any open tabs so they pick up
// fresh content from the network. Each step is independently guarded so the
// activate event never rejects — if waitUntil rejected, the new SW would go
// redundant and the old buggy SW would stay in control.

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Claim existing tabs first. Without this, the new SW is the active SW
      // for the registration but is not the controller of already-open tabs
      // (their controller is still the old, now-redundant SW). client.navigate
      // rejects with TypeError on uncontrolled clients, so the auto-reload
      // below would silently fail without claim().
      try {
        await self.clients.claim();
      } catch {
        // Ignore — auto-reload may not fire, but clearing caches and
        // unregistering below still recover users on next manual refresh.
      }

      try {
        const cacheKeys = await caches.keys();
        await Promise.allSettled(cacheKeys.map((key) => caches.delete(key)));
      } catch {
        // Ignore — proceed to unregister even if caches couldn't be enumerated.
      }

      try {
        const windowClients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        for (const client of windowClients) {
          try {
            await client.navigate(client.url);
          } catch {
            // Cross-origin or detached clients can't be navigated. The SW is
            // about to be unregistered, so the next manual reload will be clean.
          }
        }
      } catch {
        // Ignore.
      }

      // Unregister last so the navigations kicked off above still have a
      // controller while in-flight. By the time the reloaded pages mount, the
      // registration is gone and no SW intercepts their requests.
      try {
        await self.registration.unregister();
      } catch {
        // Ignore.
      }
    })()
  );
});

// No fetch handler on purpose: until activation completes, the old SW is still
// in control. Once this SW activates and unregisters, the browser stops
// intercepting requests entirely.

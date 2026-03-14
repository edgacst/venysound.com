// Minimal service worker for PWA installability (TWA requirement) + Web Push.
// Network-first: always fetch from network, no caching.
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
self.addEventListener("push", (event) => {
  let data = { title: "Venysound", body: "", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {}
  const opts = {
    body: data.body,
    icon: "/favicon.png",
    badge: "/favicon.png",
    data: { url: data.url || "/" },
  };
  event.waitUntil(
    self.registration.showNotification(data.title || "Venysound", opts)
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      if (clients.length) {
        const c = clients.find((x) => x.visibilityState === "visible") || clients[0];
        c.navigate(url);
        c.focus();
      } else if (self.clients.openWindow) {
        self.clients.openWindow(url);
      }
    })
  );
});

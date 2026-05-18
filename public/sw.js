// MOMENTUM Service Worker — push + notification handling only.
// No precaching, no navigation interception. Safe in iframes & previews.
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { title: "MOMENTUM", body: event.data?.text() || "" }; }
  const title = payload.title || "MOMENTUM";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || payload.kind || "momentum",
    renotify: true,
    data: { url: payload.url || "/dashboard", id: payload.id || null, kind: payload.kind || null },
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  event.notification.close();
  const url = data.url || "/dashboard";
  const trackUrl = data.id ? `/api/public/hooks/notification-opened?id=${data.id}` : null;
  event.waitUntil((async () => {
    if (trackUrl) { try { await fetch(trackUrl, { method: "POST", keepalive: true }); } catch {} }
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) { try { await c.navigate(url); } catch {} return c.focus(); }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});

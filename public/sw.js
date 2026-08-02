// Vega Safety Manager - PWA Service Worker

const CACHE = "vega-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(["/", "/manifest.json", "/images/logo.png", "/favicon.ico"])
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match("/")))
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "Vega Safety Alert", body: "Important update from your event organizer." };
  try {
    if (event.data) data = event.data.json();
  } catch {
    /* ignore */
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Vega Safety Alert", {
      body: data.body || "Please check your safety status.",
      icon: "/images/logo.png",
      badge: "/favicon.ico",
      tag: data.tag || "vega-safety-alert",
      renotify: true,
      data: data.url || "/",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

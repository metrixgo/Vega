// Vega Safety Manager - PWA Service Worker for Background Web Push Notifications

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "Vega Safety Alert", body: "Important update from your event organizer." };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch {
    /* ignore parse error */
  }

  const title = data.title || "Vega Safety Alert";
  const options = {
    body: data.body || "Please check your safety status.",
    icon: "/images/logo.png",
    badge: "/favicon.ico",
    tag: data.tag || "vega-safety-alert",
    renotify: true,
    data: data.url || "/",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

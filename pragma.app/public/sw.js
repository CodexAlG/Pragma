self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();

    event.waitUntil(
      self.registration.showNotification(data.title || 'Pragma', {
        body: data.body,
        tag: data.tag,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: data.url || '/hoy' },
      })
    );
  } catch (error) {
    console.error('SW push error:', error);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/hoy'));
});

// No fetch handler — do not intercept any navigation or requests

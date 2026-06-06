// Pragma Service Worker — Web Push Notifications
// Este SW se registra en el navegador y recibe eventos PUSH del servidor
// para mostrar notificaciones incluso cuando la app está cerrada.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Recibir el evento PUSH del servidor
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Pragma', body: event.data.text() };
  }

  const title = payload.title || 'Pragma Recordatorio';
  const options = {
    body: payload.body || '',
    icon: '/origami_p_icon.png',
    badge: '/origami_p_icon.png',
    tag: payload.tag || 'pragma-notif',
    data: {
      url: payload.url || '/hoy',
    },
    requireInteraction: false,
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Al hacer clic en la notificación, abrir/enfocar la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Construir URL absoluta para que funcione en móvil
  const relativeUrl = event.notification.data?.url || '/hoy';
  const absoluteUrl = new URL(relativeUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si ya hay una ventana abierta de la app, enfocarla
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(absoluteUrl);
          return client.focus();
        }
      }
      // Si no hay ventana abierta, abrir una nueva
      if (clients.openWindow) {
        return clients.openWindow(absoluteUrl);
      }
    })
  );
});

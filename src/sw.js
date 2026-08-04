import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkOnly } from 'workbox-strategies'

precacheAndRoute(self.__WB_MANIFEST)

// El backend nunca se cachea: siempre red primero (igual que antes con generateSW)
registerRoute(/^\/api\//, new NetworkOnly())

self.skipWaiting()
self.addEventListener('activate', () => self.clients.claim())

// ---------- Notificaciones push (ingresos de dinero al admin) ----------
self.addEventListener('push', (event) => {
  let data = { titulo: 'Sistema de Nómina', cuerpo: '', url: '/' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    data.cuerpo = event.data?.text() || ''
  }
  event.waitUntil(
    self.registration.showNotification(data.titulo, {
      body: data.cuerpo,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { url: data.url },
    })
  )
})

// Al tocar la notificación: enfoca una pestaña abierta o abre una nueva en la URL indicada
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})

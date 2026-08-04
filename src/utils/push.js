// Suscripción a notificaciones push del navegador (ingresos de dinero al admin).
// Requiere HTTPS (o localhost) y un Service Worker activo — vite-plugin-pwa ya lo registra.

export function pushSoportado() {
  return 'serviceWorker' in navigator && 'PushManager' in window
}

function base64UrlToUint8Array(base64Url) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

async function http(path, options = {}) {
  const token = sessionStorage.getItem('nomina_token')
  const res = await fetch('/api' + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`Error ${res.status}`)
  return res.status === 204 ? null : res.json()
}

// ¿Este dispositivo ya tiene una suscripción push activa?
export async function pushEstaActivo() {
  if (!pushSoportado()) return false
  const registration = await navigator.serviceWorker.ready
  const sub = await registration.pushManager.getSubscription()
  return !!sub
}

export async function pushActivar() {
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('Debes conceder permiso de notificaciones en el navegador')

  const { publicKey } = await http('/push/public-key')
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(publicKey),
  })
  await http('/push/suscribir', { method: 'POST', body: JSON.stringify({ subscription }) })
}

export async function pushDesactivar() {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  await http('/push/suscribir', { method: 'DELETE', body: JSON.stringify({ endpoint }) })
}

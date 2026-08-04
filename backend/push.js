import webpush from 'web-push'
import db from './db.js'

// ---------- Claves VAPID (persistentes, generadas una sola vez) ----------
function getVapidKeys() {
  let row = db.prepare('SELECT public_key, private_key FROM vapid_keys WHERE id = 1').get()
  if (!row) {
    const { publicKey, privateKey } = webpush.generateVAPIDKeys()
    db.prepare('INSERT INTO vapid_keys (id, public_key, private_key) VALUES (1, ?, ?)').run(publicKey, privateKey)
    row = { public_key: publicKey, private_key: privateKey }
  }
  return row
}

const { public_key: VAPID_PUBLIC_KEY, private_key: VAPID_PRIVATE_KEY } = getVapidKeys()

webpush.setVapidDetails('mailto:soporte@luxarma.cloud', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

export function publicKey() {
  return VAPID_PUBLIC_KEY
}

// Guarda (o reemplaza) la suscripción de este dispositivo para el usuario dado
export function suscribir(usuarioId, subscription) {
  const { endpoint, keys } = subscription
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return { ok: false, error: 'Suscripción inválida' }
  }
  db.prepare(
    `INSERT INTO push_subscripciones (usuario_id, endpoint, p256dh, auth, creado)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth`
  ).run(usuarioId, endpoint, keys.p256dh, keys.auth, new Date().toISOString())
  return { ok: true }
}

export function desuscribir(endpoint) {
  db.prepare('DELETE FROM push_subscripciones WHERE endpoint = ?').run(endpoint)
  return { ok: true }
}

// Envía una notificación a todos los administradores suscritos. Limpia en
// silencio las suscripciones que el navegador ya invalidó (410/404).
export async function notificarAdmins({ titulo, cuerpo, url = '/control-dinero' }) {
  const subs = db.prepare(
    `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
     FROM push_subscripciones ps
     JOIN usuarios u ON u.id = ps.usuario_id
     WHERE u.rol = 'admin'`
  ).all()

  const payload = JSON.stringify({ titulo, cuerpo, url })

  await Promise.all(
    subs.map(async (s) => {
      const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }
      try {
        await webpush.sendNotification(subscription, payload)
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          db.prepare('DELETE FROM push_subscripciones WHERE id = ?').run(s.id)
        } else {
          console.error('Error enviando notificación push:', err.message)
        }
      }
    })
  )
}

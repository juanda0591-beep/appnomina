import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import webpush from 'web-push'

process.env.DB_PATH = ':memory:'
const { avisoMovimiento, notificarAdmins } = await import('./push.js')
const { default: db } = await import('./db.js')
after(() => db.close())

test('el aviso push distingue ingresos y gastos y abre Control de dinero', () => {
  const datos = { monto: 125000, categoria: 'Materiales', descripcion: 'Compra de MDF' }
  const ingreso = avisoMovimiento({ ...datos, tipo: 'ingreso' })
  const gasto = avisoMovimiento({ ...datos, tipo: 'gasto' })
  assert.equal(ingreso.titulo, '💰 Ingreso registrado')
  assert.equal(gasto.titulo, '💸 Gasto registrado')
  assert.equal(gasto.cuerpo, ingreso.cuerpo)
  assert.match(gasto.cuerpo, /125\.000.*Materiales.*Compra de MDF/)
  assert.equal(gasto.url, '/control-dinero')
  assert.deepEqual(avisoMovimiento({ tipo: 'gasto', monto: 5000 }).url, '/control-dinero')
})

test('envía el gasto a los dispositivos administradores suscritos', async () => {
  const admin = db.prepare("INSERT INTO usuarios (username, salt, hash, rol) VALUES ('admin-push', 's', 'h', 'admin')").run().lastInsertRowid
  const usuario = db.prepare("INSERT INTO usuarios (username, salt, hash, rol) VALUES ('usuario-push', 's', 'h', 'usuario')").run().lastInsertRowid
  const suscribir = db.prepare('INSERT INTO push_subscripciones (usuario_id, endpoint, p256dh, auth, creado) VALUES (?, ?, ?, ?, ?)')
  suscribir.run(admin, 'https://push.example/admin', 'clave', 'auth', '2026-10-31')
  suscribir.run(usuario, 'https://push.example/usuario', 'clave', 'auth', '2026-10-31')
  const enviarOriginal = webpush.sendNotification
  const envios = []
  webpush.sendNotification = async (subscripcion, payload) => { envios.push({ subscripcion, data: JSON.parse(payload) }) }
  try {
    await notificarAdmins(avisoMovimiento({ tipo: 'gasto', monto: 125000, categoria: 'Materiales', descripcion: 'Compra de MDF' }))
    assert.equal(envios.length, 1)
    assert.equal(envios[0].subscripcion.endpoint, 'https://push.example/admin')
    assert.equal(envios[0].data.titulo, '💸 Gasto registrado')
    assert.match(envios[0].data.cuerpo, /125\.000.*Materiales.*Compra de MDF/)
    assert.equal(envios[0].data.url, '/control-dinero')
  } finally {
    webpush.sendNotification = enviarOriginal
  }
})

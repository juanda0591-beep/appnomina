import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { migrarWhatsApp, adquirirWorker, latidoWorker, registrarBaja, elegible, encolarPedidoWhatsApp, procesarMensaje } from './whatsapp.js'
import { estadoAuthSqlite, crearProveedorBaileys } from './whatsapp-baileys.js'
import { EventEmitter } from 'node:events'

function base() {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE portal_cuentas (id INTEGER PRIMARY KEY, correo TEXT, telefono TEXT, ofertas INTEGER DEFAULT 0, notificaciones INTEGER DEFAULT 0, estado TEXT, negocio TEXT, cliente_id INTEGER, actualizado TEXT);
    CREATE TABLE pedidos (id INTEGER PRIMARY KEY, estado TEXT, total REAL, fecha_entrega TEXT);
    CREATE TABLE portal_pedidos (id INTEGER PRIMARY KEY, pedido_id INTEGER, cuenta_id INTEGER);
    CREATE TABLE empresa (id INTEGER PRIMARY KEY, nombre TEXT); INSERT INTO empresa VALUES (1, 'Marca prueba');`)
  migrarWhatsApp(db); return db
}

function preparado() {
  const db = base()
  db.exec(`INSERT INTO portal_cuentas VALUES(1,'a@a.co','3001234567',1,1,'aprobado','Tienda A',1,'');
    INSERT INTO pedidos VALUES(7,'pendiente',225000,NULL); INSERT INTO portal_pedidos VALUES(1,7,1);
    UPDATE wa_config SET automaticos=1, conectar=1, pausado=0;`)
  encolarPedidoWhatsApp(db, 7, 'recibido'); adquirirWorker(db, 'worker')
  return db
}

test('cola: envía una vez, no procesa desconectado ni con otro propietario', async () => {
  const db = preparado(); let n = 0
  const proveedor = { conectado: () => true, existe: async () => true, enviar: async () => { n++ } }
  assert.equal(await procesarMensaje(db, { ...proveedor, conectado: () => false }, 'worker'), false)
  assert.equal(await procesarMensaje(db, proveedor, 'ajeno'), false)
  await Promise.all([procesarMensaje(db, proveedor, 'worker'), procesarMensaje(db, proveedor, 'worker')])
  assert.equal(n, 1); assert.equal(db.prepare('SELECT estado FROM wa_mensajes').get().estado, 'enviado')
  await procesarMensaje(db, proveedor, 'worker'); assert.equal(n, 1); db.close()
})

test('cola: error antes de transmitir reintenta, resultado incierto requiere revisión y reinicio no duplica', async () => {
  const db = preparado(); let n = 0
  const proveedor = { conectado: () => true, existe: async () => { throw Error('sin red') }, enviar: async () => { n++; throw Error('respuesta perdida') } }
  await procesarMensaje(db, proveedor, 'worker')
  let m = db.prepare('SELECT * FROM wa_mensajes').get()
  assert.equal(m.estado, 'pendiente'); assert.ok(m.proximo > Date.now()); assert.equal(n, 0)
  db.exec('UPDATE wa_mensajes SET proximo=0')
  await procesarMensaje(db, { ...proveedor, existe: async () => true }, 'worker')
  assert.equal(db.prepare('SELECT estado FROM wa_mensajes').get().estado, 'revisar'); assert.equal(n, 1)
  await procesarMensaje(db, proveedor, 'worker'); assert.equal(n, 1)
  db.exec("UPDATE wa_mensajes SET estado='enviando'; UPDATE wa_worker SET latido=0")
  assert.ok(adquirirWorker(db, 'nuevo'))
  assert.equal(db.prepare('SELECT estado FROM wa_mensajes').get().estado, 'revisar'); db.close()
})

test('cola: pausa o baja durante la comprobación del número impide la transmisión', async () => {
  for (const accion of ['pausa','baja','suspendido','caducado','cancelado']) {
    const db = preparado(); let n = 0
    await procesarMensaje(db, { conectado: () => true, existe: async () => {
      if (accion === 'pausa') db.exec('UPDATE wa_config SET pausado=1')
      if (accion === 'baja') registrarBaja(db, '3001234567')
      if (accion === 'suspendido') db.exec("UPDATE portal_cuentas SET estado='suspendido'")
      if (accion === 'caducado') db.exec('UPDATE wa_worker SET latido=0')
      if (accion === 'cancelado') db.exec("UPDATE wa_mensajes SET estado='cancelado'")
      return true
    }, enviar: async () => { n++ } }, 'worker')
    assert.equal(n, 0, accion); db.close()
  }
})

test('notificaciones: transacción revierte mensaje y cambios de fecha reemplazan pendientes', () => {
  const db = preparado()
  assert.throws(() => db.transaction(() => { encolarPedidoWhatsApp(db, 7, 'venta'); throw Error('rollback') })())
  assert.equal(db.prepare('SELECT count(*) n FROM wa_mensajes').get().n, 1)
  db.exec("UPDATE pedidos SET fecha_entrega='2026-10-03'")
  encolarPedidoWhatsApp(db, 7, 'fecha'); encolarPedidoWhatsApp(db, 7, 'fecha')
  assert.equal(db.prepare("SELECT count(*) n FROM wa_mensajes WHERE tipo='fecha' AND estado='pendiente'").get().n, 1)
  db.exec('UPDATE wa_config SET automaticos=0')
  encolarPedidoWhatsApp(db, 7, 'anulado')
  assert.equal(db.prepare("SELECT count(*) n FROM wa_mensajes WHERE estado='pendiente'").get().n, 0); db.close()
})

test('adaptador: persistencia de claves, mensaje, baja por teléfono y exclusión de grupos/historial', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wa-auth-'))
  const ev = new EventEmitter(), estados = [], bajas = [], envios = []
  const fake = { BufferJSON: { replacer: undefined, reviver: undefined }, initAuthCreds: () => ({ prueba: 1 }),
    proto: { Message: { AppStateSyncKeyData: { fromObject: (x) => x } } }, DisconnectReason: { loggedOut: 401, badSession: 500, connectionReplaced: 440 },
    default: () => ({ ev, user: { id: '573000000000:1@s.whatsapp.net' }, onWhatsApp: async () => [{ exists: true }],
      sendMessage: async (...args) => { envios.push(args) }, logout: async () => {}, end: () => {} }) }
  let auth = await estadoAuthSqlite(fake, dir)
  await auth.state.keys.set({ sesion: { a: { numero: 7 } } }); auth.guardar(); auth.cerrar()
  auth = await estadoAuthSqlite(fake, dir)
  assert.equal((await auth.state.keys.get('sesion', ['a'])).a.numero, 7)
  auth.state.creds.registered = true
  const proveedor = crearProveedorBaileys({ b: fake, auth, estado: (s) => estados.push(s), baja: (n) => bajas.push(n), desvinculado: () => {} })
  ev.emit('connection.update', { connection: 'open' }); assert.ok(proveedor.conectado())
  await proveedor.enviar('573001234567', 'Pedido de prueba', 'IDPRUEBA')
  assert.equal(envios[0][2].messageId, 'IDPRUEBA')
  for (const [jid, type] of [['573001234567@s.whatsapp.net','notify'], ['12345@lid','notify'], ['grupo@g.us','notify'], ['573009999999@s.whatsapp.net','append']]) ev.emit('messages.upsert', { type, messages: [{ key: { remoteJid: jid }, message: { conversation: 'BAJA' } }] })
  assert.deepEqual(bajas, ['573001234567'])
  await proveedor.cerrar(true); assert.equal(proveedor.conectado(), false)
  assert.equal(auth.state.creds.registered, undefined, 'Olvidar también descarta las credenciales en memoria')
  assert.equal((await auth.state.keys.get('sesion', ['a'])).a, null)
  auth.cerrar(); await rm(dir, { recursive: true, force: true })
})

test('adaptador: el bloqueo de red se muestra como error y no produce reconexiones automáticas', async () => {
  const ev = new EventEmitter(), estados = []
  let intentos = 0
  const b = { default: () => { intentos++; return { ev, end() {} } }, DisconnectReason: { loggedOut: 401, badSession: 500, connectionReplaced: 440 } }
  const auth = { state: { creds: {}, keys: { get: async () => ({}), set: async () => {} } }, guardar() {} }
  const p = crearProveedorBaileys({ b, auth, estado: (e) => estados.push(e), baja() {}, desvinculado() { assert.fail('No es una desvinculación') } })
  ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { data: { code: 'EACCES' }, output: { statusCode: 408 } } } })
  assert.equal(estados.at(-1).estado, 'error')
  assert.match(estados.at(-1).error, /bloquea el acceso de red/)
  assert.equal(p.conectado(), false)
  assert.equal(intentos, 1)
  await p.cerrar()
})

test('WhatsApp: migración, consentimientos, bajas, cola idempotente y propietario único', () => {
  const db = base()
  db.prepare("INSERT INTO portal_cuentas VALUES (1, 'a@a.co', '3001234567', 1, 1, 'aprobado', 'Tienda A', 1, '')").run()
  db.prepare("INSERT INTO pedidos VALUES (7, 'pendiente', 225000, NULL)").run()
  db.prepare("INSERT INTO portal_pedidos VALUES (1, 7, 1)").run()
  db.prepare('UPDATE wa_config SET automaticos=1, conectar=1, pausado=0 WHERE id=1').run()
  encolarPedidoWhatsApp(db, 7, 'recibido')
  encolarPedidoWhatsApp(db, 7, 'recibido')
  assert.equal(db.prepare('SELECT count(*) n FROM wa_mensajes').get().n, 1)
  const m = db.prepare('SELECT * FROM wa_mensajes').get()
  assert.equal(m.telefono, '573001234567'); assert.equal(m.estado, 'pendiente'); assert.equal(elegible(db, m), null)
  assert.equal(adquirirWorker(db, 'uno', Date.now()), true)
  assert.equal(adquirirWorker(db, 'dos', Date.now()), false)
  assert.equal(latidoWorker(db, 'dos'), false); assert.equal(latidoWorker(db, 'uno'), true)
  registrarBaja(db, '3001234567')
  assert.equal(db.prepare('SELECT ofertas,notificaciones FROM portal_cuentas WHERE id=1').get().ofertas, 0)
  assert.equal(db.prepare('SELECT estado FROM wa_mensajes WHERE id=?').get(m.id).estado, 'cancelado')
  db.close()
})

test('WhatsApp: la migración se puede ejecutar varias veces y la clave privada no queda en la base principal', async () => {
  const carpeta = await mkdtemp(join(tmpdir(), 'wa-migracion-'))
  const db = new Database(join(carpeta, 'principal.db'))
  db.exec(`CREATE TABLE portal_cuentas (id INTEGER PRIMARY KEY, correo TEXT, telefono TEXT, ofertas INTEGER DEFAULT 0, notificaciones INTEGER DEFAULT 0, estado TEXT, negocio TEXT, cliente_id INTEGER, actualizado TEXT);
    CREATE TABLE pedidos (id INTEGER PRIMARY KEY, estado TEXT, total REAL, fecha_entrega TEXT);
    CREATE TABLE portal_pedidos (id INTEGER PRIMARY KEY, pedido_id INTEGER, cuenta_id INTEGER);
    CREATE TABLE empresa (id INTEGER PRIMARY KEY, nombre TEXT);`)
  migrarWhatsApp(db); migrarWhatsApp(db)
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name='wa_worker'").get().n, 1)
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name='auth'").get().n, 0)
  db.close(); await rm(carpeta, { recursive: true, force: true })
})

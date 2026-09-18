import { Router } from 'express'
import { randomBytes, randomUUID } from 'node:crypto'

const ahora = () => new Date().toISOString()
export const mensajeId = () => '3EB0' + randomBytes(10).toString('hex').toUpperCase()
export function telefonoWhatsApp(valor) {
  if (typeof valor !== 'string' || !/^[+\d\s().-]+$/.test(valor)) return null
  let n = valor.replace(/\D/g, '')
  if (n.length === 10 && n.startsWith('3')) n = '57' + n
  return /^[1-9]\d{10,14}$/.test(n) ? n : null
}
export function migrarWhatsApp(db) {
  if (!db.prepare('PRAGMA table_info(portal_cuentas)').all().some((c) => c.name === 'notificaciones')) {
    db.exec('ALTER TABLE portal_cuentas ADD COLUMN notificaciones INTEGER NOT NULL DEFAULT 0')
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS wa_config (
      id INTEGER PRIMARY KEY CHECK(id=1), automaticos INTEGER NOT NULL DEFAULT 0,
      pausado INTEGER NOT NULL DEFAULT 1, conectar INTEGER NOT NULL DEFAULT 0,
      comando INTEGER NOT NULL DEFAULT 0, olvidar INTEGER NOT NULL DEFAULT 0,
      intervalo INTEGER NOT NULL DEFAULT 15
    );
    INSERT OR IGNORE INTO wa_config(id) VALUES(1);
    CREATE TABLE IF NOT EXISTS wa_worker (
      id INTEGER PRIMARY KEY CHECK(id=1), propietario TEXT, latido INTEGER NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'apagado', numero TEXT NOT NULL DEFAULT '',
      qr TEXT, qr_expira INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT ''
    );
    INSERT OR IGNORE INTO wa_worker(id) VALUES(1);
    CREATE TABLE IF NOT EXISTS wa_campanas (
      id TEXT PRIMARY KEY, texto TEXT NOT NULL, destinatarios TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'borrador', creado TEXT NOT NULL, usuario TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wa_mensajes (
      id INTEGER PRIMARY KEY, clave TEXT NOT NULL UNIQUE, cuenta_id INTEGER NOT NULL,
      pedido_id INTEGER, campana_id TEXT, tipo TEXT NOT NULL, telefono TEXT,
      texto TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'pendiente',
      intentos INTEGER NOT NULL DEFAULT 0, proximo INTEGER NOT NULL DEFAULT 0,
      mensaje_id TEXT NOT NULL UNIQUE, error TEXT NOT NULL DEFAULT '',
      creado TEXT NOT NULL, actualizado TEXT NOT NULL, enviado TEXT,
      vence INTEGER NOT NULL, revision_usuario TEXT
    );
    CREATE INDEX IF NOT EXISTS wa_pendientes ON wa_mensajes(estado, proximo, id);
    CREATE TABLE IF NOT EXISTS wa_bajas (telefono TEXT PRIMARY KEY, creado TEXT NOT NULL);
  `)
}

export function encolarPedidoWhatsApp(db, pedidoId, tipo) {
  if (tipo === 'fecha' || tipo === 'anulado' || tipo === 'venta') db.prepare(`UPDATE wa_mensajes SET estado='cancelado', error='Sustituido por una actualización del pedido.', actualizado=?
    WHERE pedido_id=? AND estado IN ('pendiente','preparando') AND (tipo='fecha' OR ?='anulado')`).run(ahora(), pedidoId, tipo)
  if (!db.prepare('SELECT automaticos FROM wa_config WHERE id=1').get()?.automaticos) return
  const p = db.prepare(`SELECT p.*, pp.id portal_id, pp.cuenta_id, c.telefono, c.notificaciones, c.estado cuenta_estado
    FROM pedidos p JOIN portal_pedidos pp ON pp.pedido_id=p.id JOIN portal_cuentas c ON c.id=pp.cuenta_id WHERE p.id=?`).get(pedidoId)
  if (!p || !p.notificaciones || p.cuenta_estado !== 'aprobado') return
  const marca = db.prepare('SELECT nombre FROM empresa WHERE id=1').get()?.nombre || 'Tu proveedor'
  const total = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(p.total)
  let texto
  if (tipo === 'recibido') texto = `${marca}\nRecibimos tu pedido #${p.id}.\nTotal de productos: ${total}.\nLa disponibilidad, el envío y la fecha de entrega están pendientes de confirmación.`
  else if (tipo === 'fecha') texto = `${marca}\nPedido #${p.id}: ${p.fecha_entrega ? `la fecha de entrega prevista es ${p.fecha_entrega.slice(0, 10)}.` : 'la fecha de entrega está nuevamente pendiente de confirmación.'}`
  else if (tipo === 'venta') texto = `${marca}\nTu pedido #${p.id} fue procesado y convertido en venta.\nEsto no confirma la entrega física. Contacta a tu proveedor para coordinarla.`
  else if (tipo === 'anulado') texto = `${marca}\nTu pedido #${p.id} fue anulado. Contacta a tu proveedor si necesitas ayuda.`
  else return
  const clave = tipo === 'fecha' ? `pedido:${p.id}:fecha:${randomUUID()}` : `pedido:${p.id}:${tipo}`
  insertarMensaje(db, { clave, cuentaId: p.cuenta_id, pedidoId: p.id, tipo, telefono: p.telefono, texto })
}

function insertarMensaje(db, { clave, cuentaId, pedidoId = null, campanaId = null, tipo, telefono, texto }) {
  const numero = telefonoWhatsApp(telefono)
  db.prepare(`INSERT OR IGNORE INTO wa_mensajes
    (clave, cuenta_id, pedido_id, campana_id, tipo, telefono, texto, estado, mensaje_id, error, creado, actualizado, vence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(clave, cuentaId, pedidoId, campanaId, tipo, numero, texto,
    numero ? 'pendiente' : 'fallido', mensajeId(), numero ? '' : 'Teléfono inválido. El cliente debe corregir su número.', ahora(), ahora(), Date.now() + (tipo === 'oferta' ? 86400000 : 3 * 86400000))
}

export function elegible(db, m) {
  const c = db.prepare('SELECT * FROM portal_cuentas WHERE id=?').get(m.cuenta_id)
  if (!c || c.estado !== 'aprobado') return 'La cuenta no está habilitada.'
  if (telefonoWhatsApp(c.telefono) !== m.telefono) return 'El teléfono de la cuenta cambió. No se envió al número anterior.'
  if (db.prepare('SELECT telefono FROM wa_bajas WHERE telefono=?').get(m.telefono)) return 'El destinatario pidió dejar de recibir mensajes.'
  if (m.tipo === 'oferta' ? !c.ofertas : !c.notificaciones) return 'El cliente retiró su autorización.'
  if (m.vence <= Date.now()) return 'El mensaje venció antes de enviarse.'
  if (m.tipo !== 'oferta' && m.tipo !== 'anulado') {
    const p = db.prepare('SELECT estado FROM pedidos WHERE id=?').get(m.pedido_id)
    if (!p || p.estado === 'anulado') return 'El pedido fue anulado.'
  }
  return null
}

export function registrarBaja(db, telefono) {
  const numero = telefonoWhatsApp(telefono)
  if (!numero) return
  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO wa_bajas VALUES (?, ?)').run(numero, ahora())
    for (const c of db.prepare('SELECT id, telefono FROM portal_cuentas').all()) {
      if (telefonoWhatsApp(c.telefono) === numero) db.prepare('UPDATE portal_cuentas SET ofertas=0, notificaciones=0, actualizado=? WHERE id=?').run(ahora(), c.id)
    }
    db.prepare("UPDATE wa_mensajes SET estado='cancelado', error='Baja solicitada por WhatsApp.', actualizado=? WHERE telefono=? AND estado='pendiente'").run(ahora(), numero)
  })()
}

// Un único trabajador adquiere la cola. Tras una caída, no se reenvían mensajes
// cuya transmisión pudo haber comenzado: permanecen en revisión administrativa.
export function adquirirWorker(db, propietario, now = Date.now()) {
  return db.transaction(() => {
    const w = db.prepare('SELECT * FROM wa_worker WHERE id=1').get()
    if (w.propietario && w.latido > now - 60000) return false
    db.prepare("UPDATE wa_mensajes SET estado='revisar', error='El servicio se reinició durante un envío. Comprueba WhatsApp antes de reenviar.', actualizado=? WHERE estado IN ('enviando','preparando')").run(ahora())
    db.prepare("UPDATE wa_worker SET propietario=?, latido=?, estado='iniciando', qr=NULL, numero='', error='' WHERE id=1").run(propietario, now)
    return true
  }).immediate()
}
export function latidoWorker(db, propietario) {
  return db.prepare('UPDATE wa_worker SET latido=? WHERE id=1 AND propietario=?').run(Date.now(), propietario).changes === 1
}

export async function procesarMensaje(db, proveedor, propietario) {
  if (!proveedor.conectado()) return false
  const m = db.transaction(() => {
    const config = db.prepare('SELECT * FROM wa_config WHERE id=1').get()
    const worker = db.prepare('SELECT * FROM wa_worker WHERE id=1').get()
    if (config.pausado || !config.conectar || worker.propietario !== propietario || worker.latido < Date.now() - 30000) return null
    const row = db.prepare("SELECT * FROM wa_mensajes WHERE estado='pendiente' AND proximo<=? ORDER BY CASE WHEN tipo='oferta' THEN 1 ELSE 0 END, id LIMIT 1").get(Date.now())
    if (!row) return null
    const motivo = elegible(db, row)
    if (motivo) { db.prepare("UPDATE wa_mensajes SET estado='cancelado', error=?, actualizado=? WHERE id=?").run(motivo, ahora(), row.id); return null }
    db.prepare("UPDATE wa_mensajes SET estado='preparando', intentos=intentos+1, actualizado=? WHERE id=?").run(ahora(), row.id)
    return { ...row, intentos: row.intentos + 1 }
  }).immediate()
  if (!m) return false
  try {
    const existe = await proveedor.existe(m.telefono)
    if (!existe) {
      db.prepare("UPDATE wa_mensajes SET estado='fallido', error='El número no tiene una cuenta de WhatsApp disponible.', actualizado=? WHERE id=? AND estado='preparando'").run(ahora(), m.id)
      return true
    }
  } catch {
    db.prepare("UPDATE wa_mensajes SET estado=?, proximo=?, error='No se pudo comprobar el número. No se inició el envío.', actualizado=? WHERE id=? AND estado='preparando'")
      .run(m.intentos >= 5 ? 'fallido' : 'pendiente', Date.now() + Math.min(3600000, 30000 * 2 ** m.intentos), ahora(), m.id)
    return true
  }
  const puede = db.transaction(() => {
    const config = db.prepare('SELECT * FROM wa_config WHERE id=1').get()
    const worker = db.prepare('SELECT * FROM wa_worker WHERE id=1').get()
    const motivo = elegible(db, m)
    if (motivo) { db.prepare("UPDATE wa_mensajes SET estado='cancelado', error=?, actualizado=? WHERE id=? AND estado='preparando'").run(motivo, ahora(), m.id); return false }
    if (config.pausado || !config.conectar || worker.propietario !== propietario || worker.latido < Date.now() - 30000 || !proveedor.conectado()) {
      db.prepare("UPDATE wa_mensajes SET estado='pendiente', actualizado=? WHERE id=? AND estado='preparando'").run(ahora(), m.id); return false
    }
    return db.prepare("UPDATE wa_mensajes SET estado='enviando', actualizado=? WHERE id=? AND estado='preparando'").run(ahora(), m.id).changes === 1
  }).immediate()
  if (!puede) return false
  try {
    await proveedor.enviar(m.telefono, m.texto, m.mensaje_id)
    db.prepare("UPDATE wa_mensajes SET estado='enviado', enviado=?, actualizado=?, error='' WHERE id=? AND estado='enviando'").run(ahora(), ahora(), m.id)
  } catch {
    db.prepare("UPDATE wa_mensajes SET estado='revisar', error='WhatsApp no confirmó el resultado. Comprueba la conversación antes de reenviar.', actualizado=? WHERE id=? AND estado='enviando'").run(ahora(), m.id)
  }
  return true
}

class ErrorWA extends Error { constructor(message, status = 400) { super(message); this.status = status } }
const exigir = (v, msg, status) => { if (!v) throw new ErrorWA(msg, status) }
const manejar = (f) => (req, res, next) => { try { f(req, res) } catch (e) { next(e) } }
function audiencia(db) {
  const vistos = new Set()
  return db.prepare("SELECT id, negocio, telefono FROM portal_cuentas WHERE estado='aprobado' AND ofertas=1 ORDER BY id").all().flatMap((c) => {
    const telefono = telefonoWhatsApp(c.telefono)
    if (!telefono || vistos.has(telefono) || db.prepare('SELECT telefono FROM wa_bajas WHERE telefono=?').get(telefono)) return []
    vistos.add(telefono)
    return [{ id: c.id, negocio: c.negocio, telefono }]
  })
}
export function rutasWhatsApp(db, adminRequired) {
  const r = Router()
  r.use(adminRequired, (req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  r.get('/estado', (req, res) => {
    const c = db.prepare('SELECT * FROM wa_config WHERE id=1').get(), w = db.prepare('SELECT * FROM wa_worker WHERE id=1').get()
    const activo = w.latido > Date.now() - 30000
    res.json({ config: c, activo, estado: activo ? w.estado : 'apagado', numero: activo ? w.numero : '',
      qr: activo && w.qr_expira > Date.now() ? w.qr : null, error: w.error,
      totales: db.prepare('SELECT estado, count(*) cantidad FROM wa_mensajes GROUP BY estado').all(), destinatarios: audiencia(db) })
  })
  r.put('/config', manejar((req, res) => {
    const { automaticos, pausado, intervalo } = req.body
    exigir(typeof automaticos === 'boolean' && typeof pausado === 'boolean' && Number.isInteger(intervalo) && intervalo >= 10 && intervalo <= 300, 'Configuración inválida. El intervalo debe estar entre 10 y 300 segundos.')
    db.prepare('UPDATE wa_config SET automaticos=?, pausado=?, intervalo=? WHERE id=1').run(+automaticos, +pausado, intervalo)
    res.json({ ok: true })
  }))
  r.post('/conexion', manejar((req, res) => {
    const { accion } = req.body
    exigir(['conectar', 'desconectar', 'desvincular'].includes(accion), 'Acción inválida.')
    db.prepare('UPDATE wa_config SET conectar=?, comando=comando+1, olvidar=max(olvidar,?), pausado=1 WHERE id=1').run(accion === 'conectar' ? 1 : 0, accion === 'desvincular' ? 1 : 0)
    res.json({ ok: true })
  }))
  r.get('/mensajes', (req, res) => {
    const pagina = Math.max(1, Math.min(100000, Number(req.query.pagina) || 1))
    const estados = ['pendiente','preparando','enviando','enviado','fallido','revisar','cancelado']
    const estado = estados.includes(req.query.estado) ? req.query.estado : ''
    const where = estado ? 'WHERE m.estado=?' : '', args = estado ? [estado] : []
    const total = db.prepare(`SELECT count(*) n FROM wa_mensajes m ${where}`).get(...args).n
    const mensajes = db.prepare(`SELECT m.*, c.negocio FROM wa_mensajes m LEFT JOIN portal_cuentas c ON c.id=m.cuenta_id ${where} ORDER BY m.id DESC LIMIT 30 OFFSET ?`).all(...args, (Math.floor(pagina) - 1) * 30)
    res.json({ mensajes, total, pagina: Math.floor(pagina) })
  })
  r.post('/mensajes/:id', manejar((req, res) => {
    db.transaction(() => {
      const m = db.prepare('SELECT * FROM wa_mensajes WHERE id=?').get(req.params.id)
      exigir(m, 'Mensaje no encontrado.', 404)
      if (req.body.accion === 'cancelar') {
        exigir(['pendiente','fallido','revisar','preparando'].includes(m.estado), 'El mensaje ya está en transmisión o finalizado.', 409)
        db.prepare("UPDATE wa_mensajes SET estado='cancelado', actualizado=?, revision_usuario=? WHERE id=?").run(ahora(), req.usuario, m.id)
      } else {
        exigir(req.body.accion === 'reintentar' && ['fallido','revisar'].includes(m.estado), 'Este mensaje no admite reintento.', 409)
        exigir(req.body.confirmado === true, 'Confirma la revisión de la conversación antes de reenviar.')
        const motivo = elegible(db, m); exigir(!motivo, motivo, 409)
        db.prepare("UPDATE wa_mensajes SET estado='pendiente', intentos=0, proximo=0, mensaje_id=?, error='', actualizado=?, revision_usuario=? WHERE id=?")
          .run(mensajeId(), ahora(), req.usuario, m.id)
      }
    }).immediate()
    res.json({ ok: true })
  }))
  r.post('/campanas/preparar', manejar((req, res) => {
    const texto = req.body.texto?.trim()
    exigir(typeof texto === 'string' && texto.length >= 10 && texto.length <= 1500, 'Escribe una oferta de entre 10 y 1500 caracteres.')
    const ids = req.body.cuentas
    exigir(Array.isArray(ids) && ids.length > 0 && ids.length <= 500 && ids.every(Number.isSafeInteger), 'Selecciona entre 1 y 500 destinatarios.')
    const seleccion = audiencia(db).filter((c) => ids.includes(c.id))
    exigir(seleccion.length === new Set(ids).size, 'Cambió la autorización de un destinatario. Actualiza la lista.', 409)
    const marca = db.prepare('SELECT nombre FROM empresa WHERE id=1').get()?.nombre || 'Tu proveedor'
    const mensaje = `${marca}\n${texto}\n\nPara dejar de recibir mensajes por WhatsApp, responde BAJA. También puedes ajustar tus preferencias en Mi cuenta del catálogo.`
    const id = randomUUID()
    db.prepare('INSERT INTO wa_campanas (id,texto,destinatarios,creado,usuario) VALUES(?,?,?,?,?)').run(id, mensaje, JSON.stringify(seleccion), ahora(), req.usuario)
    res.status(201).json({ id, texto: mensaje, destinatarios: seleccion })
  }))
  r.post('/campanas/:id/confirmar', manejar((req, res) => {
    const result = db.transaction(() => {
      const c = db.prepare('SELECT * FROM wa_campanas WHERE id=?').get(req.params.id)
      exigir(c, 'Campaña no encontrada.', 404)
      exigir(req.body.confirmado === true, 'Confirma el texto y los destinatarios.')
      if (c.estado === 'encolada') return { ok: true, repetido: true }
      exigir(c.estado === 'borrador' && Date.parse(c.creado) > Date.now() - 1800000, 'La vista previa venció. Prepara una nueva.', 409)
      const destinatarios = JSON.parse(c.destinatarios), vigentes = audiencia(db)
      exigir(destinatarios.every((d) => vigentes.some((v) => v.id === d.id && v.telefono === d.telefono)), 'Cambió un destinatario o su autorización. Prepara otra vista previa.', 409)
      for (const d of destinatarios) insertarMensaje(db, { clave: `campana:${c.id}:${d.telefono}`, cuentaId: d.id, campanaId: c.id, tipo: 'oferta', telefono: d.telefono, texto: c.texto })
      db.prepare("UPDATE wa_campanas SET estado='encolada' WHERE id=?").run(c.id)
      return { ok: true, cantidad: destinatarios.length }
    }).immediate()
    res.json(result)
  }))
  r.use((err, req, res, next) => {
    if (res.headersSent) return next(err)
    res.status(err instanceof ErrorWA ? err.status : 500).json({ error: err instanceof ErrorWA ? err.message : 'No se pudo completar la operación de WhatsApp.' })
  })
  return r
}

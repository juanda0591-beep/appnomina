import { Router } from 'express'
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { migrarImagenes, fotosProducto, prepararImagenes, guardarImagenes, ErrorImagen } from './portal-imagenes.js'
import { encolarPedidoWhatsApp, telefonoWhatsApp } from './whatsapp.js'

const derivar = promisify(scrypt)
const digest = (v) => createHash('sha256').update(v).digest('hex')
const ahora = () => new Date().toISOString()
const COOKIE = 'mayorista_sesion'
const DURACION = 7 * 86400000
class ErrorPortal extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}
const exigir = (ok, mensaje, status = 400) => { if (!ok) throw new ErrorPortal(mensaje, status) }
const texto = (v, max, obligatorio = false) => {
  exigir(typeof v === 'string' && v.trim().length <= max && (!obligatorio || v.trim()), 'Revisa los campos obligatorios y su longitud.')
  return v.trim()
}
const entero = (v, min = 1, max = 1000000) => Number.isSafeInteger(v) && v >= min && v <= max
const manejar = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(next)
const errores = (err, req, res, next) => {
  if (res.headersSent) return next(err)
  const conocido = err instanceof ErrorPortal || err instanceof ErrorImagen
  if (!conocido) console.error('Error del portal:', err.message)
  res.status(err.status || 500).json({ error: conocido ? err.message : 'No se pudo completar la operación. Intenta de nuevo.' })
}

export function migrarPortal(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS portal_cuentas (
      id INTEGER PRIMARY KEY, correo TEXT NOT NULL UNIQUE COLLATE NOCASE,
      salt TEXT NOT NULL, hash TEXT NOT NULL, negocio TEXT NOT NULL, contacto TEXT NOT NULL,
      nit TEXT NOT NULL, telefono TEXT NOT NULL, direccion TEXT NOT NULL, municipio TEXT NOT NULL,
      ofertas INTEGER NOT NULL DEFAULT 0, consentimiento_fecha TEXT,
      estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','aprobado','suspendido','rechazado')),
      cliente_id INTEGER UNIQUE REFERENCES clientes(id) ON DELETE RESTRICT,
      creado TEXT NOT NULL, actualizado TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_sesiones (
      hash TEXT PRIMARY KEY, cuenta_id INTEGER NOT NULL REFERENCES portal_cuentas(id) ON DELETE CASCADE,
      expira INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS portal_sesiones_cuenta ON portal_sesiones(cuenta_id);
    CREATE TABLE IF NOT EXISTS portal_limites (clave TEXT PRIMARY KEY, cantidad INTEGER NOT NULL, expira INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS portal_productos (
      producto_id INTEGER PRIMARY KEY REFERENCES productos(id) ON DELETE CASCADE,
      publicado INTEGER NOT NULL DEFAULT 0, categoria TEXT NOT NULL DEFAULT '',
      descripcion TEXT NOT NULL DEFAULT '', medidas TEXT NOT NULL DEFAULT '',
      minimo INTEGER NOT NULL DEFAULT 1, precio REAL,
      modalidad TEXT NOT NULL DEFAULT 'encargo' CHECK(modalidad IN ('encargo','stock')),
      imagen BLOB, actualizado TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_pedidos (
      id INTEGER PRIMARY KEY, pedido_id INTEGER UNIQUE REFERENCES pedidos(id) ON DELETE SET NULL,
      cuenta_id INTEGER NOT NULL REFERENCES portal_cuentas(id) ON DELETE RESTRICT,
      solicitud TEXT NOT NULL, huella TEXT NOT NULL, direccion TEXT NOT NULL, municipio TEXT NOT NULL,
      telefono TEXT NOT NULL, comentario TEXT NOT NULL, creado TEXT NOT NULL,
      UNIQUE(cuenta_id, solicitud)
    );
    CREATE TABLE IF NOT EXISTS portal_config (
      id INTEGER PRIMARY KEY CHECK(id = 1), titulo TEXT NOT NULL, subtitulo TEXT NOT NULL
    );
    INSERT OR IGNORE INTO portal_config VALUES (1, 'Diseño que impulsa tu negocio.',
      'Explora nuestra colección y prepara tu próximo pedido mayorista en un solo lugar.');
  `)
  migrarImagenes(db)
}

let hashesActivos = 0
async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  exigir(hashesActivos < 4, 'Hay varias solicitudes en curso. Intenta en unos segundos.', 429)
  hashesActivos++
  try { return { salt, hash: (await derivar(password, salt, 64)).toString('hex') } } finally { hashesActivos-- }
}
function validarPassword(v) {
  exigir(typeof v === 'string' && v.length >= 10 && v.length <= 128, 'La contraseña debe tener entre 10 y 128 caracteres.')
}
async function verificar(password, cuenta) {
  if (typeof password !== 'string' || password.length > 128) return false
  const { hash } = await passwordHash(password, cuenta?.salt || 'portal-inexistente')
  return !!cuenta && timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(cuenta.hash, 'hex'))
}
function cuentaSalida(c) {
  return { id: c.id, correo: c.correo, negocio: c.negocio, contacto: c.contacto, nit: c.nit,
    telefono: c.telefono, direccion: c.direccion, municipio: c.municipio, ofertas: !!c.ofertas,
    notificaciones: !!c.notificaciones,
    estado: c.estado, clienteId: c.cliente_id, creado: c.creado }
}
function limitar(db, clave, max, ventana) {
  const key = digest(clave), now = Date.now()
  db.prepare('DELETE FROM portal_limites WHERE expira <= ?').run(now)
  const row = db.prepare('SELECT cantidad FROM portal_limites WHERE clave = ?').get(key)
  exigir(!row || row.cantidad < max, 'Demasiados intentos. Intenta más tarde.', 429)
  db.prepare(`INSERT INTO portal_limites VALUES (?, 1, ?) ON CONFLICT(clave) DO UPDATE SET cantidad = cantidad + 1`).run(key, now + ventana)
}
function cookie(req, res, value, maxAge = DURACION) {
  res.cookie(COOKIE, value, { httpOnly: true, sameSite: 'strict', secure: req.secure,
    path: '/api/portal', maxAge })
}
function sesion(db, req, res, id) {
  const token = randomBytes(32).toString('hex')
  db.prepare('DELETE FROM portal_sesiones WHERE expira <= ?').run(Date.now())
  db.prepare('INSERT INTO portal_sesiones VALUES (?, ?, ?)').run(digest(token), id, Date.now() + DURACION)
  cookie(req, res, token)
}
function disponibles(db, variante) {
  // Los pedidos pendientes aún no descuentan inventario. Se consideran compromisos
  // al recibir nuevos pedidos del portal; no se modifica el flujo de ventas interno.
  const pendientes = db.prepare(`SELECT coalesce(sum(i.cantidad), 0) n FROM pedido_items i
    JOIN pedidos p ON p.id = i.pedido_id WHERE p.estado = 'pendiente'
    AND (i.variante_id = ? OR (i.variante_id IS NULL AND i.producto_id = ?))`).get(variante.id, variante.producto_id).n
  return Math.max(0, Math.floor(variante.stock - pendientes))
}
function productos(db, admin = false) {
  return db.prepare(`SELECT p.id, p.nombre, p.codigo, p.valor_venta, p.descripcion descripcion_base,
    x.publicado, x.categoria, x.descripcion, x.medidas, x.minimo, x.precio, x.modalidad,
    EXISTS(SELECT 1 FROM portal_producto_imagenes i WHERE i.producto_id=p.id) tiene_imagen,
    x.galeria_revision, x.actualizado FROM productos p
    LEFT JOIN portal_productos x ON x.producto_id = p.id
    ${admin ? '' : 'WHERE x.publicado = 1'} ORDER BY p.nombre`).all().map((p) => ({
    id: p.id, nombre: p.nombre, codigo: p.codigo, publicado: !!p.publicado,
    categoria: p.categoria || 'Colección', descripcion: p.descripcion || p.descripcion_base || '',
    medidas: p.medidas || '', minimo: p.minimo || 1, precio: p.precio ?? p.valor_venta,
    ...(admin ? { precioCatalogo: p.precio, precioBase: p.valor_venta } : {}),
    modalidad: p.modalidad || 'encargo', tieneImagen: !!p.tiene_imagen, actualizado: p.actualizado,
    imagenes: fotosProducto(db, p.id),
    ...(admin ? { revisionFotos: p.galeria_revision || 0 } : {}),
    variantes: db.prepare(`SELECT v.id, v.producto_id, v.codigo, v.stock, c.nombre color
      FROM producto_variantes v LEFT JOIN colores c ON c.id = v.color_id
      WHERE v.producto_id = ? AND v.activo = 1 ORDER BY v.id`).all(p.id).map((v) => ({
      id: v.id, codigo: v.codigo, color: v.color || 'Estándar', disponible: disponibles(db, v),
    })),
  }))
}
function pedidoSalida(db, registro) {
  const p = registro.pedido_id ? db.prepare('SELECT * FROM pedidos WHERE id = ?').get(registro.pedido_id) : null
  return { id: registro.pedido_id, referencia: registro.id, estado: p?.estado || 'anulado',
    creado: registro.creado, fechaEntrega: p?.fecha_entrega || '', total: p?.total ?? null,
    direccion: registro.direccion, municipio: registro.municipio, telefono: registro.telefono,
    comentario: registro.comentario,
    items: p ? db.prepare(`SELECT producto_nombre nombre, producto_id productoId, variante_id varianteId,
      color_nombre color, cantidad, precio_unitario precio FROM pedido_items WHERE pedido_id = ? ORDER BY id`).all(p.id) : [] }
}
function imagen(db, req, res, admin = false) {
  const args = [req.params.id]
  if (req.params.imagenId) args.push(req.params.imagenId)
  const p = db.prepare(`SELECT i.imagen FROM portal_producto_imagenes i JOIN portal_productos p ON p.producto_id=i.producto_id
    WHERE p.producto_id = ? ${admin ? '' : 'AND p.publicado = 1'} ${req.params.imagenId ? 'AND i.id = ?' : ''}
    ORDER BY i.posicion, i.id LIMIT 1`).get(...args)
  exigir(p?.imagen, 'Imagen no encontrada.', 404)
  res.type('image/webp').send(p.imagen)
}

export function rutasPortal(db) {
  const r = Router()
  r.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    if (!['GET', 'HEAD'].includes(req.method)) {
      const origin = req.get('origin')
      if (req.get('X-Portal') !== '1' || !req.is('application/json')) return res.status(403).json({ error: 'Solicitud no permitida.' })
      if (origin) {
        try { if (new URL(origin).host !== req.get('host')) throw new Error() }
        catch { return res.status(403).json({ error: 'Origen no permitido.' }) }
      }
    }
    next()
  })
  r.get('/config', manejar((req, res) => {
    const empresa = db.prepare('SELECT nombre FROM empresa WHERE id = 1').get()
    res.json({ ...db.prepare('SELECT titulo, subtitulo FROM portal_config WHERE id = 1').get(), marca: empresa?.nombre || 'Colección Mayorista' })
  }))
  r.post('/registro', manejar(async (req, res) => {
    limitar(db, `registro:${req.ip}`, 5, 3600000)
    const b = req.body
    const correo = texto(b.correo, 254, true).toLowerCase()
    exigir(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo), 'Escribe un correo válido.')
    validarPassword(b.password)
    const negocio = texto(b.negocio, 160, true), contacto = texto(b.contacto, 160, true)
    const nit = texto(b.nit, 40, true), telefono = texto(b.telefono, 30, true)
    const direccion = texto(b.direccion, 300, true), municipio = texto(b.municipio, 100, true)
    if (b.ofertas === true || b.notificaciones === true) exigir(telefonoWhatsApp(telefono), 'Para recibir WhatsApp, escribe un celular colombiano o un número internacional con indicativo.')
    exigir(b.aceptaDatos === true, 'Debes autorizar el uso de tus datos para gestionar tu cuenta y pedidos.')
    exigir(!db.prepare('SELECT id FROM portal_cuentas WHERE correo = ?').get(correo), 'Ya existe una solicitud con ese correo. Inicia sesión o contacta al proveedor.', 409)
    const { salt, hash } = await passwordHash(b.password)
    // También verificar después del hash asíncrono para solicitudes concurrentes.
    exigir(!db.prepare('SELECT id FROM portal_cuentas WHERE correo = ?').get(correo), 'Ya existe una solicitud con ese correo.', 409)
    db.prepare(`INSERT INTO portal_cuentas (correo, salt, hash, negocio, contacto, nit, telefono, direccion,
      municipio, ofertas, notificaciones, consentimiento_fecha, creado, actualizado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(correo, salt, hash, negocio, contacto, nit, telefono, direccion, municipio, b.ofertas === true ? 1 : 0,
        b.notificaciones === true ? 1 : 0, ahora(), ahora(), ahora())
    res.status(201).json({ ok: true, mensaje: 'Solicitud recibida. Tu proveedor revisará y habilitará tu cuenta mayorista.' })
  }))
  r.post('/login', manejar(async (req, res) => {
    const correo = texto(req.body.correo, 254, true).toLowerCase()
    limitar(db, `login-ip:${req.ip}`, 30, 900000)
    limitar(db, `login-cuenta:${correo}`, 10, 900000)
    const c = db.prepare('SELECT * FROM portal_cuentas WHERE correo = ?').get(correo)
    exigir(await verificar(req.body.password, c), 'Correo o contraseña incorrectos.', 401)
    exigir(c.estado === 'aprobado', c.estado === 'pendiente' ? 'Tu cuenta está pendiente de aprobación.' : 'Tu cuenta no está habilitada. Contacta al proveedor.', 403)
    // Releer: el administrador pudo revocar la cuenta durante el hash.
    const actual = db.prepare('SELECT * FROM portal_cuentas WHERE id = ?').get(c.id)
    exigir(actual.estado === 'aprobado' && actual.hash === c.hash, 'La cuenta cambió. Intenta de nuevo.', 401)
    db.prepare('DELETE FROM portal_limites WHERE clave = ?').run(digest(`login-cuenta:${correo}`))
    sesion(db, req, res, c.id)
    res.json(cuentaSalida(actual))
  }))
  r.use(manejar((req, res, next) => {
    const token = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
    exigir(token && /^[a-f0-9]{64}$/.test(token), 'Inicia sesión para continuar.', 401)
    const c = db.prepare(`SELECT c.* FROM portal_sesiones s JOIN portal_cuentas c ON c.id = s.cuenta_id
      WHERE s.hash = ? AND s.expira > ? AND c.estado = 'aprobado'`).get(digest(token), Date.now())
    exigir(c, 'Tu sesión venció o fue revocada. Inicia sesión nuevamente.', 401)
    req.portalCuenta = c; req.portalToken = digest(token)
    next()
  }))
  r.get('/sesion', (req, res) => res.json(cuentaSalida(req.portalCuenta)))
  r.post('/logout', (req, res) => {
    db.prepare('DELETE FROM portal_sesiones WHERE hash = ?').run(req.portalToken)
    cookie(req, res, '', 0); res.json({ ok: true })
  })
  r.post('/password', manejar(async (req, res) => {
    limitar(db, `password:${req.portalCuenta.id}`, 10, 900000)
    validarPassword(req.body.nueva)
    const original = req.portalCuenta
    exigir(await verificar(req.body.actual, original), 'La contraseña actual es incorrecta.')
    const { salt, hash } = await passwordHash(req.body.nueva)
    db.transaction(() => {
      const vigente = db.prepare('SELECT hash, estado FROM portal_cuentas WHERE id = ?').get(original.id)
      exigir(vigente?.hash === original.hash && vigente.estado === 'aprobado', 'La cuenta cambió. Inicia sesión nuevamente.', 401)
      db.prepare('UPDATE portal_cuentas SET salt = ?, hash = ?, actualizado = ? WHERE id = ?').run(salt, hash, ahora(), original.id)
      db.prepare('DELETE FROM portal_sesiones WHERE cuenta_id = ?').run(original.id)
      sesion(db, req, res, original.id)
    })()
    res.json({ ok: true })
  }))
  r.put('/preferencias', manejar((req, res) => {
    exigir(typeof req.body.ofertas === 'boolean' && typeof req.body.notificaciones === 'boolean', 'Preferencia inválida.')
    if (req.body.ofertas || req.body.notificaciones) {
      const telefono = telefonoWhatsApp(req.portalCuenta.telefono)
      exigir(telefono, 'Tu teléfono no tiene un formato válido para WhatsApp. Contacta al proveedor para corregirlo.')
      exigir(!db.prepare('SELECT telefono FROM wa_bajas WHERE telefono=?').get(telefono), 'Este número solicitó BAJA por WhatsApp. Su bloqueo sigue vigente; contacta al proveedor.')
    }
    db.prepare('UPDATE portal_cuentas SET ofertas = ?, notificaciones = ?, actualizado = ? WHERE id = ?')
      .run(req.body.ofertas ? 1 : 0, req.body.notificaciones ? 1 : 0, ahora(), req.portalCuenta.id)
    res.json({ ok: true })
  }))
  r.get('/productos', (req, res) => res.json(productos(db)))
  r.get('/productos/:id/imagen', manejar((req, res) => imagen(db, req, res)))
  r.get('/productos/:id/imagenes/:imagenId', manejar((req, res) => imagen(db, req, res)))
  r.get('/pedidos', (req, res) => {
    res.json(db.prepare('SELECT * FROM portal_pedidos WHERE cuenta_id = ? ORDER BY id DESC').all(req.portalCuenta.id).map((p) => pedidoSalida(db, p)))
  })
  r.get('/pedidos/:id', manejar((req, res) => {
    const p = db.prepare('SELECT * FROM portal_pedidos WHERE pedido_id = ? AND cuenta_id = ?').get(req.params.id, req.portalCuenta.id)
    exigir(p, 'Pedido no encontrado.', 404); res.json(pedidoSalida(db, p))
  }))
  r.post('/pedidos', manejar((req, res) => {
    const b = req.body, c = req.portalCuenta
    exigir(typeof b.solicitudId === 'string' && /^[a-zA-Z0-9-]{20,80}$/.test(b.solicitudId), 'Identificador del pedido inválido.')
    exigir(Array.isArray(b.items) && b.items.length > 0 && b.items.length <= 100, 'El pedido debe tener entre 1 y 100 productos.')
    const direccion = texto(b.direccion, 300, true), municipio = texto(b.municipio, 100, true)
    const telefono = texto(b.telefono, 30, true), comentario = texto(b.comentario ?? '', 1000)
    const items = b.items.map((it) => {
      exigir(it && entero(it.productoId) && entero(it.varianteId) && entero(it.cantidad, 1, 10000)
        && typeof it.precio === 'number' && Number.isFinite(it.precio), 'Revisa los productos, cantidades y precios del pedido.')
      return { productoId: it.productoId, varianteId: it.varianteId, cantidad: it.cantidad, precio: it.precio }
    }).sort((a, z) => a.varianteId - z.varianteId)
    exigir(new Set(items.map((i) => i.varianteId)).size === items.length, 'Agrupa las cantidades de cada color en una sola línea.')
    const huella = digest(JSON.stringify({ items, direccion, municipio, telefono, comentario }))
    const resultado = db.transaction(() => {
      const previo = db.prepare('SELECT * FROM portal_pedidos WHERE cuenta_id = ? AND solicitud = ?').get(c.id, b.solicitudId)
      if (previo) {
        exigir(previo.huella === huella, 'Este intento corresponde a otro pedido. Revisa tu historial antes de volver a enviarlo.', 409)
        exigir(previo.pedido_id, 'Este pedido fue anulado. Revisa tu historial.', 409)
        return { nuevo: false, pedido: pedidoSalida(db, previo) }
      }
      const cliente = db.prepare("SELECT * FROM clientes WHERE id = ? AND tipo = 'cliente'").get(c.cliente_id)
      exigir(cliente, 'Tu cuenta requiere revisión. Contacta al proveedor.', 409)
      const lineas = items.map((it) => {
        const p = db.prepare(`SELECT p.nombre, p.valor_venta, x.* FROM portal_productos x
          JOIN productos p ON p.id = x.producto_id WHERE x.producto_id = ? AND x.publicado = 1`).get(it.productoId)
        exigir(p, 'Un producto ya no está publicado. Actualiza tu catálogo.', 409)
        const v = db.prepare(`SELECT v.*, c.nombre color FROM producto_variantes v LEFT JOIN colores c ON c.id = v.color_id
          WHERE v.id = ? AND v.producto_id = ? AND v.activo = 1`).get(it.varianteId, it.productoId)
        exigir(v, 'Un color ya no está disponible. Actualiza tu catálogo.', 409)
        const precio = p.precio ?? p.valor_venta
        exigir(Number.isFinite(precio) && precio > 0 && precio <= 1000000000 && Math.abs(precio - it.precio) < 0.001,
          `Cambió el precio de ${p.nombre}. Actualiza el catálogo y revisa tu pedido.`, 409)
        exigir(it.cantidad >= p.minimo, `${p.nombre}: el mínimo por color es ${p.minimo}.`, 409)
        exigir(p.modalidad !== 'stock' || it.cantidad <= disponibles(db, v), `${p.nombre} (${v.color || 'Estándar'}): disponibilidad insuficiente. Actualiza el catálogo.`, 409)
        return { ...it, precio, nombre: p.nombre, color: v.color || '' }
      })
      const total = Math.round(lineas.reduce((s, i) => s + i.cantidad * i.precio, 0) * 100) / 100
      exigir(total <= 1000000000000, 'El pedido supera el valor máximo permitido.')
      const fecha = ahora()
      const id = db.prepare(`INSERT INTO pedidos (cliente_id, cliente_nombre, estado, comentario, total, creado, actualizado)
        VALUES (?, ?, 'pendiente', ?, ?, ?, ?)`).run(cliente.id, `${cliente.nombre} ${cliente.apellidos || ''}`.trim(),
        `Portal mayorista · ${direccion}, ${municipio} · Tel. ${telefono}${comentario ? `\n${comentario}` : ''}`, total, fecha, fecha).lastInsertRowid
      const insertar = db.prepare(`INSERT INTO pedido_items (pedido_id, producto_id, producto_nombre, variante_id, color_nombre, cantidad, precio_unitario) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      for (const i of lineas) insertar.run(id, i.productoId, i.nombre, i.varianteId, i.color, i.cantidad, i.precio)
      const registro = db.prepare(`INSERT INTO portal_pedidos (pedido_id, cuenta_id, solicitud, huella, direccion, municipio, telefono, comentario, creado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, c.id, b.solicitudId, huella, direccion, municipio, telefono, comentario, fecha).lastInsertRowid
      encolarPedidoWhatsApp(db, id, 'recibido')
      return { nuevo: true, pedido: pedidoSalida(db, db.prepare('SELECT * FROM portal_pedidos WHERE id = ?').get(registro)) }
    }).immediate()
    res.status(resultado.nuevo ? 201 : 200).json(resultado.pedido)
  }))
  r.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }))
  r.use(errores)
  return r
}

export function rutasPortalAdmin(db, adminRequired) {
  const r = Router()
  r.use(adminRequired)
  r.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  r.get('/cuentas', (req, res) => res.json(db.prepare('SELECT * FROM portal_cuentas ORDER BY creado DESC').all().map(cuentaSalida)))
  r.put('/cuentas/:id', manejar((req, res) => {
    const { estado, clienteId } = req.body
    exigir(['aprobado', 'rechazado', 'suspendido'].includes(estado), 'Estado no válido.')
    db.transaction(() => {
      const c = db.prepare('SELECT * FROM portal_cuentas WHERE id = ?').get(req.params.id)
      exigir(c, 'Cuenta no encontrada.', 404)
      let vinculo = c.cliente_id
      exigir(!vinculo || !clienteId || clienteId === vinculo, 'Una cuenta vinculada no puede trasladarse a otro cliente.')
      if (estado === 'aprobado' && !vinculo) {
        if (clienteId != null) {
          exigir(entero(clienteId), 'Cliente no válido.')
          exigir(db.prepare("SELECT id FROM clientes WHERE id = ? AND tipo = 'cliente'").get(clienteId), 'Selecciona un cliente válido.')
          exigir(!db.prepare('SELECT id FROM portal_cuentas WHERE cliente_id = ?').get(clienteId), 'Ese cliente ya tiene una cuenta.', 409)
          vinculo = clienteId
        } else {
          const normalizarNit = (s) => String(s || '').replace(/[^a-z0-9]/gi, '').toLowerCase()
          const duplicado = db.prepare("SELECT cedula, correo FROM clientes WHERE tipo = 'cliente'").all()
            .some((x) => normalizarNit(x.cedula) === normalizarNit(c.nit) || x.correo?.toLowerCase() === c.correo)
          exigir(!duplicado, 'Ya existe un cliente con ese NIT o correo. Selecciónalo para vincularlo.', 409)
          vinculo = db.prepare(`INSERT INTO clientes (nombre, cedula, correo, direccion, municipio, telefono, tipo, creado, actualizado)
            VALUES (?, ?, ?, ?, ?, ?, 'cliente', ?, ?)`).run(c.negocio, c.nit, c.correo, c.direccion, c.municipio, c.telefono, ahora(), ahora()).lastInsertRowid
        }
      }
      db.prepare('UPDATE portal_cuentas SET estado = ?, cliente_id = ?, actualizado = ? WHERE id = ?').run(estado, vinculo, ahora(), c.id)
      db.prepare('DELETE FROM portal_sesiones WHERE cuenta_id = ?').run(c.id)
    })()
    res.json({ ok: true })
  }))
  r.post('/cuentas/:id/password', manejar(async (req, res) => {
    validarPassword(req.body.nueva)
    exigir(db.prepare('SELECT id FROM portal_cuentas WHERE id = ?').get(req.params.id), 'Cuenta no encontrada.', 404)
    const { salt, hash } = await passwordHash(req.body.nueva)
    db.transaction(() => {
      db.prepare('UPDATE portal_cuentas SET salt = ?, hash = ?, actualizado = ? WHERE id = ?').run(salt, hash, ahora(), req.params.id)
      db.prepare('DELETE FROM portal_sesiones WHERE cuenta_id = ?').run(req.params.id)
    })()
    res.json({ ok: true })
  }))
  r.get('/config', (req, res) => res.json(db.prepare('SELECT titulo, subtitulo FROM portal_config WHERE id = 1').get()))
  r.put('/config', manejar((req, res) => {
    db.prepare('UPDATE portal_config SET titulo = ?, subtitulo = ? WHERE id = 1')
      .run(texto(req.body.titulo, 100, true), texto(req.body.subtitulo, 250, true))
    res.json({ ok: true })
  }))
  r.get('/productos', (req, res) => res.json(productos(db, true)))
  r.get('/productos/:id/imagen', manejar((req, res) => imagen(db, req, res, true)))
  r.get('/productos/:id/imagenes/:imagenId', manejar((req, res) => imagen(db, req, res, true)))
  r.put('/productos/:id', manejar(async (req, res) => {
    const b = req.body
    exigir(db.prepare('SELECT id FROM productos WHERE id = ?').get(req.params.id), 'Producto no encontrado.', 404)
    exigir(typeof b.publicado === 'boolean' && entero(b.minimo, 1, 10000), 'Revisa la publicación y el mínimo de compra.')
    exigir(['stock', 'encargo'].includes(b.modalidad), 'Modalidad no válida.')
    exigir(b.precio === null || (typeof b.precio === 'number' && Number.isFinite(b.precio) && b.precio > 0 && b.precio <= 1000000000), 'Precio mayorista no válido.')
    if (b.publicado) {
      const base = db.prepare('SELECT valor_venta FROM productos WHERE id = ?').get(req.params.id).valor_venta
      exigir((b.precio ?? base) > 0 && (b.precio ?? base) <= 1000000000, 'Asigna un precio válido antes de publicar.')
      exigir(db.prepare('SELECT id FROM producto_variantes WHERE producto_id = ? AND activo = 1').get(req.params.id), 'El producto debe tener al menos una variante activa.')
    }
    const categoria = texto(b.categoria, 80, true), descripcion = texto(b.descripcion, 3000), medidas = texto(b.medidas, 200)
    const fotos = await prepararImagenes(b)
    db.transaction(() => {
      db.prepare(`INSERT INTO portal_productos (producto_id, publicado, categoria, descripcion, medidas, minimo, precio, modalidad, actualizado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(producto_id) DO UPDATE SET publicado=excluded.publicado,
        categoria=excluded.categoria, descripcion=excluded.descripcion, medidas=excluded.medidas,
        minimo=excluded.minimo, precio=excluded.precio, modalidad=excluded.modalidad, actualizado=excluded.actualizado`)
        .run(req.params.id, b.publicado ? 1 : 0, categoria, descripcion, medidas, b.minimo, b.precio, b.modalidad, ahora())
      guardarImagenes(db, Number(req.params.id), fotos)
    })()
    res.json({ ok: true })
  }))
  r.use(errores)
  return r
}

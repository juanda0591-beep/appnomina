import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import db from './db.js'
import {
  authRequired,
  adminRequired,
  permisoRequired,
  permisoAnyRequired,
  login,
  cambiarPassword,
  seedUsuario,
  listarUsuarios,
  crearUsuario,
  actualizarPermisos,
  eliminarUsuario,
  resetPassword,
} from './auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

// En producción, detrás del reverse proxy (Caddy/Nginx), el frontend se sirve
// desde el mismo origen que la API, así que CORS no hace falta. Si defines
// ALLOWED_ORIGIN (uno o varios dominios separados por coma) se restringe a ellos;
// si no, se permite todo (cómodo para desarrollo y acceso por IP en la red local).
const allowedOrigins = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
if (allowedOrigins.length > 0) {
  app.use(cors({ origin: allowedOrigins }))
} else {
  app.use(cors())
}

// Confía en el proxy (Caddy/Nginx) para leer la IP real del cliente (X-Forwarded-For)
app.set('trust proxy', 1)

app.use(express.json({ limit: '20mb' })) // amplio para logo y comprobantes en base64

seedUsuario() // crea el usuario admin la primera vez
app.use(authRequired) // protege todas las rutas /api excepto /api/login

const PORT = process.env.PORT || 3001

// ============ AUTENTICACIÓN ============
// Límite simple de intentos de login por IP (en memoria) para frenar fuerza bruta.
const MAX_INTENTOS = 8
const VENTANA_MS = 15 * 60 * 1000 // 15 minutos
const intentos = new Map() // ip -> { count, primero }

function revisarIntentos(ip) {
  const ahora = Date.now()
  const reg = intentos.get(ip)
  if (!reg || ahora - reg.primero > VENTANA_MS) {
    intentos.set(ip, { count: 0, primero: ahora })
    return true
  }
  return reg.count < MAX_INTENTOS
}
function registrarFallo(ip) {
  const reg = intentos.get(ip) || { count: 0, primero: Date.now() }
  reg.count += 1
  intentos.set(ip, reg)
}
// Limpieza periódica de entradas viejas
setInterval(() => {
  const ahora = Date.now()
  for (const [ip, reg] of intentos) {
    if (ahora - reg.primero > VENTANA_MS) intentos.delete(ip)
  }
}, VENTANA_MS).unref()

app.post('/api/login', (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'desconocida'
  if (!revisarIntentos(ip)) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' })
  }
  const { username, password } = req.body
  const result = login(username, password)
  if (!result) {
    registrarFallo(ip)
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' })
  }
  intentos.delete(ip) // login correcto → reinicia el contador
  res.json(result)
})

app.post('/api/cambiar-password', (req, res) => {
  const { actual, nueva } = req.body
  const result = cambiarPassword(req.usuario, actual, nueva)
  if (!result.ok) return res.status(400).json({ error: result.error })
  res.json({ ok: true })
})


// ============ USUARIOS (solo admin) ============
app.get('/api/usuarios', adminRequired, (req, res) => {
  res.json(listarUsuarios())
})

app.post('/api/usuarios', adminRequired, (req, res) => {
  const { username, password, rol, permisos } = req.body
  const result = crearUsuario(username, password, rol, permisos)
  if (!result.ok) return res.status(400).json({ error: result.error })
  res.json(result.usuario)
})

app.put('/api/usuarios/:id/permisos', adminRequired, (req, res) => {
  const result = actualizarPermisos(Number(req.params.id), req.body.permisos)
  if (!result.ok) return res.status(400).json({ error: result.error })
  res.json({ ok: true })
})

app.post('/api/usuarios/:id/password', adminRequired, (req, res) => {
  const result = resetPassword(Number(req.params.id), req.body.nueva)
  if (!result.ok) return res.status(400).json({ error: result.error })
  res.json({ ok: true })
})

app.delete('/api/usuarios/:id', adminRequired, (req, res) => {
  const result = eliminarUsuario(Number(req.params.id), req.usuario)
  if (!result.ok) return res.status(400).json({ error: result.error })
  res.json({ ok: true })
})

// ============ DASHBOARD ============
app.get('/api/dashboard', permisoRequired('inicio', 'ver'), (req, res) => {
  // Ingresos/gastos SOLO del día de hoy. El saldo en caja es global.
  const hoy = new Date().toISOString().slice(0, 10)
  const ingresos = db.prepare("SELECT COALESCE(SUM(monto), 0) AS t FROM movimientos WHERE tipo = 'ingreso' AND substr(fecha, 1, 10) = ?").get(hoy).t
  const gastos = db.prepare("SELECT COALESCE(SUM(monto), 0) AS t FROM movimientos WHERE tipo = 'gasto' AND substr(fecha, 1, 10) = ?").get(hoy).t

  // Saldo global en caja (todos los movimientos, no solo hoy)
  const ingresosGlobal = db.prepare("SELECT COALESCE(SUM(monto), 0) AS t FROM movimientos WHERE tipo = 'ingreso'").get().t
  const gastosGlobal = db.prepare("SELECT COALESCE(SUM(monto), 0) AS t FROM movimientos WHERE tipo = 'gasto'").get().t

  const totalEmpleados = db.prepare('SELECT COUNT(*) AS n FROM empleados').get().n
  const totalProductos = db.prepare('SELECT COUNT(*) AS n FROM productos').get().n
  const saldoPrestamos = db.prepare('SELECT COALESCE(SUM(saldo), 0) AS t FROM prestamos').get().t
  const prestamosActivos = db.prepare('SELECT COUNT(*) AS n FROM prestamos WHERE saldo > 0').get().n

  // Mes actual (YYYY-MM)
  const mes = new Date().toISOString().slice(0, 7)
  const nominaMes = db
    .prepare("SELECT COALESCE(SUM(total), 0) AS t, COUNT(*) AS n FROM nominas WHERE substr(fecha, 1, 7) = ?")
    .get(mes)

  // Últimas nóminas con nombre de empleado
  const ultimasNominas = db
    .prepare(
      `SELECT n.id, n.fecha, n.total, e.nombre AS empleado
       FROM nominas n LEFT JOIN empleados e ON e.id = n.empleado_id
       ORDER BY n.fecha DESC, n.id DESC LIMIT 5`
    )
    .all()

  res.json({
    ingresos,
    gastos,
    balance: ingresosGlobal - gastosGlobal, // saldo en caja siempre global
    totalEmpleados,
    totalProductos,
    saldoPrestamos,
    prestamosActivos,
    nominaMesTotal: nominaMes.t,
    nominaMesCantidad: nominaMes.n,
    ultimasNominas,
  })
})

// ---------- Helpers para armar objetos anidados ----------
const procesoMaterialesStmt = db.prepare(`
  SELECT pm.id, pm.material_id, pm.cantidad, m.nombre AS material_nombre, m.unidad
  FROM proceso_materiales pm
  JOIN materiales m ON m.id = pm.material_id
  WHERE pm.proceso_id = ?
  ORDER BY m.nombre
`)

function materialesDeProceso(procesoId) {
  return procesoMaterialesStmt.all(procesoId).map((m) => ({
    id: m.id,
    materialId: m.material_id,
    materialNombre: m.material_nombre,
    unidad: m.unidad,
    cantidad: m.cantidad,
  }))
}

function productoConProcesos(prod) {
  const procesos = db
    .prepare('SELECT * FROM procesos WHERE producto_id = ?')
    .all(prod.id)
    .map((p) => ({ ...p, materiales: materialesDeProceso(p.id) }))
  return { ...prod, procesos }
}

// Inserta las filas de procesos (y su receta de materiales) para un producto,
// dentro de la transacción de crear/editar. Se reutiliza en POST y PUT.
const insertProceso = db.prepare('INSERT INTO procesos (producto_id, nombre, pago) VALUES (?, ?, ?)')
const insertProcesoMaterial = db.prepare(
  'INSERT INTO proceso_materiales (proceso_id, material_id, cantidad) VALUES (?, ?, ?)'
)
function insertarProcesosConReceta(productoId, procesos) {
  for (const p of procesos) {
    const r = insertProceso.run(productoId, p.nombre.trim(), Number(p.pago) || 0)
    const procesoId = r.lastInsertRowid
    for (const m of p.materiales || []) {
      const materialId = Number(m.materialId)
      const cantidad = Number(m.cantidad) || 0
      if (materialId && cantidad > 0) insertProcesoMaterial.run(procesoId, materialId, cantidad)
    }
  }
}

// Registra un movimiento de gasto (usado por nómina y adelantos automáticos)
const insertMovimiento = db.prepare(
  `INSERT INTO movimientos (tipo, fecha, categoria, monto, descripcion, comprobante, comprobante_tipo, origen, ref_id)
   VALUES (@tipo, @fecha, @categoria, @monto, @descripcion, @comprobante, @comprobante_tipo, @origen, @ref_id)`
)
function registrarGasto({ fecha, categoria, monto, descripcion, origen = 'manual', refId = null }) {
  return insertMovimiento.run({
    tipo: 'gasto',
    fecha,
    categoria: categoria || '',
    monto: Number(monto) || 0,
    descripcion: descripcion || '',
    comprobante: null,
    comprobante_tipo: null,
    origen,
    ref_id: refId,
  })
}

function movimientoSalida(m) {
  return {
    id: m.id,
    tipo: m.tipo,
    fecha: m.fecha,
    categoria: m.categoria || '',
    monto: m.monto,
    descripcion: m.descripcion || '',
    tieneComprobante: !!m.comprobante,
    comprobanteTipo: m.comprobante_tipo || '',
    origen: m.origen || 'manual',
    refId: m.ref_id,
  }
}

// ============ PRODUCTOS ============
app.get('/api/productos', permisoAnyRequired([
  ['productos', 'ver'],
  ['nomina', 'ver'],
]), (req, res) => {
  const productos = db.prepare('SELECT * FROM productos ORDER BY nombre').all()
  res.json(productos.map(productoConProcesos))
})

app.post('/api/productos', permisoRequired('productos', 'crear'), (req, res) => {
  const { nombre, procesos = [] } = req.body
  const insert = db.transaction(() => {
    const r = db.prepare('INSERT INTO productos (nombre) VALUES (?)').run(nombre.trim())
    const pid = r.lastInsertRowid
    insertarProcesosConReceta(pid, procesos)
    return pid
  })
  const pid = insert()
  res.json(productoConProcesos(db.prepare('SELECT * FROM productos WHERE id = ?').get(pid)))
})

app.put('/api/productos/:id', permisoRequired('productos', 'editar'), (req, res) => {
  const { id } = req.params
  const { nombre, procesos = [] } = req.body
  const update = db.transaction(() => {
    db.prepare('UPDATE productos SET nombre = ? WHERE id = ?').run(nombre.trim(), id)
    db.prepare('DELETE FROM procesos WHERE producto_id = ?').run(id)
    insertarProcesosConReceta(id, procesos)
  })
  update()
  res.json(productoConProcesos(db.prepare('SELECT * FROM productos WHERE id = ?').get(id)))
})

app.delete('/api/productos/:id', permisoRequired('productos', 'eliminar'), (req, res) => {
  db.prepare('DELETE FROM productos WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ============ MATERIALES ============
function materialSalida(m) {
  return {
    id: m.id,
    nombre: m.nombre,
    unidad: m.unidad,
    stock: m.stock,
    costoUnitario: m.costo_unitario,
    stockMinimo: m.stock_minimo,
  }
}

function movimientoMaterialSalida(m) {
  return {
    id: m.id,
    materialId: m.material_id,
    tipo: m.tipo,
    cantidad: m.cantidad,
    costoUnitario: m.costo_unitario,
    fecha: m.fecha,
    descripcion: m.descripcion || '',
  }
}

app.get('/api/materiales', permisoRequired('materiales', 'ver'), (req, res) => {
  const materiales = db.prepare('SELECT * FROM materiales ORDER BY nombre').all()
  res.json(materiales.map(materialSalida))
})

app.post('/api/materiales', permisoRequired('materiales', 'crear'), (req, res) => {
  const { nombre, unidad, costoUnitario = 0, stockInicial = 0, stockMinimo = 0 } = req.body
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' })
  if (!unidad || !unidad.trim()) return res.status(400).json({ error: 'La unidad es obligatoria' })

  const insert = db.transaction(() => {
    const stock = Number(stockInicial) || 0
    const costo = Number(costoUnitario) || 0
    const minimo = Number(stockMinimo) || 0
    const r = db
      .prepare('INSERT INTO materiales (nombre, unidad, stock, costo_unitario, stock_minimo) VALUES (?, ?, ?, ?, ?)')
      .run(nombre.trim(), unidad.trim(), stock, costo, minimo)
    const mid = r.lastInsertRowid
    if (stock > 0) {
      db.prepare(
        `INSERT INTO material_movimientos (material_id, tipo, cantidad, costo_unitario, fecha, descripcion)
         VALUES (?, 'entrada', ?, ?, ?, ?)`
      ).run(mid, stock, costo, new Date().toISOString(), 'Stock inicial')
    }
    return mid
  })
  const mid = insert()
  res.json(materialSalida(db.prepare('SELECT * FROM materiales WHERE id = ?').get(mid)))
})

app.put('/api/materiales/:id', permisoRequired('materiales', 'editar'), (req, res) => {
  const { id } = req.params
  const { nombre, unidad, costoUnitario, stockMinimo } = req.body
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' })
  if (!unidad || !unidad.trim()) return res.status(400).json({ error: 'La unidad es obligatoria' })

  db.prepare('UPDATE materiales SET nombre = ?, unidad = ?, costo_unitario = ?, stock_minimo = ? WHERE id = ?').run(
    nombre.trim(),
    unidad.trim(),
    Number(costoUnitario) || 0,
    Number(stockMinimo) || 0,
    id
  )
  res.json(materialSalida(db.prepare('SELECT * FROM materiales WHERE id = ?').get(id)))
})

app.delete('/api/materiales/:id', permisoRequired('materiales', 'eliminar'), (req, res) => {
  db.prepare('DELETE FROM materiales WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

app.post('/api/materiales/:id/entrada', permisoRequired('materiales', 'crear'), (req, res) => {
  const { id } = req.params
  const { cantidad, costoUnitario, fecha, descripcion } = req.body
  const cant = Number(cantidad) || 0
  if (cant <= 0) return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' })
  const costo = Number(costoUnitario) || 0

  const material = db.prepare('SELECT * FROM materiales WHERE id = ?').get(id)
  if (!material) return res.status(404).json({ error: 'Material no encontrado' })

  const update = db.transaction(() => {
    db.prepare(
      `INSERT INTO material_movimientos (material_id, tipo, cantidad, costo_unitario, fecha, descripcion)
       VALUES (?, 'entrada', ?, ?, ?, ?)`
    ).run(id, cant, costo, fecha || new Date().toISOString(), (descripcion || '').trim())
    db.prepare('UPDATE materiales SET stock = stock + ?, costo_unitario = ? WHERE id = ?').run(cant, costo, id)
  })
  update()
  res.json(materialSalida(db.prepare('SELECT * FROM materiales WHERE id = ?').get(id)))
})

app.get('/api/materiales/:id/movimientos', permisoRequired('materiales', 'ver'), (req, res) => {
  const movimientos = db
    .prepare('SELECT * FROM material_movimientos WHERE material_id = ? ORDER BY fecha DESC, id DESC')
    .all(req.params.id)
  res.json(movimientos.map(movimientoMaterialSalida))
})

// ============ PROCESOS GLOBALES ============
// Catálogo reutilizable de nombres de proceso (Corte, Armado, Pintura...),
// usado desde Productos para no repetir el mismo nombre escrito distinto en cada producto.
app.get('/api/procesos-globales', permisoRequired('productos', 'ver'), (req, res) => {
  const procesos = db.prepare('SELECT * FROM procesos_globales ORDER BY nombre').all()
  res.json(procesos)
})

app.post('/api/procesos-globales', permisoRequired('productos', 'crear'), (req, res) => {
  const { nombre } = req.body
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' })
  const limpio = nombre.trim()

  const existente = db
    .prepare('SELECT * FROM procesos_globales WHERE LOWER(nombre) = LOWER(?)')
    .get(limpio)
  if (existente) return res.json(existente)

  const r = db.prepare('INSERT INTO procesos_globales (nombre) VALUES (?)').run(limpio)
  res.json(db.prepare('SELECT * FROM procesos_globales WHERE id = ?').get(r.lastInsertRowid))
})

// ============ EMPLEADOS ============
app.get('/api/empleados', permisoAnyRequired([
  ['empleados', 'ver'],
  ['nomina', 'ver'],
  ['prestamos', 'ver'],
  ['historial', 'ver'],
  ['reportes', 'ver'],
]), (req, res) => {
  res.json(db.prepare('SELECT * FROM empleados ORDER BY nombre').all())
})

app.post('/api/empleados', permisoRequired('empleados', 'crear'), (req, res) => {
  const { nombre, cedula, telefono, cargo } = req.body
  const r = db
    .prepare('INSERT INTO empleados (nombre, cedula, telefono, cargo) VALUES (?, ?, ?, ?)')
    .run(nombre.trim(), cedula || '', telefono || '', cargo || '')
  res.json(db.prepare('SELECT * FROM empleados WHERE id = ?').get(r.lastInsertRowid))
})

app.put('/api/empleados/:id', permisoRequired('empleados', 'editar'), (req, res) => {
  const { nombre, cedula, telefono, cargo } = req.body
  db.prepare('UPDATE empleados SET nombre=?, cedula=?, telefono=?, cargo=? WHERE id=?')
    .run(nombre.trim(), cedula || '', telefono || '', cargo || '', req.params.id)
  res.json(db.prepare('SELECT * FROM empleados WHERE id = ?').get(req.params.id))
})

app.delete('/api/empleados/:id', permisoRequired('empleados', 'eliminar'), (req, res) => {
  const empleadoId = Number(req.params.id)
  const tx = db.transaction(() => {
    const prestamosEmpleado = db.prepare('SELECT id FROM prestamos WHERE empleado_id = ?').all(empleadoId)
    const deleteMovimientoPrestamo = db.prepare("DELETE FROM movimientos WHERE origen = 'prestamo' AND ref_id = ?")

    for (const prestamo of prestamosEmpleado) {
      deleteMovimientoPrestamo.run(prestamo.id)
    }

    db.prepare('DELETE FROM empleados WHERE id = ?').run(empleadoId)
  })

  tx()
  res.json({ ok: true })
})

// ============ HERRAMIENTAS ENTREGADAS ============
// Registro de herramientas que se le entregan a cada empleado. Reutiliza el
// permiso de 'empleados' (ver/crear/editar/eliminar) porque vive dentro de esa
// página, igual criterio que procesos-globales reusa el permiso de productos.
function herramientaSalida(h) {
  return {
    id: h.id,
    empleadoId: h.empleado_id,
    herramienta: h.herramienta,
    cantidad: h.cantidad,
    fechaEntrega: h.fecha_entrega,
    estado: h.estado,
    comentario: h.comentario || '',
    creado: h.creado,
  }
}

app.get('/api/empleados/:id/herramientas', permisoAnyRequired([
  ['empleados', 'ver'],
  ['nomina', 'ver'],
]), (req, res) => {
  const filas = db
    .prepare('SELECT * FROM herramientas_entregas WHERE empleado_id = ? ORDER BY fecha_entrega DESC, id DESC')
    .all(req.params.id)
  res.json(filas.map(herramientaSalida))
})

app.post('/api/empleados/:id/herramientas', permisoRequired('empleados', 'crear'), (req, res) => {
  const empleadoId = Number(req.params.id)
  const { herramienta, cantidad, fechaEntrega, estado, comentario } = req.body
  if (!herramienta || !herramienta.trim()) return res.status(400).json({ error: 'La herramienta es obligatoria' })
  if (!fechaEntrega) return res.status(400).json({ error: 'La fecha de entrega es obligatoria' })
  const cant = Number(cantidad) || 0
  if (cant <= 0) return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' })

  const r = db
    .prepare(
      `INSERT INTO herramientas_entregas (empleado_id, herramienta, cantidad, fecha_entrega, estado, comentario, creado)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(empleadoId, herramienta.trim(), cant, fechaEntrega, estado || 'buen_estado', (comentario || '').trim(), new Date().toISOString())
  res.json(herramientaSalida(db.prepare('SELECT * FROM herramientas_entregas WHERE id = ?').get(r.lastInsertRowid)))
})

app.put('/api/herramientas/:id', permisoRequired('empleados', 'editar'), (req, res) => {
  const { herramienta, cantidad, fechaEntrega, estado, comentario } = req.body
  if (!herramienta || !herramienta.trim()) return res.status(400).json({ error: 'La herramienta es obligatoria' })
  if (!fechaEntrega) return res.status(400).json({ error: 'La fecha de entrega es obligatoria' })
  const cant = Number(cantidad) || 0
  if (cant <= 0) return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' })

  db.prepare(
    `UPDATE herramientas_entregas
     SET herramienta = ?, cantidad = ?, fecha_entrega = ?, estado = ?, comentario = ?
     WHERE id = ?`
  ).run(herramienta.trim(), cant, fechaEntrega, estado || 'buen_estado', (comentario || '').trim(), req.params.id)
  res.json(herramientaSalida(db.prepare('SELECT * FROM herramientas_entregas WHERE id = ?').get(req.params.id)))
})

app.delete('/api/herramientas/:id', permisoRequired('empleados', 'eliminar'), (req, res) => {
  db.prepare('DELETE FROM herramientas_entregas WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ============ PRESTAMOS ============
app.get('/api/prestamos', permisoAnyRequired([
  ['prestamos', 'ver'],
  ['nomina', 'ver'],
  ['empleados', 'ver'],
  ['historial', 'ver'],
]), (req, res) => {
  res.json(db.prepare('SELECT * FROM prestamos ORDER BY fecha DESC, id DESC').all())
})

app.post('/api/prestamos', permisoRequired('prestamos', 'crear'), (req, res) => {
  const { empleadoId, monto, fecha, descripcion } = req.body
  const m = Number(monto) || 0
  const tx = db.transaction(() => {
    const r = db
      .prepare('INSERT INTO prestamos (empleado_id, monto, saldo, fecha, descripcion) VALUES (?, ?, ?, ?, ?)')
      .run(empleadoId, m, m, fecha, descripcion || '')
    const pid = r.lastInsertRowid
    // El adelanto sale de caja → se registra como gasto automático
    const emp = db.prepare('SELECT nombre FROM empleados WHERE id = ?').get(empleadoId)
    registrarGasto({
      fecha,
      categoria: 'Adelanto',
      monto: m,
      descripcion: `Adelanto a ${emp?.nombre || 'empleado'}${descripcion ? ' — ' + descripcion : ''}`,
      origen: 'prestamo',
      refId: pid,
    })
    return pid
  })
  const pid = tx()
  res.json(db.prepare('SELECT * FROM prestamos WHERE id = ?').get(pid))
})

app.delete('/api/prestamos/:id', permisoRequired('prestamos', 'eliminar'), (req, res) => {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM prestamos WHERE id = ?').run(req.params.id)
    // borra el gasto automático asociado a este adelanto
    db.prepare("DELETE FROM movimientos WHERE origen = 'prestamo' AND ref_id = ?").run(req.params.id)
  })
  tx()
  res.json({ ok: true })
})

// ============ NOMINAS ============
function nominaCompleta(n) {
  const items = db.prepare('SELECT * FROM nomina_items WHERE nomina_id = ?').all(n.id)
  const descuentos = db.prepare('SELECT * FROM nomina_descuentos WHERE nomina_id = ?').all(n.id)
  return {
    id: n.id,
    empleadoId: n.empleado_id,
    fecha: n.fecha,
    subtotal: n.subtotal,
    totalDescuentos: n.total_descuentos,
    total: n.total,
    comentario: n.comentario || '',
    items: items.map((it) => ({
      productoNombre: it.producto_nombre,
      procesoNombre: it.proceso_nombre,
      cantidad: it.cantidad,
      pago: it.pago,
      subtotal: it.subtotal,
    })),
    descuentos: descuentos.map((d) => ({
      prestamoId: d.prestamo_id,
      monto: d.monto,
      descripcion: d.descripcion,
    })),
  }
}

app.get('/api/nominas', permisoRequired('historial', 'ver'), (req, res) => {
  const { desde, hasta } = req.query
  let rows
  if (desde && hasta) {
    rows = db.prepare('SELECT * FROM nominas WHERE fecha BETWEEN ? AND ? ORDER BY fecha DESC, id DESC').all(desde, hasta)
  } else {
    rows = db.prepare('SELECT * FROM nominas ORDER BY fecha DESC, id DESC').all()
  }
  res.json(rows.map(nominaCompleta))
})

app.post('/api/nominas', permisoRequired('nomina', 'crear'), (req, res) => {
  const { empleadoId, fecha, items = [], descuentos = [], subtotal, totalDescuentos, total, comentario, tareaIds = [] } = req.body
  const tx = db.transaction(() => {
    const r = db
      .prepare('INSERT INTO nominas (empleado_id, fecha, subtotal, total_descuentos, total, comentario) VALUES (?, ?, ?, ?, ?, ?)')
      .run(empleadoId, fecha, subtotal || 0, totalDescuentos || 0, total || 0, comentario || '')
    const nid = r.lastInsertRowid

    const insItem = db.prepare(
      'INSERT INTO nomina_items (nomina_id, producto_nombre, proceso_nombre, cantidad, pago, subtotal) VALUES (?, ?, ?, ?, ?, ?)'
    )
    for (const it of items) {
      insItem.run(nid, it.productoNombre, it.procesoNombre, it.cantidad, it.pago, it.subtotal)
    }

    const insDesc = db.prepare(
      'INSERT INTO nomina_descuentos (nomina_id, prestamo_id, monto, descripcion) VALUES (?, ?, ?, ?)'
    )
    const updPrestamo = db.prepare('UPDATE prestamos SET saldo = MAX(0, saldo - ?) WHERE id = ?')
    for (const d of descuentos) {
      insDesc.run(nid, d.prestamoId, d.monto, d.descripcion || 'Préstamo')
      if (d.prestamoId) updPrestamo.run(d.monto, d.prestamoId)
    }

    // Marca como pagadas las tareas terminadas incluidas en este pago
    if (Array.isArray(tareaIds) && tareaIds.length > 0) {
      const marcarPagada = db.prepare(
        "UPDATE tareas SET estado = 'pagada', nomina_id = ?, actualizado = ? WHERE id = ? AND estado = 'terminada'"
      )
      const ahora = new Date().toISOString()
      for (const tid of tareaIds) marcarPagada.run(nid, ahora, tid)
    }

    // El pago de nómina sale de caja → gasto automático (por el neto pagado)
    const emp = db.prepare('SELECT nombre FROM empleados WHERE id = ?').get(empleadoId)
    registrarGasto({
      fecha,
      categoria: 'Nómina',
      monto: total || 0,
      descripcion: `Pago de nómina a ${emp?.nombre || 'empleado'}`,
      origen: 'nomina',
      refId: nid,
    })
    return nid
  })
  const nid = tx()
  res.json(nominaCompleta(db.prepare('SELECT * FROM nominas WHERE id = ?').get(nid)))
})

app.delete('/api/nominas/:id', permisoRequired('historial', 'eliminar'), (req, res) => {
  const tx = db.transaction(() => {
    const descuentos = db.prepare('SELECT prestamo_id, monto FROM nomina_descuentos WHERE nomina_id = ?').all(req.params.id)
    const revertirPrestamo = db.prepare('UPDATE prestamos SET saldo = saldo + ? WHERE id = ?')

    for (const descuento of descuentos) {
      if (descuento.prestamo_id) revertirPrestamo.run(Number(descuento.monto) || 0, descuento.prestamo_id)
    }

    // Devuelve a 'terminada' las tareas que se habían pagado con esta nómina
    db.prepare("UPDATE tareas SET estado = 'terminada', nomina_id = NULL WHERE nomina_id = ?").run(req.params.id)

    db.prepare('DELETE FROM nominas WHERE id = ?').run(req.params.id)
    db.prepare("DELETE FROM movimientos WHERE origen = 'nomina' AND ref_id = ?").run(req.params.id)
  })

  tx()
  res.json({ ok: true })
})

// ============ TAREAS (Gestión de Nómina) ============
function tareaSalida(t) {
  return {
    id: t.id,
    empleadoId: t.empleado_id,
    productoId: t.producto_id,
    procesoId: t.proceso_id,
    productoNombre: t.producto_nombre || '',
    procesoNombre: t.proceso_nombre || '',
    pago: t.pago,
    cantidad: t.cantidad,
    progreso: t.progreso,
    estado: t.estado,
    comentario: t.comentario || '',
    nominaId: t.nomina_id,
    creado: t.creado,
    actualizado: t.actualizado,
  }
}

// Registra un cambio en el historial de auditoría de una tarea
const insertTareaHistorial = db.prepare(
  `INSERT INTO tarea_historial (tarea_id, usuario, progreso_anterior, progreso_nuevo, comentario, fecha)
   VALUES (?, ?, ?, ?, ?, ?)`
)

app.get('/api/tareas', permisoAnyRequired([
  ['gestion-nomina', 'ver'],
  ['nomina', 'ver'],
]), (req, res) => {
  const { empleadoId, estado } = req.query
  const cond = []
  const params = []
  if (empleadoId) { cond.push('empleado_id = ?'); params.push(empleadoId) }
  if (estado) { cond.push('estado = ?'); params.push(estado) }
  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : ''
  const rows = db.prepare(`SELECT * FROM tareas${where} ORDER BY creado DESC, id DESC`).all(...params)
  res.json(rows.map(tareaSalida))
})

app.post('/api/tareas', permisoRequired('gestion-nomina', 'crear'), (req, res) => {
  const { empleadoId, productoId, procesoId, cantidad, comentario } = req.body
  if (!empleadoId) return res.status(400).json({ error: 'Selecciona un empleado' })

  const producto = productoId ? db.prepare('SELECT * FROM productos WHERE id = ?').get(productoId) : null
  const proceso = procesoId ? db.prepare('SELECT * FROM procesos WHERE id = ?').get(procesoId) : null
  const ahora = new Date().toISOString()

  const r = db.prepare(
    `INSERT INTO tareas (empleado_id, producto_id, proceso_id, producto_nombre, proceso_nombre, pago, cantidad, progreso, estado, comentario, creado, actualizado)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'pendiente', ?, ?, ?)`
  ).run(
    empleadoId,
    productoId || null,
    procesoId || null,
    producto?.nombre || '',
    proceso?.nombre || '',
    Number(proceso?.pago) || 0,
    Number(cantidad) || 0,
    comentario || '',
    ahora,
    ahora,
  )
  res.json(tareaSalida(db.prepare('SELECT * FROM tareas WHERE id = ?').get(r.lastInsertRowid)))
})

app.put('/api/tareas/:id', permisoRequired('gestion-nomina', 'editar'), (req, res) => {
  const tarea = db.prepare('SELECT * FROM tareas WHERE id = ?').get(req.params.id)
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' })
  if (tarea.estado === 'pagada') {
    return res.status(400).json({ error: 'La tarea ya fue pagada; no se puede modificar.' })
  }

  const { progreso, comentario, estado } = req.body
  const nuevoProgreso = progreso == null ? tarea.progreso : Math.max(0, Math.min(100, Math.round(Number(progreso) || 0)))
  const nuevoComentario = comentario == null ? tarea.comentario : String(comentario)

  // Deriva el estado automático a partir del progreso, salvo que se fije explícitamente
  let nuevoEstado = estado || tarea.estado
  if (!estado && tarea.estado !== 'terminada') {
    if (nuevoProgreso >= 100) nuevoEstado = 'terminada'
    else if (nuevoProgreso > 0) nuevoEstado = 'en_progreso'
    else nuevoEstado = 'pendiente'
  }

  const ahora = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare('UPDATE tareas SET progreso = ?, comentario = ?, estado = ?, actualizado = ? WHERE id = ?')
      .run(nuevoProgreso, nuevoComentario, nuevoEstado, ahora, tarea.id)

    const cambioProgreso = nuevoProgreso !== tarea.progreso
    const cambioComentario = nuevoComentario !== (tarea.comentario || '')
    if (cambioProgreso || cambioComentario) {
      insertTareaHistorial.run(
        tarea.id,
        req.usuario || '',
        tarea.progreso,
        nuevoProgreso,
        cambioComentario ? nuevoComentario : null,
        ahora,
      )
    }
  })
  tx()
  res.json(tareaSalida(db.prepare('SELECT * FROM tareas WHERE id = ?').get(tarea.id)))
})

app.post('/api/tareas/:id/terminar', permisoRequired('gestion-nomina', 'editar'), (req, res) => {
  const tarea = db.prepare('SELECT * FROM tareas WHERE id = ?').get(req.params.id)
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' })
  if (tarea.estado === 'pagada') {
    return res.status(400).json({ error: 'La tarea ya fue pagada; no se puede modificar.' })
  }

  const ahora = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare("UPDATE tareas SET progreso = 100, estado = 'terminada', actualizado = ? WHERE id = ?")
      .run(ahora, tarea.id)
    insertTareaHistorial.run(tarea.id, req.usuario || '', tarea.progreso, 100, null, ahora)
  })
  tx()
  res.json(tareaSalida(db.prepare('SELECT * FROM tareas WHERE id = ?').get(tarea.id)))
})

app.delete('/api/tareas/:id', permisoRequired('gestion-nomina', 'eliminar'), (req, res) => {
  const tarea = db.prepare('SELECT estado FROM tareas WHERE id = ?').get(req.params.id)
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' })
  if (tarea.estado === 'pagada') {
    return res.status(400).json({ error: 'La tarea ya fue pagada; no se puede eliminar.' })
  }
  db.prepare('DELETE FROM tareas WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

app.get('/api/tareas/:id/historial', permisoRequired('gestion-nomina', 'ver'), (req, res) => {
  const rows = db.prepare('SELECT * FROM tarea_historial WHERE tarea_id = ? ORDER BY fecha DESC, id DESC').all(req.params.id)
  res.json(rows.map((h) => ({
    id: h.id,
    usuario: h.usuario || '',
    progresoAnterior: h.progreso_anterior,
    progresoNuevo: h.progreso_nuevo,
    comentario: h.comentario || '',
    fecha: h.fecha,
  })))
})

// --- Registro fotográfico de una tarea ---
// Lista las fotos SIN la imagen (solo metadatos), para no cargar base64 pesados
app.get('/api/tareas/:id/fotos', permisoAnyRequired([
  ['gestion-nomina', 'ver'],
  ['nomina', 'ver'],
]), (req, res) => {
  // ?full=1 incluye la imagen (base64) para incrustarla en el PDF; por defecto
  // solo se devuelven metadatos para no cargar imágenes pesadas en la galería.
  const full = req.query.full === '1'
  const cols = full ? 'id, descripcion, usuario, fecha, imagen, imagen_tipo' : 'id, descripcion, usuario, fecha'
  const rows = db.prepare(`SELECT ${cols} FROM tarea_fotos WHERE tarea_id = ? ORDER BY fecha DESC, id DESC`).all(req.params.id)
  res.json(rows.map((f) => ({
    id: f.id,
    descripcion: f.descripcion || '',
    usuario: f.usuario || '',
    fecha: f.fecha,
    ...(full ? { imagen: f.imagen, imagenTipo: f.imagen_tipo || '' } : {}),
  })))
})

// Sirve la imagen de una foto (binario), igual que el comprobante de movimientos
app.get('/api/tareas/fotos/:fotoId', permisoAnyRequired([
  ['gestion-nomina', 'ver'],
  ['nomina', 'ver'],
]), (req, res) => {
  const f = db.prepare('SELECT imagen, imagen_tipo FROM tarea_fotos WHERE id = ?').get(req.params.fotoId)
  if (!f || !f.imagen) return res.status(404).json({ error: 'Sin imagen' })
  const match = /^data:(.+?);base64,(.+)$/s.exec(f.imagen)
  if (!match) return res.status(400).json({ error: 'Imagen inválida' })
  const buffer = Buffer.from(match[2], 'base64')
  res.setHeader('Content-Type', f.imagen_tipo || match[1])
  res.send(buffer)
})

app.post('/api/tareas/:id/fotos', permisoRequired('gestion-nomina', 'editar'), (req, res) => {
  const tarea = db.prepare('SELECT id FROM tareas WHERE id = ?').get(req.params.id)
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' })
  const { imagen, imagenTipo, descripcion } = req.body
  if (!imagen) return res.status(400).json({ error: 'Falta la imagen' })
  const r = db.prepare(
    'INSERT INTO tarea_fotos (tarea_id, imagen, imagen_tipo, descripcion, usuario, fecha) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(tarea.id, imagen, imagenTipo || null, descripcion || '', req.usuario || '', new Date().toISOString())
  const f = db.prepare('SELECT id, descripcion, usuario, fecha FROM tarea_fotos WHERE id = ?').get(r.lastInsertRowid)
  res.json({ id: f.id, descripcion: f.descripcion || '', usuario: f.usuario || '', fecha: f.fecha })
})

app.delete('/api/tareas/fotos/:fotoId', permisoRequired('gestion-nomina', 'editar'), (req, res) => {
  db.prepare('DELETE FROM tarea_fotos WHERE id = ?').run(req.params.fotoId)
  res.json({ ok: true })
})

// ============ TAREAS DE PRODUCCIÓN (Gestión de Producción) ============
// Módulo separado de Gestión de Nómina: no maneja pago ni nómina, solo
// seguimiento de fabricación. Al crear la tarea se descuenta de una vez el
// stock de materiales según la receta del proceso (proceso_materiales).
const materialesConsumidosStmt = db.prepare(
  `SELECT mm.id, mm.material_id, m.nombre AS material_nombre, m.unidad, mm.cantidad, mm.costo_unitario
   FROM material_movimientos mm
   JOIN materiales m ON m.id = mm.material_id
   WHERE mm.tarea_produccion_id = ?
   ORDER BY mm.id ASC`
)

function tareaProduccionSalida(t) {
  return {
    id: t.id,
    empleadoId: t.empleado_id,
    productoId: t.producto_id,
    procesoId: t.proceso_id,
    productoNombre: t.producto_nombre || '',
    procesoNombre: t.proceso_nombre || '',
    cantidad: t.cantidad,
    progreso: t.progreso,
    estado: t.estado,
    comentario: t.comentario || '',
    ordenProduccionId: t.orden_produccion_id,
    creado: t.creado,
    actualizado: t.actualizado,
    materialesConsumidos: materialesConsumidosStmt.all(t.id).map((m) => ({
      materialId: m.material_id,
      materialNombre: m.material_nombre,
      unidad: m.unidad,
      cantidad: m.cantidad,
      costoUnitario: m.costo_unitario,
    })),
  }
}

function ordenProduccionSalida(o) {
  const tareas = db
    .prepare('SELECT * FROM tareas_produccion WHERE orden_produccion_id = ? ORDER BY creado ASC, id ASC')
    .all(o.id)
    .map(tareaProduccionSalida)
  return {
    id: o.id,
    productoId: o.producto_id,
    productoNombre: o.producto_nombre || '',
    cantidad: o.cantidad,
    estado: o.estado,
    comentario: o.comentario || '',
    creado: o.creado,
    actualizado: o.actualizado,
    tareas,
  }
}

const insertTareaProduccionHistorial = db.prepare(
  `INSERT INTO tarea_produccion_historial (tarea_id, usuario, progreso_anterior, progreso_nuevo, comentario, fecha)
   VALUES (?, ?, ?, ?, ?, ?)`
)

// ---- Órdenes de producción (agrupan tareas de un mismo lote/producto) ----
app.get('/api/ordenes-produccion', permisoRequired('gestion-produccion', 'ver'), (req, res) => {
  const { estado, productoId } = req.query
  const cond = []
  const params = []
  if (estado) { cond.push('estado = ?'); params.push(estado) }
  if (productoId) { cond.push('producto_id = ?'); params.push(productoId) }
  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : ''
  const rows = db.prepare(`SELECT * FROM ordenes_produccion${where} ORDER BY creado DESC, id DESC`).all(...params)
  res.json(rows.map(ordenProduccionSalida))
})

app.post('/api/ordenes-produccion', permisoRequired('gestion-produccion', 'crear'), (req, res) => {
  const { productoId, cantidad, comentario } = req.body
  const cant = Number(cantidad) || 0
  if (!(cant > 0)) return res.status(400).json({ error: 'Indica una cantidad mayor a 0' })

  const producto = productoId ? db.prepare('SELECT * FROM productos WHERE id = ?').get(productoId) : null
  const ahora = new Date().toISOString()
  const r = db.prepare(
    `INSERT INTO ordenes_produccion (producto_id, producto_nombre, cantidad, estado, comentario, creado, actualizado)
     VALUES (?, ?, ?, 'pendiente', ?, ?, ?)`
  ).run(productoId || null, producto?.nombre || '', cant, comentario || '', ahora, ahora)
  res.json(ordenProduccionSalida(db.prepare('SELECT * FROM ordenes_produccion WHERE id = ?').get(r.lastInsertRowid)))
})

app.put('/api/ordenes-produccion/:id', permisoRequired('gestion-produccion', 'editar'), (req, res) => {
  const orden = db.prepare('SELECT * FROM ordenes_produccion WHERE id = ?').get(req.params.id)
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' })
  const { cantidad, comentario } = req.body
  const nuevaCantidad = cantidad == null ? orden.cantidad : Number(cantidad) || 0
  const nuevoComentario = comentario == null ? orden.comentario : String(comentario)
  const ahora = new Date().toISOString()
  db.prepare('UPDATE ordenes_produccion SET cantidad = ?, comentario = ?, actualizado = ? WHERE id = ?')
    .run(nuevaCantidad, nuevoComentario, ahora, orden.id)
  res.json(ordenProduccionSalida(db.prepare('SELECT * FROM ordenes_produccion WHERE id = ?').get(orden.id)))
})

app.post('/api/ordenes-produccion/:id/terminar', permisoRequired('gestion-produccion', 'editar'), (req, res) => {
  const orden = db.prepare('SELECT * FROM ordenes_produccion WHERE id = ?').get(req.params.id)
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' })
  const ahora = new Date().toISOString()
  db.prepare("UPDATE ordenes_produccion SET estado = 'terminada', actualizado = ? WHERE id = ?").run(ahora, orden.id)
  res.json(ordenProduccionSalida(db.prepare('SELECT * FROM ordenes_produccion WHERE id = ?').get(orden.id)))
})

app.delete('/api/ordenes-produccion/:id', permisoRequired('gestion-produccion', 'eliminar'), (req, res) => {
  const orden = db.prepare('SELECT id FROM ordenes_produccion WHERE id = ?').get(req.params.id)
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' })
  const tareas = db.prepare('SELECT COUNT(*) c FROM tareas_produccion WHERE orden_produccion_id = ?').get(orden.id)
  if (tareas.c > 0) return res.status(400).json({ error: 'Elimina primero las tareas de esta orden' })
  db.prepare('DELETE FROM ordenes_produccion WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

app.get('/api/tareas-produccion', permisoRequired('gestion-produccion', 'ver'), (req, res) => {
  const { empleadoId, estado, ordenProduccionId } = req.query
  const cond = []
  const params = []
  if (empleadoId) { cond.push('empleado_id = ?'); params.push(empleadoId) }
  if (estado) { cond.push('estado = ?'); params.push(estado) }
  if (ordenProduccionId) { cond.push('orden_produccion_id = ?'); params.push(ordenProduccionId) }
  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : ''
  const rows = db.prepare(`SELECT * FROM tareas_produccion${where} ORDER BY creado DESC, id DESC`).all(...params)
  res.json(rows.map(tareaProduccionSalida))
})

app.post('/api/tareas-produccion', permisoRequired('gestion-produccion', 'crear'), (req, res) => {
  const { empleadoId, productoId, procesoId, cantidad, comentario, ordenProduccionId } = req.body
  if (!empleadoId) return res.status(400).json({ error: 'Selecciona un empleado' })
  const cant = Number(cantidad) || 0
  if (!(cant > 0)) return res.status(400).json({ error: 'Indica una cantidad mayor a 0' })

  const producto = productoId ? db.prepare('SELECT * FROM productos WHERE id = ?').get(productoId) : null
  const proceso = procesoId ? db.prepare('SELECT * FROM procesos WHERE id = ?').get(procesoId) : null
  const orden = ordenProduccionId ? db.prepare('SELECT * FROM ordenes_produccion WHERE id = ?').get(ordenProduccionId) : null
  const ahora = new Date().toISOString()

  const avisos = []
  const crear = db.transaction(() => {
    const r = db.prepare(
      `INSERT INTO tareas_produccion (empleado_id, producto_id, proceso_id, producto_nombre, proceso_nombre, cantidad, progreso, estado, comentario, orden_produccion_id, creado, actualizado)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'pendiente', ?, ?, ?, ?)`
    ).run(
      empleadoId,
      productoId || null,
      procesoId || null,
      producto?.nombre || '',
      proceso?.nombre || '',
      cant,
      comentario || '',
      orden?.id || null,
      ahora,
      ahora,
    )
    const tareaId = r.lastInsertRowid

    // Agregar trabajo a una orden ya terminada la reabre; si estaba pendiente
    // (sin trabajo aún) pasa a en_progreso.
    if (orden && orden.estado !== 'en_progreso') {
      db.prepare("UPDATE ordenes_produccion SET estado = 'en_progreso', actualizado = ? WHERE id = ?").run(ahora, orden.id)
    }

    // Descuenta stock según la receta del proceso (si tiene una definida)
    if (proceso) {
      const receta = materialesDeProceso(proceso.id)
      for (const item of receta) {
        const cantidadRequerida = item.cantidad * cant
        const material = db.prepare('SELECT * FROM materiales WHERE id = ?').get(item.materialId)
        if (!material) continue
        const nuevoStock = material.stock - cantidadRequerida
        db.prepare('UPDATE materiales SET stock = ? WHERE id = ?').run(nuevoStock, material.id)
        db.prepare(
          `INSERT INTO material_movimientos (material_id, tipo, cantidad, costo_unitario, fecha, descripcion, tarea_produccion_id)
           VALUES (?, 'salida', ?, ?, ?, ?, ?)`
        ).run(
          material.id,
          cantidadRequerida,
          material.costo_unitario,
          ahora,
          `Producción: ${producto?.nombre || ''} — ${proceso.nombre}`,
          tareaId,
        )
        if (nuevoStock < 0) {
          avisos.push(`${material.nombre}: stock insuficiente, quedó en ${nuevoStock} ${material.unidad}`)
        }
      }
    }

    return tareaId
  })
  const tareaId = crear()
  res.json({
    ...tareaProduccionSalida(db.prepare('SELECT * FROM tareas_produccion WHERE id = ?').get(tareaId)),
    avisos,
  })
})

app.put('/api/tareas-produccion/:id', permisoRequired('gestion-produccion', 'editar'), (req, res) => {
  const tarea = db.prepare('SELECT * FROM tareas_produccion WHERE id = ?').get(req.params.id)
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' })

  const { progreso, comentario, estado } = req.body
  const nuevoProgreso = progreso == null ? tarea.progreso : Math.max(0, Math.min(100, Math.round(Number(progreso) || 0)))
  const nuevoComentario = comentario == null ? tarea.comentario : String(comentario)

  let nuevoEstado = estado || tarea.estado
  if (!estado && tarea.estado !== 'terminada') {
    if (nuevoProgreso >= 100) nuevoEstado = 'terminada'
    else if (nuevoProgreso > 0) nuevoEstado = 'en_progreso'
    else nuevoEstado = 'pendiente'
  }

  const ahora = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare('UPDATE tareas_produccion SET progreso = ?, comentario = ?, estado = ?, actualizado = ? WHERE id = ?')
      .run(nuevoProgreso, nuevoComentario, nuevoEstado, ahora, tarea.id)

    const cambioProgreso = nuevoProgreso !== tarea.progreso
    const cambioComentario = nuevoComentario !== (tarea.comentario || '')
    if (cambioProgreso || cambioComentario) {
      insertTareaProduccionHistorial.run(
        tarea.id,
        req.usuario || '',
        tarea.progreso,
        nuevoProgreso,
        cambioComentario ? nuevoComentario : null,
        ahora,
      )
    }
  })
  tx()
  res.json(tareaProduccionSalida(db.prepare('SELECT * FROM tareas_produccion WHERE id = ?').get(tarea.id)))
})

app.post('/api/tareas-produccion/:id/terminar', permisoRequired('gestion-produccion', 'editar'), (req, res) => {
  const tarea = db.prepare('SELECT * FROM tareas_produccion WHERE id = ?').get(req.params.id)
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' })

  const ahora = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare("UPDATE tareas_produccion SET progreso = 100, estado = 'terminada', actualizado = ? WHERE id = ?")
      .run(ahora, tarea.id)
    insertTareaProduccionHistorial.run(tarea.id, req.usuario || '', tarea.progreso, 100, null, ahora)
  })
  tx()
  res.json(tareaProduccionSalida(db.prepare('SELECT * FROM tareas_produccion WHERE id = ?').get(tarea.id)))
})

app.delete('/api/tareas-produccion/:id', permisoRequired('gestion-produccion', 'eliminar'), (req, res) => {
  const tarea = db.prepare('SELECT id FROM tareas_produccion WHERE id = ?').get(req.params.id)
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' })
  db.prepare('DELETE FROM tareas_produccion WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

app.get('/api/tareas-produccion/:id/historial', permisoRequired('gestion-produccion', 'ver'), (req, res) => {
  const rows = db.prepare('SELECT * FROM tarea_produccion_historial WHERE tarea_id = ? ORDER BY fecha DESC, id DESC').all(req.params.id)
  res.json(rows.map((h) => ({
    id: h.id,
    usuario: h.usuario || '',
    progresoAnterior: h.progreso_anterior,
    progresoNuevo: h.progreso_nuevo,
    comentario: h.comentario || '',
    fecha: h.fecha,
  })))
})

// ============ MOVIMIENTOS (Control de dinero) ============
app.get('/api/movimientos', permisoRequired('control-dinero', 'ver'), (req, res) => {
  const { desde, hasta } = req.query
  let rows
  if (desde && hasta) {
    rows = db.prepare('SELECT * FROM movimientos WHERE fecha BETWEEN ? AND ? ORDER BY fecha DESC, id DESC').all(desde, hasta)
  } else {
    rows = db.prepare('SELECT * FROM movimientos ORDER BY fecha DESC, id DESC').all()
  }
  res.json(rows.map(movimientoSalida))
})

// Balance global: total ingresos, gastos y saldo actual
app.get('/api/movimientos/balance', permisoRequired('control-dinero', 'ver'), (req, res) => {
  const ingresos = db.prepare("SELECT COALESCE(SUM(monto), 0) AS t FROM movimientos WHERE tipo = 'ingreso'").get().t
  const gastos = db.prepare("SELECT COALESCE(SUM(monto), 0) AS t FROM movimientos WHERE tipo = 'gasto'").get().t
  res.json({ ingresos, gastos, balance: ingresos - gastos })
})

// Descarga / vista del comprobante (PDF o imagen) de un movimiento
app.get('/api/movimientos/:id/comprobante', permisoRequired('control-dinero', 'ver'), (req, res) => {
  const m = db.prepare('SELECT comprobante, comprobante_tipo FROM movimientos WHERE id = ?').get(req.params.id)
  if (!m || !m.comprobante) return res.status(404).json({ error: 'Sin comprobante' })
  const match = /^data:(.+?);base64,(.+)$/s.exec(m.comprobante)
  if (!match) return res.status(400).json({ error: 'Comprobante inválido' })
  const buffer = Buffer.from(match[2], 'base64')
  res.setHeader('Content-Type', m.comprobante_tipo || match[1])
  res.send(buffer)
})

app.post('/api/movimientos', permisoRequired('control-dinero', 'crear'), (req, res) => {
  const { tipo, fecha, categoria, monto, descripcion, comprobante, comprobanteTipo } = req.body
  if (tipo !== 'ingreso' && tipo !== 'gasto') {
    return res.status(400).json({ error: 'tipo debe ser ingreso o gasto' })
  }
  const r = insertMovimiento.run({
    tipo,
    fecha,
    categoria: categoria || '',
    monto: Number(monto) || 0,
    descripcion: descripcion || '',
    comprobante: comprobante || null,
    comprobante_tipo: comprobanteTipo || null,
    origen: 'manual',
    ref_id: null,
  })
  res.json(movimientoSalida(db.prepare('SELECT * FROM movimientos WHERE id = ?').get(r.lastInsertRowid)))
})

app.delete('/api/movimientos/:id', permisoRequired('control-dinero', 'eliminar'), (req, res) => {
  const m = db.prepare('SELECT origen FROM movimientos WHERE id = ?').get(req.params.id)
  if (m && m.origen !== 'manual') {
    return res.status(400).json({ error: 'Este movimiento es automático; elimina la nómina o el adelanto que lo originó.' })
  }
  db.prepare('DELETE FROM movimientos WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ============ EMPRESA ============
app.get('/api/empresa', permisoAnyRequired([
  ['empresa', 'ver'],
  ['nomina', 'ver'],
  ['historial', 'ver'],
]), (req, res) => {
  res.json(db.prepare('SELECT * FROM empresa WHERE id = 1').get())
})

app.put('/api/empresa', permisoRequired('empresa', 'editar'), (req, res) => {
  const { nombre, direccion, telefono, correo, nit, logo } = req.body
  db.prepare(
    'UPDATE empresa SET nombre=?, direccion=?, telefono=?, correo=?, nit=?, logo=? WHERE id = 1'
  ).run(nombre || '', direccion || '', telefono || '', correo || '', nit || '', logo || '')
  res.json(db.prepare('SELECT * FROM empresa WHERE id = 1').get())
})

// ============ REPORTES ============
app.get('/api/reportes', permisoRequired('reportes', 'ver'), (req, res) => {
  const { desde, hasta } = req.query
  if (!desde || !hasta) return res.status(400).json({ error: 'desde y hasta son requeridos' })

  const nominas = db
    .prepare('SELECT * FROM nominas WHERE fecha BETWEEN ? AND ? ORDER BY fecha ASC')
    .all(desde, hasta)
    .map(nominaCompleta)

  const totalPagado = nominas.reduce((s, n) => s + n.total, 0)
  const totalDescuentos = nominas.reduce((s, n) => s + n.totalDescuentos, 0)
  const totalBruto = nominas.reduce((s, n) => s + n.subtotal, 0)

  // Resumen por empleado
  const porEmpleadoMap = {}
  for (const n of nominas) {
    const key = n.empleadoId
    if (!porEmpleadoMap[key]) porEmpleadoMap[key] = { empleadoId: key, pagos: 0, bruto: 0, descuentos: 0, total: 0 }
    porEmpleadoMap[key].pagos += 1
    porEmpleadoMap[key].bruto += n.subtotal
    porEmpleadoMap[key].descuentos += n.totalDescuentos
    porEmpleadoMap[key].total += n.total
  }
  const empleados = db.prepare('SELECT id, nombre FROM empleados').all()
  const empMap = Object.fromEntries(empleados.map((e) => [e.id, e.nombre]))
  const porEmpleado = Object.values(porEmpleadoMap).map((x) => ({
    ...x,
    nombre: empMap[x.empleadoId] || '— (eliminado)',
  }))

  res.json({ desde, hasta, totalBruto, totalDescuentos, totalPagado, cantidad: nominas.length, porEmpleado, nominas })
})

// Reporte de materiales: entradas/salidas del periodo y stock disponible actual
// por material, con el detalle de movimientos que lo compone.
app.get('/api/reportes/materiales', permisoAnyRequired([
  ['reportes', 'ver'],
  ['materiales', 'ver'],
]), (req, res) => {
  const { desde, hasta } = req.query
  if (!desde || !hasta) return res.status(400).json({ error: 'desde y hasta son requeridos' })

  const materiales = db.prepare('SELECT * FROM materiales ORDER BY nombre').all()
  const movStmt = db.prepare(
    `SELECT * FROM material_movimientos
     WHERE material_id = ? AND date(fecha) BETWEEN date(?) AND date(?)
     ORDER BY fecha ASC, id ASC`
  )

  const porMaterial = materiales.map((mat) => {
    const movimientos = movStmt.all(mat.id, desde, hasta)
    const entradas = movimientos.filter((m) => m.tipo === 'entrada').reduce((s, m) => s + m.cantidad, 0)
    const salidas = movimientos.filter((m) => m.tipo === 'salida').reduce((s, m) => s + m.cantidad, 0)
    return {
      materialId: mat.id,
      nombre: mat.nombre,
      unidad: mat.unidad,
      stockActual: mat.stock,
      stockMinimo: mat.stock_minimo,
      costoUnitario: mat.costo_unitario,
      entradas,
      salidas,
      neto: entradas - salidas,
      movimientos: movimientos.map((m) => ({
        id: m.id,
        tipo: m.tipo,
        cantidad: m.cantidad,
        costoUnitario: m.costo_unitario,
        fecha: m.fecha,
        descripcion: m.descripcion || '',
      })),
    }
  })

  const totalEntradas = porMaterial.reduce((s, m) => s + m.entradas, 0)
  const totalSalidas = porMaterial.reduce((s, m) => s + m.salidas, 0)
  const stockBajoCount = porMaterial.filter((m) => m.stockActual <= m.stockMinimo).length

  res.json({ desde, hasta, materiales: porMaterial, totalEntradas, totalSalidas, stockBajoCount })
})

// ============ COSTEOS (Costos de productos) ============
// La estructura completa del costeo se guarda como JSON en la columna `datos`.
function costeoSalida(c) {
  let datos = {}
  try {
    datos = JSON.parse(c.datos || '{}')
  } catch {
    datos = {}
  }
  return { id: c.id, nombre: c.nombre, actualizado: c.actualizado, datos }
}

app.get('/api/costeos', permisoRequired('costos', 'ver'), (req, res) => {
  const rows = db.prepare('SELECT * FROM costeos ORDER BY nombre').all()
  res.json(rows.map(costeoSalida))
})

app.post('/api/costeos', permisoRequired('costos', 'crear'), (req, res) => {
  const { nombre, datos } = req.body
  const nom = String(nombre || '').trim()
  if (!nom) return res.status(400).json({ error: 'El nombre del costeo es obligatorio' })
  const r = db
    .prepare('INSERT INTO costeos (nombre, datos, actualizado) VALUES (?, ?, ?)')
    .run(nom, JSON.stringify(datos || {}), new Date().toISOString())
  res.json(costeoSalida(db.prepare('SELECT * FROM costeos WHERE id = ?').get(r.lastInsertRowid)))
})

app.put('/api/costeos/:id', permisoRequired('costos', 'editar'), (req, res) => {
  const { nombre, datos } = req.body
  const nom = String(nombre || '').trim()
  if (!nom) return res.status(400).json({ error: 'El nombre del costeo es obligatorio' })
  db.prepare('UPDATE costeos SET nombre = ?, datos = ?, actualizado = ? WHERE id = ?')
    .run(nom, JSON.stringify(datos || {}), new Date().toISOString(), req.params.id)
  res.json(costeoSalida(db.prepare('SELECT * FROM costeos WHERE id = ?').get(req.params.id)))
})

app.delete('/api/costeos/:id', permisoRequired('costos', 'eliminar'), (req, res) => {
  db.prepare('DELETE FROM costeos WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ============ Servir frontend compilado (producción / acceso LAN) ============
const distPath = join(__dirname, '..', 'dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (req, res) => res.sendFile(join(distPath, 'index.html')))
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Servidor de Nómina escuchando en:`)
  console.log(`  → Local:   http://localhost:${PORT}`)
  console.log(`  → Red:     http://<IP-de-tu-PC>:${PORT}  (para celular/tablet en la misma WiFi)\n`)
})

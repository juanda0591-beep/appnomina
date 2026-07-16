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
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const ingresos = db.prepare("SELECT COALESCE(SUM(monto), 0) AS t FROM movimientos WHERE tipo = 'ingreso' AND substr(fecha, 1, 10) = ?").get(hoy).t
  const gastos = db.prepare("SELECT COALESCE(SUM(monto), 0) AS t FROM movimientos WHERE tipo = 'gasto' AND substr(fecha, 1, 10) = ?").get(hoy).t
  // Mismos datos de ayer, para calcular la tendencia (subió/bajó) en el frontend
  const ingresosAyer = db.prepare("SELECT COALESCE(SUM(monto), 0) AS t FROM movimientos WHERE tipo = 'ingreso' AND substr(fecha, 1, 10) = ?").get(ayer).t
  const gastosAyer = db.prepare("SELECT COALESCE(SUM(monto), 0) AS t FROM movimientos WHERE tipo = 'gasto' AND substr(fecha, 1, 10) = ?").get(ayer).t

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
    ingresosAyer,
    gastosAyer,
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
  SELECT pm.id, pm.material_id, pm.cantidad, pm.por_color, pm.familia,
         m.nombre AS material_nombre, m.unidad
  FROM proceso_materiales pm
  LEFT JOIN materiales m ON m.id = pm.material_id
  WHERE pm.proceso_id = ?
  ORDER BY pm.por_color, m.nombre
`)

function materialesDeProceso(procesoId) {
  return procesoMaterialesStmt.all(procesoId).map((m) => ({
    id: m.id,
    materialId: m.material_id,
    materialNombre: m.por_color ? `${m.familia} (según color)` : m.material_nombre,
    unidad: m.unidad || '',
    cantidad: m.cantidad,
    porColor: !!m.por_color,
    familia: m.familia || '',
  }))
}

// Variantes de un producto (con nombre de color resuelto). El stock del inventario
// vive en producto_variantes; productos.stock es una suma cacheada.
const variantesStmt = db.prepare(`
  SELECT v.*, c.nombre AS color_nombre, c.hex AS color_hex
  FROM producto_variantes v
  LEFT JOIN colores c ON c.id = v.color_id
  WHERE v.producto_id = ? AND v.activo = 1
  ORDER BY v.id
`)
function variantesDeProducto(productoId) {
  return variantesStmt.all(productoId).map((v) => ({
    id: v.id,
    productoId: v.producto_id,
    colorId: v.color_id,
    colorNombre: v.color_nombre || '',
    colorHex: v.color_hex || '',
    codigo: v.codigo || '',
    stock: v.stock || 0,
    stockApertura: v.stock_apertura || 0,
    stockMinimo: v.stock_minimo || 0,
  }))
}

// Recalcula productos.stock = suma del stock de sus variantes activas (cache para
// que el dashboard y lecturas del total sigan funcionando sin cambios).
const recalcStockStmt = db.prepare(
  `UPDATE productos SET stock = (
     SELECT COALESCE(SUM(stock), 0) FROM producto_variantes WHERE producto_id = ? AND activo = 1
   ) WHERE id = ?`
)
function recalcularStockProducto(productoId) {
  recalcStockStmt.run(productoId, productoId)
}

// Devuelve la variante "por defecto" de un producto (la primera / única sin color).
// Sirve para operaciones que aún no especifican variante (compatibilidad Fase 1).
function variantePorDefecto(productoId) {
  return db
    .prepare('SELECT * FROM producto_variantes WHERE producto_id = ? AND activo = 1 ORDER BY (color_id IS NOT NULL), id LIMIT 1')
    .get(productoId)
}

// Resuelve el material concreto de una línea de receta dependiente de color:
// el material de esa familia cuyo color coincide con el de la variante.
function resolverMaterialPorColor(familia, colorId) {
  if (!familia || !colorId) return null
  return db.prepare('SELECT * FROM materiales WHERE familia = ? AND color_id = ? LIMIT 1').get(familia, colorId)
}

function productoConProcesos(prod) {
  const procesos = db
    .prepare('SELECT * FROM procesos WHERE producto_id = ?')
    .all(prod.id)
    .map((p) => ({ ...p, materiales: materialesDeProceso(p.id) }))
  const variantes = variantesDeProducto(prod.id)
  const stockTotal = variantes.reduce((s, v) => s + (v.stock || 0), 0)
  const aperturaTotal = variantes.reduce((s, v) => s + (v.stockApertura || 0), 0)
  return {
    id: prod.id,
    nombre: prod.nombre,
    codigo: prod.codigo || '',
    descripcion: prod.descripcion || '',
    valorVenta: prod.valor_venta || 0,
    valorCompra: prod.valor_compra || 0,
    stockApertura: aperturaTotal,
    stock: stockTotal,
    // mínimo del producto = el mayor mínimo entre sus variantes (referencia global)
    stockMinimo: variantes.reduce((s, v) => Math.max(s, v.stockMinimo || 0), 0),
    // valor del stock inicial = apertura total × valor de compra (se calcula, no se guarda)
    valorStockInicial: aperturaTotal * (prod.valor_compra || 0),
    variantes,
    procesos,
  }
}

// Inserta las filas de procesos (y su receta de materiales) para un producto,
// dentro de la transacción de crear/editar. Se reutiliza en POST y PUT.
const insertProceso = db.prepare('INSERT INTO procesos (producto_id, nombre, pago) VALUES (?, ?, ?)')
const insertProcesoMaterial = db.prepare(
  'INSERT INTO proceso_materiales (proceso_id, material_id, cantidad, por_color, familia) VALUES (?, ?, ?, ?, ?)'
)
function insertarProcesosConReceta(productoId, procesos) {
  for (const p of procesos) {
    const r = insertProceso.run(productoId, p.nombre.trim(), Number(p.pago) || 0)
    const procesoId = r.lastInsertRowid
    for (const m of p.materiales || []) {
      const cantidad = Number(m.cantidad) || 0
      if (cantidad <= 0) continue
      if (m.porColor) {
        // Línea dependiente del color: se guarda la familia; el material concreto se
        // resuelve en producción según el color de la variante. material_id queda 0.
        const familia = (m.familia || '').trim()
        if (familia) insertProcesoMaterial.run(procesoId, null, cantidad, 1, familia)
      } else {
        const materialId = Number(m.materialId)
        if (materialId) insertProcesoMaterial.run(procesoId, materialId, cantidad, 0, null)
      }
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

// Registra un movimiento de ingreso a caja (usado por ventas y anticipos de clientes)
function registrarIngreso({ fecha, categoria, monto, descripcion, origen = 'manual', refId = null }) {
  return insertMovimiento.run({
    tipo: 'ingreso',
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
  const {
    nombre, procesos = [], descripcion = '', valorVenta, valorCompra,
    stockApertura, stockMinimo,
  } = req.body
  const apertura = Number(stockApertura) || 0
  const minimo = Number(stockMinimo) || 0
  const insert = db.transaction(() => {
    const r = db.prepare(
      `INSERT INTO productos (nombre, descripcion, valor_venta, valor_compra, stock_apertura, stock, stock_minimo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      nombre.trim(), String(descripcion || ''),
      Number(valorVenta) || 0, Number(valorCompra) || 0,
      apertura, apertura, minimo,
    )
    const pid = r.lastInsertRowid
    // Código correlativo automático basado en el id (PRD-0001)
    const codigo = `PRD-${String(pid).padStart(4, '0')}`
    db.prepare('UPDATE productos SET codigo = ? WHERE id = ?').run(codigo, pid)
    // Variante por defecto (sin color): aquí vive el stock del inventario.
    db.prepare(
      `INSERT INTO producto_variantes (producto_id, color_id, codigo, stock, stock_apertura, stock_minimo, activo)
       VALUES (?, NULL, ?, ?, ?, ?, 1)`
    ).run(pid, codigo, apertura, apertura, minimo)
    insertarProcesosConReceta(pid, procesos)
    return pid
  })
  const pid = insert()
  res.json(productoConProcesos(db.prepare('SELECT * FROM productos WHERE id = ?').get(pid)))
})

app.put('/api/productos/:id', permisoRequired('productos', 'editar'), (req, res) => {
  const { id } = req.params
  const {
    nombre, procesos = [], descripcion = '', valorVenta, valorCompra,
    stockApertura, stockMinimo,
  } = req.body
  const actual = db.prepare('SELECT * FROM productos WHERE id = ?').get(id)
  if (!actual) return res.status(404).json({ error: 'Producto no encontrado' })
  const aperturaNueva = Number(stockApertura) || 0
  const minimoNuevo = Number(stockMinimo) || 0
  const update = db.transaction(() => {
    db.prepare(
      `UPDATE productos SET nombre = ?, descripcion = ?, valor_venta = ?, valor_compra = ? WHERE id = ?`
    ).run(
      nombre.trim(), String(descripcion || ''),
      Number(valorVenta) || 0, Number(valorCompra) || 0, id,
    )
    // Ajusta la variante por defecto: al cambiar la apertura, mueve el stock por la
    // diferencia (para no perder lo abastecido por producción). Si el producto tiene
    // varias variantes (Fase 2), solo se toca la variante sin color como referencia.
    const def = variantePorDefecto(id)
    if (def) {
      const diff = aperturaNueva - (def.stock_apertura || 0)
      db.prepare(
        'UPDATE producto_variantes SET stock_apertura = ?, stock = ?, stock_minimo = ? WHERE id = ?'
      ).run(aperturaNueva, (def.stock || 0) + diff, minimoNuevo, def.id)
    }
    recalcularStockProducto(id)
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

// ---- Variantes de un producto (colores). El stock vive por variante. ----
// Agrega una variante de color a un producto.
app.post('/api/productos/:id/variantes', permisoRequired('productos', 'editar'), (req, res) => {
  const { id } = req.params
  const { colorId, stockApertura = 0, stockMinimo = 0 } = req.body
  const producto = db.prepare('SELECT * FROM productos WHERE id = ?').get(id)
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado' })
  if (!colorId) return res.status(400).json({ error: 'Elige un color para la variante' })
  const yaExiste = db.prepare('SELECT id FROM producto_variantes WHERE producto_id = ? AND color_id = ? AND activo = 1').get(id, colorId)
  if (yaExiste) return res.status(400).json({ error: 'Ese color ya existe para este producto' })
  const color = db.prepare('SELECT * FROM colores WHERE id = ?').get(colorId)
  const apertura = Number(stockApertura) || 0
  const sufijo = (color?.nombre || '').slice(0, 3).toUpperCase()
  const codigo = `${producto.codigo || 'PRD'}-${sufijo}`
  db.transaction(() => {
    db.prepare(
      `INSERT INTO producto_variantes (producto_id, color_id, codigo, stock, stock_apertura, stock_minimo, activo)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    ).run(id, colorId, codigo, apertura, apertura, Number(stockMinimo) || 0)
    recalcularStockProducto(id)
  })()
  res.json(productoConProcesos(db.prepare('SELECT * FROM productos WHERE id = ?').get(id)))
})

// Edita una variante (stock de apertura / mínimo). Ajusta stock por diferencia de apertura.
app.put('/api/productos/:id/variantes/:varId', permisoRequired('productos', 'editar'), (req, res) => {
  const { id, varId } = req.params
  const { stockApertura, stockMinimo } = req.body
  const v = db.prepare('SELECT * FROM producto_variantes WHERE id = ? AND producto_id = ?').get(varId, id)
  if (!v) return res.status(404).json({ error: 'Variante no encontrada' })
  const aperturaNueva = Number(stockApertura) || 0
  const diff = aperturaNueva - (v.stock_apertura || 0)
  db.transaction(() => {
    db.prepare('UPDATE producto_variantes SET stock_apertura = ?, stock = ?, stock_minimo = ? WHERE id = ?')
      .run(aperturaNueva, (v.stock || 0) + diff, Number(stockMinimo) || 0, varId)
    recalcularStockProducto(id)
  })()
  res.json(productoConProcesos(db.prepare('SELECT * FROM productos WHERE id = ?').get(id)))
})

// Desactiva una variante (no se borra para conservar histórico de movimientos).
app.delete('/api/productos/:id/variantes/:varId', permisoRequired('productos', 'editar'), (req, res) => {
  const { id, varId } = req.params
  const activas = db.prepare('SELECT COUNT(*) n FROM producto_variantes WHERE producto_id = ? AND activo = 1').get(id).n
  if (activas <= 1) return res.status(400).json({ error: 'El producto debe conservar al menos una variante' })
  db.transaction(() => {
    db.prepare('UPDATE producto_variantes SET activo = 0 WHERE id = ? AND producto_id = ?').run(varId, id)
    recalcularStockProducto(id)
  })()
  res.json(productoConProcesos(db.prepare('SELECT * FROM productos WHERE id = ?').get(id)))
})

function movimientoProductoSalida(m) {
  return {
    id: m.id,
    tipo: m.tipo,
    varianteId: m.variante_id || null,
    cantidad: m.cantidad,
    costoUnitario: m.costo_unitario,
    fecha: m.fecha,
    descripcion: m.descripcion || '',
    ordenProduccionId: m.orden_produccion_id,
  }
}

// Entrada manual de producto comprado (no fabricado): suma stock y, si viene, actualiza
// el valor de compra. Queda registrada como movimiento tipo 'entrada'.
app.post('/api/productos/:id/entrada', permisoRequired('productos', 'crear'), (req, res) => {
  const { id } = req.params
  const { cantidad, costoUnitario, fecha, descripcion, varianteId } = req.body
  const cant = Number(cantidad) || 0
  if (cant <= 0) return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' })
  const costo = Number(costoUnitario) || 0

  const producto = db.prepare('SELECT * FROM productos WHERE id = ?').get(id)
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado' })

  // Variante destino: la indicada, o la por defecto (Fase 1 / productos sin color).
  const variante = varianteId
    ? db.prepare('SELECT * FROM producto_variantes WHERE id = ? AND producto_id = ?').get(varianteId, id)
    : variantePorDefecto(id)
  if (!variante) return res.status(400).json({ error: 'El producto no tiene una variante para recibir stock' })

  const update = db.transaction(() => {
    db.prepare(
      `INSERT INTO producto_movimientos (producto_id, variante_id, tipo, cantidad, costo_unitario, fecha, descripcion)
       VALUES (?, ?, 'entrada', ?, ?, ?, ?)`
    ).run(id, variante.id, cant, costo, fecha || new Date().toISOString(), (descripcion || '').trim())
    db.prepare('UPDATE producto_variantes SET stock = stock + ? WHERE id = ?').run(cant, variante.id)
    if (costo > 0) db.prepare('UPDATE productos SET valor_compra = ? WHERE id = ?').run(costo, id)
    recalcularStockProducto(id)
  })
  update()
  res.json(productoConProcesos(db.prepare('SELECT * FROM productos WHERE id = ?').get(id)))
})

app.get('/api/productos/:id/movimientos', permisoRequired('productos', 'ver'), (req, res) => {
  const movimientos = db
    .prepare('SELECT * FROM producto_movimientos WHERE producto_id = ? ORDER BY fecha DESC, id DESC')
    .all(req.params.id)
  res.json(movimientos.map(movimientoProductoSalida))
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
    colorId: m.color_id || null,
    familia: m.familia || '',
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

// ============ COLORES (catálogo) ============
function colorSalida(c) {
  return { id: c.id, nombre: c.nombre, hex: c.hex || '', activo: !!c.activo }
}
app.get('/api/colores', permisoAnyRequired([
  ['colores', 'ver'], ['materiales', 'ver'], ['productos', 'ver'],
  ['gestion-produccion', 'ver'], ['pedidos', 'ver'], ['ventas', 'ver'],
]), (req, res) => {
  const rows = db.prepare('SELECT * FROM colores ORDER BY nombre').all()
  res.json(rows.map(colorSalida))
})
app.post('/api/colores', permisoRequired('colores', 'crear'), (req, res) => {
  const { nombre, hex = '' } = req.body
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' })
  const r = db.prepare('INSERT INTO colores (nombre, hex, activo) VALUES (?, ?, 1)').run(nombre.trim(), (hex || '').trim())
  res.json(colorSalida(db.prepare('SELECT * FROM colores WHERE id = ?').get(r.lastInsertRowid)))
})
app.put('/api/colores/:id', permisoRequired('colores', 'editar'), (req, res) => {
  const { nombre, hex = '', activo = true } = req.body
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' })
  db.prepare('UPDATE colores SET nombre = ?, hex = ?, activo = ? WHERE id = ?')
    .run(nombre.trim(), (hex || '').trim(), activo ? 1 : 0, req.params.id)
  res.json(colorSalida(db.prepare('SELECT * FROM colores WHERE id = ?').get(req.params.id)))
})
app.delete('/api/colores/:id', permisoRequired('colores', 'eliminar'), (req, res) => {
  db.prepare('DELETE FROM colores WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

app.get('/api/materiales', permisoRequired('materiales', 'ver'), (req, res) => {
  const materiales = db.prepare('SELECT * FROM materiales ORDER BY nombre').all()
  res.json(materiales.map(materialSalida))
})

app.post('/api/materiales', permisoRequired('materiales', 'crear'), (req, res) => {
  const { nombre, unidad, costoUnitario = 0, stockInicial = 0, stockMinimo = 0, colorId = null, familia = '' } = req.body
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' })
  if (!unidad || !unidad.trim()) return res.status(400).json({ error: 'La unidad es obligatoria' })

  const insert = db.transaction(() => {
    const stock = Number(stockInicial) || 0
    const costo = Number(costoUnitario) || 0
    const minimo = Number(stockMinimo) || 0
    const r = db
      .prepare('INSERT INTO materiales (nombre, unidad, stock, costo_unitario, stock_minimo, color_id, familia) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(nombre.trim(), unidad.trim(), stock, costo, minimo, colorId || null, (familia || '').trim() || null)
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
  const { nombre, unidad, costoUnitario, stockMinimo, colorId = null, familia = '' } = req.body
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' })
  if (!unidad || !unidad.trim()) return res.status(400).json({ error: 'La unidad es obligatoria' })

  db.prepare('UPDATE materiales SET nombre = ?, unidad = ?, costo_unitario = ?, stock_minimo = ?, color_id = ?, familia = ? WHERE id = ?').run(
    nombre.trim(),
    unidad.trim(),
    Number(costoUnitario) || 0,
    Number(stockMinimo) || 0,
    colorId || null,
    (familia || '').trim() || null,
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

// Pago de mano de obra por unidad de un proceso. Se busca primero por proceso_id
// (exacto); si el proceso fue re-creado al editar el producto (ids nuevos), cae
// al nombre dentro del mismo producto, que es más estable.
function pagoUnitarioDeTarea(t) {
  if (t.proceso_id) {
    const p = db.prepare('SELECT pago FROM procesos WHERE id = ?').get(t.proceso_id)
    if (p) return Number(p.pago) || 0
  }
  if (t.producto_id && t.proceso_nombre) {
    const p = db
      .prepare('SELECT pago FROM procesos WHERE producto_id = ? AND LOWER(nombre) = LOWER(?)')
      .get(t.producto_id, t.proceso_nombre)
    if (p) return Number(p.pago) || 0
  }
  return 0
}

function tareaProduccionSalida(t) {
  const pagoUnitario = pagoUnitarioDeTarea(t)
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
    motivoMerma: t.motivo_merma || '',
    ordenProduccionId: t.orden_produccion_id,
    pagoUnitario,
    manoObra: (Number(t.cantidad) || 0) * pagoUnitario,
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

// Costo unitario estimado a partir del objeto `datos` de un costeo (mismo cálculo
// que src/utils/costeo.js, replicado aquí para comparar contra el costo real).
function calcularCostoUnitarioEstimado(d) {
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
  const materialesUnit = (d.insumos || []).reduce((s, i) => s + num(i.cantidad) * num(i.precioUnitario), 0)
  const manoObraUnit = (d.manoObra || []).reduce((s, m) => s + (m.tipo === 'hora' ? num(m.horas) * num(m.valor) : num(m.valor)), 0)
  const directosUnit = materialesUnit + manoObraUnit
  const indirectosPeriodo = (d.indirectos || []).reduce((s, i) => s + num(i.montoPeriodo), 0)
  const unidadesPeriodo = num(d.unidadesPeriodo)
  const indirectosUnit = unidadesPeriodo > 0 ? indirectosPeriodo / unidadesPeriodo : 0
  const subtotalUnit = directosUnit + indirectosUnit
  const imprevistoUnit = subtotalUnit * (num(d.imprevistoPct) / 100)
  return subtotalUnit + imprevistoUnit
}

function ordenProduccionSalida(o) {
  const tareas = db
    .prepare('SELECT * FROM tareas_produccion WHERE orden_produccion_id = ? ORDER BY creado ASC, id ASC')
    .all(o.id)
    .map(tareaProduccionSalida)

  // Costo real de la orden: materiales consumidos (a su costo al momento) +
  // mano de obra de cada proceso (cantidad × pago del proceso).
  let materiales = 0
  let manoObra = 0
  for (const t of tareas) {
    for (const m of t.materialesConsumidos) materiales += (Number(m.cantidad) || 0) * (Number(m.costoUnitario) || 0)
    manoObra += Number(t.manoObra) || 0
  }
  const total = materiales + manoObra
  // Unidades producidas = cantidad del último proceso (refleja la merma).
  const producidas = tareas.length ? Number(tareas[tareas.length - 1].cantidad) || 0 : 0
  const unitario = producidas > 0 ? total / producidas : 0

  // Comparación: valor de venta del producto + costo estimado del costeo ligado.
  const producto = o.producto_id ? db.prepare('SELECT valor_venta FROM productos WHERE id = ?').get(o.producto_id) : null
  const valorVenta = producto ? Number(producto.valor_venta) || 0 : 0
  const costeo = o.producto_id ? db.prepare('SELECT datos FROM costeos WHERE producto_id = ? ORDER BY id DESC LIMIT 1').get(o.producto_id) : null
  let costoEstimadoUnit = null
  if (costeo) {
    try { costoEstimadoUnit = calcularCostoUnitarioEstimado(JSON.parse(costeo.datos || '{}')) } catch { costoEstimadoUnit = null }
  }

  return {
    id: o.id,
    productoId: o.producto_id,
    productoNombre: o.producto_nombre || '',
    varianteId: o.variante_id || null,
    colorNombre: o.color_nombre || '',
    cantidad: o.cantidad,
    estado: o.estado,
    comentario: o.comentario || '',
    fechaEntrega: o.fecha_entrega || '',
    stockAbastecido: o.stock_abastecido || 0,
    creado: o.creado,
    actualizado: o.actualizado,
    costoReal: { materiales, manoObra, total, unitario, producidas },
    valorVenta,
    costoEstimadoUnit,
    tareas,
  }
}

// Cantidad con la que una orden abastece el stock del producto al terminarse:
// la cantidad del ÚLTIMO proceso (el más reciente por creación), para reflejar
// la merma entre procesos (ej: cortaron 30 pero ensamblaron 28 → suma 28).
function cantidadAbastecerOrden(ordenId) {
  const ultima = db
    .prepare('SELECT cantidad FROM tareas_produccion WHERE orden_produccion_id = ? ORDER BY creado DESC, id DESC LIMIT 1')
    .get(ordenId)
  return ultima ? Number(ultima.cantidad) || 0 : 0
}

// Suma al stock del producto lo que abastece la orden y lo registra en la orden.
// Si la orden ya había abastecido, primero revierte lo anterior (idempotente).
function abastecerStockProducto(orden) {
  if (!orden.producto_id) return
  const previo = Number(orden.stock_abastecido) || 0
  const nuevo = cantidadAbastecerOrden(orden.id)
  const delta = nuevo - previo
  // Variante que produce esta orden: la indicada, o la por defecto (Fase 1 / sin color)
  const varId = orden.variante_id || variantePorDefecto(orden.producto_id)?.id
  if (delta !== 0 && varId) {
    db.prepare('UPDATE producto_variantes SET stock = stock + ? WHERE id = ?').run(delta, varId)
    recalcularStockProducto(orden.producto_id)
    // Registra el abastecimiento por producción en el historial del producto
    db.prepare(
      `INSERT INTO producto_movimientos (producto_id, variante_id, tipo, cantidad, costo_unitario, fecha, descripcion, orden_produccion_id)
       VALUES (?, ?, 'produccion', ?, 0, ?, ?, ?)`
    ).run(orden.producto_id, varId, delta, new Date().toISOString(), `Producción: orden #${orden.id}`, orden.id)
  }
  db.prepare('UPDATE ordenes_produccion SET stock_abastecido = ? WHERE id = ?').run(nuevo, orden.id)
}

// Revierte del stock del producto lo que la orden había abastecido (al reabrir o
// eliminar una orden terminada) y deja el marcador en 0.
function revertirStockProducto(orden) {
  const previo = Number(orden.stock_abastecido) || 0
  if (previo !== 0 && orden.producto_id) {
    const varId = orden.variante_id || variantePorDefecto(orden.producto_id)?.id
    if (varId) {
      db.prepare('UPDATE producto_variantes SET stock = stock - ? WHERE id = ?').run(previo, varId)
      recalcularStockProducto(orden.producto_id)
    }
    // Registra la reversa (cantidad negativa) para dejar rastro en el historial
    db.prepare(
      `INSERT INTO producto_movimientos (producto_id, variante_id, tipo, cantidad, costo_unitario, fecha, descripcion, orden_produccion_id)
       VALUES (?, ?, 'produccion', ?, 0, ?, ?, ?)`
    ).run(orden.producto_id, orden.variante_id || variantePorDefecto(orden.producto_id)?.id || null, -previo, new Date().toISOString(), `Reversa producción: orden #${orden.id} reabierta/eliminada`, orden.id)
  }
  db.prepare('UPDATE ordenes_produccion SET stock_abastecido = 0 WHERE id = ?').run(orden.id)
}

const insertTareaProduccionHistorial = db.prepare(
  `INSERT INTO tarea_produccion_historial (tarea_id, usuario, progreso_anterior, progreso_nuevo, comentario, fecha)
   VALUES (?, ?, ?, ?, ?, ?)`
)

// ---- Órdenes de producción (agrupan tareas de un mismo lote/producto) ----
app.get('/api/ordenes-produccion', permisoAnyRequired([
  ['gestion-produccion', 'ver'],
  ['reportes', 'ver'],
]), (req, res) => {
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
  const { productoId, cantidad, comentario, fechaEntrega, varianteId } = req.body
  const cant = Number(cantidad) || 0
  if (!(cant > 0)) return res.status(400).json({ error: 'Indica una cantidad mayor a 0' })

  const producto = productoId ? db.prepare('SELECT * FROM productos WHERE id = ?').get(productoId) : null
  // Variante (color) que fabrica la orden: la indicada o la por defecto del producto.
  const variante = varianteId
    ? db.prepare('SELECT * FROM producto_variantes WHERE id = ? AND producto_id = ?').get(varianteId, productoId)
    : (productoId ? variantePorDefecto(productoId) : null)
  const colorNombre = variante?.color_id
    ? (db.prepare('SELECT nombre FROM colores WHERE id = ?').get(variante.color_id)?.nombre || '')
    : ''
  const ahora = new Date().toISOString()
  const r = db.prepare(
    `INSERT INTO ordenes_produccion (producto_id, producto_nombre, variante_id, color_nombre, cantidad, estado, comentario, fecha_entrega, creado, actualizado)
     VALUES (?, ?, ?, ?, ?, 'pendiente', ?, ?, ?, ?)`
  ).run(productoId || null, producto?.nombre || '', variante?.id || null, colorNombre, cant, comentario || '', fechaEntrega || null, ahora, ahora)
  res.json(ordenProduccionSalida(db.prepare('SELECT * FROM ordenes_produccion WHERE id = ?').get(r.lastInsertRowid)))
})

app.put('/api/ordenes-produccion/:id', permisoRequired('gestion-produccion', 'editar'), (req, res) => {
  const orden = db.prepare('SELECT * FROM ordenes_produccion WHERE id = ?').get(req.params.id)
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' })
  const { cantidad, comentario, fechaEntrega } = req.body
  const nuevaCantidad = cantidad == null ? orden.cantidad : Number(cantidad) || 0
  const nuevoComentario = comentario == null ? orden.comentario : String(comentario)
  const nuevaFechaEntrega = fechaEntrega === undefined ? orden.fecha_entrega : (fechaEntrega || null)
  const ahora = new Date().toISOString()
  db.prepare('UPDATE ordenes_produccion SET cantidad = ?, comentario = ?, fecha_entrega = ?, actualizado = ? WHERE id = ?')
    .run(nuevaCantidad, nuevoComentario, nuevaFechaEntrega, ahora, orden.id)
  res.json(ordenProduccionSalida(db.prepare('SELECT * FROM ordenes_produccion WHERE id = ?').get(orden.id)))
})

app.post('/api/ordenes-produccion/:id/terminar', permisoRequired('gestion-produccion', 'editar'), (req, res) => {
  const orden = db.prepare('SELECT * FROM ordenes_produccion WHERE id = ?').get(req.params.id)
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' })

  // El producto debe haber pasado por todas sus etapas: la orden debe tener todos
  // los procesos configurados en el producto y todos deben estar terminados.
  const tareas = db.prepare('SELECT * FROM tareas_produccion WHERE orden_produccion_id = ?').all(orden.id)
  const procesosProducto = orden.producto_id
    ? db.prepare('SELECT nombre FROM procesos WHERE producto_id = ?').all(orden.producto_id)
    : []
  if (procesosProducto.length > 0) {
    const enOrden = new Set(tareas.map((t) => (t.proceso_nombre || '').toLowerCase()))
    const faltantes = procesosProducto.filter((p) => !enOrden.has((p.nombre || '').toLowerCase()))
    if (faltantes.length > 0) {
      return res.status(400).json({ error: `Faltan procesos del producto: ${faltantes.map((p) => p.nombre).join(', ')}` })
    }
  }
  const sinTerminar = tareas.filter((t) => t.estado !== 'terminada')
  if (sinTerminar.length > 0) {
    return res.status(400).json({ error: `Faltan procesos por terminar: ${sinTerminar.map((t) => t.proceso_nombre).join(', ')}` })
  }

  const ahora = new Date().toISOString()
  const terminar = db.transaction(() => {
    db.prepare("UPDATE ordenes_produccion SET estado = 'terminada', actualizado = ? WHERE id = ?").run(ahora, orden.id)
    // Al terminar, abastece el stock del producto con la cantidad del último proceso
    abastecerStockProducto(orden)
  })
  terminar()
  res.json(ordenProduccionSalida(db.prepare('SELECT * FROM ordenes_produccion WHERE id = ?').get(orden.id)))
})

// Cambio de estado para el tablero Kanban. Solo permite los movimientos manuales
// pendiente↔en_progreso; para pasar a 'terminada' se usa /terminar (que valida
// procesos completos y abastece stock), y para salir de 'terminada' se reabre
// agregando trabajo. Si se retrocede una orden que ya abasteció, se revierte.
app.post('/api/ordenes-produccion/:id/estado', permisoRequired('gestion-produccion', 'editar'), (req, res) => {
  const orden = db.prepare('SELECT * FROM ordenes_produccion WHERE id = ?').get(req.params.id)
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' })
  const { estado } = req.body
  if (!['pendiente', 'en_progreso'].includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido. Para terminar usa el botón Terminar.' })
  }
  const ahora = new Date().toISOString()
  const tx = db.transaction(() => {
    // Si venía de 'terminada', revertir el stock que había abastecido.
    if (orden.estado === 'terminada') revertirStockProducto(orden)
    db.prepare('UPDATE ordenes_produccion SET estado = ?, actualizado = ? WHERE id = ?').run(estado, ahora, orden.id)
  })
  tx()
  res.json(ordenProduccionSalida(db.prepare('SELECT * FROM ordenes_produccion WHERE id = ?').get(orden.id)))
})

// Chequeo de material (MRP ligero preventivo): dada una lista de procesos y una
// cantidad, calcula cuánto material se necesita y si el stock actual alcanza.
// No descuenta ni bloquea nada; es solo informativo. Recibe body:
//   { procesos: [procesoId, ...], cantidad }  ó  { procesoId, cantidad }
app.post('/api/produccion/chequeo-material', permisoAnyRequired([
  ['gestion-produccion', 'ver'],
  ['gestion-produccion', 'crear'],
]), (req, res) => {
  const { procesos, procesoId, cantidad, colorId } = req.body
  const cant = Number(cantidad) || 0
  const ids = procesos && Array.isArray(procesos) ? procesos : (procesoId ? [procesoId] : [])
  if (ids.length === 0 || !(cant > 0)) {
    return res.json({ items: [], hayFaltantes: false })
  }

  // Acumula el requerido por material sumando la receta de todos los procesos.
  // Las líneas dependientes de color se resuelven al material concreto del color dado.
  const requeridoPorMaterial = new Map()
  const avisosColor = []
  for (const pid of ids) {
    for (const item of materialesDeProceso(pid)) {
      let materialId = item.materialId
      let materialNombre = item.materialNombre
      let unidad = item.unidad
      if (item.porColor) {
        const mat = resolverMaterialPorColor(item.familia, colorId)
        if (!mat) {
          avisosColor.push(`Falta definir el material de "${item.familia}" para el color elegido`)
          continue
        }
        materialId = mat.id; materialNombre = mat.nombre; unidad = mat.unidad
      }
      const prev = requeridoPorMaterial.get(materialId) || { materialNombre, unidad, requerido: 0 }
      prev.requerido += (Number(item.cantidad) || 0) * cant
      requeridoPorMaterial.set(materialId, prev)
    }
  }

  const items = [...requeridoPorMaterial.entries()].map(([materialId, r]) => {
    const material = db.prepare('SELECT stock FROM materiales WHERE id = ?').get(materialId)
    const stockActual = material ? Number(material.stock) || 0 : 0
    const faltante = Math.max(0, r.requerido - stockActual)
    return { materialId, materialNombre: r.materialNombre, unidad: r.unidad, requerido: r.requerido, stockActual, faltante }
  }).sort((a, b) => a.materialNombre.localeCompare(b.materialNombre))

  res.json({ items, hayFaltantes: items.some((i) => i.faltante > 0), avisosColor })
})

app.delete('/api/ordenes-produccion/:id', permisoRequired('gestion-produccion', 'eliminar'), (req, res) => {
  const orden = db.prepare('SELECT * FROM ordenes_produccion WHERE id = ?').get(req.params.id)
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' })
  // Una orden con procesos ya descontó materiales del inventario: no se puede
  // eliminar para no perder ese descuento. Solo se eliminan órdenes vacías.
  const tareas = db.prepare('SELECT COUNT(*) c FROM tareas_produccion WHERE orden_produccion_id = ?').get(orden.id)
  if (tareas.c > 0) {
    return res.status(400).json({ error: 'No se puede eliminar: esta orden ya tiene procesos que descontaron materiales.' })
  }
  db.prepare('DELETE FROM ordenes_produccion WHERE id = ?').run(orden.id)
  res.json({ ok: true })
})

app.get('/api/tareas-produccion', permisoAnyRequired([
  ['gestion-produccion', 'ver'],
  ['reportes', 'ver'],
]), (req, res) => {
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

  // Un mismo proceso no se puede repetir dentro de la misma orden. Se compara por
  // nombre (no por proceso_id) porque al editar un producto los procesos se borran
  // y reinsertan con ids nuevos, así que el id no es estable entre ediciones.
  if (orden && proceso) {
    const yaExiste = db
      .prepare('SELECT 1 FROM tareas_produccion WHERE orden_produccion_id = ? AND LOWER(proceso_nombre) = LOWER(?) LIMIT 1')
      .get(orden.id, proceso.nombre)
    if (yaExiste) {
      return res.status(400).json({ error: `El proceso "${proceso.nombre}" ya está en esta orden` })
    }
  }

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
      // Si estaba terminada y ya había abastecido stock del producto, se revierte
      // porque la orden vuelve a estar en curso (se volverá a abastecer al terminarla).
      if (orden.estado === 'terminada') revertirStockProducto(orden)
      db.prepare("UPDATE ordenes_produccion SET estado = 'en_progreso', actualizado = ? WHERE id = ?").run(ahora, orden.id)
    }

    // Descuenta stock según la receta del proceso (si tiene una definida).
    // Las líneas dependientes de color usan el material del color de la orden.
    if (proceso) {
      const colorOrdenId = orden?.variante_id
        ? db.prepare('SELECT color_id FROM producto_variantes WHERE id = ?').get(orden.variante_id)?.color_id
        : null
      const receta = materialesDeProceso(proceso.id)
      for (const item of receta) {
        let material
        if (item.porColor) {
          material = resolverMaterialPorColor(item.familia, colorOrdenId)
          if (!material) {
            avisos.push(`No hay material de "${item.familia}" para el color de la orden; no se descontó`)
            continue
          }
        } else {
          material = db.prepare('SELECT * FROM materiales WHERE id = ?').get(item.materialId)
        }
        if (!material) continue
        const cantidadRequerida = item.cantidad * cant
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

  const { progreso, comentario, estado, cantidad, motivoMerma } = req.body
  const nuevoProgreso = progreso == null ? tarea.progreso : Math.max(0, Math.min(100, Math.round(Number(progreso) || 0)))
  const nuevoComentario = comentario == null ? tarea.comentario : String(comentario)
  const nuevaCantidad = cantidad == null ? tarea.cantidad : Math.max(0, Number(cantidad) || 0)
  const nuevoMotivoMerma = motivoMerma == null ? tarea.motivo_merma : String(motivoMerma)

  let nuevoEstado = estado || tarea.estado
  if (!estado && tarea.estado !== 'terminada') {
    if (nuevoProgreso >= 100) nuevoEstado = 'terminada'
    else if (nuevoProgreso > 0) nuevoEstado = 'en_progreso'
    else nuevoEstado = 'pendiente'
  }

  const ahora = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare('UPDATE tareas_produccion SET progreso = ?, comentario = ?, estado = ?, cantidad = ?, motivo_merma = ?, actualizado = ? WHERE id = ?')
      .run(nuevoProgreso, nuevoComentario, nuevoEstado, nuevaCantidad, nuevoMotivoMerma, ahora, tarea.id)

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

// Dashboard de producción: KPIs y cuello de botella. Solo lectura.
app.get('/api/produccion/dashboard', permisoAnyRequired([
  ['produccion-dashboard', 'ver'],
  ['gestion-produccion', 'ver'],
]), (req, res) => {
  const mes = new Date().toISOString().slice(0, 7)
  const ordenes = db.prepare('SELECT * FROM ordenes_produccion').all().map(ordenProduccionSalida)

  const activas = ordenes.filter((o) => o.estado !== 'terminada').length
  const terminadasMes = ordenes.filter((o) => o.estado === 'terminada' && (o.actualizado || '').slice(0, 7) === mes)

  // Unidades producidas y costo real del mes (órdenes terminadas este mes)
  let unidadesMes = 0
  let costoRealMes = 0
  for (const o of terminadasMes) {
    unidadesMes += o.costoReal.producidas
    costoRealMes += o.costoReal.total
  }

  // Merma promedio de las órdenes terminadas del mes (con ≥2 procesos)
  const mermas = terminadasMes
    .filter((o) => o.tareas.length >= 2)
    .map((o) => {
      const ini = Number(o.tareas[0].cantidad) || 0
      const fin = Number(o.tareas[o.tareas.length - 1].cantidad) || 0
      return ini > 0 ? ((ini - fin) / ini) * 100 : 0
    })
  const mermaPromedio = mermas.length ? mermas.reduce((s, m) => s + m, 0) / mermas.length : 0

  // Cuello de botella: proceso con más tareas sin terminar (en órdenes activas)
  const cuelloMap = {}
  for (const o of ordenes) {
    if (o.estado === 'terminada') continue
    for (const t of o.tareas) {
      if (t.estado === 'terminada') continue
      const key = t.procesoNombre || '(sin proceso)'
      cuelloMap[key] = (cuelloMap[key] || 0) + 1
    }
  }
  const cuelloBotella = Object.entries(cuelloMap)
    .map(([proceso, tareas]) => ({ proceso, tareas }))
    .sort((a, b) => b.tareas - a.tareas)

  // Unidades producidas por producto (mes)
  const porProductoMap = {}
  for (const o of terminadasMes) {
    const key = o.productoNombre || '(sin producto)'
    porProductoMap[key] = (porProductoMap[key] || 0) + o.costoReal.producidas
  }
  const unidadesPorProducto = Object.entries(porProductoMap)
    .map(([producto, unidades]) => ({ producto, unidades }))
    .sort((a, b) => b.unidades - a.unidades)

  res.json({
    ordenesActivas: activas,
    ordenesTerminadasMes: terminadasMes.length,
    unidadesMes,
    costoRealMes,
    mermaPromedio,
    cuelloBotella,
    unidadesPorProducto,
  })
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
  return { id: c.id, nombre: c.nombre, productoId: c.producto_id, actualizado: c.actualizado, datos }
}

app.get('/api/costeos', permisoRequired('costos', 'ver'), (req, res) => {
  const rows = db.prepare('SELECT * FROM costeos ORDER BY nombre').all()
  res.json(rows.map(costeoSalida))
})

app.post('/api/costeos', permisoRequired('costos', 'crear'), (req, res) => {
  const { nombre, datos, productoId } = req.body
  const nom = String(nombre || '').trim()
  if (!nom) return res.status(400).json({ error: 'El nombre del costeo es obligatorio' })
  const r = db
    .prepare('INSERT INTO costeos (nombre, producto_id, datos, actualizado) VALUES (?, ?, ?, ?)')
    .run(nom, productoId || null, JSON.stringify(datos || {}), new Date().toISOString())
  res.json(costeoSalida(db.prepare('SELECT * FROM costeos WHERE id = ?').get(r.lastInsertRowid)))
})

app.put('/api/costeos/:id', permisoRequired('costos', 'editar'), (req, res) => {
  const { nombre, datos, productoId } = req.body
  const nom = String(nombre || '').trim()
  if (!nom) return res.status(400).json({ error: 'El nombre del costeo es obligatorio' })
  db.prepare('UPDATE costeos SET nombre = ?, producto_id = ?, datos = ?, actualizado = ? WHERE id = ?')
    .run(nom, productoId || null, JSON.stringify(datos || {}), new Date().toISOString(), req.params.id)
  res.json(costeoSalida(db.prepare('SELECT * FROM costeos WHERE id = ?').get(req.params.id)))
})

app.delete('/api/costeos/:id', permisoRequired('costos', 'eliminar'), (req, res) => {
  db.prepare('DELETE FROM costeos WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ============ CLIENTES (directorio) ============
// El saldo a favor del cliente se calcula sumando sus anticipos: abonos suman,
// aplicados/devueltos restan. Se deriva, no se cachea, para no desincronizar.
function saldoFavorCliente(clienteId) {
  const rows = db.prepare('SELECT tipo, monto FROM cliente_anticipos WHERE cliente_id = ?').all(clienteId)
  let saldo = 0
  for (const r of rows) {
    const m = Number(r.monto) || 0
    if (r.tipo === 'abono') saldo += m
    else saldo -= m // 'aplicado' o 'devuelto' restan del saldo a favor
  }
  return saldo
}

function clienteSalida(c) {
  return {
    id: c.id,
    nombre: c.nombre,
    apellidos: c.apellidos || '',
    cedula: c.cedula || '',
    correo: c.correo || '',
    direccion: c.direccion || '',
    municipio: c.municipio || '',
    telefono: c.telefono || '',
    tipo: c.tipo || 'cliente',
    saldoFavor: saldoFavorCliente(c.id),
    creado: c.creado,
    actualizado: c.actualizado,
  }
}

// Clientes se leen también desde Pedidos y Ventas (necesitan el selector).
app.get('/api/clientes', permisoAnyRequired([
  ['clientes', 'ver'],
  ['ventas', 'ver'],
  ['pedidos', 'ver'],
]), (req, res) => {
  const clientes = db.prepare('SELECT * FROM clientes ORDER BY nombre, apellidos').all()
  res.json(clientes.map(clienteSalida))
})

app.post('/api/clientes', permisoRequired('clientes', 'crear'), (req, res) => {
  const { nombre, apellidos, cedula, correo, direccion, municipio, telefono, tipo } = req.body
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' })
  const ahora = new Date().toISOString()
  const r = db.prepare(
    `INSERT INTO clientes (nombre, apellidos, cedula, correo, direccion, municipio, telefono, tipo, creado, actualizado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    nombre.trim(), (apellidos || '').trim(), (cedula || '').trim(), (correo || '').trim(),
    (direccion || '').trim(), (municipio || '').trim(), (telefono || '').trim(),
    tipo === 'proveedor' ? 'proveedor' : 'cliente', ahora, ahora
  )
  res.json(clienteSalida(db.prepare('SELECT * FROM clientes WHERE id = ?').get(r.lastInsertRowid)))
})

app.put('/api/clientes/:id', permisoRequired('clientes', 'editar'), (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id)
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' })
  const { nombre, apellidos, cedula, correo, direccion, municipio, telefono, tipo } = req.body
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' })
  db.prepare(
    `UPDATE clientes SET nombre = ?, apellidos = ?, cedula = ?, correo = ?, direccion = ?,
     municipio = ?, telefono = ?, tipo = ?, actualizado = ? WHERE id = ?`
  ).run(
    nombre.trim(), (apellidos || '').trim(), (cedula || '').trim(), (correo || '').trim(),
    (direccion || '').trim(), (municipio || '').trim(), (telefono || '').trim(),
    tipo === 'proveedor' ? 'proveedor' : 'cliente', new Date().toISOString(), cliente.id
  )
  res.json(clienteSalida(db.prepare('SELECT * FROM clientes WHERE id = ?').get(cliente.id)))
})

app.delete('/api/clientes/:id', permisoRequired('clientes', 'eliminar'), (req, res) => {
  const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(req.params.id)
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' })
  const ventas = db.prepare('SELECT COUNT(*) c FROM ventas WHERE cliente_id = ?').get(cliente.id)
  if (ventas.c > 0) return res.status(400).json({ error: 'No se puede eliminar: el cliente tiene ventas registradas.' })
  // Cada anticipo (abono) generó un ingreso real en caja; borrar el cliente dejaría
  // ese ingreso huérfano en Control de Dinero. Se bloquea para no descuadrar la caja.
  const anticipos = db.prepare('SELECT COUNT(*) c FROM cliente_anticipos WHERE cliente_id = ?').get(cliente.id)
  if (anticipos.c > 0) return res.status(400).json({ error: 'No se puede eliminar: el cliente tiene anticipos registrados.' })
  db.prepare('DELETE FROM clientes WHERE id = ?').run(cliente.id) // pedidos (sin venta) caen por quedar sueltos
  res.json({ ok: true })
})

// ---- Anticipos (abonos del cliente a cuenta) ----
function anticipoSalida(a) {
  return {
    id: a.id,
    clienteId: a.cliente_id,
    monto: a.monto,
    tipo: a.tipo,
    ventaId: a.venta_id,
    fecha: a.fecha,
    descripcion: a.descripcion || '',
  }
}

app.get('/api/clientes/:id/anticipos', permisoAnyRequired([
  ['clientes', 'ver'],
  ['ventas', 'ver'],
]), (req, res) => {
  const rows = db.prepare('SELECT * FROM cliente_anticipos WHERE cliente_id = ? ORDER BY fecha DESC, id DESC').all(req.params.id)
  res.json(rows.map(anticipoSalida))
})

app.post('/api/clientes/:id/anticipos', permisoRequired('clientes', 'crear'), (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id)
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' })
  const monto = Number(req.body.monto) || 0
  if (!(monto > 0)) return res.status(400).json({ error: 'Indica un monto mayor a 0' })
  const fecha = req.body.fecha || new Date().toISOString()
  const descripcion = (req.body.descripcion || '').trim()
  const registrar = db.transaction(() => {
    const r = db.prepare(
      `INSERT INTO cliente_anticipos (cliente_id, monto, tipo, fecha, descripcion) VALUES (?, ?, 'abono', ?, ?)`
    ).run(cliente.id, monto, fecha, descripcion)
    // El abono entra a caja como ingreso
    registrarIngreso({
      fecha,
      categoria: 'Anticipo de cliente',
      monto,
      descripcion: `Anticipo de ${cliente.nombre}${descripcion ? ' — ' + descripcion : ''}`,
      origen: 'anticipo',
      refId: r.lastInsertRowid,
    })
  })
  registrar()
  res.json(clienteSalida(db.prepare('SELECT * FROM clientes WHERE id = ?').get(cliente.id)))
})

app.delete('/api/clientes/:clienteId/anticipos/:anticipoId', permisoRequired('clientes', 'eliminar'), (req, res) => {
  const ant = db.prepare('SELECT * FROM cliente_anticipos WHERE id = ? AND cliente_id = ?')
    .get(req.params.anticipoId, req.params.clienteId)
  if (!ant) return res.status(404).json({ error: 'Anticipo no encontrado' })
  if (ant.tipo === 'aplicado') return res.status(400).json({ error: 'No se puede borrar un anticipo ya aplicado a una venta.' })
  const borrar = db.transaction(() => {
    // Revierte el ingreso a caja que generó el abono
    db.prepare("DELETE FROM movimientos WHERE origen = 'anticipo' AND ref_id = ?").run(ant.id)
    db.prepare('DELETE FROM cliente_anticipos WHERE id = ?').run(ant.id)
  })
  borrar()
  res.json({ ok: true })
})

// ============ PEDIDOS (encargos del cliente) ============
function pedidoSalida(p) {
  const items = db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ? ORDER BY id ASC').all(p.id).map((it) => ({
    id: it.id,
    productoId: it.producto_id,
    productoNombre: it.producto_nombre || '',
    varianteId: it.variante_id || null,
    colorNombre: it.color_nombre || '',
    cantidad: it.cantidad,
    precioUnitario: it.precio_unitario,
    subtotal: (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0),
  }))
  return {
    id: p.id,
    clienteId: p.cliente_id,
    clienteNombre: p.cliente_nombre || '',
    estado: p.estado,
    fechaEntrega: p.fecha_entrega || '',
    comentario: p.comentario || '',
    total: p.total,
    ventaId: p.venta_id,
    creado: p.creado,
    actualizado: p.actualizado,
    items,
  }
}

// Inserta los ítems de un pedido/venta y devuelve el total. Reutilizable.
// Inserta los ítems de una venta o pedido y devuelve el subtotal.
// Con conDescuento=true (venta_items) guarda el % de descuento por línea y lo
// resta al subtotal; en pedidos no hay descuento por ítem.
function insertarItems(tabla, fkCampo, parentId, items, conDescuento = false) {
  const cols = `${fkCampo}, producto_id, producto_nombre, variante_id, color_nombre, cantidad, precio_unitario${conDescuento ? ', descuento_pct' : ''}`
  const marks = conDescuento ? '?, ?, ?, ?, ?, ?, ?, ?' : '?, ?, ?, ?, ?, ?, ?'
  const stmt = db.prepare(`INSERT INTO ${tabla} (${cols}) VALUES (${marks})`)
  let total = 0
  for (const it of items || []) {
    const cantidad = Number(it.cantidad) || 0
    const precio = Number(it.precioUnitario) || 0
    if (cantidad <= 0) continue
    const prod = it.productoId ? db.prepare('SELECT nombre FROM productos WHERE id = ?').get(it.productoId) : null
    // Nombre de color: el que venga, o el de la variante indicada
    let colorNombre = it.colorNombre || ''
    if (!colorNombre && it.varianteId) {
      const v = db.prepare('SELECT c.nombre FROM producto_variantes pv LEFT JOIN colores c ON c.id = pv.color_id WHERE pv.id = ?').get(it.varianteId)
      colorNombre = v?.nombre || ''
    }
    // % de descuento por línea (solo aplica en ventas); acotado a 0–100
    const descPct = conDescuento ? Math.max(0, Math.min(100, Number(it.descuentoPct) || 0)) : 0
    const args = [parentId, it.productoId || null, prod?.nombre || it.productoNombre || '', it.varianteId || null, colorNombre, cantidad, precio]
    if (conDescuento) args.push(descPct)
    stmt.run(...args)
    total += cantidad * precio * (1 - descPct / 100)
  }
  return total
}

app.get('/api/pedidos', permisoAnyRequired([
  ['pedidos', 'ver'],
  ['ventas', 'ver'],
]), (req, res) => {
  const rows = db.prepare('SELECT * FROM pedidos ORDER BY creado DESC, id DESC').all()
  res.json(rows.map(pedidoSalida))
})

app.post('/api/pedidos', permisoRequired('pedidos', 'crear'), (req, res) => {
  const { clienteId, fechaEntrega, comentario, items } = req.body
  const cliente = clienteId ? db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId) : null
  const itemsValidos = (items || []).filter((it) => (Number(it.cantidad) || 0) > 0)
  if (itemsValidos.length === 0) return res.status(400).json({ error: 'Agrega al menos un producto al pedido' })
  const ahora = new Date().toISOString()
  let pedidoId
  const crear = db.transaction(() => {
    const r = db.prepare(
      `INSERT INTO pedidos (cliente_id, cliente_nombre, estado, fecha_entrega, comentario, total, creado, actualizado)
       VALUES (?, ?, 'pendiente', ?, ?, 0, ?, ?)`
    ).run(clienteId || null, cliente ? `${cliente.nombre || ''} ${cliente.apellidos || ''}`.trim() : '', fechaEntrega || null, (comentario || '').trim(), ahora, ahora)
    pedidoId = r.lastInsertRowid
    const total = insertarItems('pedido_items', 'pedido_id', pedidoId, itemsValidos)
    db.prepare('UPDATE pedidos SET total = ? WHERE id = ?').run(total, pedidoId)
  })
  crear()
  res.json(pedidoSalida(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId)))
})

app.put('/api/pedidos/:id', permisoRequired('pedidos', 'editar'), (req, res) => {
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id)
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' })
  if (pedido.estado === 'entregado') return res.status(400).json({ error: 'Un pedido ya convertido en venta no se puede editar.' })
  const { clienteId, fechaEntrega, comentario, items } = req.body
  const cliente = clienteId ? db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId) : null
  const itemsValidos = (items || []).filter((it) => (Number(it.cantidad) || 0) > 0)
  if (itemsValidos.length === 0) return res.status(400).json({ error: 'Agrega al menos un producto al pedido' })
  const ahora = new Date().toISOString()
  const actualizar = db.transaction(() => {
    db.prepare('DELETE FROM pedido_items WHERE pedido_id = ?').run(pedido.id)
    const total = insertarItems('pedido_items', 'pedido_id', pedido.id, itemsValidos)
    db.prepare('UPDATE pedidos SET cliente_id = ?, cliente_nombre = ?, fecha_entrega = ?, comentario = ?, total = ?, actualizado = ? WHERE id = ?')
      .run(clienteId || null, cliente ? `${cliente.nombre || ''} ${cliente.apellidos || ''}`.trim() : '', fechaEntrega || null, (comentario || '').trim(), total, ahora, pedido.id)
  })
  actualizar()
  res.json(pedidoSalida(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id)))
})

app.delete('/api/pedidos/:id', permisoRequired('pedidos', 'eliminar'), (req, res) => {
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id)
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' })
  if (pedido.estado === 'entregado') return res.status(400).json({ error: 'Un pedido ya convertido en venta no se puede eliminar.' })
  db.prepare('DELETE FROM pedidos WHERE id = ?').run(pedido.id) // items caen por FK
  res.json({ ok: true })
})

// ============ VENTAS (descuenta stock + registra ingreso) ============
function ventaSalida(v) {
  const items = db.prepare('SELECT * FROM venta_items WHERE venta_id = ? ORDER BY id ASC').all(v.id).map((it) => ({
    id: it.id,
    productoId: it.producto_id,
    productoNombre: it.producto_nombre || '',
    varianteId: it.variante_id || null,
    colorNombre: it.color_nombre || '',
    cantidad: it.cantidad,
    precioUnitario: it.precio_unitario,
    descuentoPct: Number(it.descuento_pct) || 0,
    // Subtotal de la línea ya con su descuento por producto aplicado
    subtotal: Math.round((Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0) * (1 - (Number(it.descuento_pct) || 0) / 100)),
  }))
  // Abonos registrados + estado de pago derivado del saldo
  const pagos = db.prepare('SELECT * FROM venta_pagos WHERE venta_id = ? ORDER BY fecha ASC, id ASC').all(v.id).map((p) => ({
    id: p.id,
    monto: p.monto,
    fecha: p.fecha,
    comentario: p.comentario || '',
    metodo: p.metodo || 'efectivo',
  }))
  const total = Number(v.total) || 0
  const pagado = Number(v.pagado) || 0
  const saldo = Math.max(0, total - pagado)
  const estadoPago = saldo <= 0.009 ? 'pagado' : (pagado > 0 ? 'parcial' : 'pendiente')
  return {
    id: v.id,
    codigo: v.codigo || `VTA-${String(v.id).padStart(4, '0')}`,
    clienteId: v.cliente_id,
    clienteNombre: v.cliente_nombre || '',
    pedidoId: v.pedido_id,
    total,
    descuentoPct: Number(v.descuento_pct) || 0,
    // Subtotal bruto (antes de descuento global) para mostrarlo en el detalle/PDF
    subtotalBruto: items.reduce((s, it) => s + it.subtotal, 0),
    anticipoAplicado: v.anticipo_aplicado,
    pagado,
    saldo,
    estadoPago,
    pagos,
    fecha: v.fecha,
    comentario: v.comentario || '',
    creado: v.creado,
    items,
  }
}

// Núcleo de una venta: crea la venta + ítems, descuenta stock, aplica anticipo y
// registra el ingreso. Se usa tanto en la venta directa como al convertir un pedido.
// Devuelve { ventaId, avisos }.
function crearVentaCore({ clienteId, items, comentario, aplicarAnticipo, pedidoId, pagoInicial, fecha, descuentoTipo, descuentoPct, metodoPago }) {
  const cliente = clienteId ? db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId) : null
  if (!cliente) throw new Error('La venta requiere un cliente')
  const itemsValidos = (items || []).filter((it) => (Number(it.cantidad) || 0) > 0)
  if (itemsValidos.length === 0) throw new Error('La venta no tiene productos')
  const ahora = new Date().toISOString()
  const fechaVenta = fecha || ahora
  const avisos = []
  // Descuento global (sobre toda la venta) vs por producto (por línea). Excluyentes.
  const esGlobal = descuentoTipo === 'global'
  const descGlobalPct = esGlobal ? Math.max(0, Math.min(100, Number(descuentoPct) || 0)) : 0
  // Método de pago del abono inicial: solo 'efectivo' entra a caja
  const metodo = metodoPago === 'transferencia' ? 'transferencia' : 'efectivo'

  const r = db.prepare(
    `INSERT INTO ventas (codigo, cliente_id, cliente_nombre, pedido_id, total, anticipo_aplicado, pagado, descuento_pct, fecha, comentario, creado)
     VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?)`
  ).run(null, clienteId || null, cliente ? `${cliente.nombre || ''} ${cliente.apellidos || ''}`.trim() : '', pedidoId || null, descGlobalPct, fechaVenta, (comentario || '').trim(), ahora)
  const ventaId = r.lastInsertRowid
  // Código legible VTA-####
  db.prepare('UPDATE ventas SET codigo = ? WHERE id = ?').run(`VTA-${String(ventaId).padStart(4, '0')}`, ventaId)

  // Ítems (con descuento por línea si el modo es "por producto"). El subtotal ya
  // trae aplicados los descuentos de línea; luego restamos el descuento global.
  const itemsInsertar = esGlobal ? itemsValidos.map((it) => ({ ...it, descuentoPct: 0 })) : itemsValidos
  const subtotal = insertarItems('venta_items', 'venta_id', ventaId, itemsInsertar, true)
  const total = Math.round(subtotal * (1 - descGlobalPct / 100))
  for (const it of itemsValidos) {
    if (!it.productoId) continue
    const cantidad = Number(it.cantidad) || 0
    const producto = db.prepare('SELECT * FROM productos WHERE id = ?').get(it.productoId)
    if (!producto) continue
    // Variante a descontar: la indicada, o la por defecto (Fase 1 / sin color)
    const variante = it.varianteId
      ? db.prepare('SELECT * FROM producto_variantes WHERE id = ? AND producto_id = ?').get(it.varianteId, producto.id)
      : variantePorDefecto(producto.id)
    if (!variante) { avisos.push(`${producto.nombre}: sin variante para descontar stock`); continue }
    const nuevoStock = (Number(variante.stock) || 0) - cantidad
    db.prepare('UPDATE producto_variantes SET stock = ? WHERE id = ?').run(nuevoStock, variante.id)
    recalcularStockProducto(producto.id)
    const etiqueta = variante.color_id
      ? `${producto.nombre} (${db.prepare('SELECT nombre FROM colores WHERE id = ?').get(variante.color_id)?.nombre || ''})`
      : producto.nombre
    db.prepare(
      `INSERT INTO producto_movimientos (producto_id, variante_id, tipo, cantidad, costo_unitario, fecha, descripcion)
       VALUES (?, ?, 'venta', ?, ?, ?, ?)`
    ).run(producto.id, variante.id, cantidad, producto.valor_compra || 0, ahora, `Venta #${ventaId}${cliente ? ' — ' + cliente.nombre : ''}`)
    if (nuevoStock < 0) avisos.push(`${etiqueta}: stock insuficiente, quedó en ${nuevoStock}`)
  }

  // Aplicar saldo a favor del cliente (anticipo), sin exceder el saldo ni el total
  let anticipoAplicado = 0
  if (aplicarAnticipo && cliente) {
    const saldo = saldoFavorCliente(cliente.id)
    anticipoAplicado = Math.min(saldo, total)
    if (anticipoAplicado > 0) {
      db.prepare(
        `INSERT INTO cliente_anticipos (cliente_id, monto, tipo, venta_id, fecha, descripcion)
         VALUES (?, ?, 'aplicado', ?, ?, ?)`
      ).run(cliente.id, anticipoAplicado, ventaId, ahora, `Aplicado a venta #${ventaId}`)
    }
  }

  // Saldo tras aplicar el anticipo. El pago en efectivo de ahora ("pagoInicial")
  // por defecto salda todo (venta de contado); si se indica menor, la venta queda
  // a crédito (parcial o pendiente). No puede exceder el saldo.
  const saldoTrasAnticipo = Math.max(0, total - anticipoAplicado)
  const abonoInicial = pagoInicial == null
    ? saldoTrasAnticipo
    : Math.max(0, Math.min(Number(pagoInicial) || 0, saldoTrasAnticipo))
  const pagado = anticipoAplicado + abonoInicial
  db.prepare('UPDATE ventas SET total = ?, anticipo_aplicado = ?, pagado = ? WHERE id = ?')
    .run(total, anticipoAplicado, pagado, ventaId)

  // Registra el abono inicial. Solo si es en EFECTIVO entra a caja; una
  // transferencia bancaria salda la venta pero no ingresa a la caja física.
  if (abonoInicial > 0) {
    db.prepare('INSERT INTO venta_pagos (venta_id, monto, fecha, comentario, metodo, creado) VALUES (?, ?, ?, ?, ?, ?)')
      .run(ventaId, abonoInicial, fechaVenta, 'Pago inicial', metodo, ahora)
    if (metodo === 'efectivo') {
      registrarIngreso({
        fecha: fechaVenta,
        categoria: 'Venta',
        monto: abonoInicial,
        descripcion: `Venta #${ventaId}${cliente ? ' — ' + cliente.nombre : ''}`,
        origen: 'venta',
        refId: ventaId,
      })
    }
  }

  return { ventaId, avisos }
}

app.get('/api/ventas', permisoRequired('ventas', 'ver'), (req, res) => {
  const rows = db.prepare('SELECT * FROM ventas ORDER BY creado DESC, id DESC').all()
  res.json(rows.map(ventaSalida))
})

app.post('/api/ventas', permisoRequired('ventas', 'crear'), (req, res) => {
  const { clienteId, items, comentario, aplicarAnticipo, pagoInicial, fecha, descuentoTipo, descuentoPct, metodoPago } = req.body
  const itemsValidos = (items || []).filter((it) => (Number(it.cantidad) || 0) > 0)
  if (itemsValidos.length === 0) return res.status(400).json({ error: 'Agrega al menos un producto a la venta' })
  let resultado
  const crear = db.transaction(() => {
    resultado = crearVentaCore({ clienteId, items: itemsValidos, comentario, aplicarAnticipo, pagoInicial, fecha, descuentoTipo, descuentoPct, metodoPago })
  })
  crear()
  const venta = ventaSalida(db.prepare('SELECT * FROM ventas WHERE id = ?').get(resultado.ventaId))
  res.json({ ...venta, avisos: resultado.avisos })
})

// Convierte un pedido en venta: crea la venta con los ítems del pedido, descuenta
// stock e ingresa la plata; marca el pedido como entregado y lo liga a la venta.
app.post('/api/pedidos/:id/convertir', permisoRequired('ventas', 'crear'), (req, res) => {
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id)
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' })
  if (pedido.estado === 'entregado') return res.status(400).json({ error: 'Este pedido ya fue convertido en venta.' })
  // Ítems: los editados desde el formulario de venta si vienen; si no, los del pedido.
  const itemsBody = (req.body.items || []).filter((it) => (Number(it.cantidad) || 0) > 0)
  const items = itemsBody.length > 0 ? itemsBody : db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(pedido.id).map((it) => ({
    productoId: it.producto_id,
    productoNombre: it.producto_nombre,
    varianteId: it.variante_id || null,
    colorNombre: it.color_nombre || '',
    cantidad: it.cantidad,
    precioUnitario: it.precio_unitario,
  }))
  if (items.length === 0) return res.status(400).json({ error: 'El pedido no tiene productos' })
  let resultado
  const convertir = db.transaction(() => {
    resultado = crearVentaCore({
      // Usa el cliente elegido en el formulario de venta si viene; si no, el del pedido
      clienteId: req.body.clienteId || pedido.cliente_id,
      items,
      comentario: (req.body.comentario || '').trim() || `Pedido #${pedido.id}`,
      aplicarAnticipo: req.body.aplicarAnticipo,
      pedidoId: pedido.id,
      pagoInicial: req.body.pagoInicial,
      descuentoTipo: req.body.descuentoTipo,
      descuentoPct: req.body.descuentoPct,
      metodoPago: req.body.metodoPago,
    })
    db.prepare("UPDATE pedidos SET estado = 'entregado', venta_id = ?, actualizado = ? WHERE id = ?")
      .run(resultado.ventaId, new Date().toISOString(), pedido.id)
  })
  convertir()
  const venta = ventaSalida(db.prepare('SELECT * FROM ventas WHERE id = ?').get(resultado.ventaId))
  res.json({ ...venta, avisos: resultado.avisos })
})

// Registra un abono (pago recibido) a una venta a crédito. Suma a `pagado`,
// ingresa la plata a caja y recalcula el estado de pago.
app.post('/api/ventas/:id/pagos', permisoRequired('ventas', 'editar'), (req, res) => {
  const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id)
  if (!venta) return res.status(404).json({ error: 'Venta no encontrada' })
  const monto = Number(req.body.monto) || 0
  if (monto <= 0) return res.status(400).json({ error: 'El monto del abono debe ser mayor a 0' })
  const saldo = Math.max(0, (Number(venta.total) || 0) - (Number(venta.pagado) || 0))
  if (saldo <= 0.009) return res.status(400).json({ error: 'Esta venta ya está pagada por completo' })
  if (monto > saldo + 0.009) return res.status(400).json({ error: `El abono (${monto}) supera el saldo pendiente (${saldo})` })

  const ahora = new Date().toISOString()
  const fecha = req.body.fecha || ahora
  const comentario = (req.body.comentario || '').trim() || 'Abono'
  // Solo el efectivo entra a caja; la transferencia salda la venta pero no ingresa a caja
  const metodo = req.body.metodo === 'transferencia' ? 'transferencia' : 'efectivo'
  const registrar = db.transaction(() => {
    db.prepare('INSERT INTO venta_pagos (venta_id, monto, fecha, comentario, metodo, creado) VALUES (?, ?, ?, ?, ?, ?)')
      .run(venta.id, monto, fecha, comentario, metodo, ahora)
    db.prepare('UPDATE ventas SET pagado = pagado + ? WHERE id = ?').run(monto, venta.id)
    if (metodo === 'efectivo') {
      registrarIngreso({
        fecha,
        categoria: 'Venta',
        monto,
        descripcion: `Abono venta ${venta.codigo || '#' + venta.id}${venta.cliente_nombre ? ' — ' + venta.cliente_nombre : ''}`,
        origen: 'venta',
        refId: venta.id,
      })
    }
  })
  registrar()
  res.json(ventaSalida(db.prepare('SELECT * FROM ventas WHERE id = ?').get(venta.id)))
})

app.delete('/api/ventas/:id', permisoRequired('ventas', 'eliminar'), (req, res) => {
  const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id)
  if (!venta) return res.status(404).json({ error: 'Venta no encontrada' })
  const ahora = new Date().toISOString()
  const anular = db.transaction(() => {
    // Devuelve el stock de cada ítem
    const items = db.prepare('SELECT * FROM venta_items WHERE venta_id = ?').all(venta.id)
    for (const it of items) {
      if (!it.producto_id) continue
      // Devuelve a la variante original (o la por defecto si la venta es antigua sin variante)
      const varId = it.variante_id || variantePorDefecto(it.producto_id)?.id
      if (varId) {
        db.prepare('UPDATE producto_variantes SET stock = stock + ? WHERE id = ?').run(it.cantidad, varId)
        recalcularStockProducto(it.producto_id)
      }
      db.prepare(
        `INSERT INTO producto_movimientos (producto_id, variante_id, tipo, cantidad, costo_unitario, fecha, descripcion)
         VALUES (?, ?, 'venta', ?, 0, ?, ?)`
      ).run(it.producto_id, varId || null, -it.cantidad, ahora, `Anulación venta #${venta.id}`)
    }
    // Revierte el ingreso a caja de la venta
    db.prepare("DELETE FROM movimientos WHERE origen = 'venta' AND ref_id = ?").run(venta.id)
    // Devuelve el anticipo aplicado al saldo a favor del cliente (borra la fila 'aplicado')
    db.prepare("DELETE FROM cliente_anticipos WHERE tipo = 'aplicado' AND venta_id = ?").run(venta.id)
    // Si venía de un pedido, lo reabre
    if (venta.pedido_id) {
      db.prepare("UPDATE pedidos SET estado = 'pendiente', venta_id = NULL, actualizado = ? WHERE id = ?").run(ahora, venta.pedido_id)
    }
    db.prepare('DELETE FROM ventas WHERE id = ?').run(venta.id) // venta_items caen por FK
  })
  anular()
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

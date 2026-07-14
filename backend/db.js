import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbPath = join(__dirname, 'nomina.db')

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    codigo TEXT,
    descripcion TEXT,
    valor_venta REAL NOT NULL DEFAULT 0,
    valor_compra REAL NOT NULL DEFAULT 0,
    stock_apertura REAL NOT NULL DEFAULT 0,
    stock REAL NOT NULL DEFAULT 0,
    stock_minimo REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS procesos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    pago REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS empleados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    cedula TEXT,
    telefono TEXT,
    cargo TEXT
  );

  CREATE TABLE IF NOT EXISTS prestamos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empleado_id INTEGER NOT NULL,
    monto REAL NOT NULL DEFAULT 0,
    saldo REAL NOT NULL DEFAULT 0,
    fecha TEXT,
    descripcion TEXT,
    FOREIGN KEY (empleado_id) REFERENCES empleados(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS nominas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empleado_id INTEGER,
    fecha TEXT NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0,
    total_descuentos REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    comentario TEXT
  );

  CREATE TABLE IF NOT EXISTS nomina_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nomina_id INTEGER NOT NULL,
    producto_nombre TEXT,
    proceso_nombre TEXT,
    cantidad REAL NOT NULL DEFAULT 0,
    pago REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (nomina_id) REFERENCES nominas(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS nomina_descuentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nomina_id INTEGER NOT NULL,
    prestamo_id INTEGER,
    monto REAL NOT NULL DEFAULT 0,
    descripcion TEXT,
    FOREIGN KEY (nomina_id) REFERENCES nominas(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS empresa (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    nombre TEXT,
    direccion TEXT,
    telefono TEXT,
    correo TEXT,
    nit TEXT,
    logo TEXT
  );

  CREATE TABLE IF NOT EXISTS movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,              -- 'ingreso' | 'gasto'
    fecha TEXT NOT NULL,
    categoria TEXT,
    monto REAL NOT NULL DEFAULT 0,
    descripcion TEXT,
    comprobante TEXT,                -- dataURL base64 (PDF o imagen)
    comprobante_tipo TEXT,           -- mime del comprobante
    origen TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'nomina' | 'prestamo'
    ref_id INTEGER                   -- id de la nómina o préstamo asociado
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    salt TEXT NOT NULL,
    hash TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'usuario',
    permisos TEXT
  );

  CREATE TABLE IF NOT EXISTS costeos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    producto_id INTEGER,
    datos TEXT NOT NULL DEFAULT '{}',
    actualizado TEXT
  );

  CREATE TABLE IF NOT EXISTS tareas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empleado_id INTEGER NOT NULL,
    producto_id INTEGER,
    proceso_id INTEGER,
    producto_nombre TEXT,
    proceso_nombre TEXT,
    pago REAL NOT NULL DEFAULT 0,
    cantidad REAL NOT NULL DEFAULT 0,
    progreso INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'pendiente',   -- pendiente|en_progreso|terminada|pagada
    comentario TEXT,
    nomina_id INTEGER,
    creado TEXT,
    actualizado TEXT,
    FOREIGN KEY (empleado_id) REFERENCES empleados(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tarea_historial (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tarea_id INTEGER NOT NULL,
    usuario TEXT,
    progreso_anterior INTEGER,
    progreso_nuevo INTEGER,
    comentario TEXT,
    fecha TEXT,
    FOREIGN KEY (tarea_id) REFERENCES tareas(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tarea_fotos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tarea_id INTEGER NOT NULL,
    imagen TEXT NOT NULL,        -- dataURL base64 (JPG/PNG)
    imagen_tipo TEXT,            -- mime de la imagen
    descripcion TEXT,            -- nota: qué falta / componente faltante
    usuario TEXT,
    fecha TEXT,
    FOREIGN KEY (tarea_id) REFERENCES tareas(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS app_secret (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    secret TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS materiales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    unidad TEXT NOT NULL,
    stock REAL NOT NULL DEFAULT 0,
    costo_unitario REAL NOT NULL DEFAULT 0,
    stock_minimo REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS material_movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,              -- 'entrada' | 'ajuste' | 'salida'
    cantidad REAL NOT NULL DEFAULT 0,
    costo_unitario REAL NOT NULL DEFAULT 0,
    fecha TEXT NOT NULL,
    descripcion TEXT,
    tarea_produccion_id INTEGER,
    FOREIGN KEY (material_id) REFERENCES materiales(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS procesos_globales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS proceso_materiales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proceso_id INTEGER NOT NULL,
    material_id INTEGER NOT NULL,
    cantidad REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (proceso_id) REFERENCES procesos(id) ON DELETE CASCADE,
    FOREIGN KEY (material_id) REFERENCES materiales(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tareas_produccion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empleado_id INTEGER NOT NULL,
    producto_id INTEGER,
    proceso_id INTEGER,
    producto_nombre TEXT,
    proceso_nombre TEXT,
    cantidad REAL NOT NULL DEFAULT 0,
    progreso INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'pendiente',   -- pendiente|en_progreso|terminada
    comentario TEXT,
    motivo_merma TEXT,
    creado TEXT,
    actualizado TEXT,
    FOREIGN KEY (empleado_id) REFERENCES empleados(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tarea_produccion_historial (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tarea_id INTEGER NOT NULL,
    usuario TEXT,
    progreso_anterior INTEGER,
    progreso_nuevo INTEGER,
    comentario TEXT,
    fecha TEXT,
    FOREIGN KEY (tarea_id) REFERENCES tareas_produccion(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS herramientas_entregas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empleado_id INTEGER NOT NULL,
    herramienta TEXT NOT NULL,
    cantidad REAL NOT NULL DEFAULT 1,
    fecha_entrega TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'buen_estado',   -- buen_estado|danada|perdida|devuelta
    comentario TEXT,
    creado TEXT,
    FOREIGN KEY (empleado_id) REFERENCES empleados(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS producto_movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'entrada',   -- entrada (compra) | produccion
    cantidad REAL NOT NULL DEFAULT 0,
    costo_unitario REAL NOT NULL DEFAULT 0,
    fecha TEXT,
    descripcion TEXT,
    orden_produccion_id INTEGER,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ordenes_produccion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER,
    producto_nombre TEXT,
    cantidad REAL NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'pendiente',   -- pendiente|en_progreso|terminada
    comentario TEXT,
    stock_abastecido REAL NOT NULL DEFAULT 0,   -- cantidad ya sumada al stock del producto
    fecha_entrega TEXT,                         -- fecha de compromiso de entrega (opcional)
    creado TEXT,
    actualizado TEXT
  );
`)

// Cataloga los nombres de proceso que ya existían por producto (texto libre)
// para que aparezcan de una vez en el desplegable global de procesos.
{
  const nombresExistentes = db.prepare('SELECT DISTINCT nombre FROM procesos').all()
  const insertGlobal = db.prepare('INSERT OR IGNORE INTO procesos_globales (nombre) VALUES (?)')
  for (const { nombre } of nombresExistentes) {
    if (nombre && nombre.trim()) insertGlobal.run(nombre.trim())
  }
}

// Migraciones suaves para bases de datos creadas antes de agregar columnas nuevas
const colsNominas = db.prepare("PRAGMA table_info(nominas)").all()
if (!colsNominas.some((c) => c.name === 'comentario')) {
  db.exec('ALTER TABLE nominas ADD COLUMN comentario TEXT')
}

// Columna de rol en usuarios (admin | usuario). El primer usuario existente
// se marca como admin para que nunca quede el sistema sin administrador.
const colsUsuarios = db.prepare("PRAGMA table_info(usuarios)").all()
if (!colsUsuarios.some((c) => c.name === 'rol')) {
  db.exec("ALTER TABLE usuarios ADD COLUMN rol TEXT NOT NULL DEFAULT 'usuario'")
  const primero = db.prepare('SELECT id FROM usuarios ORDER BY id ASC LIMIT 1').get()
  if (primero) db.prepare("UPDATE usuarios SET rol = 'admin' WHERE id = ?").run(primero.id)
}

// Columna de permisos granulares (JSON) en usuarios. Los usuarios que ya
// existían (permisos NULL) conservan acceso amplio; el front interpreta NULL
// como "todo permitido" para no romper el comportamiento previo.
if (!colsUsuarios.some((c) => c.name === 'permisos')) {
  db.exec('ALTER TABLE usuarios ADD COLUMN permisos TEXT')
}

// Columna de stock mínimo en materiales (alerta de reabastecimiento)
const colsMateriales = db.prepare("PRAGMA table_info(materiales)").all()
if (!colsMateriales.some((c) => c.name === 'stock_minimo')) {
  db.exec('ALTER TABLE materiales ADD COLUMN stock_minimo REAL NOT NULL DEFAULT 0')
}

// Columnas nuevas de productos: código, precios, e inventario propio (stock que se
// abastece cuando termina una orden de producción). Bases creadas antes de esto
// reciben las columnas con default 0 y sin romper productos existentes.
const colsProductos = db.prepare("PRAGMA table_info(productos)").all()
const addColProducto = (nombre, ddl) => {
  if (!colsProductos.some((c) => c.name === nombre)) db.exec(`ALTER TABLE productos ADD COLUMN ${ddl}`)
}
addColProducto('codigo', 'codigo TEXT')
addColProducto('descripcion', 'descripcion TEXT')
addColProducto('valor_venta', 'valor_venta REAL NOT NULL DEFAULT 0')
addColProducto('valor_compra', 'valor_compra REAL NOT NULL DEFAULT 0')
addColProducto('stock_apertura', 'stock_apertura REAL NOT NULL DEFAULT 0')
addColProducto('stock', 'stock REAL NOT NULL DEFAULT 0')
addColProducto('stock_minimo', 'stock_minimo REAL NOT NULL DEFAULT 0')
// Genera un código correlativo (PRD-0001) para productos que aún no tengan uno
{
  const sinCodigo = db.prepare("SELECT id FROM productos WHERE codigo IS NULL OR codigo = '' ORDER BY id ASC").all()
  const asignarCodigo = db.prepare('UPDATE productos SET codigo = ? WHERE id = ?')
  for (const p of sinCodigo) {
    asignarCodigo.run(`PRD-${String(p.id).padStart(4, '0')}`, p.id)
  }
}

// Marca en la orden si ya abasteció el stock del producto al terminarse, para no
// sumar dos veces y poder revertir si se reabre o elimina una orden terminada.
const colsOrdenesProd = db.prepare("PRAGMA table_info(ordenes_produccion)").all()
if (!colsOrdenesProd.some((c) => c.name === 'stock_abastecido')) {
  db.exec('ALTER TABLE ordenes_produccion ADD COLUMN stock_abastecido REAL NOT NULL DEFAULT 0')
}

// Columna de orden de producción en tareas_produccion (agrupa tareas del mismo
// lote a través de sus distintos procesos). Nullable: las tareas creadas antes
// de esta migración quedan sin orden asignada.
const colsTareasProd = db.prepare("PRAGMA table_info(tareas_produccion)").all()
if (!colsTareasProd.some((c) => c.name === 'orden_produccion_id')) {
  db.exec('ALTER TABLE tareas_produccion ADD COLUMN orden_produccion_id INTEGER')
}
// Motivo de merma opcional por proceso (ej: "material defectuoso", "error de corte")
if (!colsTareasProd.some((c) => c.name === 'motivo_merma')) {
  db.exec('ALTER TABLE tareas_produccion ADD COLUMN motivo_merma TEXT')
}

// Columna que liga cada movimiento de stock con la tarea de producción que lo
// generó, para poder mostrar "qué materiales consumió este proceso" en el
// seguimiento de una orden.
const colsMovimientos = db.prepare("PRAGMA table_info(material_movimientos)").all()
if (!colsMovimientos.some((c) => c.name === 'tarea_produccion_id')) {
  db.exec('ALTER TABLE material_movimientos ADD COLUMN tarea_produccion_id INTEGER')
}

// Vínculo opcional de un costeo con un producto, para comparar el costo real de
// una orden contra su costo estimado. Nullable: los costeos viejos quedan sueltos.
const colsCosteos = db.prepare("PRAGMA table_info(costeos)").all()
if (!colsCosteos.some((c) => c.name === 'producto_id')) {
  db.exec('ALTER TABLE costeos ADD COLUMN producto_id INTEGER')
}

// Fecha de entrega comprometida de una orden de producción (para alertar atrasos).
const colsOrdenesEntrega = db.prepare("PRAGMA table_info(ordenes_produccion)").all()
if (!colsOrdenesEntrega.some((c) => c.name === 'fecha_entrega')) {
  db.exec('ALTER TABLE ordenes_produccion ADD COLUMN fecha_entrega TEXT')
}

// Garantiza que exista la fila única de configuración de empresa
db.prepare(
  'INSERT OR IGNORE INTO empresa (id, nombre, direccion, telefono, correo, nit, logo) VALUES (1, ?, ?, ?, ?, ?, ?)'
).run('', '', '', '', '', '')

export default db

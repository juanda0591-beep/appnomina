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
    nombre TEXT NOT NULL
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

  CREATE TABLE IF NOT EXISTS ordenes_produccion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER,
    producto_nombre TEXT,
    cantidad REAL NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'pendiente',   -- pendiente|en_progreso|terminada
    comentario TEXT,
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

// Columna de orden de producción en tareas_produccion (agrupa tareas del mismo
// lote a través de sus distintos procesos). Nullable: las tareas creadas antes
// de esta migración quedan sin orden asignada.
const colsTareasProd = db.prepare("PRAGMA table_info(tareas_produccion)").all()
if (!colsTareasProd.some((c) => c.name === 'orden_produccion_id')) {
  db.exec('ALTER TABLE tareas_produccion ADD COLUMN orden_produccion_id INTEGER')
}

// Columna que liga cada movimiento de stock con la tarea de producción que lo
// generó, para poder mostrar "qué materiales consumió este proceso" en el
// seguimiento de una orden.
const colsMovimientos = db.prepare("PRAGMA table_info(material_movimientos)").all()
if (!colsMovimientos.some((c) => c.name === 'tarea_produccion_id')) {
  db.exec('ALTER TABLE material_movimientos ADD COLUMN tarea_produccion_id INTEGER')
}

// Garantiza que exista la fila única de configuración de empresa
db.prepare(
  'INSERT OR IGNORE INTO empresa (id, nombre, direccion, telefono, correo, nit, logo) VALUES (1, ?, ?, ?, ?, ?, ?)'
).run('', '', '', '', '', '')

export default db

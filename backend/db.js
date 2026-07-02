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
`)

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

// Garantiza que exista la fila única de configuración de empresa
db.prepare(
  'INSERT OR IGNORE INTO empresa (id, nombre, direccion, telefono, correo, nit, logo) VALUES (1, ?, ?, ?, ?, ?, ?)'
).run('', '', '', '', '', '')

export default db

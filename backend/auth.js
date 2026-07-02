import crypto from 'crypto'
import db from './db.js'

const TOKEN_DIAS = 30
const TOKEN_MS = TOKEN_DIAS * 24 * 60 * 60 * 1000

// ---------- Secreto del servidor (persistente) ----------
function getSecret() {
  let row = db.prepare('SELECT secret FROM app_secret WHERE id = 1').get()
  if (!row) {
    const secret = crypto.randomBytes(48).toString('hex')
    db.prepare('INSERT INTO app_secret (id, secret) VALUES (1, ?)').run(secret)
    return secret
  }
  return row.secret
}
const SECRET = getSecret()

// ---------- Hash de contraseñas (scrypt, sin dependencias) ----------
export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex')
  return { salt, hash }
}

function verifyPassword(password, salt, hash) {
  const calc = crypto.scryptSync(String(password), salt, 64).toString('hex')
  const a = Buffer.from(calc, 'hex')
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// ---------- Usuario por defecto ----------
export function seedUsuario() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n
  if (count === 0) {
    const { salt, hash } = hashPassword('admin123')
    db.prepare("INSERT INTO usuarios (username, salt, hash, rol) VALUES (?, ?, ?, 'admin')").run('admin', salt, hash)
    console.log('  Usuario por defecto creado → usuario: admin · contraseña: admin123')
  }
}

// ---------- Tokens firmados (HMAC) ----------
function makeToken(username, rol) {
  const payload = Buffer.from(JSON.stringify({ u: username, r: rol, t: Date.now() })).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

function verifyToken(token) {
  if (!token) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (Date.now() - data.t > TOKEN_MS) return null // expirado
    return data
  } catch {
    return null
  }
}

// Lee y parsea los permisos guardados (JSON). Devuelve null si no hay nada
// guardado (NULL) → el front lo interpreta como "acceso amplio" para no romper
// a los usuarios creados antes de esta función.
function parsePermisos(raw) {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// ---------- Lógica de login / cambio de contraseña ----------
export function login(username, password) {
  const user = db.prepare('SELECT * FROM usuarios WHERE username = ?').get(String(username || '').trim())
  if (!user) return null
  if (!verifyPassword(password, user.salt, user.hash)) return null
  const rol = user.rol || 'usuario'
  return {
    token: makeToken(user.username, rol),
    username: user.username,
    rol,
    permisos: rol === 'admin' ? null : parsePermisos(user.permisos),
  }
}

export function cambiarPassword(username, actual, nueva) {
  const user = db.prepare('SELECT * FROM usuarios WHERE username = ?').get(username)
  if (!user) return { ok: false, error: 'Usuario no encontrado' }
  if (!verifyPassword(actual, user.salt, user.hash)) return { ok: false, error: 'La contraseña actual es incorrecta' }
  if (!nueva || String(nueva).length < 4) return { ok: false, error: 'La nueva contraseña debe tener al menos 4 caracteres' }
  const { salt, hash } = hashPassword(nueva)
  db.prepare('UPDATE usuarios SET salt = ?, hash = ? WHERE id = ?').run(salt, hash, user.id)
  return { ok: true }
}

// ---------- Gestión de usuarios (solo admin) ----------
export function listarUsuarios() {
  return db
    .prepare('SELECT id, username, rol, permisos FROM usuarios ORDER BY username')
    .all()
    .map((u) => ({ id: u.id, username: u.username, rol: u.rol, permisos: parsePermisos(u.permisos) }))
}

export function crearUsuario(username, password, rol = 'usuario', permisos = null) {
  const u = String(username || '').trim()
  if (!u) return { ok: false, error: 'El nombre de usuario es obligatorio' }
  if (!password || String(password).length < 4) return { ok: false, error: 'La contraseña debe tener al menos 4 caracteres' }
  const r = rol === 'admin' ? 'admin' : 'usuario'
  const existe = db.prepare('SELECT id FROM usuarios WHERE username = ?').get(u)
  if (existe) return { ok: false, error: 'Ya existe un usuario con ese nombre' }
  const { salt, hash } = hashPassword(password)
  // Los admin no usan permisos (acceso total). Para usuarios normales se guarda
  // el objeto recibido; si no llega nada, queda NULL (acceso amplio por compatibilidad).
  const permJson = r === 'admin' || !permisos ? null : JSON.stringify(permisos)
  const res = db
    .prepare('INSERT INTO usuarios (username, salt, hash, rol, permisos) VALUES (?, ?, ?, ?, ?)')
    .run(u, salt, hash, r, permJson)
  return { ok: true, usuario: { id: res.lastInsertRowid, username: u, rol: r, permisos } }
}

// Actualiza la matriz de permisos de un usuario normal. A un admin no se le
// tocan (siempre tiene acceso total).
export function actualizarPermisos(id, permisos) {
  const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id)
  if (!user) return { ok: false, error: 'Usuario no encontrado' }
  if (user.rol === 'admin') return { ok: false, error: 'El administrador siempre tiene acceso total' }
  const permJson = permisos ? JSON.stringify(permisos) : null
  db.prepare('UPDATE usuarios SET permisos = ? WHERE id = ?').run(permJson, id)
  return { ok: true }
}

export function eliminarUsuario(id, solicitanteUsername) {
  const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id)
  if (!user) return { ok: false, error: 'Usuario no encontrado' }
  if (user.username === solicitanteUsername) return { ok: false, error: 'No puedes eliminar tu propia cuenta' }
  // No permitir borrar al último administrador
  if (user.rol === 'admin') {
    const admins = db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin'").get().n
    if (admins <= 1) return { ok: false, error: 'No puedes eliminar al único administrador' }
  }
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(id)
  return { ok: true }
}

export function resetPassword(id, nueva) {
  const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id)
  if (!user) return { ok: false, error: 'Usuario no encontrado' }
  if (!nueva || String(nueva).length < 4) return { ok: false, error: 'La contraseña debe tener al menos 4 caracteres' }
  const { salt, hash } = hashPassword(nueva)
  db.prepare('UPDATE usuarios SET salt = ?, hash = ? WHERE id = ?').run(salt, hash, id)
  return { ok: true }
}

// ---------- Middleware ----------
export function authRequired(req, res, next) {
  // solo protegemos la API; el login queda abierto
  if (!req.path.startsWith('/api')) return next()
  if (req.path === '/api/login') return next()

  const header = req.headers.authorization || ''
  // El token llega por header (peticiones normales) o por query (?token=…),
  // usado para servir imágenes/archivos directamente en <img src> / enlaces.
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query?.token || null)
  const data = verifyToken(token)
  if (!data) return res.status(401).json({ error: 'No autorizado' })
  req.usuario = data.u
  req.rol = data.r || 'usuario'
  next()
}

// Restringe una ruta a administradores
export function adminRequired(req, res, next) {
  if (req.rol !== 'admin') return res.status(403).json({ error: 'Solo el administrador puede hacer esto' })
  next()
}

// Restringe una ruta según la matriz de permisos del usuario. El admin siempre
// pasa. Un usuario con permisos NULL (creado antes de esta función) también pasa
// (acceso amplio por compatibilidad). El resto debe tener (pagina, accion) en true.
export function permisoRequired(pagina, accion) {
  return (req, res, next) => {
    if (req.rol === 'admin') return next()
    if (pagina === 'inicio' && accion === 'ver') return next()

    const user = db.prepare('SELECT permisos FROM usuarios WHERE username = ?').get(req.usuario)
    const permisos = parsePermisos(user?.permisos)
    if (!permisos) return next()
    if (permisos[pagina] && permisos[pagina][accion]) return next()
    return res.status(403).json({ error: 'No tienes permiso para realizar esta acción' })
  }
}
export function permisoAnyRequired(reglas) {
  return (req, res, next) => {
    if (req.rol === 'admin') return next()
    const user = db.prepare('SELECT permisos FROM usuarios WHERE username = ?').get(req.usuario)
    const permisos = parsePermisos(user?.permisos)
    if (!permisos) return next()

    const permitido = reglas.some(([pagina, accion = 'ver']) => permisos[pagina] && permisos[pagina][accion])
    if (permitido) return next()

    return res.status(403).json({ error: 'No tienes permiso para realizar esta acción' })
  }
}

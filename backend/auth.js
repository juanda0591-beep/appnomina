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

// ---------- Lógica de login / cambio de contraseña ----------
export function login(username, password) {
  const user = db.prepare('SELECT * FROM usuarios WHERE username = ?').get(String(username || '').trim())
  if (!user) return null
  if (!verifyPassword(password, user.salt, user.hash)) return null
  const rol = user.rol || 'usuario'
  return { token: makeToken(user.username, rol), username: user.username, rol }
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
  return db.prepare('SELECT id, username, rol FROM usuarios ORDER BY username').all()
}

export function crearUsuario(username, password, rol = 'usuario') {
  const u = String(username || '').trim()
  if (!u) return { ok: false, error: 'El nombre de usuario es obligatorio' }
  if (!password || String(password).length < 4) return { ok: false, error: 'La contraseña debe tener al menos 4 caracteres' }
  const r = rol === 'admin' ? 'admin' : 'usuario'
  const existe = db.prepare('SELECT id FROM usuarios WHERE username = ?').get(u)
  if (existe) return { ok: false, error: 'Ya existe un usuario con ese nombre' }
  const { salt, hash } = hashPassword(password)
  const res = db.prepare('INSERT INTO usuarios (username, salt, hash, rol) VALUES (?, ?, ?, ?)').run(u, salt, hash, r)
  return { ok: true, usuario: { id: res.lastInsertRowid, username: u, rol: r } }
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
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
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

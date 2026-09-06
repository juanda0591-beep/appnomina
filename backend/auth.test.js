import test, { beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

process.env.DB_PATH = ':memory:'
const { default: db } = await import('./db.js')
const auth = await import('./auth.js')
after(() => db.close())
beforeEach(() => {
  db.exec('DELETE FROM usuarios')
  auth.crearUsuario('admin', 'original123', 'admin')
  auth.crearUsuario('operador', 'original123', 'usuario', { nomina: { ver: true, crear: true } })
})
function autenticar(token, path = '/api/nominas') {
  const req = { path, method: 'GET', headers: { authorization: `Bearer ${token}` }, query: {} }
  let status = 200
  const res = { status(s) { status = s; return this }, json() {} }
  auth.authRequired(req, res, () => {})
  return { status, req, res }
}
const userId = () => db.prepare("SELECT id FROM usuarios WHERE username = 'operador'").get().id

test('cambiar la clave revoca todas las sesiones anteriores y conserva solo la nueva', () => {
  const a = auth.login('operador', 'original123').token
  const b = auth.login('operador', 'original123').token
  const cambio = auth.cambiarPassword('operador', 'original123', 'nueva123')
  assert.equal(autenticar(a).status, 401)
  assert.equal(autenticar(b).status, 401)
  assert.equal(autenticar(cambio.token).status, 200)
  assert.equal(auth.login('operador', 'original123'), null)
  assert.ok(auth.login('operador', 'nueva123').token)
})

test('reset administrativo y cambio de permisos revocan sesiones', () => {
  const token = auth.login('operador', 'original123').token
  auth.resetPassword(userId(), 'nueva123')
  assert.equal(autenticar(token).status, 401)
  const nuevo = auth.login('operador', 'nueva123').token
  auth.actualizarPermisos(userId(), { nomina: { ver: true, crear: false } })
  assert.equal(autenticar(nuevo).status, 401)
  assert.equal(auth.login('operador', 'nueva123').permisos.nomina.crear, false)
})

test('eliminar y recrear el mismo nombre no rehabilita sus tokens', () => {
  const token = auth.login('operador', 'original123').token
  assert.equal(auth.eliminarUsuario(userId(), 'admin').ok, true)
  assert.equal(autenticar(token).status, 401)
  auth.crearUsuario('operador', 'original123')
  assert.equal(autenticar(token).status, 401)
})

test('se usa el rol actual de la base y se rechazan tokens malformados y antiguos', () => {
  const token = auth.login('admin', 'original123').token
  db.exec("UPDATE usuarios SET rol = 'usuario' WHERE username = 'admin'")
  assert.equal(autenticar(token).req.rol, 'usuario')
  for (const t of ['', 'invalido', `${token}.extra`, 'x'.repeat(2100)]) assert.equal(autenticar(t).status, 401)
  const secret = db.prepare('SELECT secret FROM app_secret WHERE id = 1').get().secret
  const payload = Buffer.from(JSON.stringify({ u: 'admin', r: 'admin', t: Date.now() })).toString('base64url')
  const antiguo = `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
  assert.equal(autenticar(antiguo).status, 401)
  assert.equal(autenticar('', '/API/usuarios').status, 401)
  assert.equal(autenticar('', '/Api/respaldos').status, 401)
})

test('una sesion expirada se rechaza y un cambio de clave fallido no revoca', () => {
  const token = auth.login('operador', 'original123').token
  assert.equal(auth.cambiarPassword('operador', 'incorrecta', 'nueva123').ok, false)
  assert.equal(autenticar(token).status, 200)
  db.exec('UPDATE sesiones SET expira = 0')
  assert.equal(autenticar(token).status, 401)
})

test('permisos JSON corruptos no conceden acceso amplio', () => {
  const token = auth.login('operador', 'original123').token
  db.exec("UPDATE usuarios SET permisos = '{' WHERE username = 'operador'")
  const { req } = autenticar(token)
  let status, permitido = false
  const res = { status(s) { status = s; return this }, json() {} }
  auth.permisoRequired('nomina', 'crear')(req, res, () => { permitido = true })
  assert.equal(status, 403)
  assert.equal(permitido, false)
})

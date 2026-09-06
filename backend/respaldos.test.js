import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, readFile, readdir, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { gestorRespaldos, verificarRespaldo } from './respaldos.js'
import { restaurarRespaldo } from './restaurar.js'

const carpeta = await mkdtemp(join(tmpdir(), 'respaldos-test-'))
process.env.DB_PATH = join(carpeta, 'principal.db')
const { default: db } = await import('./db.js')
after(async () => { db.close(); await rm(carpeta, { recursive: true, force: true }) })
db.pragma('wal_autocheckpoint = 0')
db.exec("INSERT INTO usuarios (id, username, salt, hash) VALUES (1, 'prueba', 'salt', 'hash'); INSERT INTO sesiones VALUES ('sesion-antigua', 1, 9999999999999)")
db.exec("INSERT INTO movimientos (tipo, fecha, monto, descripcion) VALUES ('ingreso', '2026-09-05', 125000, 'Prueba WAL')")

test('la copia incluye el WAL, pasa integridad y restaura sin sesiones antiguas', async () => {
  const gestor = gestorRespaldos(db, { carpeta: join(carpeta, 'copias'), automaticos: false })
  const copia = await gestor.crear()
  assert.equal(copia.verificacion.integridad, 'ok')
  const archivo = await gestor.ruta(copia.nombre)
  assert.deepEqual(await readdir(join(carpeta, 'copias')), [copia.nombre])
  const restaurada = join(carpeta, 'recuperada.db')
  await restaurarRespaldo(archivo, restaurada)
  const lectura = new Database(restaurada, { readonly: true })
  try {
    assert.equal(lectura.prepare('SELECT monto FROM movimientos').get().monto, 125000)
    assert.equal(lectura.prepare('SELECT COUNT(*) n FROM sesiones').get().n, 0)
    assert.equal(lectura.prepare('SELECT COUNT(*) n FROM auditoria').get().n, 1)
  } finally { lectura.close() }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sesiones').get().n, 1)
  await assert.rejects(restaurarRespaldo(archivo, restaurada), /destino ya existe/)
  await assert.rejects(restaurarRespaldo(archivo, archivo), /archivo nuevo/)
})

test('retiene las ultimas copias y no elimina archivos ajenos', async () => {
  const dir = join(carpeta, 'rotacion')
  const gestor = gestorRespaldos(db, { carpeta: dir, retencion: 2, automaticos: false })
  const primera = await gestor.crear()
  await utimes(join(dir, primera.nombre), new Date(0), new Date(0))
  await writeFile(join(dir, 'conservar.txt'), 'archivo ajeno')
  await gestor.crear(); await gestor.crear()
  const listado = await gestor.listar()
  assert.equal(listado.length, 2)
  assert.ok(!listado.some((c) => c.nombre === primera.nombre))
  assert.equal(await readFile(join(dir, 'conservar.txt'), 'utf8'), 'archivo ajeno')
})

test('rechaza archivos corruptos, otra base y rutas fuera del directorio', async () => {
  const corrupto = join(carpeta, 'corrupto.db')
  await writeFile(corrupto, 'no es SQLite')
  assert.throws(() => verificarRespaldo(corrupto), { status: 422 })
  await assert.rejects(restaurarRespaldo(corrupto, join(carpeta, 'no-crear.db')), { status: 422 })
  const ajena = new Database(join(carpeta, 'ajena.db')); ajena.exec('CREATE TABLE otra (id INTEGER)'); ajena.close()
  assert.throws(() => verificarRespaldo(join(carpeta, 'ajena.db')), { status: 422 })
  const gestor = gestorRespaldos(db, { carpeta: join(carpeta, 'copias') })
  await assert.rejects(gestor.ruta('../principal.db'), { status: 404 })
  await assert.rejects(gestor.ruta('principal.db'), { status: 404 })
  assert.ok(!(await readdir(carpeta)).includes('no-crear.db'))
})

test('el respaldo automatico inicial se crea una sola vez antes del intervalo', async () => {
  const gestor = gestorRespaldos(db, { carpeta: join(carpeta, 'automaticos'), automaticos: true })
  await gestor.comprobarProgramacion()
  await gestor.comprobarProgramacion()
  assert.equal((await gestor.listar()).length, 1)
})

test('errores de carpeta y concurrencia se reportan sin publicar copias parciales', async () => {
  const dir = join(carpeta, 'concurrentes')
  const gestor = gestorRespaldos(db, { carpeta: dir })
  const primera = gestor.crear()
  await assert.rejects(gestor.crear(), { status: 409 })
  await primera
  assert.ok((await readdir(dir)).every((n) => n.endsWith('.db')))
  const bloqueo = join(carpeta, 'bloqueo'); await writeFile(bloqueo, 'x')
  const fallido = gestorRespaldos(db, { carpeta: bloqueo })
  await assert.rejects(fallido.crear(), { status: 500 })
})

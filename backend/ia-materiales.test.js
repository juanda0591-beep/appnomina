import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { generarMaterial, validarMaterial } from './ia-materiales.js'
import { rutasIA } from './ia-routes.js'

const base = () => ({ nombre: 'Lámina MDF 15 mm', unidad: 'lámina', costoUnitario: null,
  stockInicial: null, stockMinimo: null, colorId: null, familia: '', observaciones: [] })
const respuesta = (datos) => ({ ok: true, json: async () => ({ status: 'completed', output: [
  { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(datos) }] },
] }) })

test('conserva valores desconocidos y detecta duplicados sin tildes', () => {
  const r = validarMaterial(base(), [], [{ id: 7, nombre: 'LAMINA MDF 15 MM', unidad: 'lámina' }])
  assert.equal(r.borrador.costoUnitario, null)
  assert.deepEqual(r.pendientes, ['Costo unitario', 'Stock inicial', 'Stock mínimo'])
  assert.equal(r.duplicados[0].exacto, true)
  assert.equal(r.duplicados[0].id, 7)
})

test('cero explícito es distinto de un dato pendiente', () => {
  const r = validarMaterial({ ...base(), stockInicial: 0 })
  assert.equal(r.borrador.stockInicial, 0)
  assert.ok(!r.pendientes.includes('Stock inicial'))
})

test('rechaza precios, cantidades, colores y unidades inválidos', () => {
  for (const cambio of [{ costoUnitario: -1 }, { stockInicial: '12' }, { stockMinimo: Infinity },
    { colorId: 99 }, { unidad: 'botella' }, { nombre: '' }, { extra: true }, { observaciones: [8] }]) {
    assert.throws(() => validarMaterial({ ...base(), ...cambio }))
  }
})

test('conexión estructurada sin transmitir existencias ni catálogo de materiales', async () => {
  let body
  const r = await generarMaterial({ descripcion: 'Lámina MDF 15 mm', materiales: [{ id: 2, nombre: 'privado', unidad: 'kg', stock: 999 }] }, {
    apiKey: 'test-key', model: 'test-model', fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses')
      body = JSON.parse(options.body)
      return respuesta(base())
    },
  })
  assert.equal(body.store, false)
  assert.equal(body.text.format.strict, true)
  assert.ok(!body.input.includes('privado'))
  assert.ok(!body.input.includes('999'))
  assert.equal(r.borrador.nombre, 'Lámina MDF 15 mm')
})

test('configuración ausente y descripciones inválidas no llaman al proveedor', async () => {
  const opciones = { apiKey: '', model: '', fetchImpl: () => assert.fail('No debe llamar a la API') }
  await assert.rejects(generarMaterial({ descripcion: 'MDF 15 mm' }, opciones), { status: 503 })
  await assert.rejects(generarMaterial({ descripcion: 123 }, opciones), { status: 400 })
  await assert.rejects(generarMaterial({ descripcion: 'x'.repeat(4001) }, opciones), { status: 400 })
})

test('maneja rechazo, límite, timeout y respuesta incompleta sin filtrar secretos', async () => {
  for (const [fetchImpl, status] of [
    [async () => ({ ok: false, status: 429 }), 429],
    [async () => ({ ok: false, status: 401 }), 502],
    [async () => { throw Object.assign(new Error('test-key'), { name: 'TimeoutError' }) }, 504],
    [async () => ({ ok: true, json: async () => ({ status: 'incomplete' }) }), 502],
    [async () => ({ ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'refusal' }] }] }) }), 422],
  ]) {
    await assert.rejects(generarMaterial({ descripcion: 'Lámina MDF' }, { apiKey: 'test-key', model: 'test', fetchImpl }),
      (e) => e.status === status && !e.message.includes('test-key'))
  }
})

test('rutas exigen ambos permisos y no escriben en la base de datos', async (t) => {
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => { req.usuario = 'prueba'; next() })
  let llamadas = 0
  const db = { prepare: (sql) => {
    assert.match(sql, /^SELECT /)
    return { all: () => [] }
  } }
  const permisoRequired = (pagina, accion) => (req, res, next) => {
    assert.equal(pagina, 'materiales')
    if (!req.headers['x-permisos']?.split(',').includes(accion)) return res.status(403).end()
    next()
  }
  app.use('/api/ia', rutasIA({ db, permisoRequired, generar: async () => { llamadas++; return validarMaterial(base()) } }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}/api/ia`
  for (const permisos of ['', 'ver', 'crear']) {
    assert.equal((await fetch(`${url}/material`, { method: 'POST', headers: { 'x-permisos': permisos } })).status, 403)
    assert.equal((await fetch(`${url}/estado`, { headers: { 'x-permisos': permisos } })).status, 403)
  }
  assert.equal(llamadas, 0)
  const options = { method: 'POST', headers: { 'x-permisos': 'ver,crear', 'Content-Type': 'application/json' }, body: JSON.stringify({ descripcion: 'Lámina MDF' }) }
  assert.equal((await fetch(`${url}/material`, options)).status, 200)
  assert.equal((await fetch(`${url}/material`, options)).status, 429)
  assert.equal(llamadas, 1)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { generarProducto, validarProducto } from './ia-productos.js'
import { rutasIA } from './ia-routes.js'
import { formularioDesdeProductoIA, errorRecetaIA } from '../src/utils/productoIA.js'

const materiales = [{ id: 7, nombre: 'Lámina MDF 15 mm', unidad: 'lámina', costoUnitario: 95000, stock: 12 }]
const globales = [{ nombre: 'Corte' }]
const producto = () => ({ nombre: 'Armario 2 puertas', descripcion: 'MDF de 15 mm', valorVenta: 850000,
  valorCompra: null, stockApertura: 0, stockMinimo: null, observaciones: [], procesos: [{
    nombre: 'corte', pago: null, materiales: [{ materialId: 7, nombre: 'MDF', unidad: 'lámina', cantidad: 2 }],
    piezas: [{ nombre: 'Puerta', cantidad: 2 }],
  }] })

test('producto conserva pendientes y resuelve referencias canónicas', () => {
  const r = validarProducto(producto(), materiales, globales, [{ id: 3, nombre: 'ARMARIO 2 PUERTAS' }])
  assert.equal(r.borrador.stockApertura, 0)
  assert.equal(r.borrador.valorCompra, null)
  assert.equal(r.borrador.procesos[0].nombre, 'Corte')
  assert.equal(r.borrador.procesos[0].nuevo, false)
  assert.equal(r.borrador.procesos[0].materiales[0].nombre, materiales[0].nombre)
  assert.ok(r.pendientes.includes('1. Corte: pago por unidad'))
  assert.equal(r.duplicados[0].id, 3)
})

test('material desconocido conserva nombre pendiente sin inventar una referencia', () => {
  const p = producto()
  p.procesos[0].materiales = [{ materialId: null, nombre: 'Bisagra especial', unidad: 'unidad', cantidad: null }]
  const r = validarProducto(p, materiales, globales)
  const form = formularioDesdeProductoIA(r.borrador)
  assert.equal(form.procesos[0].materiales[0].materialId, '')
  assert.equal(form.procesos[0].materiales[0].nombreSugerido, 'Bisagra especial')
  assert.equal(form.procesos[0].pago, '')
  assert.equal(form.datos.stockApertura, '0')
  assert.equal(form.datos.valorCompra, '')
  assert.ok(r.pendientes.some((s) => s.includes('Bisagra especial')))
})

test('rechaza IDs inventados, unidades incompatibles y cantidades inválidas', () => {
  for (const cambio of [{ materialId: 99 }, { materialId: '7' }, { unidad: 'metro cuadrado' }, { cantidad: -1 }, { cantidad: '2' }, { cantidad: 0 }]) {
    const p = producto()
    Object.assign(p.procesos[0].materiales[0], cambio)
    assert.throws(() => validarProducto(p, materiales, globales))
  }
  for (const cantidad of [1.5, -1, Infinity]) {
    const p = producto()
    p.procesos[0].piezas[0].cantidad = cantidad
    assert.throws(() => validarProducto(p, materiales, globales))
  }
})

test('rechaza estructuras incompletas, listas excesivas y procesos repetidos', () => {
  for (const cambio of [{ valorVenta: -1 }, { extra: 'valor' }, { descripcion: 2 }, { procesos: null },
    { procesos: Array.from({ length: 21 }, () => producto().procesos[0]) },
    { procesos: [producto().procesos[0], producto().procesos[0]] }]) {
    assert.throws(() => validarProducto({ ...producto(), ...cambio }, materiales, globales))
  }
})

test('no permite que el guardado descarte silenciosamente una receta incompleta', () => {
  const r = validarProducto(producto(), materiales, globales)
  const form = formularioDesdeProductoIA(r.borrador)
  assert.match(errorRecetaIA(form.procesos, materiales), /pago/)
  form.procesos[0].pago = '0'
  assert.equal(errorRecetaIA(form.procesos, materiales), '')
  form.procesos[0].materiales[0].cantidad = ''
  assert.match(errorRecetaIA(form.procesos, materiales), /cantidad/)
  form.procesos[0].materiales[0].cantidad = '2'
  assert.match(errorRecetaIA(form.procesos, []), /material registrado/)
  form.procesos[0].piezas[0].cantidad = ''
  assert.match(errorRecetaIA(form.procesos, materiales), /piezas/)
})

test('envía catálogos mínimos sin precios, stocks ni productos existentes', async () => {
  let body
  await generarProducto({ descripcion: 'Armario dos puertas', materiales, procesosGlobales: globales,
    productos: [{ id: 3, nombre: 'Producto privado', valorVenta: 123456 }] }, {
    apiKey: 'test-key', model: 'test-model', fetchImpl: async (url, options) => {
      body = JSON.parse(options.body)
      return { ok: true, json: async () => ({ status: 'completed', output: [
        { content: [{ type: 'output_text', text: JSON.stringify(producto()) }] },
      ] }) }
    },
  })
  assert.equal(body.store, false)
  assert.equal(body.text.format.name, 'borrador_producto')
  assert.deepEqual(JSON.parse(body.input).materiales, [{ id: 7, nombre: 'Lámina MDF 15 mm', unidad: 'lámina' }])
  assert.ok(!body.input.includes('privado'))
  assert.ok(!body.input.includes('95000'))
})

test('producto aplica permisos propios y comparte límite con materiales', async (t) => {
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => { req.usuario = req.headers['x-usuario'] || 'prueba'; next() })
  const permisoRequired = (pagina, accion) => (req, res, next) => {
    if (!req.headers['x-permisos']?.split(',').includes(`${pagina}:${accion}`)) return res.status(403).end()
    next()
  }
  let llamadas = 0
  const db = { prepare: (sql) => { assert.match(sql, /^SELECT /); return { all: () => [] } } }
  app.use('/api/ia', rutasIA({ db, permisoRequired,
    generarProd: async () => { llamadas++; return validarProducto({ ...producto(), procesos: [] }) },
    generar: async () => { llamadas++; return {} },
  }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}/api/ia`
  for (const permisos of ['materiales:ver,materiales:crear', 'productos:ver,materiales:ver', 'productos:crear,materiales:ver', 'productos:ver,productos:crear']) {
    assert.equal((await fetch(`${url}/producto`, { method: 'POST', headers: { 'x-permisos': permisos } })).status, 403)
    assert.equal((await fetch(`${url}/producto/estado`, { headers: { 'x-permisos': permisos } })).status, 403)
  }
  assert.equal(llamadas, 0)
  const permisos = 'productos:ver,productos:crear,materiales:ver'
  assert.equal((await fetch(`${url}/producto/estado`, { headers: { 'x-permisos': permisos } })).status, 200)
  assert.equal((await fetch(`${url}/producto`, { method: 'POST', headers: { 'x-permisos': permisos } })).status, 200)
  assert.equal((await fetch(`${url}/material`, { method: 'POST', headers: { 'x-permisos': 'materiales:ver,materiales:crear' } })).status, 429)
  assert.equal(llamadas, 1)
})

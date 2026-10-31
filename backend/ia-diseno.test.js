import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { configurarDiseno, construirMueble } from '../src/utils/construccionMueble.js'
import { nuevoModulo } from '../src/utils/despiece.js'
import { activarMDF } from '../src/utils/fabricacionMDF.js'
import { aplicarCambiosDiseno } from '../src/utils/cambiosDiseno.js'
import { contextoDiseno, generarCambiosDiseno, validarRespuestaDiseno } from './ia-diseno.js'
import { rutasIA } from './ia-routes.js'

const diseno = () => configurarDiseno({ ancho: '120', alto: '180', fondo: '60', espesor: 18, gap: 3, holguraFondo: 10,
  armado: 'laterales-completos', tipoFondo: 'superpuesto', modulos: [nuevoModulo()] })
const respuesta = (cambios) => ({ explicacion: 'Se agregan gavetas al módulo.', cambios, preguntas: [], advertencias: [] })
const gavetas = { tipo: 'cajones', modulo: 1, numero: 2, opcion: null }

test('asistente de diseño agrega dos gavetas sin cambiar la carcasa y recalcula las piezas', () => {
  const base = diseno(), anterior = construirMueble(base)
  assert.deepEqual(anterior.avisos, [])
  const propuesta = aplicarCambiosDiseno(base, [gavetas])
  assert.equal(base.modulos[0].cajones, 0)
  assert.equal(propuesta.diseno.modulos[0].cajones, 2)
  assert.equal(propuesta.diseno.ancho, base.ancho)
  assert.ok(propuesta.piezas.some((p) => p.nombre === 'Frente cajón' && p.cantidad === 2))
  assert.ok(propuesta.piezas.reduce((s, p) => s + p.cantidad, 0) > anterior.paneles.length)
  assert.ok(propuesta.resumen[0].includes('2 gavetas'))
  assert.ok(propuesta.avisos.some((s) => s.includes('zona de 60 cm')))
  assert.ok(propuesta.avisos.some((s) => s.includes('riel')))
  const conEntrepanos = aplicarCambiosDiseno(base, [
    { tipo: 'entrepanos', modulo: 1, numero: 2, opcion: null }, gavetas,
  ])
  assert.equal(conEntrepanos.diseno.modulos[0].alturas.length, 2)
  assert.equal(conEntrepanos.diseno.modulos[0].cajones, 2)
  assert.deepEqual(construirMueble(conEntrepanos.diseno).avisos, [])
  const mdf = aplicarCambiosDiseno(activarMDF(base), [gavetas])
  assert.ok(mdf.piezas.some((p) => p.nombre === 'Fondo cajón' && p.espesor === 3))
  assert.ok(mdf.piezas.some((p) => p.nombre === 'Frente cajón' && p.espesor === 9))
})

test('rechaza módulos, cantidades y geometrías inválidas y pide aclarar si no hay cambios', () => {
  const f = diseno(), contexto = contextoDiseno({ descripcion: 'Ponle dos gavetas al módulo uno', diseno: f })
  assert.equal(validarRespuestaDiseno(respuesta([gavetas]), contexto).puedeAplicar, true)
  const pregunta = validarRespuestaDiseno({ ...respuesta([]), preguntas: ['¿En cuál módulo?'] }, contexto)
  assert.equal(pregunta.puedeAplicar, false)
  for (const cambio of [{ ...gavetas, modulo: 2 }, { ...gavetas, numero: 100 }, { ...gavetas, tipo: 'riel' },
    { ...gavetas, tipo: 'alto', modulo: null, numero: 1 }, { ...gavetas, campoExtra: 'valor' }]) {
    assert.throws(() => aplicarCambiosDiseno(f, [cambio]))
  }
  assert.throws(() => aplicarCambiosDiseno(f, [gavetas, gavetas]), /repitió/)
  assert.throws(() => aplicarCambiosDiseno(f, [{ tipo: 'zonaCajones', modulo: 1, numero: 50, opcion: null }]), /Primero indica/)
  assert.throws(() => contextoDiseno({ descripcion: 'Ponle dos gavetas', diseno: {} }), /diseño configurable/)
})

test('solo envía las medidas y módulos necesarios a OpenAI; no persiste la propuesta', async () => {
  let body
  const f = { ...diseno(), secreto: 'cliente privado', costo: 123456 }
  const propuesta = await generarCambiosDiseno({ descripcion: 'Ponle 2 gavetas en el módulo 1', diseno: f }, {
    apiKey: 'test-key', model: 'test-model', fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses')
      body = JSON.parse(options.body)
      return { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(respuesta([gavetas])) }] }] }) }
    },
  })
  assert.equal(propuesta.puedeAplicar, true)
  assert.equal(body.text.format.name, 'cambios_diseno_mueble')
  assert.equal(body.store, false)
  assert.equal(JSON.parse(body.input).diseno.modulos[0].numero, 1)
  assert.ok(!body.input.includes('cliente privado') && !body.input.includes('123456'))
})

test('ruta de diseño comparte permisos y límite de consultas IA', async (t) => {
  const app = express(); app.use(express.json()); app.use((req, res, next) => { req.usuario = 'editor'; next() })
  const permisoRequired = (pagina, accion) => (req, res, next) => req.headers['x-perm'] === `${pagina}:${accion}` ? next() : res.status(403).end()
  let llamadas = 0
  app.use('/api/ia', rutasIA({ db: { prepare: () => { throw new Error('No debe leer la base') } }, permisoRequired,
    permisoAnyRequired: () => permisoRequired('productos', 'editar'),
    generarDiseno: async (body) => { llamadas++; return validarRespuestaDiseno(respuesta([gavetas]), contextoDiseno(body)) } }))
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}/api/ia/diseno`
  assert.equal((await fetch(url + '/estado')).status, 403)
  assert.equal((await fetch(url, { method: 'POST' })).status, 403)
  const options = { method: 'POST', headers: { 'x-perm': 'cortes-planos:ver', 'Content-Type': 'application/json' },
    body: JSON.stringify({ descripcion: 'Ponle dos gavetas en el módulo 1', diseno: diseno() }) }
  assert.equal((await fetch(url, options)).status, 200)
  assert.equal((await fetch(url, options)).status, 429)
  assert.equal(llamadas, 1)
})

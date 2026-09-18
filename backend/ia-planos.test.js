import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { contextoPlanos, generarPlanos, validarRespuestaPlanos } from './ia-planos.js'
import { rutasIA } from './ia-routes.js'
import { modeloPiezasManuales, validarMontaje } from '../src/utils/piezasManuales.js'
import { validarProyecto, proyectoVacio } from '../src/utils/proyectoCorte.js'

const piezas = [{ codigo: 'P001', nombre: 'Lateral', ancho: 500, alto: 1800, espesor: 9, cantidad: 2, permiteRotar: false }]
const entrada = () => ({ descripcion: 'Explica estas medidas en centímetros', modo: 'proponer', piezas, espesorBase: 9, montaje: [] })
const respuesta = () => ({ explicacion: 'El ancho de 500 mm equivale a 50 cm.', pasos: [{ concepto: 'Ancho', calculo: '500 / 10 = 50 cm', resultadoMm: 500 }], preguntas: [], supuestos: [], advertencias: [], piezas: [], montaje: [] })
const propuesta = () => ({ nombre: 'Techo', anchoMm: 982, altoMm: 500, espesorMm: 9, cantidad: 1, permiteRotar: true, motivo: '1000 - 2 × 9' })

test('IA planos: conserva pendientes y rechaza medidas o referencias falsas', () => {
  const r = validarRespuestaPlanos({ ...respuesta(), piezas: [{ ...propuesta(), altoMm: null }] }, contextoPlanos(entrada()))
  assert.equal(r.puedeAplicarPiezas, false); assert.ok(r.pendientes.length)
  assert.equal(r.piezas[0].alto, null)
  assert.equal(validarRespuestaPlanos({ ...respuesta(), piezas: [propuesta()] }, contextoPlanos(entrada())).puedeAplicarPiezas, true)
  assert.throws(() => validarRespuestaPlanos({ ...respuesta(), piezas: [{ ...propuesta(), anchoMm: -1 }] }, contextoPlanos(entrada())))
  assert.throws(() => validarRespuestaPlanos({ ...respuesta(), piezas: [{ ...propuesta(), cantidad: 1.2 }] }, contextoPlanos(entrada())))
  const ubicacion = { codigo: 'NOEXISTE', unidad: 1, plano: 'frente', xMm: 0, yMm: 0, zMm: 0, motivo: 'Prueba' }
  assert.throws(() => validarRespuestaPlanos({ ...respuesta(), montaje: [ubicacion] }, contextoPlanos(entrada())))
  assert.throws(() => validarRespuestaPlanos({ ...respuesta(), montaje: [{ ...ubicacion, codigo: 'P001', unidad: 3 }] }, contextoPlanos(entrada())))
  const explicado = validarRespuestaPlanos({ ...respuesta(), piezas: [propuesta()] }, contextoPlanos({ ...entrada(), modo: 'explicar' }))
  assert.deepEqual(explicado.piezas, []); assert.equal(explicado.puedeAplicarPiezas, false)
})

test('IA planos: envía solo medidas, usa Responses estructurado y no persiste', async () => {
  let body, llamadas = 0
  const fetchImpl = async (url, options) => {
    llamadas++; assert.equal(url, 'https://api.openai.com/v1/responses'); body = JSON.parse(options.body)
    return { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(respuesta()) }] }] }) }
  }
  await generarPlanos({ ...entrada(), costos: 99999, cliente: 'privado', piezas: [{ ...piezas[0], costo: 33333 }] }, { apiKey: 'test', model: 'test-model', fetchImpl })
  assert.equal(body.store, false); assert.equal(body.text.format.strict, true)
  assert.equal(body.model, 'test-model')
  assert.ok(!body.input.includes('privado') && !body.input.includes('99999') && !body.input.includes('33333'))
  assert.equal(JSON.parse(body.input).piezas[0].anchoMm, 500)
  await assert.rejects(generarPlanos({ ...entrada(), piezas: [{ ...piezas[0], ancho: 0 }] }, { apiKey: 'test', model: 'test', fetchImpl }))
  assert.equal(llamadas, 1)
  await assert.rejects(generarPlanos(entrada(), { apiKey: '', model: 'test', fetchImpl }), /configurada/)
  assert.equal(llamadas, 1)
})

test('IA planos: permisos, errores y límite compartido sin consultar la base de negocio', async (t) => {
  const app = express(); app.use(express.json()); app.use((req, res, next) => { req.usuario = req.headers['x-user'] || 'test'; next() })
  const permisoRequired = (pagina, accion) => (req, res, next) => req.headers['x-perm']?.includes(`${pagina}:${accion}`) ? next() : res.status(403).end()
  let llamadas = 0
  app.use('/api/ia', rutasIA({ db: { prepare: () => { throw new Error('No debe leer la base') } }, permisoRequired,
    generarPlano: async (body) => { llamadas++; return validarRespuestaPlanos(respuesta(), contextoPlanos(body)) } }))
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}/api/ia`
  assert.equal((await fetch(url + '/planos/estado')).status, 403)
  assert.equal((await fetch(url + '/planos', { method: 'POST' })).status, 403)
  assert.equal(llamadas, 0)
  const opciones = { method: 'POST', headers: { 'x-perm': 'cortes-planos:ver', 'Content-Type': 'application/json' }, body: JSON.stringify(entrada()) }
  assert.equal((await fetch(url + '/planos', opciones)).status, 200)
  assert.equal((await fetch(url + '/planos', opciones)).status, 429)
  assert.equal(llamadas, 1)
})

test('piezas manuales: 3D a escala, montaje parcial y persistencia validada', () => {
  const modelo = modeloPiezasManuales(piezas, 18)
  assert.deepEqual(modelo.piezas[0].dimensiones, [500, 1800, 9])
  assert.equal(modelo.piezas.length, 1)
  const m = [{ codigo: 'P001', unidad: 1, plano: 'lateral', x: 0, y: 0, z: 0 }]
  const armado = modeloPiezasManuales(piezas, 18, m, 'montaje')
  assert.deepEqual(armado.piezas[0].dimensiones, [9, 1800, 500])
  assert.equal(armado.faltantes.length, 1)
  const p = validarProyecto({ ...proyectoVacio(), piezas, montajeManual: m })
  assert.deepEqual(p.montajeManual, m)
  assert.throws(() => validarMontaje([...m, ...m], piezas))
  assert.throws(() => validarMontaje([{ ...m[0], unidad: 5 }], piezas))
  assert.throws(() => validarMontaje([{ ...m[0], x: null }], piezas))
})

import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { contextoPlanos, generarPlanos, validarRespuestaPlanos } from './ia-planos.js'
import { referenciaVacia, validarReferenciasPlano } from '../src/utils/referenciasPlano.js'
import { desplazarMontaje, modeloPiezasManuales } from '../src/utils/piezasManuales.js'
import { proyectoVacio } from '../src/utils/proyectoCorte.js'
import { servidorPrueba } from '../tests/portal-helper.mjs'

const foto = async (vista = 'exterior') => ({ vista, nombre: 'mueble.png', datos: 'data:image/png;base64,' +
  (await sharp({ create: { width: 32, height: 32, channels: 3, background: '#aaaaaa' } }).png().toBuffer()).toString('base64') })
const entrada = async () => ({ modo: 'fotos', descripcion: 'Dos laterales, MDF de 9 mm, sin veta.', espesorBase: 9, piezas: [], montaje: [],
  referencias: { ...referenciaVacia(), descripcion: 'Dos laterales, MDF de 9 mm, sin veta.', ancho: 1000, alto: 1800, fondo: 500, fotos: [await foto(), await foto('interior')] } })
const respuesta = () => ({ explicacion: 'Dos laterales ubicados.', pasos: [], preguntas: [], supuestos: ['Ubicación propuesta según medidas confirmadas.'], advertencias: [],
  piezas: [{ nombre: 'Lateral', anchoMm: 500, altoMm: 1800, espesorMm: 9, cantidad: 2, permiteRotar: true, motivo: 'Altura y fondo confirmados.' }],
  montaje: [0, 991].map((x, i) => ({ codigo: 'P001', unidad: i + 1, plano: 'lateral', xMm: x, yMm: 0, zMm: 0, motivo: 'Extremos del armario.' })) })

test('Fotos: envío multimodal validado sin costos, nombres de archivos ni datos ajenos', async () => {
  const e = await entrada()
  let enviado, llamadas = 0
  const opciones = { apiKey: 'prueba', model: 'modelo-con-vision', fetchImpl: async (_, request) => {
    llamadas++; enviado = JSON.parse(request.body)
    return { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(respuesta()) }] }] }) }
  } }
  const r = await generarPlanos({ ...e, costo: 987654, cliente: 'privado' }, opciones)
  assert.equal(r.puedeAplicarPiezas, true)
  assert.equal(r.puedeAplicarMontaje, false, 'Las fotos aplican piezas y posiciones juntas')
  assert.equal(r.montaje.length, 2)
  const content = enviado.input[0].content
  const imagenes = content.filter((c) => c.type === 'input_image')
  assert.equal(imagenes.length, 2)
  for (const imagen of imagenes) {
    assert.match(imagen.image_url, /^data:image\/jpeg;base64,/)
    assert.equal((await sharp(Buffer.from(imagen.image_url.split(',')[1], 'base64')).metadata()).width, 32)
  }
  assert.ok(content.some((c) => c.text?.includes('interior')))
  assert.equal(JSON.parse(content[0].text).medidasExterioresMm.ancho, 1000)
  assert.equal(enviado.store, false)
  assert.doesNotMatch(JSON.stringify(enviado), /privado|987654|mueble.png/)
  const mala = { ...e, referencias: { ...e.referencias, fotos: [{ ...e.referencias.fotos[0], datos: 'data:image/png;base64,iVBORw0KGgo=' }] } }
  await assert.rejects(generarPlanos(mala, opciones), /dañada/)
  assert.equal(llamadas, 1, 'No enviar archivos dañados al proveedor')
})

test('Fotos: límites de carga y medidas pendientes impiden aplicar un plano incompleto', async () => {
  const e = await entrada(), c = contextoPlanos(e)
  assert.throws(() => contextoPlanos({ ...e, referencias: { ...e.referencias, fotos: [] } }), /fotografía/)
  for (const fotos of [Array(7).fill(e.referencias.fotos[0]), [{ ...e.referencias.fotos[0], datos: 'https://ejemplo.com/foto.png' }],
    [{ ...e.referencias.fotos[0], datos: 'data:image/svg+xml;base64,PHN2Zz4=' }],
    [{ ...e.referencias.fotos[0], datos: 'data:image/png;base64,' + 'A'.repeat(3000000) }]]) {
    assert.throws(() => validarReferenciasPlano({ ...e.referencias, fotos }))
  }
  assert.throws(() => validarReferenciasPlano({ ...e.referencias, ancho: -10 }))
  const incompleta = respuesta(); incompleta.piezas[0].altoMm = null
  assert.equal(validarRespuestaPlanos(incompleta, c).puedeAplicarPiezas, false)
  const parcial = respuesta(); parcial.montaje.pop()
  const r = validarRespuestaPlanos(parcial, c)
  assert.equal(r.puedeAplicarPiezas, false)
  assert.ok(r.pendientes.some((p) => p.includes('P001-2')))
  const falsa = respuesta(); falsa.montaje[0].codigo = 'P099'
  assert.throws(() => validarRespuestaPlanos(falsa, c), /inexistente/)
  const repetida = respuesta(); repetida.montaje[1] = repetida.montaje[0]
  assert.throws(() => validarRespuestaPlanos(repetida, c), /repetida/)
})

test('Fotos: guardar, mover una unidad y reabrir conserva fotos y posiciones por versión', { timeout: 30000 }, async (t) => {
  const { request, admin } = await servidorPrueba(t)
  const e = await entrada(), propuesta = validarRespuestaPlanos(respuesta(), contextoPlanos(e))
  const proyecto = { ...proyectoVacio(), referencias: e.referencias, piezas: propuesta.piezas, montajeManual: propuesta.montaje }
  const r = (p, method = 'GET', body) => request(p, method, body, admin)
  const guardado = await r('/planos-corte', 'POST', { nombre: 'Armario desde fotos', proyecto })
  assert.equal(guardado.status, 200, JSON.stringify(guardado.data))
  const montaje = desplazarMontaje(guardado.data.proyecto.montajeManual, proyecto.piezas, 'P001-2', 'z', -50)
  assert.equal(montaje[0].z, 0)
  assert.equal(montaje[1].z, -50)
  assert.equal(proyecto.montajeManual[1].z, 0, 'El movimiento no modifica el historial anterior')
  const modelo = modeloPiezasManuales(proyecto.piezas, 9, montaje, 'montaje')
  assert.equal(modelo.piezas[1].origen[2], -50)
  assert.throws(() => desplazarMontaje(montaje, proyecto.piezas, 'P001-2', 'z', -100001))
  assert.throws(() => desplazarMontaje(montaje, proyecto.piezas, 'P001-3', 'x', 10))
  const nuevo = await r('/planos-corte', 'POST', { nombre: 'Armario desde fotos', proyectoId: guardado.data.id, proyecto: { ...proyecto, montajeManual: montaje } })
  assert.equal(nuevo.status, 200, JSON.stringify(nuevo.data))
  assert.equal(nuevo.data.revision, 2)
  const abierto = (await r(`/planos-corte/${nuevo.data.id}`)).data.proyecto
  assert.deepEqual(abierto.referencias, e.referencias)
  assert.deepEqual(abierto.montajeManual, montaje)
  assert.equal((await r(`/planos-corte/${guardado.data.id}`)).data.proyecto.montajeManual[1].z, 0)
  assert.equal((await r('/planos-corte', 'POST', { nombre: 'Mala foto', proyecto: { ...proyecto, referencias: { ...e.referencias, fotos: [{ ...e.referencias.fotos[0], vista: 'desconocida' }] } } })).status, 400)
})

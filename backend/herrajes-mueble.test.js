import test from 'node:test'
import assert from 'node:assert/strict'
import { configurarDiseno, construirMueble } from '../src/utils/construccionMueble.js'
import { nuevoModulo } from '../src/utils/despiece.js'
import { herrajesModulo } from '../src/utils/herrajesMueble.js'
import { activarMDF, editarPanelDiseno, perfilSimple } from '../src/utils/fabricacionMDF.js'
import { transformarPieza } from '../src/utils/movimientoMueble.js'
import { crearModeloMueble } from '../src/utils/modeloMueble.js'
import { proyectoVacio, validarProyecto } from '../src/utils/proyectoCorte.js'
import { BASES_MUEBLE, crearBaseMueble } from '../src/utils/basesMueble.js'
import { servidorPrueba } from '../tests/portal-helper.mjs'

const diseno = () => activarMDF(configurarDiseno({ ancho: 120, alto: 200, fondo: 55, espesor: 9, gap: 3,
  holguraFondo: 10, armado: 'laterales-completos', tipoFondo: 'superpuesto', modulos: [nuevoModulo()] }))
const tubo = (extras = {}) => ({ id: 'ropa', tipo: 'redondo', altura: 150, fondo: 27, diametro: 25, descuento: 10, referencia: 'Tubo de prueba', ...extras })

test('herrajes: cantidades reales separadas del MDF, soportes y largo del tubo', () => {
  const f = diseno(), sinHerrajes = construirMueble(f)
  const h = herrajesModulo()
  h.manija.tipo = 'barra'; h.manija.referencia = 'Manija negra 128'; h.manija.acabado = 'negro'
  h.bisagras.activo = true; h.tubos = [tubo()]
  f.modulos[0].puerta = 'dos'
  const panelesSin = construirMueble(f).piezas
  f.modulos[0].herrajes = h
  const c = construirMueble(f)
  assert.deepEqual(c.avisos, [])
  assert.deepEqual(c.piezas, panelesSin, 'Los herrajes no se convierten en cortes de MDF')
  assert.equal(sinHerrajes.herrajes.length, 0)
  assert.equal(c.listaHerrajes.find((p) => p.nombre.startsWith('Manija')).cantidad, 2)
  assert.equal(c.listaHerrajes.find((p) => p.nombre.startsWith('Bisagra')).cantidad, 4)
  assert.equal(c.listaHerrajes.find((p) => p.nombre.startsWith('Soporte')).cantidad, 2)
  const colgador = c.herrajes.find((p) => p.id.startsWith('TUB-'))
  assert.equal(colgador.forma, 'cilindro-x')
  assert.equal(colgador.dimensiones[0], c.modulos[0].ancho - 10)
  assert.match(c.listaHerrajes.find((p) => p.nombre.startsWith('Tubo')).medida, /1172 mm/)
  assert.ok(c.herrajes.some((p) => p.color === '#343a3c'))
  const modelo = crearModeloMueble(f, c.piezas)
  const manija = modelo.herrajes.find((p) => p.id.startsWith('MAN-'))
  assert.ok(manija.movimiento)
  assert.notDeepEqual(transformarPieza(manija, modelo, 0, 1).posicion, transformarPieza(manija, modelo, 0, 0).posicion)
  const modificado = editarPanelDiseno(f, 'Puerta|0|0', { perfil: perfilSimple(9), ajuste: { bisagra: 'der', x: 20 } })
  const ajustado = construirMueble(modificado)
  assert.deepEqual(ajustado.avisos, [])
  assert.equal(ajustado.herrajes.find((p) => p.id === 'MAN-0-0').movimiento.lado, 'der')
})

test('herrajes: rechaza tubos que atraviesan repisas o cajones y medidas inválidas', () => {
  const c = (editar) => { const f = diseno(); f.modulos[0].herrajes = herrajesModulo(); editar(f, f.modulos[0].herrajes); return construirMueble(f) }
  assert.match(c((f, h) => { f.modulos[0].alturas = [150]; h.tubos = [tubo()] }).avisos[0], /atraviesa/)
  assert.match(c((f, h) => { f.modulos[0].cajones = 2; f.modulos[0].zonaCajones = 60; h.tubos = [tubo({ altura: 30 })] }).avisos[0], /atraviesa/)
  assert.match(c((f, h) => { h.tubos = [tubo({ altura: 199 })] }).avisos[0], /salen del espacio interior/)
  assert.match(c((f, h) => { h.tubos = [tubo(), tubo({ id: 'segundo' })] }).avisos[0], /superponen/)
  assert.match(c((f, h) => { h.tubos = Array.from({ length: 5 }, (_, i) => tubo({ id: `t${i}` })) }).avisos[0], /máximo cuatro/)
  assert.match(c((f, h) => { h.manija.tipo = 'barra'; h.manija.retiro = 200; f.ancho = 15 }).avisos[0], /no cabe/)
  assert.match(c((f, h) => { h.bisagras.activo = true; h.bisagras.cantidad = 2.5 }).avisos[0], /un entero/)
})

test('ocho bases nuevas: 3D válido, configuración editable y validación para guardar', () => {
  assert.equal(BASES_MUEBLE.length, 8)
  for (const b of BASES_MUEBLE) {
    const f = crearBaseMueble(b.id), c = construirMueble(f)
    assert.deepEqual(c.avisos, [], b.nombre)
    assert.ok(c.piezas.length && c.listaHerrajes.length)
    assert.deepEqual(crearModeloMueble(f, c.piezas).avisos, [])
    const p = validarProyecto({ ...proyectoVacio(), lamina: { ...proyectoVacio().lamina, espesor: 9 }, piezas: c.piezas, diseno: f })
    assert.deepEqual(p.diseno.modulos[0].herrajes, f.modulos[0].herrajes)
  }
})

test('herrajes y base se conservan al guardar versiones y reabrir el proyecto', { timeout: 30000 }, async (t) => {
  const { request, admin } = await servidorPrueba(t)
  const f = crearBaseMueble('armario-dos'), c = construirMueble(f)
  const proyecto = { ...proyectoVacio(), lamina: { ...proyectoVacio().lamina, espesor: 9 }, piezas: c.piezas, diseno: f }
  const guardado = await request('/planos-corte', 'POST', { nombre: 'Armario con herrajes', proyecto }, admin)
  assert.equal(guardado.status, 200, JSON.stringify(guardado.data))
  const abierto = await request(`/planos-corte/${guardado.data.id}`, 'GET', undefined, admin)
  assert.deepEqual(abierto.data.proyecto.diseno.modulos[1].herrajes.tubos, f.modulos[1].herrajes.tubos)
  const reconstruido = construirMueble(abierto.data.proyecto.diseno)
  assert.deepEqual(reconstruido.listaHerrajes, c.listaHerrajes)
  assert.deepEqual(reconstruido.avisos, [])
})

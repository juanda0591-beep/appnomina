import test from 'node:test'
import assert from 'node:assert/strict'
import { construirMueble, configurarDiseno } from '../src/utils/construccionMueble.js'
import { activarMDF, perfilSimple, editarPanelDiseno } from '../src/utils/fabricacionMDF.js'
import { nuevoModulo } from '../src/utils/despiece.js'
import { crearModeloMueble } from '../src/utils/modeloMueble.js'
import { transformarPieza } from '../src/utils/movimientoMueble.js'
import { optimizarLote } from './corte.js'
import { proyectoVacio, entradaCorte } from '../src/utils/proyectoCorte.js'

const base = () => activarMDF(configurarDiseno({ ancho: 100, alto: 180, fondo: 50, espesor: 9, gap: 3, holguraFondo: 10,
  armado: 'laterales-completos', tipoFondo: 'superpuesto', modulos: [{ ...nuevoModulo(), cajones: 2, zonaCajones: 50 }] }))
const construir = (f) => { const c = construirMueble(f); assert.deepEqual(c.avisos, []); return c }

test('MDF: distingue fondos 3 mm y tableros 9 mm sin mezclar sus láminas', () => {
  const f = base(), c = construir(f)
  assert.equal(c.paneles.find((p) => p.nombre === 'Fondo').espesor, 3)
  assert.equal(c.paneles.find((p) => p.nombre === 'Fondo cajón').espesor, 3)
  assert.ok(c.piezas.filter((p) => !p.nombre.startsWith('Fondo')).every((p) => p.espesor === 9))
  const proyecto = { ...proyectoVacio(), lamina: { ancho: 1830, largo: 2440, espesor: 9, costo: 100 },
    diseno: f, piezas: c.piezas, laminasPorEspesor: { 3: { ancho: 1500, largo: 2400, espesor: 3, costo: 40 } } }
  const entrada = entradaCorte(proyecto), r = optimizarLote(entrada.piezas, entrada.lamina, entrada.opciones, entrada.laminasPorEspesor)
  assert.deepEqual(r.grupos.map((g) => g.espesor), [9, 3])
  assert.equal(r.costoTotal, r.grupos.reduce((s, g) => s + g.cantidadLaminas * (g.espesor === 9 ? 100 : 40), 0))
  for (const lam of r.laminas) {
    const espesores = new Set(lam.piezas.map((p) => c.piezas.find((pieza) => pieza.codigo === p.codigo).espesor))
    assert.equal(espesores.size, 1); assert.equal([...espesores][0], lam.espesor)
  }
})

test('reengrueso: cara y capas de tiras reales; el espesor de piso descuenta altura útil', () => {
  let f = base()
  f = editarPanelDiseno(f, 'Piso|global|0', { ajuste: {}, perfil: { ...perfilSimple(9), tipo: 'reengrueso', final: 27, anchoTira: 40 } })
  const c = construir(f), piso = c.paneles.find((p) => p.nombre === 'Piso')
  assert.equal(piso.espesor, 27)
  const comps = c.componentes.filter((p) => p.padre === piso.clave)
  assert.equal(comps.length, 9, 'Una cara más cuatro tiras por cada una de dos capas')
  assert.ok(comps.every((p) => p.espesor === 9))
  assert.equal(c.modulos[0].alto, 1800 - 9 - 27)
  assert.ok(c.paneles.find((p) => p.nombre === 'Frente cajón').origen[1] > 27)
  f.fabricacion.perfiles[piso.clave].final = 25
  assert.match(construirMueble(f).avisos.join(), /capas de 9/)
})

test('entamborado: dos caras, marco e interiores con despiece independiente y espesor correcto', () => {
  const f = editarPanelDiseno(base(), 'Techo|global|0', { ajuste: {}, perfil: { ...perfilSimple(9), tipo: 'entamborado', final: 40, caraInferior: 3, refuerzos: 2 } })
  const c = construir(f), comps = c.componentes.filter((p) => p.padre === 'Techo|global|0')
  assert.equal(comps.length, 8)
  assert.equal(comps.find((p) => p.nombre.endsWith('cara')).espesor, 9)
  assert.equal(comps.find((p) => p.nombre.endsWith('contracara')).espesor, 3)
  assert.ok(comps.filter((p) => p.nombre.includes('refuerzo')).every((p) => p.alto === 28 && p.espesor === 9))
  assert.equal(c.paneles.find((p) => p.nombre === 'Techo').origen[1], 1760)
  const modelo = crearModeloMueble(f, c.piezas)
  assert.deepEqual(modelo.avisos, [])
  assert.equal(modelo.componentes.length, c.componentes.length)
})

test('aperturas: giro con bisagra y desplazamiento de frente y caja comparten movimiento', () => {
  const f = base(), m = crearModeloMueble(f)
  const puerta = m.piezas.find((p) => p.nombre === 'Puerta')
  const cerrada = transformarPieza(puerta, m, 0, 0), abierta = transformarPieza(puerta, m, 0, 1)
  assert.notEqual(abierta.angulo, 0); assert.notDeepEqual(cerrada.posicion, abierta.posicion)
  assert.deepEqual(puerta.dimensiones, [puerta.ancho, puerta.alto, puerta.espesor])
  const frente = m.piezas.find((p) => p.nombre === 'Frente cajón')
  const caja = m.piezas.filter((p) => p.movimiento?.id === frente.movimiento.id)
  assert.equal(caja.length, 6)
  for (const p of caja) {
    const a = transformarPieza(p, m, 0, 1), b = transformarPieza(p, m, 0, 0)
    assert.ok(Math.abs(a.posicion[2] - b.posicion[2] - frente.movimiento.recorrido / 1000) < 1e-9)
    assert.deepEqual(a.posicion.slice(0, 2), b.posicion.slice(0, 2))
  }
})

test('tocador: marco y vidrio deslizan juntos; vidrio queda fuera del MDF', () => {
  const f = base()
  f.fabricacion.complementos.push({ id: 'espejo', tipo: 'espejo', nombre: 'Marco tocador', ancho: 800, alto: 900, espesor: 9,
    marco: 60, espesorEspejo: 3, apertura: 'der', recorrido: 500, x: 100, y: 1800, z: 450 })
  const c = construir(f)
  assert.equal(c.espejos.length, 1); assert.equal(c.espejos[0].ancho, 680)
  assert.equal(c.paneles.filter((p) => p.grupo === 'marcos').length, 4)
  assert.ok(c.piezas.every((p) => !p.nombre.includes('vidrio')))
  const mov = c.espejos[0].movimiento
  assert.ok(c.paneles.filter((p) => p.grupo === 'marcos').every((p) => p.movimiento.id === mov.id))
  f.fabricacion.complementos[0].marco = 450
  assert.ok(construirMueble(f).avisos.length)
})

test('edición individual: modifica solo la clave seleccionada y actualiza el despiece', () => {
  const f = base(), antes = construir(f)
  const d = editarPanelDiseno(f, 'Lateral|global|0', { ajuste: { ancho: 480, z: 20 }, perfil: perfilSimple(9) })
  const c = construir(d)
  assert.equal(c.paneles.find((p) => p.clave === 'Lateral|global|0').ancho, 480)
  assert.equal(c.paneles.find((p) => p.clave === 'Lateral|global|1').ancho, 500)
  assert.equal(c.paneles.find((p) => p.clave === 'Lateral|global|0').origen[2], 20)
  assert.ok(c.piezas.some((p) => p.nombre === 'Lateral' && p.ancho === 480 && p.cantidad === 1))
  assert.deepEqual(construir(editarPanelDiseno(d, 'Lateral|global|0', null)).piezas, antes.piezas)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { proyectoVacio, validarProyecto, entradaCorte } from '../src/utils/proyectoCorte.js'
import { agregarTablero, duplicarTablero, editarTablero, eliminarTablero, ubicarPendientes, girarTablero, ajustarArrastre, alinearTablero } from '../src/utils/disenoLibre.js'
import { dimensionesTablero, modeloPiezasManuales, validarMontaje } from '../src/utils/piezasManuales.js'
import { intersectarPlano } from '../src/utils/visorWebGL.js'
import { servidorPrueba } from '../tests/portal-helper.mjs'

const tablero = (extras = {}) => ({ nombre: 'Costado', ancho: 500, alto: 1800, espesor: 18, plano: 'lateral', x: 0, y: 0, z: 0, ...extras })

test('libre: copia independiente, límites, edición y eliminación de una unidad compartida', () => {
  const vacio = proyectoVacio(), primero = agregarTablero(vacio, tablero())
  assert.equal(vacio.piezas.length, 0)
  const copia = duplicarTablero(primero.proyecto, primero.id, 'x', 982)
  const editado = editarTablero(copia.proyecto, copia.id, { nombre: 'Derecho', ancho: 450 })
  assert.equal(editado.piezas[0].ancho, 500)
  assert.equal(editado.piezas[1].ancho, 450)
  assert.equal(editado.montajeManual[1].x, 982)
  assert.throws(() => agregarTablero(vacio, tablero({ espesor: 201 })), /Espesor/)
  assert.throws(() => agregarTablero({ ...vacio, diseno: {} }, tablero()), /independiente/)
  assert.throws(() => agregarTablero(primero.proyecto, tablero({ x: 100001 })), /posición/)
  assert.throws(() => agregarTablero({ ...primero.proyecto, unidades: 1000 }, tablero()), /1000 piezas/)
  const compartido = ubicarPendientes({ ...primero.proyecto, piezas: [{ ...primero.proyecto.piezas[0], cantidad: 3 }] })
  const borrado = eliminarTablero(compartido, 'P001-2')
  assert.equal(borrado.piezas[0].cantidad, 2)
  assert.deepEqual(borrado.montajeManual.map((m) => m.unidad), [1, 2])
  assert.equal(borrado.montajeManual[1].x, compartido.montajeManual[2].x)
  assert.equal(eliminarTablero(primero.proyecto, primero.id).piezas.length, 0)
})

test('libre: giros ortogonales conservan el corte y el centro, vistas y datos antiguos', () => {
  const primero = agregarTablero(proyectoVacio(), tablero())
  const corte = entradaCorte(primero.proyecto)
  for (const eje of ['x', 'y', 'z']) {
    const girado = girarTablero(primero.proyecto, primero.id, eje)
    assert.deepEqual(entradaCorte(girado), corte)
    const antes = modeloPiezasManuales(primero.proyecto.piezas, 18, primero.proyecto.montajeManual, 'montaje').piezas[0]
    const despues = modeloPiezasManuales(girado.piezas, 18, girado.montajeManual, 'montaje').piezas[0]
    assert.deepEqual(despues.posicion, antes.posicion)
    assert.notDeepEqual(despues.dimensiones, antes.dimensiones)
    const dosGiros = girarTablero(girado, primero.id, eje)
    assert.deepEqual(modeloPiezasManuales(dosGiros.piezas, 18, dosGiros.montajeManual, 'montaje').piezas[0].dimensiones, antes.dimensiones)
  }
  const rotado = editarTablero(primero.proyecto, primero.id, { plano: 'horizontal', giro: 90 })
  assert.deepEqual(dimensionesTablero(rotado.piezas[0], 18, rotado.montajeManual[0]), [1800, 18, 500])
  assert.equal(validarProyecto(rotado).montajeManual[0].giro, 90)
  assert.equal(Object.hasOwn(validarProyecto(primero.proyecto).montajeManual[0], 'giro'), false)
  assert.throws(() => validarMontaje([{ ...primero.proyecto.montajeManual[0], giro: 45 }], primero.proyecto.piezas), /giro/)
})

test('libre: ajuste a caras prioriza espesores reales sobre cuadrícula y respeta el eje', () => {
  const a = agregarTablero(proyectoVacio(), tablero())
  const b = agregarTablero(a.proyecto, tablero({ nombre: 'Repisa', ancho: 964, alto: 500, plano: 'horizontal', x: 100, y: 300 }))
  assert.deepEqual(ajustarArrastre(b.proyecto, b.id, [21, 300, 0], { eje: 'x', paso: 10, caras: true }), [18, 300, 0])
  assert.deepEqual(ajustarArrastre(b.proyecto, b.id, [21, 301, 99], { eje: 'x', paso: 10, caras: false }), [20, 300, 0])
  assert.deepEqual(ajustarArrastre(b.proyecto, b.id, [21.53, 301, 99], { paso: 0, caras: false }), [21.53, 301, 99])
  const unido = alinearTablero(b.proyecto, b.id, a.id, 'x', 'despues')
  assert.equal(unido.montajeManual[1].x, 18)
  assert.equal(unido.montajeManual[1].y, 300)
  const separado = alinearTablero(b.proyecto, b.id, a.id, 'x', 'antes')
  assert.equal(separado.montajeManual[1].x, -964)
  assert.throws(() => ajustarArrastre(b.proyecto, b.id, [NaN, 0, 0]), /Posición/)
  assert.deepEqual(intersectarPlano([0, 0, 2], [0, 0, -1], [0, 0, 0], [0, 0, 1]), [0, 0, 0])
  assert.equal(intersectarPlano([0, 0, 2], [1, 0, 0], [0, 0, 0], [0, 0, 1]), null)
})

test('libre: API guarda, recalcula y reabre todas las medidas y orientaciones', { timeout: 30000 }, async (t) => {
  const { request, admin } = await servidorPrueba(t)
  let r = agregarTablero(proyectoVacio(), tablero())
  r = duplicarTablero(r.proyecto, r.id, 'x', 982)
  let p = agregarTablero(r.proyecto, tablero({ nombre: 'Repisa', ancho: 964, alto: 500, plano: 'horizontal', x: 18, y: 500 })).proyecto
  p = girarTablero(p, 'P003-1', 'y')
  const guardado = await request('/planos-corte', 'POST', { nombre: 'Mueble de diseño libre', proyecto: p }, admin)
  assert.equal(guardado.status, 200, JSON.stringify(guardado.data))
  const abierto = await request(`/planos-corte/${guardado.data.id}`, 'GET', undefined, admin)
  assert.equal(abierto.data.proyecto.disenoLibre, true)
  assert.deepEqual(abierto.data.proyecto.montajeManual, p.montajeManual)
  assert.deepEqual(abierto.data.proyecto.piezas.map((pi) => [pi.ancho, pi.alto, pi.espesor]), p.piezas.map((pi) => [pi.ancho, pi.alto, pi.espesor]))
  assert.equal(abierto.data.resultado.sinCabida.length, 0)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { optimizarCorte } from './corte.js'
import { proyectoVacio, entradaCorte } from '../src/utils/proyectoCorte.js'
import { generarDespiece, paramsParaDespiece, nuevoModulo } from '../src/utils/despiece.js'
import { vistasMueble } from '../src/utils/vistasMueble.js'

const lamina = { ancho: 1830, largo: 2440, espesor: 18, costo: 90000 }
const piezas = [
  { codigo: 'P001', nombre: 'Lateral', ancho: 580, alto: 1800, cantidad: 2, permiteRotar: false, canto: 'der' },
  { codigo: 'P002', nombre: 'Entrepano', ancho: 564, alto: 560, cantidad: 6 },
  { codigo: 'P003', nombre: 'Puerta', ancho: 595, alto: 1790, cantidad: 2, permiteRotar: false },
]

test('corte: conserva piezas, medidas originales, veta, cantos y retazos sin solapamientos', () => {
  const r = optimizarCorte(piezas, lamina, { sierra: 4, margen: 10 })
  assert.equal(r.sinCabida.length, 0)
  assert.equal(r.laminas.flatMap((l) => l.piezas).length, 10)
  assert.equal(new Set(r.laminas.flatMap((l) => l.piezas.map((p) => p.id))).size, 10)
  for (const l of r.laminas) {
    for (const p of l.piezas) {
      assert.ok(p.x >= 10 && p.y >= 10)
      assert.ok(p.x + p.ancho <= r.lamina.ancho - 10)
      assert.ok(p.y + p.largo <= r.lamina.largo - 10)
      const original = piezas.find((pieza) => pieza.codigo === p.codigo)
      assert.equal(p.anchoOriginal, original.ancho)
      assert.equal(p.altoOriginal, original.alto)
      if (original.permiteRotar === false) assert.equal(p.rotada, false)
      if (original.canto) assert.equal(p.canto, original.canto)
    }
    const rectangulos = [...l.piezas, ...l.retazos]
    for (let a = 0; a < rectangulos.length; a++) for (let b = a + 1; b < rectangulos.length; b++) {
      const p = rectangulos[a], q = rectangulos[b]
      assert.ok(p.x + p.ancho <= q.x || q.x + q.ancho <= p.x || p.y + p.largo <= q.y || q.y + q.largo <= p.y, 'No debe haber solapamientos')
    }
  }
})

test('corte: valida cantidades, dimensiones, margen y limite del lote antes de expandir', () => {
  for (const cantidad of [0, -1, 1.5, Infinity, 1001]) assert.throws(() => optimizarCorte([{ ...piezas[0], cantidad }], lamina))
  for (const ancho of [0, -1, NaN, Infinity]) assert.throws(() => optimizarCorte([{ ...piezas[0], ancho }], lamina))
  assert.throws(() => optimizarCorte(piezas, lamina, { sierra: -1 }))
  assert.throws(() => optimizarCorte(piezas, lamina, { margen: 1000 }))
  assert.throws(() => optimizarCorte([...piezas, piezas[0]], lamina))
  assert.throws(() => entradaCorte({ ...proyectoVacio(), piezas, unidades: 101 }))
})

test('corte: informa piezas que dejan de caber por el saneado y acepta un encaje exacto', () => {
  const p = [{ nombre: 'Completa', ancho: 1830, alto: 2440, cantidad: 1, permiteRotar: false }]
  assert.equal(optimizarCorte(p, lamina).cantidadLaminas, 1)
  const r = optimizarCorte(p, lamina, { margen: 1 })
  assert.equal(r.cantidadLaminas, 0)
  assert.equal(r.sinCabida.length, 1)
})

test('diseño: comparte medidas entre despiece, vistas y proyecto; rechaza incoherencias', () => {
  const diseno = { ancho: '120', alto: '180', fondo: '58', espesor: 18, gap: 3, holguraFondo: 10,
    armado: 'laterales-completos', tipoFondo: 'superpuesto', modulos: [{ ...nuevoModulo(), alturas: [80] }] }
  const generado = generarDespiece(paramsParaDespiece(diseno))
  assert.deepEqual(generado.avisos, [])
  const proyecto = { ...proyectoVacio(), diseno, piezas: generado.piezas }
  assert.ok(entradaCorte(proyecto).piezas.length > 0)
  const vistas = vistasMueble(diseno)
  assert.equal(vistas.length, 3)
  assert.equal(vistas[0].ancho, 1200)
  assert.equal(vistas[1].ancho, 580)
  assert.equal(vistas[2].alto, 580)
  assert.throws(() => entradaCorte({ ...proyecto, diseno: { ...diseno, ancho: '130' } }), /coincide/)
  assert.throws(() => entradaCorte({ ...proyecto, lamina: { ...proyecto.lamina, espesor: 15 } }))
  assert.throws(() => entradaCorte({ ...proyecto, productoId: 'invalido' }))
  assert.ok(generarDespiece({ ...paramsParaDespiece(diseno), espesor: 1000 }).avisos.length)
})

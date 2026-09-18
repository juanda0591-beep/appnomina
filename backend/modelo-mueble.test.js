import test from 'node:test'
import assert from 'node:assert/strict'
import { crearModeloMueble, posicionModelo } from '../src/utils/modeloMueble.js'
import { generarDespiece, paramsParaDespiece, nuevoModulo } from '../src/utils/despiece.js'
import { intersectarCaja } from '../src/utils/visorWebGL.js'

const base = { ancho: '160', alto: '200', fondo: '60', espesor: 18, gap: 3, holguraFondo: 20,
  armado: 'laterales-completos', tipoFondo: 'superpuesto', modulos: [{ ...nuevoModulo(), alturas: [70, 130] }] }

test('3D: cada sólido corresponde a una pieza y conserva sus medidas de corte', () => {
  for (const armado of ['laterales-completos', 'techo-piso-cubren']) for (const tipoFondo of ['superpuesto', 'interno', 'sin-fondo']) {
    const f = { ...base, armado, tipoFondo, modulos: [
      { ...nuevoModulo(), puerta: 'dos', alturas: [110, 155], cajones: 2, zonaCajones: 50 },
      { ...nuevoModulo(), alturas: [], cajones: 3, zonaCajones: 65, anchoCajon: 30, ladoCajon: 'der' },
    ] }
    const catalogo = generarDespiece(paramsParaDespiece(f)).piezas.map((p, i) => ({ ...p, codigo: `CUSTOM_${i}` }))
    const modelo = crearModeloMueble(f, catalogo)
    assert.deepEqual(modelo.avisos, [])
    assert.equal(modelo.piezas.length, catalogo.reduce((s, p) => s + p.cantidad, 0))
    assert.equal(new Set(modelo.piezas.map((p) => p.id)).size, modelo.piezas.length)
    for (const p of catalogo) {
      const solidos = modelo.piezas.filter((s) => s.codigo === p.codigo)
      assert.equal(solidos.length, p.cantidad)
      for (const s of solidos) {
        assert.deepEqual([...s.dimensiones].sort((a, b) => a - b), [p.ancho, p.alto, f.espesor].sort((a, b) => a - b))
        assert.ok([...s.posicion, ...s.dimensiones, ...posicionModelo(s, modelo, 1)].every(Number.isFinite))
        assert.ok(s.dimensiones.every((n) => n > 0))
      }
    }
  }
})

test('3D: cambios de altura afectan montaje; cambios de despiece invalidan la vista', () => {
  const modelo = crearModeloMueble(base)
  const modificado = crearModeloMueble({ ...base, modulos: [{ ...base.modulos[0], alturas: [80, 130] }] })
  assert.equal(modificado.piezas.find((p) => p.nombre === 'Entrepaño').posicion[1] - modelo.piezas.find((p) => p.nombre === 'Entrepaño').posicion[1], 100)
  assert.deepEqual(modelo.piezas.map((p) => p.dimensiones), modificado.piezas.map((p) => p.dimensiones))
  const piezas = generarDespiece(paramsParaDespiece(base)).piezas
  assert.equal(crearModeloMueble(base, piezas.map((p, i) => i ? p : { ...p, ancho: p.ancho + 10 })).piezas.length, 0)
  assert.equal(crearModeloMueble(null).piezas.length, 0)
  assert.equal(crearModeloMueble({ ...base, ancho: '' }).piezas.length, 0)
  assert.equal(crearModeloMueble({ ...base, modulos: [{ ...nuevoModulo(), alturas: [900] }] }).piezas.length, 0)
})

test('3D: rayos seleccionan la superficie más cercana y descartan piezas detrás de la cámara', () => {
  assert.equal(intersectarCaja([0, 0, 5], [0, 0, -1], [0, 0, 0], [2, 2, 2]), 4)
  assert.equal(intersectarCaja([2, 0, 5], [0, 0, -1], [0, 0, 0], [2, 2, 2]), null)
  assert.equal(intersectarCaja([0, 0, 5], [0, 0, 1], [0, 0, 0], [2, 2, 2]), null)
  assert.equal(intersectarCaja([0, 0, 0], [0, 1, 0], [0, 0, 0], [2, 2, 2]), 0)
})

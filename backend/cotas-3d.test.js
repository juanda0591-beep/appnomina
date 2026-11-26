import test from 'node:test'
import assert from 'node:assert/strict'
import { crearCotasTablero, proyectarPunto3D } from '../src/utils/cotas3D.js'
import { dimensionesTablero } from '../src/utils/piezasManuales.js'

test('cotas 3D: proyección en píxeles CSS y descarte detrás de la cámara', () => {
  const camara = { ojo: [0, 0, 5], atras: [0, 0, 1], derecha: [1, 0, 0], arriba: [0, 1, 0], tan: 1, aspecto: 2 }
  const limites = { min: [0, 0, 0], max: [2000, 1000, 500] }
  assert.deepEqual(proyectarPunto3D([1000, 500, 250], limites, camara, 800, 400), [400, 200])
  const derecha = proyectarPunto3D([2000, 500, 250], limites, camara, 800, 400)
  assert.ok(Math.abs(derecha[0] - 440) < 1e-8); assert.equal(derecha[1], 200)
  assert.equal(proyectarPunto3D([1000, 500, 6250], limites, camara, 800, 400), null)
})

test('cotas 3D: medidas de corte constantes en las seis orientaciones y etiquetas sin cruces en móvil', () => {
  for (const plano of ['frente', 'lateral', 'horizontal']) for (const giro of [0, 90]) {
    const pieza = { origen: [0, 0, 0], plano, giro, ancho: 500, alto: 1800, espesor: 18 }
    pieza.dimensiones = dimensionesTablero(pieza, 18, pieza)
    const cotas = crearCotasTablero(pieza, ([x, y, z]) => [100 + x * .07 + z * .04, 300 - y * .1 - z * .025], 350, 400)
    assert.deepEqual(cotas.map((c) => c.etiqueta.texto), ['Ancho 50 cm', 'Largo 180 cm', 'Espesor 18 mm'])
    for (const c of cotas) {
      const e = c.etiqueta
      assert.ok(e.x >= 0 && e.x + e.w <= 350 && e.y >= 0 && e.y + e.h <= 400)
      assert.ok(c.lineas.flat(2).every(Number.isFinite))
      for (const otro of cotas.filter((o) => o !== c)) {
        const b = otro.etiqueta
        assert.ok(e.x + e.w <= b.x || b.x + b.w <= e.x || e.y + e.h <= b.y || b.y + b.h <= e.y, `${plano}/${giro}: etiquetas separadas`)
      }
    }
  }
  assert.deepEqual(crearCotasTablero(null, () => [0, 0], 350, 400), [])
  assert.deepEqual(crearCotasTablero({ origen: [0, 0, 0], dimensiones: [500, 1800, 18], plano: 'frente' }, () => null, 350, 400), [])
})

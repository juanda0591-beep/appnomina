import test from 'node:test'
import assert from 'node:assert/strict'
import { configurarDiseno, construirMueble } from '../src/utils/construccionMueble.js'
import { generarDespiece, paramsParaDespiece, nuevoModulo } from '../src/utils/despiece.js'
import { crearModeloMueble } from '../src/utils/modeloMueble.js'
import { vistasMueble } from '../src/utils/vistasMueble.js'
import { validarProyecto, proyectoVacio } from '../src/utils/proyectoCorte.js'

const base = () => configurarDiseno({ ancho: 120, alto: 180, fondo: 60, espesor: 18, gap: 3, holguraFondo: 10,
  armado: 'laterales-completos', tipoFondo: 'superpuesto', modulos: [nuevoModulo()] })
const conCajones = () => {
  const f = base(); f.modulos[0] = { ...f.modulos[0], cajones: 2, zonaCajones: 50,
    configuracionCajon: { ...f.modulos[0].configuracionCajon, inicio: 20, profundidad: 50 } }
  return f
}
const obtener = (f) => { const c = construirMueble(f); assert.deepEqual(c.avisos, []); return c }
const pieza = (c, nombre) => c.piezas.find((p) => p.nombre === nombre)
const seSolapan = (a, b) => [0, 1, 2].every((i) => Math.min(a.origen[i] + a.dimensiones[i], b.origen[i] + b.dimensiones[i]) - Math.max(a.origen[i], b.origen[i]) > .05)

test('construcción: vuelos independientes cambian corte, montaje y límites exteriores', () => {
  const f = base()
  f.techo = { montaje: 'cubre', izquierda: 20, derecha: 30, frente: 40, atras: 10 }
  f.piso = { montaje: 'entre', izquierda: 0, derecha: 0, frente: 15, atras: 0 }
  const c = obtener(f)
  assert.equal(pieza(c, 'Techo').ancho, 1250)
  assert.equal(pieza(c, 'Techo').alto, 650)
  assert.equal(pieza(c, 'Piso').ancho, 1164)
  assert.equal(pieza(c, 'Piso').alto, 615)
  assert.equal(pieza(c, 'Lateral').alto, 1782)
  assert.deepEqual(c.paneles.find((p) => p.nombre === 'Techo').origen, [-20, 1782, -10])
  const modelo = crearModeloMueble(f)
  assert.equal(modelo.envolvente[0], 1250)
  assert.equal(vistasMueble(f)[0].ancho, 1250)
  assert.equal(generarDespiece(paramsParaDespiece(f)).piezas.find((p) => p.nombre === 'Techo').ancho, 1250)
  assert.ok(construirMueble({ ...f, techo: { ...f.techo, montaje: 'entre' } }).avisos.length)
})

test('cajones: riel y holgura afectan la caja sin alterar el frente decorativo', () => {
  const f = conCajones(), sin = obtener(f)
  const c = f.modulos[0].configuracionCajon
  f.modulos[0].configuracionCajon = { ...c, riel: 'lateral', holguraLateral: 12.5, largoRiel: 500 }
  const con = obtener(f)
  assert.equal(sin.modulos[0].caja.ancho, 1160)
  assert.equal(con.modulos[0].caja.ancho, 1139)
  assert.equal(pieza(sin, 'Frente cajón').ancho, pieza(con, 'Frente cajón').ancho)
  assert.equal(pieza(sin, 'Trasera cajón').ancho - pieza(con, 'Trasera cajón').ancho, 21)
  assert.equal(con.herrajes.length, 4)
  assert.equal(con.paneles.filter((p) => p.grupo === 'cajones').length, 10)
  assert.equal(con.paneles.filter((p) => p.nombre === 'Puerta').length, 2, 'Huecos arriba y abajo de cajonera')
  assert.equal(pieza(con, 'Contrafrente cajón').cantidad, 2)
  for (let i = 0; i < con.paneles.length; i++) for (let j = i + 1; j < con.paneles.length; j++) {
    assert.ok(!seSolapan(con.paneles[i], con.paneles[j]), `${con.paneles[i].nombre} intersecta ${con.paneles[j].nombre}`)
  }
  assert.equal(pieza(con, 'Costado cajón').ancho, 500)
  f.modulos[0].configuracionCajon = { ...f.modulos[0].configuracionCajon, fondoMontaje: 'debajo' }
  const debajo = obtener(f)
  assert.equal(pieza(debajo, 'Fondo cajón').ancho, con.modulos[0].caja.ancho)
  assert.equal(pieza(con, 'Costado cajón').alto - pieza(debajo, 'Costado cajón').alto, 18)
})

test('módulos: anchos variables, cajonera parcial, entrepaños y posición conservan coherencia', () => {
  const f = conCajones()
  f.modulos.push(configurarDiseno({ ...f, modulos: [nuevoModulo()] }).modulos[0])
  f.modulos[0].anchoModulo = 65
  f.modulos[0].anchoCajon = 30; f.modulos[0].ladoCajon = 'der'; f.modulos[0].alturas = [45, 95]
  const c = obtener(f)
  assert.equal(c.modulos[0].ancho, 650); assert.equal(c.modulos[1].ancho, 496)
  assert.equal(pieza(c, 'Entrepaño').ancho, 332)
  const caja = c.paneles.find((p) => p.nombre === 'Frente cajón')
  const mod = c.modulos[0]
  assert.equal(caja.origen[0], mod.x + mod.ancho - 300 + 3)
  f.modulos[0].configuracionCajon.inicio = 35
  const movido = obtener(f).paneles.find((p) => p.nombre === 'Frente cajón')
  assert.equal(movido.origen[1] - caja.origen[1], 150)
  assert.deepEqual(movido.dimensiones, caja.dimensiones)
})

test('validación: no infiere holguras de herrajes y rechaza cajones y medidas imposibles', () => {
  for (const cambiar of [
    (f) => { f.modulos[0].configuracionCajon = { ...f.modulos[0].configuracionCajon, riel: 'lateral', holguraLateral: '', largoRiel: 500 } },
    (f) => { f.modulos[0].configuracionCajon.largoRiel = 700; f.modulos[0].configuracionCajon.riel = 'oculto' },
    (f) => { f.modulos[0].configuracionCajon.inicio = 160 },
    (f) => { f.modulos[0].configuracionCajon.profundidad = 70 },
    (f) => { f.modulos[0].alturas = [30] },
    (f) => { f.modulos[0].anchoModulo = 200 },
    (f) => { f.piso.frente = -1 },
    (f) => { f.modulos[0].cajones = 1.5 },
  ]) {
    const f = conCajones(); cambiar(f)
    assert.ok(construirMueble(f).avisos.length)
    assert.equal(crearModeloMueble(f).piezas.length, 0)
    assert.equal(generarDespiece(paramsParaDespiece(f)).piezas.length, 0)
  }
})

test('versionado: configuración completa se valida y no altera diseños antiguos', () => {
  const antiguo = { ...base(), construccionVersion: undefined }
  const antes = generarDespiece(paramsParaDespiece(antiguo))
  const nuevo = conCajones(), c = obtener(nuevo)
  const proyecto = validarProyecto({ ...proyectoVacio(), diseno: nuevo, piezas: c.piezas })
  assert.equal(proyecto.diseno.modulos[0].configuracionCajon.inicio, 20)
  assert.deepEqual(generarDespiece(paramsParaDespiece(antiguo)), antes)
  assert.throws(() => validarProyecto({ ...proyecto, diseno: { ...nuevo, techo: { ...nuevo.techo, frente: 30 } } }), /coincide/)
  assert.equal(crearModeloMueble(nuevo, c.piezas).piezas.length, c.paneles.length)
})

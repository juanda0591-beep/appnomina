import { validarPiezas } from './proyectoCorte.js'
import { validarMontaje, dimensionesTablero, modeloPiezasManuales } from './piezasManuales.js'

const red = (n) => Math.round(n * 100) / 100
export const idTablero = (m) => `${m.codigo}-${m.unidad}`
const codigoNuevo = (piezas) => {
  let n = 1
  while (piezas.some((p) => p.codigo === `P${String(n).padStart(3, '0')}`)) n++
  return `P${String(n).padStart(3, '0')}`
}
function finalizar(p, piezas, montajeManual) {
  if (p.diseno) throw new Error('Crea un proyecto independiente para diseñar libremente. Este proyecto conserva su generador por medidas.')
  if (piezas.length) {
    validarPiezas(piezas)
    if (piezas.reduce((s, pi) => s + Number(pi.cantidad), 0) * Number(p.unidades) > 1000) throw new Error('El lote no puede superar 1000 piezas.')
  }
  return { ...p, diseno: null, disenoLibre: true, piezas, montajeManual: validarMontaje(montajeManual, piezas) }
}
export function buscarTablero(p, id) {
  const lugar = (p.montajeManual || []).find((m) => idTablero(m) === id)
  const pieza = lugar && p.piezas.find((pi) => pi.codigo === lugar.codigo)
  if (!pieza) throw new Error('Selecciona un tablero ubicado en el diseño.')
  return { lugar, pieza, dimensiones: dimensionesTablero(pieza, p.lamina.espesor, lugar) }
}
export function agregarTablero(p, datos) {
  const codigo = codigoNuevo(p.piezas)
  const pieza = { codigo, nombre: datos.nombre, ancho: Number(datos.ancho), alto: Number(datos.alto), espesor: Number(datos.espesor), cantidad: 1, permiteRotar: datos.permiteRotar !== false, canto: datos.canto || '' }
  const lugar = { codigo, unidad: 1, plano: datos.plano || 'frente', giro: datos.giro || 0, x: Number(datos.x ?? 0), y: Number(datos.y ?? 0), z: Number(datos.z ?? 0) }
  return { proyecto: finalizar(p, [...p.piezas, pieza], [...p.montajeManual || [], lugar]), id: `${codigo}-1` }
}
export function editarTablero(p, id, datos) {
  const { lugar, pieza } = buscarTablero(p, id)
  const nueva = { ...pieza, ...Object.fromEntries(['nombre', 'ancho', 'alto', 'espesor', 'canto', 'permiteRotar'].filter((k) => datos[k] !== undefined).map((k) => [k, datos[k]])) }
  const posicion = { ...lugar, ...Object.fromEntries(['plano', 'giro', 'x', 'y', 'z'].filter((k) => datos[k] !== undefined).map((k) => [k, datos[k]])) }
  return finalizar(p, p.piezas.map((pi) => pi === pieza ? nueva : pi), p.montajeManual.map((m) => m === lugar ? posicion : m))
}
export function duplicarTablero(p, id, eje, distancia) {
  const { lugar, pieza } = buscarTablero(p, id)
  if (!['x', 'y', 'z'].includes(eje) || !Number.isFinite(distancia) || Math.abs(distancia) > 100000) throw new Error('Desplazamiento de copia no válido.')
  return agregarTablero(p, { ...pieza, ...lugar, nombre: `${pieza.nombre.slice(0, 110)} copia`, [eje]: red(lugar[eje] + distancia) })
}
export function eliminarTablero(p, id) {
  const { lugar, pieza } = buscarTablero(p, id)
  const piezas = pieza.cantidad === 1 ? p.piezas.filter((pi) => pi !== pieza) : p.piezas.map((pi) => pi === pieza ? { ...pi, cantidad: pi.cantidad - 1 } : pi)
  const montaje = p.montajeManual.filter((m) => m !== lugar).map((m) => m.codigo === pieza.codigo && m.unidad > lugar.unidad ? { ...m, unidad: m.unidad - 1 } : m)
  return finalizar(p, piezas, montaje)
}
export function ubicarPendientes(p) {
  const montaje = [...p.montajeManual || []], ids = new Set(montaje.map(idTablero))
  let x = montaje.length ? Math.max(...modeloPiezasManuales(p.piezas, p.lamina.espesor, montaje, 'montaje').piezas.map((pi) => pi.origen[0] + pi.dimensiones[0])) + 100 : 0
  for (const pi of p.piezas) for (let n = 1; n <= pi.cantidad; n++) {
    if (ids.has(`${pi.codigo}-${n}`)) continue
    montaje.push({ codigo: pi.codigo, unidad: n, plano: 'frente', x, y: 0, z: 0 })
    x += Number(pi.ancho) + 100
  }
  return finalizar(p, p.piezas, montaje)
}
export function girarTablero(p, id, eje) {
  const { lugar, dimensiones } = buscarTablero(p, id)
  const ordenes = { frente: ['a', 'h', 'e'], lateral: ['e', 'h', 'a'], horizontal: ['a', 'e', 'h'] }
  let orden = ordenes[lugar.plano].map((s) => lugar.giro === 90 ? ({ a: 'h', h: 'a', e: 'e' })[s] : s)
  const indices = { x: [1, 2], y: [0, 2], z: [0, 1] }[eje]
  if (!indices) throw new Error('Eje de giro no válido.')
  const [a, b] = indices; [orden[a], orden[b]] = [orden[b], orden[a]]
  let orientacion
  for (const [plano, base] of Object.entries(ordenes)) for (const giro of [0, 90]) {
    const variante = base.map((s) => giro ? ({ a: 'h', h: 'a', e: 'e' })[s] : s)
    if (variante.join() === orden.join()) orientacion = { plano, giro }
  }
  const { pieza } = buscarTablero(p, id), nuevas = dimensionesTablero(pieza, p.lamina.espesor, orientacion)
  const posicion = Object.fromEntries(['x', 'y', 'z'].map((e, i) => [e, red(lugar[e] + (dimensiones[i] - nuevas[i]) / 2)]))
  return editarTablero(p, id, { ...orientacion, ...posicion })
}
export function ajustarArrastre(p, id, origen, { eje = 'libre', paso = 10, caras = true, tolerancia = 12 } = {}) {
  const { lugar, dimensiones } = buscarTablero(p, id)
  const otros = caras ? modeloPiezasManuales(p.piezas, p.lamina.espesor, p.montajeManual, 'montaje').piezas.filter((pi) => pi.id !== id) : []
  const posicion = origen.map((v, i) => {
    if (!Number.isFinite(v)) throw new Error('Posición no válida.')
    if (eje !== 'libre' && eje !== ['x', 'y', 'z'][i]) return lugar[['x', 'y', 'z'][i]]
    let valor = paso > 0 ? Math.round(v / paso) * paso : v
    let mejor = tolerancia + 1
    if (caras) {
      const candidatos = [0]
      for (const pi of otros) {
        if (!pi.origen.every((n, k) => k === i || (n <= origen[k] + dimensiones[k] + tolerancia && n + pi.dimensiones[k] >= origen[k] - tolerancia))) continue
        for (const cara of [pi.origen[i], pi.origen[i] + pi.dimensiones[i]]) candidatos.push(cara, cara - dimensiones[i])
      }
      for (const c of candidatos) if (Math.abs(c - v) <= tolerancia && Math.abs(c - v) < mejor) { valor = c; mejor = Math.abs(c - v) }
    }
    return red(valor)
  })
  if (posicion.some((v) => Math.abs(v) > 100000)) throw new Error('La posición debe estar entre -100000 y 100000 mm.')
  return posicion
}
export function alinearTablero(p, id, referencia, eje, ajuste) {
  if (id === referencia) throw new Error('Selecciona otro tablero como referencia.')
  const a = buscarTablero(p, id), b = buscarTablero(p, referencia), i = ['x', 'y', 'z'].indexOf(eje)
  if (i < 0) throw new Error('Eje de alineación no válido.')
  const inicio = b.lugar[eje], largo = b.dimensiones[i], propio = a.dimensiones[i]
  const opciones = { inicio, centro: inicio + (largo - propio) / 2, final: inicio + largo - propio, antes: inicio - propio, despues: inicio + largo }
  if (!Object.hasOwn(opciones, ajuste)) throw new Error('Alineación no válida.')
  return editarTablero(p, id, { [eje]: red(opciones[ajuste]) })
}

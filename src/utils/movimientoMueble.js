import { posicionModelo } from './modeloMueble.js'

export function rotarY(v, angulo) {
  const c = Math.cos(angulo), s = Math.sin(angulo)
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]
}

export function transformarPieza(pieza, modelo, explosion = 0, apertura = 0) {
  const posicion = posicionModelo(pieza, modelo, explosion), mov = pieza.movimiento
  if (!mov || !apertura) return { posicion, angulo: 0 }
  if (mov.tipo === 'deslizarZ' || mov.tipo === 'deslizarX') {
    const p = [...posicion]; p[mov.tipo === 'deslizarZ' ? 2 : 0] += mov.recorrido * apertura / 1000
    return { posicion: p, angulo: 0 }
  }
  const angulo = mov.angulo * Math.PI / 180 * apertura
  const pivote = posicionModelo({ ...pieza, posicion: mov.pivote }, modelo, explosion)
  const local = rotarY(posicion.map((n, i) => n - pivote[i]), angulo)
  return { posicion: local.map((n, i) => n + pivote[i]), angulo }
}

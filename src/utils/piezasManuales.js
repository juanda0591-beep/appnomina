export function desplazarOrigen(origen, eje, distancia) {
  if (!['x', 'y', 'z'].includes(eje) || !Number.isFinite(distancia) || !Array.isArray(origen) || origen.length !== 3 || !origen.every(Number.isFinite)) throw new Error('Movimiento no válido.')
  const nueva = origen.map((v, i) => Math.round((v + (i === ['x', 'y', 'z'].indexOf(eje) ? distancia : 0)) * 100) / 100)
  if (!nueva.every((v) => Number.isFinite(v) && Math.abs(v) <= 100000)) throw new Error('La posición debe estar entre -100000 y 100000 mm.')
  return nueva
}

export function desplazarMontaje(montaje, piezas, id, eje, distancia) {
  const ubicacion = montaje.find((p) => `${p.codigo}-${p.unidad}` === id)
  if (!ubicacion) throw new Error('Primero define la ubicación de esta pieza.')
  const [x, y, z] = desplazarOrigen([ubicacion.x, ubicacion.y, ubicacion.z], eje, distancia)
  return validarMontaje(montaje.map((p) => p === ubicacion ? { ...p, x, y, z } : p), piezas)
}

// Cada ubicación corresponde a una unidad, no al tipo entero de pieza.
export function validarMontaje(montaje, piezas) {
  if (montaje == null) return []
  if (!Array.isArray(montaje) || montaje.length > 1000) throw new Error('Montaje no válido: máximo 1000 ubicaciones.')
  const ids = new Set()
  return montaje.map((p) => {
    const tipo = piezas.find((t) => t.codigo === p?.codigo)
    if (!tipo || !Number.isInteger(p.unidad) || p.unidad < 1 || p.unidad > tipo.cantidad) throw new Error('El montaje contiene una pieza que ya no existe.')
    const id = `${p.codigo}-${p.unidad}`
    if (ids.has(id)) throw new Error('Una pieza tiene dos posiciones de montaje.')
    ids.add(id)
    if (!['frente', 'lateral', 'horizontal'].includes(p.plano)) throw new Error('Orientación de pieza no válida.')
    if (p.giro != null && ![0, 90].includes(p.giro)) throw new Error('El giro del tablero debe ser 0 o 90 grados.')
    if (![p.x, p.y, p.z].every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 100000)) throw new Error('La posición debe estar en mm entre -100000 y 100000.')
    return { codigo: p.codigo, unidad: p.unidad, plano: p.plano, x: p.x, y: p.y, z: p.z, ...(p.giro ? { giro: p.giro } : {}) }
  })
}

export function dimensionesTablero(pieza, espesorBase, lugar = {}) {
  const e = Number(pieza.espesor ?? espesorBase)
  const [ancho, alto] = lugar.giro === 90 ? [Number(pieza.alto), Number(pieza.ancho)] : [Number(pieza.ancho), Number(pieza.alto)]
  return lugar.plano === 'lateral' ? [e, alto, ancho] : lugar.plano === 'horizontal' ? [ancho, e, alto] : [ancho, alto, e]
}

export function modeloPiezasManuales(piezas, espesorBase, montaje = [], modo = 'piezas', seleccion = null) {
  const validas = piezas.slice(0, 1000).filter((p) => p.nombre?.trim() && [p.ancho, p.alto].every((v) => Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) <= 100000)
    && Number.isInteger(Number(p.cantidad)) && p.cantidad > 0 && p.cantidad <= 1000)
  const piezasModelo = [], faltantes = []
  let cursor = 0
  for (const p of validas) {
    const e = Number(p.espesor ?? espesorBase)
    if (!(e > 0) || !Number.isFinite(e)) { faltantes.push(`${p.codigo}: falta espesor`); continue }
    const veces = modo === 'montaje' ? p.cantidad : 1
    for (let unidad = 1; unidad <= veces; unidad++) {
      if (piezasModelo.length >= 1000) { faltantes.push('Límite de 1000 piezas alcanzado'); break }
      const lugar = montaje.find((m) => m.codigo === p.codigo && m.unidad === unidad)
      if (modo === 'montaje' && !lugar) { faltantes.push(`${p.codigo}-${unidad}`); continue }
      if (modo === 'individual' && seleccion && p.codigo !== seleccion) continue
      const plano = modo === 'montaje' ? lugar.plano : 'frente'
      const ancho = Number(p.ancho), alto = Number(p.alto)
      const dimensiones = dimensionesTablero(p, espesorBase, modo === 'montaje' ? lugar : { plano })
      const origen = modo === 'montaje' ? [lugar.x, lugar.y, lugar.z] : [cursor, 0, 0]
      piezasModelo.push({ id: `${p.codigo}-${unidad}`, codigo: p.codigo, nombre: p.nombre, ancho, alto, espesor: e, dimensiones, origen,
        giro: modo === 'montaje' ? lugar.giro || 0 : 0,
        posicion: dimensiones.map((d, i) => origen[i] + d / 2), plano, grupo: 'manual', modulo: null, separar: [0, 0, 0], permiteRotar: p.permiteRotar })
      if (modo !== 'montaje') cursor += ancho + Math.max(60, ancho * .1)
    }
  }
  const min = [0, 0, 0], max = [1, 1, 1]
  for (const p of piezasModelo) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p.origen[i]); max[i] = Math.max(max[i], p.origen[i] + p.dimensiones[i]) }
  return { piezas: piezasModelo, avisos: [], faltantes, ancho: max[0] - min[0], alto: max[1] - min[1], fondo: max[2] - min[2],
    limites: { min, max }, envolvente: max.map((v, i) => v - min[i]) }
}

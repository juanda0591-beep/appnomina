// Generador paramétrico de despiece de muebles en melamina.
// Función pura: recibe medidas + configuración POR MÓDULO y devuelve la lista de
// piezas (agrupadas por medida) lista para la tabla de Cortes y Planos.
//
// Cada módulo (columna) se configura aparte: sus entrepaños pueden ir a alturas
// distintas y puede llevar cajones abajo (lo que acorta la puerta de ese módulo).
// La ALTURA de un entrepaño no cambia el tamaño de la pieza (sí el dibujo); solo
// cuenta cuántos hay. Veta: caras vistas => fija; piezas internas => libre.

const num = (v, def = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

// Un módulo nuevo por defecto: 1 puerta, sin entrepaños ni cajones.
// `alturas` = posiciones de los entrepaños (mm desde el piso interior).
// `anchoCajon` = ancho de la columna de cajones (mm). 0 = todo el ancho del
//   módulo (puerta acortada encima). Si es menor, los cajones ocupan solo esa
//   columna a un lado (`ladoCajon`) y la puerta va al lado a altura completa.
export const nuevoModulo = () => ({
  puerta: 'una', alturas: [], cajones: 0, zonaCajones: 0, anchoCajon: 0, ladoCajon: 'izq',
})

export function generarDespiece(params) {
  const An = num(params.ancho), Al = num(params.alto), Pr = num(params.fondo)
  const E = num(params.espesor, 18)
  const gap = num(params.gap, 3)
  const holguraFondo = num(params.holguraFondo, 10)
  const armado = params.armado || 'laterales-completos'
  const tipoFondo = params.tipoFondo || 'superpuesto'
  const modulos = Array.isArray(params.modulos) && params.modulos.length ? params.modulos : [{}]
  const nMod = modulos.length

  const avisos = []
  if (An <= 0 || Al <= 0 || Pr <= 0) {
    return { piezas: [], avisos: ['Indica ancho, alto y fondo mayores a 0.'] }
  }

  const acc = new Map()
  const add = (nombre, ancho, alto, cant, rota, canto = '') => {
    const a = Math.round(ancho), b = Math.round(alto)
    if (cant <= 0 || a <= 0 || b <= 0) return
    const key = `${nombre}|${a}|${b}|${rota ? 1 : 0}`
    const ex = acc.get(key)
    if (ex) ex.cantidad += cant
    else acc.set(key, { nombre, ancho: a, alto: b, cantidad: cant, permiteRotar: rota, canto })
  }

  carcasa({ add, An, Al, Pr, E, nMod, armado, tipoFondo })
  interiorYFrentes({ add, avisos, An, Al, Pr, E, nMod, modulos, gap, holguraFondo })
  return { piezas: [...acc.values()], avisos }
}

function carcasa({ add, An, Al, Pr, E, nMod, armado, tipoFondo }) {
  if (armado === 'techo-piso-cubren') {
    add('Lateral', Pr, Al - 2 * E, 2, false)
    add('Techo', An, Pr, 1, true)
    add('Piso', An, Pr, 1, true)
  } else {
    add('Lateral', Pr, Al, 2, false)
    add('Techo', An - 2 * E, Pr, 1, true)
    add('Piso', An - 2 * E, Pr, 1, true)
  }
  if (nMod > 1) add('División vertical', Pr, Al - 2 * E, nMod - 1, false)
  if (tipoFondo === 'superpuesto') add('Fondo', An, Al, 1, true)
  else if (tipoFondo === 'interno') add('Fondo', An - 2 * E, Al - 2 * E, 1, true)
}

// Ancho útil interior de cada módulo (todos iguales; se reparte el ancho).
export function anchoModulo(An, E, nMod) {
  return (An - 2 * E - (nMod - 1) * E) / nMod
}

function interiorYFrentes({ add, avisos, An, Al, Pr, E, nMod, modulos, gap, holguraFondo }) {
  const anchoMod = anchoModulo(An, E, nMod)
  if (anchoMod <= 0) {
    avisos.push('El ancho no alcanza para tantos módulos: reduce el número de columnas.')
    return
  }
  const fondoEntre = Math.max(1, Pr - holguraFondo)
  const altoInterior = Al - 2 * E

  modulos.forEach((m, idx) => {
    const nEntre = Math.max(0, Math.round(num(m.entrepanos, 0)))
    const nCaj = Math.max(0, Math.round(num(m.cajones, 0)))
    const zonaCaj = num(m.zonaCajones, 0)
    const puerta = m.puerta || 'ninguna' // 'ninguna' | 'una' | 'dos'
    const anchoCaj = num(m.anchoCajon, 0)
    // Cajón parcial: ocupa solo una columna del módulo; la puerta va al lado.
    const cajonParcial = nCaj > 0 && zonaCaj > 0 && anchoCaj > 0 && anchoCaj < anchoMod
    const anchoColCaj = cajonParcial ? anchoCaj : anchoMod
    // Ancho que le queda a la puerta (todo el módulo, o lo que sobra del cajón).
    const anchoPuertaCol = cajonParcial ? anchoMod - anchoCaj - E : anchoMod

    if (nEntre > 0) add('Entrepaño', anchoMod, fondoEntre, nEntre, true)

    // Puerta(s) del módulo.
    if (puerta !== 'ninguna') {
      // Con cajón a todo el ancho, la puerta se acorta; con cajón parcial, va completa.
      const hDisponible = (nCaj > 0 && !cajonParcial) ? altoInterior - zonaCaj : altoInterior
      const altoP = hDisponible - 2 * gap
      const hojas = puerta === 'dos' ? 2 : 1
      const anchoP = (anchoPuertaCol - (hojas + 1) * gap) / hojas
      if (altoP > 0 && anchoP > 0) add('Puerta', anchoP, altoP, hojas, false)
      else avisos.push(`Módulo ${idx + 1}: la puerta no cabe con esas holguras.`)
    }

    // División interna cuando el cajón es parcial (separa cajón y puerta).
    if (cajonParcial) add('División cajón', fondoEntre, altoInterior, 1, false)

    // Cajones del módulo (caja simple de 5 piezas c/u).
    if (nCaj > 0 && zonaCaj > 0) {
      cajonesModulo({ add, avisos, idx, anchoCol: anchoColCaj, fondoEntre, E, gap, nCaj, zonaCaj })
    }
  })
}

function cajonesModulo({ add, avisos, idx, anchoCol, fondoEntre, E, gap, nCaj, zonaCaj }) {
  const altoFrente = zonaCaj / nCaj - gap
  const anchoFrente = anchoCol - 2 * gap
  if (altoFrente <= 0 || anchoFrente <= 0) {
    avisos.push(`Módulo ${idx + 1}: los cajones no caben en su zona.`)
    return
  }
  const altoCaja = Math.max(1, altoFrente - 2 * gap)
  const anchoTrasera = Math.max(1, anchoFrente - 4 * E)
  add('Frente cajón', anchoFrente, altoFrente, nCaj, false)
  add('Costado cajón', fondoEntre, altoCaja, nCaj * 2, false)
  add('Trasera cajón', anchoTrasera, altoCaja, nCaj, true)
  add('Fondo cajón', anchoTrasera, fondoEntre, nCaj, true)
}

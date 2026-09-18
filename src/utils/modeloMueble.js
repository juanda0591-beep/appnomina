import { generarDespiece, paramsParaDespiece, anchoModulo } from './despiece.js'
import { construirMueble } from './construccionMueble.js'

// Las dimensiones de cada sólido se toman del despiece canónico. Este módulo
// añade posición y orientación de montaje, sin modificar las medidas de corte.
// Ejes: X izquierda/derecha, Y altura, Z trasera/frente. Unidad: milímetro.
export function crearModeloMueble(diseno, piezasGuardadas) {
  if (!diseno) return { piezas: [], avisos: ['Genera el mueble por medidas para visualizar su ensamblaje.'] }
  if (diseno.construccionVersion === 2) {
    const c = construirMueble(diseno)
    if (c.avisos.length) return { piezas: [], avisos: c.avisos }
    const vinculos = new Map()
    for (const tipo of c.piezas) {
      const guardada = piezasGuardadas?.find((p) => p.nombre === tipo.nombre && Number(p.ancho) === tipo.ancho && Number(p.alto) === tipo.alto && Number(p.cantidad) === tipo.cantidad && Number(p.espesor || tipo.espesor || 0) === Number(tipo.espesor || 0))
      if (piezasGuardadas && !guardada) return { piezas: [], avisos: ['El despiece cambió. Genera de nuevo el diseño para ver el modelo.'] }
      vinculos.set(tipo.codigo, guardada?.codigo || tipo.codigo)
    }
    if (piezasGuardadas && piezasGuardadas.length !== c.piezas.length) return { piezas: [], avisos: ['El despiece no coincide con el modelo.'] }
    return { ...c, piezas: c.paneles.map((p) => ({ ...p, codigo: vinculos.get(p.codigo), id: p.id.replace(p.codigo, vinculos.get(p.codigo)) })),
      componentes: c.componentes?.map((p) => ({ ...p, codigo: vinculos.get(p.codigo), id: `PANEL:${p.padre}` })) }
  }
  let params
  try { params = paramsParaDespiece(diseno) }
  catch { return { piezas: [], avisos: ['Completa las medidas y módulos del mueble.'] } }
  const generado = generarDespiece(params)
  if (generado.avisos.length || !generado.piezas.length) return { piezas: [], avisos: generado.avisos }
  const { ancho: A, alto: H, fondo: D, espesor: E, gap, holguraFondo } = params
  if (!diseno.modulos.every((m) => m.alturas.every((a) => Number.isFinite(Number(a)) && Number(a) >= 0 && Number(a) * 10 <= H - 3 * E))) {
    return { piezas: [], avisos: ['Revisa las alturas de los entrepaños.'] }
  }
  const catalogo = generado.piezas.map((p, i) => {
    const guardada = piezasGuardadas?.find((g) => g.nombre === p.nombre && Number(g.ancho) === p.ancho && Number(g.alto) === p.alto && Number(g.cantidad) === p.cantidad)
    return { ...p, codigo: guardada?.codigo || `P${String(i + 1).padStart(3, '0')}`, usadas: 0 }
  })
  if (piezasGuardadas && (piezasGuardadas.length !== catalogo.length || catalogo.some((p) => !piezasGuardadas.some((g) => g.nombre === p.nombre && Number(g.ancho) === p.ancho && Number(g.alto) === p.alto && Number(g.cantidad) === p.cantidad)))) {
    return { piezas: [], avisos: ['El despiece cambió. Genera de nuevo el diseño para ver el modelo.'] }
  }
  const piezas = []
  const poner = (nombre, ancho, alto, plano, origen, grupo, modulo = null, separar = [0, 0, 0]) => {
    const p = catalogo.find((c) => c.nombre === nombre && c.ancho === Math.round(ancho) && c.alto === Math.round(alto) && c.usadas < c.cantidad)
    if (!p) throw new Error(`No se pudo vincular ${nombre} al despiece.`)
    p.usadas++
    const dimensiones = plano === 'frente' ? [p.ancho, p.alto, E] : plano === 'lateral' ? [E, p.alto, p.ancho] : [p.ancho, E, p.alto]
    const posicion = dimensiones.map((d, i) => origen[i] + d / 2)
    piezas.push({ id: `${p.codigo}-${p.usadas}`, codigo: p.codigo, nombre: p.nombre, ancho: p.ancho, alto: p.alto,
      espesor: E, dimensiones, posicion, plano, grupo, modulo, separar, permiteRotar: p.permiteRotar })
  }
  try {
    const cubren = params.armado === 'techo-piso-cubren', lateralH = H - (cubren ? 2 * E : 0), anchoT = A - (cubren ? 0 : 2 * E)
    poner('Lateral', D, lateralH, 'lateral', [0, cubren ? E : 0, 0], 'estructura', null, [-1, 0, 0])
    poner('Lateral', D, lateralH, 'lateral', [A - E, cubren ? E : 0, 0], 'estructura', null, [1, 0, 0])
    poner('Techo', anchoT, D, 'horizontal', [cubren ? 0 : E, H - E, 0], 'estructura', null, [0, 1, 0])
    poner('Piso', anchoT, D, 'horizontal', [cubren ? 0 : E, 0, 0], 'estructura', null, [0, -1, 0])
    const mw = anchoModulo(A, E, params.modulos.length)
    for (let i = 1; i < params.modulos.length; i++) poner('División vertical', D, H - 2 * E, 'lateral', [i * (mw + E), E, 0], 'estructura', i, [(i / params.modulos.length - .5) * 1.5, 0, -.35])
    if (params.tipoFondo === 'superpuesto') poner('Fondo', A, H, 'frente', [0, 0, -E], 'trasera', null, [0, 0, -1.2])
    else if (params.tipoFondo === 'interno') poner('Fondo', A - 2 * E, H - 2 * E, 'frente', [E, E, 0], 'trasera', null, [0, 0, -1.2])
    params.modulos.forEach((m, i) => {
      const x = E + i * (mw + E), interiorH = H - 2 * E, profundidad = D - holguraFondo
      const nCaj = Number(m.cajones), zona = Number(m.zonaCajones), parcial = nCaj > 0 && zona > 0 && m.anchoCajon > 0 && m.anchoCajon < mw
      const cajIzq = m.ladoCajon !== 'der', anchoCol = parcial ? m.anchoCajon : mw
      const anchoPuerta = parcial ? mw - anchoCol - E : mw
      const xCaj = parcial && !cajIzq ? x + mw - anchoCol : x
      const xPuerta = parcial && cajIzq ? x + anchoCol + E : x
      for (let k = 0; k < m.entrepanos; k++) poner('Entrepaño', mw, profundidad, 'horizontal', [x, Number(diseno.modulos[i].alturas[k]) * 10, holguraFondo], 'interior', i, [0, .15 + k * .2, .5])
      if (m.puerta !== 'ninguna') {
        const hojas = m.puerta === 'dos' ? 2 : 1, h = (nCaj > 0 && !parcial ? interiorH - zona : interiorH) - 2 * gap
        const w = (anchoPuerta - (hojas + 1) * gap) / hojas
        for (let j = 0; j < hojas; j++) poner('Puerta', w, h, 'frente', [xPuerta + gap + j * (Math.round(w) + gap), E + gap + (nCaj > 0 && !parcial ? zona : 0), D + gap], 'frentes', i, [hojas === 2 ? (j ? .35 : -.35) : 0, 0, 1.2])
      }
      if (parcial) poner('División cajón', profundidad, interiorH, 'lateral', [cajIzq ? x + anchoCol : xCaj - E, E, holguraFondo], 'interior', i, [0, 0, -.25])
      if (nCaj > 0 && zona > 0) {
        const hf = zona / nCaj - gap, wf = anchoCol - 2 * gap, hc = Math.max(1, hf - 2 * gap), wr = Math.max(1, wf - 4 * E)
        for (let j = 0; j < nCaj; j++) {
          const y = E + j * zona / nCaj + gap, cx = xCaj + gap, avance = .65 + j * .15
          poner('Frente cajón', wf, hf, 'frente', [cx, y, D + gap], 'frentes', i, [0, 0, 1.4 + j * .15])
          poner('Costado cajón', profundidad, hc, 'lateral', [cx + E, y + gap, holguraFondo], 'cajones', i, [-.35, 0, avance])
          poner('Costado cajón', profundidad, hc, 'lateral', [cx + wf - 2 * E, y + gap, holguraFondo], 'cajones', i, [.35, 0, avance])
          poner('Trasera cajón', wr, hc, 'frente', [cx + 2 * E, y + gap, holguraFondo], 'cajones', i, [0, 0, -.3])
          poner('Fondo cajón', wr, profundidad, 'horizontal', [cx + 2 * E, y + gap - E, holguraFondo], 'cajones', i, [0, -.3, avance])
        }
      }
    })
    if (catalogo.some((p) => p.usadas !== p.cantidad)) throw new Error('El modelo no representa todas las piezas del despiece.')
  } catch (e) { return { piezas: [], avisos: [e.message] } }
  return { piezas, avisos: [], ancho: A, alto: H, fondo: D, espesor: E }
}

export function posicionModelo(pieza, modelo, explosion = 0) {
  const medidas = modelo.envolvente || [modelo.ancho, modelo.alto, modelo.fondo]
  const centro = modelo.limites ? modelo.limites.min.map((n, i) => (n + modelo.limites.max[i]) / 2) : [modelo.ancho / 2, modelo.alto / 2, modelo.fondo / 2]
  const distancia = Math.max(...medidas) * .3 * explosion
  return pieza.posicion.map((p, i) => (p - centro[i] + pieza.separar[i] * distancia) / 1000)
}

export const ACABADOS_MUEBLE = [
  { id: 'blanco', nombre: 'Blanco mate', color: '#ecece5' },
  { id: 'roble', nombre: 'Roble claro', color: '#c7a06e', veta: true },
  { id: 'nogal', nombre: 'Nogal', color: '#78523a', veta: true },
  { id: 'grafito', nombre: 'Grafito', color: '#414d53' },
]

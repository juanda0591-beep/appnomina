import { anchoModulo } from './despiece.js'
import { construirMueble } from './construccionMueble.js'

// Geometria compartida por la vista tecnica y el PDF. Coordenadas en milimetros.
// La vista frontal muestra el interior; las proyecciones laterales no implican mecanizados.
export function vistasMueble(f) {
  if (!f) return []
  if (f.construccionVersion === 2) {
    const c = construirMueble(f)
    if (c.avisos.length) return []
    const { min, max } = c.limites
    const piezas = c.paneles.filter((p) => p.grupo !== 'frentes' && p.grupo !== 'trasera')
    const proyeccion = (nombre, ejeX, ejeY) => ({ nombre, ancho: max[ejeX] - min[ejeX], alto: max[ejeY] - min[ejeY],
      rectangulos: piezas.map((p) => ({ x: p.origen[ejeX] - min[ejeX], y: max[ejeY] - p.origen[ejeY] - p.dimensiones[ejeY],
        ancho: p.dimensiones[ejeX], alto: p.dimensiones[ejeY], oculta: p.grupo !== 'estructura' })) })
    return [proyeccion('Frontal - interior', 0, 1), proyeccion('Lateral derecho', 2, 1), proyeccion('Superior - estructura', 0, 2)]
  }
  const ancho = Number(f.ancho) * 10, alto = Number(f.alto) * 10, fondo = Number(f.fondo) * 10
  const e = Number(f.espesor), modulos = f.modulos || []
  if (![ancho, alto, fondo, e].every((n) => Number.isFinite(n) && n > 0) || !modulos.length || ancho <= 2 * e || alto <= 2 * e) return []
  const rect = (x, y, w, h, oculta = false) => ({ x, y, ancho: w, alto: h, oculta })
  const anchoMod = anchoModulo(ancho, e, modulos.length)
  if (anchoMod <= 0) return []
  const cubren = f.armado === 'techo-piso-cubren'
  const frontal = [
    rect(0, cubren ? e : 0, e, alto - (cubren ? 2 * e : 0)),
    rect(ancho - e, cubren ? e : 0, e, alto - (cubren ? 2 * e : 0)),
    rect(cubren ? 0 : e, 0, ancho - (cubren ? 0 : 2 * e), e),
    rect(cubren ? 0 : e, alto - e, ancho - (cubren ? 0 : 2 * e), e),
  ]
  const superior = [rect(0, 0, e, fondo), rect(ancho - e, 0, e, fondo)]
  const lateral = [rect(0, 0, fondo, e), rect(0, alto - e, fondo, e)]
  if (f.tipoFondo !== 'sin-fondo') superior.push(rect(0, fondo - e, ancho, e))
  for (let i = 0; i < modulos.length; i++) {
    const x = e + i * (anchoMod + e)
    if (i > 0) { frontal.push(rect(x - e, e, e, alto - 2 * e)); superior.push(rect(x - e, 0, e, fondo)) }
    for (const altura of modulos[i].alturas || []) {
      const y = alto - e - Number(altura) * 10
      if (y >= e && y + e <= alto - e) frontal.push(rect(x, y, anchoMod, e))
      if (i === modulos.length - 1 && y >= e && y + e <= alto - e) lateral.push(rect(0, y, Math.max(1, fondo - Number(f.holguraFondo || 0)), e, true))
    }
  }
  return [
    { nombre: 'Frontal - interior', ancho, alto, rectangulos: frontal },
    { nombre: 'Lateral derecho', ancho: fondo, alto, rectangulos: lateral },
    { nombre: 'Superior - estructura', ancho, alto: fondo, rectangulos: superior },
  ]
}

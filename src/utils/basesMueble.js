import { activarMDF } from './fabricacionMDF.js'
import { configurarDiseno } from './construccionMueble.js'
import { nuevoModulo } from './despiece.js'
import { herrajesModulo } from './herrajesMueble.js'

export const BASES_MUEBLE = [
  { id: 'armario-dos', nombre: 'Armario de dos cuerpos', tipo: 'armario', ancho: 120, alto: 200, fondo: 55, modulos: 2, detalle: 'Dos gavetas, maletero y tubo para ropa' },
  { id: 'armario-tres', nombre: 'Armario de tres cuerpos', tipo: 'armario', ancho: 180, alto: 210, fondo: 58, modulos: 3, detalle: 'Cajonera central, repisas y zona para colgar' },
  { id: 'ropero-abierto', nombre: 'Ropero abierto', tipo: 'armario', ancho: 120, alto: 180, fondo: 50, modulos: 2, detalle: 'Sin puertas, con tubo y repisas' },
  { id: 'zapatero', nombre: 'Zapatero con puertas', tipo: 'armario', ancho: 80, alto: 160, fondo: 35, modulos: 1, detalle: 'Cinco entrepaños y dos hojas' },
  { id: 'tocador-compacto', nombre: 'Tocador compacto', tipo: 'tocador', ancho: 90, alto: 78, fondo: 45, modulos: 1, detalle: 'Una gaveta superior y espejo fijo' },
  { id: 'tocador-doble', nombre: 'Tocador de doble cajonera', tipo: 'tocador', ancho: 120, alto: 80, fondo: 45, modulos: 3, detalle: 'Cajoneras laterales y espejo fijo' },
  { id: 'tocador-repisas', nombre: 'Tocador con repisas', tipo: 'tocador', ancho: 100, alto: 78, fondo: 42, modulos: 1, detalle: 'Gaveta, espejo y repisas superiores' },
  { id: 'tocador-mesa', nombre: 'Tocador tipo escritorio', tipo: 'tocador', ancho: 110, alto: 75, fondo: 50, modulos: 3, detalle: 'Cajoneras y espacio central, sin espejo' },
]
function tubo(altura, fondo) { return { id: 'colgador', tipo: 'redondo', altura, fondo, diametro: 25, descuento: 10, referencia: '' } }
function espejo(ancho, alto, x, y, z) { return { id: 'espejo-base', tipo: 'espejo', nombre: 'Espejo fijo', ancho, alto, espesor: 9,
  marco: 45, espesorEspejo: 3, x, y, z, apertura: 'fijo', recorrido: 0 } }
export function crearBaseMueble(id) {
  const base = BASES_MUEBLE.find((b) => b.id === id)
  if (!base) throw new Error('Base de mueble no disponible.')
  const f = activarMDF(configurarDiseno({ ancho: base.ancho, alto: base.alto, fondo: base.fondo, espesor: 9, gap: 3,
    holguraFondo: 10, armado: 'laterales-completos', tipoFondo: base.tipo === 'tocador' ? 'sin-fondo' : 'superpuesto',
    modulos: Array.from({ length: base.modulos }, nuevoModulo) }))
  for (const m of f.modulos) {
    m.herrajes = herrajesModulo()
    if (base.id !== 'ropero-abierto') m.herrajes.manija.tipo = 'barra'
    m.herrajes.bisagras.activo = base.tipo === 'armario' && base.id !== 'ropero-abierto'
    if (base.tipo === 'tocador') m.puerta = 'ninguna'
  }
  if (id === 'armario-dos') {
    Object.assign(f.modulos[0], { cajones: 2, zonaCajones: 50, alturas: [175] })
    f.modulos[1].alturas = [175]; f.modulos[1].herrajes.tubos = [tubo(150, 27)]
  } else if (id === 'armario-tres') {
    f.modulos[0].alturas = [185]; f.modulos[0].herrajes.tubos = [tubo(160, 29)]
    Object.assign(f.modulos[1], { cajones: 3, zonaCajones: 60, alturas: [120, 185] })
    f.modulos[2].alturas = [45, 90, 135, 185]
  } else if (id === 'ropero-abierto') {
    f.modulos.forEach((m) => { m.puerta = 'ninguna' })
    f.modulos[0].alturas = [150]; f.modulos[0].herrajes.tubos = [tubo(125, 25)]
    f.modulos[1].alturas = [35, 70, 105, 140]
  } else if (id === 'zapatero') {
    f.modulos[0].puerta = 'dos'; f.modulos[0].alturas = [25, 50, 75, 100, 125]
  } else if (id === 'tocador-compacto' || id === 'tocador-repisas') {
    Object.assign(f.modulos[0], { cajones: 1, zonaCajones: 16 })
    f.modulos[0].configuracionCajon.inicio = 60
    f.fabricacion.complementos = [id === 'tocador-compacto' ? espejo(700, 600, 100, 780, 410) : espejo(520, 600, 80, 780, 380)]
    if (id === 'tocador-repisas') f.fabricacion.complementos.push(
      { id: 'costado-repisas', tipo: 'panel', nombre: 'Lateral de repisas', plano: 'lateral', ancho: 180, alto: 650, espesor: 9, x: 720, y: 780, z: 200 },
      { id: 'costado-repisas-d', tipo: 'panel', nombre: 'Lateral derecho de repisas', plano: 'lateral', ancho: 180, alto: 650, espesor: 9, x: 991, y: 780, z: 200 },
      ...[980, 1180, 1421].map((y, i) => ({ id: `repisa-${i}`, tipo: 'repisa', nombre: `Repisa superior ${i + 1}`, ancho: 262, alto: 180, espesor: 9, x: 729, y, z: 200 })))
  } else {
    f.modulos[0].anchoModulo = 28; f.modulos[2].anchoModulo = 28
    f.modulos.forEach((m, i) => {
      m.cajones = i === 1 ? 1 : 3; m.zonaCajones = i === 1 ? 14 : 65; m.configuracionCajon.inicio = i === 1 ? base.alto - 18 : 3
    })
    f.fabricacion.ajustes['Piso|global|0'] = { ancho: 280 }
    f.fabricacion.complementos = [{ id: 'piso-derecho', tipo: 'repisa', nombre: 'Piso derecho', ancho: 280, alto: base.fondo * 10, espesor: 9, x: base.ancho * 10 - 289, y: 0, z: 0 }]
    if (id === 'tocador-doble') f.fabricacion.complementos.push(espejo(600, 650, 300, 800, 410))
  }
  return f
}

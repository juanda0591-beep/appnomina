import { construirMueble, configurarDiseno } from './construccionMueble.js'

const tipos = new Set(['cajones', 'entrepanos', 'puertas', 'zonaCajones', 'ancho', 'alto', 'fondo', 'tipoFondo'])
const porModulo = new Set(['cajones', 'entrepanos', 'puertas', 'zonaCajones'])
const entero = (v, min, max) => Number.isInteger(v) && v >= min && v <= max

export function aplicarCambiosDiseno(diseno, cambios) {
  if (!diseno || diseno.construccionVersion !== 2 || !Array.isArray(diseno.modulos) || !diseno.modulos.length) throw new Error('Abre un diseño configurable para editarlo con IA.')
  if (!Array.isArray(cambios) || !cambios.length || cambios.length > 8) throw new Error('La propuesta debe incluir entre 1 y 8 cambios.')
  const nuevo = configurarDiseno(diseno)
  nuevo.modulos = nuevo.modulos.map((m) => ({ ...m, alturas: [...m.alturas], configuracionCajon: { ...m.configuracionCajon } }))
  const resumen = [], avisos = []
  const destinos = new Set()
  const orden = { ancho: 0, alto: 0, fondo: 0, tipoFondo: 0, cajones: 1, zonaCajones: 2, puertas: 2, entrepanos: 3 }
  for (const cambio of [...cambios].sort((a, b) => (orden[a?.tipo] ?? 9) - (orden[b?.tipo] ?? 9))) {
    if (!cambio || !tipos.has(cambio.tipo)) throw new Error('La IA propuso una opción de diseño no disponible.')
    if (Object.keys(cambio).sort().join() !== 'modulo,numero,opcion,tipo') throw new Error('La IA devolvió un cambio no válido.')
    const modulo = porModulo.has(cambio.tipo) ? cambio.modulo - 1 : null
    if (modulo !== null && !entero(cambio.modulo, 1, nuevo.modulos.length)) throw new Error('Indica un módulo existente para ese cambio.')
    const destino = `${cambio.tipo}:${modulo ?? 'global'}`
    if (destinos.has(destino)) throw new Error('La IA repitió un cambio para la misma opción.')
    destinos.add(destino)
    const m = nuevo.modulos[modulo]
    if (cambio.tipo === 'cajones') {
      if (!entero(cambio.numero, 0, 12)) throw new Error('La cantidad de gavetas debe estar entre 0 y 12.')
      m.cajones = cambio.numero
      if (m.cajones && !(Number(m.zonaCajones) > 0)) {
        const interior = Number(nuevo.alto) - 2 * Number(nuevo.espesor) / 10
        m.zonaCajones = Math.round(Math.min(interior * .35, 60) * 10) / 10
        avisos.push(`Módulo ${cambio.modulo}: la zona de ${m.zonaCajones} cm es una propuesta. Confirma esa altura antes de fabricar.`)
      }
      if (!m.cajones) m.zonaCajones = 0
      if (m.cajones && m.configuracionCajon.riel === 'sin') avisos.push(`Módulo ${cambio.modulo}: no se configuró un riel. Revisa el herraje y sus holguras.`)
      resumen.push(`Módulo ${cambio.modulo}: ${m.cajones} gavetas, zona de ${m.zonaCajones} cm`)
    } else if (cambio.tipo === 'zonaCajones') {
      if (!Number.isFinite(cambio.numero) || cambio.numero < 1 || cambio.numero > 500) throw new Error('La zona de gavetas debe estar entre 1 y 500 cm.')
      if (!Number(m.cajones)) throw new Error('Primero indica cuántas gavetas tendrá ese módulo.')
      m.zonaCajones = cambio.numero
      resumen.push(`Módulo ${cambio.modulo}: zona de gavetas de ${cambio.numero} cm`)
    } else if (cambio.tipo === 'entrepanos') {
      if (!entero(cambio.numero, 0, 12)) throw new Error('La cantidad de entrepaños debe estar entre 0 y 12.')
      const interior = Number(nuevo.alto) - 2 * Number(nuevo.espesor) / 10
      const inicio = Number(m.cajones) && !Number(m.anchoCajon) ? Number(m.configuracionCajon.inicio) + Number(m.zonaCajones) : 0
      m.alturas = Array.from({ length: cambio.numero }, (_, i) => Math.round((inicio + (interior - inicio) * (i + 1) / (cambio.numero + 1)) * 10) / 10)
      resumen.push(`Módulo ${cambio.modulo}: ${cambio.numero} entrepaños`)
    } else if (cambio.tipo === 'puertas') {
      if (!['ninguna', 'una', 'dos'].includes(cambio.opcion)) throw new Error('Elige ninguna, una o dos puertas por módulo.')
      m.puerta = cambio.opcion
      resumen.push(`Módulo ${cambio.modulo}: ${cambio.opcion === 'ninguna' ? 'sin puertas' : `${cambio.opcion === 'una' ? 'una' : 'dos'} puertas por hueco`}`)
    } else if (cambio.tipo === 'tipoFondo') {
      if (!['sin-fondo', 'interno', 'superpuesto'].includes(cambio.opcion)) throw new Error('Tipo de trasera no válido.')
      nuevo.tipoFondo = cambio.opcion
      resumen.push(`Trasera: ${cambio.opcion}`)
    } else {
      if (!Number.isFinite(cambio.numero) || cambio.numero < 1 || cambio.numero > 1000) throw new Error('Las medidas exteriores deben estar entre 1 y 1000 cm.')
      nuevo[cambio.tipo] = cambio.numero
      resumen.push(`${{ ancho: 'Ancho', alto: 'Alto', fondo: 'Fondo' }[cambio.tipo]}: ${cambio.numero} cm`)
    }
  }
  const resultado = construirMueble(nuevo)
  if (resultado.avisos.length) throw new Error(resultado.avisos[0])
  return { diseno: nuevo, piezas: resultado.piezas, resumen, avisos }
}

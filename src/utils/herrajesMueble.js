export const CATALOGO_HERRAJES = [
  { id: 'barra', nombre: 'Manija de barra', detalle: 'Puertas y frentes de gaveta · medida editable', familia: 'manija' },
  { id: 'pomo', nombre: 'Pomo redondo', detalle: 'Un punto de agarre por frente', familia: 'manija' },
  { id: 'bisagra', nombre: 'Bisagra de cazoleta', detalle: 'Cantidad y diámetro de referencia editables', familia: 'bisagra' },
  { id: 'tubo', nombre: 'Tubo redondo con soportes', detalle: 'Altura, profundidad y diámetro editables', familia: 'tubo' },
  { id: 'ovalado', nombre: 'Tubo ovalado con soportes', detalle: 'Sección oval y largo calculado por módulo', familia: 'tubo' },
]
export const coloresHerraje = { acero: '#b4bfc5', negro: '#343a3c', dorado: '#bc9254' }
export const herrajesModulo = () => ({
  manija: { tipo: 'sin', largo: 128, diametro: 12, salida: 28, retiro: 50, acabado: 'acero', referencia: '' },
  bisagras: { activo: false, cantidad: 2, diametro: 35, retiro: 100, referencia: '' },
  tubos: [],
})
export function configuracionHerrajes(m) {
  const h = herrajesModulo(), actual = m.herrajes || {}
  if (typeof actual !== 'object' || Array.isArray(actual)) throw new Error('Configuración de herrajes no válida.')
  return { manija: { ...h.manija, ...actual.manija }, bisagras: { ...h.bisagras, ...actual.bisagras }, tubos: actual.tubos ?? [] }
}
const validar = (v, min, max, nombre, entero = false) => {
  if (v === '' || v == null || typeof v === 'boolean' || !Number.isFinite(Number(v)) || Number(v) < min || Number(v) > max || (entero && !Number.isInteger(Number(v)))) throw new Error(`${nombre}: indica ${entero ? 'un entero' : 'un valor'} entre ${min} y ${max}.`)
  return Number(v)
}
const referencia = (s) => {
  if (typeof s !== 'string' || s.length > 120) throw new Error('La referencia del herraje admite hasta 120 caracteres.')
  return s.trim()
}

export function agregarHerrajes(c, f) {
  const herrajes = [...c.herrajes], notas = [...c.notas]
  const piso = c.paneles.find((p) => p.clave === 'Piso|global|0')
  const baseY = piso.origen[1] + piso.dimensiones[1]
  const poner = (id, nombre, dimensiones, origen, modulo, opciones = {}) => {
    if (![...dimensiones, ...origen].every(Number.isFinite) || dimensiones.some((v) => v <= 0)) throw new Error('El herraje no tiene medidas válidas.')
    herrajes.push({ id, codigo: id, nombre, dimensiones, origen, posicion: dimensiones.map((d, i) => origen[i] + d / 2), modulo,
      grupo: 'herrajes', herraje: true, plano: 'frente', ancho: dimensiones[0], alto: dimensiones[1], espesor: dimensiones[2], separar: [0, 0, .8], ...opciones })
  }
  f.modulos.forEach((m, idx) => {
    const h = configuracionHerrajes(m), prefijo = `Módulo ${idx + 1}`
    if (!['sin', 'barra', 'pomo'].includes(h.manija.tipo)) throw new Error(`${prefijo}: manija no válida.`)
    if (!Object.hasOwn(coloresHerraje, h.manija.acabado)) throw new Error('Acabado de herraje no válido.')
    const frentes = c.paneles.filter((p) => p.modulo === idx && ['Puerta', 'Frente cajón'].includes(p.nombre))
    if (h.manija.tipo !== 'sin') {
      const largo = validar(h.manija.largo, 32, 600, `${prefijo}: largo de manija`)
      const diametro = validar(h.manija.diametro, 4, 60, `${prefijo}: diámetro manija`)
      const salida = validar(h.manija.salida, 5, 80, `${prefijo}: salida manija`)
      const retiro = validar(h.manija.retiro, 10, 200, `${prefijo}: retiro manija`)
      const ref = referencia(h.manija.referencia), color = coloresHerraje[h.manija.acabado]
      frentes.forEach((p, i) => {
        const [x, y, z] = p.origen, puerta = p.nombre === 'Puerta', esBarra = h.manija.tipo === 'barra'
        const w = esBarra && !puerta ? largo : diametro, alto = esBarra && puerta ? largo : diametro
        const cx = puerta ? (p.movimiento?.lado === 'der' ? x + retiro : x + p.ancho - retiro) : x + p.ancho / 2
        const cy = y + p.alto / 2
        if (cx - w / 2 < x || cx + w / 2 > x + p.ancho || alto > p.alto) throw new Error(`${prefijo}: la manija no cabe en ${p.nombre.toLowerCase()}. Reduce su medida o retiro.`)
        const id = `MAN-${idx}-${i}`, nombre = esBarra ? `Manija de barra ${largo} mm` : `Pomo ${diametro} mm`
        const opciones = { grupo: 'frentes', color, referencia: ref, movimiento: p.movimiento, compraId: id, descripcionCompra: `${nombre} · ${h.manija.acabado}`, medidaCompra: esBarra ? `${largo} mm de largo total (referencia)` : `Ø ${diametro} mm` }
        poner(id, nombre, [w, alto, diametro], [cx - w / 2, cy - alto / 2, z + p.espesor + salida - diametro], idx,
          { ...opciones, forma: esBarra ? (puerta ? 'cilindro-y' : 'cilindro-x') : 'cilindro-z' })
        if (esBarra) for (const signo of [-1, 1]) poner(`${id}-AP-${signo}`, 'Apoyo de manija', [diametro * .65, diametro * .65, salida],
          [cx + (puerta ? 0 : signo * (largo - diametro) / 2) - diametro * .325, cy + (puerta ? signo * (largo - diametro) / 2 : 0) - diametro * .325, z + p.espesor], idx,
          { ...opciones, forma: 'cilindro-z' })
      })
      if (!frentes.length) notas.push([prefijo, 'Manijas seleccionadas sin frentes donde colocarlas.'])
    }
    if (typeof h.bisagras.activo !== 'boolean') throw new Error('Selección de bisagras no válida.')
    if (h.bisagras.activo) {
      const cantidad = validar(h.bisagras.cantidad, 2, 6, `${prefijo}: bisagras por hoja`, true)
      const diametro = validar(h.bisagras.diametro, 20, 60, `${prefijo}: cazoleta`)
      const retiro = validar(h.bisagras.retiro, 30, 300, `${prefijo}: retiro de bisagras`)
      const ref = referencia(h.bisagras.referencia)
      frentes.filter((p) => p.nombre === 'Puerta').forEach((p, i) => {
        if (p.alto < 2 * retiro + diametro || p.ancho < diametro + 15) throw new Error(`${prefijo}: las bisagras no caben en la puerta con ese retiro.`)
        for (let j = 0; j < cantidad; j++) {
          const x = p.origen[0] + (p.movimiento?.lado === 'der' ? p.ancho - diametro / 2 - 5 : diametro / 2 + 5)
          const y = p.origen[1] + retiro + j * (p.alto - 2 * retiro) / (cantidad - 1)
          const z = p.origen[2] - 10, id = `BIS-${idx}-${i}-${j}`
          const opciones = { referencia: ref, compraId: id, descripcionCompra: `Bisagra de cazoleta Ø ${diametro} mm`, medidaCompra: `${cantidad} por hoja`, movimiento: p.movimiento }
          poner(id, 'Bisagra de cazoleta', [diametro, diametro, 8], [x - diametro / 2, y - diametro / 2, z], idx, { ...opciones, forma: 'cilindro-z' })
          poner(`${id}-BRAZO`, 'Brazo de bisagra', [38, 12, 16], [x - 19, y - 6, z - 14], idx, opciones)
        }
      })
    }
    if (!Array.isArray(h.tubos) || h.tubos.length > 4) throw new Error(`${prefijo}: máximo cuatro tubos por módulo.`)
    const ids = new Set(), modulo = c.modulos[idx]
    for (const t of h.tubos) {
      if (!t || typeof t.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(t.id) || ids.has(t.id)) throw new Error('Identificador de tubo no válido.')
      ids.add(t.id)
      if (!['redondo', 'ovalado'].includes(t.tipo)) throw new Error('Tipo de tubo no válido.')
      const diametro = validar(t.diametro, 10, 60, `${prefijo}: diámetro tubo`), alto = t.tipo === 'ovalado' ? validar(t.alto ?? diametro * 1.5, 10, 90, `${prefijo}: alto sección oval`) : diametro
      const y = baseY + validar(t.altura, 1, 1000, `${prefijo}: altura tubo`) * 10
      const z = validar(t.fondo, 1, 1000, `${prefijo}: posición de tubo`) * 10
      const descuento = validar(t.descuento, 0, 60, `${prefijo}: descuento de soportes`)
      const largo = modulo.ancho - descuento
      if (largo <= 20 || y - (alto + 10) / 2 < baseY || y + (alto + 10) / 2 > baseY + modulo.alto || z - (diametro + 10) / 2 < 0 || z + (diametro + 10) / 2 > c.fondo) throw new Error(`${prefijo}: el tubo o sus soportes salen del espacio interior. Revisa altura, fondo y diámetro.`)
      const origen = [modulo.x + descuento / 2, y - alto / 2, z - diametro / 2], dimensiones = [largo, alto, diametro]
      const solapa = (p) => p.origen && p.origen.every((v, k) => v < origen[k] + dimensiones[k] && v + p.dimensiones[k] > origen[k])
      if (c.paneles.some((p) => p.modulo === idx && ['Entrepaño', 'División cajón', 'Frente cajón', 'Costado cajón', 'Trasera cajón', 'Contrafrente cajón', 'Fondo cajón'].includes(p.nombre) && solapa(p))) throw new Error(`${prefijo}: el tubo atraviesa un entrepaño o la cajonera. Cambia su altura o fondo.`)
      if (herrajes.some((p) => p.modulo === idx && p.id.startsWith('TUB-') && solapa(p))) throw new Error(`${prefijo}: dos tubos se superponen. Cambia su altura o fondo.`)
      const id = `TUB-${idx}-${t.id}`, ref = referencia(t.referencia)
      const seccion = t.tipo === 'ovalado' ? `${diametro} × ${alto} mm` : `Ø ${diametro} mm`
      poner(id, `Tubo ${t.tipo} para ropa`, dimensiones, origen, idx, { forma: 'cilindro-x', referencia: ref, compraId: id, descripcionCompra: `Tubo ${t.tipo} ${seccion}`, medidaCompra: `${Math.round(largo * 100) / 100} mm de largo`, separar: [0, .25, 0] })
      for (const [lado, sx] of [['I', modulo.x], ['D', modulo.x + modulo.ancho - 12]]) {
        const soporte = `SOP-${id}-${lado}`
        poner(soporte, 'Soporte de tubo', [12, alto + 10, diametro + 10], [sx, y - (alto + 10) / 2, z - (diametro + 10) / 2], idx,
          { referencia: ref, compraId: soporte, descripcionCompra: `Soporte de tubo ${t.tipo} ${seccion}`, medidaCompra: 'Verificar alojamiento del proveedor' })
      }
    }
  })
  if (herrajes.length > 5000) throw new Error('El diseño supera el máximo de herrajes representados.')
  const min = [...c.limites.min], max = [...c.limites.max]
  for (const h of herrajes) if (h.origen) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], h.origen[i]); max[i] = Math.max(max[i], h.origen[i] + h.dimensiones[i]) }
  return { ...c, herrajes, notas, listaHerrajes: listarHerrajes(herrajes), limites: { min, max }, envolvente: max.map((v, i) => Math.round((v - min[i]) * 100) / 100) }
}

function listarHerrajes(herrajes) {
  const unidades = new Set(), lista = new Map()
  for (const h of herrajes) {
    const id = h.compraId || h.id
    if (unidades.has(id)) continue
    unidades.add(id)
    const nombre = h.descripcionCompra || h.nombre, ref = h.referencia || '', medida = h.medidaCompra || `${h.ancho} mm`, clave = JSON.stringify([nombre, ref, medida])
    const item = lista.get(clave) || { nombre, referencia: ref, medida, cantidad: 0 }
    item.cantidad++; lista.set(clave, item)
  }
  return [...lista.values()]
}

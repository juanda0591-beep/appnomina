import { generarDespiece, paramsParaDespiece } from './despiece.js'
import { validarMontaje } from './piezasManuales.js'

export const MAX_PIEZAS_CORTE = 1000

export function proyectoVacio() {
  return { version: 1, productoId: '', productoNombre: '', material: '', unidades: 1,
    lamina: { ancho: 1830, largo: 2440, espesor: 18, costo: 90000 },
    sierra: 4, margen: 0, piezas: [], diseno: null }
}

export function validarPiezas(piezas) {
  if (!Array.isArray(piezas) || !piezas.length || piezas.length > MAX_PIEZAS_CORTE) {
    throw new Error('Agrega entre 1 y 1000 piezas.')
  }
  let total = 0
  const codigos = new Set()
  return piezas.map((p, i) => {
    const nombre = typeof p?.nombre === 'string' ? p.nombre.trim() : ''
    const ancho = Number(p?.ancho), alto = Number(p?.alto ?? p?.largo), cantidad = Number(p?.cantidad ?? 1)
    if (!nombre || nombre.length > 120) throw new Error(`Pieza ${i + 1}: nombre obligatorio (maximo 120 caracteres).`)
    if (![ancho, alto].every((n) => Number.isFinite(n) && n > 0 && n <= 100000)) {
      throw new Error(`Pieza ${i + 1}: las medidas deben estar entre 0 y 10000 cm.`)
    }
    if (!Number.isSafeInteger(cantidad) || cantidad < 1) throw new Error(`Pieza ${i + 1}: cantidad entera mayor a cero.`)
    total += cantidad
    if (total > MAX_PIEZAS_CORTE) throw new Error('El lote no puede superar 1000 piezas.')
    const codigo = p.codigo || `P${String(i + 1).padStart(3, '0')}`
    if (typeof codigo !== 'string' || !/^[A-Za-z0-9_-]{1,24}$/.test(codigo) || codigos.has(codigo)) {
      throw new Error('Cada tipo de pieza debe tener un codigo unico (letras, numeros o guion).')
    }
    codigos.add(codigo)
    const canto = typeof p.canto === 'string' ? p.canto : ''
    if (canto.length > 120) throw new Error('La descripcion del canto es demasiado larga.')
    const espesor = p.espesor == null ? undefined : Number(p.espesor)
    if (espesor != null && (!Number.isFinite(espesor) || espesor <= 0 || espesor > 200)) throw new Error('Espesor de pieza no válido.')
    return { nombre, codigo, ancho, alto, cantidad, canto, ...(espesor == null ? {} : { espesor, material: 'MDF' }),
      permiteRotar: p.permiteRotar !== false && p.permiteRotar !== 0,
      ...(p.materialId ? { materialId: p.materialId } : {}) }
  })
}

export function validarLamina(lamina, opciones = {}) {
  if (!lamina || ![lamina.ancho, lamina.largo].every((v) => Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) <= 100000)) {
    throw new Error('Indica medidas validas para la lamina (maximo 10000 cm).')
  }
  const sierra = Number(opciones.sierra ?? 0), margen = Number(opciones.margen ?? 0)
  const espesor = Number(lamina.espesor ?? 0), costo = Number(lamina.costo ?? 0)
  if (![sierra, margen, espesor, costo].every((v) => Number.isFinite(v) && v >= 0)
    || sierra > 100 || espesor > 200 || costo > 1e12) throw new Error('Revisa el disco, espesor, margen y costo de la lamina.')
  if (2 * margen >= Math.min(Number(lamina.ancho), Number(lamina.largo))) throw new Error('El margen no deja superficie util en la lamina.')
  return { lamina: { ancho: Number(lamina.ancho), largo: Number(lamina.largo), espesor, costo }, opciones: { sierra, margen } }
}

export function validarProyecto(proyecto) {
  if (!proyecto || proyecto.version !== 1) throw new Error('Formato de proyecto no compatible.')
  const piezas = validarPiezas(proyecto.piezas)
  const unidades = Number(proyecto.unidades)
  if (!Number.isSafeInteger(unidades) || unidades < 1 || piezas.reduce((s, p) => s + p.cantidad, 0) * unidades > MAX_PIEZAS_CORTE) {
    throw new Error('Revisa las unidades: el lote debe contener entre 1 y 1000 piezas.')
  }
  const { lamina, opciones } = validarLamina(proyecto.lamina, proyecto)
  if (typeof proyecto.material !== 'string' || proyecto.material.length > 120) throw new Error('Material no valido.')
  const productoId = proyecto.productoId ? Number(proyecto.productoId) : ''
  if (proyecto.productoId && (!Number.isSafeInteger(productoId) || productoId < 1)) throw new Error('Producto no valido.')
  const diseno = proyecto.diseno || null
  if (diseno && (!Array.isArray(diseno.modulos) || diseno.modulos.length < 1 || diseno.modulos.length > 30
    || ![diseno.ancho, diseno.alto, diseno.fondo].every((n) => Number(n) > 0 && Number(n) <= 10000)
    || diseno.modulos.some((m) => !m || !Array.isArray(m.alturas) || m.alturas.length > 100
      || m.alturas.some((n) => !Number.isFinite(Number(n))) || !Number.isInteger(Number(m.cajones)) || Number(m.cajones) < 0 || Number(m.cajones) > 100))) {
    throw new Error('El diseno del mueble no es valido.')
  }
  if (JSON.stringify(diseno).length > 50000) throw new Error('El diseno es demasiado grande.')
  if (diseno) {
    if (diseno.construccionVersion != null && diseno.construccionVersion !== 2) throw new Error('Versión de construcción no compatible.')
    if (Number(diseno.espesor) !== lamina.espesor || ![diseno.espesor, diseno.gap, diseno.holguraFondo].every((v) => Number.isFinite(Number(v)))
      || !['laterales-completos', 'techo-piso-cubren'].includes(diseno.armado)
      || !['superpuesto', 'interno', 'sin-fondo'].includes(diseno.tipoFondo)
      || diseno.modulos.some((m) => !['ninguna', 'una', 'dos'].includes(m.puerta) || !['izq', 'der'].includes(m.ladoCajon)
        || ![m.zonaCajones, m.anchoCajon].every((n) => Number.isFinite(Number(n)) && Number(n) >= 0)
        || m.alturas.some((a) => Number(a) < 0 || Number(a) * 10 > Number(diseno.alto) * 10 - 3 * lamina.espesor))) {
      throw new Error('Revisa las medidas y opciones del diseño del mueble.')
    }
    const generado = generarDespiece(paramsParaDespiece(diseno))
    const firma = (ps) => JSON.stringify(ps.map((p) => [p.nombre, p.ancho, p.alto, p.cantidad, p.permiteRotar, p.espesor || null]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
    if (generado.avisos.length || firma(generado.piezas) !== firma(piezas)) throw new Error('El diseño no coincide con las piezas. Genera de nuevo el despiece.')
  }
  const laminasPorEspesor = {}
  if (proyecto.laminasPorEspesor) for (const [espesor, datos] of Object.entries(proyecto.laminasPorEspesor)) {
    if (!Number.isFinite(Number(espesor)) || Number(espesor) <= 0 || Number(espesor) > 200) throw new Error('Espesor de lámina no válido.')
    laminasPorEspesor[espesor] = validarLamina({ ...datos, espesor: Number(espesor) }, opciones).lamina
  }
  return { version: 1, productoId, productoNombre: String(proyecto.productoNombre || '').slice(0, 200),
    material: proyecto.material.trim(), unidades, lamina, ...opciones, piezas, diseno,
    ...(proyecto.montajeManual ? { montajeManual: validarMontaje(proyecto.montajeManual, piezas) } : {}),
    ...(Object.keys(laminasPorEspesor).length ? { laminasPorEspesor } : {}) }
}

export function entradaCorte(proyecto) {
  const p = validarProyecto(proyecto)
  return { piezas: p.piezas.map((pieza) => ({ ...pieza, cantidad: pieza.cantidad * p.unidades })),
    lamina: p.lamina, opciones: { sierra: p.sierra, margen: p.margen }, laminasPorEspesor: p.laminasPorEspesor }
}

export function colorPieza(codigo = '') {
  const colores = ['#d8e9f5', '#d4eadb', '#f7e5b1', '#efcfca', '#cae7e5', '#e1daf0']
  let h = 0
  for (const letra of codigo) h = (h * 31 + letra.charCodeAt(0)) >>> 0
  return colores[h % colores.length]
}

// El giro del motor intercambia los ejes; este mapa mantiene los cantos sobre la pieza girada.
export function bordesPieza(pieza) {
  const giro = { arriba: 'der', der: 'abajo', abajo: 'izq', izq: 'arriba' }
  return (pieza.canto || '').split(',').filter((b) => b in giro).map((b) => pieza.rotada ? giro[b] : b)
}

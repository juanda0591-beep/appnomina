// Fórmulas puras de costeo y rentabilidad. Sin dependencias de React ni del DOM,
// para poder reutilizarlas tanto en la página de Costos como en la exportación
// (PDF / CSV) y, eventualmente, en pruebas.
//
// Estructura del costeo (objeto `datos`):
//   insumos:        [{ nombre, cantidad, unidad, precioUnitario }]  → materiales por unidad
//   manoObra:       [{ nombre, tipo: 'hora'|'fijo', horas, valor }]  → valor = valor/hora o fijo
//   unidadesPeriodo: number   → unidades producidas en el periodo (para prorratear indirectos)
//   indirectos:     [{ nombre, montoPeriodo }]                       → arriendo, luz, transporte…
//   imprevistoPct:  number    → % sobre el subtotal unitario
//   precioVenta:    number
//   margenMinimo:   number    → % mínimo aceptable (para alertas)
//   tramos:         [{ min, max, descuentoPct, cantidadRef }]

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

// Estructura por defecto de un costeo nuevo (para inicializar el formulario).
export function costeoVacio() {
  return {
    insumos: [],
    manoObra: [],
    unidadesPeriodo: 0,
    indirectos: [],
    imprevistoPct: 0,
    precioVenta: 0,
    margenMinimo: 0,
    tramos: [],
  }
}

// Calcula todos los valores derivados a partir del objeto `datos`.
export function calcularCosteo(datos = {}) {
  const insumos = Array.isArray(datos.insumos) ? datos.insumos : []
  const manoObra = Array.isArray(datos.manoObra) ? datos.manoObra : []
  const indirectos = Array.isArray(datos.indirectos) ? datos.indirectos : []
  const tramos = Array.isArray(datos.tramos) ? datos.tramos : []

  const unidadesPeriodo = num(datos.unidadesPeriodo)
  const imprevistoPct = num(datos.imprevistoPct)
  const precioVenta = num(datos.precioVenta)
  const margenMinimo = num(datos.margenMinimo)

  // --- Costos directos por unidad ---
  const materialesUnit = insumos.reduce(
    (s, i) => s + num(i.cantidad) * num(i.precioUnitario),
    0
  )
  const manoObraUnit = manoObra.reduce(
    (s, m) => s + (m.tipo === 'hora' ? num(m.horas) * num(m.valor) : num(m.valor)),
    0
  )
  const directosUnit = materialesUnit + manoObraUnit

  // --- Costos indirectos prorrateados por unidad ---
  const indirectosPeriodo = indirectos.reduce((s, i) => s + num(i.montoPeriodo), 0)
  const indirectosUnit = unidadesPeriodo > 0 ? indirectosPeriodo / unidadesPeriodo : 0

  // --- Imprevistos como % sobre el subtotal (directos + indirectos) ---
  const subtotalUnit = directosUnit + indirectosUnit
  const imprevistoUnit = subtotalUnit * (imprevistoPct / 100)

  // --- Costo total unitario y rentabilidad ---
  const costoTotalUnit = subtotalUnit + imprevistoUnit
  const gananciaUnit = precioVenta - costoTotalUnit
  const margenPct = precioVenta > 0 ? (gananciaUnit / precioVenta) * 100 : 0
  const markupPct = costoTotalUnit > 0 ? (gananciaUnit / costoTotalUnit) * 100 : 0

  // --- Desglose por categoría (para tabla y gráfico de torta) ---
  const desglose = [
    { categoria: 'Materiales', valor: materialesUnit },
    { categoria: 'Mano de obra', valor: manoObraUnit },
    { categoria: 'Indirectos', valor: indirectosUnit },
    { categoria: 'Imprevistos', valor: imprevistoUnit },
  ]

  // --- Escenarios de descuento por volumen ---
  const escenarios = tramos.map((t) => {
    const descuentoPct = num(t.descuentoPct)
    const cantidadRef = num(t.cantidadRef)
    const precioDesc = precioVenta * (1 - descuentoPct / 100)
    const gananciaDescUnit = precioDesc - costoTotalUnit
    const margenDescPct = precioDesc > 0 ? (gananciaDescUnit / precioDesc) * 100 : 0
    const gananciaTramo = gananciaDescUnit * cantidadRef
    // Alerta si la ganancia se vuelve negativa o cae bajo el margen mínimo
    const alerta = gananciaDescUnit < 0 || margenDescPct < margenMinimo
    return {
      min: num(t.min),
      max: t.max === '' || t.max == null ? null : num(t.max),
      descuentoPct,
      cantidadRef,
      precioDesc,
      gananciaDescUnit,
      margenDescPct,
      gananciaTramo,
      alerta,
    }
  })

  return {
    materialesUnit,
    manoObraUnit,
    directosUnit,
    indirectosPeriodo,
    indirectosUnit,
    subtotalUnit,
    imprevistoUnit,
    costoTotalUnit,
    precioVenta,
    gananciaUnit,
    margenPct,
    markupPct,
    margenMinimo,
    desglose,
    escenarios,
  }
}

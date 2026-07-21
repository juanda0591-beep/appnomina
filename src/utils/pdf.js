import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCOP, formatFecha } from './format.js'

// ── Paleta de colores (misma del sistema de diseño de la app) ──────────────
const C = {
  primary:   [37, 99, 235],    // #2563eb
  accent:    [139, 92, 246],   // #8b5cf6
  dark:      [15, 23, 42],     // #0f172a
  muted:     [100, 116, 139],  // #64748b
  border:    [226, 232, 240],  // #e2e8f0
  rowAlt:    [248, 250, 252],  // #f8fafc — fila alterna (zebra)
  headBg:    [239, 246, 255],  // pie de tabla y secciones
  success:   [22, 163, 74],    // verde
  danger:    [220, 38, 38],    // rojo
  warning:   [180, 83, 9],     // ámbar
}

// Opciones base compartidas para todas las tablas autoTable.
// Úsalas combinando: autoTable(doc, { ...T(), startY: y, head, body, foot, ... })
function T(overrides = {}) {
  return {
    styles: {
      fontSize: 10,
      cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
      lineColor: C.border,
      lineWidth: 0.25,
      textColor: C.dark,
    },
    headStyles: {
      fillColor: C.primary,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
      cellPadding: { top: 5, bottom: 5, left: 5, right: 5 },
    },
    footStyles: {
      fillColor: C.headBg,
      textColor: C.dark,
      fontStyle: 'bold',
      lineWidth: { top: 0.6, bottom: 0, left: 0, right: 0 },
      lineColor: C.primary,
    },
    alternateRowStyles: { fillColor: C.rowAlt },
    ...overrides,
  }
}

// Dibuja un recuadro de "total final" con fondo azul degradado al final de un doc.
// Devuelve la nueva posición Y.
function cajaTotales(doc, marginX, y, lineas) {
  // lineas = [{ etiqueta, valor, destacado? }]
  const pageW = doc.internal.pageSize.getWidth()
  const ancho = 90
  const x = pageW - marginX - ancho
  const altoLinea = 7
  const padV = 4
  const alto = lineas.length * altoLinea + padV * 2

  // Fondo
  doc.setFillColor(...C.headBg)
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.4)
  doc.roundedRect(x, y, ancho, alto, 2, 2, 'FD')

  // Línea izquierda de acento
  doc.setFillColor(...C.primary)
  doc.rect(x, y, 2.5, alto, 'F')

  let ly = y + padV + altoLinea * 0.75
  for (const { etiqueta, valor, destacado } of lineas) {
    if (destacado) {
      doc.setFont(undefined, 'bold')
      doc.setFontSize(11.5)
      doc.setTextColor(...C.primary)
    } else {
      doc.setFont(undefined, 'normal')
      doc.setFontSize(10)
      doc.setTextColor(...C.muted)
    }
    doc.text(etiqueta, x + 8, ly)
    doc.text(valor, x + ancho - 3, ly, { align: 'right' })
    ly += altoLinea
  }
  doc.setFont(undefined, 'normal')
  doc.setTextColor(...C.dark)
  return y + alto + 8
}

// Dibuja el encabezado con los datos de la empresa y el logo.
// Devuelve la posición Y donde puede continuar el contenido.
function drawEncabezadoEmpresa(doc, empresa, marginX) {
  const pageW = doc.internal.pageSize.getWidth()

  // ── Barra de acento superior (degradado simulado con dos rectángulos) ──
  doc.setFillColor(...C.primary)
  doc.rect(0, 0, pageW * 0.65, 5, 'F')
  doc.setFillColor(...C.accent)
  doc.rect(pageW * 0.65, 0, pageW * 0.35, 5, 'F')

  const topY = 11

  // Logo
  let textX = marginX
  let logoW = 0, logoH = 0, logoData = null, logoFmt = 'JPEG'
  if (empresa?.logo) {
    try {
      const props = doc.getImageProperties(empresa.logo)
      logoFmt = String(empresa.logo).startsWith('data:image/png') ? 'PNG' : 'JPEG'
      logoW = 28; logoH = (props.height * logoW) / props.width
      logoData = empresa.logo; textX = marginX + logoW + 8
    } catch { /* logo inválido, se ignora */ }
  }

  const nombreAlto = empresa?.nombre ? 7 : 0
  const lineas = []
  if (empresa?.nit) lineas.push(`NIT: ${empresa.nit}`)
  if (empresa?.direccion) lineas.push(empresa.direccion)
  const contacto = [empresa?.telefono && `Tel: ${empresa.telefono}`, empresa?.correo].filter(Boolean).join('   ·   ')
  if (contacto) lineas.push(contacto)
  const textoAlto = nombreAlto + lineas.length * 5

  const bloqueAlto = Math.max(textoAlto, logoH, 10)
  const logoY = topY + (bloqueAlto - logoH) / 2
  let y = topY + (bloqueAlto - textoAlto) / 2 + 5

  if (logoData) doc.addImage(logoData, logoFmt, marginX, logoY, logoW, logoH)

  if (empresa?.nombre) {
    doc.setFont(undefined, 'bold')
    doc.setFontSize(17)
    doc.setTextColor(...C.primary)
    doc.text(empresa.nombre, textX, y)
    doc.setFont(undefined, 'normal')
    y += 7
  }

  doc.setFontSize(9)
  doc.setTextColor(...C.muted)
  for (const l of lineas) { doc.text(l, textX, y); y += 5 }

  // Línea divisoria con degradado simulado
  const bottom = topY + bloqueAlto + 4
  doc.setDrawColor(...C.primary)
  doc.setLineWidth(0.7)
  doc.line(marginX, bottom, pageW * 0.4, bottom)
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)
  doc.line(pageW * 0.4, bottom, pageW - marginX, bottom)

  doc.setTextColor(...C.dark)
  return bottom + 8
}

// Genera y descarga el PDF del pago de nómina
export function generarPdfNomina({ empresa, empleado, fecha, items, descuentos, prestamosEmpleado, subtotal, totalDescuentos, extra, extraDetalle, descuentoTrabajo, descuentoTrabajoDetalle, total, comentario, fotos }) {
  const doc = new jsPDF()
  const marginX = 14

  let y = drawEncabezadoEmpresa(doc, empresa, marginX)

  y = tituloDoc(doc, marginX, y, 'Comprobante de Pago de Nómina')

  doc.setFontSize(11)
  doc.setTextColor(90)
  doc.text(`Empleado: ${empleado?.nombre || ''}`, marginX, y)
  y += 6
  if (empleado?.cedula) {
    doc.text(`Cédula: ${empleado.cedula}`, marginX, y)
    y += 6
  }
  if (empleado?.cargo) {
    doc.text(`Cargo: ${empleado.cargo}`, marginX, y)
    y += 6
  }
  if (empleado?.telefono) {
    doc.text(`Teléfono: ${empleado.telefono}`, marginX, y)
    y += 6
  }
  doc.text(`Fecha: ${formatFecha(fecha)}`, marginX, y)
  y += 6

  // Tabla de trabajos realizados
  autoTable(doc, {
    startY: y,
    head: [['Producto', 'Proceso', 'Cantidad', 'Pago x und', 'Subtotal']],
    body: items.map((it) => [
      it.productoNombre,
      it.procesoNombre,
      String(it.cantidad),
      formatCOP(it.pago),
      formatCOP(it.subtotal),
    ]),
    styles: { fontSize: 10 },
    headStyles: { fillColor: [37, 99, 235] },
    alternateRowStyles: { fillColor: C.rowAlt },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
    // Alinea el título y el dato igual en las columnas numéricas
    didParseCell: (data) => {
      if ([2, 3, 4].includes(data.column.index)) data.cell.styles.halign = 'right'
    },
  })

  y = doc.lastAutoTable.finalY + 8

  doc.setFontSize(11)
  doc.setTextColor(0)
  doc.text(`Subtotal trabajos: ${formatCOP(subtotal)}`, marginX, y)
  y += 8

  // Préstamos del empleado: muestra lo descontado y el saldo restante
  if (prestamosEmpleado && prestamosEmpleado.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Préstamo', 'Saldo anterior', 'Descontado', 'Saldo restante']],
      body: prestamosEmpleado.map((p) => [
        p.descripcion || 'Préstamo',
        formatCOP(p.saldoAnterior),
        p.descontado > 0 ? '-' + formatCOP(p.descontado) : '—',
        formatCOP(p.saldoNuevo),
      ]),
      styles: { fontSize: 10 },
      headStyles: { fillColor: [220, 38, 38] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      didParseCell: (data) => {
        if ([1, 2, 3].includes(data.column.index)) data.cell.styles.halign = 'right'
      },
    })
    y = doc.lastAutoTable.finalY + 8
    if (totalDescuentos > 0) {
      doc.text(`Total descuentos: -${formatCOP(totalDescuentos)}`, marginX, y)
      y += 8
    }
  } else if (descuentos.length > 0) {
    // Respaldo: solo descuentos (cuando no hay info de saldos)
    autoTable(doc, {
      startY: y,
      head: [['Descuento de préstamo', 'Monto']],
      body: descuentos.map((d) => [d.descripcion || 'Préstamo', '-' + formatCOP(d.monto)]),
      styles: { fontSize: 10 },
      headStyles: { fillColor: [220, 38, 38] },
      columnStyles: { 1: { halign: 'right' } },
    })
    y = doc.lastAutoTable.finalY + 8
    doc.text(`Total descuentos: -${formatCOP(totalDescuentos)}`, marginX, y)
    y += 8
  }

  // Pago extra (opcional)
  if (extra > 0) {
    doc.setFontSize(11)
    doc.setTextColor(0)
    const etiqueta = extraDetalle && extraDetalle.trim()
      ? `Pago extra (${extraDetalle.trim()}): +${formatCOP(extra)}`
      : `Pago extra: +${formatCOP(extra)}`
    doc.text(etiqueta, marginX, y)
    y += 8
  }

  // Descuento por trabajo (opcional)
  if (descuentoTrabajo > 0) {
    doc.setFontSize(11)
    doc.setTextColor(220, 38, 38)
    const etiquetaDesc = descuentoTrabajoDetalle && descuentoTrabajoDetalle.trim()
      ? `Descuento por trabajo (${descuentoTrabajoDetalle.trim()}): -${formatCOP(descuentoTrabajo)}`
      : `Descuento por trabajo: -${formatCOP(descuentoTrabajo)}`
    doc.text(etiquetaDesc, marginX, y)
    doc.setTextColor(0)
    y += 8
  }

  // Total
  doc.setFontSize(14)
  doc.setTextColor(37, 99, 235)
  doc.text(`TOTAL A PAGAR: ${formatCOP(total)}`, marginX, y + 4)
  y += 12

  // Comentario / observaciones
  if (comentario && comentario.trim()) {
    const pageW = doc.internal.pageSize.getWidth()
    doc.setFontSize(11)
    doc.setTextColor(15, 23, 42)
    doc.setFont(undefined, 'bold')
    doc.text('Comentario:', marginX, y)
    doc.setFont(undefined, 'normal')
    doc.setFontSize(10)
    doc.setTextColor(90)
    const lineas = doc.splitTextToSize(comentario.trim(), pageW - marginX * 2)
    doc.text(lineas, marginX, y + 6)
    y += 6 + lineas.length * 5
  }

  // Registro fotográfico de las tareas (opcional)
  y = dibujarRegistroFotografico(doc, marginX, y, fotos)

  // Sello de PAGADO (junto al total)
  dibujarSelloPagado(doc, marginX)

  // Firmas del representante y del empleado
  dibujarFirmas(doc, marginX, empleado, empresa)

  pieDePagina(doc, empresa, marginX)

  const nombreArchivo = `nomina_${(empleado?.nombre || 'empleado').replace(/\s+/g, '_')}_${fecha}.pdf`
  doc.save(nombreArchivo)
}

// Genera el PDF del reporte por rango de fechas
export function generarPdfReporte({ empresa, desde, hasta, totalBruto, totalDescuentos, totalPagado, cantidad, porEmpleado }) {
  const doc = new jsPDF()
  const marginX = 14

  let y = drawEncabezadoEmpresa(doc, empresa, marginX)

  y = tituloDoc(doc, marginX, y, 'Reporte de Nómina')

  doc.setFontSize(11)
  doc.setTextColor(90)
  doc.text(`Periodo: ${formatFecha(desde)} — ${formatFecha(hasta)}`, marginX, y)
  y += 6
  doc.text(`Pagos registrados: ${cantidad}`, marginX, y)
  y += 6

  autoTable(doc, {
    startY: y,
    head: [['Empleado', 'Pagos', 'Bruto', 'Descuentos', 'Total pagado']],
    body: porEmpleado.map((e) => [
      e.nombre,
      String(e.pagos),
      formatCOP(e.bruto),
      '-' + formatCOP(e.descuentos),
      formatCOP(e.total),
    ]),
    foot: [[
      'TOTALES',
      String(cantidad),
      formatCOP(totalBruto),
      '-' + formatCOP(totalDescuentos),
      formatCOP(totalPagado),
    ]],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [37, 99, 235] },
    footStyles: { fillColor: [226, 232, 240], textColor: 0, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: C.rowAlt },
    columnStyles: {
      1: { halign: 'right' }, 2: { halign: 'right' },
      3: { halign: 'right' }, 4: { halign: 'right' },
    },
    // Alinea encabezado, cuerpo y pie igual en las columnas numéricas
    didParseCell: (data) => {
      if ([1, 2, 3, 4].includes(data.column.index)) data.cell.styles.halign = 'right'
    },
  })

  pieDePagina(doc, empresa, marginX)

  doc.save(`reporte_nomina_${desde}_a_${hasta}.pdf`)
}

// Genera el PDF del reporte detallado de movimientos (control de dinero)
export function generarPdfMovimientos({ empresa, desde, hasta, movimientos, ingresos, gastos, balance }) {
  const doc = new jsPDF()
  const marginX = 14

  let y = drawEncabezadoEmpresa(doc, empresa, marginX)

  y = tituloDoc(doc, marginX, y, 'Reporte de Movimientos')

  doc.setFontSize(11)
  doc.setTextColor(90)
  doc.text(`Periodo: ${formatFecha(desde)} — ${formatFecha(hasta)}`, marginX, y)
  y += 6
  doc.text(`Movimientos registrados: ${movimientos.length}`, marginX, y)
  y += 6

  // Resumen de totales
  autoTable(doc, {
    startY: y,
    head: [['Ingresos', 'Gastos', 'Balance']],
    body: [[formatCOP(ingresos), '-' + formatCOP(gastos), formatCOP(balance)]],
    styles: { fontSize: 11, fontStyle: 'bold' },
    headStyles: { fillColor: [37, 99, 235] },
    alternateRowStyles: { fillColor: C.rowAlt },
    columnStyles: { 0: { halign: 'right' }, 1: { halign: 'right' }, 2: { halign: 'right' } },
    didParseCell: (data) => { data.cell.styles.halign = 'right' },
  })
  y = doc.lastAutoTable.finalY + 8

  // Detalle de movimientos
  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto']],
    body: movimientos.map((m) => [
      formatFecha(m.fecha),
      m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto',
      m.categoria || '—',
      m.descripcion || '—',
      (m.tipo === 'gasto' ? '-' : '+') + formatCOP(m.monto),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
    alternateRowStyles: { fillColor: C.rowAlt },
    columnStyles: { 4: { halign: 'right' } },
    didParseCell: (data) => {
      if (data.column.index === 4) data.cell.styles.halign = 'right'
    },
  })

  pieDePagina(doc, empresa, marginX)

  doc.save(`reporte_movimientos_${desde}_a_${hasta}.pdf`)
}

// Genera el PDF del reporte de fabricación (etapas de producción por producto).
// `productos` es el array ya calculado en la página de Reportes.
// Reporte de fabricación basado en las órdenes de producción.
// `ordenes` viene de Reportes.jsx: [{ id, productoNombre, estado, creado,
//   analisis: { iniciados, finales, merma, materiales:[{nombre,unidad,cantidad,costoTotal}], costoMateriales },
//   tareas:[{ procesoNombre, cantidad, estado }] }]. `totales` es el resumen del periodo.
const ESTADO_ORDEN_PDF = { pendiente: 'Pendiente', en_progreso: 'En progreso', terminada: 'Terminada' }
export function generarPdfFabricacion({ empresa, desde, hasta, ordenes, totales }) {
  const doc = new jsPDF()
  const marginX = 14
  const pageH = doc.internal.pageSize.getHeight()

  let y = drawEncabezadoEmpresa(doc, empresa, marginX)

  y = tituloDoc(doc, marginX, y, 'Reporte de Fabricación')

  doc.setFontSize(11)
  doc.setTextColor(90)
  doc.text(`Periodo: ${formatFecha(desde)} — ${formatFecha(hasta)}`, marginX, y)
  y += 8

  // Resumen del periodo (una tabla de totales)
  if (totales) {
    autoTable(doc, {
      startY: y,
      head: [['Órdenes', 'Terminadas', 'Iniciadas', 'Completadas', 'Merma', 'Costo materiales']],
      body: [[
        String(totales.ordenes), String(totales.terminadas), String(totales.iniciados),
        String(totales.completados), String(totales.merma), formatCOP(totales.costoMateriales),
      ]],
      styles: { fontSize: 9, halign: 'right' },
      headStyles: { fillColor: [37, 99, 235], halign: 'right' },
    })
    y = doc.lastAutoTable.finalY + 8
  }

  for (const o of ordenes) {
    if (y > pageH - 50) { doc.addPage(); y = 20 }

    doc.setFontSize(12)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text(`Orden #${o.id} — ${o.productoNombre || ''}`, marginX, y)
    doc.setFontSize(9)
    doc.setTextColor(...(o.estado === 'terminada' ? [22, 163, 74] : [180, 83, 9]))
    doc.text(ESTADO_ORDEN_PDF[o.estado] || o.estado, doc.internal.pageSize.getWidth() - marginX, y, { align: 'right' })
    doc.setFont(undefined, 'normal')
    y += 5

    doc.setFontSize(9)
    doc.setTextColor(90)
    doc.text(
      `Inicio: ${formatFecha(o.creado)}   ·   Iniciados: ${o.analisis.iniciados}   ·   Terminados: ${o.estado === 'terminada' ? o.analisis.finales : 0}   ·   Merma: ${o.analisis.merma}`,
      marginX, y
    )
    y += 3

    // Procesos de la orden
    if (o.tareas.length > 0) {
      autoTable(doc, {
        startY: y + 2,
        head: [['Proceso', 'Cantidad', 'Estado']],
        body: o.tareas.map((t) => [t.procesoNombre, String(t.cantidad), ESTADO_ORDEN_PDF[t.estado] || t.estado]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [100, 116, 139] },
        columnStyles: { 1: { halign: 'right' } },
      })
      y = doc.lastAutoTable.finalY + 3
    }

    // Materiales consumidos por la orden
    if (o.analisis.materiales.length > 0) {
      autoTable(doc, {
        startY: y + 1,
        head: [['Material', 'Cantidad', 'Unidad', 'Costo total']],
        body: o.analisis.materiales.map((m) => [m.nombre, String(m.cantidad), m.unidad, formatCOP(m.costoTotal)]),
        foot: [['Total materiales', '', '', formatCOP(o.analisis.costoMateriales)]],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [15, 118, 110] },
        footStyles: { fillColor: [226, 232, 240], textColor: 0, fontStyle: 'bold' },
        columnStyles: { 1: { halign: 'right' }, 3: { halign: 'right' } },
      })
      y = doc.lastAutoTable.finalY + 8
    } else {
      y += 6
    }
  }

  pieDePagina(doc, empresa, marginX)
  doc.save(`reporte_fabricacion_${desde}_a_${hasta}.pdf`)
}

// Genera el PDF del reporte detallado de materiales (entradas, salidas y stock disponible).
// `materiales` viene de GET /api/reportes/materiales: [{ nombre, unidad, stockActual,
// stockMinimo, entradas, salidas, neto, movimientos: [...] }]
export function generarPdfReporteMateriales({ empresa, desde, hasta, materiales, totalEntradas, totalSalidas, stockBajoCount, incluirMovimientos = true }) {
  const doc = new jsPDF()
  const marginX = 14
  const pageH = doc.internal.pageSize.getHeight()

  let y = drawEncabezadoEmpresa(doc, empresa, marginX)

  y = tituloDoc(doc, marginX, y, 'Reporte de Materiales')

  doc.setFontSize(11)
  doc.setTextColor(90)
  doc.text(`Periodo: ${formatFecha(desde)} — ${formatFecha(hasta)}`, marginX, y)
  y += 6
  doc.text(`Materiales: ${materiales.length}   ·   Entradas: ${totalEntradas}   ·   Salidas: ${totalSalidas}   ·   Stock bajo: ${stockBajoCount}`, marginX, y)
  y += 8

  // Resumen: una fila por material (entradas, salidas, neto, stock actual)
  autoTable(doc, {
    startY: y,
    head: [['Material', 'Unidad', 'Entradas', 'Salidas', 'Neto', 'Stock actual', 'Stock mínimo']],
    body: materiales.map((m) => [
      m.nombre,
      m.unidad,
      String(m.entradas),
      String(m.salidas),
      String(m.neto),
      String(m.stockActual),
      String(m.stockMinimo),
    ]),
    foot: [[
      'TOTALES', '', String(totalEntradas), String(totalSalidas),
      String(totalEntradas - totalSalidas), '', '',
    ]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
    footStyles: { fillColor: [226, 232, 240], textColor: 0, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: C.rowAlt },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    didParseCell: (data) => {
      if ([2, 3, 4, 5, 6].includes(data.column.index)) data.cell.styles.halign = 'right'
      // Resalta en rojo el stock actual cuando está en o bajo el mínimo
      if (data.section === 'body' && data.column.index === 5) {
        const m = materiales[data.row.index]
        if (m && m.stockActual <= m.stockMinimo) data.cell.styles.textColor = [220, 38, 38]
      }
    },
  })
  y = doc.lastAutoTable.finalY + 10

  // Detalle de movimientos por material (opcional, una tabla por material con producción)
  if (incluirMovimientos) {
    for (const m of materiales) {
      if (m.movimientos.length === 0) continue
      if (y > pageH - 40) { doc.addPage(); y = 20 }

      doc.setFontSize(11)
      doc.setFont(undefined, 'bold')
      doc.setTextColor(15, 23, 42)
      doc.text(`${m.nombre} (${m.unidad})`, marginX, y)
      doc.setFont(undefined, 'normal')
      y += 5

      autoTable(doc, {
        startY: y,
        head: [['Fecha', 'Tipo', 'Cantidad', 'Costo unitario', 'Descripción']],
        body: m.movimientos.map((mv) => [
          formatFecha(mv.fecha),
          mv.tipo === 'entrada' ? 'Entrada' : mv.tipo === 'salida' ? 'Salida' : mv.tipo,
          (mv.tipo === 'salida' ? '-' : '+') + mv.cantidad,
          formatCOP(mv.costoUnitario),
          mv.descripcion || '—',
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [100, 116, 139] },
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
        didParseCell: (data) => {
          if ([2, 3].includes(data.column.index)) data.cell.styles.halign = 'right'
          if (data.section === 'body') {
            const tipo = m.movimientos[data.row.index]?.tipo
            if (data.column.index === 2) data.cell.styles.textColor = tipo === 'salida' ? [220, 38, 38] : [22, 163, 74]
          }
        },
      })
      y = doc.lastAutoTable.finalY + 8
    }
  }

  pieDePagina(doc, empresa, marginX)
  doc.save(`reporte_materiales_${desde}_a_${hasta}.pdf`)
}

// Dibuja el registro fotográfico de las tareas: cada foto con su fecha y su nota.
// `fotos` es un array de { imagen (dataURL), fecha, descripcion }. Devuelve la nueva Y.
function dibujarRegistroFotografico(doc, marginX, y, fotos) {
  if (!fotos || fotos.length === 0) return y

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const fotoW = 55            // ancho de cada foto
  const maxFotoH = 45         // alto máximo de cada foto
  const gap = 10              // espacio entre columnas
  const colX = [marginX, marginX + fotoW + gap] // dos columnas

  // Título de la sección
  y += 4
  doc.setFont(undefined, 'bold')
  doc.setFontSize(12)
  doc.setTextColor(15, 23, 42)
  doc.text('Registro fotográfico', marginX, y)
  doc.setFont(undefined, 'normal')
  y += 6

  let col = 0
  let filaTopY = y
  let maxAltoFila = 0

  for (const f of fotos) {
    if (!f.imagen) continue
    let imgW = fotoW
    let imgH = maxFotoH
    try {
      const props = doc.getImageProperties(f.imagen)
      imgH = Math.min(maxFotoH, (props.height * fotoW) / props.width)
    } catch {
      continue // imagen inválida → se omite
    }

    // Nota + fecha ocupan unas líneas debajo de la imagen
    const nota = f.descripcion ? f.descripcion.trim() : ''
    const fechaTxt = f.fecha ? formatFecha(f.fecha) : ''
    const textoLineas = doc.splitTextToSize(
      [fechaTxt, nota].filter(Boolean).join(' — ') || 'Sin nota',
      fotoW
    )
    const altoCelda = imgH + 3 + textoLineas.length * 4 + 6

    // Salto de página si no cabe la fila
    if (filaTopY + altoCelda > pageH - 40) {
      doc.addPage()
      filaTopY = 20
      y = 20
      col = 0
      maxAltoFila = 0
    }

    const x = colX[col]
    const fmt = String(f.imagen).startsWith('data:image/png') ? 'PNG' : 'JPEG'
    doc.addImage(f.imagen, fmt, x, filaTopY, imgW, imgH)

    doc.setFontSize(8)
    doc.setTextColor(90)
    doc.text(textoLineas, x, filaTopY + imgH + 4)

    maxAltoFila = Math.max(maxAltoFila, altoCelda)
    col++
    if (col >= 2) {
      col = 0
      filaTopY += maxAltoFila
      maxAltoFila = 0
    }
  }

  // Si quedó una foto sola en la fila, avanzar igual
  if (col === 1) filaTopY += maxAltoFila

  doc.setTextColor(0)
  return filaTopY + 4
}

// Dibuja un sello inclinado de "PAGADO" en la esquina superior derecha del comprobante.
function dibujarSelloPagado(doc, marginX) {
  const pageW = doc.internal.pageSize.getWidth()
  const cx = pageW - marginX - 22 // centro del sello
  const cy = 54
  const verde = [22, 163, 74]

  doc.saveGraphicsState()
  // Rotamos alrededor del centro del sello
  const rad = (-18 * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  doc.setDrawColor(...verde)
  doc.setTextColor(...verde)
  doc.setLineWidth(1.6)

  // Marco rectangular con esquinas redondeadas, rotado manualmente
  const w = 44
  const h = 16
  const pts = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([px, py]) => [cx + px * cos - py * sin, cy + px * sin + py * cos])
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    doc.line(a[0], a[1], b[0], b[1])
  }

  doc.setFont(undefined, 'bold')
  doc.setFontSize(20)
  doc.text('PAGADO', cx, cy + 2, { align: 'center', angle: 18 })
  doc.setFont(undefined, 'normal')
  doc.restoreGraphicsState()
  doc.setTextColor(0)
}

// Dibuja las líneas de firma del representante y del empleado en la parte inferior.
function dibujarFirmas(doc, marginX, empleado, empresa) {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const y = pageH - 34 // por encima del pie de página
  const anchoCol = (pageW - marginX * 2 - 20) / 2
  const x1 = marginX
  const x2 = marginX + anchoCol + 20

  doc.setDrawColor(120)
  doc.setLineWidth(0.4)
  doc.line(x1, y, x1 + anchoCol, y)
  doc.line(x2, y, x2 + anchoCol, y)

  doc.setFontSize(9)
  doc.setTextColor(90)
  doc.text('Firma del representante', x1, y + 5)
  if (empresa?.nombre) doc.text(empresa.nombre, x1, y + 10)

  doc.text('Firma del empleado', x2, y + 5)
  if (empleado?.nombre) doc.text(empleado.nombre, x2, y + 10)
  doc.setTextColor(0)
}

function pieDePagina(doc, empresa, marginX) {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const nPags = doc.getNumberOfPages()

  // Aplica el footer a TODAS las páginas del documento
  for (let i = 1; i <= nPags; i++) {
    doc.setPage(i)
    // Línea separadora
    doc.setDrawColor(...C.primary)
    doc.setLineWidth(0.5)
    doc.line(marginX, pageH - 16, pageW - marginX, pageH - 16)

    // Texto izquierda: empresa
    doc.setFontSize(8)
    doc.setTextColor(...C.muted)
    const texto = empresa?.nombre ? `${empresa.nombre} · Sistema de Nómina` : 'Generado por Sistema de Nómina'
    doc.text(texto, marginX, pageH - 10)

    // Número de página derecha
    if (nPags > 1) {
      doc.text(`Página ${i} de ${nPags}`, pageW - marginX, pageH - 10, { align: 'right' })
    }
  }
  doc.setTextColor(...C.dark)
}

// Genera y descarga el PDF de un costeo de producto.
// `r` es el objeto de resultados de calcularCosteo(); `nombre` el nombre del costeo.
export function generarPdfCosteo({ empresa, nombre, r }) {
  const doc = new jsPDF()
  const marginX = 14

  let y = drawEncabezadoEmpresa(doc, empresa, marginX)

  y = tituloDoc(doc, marginX, y, 'Costeo y rentabilidad')

  doc.setFontSize(12)
  doc.setTextColor(90)
  doc.text(`Producto: ${nombre || '—'}`, marginX, y)
  y += 6

  // Desglose de costos por categoría
  const totalDesglose = r.desglose.reduce((s, d) => s + d.valor, 0)
  autoTable(doc, {
    startY: y,
    head: [['Categoría de costo', 'Costo por unidad', '% del costo']],
    body: r.desglose.map((d) => [
      d.categoria,
      formatCOP(d.valor),
      totalDesglose > 0 ? `${((d.valor / totalDesglose) * 100).toFixed(1)}%` : '0%',
    ]),
    foot: [['Costo total unitario', formatCOP(r.costoTotalUnit), '100%']],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [37, 99, 235] },
    footStyles: { fillColor: [226, 232, 240], textColor: 0, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: C.rowAlt },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    didParseCell: (data) => {
      if ([1, 2].includes(data.column.index)) data.cell.styles.halign = 'right'
    },
  })
  y = doc.lastAutoTable.finalY + 8

  // Rentabilidad
  doc.setFontSize(11)
  doc.setTextColor(0)
  doc.text(`Precio de venta: ${formatCOP(r.precioVenta)}`, marginX, y); y += 6
  doc.text(`Ganancia unitaria: ${formatCOP(r.gananciaUnit)}`, marginX, y); y += 6
  doc.text(`Margen: ${r.margenPct.toFixed(1)}%   ·   Markup: ${r.markupPct.toFixed(1)}%`, marginX, y); y += 8

  // Escenarios de descuento por volumen
  if (r.escenarios.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Tramo', '% desc.', 'Precio c/desc.', 'Ganancia und.', 'Ganancia tramo', 'Alerta']],
      body: r.escenarios.map((e) => [
        `${e.min}${e.max == null ? '+' : '–' + e.max}`,
        `${e.descuentoPct}%`,
        formatCOP(e.precioDesc),
        formatCOP(e.gananciaDescUnit),
        formatCOP(e.gananciaTramo),
        e.alerta ? '⚠' : '',
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
      alternateRowStyles: { fillColor: C.rowAlt },
      columnStyles: {
        1: { halign: 'right' }, 2: { halign: 'right' },
        3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'center' },
      },
      didParseCell: (data) => {
        if ([1, 2, 3, 4].includes(data.column.index)) data.cell.styles.halign = 'right'
        if (data.column.index === 5) data.cell.styles.halign = 'center'
        // Marca en rojo las filas con alerta (ganancia negativa o bajo el margen mínimo)
        if (data.section === 'body' && r.escenarios[data.row.index]?.alerta) {
          data.cell.styles.textColor = [220, 38, 38]
        }
      },
    })
    y = doc.lastAutoTable.finalY + 6
    doc.setFontSize(9)
    doc.setTextColor(150)
    doc.text(`Ganancia original (sin descuento): ${formatCOP(r.gananciaUnit)} por unidad · margen mínimo: ${r.margenMinimo}%`, marginX, y)
  }

  pieDePagina(doc, empresa, marginX)
  doc.save(`costeo_${(nombre || 'producto').replace(/\s+/g, '_')}.pdf`)
}

// Dibuja el título del documento con subrayado de acento. Devuelve nueva Y.
function tituloDoc(doc, marginX, y, titulo, subtitulo) {
  const pageW = doc.internal.pageSize.getWidth()
  doc.setFont(undefined, 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...C.dark)
  doc.text(titulo, marginX, y)
  // Subrayado corto en azul
  const w = Math.min(doc.getTextWidth(titulo), pageW * 0.6)
  doc.setDrawColor(...C.primary)
  doc.setLineWidth(1.5)
  doc.line(marginX, y + 2, marginX + w, y + 2)
  y += 9
  if (subtitulo) {
    doc.setFont(undefined, 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...C.muted)
    doc.text(subtitulo, marginX, y)
    y += 6
  }
  doc.setFont(undefined, 'normal')
  doc.setTextColor(...C.dark)
  return y
}

// Dibuja un bloque de metadatos (etiqueta: valor) con fondo sutil.
function metaDatos(doc, marginX, y, filas) {
  const pageW = doc.internal.pageSize.getWidth()
  const padH = 5, padV = 4, altoLinea = 6
  const alto = filas.length * altoLinea + padV * 2
  doc.setFillColor(...C.rowAlt)
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.25)
  doc.roundedRect(marginX, y, pageW - marginX * 2, alto, 2, 2, 'FD')
  let ly = y + padV + altoLinea * 0.75
  for (const [etiqueta, valor] of filas) {
    doc.setFontSize(9)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(...C.muted)
    doc.text(etiqueta, marginX + padH, ly)
    doc.setFont(undefined, 'normal')
    doc.setTextColor(...C.dark)
    doc.text(String(valor || '—'), marginX + padH + 28, ly)
    ly += altoLinea
  }
  return y + alto + 6
}
// `venta` trae { codigo, id, clienteNombre, fecha, total, pagado, saldo, estadoPago,
//   comentario, items:[...], pagos:[...] }. Devuelve el objeto jsPDF.
const ESTADO_PAGO_PDF = { pagado: 'PAGADO', parcial: 'ABONO PARCIAL', pendiente: 'PENDIENTE' }
export function construirDocVenta({ empresa, venta, cliente }) {
  const doc = new jsPDF()
  const marginX = 14
  const pageW = doc.internal.pageSize.getWidth()

  let y = drawEncabezadoEmpresa(doc, empresa, marginX)

  y = tituloDoc(doc, marginX, y, `Factura de venta ${venta.codigo || '#' + venta.id}`)

  // Datos del cliente y la fecha
  doc.setFontSize(11)
  doc.setTextColor(90)
  const nombreCliente = (cliente ? `${cliente.nombre || ''} ${cliente.apellidos || ''}`.trim() : '') || venta.clienteNombre || 'Sin cliente'
  doc.text(`Cliente: ${nombreCliente}`, marginX, y); y += 6
  if (cliente?.cedula) { doc.text(`Cédula/NIT: ${cliente.cedula}`, marginX, y); y += 6 }
  if (cliente?.telefono) { doc.text(`Teléfono: ${cliente.telefono}`, marginX, y); y += 6 }
  if (cliente?.direccion) { doc.text(`Dirección: ${cliente.direccion}`, marginX, y); y += 6 }
  if (cliente?.municipio) { doc.text(`Municipio: ${cliente.municipio}`, marginX, y); y += 6 }
  if (venta.fecha) { doc.text(`Fecha: ${formatFecha(venta.fecha)}`, marginX, y); y += 6 }
  y += 2

  // ¿Hay descuentos por producto? Solo entonces mostramos la columna "Desc."
  const hayDescLinea = venta.items.some((it) => (Number(it.descuentoPct) || 0) > 0)
  const head = hayDescLinea
    ? [['Producto', 'Color', 'Cantidad', 'Precio', 'Desc.', 'Subtotal']]
    : [['Producto', 'Color', 'Cantidad', 'Precio', 'Subtotal']]
  const colsNum = hayDescLinea ? [2, 3, 4, 5] : [2, 3, 4]
  autoTable(doc, {
    startY: y,
    head,
    body: venta.items.map((it) => {
      const bruto = (Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0)
      const sub = it.subtotal != null ? it.subtotal : bruto
      const fila = [it.productoNombre || '', it.colorNombre || '—', String(it.cantidad), formatCOP(it.precioUnitario)]
      if (hayDescLinea) fila.push((Number(it.descuentoPct) || 0) > 0 ? `${it.descuentoPct}%` : '—')
      fila.push(formatCOP(sub))
      return fila
    }),
    styles: { fontSize: 10 },
    headStyles: { fillColor: [37, 99, 235] },
    alternateRowStyles: { fillColor: C.rowAlt },
    didParseCell: (data) => {
      if (colsNum.includes(data.column.index)) data.cell.styles.halign = 'right'
    },
  })
  y = doc.lastAutoTable.finalY + 8

  // Resumen de pago en recuadro destacado (con desglose de descuento si aplica)
  const lineasTot = []
  const descPct = Number(venta.descuentoPct) || 0
  const bruto = venta.subtotalBruto != null ? venta.subtotalBruto : venta.total
  if (bruto > venta.total + 0.5) {
    lineasTot.push({ etiqueta: 'Subtotal', valor: formatCOP(bruto) })
    lineasTot.push({ etiqueta: descPct > 0 ? `Descuento (${descPct}%)` : 'Descuento', valor: `-${formatCOP(bruto - venta.total)}` })
  }
  lineasTot.push({ etiqueta: 'Total', valor: formatCOP(venta.total), destacado: true })
  if (venta.anticipoAplicado > 0) lineasTot.push({ etiqueta: 'Anticipo aplicado', valor: formatCOP(venta.anticipoAplicado) })
  lineasTot.push({ etiqueta: 'Pagado', valor: formatCOP(venta.pagado) })
  if ((venta.saldo || 0) > 0) lineasTot.push({ etiqueta: 'Saldo pendiente', valor: formatCOP(venta.saldo), destacado: true })
  y = cajaTotales(doc, marginX, y, lineasTot)

  // Historial de abonos (si hay más de uno o hay saldo)
  if (venta.pagos && venta.pagos.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Fecha del pago', 'Comentario', 'Método', 'Monto']],
      body: venta.pagos.map((p) => [
        formatFecha(p.fecha),
        p.comentario || '—',
        p.metodo === 'transferencia' ? 'Transferencia' : 'Efectivo',
        formatCOP(p.monto),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [100, 116, 139] },
      alternateRowStyles: { fillColor: C.rowAlt },
      didParseCell: (data) => { if (data.column.index === 3) data.cell.styles.halign = 'right' },
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // Sello del estado de pago
  dibujarSelloEstado(doc, marginX, ESTADO_PAGO_PDF[venta.estadoPago] || '', venta.estadoPago)

  // Comentario / observaciones
  if (venta.comentario && venta.comentario.trim()) {
    doc.setFontSize(11)
    doc.setTextColor(15, 23, 42)
    doc.setFont(undefined, 'bold')
    doc.text('Observaciones:', marginX, y)
    doc.setFont(undefined, 'normal')
    doc.setFontSize(10)
    doc.setTextColor(90)
    const lineas = doc.splitTextToSize(venta.comentario.trim(), pageW - marginX * 2)
    doc.text(lineas, marginX, y + 6)
    y += 6 + lineas.length * 5
  }

  pieDePagina(doc, empresa, marginX)
  return doc
}

export function generarPdfVenta({ empresa, venta, cliente }) {
  const doc = construirDocVenta({ empresa, venta, cliente })
  doc.save(`venta_${venta.codigo || venta.id}.pdf`)
}

export function ventaPdfFile({ empresa, venta, cliente }) {
  const doc = construirDocVenta({ empresa, venta, cliente })
  const blob = doc.output('blob')
  return new File([blob], `venta_${venta.codigo || venta.id}.pdf`, { type: 'application/pdf' })
}

// Abre el PDF de la venta en una pestaña y lanza el diálogo de impresión.
export function imprimirVenta({ empresa, venta, cliente }) {
  const doc = construirDocVenta({ empresa, venta, cliente })
  doc.autoPrint()
  const url = doc.output('bloburl')
  window.open(url, '_blank')
}

// Sello inclinado con el estado de pago (verde=pagado, ámbar=parcial, rojo=pendiente).
// El recuadro se ajusta al ancho del texto para que las letras nunca se salgan.
function dibujarSelloEstado(doc, marginX, texto, estado) {
  if (!texto) return
  const pageW = doc.internal.pageSize.getWidth()
  const cy = 52
  const color = estado === 'pagado' ? [22, 163, 74] : estado === 'parcial' ? [180, 83, 9] : [220, 38, 38]

  doc.saveGraphicsState()
  doc.setFont(undefined, 'bold')
  doc.setFontSize(13)

  // Ancho del recuadro = ancho real del texto + padding lateral
  const textoW = doc.getTextWidth(texto)
  const w = textoW + 12
  const h = 15
  const rad = (-18 * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)

  // Centro: dejamos que el borde derecho del recuadro rotado quede dentro del margen
  const halfExtentX = Math.abs((w / 2) * cos) + Math.abs((h / 2) * sin)
  const cx = pageW - marginX - halfExtentX - 2

  doc.setDrawColor(...color)
  doc.setTextColor(...color)
  doc.setLineWidth(1.4)
  const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([px, py]) => [cx + px * cos - py * sin, cy + px * sin + py * cos])
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    doc.line(a[0], a[1], b[0], b[1])
  }
  doc.text(texto, cx, cy + 1, { align: 'center', angle: 18 })
  doc.setFont(undefined, 'normal')
  doc.restoreGraphicsState()
  doc.setTextColor(0)
}

// Construye (sin guardar) el documento PDF de un pedido / cotización.
// `pedido` trae { id, clienteNombre, estado, fechaEntrega, comentario, total, items:[...] }.
// `cliente` (opcional) aporta datos de contacto. Devuelve el objeto jsPDF.
const ESTADO_PEDIDO_PDF = { pendiente: 'Pendiente', entregado: 'Entregado', anulado: 'Anulado' }
export function construirDocPedido({ empresa, pedido, cliente }) {
  const doc = new jsPDF()
  const marginX = 14
  const pageW = doc.internal.pageSize.getWidth()

  let y = drawEncabezadoEmpresa(doc, empresa, marginX)

  const yTitulo = y
  y = tituloDoc(doc, marginX, y, `Pedido #${pedido.id}`)
  // Estado a la derecha, alineado con el título
  doc.setFont(undefined, 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...(pedido.estado === 'entregado' ? C.success : pedido.estado === 'anulado' ? C.danger : C.warning))
  doc.text((ESTADO_PEDIDO_PDF[pedido.estado] || pedido.estado).toUpperCase(), pageW - marginX, yTitulo, { align: 'right' })
  doc.setFont(undefined, 'normal')
  doc.setTextColor(...C.dark)

  // Datos del cliente y la entrega
  doc.setFontSize(11)
  doc.setTextColor(90)
  const nombreCliente = pedido.clienteNombre || (cliente ? `${cliente.nombre || ''} ${cliente.apellidos || ''}`.trim() : '') || 'Sin cliente'
  doc.text(`Cliente: ${nombreCliente}`, marginX, y); y += 6
  if (cliente?.telefono) { doc.text(`Teléfono: ${cliente.telefono}`, marginX, y); y += 6 }
  if (pedido.fechaEntrega) { doc.text(`Fecha de entrega: ${formatFecha(pedido.fechaEntrega)}`, marginX, y); y += 6 }
  y += 2

  // Detalle de productos (con color si aplica)
  autoTable(doc, {
    startY: y,
    head: [['Producto', 'Color', 'Cantidad', 'Precio', 'Subtotal']],
    body: pedido.items.map((it) => [
      it.productoNombre || '',
      it.colorNombre || '—',
      String(it.cantidad),
      formatCOP(it.precioUnitario),
      formatCOP(it.subtotal != null ? it.subtotal : (Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0)),
    ]),
    styles: { fontSize: 10 },
    headStyles: { fillColor: [37, 99, 235] },
    alternateRowStyles: { fillColor: C.rowAlt },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    didParseCell: (data) => {
      if ([2, 3, 4].includes(data.column.index)) data.cell.styles.halign = 'right'
    },
  })
  y = doc.lastAutoTable.finalY + 8
  y = cajaTotales(doc, marginX, y, [{ etiqueta: 'TOTAL', valor: formatCOP(pedido.total), destacado: true }])

  // Comentario / observaciones
  if (pedido.comentario && pedido.comentario.trim()) {
    doc.setFontSize(11)
    doc.setTextColor(15, 23, 42)
    doc.setFont(undefined, 'bold')
    doc.text('Observaciones:', marginX, y)
    doc.setFont(undefined, 'normal')
    doc.setFontSize(10)
    doc.setTextColor(90)
    const lineas = doc.splitTextToSize(pedido.comentario.trim(), pageW - marginX * 2)
    doc.text(lineas, marginX, y + 6)
    y += 6 + lineas.length * 5
  }

  pieDePagina(doc, empresa, marginX)
  return doc
}

// Descarga el PDF del pedido.
export function generarPdfPedido({ empresa, pedido, cliente }) {
  const doc = construirDocPedido({ empresa, pedido, cliente })
  doc.save(`pedido_${pedido.id}.pdf`)
}

// Devuelve el PDF del pedido como File (para compartir por Web Share API / WhatsApp).
export function pedidoPdfFile({ empresa, pedido, cliente }) {
  const doc = construirDocPedido({ empresa, pedido, cliente })
  const blob = doc.output('blob')
  return new File([blob], `pedido_${pedido.id}.pdf`, { type: 'application/pdf' })
}

// Arma un CSV a partir de filas (array de arrays) y lo descarga.
// Se abre directo en Excel. Usa ; como separador (locale es-CO) y BOM para acentos.
export function descargarCSV(nombreArchivo, filas) {
  const escapar = (v) => {
    const s = String(v ?? '')
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const contenido = '﻿' + filas.map((fila) => fila.map(escapar).join(';')).join('\n')
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  a.click()
  URL.revokeObjectURL(url)
}

// ── Cortes y Planos ─────────────────────────────────────────────────────────
// Paleta de piezas (misma idea que PlanoCorte.jsx) para el plano en el PDF.
const COLORES_PIEZA = [
  [147, 197, 253], [167, 243, 208], [252, 211, 77], [252, 165, 165],
  [196, 181, 253], [249, 168, 212], [94, 234, 212], [253, 186, 116],
]
function colorDePieza(nombre) {
  let h = 0
  const s = String(nombre || '')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % COLORES_PIEZA.length
  return COLORES_PIEZA[h]
}
const cm1 = (mm) => (Math.round(Number(mm) * 10) / 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })

// Dibuja una lámina con sus piezas colocadas, a escala, dentro del ancho dado.
// Coordenadas de piezas en mm. Devuelve la nueva Y tras el dibujo.
function dibujarLaminaPdf(doc, x, y, anchoDisp, lamina, piezas) {
  const escala = anchoDisp / lamina.ancho
  const w = lamina.ancho * escala
  const h = lamina.largo * escala

  // Contorno de la lámina
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(...C.dark)
  doc.setLineWidth(0.5)
  doc.rect(x, y, w, h, 'FD')

  // Piezas
  for (const p of piezas) {
    const px = x + p.x * escala
    const py = y + p.y * escala
    const pw = p.ancho * escala
    const ph = p.largo * escala
    doc.setFillColor(...colorDePieza(p.nombre))
    doc.setDrawColor(30, 41, 59)
    doc.setLineWidth(0.3)
    doc.rect(px, py, pw, ph, 'FD')
    // Etiqueta solo si la pieza tiene espacio suficiente
    if (pw > 16 && ph > 9) {
      doc.setFontSize(6.5)
      doc.setTextColor(...C.dark)
      const etiqueta = `${p.nombre}`
      const medida = `${cm1(p.ancho)}x${cm1(p.largo)}${p.rotada ? ' ↻' : ''}`
      doc.text(doc.splitTextToSize(etiqueta, pw - 2), px + pw / 2, py + ph / 2 - 1, { align: 'center' })
      doc.setFontSize(6)
      doc.setTextColor(...C.muted)
      doc.text(medida, px + pw / 2, py + ph / 2 + 3, { align: 'center' })
    }
  }
  doc.setTextColor(...C.dark)
  return y + h
}

// Incrusta la imagen del dibujo del mueble (PNG dataURL) centrada y a escala.
// Devuelve la nueva Y. Máximo 85 mm de alto para dejar espacio al plano.
function dibujarDisenoPdf(doc, marginX, y, img) {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  let props
  try { props = doc.getImageProperties(img) } catch { return y }
  const maxW = pageW - marginX * 2
  const maxH = 85
  let w = maxW
  let h = (props.height * w) / props.width
  if (h > maxH) { h = maxH; w = (props.width * h) / props.height }

  if (y + h + 14 > pageH - 20) { doc.addPage(); y = 20 }

  doc.setFontSize(11)
  doc.setFont(undefined, 'bold')
  doc.setTextColor(...C.dark)
  doc.text('Diseño del mueble', marginX, y)
  doc.setFont(undefined, 'normal')
  y += 4

  const x = marginX + (maxW - w) / 2 // centrado
  // Marco sutil detrás del dibujo
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)
  doc.roundedRect(x - 3, y - 3, w + 6, h + 6, 2, 2, 'FD')
  doc.addImage(img, 'PNG', x, y, w, h)
  return y + h + 10
}

// Genera y descarga el PDF del plan de corte optimizado.
// `resultado` = salida de calcularCorte(); `config` = { productoNombre, unidades,
// sierra, costoLamina }; `disenoImg` = PNG del dibujo. Medidas mostradas en cm.
export function generarPdfCortes({ empresa, resultado: r, config = {}, disenoImg = null }) {
  const doc = new jsPDF()
  const marginX = 14
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  let y = drawEncabezadoEmpresa(doc, empresa, marginX)
  y = tituloDoc(doc, marginX, y, 'Plan de corte', config.productoNombre || undefined)

  // Metadatos del corte
  const filas = [
    ['Lámina', `${cm1(r.lamina.ancho)} × ${cm1(r.lamina.largo)} cm${r.lamina.espesor ? ` · ${r.lamina.espesor} mm` : ''}`],
    ['Unidades', String(config.unidades || 1)],
    ['Sierra/disco', `${config.sierra ?? '—'} mm`],
  ]
  y = metaDatos(doc, marginX, y, filas)

  // Dibujo del mueble (si se generó por medidas), centrado y a escala.
  if (disenoImg) y = dibujarDisenoPdf(doc, marginX, y, disenoImg)

  // Resumen de resultados (tabla de una fila)
  autoTable(doc, {
    ...T(),
    startY: y,
    head: [['Láminas', 'Desperdicio', 'Costo total', 'Costo desperdiciado', 'Retazo mayor']],
    body: [[
      String(r.cantidadLaminas),
      `${r.desperdicioPct}%`,
      formatCOP(r.costoTotal),
      formatCOP(Math.round(r.costoTotal * r.desperdicioPct / 100)),
      r.retazoMayor?.ancho > 0 ? `${cm1(r.retazoMayor.ancho)} × ${cm1(r.retazoMayor.largo)} cm` : '—',
    ]],
    columnStyles: { 0: { halign: 'right' }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  })
  y = doc.lastAutoTable.finalY + 6

  if (r.sinCabida?.length > 0) {
    doc.setFontSize(9)
    doc.setTextColor(...C.danger)
    const txt = `⚠ ${r.sinCabida.length} pieza(s) no caben en la lámina: ${r.sinCabida.map((p) => p.nombre).join(', ')}`
    const ls = doc.splitTextToSize(txt, pageW - marginX * 2)
    doc.text(ls, marginX, y)
    y += ls.length * 4 + 4
    doc.setTextColor(...C.dark)
  }

  // Lista consolidada de piezas (agrupadas por nombre + medida)
  y = tablaPiezasCortes(doc, marginX, y, r)

  // Planos de cada lámina, uno por bloque
  const anchoDisp = pageW - marginX * 2
  for (const lam of r.laminas) {
    const escala = anchoDisp / r.lamina.ancho
    const altoPlano = r.lamina.largo * escala
    // Salto de página si el plano no cabe en lo que queda
    if (y + altoPlano + 18 > pageH - 20) { doc.addPage(); y = 20 }
    doc.setFontSize(11)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(...C.dark)
    doc.text(`Lámina ${lam.indice} de ${r.cantidadLaminas}`, marginX, y)
    doc.setFont(undefined, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...C.muted)
    doc.text(`${cm1(r.lamina.ancho)} × ${cm1(r.lamina.largo)} cm · ${lam.piezas.length} pieza(s)`, pageW - marginX, y, { align: 'right' })
    y += 3
    doc.setTextColor(...C.dark)
    y = dibujarLaminaPdf(doc, marginX, y, anchoDisp, r.lamina, lam.piezas) + 10
  }

  pieDePagina(doc, empresa, marginX)
  const nombre = (config.productoNombre || 'mueble').replace(/\s+/g, '_')
  doc.save(`plan_corte_${nombre}.pdf`)
}

// Exporta el despiece (piezas) a CSV para abrir en Excel. Medidas en cm.
// `piezas` = filas de la tabla del generador/manual: { nombre, ancho, alto,
// cantidad, permiteRotar }. Se asume ancho/alto ya en cm (como los muestra la UI).
export function exportarDespieceCSV({ productoNombre, piezas }) {
  const filas = [['Pieza', 'Ancho (cm)', 'Alto (cm)', 'Cantidad', 'Veta']]
  for (const p of piezas) {
    if (!String(p.nombre || '').trim()) continue
    filas.push([
      p.nombre, p.ancho, p.alto, p.cantidad || 1,
      p.permiteRotar ? 'libre' : 'fija',
    ])
  }
  const nombre = (productoNombre || 'mueble').replace(/\s+/g, '_')
  descargarCSV(`despiece_${nombre}.csv`, filas)
}

// Tabla consolidada de piezas del plan de corte (cuenta total por tipo).
function tablaPiezasCortes(doc, marginX, y, r) {
  const conteo = new Map()
  for (const lam of r.laminas) {
    for (const p of lam.piezas) {
      const key = `${p.nombre}|${Math.round(p.ancho)}|${Math.round(p.largo)}`
      const ex = conteo.get(key)
      if (ex) ex.cant++
      else conteo.set(key, { nombre: p.nombre, ancho: p.ancho, largo: p.largo, cant: 1 })
    }
  }
  const filas = [...conteo.values()]
  if (!filas.length) return y
  const total = filas.reduce((s, f) => s + f.cant, 0)
  autoTable(doc, {
    ...T(),
    startY: y,
    head: [['Pieza', 'Ancho (cm)', 'Alto (cm)', 'Cantidad']],
    body: filas.map((f) => [f.nombre, cm1(f.ancho), cm1(f.largo), String(f.cant)]),
    foot: [['Total piezas', '', '', String(total)]],
    footStyles: { fillColor: C.headBg, textColor: C.dark, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    didParseCell: (data) => { if ([1, 2, 3].includes(data.column.index)) data.cell.styles.halign = 'right' },
  })
  return doc.lastAutoTable.finalY + 8
}

// ── Pegatinas QR de garantía ────────────────────────────────────────────────
// Texto que queda embebido en el QR (se lee sin internet con cualquier escáner).
function textoGarantiaQR({ empresaNombre, productoNombre, colorNombre, ordenId, unidad, procesos }) {
  const l = []
  l.push(`GARANTIA${empresaNombre ? ' - ' + empresaNombre : ''}`)
  l.push(`Producto: ${productoNombre}${colorNombre ? ' (' + colorNombre + ')' : ''}`)
  l.push(`Orden de produccion: #${ordenId}`)
  l.push(`Folio: ${unidad.folio}`)
  if (unidad.fechaProduccion) l.push(`Producido: ${formatFecha(unidad.fechaProduccion)}`)
  l.push(`Garantia: ${unidad.garantiaMeses} meses${unidad.garantiaHasta ? ' (hasta ' + formatFecha(unidad.garantiaHasta) + ')' : ''}`)
  if (procesos?.length) l.push(`Procesos: ${procesos.join(', ')}`)
  return l.join('\n')
}

// Genera un PDF con una pegatina por unidad (2 columnas), cada una con su QR y los
// datos de garantía. `unidades` = salida de getUnidadesOrden; `procesos` = nombres
// de las etapas por las que pasó el producto. Es async (genera los QR primero).
export async function generarPdfPegatinas({ empresa, ordenId, productoNombre, colorNombre, unidades, procesos = [] }) {
  const QRCode = (await import('qrcode')).default
  const empresaNombre = empresa?.nombre || ''

  // Pre-genera el dataURL del QR de cada unidad (alta corrección de errores).
  const qrs = await Promise.all(unidades.map((u) =>
    QRCode.toDataURL(
      textoGarantiaQR({ empresaNombre, productoNombre, colorNombre, ordenId, unidad: u, procesos }),
      { errorCorrectionLevel: 'M', margin: 1, width: 300 }
    ).catch(() => null)
  ))

  const doc = new jsPDF()
  dibujarHojaPegatinas(doc, { empresaNombre, ordenId, productoNombre, colorNombre, unidades, qrs })
  doc.save(`pegatinas_orden_${ordenId}.pdf`)
}

// Dibuja la grilla de pegatinas (2 columnas). Cada pegatina: QR a la izquierda,
// datos a la derecha, dentro de un recuadro punteado para recortar.
function dibujarHojaPegatinas(doc, { empresaNombre, ordenId, productoNombre, colorNombre, unidades, qrs }) {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const marginX = 12, marginTop = 14
  const cols = 2
  const gap = 6
  const stickerW = (pageW - marginX * 2 - gap * (cols - 1)) / cols
  const stickerH = 44
  const qrSize = 34

  let idx = 0
  let y = marginTop
  while (idx < unidades.length) {
    if (y + stickerH > pageH - 10) { doc.addPage(); y = marginTop }
    for (let c = 0; c < cols && idx < unidades.length; c++) {
      const x = marginX + c * (stickerW + gap)
      dibujarUnaPegatina(doc, x, y, stickerW, stickerH, qrSize, {
        empresaNombre, ordenId, productoNombre, colorNombre,
        unidad: unidades[idx], qr: qrs[idx],
      })
      idx++
    }
    y += stickerH + gap
  }
}

function dibujarUnaPegatina(doc, x, y, w, h, qrSize, { empresaNombre, ordenId, productoNombre, colorNombre, unidad, qr }) {
  // Recuadro punteado (guía de corte)
  doc.setDrawColor(...C.muted)
  doc.setLineWidth(0.2)
  doc.setLineDashPattern([1, 1], 0)
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'S')
  doc.setLineDashPattern([], 0)

  const pad = 3
  const qrY = y + (h - qrSize) / 2
  if (qr) doc.addImage(qr, 'PNG', x + pad, qrY, qrSize, qrSize)

  // Bloque de texto a la derecha del QR
  const tx = x + pad + qrSize + 3
  const tw = w - (pad + qrSize + 3) - pad
  let ty = y + pad + 3

  if (empresaNombre) {
    doc.setFont(undefined, 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...C.primary)
    doc.text(doc.splitTextToSize(empresaNombre, tw), tx, ty)
    ty += 4
  }

  doc.setFont(undefined, 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...C.dark)
  const nombreLineas = doc.splitTextToSize(productoNombre + (colorNombre ? ` (${colorNombre})` : ''), tw)
  doc.text(nombreLineas.slice(0, 2), tx, ty)
  ty += nombreLineas.slice(0, 2).length * 3.6 + 1.5

  doc.setFont(undefined, 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...C.dark)
  doc.text(`Orden #${ordenId}  ·  ${unidad.folio}`, tx, ty); ty += 3.8
  if (unidad.fechaProduccion) { doc.text(`Producido: ${formatFecha(unidad.fechaProduccion)}`, tx, ty); ty += 3.8 }

  doc.setFont(undefined, 'bold')
  doc.setTextColor(...C.success)
  const gTxt = `Garantia: ${unidad.garantiaMeses} meses`
  doc.text(gTxt, tx, ty); ty += 3.6
  if (unidad.garantiaHasta) {
    doc.setFont(undefined, 'normal')
    doc.setTextColor(...C.muted)
    doc.setFontSize(6.5)
    doc.text(`hasta ${formatFecha(unidad.garantiaHasta)}`, tx, ty)
  }
  doc.setTextColor(...C.dark)
}


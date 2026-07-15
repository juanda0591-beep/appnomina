import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCOP, formatFecha } from './format.js'

// Dibuja el encabezado con los datos de la empresa y el logo.
// Devuelve la posición Y donde puede continuar el contenido.
function drawEncabezadoEmpresa(doc, empresa, marginX) {
  const pageW = doc.internal.pageSize.getWidth()
  const topY = 14 // tope común para logo y texto

  // 1) Medir el logo (sin dibujarlo todavía) para poder centrar el texto.
  let textX = marginX
  let logoW = 0
  let logoH = 0
  let logoData = null
  let logoFmt = 'JPEG'
  if (empresa?.logo) {
    try {
      const props = doc.getImageProperties(empresa.logo)
      logoFmt = String(empresa.logo).startsWith('data:image/png') ? 'PNG' : 'JPEG'
      logoW = 26
      logoH = (props.height * logoW) / props.width
      logoData = empresa.logo
      textX = marginX + logoW + 6
    } catch {
      // si el logo no es válido, se ignora
    }
  }

  // 2) Armar las líneas de texto y medir su alto total.
  const nombreAlto = empresa?.nombre ? 6 : 0
  const lineas = []
  if (empresa?.nit) lineas.push(`NIT: ${empresa.nit}`)
  if (empresa?.direccion) lineas.push(empresa.direccion)
  const contacto = [empresa?.telefono && `Tel: ${empresa.telefono}`, empresa?.correo]
    .filter(Boolean)
    .join('   ·   ')
  if (contacto) lineas.push(contacto)
  const textoAlto = nombreAlto + lineas.length * 5

  // 3) Centrar verticalmente el bloque más corto respecto al más alto.
  const bloqueAlto = Math.max(textoAlto, logoH)
  const logoY = topY + (bloqueAlto - logoH) / 2
  let y = topY + (bloqueAlto - textoAlto) / 2 + 5 // +5 ≈ ascenso de la 1ª línea

  if (logoData) {
    doc.addImage(logoData, logoFmt, marginX, logoY, logoW, logoH)
  }

  if (empresa?.nombre) {
    doc.setFont(undefined, 'bold')
    doc.setFontSize(16)
    doc.setTextColor(15, 23, 42)
    doc.text(empresa.nombre, textX, y)
    doc.setFont(undefined, 'normal')
    y += 6
  }

  doc.setFontSize(9)
  doc.setTextColor(90)
  for (const l of lineas) {
    doc.text(l, textX, y)
    y += 5
  }

  // línea divisoria al final del bloque más alto
  const bottom = topY + bloqueAlto + 3
  doc.setDrawColor(220)
  doc.line(marginX, bottom, pageW - marginX, bottom)
  return bottom + 8
}

// Genera y descarga el PDF del pago de nómina
export function generarPdfNomina({ empresa, empleado, fecha, items, descuentos, prestamosEmpleado, subtotal, totalDescuentos, extra, extraDetalle, descuentoTrabajo, descuentoTrabajoDetalle, total, comentario, fotos }) {
  const doc = new jsPDF()
  const marginX = 14

  let y = drawEncabezadoEmpresa(doc, empresa, marginX)

  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42)
  doc.text('Comprobante de Pago de Nómina', marginX, y)
  y += 9

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

  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42)
  doc.text('Reporte de Nómina', marginX, y)
  y += 8

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

  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42)
  doc.text('Reporte de Movimientos', marginX, y)
  y += 8

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

  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42)
  doc.text('Reporte de Fabricación', marginX, y)
  y += 8

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

  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42)
  doc.text('Reporte de Materiales', marginX, y)
  y += 8

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
  doc.setTextColor(150)
  doc.setFontSize(9)
  const texto = empresa?.nombre ? `${empresa.nombre} · Sistema de Nómina` : 'Generado por Sistema de Nómina'
  doc.text(texto, marginX, doc.internal.pageSize.getHeight() - 10)
}

// Genera y descarga el PDF de un costeo de producto.
// `r` es el objeto de resultados de calcularCosteo(); `nombre` el nombre del costeo.
export function generarPdfCosteo({ empresa, nombre, r }) {
  const doc = new jsPDF()
  const marginX = 14

  let y = drawEncabezadoEmpresa(doc, empresa, marginX)

  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42)
  doc.text('Costeo y rentabilidad', marginX, y)
  y += 8

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

// Construye (sin guardar) el documento PDF de una venta / factura.
// `venta` trae { codigo, id, clienteNombre, fecha, total, pagado, saldo, estadoPago,
//   comentario, items:[...], pagos:[...] }. Devuelve el objeto jsPDF.
const ESTADO_PAGO_PDF = { pagado: 'PAGADO', parcial: 'ABONADO (parcial)', pendiente: 'PENDIENTE DE PAGO' }
export function construirDocVenta({ empresa, venta, cliente }) {
  const doc = new jsPDF()
  const marginX = 14
  const pageW = doc.internal.pageSize.getWidth()

  let y = drawEncabezadoEmpresa(doc, empresa, marginX)

  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42)
  doc.text(`Factura de venta ${venta.codigo || '#' + venta.id}`, marginX, y)
  y += 8

  // Datos del cliente y la fecha
  doc.setFontSize(11)
  doc.setTextColor(90)
  const nombreCliente = venta.clienteNombre || (cliente ? `${cliente.nombre || ''} ${cliente.apellidos || ''}`.trim() : '') || 'Sin cliente'
  doc.text(`Cliente: ${nombreCliente}`, marginX, y); y += 6
  if (cliente?.telefono) { doc.text(`Teléfono: ${cliente.telefono}`, marginX, y); y += 6 }
  if (venta.fecha) { doc.text(`Fecha: ${formatFecha(venta.fecha)}`, marginX, y); y += 6 }
  y += 2

  // Detalle de productos (con color si aplica)
  autoTable(doc, {
    startY: y,
    head: [['Producto', 'Color', 'Cantidad', 'Precio', 'Subtotal']],
    body: venta.items.map((it) => [
      it.productoNombre || '',
      it.colorNombre || '—',
      String(it.cantidad),
      formatCOP(it.precioUnitario),
      formatCOP(it.subtotal != null ? it.subtotal : (Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0)),
    ]),
    styles: { fontSize: 10 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    didParseCell: (data) => {
      if ([2, 3, 4].includes(data.column.index)) data.cell.styles.halign = 'right'
    },
  })
  y = doc.lastAutoTable.finalY + 8

  // Resumen de pago: total, abonado, saldo
  doc.setFontSize(11)
  doc.setTextColor(0)
  doc.text(`Total: ${formatCOP(venta.total)}`, pageW - marginX, y, { align: 'right' }); y += 6
  if (venta.anticipoAplicado > 0) {
    doc.setTextColor(90)
    doc.text(`Anticipo aplicado: ${formatCOP(venta.anticipoAplicado)}`, pageW - marginX, y, { align: 'right' }); y += 6
  }
  doc.setTextColor(22, 163, 74)
  doc.text(`Pagado: ${formatCOP(venta.pagado)}`, pageW - marginX, y, { align: 'right' }); y += 6
  if ((venta.saldo || 0) > 0) {
    doc.setTextColor(220, 38, 38)
    doc.text(`Saldo pendiente: ${formatCOP(venta.saldo)}`, pageW - marginX, y, { align: 'right' }); y += 6
  }
  doc.setTextColor(0)
  y += 2

  // Historial de abonos (si hay más de uno o hay saldo)
  if (venta.pagos && venta.pagos.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Fecha del pago', 'Comentario', 'Monto']],
      body: venta.pagos.map((p) => [formatFecha(p.fecha), p.comentario || '—', formatCOP(p.monto)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [100, 116, 139] },
      columnStyles: { 2: { halign: 'right' } },
      didParseCell: (data) => { if (data.column.index === 2) data.cell.styles.halign = 'right' },
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
function dibujarSelloEstado(doc, marginX, texto, estado) {
  if (!texto) return
  const pageW = doc.internal.pageSize.getWidth()
  const cx = pageW - marginX - 26
  const cy = 52
  const color = estado === 'pagado' ? [22, 163, 74] : estado === 'parcial' ? [180, 83, 9] : [220, 38, 38]
  doc.saveGraphicsState()
  doc.setDrawColor(...color)
  doc.setTextColor(...color)
  doc.setLineWidth(1.4)
  const rad = (-18 * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const w = 52, h = 15
  const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([px, py]) => [cx + px * cos - py * sin, cy + px * sin + py * cos])
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    doc.line(a[0], a[1], b[0], b[1])
  }
  doc.setFont(undefined, 'bold')
  doc.setFontSize(13)
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

  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42)
  doc.text(`Pedido #${pedido.id}`, marginX, y)
  // Estado a la derecha
  doc.setFontSize(10)
  doc.setTextColor(...(pedido.estado === 'entregado' ? [22, 163, 74] : pedido.estado === 'anulado' ? [220, 38, 38] : [180, 83, 9]))
  doc.text(ESTADO_PEDIDO_PDF[pedido.estado] || pedido.estado, pageW - marginX, y, { align: 'right' })
  doc.setTextColor(90)
  y += 8

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
    foot: [['', '', '', 'TOTAL', formatCOP(pedido.total)]],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [37, 99, 235] },
    footStyles: { fillColor: [226, 232, 240], textColor: 0, fontStyle: 'bold' },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    didParseCell: (data) => {
      if ([2, 3, 4].includes(data.column.index)) data.cell.styles.halign = 'right'
    },
  })
  y = doc.lastAutoTable.finalY + 10

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

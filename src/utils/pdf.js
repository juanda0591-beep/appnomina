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
export function generarPdfNomina({ empresa, empleado, fecha, items, descuentos, prestamosEmpleado, subtotal, totalDescuentos, extra, extraDetalle, total, comentario }) {
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
  }

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

function pieDePagina(doc, empresa, marginX) {
  doc.setTextColor(150)
  doc.setFontSize(9)
  const texto = empresa?.nombre ? `${empresa.nombre} · Sistema de Nómina` : 'Generado por Sistema de Nómina'
  doc.text(texto, marginX, doc.internal.pageSize.getHeight() - 10)
}

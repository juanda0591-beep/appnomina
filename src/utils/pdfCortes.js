import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { colorPieza, bordesPieza } from './proyectoCorte.js'
import { formatCOP } from './format.js'
import { vistasMueble } from './vistasMueble.js'
import { construirMueble } from './construccionMueble.js'
import { modeloPiezasManuales } from './piezasManuales.js'

const medida = (n) => Number(n).toLocaleString('es-CO', { maximumFractionDigits: 2 })
const textoCantos = (canto) => (canto || '').split(',').filter(Boolean).map((b) => ({ arriba: 'Superior', abajo: 'Inferior', izq: 'Izquierdo', der: 'Derecho' })[b] || b).join(', ') || '-'

// Devuelve el documento para poder verificar el PDF sin activar una descarga.
export function crearPdfTaller({ empresa = {}, resultado, proyecto, nombre = 'Plan de corte', revision, creado, formato = 'a4' }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: formato === 'a3' ? 'a3' : 'a4' })
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), margen = 14
  const ancho = W - 2 * margen
  const r = resultado
  if (!r?.lamina || !Array.isArray(r.laminas)) throw new Error('El plano no tiene un resultado valido.')
  const fecha = creado ? new Date(creado) : new Date()
  const fechaTexto = fecha.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
  const textoAjustado = (texto, x, y, width, size = 9, lineas = 1) => {
    doc.setFontSize(size)
    const partes = doc.splitTextToSize(String(texto || ''), width)
    if (partes.length > lineas) {
      partes.length = lineas
      const ultima = partes[lineas - 1]
      partes[lineas - 1] = ultima.slice(0, Math.max(0, ultima.length - 3)) + '...'
    }
    doc.text(partes, x, y)
  }
  const encabezado = (titulo, subtitulo) => {
    doc.setTextColor('#344b55'); doc.setFont('helvetica', 'bold'); doc.setFontSize(17)
    doc.text(titulo, margen, 19)
    doc.setFont('helvetica', 'normal'); doc.setTextColor('#657b84')
    textoAjustado(subtitulo, margen, 26, ancho * .7, 9)
    textoAjustado(empresa.nombre || 'TALLER', W - margen - ancho * .28, 18, ancho * .28, 10)
    doc.setDrawColor('#bacbd0'); doc.setLineWidth(.25); doc.line(margen, 31, W - margen, 31)
  }
  encabezado('DESPIECE Y PLAN DE CORTE', nombre)
  const config = proyecto || { unidades: 1, material: '', sierra: r.opciones?.sierra || 0, margen: r.opciones?.margen || 0 }
  autoTable(doc, { startY: 36, margin: { left: margen, right: margen, bottom: 28 }, theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2.5, textColor: '#344b55' },
    body: [
      ['Material / acabado', config.material || '-', 'Lamina (mm)', `${medida(r.lamina.ancho)} x ${medida(r.lamina.largo)}`],
      ['Espesor', r.grupos ? r.grupos.map((g) => `${g.espesor} mm`).join(' / ') : `${medida(r.lamina.espesor || 0)} mm`, 'Disco / saneado por borde', `${medida(config.sierra)} / ${medida(config.margen)} mm`],
      ['Unidades del mueble', String(config.unidades), 'Laminas / aprovechamiento', `${r.cantidadLaminas} / ${(100 - r.desperdicioPct).toFixed(1)}%`],
      [r.costoIncompleto ? 'Costo parcial (faltan precios)' : 'Costo de laminas', formatCOP(r.costoTotal), 'Fecha / version', `${fechaTexto} / ${revision ?? 'Borrador'}`],
    ], columnStyles: { 0: { fontStyle: 'bold', cellWidth: ancho * .22 }, 1: { cellWidth: ancho * .28 }, 2: { fontStyle: 'bold', cellWidth: ancho * .23 } },
  })
  const piezas = config.piezas ? config.piezas.map((p) => ({ ...p, cantidad: p.cantidad * config.unidades })) : consolidar(r)
  autoTable(doc, { startY: doc.lastAutoTable.finalY + 6, margin: { left: margen, right: margen, top: 15, bottom: 28 },
    head: [['Codigo', 'Pieza', 'Ancho (mm)', 'Alto (mm)', 'Cant.', 'Veta', 'Cantos']],
    body: piezas.map((p) => [p.codigo || '-', `${p.nombre}${p.espesor ? ` / MDF ${p.espesor} mm` : ''}`, medida(p.ancho), medida(p.alto), p.cantidad, p.permiteRotar ? 'Libre' : 'Fija', textoCantos(p.canto)]),
    styles: { fontSize: 8, cellPadding: 2, textColor: '#344b55', lineColor: '#d5dfe1' },
    headStyles: { fillColor: '#087f8c', textColor: '#ffffff' }, alternateRowStyles: { fillColor: '#f1f5f5' },
    columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: ancho * .29 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 6: { cellWidth: ancho * .23 } },
    rowPageBreak: 'avoid',
  })
  if (proyecto?.diseno?.construccionVersion === 2) {
    const construccion = construirMueble(proyecto.diseno)
    if (!construccion.avisos.length) {
      doc.addPage(); encabezado('CONFIGURACION DE CONSTRUCCION', `${nombre} | Medidas de armado y herrajes`)
      autoTable(doc, { startY: 37, margin: { left: margen, right: margen, top: 15, bottom: 35 },
        head: [['Elemento', 'Configuracion']], body: construccion.notas,
        styles: { fontSize: 9, cellPadding: 3, textColor: '#344b55' }, headStyles: { fillColor: '#087f8c', textColor: '#ffffff' },
        columnStyles: { 0: { cellWidth: 42 } }, rowPageBreak: 'avoid', alternateRowStyles: { fillColor: '#f1f5f5' } })
      doc.setFontSize(8); doc.setTextColor('#536b75')
      doc.text('Rieles esquematicos: verificar holguras y mecanizados con la ficha del fabricante. No incluidos en el despiece de tableros.', margen, H - 29)
      if (construccion.espejos?.length) {
        doc.addPage(); encabezado('VIDRIO Y ESPEJOS', nombre)
        autoTable(doc, { startY: 37, margin: { left: margen, right: margen, bottom: 28 }, head: [['Elemento', 'Ancho (mm)', 'Alto (mm)', 'Espesor (mm)', 'Cantidad']],
          body: construccion.espejos.map((e) => [e.nombre, medida(e.ancho), medida(e.alto), e.espesor, config.unidades]), headStyles: { fillColor: '#087f8c' } })
      }
    }
  }
  const vistas = vistasMueble(proyecto?.diseno)
  if (!proyecto?.diseno && proyecto?.montajeManual?.length) {
    const m = modeloPiezasManuales(proyecto.piezas, proyecto.lamina.espesor, proyecto.montajeManual, 'montaje')
    if (m.piezas.length) {
      const { min, max } = m.limites
      for (const [nombre, ex, ey] of [['Frontal manual', 0, 1], ['Lateral manual', 2, 1], ['Superior manual', 0, 2]]) {
        vistas.push({ nombre, ancho: max[ex] - min[ex], alto: max[ey] - min[ey], rectangulos: m.piezas.map((p) => ({
          x: p.origen[ex] - min[ex], y: max[ey] - p.origen[ey] - p.dimensiones[ey], ancho: p.dimensiones[ex], alto: p.dimensiones[ey], oculta: false })) })
      }
      if (m.faltantes.length) nombre += ` / MONTAJE PARCIAL: ${m.faltantes.length} sin ubicar`
    }
  }
  if (vistas.length) {
    doc.addPage(); encabezado('VISTAS TECNICAS DEL MUEBLE', `${nombre} | ${proyecto?.diseno ? 'Estructura sin frentes' : 'Ubicaciones manuales'} | Medidas en mm`)
    const celda = ancho / 3, maxH = H - 94
    const escala = Math.min(...vistas.map((v) => Math.min((celda - 20) / v.ancho, maxH / v.alto)))
    vistas.forEach((v, i) => {
      const w = v.ancho * escala, h = v.alto * escala
      const x = margen + i * celda + (celda - w) / 2 + 4, y = 54 + (maxH - h) / 2
      doc.setFontSize(9); doc.setTextColor('#435c67'); doc.text(v.nombre, margen + i * celda + celda / 2, 39, { align: 'center' })
      doc.setDrawColor('#536b75'); doc.setFillColor('#ffffff'); doc.setLineWidth(.2); doc.rect(x, y, w, h, 'FD')
      for (const rect of v.rectangulos) {
        doc.setFillColor('#e0eaed'); doc.setLineDashPattern(rect.oculta ? [1, 1] : [], 0)
        doc.rect(x + rect.x * escala, y + rect.y * escala, rect.ancho * escala, rect.alto * escala, rect.oculta ? 'S' : 'FD')
      }
      doc.setLineDashPattern([], 0)
      doc.line(x, y - 4, x + w, y - 4); doc.line(x - 4, y, x - 4, y + h)
      for (const pos of [x, x + w]) doc.line(pos, y - 5, pos, y - 3)
      for (const pos of [y, y + h]) doc.line(x - 5, pos, x - 3, pos)
      doc.setFontSize(7); doc.text(`${medida(v.ancho)} mm`, x + w / 2, y - 6, { align: 'center' })
      doc.text(`${medida(v.alto)} mm`, x - 6, y + h / 2, { angle: 90, align: 'center' })
    })
    doc.setFontSize(8); doc.text('Proyecciones de referencia. Usar las medidas indicadas. Linea discontinua: elemento interior.', margen, H - 29)
  }
  for (const lam of r.laminas) {
    const tablero = lam.lamina || r.lamina
    doc.addPage()
    encabezado(`LAMINA ${lam.indice} / ${r.cantidadLaminas}`, `${nombre} | MDF ${tablero.espesor} mm | ${medida(tablero.ancho)} x ${medida(tablero.largo)} mm | ${lam.piezas.length} piezas`)
    const disponibleW = ancho - 18, disponibleH = H - 82
    const requerido = Math.max(tablero.ancho / disponibleW, tablero.largo / disponibleH)
    const denominador = [1, 2, 5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 250, 500, 1000, 2000].find((n) => n >= requerido) || Math.ceil(requerido)
    const escala = 1 / denominador
    const w = tablero.ancho * escala, h = tablero.largo * escala
    const x = (W - w) / 2 + 5, y = 45 + (disponibleH - h) / 2
    doc.setFillColor('#ffffff'); doc.setDrawColor('#536b75'); doc.setLineWidth(.3); doc.rect(x, y, w, h, 'FD')
    for (const retazo of lam.retazos || []) {
      doc.setFillColor('#f0f6f0'); doc.setDrawColor('#aec6b5'); doc.setLineWidth(.1)
      doc.rect(x + retazo.x * escala, y + retazo.y * escala, retazo.ancho * escala, retazo.largo * escala, 'FD')
      if (retazo.ancho * escala > 16 && retazo.largo * escala > 12) {
        doc.setTextColor('#658371'); doc.setFontSize(6)
        doc.text(retazo.id, x + (retazo.x + retazo.ancho / 2) * escala, y + (retazo.y + retazo.largo / 2) * escala, { align: 'center' })
      }
    }
    for (const p of lam.piezas) {
      const px = x + p.x * escala, py = y + p.y * escala, pw = p.ancho * escala, ph = p.largo * escala
      doc.setFillColor(colorPieza(p.codigo || p.nombre)); doc.setDrawColor('#536b75'); doc.setLineWidth(.2)
      doc.rect(px, py, pw, ph, 'FD')
      const bordes = { arriba: [px, py, px + pw, py], abajo: [px, py + ph, px + pw, py + ph], izq: [px, py, px, py + ph], der: [px + pw, py, px + pw, py + ph] }
      doc.setDrawColor('#c46d33'); doc.setLineWidth(.65)
      for (const borde of bordesPieza(p)) doc.line(...bordes[borde])
      doc.setTextColor('#344b55'); doc.setFontSize(7)
      const codigo = p.id || p.codigo || p.nombre
      if (ph > 5 && doc.getTextWidth(codigo) < pw - 2) {
        doc.text(codigo, px + pw / 2, py + ph / 2, { align: 'center' })
        const dimensiones = `${medida(p.ancho)} x ${medida(p.largo)}`
        doc.setFontSize(6)
        if (ph > 12 && doc.getTextWidth(dimensiones) < pw - 2) doc.text(dimensiones, px + pw / 2, py + ph / 2 + 3.5, { align: 'center' })
      }
      if (!p.permiteRotar && pw > 10 && ph > 12) {
        doc.setDrawColor('#536b75'); doc.setLineWidth(.2)
        const ax = px + pw - 3, ay = py + 3
        doc.line(ax, ay + 6, ax, ay); doc.line(ax - .8, ay + 1.2, ax, ay); doc.line(ax + .8, ay + 1.2, ax, ay)
      }
    }
    doc.setDrawColor('#536b75'); doc.setLineWidth(.2); doc.setTextColor('#536b75'); doc.setFontSize(8)
    doc.line(x, y - 5, x + w, y - 5); doc.line(x - 5, y, x - 5, y + h)
    for (const pos of [x, x + w]) doc.line(pos, y - 7, pos, y - 3)
    for (const pos of [y, y + h]) doc.line(x - 7, pos, x - 3, pos)
    doc.text(`${medida(tablero.ancho)} mm`, x + w / 2, y - 7, { align: 'center' })
    doc.text(`${medida(tablero.largo)} mm`, x - 8, y + h / 2, { angle: 90, align: 'center' })
    doc.setFontSize(8)
    doc.text(`Escala 1:${denominador} | Imprimir al 100% | Medidas en mm`, margen, H - 29)
    doc.text('Canto: linea naranja | Retazo: verde | Flecha: veta', W - margen, H - 29, { align: 'right' })
  }
  if (r.sinCabida?.length) {
    doc.addPage(); encabezado('PIEZAS SIN CABIDA', 'Plano incompleto')
    autoTable(doc, { startY: 38, margin: { bottom: 28 }, head: [['Pieza', 'Ancho (mm)', 'Alto (mm)']],
      body: r.sinCabida.map((p) => [p.nombre, medida(p.ancho), medida(p.largo)]), headStyles: { fillColor: '#b64f45' } })
  }
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i); doc.setDrawColor('#becdd1'); doc.setLineWidth(.25)
    doc.rect(margen, H - 23, ancho, 14)
    doc.line(margen + ancho * .55, H - 23, margen + ancho * .55, H - 9)
    doc.line(margen + ancho * .84, H - 23, margen + ancho * .84, H - 9)
    doc.setTextColor('#657b84'); doc.setFont('helvetica', 'normal')
    textoAjustado('PROYECTO', margen + 3, H - 19, ancho * .5, 6)
    textoAjustado(nombre, margen + 3, H - 14, ancho * .52, 8)
    textoAjustado(`VERSION ${revision ?? 'BORRADOR'} | ${fechaTexto}`, margen + ancho * .55 + 3, H - 14, ancho * .27, 8)
    textoAjustado(`HOJA ${i} / ${total}`, margen + ancho * .84 + 3, H - 14, ancho * .14, 8)
  }
  doc.setProperties({ title: nombre, subject: 'Plano de corte y despiece para taller', author: empresa.nombre || 'Taller' })
  return doc
}

export function descargarPlanoPieza(pieza, espesorBase) {
  const a = Number(pieza.ancho), h = Number(pieza.alto), e = Number(pieza.espesor ?? espesorBase)
  if (![a, h, e].every((n) => Number.isFinite(n) && n > 0)) throw new Error('Completa las medidas de la pieza.')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setFontSize(16); doc.text('PLANO DE PIEZA', 14, 18)
  doc.setFontSize(10); doc.text(doc.splitTextToSize(`${pieza.codigo} / ${pieza.nombre}`, 260), 14, 27)
  const ratio = Math.max(a / 230, h / 120)
  const divisor = [1, 2, 5, 10, 15, 20, 25, 50, 100, 200, 500, 1000].find((n) => n >= ratio) || Math.ceil(ratio)
  const w = a / divisor, alto = h / divisor, x = (297 - w) / 2, y = 45
  doc.setDrawColor('#435c67'); doc.setFillColor('#e0ecee'); doc.rect(x, y, w, alto, 'FD')
  doc.line(x, y - 5, x + w, y - 5); doc.line(x - 5, y, x - 5, y + alto)
  doc.text(`${medida(a)} mm`, x + w / 2, y - 7, { align: 'center' })
  doc.text(`${medida(h)} mm`, x - 8, y + alto / 2, { angle: 90, align: 'center' })
  doc.rect(x, y + alto + 8, w, e / divisor, 'S')
  doc.text(`Espesor ${e} mm / Cantidad ${pieza.cantidad} / Escala 1:${divisor} / Imprimir al 100%`, 14, 190)
  doc.text('Pieza individual. La posicion de montaje no se deduce de estas dimensiones.', 14, 197)
  doc.save(`pieza_${String(pieza.codigo).replace(/[^a-z0-9_-]/gi, '_')}.pdf`)
}

export function generarPdfTaller(opciones) {
  const doc = crearPdfTaller(opciones)
  const nombre = (opciones.nombre || 'proyecto').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 80)
  doc.save(`plano_${nombre}_${opciones.formato || 'a4'}.pdf`)
}

function consolidar(resultado) {
  const mapa = new Map()
  for (const lam of resultado.laminas) for (const p of lam.piezas) {
    const ancho = p.anchoOriginal ?? (p.rotada ? p.largo : p.ancho), alto = p.altoOriginal ?? (p.rotada ? p.ancho : p.largo)
    const key = `${p.codigo}|${p.nombre}|${ancho}|${alto}|${p.canto || ''}`
    const actual = mapa.get(key)
    if (actual) actual.cantidad++
    else mapa.set(key, { ...p, ancho, alto, cantidad: 1 })
  }
  return [...mapa.values()]
}

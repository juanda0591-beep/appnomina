import { formatCOP, formatFecha } from './format.js'

// Normaliza un teléfono a formato internacional para wa.me (solo dígitos, con
// indicativo de país). Asume Colombia (+57) si el número viene sin indicativo.
export function normalizarTelefono(telefono) {
  if (!telefono) return ''
  let d = String(telefono).replace(/\D/g, '')
  if (!d) return ''
  // Ya trae indicativo Colombia
  if (d.startsWith('57') && d.length >= 12) return d
  // Celular colombiano de 10 dígitos -> anteponer 57
  if (d.length === 10) return '57' + d
  return d
}

// Arma el texto del mensaje de WhatsApp con el resumen del pedido.
export function mensajePedido({ pedido, empresa }) {
  const lineas = []
  lineas.push(`*${empresa?.nombre || 'Pedido'}*`)
  lineas.push(`Pedido #${pedido.id}`)
  if (pedido.fechaEntrega) lineas.push(`Entrega: ${formatFecha(pedido.fechaEntrega)}`)
  lineas.push('')
  for (const it of pedido.items || []) {
    const color = it.colorNombre ? ` (${it.colorNombre})` : ''
    const sub = it.subtotal != null ? it.subtotal : (Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0)
    lineas.push(`• ${it.cantidad} x ${it.productoNombre}${color} — ${formatCOP(sub)}`)
  }
  lineas.push('')
  lineas.push(`*Total: ${formatCOP(pedido.total)}*`)
  if (pedido.comentario && pedido.comentario.trim()) {
    lineas.push('')
    lineas.push(`Obs: ${pedido.comentario.trim()}`)
  }
  lineas.push('')
  lineas.push('¡Gracias por tu compra!')
  return lineas.join('\n')
}

// Arma el texto del mensaje de WhatsApp con el resumen de una venta / factura.
export function mensajeVenta({ venta, empresa }) {
  const lineas = []
  lineas.push(`*${empresa?.nombre || 'Venta'}*`)
  lineas.push(`Factura ${venta.codigo || '#' + venta.id}`)
  if (venta.fecha) lineas.push(`Fecha: ${formatFecha(venta.fecha)}`)
  lineas.push('')
  for (const it of venta.items || []) {
    const color = it.colorNombre ? ` (${it.colorNombre})` : ''
    const sub = it.subtotal != null ? it.subtotal : (Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0)
    lineas.push(`• ${it.cantidad} x ${it.productoNombre}${color} — ${formatCOP(sub)}`)
  }
  lineas.push('')
  lineas.push(`*Total: ${formatCOP(venta.total)}*`)
  lineas.push(`Pagado: ${formatCOP(venta.pagado)}`)
  if ((venta.saldo || 0) > 0) lineas.push(`*Saldo pendiente: ${formatCOP(venta.saldo)}*`)
  else lineas.push('Estado: PAGADO ✅')
  lineas.push('')
  lineas.push('¡Gracias por tu compra!')
  return lineas.join('\n')
}

// Abre WhatsApp con el mensaje (y teléfono si hay). En móvil abre la app; en
// escritorio abre WhatsApp Web.
export function abrirWhatsApp({ telefono, texto }) {
  const tel = normalizarTelefono(telefono)
  const base = tel ? `https://wa.me/${tel}` : 'https://wa.me/'
  const url = `${base}?text=${encodeURIComponent(texto)}`
  window.open(url, '_blank', 'noopener')
}

import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP, formatFecha, hoyISO } from '../utils/format.js'
import { notify, confirmar } from '../utils/notify.js'
import Vacio from '../components/Vacio.jsx'
import { generarPdfVenta, ventaPdfFile, imprimirVenta } from '../utils/pdf.js'
import { abrirWhatsApp, mensajeVenta } from '../utils/whatsapp.js'

const emptyItem = () => ({ productoId: '', varianteId: '', cantidad: '', precioUnitario: '', descuentoPct: '' })
const hoy = hoyISO

const ESTADO_PAGO = {
  pagado: { label: 'Pagado', chip: 'ok' },
  parcial: { label: 'Parcial', chip: 'warn' },
  pendiente: { label: 'Debe', chip: 'danger' },
}

export default function Ventas() {
  const { ventas, clientes, productos, empresa, addVenta, deleteVenta, registrarPagoVenta, convertirPedido } = useData()
  const { puede } = useAuth()
  const puedeCrear = puede('ventas', 'crear')
  const puedeEditar = puede('ventas', 'editar')
  const puedeEliminar = puede('ventas', 'eliminar')
  const location = useLocation()
  const navigate = useNavigate()

  const [formAbierto, setFormAbierto] = useState(false)
  const [pedidoOrigenId, setPedidoOrigenId] = useState(null) // si la venta viene de convertir un pedido
  const [clienteId, setClienteId] = useState('')
  const [comentario, setComentario] = useState('')
  const [items, setItems] = useState([emptyItem()])
  const [aplicarAnticipo, setAplicarAnticipo] = useState(false)
  const [ventaCredito, setVentaCredito] = useState(false) // si true, se cobra parcial (o nada) ahora
  const [pagoInicial, setPagoInicial] = useState('')       // cuánto paga ahora si es a crédito
  const [metodoPago, setMetodoPago] = useState('efectivo') // efectivo (entra a caja) | transferencia
  const [descuentoTipo, setDescuentoTipo] = useState('ninguno') // ninguno | global | producto
  const [descuentoGlobal, setDescuentoGlobal] = useState('')    // % sobre toda la venta
  const [guardando, setGuardando] = useState(false)
  const [detalleId, setDetalleId] = useState(null)

  // Filtros de la lista
  const [periodo, setPeriodo] = useState('mes')     // mes | anio | rango | todo
  const [mes, setMes] = useState(hoy().slice(0, 7))  // YYYY-MM
  const [anio, setAnio] = useState(hoy().slice(0, 4))
  const [desde, setDesde] = useState(hoy())
  const [hasta, setHasta] = useState(hoy())
  const [filtroEstado, setFiltroEstado] = useState('') // '' | pagado | parcial | pendiente
  const [busqueda, setBusqueda] = useState('')

  // Modal de abono
  const [pagoVentaId, setPagoVentaId] = useState(null)
  const [pagoMonto, setPagoMonto] = useState('')
  const [pagoFecha, setPagoFecha] = useState(hoy())
  const [pagoComentario, setPagoComentario] = useState('')
  const [pagoMetodo, setPagoMetodo] = useState('efectivo')
  const [guardandoPago, setGuardandoPago] = useState(false)

  const ventaDetalle = ventas.find((v) => v.id === detalleId)
  const ventaPago = ventas.find((v) => v.id === pagoVentaId)
  const clienteSel = clientes.find((c) => String(c.id) === String(clienteId))
  const saldoCliente = clienteSel?.saldoFavor || 0
  const clienteDeVenta = (v) => clientes.find((c) => String(c.id) === String(v?.clienteId)) || null

  const resetForm = () => {
    setClienteId(''); setComentario(''); setItems([emptyItem()])
    setAplicarAnticipo(false); setVentaCredito(false); setPagoInicial(''); setFormAbierto(false)
    setMetodoPago('efectivo'); setDescuentoTipo('ninguno'); setDescuentoGlobal(''); setPedidoOrigenId(null)
  }

  // Cuando se llega desde Pedidos → "Convertir en venta": abre el formulario
  // prellenado con los datos del pedido para poder ajustar antes de confirmar.
  useEffect(() => {
    const ped = location.state?.convertirPedido
    if (!ped) return
    setPedidoOrigenId(ped.id)
    setClienteId(ped.clienteId ? String(ped.clienteId) : '')
    setComentario(ped.comentario || '')
    setItems((ped.items && ped.items.length ? ped.items : [{}]).map((it) => ({
      productoId: it.productoId ? String(it.productoId) : '',
      varianteId: it.varianteId ? String(it.varianteId) : '',
      cantidad: it.cantidad != null ? String(it.cantidad) : '',
      precioUnitario: it.precioUnitario != null ? String(it.precioUnitario) : '',
      descuentoPct: '',
    })))
    setFormAbierto(true)
    // Limpia el state de navegación para que no se reabra al refrescar/volver
    navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, navigate])

  const setItem = (idx, campo, val) => {
    setItems((its) => its.map((it, i) => {
      if (i !== idx) return it
      const next = { ...it, [campo]: val }
      if (campo === 'productoId') {
        const prod = productos.find((p) => String(p.id) === String(val))
        if (prod && !it.precioUnitario) next.precioUnitario = String(prod.valorVenta || '')
        // Selecciona por defecto la primera variante (color) del producto
        next.varianteId = prod?.variantes?.[0] ? String(prod.variantes[0].id) : ''
      }
      return next
    }))
  }
  const addItem = () => setItems((its) => [...its, emptyItem()])
  const removeItem = (idx) => setItems((its) => (its.length === 1 ? its : its.filter((_, i) => i !== idx)))

  // Subtotal bruto y subtotal con descuentos por línea (modo "por producto")
  const clamp = (n) => Math.max(0, Math.min(100, Number(n) || 0))
  const subtotalBruto = items.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0), 0)
  const subtotalConLinea = items.reduce((s, it) => {
    const base = (Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0)
    const pct = descuentoTipo === 'producto' ? clamp(it.descuentoPct) : 0
    return s + base * (1 - pct / 100)
  }, 0)
  const descGlobalPct = descuentoTipo === 'global' ? clamp(descuentoGlobal) : 0
  const totalForm = Math.round(subtotalConLinea * (1 - descGlobalPct / 100))
  const descuentoValor = subtotalBruto - totalForm
  const anticipoUsado = aplicarAnticipo ? Math.min(saldoCliente, totalForm) : 0
  const saldoTrasAnticipo = Math.max(0, totalForm - anticipoUsado)
  // Lo que paga ahora: todo (contado) o lo indicado (crédito)
  const pagaAhora = ventaCredito ? Math.min(Number(pagoInicial) || 0, saldoTrasAnticipo) : saldoTrasAnticipo
  const quedaDebiendo = Math.max(0, saldoTrasAnticipo - pagaAhora)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const itemsValidos = items.filter((it) => it.productoId && Number(it.cantidad) > 0)
    if (itemsValidos.length === 0) { notify.error('Agrega al menos un producto'); return }
    if (ventaCredito && quedaDebiendo > 0 && !clienteId) {
      notify.error('Una venta a crédito necesita un cliente para registrar la deuda')
      return
    }
    // Confirmación con el resumen de la venta antes de registrarla
    const metodoTxt = metodoPago === 'transferencia' ? 'transferencia (no entra a caja)' : 'efectivo (entra a caja)'
    const partes = [`Total: ${formatCOP(totalForm)}`]
    if (descuentoValor > 0) partes.push(`Descuento: −${formatCOP(descuentoValor)}`)
    if (pagaAhora > 0) partes.push(`Paga ahora: ${formatCOP(pagaAhora)} en ${metodoTxt}`)
    if (quedaDebiendo > 0) partes.push(`Queda debiendo: ${formatCOP(quedaDebiendo)}`)
    const okConfirm = await confirmar(partes.join('\n'), {
      titulo: pedidoOrigenId ? `Convertir pedido #${pedidoOrigenId} en venta` : '¿Registrar esta venta?',
      textoOk: 'Sí, registrar', textoCancelar: 'Revisar', peligro: false,
    })
    if (!okConfirm) return
    setGuardando(true)
    try {
      const payloadVenta = {
        clienteId: clienteId || null,
        comentario,
        aplicarAnticipo,
        // Si es contado, no mandamos pagoInicial (el backend salda todo por defecto)
        pagoInicial: ventaCredito ? pagaAhora : undefined,
        metodoPago,
        descuentoTipo: descuentoTipo === 'ninguno' ? undefined : descuentoTipo,
        descuentoPct: descuentoTipo === 'global' ? clamp(descuentoGlobal) : undefined,
        items: itemsValidos.map((it) => ({
          productoId: Number(it.productoId),
          varianteId: it.varianteId ? Number(it.varianteId) : null,
          cantidad: Number(it.cantidad),
          precioUnitario: Number(it.precioUnitario) || 0,
          descuentoPct: descuentoTipo === 'producto' ? clamp(it.descuentoPct) : 0,
        })),
      }
      // Si viene de un pedido, se convierte (marca el pedido como entregado y lo liga);
      // si no, es una venta normal. Ambos comparten el mismo payload.
      const venta = pedidoOrigenId
        ? await convertirPedido(pedidoOrigenId, payloadVenta)
        : await addVenta(payloadVenta)
      notify.ok(pedidoOrigenId ? 'Pedido convertido en venta' : 'Venta registrada')
      for (const aviso of venta?.avisos || []) notify.error(`⚠️ ${aviso}`)
      resetForm()
    } catch (err) {
      notify.error('Error al registrar la venta: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  const handleAnular = async (v) => {
    if (!(await confirmar(`¿Anular la venta ${v.codigo || '#' + v.id}? Se devuelve el stock y se revierte el ingreso a caja.`, { titulo: 'Anular venta', textoOk: 'Sí, anular', peligro: true }))) return
    try {
      await deleteVenta(v.id)
      notify.ok('Venta anulada')
    } catch (err) {
      notify.error('Error: ' + err.message)
    }
  }

  // --- Abono / registro de pago ---
  const abrirPago = (v) => {
    setPagoVentaId(v.id)
    setPagoMonto(String(v.saldo || ''))
    setPagoFecha(hoy())
    setPagoComentario('')
    setPagoMetodo('efectivo')
  }
  const cerrarPago = () => { setPagoVentaId(null); setPagoMonto(''); setPagoComentario('') }
  const handleRegistrarPago = async (e) => {
    e.preventDefault()
    const monto = Number(pagoMonto) || 0
    if (monto <= 0) { notify.error('Indica un monto mayor a 0'); return }
    // Confirmación del abono (monto, método y saldo que quedaría)
    const metodoTxt = pagoMetodo === 'transferencia' ? 'transferencia (no entra a caja)' : 'efectivo (entra a caja)'
    const saldoRestante = Math.max(0, (ventaPago?.saldo || 0) - monto)
    const okConfirm = await confirmar(
      `Abono: ${formatCOP(monto)} en ${metodoTxt}\nSaldo restante: ${formatCOP(saldoRestante)}`,
      { titulo: `Registrar abono · ${ventaPago?.codigo || '#' + pagoVentaId}`, textoOk: 'Sí, registrar', textoCancelar: 'Revisar', peligro: false }
    )
    if (!okConfirm) return
    setGuardandoPago(true)
    try {
      await registrarPagoVenta(pagoVentaId, { monto, fecha: pagoFecha, comentario: pagoComentario, metodo: pagoMetodo })
      notify.ok('Abono registrado')
      cerrarPago()
    } catch (err) {
      notify.error('Error al registrar el abono: ' + err.message)
    } finally {
      setGuardandoPago(false)
    }
  }

  // --- PDF / WhatsApp / Imprimir ---
  const handlePdf = (v) => {
    try { generarPdfVenta({ empresa, venta: v, cliente: clienteDeVenta(v) }) }
    catch (err) { notify.error('No se pudo generar el PDF: ' + err.message) }
  }
  const handleImprimir = (v) => {
    try { imprimirVenta({ empresa, venta: v, cliente: clienteDeVenta(v) }) }
    catch (err) { notify.error('No se pudo imprimir: ' + err.message) }
  }
  const handleWhatsApp = async (v) => {
    const cliente = clienteDeVenta(v)
    const texto = mensajeVenta({ venta: v, empresa })
    try {
      const file = ventaPdfFile({ empresa, venta: v, cliente })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `Factura ${v.codigo || v.id}`, text: texto })
        return
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
    }
    try { generarPdfVenta({ empresa, venta: v, cliente }) } catch { /* ignore */ }
    notify.info(cliente?.telefono
      ? 'Se abrió WhatsApp con el resumen. Adjunta el PDF que se descargó.'
      : 'Este cliente no tiene teléfono; elige el contacto en WhatsApp. El PDF se descargó para adjuntarlo.')
    abrirWhatsApp({ telefono: cliente?.telefono, texto })
  }

  // --- Filtrado de la lista (periodo + estado + búsqueda por cliente) ---
  const ventasFiltradas = useMemo(() => {
    const enPeriodo = (v) => {
      const f = (v.fecha || v.creado || '').slice(0, 10)
      if (!f) return periodo === 'todo'
      if (periodo === 'mes') return f.slice(0, 7) === mes
      if (periodo === 'anio') return f.slice(0, 4) === anio
      if (periodo === 'rango') return (!desde || f >= desde) && (!hasta || f <= hasta)
      return true // 'todo'
    }
    const q = busqueda.trim().toLowerCase()
    return ventas.filter((v) => {
      if (!enPeriodo(v)) return false
      if (filtroEstado && v.estadoPago !== filtroEstado) return false
      if (q && !(v.clienteNombre || '').toLowerCase().includes(q) && !(v.codigo || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [ventas, periodo, mes, anio, desde, hasta, filtroEstado, busqueda])

  const totales = useMemo(() => ventasFiltradas.reduce((acc, v) => ({
    cantidad: acc.cantidad + 1,
    total: acc.total + (v.total || 0),
    pagado: acc.pagado + (v.pagado || 0),
    saldo: acc.saldo + (v.saldo || 0),
  }), { cantidad: 0, total: 0, pagado: 0, saldo: 0 }), [ventasFiltradas])

  return (
    <div>
      <h2>🛒 Ventas</h2>
      <p className="muted">
        Registra una venta directa: descuenta el stock de los productos e ingresa la plata a caja
        automáticamente. Si el cliente tiene saldo a favor (anticipos), puedes aplicarlo.
      </p>

      {puedeCrear && (
        <div className="form-actions">
          <button type="button" className="btn-primary" onClick={() => { resetForm(); setFormAbierto(true) }}>
            + Nueva venta
          </button>
        </div>
      )}

      {/* Barra de filtros */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>Periodo</label>
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
              <option value="mes">Por mes</option>
              <option value="anio">Por año</option>
              <option value="rango">Rango personalizado</option>
              <option value="todo">Todas</option>
            </select>
          </div>
          {periodo === 'mes' && (
            <div><label>Mes</label><input type="month" value={mes} onChange={(e) => setMes(e.target.value)} /></div>
          )}
          {periodo === 'anio' && (
            <div><label>Año</label><input type="number" min="2000" max="2100" value={anio} onChange={(e) => setAnio(e.target.value)} style={{ width: 100 }} /></div>
          )}
          {periodo === 'rango' && (
            <>
              <div><label>Desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
              <div><label>Hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
            </>
          )}
          <div>
            <label>Estado</label>
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
              <option value="">Todas las facturas</option>
              <option value="pagado">Pagadas</option>
              <option value="pendiente">No pagadas (debe)</option>
              <option value="parcial">Abono parcial</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label>Buscar cliente o código</label>
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Ej: Juan / VTA-0007" />
          </div>
        </div>
      </div>

      {/* Resumen: cambia según periodo/estado/cliente/búsqueda aplicados */}
      {ventasFiltradas.length > 0 && (
        <div className="cards-grid" style={{ marginBottom: 12 }}>
          <div className="stat-card">
            <span className="stat-label">Ventas</span>
            <span className="stat-value">{totales.cantidad}</span>
          </div>
          <div className="stat-card highlight">
            <span className="stat-label">Total vendido</span>
            <span className="stat-value">{formatCOP(totales.total)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Recaudado</span>
            <span className="stat-value">{formatCOP(totales.pagado)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Por cobrar</span>
            <span className={`stat-value ${totales.saldo > 0 ? 'danger-text' : ''}`}>{formatCOP(totales.saldo)}</span>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Ventas ({ventasFiltradas.length})</h3>
        {ventas.length === 0 && (
          <Vacio icono="🛒" titulo="Aún no hay ventas">
            Registra la primera con el botón "+ Nueva venta".
          </Vacio>
        )}
        {ventas.length > 0 && ventasFiltradas.length === 0 && (
          <p className="muted">No hay ventas que coincidan con los filtros.</p>
        )}
        {ventasFiltradas.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Factura</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th className="num">Total</th>
                  <th className="num">Pagado</th>
                  <th className="num">Saldo</th>
                  <th>Estado</th>
                  <th className="num">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ventasFiltradas.map((v) => {
                  const est = ESTADO_PAGO[v.estadoPago] || ESTADO_PAGO.pendiente
                  return (
                  <tr key={v.id} className="chip-clicable" onClick={() => setDetalleId(v.id)}>
                    <td><strong>{v.codigo || '#' + v.id}</strong>{v.pedidoId ? <span className="muted small"> (ped. #{v.pedidoId})</span> : null}</td>
                    <td className="small">{formatFecha(v.fecha)}</td>
                    <td>{v.clienteNombre || <span className="muted">— sin cliente</span>}</td>
                    <td className="num">{formatCOP(v.total)}</td>
                    <td className="num">{formatCOP(v.pagado)}</td>
                    <td className="num">{v.saldo > 0 ? <span className="texto-salida">{formatCOP(v.saldo)}</span> : '—'}</td>
                    <td><span className={`chip ${est.chip}`}>{est.label}</span></td>
                    <td className="num">
                      <div className="actions" style={{ justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                        {puedeEditar && v.saldo > 0 && (
                          <button className="btn-primary btn-sm" onClick={() => abrirPago(v)}>💵 Abonar</button>
                        )}
                        <button className="btn-secondary btn-sm" onClick={() => handlePdf(v)} title="Descargar PDF">📄</button>
                        <button className="btn-secondary btn-sm" onClick={() => handleImprimir(v)} title="Imprimir">🖨️</button>
                        <button className="btn-secondary btn-sm" onClick={() => handleWhatsApp(v)} title="Enviar por WhatsApp">🟢</button>
                        {puedeEliminar && (
                          <button className="btn-danger btn-sm" onClick={() => handleAnular(v)}>Anular</button>
                        )}
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}><strong>Totales ({ventasFiltradas.length})</strong></td>
                  <td className="num"><strong>{formatCOP(totales.total)}</strong></td>
                  <td className="num"><strong>{formatCOP(totales.pagado)}</strong></td>
                  <td className="num"><strong>{totales.saldo > 0 ? formatCOP(totales.saldo) : '—'}</strong></td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Modal nueva venta */}
      {formAbierto && (
        <>
          <div className="overlay" onClick={resetForm} />
          <form className="modal modal-lg" onSubmit={handleSubmit}>
            <h3>{pedidoOrigenId ? `Convertir pedido #${pedidoOrigenId} en venta` : 'Nueva venta'}</h3>
            <div className="row">
              <div style={{ flex: 2 }}>
                <label>Cliente</label>
                <select value={clienteId} onChange={(e) => { setClienteId(e.target.value); setAplicarAnticipo(false) }}>
                  <option value="">— Sin cliente —</option>
                  {clientes.filter((c) => c.tipo !== 'proveedor').map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre} {c.apellidos}</option>
                  ))}
                </select>
              </div>
            </div>

            <label>Productos</label>
            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th style={{ minWidth: 150 }}>Producto</th>
                    <th style={{ minWidth: 110 }}>Color</th>
                    <th className="num">Cantidad</th>
                    <th className="num">Precio unitario</th>
                    {descuentoTipo === 'producto' && <th className="num" style={{ minWidth: 80 }}>Desc. %</th>}
                    <th className="num">Subtotal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => {
                    const prod = productos.find((p) => String(p.id) === String(it.productoId))
                    const variantes = prod?.variantes || []
                    const variante = variantes.find((v) => String(v.id) === String(it.varianteId))
                    // Stock disponible: el de la variante elegida (o el total si no hay variante)
                    const stockDisp = variante ? variante.stock : (prod?.stock ?? 0)
                    const excede = prod && Number(it.cantidad) > stockDisp
                    return (
                      <tr key={i}>
                        <td>
                          <select value={it.productoId} onChange={(e) => setItem(i, 'productoId', e.target.value)}>
                            <option value="">— Producto —</option>
                            {productos.map((p) => (
                              <option key={p.id} value={p.id}>{p.nombre}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {variantes.length > 0 ? (
                            <select value={it.varianteId} onChange={(e) => setItem(i, 'varianteId', e.target.value)} disabled={!prod}>
                              {variantes.map((v) => (
                                <option key={v.id} value={v.id}>{v.colorNombre || 'Sin color'} ({v.stock})</option>
                              ))}
                            </select>
                          ) : <span className="muted small">—</span>}
                        </td>
                        <td className="num">
                          <input type="number" min="0" step="any" value={it.cantidad} onChange={(e) => setItem(i, 'cantidad', e.target.value)} placeholder="0" />
                          {excede && <span className="muted small texto-salida" style={{ display: 'block' }}>Stock: {stockDisp}</span>}
                        </td>
                        <td className="num">
                          <input type="number" min="0" step="any" value={it.precioUnitario} onChange={(e) => setItem(i, 'precioUnitario', e.target.value)} placeholder="0" />
                        </td>
                        {descuentoTipo === 'producto' && (
                          <td className="num">
                            <input type="number" min="0" max="100" step="any" value={it.descuentoPct} onChange={(e) => setItem(i, 'descuentoPct', e.target.value)} placeholder="0" />
                          </td>
                        )}
                        <td className="num">{formatCOP((Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0) * (1 - (descuentoTipo === 'producto' ? clamp(it.descuentoPct) : 0) / 100))}</td>
                        <td><button type="button" className="btn-icon danger" onClick={() => removeItem(i)}>✕</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn-secondary" onClick={addItem}>+ Agregar producto</button>

            {/* Descuento: ninguno / global / por producto (excluyentes) */}
            <div className="row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label>Descuento</label>
                <select value={descuentoTipo} onChange={(e) => setDescuentoTipo(e.target.value)}>
                  <option value="ninguno">Sin descuento</option>
                  <option value="global">% sobre toda la venta</option>
                  <option value="producto">% por producto</option>
                </select>
              </div>
              {descuentoTipo === 'global' && (
                <div style={{ flex: 1 }}>
                  <label>% de descuento</label>
                  <input type="number" min="0" max="100" step="any" value={descuentoGlobal} onChange={(e) => setDescuentoGlobal(e.target.value)} placeholder="0" />
                </div>
              )}
              {descuentoTipo === 'producto' && (
                <div style={{ flex: 2 }}><span className="muted small">Escribe el % en la columna "Desc. %" de cada producto.</span></div>
              )}
            </div>

            {clienteSel && saldoCliente > 0 && (
              <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontWeight: 400 }}>
                <input type="checkbox" checked={aplicarAnticipo} onChange={(e) => setAplicarAnticipo(e.target.checked)} style={{ width: 'auto' }} />
                Aplicar saldo a favor de {clienteSel.nombre}: <strong>{formatCOP(saldoCliente)}</strong>
              </label>
            )}

            <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontWeight: 400 }}>
              <input type="checkbox" checked={ventaCredito} onChange={(e) => { setVentaCredito(e.target.checked); setPagoInicial('') }} style={{ width: 'auto' }} />
              Venta a crédito (el cliente paga después o abona una parte)
            </label>
            {ventaCredito && (
              <div style={{ marginTop: 8 }}>
                <label>¿Cuánto paga ahora? (0 si queda debiendo todo)</label>
                <input
                  type="number" min="0" step="any" placeholder="0"
                  value={pagoInicial}
                  max={saldoTrasAnticipo}
                  onChange={(e) => setPagoInicial(e.target.value)}
                  style={{ maxWidth: 220 }}
                />
              </div>
            )}

            {/* Método de pago de lo que se cobra ahora */}
            {pagaAhora > 0 && (
              <div style={{ marginTop: 10 }}>
                <label>Método de pago (de lo que se paga ahora)</label>
                <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} style={{ maxWidth: 260 }}>
                  <option value="efectivo">Efectivo (entra a caja)</option>
                  <option value="transferencia">Transferencia bancaria (no entra a caja)</option>
                </select>
              </div>
            )}

            <div className="totals-row" style={{ marginTop: 12, flexDirection: 'column', gap: 4 }}>
              {descuentoValor > 0 && <span className="muted">Subtotal: {formatCOP(subtotalBruto)}</span>}
              {descuentoValor > 0 && <span className="muted">Descuento{descGlobalPct > 0 ? ` (${descGlobalPct}%)` : ' por producto'}: −{formatCOP(descuentoValor)}</span>}
              <span>Total: <strong>{formatCOP(totalForm)}</strong></span>
              {anticipoUsado > 0 && <span className="muted">Anticipo aplicado: −{formatCOP(anticipoUsado)}</span>}
              <span>Paga ahora: <strong>{formatCOP(pagaAhora)}</strong></span>
              {quedaDebiendo > 0 && <span className="texto-salida">Queda debiendo: <strong>{formatCOP(quedaDebiendo)}</strong></span>}
            </div>

            <label style={{ marginTop: 10 }}>Comentario (opcional)</label>
            <input value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Ej: venta de contado" />

            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={guardando}>
                {guardando ? 'Guardando…' : 'Registrar venta'}
              </button>
              <button type="button" className="btn-secondary" onClick={resetForm}>Cancelar</button>
            </div>
          </form>
        </>
      )}

      {/* Modal detalle venta */}
      {ventaDetalle && (
        <>
          <div className="overlay" onClick={() => setDetalleId(null)} />
          <div className="modal">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {ventaDetalle.codigo || 'Venta #' + ventaDetalle.id}
              {(() => { const e = ESTADO_PAGO[ventaDetalle.estadoPago] || ESTADO_PAGO.pendiente; return <span className={`chip ${e.chip}`}>{e.label}</span> })()}
            </h3>
            <p className="muted small" style={{ marginTop: 0 }}>
              {ventaDetalle.clienteNombre || 'Sin cliente'} · {formatFecha(ventaDetalle.fecha)}
              {ventaDetalle.pedidoId && <> · Pedido #{ventaDetalle.pedidoId}</>}
              {ventaDetalle.comentario && <> · 💬 {ventaDetalle.comentario}</>}
            </p>
            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="num">Cantidad</th>
                    <th className="num">Precio</th>
                    <th className="num">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {ventaDetalle.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.productoNombre}{it.colorNombre ? <span className="chip" style={{ marginLeft: 6 }}>{it.colorNombre}</span> : null}</td>
                      <td className="num">{it.cantidad}</td>
                      <td className="num">{formatCOP(it.precioUnitario)}</td>
                      <td className="num">{formatCOP(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="totals-row" style={{ marginTop: 12, flexDirection: 'column', gap: 4 }}>
              <span>Total: <strong>{formatCOP(ventaDetalle.total)}</strong></span>
              {ventaDetalle.anticipoAplicado > 0 && <span className="muted">Anticipo aplicado: −{formatCOP(ventaDetalle.anticipoAplicado)}</span>}
              <span>Pagado: <strong>{formatCOP(ventaDetalle.pagado)}</strong></span>
              {ventaDetalle.saldo > 0 && <span className="texto-salida">Saldo pendiente: <strong>{formatCOP(ventaDetalle.saldo)}</strong></span>}
            </div>

            {/* Historial de abonos */}
            {ventaDetalle.pagos && ventaDetalle.pagos.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <strong className="small">Abonos registrados</strong>
                <div className="table-wrap" style={{ marginTop: 4 }}>
                  <table className="table compact">
                    <thead>
                      <tr><th>Fecha</th><th>Comentario</th><th className="num">Monto</th></tr>
                    </thead>
                    <tbody>
                      {ventaDetalle.pagos.map((p) => (
                        <tr key={p.id}>
                          <td className="small">{formatFecha(p.fecha)}</td>
                          <td>{p.comentario || '—'}</td>
                          <td className="num">{formatCOP(p.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="form-actions" style={{ flexWrap: 'wrap' }}>
              {puedeEditar && ventaDetalle.saldo > 0 && (
                <button className="btn-primary" onClick={() => { abrirPago(ventaDetalle); setDetalleId(null) }}>💵 Registrar abono</button>
              )}
              <button className="btn-secondary" onClick={() => handlePdf(ventaDetalle)}>📄 PDF</button>
              <button className="btn-secondary" onClick={() => handleImprimir(ventaDetalle)}>🖨️ Imprimir</button>
              <button className="btn-secondary" onClick={() => handleWhatsApp(ventaDetalle)}>🟢 WhatsApp</button>
              <button className="btn-secondary" onClick={() => setDetalleId(null)}>Cerrar</button>
            </div>
          </div>
        </>
      )}

      {/* Modal registrar abono */}
      {ventaPago && (
        <>
          <div className="overlay" onClick={cerrarPago} />
          <form className="modal" onSubmit={handleRegistrarPago}>
            <h3>Registrar abono · {ventaPago.codigo || '#' + ventaPago.id}</h3>
            <p className="muted small" style={{ marginTop: 0 }}>
              {ventaPago.clienteNombre || 'Sin cliente'} · Saldo pendiente: <strong>{formatCOP(ventaPago.saldo)}</strong>
            </p>
            <div className="row">
              <div style={{ flex: 1 }}>
                <label>Monto recibido</label>
                <input type="number" min="0" step="any" max={ventaPago.saldo} value={pagoMonto} onChange={(e) => setPagoMonto(e.target.value)} placeholder="0" autoFocus />
              </div>
              <div style={{ flex: 1 }}>
                <label>Fecha</label>
                <input type="date" value={pagoFecha} onChange={(e) => setPagoFecha(e.target.value)} />
              </div>
            </div>
            <label style={{ marginTop: 10 }}>Método de pago</label>
            <select value={pagoMetodo} onChange={(e) => setPagoMetodo(e.target.value)}>
              <option value="efectivo">Efectivo (entra a caja)</option>
              <option value="transferencia">Transferencia bancaria (no entra a caja)</option>
            </select>
            <label style={{ marginTop: 10 }}>Comentario (opcional)</label>
            <input value={pagoComentario} onChange={(e) => setPagoComentario(e.target.value)} placeholder="Ej: abono en efectivo" />
            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={guardandoPago}>
                {guardandoPago ? 'Guardando…' : 'Registrar abono'}
              </button>
              <button type="button" className="btn-secondary" onClick={cerrarPago}>Cancelar</button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}

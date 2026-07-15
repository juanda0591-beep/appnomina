import { useMemo, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP, formatFecha } from '../utils/format.js'
import { notify, confirmar } from '../utils/notify.js'
import Vacio from '../components/Vacio.jsx'
import { generarPdfPedido, pedidoPdfFile } from '../utils/pdf.js'
import { abrirWhatsApp, mensajePedido } from '../utils/whatsapp.js'

const ESTADO_LABEL = { pendiente: 'Pendiente', entregado: 'Entregado', anulado: 'Anulado' }
const emptyItem = () => ({ productoId: '', varianteId: '', cantidad: '', precioUnitario: '' })

export default function Pedidos() {
  const {
    pedidos, clientes, productos, empresa,
    addPedido, updatePedido, deletePedido, convertirPedido,
  } = useData()
  const { puede } = useAuth()
  const puedeCrear = puede('pedidos', 'crear')
  const puedeEditar = puede('pedidos', 'editar')
  const puedeEliminar = puede('pedidos', 'eliminar')
  const puedeVender = puede('ventas', 'crear')

  const [formAbierto, setFormAbierto] = useState(false)
  const [editId, setEditId] = useState(null)
  const [clienteId, setClienteId] = useState('')
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [comentario, setComentario] = useState('')
  const [items, setItems] = useState([emptyItem()])
  const [guardando, setGuardando] = useState(false)
  const [detalleId, setDetalleId] = useState(null)

  const pedidoDetalle = pedidos.find((p) => p.id === detalleId)

  const resetForm = () => {
    setEditId(null); setClienteId(''); setFechaEntrega(''); setComentario('')
    setItems([emptyItem()]); setFormAbierto(false)
  }

  const startEdit = (p) => {
    setEditId(p.id)
    setClienteId(p.clienteId ? String(p.clienteId) : '')
    setFechaEntrega(p.fechaEntrega ? p.fechaEntrega.slice(0, 10) : '')
    setComentario(p.comentario || '')
    setItems(p.items.length ? p.items.map((it) => ({
      productoId: it.productoId ? String(it.productoId) : '',
      varianteId: it.varianteId ? String(it.varianteId) : '',
      cantidad: String(it.cantidad),
      precioUnitario: String(it.precioUnitario),
    })) : [emptyItem()])
    setFormAbierto(true)
  }

  const setItem = (idx, campo, val) => {
    setItems((its) => its.map((it, i) => {
      if (i !== idx) return it
      const next = { ...it, [campo]: val }
      // Al elegir producto, precargar su valor de venta si el precio está vacío
      if (campo === 'productoId') {
        const prod = productos.find((p) => String(p.id) === String(val))
        if (prod && !it.precioUnitario) next.precioUnitario = String(prod.valorVenta || '')
        next.varianteId = prod?.variantes?.[0] ? String(prod.variantes[0].id) : ''
      }
      return next
    }))
  }
  const addItem = () => setItems((its) => [...its, emptyItem()])
  const removeItem = (idx) => setItems((its) => (its.length === 1 ? its : its.filter((_, i) => i !== idx)))

  const totalForm = items.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0), 0)

  // Chequeo de stock del pedido: un pedido entrega PRODUCTO terminado, así que se
  // compara la cantidad pedida contra el stock disponible de cada producto/color
  // (por variante). Es informativo (no bloquea): marca en verde lo que alcanza y en
  // rojo lo que falta. El material se controla aparte, al fabricar en Producción.
  const chequeoStock = useMemo(() => {
    const req = {} // clave producto+variante -> { nombre, requerido, stock }
    for (const it of items) {
      const cant = Number(it.cantidad) || 0
      if (!it.productoId || cant <= 0) continue
      const prod = productos.find((p) => String(p.id) === String(it.productoId))
      if (!prod) continue
      const variante = (prod.variantes || []).find((v) => String(v.id) === String(it.varianteId))
      // Stock disponible: el de la variante elegida, o el total del producto si no hay variante
      const stock = variante ? (Number(variante.stock) || 0) : (Number(prod.stock) || 0)
      const nombre = variante?.colorNombre ? `${prod.nombre} · ${variante.colorNombre}` : prod.nombre
      const key = variante ? `v${variante.id}` : `p${prod.id}`
      if (!req[key]) req[key] = { key, nombre, requerido: 0, stock }
      req[key].requerido += cant
    }
    const filas = Object.values(req)
      .map((r) => ({ ...r, falta: Math.max(0, r.requerido - r.stock) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
    return { filas, hayFaltantes: filas.some((f) => f.falta > 0) }
  }, [items, productos])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const itemsValidos = items.filter((it) => it.productoId && Number(it.cantidad) > 0)
    if (itemsValidos.length === 0) { notify.error('Agrega al menos un producto'); return }
    setGuardando(true)
    try {
      const payload = {
        clienteId: clienteId || null,
        fechaEntrega: fechaEntrega || null,
        comentario,
        items: itemsValidos.map((it) => ({
          productoId: Number(it.productoId),
          varianteId: it.varianteId ? Number(it.varianteId) : null,
          cantidad: Number(it.cantidad),
          precioUnitario: Number(it.precioUnitario) || 0,
        })),
      }
      if (editId) {
        await updatePedido(editId, payload)
        notify.ok('Pedido actualizado')
      } else {
        await addPedido(payload)
        notify.ok('Pedido creado')
      }
      resetForm()
    } catch (err) {
      notify.error('Error al guardar el pedido: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  const handleEliminar = async (p) => {
    if (!(await confirmar(`¿Eliminar el pedido #${p.id}?`))) return
    try {
      await deletePedido(p.id)
      notify.ok('Pedido eliminado')
    } catch (err) {
      notify.error('Error: ' + err.message)
    }
  }

  const handleConvertir = async (p) => {
    let aplicarAnticipo = false
    const cliente = clientes.find((c) => String(c.id) === String(p.clienteId))
    if (cliente && cliente.saldoFavor > 0) {
      aplicarAnticipo = await confirmar(
        `${cliente.nombre} tiene ${formatCOP(cliente.saldoFavor)} de saldo a favor. ¿Aplicarlo a esta venta?`,
        { titulo: 'Aplicar anticipo', textoOk: 'Sí, aplicar', textoCancelar: 'No aplicar', peligro: false }
      )
    } else {
      if (!(await confirmar(`¿Convertir el pedido #${p.id} en venta? Se descontará stock e ingresará la plata.`, { titulo: 'Convertir en venta', textoOk: 'Sí, convertir', peligro: false }))) return
    }
    try {
      const venta = await convertirPedido(p.id, { aplicarAnticipo })
      notify.ok('Pedido convertido en venta')
      for (const aviso of venta?.avisos || []) notify.error(`⚠️ ${aviso}`)
    } catch (err) {
      notify.error('Error al convertir: ' + err.message)
    }
  }

  const clienteDePedido = (p) => clientes.find((c) => String(c.id) === String(p.clienteId)) || null

  // Descarga el PDF del pedido
  const handlePdf = (p) => {
    try {
      generarPdfPedido({ empresa, pedido: p, cliente: clienteDePedido(p) })
    } catch (err) {
      notify.error('No se pudo generar el PDF: ' + err.message)
    }
  }

  // Envía el pedido por WhatsApp. En móviles con soporte comparte el PDF directo;
  // si no, abre WhatsApp con el mensaje de texto (y descarga el PDF aparte).
  const handleWhatsApp = async (p) => {
    const cliente = clienteDePedido(p)
    const texto = mensajePedido({ pedido: p, empresa })
    try {
      const file = pedidoPdfFile({ empresa, pedido: p, cliente })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `Pedido #${p.id}`, text: texto })
        return
      }
    } catch (err) {
      // Si el usuario cancela el diálogo de compartir, no seguimos al respaldo
      if (err?.name === 'AbortError') return
    }
    // Respaldo (escritorio): descarga el PDF y abre WhatsApp con el resumen
    try { generarPdfPedido({ empresa, pedido: p, cliente }) } catch { /* ignore */ }
    if (!cliente?.telefono) {
      notify.info('Este cliente no tiene teléfono; se abrirá WhatsApp para que elijas el contacto. El PDF se descargó para adjuntarlo.')
    } else {
      notify.info('Se abrió WhatsApp con el resumen. Adjunta el PDF que se descargó.')
    }
    abrirWhatsApp({ telefono: cliente?.telefono, texto })
  }

  const nombreCliente = (p) => p.clienteNombre || '— sin cliente'

  return (
    <div>
      <h2>📝 Pedidos</h2>
      <p className="muted">
        Registra lo que un cliente encarga. Un pedido es la intención de compra: no toca inventario
        ni caja hasta que lo conviertas en venta.
      </p>

      {puedeCrear && (
        <div className="form-actions">
          <button type="button" className="btn-primary" onClick={() => { resetForm(); setFormAbierto(true) }}>
            + Nuevo pedido
          </button>
        </div>
      )}

      <div className="card">
        <h3>Pedidos ({pedidos.length})</h3>
        {pedidos.length === 0 && (
          <Vacio icono="📝" titulo="Aún no hay pedidos">
            Crea el primero con el botón "+ Nuevo pedido".
          </Vacio>
        )}
        {pedidos.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Entrega</th>
                  <th className="num">Total</th>
                  <th>Estado</th>
                  <th className="num">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id} className="chip-clicable" onClick={() => setDetalleId(p.id)}>
                    <td>#{p.id}</td>
                    <td>{nombreCliente(p)}</td>
                    <td className="small">{p.fechaEntrega ? formatFecha(p.fechaEntrega) : <span className="muted">—</span>}</td>
                    <td className="num">{formatCOP(p.total)}</td>
                    <td>
                      <span className={`chip ${p.estado === 'entregado' ? 'ok' : p.estado === 'anulado' ? 'danger' : 'warn'}`}>
                        {ESTADO_LABEL[p.estado] || p.estado}
                      </span>
                    </td>
                    <td className="num">
                      <div className="actions" style={{ justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                        <button className="btn-secondary btn-sm" onClick={() => handlePdf(p)} title="Descargar PDF">📄 PDF</button>
                        <button className="btn-secondary btn-sm" onClick={() => handleWhatsApp(p)} title="Enviar por WhatsApp">🟢 WhatsApp</button>
                        {p.estado === 'pendiente' && puedeVender && (
                          <button className="btn-primary btn-sm" onClick={() => handleConvertir(p)}>➡ Convertir en venta</button>
                        )}
                        {p.estado === 'pendiente' && puedeEditar && (
                          <button className="btn-secondary btn-sm" onClick={() => startEdit(p)}>Editar</button>
                        )}
                        {p.estado === 'pendiente' && puedeEliminar && (
                          <button className="btn-danger btn-sm" onClick={() => handleEliminar(p)}>Eliminar</button>
                        )}
                        {p.estado === 'entregado' && <span className="muted small">Venta #{p.ventaId}</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal crear/editar pedido */}
      {formAbierto && (
        <>
          <div className="overlay" onClick={resetForm} />
          <form className="modal modal-lg" onSubmit={handleSubmit}>
            <h3>{editId ? `Editar pedido #${editId}` : 'Nuevo pedido'}</h3>
            <div className="row">
              <div style={{ flex: 2 }}>
                <label>Cliente</label>
                <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                  <option value="">— Sin cliente —</option>
                  {clientes.filter((c) => c.tipo !== 'proveedor').map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre} {c.apellidos}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label>Fecha de entrega</label>
                <input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
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
                    <th className="num">Subtotal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => {
                    const prod = productos.find((p) => String(p.id) === String(it.productoId))
                    const variantes = prod?.variantes || []
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
                      </td>
                      <td className="num">
                        <input type="number" min="0" step="any" value={it.precioUnitario} onChange={(e) => setItem(i, 'precioUnitario', e.target.value)} placeholder="0" />
                      </td>
                      <td className="num">{formatCOP((Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0))}</td>
                      <td><button type="button" className="btn-icon danger" onClick={() => removeItem(i)}>✕</button></td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn-secondary" onClick={addItem}>+ Agregar producto</button>

            <div className="totals-row" style={{ marginTop: 12 }}>
              <span>Total del pedido: <strong>{formatCOP(totalForm)}</strong></span>
            </div>

            {/* Chequeo de stock de PRODUCTO: cuánto hay disponible por color para entregar este pedido */}
            {chequeoStock.filas.length > 0 && (
              <div className="card" style={{ background: '#f8fafc', marginTop: 14, marginBottom: 0 }}>
                <strong>📦 Stock disponible para este pedido</strong>
                <p className="muted small" style={{ margin: '4px 0 8px' }}>
                  {chequeoStock.hayFaltantes
                    ? '⚠️ No hay stock suficiente de algún producto/color. Habrá que fabricarlo antes de entregar.'
                    : '✓ Hay stock suficiente para entregar todo el pedido.'}
                </p>
                <div className="table-wrap">
                  <table className="table compact">
                    <thead>
                      <tr>
                        <th>Producto / color</th>
                        <th className="num">Pedido</th>
                        <th className="num">En stock</th>
                        <th className="num">Falta fabricar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chequeoStock.filas.map((f) => (
                        <tr key={f.key} className={f.falta > 0 ? 'fila-alerta' : ''}>
                          <td>{f.nombre}</td>
                          <td className="num">{f.requerido}</td>
                          <td className="num">{f.stock}</td>
                          <td className="num">
                            {f.falta > 0
                              ? <span className="chip danger">−{f.falta}</span>
                              : <span className="chip ok">✓</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted small" style={{ marginBottom: 0 }}>
                  Es solo un aviso; puedes crear el pedido igual. El stock se descuenta al convertirlo en venta.
                </p>
              </div>
            )}

            <label style={{ marginTop: 10 }}>Comentario (opcional)</label>
            <input value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Ej: entregar en la tarde" />

            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={guardando}>
                {guardando ? 'Guardando…' : (editId ? 'Guardar cambios' : 'Crear pedido')}
              </button>
              <button type="button" className="btn-secondary" onClick={resetForm}>Cancelar</button>
            </div>
          </form>
        </>
      )}

      {/* Modal detalle del pedido */}
      {pedidoDetalle && (
        <>
          <div className="overlay" onClick={() => setDetalleId(null)} />
          <div className="modal">
            <h3>Pedido #{pedidoDetalle.id}</h3>
            <p className="muted small" style={{ marginTop: 0 }}>
              {nombreCliente(pedidoDetalle)} · {ESTADO_LABEL[pedidoDetalle.estado]}
              {pedidoDetalle.fechaEntrega && <> · Entrega: {formatFecha(pedidoDetalle.fechaEntrega)}</>}
              {pedidoDetalle.comentario && <> · 💬 {pedidoDetalle.comentario}</>}
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
                  {pedidoDetalle.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.productoNombre}{it.colorNombre ? <span className="chip" style={{ marginLeft: 6 }}>{it.colorNombre}</span> : null}</td>
                      <td className="num">{it.cantidad}</td>
                      <td className="num">{formatCOP(it.precioUnitario)}</td>
                      <td className="num">{formatCOP(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}><strong>Total</strong></td>
                    <td className="num"><strong>{formatCOP(pedidoDetalle.total)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="form-actions">
              <button className="btn-secondary" onClick={() => handlePdf(pedidoDetalle)}>📄 Descargar PDF</button>
              <button className="btn-primary" onClick={() => handleWhatsApp(pedidoDetalle)}>🟢 Enviar por WhatsApp</button>
              <button className="btn-secondary" onClick={() => setDetalleId(null)}>Cerrar</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

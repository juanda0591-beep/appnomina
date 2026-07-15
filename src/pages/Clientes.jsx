import { useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP, formatFecha, hoyISO } from '../utils/format.js'
import { notify, confirmar } from '../utils/notify.js'
import Vacio from '../components/Vacio.jsx'

const hoy = hoyISO
const emptyCliente = () => ({
  nombre: '', apellidos: '', cedula: '', correo: '',
  direccion: '', municipio: '', telefono: '', tipo: 'cliente',
})
const emptyAnticipo = () => ({ monto: '', fecha: hoy(), descripcion: '' })
const ANT_LABEL = { abono: 'Abono', aplicado: 'Aplicado a venta', devuelto: 'Devuelto' }

export default function Clientes() {
  const {
    clientes, pedidos, ventas,
    addCliente, updateCliente, deleteCliente,
    getClienteAnticipos, addAnticipo, deleteAnticipo,
  } = useData()
  const { puede } = useAuth()
  const puedeCrear = puede('clientes', 'crear')
  const puedeEditar = puede('clientes', 'editar')
  const puedeEliminar = puede('clientes', 'eliminar')

  // --- Clientela (CRUD) ---
  const [form, setForm] = useState(emptyCliente())
  const [formAbierto, setFormAbierto] = useState(false)
  const [editId, setEditId] = useState(null)
  const [busqueda, setBusqueda] = useState('')

  const setField = (campo, val) => setForm((f) => ({ ...f, [campo]: val }))
  const resetForm = () => { setForm(emptyCliente()); setEditId(null); setFormAbierto(false) }

  const startEdit = (c) => {
    setEditId(c.id)
    setForm({
      nombre: c.nombre || '', apellidos: c.apellidos || '', cedula: c.cedula || '',
      correo: c.correo || '', direccion: c.direccion || '', municipio: c.municipio || '',
      telefono: c.telefono || '', tipo: c.tipo || 'cliente',
    })
    setFormAbierto(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) { notify.error('Escribe el nombre'); return }
    const editando = Boolean(editId)
    try {
      if (editando) {
        await updateCliente(editId, form)
        notify.ok('Cliente actualizado')
      } else {
        await addCliente(form)
        notify.ok('Cliente agregado')
      }
      resetForm()
    } catch (err) {
      notify.error('Error al guardar: ' + err.message)
    }
  }

  const handleEliminar = async (c) => {
    if (!(await confirmar(`¿Eliminar a "${c.nombre}"?`))) return
    try {
      await deleteCliente(c.id)
      notify.ok('Cliente eliminado')
    } catch (err) {
      notify.error('Error: ' + err.message)
    }
  }

  const q = busqueda.trim().toLowerCase()
  const clientesFiltrados = q
    ? clientes.filter((c) =>
        [c.nombre, c.apellidos, c.cedula, c.correo, c.municipio, c.telefono]
          .some((v) => (v || '').toLowerCase().includes(q))
      )
    : clientes

  // --- Modal de Anticipos (por cliente) ---
  const [anticiposCliente, setAnticiposCliente] = useState(null) // cliente con el modal abierto
  const [anticipos, setAnticipos] = useState([])
  const [antForm, setAntForm] = useState(emptyAnticipo())
  const [antFormAbierto, setAntFormAbierto] = useState(false)
  const [guardandoAnt, setGuardandoAnt] = useState(false)

  const setAntField = (campo, val) => setAntForm((f) => ({ ...f, [campo]: val }))

  const abrirAnticipos = async (c) => {
    setAnticiposCliente(c)
    setAnticipos([])
    setAntFormAbierto(false)
    try {
      setAnticipos(await getClienteAnticipos(c.id))
    } catch (err) {
      notify.error('Error al cargar anticipos: ' + err.message)
    }
  }
  const cerrarAnticipos = () => {
    setAnticiposCliente(null)
    setAnticipos([])
    setAntFormAbierto(false)
  }
  const recargarAnticipos = async () => {
    if (!anticiposCliente) return
    try {
      setAnticipos(await getClienteAnticipos(anticiposCliente.id))
    } catch { /* noop */ }
  }

  const handleSubmitAnticipo = async (e) => {
    e.preventDefault()
    if (!(Number(antForm.monto) > 0)) { notify.error('Indica un monto mayor a 0'); return }
    setGuardandoAnt(true)
    try {
      await addAnticipo(anticiposCliente.id, {
        monto: Number(antForm.monto),
        fecha: antForm.fecha,
        descripcion: antForm.descripcion,
      })
      notify.ok('Anticipo registrado')
      setAntForm(emptyAnticipo())
      setAntFormAbierto(false)
      await recargarAnticipos()
    } catch (err) {
      notify.error('Error al registrar el anticipo: ' + err.message)
    } finally {
      setGuardandoAnt(false)
    }
  }

  const handleEliminarAnticipo = async (a) => {
    if (a.tipo === 'aplicado') { notify.error('Un anticipo ya aplicado a una venta no se puede borrar.'); return }
    if (!(await confirmar('¿Eliminar este anticipo? Se revertirá el ingreso a caja.'))) return
    try {
      await deleteAnticipo(anticiposCliente.id, a.id)
      notify.ok('Anticipo eliminado')
      await recargarAnticipos()
    } catch (err) {
      notify.error('Error: ' + err.message)
    }
  }

  // Saldo a favor "en vivo" del cliente del modal (el objeto de la lista puede quedar viejo tras recargar)
  const clienteAnticiposActual = anticiposCliente
    ? clientes.find((c) => c.id === anticiposCliente.id) || anticiposCliente
    : null

  // --- Modal de Historial de transacciones (pedidos + ventas del cliente) ---
  const [historialCliente, setHistorialCliente] = useState(null)

  // Combina pedidos y ventas del cliente en una sola línea de tiempo, más recientes primero.
  const transaccionesDe = (clienteId) => {
    const lista = []
    for (const p of pedidos) {
      if (String(p.clienteId) !== String(clienteId)) continue
      lista.push({
        key: 'ped-' + p.id, clase: 'pedido', id: p.id,
        fecha: p.creado, titulo: `Pedido #${p.id}`, estado: p.estado,
        total: p.total, items: p.items || [],
      })
    }
    for (const v of ventas) {
      if (String(v.clienteId) !== String(clienteId)) continue
      lista.push({
        key: 'ven-' + v.id, clase: 'venta', id: v.id,
        fecha: v.fecha || v.creado, titulo: `Venta #${v.id}`,
        total: v.total, pagado: v.pagado, anticipoAplicado: v.anticipoAplicado, items: v.items || [],
      })
    }
    return lista.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))
  }

  const transacciones = historialCliente ? transaccionesDe(historialCliente.id) : []

  return (
    <div>
      <h2>🧑‍🤝‍🧑 Clientes</h2>

      {puedeCrear && (
        <div className="form-actions">
          <button type="button" className="btn-primary" onClick={() => { resetForm(); setFormAbierto(true) }}>
            + Nuevo cliente
          </button>
        </div>
      )}

      <div className="card">
        <h3>Directorio ({clientes.length})</h3>
        {clientes.length > 0 && (
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="🔎 Buscar por nombre, cédula, correo, municipio o teléfono…"
            style={{ marginBottom: 12 }}
          />
        )}
        {clientes.length === 0 && (
          <Vacio icono="🧑‍🤝‍🧑" titulo="Aún no hay clientes">
            Agrega el primero con el botón "+ Nuevo cliente".
          </Vacio>
        )}
        {clientes.length > 0 && clientesFiltrados.length === 0 && (
          <p className="muted">Ningún cliente coincide con la búsqueda.</p>
        )}

        {clientesFiltrados.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Cédula / NIT</th>
                  <th>Municipio</th>
                  <th>Teléfono</th>
                  <th className="num">Saldo a favor</th>
                  <th className="num">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.nombre} {c.apellidos}</strong>
                      {c.correo && <div className="muted small">{c.correo}</div>}
                    </td>
                    <td>
                      <span className={`chip ${c.tipo === 'proveedor' ? 'warn' : 'ok'}`}>
                        {c.tipo === 'proveedor' ? 'Proveedor' : 'Cliente'}
                      </span>
                    </td>
                    <td>{c.cedula || <span className="muted">—</span>}</td>
                    <td>{c.municipio || <span className="muted">—</span>}</td>
                    <td>{c.telefono || <span className="muted">—</span>}</td>
                    <td className="num">
                      {c.saldoFavor > 0
                        ? <span className="texto-entrada">{formatCOP(c.saldoFavor)}</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td className="num">
                      <div className="actions" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn-secondary btn-sm" onClick={() => abrirAnticipos(c)}>
                          💵 Anticipos
                        </button>
                        <button className="btn-secondary btn-sm" onClick={() => setHistorialCliente(c)}>
                          📋 Historial
                        </button>
                        {puedeEditar && (
                          <button className="btn-secondary btn-sm" onClick={() => startEdit(c)}>Editar</button>
                        )}
                        {puedeEliminar && (
                          <button className="btn-danger btn-sm" onClick={() => handleEliminar(c)}>Eliminar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal crear/editar cliente */}
      {formAbierto && (puedeCrear || (editId && puedeEditar)) && (
        <>
          <div className="overlay" onClick={resetForm} />
          <form className="modal" onSubmit={handleSubmit}>
            <h3>{editId ? 'Editar cliente' : 'Nuevo cliente'}</h3>
            <div className="row">
              <div style={{ flex: 1 }}>
                <label>Nombre</label>
                <input value={form.nombre} onChange={(e) => setField('nombre', e.target.value)} placeholder="Ej: Juan" autoFocus />
              </div>
              <div style={{ flex: 1 }}>
                <label>Apellidos</label>
                <input value={form.apellidos} onChange={(e) => setField('apellidos', e.target.value)} placeholder="Ej: Pérez" />
              </div>
            </div>
            <div className="row">
              <div style={{ flex: 1 }}>
                <label>Cédula / NIT</label>
                <input value={form.cedula} onChange={(e) => setField('cedula', e.target.value)} placeholder="Ej: 1094..." />
              </div>
              <div style={{ flex: 1 }}>
                <label>Teléfono celular</label>
                <input value={form.telefono} onChange={(e) => setField('telefono', e.target.value)} placeholder="Ej: 3001234567" />
              </div>
            </div>
            <label>Correo</label>
            <input type="email" value={form.correo} onChange={(e) => setField('correo', e.target.value)} placeholder="Ej: cliente@correo.com" />
            <div className="row">
              <div style={{ flex: 2 }}>
                <label>Dirección</label>
                <input value={form.direccion} onChange={(e) => setField('direccion', e.target.value)} placeholder="Ej: Calle 1 # 2-3" />
              </div>
              <div style={{ flex: 1 }}>
                <label>Municipio</label>
                <input value={form.municipio} onChange={(e) => setField('municipio', e.target.value)} placeholder="Ej: Yumbo" />
              </div>
            </div>
            <label>Tipo</label>
            <select value={form.tipo} onChange={(e) => setField('tipo', e.target.value)}>
              <option value="cliente">Cliente</option>
              <option value="proveedor">Proveedor</option>
            </select>
            <div className="form-actions">
              <button type="submit" className="btn-primary">{editId ? 'Guardar cambios' : 'Agregar cliente'}</button>
              <button type="button" className="btn-secondary" onClick={resetForm}>Cancelar</button>
            </div>
          </form>
        </>
      )}

      {/* Modal: Anticipos del cliente */}
      {anticiposCliente && (
        <>
          <div className="overlay" onClick={cerrarAnticipos} />
          <div className="modal">
            <h3>Anticipos de {anticiposCliente.nombre} {anticiposCliente.apellidos}</h3>
            <p className="muted small" style={{ marginTop: 0 }}>
              Abonos a cuenta de pedidos futuros. Cada abono entra a caja como ingreso y suma al saldo a favor,
              que se aplica automáticamente al facturar una venta.
            </p>

            <div className="totals-row">
              <span>Saldo a favor: <strong className="texto-entrada">{formatCOP(clienteAnticiposActual?.saldoFavor || 0)}</strong></span>
            </div>

            {puedeCrear && !antFormAbierto && (
              <div className="form-actions" style={{ marginTop: 12 }}>
                <button type="button" className="btn-primary" onClick={() => { setAntForm(emptyAnticipo()); setAntFormAbierto(true) }}>
                  + Registrar abono
                </button>
              </div>
            )}

            {/* Formulario de abono en línea (dentro del mismo modal) */}
            {antFormAbierto && (
              <form onSubmit={handleSubmitAnticipo} className="card" style={{ background: '#f8fafc', marginTop: 12 }}>
                <div className="row">
                  <div style={{ flex: 1 }}>
                    <label>Monto</label>
                    <input type="number" min="0" step="any" value={antForm.monto} onChange={(e) => setAntField('monto', e.target.value)} placeholder="0" autoFocus />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Fecha</label>
                    <input type="date" value={antForm.fecha} onChange={(e) => setAntField('fecha', e.target.value)} />
                  </div>
                </div>
                <label>Descripción (opcional)</label>
                <input value={antForm.descripcion} onChange={(e) => setAntField('descripcion', e.target.value)} placeholder="Ej: abono pedido armario" />
                <div className="form-actions">
                  <button type="submit" className="btn-primary" disabled={guardandoAnt}>
                    {guardandoAnt ? 'Guardando…' : 'Registrar abono'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setAntFormAbierto(false)}>Cancelar</button>
                </div>
              </form>
            )}

            {anticipos.length === 0 && !antFormAbierto && (
              <Vacio icono="💵" titulo="Sin anticipos registrados">
                Registra el primer abono de este cliente.
              </Vacio>
            )}
            {anticipos.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th className="num">Monto</th>
                      <th>Detalle</th>
                      <th className="num"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {anticipos.map((a) => (
                      <tr key={a.id}>
                        <td>{formatFecha(a.fecha)}</td>
                        <td>
                          <span className={`chip ${a.tipo === 'abono' ? 'ok' : ''}`}>
                            {ANT_LABEL[a.tipo] || a.tipo}
                          </span>
                        </td>
                        <td className={`num ${a.tipo === 'abono' ? 'texto-entrada' : 'texto-salida'}`}>
                          {a.tipo === 'abono' ? '+' : '-'}{formatCOP(a.monto)}
                        </td>
                        <td className="muted small">{a.descripcion}</td>
                        <td className="num">
                          {puedeEliminar && a.tipo !== 'aplicado' && (
                            <button className="btn-danger btn-sm" onClick={() => handleEliminarAnticipo(a)}>Eliminar</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={cerrarAnticipos}>Cerrar</button>
            </div>
          </div>
        </>
      )}

      {/* Modal: Historial de transacciones (pedidos + ventas) */}
      {historialCliente && (
        <>
          <div className="overlay" onClick={() => setHistorialCliente(null)} />
          <div className="modal" style={{ width: 'min(820px, 92vw)' }}>
            <h3>Historial de {historialCliente.nombre} {historialCliente.apellidos}</h3>
            <p className="muted small" style={{ marginTop: 0 }}>Pedidos y ventas de este cliente.</p>

            {transacciones.length === 0 && (
              <Vacio icono="📋" titulo="Sin transacciones">
                Este cliente aún no tiene pedidos ni ventas.
              </Vacio>
            )}
            {transacciones.length > 0 && (
              <div className="table-wrap">
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Transacción</th>
                      <th>Detalle</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transacciones.map((t) => (
                      <tr key={t.key}>
                        <td>{formatFecha(t.fecha)}</td>
                        <td>
                          <span className={`chip ${t.clase === 'venta' ? 'ok' : 'warn'}`}>{t.titulo}</span>
                          {t.clase === 'pedido' && t.estado && (
                            <div className="muted small">{t.estado === 'entregado' ? 'Entregado' : t.estado === 'anulado' ? 'Anulado' : 'Pendiente'}</div>
                          )}
                        </td>
                        <td className="muted small">
                          {t.items.map((it) => `${it.productoNombre} ×${it.cantidad}`).join(', ') || '—'}
                          {t.clase === 'venta' && t.anticipoAplicado > 0 && (
                            <div>Anticipo aplicado: {formatCOP(t.anticipoAplicado)} · Pagado: {formatCOP(t.pagado)}</div>
                          )}
                        </td>
                        <td className="num"><strong>{formatCOP(t.total)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => setHistorialCliente(null)}>Cerrar</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

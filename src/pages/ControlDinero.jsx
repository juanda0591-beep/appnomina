import { useEffect, useMemo, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP, formatFecha } from '../utils/format.js'

const CATEGORIAS_INGRESO = ['Venta', 'Abono cliente', 'Préstamo recibido', 'Otro ingreso']
const CATEGORIAS_GASTO = ['Materiales', 'Servicios', 'Arriendo', 'Transporte', 'Nómina', 'Adelanto', 'Otro gasto']

const hoy = () => new Date().toISOString().slice(0, 10)
const formVacio = () => ({ fecha: hoy(), categoria: '', monto: '', descripcion: '', comprobante: '', comprobanteTipo: '' })

// Etiqueta legible del origen de un movimiento automático
const ORIGEN_LABEL = { nomina: 'Pago de nómina', prestamo: 'Adelanto' }

export default function ControlDinero() {
  const { movimientos, addMovimiento, deleteMovimiento, getBalance } = useData()
  const { puede } = useAuth()
  const puedeCrear = puede('control-dinero', 'crear')
  const puedeEliminar = puede('control-dinero', 'eliminar')

  const [tab, setTab] = useState('balance') // 'ingreso' | 'gasto' | 'balance'
  const [form, setForm] = useState(formVacio())
  const [guardando, setGuardando] = useState(false)
  const [balance, setBalance] = useState({ ingresos: 0, gastos: 0, balance: 0 })

  // Balance recalculado en memoria a partir de los movimientos cargados
  useEffect(() => {
    const ingresos = movimientos.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
    const gastos = movimientos.filter((m) => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)
    setBalance({ ingresos, gastos, balance: ingresos - gastos })
  }, [movimientos])

  const setField = (field, val) => setForm((f) => ({ ...f, [field]: val }))

  const onComprobante = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!/(application\/pdf|image\/(jpeg|jpg|png))/.test(file.type)) {
      alert('El comprobante debe ser PDF, JPG o PNG')
      e.target.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('El comprobante es muy pesado (máx 5 MB). Usa un archivo más liviano.')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setField('comprobante', reader.result) // dataURL base64
      setField('comprobanteTipo', file.type)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!(Number(form.monto) > 0)) return alert('Ingresa un monto válido')
    setGuardando(true)
    try {
      await addMovimiento({ ...form, tipo: tab })
      setForm(formVacio())
      alert(tab === 'ingreso' ? '✅ Ingreso registrado' : '✅ Gasto registrado')
    } catch (err) {
      alert('Error al guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  const verComprobante = (id) => {
    const token = localStorage.getItem('nomina_token')
    // Abre el comprobante en una pestaña nueva (el endpoint exige token)
    fetch(`/api/movimientos/${id}/comprobante`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('No se pudo abrir'))))
      .then((blob) => window.open(URL.createObjectURL(blob), '_blank'))
      .catch((err) => alert(err.message))
  }

  // Filtra los movimientos según la pestaña (en balance se muestran todos)
  const listaActual = useMemo(() => {
    if (tab === 'balance') return movimientos
    return movimientos.filter((m) => m.tipo === tab)
  }, [movimientos, tab])

  const categorias = tab === 'ingreso' ? CATEGORIAS_INGRESO : CATEGORIAS_GASTO

  return (
    <div>
      <h2>💰 Control de dinero</h2>

      {/* Pestañas */}
      <div className="tabs">
        <button className={`tab ${tab === 'ingreso' ? 'active' : ''}`} onClick={() => setTab('ingreso')}>
          ⬆️ Ingresos
        </button>
        <button className={`tab ${tab === 'gasto' ? 'active' : ''}`} onClick={() => setTab('gasto')}>
          ⬇️ Gastos
        </button>
        <button className={`tab ${tab === 'balance' ? 'active' : ''}`} onClick={() => setTab('balance')}>
          📊 Balance
        </button>
      </div>

      {/* Resumen de balance (siempre visible) */}
      <div className="card balance-cards">
        <div className="balance-box ingreso">
          <span className="muted small">Ingresos</span>
          <strong>{formatCOP(balance.ingresos)}</strong>
        </div>
        <div className="balance-box gasto">
          <span className="muted small">Gastos</span>
          <strong>{formatCOP(balance.gastos)}</strong>
        </div>
        <div className="balance-box total">
          <span className="muted small">Dinero disponible</span>
          <strong className={balance.balance < 0 ? 'danger-text' : ''}>{formatCOP(balance.balance)}</strong>
        </div>
      </div>

      {/* Formulario de ingreso / gasto */}
      {tab !== 'balance' && puedeCrear && (
        <form className="card" onSubmit={handleSubmit}>
          <h3>{tab === 'ingreso' ? 'Registrar ingreso' : 'Registrar gasto'}</h3>
          <div className="row">
            <div style={{ flex: 1 }}>
              <label>Fecha</label>
              <input type="date" value={form.fecha} onChange={(e) => setField('fecha', e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label>Categoría</label>
              <input
                list="categorias-dinero"
                value={form.categoria}
                onChange={(e) => setField('categoria', e.target.value)}
                placeholder="Selecciona o escribe"
              />
              <datalist id="categorias-dinero">
                {categorias.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div style={{ flex: 1 }}>
              <label>Monto</label>
              <input type="number" min="0" step="any" value={form.monto} onChange={(e) => setField('monto', e.target.value)} />
            </div>
          </div>

          <label>Descripción</label>
          <input value={form.descripcion} onChange={(e) => setField('descripcion', e.target.value)} placeholder="Detalle del movimiento" />

          <label>Comprobante (PDF, JPG o PNG)</label>
          <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={onComprobante} />
          {form.comprobante && <span className="chip">✅ Comprobante adjunto</span>}

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando…' : tab === 'ingreso' ? 'Registrar ingreso' : 'Registrar gasto'}
            </button>
          </div>
        </form>
      )}

      {/* Historial de movimientos */}
      <div className="card">
        <h3>
          {tab === 'balance' ? 'Historial de movimientos' : tab === 'ingreso' ? 'Ingresos registrados' : 'Gastos registrados'}{' '}
          ({listaActual.length})
        </h3>
        {listaActual.length === 0 && <p className="muted">Aún no hay movimientos.</p>}
        {listaActual.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Categoría</th>
                  <th>Descripción</th>
                  <th className="num">Monto</th>
                  <th>Comprobante</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listaActual.map((m) => (
                  <tr key={m.id}>
                    <td>{formatFecha(m.fecha)}</td>
                    <td>
                      <span className={`chip ${m.tipo === 'ingreso' ? 'ok' : 'warn'}`}>
                        {m.tipo === 'ingreso' ? '⬆️ Ingreso' : '⬇️ Gasto'}
                      </span>
                    </td>
                    <td>{m.categoria || '—'}</td>
                    <td>
                      {m.descripcion || '—'}
                      {m.origen !== 'manual' && (
                        <div className="muted small">🔒 Automático ({ORIGEN_LABEL[m.origen] || m.origen})</div>
                      )}
                    </td>
                    <td className={`num ${m.tipo === 'gasto' ? 'danger-text' : ''}`}>
                      {m.tipo === 'gasto' ? '-' : '+'}{formatCOP(m.monto)}
                    </td>
                    <td>
                      {m.tieneComprobante ? (
                        <button className="btn-secondary" onClick={() => verComprobante(m.id)}>📎 Ver</button>
                      ) : (
                        <span className="muted small">—</span>
                      )}
                    </td>
                    <td>
                      {m.origen === 'manual' ? (
                        puedeEliminar ? (
                          <button
                            className="btn-icon danger"
                            title="Eliminar"
                            onClick={() => {
                              if (confirm('¿Eliminar este movimiento?')) deleteMovimiento(m.id)
                            }}
                          >
                            ✕
                          </button>
                        ) : (
                          <span className="muted small">—</span>
                        )
                      ) : (
                        <span className="muted small" title="Se elimina desde la nómina o el adelanto que lo originó">🔒</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

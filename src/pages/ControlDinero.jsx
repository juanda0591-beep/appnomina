import { useEffect, useMemo, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP, formatFecha, hoyISO } from '../utils/format.js'
import { notify, confirmar } from '../utils/notify.js'
import Vacio from '../components/Vacio.jsx'

const CATEGORIAS_INGRESO = ['Venta', 'Abono cliente', 'Préstamo recibido', 'Otro ingreso']
const CATEGORIAS_GASTO = ['Materiales', 'Servicios', 'Arriendo', 'Transporte', 'Nómina', 'Adelanto', 'Otro gasto']

const hoy = hoyISO
const formVacio = () => ({ fecha: hoy(), categoria: '', monto: '', descripcion: '', comprobante: '', comprobanteTipo: '' })

// Etiqueta legible del origen de un movimiento automático
const ORIGEN_LABEL = { nomina: 'Pago de nómina', prestamo: 'Adelanto' }

export default function ControlDinero() {
  const { movimientos, addMovimiento, deleteMovimiento, addComprobanteMovimiento } = useData()
  const { puede } = useAuth()
  const puedeCrear = puede('control-dinero', 'crear')
  const puedeEliminar = puede('control-dinero', 'eliminar')

  const [tab, setTab] = useState('balance') // 'ingreso' | 'gasto' | 'balance'
  const [form, setForm] = useState(formVacio())
  const [formAbierto, setFormAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [subiendoId, setSubiendoId] = useState(null) // id del movimiento al que se le sube comprobante
  const [balance, setBalance] = useState({ ingresos: 0, gastos: 0, balance: 0 })

  // Balance recalculado en memoria a partir de los movimientos cargados
  useEffect(() => {
    const ingresos = movimientos.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
    const gastos = movimientos.filter((m) => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)
    setBalance({ ingresos, gastos, balance: ingresos - gastos })
  }, [movimientos])

  const setField = (field, val) => setForm((f) => ({ ...f, [field]: val }))

  // Valida un archivo y devuelve una promesa con { comprobante (dataURL), comprobanteTipo }.
  // Devuelve null (y avisa) si el tipo o tamaño no son válidos.
  const leerComprobante = (file) => {
    if (!file) return Promise.resolve(null)
    if (!/(application\/pdf|image\/(jpeg|jpg|png))/.test(file.type)) {
      notify.error('El comprobante debe ser PDF, JPG o PNG')
      return Promise.resolve(null)
    }
    if (file.size > 5 * 1024 * 1024) {
      notify.error('El comprobante es muy pesado (máx 5 MB). Usa un archivo más liviano.')
      return Promise.resolve(null)
    }
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve({ comprobante: reader.result, comprobanteTipo: file.type })
      reader.onerror = () => { notify.error('No se pudo leer el archivo'); resolve(null) }
      reader.readAsDataURL(file)
    })
  }

  const onComprobante = async (e) => {
    const datos = await leerComprobante(e.target.files?.[0])
    e.target.value = ''
    if (!datos) return
    setField('comprobante', datos.comprobante)
    setField('comprobanteTipo', datos.comprobanteTipo)
  }

  // Sube un comprobante a un movimiento ya registrado (desde el historial)
  const onSubirComprobante = async (movId, e) => {
    const datos = await leerComprobante(e.target.files?.[0])
    e.target.value = ''
    if (!datos) return
    setSubiendoId(movId)
    try {
      await addComprobanteMovimiento(movId, datos)
      notify.ok('Comprobante adjuntado')
    } catch (err) {
      notify.error('Error al subir el comprobante: ' + err.message)
    } finally {
      setSubiendoId(null)
    }
  }

  const resetForm = () => {
    setForm(formVacio())
    setFormAbierto(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!(Number(form.monto) > 0)) { notify.error('Ingresa un monto válido'); return }
    const esIngreso = tab === 'ingreso'
    const ok = await confirmar(
      `Vas a registrar ${esIngreso ? 'un ingreso' : 'un gasto'} de ${formatCOP(Number(form.monto))}. ¿Confirmar?`,
      { titulo: esIngreso ? 'Confirmar ingreso' : 'Confirmar gasto', textoOk: 'Sí, registrar', peligro: false }
    )
    if (!ok) return
    setGuardando(true)
    try {
      await addMovimiento({ ...form, tipo: tab })
      resetForm()
      notify.ok(esIngreso ? 'Ingreso registrado' : 'Gasto registrado')
    } catch (err) {
      notify.error('Error al guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  const verComprobante = (id) => {
    const token = sessionStorage.getItem('nomina_token')
    // Abre el comprobante en una pestaña nueva (el endpoint exige token)
    fetch(`/api/movimientos/${id}/comprobante`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('No se pudo abrir'))))
      .then((blob) => window.open(URL.createObjectURL(blob), '_blank'))
      .catch((err) => notify.error(err.message))
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

      {/* Botón para registrar ingreso / gasto */}
      {tab !== 'balance' && puedeCrear && (
        <div className="form-actions">
          <button type="button" className="btn-primary" onClick={() => { setForm(formVacio()); setFormAbierto(true) }}>
            {tab === 'ingreso' ? '+ Registrar ingreso' : '+ Registrar gasto'}
          </button>
        </div>
      )}

      {/* Historial de movimientos */}
      <div className="card">
        <h3>
          {tab === 'balance' ? 'Historial de movimientos' : tab === 'ingreso' ? 'Ingresos registrados' : 'Gastos registrados'}{' '}
          ({listaActual.length})
        </h3>
        {listaActual.length === 0 && (
          <Vacio icono="💰" titulo="Aún no hay movimientos">
            Registra un ingreso o gasto para empezar.
          </Vacio>
        )}
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
                      ) : (tab !== 'balance' && puedeCrear) ? (
                        <label className={`btn-secondary btn-sm ${subiendoId === m.id ? 'disabled' : ''}`} style={{ cursor: 'pointer', margin: 0 }}>
                          {subiendoId === m.id ? 'Subiendo…' : '⬆️ Subir'}
                          <input
                            type="file"
                            accept="application/pdf,image/jpeg,image/png"
                            style={{ display: 'none' }}
                            disabled={subiendoId === m.id}
                            onChange={(e) => onSubirComprobante(m.id, e)}
                          />
                        </label>
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
                            onClick={async () => {
                              if (await confirmar('¿Eliminar este movimiento?')) deleteMovimiento(m.id)
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

      {formAbierto && (
        <>
          <div className="overlay" onClick={resetForm} />
          <div className="modal">
            <h3>{tab === 'ingreso' ? 'Registrar ingreso' : 'Registrar gasto'}</h3>
            <form onSubmit={handleSubmit}>
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
                <button type="button" className="btn-secondary" onClick={resetForm}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}

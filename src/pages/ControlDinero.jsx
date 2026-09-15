import { useMemo, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLocalData } from '../hooks/useLocalData.js'
import { formatCOP, formatFecha, hoyISO } from '../utils/format.js'
import { notify, confirmar, confirmarAnulacion } from '../utils/notify.js'
import Vacio from '../components/Vacio.jsx'

const CATEGORIAS_INGRESO = ['Venta', 'Abono cliente', 'Préstamo recibido', 'Otro ingreso']
const CATEGORIAS_GASTO = ['Materiales', 'Servicios', 'Arriendo', 'Transporte', 'Nómina', 'Adelanto', 'Otro gasto']

const hoy = hoyISO
const formVacio = () => ({ fecha: hoy(), categoria: '', monto: '', descripcion: '', comprobante: '', comprobanteTipo: '' })
const POR_PAGINA = 50

function inicioMesISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// Etiqueta legible del origen de un movimiento automático
const ORIGEN_LABEL = { nomina: 'Pago de nómina', prestamo: 'Adelanto' }

export default function ControlDinero() {
  const { addMovimiento, deleteMovimiento, addComprobanteMovimiento } = useData()
  const { puede } = useAuth()
  const puedeCrear = puede('control-dinero', 'crear')
  const puedeEliminar = puede('control-dinero', 'eliminar')

  const [tab, setTab] = useState('balance') // 'ingreso' | 'gasto' | 'balance'
  const [form, setForm] = useState(formVacio())
  const [formAbierto, setFormAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [subiendoId, setSubiendoId] = useState(null) // id del movimiento al que se le sube comprobante
  const [pagina, setPagina] = useState(1)
  const [desde, setDesde] = useState(inicioMesISO)
  const [hasta, setHasta] = useState(hoy)

  const endpointMovimientos = useMemo(() => {
    const params = new URLSearchParams({ pagina: String(pagina), limite: String(POR_PAGINA) })
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    if (tab !== 'balance') params.set('tipo', tab)
    return `/movimientos?${params}`
  }, [pagina, desde, hasta, tab])

  const {
    data: resultado,
    cargando: cargandoMovimientos,
    error: errorMovimientos,
    recargar: recargarMovimientos,
  } = useLocalData(endpointMovimientos)
  const {
    data: balanceRemoto,
    cargando: cargandoBalance,
    error: errorBalance,
    recargar: recargarBalance,
  } = useLocalData('/movimientos/balance')

  const movimientos = Array.isArray(resultado) ? resultado : (resultado.registros || [])
  const totalMovimientos = Array.isArray(resultado) ? movimientos.length : (resultado.total || 0)
  const totalPaginas = Array.isArray(resultado) ? 1 : (resultado.paginas || 1)
  const paginaActual = Array.isArray(resultado) ? 1 : (resultado.pagina || pagina)
  const balance = {
    ingresos: Number(balanceRemoto?.ingresos) || 0,
    gastos: Number(balanceRemoto?.gastos) || 0,
    balance: Number(balanceRemoto?.balance) || 0,
  }

  const recargarTodo = () => Promise.all([recargarMovimientos(), recargarBalance()])

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
      await recargarMovimientos()
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
      if (pagina === 1) await recargarTodo()
      else {
        setPagina(1)
        await recargarBalance()
      }
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

  const categorias = tab === 'ingreso' ? CATEGORIAS_INGRESO : CATEGORIAS_GASTO
  const cambiarTab = (nuevoTab) => { setTab(nuevoTab); setPagina(1) }

  return (
    <div>
      <h2>💰 Control de dinero</h2>

      {/* Pestañas */}
      <div className="tabs">
        <button className={`tab ${tab === 'ingreso' ? 'active' : ''}`} onClick={() => cambiarTab('ingreso')}>
          ⬆️ Ingresos
        </button>
        <button className={`tab ${tab === 'gasto' ? 'active' : ''}`} onClick={() => cambiarTab('gasto')}>
          ⬇️ Gastos
        </button>
        <button className={`tab ${tab === 'balance' ? 'active' : ''}`} onClick={() => cambiarTab('balance')}>
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

      <div className="card">
        <div className="row" style={{ alignItems: 'end' }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="movimientos-desde">Desde</label>
            <input id="movimientos-desde" type="date" value={desde} max={hasta || undefined}
              onChange={(e) => { setDesde(e.target.value); setPagina(1) }} />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="movimientos-hasta">Hasta</label>
            <input id="movimientos-hasta" type="date" value={hasta} min={desde || undefined}
              onChange={(e) => { setHasta(e.target.value); setPagina(1) }} />
          </div>
          <button type="button" className="btn-secondary" onClick={() => { setDesde(''); setHasta(''); setPagina(1) }}>
            Ver todo
          </button>
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
          ({totalMovimientos})
        </h3>
        {(errorMovimientos || errorBalance) && <div className="banner error">{errorMovimientos || errorBalance}</div>}
        {(cargandoMovimientos || cargandoBalance) && <p className="muted">Cargando movimientos...</p>}
        {!cargandoMovimientos && movimientos.length === 0 && !errorMovimientos && (
          <Vacio icono="💰" titulo="Aún no hay movimientos">
            Registra un ingreso o gasto para empezar.
          </Vacio>
        )}
        {movimientos.length > 0 && (
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
                {movimientos.map((m) => (
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
                            aria-label="Eliminar"
                            onClick={async () => {
                              const motivo = await confirmarAnulacion('Se eliminará este movimiento de caja.')
                              if (!motivo) return
                              try {
                                await deleteMovimiento(m.id, motivo)
                                if (movimientos.length === 1 && pagina > 1) {
                                  setPagina((p) => p - 1)
                                  await recargarBalance()
                                } else await recargarTodo()
                              }
                              catch (e) { notify.error(e.message) }
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
        {totalPaginas > 1 && (
          <div className="form-actions" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="btn-secondary" disabled={cargandoMovimientos || paginaActual <= 1}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}>
              Anterior
            </button>
            <span className="muted small">Página {paginaActual} de {totalPaginas}</span>
            <button type="button" className="btn-secondary" disabled={cargandoMovimientos || paginaActual >= totalPaginas}
              onClick={() => setPagina((p) => p + 1)}>
              Siguiente
            </button>
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

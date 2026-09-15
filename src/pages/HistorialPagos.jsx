import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useLocalData, http } from '../hooks/useLocalData.js'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP, formatFecha, hoyISO } from '../utils/format.js'
import { notify } from '../utils/notify.js'
import Vacio from '../components/Vacio.jsx'

const PAGINA_SIZE = 50

export default function HistorialPagos() {
  const { data: clientes, cargando: cargandoClientes, error: errorClientes } = useLocalData('/clientes')
  const { puede } = useAuth()
  const puedeVer = puede('ventas', 'ver')

  const [clienteId, setClienteId] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState(hoyISO())
  const [pagina, setPagina] = useState(1)
  const [pagos, setPagos] = useState([])
  const [paginacion, setPaginacion] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [consulta, setConsulta] = useState(null)
  const [totalAbonado, setTotalAbonado] = useState(0)
  const [errorPagos, setErrorPagos] = useState(null)

  useEffect(() => {
    if (!consulta || !puedeVer) return
    const controller = new AbortController()
    const cargarPagos = async () => {
      setCargando(true)
      setErrorPagos(null)
      try {
        const params = new URLSearchParams({ ...consulta, pagina, porPagina: PAGINA_SIZE })
        const data = await http(`/historial-pagos?${params}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        setPagos(data.pagos || [])
        setPaginacion(data.paginacion)
        setTotalAbonado(data.totalAbonado || 0)
      } catch (error) {
        if (controller.signal.aborted) return
        setErrorPagos(error.message)
        setPagos([])
        setPaginacion(null)
      } finally {
        if (!controller.signal.aborted) setCargando(false)
      }
    }
    cargarPagos()
    return () => controller.abort()
  }, [consulta, pagina, puedeVer])

  const handleBuscar = () => {
    if (!clienteId) {
      notify.error('Selecciona un cliente')
      return
    }
    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
      notify.error('La fecha desde no puede ser posterior a hasta')
      return
    }
    setPagina(1)
    setCargando(true)
    setConsulta({ clienteId, fechaDesde, fechaHasta })
  }

  const handleLimpiar = () => {
    setClienteId('')
    setFechaDesde('')
    setFechaHasta(hoyISO())
    setPagina(1)
    setPagos([])
    setPaginacion(null)
    setConsulta(null)
    setCargando(false)
    setErrorPagos(null)
    setTotalAbonado(0)
  }

  const cambiarFiltro = (setter, valor) => {
    setter(valor)
    setConsulta(null)
    setCargando(false)
    setErrorPagos(null)
    setPagos([])
    setPaginacion(null)
    setPagina(1)
  }

  if (!puedeVer) {
    return <div className="banner">No tienes permiso para ver esta página</div>
  }

  if (cargandoClientes) {
    return (
      <div>
        <h2>💳 Historial de Pagos</h2>
        <div className="banner">Cargando...</div>
      </div>
    )
  }

  return (
    <div>
      <h2>💳 Historial de Pagos</h2>
      {errorClientes && <div className="banner error">{errorClientes}</div>}

      {/* Filtros */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Filtros</h3>
        <div className="row">
          <div className="form-group">
            <label htmlFor="pagos-cliente">Cliente *</label>
            <select id="pagos-cliente" value={clienteId} onChange={(e) => cambiarFiltro(setClienteId, e.target.value)}>
              <option value="">Selecciona un cliente</option>
              {(clientes || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} {c.apellidos}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="pagos-desde">Desde</label>
            <input
              id="pagos-desde"
              type="date"
              max={fechaHasta || undefined}
              value={fechaDesde}
              onChange={(e) => cambiarFiltro(setFechaDesde, e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="pagos-hasta">Hasta</label>
            <input
              id="pagos-hasta"
              type="date"
              min={fechaDesde || undefined}
              value={fechaHasta}
              onChange={(e) => cambiarFiltro(setFechaHasta, e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-primary" onClick={handleBuscar} disabled={!clienteId || cargando}>
            {cargando ? 'Cargando...' : 'Buscar'}
          </button>
          <button onClick={handleLimpiar} className="btn-secondary">
            Limpiar
          </button>
        </div>
      </div>

      {/* Resultados */}
      {!consulta ? (
        <Vacio titulo="Sin consulta" />
      ) : cargando ? (
        <div className="banner">Cargando pagos...</div>
      ) : errorPagos ? (
        <div className="banner error">{errorPagos}</div>
      ) : pagos.length === 0 ? (
        <Vacio titulo="Sin pagos en el período seleccionado" />
      ) : (
        <>
          {/* Resumen */}
          <div className="banner" style={{ marginBottom: '1rem', backgroundColor: '#dbeafe' }}>
            <strong>Total de pagos:</strong> {paginacion?.total || 0} registros |{' '}
            <strong> Total abonado:</strong> {formatCOP(totalAbonado)}
          </div>

          {/* Tabla */}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Factura</th>
                  <th>Monto</th>
                  <th>Total Venta</th>
                  <th>Comentario</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((pago) => (
                  <tr key={pago.id}>
                    <td>{formatFecha(pago.fecha)}</td>
                    <td>
                      <Link to={`/ventas?ventaId=${pago.venta_id}`} style={{ color: '#2563eb' }}>
                        {pago.venta_codigo || `#${pago.venta_id}`}
                      </Link>
                    </td>
                    <td style={{ fontWeight: 'bold', color: '#059669' }}>
                      {formatCOP(pago.monto)}
                    </td>
                    <td>{formatCOP(pago.venta_total)}</td>
                    <td style={{ fontSize: '0.875rem', color: '#64748b' }}>
                      {pago.comentario || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {paginacion && paginacion.totalPaginas > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem', alignItems: 'center' }}>
              <button
                onClick={() => setPagina(Math.max(1, paginacion.pagina - 1))}
                disabled={cargando || paginacion.pagina === 1}
                className="btn-secondary"
              >
                ← Anterior
              </button>

              <span style={{ padding: '0 1rem', fontSize: '0.875rem' }}>
                Página {paginacion.pagina} de {paginacion.totalPaginas}{' '}
                ({paginacion.total} registros)
              </span>

              <button
                onClick={() => setPagina(Math.min(paginacion.totalPaginas, paginacion.pagina + 1))}
                disabled={cargando || paginacion.pagina === paginacion.totalPaginas}
                className="btn-secondary"
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

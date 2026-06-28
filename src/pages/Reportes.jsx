import { useMemo, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { formatCOP, formatFecha } from '../utils/format.js'
import { generarPdfReporte, generarPdfMovimientos } from '../utils/pdf.js'

function inicioDeMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

export default function Reportes() {
  const { getReporte, getMovimientos, empresa } = useData()
  const hoy = new Date().toISOString().slice(0, 10)

  const [desde, setDesde] = useState(inicioDeMes())
  const [hasta, setHasta] = useState(hoy)
  const [reporte, setReporte] = useState(null)
  const [movs, setMovs] = useState(null) // reporte de movimientos del periodo
  const [cargando, setCargando] = useState(false)

  const consultar = async () => {
    if (desde > hasta) return alert('La fecha "desde" no puede ser mayor que "hasta"')
    setCargando(true)
    try {
      const [r, m] = await Promise.all([getReporte(desde, hasta), getMovimientos(desde, hasta)])
      setReporte(r)
      const ingresos = m.filter((x) => x.tipo === 'ingreso').reduce((s, x) => s + x.monto, 0)
      const gastos = m.filter((x) => x.tipo === 'gasto').reduce((s, x) => s + x.monto, 0)
      setMovs({ lista: m, ingresos, gastos, balance: ingresos - gastos })
    } catch (e) {
      alert('Error al generar el reporte: ' + e.message)
    } finally {
      setCargando(false)
    }
  }

  const rangoRapido = (dias) => {
    const h = new Date()
    const d = new Date()
    d.setDate(d.getDate() - dias)
    setDesde(d.toISOString().slice(0, 10))
    setHasta(h.toISOString().slice(0, 10))
  }

  return (
    <div>
      <h2>📊 Reportes por rango de fechas</h2>

      <div className="card">
        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={consultar} disabled={cargando}>
            {cargando ? 'Consultando…' : 'Generar reporte'}
          </button>
        </div>
        <div className="quick-ranges">
          <button className="btn-secondary" onClick={() => rangoRapido(7)}>Últimos 7 días</button>
          <button className="btn-secondary" onClick={() => rangoRapido(15)}>Últimos 15 días</button>
          <button className="btn-secondary" onClick={() => rangoRapido(30)}>Últimos 30 días</button>
          <button className="btn-secondary" onClick={() => { setDesde(inicioDeMes()); setHasta(hoy) }}>Este mes</button>
        </div>
      </div>

      {reporte && (
        <>
          <div className="cards-grid">
            <div className="stat-card">
              <span className="stat-label">Pagos</span>
              <span className="stat-value">{reporte.cantidad}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Bruto</span>
              <span className="stat-value">{formatCOP(reporte.totalBruto)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Descuentos</span>
              <span className="stat-value danger-text">-{formatCOP(reporte.totalDescuentos)}</span>
            </div>
            <div className="stat-card highlight">
              <span className="stat-label">Total pagado</span>
              <span className="stat-value">{formatCOP(reporte.totalPagado)}</span>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Resumen por empleado</h3>
              {reporte.cantidad > 0 && (
                <button className="btn-secondary" onClick={() => generarPdfReporte({ ...reporte, empresa })}>
                  📄 Descargar PDF
                </button>
              )}
            </div>
            <p className="muted small">
              Periodo: {formatFecha(reporte.desde)} — {formatFecha(reporte.hasta)}
            </p>

            {reporte.cantidad === 0 && <p className="muted">No hay pagos en este periodo.</p>}
            {reporte.cantidad > 0 && (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Empleado</th>
                      <th className="num">Pagos</th>
                      <th className="num">Bruto</th>
                      <th className="num">Descuentos</th>
                      <th className="num">Total pagado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.porEmpleado.map((e) => (
                      <tr key={e.empleadoId}>
                        <td>{e.nombre}</td>
                        <td className="num">{e.pagos}</td>
                        <td className="num">{formatCOP(e.bruto)}</td>
                        <td className="num danger-text">-{formatCOP(e.descuentos)}</td>
                        <td className="num"><strong>{formatCOP(e.total)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td><strong>TOTALES</strong></td>
                      <td className="num"><strong>{reporte.cantidad}</strong></td>
                      <td className="num"><strong>{formatCOP(reporte.totalBruto)}</strong></td>
                      <td className="num danger-text"><strong>-{formatCOP(reporte.totalDescuentos)}</strong></td>
                      <td className="num"><strong>{formatCOP(reporte.totalPagado)}</strong></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* ===== Movimientos (control de dinero) ===== */}
          {movs && (
            <div className="card">
              <div className="card-head">
                <h3>Movimientos del periodo</h3>
                {movs.lista.length > 0 && (
                  <button
                    className="btn-secondary"
                    onClick={() =>
                      generarPdfMovimientos({
                        empresa,
                        desde,
                        hasta,
                        movimientos: movs.lista,
                        ingresos: movs.ingresos,
                        gastos: movs.gastos,
                        balance: movs.balance,
                      })
                    }
                  >
                    📄 Descargar PDF
                  </button>
                )}
              </div>

              <div className="cards-grid">
                <div className="stat-card">
                  <span className="stat-label">Ingresos</span>
                  <span className="stat-value">{formatCOP(movs.ingresos)}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Gastos</span>
                  <span className="stat-value danger-text">-{formatCOP(movs.gastos)}</span>
                </div>
                <div className="stat-card highlight">
                  <span className="stat-label">Balance</span>
                  <span className="stat-value">{formatCOP(movs.balance)}</span>
                </div>
              </div>

              {movs.lista.length === 0 && <p className="muted">No hay movimientos en este periodo.</p>}
              {movs.lista.length > 0 && (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Tipo</th>
                        <th>Categoría</th>
                        <th>Descripción</th>
                        <th className="num">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movs.lista.map((m) => (
                        <tr key={m.id}>
                          <td>{formatFecha(m.fecha)}</td>
                          <td>
                            <span className={`chip ${m.tipo === 'ingreso' ? 'ok' : 'warn'}`}>
                              {m.tipo === 'ingreso' ? '⬆️ Ingreso' : '⬇️ Gasto'}
                            </span>
                          </td>
                          <td>{m.categoria || '—'}</td>
                          <td>{m.descripcion || '—'}</td>
                          <td className={`num ${m.tipo === 'gasto' ? 'danger-text' : ''}`}>
                            {m.tipo === 'gasto' ? '-' : '+'}{formatCOP(m.monto)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

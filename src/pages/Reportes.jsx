import { useMemo, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP, formatFecha } from '../utils/format.js'
import { generarPdfReporte, generarPdfMovimientos, generarPdfFabricacion } from '../utils/pdf.js'
import { notify } from '../utils/notify.js'

function inicioDeMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

export default function Reportes() {
  const { getReporte, getMovimientos, empresa, tareas, productos } = useData()
  const { puede } = useAuth()
  const puedeExportar = puede('reportes', 'exportar')
  const hoy = new Date().toISOString().slice(0, 10)

  const [desde, setDesde] = useState(inicioDeMes())
  const [hasta, setHasta] = useState(hoy)
  const [reporte, setReporte] = useState(null)
  const [movs, setMovs] = useState(null) // reporte de movimientos del periodo
  const [cargando, setCargando] = useState(false)

  // --- Reporte de fabricación (basado en Gestión de Nómina) ---
  const [buscarProducto, setBuscarProducto] = useState('')
  const [detalleAbierto, setDetalleAbierto] = useState(null) // key de producto expandido

  // Agrupa las tareas por producto y reconstruye la línea de fabricación:
  // cada proceso es una etapa (corte → ensamble). Las unidades que llegaron a
  // la última etapa se consideran productos completos.
  const fabricacion = useMemo(() => {
    // Tareas dentro del rango, por fecha de creación
    const enRango = tareas.filter((t) => {
      const f = (t.creado || '').slice(0, 10)
      return f && f >= desde && f <= hasta
    })

    // Agrupar por producto (por id si existe, si no por nombre)
    const grupos = {}
    for (const t of enRango) {
      const key = t.productoId != null ? `id:${t.productoId}` : `nm:${t.productoNombre}`
      if (!grupos[key]) grupos[key] = { key, productoId: t.productoId, nombre: t.productoNombre || '(sin producto)', tareas: [] }
      grupos[key].tareas.push(t)
    }

    const matchEtapa = (t, e) =>
      (e.id != null && String(t.procesoId) === String(e.id)) ||
      (t.procesoNombre || '').toLowerCase().trim() === (e.nombre || '').toLowerCase().trim()

    return Object.values(grupos)
      .map((g) => {
        // Etapas en orden: las del producto (corte primero, ensamble último).
        // Si el producto ya no existe, se deduce por primera aparición.
        const prod = productos.find((p) => String(p.id) === String(g.productoId))
        let etapas
        if (prod && prod.procesos?.length) {
          etapas = prod.procesos.map((p) => ({ id: p.id, nombre: p.nombre }))
        } else {
          const vistos = []
          for (const t of [...g.tareas].sort((a, b) => (a.creado || '').localeCompare(b.creado || ''))) {
            if (t.procesoNombre && !vistos.includes(t.procesoNombre)) vistos.push(t.procesoNombre)
          }
          etapas = vistos.map((n) => ({ id: null, nombre: n }))
        }

        const terminada = (t) => t.estado === 'terminada' || t.estado === 'pagada'
        const etapasCant = etapas.map((e) => {
          const tareasEtapa = g.tareas.filter((t) => matchEtapa(t, e))
          const unidades = tareasEtapa.reduce((s, t) => s + Number(t.cantidad || 0), 0)
          const unidadesTerminadas = tareasEtapa
            .filter(terminada)
            .reduce((s, t) => s + Number(t.cantidad || 0), 0)
          // La etapa se marca en verde cuando tiene producción y todas sus tareas
          // fueron marcadas como terminadas (o ya pagadas) en Gestión de Nómina.
          const verde = tareasEtapa.length > 0 && tareasEtapa.every(terminada)
          return { ...e, unidades, unidadesTerminadas, verde }
        })

        const iniciados = etapasCant[0]?.unidades || 0
        const completos = etapasCant.length ? etapasCant[etapasCant.length - 1].unidades : 0
        const etapasConProduccion = etapasCant.filter((e) => e.unidades > 0).length

        // Detalle por fecha: una fila por día, una columna por etapa
        const fechas = {}
        for (const t of g.tareas) {
          const f = (t.creado || '').slice(0, 10)
          if (!fechas[f]) fechas[f] = etapasCant.map(() => 0)
          const idx = etapasCant.findIndex((e) => matchEtapa(t, e))
          if (idx >= 0) fechas[f][idx] += Number(t.cantidad || 0)
        }
        const porFecha = Object.entries(fechas)
          .map(([fecha, celdas]) => ({ fecha, celdas }))
          .sort((a, b) => b.fecha.localeCompare(a.fecha))

        return {
          key: g.key,
          nombre: g.nombre,
          etapas: etapasCant,
          iniciados,
          completos,
          enProceso: Math.max(0, iniciados - completos),
          totalEtapas: etapasCant.length,
          etapasConProduccion,
          porFecha,
        }
      })
      .filter((g) => g.nombre.toLowerCase().includes(buscarProducto.trim().toLowerCase()))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [tareas, productos, desde, hasta, buscarProducto])

  const consultar = async () => {
    if (desde > hasta) { notify.error('La fecha "desde" no puede ser mayor que "hasta"'); return }
    setCargando(true)
    try {
      const [r, m] = await Promise.all([getReporte(desde, hasta), getMovimientos(desde, hasta)])
      setReporte(r)
      const ingresos = m.filter((x) => x.tipo === 'ingreso').reduce((s, x) => s + x.monto, 0)
      const gastos = m.filter((x) => x.tipo === 'gasto').reduce((s, x) => s + x.monto, 0)
      setMovs({ lista: m, ingresos, gastos, balance: ingresos - gastos })
    } catch (e) {
      notify.error('Error al generar el reporte: ' + e.message)
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

      {/* ===== Fabricación de productos (según Gestión de Nómina) ===== */}
      <div className="card">
        <div className="card-head">
          <h3>🏭 Fabricación de productos</h3>
          {fabricacion.length > 0 && puedeExportar && (
            <button
              className="btn-secondary"
              onClick={() => generarPdfFabricacion({ empresa, desde, hasta, productos: fabricacion })}
            >
              📄 Descargar PDF
            </button>
          )}
        </div>
        <p className="muted small">
          Cada proceso es una etapa de fabricación (el primero es el corte y el último el ensamble).
          Un producto está completo cuando llega a la última etapa. Periodo: {formatFecha(desde)} — {formatFecha(hasta)}.
        </p>

        <div className="row" style={{ marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="small">Buscar producto</label>
            <input
              type="text"
              placeholder="Ej: Armario Valluno"
              value={buscarProducto}
              onChange={(e) => setBuscarProducto(e.target.value)}
            />
          </div>
        </div>

        {fabricacion.length === 0 && (
          <p className="muted">No hay tareas de fabricación en este periodo.</p>
        )}

        {fabricacion.map((g) => {
          const completo = g.totalEtapas > 0 && g.etapasConProduccion === g.totalEtapas
          const abierto = detalleAbierto === g.key
          return (
            <div className="tarea-item" key={g.key}>
              <div className="tarea-head">
                <div>
                  <strong>{g.nombre}</strong>
                  <span className="muted"> · {g.etapasConProduccion}/{g.totalEtapas} etapas</span>
                </div>
                <span className={`chip ${completo ? 'ok' : 'warn'}`}>
                  {completo ? '✓ Completo' : 'En proceso'}
                </span>
              </div>

              <div className="muted small" style={{ marginBottom: 8 }}>
                Iniciados (1ª etapa): <strong>{g.iniciados}</strong> ·
                {' '}Completos (última etapa): <strong>{g.completos}</strong> ·
                {' '}En proceso: <strong>{g.enProceso}</strong>
              </div>

              {/* Unidades por etapa */}
              <div className="etapas-flow">
                {g.etapas.map((e, i) => (
                  <div key={i} className={`etapa-chip${e.verde ? ' terminada' : ''}`}>
                    <span className="small etapa-nombre">
                      {e.verde && '✓ '}{i + 1}. {e.nombre}
                    </span>
                    <strong>{e.unidades}</strong>
                    {e.unidadesTerminadas > 0 && e.unidadesTerminadas < e.unidades && (
                      <span className="small muted">{e.unidadesTerminadas} terminadas</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="actions" style={{ marginTop: 10 }}>
                <button className="btn-icon" onClick={() => setDetalleAbierto(abierto ? null : g.key)}>
                  📅 {abierto ? 'Ocultar' : 'Ver'} detalle por fecha
                </button>
              </div>

              {abierto && (
                <div className="historial-box">
                  {g.porFecha.length === 0 && <p className="muted small">Sin registros por fecha.</p>}
                  {g.porFecha.length > 0 && (
                    <div className="table-wrap">
                      <table className="table compact">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            {g.etapas.map((e, i) => (
                              <th key={i} className="num">{e.nombre}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {g.porFecha.map((f) => (
                            <tr key={f.fecha}>
                              <td>{formatFecha(f.fecha)}</td>
                              {f.celdas.map((c, i) => (
                                <td key={i} className="num">{c || '—'}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
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
              {reporte.cantidad > 0 && puedeExportar && (
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
                {movs.lista.length > 0 && puedeExportar && (
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

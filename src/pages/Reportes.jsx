import { Fragment, useMemo, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP, formatFecha, hoyISO } from '../utils/format.js'
import { generarPdfReporte, generarPdfMovimientos, generarPdfFabricacion, generarPdfReporteMateriales, descargarCSV } from '../utils/pdf.js'
import { notify, preguntarTexto } from '../utils/notify.js'

function inicioDeMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

export default function Reportes() {
  const { getReporte, getReporteVentas, getReporteMateriales, getMovimientos, empresa, ordenesProduccion, productos } = useData()
  const { puede } = useAuth()
  const puedeExportar = puede('reportes', 'exportar')
  const hoy = hoyISO()

  const [desde, setDesde] = useState(inicioDeMes())
  const [hasta, setHasta] = useState(hoy)
  const [reporte, setReporte] = useState(null)
  const [movs, setMovs] = useState(null) // reporte de movimientos del periodo
  const [repVentas, setRepVentas] = useState(null)
  const [repMateriales, setRepMateriales] = useState(null)
  const [materialAbierto, setMaterialAbierto] = useState(null) // materialId con detalle expandido
  const [cargando, setCargando] = useState(false)

  // --- Reporte de fabricación (basado en Producción / órdenes) ---
  const [buscarProducto, setBuscarProducto] = useState('')
  const [ordenAbierta, setOrdenAbierta] = useState(null) // id de orden expandida

  const ESTADO_ORDEN = { pendiente: 'Pendiente', en_progreso: 'En progreso', terminada: 'Terminada' }

  // Analiza una orden de producción: sus procesos, unidades iniciadas (primer
  // proceso) vs terminadas (último), merma total y materiales consumidos.
  const analizarOrden = (orden) => {
    const tareas = [...(orden.tareas || [])].sort((a, b) => (a.creado || '').localeCompare(b.creado || ''))
    const iniciados = tareas.length ? Number(tareas[0].cantidad) || 0 : 0
    const finales = tareas.length ? Number(tareas[tareas.length - 1].cantidad) || 0 : 0
    const merma = Math.max(0, iniciados - finales)
    // Consolida materiales consumidos por todos los procesos de la orden
    const matMap = {}
    for (const t of tareas) {
      for (const m of t.materialesConsumidos || []) {
        if (!matMap[m.materialId]) matMap[m.materialId] = { nombre: m.materialNombre, unidad: m.unidad, cantidad: 0, costoTotal: 0 }
        matMap[m.materialId].cantidad += m.cantidad
        matMap[m.materialId].costoTotal += m.cantidad * (m.costoUnitario || 0)
      }
    }
    const materiales = Object.values(matMap).sort((a, b) => a.nombre.localeCompare(b.nombre))
    const costoMateriales = materiales.reduce((s, m) => s + m.costoTotal, 0)
    return { tareas, iniciados, finales, merma, materiales, costoMateriales }
  }

  // Órdenes de producción dentro del rango (por fecha de creación), analizadas.
  const fabricacion = useMemo(() => {
    return (ordenesProduccion || [])
      .filter((o) => {
        const f = (o.creado || '').slice(0, 10)
        return f && f >= desde && f <= hasta
      })
      .filter((o) => (o.productoNombre || '').toLowerCase().includes(buscarProducto.trim().toLowerCase()))
      .map((o) => ({ ...o, analisis: analizarOrden(o) }))
      .sort((a, b) => (b.creado || '').localeCompare(a.creado || ''))
  }, [ordenesProduccion, desde, hasta, buscarProducto])

  // Totales del periodo para las tarjetas y el resumen
  const fabTotales = useMemo(() => {
    const t = { ordenes: fabricacion.length, terminadas: 0, iniciados: 0, completados: 0, merma: 0, costoMateriales: 0 }
    for (const o of fabricacion) {
      if (o.estado === 'terminada') t.terminadas += 1
      t.iniciados += o.analisis.iniciados
      t.completados += o.estado === 'terminada' ? o.analisis.finales : 0
      t.merma += o.analisis.merma
      t.costoMateriales += o.analisis.costoMateriales
    }
    return t
  }, [fabricacion])

  const consultar = async () => {
    if (desde > hasta) { notify.error('La fecha "desde" no puede ser mayor que "hasta"'); return }
    setCargando(true)
    try {
      const [r, m, rv, rm] = await Promise.all([getReporte(desde, hasta), getMovimientos(desde, hasta), getReporteVentas(desde, hasta), getReporteMateriales(desde, hasta)])
      setReporte(r)
      const ingresos = m.filter((x) => x.tipo === 'ingreso').reduce((s, x) => s + x.monto, 0)
      const gastos = m.filter((x) => x.tipo === 'gasto').reduce((s, x) => s + x.monto, 0)
      setMovs({ lista: m, ingresos, gastos, balance: ingresos - gastos })
      setRepVentas(rv)
      setRepMateriales(rm)
    } catch (e) {
      notify.error('Error al generar el reporte: ' + e.message)
    } finally {
      setCargando(false)
    }
  }

  // --- Exportaciones del reporte de materiales ---
  const exportarMaterialesExcel = () => {
    if (!repMateriales) return
    const filas = [['Material', 'Unidad', 'Entradas', 'Salidas', 'Neto', 'Stock actual', 'Stock mínimo']]
    for (const m of repMateriales.materiales) {
      filas.push([m.nombre, m.unidad, m.entradas, m.salidas, m.neto, m.stockActual, m.stockMinimo])
    }
    filas.push(['TOTALES', '', repMateriales.totalEntradas, repMateriales.totalSalidas, repMateriales.totalEntradas - repMateriales.totalSalidas, '', ''])
    descargarCSV(`reporte_materiales_${desde}_a_${hasta}.csv`, filas)
  }

  const enviarMaterialesWhatsApp = async () => {
    if (!repMateriales) return
    const telefono = await preguntarTexto(
      'Ingresa el número de WhatsApp de destino (con código de país, sin espacios ni +).',
      { titulo: 'Enviar por WhatsApp', placeholder: 'Ej: 573001234567', textoOk: 'Enviar' }
    )
    if (!telefono) return

    const lineas = repMateriales.materiales
      .filter((m) => m.entradas > 0 || m.salidas > 0 || m.stockActual <= m.stockMinimo)
      .map((m) => `• ${m.nombre}: entradas ${m.entradas}, salidas ${m.salidas}, stock ${m.stockActual} ${m.unidad}${m.stockActual <= m.stockMinimo ? ' ⚠️ bajo' : ''}`)
      .join('\n')

    const mensaje =
      `*REPORTE DE MATERIALES*\n` +
      `Periodo: ${formatFecha(desde)} — ${formatFecha(hasta)}\n\n` +
      `Entradas totales: ${repMateriales.totalEntradas}\n` +
      `Salidas totales: ${repMateriales.totalSalidas}\n` +
      `Materiales con stock bajo: ${repMateriales.stockBajoCount}\n\n` +
      (lineas || 'Sin movimientos en el periodo.')

    window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`, '_blank')
  }

  // --- Exportaciones del reporte de ventas por producto ---
  const exportarVentasExcel = () => {
    if (!repVentas || repVentas.porProducto.length === 0) return
    const filas = [['Producto', 'Unidades vendidas', 'N° de ventas', 'Ingresos']]
    for (const p of repVentas.porProducto) {
      filas.push([p.nombre, p.unidades, p.ventas, p.ingresos])
    }
    filas.push(['TOTALES', repVentas.totalUnidades, repVentas.cantidadVentas, repVentas.totalIngresos])
    descargarCSV(`reporte_ventas_${desde}_a_${hasta}.csv`, filas)
  }

  // --- Exportaciones del reporte de fabricación (producción) ---
  const exportarFabricacionExcel = () => {
    if (fabricacion.length === 0) { notify.error('No hay órdenes en el periodo'); return }
    const filas = [['Orden', 'Fecha', 'Producto', 'Estado', 'Iniciados', 'Terminados', 'Merma', 'Costo materiales']]
    for (const o of fabricacion) {
      filas.push([
        `#${o.id}`, (o.creado || '').slice(0, 10), o.productoNombre || '', ESTADO_ORDEN[o.estado] || o.estado,
        o.analisis.iniciados, o.estado === 'terminada' ? o.analisis.finales : 0, o.analisis.merma, o.analisis.costoMateriales,
      ])
    }
    filas.push(['TOTALES', '', '', '', fabTotales.iniciados, fabTotales.completados, fabTotales.merma, fabTotales.costoMateriales])
    descargarCSV(`reporte_fabricacion_${desde}_a_${hasta}.csv`, filas)
  }

  const enviarFabricacionWhatsApp = async () => {
    if (fabricacion.length === 0) { notify.error('No hay órdenes en el periodo'); return }
    const telefono = await preguntarTexto(
      'Ingresa el número de WhatsApp de destino (con código de país, sin espacios ni +).',
      { titulo: 'Enviar por WhatsApp', placeholder: 'Ej: 573001234567', textoOk: 'Enviar' }
    )
    if (!telefono) return

    const lineas = fabricacion
      .map((o) => `• #${o.id} ${o.productoNombre}: ${ESTADO_ORDEN[o.estado] || o.estado}, inició ${o.analisis.iniciados}, terminó ${o.estado === 'terminada' ? o.analisis.finales : 0}${o.analisis.merma > 0 ? `, merma ${o.analisis.merma}` : ''}`)
      .join('\n')

    const mensaje =
      `*REPORTE DE FABRICACIÓN*\n` +
      `Periodo: ${formatFecha(desde)} — ${formatFecha(hasta)}\n\n` +
      `Órdenes: ${fabTotales.ordenes} (${fabTotales.terminadas} terminadas)\n` +
      `Unidades iniciadas: ${fabTotales.iniciados}\n` +
      `Unidades completadas: ${fabTotales.completados}\n` +
      `Merma total: ${fabTotales.merma}\n` +
      `Costo en materiales: ${formatCOP(fabTotales.costoMateriales)}\n\n` +
      (lineas || 'Sin órdenes en el periodo.')

    window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`, '_blank')
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

      {/* ===== Fabricación (órdenes de producción) ===== */}
      <div className="card">
        <div className="card-head">
          <h3>🏭 Fabricación (órdenes de producción)</h3>
          {fabricacion.length > 0 && puedeExportar && (
            <div className="actions">
              <button
                className="btn-secondary"
                onClick={() => generarPdfFabricacion({ empresa, desde, hasta, ordenes: fabricacion, totales: fabTotales })}
              >
                📄 PDF
              </button>
              <button className="btn-secondary" onClick={exportarFabricacionExcel}>📊 Excel</button>
              <button className="btn-secondary" onClick={enviarFabricacionWhatsApp}>📱 WhatsApp</button>
            </div>
          )}
        </div>
        <p className="muted small">
          Órdenes creadas en el periodo {formatFecha(desde)} — {formatFecha(hasta)}. "Iniciadas" es la cantidad
          del primer proceso; "completadas" la del último (solo en órdenes terminadas); la diferencia es merma.
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
          <p className="muted">No hay órdenes de producción en este periodo.</p>
        )}

        {fabricacion.length > 0 && (
          <>
            <div className="cards-grid">
              <div className="stat-card">
                <span className="stat-label">Órdenes</span>
                <span className="stat-value">{fabTotales.ordenes}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Terminadas</span>
                <span className="stat-value">{fabTotales.terminadas}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Merma total</span>
                <span className="stat-value danger-text">{fabTotales.merma}</span>
              </div>
              <div className="stat-card highlight">
                <span className="stat-label">Costo materiales</span>
                <span className="stat-value">{formatCOP(fabTotales.costoMateriales)}</span>
              </div>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Orden</th>
                    <th>Producto</th>
                    <th>Estado</th>
                    <th className="num">Iniciados</th>
                    <th className="num">Terminados</th>
                    <th className="num">Merma</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {fabricacion.map((o) => {
                    const abierto = ordenAbierta === o.id
                    return (
                      <Fragment key={o.id}>
                        <tr className="chip-clicable" onClick={() => setOrdenAbierta(abierto ? null : o.id)}>
                          <td>{abierto ? '▾' : '▸'} #{o.id}<div className="muted small">{formatFecha(o.creado)}</div></td>
                          <td><strong>{o.productoNombre}</strong></td>
                          <td>
                            <span className={`chip ${o.estado === 'terminada' ? 'ok' : o.estado === 'en_progreso' ? 'warn' : ''}`}>
                              {ESTADO_ORDEN[o.estado] || o.estado}
                            </span>
                          </td>
                          <td className="num">{o.analisis.iniciados}</td>
                          <td className="num">{o.estado === 'terminada' ? o.analisis.finales : '—'}</td>
                          <td className="num">{o.analisis.merma > 0 ? <span className="texto-salida">-{o.analisis.merma}</span> : '—'}</td>
                          <td className="num muted small">{o.tareas.length} proceso(s)</td>
                        </tr>
                        {abierto && (
                          <tr>
                            <td colSpan={7}>
                              <strong className="small">Procesos</strong>
                              <div className="table-wrap">
                                <table className="table compact">
                                  <thead>
                                    <tr><th>Proceso</th><th className="num">Cantidad</th><th>Estado</th></tr>
                                  </thead>
                                  <tbody>
                                    {o.tareas.map((t) => (
                                      <tr key={t.id}>
                                        <td>{t.procesoNombre}</td>
                                        <td className="num">{t.cantidad}</td>
                                        <td>
                                          <span className={`chip ${t.estado === 'terminada' ? 'ok' : t.estado === 'en_progreso' ? 'warn' : ''}`}>
                                            {ESTADO_ORDEN[t.estado] || t.estado}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {o.analisis.materiales.length > 0 && (
                                <>
                                  <strong className="small">Materiales usados</strong>
                                  <div className="table-wrap">
                                    <table className="table compact">
                                      <thead>
                                        <tr><th>Material</th><th className="num">Cantidad</th><th>Unidad</th><th className="num">Costo total</th></tr>
                                      </thead>
                                      <tbody>
                                        {o.analisis.materiales.map((m, i) => (
                                          <tr key={i}>
                                            <td>{m.nombre}</td>
                                            <td className="num texto-salida">-{m.cantidad}</td>
                                            <td>{m.unidad}</td>
                                            <td className="num">{formatCOP(m.costoTotal)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ===== Ventas por producto ===== */}
      {repVentas && (
        <div className="card">
          <div className="card-head">
            <h3>🛒 Ventas por producto</h3>
            {repVentas.porProducto.length > 0 && puedeExportar && (
              <button className="btn-secondary" onClick={exportarVentasExcel}>📊 Excel</button>
            )}
          </div>
          <p className="muted small">
            Periodo: {formatFecha(desde)} — {formatFecha(hasta)} · {repVentas.cantidadVentas} ventas registradas.
          </p>

          {repVentas.porProducto.length === 0 && <p className="muted">No hay ventas en este periodo.</p>}
          {repVentas.porProducto.length > 0 && (
            <>
              <div className="cards-grid">
                <div className="stat-card">
                  <span className="stat-label">Productos vendidos</span>
                  <span className="stat-value">{repVentas.porProducto.length}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Unidades totales</span>
                  <span className="stat-value">{repVentas.totalUnidades}</span>
                </div>
                <div className="stat-card highlight">
                  <span className="stat-label">Ingresos totales</span>
                  <span className="stat-value">{formatCOP(repVentas.totalIngresos)}</span>
                </div>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Producto</th>
                      <th className="num">Unidades</th>
                      <th className="num">N° ventas</th>
                      <th className="num">Ingresos</th>
                      <th className="num">% del total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repVentas.porProducto.map((p, i) => (
                      <tr key={p.productoId || p.nombre}>
                        <td className="muted small">{i + 1}</td>
                        <td><strong>{p.nombre}</strong></td>
                        <td className="num">{p.unidades}</td>
                        <td className="num">{p.ventas}</td>
                        <td className="num"><strong>{formatCOP(p.ingresos)}</strong></td>
                        <td className="num muted small">
                          {repVentas.totalIngresos > 0 ? ((p.ingresos / repVentas.totalIngresos) * 100).toFixed(1) + '%' : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}><strong>TOTALES</strong></td>
                      <td className="num"><strong>{repVentas.totalUnidades}</strong></td>
                      <td className="num"><strong>{repVentas.cantidadVentas}</strong></td>
                      <td className="num"><strong>{formatCOP(repVentas.totalIngresos)}</strong></td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ===== Materiales: entradas, salidas y stock disponible ===== */}
      {repMateriales && (
        <div className="card">
          <div className="card-head">
            <h3>🧱 Materiales — entradas, salidas y stock</h3>
            {repMateriales.materiales.length > 0 && puedeExportar && (
              <div className="actions">
                <button
                  className="btn-secondary"
                  onClick={() => generarPdfReporteMateriales({ empresa, desde, hasta, ...repMateriales })}
                >
                  📄 PDF
                </button>
                <button className="btn-secondary" onClick={exportarMaterialesExcel}>
                  📊 Excel
                </button>
                <button className="btn-secondary" onClick={enviarMaterialesWhatsApp}>
                  📱 WhatsApp
                </button>
              </div>
            )}
          </div>
          <p className="muted small">
            Periodo: {formatFecha(desde)} — {formatFecha(hasta)}. El stock es el disponible actual (no del periodo).
          </p>

          <div className="cards-grid">
            <div className="stat-card">
              <span className="stat-label">Entradas</span>
              <span className="stat-value">{repMateriales.totalEntradas}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Salidas</span>
              <span className="stat-value danger-text">{repMateriales.totalSalidas}</span>
            </div>
            <div className="stat-card highlight">
              <span className="stat-label">Stock bajo</span>
              <span className="stat-value">{repMateriales.stockBajoCount}</span>
            </div>
          </div>

          {repMateriales.materiales.length === 0 && <p className="muted">No hay materiales registrados.</p>}
          {repMateriales.materiales.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Unidad</th>
                    <th className="num">Entradas</th>
                    <th className="num">Salidas</th>
                    <th className="num">Neto</th>
                    <th className="num">Stock actual</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {repMateriales.materiales.map((m) => {
                    const abierto = materialAbierto === m.materialId
                    const stockBajo = m.stockActual <= m.stockMinimo
                    return (
                      <Fragment key={m.materialId}>
                        <tr className={stockBajo ? 'fila-alerta' : ''}>
                          <td><strong>{m.nombre}</strong></td>
                          <td>{m.unidad}</td>
                          <td className="num texto-entrada">+{m.entradas}</td>
                          <td className="num texto-salida">-{m.salidas}</td>
                          <td className="num">{m.neto}</td>
                          <td className="num">
                            {m.stockActual}
                            {stockBajo && <span className="chip warn" style={{ marginLeft: 8 }}>⚠️ Bajo</span>}
                          </td>
                          <td className="num">
                            <button
                              className="btn-secondary btn-sm"
                              onClick={() => setMaterialAbierto(abierto ? null : m.materialId)}
                              disabled={m.movimientos.length === 0}
                            >
                              🔎 {abierto ? 'Ocultar' : 'Detalle'}
                            </button>
                          </td>
                        </tr>
                        {abierto && (
                          <tr>
                            <td colSpan={7}>
                              <div className="table-wrap">
                                <table className="table compact">
                                  <thead>
                                    <tr>
                                      <th>Fecha</th>
                                      <th>Tipo</th>
                                      <th className="num">Cantidad</th>
                                      <th className="num">Costo unitario</th>
                                      <th>Descripción</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {m.movimientos.map((mv) => {
                                      const claseTipo = mv.tipo === 'salida' ? 'texto-salida' : mv.tipo === 'entrada' ? 'texto-entrada' : ''
                                      const icono = mv.tipo === 'salida' ? '🔻' : mv.tipo === 'entrada' ? '🔺' : ''
                                      return (
                                        <tr key={mv.id}>
                                          <td>{formatFecha(mv.fecha)}</td>
                                          <td className={claseTipo}>{icono} {mv.tipo}</td>
                                          <td className={`num ${claseTipo}`}>{mv.tipo === 'salida' ? '-' : '+'}{mv.cantidad}</td>
                                          <td className="num">{formatCOP(mv.costoUnitario)}</td>
                                          <td>{mv.descripcion}</td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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

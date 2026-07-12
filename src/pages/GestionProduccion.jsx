import { Fragment, useMemo, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP, formatFecha } from '../utils/format.js'
import { notify, confirmar } from '../utils/notify.js'
import Vacio from '../components/Vacio.jsx'

// Etiquetas de estado, compartidas entre órdenes y tareas (mismos valores)
const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  terminada: 'Terminada',
}

// Clase de color para la barra según el progreso
function claseProgreso(p) {
  if (p < 30) return 'bajo'
  if (p <= 70) return 'medio'
  return 'alto'
}

// Barra de progreso visual reutilizable
function BarraProgreso({ valor }) {
  return (
    <div className="progress">
      <div className={`progress-fill ${claseProgreso(valor)}`} style={{ width: `${valor}%` }}>
        <span className="progress-label">{valor}%</span>
      </div>
    </div>
  )
}

// Describe en qué proceso va la orden: el primer proceso sin terminar (en el
// orden en que se agregaron), o si ya no queda ninguno pendiente.
function procesoActualDe(orden) {
  if (orden.tareas.length === 0) return { texto: 'Sin procesos asignados', clase: '' }
  const actual = orden.tareas.find((t) => t.estado !== 'terminada')
  if (!actual) return { texto: '✓ Todos los procesos terminados', clase: 'ok' }
  return { texto: actual.procesoNombre, clase: actual.estado === 'en_progreso' ? 'warn' : '' }
}

export default function GestionProduccion() {
  const {
    empleados, productos, tareasProduccion, ordenesProduccion,
    addTareaProduccion, updateTareaProduccion, terminarTareaProduccion, deleteTareaProduccion,
    getTareaProduccionHistorial,
    addOrdenProduccion, terminarOrdenProduccion, deleteOrdenProduccion,
    getEmpleado,
  } = useData()
  const { puede } = useAuth()

  const puedeCrear = puede('gestion-produccion', 'crear')
  const puedeEditar = puede('gestion-produccion', 'editar')
  const puedeEliminar = puede('gestion-produccion', 'eliminar')

  // --- Formulario: nueva orden de producción ---
  const [formOrdenAbierto, setFormOrdenAbierto] = useState(false)
  const [ordenProductoId, setOrdenProductoId] = useState('')
  const [ordenCantidad, setOrdenCantidad] = useState('')
  const [ordenComentario, setOrdenComentario] = useState('')
  const [guardandoOrden, setGuardandoOrden] = useState(false)

  // --- Formulario: agregar proceso (tarea) a una orden ---
  const [tareaFormOrdenId, setTareaFormOrdenId] = useState(null)
  const [taEmpleadoId, setTaEmpleadoId] = useState('')
  const [taProcesoId, setTaProcesoId] = useState('')
  const [taCantidad, setTaCantidad] = useState('')
  const [taComentario, setTaComentario] = useState('')
  const [guardandoTarea, setGuardandoTarea] = useState(false)

  // --- Filtros de órdenes ---
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroProductoId, setFiltroProductoId] = useState('')

  // --- Modal de seguimiento de una orden (tabla de sus procesos) ---
  const [ordenDetalleId, setOrdenDetalleId] = useState(null)
  const [procesoExpandidoId, setProcesoExpandidoId] = useState(null)

  // --- Modal de detalle de un proceso sin orden ---
  const [tareaDetalleId, setTareaDetalleId] = useState(null)

  // --- Edición en línea de tareas (borradores de progreso/comentario) ---
  const [borradores, setBorradores] = useState({}) // { tareaId: { progreso, comentario } }
  const [historialAbierto, setHistorialAbierto] = useState(null) // tareaId
  const [historial, setHistorial] = useState([])

  const nombreEmpleado = (id) => getEmpleado(id)?.nombre || '— (eliminado)'
  const ordenSel = ordenesProduccion.find((o) => o.id === tareaFormOrdenId)
  const productoDeOrdenSel = productos.find((p) => String(p.id) === String(ordenSel?.productoId))
  const ordenDetalle = ordenesProduccion.find((o) => o.id === ordenDetalleId)

  // Procesos que la orden seleccionada ya tiene (por nombre, en minúsculas), para
  // no ofrecerlos de nuevo en el select: un proceso no se repite dentro de una orden.
  const procesosUsados = new Set(
    (ordenSel?.tareas || []).map((t) => (t.procesoNombre || '').toLowerCase())
  )
  const procesosDisponibles = (productoDeOrdenSel?.procesos || []).filter(
    (p) => !procesosUsados.has((p.nombre || '').toLowerCase())
  )

  const ordenesFiltradas = useMemo(() => {
    return ordenesProduccion.filter((o) => {
      if (filtroEstado && o.estado !== filtroEstado) return false
      if (filtroProductoId && String(o.productoId) !== String(filtroProductoId)) return false
      return true
    })
  }, [ordenesProduccion, filtroEstado, filtroProductoId])

  const tareasSinOrden = useMemo(
    () => tareasProduccion.filter((t) => !t.ordenProduccionId),
    [tareasProduccion]
  )
  const tareaDetalle = tareasSinOrden.find((t) => t.id === tareaDetalleId)

  // ---------- Orden de producción ----------
  const resetOrdenForm = () => {
    setOrdenProductoId('')
    setOrdenCantidad('')
    setOrdenComentario('')
    setFormOrdenAbierto(false)
  }

  const handleCrearOrden = async () => {
    if (!ordenProductoId) { notify.error('Selecciona un producto'); return }
    if (!(Number(ordenCantidad) > 0)) { notify.error('Indica una cantidad mayor a 0'); return }
    setGuardandoOrden(true)
    try {
      await addOrdenProduccion({
        productoId: ordenProductoId,
        cantidad: Number(ordenCantidad),
        comentario: ordenComentario,
      })
      resetOrdenForm()
      notify.ok('Orden de producción creada')
    } catch (e) {
      notify.error('Error al crear la orden: ' + e.message)
    } finally {
      setGuardandoOrden(false)
    }
  }

  const handleTerminarOrden = async (orden) => {
    const pendientes = orden.tareas.filter((t) => t.estado !== 'terminada').length
    const aviso = pendientes > 0
      ? `Esta orden tiene ${pendientes} proceso(s) sin terminar. ¿Marcarla como terminada de todos modos?`
      : '¿Marcar esta orden como terminada?'
    if (!(await confirmar(aviso, { titulo: 'Terminar orden', textoOk: 'Sí, terminar', peligro: pendientes > 0 }))) return
    try {
      await terminarOrdenProduccion(orden.id)
    } catch (e) {
      notify.error('Error: ' + e.message)
    }
  }

  const handleEliminarOrden = async (orden) => {
    if (!(await confirmar(`¿Eliminar la orden de "${orden.productoNombre}"?`))) return
    try {
      await deleteOrdenProduccion(orden.id)
    } catch (e) {
      notify.error('Error: ' + e.message)
    }
  }

  // ---------- Agregar proceso (tarea) a una orden ----------
  const abrirTareaForm = (orden) => {
    setTareaFormOrdenId(orden.id)
    setTaEmpleadoId('')
    setTaProcesoId('')
    setTaCantidad(String(orden.cantidad))
    setTaComentario('')
  }

  const resetTareaForm = () => {
    setTareaFormOrdenId(null)
    setTaEmpleadoId('')
    setTaProcesoId('')
    setTaCantidad('')
    setTaComentario('')
  }

  const handleAgregarTarea = async () => {
    if (!ordenSel) return
    if (!taEmpleadoId) { notify.error('Selecciona un empleado'); return }
    if (!taProcesoId) { notify.error('Selecciona un proceso'); return }
    if (!(Number(taCantidad) > 0)) { notify.error('Indica una cantidad mayor a 0'); return }
    setGuardandoTarea(true)
    try {
      const creada = await addTareaProduccion({
        empleadoId: taEmpleadoId,
        productoId: ordenSel.productoId,
        procesoId: taProcesoId,
        cantidad: Number(taCantidad),
        comentario: taComentario,
        ordenProduccionId: ordenSel.id,
      })
      resetTareaForm()
      notify.ok('Proceso agregado a la orden')
      for (const aviso of creada?.avisos || []) {
        notify.error(`⚠️ ${aviso}`)
      }
    } catch (e) {
      notify.error('Error al agregar el proceso: ' + e.message)
    } finally {
      setGuardandoTarea(false)
    }
  }

  // ---------- Edición de tareas individuales ----------
  const valorProgreso = (t) => (borradores[t.id]?.progreso ?? t.progreso)
  const valorComentario = (t) => (borradores[t.id]?.comentario ?? t.comentario)

  const setBorrador = (id, campo, val) =>
    setBorradores((b) => ({ ...b, [id]: { ...b[id], [campo]: val } }))

  const guardarCambios = async (t) => {
    try {
      await updateTareaProduccion(t.id, {
        progreso: Number(valorProgreso(t)),
        comentario: valorComentario(t),
      })
      setBorradores((b) => {
        const next = { ...b }
        delete next[t.id]
        return next
      })
    } catch (e) {
      notify.error('Error al guardar: ' + e.message)
    }
  }

  const handleTerminarTarea = async (t) => {
    if (!(await confirmar('¿Marcar este proceso como terminado?', { titulo: 'Terminar proceso', textoOk: 'Sí, terminar', peligro: false }))) return
    try {
      await terminarTareaProduccion(t.id)
    } catch (e) {
      notify.error('Error: ' + e.message)
    }
  }

  const handleEliminarTarea = async (t) => {
    if (!(await confirmar('¿Eliminar este proceso? El stock ya descontado no se repone automáticamente.'))) return
    try {
      await deleteTareaProduccion(t.id)
    } catch (e) {
      notify.error('Error: ' + e.message)
    }
  }

  const verHistorial = async (t) => {
    if (historialAbierto === t.id) {
      setHistorialAbierto(null)
      return
    }
    try {
      const h = await getTareaProduccionHistorial(t.id)
      setHistorial(h)
      setHistorialAbierto(t.id)
    } catch (e) {
      notify.error('Error al cargar el historial: ' + e.message)
    }
  }

  const hayBorrador = (t) =>
    borradores[t.id] &&
    (Number(valorProgreso(t)) !== t.progreso || valorComentario(t) !== t.comentario)

  const toggleProceso = (id) => setProcesoExpandidoId((actual) => (actual === id ? null : id))

  // Contenido de detalle de un proceso/tarea: edición de progreso/comentario,
  // materiales consumidos y su historial. Se usa tanto dentro de la fila
  // expandida del modal de una orden como en el modal de un proceso sin orden.
  const renderDetalleProceso = (t) => {
    const bloqueada = !puedeEditar
    const progreso = Number(valorProgreso(t))
    return (
      <div>
        <BarraProgreso valor={progreso} />

        {!bloqueada && (
          <div className="row" style={{ marginTop: 10, alignItems: 'center' }}>
            <div style={{ flex: 2 }}>
              <label className="small">Progreso: {progreso}%</label>
              <input
                type="range" min="0" max="100" step="5"
                value={progreso}
                onChange={(e) => setBorrador(t.id, 'progreso', e.target.value)}
              />
            </div>
            <div style={{ flex: 3 }}>
              <label className="small">Comentario</label>
              <textarea
                rows={2}
                value={valorComentario(t)}
                onChange={(e) => setBorrador(t.id, 'comentario', e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        )}

        {bloqueada && t.comentario && (
          <p className="muted small" style={{ marginTop: 8 }}>💬 {t.comentario}</p>
        )}

        <p className="muted small" style={{ marginTop: 10, marginBottom: 4 }}>
          <strong>Materiales consumidos en este proceso</strong>
        </p>
        {(!t.materialesConsumidos || t.materialesConsumidos.length === 0) && (
          <p className="muted small">Este proceso no tiene receta de materiales.</p>
        )}
        {t.materialesConsumidos && t.materialesConsumidos.length > 0 && (
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Material</th>
                  <th className="num">Cantidad</th>
                  <th>Unidad</th>
                  <th className="num">Costo unitario</th>
                </tr>
              </thead>
              <tbody>
                {t.materialesConsumidos.map((m) => (
                  <tr key={m.materialId + '-' + m.cantidad}>
                    <td>{m.materialNombre}</td>
                    <td className="num texto-salida">-{m.cantidad}</td>
                    <td>{m.unidad}</td>
                    <td className="num">{formatCOP(m.costoUnitario)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="actions" style={{ marginTop: 10 }}>
          {!bloqueada && (
            <>
              <button className="btn-secondary btn-sm" onClick={() => guardarCambios(t)} disabled={!hayBorrador(t)}>
                💾 Guardar
              </button>
              {t.estado !== 'terminada' && (
                <button className="btn-primary btn-sm" onClick={() => handleTerminarTarea(t)}>✓ Marcar terminado</button>
              )}
            </>
          )}
          <button className="btn-secondary btn-sm" onClick={() => verHistorial(t)}>
            🕑 Historial
          </button>
          {puedeEliminar && (
            <button className="btn-danger btn-sm" onClick={() => handleEliminarTarea(t)}>🗑 Eliminar</button>
          )}
        </div>

        {historialAbierto === t.id && (
          <div className="historial-box">
            {historial.length === 0 && <p className="muted small">Sin cambios registrados.</p>}
            {historial.map((h) => (
              <div key={h.id} className="small" style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="muted">{new Date(h.fecha).toLocaleString('es-CO')}</span>
                {' · '}<strong>{h.usuario || 'sistema'}</strong>
                {h.progresoAnterior !== h.progresoNuevo && (
                  <> · progreso {h.progresoAnterior}% → {h.progresoNuevo}%</>
                )}
                {h.comentario && <> · 💬 {h.comentario}</>}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const cerrarDetalleOrden = () => {
    setOrdenDetalleId(null)
    setProcesoExpandidoId(null)
    setHistorialAbierto(null)
  }
  const cerrarDetalleTarea = () => {
    setTareaDetalleId(null)
    setHistorialAbierto(null)
  }

  return (
    <div>
      <h2>🏭 Gestión de Producción</h2>
      <p className="muted">
        Crea una orden por cada lote que vas a fabricar (ej: "Armario Valluno x30") y
        ve agregando los procesos por los que pasa (corte, armado, pintura...). Desde
        el seguimiento de cada orden puedes ver en qué proceso va y cuánto material
        consumió cada uno.
      </p>

      {puedeCrear && (
        <div className="form-actions">
          <button type="button" className="btn-primary" onClick={() => setFormOrdenAbierto(true)}>
            + Nueva orden
          </button>
        </div>
      )}

      {puedeCrear && formOrdenAbierto && (
        <>
          <div className="overlay" onClick={resetOrdenForm} />
          <div className="card modal">
            <h3>Nueva orden de producción</h3>
            <div className="row">
              <div style={{ flex: 2 }}>
                <label>Producto</label>
                <select value={ordenProductoId} onChange={(e) => setOrdenProductoId(e.target.value)}>
                  <option value="">— Producto —</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label>Cantidad</label>
                <input
                  type="number" min="0" step="any" placeholder="0"
                  value={ordenCantidad}
                  onChange={(e) => setOrdenCantidad(e.target.value)}
                />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label>Comentario (opcional)</label>
              <input
                type="text" placeholder="Ej: entrega para el viernes"
                value={ordenComentario}
                onChange={(e) => setOrdenComentario(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            {productos.length === 0 && (
              <p className="muted small">Necesitas productos creados para abrir una orden.</p>
            )}
            <div className="form-actions">
              <button className="btn-primary" onClick={handleCrearOrden} disabled={guardandoOrden}>
                {guardandoOrden ? 'Guardando…' : '+ Crear orden'}
              </button>
              <button type="button" className="btn-secondary" onClick={resetOrdenForm}>
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}

      {/* Filtros */}
      <div className="card">
        <div className="row">
          <div style={{ flex: 1 }}>
            <label className="small">Producto</label>
            <select value={filtroProductoId} onChange={(e) => setFiltroProductoId(e.target.value)}>
              <option value="">Todos</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="small">Estado</label>
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(ESTADO_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabla de órdenes */}
      <div className="card">
        <h3>Órdenes de producción ({ordenesFiltradas.length})</h3>
        {ordenesFiltradas.length === 0 && (
          <Vacio icono="🏭" titulo="No hay órdenes para mostrar">
            Crea una orden de producción o cambia los filtros.
          </Vacio>
        )}

        {ordenesFiltradas.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Inicio</th>
                  <th>Producto</th>
                  <th className="num">Cantidad</th>
                  <th>Proceso actual</th>
                  <th>Estado</th>
                  <th className="num">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ordenesFiltradas.map((orden) => {
                  const actual = procesoActualDe(orden)
                  return (
                    <tr key={orden.id}>
                      <td>#{orden.id}</td>
                      <td className="muted small">{formatFecha(orden.creado)}</td>
                      <td><strong>{orden.productoNombre || '— eliminado'}</strong></td>
                      <td className="num">{orden.cantidad}</td>
                      <td>
                        {actual.clase
                          ? <span className={`chip ${actual.clase}`}>{actual.texto}</span>
                          : <span className="muted small">{actual.texto}</span>}
                      </td>
                      <td>
                        <span className={`chip ${orden.estado === 'terminada' ? 'ok' : orden.estado === 'en_progreso' ? 'warn' : ''}`}>
                          {ESTADO_LABEL[orden.estado] || orden.estado}
                        </span>
                      </td>
                      <td className="num">
                        <div className="actions" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn-secondary btn-sm" onClick={() => setOrdenDetalleId(orden.id)}>
                            🔎 Seguimiento
                          </button>
                          {puedeCrear && (
                            <button className="btn-secondary btn-sm" onClick={() => abrirTareaForm(orden)}>
                              + Proceso
                            </button>
                          )}
                          {puedeEditar && orden.estado !== 'terminada' && (
                            <button className="btn-primary btn-sm" onClick={() => handleTerminarOrden(orden)}>
                              ✓ Terminar
                            </button>
                          )}
                          {puedeEliminar && (
                            <button
                              className="btn-danger btn-sm"
                              disabled={orden.tareas.length > 0}
                              title={orden.tareas.length > 0 ? 'Elimina primero los procesos de esta orden' : ''}
                              onClick={() => handleEliminarOrden(orden)}
                            >
                              🗑 Eliminar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: agregar proceso a una orden */}
      {ordenSel && (
        <>
          <div className="overlay" onClick={resetTareaForm} />
          <div className="card modal">
            <h3>Agregar proceso a "{ordenSel.productoNombre}"</h3>
            <div className="row">
              <div style={{ flex: 2 }}>
                <label>Empleado</label>
                <select value={taEmpleadoId} onChange={(e) => setTaEmpleadoId(e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {empleados.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombre}{emp.cargo ? ` (${emp.cargo})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 2 }}>
                <label>Proceso</label>
                <select value={taProcesoId} onChange={(e) => setTaProcesoId(e.target.value)}>
                  <option value="">— Proceso —</option>
                  {procesosDisponibles.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label>Cantidad</label>
                <input
                  type="number" min="0" step="any" placeholder="0"
                  value={taCantidad}
                  onChange={(e) => setTaCantidad(e.target.value)}
                />
              </div>
            </div>
            <p className="muted small">
              La cantidad viene precargada con la de la orden ({ordenSel.cantidad}); ajústala si hubo merma en procesos anteriores.
            </p>
            {productoDeOrdenSel && procesosDisponibles.length === 0 && (
              <p className="muted small">
                ✓ Esta orden ya tiene todos los procesos del producto. No quedan procesos por agregar.
              </p>
            )}
            <div style={{ marginTop: 10 }}>
              <label>Comentario (opcional)</label>
              <input
                type="text" placeholder="Ej: entrega para el viernes"
                value={taComentario}
                onChange={(e) => setTaComentario(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            {empleados.length === 0 && (
              <p className="muted small">Necesitas empleados creados para asignar el proceso.</p>
            )}
            <div className="form-actions">
              <button className="btn-primary" onClick={handleAgregarTarea} disabled={guardandoTarea}>
                {guardandoTarea ? 'Guardando…' : '+ Agregar proceso'}
              </button>
              <button type="button" className="btn-secondary" onClick={resetTareaForm}>
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modal: seguimiento de una orden (tabla de procesos, expandible) */}
      {ordenDetalle && (
        <>
          <div className="overlay" onClick={cerrarDetalleOrden} />
          <div className="modal" style={{ width: 'min(820px, 92vw)' }}>
            <h3>Orden #{ordenDetalle.id} — {ordenDetalle.productoNombre}</h3>
            <p className="muted small">
              Inicio: {formatFecha(ordenDetalle.creado)} · Cantidad: {ordenDetalle.cantidad} · Estado: {ESTADO_LABEL[ordenDetalle.estado] || ordenDetalle.estado}
              {ordenDetalle.comentario && <> · 💬 {ordenDetalle.comentario}</>}
            </p>

            {ordenDetalle.tareas.length === 0 && (
              <p className="muted">Esta orden todavía no tiene procesos asignados.</p>
            )}

            {ordenDetalle.tareas.length > 0 && (
              <div className="table-wrap">
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>Proceso</th>
                      <th>Empleado</th>
                      <th className="num">Cantidad</th>
                      <th style={{ minWidth: 140 }}>Progreso</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenDetalle.tareas.map((t) => (
                      <Fragment key={t.id}>
                        <tr className="chip-clicable" onClick={() => toggleProceso(t.id)}>
                          <td>{procesoExpandidoId === t.id ? '▾' : '▸'} {t.procesoNombre}</td>
                          <td>{nombreEmpleado(t.empleadoId)}</td>
                          <td className="num">{t.cantidad}</td>
                          <td><BarraProgreso valor={t.progreso} /></td>
                          <td>
                            <span className={`chip ${t.estado === 'terminada' ? 'ok' : t.estado === 'en_progreso' ? 'warn' : ''}`}>
                              {ESTADO_LABEL[t.estado] || t.estado}
                            </span>
                          </td>
                        </tr>
                        {procesoExpandidoId === t.id && (
                          <tr>
                            <td colSpan={5}>{renderDetalleProceso(t)}</td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="form-actions">
              <button className="btn-secondary" onClick={cerrarDetalleOrden}>Cerrar</button>
            </div>
          </div>
        </>
      )}

      {/* Procesos creados antes de existir las órdenes (sin agrupar) */}
      {tareasSinOrden.length > 0 && (
        <div className="card">
          <h3>Procesos sin orden ({tareasSinOrden.length})</h3>
          <p className="muted small">Procesos asignados antes de agrupar por órdenes de producción.</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Proceso</th>
                  <th>Empleado</th>
                  <th className="num">Cantidad</th>
                  <th>Estado</th>
                  <th className="num">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tareasSinOrden.map((t) => (
                  <tr key={t.id}>
                    <td>{t.productoNombre}</td>
                    <td>{t.procesoNombre}</td>
                    <td>{nombreEmpleado(t.empleadoId)}</td>
                    <td className="num">{t.cantidad}</td>
                    <td>
                      <span className={`chip ${t.estado === 'terminada' ? 'ok' : t.estado === 'en_progreso' ? 'warn' : ''}`}>
                        {ESTADO_LABEL[t.estado] || t.estado}
                      </span>
                    </td>
                    <td className="num">
                      <div className="actions" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn-secondary btn-sm" onClick={() => setTareaDetalleId(t.id)}>
                          🔎 Ver detalle
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: detalle de un proceso sin orden */}
      {tareaDetalle && (
        <>
          <div className="overlay" onClick={cerrarDetalleTarea} />
          <div className="modal">
            <h3>{tareaDetalle.productoNombre} — {tareaDetalle.procesoNombre}</h3>
            <p className="muted small">Empleado: {nombreEmpleado(tareaDetalle.empleadoId)} · Cantidad: {tareaDetalle.cantidad}</p>
            {renderDetalleProceso(tareaDetalle)}
            <div className="form-actions">
              <button className="btn-secondary" onClick={cerrarDetalleTarea}>Cerrar</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP, formatFecha, formatDuracion } from '../utils/format.js'
import { notify, confirmar } from '../utils/notify.js'
import Vacio from '../components/Vacio.jsx'

// Etiquetas de estado, compartidas entre órdenes y tareas (mismos valores).
// 'cancelada' solo existe en órdenes, las tareas nunca la usan.
const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  terminada: 'Terminada',
  cancelada: 'Cancelada',
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

// Una orden está atrasada si tiene fecha de entrega pasada y no está terminada.
function estaAtrasada(orden) {
  if (!orden.fechaEntrega || orden.estado === 'terminada' || orden.estado === 'cancelada') return false
  return orden.fechaEntrega.slice(0, 10) < new Date().toISOString().slice(0, 10)
}

// Aviso visual del chequeo de material (MRP). Muestra faltantes o "alcanza".
function AvisoMaterial({ mrp }) {
  if (!mrp || !mrp.items || mrp.items.length === 0) return null
  if (!mrp.hayFaltantes) {
    return <p className="chip ok" style={{ display: 'inline-block', marginTop: 8 }}>✓ Hay material suficiente en stock</p>
  }
  const faltantes = mrp.items.filter((i) => i.faltante > 0)
  return (
    <div className="card" style={{ background: '#fef2f2', border: '1px solid #fecaca', marginTop: 10, marginBottom: 0 }}>
      <strong className="texto-salida">⚠️ Material insuficiente en stock</strong>
      <p className="muted small" style={{ margin: '4px 0 0' }}>
        Se puede crear igual (el stock quedará en negativo), pero faltaría:
      </p>
      <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        {faltantes.map((i) => (
          <li key={i.materialId}>
            <strong>{i.materialNombre}</strong>: faltan {i.faltante} {i.unidad} (necesita {i.requerido}, hay {i.stockActual})
          </li>
        ))}
      </ul>
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
    cambiarEstadoOrden, cancelarOrdenProduccion, chequearMaterialOrden,
    getEmpleado,
  } = useData()
  const { puede } = useAuth()

  const puedeCrear = puede('gestion-produccion', 'crear')
  const puedeEditar = puede('gestion-produccion', 'editar')
  const puedeEliminar = puede('gestion-produccion', 'eliminar')

  // Vista tabla o tablero Kanban (se recuerda en localStorage, como el sidebar)
  const [vista, setVista] = useState(() => localStorage.getItem('produccion_vista') || 'tabla')
  const cambiarVista = (v) => { setVista(v); localStorage.setItem('produccion_vista', v) }

  // --- Formulario: nueva orden de producción ---
  const [formOrdenAbierto, setFormOrdenAbierto] = useState(false)
  const [ordenProductoId, setOrdenProductoId] = useState('')
  const [ordenVarianteId, setOrdenVarianteId] = useState('')
  const [ordenCantidad, setOrdenCantidad] = useState('')
  const [ordenComentario, setOrdenComentario] = useState('')
  const [ordenFechaEntrega, setOrdenFechaEntrega] = useState('')
  const [mrpOrden, setMrpOrden] = useState(null) // chequeo de material para la nueva orden
  const [guardandoOrden, setGuardandoOrden] = useState(false)

  // --- Formulario: agregar proceso (tarea) a una orden ---
  const [tareaFormOrdenId, setTareaFormOrdenId] = useState(null)
  const [taEmpleadoId, setTaEmpleadoId] = useState('')
  const [taProcesoId, setTaProcesoId] = useState('')
  const [taCantidad, setTaCantidad] = useState('')
  const [taComentario, setTaComentario] = useState('')
  const [mrpTarea, setMrpTarea] = useState(null) // chequeo de material al agregar proceso
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

  // Consolida todos los materiales consumidos por los procesos de una orden, sumando
  // cantidades del mismo material (para la tabla "materiales de esta orden").
  const materialesDeOrden = (orden) => {
    const map = {}
    for (const t of orden?.tareas || []) {
      for (const m of t.materialesConsumidos || []) {
        if (!map[m.materialId]) {
          map[m.materialId] = { ...m, cantidad: 0, costoTotal: 0 }
        }
        map[m.materialId].cantidad += m.cantidad
        map[m.materialId].costoTotal += m.cantidad * (m.costoUnitario || 0)
      }
    }
    return Object.values(map).sort((a, b) => a.materialNombre.localeCompare(b.materialNombre))
  }

  // Merma de la orden: cantidad con la que se inició (primer proceso) vs la del último
  // proceso. Las tareas vienen ordenadas por creación asc desde el backend.
  const mermaDeOrden = (orden) => {
    const tareas = orden?.tareas || []
    if (tareas.length < 2) return null
    const inicial = Number(tareas[0].cantidad) || 0
    const final = Number(tareas[tareas.length - 1].cantidad) || 0
    const merma = inicial - final
    const pct = inicial > 0 ? (merma / inicial) * 100 : 0
    return { inicial, final, merma, pct, procesoInicial: tareas[0].procesoNombre, procesoFinal: tareas[tareas.length - 1].procesoNombre }
  }

  // Evalúa si una orden está lista para terminar: debe tener TODOS los procesos que
  // se configuraron en el producto, y todos deben estar terminados. Devuelve el
  // motivo si no se puede (para avisar al usuario), o null si está lista.
  const motivoNoTerminar = (orden) => {
    const producto = productos.find((p) => String(p.id) === String(orden.productoId))
    const procesosProducto = producto?.procesos || []
    if (procesosProducto.length === 0) {
      // Sin receta de procesos no hay contra qué validar: solo exige que lo que tenga esté terminado
      const pend = orden.tareas.filter((t) => t.estado !== 'terminada').length
      return pend > 0 ? `Faltan ${pend} proceso(s) por terminar` : null
    }
    const nombresEnOrden = new Set(orden.tareas.map((t) => (t.procesoNombre || '').toLowerCase()))
    const faltantes = procesosProducto.filter((p) => !nombresEnOrden.has((p.nombre || '').toLowerCase()))
    if (faltantes.length > 0) {
      return `Faltan procesos del producto: ${faltantes.map((p) => p.nombre).join(', ')}`
    }
    const sinTerminar = orden.tareas.filter((t) => t.estado !== 'terminada')
    if (sinTerminar.length > 0) {
      return `Faltan procesos por terminar: ${sinTerminar.map((t) => t.procesoNombre).join(', ')}`
    }
    return null
  }

  // Procesos que la orden seleccionada ya tiene (por nombre, en minúsculas), para
  // no ofrecerlos de nuevo en el select: un proceso no se repite dentro de una orden.
  const procesosUsados = new Set(
    (ordenSel?.tareas || []).map((t) => (t.procesoNombre || '').toLowerCase())
  )
  // Procesos terminados de la orden (para saber si ya se puede pasar al siguiente
  // de la cronología del producto).
  const procesosTerminados = new Set(
    (ordenSel?.tareas || []).filter((t) => t.estado === 'terminada').map((t) => (t.procesoNombre || '').toLowerCase())
  )
  // Cronología del producto: sus procesos vienen del backend en el orden en que se
  // definieron (Corte → Reengrese → Armado → ...). Un proceso solo se puede agregar
  // si todos los anteriores en esa secuencia ya están terminados.
  const procesosSecuencia = productoDeOrdenSel?.procesos || []
  const procesosDisponibles = procesosSecuencia.filter((p, idx) => {
    if (procesosUsados.has((p.nombre || '').toLowerCase())) return false
    const anteriores = procesosSecuencia.slice(0, idx)
    return anteriores.every((ant) => procesosTerminados.has((ant.nombre || '').toLowerCase()))
  })
  // Siguiente proceso bloqueado (si el que sigue en la secuencia no se puede agregar
  // aún), para mostrar al usuario qué falta terminar antes.
  const procesoBloqueado = procesosSecuencia.find((p, idx) => {
    if (procesosUsados.has((p.nombre || '').toLowerCase())) return false
    const anteriores = procesosSecuencia.slice(0, idx)
    return !anteriores.every((ant) => procesosTerminados.has((ant.nombre || '').toLowerCase()))
  })
  const procesoBloqueadoFaltantes = procesoBloqueado
    ? procesosSecuencia
        .slice(0, procesosSecuencia.indexOf(procesoBloqueado))
        .filter((ant) => !procesosTerminados.has((ant.nombre || '').toLowerCase()))
    : []

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
    setOrdenVarianteId('')
    setOrdenCantidad('')
    setOrdenComentario('')
    setOrdenFechaEntrega('')
    setMrpOrden(null)
    setFormOrdenAbierto(false)
  }

  const handleCrearOrden = async () => {
    if (!ordenProductoId) { notify.error('Selecciona un producto'); return }
    if (!(Number(ordenCantidad) > 0)) { notify.error('Indica una cantidad mayor a 0'); return }
    setGuardandoOrden(true)
    try {
      await addOrdenProduccion({
        productoId: ordenProductoId,
        varianteId: ordenVarianteId ? Number(ordenVarianteId) : null,
        cantidad: Number(ordenCantidad),
        comentario: ordenComentario,
        fechaEntrega: ordenFechaEntrega || null,
      })
      resetOrdenForm()
      notify.ok('Orden de producción creada')
    } catch (e) {
      notify.error('Error al crear la orden: ' + e.message)
    } finally {
      setGuardandoOrden(false)
    }
  }

  const handleCambiarEstado = async (orden, estado) => {
    // Al pasar a terminada respeta la misma validación de etapas completas
    if (estado === 'terminada') {
      const motivo = motivoNoTerminar(orden)
      if (motivo) { notify.error(`No se puede terminar la orden. ${motivo}.`); return }
      if (!(await confirmar('¿Marcar esta orden como terminada? Se sumará al stock del producto.', { titulo: 'Terminar orden', textoOk: 'Sí, terminar', peligro: false }))) return
    }
    try {
      await cambiarEstadoOrden(orden.id, estado)
    } catch (e) {
      notify.error('Error: ' + e.message)
    }
  }

  const handleTerminarOrden = async (orden) => {
    // El producto debe pasar por todas sus etapas antes de darse por terminado
    const motivo = motivoNoTerminar(orden)
    if (motivo) {
      notify.error(`No se puede terminar la orden. ${motivo}.`)
      return
    }
    if (!(await confirmar('¿Marcar esta orden como terminada? Se sumará al stock del producto.', { titulo: 'Terminar orden', textoOk: 'Sí, terminar', peligro: false }))) return
    try {
      await terminarOrdenProduccion(orden.id)
    } catch (e) {
      notify.error('Error: ' + e.message)
    }
  }

  const handleEliminarOrden = async (orden) => {
    // Una orden con procesos ya descontó materiales del inventario: no se elimina.
    if (orden.tareas.length > 0) {
      notify.error('No se puede eliminar: esta orden ya tiene procesos que descontaron materiales. Elimina los procesos primero si de verdad quieres borrarla.')
      return
    }
    if (!(await confirmar(`¿Eliminar la orden de "${orden.productoNombre}"?`, { titulo: 'Eliminar orden', textoOk: 'Sí, eliminar', peligro: true }))) return
    try {
      await deleteOrdenProduccion(orden.id)
      notify.ok('Orden eliminada')
    } catch (e) {
      notify.error('Error: ' + e.message)
    }
  }

  const handleCancelarOrden = async (orden) => {
    const aviso = orden.tareas.length > 0
      ? ' El material ya descontado por sus procesos no se repone automáticamente.'
      : ''
    if (!(await confirmar(
      `¿Cancelar la orden de "${orden.productoNombre}"? Quedará cerrada sin sumar al stock.${aviso}`,
      { titulo: 'Cancelar orden', textoOk: 'Sí, cancelar', peligro: true }
    ))) return
    try {
      await cancelarOrdenProduccion(orden.id)
      notify.ok('Orden cancelada')
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

  // ---------- Chequeo preventivo de materiales (MRP) ----------
  // Al elegir producto+cantidad en la nueva orden, consulta si el stock alcanza
  // para TODOS los procesos del producto (suma sus recetas × cantidad).
  useEffect(() => {
    const prod = productos.find((p) => String(p.id) === String(ordenProductoId))
    const cant = Number(ordenCantidad) || 0
    if (!formOrdenAbierto || !prod || !(cant > 0) || !(prod.procesos?.length)) {
      setMrpOrden(null)
      return
    }
    const variante = (prod.variantes || []).find((v) => String(v.id) === String(ordenVarianteId))
    const colorId = variante?.colorId || null
    let cancelado = false
    chequearMaterialOrden({ procesos: prod.procesos.map((p) => p.id), cantidad: cant, colorId })
      .then((r) => { if (!cancelado) setMrpOrden(r) })
      .catch(() => { if (!cancelado) setMrpOrden(null) })
    return () => { cancelado = true }
  }, [formOrdenAbierto, ordenProductoId, ordenVarianteId, ordenCantidad, productos])

  // Al elegir proceso+cantidad al agregar una tarea, consulta si el stock alcanza
  // para ese proceso (su receta × cantidad).
  useEffect(() => {
    const cant = Number(taCantidad) || 0
    if (!taProcesoId || !(cant > 0)) {
      setMrpTarea(null)
      return
    }
    let cancelado = false
    chequearMaterialOrden({ procesoId: taProcesoId, cantidad: cant })
      .then((r) => { if (!cancelado) setMrpTarea(r) })
      .catch(() => { if (!cancelado) setMrpTarea(null) })
    return () => { cancelado = true }
  }, [taProcesoId, taCantidad])

  // ---------- Edición de tareas individuales ----------
  const valorProgreso = (t) => (borradores[t.id]?.progreso ?? t.progreso)
  const valorComentario = (t) => (borradores[t.id]?.comentario ?? t.comentario)
  const valorCantidad = (t) => (borradores[t.id]?.cantidad ?? t.cantidad)
  const valorMotivoMerma = (t) => (borradores[t.id]?.motivoMerma ?? (t.motivoMerma || ''))
  const valorEmpleadoId = (t) => (borradores[t.id]?.empleadoId ?? String(t.empleadoId || ''))

  const setBorrador = (id, campo, val) =>
    setBorradores((b) => ({ ...b, [id]: { ...b[id], [campo]: val } }))

  const guardarCambios = async (t) => {
    try {
      await updateTareaProduccion(t.id, {
        progreso: Number(valorProgreso(t)),
        comentario: valorComentario(t),
        cantidad: Number(valorCantidad(t)),
        motivoMerma: valorMotivoMerma(t),
        empleadoId: Number(valorEmpleadoId(t)),
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
    (Number(valorProgreso(t)) !== t.progreso ||
      valorComentario(t) !== t.comentario ||
      Number(valorCantidad(t)) !== t.cantidad ||
      valorMotivoMerma(t) !== (t.motivoMerma || '') ||
      valorEmpleadoId(t) !== String(t.empleadoId || ''))

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

        {!bloqueada && (
          <div className="row" style={{ marginTop: 4 }}>
            <div style={{ flex: 1 }}>
              <label className="small">Empleado asignado</label>
              <select value={valorEmpleadoId(t)} onChange={(e) => setBorrador(t.id, 'empleadoId', e.target.value)}>
                {empleados.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nombre}{emp.cargo ? ` (${emp.cargo})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {!bloqueada && (
          <div className="row" style={{ marginTop: 4, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label className="small">Cantidad que salió de este proceso</label>
              <input
                type="number" min="0" step="any"
                value={valorCantidad(t)}
                onChange={(e) => setBorrador(t.id, 'cantidad', e.target.value)}
              />
            </div>
            <div style={{ flex: 3 }}>
              <label className="small">Motivo de merma (si salieron menos que en el proceso anterior)</label>
              <input
                type="text"
                value={valorMotivoMerma(t)}
                onChange={(e) => setBorrador(t.id, 'motivoMerma', e.target.value)}
                placeholder="Ej: material defectuoso, error de corte"
              />
            </div>
          </div>
        )}

        {bloqueada && t.comentario && (
          <p className="muted small" style={{ marginTop: 8 }}>💬 {t.comentario}</p>
        )}
        {t.motivoMerma && (
          <p className="muted small" style={{ marginTop: 8 }}>📉 Merma: {t.motivoMerma}</p>
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

      <div className="form-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        {puedeCrear ? (
          <button type="button" className="btn-primary" onClick={() => setFormOrdenAbierto(true)}>
            + Nueva orden
          </button>
        ) : <span />}
        <div className="tabs" style={{ margin: 0, flex: '0 0 auto' }}>
          <button
            type="button"
            className={`tab ${vista === 'tabla' ? 'active' : ''}`}
            onClick={() => cambiarVista('tabla')}
          >
            📋 Tabla
          </button>
          <button
            type="button"
            className={`tab ${vista === 'kanban' ? 'active' : ''}`}
            onClick={() => cambiarVista('kanban')}
          >
            🟦 Tablero
          </button>
        </div>
      </div>

      {puedeCrear && formOrdenAbierto && (
        <>
          <div className="overlay" onClick={resetOrdenForm} />
          <div className="card modal">
            <h3>Nueva orden de producción</h3>
            <div className="row">
              <div style={{ flex: 2 }}>
                <label>Producto</label>
                <select
                  value={ordenProductoId}
                  onChange={(e) => {
                    setOrdenProductoId(e.target.value)
                    // Selecciona por defecto la primera variante del producto elegido
                    const prod = productos.find((p) => String(p.id) === String(e.target.value))
                    setOrdenVarianteId(prod?.variantes?.[0] ? String(prod.variantes[0].id) : '')
                  }}
                >
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
            {/* Selector de color: solo si el producto tiene más de una variante */}
            {(() => {
              const prod = productos.find((p) => String(p.id) === String(ordenProductoId))
              const vars = prod?.variantes || []
              if (vars.length <= 1) return null
              return (
                <div className="row" style={{ marginTop: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label>Color a fabricar</label>
                    <select value={ordenVarianteId} onChange={(e) => setOrdenVarianteId(e.target.value)}>
                      {vars.map((v) => (
                        <option key={v.id} value={v.id}>{v.colorNombre || 'Sin color'}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )
            })()}
            <div className="row" style={{ marginTop: 10 }}>
              <div style={{ flex: 1 }}>
                <label>Fecha de entrega (opcional)</label>
                <input
                  type="date"
                  value={ordenFechaEntrega}
                  onChange={(e) => setOrdenFechaEntrega(e.target.value)}
                />
              </div>
              <div style={{ flex: 2 }}>
                <label>Comentario (opcional)</label>
                <input
                  type="text" placeholder="Ej: entrega para el viernes"
                  value={ordenComentario}
                  onChange={(e) => setOrdenComentario(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            {/* Chequeo preventivo de materiales (MRP) para toda la orden */}
            {mrpOrden && mrpOrden.items.length > 0 && (
              <div className="card" style={{ background: '#f8fafc', marginTop: 12, marginBottom: 0 }}>
                <strong className="small">
                  {mrpOrden.hayFaltantes ? '⚠️ Material insuficiente para esta orden' : '✓ Hay material suficiente'}
                </strong>
                <div className="table-wrap" style={{ marginTop: 6 }}>
                  <table className="table compact">
                    <thead>
                      <tr>
                        <th>Material</th>
                        <th className="num">Necesita</th>
                        <th className="num">Stock</th>
                        <th className="num">Falta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mrpOrden.items.map((m) => (
                        <tr key={m.materialId} className={m.faltante > 0 ? 'fila-alerta' : ''}>
                          <td>{m.materialNombre}</td>
                          <td className="num">{m.requerido} {m.unidad}</td>
                          <td className="num">{m.stockActual}</td>
                          <td className="num">{m.faltante > 0 ? `-${m.faltante}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted small" style={{ marginBottom: 0 }}>
                  Es solo un aviso; puedes crear la orden igual (el material se descuenta al agregar cada proceso).
                </p>
              </div>
            )}

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

        {ordenesFiltradas.length > 0 && vista === 'tabla' && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Inicio</th>
                  <th>Entrega</th>
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
                  const atrasada = estaAtrasada(orden)
                  return (
                    <tr
                      key={orden.id}
                      className={`chip-clicable${atrasada ? ' fila-alerta' : ''}`}
                      onClick={() => setOrdenDetalleId(orden.id)}
                    >
                      <td>#{orden.id}</td>
                      <td className="muted small">{formatFecha(orden.creado)}</td>
                      <td className="small">
                        {orden.fechaEntrega
                          ? <>{formatFecha(orden.fechaEntrega)}{atrasada && <span className="chip danger" style={{ marginLeft: 6 }}>⚠️ Atrasada</span>}</>
                          : <span className="muted">—</span>}
                      </td>
                      <td>
                        <strong>{orden.productoNombre || '— eliminado'}</strong>
                        {orden.colorNombre && <span className="chip" style={{ marginLeft: 6 }}>{orden.colorNombre}</span>}
                      </td>
                      <td className="num">{orden.cantidad}</td>
                      <td>
                        {actual.clase
                          ? <span className={`chip ${actual.clase}`}>{actual.texto}</span>
                          : <span className="muted small">{actual.texto}</span>}
                      </td>
                      <td>
                        <span className={`chip ${orden.estado === 'terminada' ? 'ok' : orden.estado === 'en_progreso' ? 'warn' : orden.estado === 'cancelada' ? 'danger' : ''}`}>
                          {ESTADO_LABEL[orden.estado] || orden.estado}
                        </span>
                      </td>
                      <td className="num" onClick={(e) => e.stopPropagation()}>
                        <div className="actions" style={{ justifyContent: 'flex-end' }}>
                          {puedeCrear && orden.estado !== 'terminada' && orden.estado !== 'cancelada' && (
                            <button className="btn-secondary btn-sm" onClick={() => abrirTareaForm(orden)}>
                              + Proceso
                            </button>
                          )}
                          {puedeEditar && orden.estado !== 'terminada' && orden.estado !== 'cancelada' && (() => {
                            const motivo = motivoNoTerminar(orden)
                            return (
                              <button
                                className="btn-primary btn-sm"
                                disabled={!!motivo}
                                title={motivo || 'Marcar la orden como terminada'}
                                onClick={() => handleTerminarOrden(orden)}
                              >
                                ✓ Terminar
                              </button>
                            )
                          })()}
                          {puedeEditar && orden.estado !== 'terminada' && orden.estado !== 'cancelada' && (
                            <button className="btn-secondary btn-sm" onClick={() => handleCancelarOrden(orden)}>
                              ✕ Cancelar
                            </button>
                          )}
                          {puedeEditar && orden.estado === 'cancelada' && (
                            <button className="btn-secondary btn-sm" onClick={() => handleCambiarEstado(orden, 'en_progreso')} title="Reabrir">
                              ◀ Reabrir
                            </button>
                          )}
                          {puedeEliminar && (
                            <button
                              className="btn-danger btn-sm"
                              disabled={orden.tareas.length > 0}
                              title={orden.tareas.length > 0 ? 'No se puede eliminar: ya tiene procesos que descontaron materiales' : 'Eliminar esta orden'}
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

        {ordenesFiltradas.length > 0 && vista === 'kanban' && (
          <div className="kanban">
            {['pendiente', 'en_progreso', 'terminada', 'cancelada'].map((estado) => {
              const enColumna = ordenesFiltradas.filter((o) => o.estado === estado)
              return (
                <div className="kanban-col" key={estado}>
                  <div className="kanban-col-head">
                    <span>{ESTADO_LABEL[estado]}</span>
                    <span className="chip">{enColumna.length}</span>
                  </div>
                  {enColumna.length === 0 && <p className="muted small">Sin órdenes.</p>}
                  {enColumna.map((orden) => {
                    const actual = procesoActualDe(orden)
                    const atrasada = estaAtrasada(orden)
                    const motivo = motivoNoTerminar(orden)
                    return (
                      <div
                        className={`kanban-card${atrasada ? ' atrasada' : ''} chip-clicable`}
                        key={orden.id}
                        onClick={() => setOrdenDetalleId(orden.id)}
                      >
                        <div className="kanban-card-head">
                          <strong>#{orden.id} {orden.productoNombre || '— eliminado'}{orden.colorNombre ? ` · ${orden.colorNombre}` : ''}</strong>
                          <span className="muted small">{orden.cantidad} und</span>
                        </div>
                        <div className="muted small">{actual.texto}</div>
                        {orden.fechaEntrega && (
                          <div className="small">
                            📅 {formatFecha(orden.fechaEntrega)}
                            {atrasada && <span className="chip danger" style={{ marginLeft: 6 }}>⚠️ Atrasada</span>}
                          </div>
                        )}
                        {orden.costoReal?.total > 0 && (
                          <div className="small muted">Costo real: {formatCOP(orden.costoReal.total)}</div>
                        )}
                        <div className="actions" style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                          {puedeEditar && estado === 'pendiente' && (
                            <button className="btn-primary btn-sm" onClick={() => handleCambiarEstado(orden, 'en_progreso')}>▶ Iniciar</button>
                          )}
                          {puedeEditar && estado === 'en_progreso' && (
                            <>
                              <button className="btn-secondary btn-sm" onClick={() => handleCambiarEstado(orden, 'pendiente')} title="Volver a pendiente">◀</button>
                              <button className="btn-primary btn-sm" disabled={!!motivo} title={motivo || 'Marcar terminada'} onClick={() => handleCambiarEstado(orden, 'terminada')}>✓ Terminar</button>
                            </>
                          )}
                          {puedeEditar && (estado === 'terminada' || estado === 'cancelada') && (
                            <button className="btn-secondary btn-sm" onClick={() => handleCambiarEstado(orden, 'en_progreso')} title="Reabrir">◀ Reabrir</button>
                          )}
                          {puedeEditar && (estado === 'pendiente' || estado === 'en_progreso') && (
                            <button className="btn-danger btn-sm" onClick={() => handleCancelarOrden(orden)} title="Cancelar orden">✕</button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
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
            {mrpTarea && mrpTarea.items.length > 0 && (
              <div className={`banner ${mrpTarea.hayFaltantes ? 'error' : ''}`} style={{ marginTop: 6 }}>
                {mrpTarea.hayFaltantes ? (
                  <>
                    ⚠️ Con el stock actual no alcanza:
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                      {mrpTarea.items.filter((i) => i.faltante > 0).map((i) => (
                        <li key={i.materialId}>
                          {i.materialNombre}: faltan {i.faltante} {i.unidad} (necesita {i.requerido}, hay {i.stockActual})
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <>✓ Hay stock suficiente para este proceso.</>
                )}
              </div>
            )}
            {productoDeOrdenSel && procesosDisponibles.length === 0 && procesosUsados.size >= procesosSecuencia.length && (
              <p className="muted small">
                ✓ Esta orden ya tiene todos los procesos del producto. No quedan procesos por agregar.
              </p>
            )}
            {procesoBloqueado && procesosDisponibles.length === 0 && (
              <p className="muted small">
                ⏳ El siguiente proceso es "{procesoBloqueado.nombre}", pero antes hay que terminar: {procesoBloqueadoFaltantes.map((p) => p.nombre).join(', ')}.
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
              <div className="timeline">
                {ordenDetalle.tareas.map((t, idx) => {
                  // Merma respecto al proceso anterior (la cantidad que entró vs la que salió)
                  const prev = idx > 0 ? ordenDetalle.tareas[idx - 1] : null
                  const merma = prev ? (Number(prev.cantidad) || 0) - (Number(t.cantidad) || 0) : 0
                  const esUltimo = idx === ordenDetalle.tareas.length - 1
                  // Duración real: si terminó, cuánto duró de inicio a fin; si va en curso,
                  // cuánto lleva desde que empezó; si no ha empezado, no hay nada que mostrar.
                  const duracion = t.inicioReal ? formatDuracion(t.inicioReal, t.finReal) : null
                  return (
                    <div className="timeline-step" key={t.id}>
                      <div className="timeline-rail">
                        <div className={`timeline-dot ${t.estado}`} />
                        {!esUltimo && <div className={`timeline-line ${t.estado === 'terminada' ? 'terminada' : ''}`} />}
                      </div>
                      <div className="timeline-content" onClick={() => toggleProceso(t.id)}>
                        <div className="timeline-head">
                          <strong>{procesoExpandidoId === t.id ? '▾' : '▸'} {t.procesoNombre}</strong>
                          <span className={`chip ${t.estado === 'terminada' ? 'ok' : t.estado === 'en_progreso' ? 'warn' : ''}`}>
                            {ESTADO_LABEL[t.estado] || t.estado}
                          </span>
                          {duracion && (
                            <span className={`timeline-duracion ${t.estado}`}>
                              {t.estado === 'terminada' ? `⏱ ${duracion}` : `⏳ en curso hace ${duracion}`}
                            </span>
                          )}
                        </div>
                        <p className="timeline-meta">
                          {nombreEmpleado(t.empleadoId)} · Cantidad: {t.cantidad}
                          {prev && merma > 0 && <> · <span className="texto-salida">Merma: -{merma}</span></>}
                        </p>
                        {procesoExpandidoId !== t.id && <BarraProgreso valor={t.progreso} />}
                        {procesoExpandidoId === t.id && (
                          <div onClick={(e) => e.stopPropagation()}>{renderDetalleProceso(t)}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Resumen de merma entre el primer y el último proceso */}
            {(() => {
              const m = mermaDeOrden(ordenDetalle)
              if (!m) return null
              return (
                <div className="card" style={{ background: '#f8fafc', marginTop: 14, marginBottom: 0 }}>
                  <strong>📉 Merma de la orden</strong>
                  <p className="muted small" style={{ margin: '6px 0 0' }}>
                    Inició con <strong>{m.inicial}</strong> en "{m.procesoInicial}" y terminó con{' '}
                    <strong>{m.final}</strong> en "{m.procesoFinal}".{' '}
                    {m.merma > 0 ? (
                      <span className="texto-salida">Merma: {m.merma} unidad(es) ({m.pct.toFixed(1)}%)</span>
                    ) : (
                      <span className="texto-entrada">Sin merma.</span>
                    )}
                  </p>
                </div>
              )
            })()}

            {/* Materiales consumidos por toda la orden (consolidado) */}
            {(() => {
              const mats = materialesDeOrden(ordenDetalle)
              if (mats.length === 0) return null
              const totalOrden = mats.reduce((s, m) => s + m.costoTotal, 0)
              return (
                <>
                  <p className="muted small" style={{ marginTop: 14, marginBottom: 4 }}>
                    <strong>Materiales usados en esta orden</strong>
                  </p>
                  <div className="table-wrap">
                    <table className="table compact">
                      <thead>
                        <tr>
                          <th>Material</th>
                          <th className="num">Cantidad</th>
                          <th>Unidad</th>
                          <th className="num">Costo total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mats.map((m) => (
                          <tr key={m.materialId}>
                            <td>{m.materialNombre}</td>
                            <td className="num texto-salida">-{m.cantidad}</td>
                            <td>{m.unidad}</td>
                            <td className="num">{formatCOP(m.costoTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={3}><strong>Total en materiales</strong></td>
                          <td className="num"><strong>{formatCOP(totalOrden)}</strong></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )
            })()}

            {/* Costo real de la orden: materiales + mano de obra, vs estimado y venta */}
            {(() => {
              const cr = ordenDetalle.costoReal
              if (!cr || cr.total <= 0) return null
              const venta = Number(ordenDetalle.valorVenta) || 0
              const est = ordenDetalle.costoEstimadoUnit
              const gananciaUnit = venta > 0 ? venta - cr.unitario : null
              const margenPct = venta > 0 ? (gananciaUnit / venta) * 100 : null
              return (
                <div className="card" style={{ background: '#f8fafc', marginTop: 14, marginBottom: 0 }}>
                  <strong>💰 Costo real de la orden</strong>
                  <div className="table-wrap" style={{ marginTop: 6 }}>
                    <table className="table compact">
                      <tbody>
                        <tr><td>Materiales</td><td className="num">{formatCOP(cr.materiales)}</td></tr>
                        <tr><td>Mano de obra</td><td className="num">{formatCOP(cr.manoObra)}</td></tr>
                        <tr><td><strong>Costo total</strong></td><td className="num"><strong>{formatCOP(cr.total)}</strong></td></tr>
                        <tr><td>Costo por unidad ({cr.producidas} und)</td><td className="num">{formatCOP(cr.unitario)}</td></tr>
                        {est != null && (
                          <tr>
                            <td>Costo estimado x und</td>
                            <td className="num">
                              {formatCOP(est)}
                              {cr.unitario > est
                                ? <span className="chip danger" style={{ marginLeft: 6 }}>+{formatCOP(cr.unitario - est)}</span>
                                : <span className="chip ok" style={{ marginLeft: 6 }}>ok</span>}
                            </td>
                          </tr>
                        )}
                        {venta > 0 && (
                          <>
                            <tr><td>Valor de venta x und</td><td className="num">{formatCOP(venta)}</td></tr>
                            <tr>
                              <td><strong>Ganancia x und</strong></td>
                              <td className="num">
                                <strong className={gananciaUnit >= 0 ? 'texto-entrada' : 'texto-salida'}>
                                  {formatCOP(gananciaUnit)} ({margenPct.toFixed(0)}%)
                                </strong>
                              </td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {est == null && (
                    <p className="muted small" style={{ marginBottom: 0 }}>
                      Liga un costeo a este producto (en Costos) para comparar contra el costo estimado.
                    </p>
                  )}
                </div>
              )
            })()}

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

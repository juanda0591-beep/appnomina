import { useMemo, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP } from '../utils/format.js'
import { notify, confirmar } from '../utils/notify.js'

// Etiquetas y orden de los estados de una tarea
const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  terminada: 'Terminada',
  pagada: 'Pagada',
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

export default function GestionNomina() {
  const {
    empleados, productos, tareas,
    addTarea, updateTarea, terminarTarea, deleteTarea, getTareaHistorial,
    getTareaFotos, addTareaFoto, deleteTareaFoto,
    getEmpleado,
  } = useData()
  const { puede } = useAuth()

  const puedeCrear = puede('gestion-nomina', 'crear')
  const puedeEditar = puede('gestion-nomina', 'editar')
  const puedeEliminar = puede('gestion-nomina', 'eliminar')

  // --- Formulario de asignación ---
  const [formAbierto, setFormAbierto] = useState(false)
  const [nuevaEmpleadoId, setNuevaEmpleadoId] = useState('')
  const [nuevaProductoId, setNuevaProductoId] = useState('')
  const [nuevaProcesoId, setNuevaProcesoId] = useState('')
  const [nuevaCantidad, setNuevaCantidad] = useState('')
  const [nuevaComentario, setNuevaComentario] = useState('')
  const [guardando, setGuardando] = useState(false)

  const productoSel = productos.find((p) => String(p.id) === String(nuevaProductoId))

  // --- Filtros ---
  const [filtroEmpleado, setFiltroEmpleado] = useState('')
  const [filtroCargo, setFiltroCargo] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

  // --- Edición en línea (borradores de progreso/comentario por tarea) ---
  const [borradores, setBorradores] = useState({}) // { tareaId: { progreso, comentario } }
  const [historialAbierto, setHistorialAbierto] = useState(null) // tareaId
  const [historial, setHistorial] = useState([])

  // --- Registro fotográfico ---
  const [fotosAbierto, setFotosAbierto] = useState(null) // tareaId
  const [fotos, setFotos] = useState([]) // fotos de la tarea abierta
  const [fotoNota, setFotoNota] = useState('')
  const [subiendoFoto, setSubiendoFoto] = useState(false)

  const cargos = useMemo(
    () => [...new Set(empleados.map((e) => e.cargo).filter(Boolean))].sort(),
    [empleados]
  )

  const nombreEmpleado = (id) => getEmpleado(id)?.nombre || '— (eliminado)'

  const tareasFiltradas = useMemo(() => {
    return tareas.filter((t) => {
      if (filtroEmpleado && String(t.empleadoId) !== String(filtroEmpleado)) return false
      if (filtroEstado && t.estado !== filtroEstado) return false
      if (filtroCargo) {
        const emp = getEmpleado(t.empleadoId)
        if (!emp || emp.cargo !== filtroCargo) return false
      }
      return true
    })
  }, [tareas, filtroEmpleado, filtroCargo, filtroEstado, empleados])

  // Resumen por empleado: progreso promedio y conteo por estado
  const resumen = useMemo(() => {
    const map = {}
    for (const t of tareas) {
      const key = t.empleadoId
      if (!map[key]) map[key] = { empleadoId: key, total: 0, sumaProgreso: 0, pendiente: 0, en_progreso: 0, terminada: 0, pagada: 0 }
      map[key].total += 1
      map[key].sumaProgreso += t.progreso
      map[key][t.estado] = (map[key][t.estado] || 0) + 1
    }
    return Object.values(map).map((r) => ({
      ...r,
      nombre: nombreEmpleado(r.empleadoId),
      promedio: r.total ? Math.round(r.sumaProgreso / r.total) : 0,
    }))
  }, [tareas, empleados])

  const resetForm = () => {
    setNuevaEmpleadoId('')
    setNuevaProductoId('')
    setNuevaProcesoId('')
    setNuevaCantidad('')
    setNuevaComentario('')
    setFormAbierto(false)
  }

  const handleAsignar = async () => {
    if (!nuevaEmpleadoId) { notify.error('Selecciona un empleado'); return }
    if (!nuevaProductoId || !nuevaProcesoId) { notify.error('Selecciona producto y proceso'); return }
    if (!(Number(nuevaCantidad) > 0)) { notify.error('Indica una cantidad mayor a 0'); return }
    setGuardando(true)
    try {
      await addTarea({
        empleadoId: nuevaEmpleadoId,
        productoId: nuevaProductoId,
        procesoId: nuevaProcesoId,
        cantidad: Number(nuevaCantidad),
        comentario: nuevaComentario,
      })
      resetForm()
    } catch (e) {
      notify.error('Error al asignar la tarea: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  // Devuelve el valor de edición (borrador si existe, si no el de la tarea)
  const valorProgreso = (t) => (borradores[t.id]?.progreso ?? t.progreso)
  const valorComentario = (t) => (borradores[t.id]?.comentario ?? t.comentario)

  const setBorrador = (id, campo, val) =>
    setBorradores((b) => ({ ...b, [id]: { ...b[id], [campo]: val } }))

  const guardarCambios = async (t) => {
    try {
      await updateTarea(t.id, {
        progreso: Number(valorProgreso(t)),
        comentario: valorComentario(t),
      })
      // limpiar el borrador de esa tarea
      setBorradores((b) => {
        const next = { ...b }
        delete next[t.id]
        return next
      })
    } catch (e) {
      notify.error('Error al guardar: ' + e.message)
    }
  }

  const handleTerminar = async (t) => {
    if (!(await confirmar('¿Marcar esta tarea como terminada? Pasará a estar lista para pago de nómina.', { titulo: 'Terminar tarea', textoOk: 'Sí, terminar', peligro: false }))) return
    try {
      await terminarTarea(t.id)
    } catch (e) {
      notify.error('Error: ' + e.message)
    }
  }

  const handleEliminar = async (t) => {
    if (!(await confirmar('¿Eliminar esta tarea?'))) return
    try {
      await deleteTarea(t.id)
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
      const h = await getTareaHistorial(t.id)
      setHistorial(h)
      setHistorialAbierto(t.id)
    } catch (e) {
      notify.error('Error al cargar el historial: ' + e.message)
    }
  }

  const hayBorrador = (t) =>
    borradores[t.id] &&
    (Number(valorProgreso(t)) !== t.progreso || valorComentario(t) !== t.comentario)

  // --- Registro fotográfico ---
  const verFotos = async (t) => {
    if (fotosAbierto === t.id) {
      setFotosAbierto(null)
      return
    }
    try {
      const f = await getTareaFotos(t.id)
      setFotos(f)
      setFotoNota('')
      setFotosAbierto(t.id)
    } catch (e) {
      notify.error('Error al cargar las fotos: ' + e.message)
    }
  }

  const onSubirFoto = async (e, tareaId) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!/image\/(jpeg|jpg|png)/.test(file.type)) {
      notify.error('La foto debe ser JPG o PNG')
      e.target.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      notify.error('La foto es muy pesada (máx 5 MB). Usa una imagen más liviana.')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      setSubiendoFoto(true)
      try {
        await addTareaFoto(tareaId, {
          imagen: reader.result,
          imagenTipo: file.type,
          descripcion: fotoNota,
        })
        const f = await getTareaFotos(tareaId)
        setFotos(f)
        setFotoNota('')
      } catch (err) {
        notify.error('Error al subir la foto: ' + err.message)
      } finally {
        setSubiendoFoto(false)
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const eliminarFoto = async (fotoId, tareaId) => {
    if (!(await confirmar('¿Eliminar esta foto?'))) return
    try {
      await deleteTareaFoto(fotoId)
      setFotos((fs) => fs.filter((f) => f.id !== fotoId))
    } catch (e) {
      notify.error('Error: ' + e.message)
    }
  }

  // URL autenticada de la imagen: el endpoint exige token, así que se pasa por query
  const urlFoto = (fotoId) => `/api/tareas/fotos/${fotoId}?token=${sessionStorage.getItem('nomina_token')}`

  return (
    <div>
      <h2>📋 Gestión de Nómina</h2>
      <p className="muted">Asigna trabajos a los empleados y sigue su avance hasta que estén listos para pago.</p>

      {/* Asignar tarea */}
      {puedeCrear && (
        <div className="form-actions">
          <button type="button" className="btn-primary" onClick={() => setFormAbierto(true)}>
            + Asignar tarea
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="card">
        <div className="row">
          <div style={{ flex: 1 }}>
            <label className="small">Empleado</label>
            <select value={filtroEmpleado} onChange={(e) => setFiltroEmpleado(e.target.value)}>
              <option value="">Todos</option>
              {empleados.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="small">Cargo</label>
            <select value={filtroCargo} onChange={(e) => setFiltroCargo(e.target.value)}>
              <option value="">Todos</option>
              {cargos.map((c) => (
                <option key={c} value={c}>{c}</option>
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

      {/* Lista de tareas */}
      <div className="card">
        <h3>Tareas ({tareasFiltradas.length})</h3>
        {tareasFiltradas.length === 0 && <p className="muted">No hay tareas para mostrar.</p>}

        {tareasFiltradas.map((t) => {
          const bloqueada = t.estado === 'pagada' || !puedeEditar
          const progreso = Number(valorProgreso(t))
          return (
            <div className="tarea-item" key={t.id}>
              <div className="tarea-head">
                <div>
                  <strong>{nombreEmpleado(t.empleadoId)}</strong>
                  <span className="muted"> · {t.productoNombre} — {t.procesoNombre}</span>
                </div>
                <span className={`chip ${t.estado === 'terminada' ? 'ok' : t.estado === 'pagada' ? '' : 'warn'}`}>
                  {ESTADO_LABEL[t.estado] || t.estado}
                </span>
              </div>

              <div className="muted small" style={{ marginBottom: 8 }}>
                Cantidad: {t.cantidad} · Pago x und: {formatCOP(t.pago)} · Subtotal: <strong>{formatCOP(t.pago * t.cantidad)}</strong>
              </div>

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

              <div className="actions" style={{ marginTop: 10 }}>
                {!bloqueada && (
                  <>
                    <button className="btn-secondary" onClick={() => guardarCambios(t)} disabled={!hayBorrador(t)}>
                      💾 Guardar
                    </button>
                    {t.estado !== 'terminada' && (
                      <button className="btn-primary" onClick={() => handleTerminar(t)}>✓ Marcar terminada</button>
                    )}
                  </>
                )}
                <button className="btn-icon" onClick={() => verHistorial(t)}>
                  🕑 Historial
                </button>
                <button className="btn-icon" onClick={() => verFotos(t)}>
                  📷 Fotos
                </button>
                {puedeEliminar && t.estado !== 'pagada' && (
                  <button className="btn-icon danger" onClick={() => handleEliminar(t)}>🗑 Eliminar</button>
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

              {fotosAbierto === t.id && (
                <div className="historial-box">
                  <p className="muted small" style={{ marginTop: 0 }}>
                    Registro fotográfico: documenta si la tarea quedó incompleta o faltó algún componente.
                  </p>

                  {puedeEditar && (
                    <div className="row" style={{ alignItems: 'flex-end', marginBottom: 10 }}>
                      <div style={{ flex: 3 }}>
                        <label className="small">Nota de la foto (qué falta / componente faltante)</label>
                        <input
                          type="text"
                          value={fotoNota}
                          onChange={(e) => setFotoNota(e.target.value)}
                          placeholder="Ej: falta la manija de la puerta derecha"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label className="btn-secondary foto-upload">
                          {subiendoFoto ? 'Subiendo…' : '📷 Agregar foto'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png"
                            disabled={subiendoFoto}
                            onChange={(e) => onSubirFoto(e, t.id)}
                            hidden
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {fotos.length === 0 && <p className="muted small">Sin fotos registradas.</p>}
                  <div className="fotos-grid">
                    {fotos.map((f) => (
                      <div key={f.id} className="foto-card">
                        <a href={urlFoto(f.id)} target="_blank" rel="noreferrer">
                          <img src={urlFoto(f.id)} alt={f.descripcion || 'Foto de la tarea'} />
                        </a>
                        {f.descripcion && <div className="small foto-desc">{f.descripcion}</div>}
                        <div className="muted small">
                          {new Date(f.fecha).toLocaleString('es-CO')} · {f.usuario || 'sistema'}
                        </div>
                        {puedeEditar && (
                          <button className="btn-icon danger small" onClick={() => eliminarFoto(f.id, t.id)}>
                            🗑 Quitar
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Resumen por empleado (RRHH) */}
      {resumen.length > 0 && (
        <div className="card">
          <h3>Resumen por empleado</h3>
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th className="num">Tareas</th>
                  <th style={{ width: '30%' }}>Progreso promedio</th>
                  <th className="num">Pendiente</th>
                  <th className="num">En progreso</th>
                  <th className="num">Terminada</th>
                  <th className="num">Pagada</th>
                </tr>
              </thead>
              <tbody>
                {resumen.map((r) => (
                  <tr key={r.empleadoId}>
                    <td>{r.nombre}</td>
                    <td className="num">{r.total}</td>
                    <td><BarraProgreso valor={r.promedio} /></td>
                    <td className="num">{r.pendiente || 0}</td>
                    <td className="num">{r.en_progreso || 0}</td>
                    <td className="num">{r.terminada || 0}</td>
                    <td className="num">{r.pagada || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {formAbierto && (
        <>
          <div className="overlay" onClick={resetForm} />
          <div className="modal">
            <h3>Asignar tarea</h3>
            <div className="row">
              <div style={{ flex: 2 }}>
                <label>Empleado</label>
                <select value={nuevaEmpleadoId} onChange={(e) => setNuevaEmpleadoId(e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {empleados.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombre}{emp.cargo ? ` (${emp.cargo})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 2 }}>
                <label>Producto</label>
                <select
                  value={nuevaProductoId}
                  onChange={(e) => { setNuevaProductoId(e.target.value); setNuevaProcesoId('') }}
                >
                  <option value="">— Producto —</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 2 }}>
                <label>Proceso</label>
                <select
                  value={nuevaProcesoId}
                  disabled={!productoSel}
                  onChange={(e) => setNuevaProcesoId(e.target.value)}
                >
                  <option value="">— Proceso —</option>
                  {productoSel?.procesos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre} ({formatCOP(p.pago)})</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label>Cantidad</label>
                <input
                  type="number" min="0" step="any" placeholder="0"
                  value={nuevaCantidad}
                  onChange={(e) => setNuevaCantidad(e.target.value)}
                />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label>Comentario (opcional)</label>
              <input
                type="text" placeholder="Ej: entrega para el viernes"
                value={nuevaComentario}
                onChange={(e) => setNuevaComentario(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            {(empleados.length === 0 || productos.length === 0) && (
              <p className="muted small">Necesitas empleados y productos creados para asignar tareas.</p>
            )}
            <div className="form-actions">
              <button className="btn-primary" onClick={handleAsignar} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Asignar tarea'}
              </button>
              <button type="button" className="btn-secondary" onClick={resetForm}>
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

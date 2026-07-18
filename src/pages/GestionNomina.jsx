import { useEffect, useMemo, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP, formatFecha } from '../utils/format.js'
import { notify, confirmar } from '../utils/notify.js'
import Vacio from '../components/Vacio.jsx'

const nuevoItemTarea = () => ({ key: Math.random().toString(36).slice(2), productoId: '', procesoId: '', cantidad: '' })

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
    addTareas, updateTarea, terminarTarea, deleteTarea, getTareaHistorial,
    getTareaFotos, addTareaFoto, deleteTareaFoto,
    getEmpleado,
  } = useData()
  const { puede } = useAuth()

  const puedeCrear = puede('gestion-nomina', 'crear')
  const puedeEditar = puede('gestion-nomina', 'editar')
  const puedeEliminar = puede('gestion-nomina', 'eliminar')

  // --- Formulario de asignación ---
  // Un empleado puede recibir varios trabajos (producto+proceso+cantidad) de una sola vez;
  // cada línea se guarda como una tarea independiente (progreso/fotos/historial por separado),
  // porque cada proceso avanza y termina en su propio momento.
  const [formAbierto, setFormAbierto] = useState(false)
  const [nuevaEmpleadoId, setNuevaEmpleadoId] = useState('')
  const [nuevaComentario, setNuevaComentario] = useState('')
  const [nuevosItems, setNuevosItems] = useState([nuevoItemTarea()])
  const [guardando, setGuardando] = useState(false)

  // --- Filtros ---
  const [filtroEmpleado, setFiltroEmpleado] = useState('')
  const [filtroCargo, setFiltroCargo] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroBuscar, setFiltroBuscar] = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')

  // --- Paginación ---
  const [pagina, setPagina] = useState(1)
  const porPagina = 10

  // --- Edición en línea (borradores de progreso/comentario por tarea) ---
  const [borradores, setBorradores] = useState({}) // { tareaId: { progreso, comentario } }
  const [historialAbierto, setHistorialAbierto] = useState(null) // tareaId
  const [historial, setHistorial] = useState([])
  const [tareaDetalleId, setTareaDetalleId] = useState(null) // tarea abierta en el modal

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
    const q = filtroBuscar.trim().toLowerCase()
    return tareas.filter((t) => {
      if (filtroEmpleado && String(t.empleadoId) !== String(filtroEmpleado)) return false
      if (filtroEstado && t.estado !== filtroEstado) return false
      if (filtroCargo) {
        const emp = getEmpleado(t.empleadoId)
        if (!emp || emp.cargo !== filtroCargo) return false
      }
      if (filtroDesde && t.creado < filtroDesde) return false
      if (filtroHasta && t.creado > `${filtroHasta}T23:59:59`) return false
      if (q) {
        const enTexto = [nombreEmpleado(t.empleadoId), t.productoNombre, t.procesoNombre, t.comentario]
          .join(' ').toLowerCase()
        if (!enTexto.includes(q)) return false
      }
      return true
    })
  }, [tareas, filtroEmpleado, filtroCargo, filtroEstado, filtroBuscar, filtroDesde, filtroHasta, empleados])

  const totalPaginas = Math.max(1, Math.ceil(tareasFiltradas.length / porPagina))
  const tareasPagina = tareasFiltradas.slice((pagina - 1) * porPagina, pagina * porPagina)

  useEffect(() => { setPagina(1) }, [filtroEmpleado, filtroCargo, filtroEstado, filtroBuscar, filtroDesde, filtroHasta])

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
    setNuevaComentario('')
    setNuevosItems([nuevoItemTarea()])
    setFormAbierto(false)
  }

  const setNuevoItemField = (key, field, val) => {
    setNuevosItems((its) =>
      its.map((it) => {
        if (it.key !== key) return it
        const next = { ...it, [field]: val }
        // si cambia el producto, reiniciar el proceso elegido
        if (field === 'productoId') next.procesoId = ''
        return next
      })
    )
  }

  const addNuevoItemRow = () => setNuevosItems((its) => [...its, nuevoItemTarea()])
  const removeNuevoItemRow = (key) =>
    setNuevosItems((its) => (its.length === 1 ? its : its.filter((it) => it.key !== key)))

  const handleAsignar = async () => {
    if (!nuevaEmpleadoId) { notify.error('Selecciona un empleado'); return }
    const itemsValidos = nuevosItems.filter((it) => it.productoId && it.procesoId && Number(it.cantidad) > 0)
    if (itemsValidos.length === 0) { notify.error('Agrega al menos un trabajo con producto, proceso y cantidad'); return }
    setGuardando(true)
    try {
      await addTareas(itemsValidos.map((it) => ({
        empleadoId: nuevaEmpleadoId,
        productoId: it.productoId,
        procesoId: it.procesoId,
        cantidad: Number(it.cantidad),
        comentario: nuevaComentario,
      })))
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
  const valorCantidad = (t) => (borradores[t.id]?.cantidad ?? t.cantidad)
  const valorEmpleadoId = (t) => (borradores[t.id]?.empleadoId ?? String(t.empleadoId || ''))

  const setBorrador = (id, campo, val) =>
    setBorradores((b) => ({ ...b, [id]: { ...b[id], [campo]: val } }))

  const guardarCambios = async (t) => {
    if (!(Number(valorCantidad(t)) > 0)) { notify.error('Indica una cantidad mayor a 0'); return }
    try {
      await updateTarea(t.id, {
        progreso: Number(valorProgreso(t)),
        comentario: valorComentario(t),
        cantidad: Number(valorCantidad(t)),
        empleadoId: Number(valorEmpleadoId(t)),
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

  const handleReabrir = async (t) => {
    if (!(await confirmar('¿Reabrir esta tarea? Volverá a "en progreso".', { titulo: 'Reabrir tarea', textoOk: 'Sí, reabrir', peligro: false }))) return
    try {
      await updateTarea(t.id, { estado: 'en_progreso' })
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
    (Number(valorProgreso(t)) !== t.progreso ||
      valorComentario(t) !== t.comentario ||
      Number(valorCantidad(t)) !== t.cantidad ||
      valorEmpleadoId(t) !== String(t.empleadoId || ''))

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

  const cerrarDetalleTarea = () => {
    setTareaDetalleId(null)
    setHistorialAbierto(null)
    setFotosAbierto(null)
  }

  const tareaDetalle = tareas.find((t) => t.id === tareaDetalleId)

  // Detalle de una tarea: edición de progreso/comentario, historial y fotos.
  // Se muestra dentro de un modal al tocar la tarea en la tabla.
  const renderDetalleTarea = (t) => {
    const bloqueada = t.estado === 'pagada' || !puedeEditar
    const progreso = Number(valorProgreso(t))
    return (
      <div>
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

        {!bloqueada && (
          <div className="row" style={{ marginTop: 4, alignItems: 'flex-end' }}>
            <div style={{ flex: 2 }}>
              <label className="small">Empleado asignado</label>
              <select value={valorEmpleadoId(t)} onChange={(e) => setBorrador(t.id, 'empleadoId', e.target.value)}>
                {empleados.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nombre}{emp.cargo ? ` (${emp.cargo})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="small">Cantidad</label>
              <input
                type="number" min="0" step="any"
                value={valorCantidad(t)}
                onChange={(e) => setBorrador(t.id, 'cantidad', e.target.value)}
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
              <button className="btn-secondary btn-sm" onClick={() => guardarCambios(t)} disabled={!hayBorrador(t)}>
                💾 Guardar
              </button>
              {t.estado !== 'terminada' && (
                <button className="btn-primary btn-sm" onClick={() => handleTerminar(t)}>✓ Marcar terminada</button>
              )}
              {t.estado === 'terminada' && (
                <button className="btn-secondary btn-sm" onClick={() => handleReabrir(t)} title="Reabrir" aria-label="Reabrir">
                  ◀ Reabrir
                </button>
              )}
            </>
          )}
          <button className="btn-secondary btn-sm" onClick={() => verHistorial(t)}>
            🕑 Historial
          </button>
          <button className="btn-secondary btn-sm" onClick={() => verFotos(t)}>
            📷 Fotos
          </button>
          {puedeEliminar && t.estado !== 'pagada' && (
            <button className="btn-danger btn-sm" onClick={() => handleEliminar(t)}>🗑 Eliminar</button>
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
  }

  return (
    <div>
      <h2>📋 Gestión de Nómina</h2>
      <p className="muted">Asigna trabajos a los empleados y sigue su avance hasta que estén listos para pago.</p>

      {/* Asignar tarea */}
      {puedeCrear && (
        <div className="form-actions">
          <button
            type="button"
            className="btn-primary"
            disabled={empleados.length === 0 || productos.length === 0}
            title={empleados.length === 0 || productos.length === 0 ? 'Necesitas empleados y productos creados para asignar tareas' : undefined}
            onClick={() => setFormAbierto(true)}
          >
            + Asignar tarea
          </button>
          {(empleados.length === 0 || productos.length === 0) && (
            <span className="muted small">Necesitas empleados y productos creados para asignar tareas.</span>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="card">
        <label className="small">Buscar</label>
        <input
          type="text"
          placeholder="🔎 Buscar empleado, producto, proceso o comentario"
          value={filtroBuscar}
          onChange={(e) => setFiltroBuscar(e.target.value)}
        />

        <div className="row" style={{ marginTop: 10 }}>
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

        <div className="row" style={{ marginTop: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="small">Desde</label>
            <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="small">Hasta</label>
            <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} />
          </div>
          <button
            className="btn-secondary"
            onClick={() => { setFiltroBuscar(''); setFiltroEmpleado(''); setFiltroCargo(''); setFiltroEstado(''); setFiltroDesde(''); setFiltroHasta('') }}
          >
            Limpiar
          </button>
        </div>
      </div>

      {/* Lista de tareas */}
      <div className="card">
        <h3>Tareas ({tareasFiltradas.length})</h3>
        {tareasFiltradas.length === 0 && (
          <Vacio icono="📋" titulo="No hay tareas para mostrar">
            Asigna una tarea o cambia los filtros.
          </Vacio>
        )}

        {tareasFiltradas.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Inicio</th>
                  <th>Empleado</th>
                  <th>Producto — Proceso</th>
                  <th className="num">Cantidad</th>
                  <th style={{ minWidth: 140 }}>Progreso</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {tareasPagina.map((t) => (
                  <tr key={t.id} className="chip-clicable" onClick={() => setTareaDetalleId(t.id)}>
                    <td className="muted small">{formatFecha(t.creado)}</td>
                    <td><strong>{nombreEmpleado(t.empleadoId)}</strong></td>
                    <td>{t.productoNombre} — {t.procesoNombre}</td>
                    <td className="num">{t.cantidad}</td>
                    <td><BarraProgreso valor={t.progreso} /></td>
                    <td>
                      <span className={`chip ${t.estado === 'terminada' ? 'ok' : t.estado === 'pagada' ? '' : 'warn'}`}>
                        {ESTADO_LABEL[t.estado] || t.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tareasFiltradas.length > 0 && (
          <div className="actions" style={{ marginTop: 10 }}>
            <button
              className="btn-secondary btn-sm"
              disabled={pagina === 1}
              onClick={() => setPagina(pagina - 1)}
            >
              ⬅ Anterior
            </button>
            <span className="muted small">Página {pagina} de {totalPaginas}</span>
            <button
              className="btn-secondary btn-sm"
              disabled={pagina === totalPaginas}
              onClick={() => setPagina(pagina + 1)}
            >
              Siguiente ➡
            </button>
          </div>
        )}
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
              <div style={{ flex: 1 }}>
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
            </div>

            <p className="muted small" style={{ marginTop: 12, marginBottom: 4 }}>
              Trabajos a asignar (puedes agregar varios productos/procesos para el mismo empleado)
            </p>
            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Proceso</th>
                    <th className="num">Cantidad</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {nuevosItems.map((it) => {
                    const producto = productos.find((p) => String(p.id) === String(it.productoId))
                    return (
                      <tr key={it.key}>
                        <td>
                          <select value={it.productoId} onChange={(e) => setNuevoItemField(it.key, 'productoId', e.target.value)}>
                            <option value="">— Producto —</option>
                            {productos.map((p) => (
                              <option key={p.id} value={p.id}>{p.nombre}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            value={it.procesoId}
                            disabled={!producto}
                            onChange={(e) => setNuevoItemField(it.key, 'procesoId', e.target.value)}
                          >
                            <option value="">— Proceso —</option>
                            {producto?.procesos.map((p) => (
                              <option key={p.id} value={p.id}>{p.nombre} ({formatCOP(p.pago)})</option>
                            ))}
                          </select>
                        </td>
                        <td className="num">
                          <input
                            type="number" min="0" step="any" placeholder="0"
                            value={it.cantidad}
                            onChange={(e) => setNuevoItemField(it.key, 'cantidad', e.target.value)}
                          />
                        </td>
                        <td>
                          <button className="btn-icon danger" title="Quitar" aria-label="Quitar" onClick={() => removeNuevoItemRow(it.key)}>✕</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <button className="btn-secondary" onClick={addNuevoItemRow}>+ Agregar trabajo</button>

            <div style={{ marginTop: 10 }}>
              <label>Comentario (opcional)</label>
              <input
                type="text" placeholder="Ej: entrega para el viernes"
                value={nuevaComentario}
                onChange={(e) => setNuevaComentario(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
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

      {/* Modal: detalle de una tarea (progreso, comentario, historial y fotos) */}
      {tareaDetalle && (
        <>
          <div className="overlay" onClick={cerrarDetalleTarea} />
          <div className="modal modal-lg">
            <h3>{nombreEmpleado(tareaDetalle.empleadoId)}</h3>
            <p className="muted small" style={{ marginTop: 0 }}>
              {tareaDetalle.productoNombre} — {tareaDetalle.procesoNombre} · Inicio: {formatFecha(tareaDetalle.creado)}
            </p>
            {renderDetalleTarea(tareaDetalle)}
            <div className="form-actions">
              <button className="btn-secondary" onClick={cerrarDetalleTarea}>Cerrar</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

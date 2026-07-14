import { useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP, formatFecha } from '../utils/format.js'
import { notify, confirmar } from '../utils/notify.js'
import Vacio from '../components/Vacio.jsx'

const emptyEmp = { nombre: '', cedula: '', telefono: '', cargo: '' }

const hoy = () => new Date().toISOString().slice(0, 10)
const emptyHerramienta = () => ({ herramienta: '', cantidad: '1', fechaEntrega: hoy(), estado: 'buen_estado', comentario: '' })

// Estados posibles de una herramienta entregada
const ESTADO_HERRAMIENTA_LABEL = {
  buen_estado: 'Buen estado',
  danada: 'Dañada',
  perdida: 'Perdida',
  devuelta: 'Devuelta',
}
const ESTADO_HERRAMIENTA_CHIP = {
  buen_estado: 'ok',
  danada: 'warn',
  perdida: 'danger',
  devuelta: '',
}

export default function Empleados() {
  const {
    empleados, addEmpleado, updateEmpleado, deleteEmpleado, prestamosDeEmpleado,
    getHerramientasEmpleado, addHerramienta, updateHerramienta, deleteHerramienta,
  } = useData()
  const { puede } = useAuth()
  const puedeCrear = puede('empleados', 'crear')
  const puedeEditar = puede('empleados', 'editar')
  const puedeEliminar = puede('empleados', 'eliminar')
  const [form, setForm] = useState(emptyEmp)
  const [formAbierto, setFormAbierto] = useState(false)
  const [editId, setEditId] = useState(null)
  const [busqueda, setBusqueda] = useState('')

  // --- Herramientas entregadas ---
  const [herramientasEmpleadoId, setHerramientasEmpleadoId] = useState(null) // empleado con el modal abierto
  const [herramientas, setHerramientas] = useState([])
  const [herrForm, setHerrForm] = useState(emptyHerramienta())
  const [herrFormAbierto, setHerrFormAbierto] = useState(false)
  const [herrEditId, setHerrEditId] = useState(null)
  const [guardandoHerr, setGuardandoHerr] = useState(false)

  const setField = (field, val) => setForm((f) => ({ ...f, [field]: val }))
  const resetForm = () => {
    setForm(emptyEmp)
    setEditId(null)
    setFormAbierto(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) { notify.error('Escribe el nombre del empleado'); return }

    const editando = Boolean(editId)
    const ok = await confirmar(
      editando
        ? `¿Guardar los cambios de "${form.nombre.trim()}"?`
        : `¿Agregar a "${form.nombre.trim()}" como empleado?`,
      { titulo: editando ? 'Guardar empleado' : 'Agregar empleado', textoOk: editando ? 'Sí, guardar' : 'Sí, agregar', peligro: false }
    )
    if (!ok) return

    try {
      if (editando) {
        await updateEmpleado(editId, form)
        notify.ok('Empleado actualizado')
      } else {
        await addEmpleado(form)
        notify.ok('Empleado agregado')
      }
      resetForm()
    } catch (err) {
      notify.error('Error al guardar el empleado: ' + err.message)
    }
  }

  const startEdit = (emp) => {
    setEditId(emp.id)
    setForm({
      nombre: emp.nombre || '',
      cedula: emp.cedula || '',
      telefono: emp.telefono || '',
      cargo: emp.cargo || '',
    })
    setFormAbierto(true)
  }

  // --- Herramientas entregadas ---
  const setHerrField = (field, val) => setHerrForm((f) => ({ ...f, [field]: val }))
  const resetHerrForm = () => {
    setHerrForm(emptyHerramienta())
    setHerrEditId(null)
    setHerrFormAbierto(false)
  }

  const abrirHerramientas = async (emp) => {
    try {
      const h = await getHerramientasEmpleado(emp.id)
      setHerramientas(h)
      setHerramientasEmpleadoId(emp.id)
    } catch (err) {
      notify.error('Error al cargar las herramientas: ' + err.message)
    }
  }
  const cerrarHerramientas = () => {
    setHerramientasEmpleadoId(null)
    setHerramientas([])
    resetHerrForm()
  }

  const recargarHerramientas = async () => {
    const h = await getHerramientasEmpleado(herramientasEmpleadoId)
    setHerramientas(h)
  }

  const startEditHerramienta = (h) => {
    setHerrEditId(h.id)
    setHerrForm({
      herramienta: h.herramienta,
      cantidad: String(h.cantidad),
      fechaEntrega: h.fechaEntrega ? h.fechaEntrega.slice(0, 10) : hoy(),
      estado: h.estado,
      comentario: h.comentario || '',
    })
    setHerrFormAbierto(true)
  }

  const handleSubmitHerramienta = async (e) => {
    e.preventDefault()
    if (!herrForm.herramienta.trim()) { notify.error('Escribe el nombre de la herramienta'); return }
    if (!(Number(herrForm.cantidad) > 0)) { notify.error('Ingresa una cantidad válida'); return }

    setGuardandoHerr(true)
    try {
      if (herrEditId) {
        await updateHerramienta(herrEditId, herrForm)
        notify.ok('Herramienta actualizada')
      } else {
        await addHerramienta(herramientasEmpleadoId, herrForm)
        notify.ok('Entrega registrada')
      }
      await recargarHerramientas()
      resetHerrForm()
    } catch (err) {
      notify.error('Error al guardar: ' + err.message)
    } finally {
      setGuardandoHerr(false)
    }
  }

  const handleEliminarHerramienta = async (h) => {
    if (!(await confirmar(`¿Eliminar el registro de "${h.herramienta}"?`))) return
    try {
      await deleteHerramienta(h.id)
      await recargarHerramientas()
    } catch (err) {
      notify.error('Error al eliminar: ' + err.message)
    }
  }

  const empleadoHerramientas = empleados.find((e) => e.id === herramientasEmpleadoId)

  const q = busqueda.trim().toLowerCase()
  const empleadosFiltrados = q
    ? empleados.filter((e) =>
        [e.nombre, e.cargo, e.cedula, e.telefono]
          .some((v) => (v || '').toLowerCase().includes(q))
      )
    : empleados

  return (
    <div>
      <h2>👷 Empleados</h2>

      {puedeCrear && (
        <div className="form-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => { setForm(emptyEmp); setEditId(null); setFormAbierto(true) }}
          >
            + Nuevo empleado
          </button>
        </div>
      )}

      <div className="card">
        <h3>Empleados registrados ({empleados.length})</h3>

        {empleados.length > 0 && (
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="🔎 Buscar por nombre, cargo, cédula o teléfono…"
            style={{ marginBottom: 12 }}
          />
        )}

        {empleados.length === 0 && (
          <Vacio icono="👷" titulo="Aún no hay empleados">
            Crea el primero con el botón "+ Nuevo empleado".
          </Vacio>
        )}
        {empleados.length > 0 && empleadosFiltrados.length === 0 && (
          <p className="muted">Ningún empleado coincide con la búsqueda.</p>
        )}
        {empleadosFiltrados.map((emp) => {
          const prestamos = prestamosDeEmpleado(emp.id)
          const saldoAdelanto = prestamos.reduce((s, p) => s + p.saldo, 0)
          return (
            <div key={emp.id} className="list-item">
              <div>
                <strong>{emp.nombre}</strong>
                <div className="muted small">
                  {emp.cargo && <>{emp.cargo} · </>}
                  {emp.cedula && <>C.C. {emp.cedula} · </>}
                  {emp.telefono}
                </div>
                {prestamos.length > 0 && (
                  <span className="chip warn">
                    {prestamos.length} préstamo(s) · Saldo adelanto: {formatCOP(saldoAdelanto)}
                  </span>
                )}
              </div>
              <div className="actions">
                <button className="btn-secondary" onClick={() => abrirHerramientas(emp)}>🔧 Herramientas</button>
                {puedeEditar && (
                  <button className="btn-secondary" onClick={() => startEdit(emp)}>Editar</button>
                )}
                {puedeEliminar && (
                  <button
                    className="btn-danger"
                    onClick={async () => {
                      if (await confirmar(`¿Eliminar a "${emp.nombre}"?`)) deleteEmpleado(emp.id)
                    }}
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {formAbierto && (
        <>
          <div className="overlay" onClick={resetForm} />
          <div className="modal">
            <h3>{editId ? 'Editar empleado' : 'Nuevo empleado'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="row">
                <div style={{ flex: 2 }}>
                  <label>Nombre completo</label>
                  <input value={form.nombre} onChange={(e) => setField('nombre', e.target.value)} placeholder="Ej: Juan Pérez" />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Cédula</label>
                  <input value={form.cedula} onChange={(e) => setField('cedula', e.target.value)} placeholder="C.C." />
                </div>
              </div>
              <div className="row">
                <div style={{ flex: 1 }}>
                  <label>Teléfono</label>
                  <input value={form.telefono} onChange={(e) => setField('telefono', e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Cargo</label>
                  <input value={form.cargo} onChange={(e) => setField('cargo', e.target.value)} placeholder="Ej: Ebanista" />
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn-primary">
                  {editId ? 'Guardar cambios' : 'Agregar empleado'}
                </button>
                <button type="button" className="btn-secondary" onClick={resetForm}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Modal: herramientas entregadas al empleado */}
      {herramientasEmpleadoId && (
        <>
          <div className="overlay" onClick={cerrarHerramientas} />
          <div className="modal">
            <h3>🔧 Herramientas de {empleadoHerramientas?.nombre || 'empleado'}</h3>

            {puedeCrear && (
              <div className="form-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => { setHerrForm(emptyHerramienta()); setHerrEditId(null); setHerrFormAbierto(true) }}
                >
                  + Nueva entrega
                </button>
              </div>
            )}

            {herramientas.length === 0 && <p className="muted">Aún no se le han entregado herramientas.</p>}
            {herramientas.length > 0 && (
              <div className="table-wrap">
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Herramienta</th>
                      <th className="num">Cantidad</th>
                      <th>Estado</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {herramientas.map((h) => (
                      <tr key={h.id}>
                        <td>{formatFecha(h.fechaEntrega)}</td>
                        <td>
                          {h.herramienta}
                          {h.comentario && <div className="muted small">💬 {h.comentario}</div>}
                        </td>
                        <td className="num">{h.cantidad}</td>
                        <td>
                          <span className={`chip ${ESTADO_HERRAMIENTA_CHIP[h.estado] || ''}`}>
                            {ESTADO_HERRAMIENTA_LABEL[h.estado] || h.estado}
                          </span>
                        </td>
                        <td>
                          <div className="actions" style={{ justifyContent: 'flex-end' }}>
                            {puedeEditar && (
                              <button className="btn-secondary btn-sm" onClick={() => startEditHerramienta(h)}>
                                Editar
                              </button>
                            )}
                            {puedeEliminar && (
                              <button className="btn-danger btn-sm" onClick={() => handleEliminarHerramienta(h)}>
                                Eliminar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="form-actions">
              <button className="btn-secondary" onClick={cerrarHerramientas}>Cerrar</button>
            </div>
          </div>
        </>
      )}

      {/* Modal: registrar/editar entrega de herramienta */}
      {herrFormAbierto && (
        <>
          <div className="overlay" onClick={resetHerrForm} />
          <div className="modal">
            <h3>{herrEditId ? 'Editar entrega' : 'Nueva entrega de herramienta'}</h3>
            <form onSubmit={handleSubmitHerramienta}>
              <div className="row">
                <div style={{ flex: 2 }}>
                  <label>Herramienta</label>
                  <input
                    value={herrForm.herramienta}
                    onChange={(e) => setHerrField('herramienta', e.target.value)}
                    placeholder="Ej: Taladro, martillo, caladora"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Cantidad</label>
                  <input
                    type="number" min="0" step="any"
                    value={herrForm.cantidad}
                    onChange={(e) => setHerrField('cantidad', e.target.value)}
                  />
                </div>
              </div>
              <div className="row">
                <div style={{ flex: 1 }}>
                  <label>Fecha de entrega</label>
                  <input
                    type="date"
                    value={herrForm.fechaEntrega}
                    onChange={(e) => setHerrField('fechaEntrega', e.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Estado</label>
                  <select value={herrForm.estado} onChange={(e) => setHerrField('estado', e.target.value)}>
                    {Object.entries(ESTADO_HERRAMIENTA_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label>Comentario (opcional)</label>
              <input
                value={herrForm.comentario}
                onChange={(e) => setHerrField('comentario', e.target.value)}
                placeholder="Ej: se entregó con el mango rayado"
              />

              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={guardandoHerr}>
                  {guardandoHerr ? 'Guardando…' : herrEditId ? 'Guardar cambios' : 'Registrar entrega'}
                </button>
                <button type="button" className="btn-secondary" onClick={resetHerrForm}>
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

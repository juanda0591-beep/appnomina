import { useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP } from '../utils/format.js'
import { notify, confirmar } from '../utils/notify.js'

const emptyEmp = { nombre: '', cedula: '', telefono: '', cargo: '' }

export default function Empleados() {
  const { empleados, addEmpleado, updateEmpleado, deleteEmpleado, prestamosDeEmpleado } = useData()
  const { puede } = useAuth()
  const puedeCrear = puede('empleados', 'crear')
  const puedeEditar = puede('empleados', 'editar')
  const puedeEliminar = puede('empleados', 'eliminar')
  const [form, setForm] = useState(emptyEmp)
  const [editId, setEditId] = useState(null)

  const setField = (field, val) => setForm((f) => ({ ...f, [field]: val }))
  const resetForm = () => {
    setForm(emptyEmp)
    setEditId(null)
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
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div>
      <h2>👷 Empleados</h2>

      {(puedeCrear || (editId && puedeEditar)) && (
      <form className="card" onSubmit={handleSubmit}>
        <h3>{editId ? 'Editar empleado' : 'Nuevo empleado'}</h3>
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
          {editId && (
            <button type="button" className="btn-secondary" onClick={resetForm}>
              Cancelar
            </button>
          )}
        </div>
      </form>
      )}

      <div className="card">
        <h3>Empleados registrados ({empleados.length})</h3>
        {empleados.length === 0 && <p className="muted">Aún no hay empleados.</p>}
        {empleados.map((emp) => {
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
    </div>
  )
}

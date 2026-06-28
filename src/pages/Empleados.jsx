import { useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { formatCOP } from '../utils/format.js'

const emptyEmp = { nombre: '', cedula: '', telefono: '', cargo: '' }

export default function Empleados() {
  const { empleados, addEmpleado, updateEmpleado, deleteEmpleado, prestamosDeEmpleado } = useData()
  const [form, setForm] = useState(emptyEmp)
  const [editId, setEditId] = useState(null)

  const setField = (field, val) => setForm((f) => ({ ...f, [field]: val }))
  const resetForm = () => {
    setForm(emptyEmp)
    setEditId(null)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) return alert('Escribe el nombre del empleado')
    if (editId) updateEmpleado(editId, form)
    else addEmpleado(form)
    resetForm()
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
                <button className="btn-secondary" onClick={() => startEdit(emp)}>Editar</button>
                <button
                  className="btn-danger"
                  onClick={() => {
                    if (confirm(`¿Eliminar a "${emp.nombre}"?`)) deleteEmpleado(emp.id)
                  }}
                >
                  Eliminar
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

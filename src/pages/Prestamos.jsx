import { useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP, formatFecha } from '../utils/format.js'

export default function Prestamos() {
  const { empleados, prestamos, addPrestamo, deletePrestamo, getEmpleado } = useData()
  const { puede } = useAuth()
  const puedeCrear = puede('prestamos', 'crear')
  const puedeEliminar = puede('prestamos', 'eliminar')

  const hoy = new Date().toISOString().slice(0, 10)
  const [empleadoId, setEmpleadoId] = useState('')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(hoy)
  const [descripcion, setDescripcion] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!empleadoId) return alert('Selecciona un empleado')
    if (!(Number(monto) > 0)) return alert('Ingresa un monto válido')
    addPrestamo({ empleadoId, monto, fecha, descripcion })
    setMonto('')
    setDescripcion('')
  }

  const totalPrestado = prestamos.reduce((s, p) => s + p.monto, 0)
  const totalSaldo = prestamos.reduce((s, p) => s + p.saldo, 0)

  return (
    <div>
      <h2>💵 Préstamos</h2>
      <p className="muted">
        Registra los préstamos. El saldo se va descontando automáticamente cuando
        aplicas un descuento en el pago de nómina.
      </p>

      {puedeCrear && (
      <form className="card" onSubmit={handleSubmit}>
        <h3>Nuevo préstamo</h3>
        <div className="row">
          <div style={{ flex: 2 }}>
            <label>Empleado</label>
            <select value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)}>
              <option value="">— Seleccionar —</option>
              {empleados.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>Monto prestado</label>
            <input type="number" min="0" step="any" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>
        <label>Descripción (opcional)</label>
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej: Adelanto quincena" />

        <div className="form-actions">
          <button type="submit" className="btn-primary">Registrar préstamo</button>
        </div>
        {empleados.length === 0 && (
          <p className="muted small">Primero agrega empleados en la sección Empleados.</p>
        )}
      </form>
      )}

      <div className="card">
        <h3>Préstamos registrados</h3>
        <div className="totals-row">
          <span>Total prestado: <strong>{formatCOP(totalPrestado)}</strong></span>
          <span>Saldo pendiente: <strong className="danger-text">{formatCOP(totalSaldo)}</strong></span>
        </div>
        {prestamos.length === 0 && <p className="muted">Aún no hay préstamos.</p>}
        {prestamos.length > 0 && (
          <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Fecha</th>
                <th>Descripción</th>
                <th className="num">Monto</th>
                <th className="num">Saldo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {prestamos.map((p) => {
                const emp = getEmpleado(p.empleado_id)
                return (
                  <tr key={p.id} className={p.saldo === 0 ? 'paid' : ''}>
                    <td>{emp ? emp.nombre : '— (empleado eliminado)'}</td>
                    <td>{formatFecha(p.fecha)}</td>
                    <td>{p.descripcion || '—'}</td>
                    <td className="num">{formatCOP(p.monto)}</td>
                    <td className="num">{p.saldo === 0 ? '✅ Pagado' : formatCOP(p.saldo)}</td>
                    <td>
                      {puedeEliminar && (
                        <button
                          className="btn-icon danger"
                          title="Eliminar"
                          onClick={() => {
                            if (confirm('¿Eliminar este préstamo?')) deletePrestamo(p.id)
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}

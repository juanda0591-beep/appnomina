import { useState } from 'react'
import { useLocalData } from '../hooks/useLocalData.js'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP, formatFecha, hoyISO } from '../utils/format.js'
import { notify, confirmar, confirmarAnulacion } from '../utils/notify.js'
import Vacio from '../components/Vacio.jsx'

export default function Prestamos() {
  // Carga local de datos
  const { data: empleados, cargando: cargandoEmpleados } = useLocalData('/empleados')
  const { data: prestamos, cargando: cargandoPrestamos, recargar: recargarPrestamos } = useLocalData('/prestamos')

  // Funciones de mutación del context
  const { addPrestamo, abonarPrestamo, deletePrestamo } = useData()

  // Helper local
  const getEmpleado = (id) => empleados?.find((e) => String(e.id) === String(id))

  const { puede } = useAuth()
  const puedeCrear = puede('prestamos', 'crear')
  const puedeEliminar = puede('prestamos', 'eliminar')

  const hoy = hoyISO()
  const [formAbierto, setFormAbierto] = useState(false)
  const [empleadoId, setEmpleadoId] = useState('')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(hoy)
  const [descripcion, setDescripcion] = useState('')

  // Estado para el formulario de abono
  const [abonoAbierto, setAbonoAbierto] = useState(null) // guarda el préstamo seleccionado
  const [montoAbono, setMontoAbono] = useState('')
  const [fechaAbono, setFechaAbono] = useState(hoy)
  const [descripcionAbono, setDescripcionAbono] = useState('')

  const resetForm = () => {
    setEmpleadoId('')
    setMonto('')
    setFecha(hoy)
    setDescripcion('')
    setFormAbierto(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!empleadoId) { notify.error('Selecciona un empleado'); return }
    if (!(Number(monto) > 0)) { notify.error('Ingresa un monto válido'); return }
    const emp = getEmpleado(empleadoId)
    const ok = await confirmar(
      `Vas a registrar un préstamo de ${formatCOP(Number(monto))} a ${emp?.nombre || 'el empleado'}. ¿Confirmar?`,
      { titulo: 'Confirmar préstamo', textoOk: 'Sí, registrar', peligro: false }
    )
    if (!ok) return
    await addPrestamo({ empleadoId, monto, fecha, descripcion })
    await recargarPrestamos()
    resetForm()
  }

  const abrirFormularioAbono = (prestamo) => {
    setAbonoAbierto(prestamo)
    setMontoAbono('')
    setFechaAbono(hoy)
    setDescripcionAbono('')
  }

  const cerrarFormularioAbono = () => {
    setAbonoAbierto(null)
    setMontoAbono('')
    setFechaAbono(hoy)
    setDescripcionAbono('')
  }

  const handleAbonar = async (e) => {
    e.preventDefault()
    if (!abonoAbierto) return
    const m = Number(montoAbono)
    if (!(m > 0)) { notify.error('Ingresa un monto válido'); return }
    if (m > abonoAbierto.saldo) {
      notify.error(`El abono no puede ser mayor al saldo (${formatCOP(abonoAbierto.saldo)})`)
      return
    }
    const emp = getEmpleado(abonoAbierto.empleado_id)
    const ok = await confirmar(
      `¿Registrar un abono de ${formatCOP(m)} al préstamo de ${emp?.nombre || 'el empleado'}?\n\nSaldo actual: ${formatCOP(abonoAbierto.saldo)}\nSaldo después del abono: ${formatCOP(abonoAbierto.saldo - m)}`,
      { titulo: 'Confirmar abono', textoOk: 'Sí, abonar', peligro: false }
    )
    if (!ok) return
    try {
      await abonarPrestamo(abonoAbierto.id, { monto: m, fecha: fechaAbono, descripcion: descripcionAbono })
      await recargarPrestamos()
      notify.ok('Abono registrado exitosamente')
      cerrarFormularioAbono()
    } catch (e) {
      notify.error(e.message)
    }
  }

  const cargando = cargandoEmpleados || cargandoPrestamos

  if (cargando) {
    return (
      <div>
        <h2>💵 Préstamos</h2>
        <div className="banner">Cargando préstamos...</div>
      </div>
    )
  }

  const totalPrestado = prestamos.reduce((s, p) => s + p.monto, 0)
  const totalSaldo = prestamos.reduce((s, p) => s + p.saldo, 0)

  return (
    <div>
      <h2>💵 Préstamos</h2>
      <p className="muted">
        Registra los préstamos. Puedes abonarlos directamente con el botón 💰 o descontarlos
        automáticamente cuando aplicas un descuento en el pago de nómina.
      </p>

      {puedeCrear && (
        <div className="form-actions">
          <button type="button" className="btn-primary" onClick={() => setFormAbierto(true)}>
            + Nuevo préstamo
          </button>
        </div>
      )}

      <div className="card">
        <h3>Préstamos registrados</h3>
        <div className="totals-row">
          <span>Total prestado: <strong>{formatCOP(totalPrestado)}</strong></span>
          <span>Saldo pendiente: <strong className="danger-text">{formatCOP(totalSaldo)}</strong></span>
        </div>
        {prestamos.length === 0 && (
          <Vacio icono="💵" titulo="Aún no hay préstamos">
            Registra un adelanto o préstamo con "+ Nuevo préstamo".
          </Vacio>
        )}
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
                      {puedeCrear && p.saldo > 0 && (
                        <button
                          className="btn-icon"
                          title="Abonar"
                          aria-label="Abonar"
                          onClick={() => abrirFormularioAbono(p)}
                        >
                          💰
                        </button>
                      )}
                      {puedeEliminar && (
                        <button
                          className="btn-icon danger"
                          title="Eliminar"
                          aria-label="Eliminar"
                          onClick={async () => {
                            const motivo = await confirmarAnulacion('Se eliminará el préstamo y su gasto en caja.')
                            if (!motivo) return
                            try {
                              await deletePrestamo(p.id, motivo)
                              await recargarPrestamos()
                            }
                            catch (e) { notify.error(e.message) }
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

      {formAbierto && (
        <>
          <div className="overlay" onClick={resetForm} />
          <div className="modal">
            <h3>Nuevo préstamo</h3>
            <form onSubmit={handleSubmit}>
              <div className="row">
                <div style={{ flex: 2 }}>
                  <label>Empleado</label>
                  <select value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)}>
                    <option value="">— Seleccionar —</option>
                    {empleados.filter((emp) => emp.activo).map((emp) => (
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

              {empleados.length === 0 && (
                <p className="muted small">Primero agrega empleados en la sección Empleados.</p>
              )}

              <div className="form-actions">
                <button type="submit" className="btn-primary">Registrar préstamo</button>
                <button type="button" className="btn-secondary" onClick={resetForm}>Cancelar</button>
              </div>
            </form>
          </div>
        </>
      )}

      {abonoAbierto && (
        <>
          <div className="overlay" onClick={cerrarFormularioAbono} />
          <div className="modal">
            <h3>Abonar a préstamo</h3>
            <div className="banner" style={{ marginBottom: 16 }}>
              <strong>Empleado:</strong> {getEmpleado(abonoAbierto.empleado_id)?.nombre || '— (empleado eliminado)'}<br />
              <strong>Préstamo original:</strong> {formatCOP(abonoAbierto.monto)}<br />
              <strong>Saldo pendiente:</strong> {formatCOP(abonoAbierto.saldo)}
            </div>
            <form onSubmit={handleAbonar}>
              <div className="row">
                <div style={{ flex: 1 }}>
                  <label>Monto del abono</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={montoAbono}
                    onChange={(e) => setMontoAbono(e.target.value)}
                    placeholder={`Máximo: ${formatCOP(abonoAbierto.saldo)}`}
                    autoFocus
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Fecha</label>
                  <input type="date" value={fechaAbono} onChange={(e) => setFechaAbono(e.target.value)} />
                </div>
              </div>
              <label>Descripción (opcional)</label>
              <input value={descripcionAbono} onChange={(e) => setDescripcionAbono(e.target.value)} placeholder="Ej: Abono voluntario" />

              <div className="form-actions">
                <button type="submit" className="btn-primary">Registrar abono</button>
                <button type="button" className="btn-secondary" onClick={cerrarFormularioAbono}>Cancelar</button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}

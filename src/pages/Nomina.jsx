import { useMemo, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { formatCOP } from '../utils/format.js'
import { generarPdfNomina } from '../utils/pdf.js'

const nuevoItem = () => ({ key: Math.random().toString(36).slice(2), productoId: '', procesoId: '', cantidad: '' })

export default function Nomina() {
  const { empleados, productos, empresa, prestamosDeEmpleado, getEmpleado, getProducto, addNomina, tareasTerminadasDeEmpleado, getTareaFotos } = useData()

  const hoy = new Date().toISOString().slice(0, 10)
  const [empleadoId, setEmpleadoId] = useState('')
  const [fecha, setFecha] = useState(hoy)
  const [items, setItems] = useState([nuevoItem()])
  const [descuentos, setDescuentos] = useState({}) // { prestamoId: monto }
  const [extraMonto, setExtraMonto] = useState('')
  const [extraDetalle, setExtraDetalle] = useState('')
  const [descTrabajoMonto, setDescTrabajoMonto] = useState('')
  const [descTrabajoDetalle, setDescTrabajoDetalle] = useState('')
  const [comentario, setComentario] = useState('')
  const [tareaIds, setTareaIds] = useState([]) // tareas terminadas incluidas en este pago
  const [modalTareas, setModalTareas] = useState(null) // tareas candidatas a cargar, o null
  const [fotosTareas, setFotosTareas] = useState([]) // fotos (con imagen) de las tareas cargadas, para el PDF

  const prestamos = empleadoId ? prestamosDeEmpleado(empleadoId) : []

  const setItemField = (key, field, val) => {
    setItems((its) =>
      its.map((it) => {
        if (it.key !== key) return it
        const next = { ...it, [field]: val }
        // si cambia el producto, reiniciar el proceso
        if (field === 'productoId') next.procesoId = ''
        return next
      })
    )
  }

  const addItemRow = () => setItems((its) => [...its, nuevoItem()])
  const removeItemRow = (key) =>
    setItems((its) => (its.length === 1 ? its : its.filter((it) => it.key !== key)))

  // Al elegir un empleado: si tiene tareas terminadas sin pagar, ofrecer cargarlas
  const handleEmpleadoChange = (id) => {
    setEmpleadoId(id)
    setDescuentos({})
    setTareaIds([])
    setFotosTareas([])
    const terminadas = id ? tareasTerminadasDeEmpleado(id) : []
    if (terminadas.length > 0) setModalTareas(terminadas)
    else setModalTareas(null)
  }

  // Convierte una tarea terminada en una fila de item (buscando el producto/proceso vigente)
  const tareaAItem = (t) => {
    const producto = getProducto(t.productoId)
    const proceso = producto?.procesos.find((p) => String(p.id) === String(t.procesoId))
    return {
      key: Math.random().toString(36).slice(2),
      // si el producto/proceso siguen existiendo, se enlazan; si no, quedan vacíos
      productoId: producto ? String(t.productoId) : '',
      procesoId: producto && proceso ? String(t.procesoId) : '',
      cantidad: String(t.cantidad),
    }
  }

  // Confirma el modal: carga las tareas terminadas como filas de trabajo
  const confirmarCargarTareas = async () => {
    if (!modalTareas) return
    const filas = modalTareas.map(tareaAItem)
    // reemplaza las filas vacías iniciales; si ya hay trabajos, los conserva
    setItems((its) => {
      const conDatos = its.filter((it) => it.productoId || it.procesoId || it.cantidad)
      return [...conDatos, ...filas]
    })
    setTareaIds(modalTareas.map((t) => t.id))

    // Trae las fotos (con imagen) de todas las tareas cargadas, para incluirlas en el PDF
    try {
      const listas = await Promise.all(modalTareas.map((t) => getTareaFotos(t.id, true)))
      setFotosTareas(listas.flat())
    } catch {
      setFotosTareas([]) // si fallan las fotos, el pago sigue sin ellas
    }

    setModalTareas(null)
  }

  // Calcula cada línea con su valor
  const lineas = useMemo(() => {
    return items.map((it) => {
      const producto = getProducto(it.productoId)
      const proceso = producto?.procesos.find((p) => String(p.id) === String(it.procesoId))
      const pago = proceso?.pago || 0
      const cantidad = Number(it.cantidad) || 0
      return {
        ...it,
        productoNombre: producto?.nombre || '',
        procesoNombre: proceso?.nombre || '',
        pago,
        cantidad,
        subtotal: pago * cantidad,
      }
    })
  }, [items, productos])

  const subtotal = lineas.reduce((s, l) => s + l.subtotal, 0)

  const totalDescuentos = useMemo(() => {
    return prestamos.reduce((s, p) => {
      const m = Number(descuentos[p.id]) || 0
      return s + Math.min(m, p.saldo)
    }, 0)
  }, [descuentos, prestamos])

  const extra = Math.max(0, Number(extraMonto) || 0)
  const descuentoTrabajo = Math.max(0, Number(descTrabajoMonto) || 0)

  const total = subtotal - totalDescuentos + extra - descuentoTrabajo

  const setDescuento = (prestamoId, monto, saldo) => {
    const val = Math.max(0, Math.min(Number(monto) || 0, saldo))
    setDescuentos((d) => ({ ...d, [prestamoId]: monto === '' ? '' : val }))
  }

  const resetForm = () => {
    setEmpleadoId('')
    setItems([nuevoItem()])
    setDescuentos({})
    setExtraMonto('')
    setExtraDetalle('')
    setDescTrabajoMonto('')
    setDescTrabajoDetalle('')
    setComentario('')
    setFecha(hoy)
    setTareaIds([])
    setModalTareas(null)
    setFotosTareas([])
  }

  const construirPayload = () => {
    const empleado = getEmpleado(empleadoId)
    const itemsValidos = lineas
      .filter((l) => l.productoId && l.procesoId && l.cantidad > 0)
      .map((l) => ({
        productoId: l.productoId,
        productoNombre: l.productoNombre,
        procesoId: l.procesoId,
        procesoNombre: l.procesoNombre,
        cantidad: l.cantidad,
        pago: l.pago,
        subtotal: l.subtotal,
      }))

    const descuentosArr = prestamos
      .map((p) => {
        const m = Math.min(Number(descuentos[p.id]) || 0, p.saldo)
        return m > 0
          ? { prestamoId: p.id, monto: m, descripcion: p.descripcion || 'Préstamo' }
          : null
      })
      .filter(Boolean)

    // Estado de los préstamos del empleado (para mostrar el saldo en el PDF)
    const prestamosEmpleado = prestamos.map((p) => {
      const descontado = Math.min(Number(descuentos[p.id]) || 0, p.saldo)
      return {
        descripcion: p.descripcion || 'Préstamo',
        saldoAnterior: p.saldo,
        descontado,
        saldoNuevo: p.saldo - descontado,
      }
    })

    return {
      empleado,
      empleadoId,
      fecha,
      comentario,
      tareaIds,
      fotos: fotosTareas,
      items: itemsValidos,
      descuentos: descuentosArr,
      prestamosEmpleado,
      extra,
      extraDetalle: extra > 0 ? extraDetalle.trim() : '',
      descuentoTrabajo,
      descuentoTrabajoDetalle: descuentoTrabajo > 0 ? descTrabajoDetalle.trim() : '',
      subtotal: itemsValidos.reduce((s, i) => s + i.subtotal, 0),
      totalDescuentos: descuentosArr.reduce((s, d) => s + d.monto, 0),
    }
  }

  const validar = (payload) => {
    if (!empleadoId) {
      alert('Selecciona un empleado')
      return false
    }
    if (payload.items.length === 0) {
      alert('Agrega al menos un trabajo (producto, proceso y cantidad)')
      return false
    }
    return true
  }

  const [guardando, setGuardando] = useState(false)

  const handlePagar = async () => {
    const payload = construirPayload()
    if (!validar(payload)) return
    const total = payload.subtotal - payload.totalDescuentos + payload.extra - payload.descuentoTrabajo
    setGuardando(true)
    try {
      await addNomina({ ...payload, empleado: undefined, fotos: undefined, total }) // no enviamos copia del empleado ni las fotos (solo van al PDF)
      generarPdfNomina({ ...payload, empresa, total })
      alert('✅ Pago registrado y PDF generado')
      resetForm()
    } catch (e) {
      alert('Error al registrar el pago: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  const handleVistaPrevia = () => {
    const payload = construirPayload()
    if (!validar(payload)) return
    generarPdfNomina({ ...payload, empresa, total: payload.subtotal - payload.totalDescuentos + payload.extra - payload.descuentoTrabajo })
  }

  return (
    <div>
      <h2>🧾 Pago de Nómina</h2>

      <div className="card">
        <div className="row">
          <div style={{ flex: 2 }}>
            <label>Empleado</label>
            <select
              value={empleadoId}
              onChange={(e) => handleEmpleadoChange(e.target.value)}
            >
              <option value="">— Seleccionar —</option>
              {empleados.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>
        {empleados.length === 0 && (
          <p className="muted small">Primero agrega empleados y productos.</p>
        )}
      </div>

      {/* Trabajos realizados */}
      <div className="card">
        <h3>Trabajos realizados</h3>
        <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: '28%' }}>Producto</th>
              <th style={{ width: '28%' }}>Proceso</th>
              <th style={{ width: '14%' }} className="num">Cantidad</th>
              <th style={{ width: '14%' }} className="num">Pago x und</th>
              <th style={{ width: '14%' }} className="num">Subtotal</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const producto = getProducto(it.productoId)
              const linea = lineas.find((l) => l.key === it.key)
              return (
                <tr key={it.key}>
                  <td>
                    <select value={it.productoId} onChange={(e) => setItemField(it.key, 'productoId', e.target.value)}>
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
                      onChange={(e) => setItemField(it.key, 'procesoId', e.target.value)}
                    >
                      <option value="">— Proceso —</option>
                      {producto?.procesos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} ({formatCOP(p.pago)})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={it.cantidad}
                      onChange={(e) => setItemField(it.key, 'cantidad', e.target.value)}
                      placeholder="0"
                    />
                  </td>
                  <td className="num">{formatCOP(linea?.pago || 0)}</td>
                  <td className="num"><strong>{formatCOP(linea?.subtotal || 0)}</strong></td>
                  <td>
                    <button className="btn-icon danger" onClick={() => removeItemRow(it.key)}>✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
        <button className="btn-secondary" onClick={addItemRow}>+ Agregar trabajo</button>
        <div className="totals-row" style={{ marginTop: 12 }}>
          <span>Subtotal trabajos: <strong>{formatCOP(subtotal)}</strong></span>
        </div>
      </div>

      {/* Descuentos de préstamos */}
      <div className="card">
        <h3>Descuentos de préstamos</h3>
        {!empleadoId && <p className="muted">Selecciona un empleado para ver sus préstamos.</p>}
        {empleadoId && prestamos.length === 0 && (
          <p className="muted">Este empleado no tiene préstamos pendientes. 🎉</p>
        )}
        {prestamos.map((p) => (
          <div className="row prestamo-row" key={p.id}>
            <div style={{ flex: 2 }}>
              <strong>{p.descripcion || 'Préstamo'}</strong>
              <div className="muted small">Saldo: {formatCOP(p.saldo)}</div>
            </div>
            <div style={{ flex: 1 }}>
              <label className="small">A descontar</label>
              <input
                type="number"
                min="0"
                max={p.saldo}
                step="any"
                value={descuentos[p.id] ?? ''}
                onChange={(e) => setDescuento(p.id, e.target.value, p.saldo)}
                placeholder="0"
              />
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setDescuento(p.id, p.saldo, p.saldo)}
            >
              Todo
            </button>
          </div>
        ))}
        {prestamos.length > 0 && (
          <div className="totals-row" style={{ marginTop: 12 }}>
            <span>Total descuentos: <strong className="danger-text">-{formatCOP(totalDescuentos)}</strong></span>
          </div>
        )}
      </div>

      {/* Pago extra (opcional) */}
      <div className="card">
        <h3>Pago extra (opcional)</h3>
        <div className="row">
          <div style={{ flex: 1 }}>
            <label className="small">Valor</label>
            <input
              type="number"
              min="0"
              step="any"
              value={extraMonto}
              onChange={(e) => setExtraMonto(e.target.value)}
              placeholder="0"
            />
          </div>
          <div style={{ flex: 2 }}>
            <label className="small">Detalle del pago extra</label>
            <input
              type="text"
              value={extraDetalle}
              onChange={(e) => setExtraDetalle(e.target.value)}
              placeholder="Ej: bonificación, horas extra…"
            />
          </div>
        </div>
        {extra > 0 && (
          <div className="totals-row" style={{ marginTop: 12 }}>
            <span>Pago extra: <strong>+{formatCOP(extra)}</strong></span>
          </div>
        )}
      </div>

      {/* Descuento por trabajo incompleto (opcional) */}
      <div className="card">
        <h3>Descuento por trabajo (opcional)</h3>
        <div className="row">
          <div style={{ flex: 1 }}>
            <label className="small">Valor</label>
            <input
              type="number"
              min="0"
              step="any"
              value={descTrabajoMonto}
              onChange={(e) => setDescTrabajoMonto(e.target.value)}
              placeholder="0"
            />
          </div>
          <div style={{ flex: 2 }}>
            <label className="small">Motivo del descuento</label>
            <input
              type="text"
              value={descTrabajoDetalle}
              onChange={(e) => setDescTrabajoDetalle(e.target.value)}
              placeholder="Ej: trabajo incompleto, faltó terminar…"
            />
          </div>
        </div>
        {descuentoTrabajo > 0 && (
          <div className="totals-row" style={{ marginTop: 12 }}>
            <span>Descuento por trabajo: <strong className="danger-text">-{formatCOP(descuentoTrabajo)}</strong></span>
          </div>
        )}
      </div>

      {/* Comentario / observaciones */}
      <div className="card">
        <h3>Comentario (opcional)</h3>
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Observaciones que aparecerán en el PDF"
          rows={3}
          style={{ width: '100%' }}
        />
      </div>

      {/* Resumen y acciones */}
      <div className="card resumen">
        <div className="resumen-line"><span>Subtotal trabajos</span><span>{formatCOP(subtotal)}</span></div>
        <div className="resumen-line"><span>Descuentos préstamos</span><span className="danger-text">-{formatCOP(totalDescuentos)}</span></div>
        {extra > 0 && (
          <div className="resumen-line"><span>Pago extra{extraDetalle.trim() ? ` (${extraDetalle.trim()})` : ''}</span><span>+{formatCOP(extra)}</span></div>
        )}
        {descuentoTrabajo > 0 && (
          <div className="resumen-line"><span>Descuento por trabajo{descTrabajoDetalle.trim() ? ` (${descTrabajoDetalle.trim()})` : ''}</span><span className="danger-text">-{formatCOP(descuentoTrabajo)}</span></div>
        )}
        <div className="resumen-line total"><span>TOTAL A PAGAR</span><span>{formatCOP(total)}</span></div>

        <div className="form-actions">
          <button className="btn-primary" onClick={handlePagar} disabled={guardando}>
            {guardando ? 'Guardando…' : '💾 Pagar y generar PDF'}
          </button>
          <button className="btn-secondary" onClick={handleVistaPrevia}>👁️ Solo ver PDF</button>
        </div>
        <p className="muted small">
          "Pagar y generar PDF" guarda el pago en el historial y descuenta los saldos de
          los préstamos. "Solo ver PDF" genera el documento sin guardar nada.
        </p>
      </div>

      {/* Modal: tareas terminadas del empleado */}
      {modalTareas && (
        <>
          <div className="overlay" onClick={() => setModalTareas(null)} />
          <div className="modal">
            <h3>Tareas terminadas de {getEmpleado(empleadoId)?.nombre || 'este empleado'}</h3>
            <p className="muted">¿Desea agregar estos productos para pago de nómina?</p>
            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Proceso</th>
                    <th className="num">Cantidad</th>
                    <th className="num">Pago x und</th>
                    <th className="num">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {modalTareas.map((t) => (
                    <tr key={t.id}>
                      <td>{t.productoNombre}</td>
                      <td>{t.procesoNombre}</td>
                      <td className="num">{t.cantidad}</td>
                      <td className="num">{formatCOP(t.pago)}</td>
                      <td className="num">{formatCOP(t.pago * t.cantidad)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-actions">
              <button className="btn-primary" onClick={confirmarCargarTareas}>✓ Confirmar</button>
              <button className="btn-secondary" onClick={() => setModalTareas(null)}>Cancelar</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

import { useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP, formatFecha } from '../utils/format.js'
import { notify, confirmar } from '../utils/notify.js'
import Vacio from '../components/Vacio.jsx'

// Catálogo fijo de unidades de medida para materiales
export const UNIDADES = [
  'unidad', 'lámina', 'metro', 'metro cuadrado', 'kg', 'gramo',
  'litro', 'mililitro', 'onza', 'caja', 'rollo', 'par',
]

const emptyForm = { nombre: '', unidad: UNIDADES[0], costoUnitario: '', stockInicial: '', stockMinimo: '' }
const emptyEntrada = { cantidad: '', costoUnitario: '', descripcion: '' }

export default function Materiales() {
  const {
    materiales, addMaterial, updateMaterial, deleteMaterial,
    registrarEntradaMaterial, getMaterialMovimientos,
  } = useData()
  const { puede } = useAuth()
  const puedeCrear = puede('materiales', 'crear')
  const puedeEditar = puede('materiales', 'editar')
  const puedeEliminar = puede('materiales', 'eliminar')

  const [form, setForm] = useState(emptyForm)
  const [formAbierto, setFormAbierto] = useState(false)
  const [editId, setEditId] = useState(null)
  const [buscar, setBuscar] = useState('')

  const [entradaId, setEntradaId] = useState(null)
  const [entrada, setEntrada] = useState(emptyEntrada)

  const [historialId, setHistorialId] = useState(null)
  const [historial, setHistorial] = useState([])

  const setField = (field, val) => setForm((f) => ({ ...f, [field]: val }))
  const resetForm = () => {
    setForm(emptyForm)
    setEditId(null)
    setFormAbierto(false)
  }

  const stockBajo = (mat) => mat.stock <= mat.stockMinimo

  const materialesFiltrados = materiales.filter((mat) =>
    mat.nombre.toLowerCase().includes(buscar.trim().toLowerCase())
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) { notify.error('Escribe el nombre del material'); return }
    if (!form.unidad) { notify.error('Selecciona una unidad'); return }

    const editando = Boolean(editId)
    const ok = await confirmar(
      editando
        ? `¿Guardar los cambios de "${form.nombre.trim()}"?`
        : `¿Crear el material "${form.nombre.trim()}"?`,
      { titulo: editando ? 'Guardar material' : 'Crear material', textoOk: editando ? 'Sí, guardar' : 'Sí, crear', peligro: false }
    )
    if (!ok) return

    try {
      if (editando) {
        await updateMaterial(editId, {
          nombre: form.nombre,
          unidad: form.unidad,
          costoUnitario: Number(form.costoUnitario) || 0,
          stockMinimo: Number(form.stockMinimo) || 0,
        })
        notify.ok('Material actualizado')
      } else {
        await addMaterial({
          nombre: form.nombre,
          unidad: form.unidad,
          costoUnitario: Number(form.costoUnitario) || 0,
          stockInicial: Number(form.stockInicial) || 0,
          stockMinimo: Number(form.stockMinimo) || 0,
        })
        notify.ok('Material creado')
      }
      resetForm()
    } catch (err) {
      notify.error('Error al guardar el material: ' + err.message)
    }
  }

  const startEdit = (mat) => {
    setEditId(mat.id)
    setForm({
      nombre: mat.nombre,
      unidad: mat.unidad,
      costoUnitario: String(mat.costoUnitario),
      stockInicial: '',
      stockMinimo: String(mat.stockMinimo),
    })
    setFormAbierto(true)
  }

  const startEntrada = (mat) => {
    setEntradaId(mat.id)
    setEntrada({ cantidad: '', costoUnitario: String(mat.costoUnitario), descripcion: '' })
  }
  const cancelEntrada = () => {
    setEntradaId(null)
    setEntrada(emptyEntrada)
  }

  const submitEntrada = async (mat) => {
    const cant = Number(entrada.cantidad)
    if (!cant || cant <= 0) { notify.error('Ingresa una cantidad válida'); return }

    const ok = await confirmar(
      `¿Registrar entrada de ${cant} ${mat.unidad} para "${mat.nombre}"?`,
      { titulo: 'Registrar entrada', textoOk: 'Sí, registrar', peligro: false }
    )
    if (!ok) return

    try {
      await registrarEntradaMaterial(mat.id, {
        cantidad: cant,
        costoUnitario: Number(entrada.costoUnitario) || 0,
        descripcion: entrada.descripcion,
      })
      notify.ok('Entrada registrada')
      cancelEntrada()
    } catch (err) {
      notify.error('Error al registrar la entrada: ' + err.message)
    }
  }

  const abrirHistorial = async (mat) => {
    try {
      const mov = await getMaterialMovimientos(mat.id)
      setHistorial(mov)
      setHistorialId(mat.id)
    } catch (err) {
      notify.error('Error al cargar el historial: ' + err.message)
    }
  }
  const cerrarHistorial = () => {
    setHistorialId(null)
    setHistorial([])
  }
  const materialHistorial = materiales.find((m) => m.id === historialId)
  const materialEntrada = materiales.find((m) => m.id === entradaId)

  return (
    <div>
      <h2>🧱 Materiales</h2>
      <p className="muted">
        Registra los materiales que se consumen en fabricación (ej: láminas de MDF, puntillas,
        colbón) y su stock disponible.
      </p>

      {puedeCrear && (
        <div className="form-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => { setForm(emptyForm); setEditId(null); setFormAbierto(true) }}
          >
            + Nuevo material
          </button>
        </div>
      )}

      <div className="card">
        <h3>Materiales registrados ({materialesFiltrados.length})</h3>

        <input
          type="text"
          placeholder="🔎 Buscar material"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          style={{ marginBottom: 14 }}
        />

        {materiales.length === 0 && (
          <Vacio icono="🧱" titulo="Aún no hay materiales">
            Registra el primero para llevar el inventario.
          </Vacio>
        )}
        {materiales.length > 0 && materialesFiltrados.length === 0 && (
          <p className="muted">Ningún material coincide con la búsqueda.</p>
        )}

        {materialesFiltrados.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Unidad</th>
                  <th className="num">Stock</th>
                  <th className="num">Stock mínimo</th>
                  <th className="num">Costo unitario</th>
                  <th className="num">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {materialesFiltrados.map((mat) => (
                  <tr key={mat.id} className={stockBajo(mat) ? 'fila-alerta' : ''}>
                    <td><strong>{mat.nombre}</strong></td>
                    <td>{mat.unidad}</td>
                    <td className="num">
                      {mat.stock}
                      {stockBajo(mat) && <span className="chip warn" style={{ marginLeft: 8 }}>⚠️ Bajo</span>}
                    </td>
                    <td className="num">{mat.stockMinimo}</td>
                    <td className="num">{formatCOP(mat.costoUnitario)}</td>
                    <td className="num">
                      <div className="actions" style={{ justifyContent: 'flex-end' }}>
                        {puedeCrear && (
                          <button className="btn-secondary btn-sm" onClick={() => startEntrada(mat)}>
                            + Entrada
                          </button>
                        )}
                        {puedeEditar && (
                          <button className="btn-secondary btn-sm" onClick={() => startEdit(mat)}>
                            Editar
                          </button>
                        )}
                        {puedeEliminar && (
                          <button
                            className="btn-danger btn-sm"
                            onClick={async () => {
                              if (await confirmar(`¿Eliminar "${mat.nombre}"?`)) deleteMaterial(mat.id)
                            }}
                          >
                            Eliminar
                          </button>
                        )}
                        <button className="btn-secondary btn-sm" onClick={() => abrirHistorial(mat)}>
                          Historial
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: historial de movimientos del material */}
      {historialId && (
        <>
          <div className="overlay" onClick={cerrarHistorial} />
          <div className="modal">
            <h3>Historial de {materialHistorial?.nombre || 'material'}</h3>
            {historial.length === 0 && <p className="muted">Sin movimientos aún.</p>}
            {historial.length > 0 && (
              <div className="table-wrap">
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th className="num">Cantidad</th>
                      <th className="num">Costo unitario</th>
                      <th>Descripción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.map((h) => {
                      const claseTipo = h.tipo === 'salida' ? 'texto-salida' : h.tipo === 'entrada' ? 'texto-entrada' : ''
                      const icono = h.tipo === 'salida' ? '🔻' : h.tipo === 'entrada' ? '🔺' : ''
                      return (
                        <tr key={h.id}>
                          <td>{formatFecha(h.fecha)}</td>
                          <td className={claseTipo}>{icono} {h.tipo}</td>
                          <td className={`num ${claseTipo}`}>{h.tipo === 'salida' ? '-' : '+'}{h.cantidad}</td>
                          <td className="num">{formatCOP(h.costoUnitario)}</td>
                          <td>{h.descripcion}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="form-actions">
              <button className="btn-secondary" onClick={cerrarHistorial}>Cerrar</button>
            </div>
          </div>
        </>
      )}

      {/* Modal: crear/editar material */}
      {formAbierto && (
        <>
          <div className="overlay" onClick={resetForm} />
          <div className="modal">
            <h3>{editId ? 'Editar material' : 'Nuevo material'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="row">
                <div style={{ flex: 2 }}>
                  <label>Nombre del material</label>
                  <input
                    value={form.nombre}
                    onChange={(e) => setField('nombre', e.target.value)}
                    placeholder="Ej: Lámina MDF 15mm"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Unidad</label>
                  <select value={form.unidad} onChange={(e) => setField('unidad', e.target.value)}>
                    {UNIDADES.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="row">
                <div style={{ flex: 1 }}>
                  <label>Costo unitario</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={form.costoUnitario}
                    onChange={(e) => setField('costoUnitario', e.target.value)}
                    placeholder="Costo por unidad"
                  />
                </div>
                {!editId && (
                  <div style={{ flex: 1 }}>
                    <label>Stock inicial</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={form.stockInicial}
                      onChange={(e) => setField('stockInicial', e.target.value)}
                      placeholder="Cantidad inicial (opcional)"
                    />
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <label>Stock mínimo</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={form.stockMinimo}
                    onChange={(e) => setField('stockMinimo', e.target.value)}
                    placeholder="Alerta si el stock baja de aquí"
                  />
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn-primary">
                  {editId ? 'Guardar cambios' : 'Crear material'}
                </button>
                <button type="button" className="btn-secondary" onClick={resetForm}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Modal: registrar entrada de stock */}
      {entradaId && (
        <>
          <div className="overlay" onClick={cancelEntrada} />
          <div className="modal">
            <h3>Registrar entrada de {materialEntrada?.nombre || 'material'}</h3>
            <div className="row">
              <div style={{ flex: 1 }}>
                <label>Cantidad ({materialEntrada?.unidad})</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={entrada.cantidad}
                  onChange={(e) => setEntrada((f) => ({ ...f, cantidad: e.target.value }))}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label>Costo unitario</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={entrada.costoUnitario}
                  onChange={(e) => setEntrada((f) => ({ ...f, costoUnitario: e.target.value }))}
                />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label>Descripción</label>
              <input
                value={entrada.descripcion}
                onChange={(e) => setEntrada((f) => ({ ...f, descripcion: e.target.value }))}
                placeholder="Ej: Compra a proveedor X"
                style={{ width: '100%' }}
              />
            </div>
            <div className="form-actions">
              <button type="button" className="btn-primary" onClick={() => submitEntrada(materialEntrada)}>
                Registrar
              </button>
              <button type="button" className="btn-secondary" onClick={cancelEntrada}>
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

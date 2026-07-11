import { Fragment, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP } from '../utils/format.js'
import { notify, confirmar } from '../utils/notify.js'

const NUEVO_PROCESO = '__nuevo__'
const emptyProceso = () => ({ nombre: '', pago: '', materiales: [] })
const emptyRecetaFila = () => ({ materialId: '', cantidad: '' })

export default function Productos() {
  const { productos, procesosGlobales, materiales, addProducto, updateProducto, deleteProducto, addProcesoGlobal } = useData()
  const { puede } = useAuth()
  const puedeCrear = puede('productos', 'crear')
  const puedeEditar = puede('productos', 'editar')
  const puedeEliminar = puede('productos', 'eliminar')

  const [nombre, setNombre] = useState('')
  const [procesos, setProcesos] = useState([emptyProceso()])
  const [editId, setEditId] = useState(null)
  const [formAbierto, setFormAbierto] = useState(false)

  // Fila que está creando un proceso nuevo en el catálogo global (índice o null)
  const [filaNuevoProceso, setFilaNuevoProceso] = useState(null)
  const [nombreNuevoProceso, setNombreNuevoProceso] = useState('')

  // Chip de proceso expandido en la tabla de productos registrados (id de proceso o null)
  const [procesoAbierto, setProcesoAbierto] = useState(null)

  const resetForm = () => {
    setNombre('')
    setProcesos([emptyProceso()])
    setEditId(null)
    setFilaNuevoProceso(null)
    setNombreNuevoProceso('')
    setFormAbierto(false)
  }

  const setProcesoField = (i, field, val) => {
    setProcesos((ps) => ps.map((p, idx) => (idx === i ? { ...p, [field]: val } : p)))
  }

  const addProcesoRow = () => setProcesos((ps) => [...ps, emptyProceso()])
  const removeProcesoRow = (i) => {
    setProcesos((ps) => (ps.length === 1 ? ps : ps.filter((_, idx) => idx !== i)))
    if (filaNuevoProceso === i) {
      setFilaNuevoProceso(null)
      setNombreNuevoProceso('')
    }
  }

  const handleSelectProceso = (i, val) => {
    if (val === NUEVO_PROCESO) {
      setFilaNuevoProceso(i)
      setNombreNuevoProceso('')
      return
    }
    setProcesoField(i, 'nombre', val)
  }

  const guardarNuevoProceso = async (i) => {
    if (!nombreNuevoProceso.trim()) { notify.error('Escribe el nombre del proceso'); return }
    try {
      const creado = await addProcesoGlobal(nombreNuevoProceso)
      setProcesoField(i, 'nombre', creado.nombre)
      setFilaNuevoProceso(null)
      setNombreNuevoProceso('')
      notify.ok('Proceso agregado al catálogo')
    } catch (err) {
      notify.error('Error al crear el proceso: ' + err.message)
    }
  }

  const cancelarNuevoProceso = () => {
    setFilaNuevoProceso(null)
    setNombreNuevoProceso('')
  }

  // ---------- Receta de materiales por proceso (dentro del formulario) ----------
  const setRecetaFila = (procesoIdx, filaIdx, field, val) => {
    setProcesos((ps) =>
      ps.map((p, idx) => {
        if (idx !== procesoIdx) return p
        const nuevasMateriales = p.materiales.map((m, mi) => (mi === filaIdx ? { ...m, [field]: val } : m))
        return { ...p, materiales: nuevasMateriales }
      })
    )
  }
  const addRecetaFila = (procesoIdx) => {
    setProcesos((ps) =>
      ps.map((p, idx) => (idx === procesoIdx ? { ...p, materiales: [...p.materiales, emptyRecetaFila()] } : p))
    )
  }
  const removeRecetaFila = (procesoIdx, filaIdx) => {
    setProcesos((ps) =>
      ps.map((p, idx) =>
        idx === procesoIdx ? { ...p, materiales: p.materiales.filter((_, mi) => mi !== filaIdx) } : p
      )
    )
  }
  const unidadDeMaterial = (materialId) => materiales.find((m) => String(m.id) === String(materialId))?.unidad || ''

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!nombre.trim()) { notify.error('Escribe el nombre del producto'); return }
    const validos = procesos
      .filter((p) => p.nombre.trim())
      .map((p) => ({
        ...p,
        materiales: p.materiales.filter((m) => m.materialId && Number(m.cantidad) > 0),
      }))
    if (validos.length === 0) { notify.error('Agrega al menos un proceso'); return }

    const editando = Boolean(editId)
    const ok = await confirmar(
      editando
        ? `¿Guardar los cambios de "${nombre.trim()}"?`
        : `¿Crear el producto "${nombre.trim()}" con ${validos.length} proceso(s)?`,
      { titulo: editando ? 'Guardar producto' : 'Crear producto', textoOk: editando ? 'Sí, guardar' : 'Sí, crear', peligro: false }
    )
    if (!ok) return

    try {
      if (editando) {
        await updateProducto(editId, nombre, validos)
        notify.ok('Producto actualizado')
      } else {
        await addProducto(nombre, validos)
        notify.ok('Producto creado')
      }
      resetForm()
    } catch (err) {
      notify.error('Error al guardar el producto: ' + err.message)
    }
  }

  const startEdit = (prod) => {
    setEditId(prod.id)
    setNombre(prod.nombre)
    setProcesos(
      prod.procesos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        pago: p.pago,
        materiales: (p.materiales || []).map((m) => ({ materialId: String(m.materialId), cantidad: String(m.cantidad) })),
      }))
    )
    setFilaNuevoProceso(null)
    setNombreNuevoProceso('')
    setFormAbierto(true)
  }

  // Opciones del desplegable: catálogo global + (por robustez) el nombre actual
  // de la fila si por algún motivo no está en el catálogo, para no perder el dato.
  const opcionesProceso = (nombreActual) => {
    const nombres = procesosGlobales.map((p) => p.nombre)
    if (nombreActual && !nombres.some((n) => n.toLowerCase() === nombreActual.toLowerCase())) {
      nombres.push(nombreActual)
    }
    return [...nombres].sort((a, b) => a.localeCompare(b))
  }

  const materialesOrdenados = [...materiales].sort((a, b) => a.nombre.localeCompare(b.nombre))

  return (
    <div>
      <h2>📦 Productos y procesos</h2>
      <p className="muted">
        Define cada producto (ej: "Armario 3 cuerpos") y los procesos que se le hacen
        (ej: pintura $5, armado $8). El pago es por unidad realizada. Si el proceso consume
        materiales (ej: corte gasta 1 lámina de MDF), agrégalos ahí mismo.
      </p>

      {puedeCrear && (
        <div className="form-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => { resetForm(); setFormAbierto(true) }}
          >
            + Nuevo producto
          </button>
        </div>
      )}

      {formAbierto && (puedeCrear || (editId && puedeEditar)) && (
      <>
      <div className="overlay" onClick={resetForm} />
      <form className="card modal" onSubmit={handleSubmit}>
        <h3>{editId ? 'Editar producto' : 'Nuevo producto'}</h3>
        <label>Nombre del producto</label>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Armario 3 cuerpos"
        />

        <label>Procesos</label>
        {procesos.map((p, i) => (
          <div className="proceso-block" key={i}>
            {filaNuevoProceso === i ? (
              <div className="row">
                <input
                  style={{ flex: 2 }}
                  autoFocus
                  value={nombreNuevoProceso}
                  onChange={(e) => setNombreNuevoProceso(e.target.value)}
                  placeholder="Nombre del proceso nuevo (ej: Tapizado)"
                />
                <button type="button" className="btn-primary" onClick={() => guardarNuevoProceso(i)}>
                  Guardar
                </button>
                <button type="button" className="btn-secondary" onClick={cancelarNuevoProceso}>
                  Cancelar
                </button>
              </div>
            ) : (
              <>
                <div className="row">
                  <select
                    style={{ flex: 2 }}
                    value={p.nombre}
                    onChange={(e) => handleSelectProceso(i, e.target.value)}
                  >
                    <option value="">— Selecciona un proceso —</option>
                    {opcionesProceso(p.nombre).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                    <option value={NUEVO_PROCESO}>+ Agregar proceso nuevo…</option>
                  </select>
                  <input
                    style={{ flex: 1 }}
                    type="number"
                    min="0"
                    step="any"
                    value={p.pago}
                    onChange={(e) => setProcesoField(i, 'pago', e.target.value)}
                    placeholder="Pago x unidad"
                  />
                  <button type="button" className="btn-icon danger" onClick={() => removeProcesoRow(i)}>
                    ✕
                  </button>
                </div>

                <div className="receta-materiales">
                  <span className="muted small">Materiales que consume este proceso</span>
                  {p.materiales.map((m, mi) => (
                    <div className="row" key={mi}>
                      <select
                        style={{ flex: 2 }}
                        value={m.materialId}
                        onChange={(e) => setRecetaFila(i, mi, 'materialId', e.target.value)}
                      >
                        <option value="">— Material —</option>
                        {materialesOrdenados.map((mat) => (
                          <option key={mat.id} value={mat.id}>{mat.nombre}</option>
                        ))}
                      </select>
                      <input
                        style={{ flex: 1 }}
                        type="number"
                        min="0"
                        step="any"
                        value={m.cantidad}
                        onChange={(e) => setRecetaFila(i, mi, 'cantidad', e.target.value)}
                        placeholder="Cantidad"
                      />
                      <span className="muted small" style={{ flex: 1 }}>{unidadDeMaterial(m.materialId)}</span>
                      <button type="button" className="btn-icon danger" onClick={() => removeRecetaFila(i, mi)}>
                        ✕
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn-secondary" onClick={() => addRecetaFila(i)}>
                    + Agregar material
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        <button type="button" className="btn-secondary" onClick={addProcesoRow}>
          + Agregar proceso
        </button>

        <div className="form-actions">
          <button type="submit" className="btn-primary">
            {editId ? 'Guardar cambios' : 'Crear producto'}
          </button>
          <button type="button" className="btn-secondary" onClick={resetForm}>
            Cancelar
          </button>
        </div>
      </form>
      </>
      )}

      <div className="card">
        <h3>Productos registrados ({productos.length})</h3>
        {productos.length === 0 && <p className="muted">Aún no hay productos.</p>}

        {productos.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Procesos</th>
                  <th className="num">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((prod) => (
                  <Fragment key={prod.id}>
                    <tr>
                      <td>
                        <strong>{prod.nombre}</strong>
                      </td>
                      <td>
                        <div className="chips">
                          {prod.procesos.map((p) => (
                            <span
                              className="chip chip-clicable"
                              key={p.id}
                              onClick={() => setProcesoAbierto((actual) => (actual === p.id ? null : p.id))}
                            >
                              {p.nombre}: {formatCOP(p.pago)} {procesoAbierto === p.id ? '▾' : '▸'}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="num">
                        <div className="actions" style={{ justifyContent: 'flex-end' }}>
                          {puedeEditar && (
                            <button className="btn-secondary" onClick={() => startEdit(prod)}>
                              Editar
                            </button>
                          )}
                          {puedeEliminar && (
                            <button
                              className="btn-danger"
                              onClick={async () => {
                                if (await confirmar(`¿Eliminar "${prod.nombre}"?`)) deleteProducto(prod.id)
                              }}
                            >
                              Eliminar
                            </button>
                          )}
                          {!puedeEditar && !puedeEliminar && <span className="muted small">—</span>}
                        </div>
                      </td>
                    </tr>

                    {prod.procesos
                      .filter((p) => p.id === procesoAbierto)
                      .map((p) => (
                        <tr key={`receta-${p.id}`}>
                          <td colSpan={3}>
                            <strong>Materiales de "{p.nombre}"</strong>
                            {(!p.materiales || p.materiales.length === 0) && (
                              <p className="muted small">Sin receta de materiales.</p>
                            )}
                            {p.materiales && p.materiales.length > 0 && (
                              <div className="chips">
                                {p.materiales.map((m) => (
                                  <span className="chip" key={m.id}>
                                    {m.materialNombre}: {m.cantidad} {m.unidad}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

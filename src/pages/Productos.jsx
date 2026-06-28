import { useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { formatCOP } from '../utils/format.js'

const emptyProceso = () => ({ nombre: '', pago: '' })

export default function Productos() {
  const { productos, addProducto, updateProducto, deleteProducto } = useData()

  const [nombre, setNombre] = useState('')
  const [procesos, setProcesos] = useState([emptyProceso()])
  const [editId, setEditId] = useState(null)

  const resetForm = () => {
    setNombre('')
    setProcesos([emptyProceso()])
    setEditId(null)
  }

  const setProcesoField = (i, field, val) => {
    setProcesos((ps) => ps.map((p, idx) => (idx === i ? { ...p, [field]: val } : p)))
  }

  const addProcesoRow = () => setProcesos((ps) => [...ps, emptyProceso()])
  const removeProcesoRow = (i) =>
    setProcesos((ps) => (ps.length === 1 ? ps : ps.filter((_, idx) => idx !== i)))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!nombre.trim()) return alert('Escribe el nombre del producto')
    const validos = procesos.filter((p) => p.nombre.trim())
    if (validos.length === 0) return alert('Agrega al menos un proceso')

    if (editId) {
      updateProducto(editId, nombre, validos)
    } else {
      addProducto(nombre, validos)
    }
    resetForm()
  }

  const startEdit = (prod) => {
    setEditId(prod.id)
    setNombre(prod.nombre)
    setProcesos(prod.procesos.map((p) => ({ id: p.id, nombre: p.nombre, pago: p.pago })))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div>
      <h2>📦 Productos y procesos</h2>
      <p className="muted">
        Define cada producto (ej: "Armario 3 cuerpos") y los procesos que se le hacen
        (ej: pintura $5, armado $8). El pago es por unidad realizada.
      </p>

      <form className="card" onSubmit={handleSubmit}>
        <h3>{editId ? 'Editar producto' : 'Nuevo producto'}</h3>
        <label>Nombre del producto</label>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Armario 3 cuerpos"
        />

        <label>Procesos</label>
        {procesos.map((p, i) => (
          <div className="row" key={i}>
            <input
              style={{ flex: 2 }}
              value={p.nombre}
              onChange={(e) => setProcesoField(i, 'nombre', e.target.value)}
              placeholder="Proceso (ej: Pintura)"
            />
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
        ))}
        <button type="button" className="btn-secondary" onClick={addProcesoRow}>
          + Agregar proceso
        </button>

        <div className="form-actions">
          <button type="submit" className="btn-primary">
            {editId ? 'Guardar cambios' : 'Crear producto'}
          </button>
          {editId && (
            <button type="button" className="btn-secondary" onClick={resetForm}>
              Cancelar
            </button>
          )}
        </div>
      </form>

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
                  <tr key={prod.id}>
                    <td>
                      <strong>{prod.nombre}</strong>
                    </td>
                    <td>
                      <div className="chips">
                        {prod.procesos.map((p) => (
                          <span className="chip" key={p.id}>
                            {p.nombre}: {formatCOP(p.pago)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="num">
                      <div className="actions" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn-secondary" onClick={() => startEdit(prod)}>
                          Editar
                        </button>
                        <button
                          className="btn-danger"
                          onClick={() => {
                            if (confirm(`¿Eliminar "${prod.nombre}"?`)) deleteProducto(prod.id)
                          }}
                        >
                          Eliminar
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
    </div>
  )
}

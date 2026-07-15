import { useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { notify, confirmar } from '../utils/notify.js'
import Vacio from '../components/Vacio.jsx'

const emptyForm = { nombre: '', hex: '#333333' }

export default function Colores() {
  const { colores, materiales, productos, addColor, updateColor, deleteColor } = useData()
  const { puede } = useAuth()
  const puedeCrear = puede('colores', 'crear')
  const puedeEditar = puede('colores', 'editar')
  const puedeEliminar = puede('colores', 'eliminar')

  const [form, setForm] = useState(emptyForm)
  const [formAbierto, setFormAbierto] = useState(false)
  const [editId, setEditId] = useState(null)

  const setField = (campo, val) => setForm((f) => ({ ...f, [campo]: val }))
  const resetForm = () => { setForm(emptyForm); setEditId(null); setFormAbierto(false) }

  // Cuántos materiales / variantes usan cada color (para avisar antes de borrar)
  const usoColor = (colorId) => {
    const mats = materiales.filter((m) => m.colorId === colorId).length
    const vars = productos.reduce((n, p) => n + (p.variantes || []).filter((v) => v.colorId === colorId).length, 0)
    return { mats, vars }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) { notify.error('Escribe el nombre del color'); return }
    try {
      if (editId) {
        await updateColor(editId, { nombre: form.nombre, hex: form.hex, activo: true })
        notify.ok('Color actualizado')
      } else {
        await addColor({ nombre: form.nombre, hex: form.hex })
        notify.ok('Color creado')
      }
      resetForm()
    } catch (err) {
      notify.error('Error al guardar: ' + err.message)
    }
  }

  const startEdit = (c) => {
    setEditId(c.id)
    setForm({ nombre: c.nombre, hex: c.hex || '#333333' })
    setFormAbierto(true)
  }

  const handleEliminar = async (c) => {
    const { mats, vars } = usoColor(c.id)
    const aviso = (mats || vars)
      ? `\n\nEste color está en uso: ${mats} material(es) y ${vars} variante(s) de producto. Al borrarlo, esos quedarán sin color.`
      : ''
    if (!(await confirmar(`¿Eliminar el color "${c.nombre}"?${aviso}`))) return
    try {
      await deleteColor(c.id)
      notify.ok('Color eliminado')
    } catch (err) {
      notify.error('Error: ' + err.message)
    }
  }

  return (
    <div>
      <h2>🎨 Colores</h2>
      <p className="muted small">
        Catálogo de colores del taller. Se usan para las variantes de producto (armario negro,
        blanco…) y para marcar materiales por color (vinilo negro, laca blanca).
      </p>

      {puedeCrear && (
        <div className="form-actions">
          <button type="button" className="btn-primary" onClick={() => { resetForm(); setFormAbierto(true) }}>
            + Nuevo color
          </button>
        </div>
      )}

      <div className="card">
        <h3>Colores ({colores.length})</h3>
        {colores.length === 0 && (
          <Vacio icono="🎨" titulo="Aún no hay colores">
            Crea el primero (por ejemplo Negro y Blanco) con el botón "+ Nuevo color".
          </Vacio>
        )}
        {colores.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Color</th>
                  <th>Nombre</th>
                  <th className="num">Materiales</th>
                  <th className="num">Variantes</th>
                  <th className="num">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {colores.map((c) => {
                  const { mats, vars } = usoColor(c.id)
                  return (
                    <tr key={c.id}>
                      <td>
                        <span style={{
                          display: 'inline-block', width: 22, height: 22, borderRadius: 6,
                          background: c.hex || '#ccc', border: '1px solid #d1d5db', verticalAlign: 'middle',
                        }} />
                      </td>
                      <td><strong>{c.nombre}</strong></td>
                      <td className="num">{mats || <span className="muted">—</span>}</td>
                      <td className="num">{vars || <span className="muted">—</span>}</td>
                      <td className="num">
                        <div className="actions" style={{ justifyContent: 'flex-end' }}>
                          {puedeEditar && <button className="btn-secondary btn-sm" onClick={() => startEdit(c)}>Editar</button>}
                          {puedeEliminar && <button className="btn-danger btn-sm" onClick={() => handleEliminar(c)}>Eliminar</button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formAbierto && (puedeCrear || (editId && puedeEditar)) && (
        <>
          <div className="overlay" onClick={resetForm} />
          <form className="modal" onSubmit={handleSubmit}>
            <h3>{editId ? 'Editar color' : 'Nuevo color'}</h3>
            <label>Nombre</label>
            <input value={form.nombre} onChange={(e) => setField('nombre', e.target.value)} placeholder="Ej: Negro" autoFocus />
            <label>Muestra de color</label>
            <div className="row" style={{ alignItems: 'center', gap: 12 }}>
              <input type="color" value={form.hex} onChange={(e) => setField('hex', e.target.value)} style={{ width: 60, height: 40, padding: 2 }} />
              <input value={form.hex} onChange={(e) => setField('hex', e.target.value)} placeholder="#000000" style={{ flex: 1 }} />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">{editId ? 'Guardar cambios' : 'Crear color'}</button>
              <button type="button" className="btn-secondary" onClick={resetForm}>Cancelar</button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { PAGINAS, ACCION_LABEL, TODAS_ACCIONES, permisosVacios, permisosCompletos } from '../permisos.js'
import { confirmar } from '../utils/notify.js'
import Vacio from '../components/Vacio.jsx'

// Normaliza un objeto de permisos (puede venir null o incompleto) a la forma
// completa del catálogo, para que la matriz de checkboxes siempre tenga valores.
function normalizar(permisos) {
  const base = permisosVacios()
  if (!permisos) return permisosCompletos() // null = acceso amplio (compatibilidad)
  for (const pag of PAGINAS) {
    for (const a of pag.acciones) {
      base[pag.id][a] = !!(permisos[pag.id] && permisos[pag.id][a])
    }
  }
  return base
}

export default function Usuarios() {
  const { getUsuarios, addUsuario, deleteUsuario, resetUsuarioPassword, updateUsuarioPermisos } = useData()
  const { usuario: yo } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [msg, setMsg] = useState(null)
  const [cargando, setCargando] = useState(true)

  // formulario de alta
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState('usuario')
  const [guardando, setGuardando] = useState(false)
  const [formAbierto, setFormAbierto] = useState(false)

  // edición de permisos: { [userId]: objetoPermisos }
  const [editPerm, setEditPerm] = useState(null) // usuario en edición
  const [permDraft, setPermDraft] = useState(null)
  const [guardandoPerm, setGuardandoPerm] = useState(false)

  const recargar = async () => {
    try {
      setUsuarios(await getUsuarios())
    } catch (e) {
      setMsg({ tipo: 'error', texto: e.message })
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    recargar()
  }, [])

  const resetForm = () => {
    setUsername(''); setPassword(''); setRol('usuario')
    setFormAbierto(false)
  }

  const crear = async (e) => {
    e.preventDefault()
    setMsg(null)
    setGuardando(true)
    try {
      // Los usuarios nuevos nacen con permiso mínimo (solo ver inicio); el admin
      // luego les concede el resto desde la matriz. Los admin no usan permisos.
      const permisos = rol === 'admin' ? null : permisosVacios()
      await addUsuario(username, password, rol, permisos)
      setMsg({ tipo: 'ok', texto: '✅ Usuario creado' })
      resetForm()
      await recargar()
    } catch (e) {
      setMsg({ tipo: 'error', texto: e.message })
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async (u) => {
    if (!(await confirmar(`¿Eliminar al usuario "${u.username}"? Esta acción no se puede deshacer.`))) return
    setMsg(null)
    try {
      await deleteUsuario(u.id)
      await recargar()
    } catch (e) {
      setMsg({ tipo: 'error', texto: e.message })
    }
  }

  const cambiarClave = async (u) => {
    const nueva = prompt(`Nueva contraseña para "${u.username}" (mínimo 4 caracteres):`)
    if (!nueva) return
    setMsg(null)
    try {
      await resetUsuarioPassword(u.id, nueva)
      setMsg({ tipo: 'ok', texto: `✅ Contraseña de ${u.username} actualizada` })
    } catch (e) {
      setMsg({ tipo: 'error', texto: e.message })
    }
  }

  // --- Edición de permisos ---
  const abrirPermisos = (u) => {
    setEditPerm(u)
    setPermDraft(normalizar(u.permisos))
    setMsg(null)
  }

  const cerrarPermisos = () => {
    setEditPerm(null)
    setPermDraft(null)
  }

  const togglePerm = (pagId, accion) => {
    setPermDraft((d) => {
      const next = { ...d, [pagId]: { ...d[pagId], [accion]: !d[pagId][accion] } }
      // Si se desmarca "ver", no tiene sentido conservar las demás acciones de esa página.
      if (accion === 'ver' && !next[pagId].ver) {
        for (const a of Object.keys(next[pagId])) next[pagId][a] = false
      }
      // Si se marca cualquier acción, asegurar que pueda ver la página.
      if (accion !== 'ver' && next[pagId][accion]) next[pagId].ver = true
      return next
    })
  }

  const marcarTodo = (valor) => {
    setPermDraft(valor ? permisosCompletos() : permisosVacios())
  }

  const guardarPermisos = async () => {
    setGuardandoPerm(true)
    setMsg(null)
    try {
      await updateUsuarioPermisos(editPerm.id, permDraft)
      setMsg({ tipo: 'ok', texto: `✅ Permisos de ${editPerm.username} actualizados. Verá los cambios al volver a iniciar sesión.` })
      cerrarPermisos()
      await recargar()
    } catch (e) {
      setMsg({ tipo: 'error', texto: e.message })
    } finally {
      setGuardandoPerm(false)
    }
  }

  return (
    <div>
      <h2>👥 Usuarios</h2>
      <p className="muted">Crea cuentas y define qué páginas y acciones puede usar cada persona.</p>

      {msg && (
        <div className={`banner ${msg.tipo === 'error' ? 'error' : ''}`}>{msg.texto}</div>
      )}

      <div className="form-actions">
        <button type="button" className="btn-primary" onClick={() => setFormAbierto(true)}>
          + Nuevo usuario
        </button>
      </div>

      <div className="card">
        <h3>Usuarios registrados</h3>
        {cargando ? (
          <p className="muted">Cargando…</p>
        ) : usuarios.length === 0 ? (
          <Vacio icono="👥" titulo="No hay usuarios" />
        ) : (
          usuarios.map((u) => (
            <div className="list-item" key={u.id}>
              <div>
                <strong>{u.username}</strong>{' '}
                {u.username === yo && <span className="chip ok">tú</span>}{' '}
                <span className={`chip ${u.rol === 'admin' ? 'warn' : ''}`}>
                  {u.rol === 'admin' ? 'Administrador' : 'Usuario'}
                </span>
              </div>
              <div className="actions">
                {u.rol !== 'admin' && (
                  <button className="btn-secondary" onClick={() => abrirPermisos(u)}>
                    Permisos
                  </button>
                )}
                <button className="btn-secondary" onClick={() => cambiarClave(u)}>
                  Cambiar contraseña
                </button>
                <button className="btn-danger" onClick={() => eliminar(u)} disabled={u.username === yo}>
                  Eliminar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {formAbierto && (
        <>
          <div className="overlay" onClick={resetForm} />
          <div className="modal">
            <h3>Crear usuario</h3>
            <form onSubmit={crear}>
              <div className="row">
                <div style={{ flex: 1 }}>
                  <label>Nombre de usuario</label>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Contraseña</label>
                  <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Rol</label>
                  <select value={rol} onChange={(e) => setRol(e.target.value)}>
                    <option value="usuario">Usuario</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
              </div>
              <p className="muted small">
                El administrador tiene acceso total. Un usuario nuevo solo podrá ver el inicio;
                luego le concedes permisos con el botón "Permisos".
              </p>
              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={guardando}>
                  {guardando ? 'Creando…' : 'Crear usuario'}
                </button>
                <button type="button" className="btn-secondary" onClick={resetForm}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Editor de permisos (matriz de checkboxes) */}
      {editPerm && permDraft && (
        <>
          <div className="overlay" onClick={cerrarPermisos} />
          <div className="modal modal-lg">
            <div className="card-head">
              <h3>Permisos de {editPerm.username}</h3>
              <button className="btn-secondary" onClick={cerrarPermisos}>Cerrar</button>
            </div>
            <div className="quick-ranges" style={{ marginBottom: 12 }}>
              <button className="btn-secondary" onClick={() => marcarTodo(true)}>Marcar todo</button>
              <button className="btn-secondary" onClick={() => marcarTodo(false)}>Quitar todo</button>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Página</th>
                    {TODAS_ACCIONES.map((a) => (
                      <th key={a} className="num">{ACCION_LABEL[a]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PAGINAS.map((pag) => (
                    <tr key={pag.id}>
                      <td>{pag.label}</td>
                      {TODAS_ACCIONES.map((a) => (
                        <td key={a} className="num">
                          {pag.acciones.includes(a) ? (
                            <input
                              type="checkbox"
                              checked={!!permDraft[pag.id][a]}
                              onChange={() => togglePerm(pag.id, a)}
                            />
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-actions">
              <button className="btn-primary" onClick={guardarPermisos} disabled={guardandoPerm}>
                {guardandoPerm ? 'Guardando…' : 'Guardar permisos'}
              </button>
              <button className="btn-secondary" onClick={cerrarPermisos}>Cancelar</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

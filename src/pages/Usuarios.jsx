import { useEffect, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'

export default function Usuarios() {
  const { getUsuarios, addUsuario, deleteUsuario, resetUsuarioPassword } = useData()
  const { usuario: yo } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [msg, setMsg] = useState(null)
  const [cargando, setCargando] = useState(true)

  // formulario de alta
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState('usuario')
  const [guardando, setGuardando] = useState(false)

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

  const crear = async (e) => {
    e.preventDefault()
    setMsg(null)
    setGuardando(true)
    try {
      await addUsuario(username, password, rol)
      setMsg({ tipo: 'ok', texto: '✅ Usuario creado' })
      setUsername(''); setPassword(''); setRol('usuario')
      await recargar()
    } catch (e) {
      setMsg({ tipo: 'error', texto: e.message })
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async (u) => {
    if (!confirm(`¿Eliminar al usuario "${u.username}"? Esta acción no se puede deshacer.`)) return
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

  return (
    <div>
      <h2>👥 Usuarios</h2>
      <p className="muted">Crea cuentas para que otras personas ingresen al sistema.</p>

      {msg && (
        <div className={`banner ${msg.tipo === 'error' ? 'error' : ''}`}>{msg.texto}</div>
      )}

      <form className="card" onSubmit={crear}>
        <h3>Crear usuario</h3>
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
        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={guardando}>
            {guardando ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </form>

      <div className="card">
        <h3>Usuarios registrados</h3>
        {cargando ? (
          <p className="muted">Cargando…</p>
        ) : usuarios.length === 0 ? (
          <p className="muted">No hay usuarios.</p>
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
    </div>
  )
}

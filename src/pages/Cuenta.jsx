import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export default function Cuenta() {
  const { usuario, cambiarPassword, logout } = useAuth()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [msg, setMsg] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMsg(null)
    if (nueva !== confirmar) {
      setMsg({ tipo: 'error', texto: 'La nueva contraseña y la confirmación no coinciden' })
      return
    }
    setGuardando(true)
    try {
      await cambiarPassword(actual, nueva)
      setMsg({ tipo: 'ok', texto: '✅ Contraseña actualizada' })
      setActual(''); setNueva(''); setConfirmar('')
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <h2>🔒 Mi cuenta</h2>
      <div className="card">
        <p>Sesión iniciada como <strong>{usuario}</strong></p>
        <button className="btn-danger" onClick={logout}>Cerrar sesión</button>
      </div>

      <form className="card" onSubmit={handleSubmit}>
        <h3>Cambiar contraseña</h3>
        <label>Contraseña actual</label>
        <input type="password" value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" />
        <label>Nueva contraseña</label>
        <input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password" />
        <label>Confirmar nueva contraseña</label>
        <input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="new-password" />

        {msg && (
          <div className={`banner ${msg.tipo === 'error' ? 'error' : ''}`} style={{ marginTop: 14 }}>
            {msg.texto}
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Cambiar contraseña'}
          </button>
        </div>
      </form>
    </div>
  )
}

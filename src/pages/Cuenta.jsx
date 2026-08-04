import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { notify } from '../utils/notify.js'
import { pushSoportado, pushEstaActivo, pushActivar, pushDesactivar } from '../utils/push.js'

export default function Cuenta() {
  const { usuario, rol, cambiarPassword, logout } = useAuth()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [msg, setMsg] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const [pushActivo, setPushActivo] = useState(false)
  const [pushCargando, setPushCargando] = useState(false)

  useEffect(() => {
    if (rol === 'admin' && pushSoportado()) {
      pushEstaActivo().then(setPushActivo).catch(() => {})
    }
  }, [rol])

  const togglePush = async () => {
    setPushCargando(true)
    try {
      if (pushActivo) {
        await pushDesactivar()
        setPushActivo(false)
        notify.ok('Notificaciones desactivadas en este dispositivo')
      } else {
        await pushActivar()
        setPushActivo(true)
        notify.ok('Notificaciones activadas en este dispositivo')
      }
    } catch (err) {
      notify.error(err.message)
    } finally {
      setPushCargando(false)
    }
  }

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

      {rol === 'admin' && (
        <div className="card">
          <h3>🔔 Notificaciones de ingresos</h3>
          {pushSoportado() ? (
            <>
              <p>Recibe una notificación en este dispositivo cada vez que se registre un ingreso de dinero.</p>
              <label className="switch-row">
                <input type="checkbox" checked={pushActivo} onChange={togglePush} disabled={pushCargando} />
                <span>{pushActivo ? 'Activadas en este dispositivo' : 'Recibir notificaciones en este dispositivo'}</span>
              </label>
            </>
          ) : (
            <p className="muted">Este navegador no admite notificaciones push. Instala la app en el celular para poder activarlas.</p>
          )}
        </div>
      )}

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

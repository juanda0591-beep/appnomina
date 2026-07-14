import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setCargando(true)
    try {
      await login(username, password)
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <span className="login-brand-icon">💰</span>
          <h1 className="login-logo">Nómina</h1>
        </div>
        <p className="muted login-sub">Inicia sesión para continuar</p>

        <label>Usuario</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
          placeholder="Tu usuario"
        />

        <label>Contraseña</label>
        <div className="input-password">
          <input
            type={verPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="Tu contraseña"
          />
          <button
            type="button"
            className="toggle-password"
            onClick={() => setVerPassword((v) => !v)}
            aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            title={verPassword ? 'Ocultar' : 'Mostrar'}
          >
            {verPassword ? '🙈' : '👁️'}
          </button>
        </div>

        {error && <div className="banner error" style={{ marginTop: 14 }}>{error}</div>}

        <button type="submit" className="btn-primary btn-login" disabled={cargando}>
          {cargando ? 'Ingresando…' : 'Iniciar sesión'}
        </button>
      </form>
    </div>
  )
}

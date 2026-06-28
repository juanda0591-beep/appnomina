import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('nomina_token'))
  const [usuario, setUsuario] = useState(() => localStorage.getItem('nomina_user'))

  const login = async (username, password) => {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'No se pudo iniciar sesión')
    }
    const data = await res.json()
    localStorage.setItem('nomina_token', data.token)
    localStorage.setItem('nomina_user', data.username)
    setToken(data.token)
    setUsuario(data.username)
  }

  const logout = () => {
    localStorage.removeItem('nomina_token')
    localStorage.removeItem('nomina_user')
    setToken(null)
    setUsuario(null)
  }

  const cambiarPassword = async (actual, nueva) => {
    const res = await fetch('/api/cambiar-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('nomina_token')}`,
      },
      body: JSON.stringify({ actual, nueva }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'No se pudo cambiar la contraseña')
    }
  }

  return (
    <AuthContext.Provider value={{ token, usuario, login, logout, cambiarPassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}

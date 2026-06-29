import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // Usamos sessionStorage (no localStorage): la sesión se borra automáticamente
  // al cerrar la pestaña/ventana del navegador, obligando a iniciar sesión otra vez.
  const [token, setToken] = useState(() => sessionStorage.getItem('nomina_token'))
  const [usuario, setUsuario] = useState(() => sessionStorage.getItem('nomina_user'))
  const [rol, setRol] = useState(() => sessionStorage.getItem('nomina_rol') || 'usuario')

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
    sessionStorage.setItem('nomina_token', data.token)
    sessionStorage.setItem('nomina_user', data.username)
    sessionStorage.setItem('nomina_rol', data.rol || 'usuario')
    setToken(data.token)
    setUsuario(data.username)
    setRol(data.rol || 'usuario')
  }

  const logout = () => {
    sessionStorage.removeItem('nomina_token')
    sessionStorage.removeItem('nomina_user')
    sessionStorage.removeItem('nomina_rol')
    setToken(null)
    setUsuario(null)
    setRol('usuario')
  }

  const cambiarPassword = async (actual, nueva) => {
    const res = await fetch('/api/cambiar-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionStorage.getItem('nomina_token')}`,
      },
      body: JSON.stringify({ actual, nueva }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'No se pudo cambiar la contraseña')
    }
  }

  return (
    <AuthContext.Provider value={{ token, usuario, rol, login, logout, cambiarPassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}

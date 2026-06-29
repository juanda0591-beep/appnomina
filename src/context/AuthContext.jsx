import { createContext, useContext, useState } from 'react'
import { puedeEn } from '../permisos.js'

const AuthContext = createContext(null)

// Lee los permisos guardados en sessionStorage. Devuelve null si no hay nada
// (admin o usuario con acceso amplio) → puedeEn lo interpreta como "todo permitido".
function leerPermisos() {
  const raw = sessionStorage.getItem('nomina_permisos')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  // Usamos sessionStorage (no localStorage): la sesión se borra automáticamente
  // al cerrar la pestaña/ventana del navegador, obligando a iniciar sesión otra vez.
  const [token, setToken] = useState(() => sessionStorage.getItem('nomina_token'))
  const [usuario, setUsuario] = useState(() => sessionStorage.getItem('nomina_user'))
  const [rol, setRol] = useState(() => sessionStorage.getItem('nomina_rol') || 'usuario')
  const [permisos, setPermisos] = useState(() => leerPermisos())

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
    // Los permisos llegan como objeto (usuario normal) o null (admin / acceso amplio)
    if (data.permisos) sessionStorage.setItem('nomina_permisos', JSON.stringify(data.permisos))
    else sessionStorage.removeItem('nomina_permisos')
    setToken(data.token)
    setUsuario(data.username)
    setRol(data.rol || 'usuario')
    setPermisos(data.permisos || null)
  }

  const logout = () => {
    sessionStorage.removeItem('nomina_token')
    sessionStorage.removeItem('nomina_user')
    sessionStorage.removeItem('nomina_rol')
    sessionStorage.removeItem('nomina_permisos')
    setToken(null)
    setUsuario(null)
    setRol('usuario')
    setPermisos(null)
  }

  // ¿El usuario actual puede (pagina, accion)? El admin siempre puede.
  const puede = (pagina, accion = 'ver') => {
    if (rol === 'admin') return true
    return puedeEn(permisos, pagina, accion)
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
    <AuthContext.Provider value={{ token, usuario, rol, permisos, puede, login, logout, cambiarPassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}

import { useState, useEffect, useCallback } from 'react'

// Helper para hacer peticiones HTTP con autenticación
async function http(path, options = {}) {
  const token = sessionStorage.getItem('nomina_token')
  const res = await fetch('/api' + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  if (res.status === 401) {
    sessionStorage.removeItem('nomina_token')
    sessionStorage.removeItem('nomina_user')
    window.location.reload()
    throw new Error('Sesión expirada')
  }
  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    throw new Error(`Error ${res.status}: ${msg}`)
  }
  return res.status === 204 ? null : res.json()
}

/**
 * Hook para cargar datos bajo demanda desde un endpoint de la API.
 *
 * @param {string} endpoint - Ruta del endpoint (ej: '/productos', '/ventas')
 * @param {Array} deps - Dependencias adicionales que disparan recarga
 * @returns {Object} { data, cargando, error, recargar }
 *
 * Uso:
 * const { data: productos, cargando, error, recargar } = useLocalData('/productos')
 */
export function useLocalData(endpoint, deps = []) {
  const [data, setData] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const recargar = useCallback(async () => {
    if (!endpoint) {
      setData(null)
      setCargando(false)
      return
    }

    setCargando(true)
    setError(null)

    try {
      const result = await http(endpoint)
      setData(result)
    } catch (e) {
      setError(e.message)
      setData(null)
    } finally {
      setCargando(false)
    }
  }, [endpoint, ...deps])

  useEffect(() => {
    recargar()
  }, [recargar])

  return { data, cargando, error, recargar }
}

/**
 * Hook para cargar múltiples endpoints en paralelo.
 *
 * @param {Array<string>} endpoints - Array de rutas de endpoints
 * @returns {Object} { data, cargando, error, recargar }
 *
 * Uso:
 * const { data, cargando } = useLocalDataMultiple(['/productos', '/clientes'])
 * // data será un array: [productos, clientes]
 */
export function useLocalDataMultiple(endpoints) {
  const [data, setData] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const recargar = useCallback(async () => {
    if (!endpoints || endpoints.length === 0) {
      setData([])
      setCargando(false)
      return
    }

    setCargando(true)
    setError(null)

    try {
      const results = await Promise.all(endpoints.map(ep => http(ep)))
      setData(results)
    } catch (e) {
      setError(e.message)
      setData(null)
    } finally {
      setCargando(false)
    }
  }, [endpoints.join(',')])

  useEffect(() => {
    recargar()
  }, [recargar])

  return { data, cargando, error, recargar }
}

export { http }

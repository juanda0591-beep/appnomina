import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext.jsx'

const DataContext = createContext(null)

// En desarrollo Vite hace proxy de /api -> :3001. En producción el mismo
// servidor Express sirve el frontend, así que /api también funciona.
const API = '/api'

async function http(path, options = {}) {
  const token = sessionStorage.getItem('nomina_token')
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  if (res.status === 401) {
    // sesión expirada o inválida → volver al login
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

export function DataProvider({ children }) {
  const [productos, setProductos] = useState([])
  const [empleados, setEmpleados] = useState([])
  const [prestamos, setPrestamos] = useState([])
  const [nominas, setNominas] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [empresa, setEmpresa] = useState(null)
  const [tareas, setTareas] = useState([])
  const [tareasProduccion, setTareasProduccion] = useState([])
  const [ordenesProduccion, setOrdenesProduccion] = useState([])
  const [materiales, setMateriales] = useState([])
  const [procesosGlobales, setProcesosGlobales] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const { puede } = useAuth()

  const puedeLeer = (...reglas) => reglas.some(([pagina, accion = 'ver']) => puede(pagina, accion))

  const cargarSiPuede = async (condicion, path, fallback) => {
    if (!condicion) return fallback
    try {
      return await http(path)
    } catch (e) {
      if (e.message.startsWith('Error 403')) return fallback
      throw e
    }
  }

  const recargar = async () => {
    setCargando(true)
    try {
      const [prod, emp, pres, nom, mov, empr, tar, tarProd, ordProd, mat, procG] = await Promise.all([
        cargarSiPuede(puedeLeer(['productos', 'ver'], ['nomina', 'ver']), '/productos', []),
        cargarSiPuede(
          puedeLeer(['empleados', 'ver'], ['nomina', 'ver'], ['prestamos', 'ver'], ['historial', 'ver'], ['reportes', 'ver'], ['gestion-nomina', 'ver'], ['gestion-produccion', 'ver']),
          '/empleados',
          []
        ),
        cargarSiPuede(
          puedeLeer(['prestamos', 'ver'], ['nomina', 'ver'], ['empleados', 'ver'], ['historial', 'ver']),
          '/prestamos',
          []
        ),
        cargarSiPuede(puedeLeer(['historial', 'ver']), '/nominas', []),
        cargarSiPuede(puedeLeer(['control-dinero', 'ver']), '/movimientos', []),
        cargarSiPuede(puedeLeer(['empresa', 'ver'], ['nomina', 'ver'], ['historial', 'ver']), '/empresa', null),
        cargarSiPuede(puedeLeer(['gestion-nomina', 'ver'], ['nomina', 'ver'], ['reportes', 'ver']), '/tareas', []),
        cargarSiPuede(puedeLeer(['gestion-produccion', 'ver']), '/tareas-produccion', []),
        cargarSiPuede(puedeLeer(['gestion-produccion', 'ver']), '/ordenes-produccion', []),
        cargarSiPuede(puedeLeer(['materiales', 'ver']), '/materiales', []),
        cargarSiPuede(puedeLeer(['productos', 'ver']), '/procesos-globales', []),
      ])

      setProductos(prod)
      setEmpleados(emp)
      setPrestamos(pres)
      setNominas(nom)
      setMovimientos(mov)
      setEmpresa(empr)
      setTareas(tar)
      setTareasProduccion(tarProd)
      setOrdenesProduccion(ordProd)
      setMateriales(mat)
      setProcesosGlobales(procG)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    recargar()
  }, [])

  // ---------- PRODUCTOS ----------
  const addProducto = async (nombre, procesos) => {
    await http('/productos', { method: 'POST', body: JSON.stringify({ nombre, procesos }) })
    await recargar()
  }
  const updateProducto = async (id, nombre, procesos) => {
    await http(`/productos/${id}`, { method: 'PUT', body: JSON.stringify({ nombre, procesos }) })
    await recargar()
  }
  const deleteProducto = async (id) => {
    await http(`/productos/${id}`, { method: 'DELETE' })
    await recargar()
  }

  // ---------- EMPLEADOS ----------
  const addEmpleado = async (emp) => {
    await http('/empleados', { method: 'POST', body: JSON.stringify(emp) })
    await recargar()
  }
  const updateEmpleado = async (id, emp) => {
    await http(`/empleados/${id}`, { method: 'PUT', body: JSON.stringify(emp) })
    await recargar()
  }
  const deleteEmpleado = async (id) => {
    await http(`/empleados/${id}`, { method: 'DELETE' })
    await recargar()
  }

  // ---------- HERRAMIENTAS ENTREGADAS ----------
  const getHerramientasEmpleado = (empleadoId) => http(`/empleados/${empleadoId}/herramientas`)
  const addHerramienta = (empleadoId, herramienta) =>
    http(`/empleados/${empleadoId}/herramientas`, { method: 'POST', body: JSON.stringify(herramienta) })
  const updateHerramienta = (id, herramienta) =>
    http(`/herramientas/${id}`, { method: 'PUT', body: JSON.stringify(herramienta) })
  const deleteHerramienta = (id) => http(`/herramientas/${id}`, { method: 'DELETE' })

  // ---------- PRESTAMOS ----------
  const addPrestamo = async (prestamo) => {
    await http('/prestamos', { method: 'POST', body: JSON.stringify(prestamo) })
    await recargar()
  }
  const deletePrestamo = async (id) => {
    await http(`/prestamos/${id}`, { method: 'DELETE' })
    await recargar()
  }

  // ---------- NOMINAS ----------
  const addNomina = async (nomina) => {
    const creada = await http('/nominas', { method: 'POST', body: JSON.stringify(nomina) })
    await recargar()
    return creada
  }
  const deleteNomina = async (id) => {
    await http(`/nominas/${id}`, { method: 'DELETE' })
    await recargar()
  }

  // ---------- MOVIMIENTOS (Control de dinero) ----------
  const addMovimiento = async (mov) => {
    const creado = await http('/movimientos', { method: 'POST', body: JSON.stringify(mov) })
    await recargar()
    return creado
  }
  const deleteMovimiento = async (id) => {
    await http(`/movimientos/${id}`, { method: 'DELETE' })
    await recargar()
  }
  const getBalance = () => http('/movimientos/balance')
  const getMovimientos = (desde, hasta) =>
    http(`/movimientos?desde=${desde}&hasta=${hasta}`)

  // ---------- EMPRESA ----------
  const updateEmpresa = async (datos) => {
    const actualizada = await http('/empresa', { method: 'PUT', body: JSON.stringify(datos) })
    setEmpresa(actualizada)
    return actualizada
  }

  // ---------- REPORTES ----------
  const getReporte = (desde, hasta) =>
    http(`/reportes?desde=${desde}&hasta=${hasta}`)
  const getReporteMateriales = (desde, hasta) =>
    http(`/reportes/materiales?desde=${desde}&hasta=${hasta}`)

  // ---------- DASHBOARD ----------
  const getDashboard = () => http('/dashboard')

  // ---------- USUARIOS (solo admin) ----------
  const getUsuarios = () => http('/usuarios')
  const addUsuario = (username, password, rol, permisos) =>
    http('/usuarios', { method: 'POST', body: JSON.stringify({ username, password, rol, permisos }) })
  const deleteUsuario = (id) => http(`/usuarios/${id}`, { method: 'DELETE' })
  const resetUsuarioPassword = (id, nueva) =>
    http(`/usuarios/${id}/password`, { method: 'POST', body: JSON.stringify({ nueva }) })
  const updateUsuarioPermisos = (id, permisos) =>
    http(`/usuarios/${id}/permisos`, { method: 'PUT', body: JSON.stringify({ permisos }) })

  // ---------- COSTEOS (Costos de productos) ----------
  const getCosteos = () => http('/costeos')
  const addCosteo = (nombre, datos) =>
    http('/costeos', { method: 'POST', body: JSON.stringify({ nombre, datos }) })
  const updateCosteo = (id, nombre, datos) =>
    http(`/costeos/${id}`, { method: 'PUT', body: JSON.stringify({ nombre, datos }) })
  const deleteCosteo = (id) => http(`/costeos/${id}`, { method: 'DELETE' })

  // ---------- TAREAS (Gestión de Nómina) ----------
  const addTarea = async (tarea) => {
    const creada = await http('/tareas', { method: 'POST', body: JSON.stringify(tarea) })
    await recargar()
    return creada
  }
  const updateTarea = async (id, datos) => {
    const actualizada = await http(`/tareas/${id}`, { method: 'PUT', body: JSON.stringify(datos) })
    await recargar()
    return actualizada
  }
  const terminarTarea = async (id) => {
    await http(`/tareas/${id}/terminar`, { method: 'POST' })
    await recargar()
  }
  const deleteTarea = async (id) => {
    await http(`/tareas/${id}`, { method: 'DELETE' })
    await recargar()
  }
  const getTareaHistorial = (id) => http(`/tareas/${id}/historial`)
  const getTareaFotos = (id, full = false) => http(`/tareas/${id}/fotos${full ? '?full=1' : ''}`)
  const addTareaFoto = (id, foto) =>
    http(`/tareas/${id}/fotos`, { method: 'POST', body: JSON.stringify(foto) })
  const deleteTareaFoto = (fotoId) =>
    http(`/tareas/fotos/${fotoId}`, { method: 'DELETE' })

  // ---------- TAREAS DE PRODUCCIÓN (Gestión de Producción) ----------
  const addTareaProduccion = async (tarea) => {
    const creada = await http('/tareas-produccion', { method: 'POST', body: JSON.stringify(tarea) })
    await recargar()
    return creada
  }
  const updateTareaProduccion = async (id, datos) => {
    const actualizada = await http(`/tareas-produccion/${id}`, { method: 'PUT', body: JSON.stringify(datos) })
    await recargar()
    return actualizada
  }
  const terminarTareaProduccion = async (id) => {
    await http(`/tareas-produccion/${id}/terminar`, { method: 'POST' })
    await recargar()
  }
  const deleteTareaProduccion = async (id) => {
    await http(`/tareas-produccion/${id}`, { method: 'DELETE' })
    await recargar()
  }
  const getTareaProduccionHistorial = (id) => http(`/tareas-produccion/${id}/historial`)

  // ---------- ÓRDENES DE PRODUCCIÓN ----------
  const addOrdenProduccion = async (orden) => {
    const creada = await http('/ordenes-produccion', { method: 'POST', body: JSON.stringify(orden) })
    await recargar()
    return creada
  }
  const updateOrdenProduccion = async (id, datos) => {
    const actualizada = await http(`/ordenes-produccion/${id}`, { method: 'PUT', body: JSON.stringify(datos) })
    await recargar()
    return actualizada
  }
  const terminarOrdenProduccion = async (id) => {
    await http(`/ordenes-produccion/${id}/terminar`, { method: 'POST' })
    await recargar()
  }
  const deleteOrdenProduccion = async (id) => {
    await http(`/ordenes-produccion/${id}`, { method: 'DELETE' })
    await recargar()
  }

  // ---------- MATERIALES ----------
  const addMaterial = async (material) => {
    const creado = await http('/materiales', { method: 'POST', body: JSON.stringify(material) })
    await recargar()
    return creado
  }
  const updateMaterial = async (id, material) => {
    const actualizado = await http(`/materiales/${id}`, { method: 'PUT', body: JSON.stringify(material) })
    await recargar()
    return actualizado
  }
  const deleteMaterial = async (id) => {
    await http(`/materiales/${id}`, { method: 'DELETE' })
    await recargar()
  }
  const registrarEntradaMaterial = async (id, entrada) => {
    const actualizado = await http(`/materiales/${id}/entrada`, { method: 'POST', body: JSON.stringify(entrada) })
    await recargar()
    return actualizado
  }
  const getMaterialMovimientos = (id) => http(`/materiales/${id}/movimientos`)

  // ---------- PROCESOS GLOBALES ----------
  const addProcesoGlobal = async (nombre) => {
    const creado = await http('/procesos-globales', { method: 'POST', body: JSON.stringify({ nombre }) })
    await recargar()
    return creado
  }

  // Helpers de consulta (sobre estado en memoria)
  const getEmpleado = (id) => empleados.find((e) => String(e.id) === String(id))
  const getProducto = (id) => productos.find((p) => String(p.id) === String(id))
  const prestamosDeEmpleado = (empleadoId) =>
    prestamos.filter((p) => String(p.empleado_id) === String(empleadoId) && p.saldo > 0)
  const tareasTerminadasDeEmpleado = (empleadoId) =>
    tareas.filter((t) => String(t.empleadoId) === String(empleadoId) && t.estado === 'terminada')

  const value = {
    productos,
    empleados,
    prestamos,
    nominas,
    movimientos,
    empresa,
    tareas,
    tareasProduccion,
    ordenesProduccion,
    materiales,
    procesosGlobales,
    cargando,
    error,
    recargar,
    updateEmpresa,
    addProducto,
    updateProducto,
    deleteProducto,
    addEmpleado,
    updateEmpleado,
    deleteEmpleado,
    getHerramientasEmpleado,
    addHerramienta,
    updateHerramienta,
    deleteHerramienta,
    addPrestamo,
    deletePrestamo,
    addNomina,
    deleteNomina,
    addMovimiento,
    deleteMovimiento,
    getBalance,
    getMovimientos,
    getReporte,
    getReporteMateriales,
    getDashboard,
    getUsuarios,
    addUsuario,
    deleteUsuario,
    resetUsuarioPassword,
    updateUsuarioPermisos,
    getCosteos,
    addCosteo,
    updateCosteo,
    deleteCosteo,
    addTarea,
    updateTarea,
    terminarTarea,
    deleteTarea,
    getTareaHistorial,
    getTareaFotos,
    addTareaFoto,
    deleteTareaFoto,
    addTareaProduccion,
    updateTareaProduccion,
    terminarTareaProduccion,
    deleteTareaProduccion,
    getTareaProduccionHistorial,
    addOrdenProduccion,
    updateOrdenProduccion,
    terminarOrdenProduccion,
    deleteOrdenProduccion,
    addMaterial,
    updateMaterial,
    deleteMaterial,
    registrarEntradaMaterial,
    getMaterialMovimientos,
    addProcesoGlobal,
    getEmpleado,
    getProducto,
    prestamosDeEmpleado,
    tareasTerminadasDeEmpleado,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData debe usarse dentro de DataProvider')
  return ctx
}

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
  // Estado global solo para datos pequeños/frecuentes
  const [empresa, setEmpresa] = useState(null)
  const [colores, setColores] = useState([])
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

  // Carga inicial solo de datos globales pequeños
  const recargarGlobal = async () => {
    setCargando(true)
    try {
      const [empr, col, procG] = await Promise.all([
        cargarSiPuede(puedeLeer(['empresa', 'ver'], ['nomina', 'ver'], ['historial', 'ver']), '/empresa', null),
        cargarSiPuede(
          puedeLeer(['colores', 'ver'], ['materiales', 'ver'], ['productos', 'ver'], ['gestion-produccion', 'ver'], ['pedidos', 'ver'], ['ventas', 'ver']),
          '/colores',
          []
        ),
        cargarSiPuede(puedeLeer(['productos', 'ver']), '/procesos-globales', []),
      ])

      setEmpresa(empr)
      setColores(col)
      setProcesosGlobales(procG)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    recargarGlobal()
  }, [])

  // ---------- PRODUCTOS ----------
  const addProducto = async (datos) => {
    return await http('/productos', { method: 'POST', body: JSON.stringify(datos) })
  }
  const updateProducto = async (id, datos) => {
    return await http(`/productos/${id}`, { method: 'PUT', body: JSON.stringify(datos) })
  }
  const deleteProducto = async (id) => {
    await http(`/productos/${id}`, { method: 'DELETE' })
  }
  const registrarEntradaProducto = async (id, entrada) => {
    return await http(`/productos/${id}/entrada`, { method: 'POST', body: JSON.stringify(entrada) })
  }
  const getProductoMovimientos = (id) => http(`/productos/${id}/movimientos`)

  // Variantes (colores) de un producto
  const addVariante = async (productoId, datos) => {
    return await http(`/productos/${productoId}/variantes`, { method: 'POST', body: JSON.stringify(datos) })
  }
  const updateVariante = async (productoId, varId, datos) => {
    return await http(`/productos/${productoId}/variantes/${varId}`, { method: 'PUT', body: JSON.stringify(datos) })
  }
  const deleteVariante = async (productoId, varId) => {
    await http(`/productos/${productoId}/variantes/${varId}`, { method: 'DELETE' })
  }

  // ---------- COLORES ----------
  const addColor = async (color) => {
    const creado = await http('/colores', { method: 'POST', body: JSON.stringify(color) })
    await recargarGlobal()
    return creado
  }
  const updateColor = async (id, color) => {
    const actualizado = await http(`/colores/${id}`, { method: 'PUT', body: JSON.stringify(color) })
    await recargarGlobal()
    return actualizado
  }
  const deleteColor = async (id) => {
    await http(`/colores/${id}`, { method: 'DELETE' })
    await recargarGlobal()
  }

  // ---------- CLIENTES ----------
  const addCliente = async (cliente) => {
    return await http('/clientes', { method: 'POST', body: JSON.stringify(cliente) })
  }
  const updateCliente = async (id, cliente) => {
    return await http(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(cliente) })
  }
  const deleteCliente = async (id) => {
    await http(`/clientes/${id}`, { method: 'DELETE' })
  }
  const getClienteAnticipos = (id) => http(`/clientes/${id}/anticipos`)
  const addAnticipo = async (clienteId, anticipo) => {
    return await http(`/clientes/${clienteId}/anticipos`, { method: 'POST', body: JSON.stringify(anticipo) })
  }
  const deleteAnticipo = async (clienteId, anticipoId, motivo) => {
    await http(`/clientes/${clienteId}/anticipos/${anticipoId}`, { method: 'DELETE', body: JSON.stringify({ motivo }) })
  }

  // ---------- PEDIDOS ----------
  const addPedido = async (pedido) => {
    return await http('/pedidos', { method: 'POST', body: JSON.stringify(pedido) })
  }
  const updatePedido = async (id, pedido) => {
    return await http(`/pedidos/${id}`, { method: 'PUT', body: JSON.stringify(pedido) })
  }
  const deletePedido = async (id) => {
    await http(`/pedidos/${id}`, { method: 'DELETE' })
  }
  const convertirPedido = async (id, opciones) => {
    return await http(`/pedidos/${id}/convertir`, { method: 'POST', body: JSON.stringify(opciones || {}) })
  }

  // ---------- VENTAS ----------
  const addVenta = async (venta) => {
    return await http('/ventas', { method: 'POST', body: JSON.stringify(venta) })
  }
  const updateVenta = async (id, venta) => {
    return await http(`/ventas/${id}`, { method: 'PUT', body: JSON.stringify(venta) })
  }
  const deleteVenta = async (id, motivo) => {
    await http(`/ventas/${id}`, { method: 'DELETE', body: JSON.stringify({ motivo }) })
  }
  const registrarPagoVenta = async (id, pago) => {
    return await http(`/ventas/${id}/pagos`, { method: 'POST', body: JSON.stringify(pago) })
  }
  const registrarAbonoGlobal = async (clienteId, abono) => {
    return await http(`/clientes/${clienteId}/abono-global`, { method: 'POST', body: JSON.stringify(abono) })
  }

  // ---------- EMPLEADOS ----------
  const addEmpleado = async (emp) => {
    return await http('/empleados', { method: 'POST', body: JSON.stringify(emp) })
  }
  const updateEmpleado = async (id, emp) => {
    return await http(`/empleados/${id}`, { method: 'PUT', body: JSON.stringify(emp) })
  }
  const deleteEmpleado = async (id) => {
    await http(`/empleados/${id}`, { method: 'DELETE' })
  }
  const setEmpleadoActivo = async (id, activo) => {
    await http(`/empleados/${id}/activo`, { method: 'PUT', body: JSON.stringify({ activo }) })
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
    return await http('/prestamos', { method: 'POST', body: JSON.stringify(prestamo) })
  }
  const abonarPrestamo = async (id, abono) => {
    return await http(`/prestamos/${id}/abonar`, { method: 'POST', body: JSON.stringify(abono) })
  }
  const deletePrestamo = async (id, motivo) => {
    await http(`/prestamos/${id}`, { method: 'DELETE', body: JSON.stringify({ motivo }) })
  }

  // ---------- NOMINAS ----------
  const addNomina = async (nomina) => {
    return await http('/nominas', { method: 'POST', body: JSON.stringify(nomina) })
  }
  const deleteNomina = async (id, motivo) => {
    await http(`/nominas/${id}`, { method: 'DELETE', body: JSON.stringify({ motivo }) })
  }

  // ---------- MOVIMIENTOS (Control de dinero) ----------
  const addMovimiento = async (mov) => {
    return await http('/movimientos', { method: 'POST', body: JSON.stringify(mov) })
  }
  const deleteMovimiento = async (id, motivo) => {
    await http(`/movimientos/${id}`, { method: 'DELETE', body: JSON.stringify({ motivo }) })
  }
  const addComprobanteMovimiento = async (id, datos) => {
    return await http(`/movimientos/${id}/comprobante`, { method: 'PUT', body: JSON.stringify(datos) })
  }
  const getBalance = () => http('/movimientos/balance')
  const getMovimientos = (desde, hasta) => http(`/movimientos?desde=${desde}&hasta=${hasta}`)

  // ---------- EMPRESA ----------
  const updateEmpresa = async (datos) => {
    const actualizada = await http('/empresa', { method: 'PUT', body: JSON.stringify(datos) })
    setEmpresa(actualizada)
    return actualizada
  }

  // ---------- REPORTES ----------
  const getReporte = (desde, hasta) => http(`/reportes?desde=${desde}&hasta=${hasta}`)
  const getReporteVentas = (desde, hasta) => http(`/reportes/ventas?desde=${desde}&hasta=${hasta}`)
  const getReporteMateriales = (desde, hasta) => http(`/reportes/materiales?desde=${desde}&hasta=${hasta}`)

  // ---------- DASHBOARD ----------
  const getDashboard = () => http('/dashboard')
  const getProduccionDashboard = () => http('/produccion/dashboard')

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
  const addCosteo = (nombre, datos, productoId) =>
    http('/costeos', { method: 'POST', body: JSON.stringify({ nombre, datos, productoId }) })
  const updateCosteo = (id, nombre, datos, productoId) =>
    http(`/costeos/${id}`, { method: 'PUT', body: JSON.stringify({ nombre, datos, productoId }) })
  const deleteCosteo = (id) => http(`/costeos/${id}`, { method: 'DELETE' })

  // ---------- TAREAS (Gestión de Nómina) ----------
  const addTarea = async (tarea) => {
    return await http('/tareas', { method: 'POST', body: JSON.stringify(tarea) })
  }
  const addTareas = async (tareasArr) => {
    const creadas = []
    for (const t of tareasArr) {
      creadas.push(await http('/tareas', { method: 'POST', body: JSON.stringify(t) }))
    }
    return creadas
  }
  const updateTarea = async (id, datos) => {
    return await http(`/tareas/${id}`, { method: 'PUT', body: JSON.stringify(datos) })
  }
  const terminarTarea = async (id) => {
    await http(`/tareas/${id}/terminar`, { method: 'POST' })
  }
  const deleteTarea = async (id) => {
    await http(`/tareas/${id}`, { method: 'DELETE' })
  }
  const getTareaHistorial = (id) => http(`/tareas/${id}/historial`)
  const getTareaFotos = (id, full = false) => http(`/tareas/${id}/fotos${full ? '?full=1' : ''}`)
  const addTareaFoto = (id, foto) => http(`/tareas/${id}/fotos`, { method: 'POST', body: JSON.stringify(foto) })
  const deleteTareaFoto = (fotoId) => http(`/tareas/fotos/${fotoId}`, { method: 'DELETE' })
  const getTareaPiezas = (id) => http(`/tareas/${id}/piezas`)
  const setTareaPiezaVerificada = (piezaId, verificada) =>
    http(`/tareas/piezas/${piezaId}`, { method: 'PUT', body: JSON.stringify({ verificada }) })

  // ---------- TAREAS DE PRODUCCIÓN (Gestión de Producción) ----------
  const addTareaProduccion = async (tarea) => {
    return await http('/tareas-produccion', { method: 'POST', body: JSON.stringify(tarea) })
  }
  const updateTareaProduccion = async (id, datos) => {
    return await http(`/tareas-produccion/${id}`, { method: 'PUT', body: JSON.stringify(datos) })
  }
  const terminarTareaProduccion = async (id) => {
    await http(`/tareas-produccion/${id}/terminar`, { method: 'POST' })
  }
  const deleteTareaProduccion = async (id) => {
    await http(`/tareas-produccion/${id}`, { method: 'DELETE' })
  }
  const getTareaProduccionHistorial = (id) => http(`/tareas-produccion/${id}/historial`)

  // ---------- ÓRDENES DE PRODUCCIÓN ----------
  const addOrdenProduccion = async (orden) => {
    return await http('/ordenes-produccion', { method: 'POST', body: JSON.stringify(orden) })
  }
  const updateOrdenProduccion = async (id, datos) => {
    return await http(`/ordenes-produccion/${id}`, { method: 'PUT', body: JSON.stringify(datos) })
  }
  const terminarOrdenProduccion = async (id) => {
    await http(`/ordenes-produccion/${id}/terminar`, { method: 'POST' })
  }
  const deleteOrdenProduccion = async (id) => {
    await http(`/ordenes-produccion/${id}`, { method: 'DELETE' })
  }
  const cambiarEstadoOrden = async (id, estado) => {
    return await http(`/ordenes-produccion/${id}/estado`, { method: 'POST', body: JSON.stringify({ estado }) })
  }
  const cancelarOrdenProduccion = async (id) => {
    return await http(`/ordenes-produccion/${id}/cancelar`, { method: 'POST' })
  }
  const chequearMaterialOrden = (params) =>
    http('/produccion/chequeo-material', { method: 'POST', body: JSON.stringify(params) })
  const getUnidadesOrden = (id) => http(`/ordenes-produccion/${id}/unidades`)
  const setGarantiaOrden = (id, garantiaMeses) =>
    http(`/ordenes-produccion/${id}/garantia`, { method: 'PUT', body: JSON.stringify({ garantiaMeses }) })

  // ---------- MATERIALES ----------
  const addMaterial = async (material) => {
    return await http('/materiales', { method: 'POST', body: JSON.stringify(material) })
  }
  const updateMaterial = async (id, material) => {
    return await http(`/materiales/${id}`, { method: 'PUT', body: JSON.stringify(material) })
  }
  const deleteMaterial = async (id) => {
    await http(`/materiales/${id}`, { method: 'DELETE' })
  }
  const registrarEntradaMaterial = async (id, entrada) => {
    return await http(`/materiales/${id}/entrada`, { method: 'POST', body: JSON.stringify(entrada) })
  }
  const getMaterialMovimientos = (id) => http(`/materiales/${id}/movimientos`)

  // ---------- CORTES Y PLANOS ----------
  const getLaminas = () => http('/laminas')
  const addLamina = (lamina) => http('/laminas', { method: 'POST', body: JSON.stringify(lamina) })
  const updateLamina = (id, lamina) => http(`/laminas/${id}`, { method: 'PUT', body: JSON.stringify(lamina) })
  const deleteLamina = (id) => http(`/laminas/${id}`, { method: 'DELETE' })
  const getPiezas = (productoId) => http(`/productos/${productoId}/piezas`)
  const guardarPiezas = (productoId, piezas) =>
    http(`/productos/${productoId}/piezas`, { method: 'PUT', body: JSON.stringify({ piezas }) })
  const calcularCorte = (payload) => http('/cortes/calcular', { method: 'POST', body: JSON.stringify(payload) })
  const getPlanos = () => http('/planos-corte')
  const getPlano = (id) => http(`/planos-corte/${id}`)
  const guardarPlano = (plano) => http('/planos-corte', { method: 'POST', body: JSON.stringify(plano) })
  const deletePlano = (id) => http(`/planos-corte/${id}`, { method: 'DELETE' })

  // ---------- PROCESOS GLOBALES ----------
  const addProcesoGlobal = async (nombre) => {
    const creado = await http('/procesos-globales', { method: 'POST', body: JSON.stringify({ nombre }) })
    await recargarGlobal()
    return creado
  }

  const value = {
    // Estado global (solo datos pequeños/frecuentes)
    empresa,
    colores,
    procesosGlobales,
    cargando,
    error,
    recargarGlobal,
    // Funciones API
    updateEmpresa,
    addProducto,
    updateProducto,
    deleteProducto,
    registrarEntradaProducto,
    getProductoMovimientos,
    addVariante,
    updateVariante,
    deleteVariante,
    addColor,
    updateColor,
    deleteColor,
    addEmpleado,
    updateEmpleado,
    deleteEmpleado,
    setEmpleadoActivo,
    getHerramientasEmpleado,
    addHerramienta,
    updateHerramienta,
    deleteHerramienta,
    addPrestamo,
    abonarPrestamo,
    deletePrestamo,
    addNomina,
    deleteNomina,
    addMovimiento,
    deleteMovimiento,
    addComprobanteMovimiento,
    getBalance,
    getMovimientos,
    getReporte,
    getReporteVentas,
    getReporteMateriales,
    getDashboard,
    getProduccionDashboard,
    chequearMaterialOrden,
    getUsuarios,
    addUsuario,
    deleteUsuario,
    resetUsuarioPassword,
    updateUsuarioPermisos,
    getCosteos,
    addCosteo,
    updateCosteo,
    deleteCosteo,
    addCliente,
    updateCliente,
    deleteCliente,
    getClienteAnticipos,
    addAnticipo,
    deleteAnticipo,
    addPedido,
    updatePedido,
    deletePedido,
    convertirPedido,
    addVenta,
    updateVenta,
    deleteVenta,
    registrarPagoVenta,
    registrarAbonoGlobal,
    addTarea,
    addTareas,
    updateTarea,
    terminarTarea,
    deleteTarea,
    getTareaHistorial,
    getTareaFotos,
    addTareaFoto,
    deleteTareaFoto,
    getTareaPiezas,
    setTareaPiezaVerificada,
    addTareaProduccion,
    updateTareaProduccion,
    terminarTareaProduccion,
    deleteTareaProduccion,
    getTareaProduccionHistorial,
    addOrdenProduccion,
    updateOrdenProduccion,
    terminarOrdenProduccion,
    getUnidadesOrden,
    setGarantiaOrden,
    deleteOrdenProduccion,
    cambiarEstadoOrden,
    cancelarOrdenProduccion,
    addMaterial,
    updateMaterial,
    deleteMaterial,
    registrarEntradaMaterial,
    getMaterialMovimientos,
    getLaminas,
    addLamina,
    updateLamina,
    deleteLamina,
    getPiezas,
    guardarPiezas,
    calcularCorte,
    getPlanos,
    getPlano,
    guardarPlano,
    deletePlano,
    addProcesoGlobal,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData debe usarse dentro de DataProvider')
  return ctx
}

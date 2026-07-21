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
  const [colores, setColores] = useState([])
  const [procesosGlobales, setProcesosGlobales] = useState([])
  const [clientes, setClientes] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [ventas, setVentas] = useState([])
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
      const [prod, emp, pres, nom, mov, empr, tar, tarProd, ordProd, mat, procG, cli, ped, ven, col] = await Promise.all([
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
        cargarSiPuede(puedeLeer(['gestion-produccion', 'ver'], ['reportes', 'ver']), '/tareas-produccion', []),
        cargarSiPuede(puedeLeer(['gestion-produccion', 'ver'], ['reportes', 'ver']), '/ordenes-produccion', []),
        cargarSiPuede(puedeLeer(['materiales', 'ver']), '/materiales', []),
        cargarSiPuede(puedeLeer(['productos', 'ver']), '/procesos-globales', []),
        cargarSiPuede(puedeLeer(['clientes', 'ver'], ['ventas', 'ver'], ['pedidos', 'ver']), '/clientes', []),
        cargarSiPuede(puedeLeer(['pedidos', 'ver'], ['ventas', 'ver']), '/pedidos', []),
        cargarSiPuede(puedeLeer(['ventas', 'ver']), '/ventas', []),
        cargarSiPuede(puedeLeer(['colores', 'ver'], ['materiales', 'ver'], ['productos', 'ver'], ['gestion-produccion', 'ver'], ['pedidos', 'ver'], ['ventas', 'ver']), '/colores', []),
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
      setClientes(cli)
      setPedidos(ped)
      setVentas(ven)
      setColores(col)
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
  // `datos` incluye nombre, procesos y los campos nuevos (descripcion, valorVenta,
  // valorCompra, stockApertura, stockMinimo). Se manda el objeto completo.
  const addProducto = async (datos) => {
    await http('/productos', { method: 'POST', body: JSON.stringify(datos) })
    await recargar()
  }
  const updateProducto = async (id, datos) => {
    await http(`/productos/${id}`, { method: 'PUT', body: JSON.stringify(datos) })
    await recargar()
  }
  const deleteProducto = async (id) => {
    await http(`/productos/${id}`, { method: 'DELETE' })
    await recargar()
  }
  const registrarEntradaProducto = async (id, entrada) => {
    const actualizado = await http(`/productos/${id}/entrada`, { method: 'POST', body: JSON.stringify(entrada) })
    await recargar()
    return actualizado
  }
  const getProductoMovimientos = (id) => http(`/productos/${id}/movimientos`)

  // Variantes (colores) de un producto
  const addVariante = async (productoId, datos) => {
    await http(`/productos/${productoId}/variantes`, { method: 'POST', body: JSON.stringify(datos) })
    await recargar()
  }
  const updateVariante = async (productoId, varId, datos) => {
    await http(`/productos/${productoId}/variantes/${varId}`, { method: 'PUT', body: JSON.stringify(datos) })
    await recargar()
  }
  const deleteVariante = async (productoId, varId) => {
    await http(`/productos/${productoId}/variantes/${varId}`, { method: 'DELETE' })
    await recargar()
  }

  // ---------- COLORES ----------
  const addColor = async (color) => {
    await http('/colores', { method: 'POST', body: JSON.stringify(color) })
    await recargar()
  }
  const updateColor = async (id, color) => {
    await http(`/colores/${id}`, { method: 'PUT', body: JSON.stringify(color) })
    await recargar()
  }
  const deleteColor = async (id) => {
    await http(`/colores/${id}`, { method: 'DELETE' })
    await recargar()
  }

  // ---------- CLIENTES ----------
  const addCliente = async (cliente) => {
    const creado = await http('/clientes', { method: 'POST', body: JSON.stringify(cliente) })
    await recargar()
    return creado
  }
  const updateCliente = async (id, cliente) => {
    const actualizado = await http(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(cliente) })
    await recargar()
    return actualizado
  }
  const deleteCliente = async (id) => {
    await http(`/clientes/${id}`, { method: 'DELETE' })
    await recargar()
  }
  const getClienteAnticipos = (id) => http(`/clientes/${id}/anticipos`)
  const addAnticipo = async (clienteId, anticipo) => {
    const actualizado = await http(`/clientes/${clienteId}/anticipos`, { method: 'POST', body: JSON.stringify(anticipo) })
    await recargar()
    return actualizado
  }
  const deleteAnticipo = async (clienteId, anticipoId) => {
    await http(`/clientes/${clienteId}/anticipos/${anticipoId}`, { method: 'DELETE' })
    await recargar()
  }

  // ---------- PEDIDOS ----------
  const addPedido = async (pedido) => {
    const creado = await http('/pedidos', { method: 'POST', body: JSON.stringify(pedido) })
    await recargar()
    return creado
  }
  const updatePedido = async (id, pedido) => {
    const actualizado = await http(`/pedidos/${id}`, { method: 'PUT', body: JSON.stringify(pedido) })
    await recargar()
    return actualizado
  }
  const deletePedido = async (id) => {
    await http(`/pedidos/${id}`, { method: 'DELETE' })
    await recargar()
  }
  const convertirPedido = async (id, opciones) => {
    const venta = await http(`/pedidos/${id}/convertir`, { method: 'POST', body: JSON.stringify(opciones || {}) })
    await recargar()
    return venta
  }

  // ---------- VENTAS ----------
  const addVenta = async (venta) => {
    const creada = await http('/ventas', { method: 'POST', body: JSON.stringify(venta) })
    await recargar()
    return creada
  }
  const updateVenta = async (id, venta) => {
    const actualizada = await http(`/ventas/${id}`, { method: 'PUT', body: JSON.stringify(venta) })
    await recargar()
    return actualizada
  }
  const deleteVenta = async (id) => {
    await http(`/ventas/${id}`, { method: 'DELETE' })
    await recargar()
  }
  const registrarPagoVenta = async (id, pago) => {
    const actualizada = await http(`/ventas/${id}/pagos`, { method: 'POST', body: JSON.stringify(pago) })
    await recargar()
    return actualizada
  }
  // Abono global: reparte un pago entre todas las facturas pendientes de un cliente
  const registrarAbonoGlobal = async (clienteId, abono) => {
    const resultado = await http(`/clientes/${clienteId}/abono-global`, { method: 'POST', body: JSON.stringify(abono) })
    await recargar()
    return resultado
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
  const setEmpleadoActivo = async (id, activo) => {
    await http(`/empleados/${id}/activo`, { method: 'PUT', body: JSON.stringify({ activo }) })
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
  const addComprobanteMovimiento = async (id, datos) => {
    const actualizado = await http(`/movimientos/${id}/comprobante`, { method: 'PUT', body: JSON.stringify(datos) })
    await recargar()
    return actualizado
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
  const getReporteVentas = (desde, hasta) =>
    http(`/reportes/ventas?desde=${desde}&hasta=${hasta}`)
  const getReporteMateriales = (desde, hasta) =>
    http(`/reportes/materiales?desde=${desde}&hasta=${hasta}`)

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
    const creada = await http('/tareas', { method: 'POST', body: JSON.stringify(tarea) })
    await recargar()
    return creada
  }
  // Crea varias tareas (p. ej. varios productos/procesos para un mismo empleado)
  // recargando una sola vez al final, en vez de una recarga completa por cada una.
  const addTareas = async (tareasArr) => {
    const creadas = []
    for (const t of tareasArr) {
      creadas.push(await http('/tareas', { method: 'POST', body: JSON.stringify(t) }))
    }
    await recargar()
    return creadas
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
  const cambiarEstadoOrden = async (id, estado) => {
    const actualizada = await http(`/ordenes-produccion/${id}/estado`, { method: 'POST', body: JSON.stringify({ estado }) })
    await recargar()
    return actualizada
  }
  const cancelarOrdenProduccion = async (id) => {
    const actualizada = await http(`/ordenes-produccion/${id}/cancelar`, { method: 'POST' })
    await recargar()
    return actualizada
  }
  // Chequeo preventivo de materiales (MRP): no muta nada, solo consulta faltantes.
  const chequearMaterialOrden = (params) =>
    http('/produccion/chequeo-material', { method: 'POST', body: JSON.stringify(params) })
  // Unidades (folios) de una orden terminada, para imprimir las pegatinas QR.
  const getUnidadesOrden = (id) => http(`/ordenes-produccion/${id}/unidades`)
  const setGarantiaOrden = (id, garantiaMeses) =>
    http(`/ordenes-produccion/${id}/garantia`, { method: 'PUT', body: JSON.stringify({ garantiaMeses }) })

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
    colores,
    procesosGlobales,
    clientes,
    pedidos,
    ventas,
    cargando,
    error,
    recargar,
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

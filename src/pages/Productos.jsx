import { useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP, formatFecha, hoyISO } from '../utils/format.js'
import { notify, confirmar } from '../utils/notify.js'
import Vacio from '../components/Vacio.jsx'

const NUEVO_PROCESO = '__nuevo__'
const emptyProceso = () => ({ nombre: '', pago: '', materiales: [] })
const emptyRecetaFila = () => ({ materialId: '', cantidad: '', porColor: false, familia: '' })
const hoy = hoyISO
const emptyEntrada = () => ({ cantidad: '', costoUnitario: '', fecha: hoy(), descripcion: '', varianteId: '' })
const TIPO_MOV_LABEL = { entrada: 'Compra', produccion: 'Producción' }
const emptyDatos = () => ({
  descripcion: '', valorVenta: '', valorCompra: '', stockApertura: '', stockMinimo: '',
})

// Un producto tiene stock bajo si su stock actual no supera el mínimo de alerta (>0)
const stockBajo = (p) => p.stockMinimo > 0 && p.stock <= p.stockMinimo

export default function Productos() {
  const {
    productos, procesosGlobales, materiales, addProducto, updateProducto, deleteProducto, addProcesoGlobal,
    registrarEntradaProducto, getProductoMovimientos,
  } = useData()
  const { colores, addVariante, updateVariante, deleteVariante } = useData()
  const { puede } = useAuth()
  const puedeCrear = puede('productos', 'crear')
  const puedeEditar = puede('productos', 'editar')
  const puedeEliminar = puede('productos', 'eliminar')

  const [nombre, setNombre] = useState('')
  const [datos, setDatos] = useState(emptyDatos())
  const [procesos, setProcesos] = useState([emptyProceso()])
  const [editId, setEditId] = useState(null)
  const [formAbierto, setFormAbierto] = useState(false)

  // Buscador (por nombre, código o descripción)
  const [busqueda, setBusqueda] = useState('')

  // Fila que está creando un proceso nuevo en el catálogo global (índice o null)
  const [filaNuevoProceso, setFilaNuevoProceso] = useState(null)
  const [nombreNuevoProceso, setNombreNuevoProceso] = useState('')

  // Producto cuyo detalle se muestra en el modal (id o null)
  const [detalleId, setDetalleId] = useState(null)
  const productoDetalle = productos.find((p) => p.id === detalleId)

  // Alta de variante (color) dentro del modal de detalle
  const [nuevaVarColor, setNuevaVarColor] = useState('')
  const agregarVariante = async () => {
    if (!nuevaVarColor) { notify.error('Elige un color'); return }
    try {
      await addVariante(detalleId, { colorId: Number(nuevaVarColor), stockApertura: 0, stockMinimo: 0 })
      setNuevaVarColor('')
      notify.ok('Color agregado al producto')
    } catch (err) {
      notify.error('Error: ' + err.message)
    }
  }
  const guardarVariante = async (v, cambios) => {
    try {
      await updateVariante(detalleId, v.id, {
        stockApertura: cambios.stockApertura != null ? cambios.stockApertura : v.stockApertura,
        stockMinimo: cambios.stockMinimo != null ? cambios.stockMinimo : v.stockMinimo,
      })
      notify.ok('Variante actualizada')
    } catch (err) {
      notify.error('Error: ' + err.message)
    }
  }
  const quitarVariante = async (v) => {
    if (!(await confirmar(`¿Quitar el color "${v.colorNombre || 'sin color'}" de este producto?`))) return
    try {
      await deleteVariante(detalleId, v.id)
      notify.ok('Color quitado')
    } catch (err) {
      notify.error('Error: ' + err.message)
    }
  }

  // Movimientos (compra/producción) — en su propio modal
  const [movimientos, setMovimientos] = useState([])
  const [movimientosProd, setMovimientosProd] = useState(null) // producto cuyos movimientos se ven

  // Entrada de producto comprado
  const [entradaProd, setEntradaProd] = useState(null) // producto al que se le registra entrada
  const [entradaForm, setEntradaForm] = useState(emptyEntrada())
  const [guardandoEntrada, setGuardandoEntrada] = useState(false)

  const setDato = (campo, val) => setDatos((d) => ({ ...d, [campo]: val }))
  const setEntradaField = (campo, val) => setEntradaForm((f) => ({ ...f, [campo]: val }))

  const abrirDetalle = (prod) => setDetalleId(prod.id)

  const abrirMovimientos = async (prod) => {
    setMovimientosProd(prod)
    setMovimientos([])
    try {
      setMovimientos(await getProductoMovimientos(prod.id))
    } catch (err) {
      notify.error('Error al cargar movimientos: ' + err.message)
    }
  }
  const cerrarMovimientos = () => {
    setMovimientosProd(null)
    setMovimientos([])
  }

  const abrirEntrada = (prod) => {
    setEntradaProd(prod)
    setEntradaForm({
      ...emptyEntrada(),
      costoUnitario: prod.valorCompra ? String(prod.valorCompra) : '',
      varianteId: (prod.variantes && prod.variantes[0]) ? String(prod.variantes[0].id) : '',
    })
  }
  const cerrarEntrada = () => {
    setEntradaProd(null)
    setEntradaForm(emptyEntrada())
  }

  const handleSubmitEntrada = async (e) => {
    e.preventDefault()
    if (!(Number(entradaForm.cantidad) > 0)) { notify.error('Indica una cantidad mayor a 0'); return }
    setGuardandoEntrada(true)
    try {
      await registrarEntradaProducto(entradaProd.id, {
        cantidad: Number(entradaForm.cantidad),
        costoUnitario: Number(entradaForm.costoUnitario) || 0,
        fecha: entradaForm.fecha,
        descripcion: entradaForm.descripcion,
        varianteId: entradaForm.varianteId ? Number(entradaForm.varianteId) : null,
      })
      notify.ok('Entrada registrada')
      cerrarEntrada()
    } catch (err) {
      notify.error('Error al registrar la entrada: ' + err.message)
    } finally {
      setGuardandoEntrada(false)
    }
  }

  const resetForm = () => {
    setNombre('')
    setDatos(emptyDatos())
    setProcesos([emptyProceso()])
    setEditId(null)
    setFilaNuevoProceso(null)
    setNombreNuevoProceso('')
    setFormAbierto(false)
  }

  const setProcesoField = (i, field, val) => {
    setProcesos((ps) => ps.map((p, idx) => (idx === i ? { ...p, [field]: val } : p)))
  }

  const addProcesoRow = () => setProcesos((ps) => [...ps, emptyProceso()])
  const removeProcesoRow = (i) => {
    setProcesos((ps) => (ps.length === 1 ? ps : ps.filter((_, idx) => idx !== i)))
    if (filaNuevoProceso === i) {
      setFilaNuevoProceso(null)
      setNombreNuevoProceso('')
    }
  }

  const handleSelectProceso = (i, val) => {
    if (val === NUEVO_PROCESO) {
      setFilaNuevoProceso(i)
      setNombreNuevoProceso('')
      return
    }
    setProcesoField(i, 'nombre', val)
  }

  const guardarNuevoProceso = async (i) => {
    if (!nombreNuevoProceso.trim()) { notify.error('Escribe el nombre del proceso'); return }
    try {
      const creado = await addProcesoGlobal(nombreNuevoProceso)
      setProcesoField(i, 'nombre', creado.nombre)
      setFilaNuevoProceso(null)
      setNombreNuevoProceso('')
      notify.ok('Proceso agregado al catálogo')
    } catch (err) {
      notify.error('Error al crear el proceso: ' + err.message)
    }
  }

  const cancelarNuevoProceso = () => {
    setFilaNuevoProceso(null)
    setNombreNuevoProceso('')
  }

  // ---------- Receta de materiales por proceso (dentro del formulario) ----------
  const setRecetaFila = (procesoIdx, filaIdx, field, val) => {
    setProcesos((ps) =>
      ps.map((p, idx) => {
        if (idx !== procesoIdx) return p
        const nuevasMateriales = p.materiales.map((m, mi) => (mi === filaIdx ? { ...m, [field]: val } : m))
        return { ...p, materiales: nuevasMateriales }
      })
    )
  }
  const addRecetaFila = (procesoIdx) => {
    setProcesos((ps) =>
      ps.map((p, idx) => (idx === procesoIdx ? { ...p, materiales: [...p.materiales, emptyRecetaFila()] } : p))
    )
  }
  const removeRecetaFila = (procesoIdx, filaIdx) => {
    setProcesos((ps) =>
      ps.map((p, idx) =>
        idx === procesoIdx ? { ...p, materiales: p.materiales.filter((_, mi) => mi !== filaIdx) } : p
      )
    )
  }
  const unidadDeMaterial = (materialId) => materiales.find((m) => String(m.id) === String(materialId))?.unidad || ''

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!nombre.trim()) { notify.error('Escribe el nombre del producto'); return }
    const validos = procesos
      .filter((p) => p.nombre.trim())
      .map((p) => ({
        ...p,
        materiales: p.materiales.filter((m) =>
          Number(m.cantidad) > 0 && (m.porColor ? !!m.familia : !!m.materialId)
        ),
      }))
    if (validos.length === 0) { notify.error('Agrega al menos un proceso'); return }

    const editando = Boolean(editId)
    const ok = await confirmar(
      editando
        ? `¿Guardar los cambios de "${nombre.trim()}"?`
        : `¿Crear el producto "${nombre.trim()}" con ${validos.length} proceso(s)?`,
      { titulo: editando ? 'Guardar producto' : 'Crear producto', textoOk: editando ? 'Sí, guardar' : 'Sí, crear', peligro: false }
    )
    if (!ok) return

    const payload = {
      nombre: nombre.trim(),
      procesos: validos,
      descripcion: datos.descripcion,
      valorVenta: datos.valorVenta,
      valorCompra: datos.valorCompra,
      stockApertura: datos.stockApertura,
      stockMinimo: datos.stockMinimo,
    }
    try {
      if (editando) {
        await updateProducto(editId, payload)
        notify.ok('Producto actualizado')
      } else {
        await addProducto(payload)
        notify.ok('Producto creado')
      }
      resetForm()
    } catch (err) {
      notify.error('Error al guardar el producto: ' + err.message)
    }
  }

  const startEdit = (prod) => {
    setEditId(prod.id)
    setNombre(prod.nombre)
    setDatos({
      descripcion: prod.descripcion || '',
      valorVenta: prod.valorVenta ? String(prod.valorVenta) : '',
      valorCompra: prod.valorCompra ? String(prod.valorCompra) : '',
      stockApertura: prod.stockApertura ? String(prod.stockApertura) : '',
      stockMinimo: prod.stockMinimo ? String(prod.stockMinimo) : '',
    })
    setProcesos(
      prod.procesos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        pago: p.pago,
        materiales: (p.materiales || []).map((m) => ({
          materialId: m.materialId ? String(m.materialId) : '',
          cantidad: String(m.cantidad),
          porColor: !!m.porColor,
          familia: m.familia || '',
        })),
      }))
    )
    setFilaNuevoProceso(null)
    setNombreNuevoProceso('')
    setFormAbierto(true)
  }

  // Valor del stock inicial = stock de apertura × valor de compra (se muestra en vivo)
  const valorStockInicial = (Number(datos.stockApertura) || 0) * (Number(datos.valorCompra) || 0)

  // Opciones del desplegable: catálogo global + (por robustez) el nombre actual
  // de la fila si por algún motivo no está en el catálogo, para no perder el dato.
  const opcionesProceso = (nombreActual) => {
    const nombres = procesosGlobales.map((p) => p.nombre)
    if (nombreActual && !nombres.some((n) => n.toLowerCase() === nombreActual.toLowerCase())) {
      nombres.push(nombreActual)
    }
    return [...nombres].sort((a, b) => a.localeCompare(b))
  }

  const materialesOrdenados = [...materiales].sort((a, b) => a.nombre.localeCompare(b.nombre))

  // Familias de material con color definido (para las líneas de receta "por color")
  const familiasDisponibles = [...new Set(
    materiales.filter((m) => m.familia && m.colorId).map((m) => m.familia)
  )].sort((a, b) => a.localeCompare(b))
  // Unidad de una familia = la del primer material de esa familia
  const unidadDeFamilia = (fam) => materiales.find((m) => m.familia === fam)?.unidad || ''

  // Filtra los productos por nombre, código o descripción (búsqueda insensible a mayúsculas)
  const q = busqueda.trim().toLowerCase()
  const productosFiltrados = q
    ? productos.filter((p) =>
        (p.nombre || '').toLowerCase().includes(q) ||
        (p.codigo || '').toLowerCase().includes(q) ||
        (p.descripcion || '').toLowerCase().includes(q)
      )
    : productos

  return (
    <div>
      <h2>📦 Productos y procesos</h2>
      <p className="muted">
        Define cada producto (ej: "Armario 3 cuerpos") y los procesos que se le hacen
        (ej: pintura $5, armado $8). El pago es por unidad realizada. Si el proceso consume
        materiales (ej: corte gasta 1 lámina de MDF), agrégalos ahí mismo.
      </p>

      {puedeCrear && (
        <div className="form-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => { resetForm(); setFormAbierto(true) }}
          >
            + Nuevo producto
          </button>
        </div>
      )}

      {formAbierto && (puedeCrear || (editId && puedeEditar)) && (
      <>
      <div className="overlay" onClick={resetForm} />
      <form className="card modal modal-lg" onSubmit={handleSubmit}>
        <h3>{editId ? 'Editar producto' : 'Nuevo producto'}</h3>
        {editId && (
          <p className="muted small">Código: <strong>{productos.find((p) => p.id === editId)?.codigo || '—'}</strong> (se asigna automáticamente)</p>
        )}

        <div className="row">
          <div style={{ flex: 2 }}>
            <label>Nombre del producto</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Armario 3 cuerpos"
            />
          </div>
        </div>

        <label>Descripción</label>
        <input
          value={datos.descripcion}
          onChange={(e) => setDato('descripcion', e.target.value)}
          placeholder="Ej: Armario de 3 cuerpos en MDF, puertas corredizas"
        />

        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Valor de venta</label>
            <input
              type="number" min="0" step="any"
              value={datos.valorVenta}
              onChange={(e) => setDato('valorVenta', e.target.value)}
              placeholder="0"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label>Valor de compra</label>
            <input
              type="number" min="0" step="any"
              value={datos.valorCompra}
              onChange={(e) => setDato('valorCompra', e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Stock de apertura</label>
            <input
              type="number" min="0" step="any"
              value={datos.stockApertura}
              onChange={(e) => setDato('stockApertura', e.target.value)}
              placeholder="0"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label>Mínimo de alerta</label>
            <input
              type="number" min="0" step="any"
              value={datos.stockMinimo}
              onChange={(e) => setDato('stockMinimo', e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        <p className="muted small">
          Valor del stock inicial (apertura × valor de compra): <strong>{formatCOP(valorStockInicial)}</strong>.
          {' '}El stock se abastece solo cuando termina una orden de producción de este producto.
        </p>

        <label>Procesos</label>
        {procesos.map((p, i) => (
          <div className="proceso-block" key={i}>
            {filaNuevoProceso === i ? (
              <div className="row">
                <input
                  style={{ flex: 2 }}
                  autoFocus
                  value={nombreNuevoProceso}
                  onChange={(e) => setNombreNuevoProceso(e.target.value)}
                  placeholder="Nombre del proceso nuevo (ej: Tapizado)"
                />
                <button type="button" className="btn-primary" onClick={() => guardarNuevoProceso(i)}>
                  Guardar
                </button>
                <button type="button" className="btn-secondary" onClick={cancelarNuevoProceso}>
                  Cancelar
                </button>
              </div>
            ) : (
              <>
                <div className="row">
                  <select
                    style={{ flex: 2 }}
                    value={p.nombre}
                    onChange={(e) => handleSelectProceso(i, e.target.value)}
                  >
                    <option value="">— Selecciona un proceso —</option>
                    {opcionesProceso(p.nombre).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                    <option value={NUEVO_PROCESO}>+ Agregar proceso nuevo…</option>
                  </select>
                  <input
                    style={{ flex: 1 }}
                    type="number"
                    min="0"
                    step="any"
                    value={p.pago}
                    onChange={(e) => setProcesoField(i, 'pago', e.target.value)}
                    placeholder="Pago x unidad"
                  />
                  <button type="button" className="btn-icon danger" onClick={() => removeProcesoRow(i)}>
                    ✕
                  </button>
                </div>

                <div className="receta-materiales">
                  <span className="muted small">Materiales que consume este proceso</span>
                  {p.materiales.map((m, mi) => (
                    <div key={mi} style={{ borderBottom: '1px dashed #e5e7eb', paddingBottom: 6, marginBottom: 6 }}>
                      <div className="row">
                        {m.porColor ? (
                          <select
                            style={{ flex: 2 }}
                            value={m.familia}
                            onChange={(e) => setRecetaFila(i, mi, 'familia', e.target.value)}
                          >
                            <option value="">— Familia (según color) —</option>
                            {familiasDisponibles.map((f) => (
                              <option key={f} value={f}>{f} (según color)</option>
                            ))}
                          </select>
                        ) : (
                          <select
                            style={{ flex: 2 }}
                            value={m.materialId}
                            onChange={(e) => setRecetaFila(i, mi, 'materialId', e.target.value)}
                          >
                            <option value="">— Material —</option>
                            {materialesOrdenados.map((mat) => (
                              <option key={mat.id} value={mat.id}>{mat.nombre}</option>
                            ))}
                          </select>
                        )}
                        <input
                          style={{ flex: 1 }}
                          type="number"
                          min="0"
                          step="any"
                          value={m.cantidad}
                          onChange={(e) => setRecetaFila(i, mi, 'cantidad', e.target.value)}
                          placeholder="Cantidad"
                        />
                        <span className="muted small" style={{ flex: 1 }}>
                          {m.porColor ? unidadDeFamilia(m.familia) : unidadDeMaterial(m.materialId)}
                        </span>
                        <button type="button" className="btn-icon danger" onClick={() => removeRecetaFila(i, mi)}>
                          ✕
                        </button>
                      </div>
                      <label className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <input
                          type="checkbox"
                          checked={!!m.porColor}
                          onChange={(e) => setRecetaFila(i, mi, 'porColor', e.target.checked)}
                          style={{ width: 'auto', margin: 0 }}
                        />
                        Depende del color (ej: vinilo/laca del color de la variante)
                      </label>
                    </div>
                  ))}
                  <button type="button" className="btn-secondary" onClick={() => addRecetaFila(i)}>
                    + Agregar material
                  </button>
                  {familiasDisponibles.length === 0 && (
                    <p className="muted small" style={{ marginTop: 4 }}>
                      Para usar materiales "según color", primero crea materiales con familia y color en 🧱 Materiales.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
        <button type="button" className="btn-secondary" onClick={addProcesoRow}>
          + Agregar proceso
        </button>

        <div className="form-actions">
          <button type="submit" className="btn-primary">
            {editId ? 'Guardar cambios' : 'Crear producto'}
          </button>
          <button type="button" className="btn-secondary" onClick={resetForm}>
            Cancelar
          </button>
        </div>
      </form>
      </>
      )}

      <div className="card">
        <h3>Productos registrados ({productos.length})</h3>

        {productos.length > 0 && (
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="🔎 Buscar por nombre, código o descripción…"
            style={{ marginBottom: 12 }}
          />
        )}

        {productos.length === 0 && (
          <Vacio icono="📦" titulo="Aún no hay productos">
            Crea el primero para empezar a fabricar y cotizar.
          </Vacio>
        )}
        {productos.length > 0 && productosFiltrados.length === 0 && (
          <p className="muted">Ningún producto coincide con la búsqueda.</p>
        )}

        {productosFiltrados.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th className="num">V. compra</th>
                  <th className="num">V. venta</th>
                  <th className="num">Stock</th>
                  <th className="num">Mínimo</th>
                  <th className="num">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productosFiltrados.map((prod) => (
                  <tr
                    key={prod.id}
                    className={`chip-clicable ${stockBajo(prod) ? 'fila-alerta' : ''}`}
                    onClick={() => abrirDetalle(prod)}
                  >
                    <td className="muted small">{prod.codigo}</td>
                    <td>
                      <strong>{prod.nombre}</strong>
                      {prod.descripcion && <div className="muted small">{prod.descripcion}</div>}
                    </td>
                    <td className="num">{formatCOP(prod.valorCompra)}</td>
                    <td className="num">{formatCOP(prod.valorVenta)}</td>
                    <td className="num">
                      {prod.stock}
                      {stockBajo(prod) && <span className="chip warn" style={{ marginLeft: 8 }}>⚠️ Bajo</span>}
                    </td>
                    <td className="num">{prod.stockMinimo}</td>
                    <td className="num">
                      <div className="actions" style={{ justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                        <button className="btn-secondary btn-sm" onClick={() => abrirMovimientos(prod)}>
                          🕑 Movimientos
                        </button>
                        {puedeCrear && (
                          <button className="btn-secondary btn-sm" onClick={() => abrirEntrada(prod)}>
                            + Entrada
                          </button>
                        )}
                        {puedeEditar && (
                          <button className="btn-secondary btn-sm" onClick={() => startEdit(prod)}>
                            Editar
                          </button>
                        )}
                        {puedeEliminar && (
                          <button
                            className="btn-danger btn-sm"
                            onClick={async () => {
                              if (await confirmar(`¿Eliminar "${prod.nombre}"?`)) deleteProducto(prod.id)
                            }}
                          >
                            Eliminar
                          </button>
                        )}
                        {!puedeCrear && !puedeEditar && !puedeEliminar && <span className="muted small">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: detalle del producto (stock, procesos y receta) */}
      {productoDetalle && (
        <>
          <div className="overlay" onClick={() => setDetalleId(null)} />
          <div className="modal">
            <h3>{productoDetalle.codigo} — {productoDetalle.nombre}</h3>
            {productoDetalle.descripcion && (
              <p className="muted small" style={{ marginTop: 0 }}>{productoDetalle.descripcion}</p>
            )}

            {/* Variantes por color: el stock del inventario vive por variante */}
            <p className="muted small" style={{ marginTop: 8, marginBottom: 4 }}>
              <strong>Colores y stock</strong>
            </p>
            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Color</th>
                    <th className="num">Stock</th>
                    <th className="num">Apertura</th>
                    <th className="num">Mínimo</th>
                    {puedeEditar && <th className="num">Acción</th>}
                  </tr>
                </thead>
                <tbody>
                  {(productoDetalle.variantes || []).map((v) => (
                    <tr key={v.id} className={v.stockMinimo > 0 && v.stock <= v.stockMinimo ? 'fila-alerta' : ''}>
                      <td>
                        {v.colorHex && (
                          <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 4, background: v.colorHex, border: '1px solid #d1d5db', marginRight: 6, verticalAlign: 'middle' }} />
                        )}
                        {v.colorNombre || <span className="muted">Sin color</span>}
                      </td>
                      <td className="num"><strong>{v.stock}</strong></td>
                      <td className="num">
                        {puedeEditar ? (
                          <input
                            type="number" min="0" step="any" defaultValue={v.stockApertura}
                            style={{ width: 70, textAlign: 'right' }}
                            onBlur={(e) => { const nv = Number(e.target.value) || 0; if (nv !== v.stockApertura) guardarVariante(v, { stockApertura: nv }) }}
                          />
                        ) : v.stockApertura}
                      </td>
                      <td className="num">
                        {puedeEditar ? (
                          <input
                            type="number" min="0" step="any" defaultValue={v.stockMinimo}
                            style={{ width: 70, textAlign: 'right' }}
                            onBlur={(e) => { const nv = Number(e.target.value) || 0; if (nv !== v.stockMinimo) guardarVariante(v, { stockMinimo: nv }) }}
                          />
                        ) : (v.stockMinimo || <span className="muted">—</span>)}
                      </td>
                      {puedeEditar && (
                        <td className="num">
                          {(productoDetalle.variantes || []).length > 1
                            ? <button className="btn-danger btn-sm" onClick={() => quitarVariante(v)}>Quitar</button>
                            : <span className="muted small">—</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {puedeEditar && (
              <div className="row" style={{ marginTop: 6, alignItems: 'flex-end' }}>
                <div style={{ flex: 2 }}>
                  <label className="muted small">Agregar color</label>
                  <select value={nuevaVarColor} onChange={(e) => setNuevaVarColor(e.target.value)}>
                    <option value="">— Elige un color —</option>
                    {colores
                      .filter((c) => !(productoDetalle.variantes || []).some((v) => v.colorId === c.id))
                      .map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <button type="button" className="btn-secondary" onClick={agregarVariante}>+ Agregar</button>
              </div>
            )}
            <p className="muted small" style={{ marginTop: 4 }}>
              El stock de cada color entra por producción o por "+ Entrada". La apertura y el mínimo se editan aquí mismo.
            </p>

            <p className="muted small" style={{ marginTop: 8, marginBottom: 4 }}>
              <strong>Procesos y materiales</strong>
            </p>
            {productoDetalle.procesos.length === 0 && (
              <p className="muted small">Este producto no tiene procesos.</p>
            )}
            {productoDetalle.procesos.length > 0 && (
              <div className="table-wrap">
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>Proceso</th>
                      <th className="num">Mano de obra</th>
                      <th>Materiales configurados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productoDetalle.procesos.map((p) => (
                      <tr key={p.id}>
                        <td><strong>{p.nombre}</strong></td>
                        <td className="num">{formatCOP(p.pago)}</td>
                        <td>
                          {(!p.materiales || p.materiales.length === 0) ? (
                            <span className="muted small">Sin materiales</span>
                          ) : (
                            <div className="chips">
                              {p.materiales.map((m) => (
                                <span className="chip" key={m.id}>
                                  {m.materialNombre}: {m.cantidad} {m.unidad}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="form-actions">
              <button className="btn-secondary" onClick={() => { const p = productoDetalle; setDetalleId(null); abrirMovimientos(p) }}>
                🕑 Movimientos
              </button>
              {puedeCrear && (
                <button className="btn-secondary" onClick={() => { const p = productoDetalle; setDetalleId(null); abrirEntrada(p) }}>
                  + Entrada
                </button>
              )}
              {puedeEditar && (
                <button className="btn-primary" onClick={() => { const p = productoDetalle; setDetalleId(null); startEdit(p) }}>
                  Editar
                </button>
              )}
              <button className="btn-secondary" onClick={() => setDetalleId(null)}>Cerrar</button>
            </div>
          </div>
        </>
      )}

      {/* Modal: movimientos de stock del producto (compras y producción) */}
      {movimientosProd && (
        <>
          <div className="overlay" onClick={cerrarMovimientos} />
          <div className="modal">
            <h3>Movimientos de "{movimientosProd.nombre}"</h3>
            <p className="muted small" style={{ marginTop: 0 }}>Entradas por compra y abastecimiento por producción.</p>
            {movimientos.length === 0 && (
              <Vacio icono="🕑" titulo="Sin movimientos registrados" />
            )}
            {movimientos.length > 0 && (
              <div className="table-wrap">
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th className="num">Cantidad</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map((m) => (
                      <tr key={m.id}>
                        <td>{formatFecha(m.fecha)}</td>
                        <td>
                          <span className={`chip ${m.tipo === 'entrada' ? 'ok' : ''}`}>
                            {TIPO_MOV_LABEL[m.tipo] || m.tipo}
                          </span>
                        </td>
                        <td className={`num ${m.cantidad < 0 ? 'texto-salida' : 'texto-entrada'}`}>
                          {m.cantidad < 0 ? '' : '+'}{m.cantidad}
                        </td>
                        <td className="muted small">{m.descripcion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="form-actions">
              <button className="btn-secondary" onClick={cerrarMovimientos}>Cerrar</button>
            </div>
          </div>
        </>
      )}

      {/* Modal: registrar entrada de producto comprado */}
      {entradaProd && (
        <>
          <div className="overlay" onClick={cerrarEntrada} />
          <form className="modal" onSubmit={handleSubmitEntrada}>
            <h3>Entrada de "{entradaProd.nombre}"</h3>
            <p className="muted small" style={{ marginTop: 0 }}>
              Para productos que compras en vez de fabricar. Suma al stock actual ({entradaProd.stock}).
            </p>
            {(entradaProd.variantes || []).length > 1 && (
              <>
                <label>Color</label>
                <select
                  value={entradaForm.varianteId}
                  onChange={(e) => setEntradaField('varianteId', e.target.value)}
                >
                  {entradaProd.variantes.map((v) => (
                    <option key={v.id} value={v.id}>{v.colorNombre || 'Sin color'} (stock {v.stock})</option>
                  ))}
                </select>
              </>
            )}
            <div className="row">
              <div style={{ flex: 1 }}>
                <label>Cantidad</label>
                <input
                  type="number" min="0" step="any" placeholder="0"
                  value={entradaForm.cantidad}
                  onChange={(e) => setEntradaField('cantidad', e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label>Valor de compra (unitario)</label>
                <input
                  type="number" min="0" step="any" placeholder="0"
                  value={entradaForm.costoUnitario}
                  onChange={(e) => setEntradaField('costoUnitario', e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label>Fecha</label>
                <input
                  type="date"
                  value={entradaForm.fecha}
                  onChange={(e) => setEntradaField('fecha', e.target.value)}
                />
              </div>
            </div>
            <label>Descripción (opcional)</label>
            <input
              value={entradaForm.descripcion}
              onChange={(e) => setEntradaField('descripcion', e.target.value)}
              placeholder="Ej: compra a proveedor X"
            />
            <p className="muted small">
              Si dejas el valor de compra en 0, no se cambia el actual. Si pones uno, actualiza el valor de compra del producto.
            </p>
            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={guardandoEntrada}>
                {guardandoEntrada ? 'Guardando…' : 'Registrar entrada'}
              </button>
              <button type="button" className="btn-secondary" onClick={cerrarEntrada}>Cancelar</button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}

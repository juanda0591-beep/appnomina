import { useEffect, useMemo, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCOP } from '../utils/format.js'
import { calcularCosteo, costeoVacio } from '../utils/costeo.js'
import { generarPdfCosteo, descargarCSV } from '../utils/pdf.js'
import { notify, confirmar } from '../utils/notify.js'
import Vacio from '../components/Vacio.jsx'

// Colores para las porciones del gráfico de torta (uno por categoría de costo)
const COLORES = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626']

const uid = () => Math.random().toString(36).slice(2)

// ---- Gráfico de torta en SVG puro (sin librería) ----
// Recibe [{ label, valor, color }] y dibuja un círculo segmentado con stroke-dasharray.
function PieChart({ datos, size = 180 }) {
  const total = datos.reduce((s, d) => s + d.valor, 0)
  const radio = size / 2 - 10
  const circ = 2 * Math.PI * radio
  const centro = size / 2

  if (total <= 0) {
    return <p className="muted">Ingresa costos para ver el gráfico.</p>
  }

  let acumulado = 0
  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Transforma para que el primer segmento arranque arriba (12 en punto) */}
        <g transform={`rotate(-90 ${centro} ${centro})`}>
          {datos.map((d, i) => {
            const fraccion = d.valor / total
            const dash = fraccion * circ
            const offset = -acumulado * circ
            acumulado += fraccion
            if (d.valor <= 0) return null
            return (
              <circle
                key={i}
                cx={centro}
                cy={centro}
                r={radio}
                fill="none"
                stroke={d.color}
                strokeWidth={20}
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={offset}
              />
            )
          })}
        </g>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {datos.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 14, height: 14, background: d.color, borderRadius: 3, display: 'inline-block' }} />
            <span>{d.label}: <strong>{formatCOP(d.valor)}</strong>{' '}
              <span className="muted small">({total > 0 ? ((d.valor / total) * 100).toFixed(1) : 0}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Costos() {
  const { getCosteos, addCosteo, updateCosteo, deleteCosteo, empresa, productos, materiales } = useData()
  const { puede } = useAuth()

  const puedeCrear = puede('costos', 'crear')
  const puedeEditar = puede('costos', 'editar')
  const puedeEliminar = puede('costos', 'eliminar')
  const puedeExportar = puede('costos', 'exportar')

  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [msg, setMsg] = useState(null)

  // costeo en edición
  const [id, setId] = useState(null) // null = nuevo sin guardar
  const [nombre, setNombre] = useState('')
  const [productoId, setProductoId] = useState('') // producto ligado (opcional) para comparar costo real
  const [datos, setDatos] = useState(costeoVacio())
  const [guardando, setGuardando] = useState(false)

  const recargar = async () => {
    try {
      setLista(await getCosteos())
    } catch (e) {
      setMsg({ tipo: 'error', texto: e.message })
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { recargar() }, [])

  const r = useMemo(() => calcularCosteo(datos), [datos])

  // ---- helpers de edición del objeto datos ----
  const setCampo = (campo, val) => setDatos((d) => ({ ...d, [campo]: val }))

  const setEnLista = (campo, idx, sub, val) =>
    setDatos((d) => ({
      ...d,
      [campo]: d[campo].map((it, i) => (i === idx ? { ...it, [sub]: val } : it)),
    }))
  const addEnLista = (campo, item) => setDatos((d) => ({ ...d, [campo]: [...d[campo], item] }))
  const quitarDeLista = (campo, idx) =>
    setDatos((d) => ({ ...d, [campo]: d[campo].filter((_, i) => i !== idx) }))

  const nuevo = () => {
    setId(null)
    setNombre('')
    setProductoId('')
    setDatos(costeoVacio())
    setMsg(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const abrir = (c) => {
    setId(c.id)
    setNombre(c.nombre)
    setProductoId(c.productoId != null ? String(c.productoId) : '')
    setDatos({ ...costeoVacio(), ...c.datos })
    setMsg(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Construye insumos + mano de obra a partir de los procesos del producto:
  // - Cada material de la receta (de todos los procesos) se vuelve un insumo. Se
  //   consolidan los repetidos sumando cantidades; el precio unitario sale del
  //   costo actual del material en inventario.
  // - Cada proceso con pago > 0 se vuelve una línea de mano de obra (valor fijo/unidad).
  const datosDesdeProducto = (prod) => {
    const insumosMap = {}
    const manoObra = []
    for (const proc of prod.procesos || []) {
      for (const m of proc.materiales || []) {
        const mat = materiales.find((x) => String(x.id) === String(m.materialId))
        const key = String(m.materialId)
        if (!insumosMap[key]) {
          insumosMap[key] = {
            key: uid(),
            nombre: m.materialNombre || mat?.nombre || 'Material',
            cantidad: 0,
            unidad: m.unidad || mat?.unidad || '',
            precioUnitario: mat?.costoUnitario || 0,
          }
        }
        insumosMap[key].cantidad += Number(m.cantidad) || 0
      }
      if (Number(proc.pago) > 0) {
        manoObra.push({ key: uid(), nombre: proc.nombre, tipo: 'fijo', horas: '', valor: Number(proc.pago) })
      }
    }
    return { insumos: Object.values(insumosMap), manoObra }
  }

  // Al elegir un producto en el selector: lo vincula y ofrece precargar sus
  // materiales y mano de obra configurados (para no re-escribir lo mismo).
  const seleccionarProducto = async (prodIdStr) => {
    setProductoId(prodIdStr)
    if (!prodIdStr) return
    const prod = productos.find((p) => String(p.id) === String(prodIdStr))
    if (!prod) return

    const cargados = datosDesdeProducto(prod)
    if (cargados.insumos.length === 0 && cargados.manoObra.length === 0) {
      notify.error('Este producto no tiene materiales ni procesos con pago configurados')
      return
    }

    // Si ya hay datos escritos, pedir confirmación antes de reemplazarlos
    const hayDatos = datos.insumos.length > 0 || datos.manoObra.length > 0
    if (hayDatos) {
      const ok = await confirmar(
        'Se reemplazarán los materiales y la mano de obra actuales con los del producto. ¿Continuar?',
        { titulo: 'Cargar datos del producto', textoOk: 'Sí, cargar', peligro: false }
      )
      if (!ok) return
    }

    setDatos((d) => ({ ...d, insumos: cargados.insumos, manoObra: cargados.manoObra }))
    if (!nombre.trim()) setNombre(prod.nombre)
    notify.ok(`Cargados ${cargados.insumos.length} material(es) y ${cargados.manoObra.length} proceso(s) de "${prod.nombre}"`)
  }

  const guardar = async () => {
    if (!nombre.trim()) return setMsg({ tipo: 'error', texto: 'Escribe un nombre para el costeo' })
    setGuardando(true)
    setMsg(null)
    try {
      const prodId = productoId ? Number(productoId) : null
      if (id) {
        await updateCosteo(id, nombre.trim(), datos, prodId)
      } else {
        const creado = await addCosteo(nombre.trim(), datos, prodId)
        setId(creado.id)
      }
      setMsg({ tipo: 'ok', texto: '✅ Costeo guardado' })
      await recargar()
    } catch (e) {
      setMsg({ tipo: 'error', texto: e.message })
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async (c) => {
    if (!(await confirmar(`¿Eliminar el costeo "${c.nombre}"?`))) return
    try {
      await deleteCosteo(c.id)
      if (c.id === id) nuevo()
      await recargar()
    } catch (e) {
      setMsg({ tipo: 'error', texto: e.message })
    }
  }

  const exportarPdf = () => generarPdfCosteo({ empresa, nombre, r })

  const exportarCsv = () => {
    const filas = [
      ['Costeo', nombre],
      [],
      ['Categoría de costo', 'Costo por unidad'],
      ['Materiales', r.materialesUnit],
      ['Mano de obra', r.manoObraUnit],
      ['Indirectos', r.indirectosUnit],
      ['Imprevistos', r.imprevistoUnit],
      ['Costo total unitario', r.costoTotalUnit],
      [],
      ['Precio de venta', r.precioVenta],
      ['Ganancia unitaria', r.gananciaUnit],
      ['Margen %', r.margenPct.toFixed(2)],
      ['Markup %', r.markupPct.toFixed(2)],
      [],
      ['Tramo desde', 'Tramo hasta', '% descuento', 'Cantidad ref', 'Precio c/desc', 'Ganancia und', 'Ganancia tramo', 'Margen %', 'Alerta'],
      ...r.escenarios.map((e) => [
        e.min,
        e.max == null ? '+' : e.max,
        e.descuentoPct,
        e.cantidadRef,
        e.precioDesc,
        e.gananciaDescUnit,
        e.gananciaTramo,
        e.margenDescPct.toFixed(2),
        e.alerta ? 'SI' : '',
      ]),
    ]
    descargarCSV(`costeo_${(nombre || 'producto').replace(/\s+/g, '_')}.csv`, filas)
  }

  const pieData = r.desglose
    .map((d, i) => ({ label: d.categoria, valor: d.valor, color: COLORES[i] }))
    .filter((d) => d.valor > 0)

  return (
    <div>
      <h2>💲 Costos y rentabilidad de productos</h2>
      <p className="muted">
        Carga los costos de un producto, define el precio de venta y revisa la ganancia,
        el margen y los escenarios de descuento por volumen.
      </p>

      {msg && <div className={`banner ${msg.tipo === 'error' ? 'error' : ''}`}>{msg.texto}</div>}

      {/* ===== Costeos guardados ===== */}
      <div className="card">
        <div className="card-head">
          <h3>Costeos guardados</h3>
          {puedeCrear && <button className="btn-secondary" onClick={nuevo}>+ Nuevo costeo</button>}
        </div>
        {cargando ? (
          <p className="muted">Cargando…</p>
        ) : lista.length === 0 ? (
          <Vacio icono="💲" titulo="Aún no hay costeos guardados">
            Calcula y guarda un costeo para verlo aquí.
          </Vacio>
        ) : (
          lista.map((c) => (
            <div className="list-item" key={c.id}>
              <div>
                <strong>{c.nombre}</strong>{' '}
                {c.id === id && <span className="chip ok">abierto</span>}
              </div>
              <div className="actions">
                <button className="btn-secondary" onClick={() => abrir(c)}>Abrir</button>
                {puedeEliminar && (
                  <button className="btn-danger" onClick={() => eliminar(c)}>Eliminar</button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ===== Nombre del costeo ===== */}
      <div className="card">
        <div className="row">
          <div style={{ flex: 2 }}>
            <label>Nombre del producto / costeo</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Camiseta estampada talla M"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label>Producto vinculado (opcional)</label>
            <select value={productoId} onChange={(e) => seleccionarProducto(e.target.value)}>
              <option value="">— Sin vincular —</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="muted small">
          Al vincular un producto se cargan sus materiales y mano de obra ya configurados (puedes ajustarlos aquí).
          Además permite comparar este costo estimado contra el costo real de sus órdenes de producción.
        </p>
      </div>

      {/* ===== Materiales ===== */}
      <div className="card">
        <h3>Materiales (por unidad)</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '34%' }}>Insumo</th>
                <th className="num">Cantidad</th>
                <th>Unidad</th>
                <th className="num">Precio unitario</th>
                <th className="num">Subtotal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {datos.insumos.length === 0 && (
                <tr><td colSpan={6} className="muted">Sin insumos. Agrega el primero.</td></tr>
              )}
              {datos.insumos.map((it, i) => (
                <tr key={it.key || i}>
                  <td>
                    <input value={it.nombre || ''} onChange={(e) => setEnLista('insumos', i, 'nombre', e.target.value)} placeholder="Ej: Tela" />
                  </td>
                  <td className="num">
                    <input type="number" min="0" step="any" value={it.cantidad ?? ''} onChange={(e) => setEnLista('insumos', i, 'cantidad', e.target.value)} placeholder="0" />
                  </td>
                  <td>
                    <input value={it.unidad || ''} onChange={(e) => setEnLista('insumos', i, 'unidad', e.target.value)} placeholder="m, kg, und" />
                  </td>
                  <td className="num">
                    <input type="number" min="0" step="any" value={it.precioUnitario ?? ''} onChange={(e) => setEnLista('insumos', i, 'precioUnitario', e.target.value)} placeholder="0" />
                  </td>
                  <td className="num"><strong>{formatCOP((Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0))}</strong></td>
                  <td><button className="btn-icon danger" onClick={() => quitarDeLista('insumos', i)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn-secondary" onClick={() => addEnLista('insumos', { key: uid(), nombre: '', cantidad: '', unidad: '', precioUnitario: '' })}>
          + Agregar insumo
        </button>
        <div className="totals-row" style={{ marginTop: 12 }}>
          <span>Materiales por unidad: <strong>{formatCOP(r.materialesUnit)}</strong></span>
        </div>
      </div>

      {/* ===== Mano de obra ===== */}
      <div className="card">
        <h3>Mano de obra (por unidad)</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '34%' }}>Concepto</th>
                <th>Tipo</th>
                <th className="num">Horas</th>
                <th className="num">Valor (hora o fijo)</th>
                <th className="num">Subtotal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {datos.manoObra.length === 0 && (
                <tr><td colSpan={6} className="muted">Sin mano de obra. Agrega la primera.</td></tr>
              )}
              {datos.manoObra.map((m, i) => {
                const sub = m.tipo === 'hora' ? (Number(m.horas) || 0) * (Number(m.valor) || 0) : (Number(m.valor) || 0)
                return (
                  <tr key={m.key || i}>
                    <td>
                      <input value={m.nombre || ''} onChange={(e) => setEnLista('manoObra', i, 'nombre', e.target.value)} placeholder="Ej: Costura" />
                    </td>
                    <td>
                      <select value={m.tipo || 'hora'} onChange={(e) => setEnLista('manoObra', i, 'tipo', e.target.value)}>
                        <option value="hora">Por hora</option>
                        <option value="fijo">Valor fijo</option>
                      </select>
                    </td>
                    <td className="num">
                      <input type="number" min="0" step="any" value={m.horas ?? ''} disabled={m.tipo === 'fijo'} onChange={(e) => setEnLista('manoObra', i, 'horas', e.target.value)} placeholder="0" />
                    </td>
                    <td className="num">
                      <input type="number" min="0" step="any" value={m.valor ?? ''} onChange={(e) => setEnLista('manoObra', i, 'valor', e.target.value)} placeholder="0" />
                    </td>
                    <td className="num"><strong>{formatCOP(sub)}</strong></td>
                    <td><button className="btn-icon danger" onClick={() => quitarDeLista('manoObra', i)}>✕</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <button className="btn-secondary" onClick={() => addEnLista('manoObra', { key: uid(), nombre: '', tipo: 'hora', horas: '', valor: '' })}>
          + Agregar mano de obra
        </button>
        <div className="totals-row" style={{ marginTop: 12 }}>
          <span>Mano de obra por unidad: <strong>{formatCOP(r.manoObraUnit)}</strong></span>
        </div>
      </div>

      {/* ===== Costos indirectos ===== */}
      <div className="card">
        <h3>Costos indirectos (del periodo)</h3>
        <p className="muted small">
          Gastos generales que se reparten entre todas las unidades producidas en el periodo.
        </p>
        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Unidades producidas en el periodo</label>
            <input type="number" min="0" step="any" value={datos.unidadesPeriodo ?? ''} onChange={(e) => setCampo('unidadesPeriodo', e.target.value)} placeholder="Ej: 100" />
          </div>
        </div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '50%' }}>Concepto</th>
                <th className="num">Monto del periodo</th>
                <th className="num">Costo / unidad</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {datos.indirectos.length === 0 && (
                <tr><td colSpan={4} className="muted">Sin indirectos. Agrega arriendo, luz, transporte…</td></tr>
              )}
              {datos.indirectos.map((it, i) => {
                const u = Number(datos.unidadesPeriodo) || 0
                const porUnidad = u > 0 ? (Number(it.montoPeriodo) || 0) / u : 0
                return (
                  <tr key={it.key || i}>
                    <td>
                      <input value={it.nombre || ''} onChange={(e) => setEnLista('indirectos', i, 'nombre', e.target.value)} placeholder="Ej: Arriendo" />
                    </td>
                    <td className="num">
                      <input type="number" min="0" step="any" value={it.montoPeriodo ?? ''} onChange={(e) => setEnLista('indirectos', i, 'montoPeriodo', e.target.value)} placeholder="0" />
                    </td>
                    <td className="num">{formatCOP(porUnidad)}</td>
                    <td><button className="btn-icon danger" onClick={() => quitarDeLista('indirectos', i)}>✕</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <button className="btn-secondary" onClick={() => addEnLista('indirectos', { key: uid(), nombre: '', montoPeriodo: '' })}>
          + Agregar indirecto
        </button>
        <div className="row" style={{ marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Imprevistos (% sobre el subtotal)</label>
            <input type="number" min="0" step="any" value={datos.imprevistoPct ?? ''} onChange={(e) => setCampo('imprevistoPct', e.target.value)} placeholder="Ej: 5" />
          </div>
        </div>
        <div className="totals-row" style={{ marginTop: 12 }}>
          <span>Indirectos por unidad: <strong>{formatCOP(r.indirectosUnit)}</strong>{'  ·  '}
            Imprevistos por unidad: <strong>{formatCOP(r.imprevistoUnit)}</strong></span>
        </div>
      </div>

      {/* ===== Precio y rentabilidad ===== */}
      <div className="card">
        <h3>Precio de venta y rentabilidad</h3>
        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Precio de venta (por unidad)</label>
            <input type="number" min="0" step="any" value={datos.precioVenta ?? ''} onChange={(e) => setCampo('precioVenta', e.target.value)} placeholder="0" />
          </div>
          <div style={{ flex: 1 }}>
            <label>Margen mínimo aceptable (%)</label>
            <input type="number" min="0" step="any" value={datos.margenMinimo ?? ''} onChange={(e) => setCampo('margenMinimo', e.target.value)} placeholder="Ej: 15" />
          </div>
        </div>
        <div className="cards-grid" style={{ marginTop: 12 }}>
          <div className="stat-card">
            <span className="stat-label">Costo total unitario</span>
            <span className="stat-value">{formatCOP(r.costoTotalUnit)}</span>
          </div>
          <div className={`stat-card ${r.gananciaUnit < 0 ? '' : 'highlight'}`}>
            <span className="stat-label">Ganancia unitaria</span>
            <span className={`stat-value ${r.gananciaUnit < 0 ? 'danger-text' : ''}`}>{formatCOP(r.gananciaUnit)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Margen</span>
            <span className={`stat-value ${r.margenPct < r.margenMinimo ? 'danger-text' : ''}`}>{r.margenPct.toFixed(1)}%</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Markup</span>
            <span className="stat-value">{r.markupPct.toFixed(1)}%</span>
          </div>
        </div>
        {r.precioVenta > 0 && r.gananciaUnit < 0 && (
          <div className="banner error" style={{ marginTop: 12 }}>
            ⚠️ El precio de venta está por debajo del costo: estás perdiendo {formatCOP(-r.gananciaUnit)} por unidad.
          </div>
        )}
        {r.precioVenta > 0 && r.gananciaUnit >= 0 && r.margenPct < r.margenMinimo && (
          <div className="banner" style={{ marginTop: 12 }}>
            ⚠️ El margen ({r.margenPct.toFixed(1)}%) está por debajo del mínimo que definiste ({r.margenMinimo}%).
          </div>
        )}
      </div>

      {/* ===== Descuentos por volumen ===== */}
      <div className="card">
        <h3>Descuentos por volumen</h3>
        <p className="muted small">
          Define tramos de cantidad y el descuento de cada uno. La ganancia se compara contra
          la original (sin descuento): <strong>{formatCOP(r.gananciaUnit)}</strong> por unidad.
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="num">Desde</th>
                <th className="num">Hasta</th>
                <th className="num">% desc.</th>
                <th className="num">Cant. ref.</th>
                <th className="num">Precio c/desc.</th>
                <th className="num">Ganancia und.</th>
                <th className="num">Ganancia tramo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {datos.tramos.length === 0 && (
                <tr><td colSpan={8} className="muted">Sin tramos. Ej: 1–10 sin desc., 11–50 al 5%, 51+ al 10%.</td></tr>
              )}
              {datos.tramos.map((t, i) => {
                const e = r.escenarios[i] || {}
                return (
                  <tr key={t.key || i} style={e.alerta ? { background: 'rgba(220,38,38,0.08)' } : undefined}>
                    <td className="num">
                      <input type="number" min="0" step="1" value={t.min ?? ''} onChange={(ev) => setEnLista('tramos', i, 'min', ev.target.value)} placeholder="1" />
                    </td>
                    <td className="num">
                      <input type="number" min="0" step="1" value={t.max ?? ''} onChange={(ev) => setEnLista('tramos', i, 'max', ev.target.value)} placeholder="∞" />
                    </td>
                    <td className="num">
                      <input type="number" min="0" step="any" value={t.descuentoPct ?? ''} onChange={(ev) => setEnLista('tramos', i, 'descuentoPct', ev.target.value)} placeholder="0" />
                    </td>
                    <td className="num">
                      <input type="number" min="0" step="any" value={t.cantidadRef ?? ''} onChange={(ev) => setEnLista('tramos', i, 'cantidadRef', ev.target.value)} placeholder="0" />
                    </td>
                    <td className="num">{formatCOP(e.precioDesc || 0)}</td>
                    <td className={`num ${e.gananciaDescUnit < 0 ? 'danger-text' : ''}`}>
                      <strong>{formatCOP(e.gananciaDescUnit || 0)}</strong>
                      {e.alerta && ' ⚠️'}
                    </td>
                    <td className="num">{formatCOP(e.gananciaTramo || 0)}</td>
                    <td><button className="btn-icon danger" onClick={() => quitarDeLista('tramos', i)}>✕</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <button className="btn-secondary" onClick={() => addEnLista('tramos', { key: uid(), min: '', max: '', descuentoPct: '', cantidadRef: '' })}>
          + Agregar tramo
        </button>
        {r.escenarios.some((e) => e.alerta) && (
          <div className="banner error" style={{ marginTop: 12 }}>
            ⚠️ Uno o más tramos dejan la ganancia por debajo del margen mínimo o en negativo (marcados en rojo).
          </div>
        )}
      </div>

      {/* ===== Resumen: desglose + gráfico ===== */}
      <div className="card">
        <h3>Resumen del costo unitario</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Categoría</th>
                <th className="num">Costo / unidad</th>
                <th className="num">% del costo</th>
              </tr>
            </thead>
            <tbody>
              {r.desglose.map((d) => {
                const total = r.costoTotalUnit
                return (
                  <tr key={d.categoria}>
                    <td>{d.categoria}</td>
                    <td className="num">{formatCOP(d.valor)}</td>
                    <td className="num">{total > 0 ? ((d.valor / total) * 100).toFixed(1) : '0'}%</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Costo total unitario</strong></td>
                <td className="num"><strong>{formatCOP(r.costoTotalUnit)}</strong></td>
                <td className="num"><strong>100%</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ marginTop: 16 }}>
          <PieChart datos={pieData} />
        </div>
      </div>

      {/* ===== Acciones ===== */}
      <div className="card">
        <div className="form-actions">
          {(puedeCrear || puedeEditar) && (
            <button className="btn-primary" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : id ? '💾 Guardar cambios' : '💾 Guardar costeo'}
            </button>
          )}
          {puedeExportar && (
            <>
              <button className="btn-secondary" onClick={exportarPdf}>📄 Exportar PDF</button>
              <button className="btn-secondary" onClick={exportarCsv}>📊 Exportar CSV</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

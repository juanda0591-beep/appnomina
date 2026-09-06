import { useEffect, useState } from 'react'
import { notify } from '../utils/notify.js'

const etiquetas = {
  nominas: 'Nóminas', nomina_items: 'Trabajos pagados', nomina_descuentos: 'Descuentos de nómina',
  prestamos: 'Préstamos', movimientos: 'Caja', ventas: 'Ventas', venta_items: 'Productos vendidos',
  venta_pagos: 'Abonos de ventas', cliente_anticipos: 'Anticipos', productos: 'Productos',
  producto_variantes: 'Existencias por color', materiales: 'Materiales',
  producto_movimientos: 'Movimientos de productos', material_movimientos: 'Movimientos de materiales',
}
const acciones = { crear: 'Creación', editar: 'Cambio', eliminar: 'Anulación' }
const fecha = (s) => new Date(s).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
const valor = (v) => v == null ? '-' : String(v)

async function consultar(path, method = 'GET', signal) {
  const res = await fetch(`/api/${path}`, { method, signal,
    headers: { Authorization: `Bearer ${sessionStorage.getItem('nomina_token') || ''}` } })
  if (res.status === 401) {
    for (const key of ['nomina_token', 'nomina_user', 'nomina_rol', 'nomina_permisos']) sessionStorage.removeItem(key)
    window.location.reload()
    throw new Error('La sesión venció')
  }
  if (!res.ok) {
    const datos = await res.json().catch(() => ({}))
    throw new Error(datos.error || 'No se pudo completar la operación')
  }
  return res
}

function Respaldos() {
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [verificados, setVerificados] = useState({})
  const cargar = async () => {
    setEstado(await (await consultar('respaldos')).json())
    setError('')
  }
  useEffect(() => { cargar().catch((e) => setError(e.message)) }, [])
  const ejecutar = async (fn) => {
    if (ocupado) return
    setOcupado(true)
    try { await fn() } catch (e) { setError(e.message) } finally { setOcupado(false) }
  }
  const crear = () => ejecutar(async () => {
    const copia = await (await consultar('respaldos', 'POST')).json()
    setVerificados((v) => ({ ...v, [copia.nombre]: fecha(new Date().toISOString()) }))
    await cargar()
    notify.ok('Respaldo creado y verificado')
  })
  const verificar = (nombre) => ejecutar(async () => {
    setVerificados((v) => ({ ...v, [nombre]: '' }))
    await consultar(`respaldos/${encodeURIComponent(nombre)}/verificar`, 'POST')
    setVerificados((v) => ({ ...v, [nombre]: fecha(new Date().toISOString()) }))
    setError('')
    notify.ok('Integridad del respaldo verificada')
  })
  const descargar = (nombre) => ejecutar(async () => {
    const res = await consultar(`respaldos/${encodeURIComponent(nombre)}/descargar`)
    const url = URL.createObjectURL(await res.blob())
    const enlace = document.createElement('a')
    enlace.href = url; enlace.download = nombre
    document.body.appendChild(enlace); enlace.click(); enlace.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setError('')
  })
  return <section aria-label="Respaldos">
    <div className="admin-toolbar">
      <div>
        <h3>Respaldos de datos</h3>
        {estado && <p className="muted">{estado.automaticos ? `Automáticos cada ${estado.horas} horas` : 'Automáticos desactivados'} · Retención: {estado.retencion} copias</p>}
      </div>
      <div className="actions">
        <button type="button" className="btn-secondary" disabled={ocupado} onClick={() => ejecutar(cargar)}>Actualizar</button>
        <button type="button" className="btn-primary" disabled={ocupado || estado?.enCurso} onClick={crear}>
          {ocupado || estado?.enCurso ? 'Procesando...' : 'Crear respaldo'}
        </button>
      </div>
    </div>
    {(error || estado?.error) && <p role="alert" className="banner error">{error || estado.error}</p>}
    {!estado && !error && <p role="status">Cargando respaldos...</p>}
    <div className="table-wrap"><table className="table">
      <thead><tr><th>Creado</th><th>Tamaño</th><th>Verificación reciente</th><th>Acciones</th></tr></thead>
      <tbody>
        {estado?.archivos.map((a) => <tr key={a.nombre}>
          <td title={a.nombre}>{fecha(a.fecha)}</td>
          <td>{(a.bytes / 1048576).toFixed(2)} MB</td>
          <td>{verificados[a.nombre] || '-'}</td>
          <td><div className="actions">
            <button type="button" className="btn-secondary" disabled={ocupado} onClick={() => verificar(a.nombre)}>Verificar</button>
            <button type="button" className="btn-secondary" disabled={ocupado} onClick={() => descargar(a.nombre)}>Descargar</button>
          </div></td>
        </tr>)}
        {estado?.archivos.length === 0 && <tr><td colSpan={4}>No hay respaldos disponibles.</td></tr>}
      </tbody>
    </table></div>
  </section>
}

function Actividad() {
  const [filtros, setFiltros] = useState({ desde: '', hasta: '', entidad: '', accion: '', usuario: '' })
  const [consulta, setConsulta] = useState({ pagina: 1 })
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [detalle, setDetalle] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    setCargando(true); setError('')
    consultar(`auditoria?${new URLSearchParams(consulta)}`, 'GET', controller.signal)
      .then((r) => r.json()).then(setResultado)
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setCargando(false) })
    return () => controller.abort()
  }, [consulta])
  const campo = (k, v) => setFiltros((f) => ({ ...f, [k]: v }))
  const campos = detalle ? [...new Set([...Object.keys(detalle.anterior || {}), ...Object.keys(detalle.posterior || {})])] : []
  return <section aria-label="Actividad financiera">
    <h3>Actividad financiera</h3>
    <form className="admin-filtros" onSubmit={(e) => { e.preventDefault(); setConsulta({ ...filtros, pagina: 1 }) }}>
      <label>Desde<input type="date" value={filtros.desde} onChange={(e) => campo('desde', e.target.value)} /></label>
      <label>Hasta<input type="date" value={filtros.hasta} min={filtros.desde} onChange={(e) => campo('hasta', e.target.value)} /></label>
      <label>Registro<select aria-label="Registro" value={filtros.entidad} onChange={(e) => campo('entidad', e.target.value)}>
        <option value="">Todos</option>{Object.entries(etiquetas).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select></label>
      <label>Acción<select aria-label="Acción" value={filtros.accion} onChange={(e) => campo('accion', e.target.value)}>
        <option value="">Todas</option>{Object.entries(acciones).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select></label>
      <label>Usuario<input value={filtros.usuario} onChange={(e) => campo('usuario', e.target.value)} placeholder="Todos" maxLength={100} /></label>
      <button className="btn-primary" disabled={cargando} type="submit">Filtrar</button>
    </form>
    {error && <p role="alert" className="banner error">{error}</p>}
    {cargando && <p role="status">Cargando actividad...</p>}
    <div className="table-wrap"><table className="table">
      <thead><tr><th>Fecha</th><th>Usuario</th><th>Registro</th><th>Acción</th><th>Motivo</th><th></th></tr></thead>
      <tbody>{resultado?.registros.map((r) => <tr key={r.id}>
        <td>{fecha(r.fecha)}</td><td>{r.usuario}</td><td>{etiquetas[r.entidad] || r.entidad} #{r.registro_id}</td>
        <td>{acciones[r.accion]}</td><td className="admin-motivo">{r.motivo || '-'}</td>
        <td><button type="button" className="btn-secondary" onClick={() => setDetalle(r)}>Detalle</button></td>
      </tr>)}
      {!cargando && resultado?.registros.length === 0 && <tr><td colSpan={6}>No hay movimientos para estos filtros.</td></tr>}
      </tbody>
    </table></div>
    {resultado && <div className="admin-toolbar">
      <span>{resultado.total} registros · Página {resultado.pagina} de {resultado.paginas}</span>
      <div className="actions">
        <button type="button" className="btn-secondary" disabled={cargando || resultado.pagina <= 1}
          onClick={() => setConsulta((q) => ({ ...q, pagina: resultado.pagina - 1 }))}>Anterior</button>
        <button type="button" className="btn-secondary" disabled={cargando || resultado.pagina >= resultado.paginas}
          onClick={() => setConsulta((q) => ({ ...q, pagina: resultado.pagina + 1 }))}>Siguiente</button>
      </div>
    </div>}
    {detalle && <>
      <div className="overlay" onClick={() => setDetalle(null)} />
      <div className="modal admin-detalle" role="dialog" aria-modal="true" aria-label="Detalle del cambio" onKeyDown={(e) => { if (e.key === 'Escape') setDetalle(null) }}>
        <div className="admin-toolbar"><h3>{etiquetas[detalle.entidad]} #{detalle.registro_id}</h3>
          <button autoFocus type="button" className="btn-secondary" onClick={() => setDetalle(null)}>Cerrar</button></div>
        <p>{fecha(detalle.fecha)} · {detalle.usuario} · {acciones[detalle.accion]}</p>
        {detalle.motivo && <p className="admin-motivo">{detalle.motivo}</p>}
        <div className="table-wrap"><table className="table"><thead><tr><th>Campo</th><th>Antes</th><th>Después</th></tr></thead>
          <tbody>{campos.filter((k) => !detalle.anterior || !detalle.posterior || detalle.anterior[k] !== detalle.posterior[k]).map((k) =>
            <tr key={k}><th>{k.replaceAll('_', ' ')}</th><td>{valor(detalle.anterior?.[k])}</td><td>{valor(detalle.posterior?.[k])}</td></tr>)}</tbody>
        </table></div>
      </div>
    </>}
  </section>
}

export default function Administracion() {
  const [vista, setVista] = useState('respaldos')
  return <div className="administracion">
    <h2>Administración</h2>
    <div className="admin-tabs" role="tablist" aria-label="Administración">
      {['respaldos', 'actividad'].map((v) => <button type="button" role="tab" key={v} id={`tab-${v}`}
        tabIndex={vista === v ? 0 : -1}
        aria-controls={`panel-${v}`} aria-selected={vista === v} onClick={() => setVista(v)}
        onKeyDown={(e) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
          e.preventDefault()
          const siguiente = e.key === 'Home' ? 'respaldos' : e.key === 'End' ? 'actividad' : vista === 'respaldos' ? 'actividad' : 'respaldos'
          setVista(siguiente); document.getElementById(`tab-${siguiente}`)?.focus()
        }}>
        {v === 'respaldos' ? 'Respaldos' : 'Actividad financiera'}
      </button>)}
    </div>
    <div role="tabpanel" id={`panel-${vista}`} aria-labelledby={`tab-${vista}`}>
      {vista === 'respaldos' ? <Respaldos /> : <Actividad />}
    </div>
  </div>
}

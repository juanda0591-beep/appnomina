import { useEffect, useId, useRef, useState } from 'react'

async function consultar(path, options = {}) {
  let res
  try {
    res = await fetch(`/api/ia/${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('nomina_token') || ''}` },
    })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new Error('No se pudo conectar con el servidor. Comprueba que el ERP esté encendido.')
  }
  const datos = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(res.status === 401 ? 'Tu sesión venció. Vuelve a iniciar sesión.' : datos.error || 'No fue posible consultar la IA.')
  return datos
}

export default function AsistenteBorrador({ tipo, etiqueta, placeholder, onAplicar, children }) {
  const [abierto, setAbierto] = useState(false)
  const [descripcion, setDescripcion] = useState('')
  const [estado, setEstado] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const solicitud = useRef(null)
  const descripcionId = useId()
  useEffect(() => () => solicitud.current?.abort(), [])
  useEffect(() => {
    if (!abierto) return
    const controller = new AbortController()
    setEstado(null)
    setError('')
    consultar(tipo === 'material' ? 'estado' : `${tipo}/estado`, { signal: controller.signal })
      .then(setEstado).catch((e) => { if (e.name !== 'AbortError') setError(e.message) })
    return () => controller.abort()
  }, [abierto, tipo])

  const generar = async () => {
    if (cargando) return
    setCargando(true)
    setError('')
    setResultado(null)
    const controller = new AbortController()
    solicitud.current = controller
    try {
      setResultado(await consultar(tipo, { method: 'POST', body: JSON.stringify({ descripcion }), signal: controller.signal }))
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally { setCargando(false) }
  }

  return (
    <section className="asistente-material">
      <button type="button" className="btn-secondary" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        {abierto ? 'Cerrar asistente IA' : 'Preparar con IA'}
      </button>
      {abierto && <div className="asistente-material-contenido">
        {estado?.configurada === false && <p role="status" className="banner">IA pendiente de configuración por el administrador.</p>}
        <label htmlFor={descripcionId}>{etiqueta}</label>
        <textarea id={descripcionId} rows={3} maxLength={4000} value={descripcion} disabled={cargando || aplicando}
          placeholder={placeholder} onChange={(e) => { setDescripcion(e.target.value); setResultado(null); setError('') }} />
        <div className="form-actions">
          <button type="button" className="btn-primary" disabled={cargando || aplicando || !estado?.configurada || descripcion.trim().length < 5} onClick={generar}>
            {cargando ? 'Preparando borrador...' : 'Generar borrador'}
          </button>
        </div>
        {error && <p className="banner error" role="alert">{error}</p>}
        {resultado && <div aria-live="polite">
          <h4>Borrador sin guardar</h4>
          {children(resultado.borrador)}
          {resultado.pendientes.length > 0 && <div className="muted"><strong>Datos pendientes</strong>
            <ul>{resultado.pendientes.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>}
          {resultado.observaciones.length > 0 && <ul>{resultado.observaciones.map((s, i) => <li key={i}>{s}</li>)}</ul>}
          {resultado.duplicados.length > 0 && <div className="banner" role="status">
            <strong>Posibles duplicados</strong>
            <ul>{resultado.duplicados.map((m) => <li key={m.id}>{m.nombre}{m.unidad ? ` (${m.unidad})` : ''}{m.exacto ? ' · Nombre coincidente' : ''}</li>)}</ul>
          </div>}
          <div className="form-actions">
            <button type="button" className="btn-primary" disabled={aplicando} onClick={async () => {
              setAplicando(true)
              try { if (await onAplicar(resultado.borrador)) { setResultado(null); setAbierto(false) } }
              catch (e) { setError(e.message) }
              finally { setAplicando(false) }
            }}>Aplicar al formulario</button>
            <button type="button" className="btn-secondary" disabled={aplicando} onClick={() => setResultado(null)}>Descartar</button>
          </div>
        </div>}
      </div>}
    </section>
  )
}

export function DatosBorrador({ filas }) {
  return <dl className="asistente-material-datos">
    {filas.map(([label, valor]) => <div key={label}><dt>{label}</dt><dd>{valor ?? 'Pendiente'}</dd></div>)}
  </dl>
}

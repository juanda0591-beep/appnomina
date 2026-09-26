import { useEffect, useId, useRef, useState } from 'react'

async function consultar(path, options = {}) {
  const res = await fetch(`/api/ia/${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('nomina_token') || ''}` },
  })
  const datos = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(res.status === 401 ? 'Tu sesión venció. Vuelve a iniciar sesión.' : datos.error || 'No fue posible consultar la IA.')
  return datos
}

export default function AsistenteCopyProducto({ nombre, descripcion = '', procesos = [], contexto = '', onAplicar, disabled = false, autoGenerar = false }) {
  const [abierto, setAbierto] = useState(autoGenerar), [estado, setEstado] = useState(null)
  const [copy, setCopy] = useState(''), [cargando, setCargando] = useState(false), [aplicando, setAplicando] = useState(false), [error, setError] = useState('')
  const solicitud = useRef(null), inicioAutomatico = useRef(false)
  const copyId = useId()
  const detalles = [
    `Nombre: ${nombre.trim()}`,
    descripcion.trim() ? `Detalles: ${descripcion.trim()}` : '',
    contexto.trim() ? `Características: ${contexto.trim()}` : '',
    procesos.filter((p) => p.nombre.trim()).length ? `Procesos: ${procesos.filter((p) => p.nombre.trim()).map((p) => p.nombre.trim()).join(', ')}` : '',
  ].filter(Boolean).join('\n')
  useEffect(() => () => solicitud.current?.abort(), [])
  useEffect(() => {
    if (!abierto) return
    const controller = new AbortController()
    setError(''); setEstado(null)
    consultar('producto-copy/estado', { signal: controller.signal }).then(setEstado)
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message) })
    return () => controller.abort()
  }, [abierto])
  useEffect(() => {
    solicitud.current?.abort()
    setCopy('')
  }, [detalles])
  const generar = async () => {
    if (cargando || aplicando || detalles.length < 5) return
    const controller = new AbortController(); solicitud.current = controller
    setCargando(true); setError('')
    try { const resultado = await consultar('producto-copy', { method: 'POST', signal: controller.signal, body: JSON.stringify({ descripcion: detalles }) }); setCopy(resultado.copy) }
    catch (e) { if (e.name !== 'AbortError') setError(e.message) }
    finally { setCargando(false) }
  }
  useEffect(() => {
    if (autoGenerar && abierto && estado?.configurada && !inicioAutomatico.current) {
      inicioAutomatico.current = true
      generar()
    }
  }, [autoGenerar, abierto, estado?.configurada])
  const aplicar = async () => {
    if (!copy.trim() || cargando || aplicando) return
    setAplicando(true); setError('')
    try { await onAplicar(copy.trim()); setCopy(''); setAbierto(false) }
    catch (e) { setError(e.message) }
    finally { setAplicando(false) }
  }
  return <section className="asistente-copy-producto">
    {!autoGenerar && <button type="button" className="btn-secondary" disabled={disabled || aplicando} aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
      {abierto ? 'Cerrar generador de copy' : 'Crear copy corto con IA'}
    </button>}
    {abierto && <div className="asistente-copy-contenido">
      <p className="muted small">Usará el nombre y las características del producto. Revisa el texto antes de aplicarlo.</p>
      {estado?.configurada === false && <p role="status" className="banner">IA pendiente de configuración por el administrador.</p>}
      <button type="button" className="btn-primary" disabled={disabled || cargando || aplicando || !estado?.configurada || detalles.length < 5} onClick={generar}>
        {cargando ? 'Generando copy...' : 'Generar copy'}
      </button>
      {error && <p className="banner error" role="alert">{error}</p>}
      {copy && <div className="asistente-copy-resultado" aria-live="polite">
        <label htmlFor={copyId}>Copy sugerido</label>
        <textarea id={copyId} rows={3} maxLength={240} value={copy} disabled={aplicando} onChange={(e) => setCopy(e.target.value)} />
        <div className="form-actions">
          <button type="button" className="btn-primary" disabled={aplicando || !copy.trim()} onClick={aplicar}>{aplicando ? 'Guardando...' : 'Usar este copy'}</button>
          <button type="button" className="btn-secondary" onClick={generar} disabled={cargando || aplicando}>Generar otra opción</button>
        </div>
      </div>}
    </div>}
  </section>
}

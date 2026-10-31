import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { http } from '../hooks/useLocalData.js'
import { aplicarCambiosDiseno } from '../utils/cambiosDiseno.js'

export default function AsistenteDiseno({ diseno, onAplicar }) {
  const [consulta, setConsulta] = useState(''), [estado, setEstado] = useState(null)
  const [resultado, setResultado] = useState(null), [error, setError] = useState('')
  const [cargando, setCargando] = useState(false), [revisado, setRevisado] = useState(false)
  const solicitud = useRef(null), version = useRef(0)
  const firma = JSON.stringify(diseno)
  useEffect(() => {
    const c = new AbortController()
    http('/ia/diseno/estado', { signal: c.signal }).then(setEstado).catch((e) => { if (!c.signal.aborted) setError(e.message) })
    return () => { c.abort(); solicitud.current?.abort() }
  }, [])
  const consultar = async () => {
    const actual = ++version.current, c = new AbortController()
    solicitud.current?.abort(); solicitud.current = c
    setCargando(true); setError(''); setResultado(null); setRevisado(false)
    try {
      const respuesta = await http('/ia/diseno', { method: 'POST', signal: c.signal,
        body: JSON.stringify({ descripcion: consulta, diseno }) })
      if (actual === version.current && !c.signal.aborted) setResultado({ ...respuesta, firma, consulta })
    } catch (e) { if (!c.signal.aborted) setError(e.message) }
    finally { if (actual === version.current) setCargando(false) }
  }
  const aplicar = () => {
    if (!revisado || !resultado?.puedeAplicar || resultado.firma !== firma || resultado.consulta !== consulta) return
    try { onAplicar(aplicarCambiosDiseno(diseno, resultado.cambios)) }
    catch (e) { setError(e.message) }
  }
  return <section className="asistente-diseno" aria-label="Asistente IA de diseño">
    <h4><Sparkles size={18}/>Asistente IA de diseño</h4>
    <label>¿Qué quieres cambiar?<textarea aria-label="Instrucción de diseño" rows={3} maxLength={1000} value={consulta} disabled={cargando}
      placeholder="Ponle 2 gavetas al módulo 1 y un entrepaño" onChange={(e) => { setConsulta(e.target.value); setResultado(null); setRevisado(false) }}/></label>
    {estado?.configurada === false && <p className="banner">Configura OPENAI_API_KEY y OPENAI_MODEL en el servidor.</p>}
    <button type="button" className="corte-button primary" disabled={cargando || !estado?.configurada || consulta.trim().length < 5} onClick={consultar}>
      <Sparkles size={16}/>{cargando ? 'Preparando propuesta...' : 'Proponer cambios'}
    </button>
    {cargando && <button type="button" className="corte-button" onClick={() => { version.current++; solicitud.current?.abort(); setCargando(false) }}>Cancelar</button>}
    {error && <p className="banner error" role="alert">{error}</p>}
    {resultado && <div className="asistente-diseno-propuesta" aria-live="polite">
      <p>{resultado.explicacion}</p>
      {resultado.resumen.length > 0 && <ul>{resultado.resumen.map((texto, i) => <li key={i}>{texto}</li>)}</ul>}
      {resultado.puedeAplicar && <p className="muted small">Piezas del mueble: {resultado.piezasAntes} → {resultado.piezasDespues}</p>}
      {resultado.preguntas.map((texto, i) => <p key={`p${i}`} className="banner">{texto}</p>)}
      {resultado.advertencias.map((texto, i) => <p key={`a${i}`} className="muted small">{texto}</p>)}
      {resultado.firma !== firma || resultado.consulta !== consulta ? <p className="banner">El diseño cambió. Consulta de nuevo antes de aplicar.</p> : resultado.puedeAplicar && <>
        <label className="corte-check"><input type="checkbox" checked={revisado} onChange={(e) => setRevisado(e.target.checked)}/>Revisé estos cambios y sus medidas</label>
        <button type="button" className="corte-button primary" disabled={!revisado} onClick={aplicar}>Aplicar al diseño y al plano</button>
      </>}
    </div>}
  </section>
}

import { useEffect, useRef, useState } from 'react'
import { http } from '../hooks/useLocalData.js'

export default function AsistentePlanos({ proyecto, onPiezas, onMontaje, bloqueado }) {
  const [abierto, setAbierto] = useState(false), [descripcion, setDescripcion] = useState(''), [modo, setModo] = useState('explicar')
  const [estado, setEstado] = useState(null), [resultado, setResultado] = useState(null), [error, setError] = useState(''), [cargando, setCargando] = useState(false)
  const [revisado, setRevisado] = useState(false), [firmaRespuesta, setFirmaRespuesta] = useState('')
  const [aplicando, setAplicando] = useState(false)
  const solicitud = useRef(null), numero = useRef(0)
  const firma = JSON.stringify({ piezas: proyecto.piezas, montaje: proyecto.montajeManual, espesor: proyecto.lamina.espesor, descripcion, modo })
  const actual = useRef(firma); actual.current = firma
  useEffect(() => () => { numero.current++; solicitud.current?.abort() }, [])
  useEffect(() => {
    if (!abierto) return
    const c = new AbortController()
    http('/ia/planos/estado', { signal: c.signal }).then(setEstado).catch((e) => { if (!c.signal.aborted) setError(e.message) })
    return () => c.abort()
  }, [abierto])
  const consultar = async () => {
    const n = ++numero.current, consultaFirma = firma
    setCargando(true); setError(''); setResultado(null); setRevisado(false)
    const c = new AbortController(); solicitud.current = c
    try {
      const r = await http('/ia/planos', { method: 'POST', signal: c.signal, body: JSON.stringify({ descripcion, modo,
        piezas: proyecto.piezas, montaje: proyecto.montajeManual || [], espesorBase: Number(proyecto.lamina.espesor) }) })
      if (n !== numero.current || actual.current !== consultaFirma) return
      setResultado(r); setFirmaRespuesta(consultaFirma)
    } catch (e) { if (!c.signal.aborted) setError(e.message) }
    finally { if (n === numero.current) setCargando(false) }
  }
  const aplicar = async (tipo) => {
    if (!revisado || firmaRespuesta !== firma || aplicando) return
    setAplicando(true)
    try {
      const ok = await (tipo === 'piezas' ? onPiezas(resultado.piezas.map(({ motivo, ...p }) => p)) : onMontaje(resultado.montaje.map(({ motivo, ...p }) => p)))
      if (ok !== false) { setResultado(null); setRevisado(false) }
    } catch (e) { setError(e.message) }
    finally { setAplicando(false) }
  }
  return <section className="asistente-planos">
    <button type="button" className="corte-button" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}> {abierto ? 'Cerrar asistente de medidas' : 'Asistente de medidas · OpenAI'}</button>
    {abierto && <div>
      <p className="muted small">Consulta sobre espesores, conversiones, descuentos y armado. Se envían tu texto, los nombres y medidas de esta tabla y las ubicaciones que hayas definido. No se envían costos, clientes ni fotografías.</p>
      {estado?.configurada === false && <p className="banner">Configura OPENAI_API_KEY y OPENAI_MODEL en el servidor para usar el asistente.</p>}
      <label>¿Qué necesitas?<select aria-label="Objetivo del asistente" value={modo} onChange={(e) => { setModo(e.target.value); setResultado(null) }} disabled={cargando}>
        <option value="explicar">Entender y revisar medidas</option><option value="proponer">Proponer piezas o ubicaciones</option></select></label>
      <label>Tu consulta<textarea aria-label="Consulta de medidas" rows={4} maxLength={4000} value={descripcion} disabled={cargando}
        placeholder="Ej.: Tengo dos laterales de 180 × 50 cm, MDF de 9 mm. ¿Cuánto deben medir el techo y el piso para un ancho exterior de 100 cm si van entre los laterales?"
        onChange={(e) => { setDescripcion(e.target.value); setResultado(null) }} /></label>
      <div className="corte-actions"><button type="button" className="corte-button primary" disabled={bloqueado || cargando || !estado?.configurada || descripcion.trim().length < 5} onClick={consultar}>{cargando ? 'Consultando OpenAI...' : 'Consultar medidas'}</button>
        {cargando && <button type="button" className="corte-button" onClick={() => { numero.current++; solicitud.current?.abort(); setCargando(false) }}>Cancelar consulta</button>}</div>
      {error && <p role="alert" className="banner error">{error}</p>}
      {resultado && <div className="ia-medidas-respuesta" aria-live="polite">
        <h4>Respuesta para revisar</h4><p style={{ whiteSpace: 'pre-wrap' }}>{resultado.explicacion}</p>
        {resultado.pasos.length > 0 && <ol>{resultado.pasos.map((p, i) => <li key={i}><strong>{p.concepto}</strong>: {p.calculo}{p.resultadoMm !== null && <span> · {p.resultadoMm} mm ({p.resultadoMm / 10} cm)</span>}</li>)}</ol>}
        {[['Datos que faltan', [...resultado.preguntas, ...resultado.pendientes]], ['Supuestos por confirmar', resultado.supuestos], ['Observaciones', resultado.advertencias]].map(([titulo, items]) => items.length > 0 && <div key={titulo}><strong>{titulo}</strong><ul>{items.map((p, i) => <li key={i}>{p}</li>)}</ul></div>)}
        {resultado.piezas.length > 0 && <div className="table-wrap"><table className="table"><thead><tr><th>Pieza propuesta</th><th>Ancho mm</th><th>Alto mm</th><th>Espesor mm</th><th>Cant.</th><th>Motivo</th></tr></thead><tbody>{resultado.piezas.map((p) => <tr key={p.codigo}><td>{p.nombre}</td><td>{p.ancho ?? 'Pendiente'}</td><td>{p.alto ?? 'Pendiente'}</td><td>{p.espesor ?? 'Pendiente'}</td><td>{p.cantidad ?? 'Pendiente'}</td><td>{p.motivo}</td></tr>)}</tbody></table></div>}
        {resultado.montaje.length > 0 && <div className="table-wrap"><table className="table"><thead><tr><th>Pieza</th><th>Plano</th><th>X / Y / Z (mm)</th><th>Motivo</th></tr></thead><tbody>{resultado.montaje.map((p) => <tr key={`${p.codigo}-${p.unidad}`}><td>{p.codigo}-{p.unidad}</td><td>{p.plano}</td><td>{p.x} / {p.y} / {p.z}</td><td>{p.motivo}</td></tr>)}</tbody></table></div>}
        {firmaRespuesta !== firma ? <p className="banner">Las medidas cambiaron. Consulta de nuevo antes de aplicar esta propuesta.</p> : <>
          {(resultado.puedeAplicarPiezas || resultado.puedeAplicarMontaje) && <label className="corte-check"><input type="checkbox" checked={revisado} onChange={(e) => setRevisado(e.target.checked)} />Revisé las medidas, supuestos y unidades de esta propuesta</label>}
          <div className="corte-actions">{resultado.puedeAplicarPiezas && <button type="button" className="corte-button primary" disabled={!revisado || bloqueado || aplicando} onClick={() => aplicar('piezas')}>Reemplazar tabla con propuesta</button>}
            {resultado.puedeAplicarMontaje && <button type="button" className="corte-button" disabled={!revisado || bloqueado || aplicando || !!proyecto.diseno} onClick={() => aplicar('montaje')}>Aplicar ubicaciones propuestas</button>}</div>
        </>}
        <p className="muted small">La propuesta puede contener errores. Aplicarla no guarda el proyecto ni confirma que sea apto para fabricar.</p>
      </div>}
    </div>}
  </section>
}

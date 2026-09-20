import { useEffect, useRef, useState } from 'react'
import { MAX_FOTOS_PLANO, referenciaVacia, validarReferenciasPlano } from '../utils/referenciasPlano.js'
import { prepararFotoPlano } from '../utils/prepararFotoPlano.js'

export default function ReferenciasPlano({ valor, onChange, disabled, onLeyendo }) {
  const referencia = valor || referenciaVacia()
  const [error, setError] = useState(''), [leyendo, setLeyendo] = useState(false)
  const turno = useRef(0)
  useEffect(() => () => { turno.current++ }, [])
  const cambiar = (key, value) => onChange({ ...referencia, [key]: value })
  const subir = async (e, vista) => {
    const archivos = [...e.target.files]; e.target.value = ''
    if (!archivos.length) return
    const n = ++turno.current
    setError(''); setLeyendo(true); onLeyendo(true)
    try {
      if (referencia.fotos.length + archivos.length > MAX_FOTOS_PLANO) throw new Error('Puedes guardar hasta 6 fotografías por proyecto.')
      const fotos = []
      for (const file of archivos) {
        const datos = await prepararFotoPlano(file)
        fotos.push({ nombre: file.name.slice(0, 160), vista, datos })
      }
      const nueva = validarReferenciasPlano({ ...referencia, fotos: [...referencia.fotos, ...fotos] })
      if (n === turno.current) onChange(nueva)
    } catch (e) { if (n === turno.current) setError(e.message) }
    finally { if (n === turno.current) { setLeyendo(false); onLeyendo(false) } }
  }
  return <fieldset className="referencias-plano" disabled={disabled || leyendo}>
    <legend>Fotos del mueble</legend>
    <p>Sube el exterior y el interior del mismo mueble. Indica las medidas reales para generar un plano editable.</p>
    <div className="construccion-grid">
      <label>Tipo de mueble<select value={referencia.tipo} onChange={(e) => cambiar('tipo', e.target.value)}><option value="armario">Armario</option><option value="tocador">Tocador</option></select></label>
      {['ancho', 'alto', 'fondo'].map((eje) => <label key={eje}>{eje[0].toUpperCase() + eje.slice(1)} exterior (cm)<input type="number" min="0.1" max="10000" step="0.1" value={referencia[eje] == null ? '' : referencia[eje] / 10}
        onChange={(e) => cambiar(eje, e.target.value === '' ? null : Number(e.target.value) * 10)} /></label>)}
    </div>
    <div className="referencias-cargas">{[['exterior', 'Fotos exteriores'], ['interior', 'Fotos interiores'], ['detalle', 'Fotos de detalle']].map(([vista, etiqueta]) => <label key={vista}>{etiqueta}<input type="file" accept="image/*" multiple onChange={(e) => subir(e, vista)} /></label>)}</div>
    <p className="muted small">Hasta 6 fotos. Las fotos grandes se ajustan automáticamente, sin que tengas que reducirlas. Se guarda una copia optimizada con la versión del proyecto. Al generar se envían estas fotos y las medidas a OpenAI.</p>
    {leyendo && <p role="status">Preparando fotografías…</p>}
    {error && <p role="alert" className="banner error">{error}</p>}
    <div className="referencias-galeria">{referencia.fotos.map((foto, i) => <figure key={i}>
      <img src={foto.datos} alt={`${foto.vista}: ${foto.nombre}`} />
      <figcaption>{foto.nombre}</figcaption>
      <label>Vista de foto {i + 1}<select value={foto.vista} onChange={(e) => cambiar('fotos', referencia.fotos.map((f, j) => j === i ? { ...f, vista: e.target.value } : f))}><option value="exterior">Exterior</option><option value="interior">Interior</option><option value="detalle">Detalle</option></select></label>
      <button type="button" className="corte-button" onClick={() => cambiar('fotos', referencia.fotos.filter((_, j) => j !== i))}>Quitar foto {i + 1}</button>
    </figure>)}</div>
  </fieldset>
}

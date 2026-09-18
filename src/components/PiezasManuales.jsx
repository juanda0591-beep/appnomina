import { lazy, Suspense, useMemo, useState } from 'react'
import { modeloPiezasManuales } from '../utils/piezasManuales.js'
import { fmtCm } from '../utils/unidades.js'
import { descargarPlanoPieza } from '../utils/pdfCortes.js'
const VistaMueble3D = lazy(() => import('./VistaMueble3D.jsx'))

export default function PiezasManuales({ proyecto, onMontaje, onPieza }) {
  const [modo, setModo] = useState('individual'), [codigo, setCodigo] = useState(''), [unidad, setUnidad] = useState(1)
  const pieza = proyecto.piezas.find((p) => p.codigo === codigo) || proyecto.piezas[0]
  const unidadActual = Math.min(unidad, Math.max(1, Number(pieza?.cantidad || 1)))
  const ubicacion = proyecto.montajeManual?.find((p) => p.codigo === pieza?.codigo && p.unidad === unidadActual)
  const [borrador, setBorrador] = useState(null), [error, setError] = useState('')
  const valores = borrador || ubicacion || { plano: 'frente', x: '', y: '', z: '' }
  const modelo = useMemo(() => modeloPiezasManuales(proyecto.piezas, proyecto.lamina.espesor, proyecto.montajeManual || [], modo, pieza?.codigo),
    [proyecto.piezas, proyecto.lamina.espesor, proyecto.montajeManual, modo, pieza?.codigo])
  const seleccionar = (codigo) => { setCodigo(codigo); setUnidad(1); setBorrador(null); setError('') }
  const guardarPosicion = () => {
    if (!pieza) return
    if ([valores.x, valores.y, valores.z].some((v) => v === '' || !Number.isFinite(Number(v)) || Math.abs(Number(v)) > 100000)) { setError('Completa X, Y y Z en mm.'); return }
    const nueva = { codigo: pieza.codigo, unidad: unidadActual, plano: valores.plano, x: Number(valores.x), y: Number(valores.y), z: Number(valores.z) }
    onMontaje([...(proyecto.montajeManual || []).filter((p) => p.codigo !== pieza.codigo || p.unidad !== unidadActual), nueva])
    setBorrador(null); setError(''); setModo('montaje')
  }
  return <section className="manual-piezas">
    <h3>Planos desde tus piezas</h3>
    <p className="muted small">Cada pieza usa las medidas de la tabla. La vista individual no supone cómo va armado el mueble; para montarlo define una ubicación por unidad.</p>
    {!pieza ? <p className="corte-empty">Agrega piezas a la tabla o prepara una propuesta con IA.</p> : <>
      <div className="corte-actions"><label>Pieza a revisar<select aria-label="Pieza manual" value={pieza.codigo} onChange={(e) => seleccionar(e.target.value)}>
        {proyecto.piezas.map((p) => <option key={p.codigo} value={p.codigo}>{p.codigo} · {p.nombre || 'Sin nombre'}</option>)}</select></label>
        <label>Vista<select aria-label="Vista piezas manuales" value={modo} onChange={(e) => setModo(e.target.value)}><option value="individual">Una pieza en 3D</option><option value="piezas">Catálogo 3D (un ejemplar por tipo)</option><option value="montaje">Montaje de las ubicadas</option></select></label></div>
      <div className="manual-detalle">
        <PlanoPieza pieza={pieza} espesor={pieza.espesor ?? proyecto.lamina.espesor} />
        <div><h4>Medidas de corte</h4><div className="construccion-grid">{[['ancho', 'Ancho (cm)'], ['alto', 'Alto / largo (cm)'], ['espesor', 'Espesor (mm)']].map(([key, label]) => <label key={key}>{label}<input aria-label={`Pieza manual · ${label}`} type="number" min="0.1" step="0.1"
          value={key === 'espesor' ? pieza.espesor ?? proyecto.lamina.espesor : Number(pieza[key]) / 10 || ''}
          onChange={(e) => onPieza(pieza.codigo, key, Number(e.target.value) * (key === 'espesor' ? 1 : 10))} /></label>)}</div>
          {proyecto.diseno ? <p className="muted small">Este proyecto ya tiene un diseño paramétrico. Edita su ensamblaje desde Mueble 3D.</p> : <details><summary>Ubicar esta pieza en el mueble</summary><p className="muted small">Posición de la esquina: X derecha, Y arriba, Z frente. Medidas en mm.</p>
            <label>Unidad<select aria-label="Unidad manual" value={unidadActual} onChange={(e) => { setUnidad(Number(e.target.value)); setBorrador(null) }}>
              {Array.from({ length: Math.min(1000, Math.max(1, Number(pieza.cantidad) || 1)) }, (_, i) => <option value={i + 1} key={i}>{i + 1}</option>)}</select></label>
            <label>Orientación<select aria-label="Orientación manual" value={valores.plano} onChange={(e) => setBorrador({ ...valores, plano: e.target.value })}><option value="frente">Frontal: ancho X, alto Y</option><option value="lateral">Lateral: ancho Z, alto Y</option><option value="horizontal">Horizontal: ancho X, largo Z</option></select></label>
            <div className="construccion-grid">{['x', 'y', 'z'].map((eje) => <label key={eje}>{eje.toUpperCase()} (mm)<input aria-label={`Montaje manual ${eje.toUpperCase()}`} type="number" step="0.1" value={valores[eje]} onChange={(e) => setBorrador({ ...valores, [eje]: e.target.value })} /></label>)}</div>
            {error && <p role="alert" className="danger-text">{error}</p>}
            <div className="corte-actions"><button type="button" className="corte-button primary" onClick={guardarPosicion}>Aplicar ubicación</button>
              {ubicacion && <button type="button" className="corte-button" onClick={() => { onMontaje(proyecto.montajeManual.filter((p) => p !== ubicacion)); setBorrador(null) }}>Quitar ubicación</button>}</div>
          </details>}
        </div>
      </div>
      <button type="button" className="corte-button" onClick={() => { try { descargarPlanoPieza(pieza, proyecto.lamina.espesor); setError('') } catch (e) { setError(e.message) } }}>PDF de esta pieza</button>
      {modelo.piezas.length ? <Suspense fallback={<p>Cargando piezas...</p>}><VistaMueble3D modeloManual={modelo} onSeleccionar={(id) => {
        if (id) { seleccionar(id.replace(/-\d+$/, '')); if (modo === 'montaje') setUnidad(Number(id.match(/-(\d+)$/)?.[1]) || 1) }
      }} /></Suspense> : <p className="banner">{modo === 'montaje' ? 'Aún no hay piezas ubicadas.' : 'Completa nombre, medidas, espesor y cantidad para mostrar el 3D.'}</p>}
      {modelo.faltantes.length > 0 && <p className="banner">{modo === 'montaje' ? `${modelo.faltantes.length} unidades pendientes de ubicar. El montaje está incompleto.` : modelo.faltantes.join(', ')}</p>}
    </>}
  </section>
}

function PlanoPieza({ pieza: p, espesor }) {
  const a = Number(p.ancho), h = Number(p.alto), e = Number(espesor)
  if (![a, h, e].every((v) => Number.isFinite(v) && v > 0)) return <div className="corte-empty">Completa las medidas para ver el plano 2D.</div>
  const s = Math.min(270 / a, 250 / h), w = a * s, alto = h * s, x = (350 - w) / 2, y = 38
  return <figure className="manual-plano"><figcaption>Plano 2D · {p.codigo} · {p.nombre}</figcaption>
    <svg viewBox="0 0 350 355" role="img" aria-label={`Plano 2D ${p.nombre}, ${fmtCm(a)} por ${fmtCm(h)} cm y ${e} mm de espesor`}>
      <rect x={x} y={y} width={w} height={alto} fill="#d9ebed" stroke="#46717c" />
      <path d={`M ${x} ${y - 10} h ${w} M ${x} ${y - 14} v 8 M ${x + w} ${y - 14} v 8 M ${x - 10} ${y} v ${alto} M ${x - 14} ${y} h 8 M ${x - 14} ${y + alto} h 8`} fill="none" stroke="#607c84" />
      <text x={175} y={y - 18} textAnchor="middle" fontSize={12}>{fmtCm(a)} cm</text>
      <text transform={`translate(${x - 19},${y + alto / 2}) rotate(-90)`} textAnchor="middle" fontSize={12}>{fmtCm(h)} cm</text>
      <rect x={x} y={y + alto + 18} width={w} height={Math.max(2, e * s)} fill="#aacdd0" stroke="#46717c" />
      <text x={175} y={Math.min(341, y + alto + 48)} textAnchor="middle" fontSize={12}>Espesor: {e} mm · Cantidad: {p.cantidad}</text>
    </svg></figure>
}

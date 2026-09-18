import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Box, Scan, ZoomIn, ZoomOut, Download, Expand, Shrink, RotateCcw } from 'lucide-react'
import { crearModeloMueble, ACABADOS_MUEBLE } from '../utils/modeloMueble.js'
import { VisorWebGL } from '../utils/visorWebGL.js'
import { fmtCm } from '../utils/unidades.js'
import './VistaMueble3D.css'
import EditorPiezaMDF from './EditorPiezaMDF.jsx'

export default function VistaMueble3D({ diseno, piezas, seleccionado, onSeleccionar, onEditarPieza, compacto = false, modeloManual }) {
  const modelo = useMemo(() => modeloManual || crearModeloMueble(diseno, piezas), [diseno, piezas, modeloManual])
  if (!modelo.piezas.length) return <div className="mueble3d-empty"><Box size={32} /><p>{modelo.avisos[0] || 'Completa las medidas del mueble.'}</p></div>
  return <VisorModelo modelo={modelo} seleccionadoExterno={seleccionado}
    onSeleccionar={onSeleccionar} compacto={compacto} diseno={diseno} onEditarPieza={onEditarPieza} manual={!!modeloManual} />
}

function VisorModelo({ modelo, seleccionadoExterno, onSeleccionar, compacto, diseno, onEditarPieza, manual }) {
  const ayudaId = useId()
  const canvas = useRef(null), motor = useRef(null), cambioSeleccion = useRef(null)
  const [seleccionLocal, setSeleccionLocal] = useState(null), [interior, setInterior] = useState(false)
  const [sinTrasera, setSinTrasera] = useState(false), [aislar, setAislar] = useState(false)
  const [verHerrajes, setVerHerrajes] = useState(true)
  const [abiertos, setAbiertos] = useState({}), [verConstruccion, setVerConstruccion] = useState(false)
  const alternar = (id) => setAbiertos((a) => ({ ...a, [id]: !a[id] }))
  const [explosion, setExplosion] = useState(0), [acabadoId, setAcabadoId] = useState('blanco')
  const [completa, setCompleta] = useState(false), [error, setError] = useState(''), [intento, setIntento] = useState(0)
  const [estado, setEstado] = useState({ zoom: 100, visibles: modelo.piezas.length })
  const seleccionado = seleccionadoExterno === undefined ? seleccionLocal : seleccionadoExterno
  const todas = [...modelo.piezas, ...(modelo.espejos || []), ...(modelo.herrajes || [])]
  const pieza = todas.find((p) => p.id === seleccionado)
  const acabado = ACABADOS_MUEBLE.find((a) => a.id === acabadoId) || ACABADOS_MUEBLE[0]
  const seleccionar = (id) => { setSeleccionLocal(id); if (!id) setAislar(false); onSeleccionar?.(id) }
  cambioSeleccion.current = seleccionar
  useEffect(() => {
    try { motor.current = new VisorWebGL(canvas.current, { onSeleccionar: (id) => cambioSeleccion.current(id), onAlternar: alternar, onError: setError, onCambio: setEstado }) }
    catch (e) { setError(e.message) }
    return () => { motor.current?.dispose(); motor.current = null }
  }, [intento])
  useEffect(() => {
    motor.current?.actualizar(modelo, { seleccionado: pieza?.id, interior, sinTrasera, aislar: aislar && !!pieza, explosion, acabado, verHerrajes, abiertos, verConstruccion })
  }, [modelo, seleccionado, pieza, interior, sinTrasera, aislar, explosion, acabado, intento, verHerrajes, abiertos, verConstruccion])
  useEffect(() => {
    const salir = (e) => { if (e.key === 'Escape') setCompleta(false) }
    window.addEventListener('keydown', salir)
    return () => window.removeEventListener('keydown', salir)
  }, [])
  const imagen = () => {
    try {
      motor.current?.dibujar()
      canvas.current.toBlob((blob) => {
        if (!blob) { setError('No se pudo generar la imagen.'); return }
        const url = URL.createObjectURL(blob), a = document.createElement('a')
        a.href = url; a.download = 'mueble-3d.png'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      }, 'image/png')
    } catch { setError('No se pudo guardar la imagen del mueble.') }
  }
  const ocultar = (key, valor) => {
    if (key === 'interior') setInterior(valor); else setSinTrasera(valor)
    if (valor && pieza?.grupo === (key === 'interior' ? 'frentes' : 'trasera')) seleccionar(null)
  }
  return <section className={`mueble3d ${compacto ? 'compacto' : ''} ${completa ? 'fullscreen' : ''}`} aria-label="Modelo 3D del mueble">
    <header className="mueble3d-header"><div><Box size={18} /><strong>{manual ? 'Piezas 3D' : 'Modelo 3D'}</strong><span>{manual ? `${modelo.piezas.length} piezas representadas` : `1 mueble · ${modelo.piezas.length} piezas`}</span></div>
      <div className="mueble3d-buttons"><Tool icon={Download} label="Guardar imagen 3D" onClick={imagen} disabled={!!error} />
        <Tool icon={completa ? Shrink : Expand} label={completa ? 'Salir de pantalla completa 3D' : 'Pantalla completa 3D'} onClick={() => setCompleta(!completa)} /></div>
    </header>
    <div className="mueble3d-toolbar" role="toolbar" aria-label="Cámara del mueble">
      <Tool icon={Scan} label="Ajustar vista 3D" onClick={() => motor.current?.vista('perspectiva')} />
      <Tool icon={ZoomOut} label="Alejar 3D" onClick={() => motor.current?.acercar(1 / 1.2)} />
      <output aria-label="Zoom 3D">{estado.zoom}%</output>
      <Tool icon={ZoomIn} label="Acercar 3D" onClick={() => motor.current?.acercar(1.2)} />
      <div className="mueble3d-cameras">{[['frontal', 'Frente'], ['lateral', 'Lado'], ['superior', 'Arriba'], ['trasera', 'Atrás']].map(([vista, nombre]) =>
        <button key={vista} type="button" onClick={() => motor.current?.vista(vista)} aria-label={`Vista 3D ${nombre.toLowerCase()}`}>{nombre}</button>)}</div>
    </div>
    <div className="mueble3d-body">
      <div className="mueble3d-stage">
        <canvas key={intento} ref={canvas} aria-label="Mueble 3D interactivo" tabIndex={0} aria-describedby={ayudaId} />
        {error && <div className="mueble3d-error" role="alert"><p>{error}</p><button type="button" className="corte-button" onClick={() => { setError(''); setIntento((n) => n + 1) }}><RotateCcw size={16} />Reintentar 3D</button></div>}
        {!error && <span className="mueble3d-dim">{(modelo.envolvente || [modelo.ancho, modelo.alto, modelo.fondo]).map(fmtCm).join(' × ')} cm{modelo.envolvente ? ' · exteriores' : ''}</span>}
      </div>
      <aside className="mueble3d-controls">
        <label>Acabado de referencia<select aria-label="Acabado 3D" value={acabadoId} onChange={(e) => setAcabadoId(e.target.value)}>
          {ACABADOS_MUEBLE.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>
        <label className="mueble3d-check"><input type="checkbox" checked={interior} onChange={(e) => ocultar('interior', e.target.checked)} />Ver interior</label>
        <label className="mueble3d-check"><input type="checkbox" checked={sinTrasera} onChange={(e) => ocultar('trasera', e.target.checked)} />Ocultar trasera</label>
        {!!modelo.herrajes?.length && <label className="mueble3d-check"><input type="checkbox" checked={verHerrajes} onChange={(e) => { setVerHerrajes(e.target.checked); if (pieza?.herraje) seleccionar(null) }} />Mostrar rieles</label>}
        {!!modelo.componentes?.length && <label className="mueble3d-check"><input type="checkbox" checked={verConstruccion} onChange={(e) => setVerConstruccion(e.target.checked)} />Ver caras y refuerzos</label>}
        <button type="button" className="corte-button" onClick={() => setAbiertos({})}>Cerrar todas las aperturas</button>
        <label className="mueble3d-explode">Separar piezas <output>{Math.round(explosion * 100)}%</output>
          <input aria-label="Separar piezas 3D" type="range" min="0" max="100" step="1" value={Math.round(explosion * 100)} onChange={(e) => setExplosion(Number(e.target.value) / 100)} /></label>
        <label>Pieza<select aria-label="Seleccionar pieza 3D" value={pieza?.id || ''} onChange={(e) => {
          const p = todas.find((p) => p.id === e.target.value)
          if (p?.grupo === 'frentes') setInterior(false)
          if (p?.grupo === 'trasera') setSinTrasera(false)
          if (p?.herraje) setVerHerrajes(true)
          seleccionar(p?.id || null)
        }}><option value="">Selecciona una pieza</option>{todas.map((p, i) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre} · {i + 1}</option>)}</select></label>
        {pieza && <div className="mueble3d-detail"><strong>{pieza.codigo} · {pieza.nombre}</strong><span>{fmtCm(pieza.ancho)} × {fmtCm(pieza.alto)} cm · {pieza.espesor} mm</span>
          <span>{pieza.modulo === null ? 'Carcasa' : `Módulo ${pieza.modulo + 1}`}</span>
          <label className="mueble3d-check"><input type="checkbox" checked={aislar} onChange={(e) => setAislar(e.target.checked)} />Aislar pieza</label>
          {pieza.movimiento && <button type="button" className="corte-button" onClick={() => alternar(pieza.movimiento.id)}>{abiertos[pieza.movimiento.id] ? 'Cerrar pieza' : 'Abrir pieza'}</button>}
          {onEditarPieza && pieza.clave && !pieza.herraje && !pieza.espejo && <EditorPiezaMDF key={pieza.clave + JSON.stringify(diseno.fabricacion?.perfiles?.[pieza.clave]) + JSON.stringify(diseno.fabricacion?.ajustes?.[pieza.clave])}
            pieza={pieza} diseno={diseno} onGuardar={onEditarPieza} />}
        </div>}
        <p className="mueble3d-note">{modelo.herrajes?.length ? 'Rieles esquemáticos. Las holguras se ajustan en la configuración del módulo.' : 'Ensamblaje de referencia.'} Sin mecanizados.</p>
      </aside>
    </div>
    <footer className="mueble3d-footer"><span id={ayudaId}>Un toque: seleccionar y editar · Doble toque: abrir/cerrar · Arrastrar: girar · Rueda: ampliar</span><span>{estado.visibles} visibles</span></footer>
  </section>
}

function Tool({ icon: Icon, label, ...props }) {
  return <button type="button" className="corte-tool" aria-label={label} title={label} {...props}><Icon size={17} /></button>
}

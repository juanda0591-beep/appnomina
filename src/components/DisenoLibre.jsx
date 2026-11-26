import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Move, RotateCcw, Copy, Trash2, Expand, Shrink, Scan, MousePointer2, Download, Undo2, Redo2, Save } from 'lucide-react'
import { VisorWebGL } from '../utils/visorWebGL.js'
import { modeloPiezasManuales } from '../utils/piezasManuales.js'
import { ACABADOS_MUEBLE } from '../utils/modeloMueble.js'
import { dibujarCotasImagen } from '../utils/cotas3D.js'
import { agregarTablero, editarTablero, duplicarTablero, eliminarTablero, girarTablero, ajustarArrastre, alinearTablero, ubicarPendientes } from '../utils/disenoLibre.js'
import './DisenoLibre.css'

export default function DisenoLibre({ proyecto, onCambiar, onDespiece, onDeshacer, onRehacer, onGuardar, puedeDeshacer, puedeRehacer, puedeGuardar }) {
  const [seleccion, setSeleccion] = useState(null), [creando, setCreando] = useState(false)
  const [herramienta, setHerramienta] = useState('orbitar'), [eje, setEje] = useState('libre')
  const [paso, setPaso] = useState(10), [caras, setCaras] = useState(true), [rejilla, setRejilla] = useState(true)
  const [mostrarCotas, setMostrarCotas] = useState(true)
  const [acabado, setAcabado] = useState('blanco'), [completa, setCompleta] = useState(false)
  const [error, setError] = useState(''), [preview, setPreview] = useState(null), [copiaPaso, setCopiaPaso] = useState(100), [copiaEje, setCopiaEje] = useState('x')
  const [referencia, setReferencia] = useState(''), [alineacion, setAlineacion] = useState('despues'), [ejeAlinear, setEjeAlinear] = useState('x')
  const motor = useRef(null), arrastre = useRef(null)
  const modelo = useMemo(() => modeloPiezasManuales(proyecto.piezas, proyecto.lamina.espesor, proyecto.montajeManual || [], 'montaje'), [proyecto])
  const pieza = modelo.piezas.find((p) => p.id === seleccion)
  const tipo = pieza && proyecto.piezas.find((p) => p.codigo === pieza.codigo)
  const lugar = pieza && proyecto.montajeManual.find((m) => `${m.codigo}-${m.unidad}` === pieza.id)
  const modeloVisible = useMemo(() => !preview ? modelo : { ...modelo, piezas: modelo.piezas.map((p) => p.id !== preview.id ? p : {
    ...p, origen: preview.origen, posicion: preview.origen.map((v, i) => v + p.dimensiones[i] / 2),
  }) }, [modelo, preview])
  const opciones = useMemo(() => ({ editor: true, seleccionado: pieza?.id, herramienta, ejeArrastre: eje, rejilla, mostrarCotas,
    acabado: ACABADOS_MUEBLE.find((a) => a.id === acabado), verHerrajes: false }), [pieza?.id, herramienta, eje, rejilla, mostrarCotas, acabado])
  useEffect(() => {
    const salir = (e) => { if (e.key === 'Escape') setCompleta(false) }
    window.addEventListener('keydown', salir)
    return () => window.removeEventListener('keydown', salir)
  }, [])
  useEffect(() => {
    const tecla = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || arrastre.current || e.target.closest('input, textarea, select, [contenteditable="true"]')) return
      const k = e.key.toLowerCase()
      if (k === 'z') { e.preventDefault(); if (e.shiftKey ? puedeRehacer : puedeDeshacer) (e.shiftKey ? onRehacer : onDeshacer)() }
      else if (k === 'y') { e.preventDefault(); if (puedeRehacer) onRehacer() }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [puedeDeshacer, puedeRehacer, onDeshacer, onRehacer])
  const actuar = (fn) => {
    try { fn(); setError('') } catch (e) { setError(e.message) }
  }
  const seleccionar = (id) => { setSeleccion(id); setCreando(false); setError('') }
  const arrastrar = (evento) => {
    if (evento.fase === 'incompatible') { setError(evento.mensaje); return }
    if (evento.fase === 'iniciar') { arrastre.current = proyecto; setError(''); return }
    if (evento.fase === 'cancelar') { arrastre.current = null; setPreview(null); return }
    const base = arrastre.current
    if (!base) return
    try {
      const origen = ajustarArrastre(base, evento.id, evento.origen, { eje, paso: Number(paso), caras })
      if (evento.fase === 'mover') setPreview({ id: evento.id, origen })
      else {
        const original = base.montajeManual.find((m) => `${m.codigo}-${m.unidad}` === evento.id)
        if (['x', 'y', 'z'].some((e, i) => original[e] !== origen[i])) onCambiar(editarTablero(base, evento.id, Object.fromEntries(['x', 'y', 'z'].map((e, i) => [e, origen[i]]))))
        arrastre.current = null; setPreview(null)
      }
    } catch (e) { setError(e.message); if (evento.fase === 'terminar') { arrastre.current = null; setPreview(null) } }
  }
  const nueva = (datos) => actuar(() => {
    const r = agregarTablero(proyecto, datos); onCambiar(r.proyecto); setSeleccion(r.id); setCreando(false)
  })
  const guardarImagen = () => actuar(() => {
    const canvas = motor.current?.canvas
    if (!canvas) return
    motor.current.dibujar()
    const imagen = document.createElement('canvas'); imagen.width = canvas.width; imagen.height = canvas.height
    const ctx = imagen.getContext('2d'), rect = canvas.getBoundingClientRect()
    ctx.drawImage(canvas, 0, 0); ctx.scale(canvas.width / rect.width, canvas.height / rect.height)
    dibujarCotasImagen(ctx, motor.current.cotas || [])
    imagen.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob), a = document.createElement('a')
      a.href = url; a.download = 'diseno-libre.png'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/png')
  })
  if (proyecto.diseno) return <section className="libre-parametrico"><h3>Diseño libre</h3>
    <p>Este proyecto usa el generador por medidas. Puedes seguir editándolo allí. Para crear un mueble pieza por pieza, abre un proyecto nuevo y entra en Diseño libre.</p>
  </section>
  return <section className={`diseno-libre ${completa ? 'diseno-libre-completo' : ''}`} aria-label="Editor de diseño libre">
    <header className="libre-cabecera"><div><strong>Diseño libre</strong><span>Tableros rectangulares · medidas exactas · giros de 90°</span></div>
      <div className="corte-actions"><button type="button" className="corte-button primary" disabled={!!preview} onClick={() => { setCreando(true); setError('') }}><Plus size={16}/>Nuevo tablero</button>
        {completa && onGuardar && <button type="button" className="corte-button" disabled={!puedeGuardar || !!preview || !proyecto.piezas.length} onClick={onGuardar}><Save size={15}/>Guardar versión</button>}
        <button type="button" className="corte-button" onClick={onDespiece} disabled={!!preview}>Ver despiece y corte</button>
        <button type="button" className="corte-button libre-pantalla" aria-label={completa ? 'Reducir diseño libre' : 'Ampliar diseño libre'} onClick={() => setCompleta(!completa)}>
          {completa ? <Shrink size={16}/> : <Expand size={16}/>}<span>{completa ? 'Reducir pantalla' : 'Ampliar'}</span></button></div>
    </header>
    <div className="libre-herramientas" role="toolbar" aria-label="Herramientas de diseño libre">
      <button type="button" className="corte-tool" aria-label="Deshacer diseño libre" title="Deshacer · Ctrl+Z" disabled={!puedeDeshacer || !!preview} onClick={onDeshacer}><Undo2 size={17}/></button>
      <button type="button" className="corte-tool" aria-label="Rehacer diseño libre" title="Rehacer · Ctrl+Y" disabled={!puedeRehacer || !!preview} onClick={onRehacer}><Redo2 size={17}/></button>
      <button type="button" className="corte-button" aria-pressed={herramienta === 'orbitar'} onClick={() => setHerramienta('orbitar')}><MousePointer2 size={16}/>Seleccionar / girar vista</button>
      <button type="button" className="corte-button" aria-pressed={herramienta === 'mover'} onClick={() => setHerramienta('mover')}><Move size={16}/>Mover tablero</button>
      <label>Eje de arrastre<select aria-label="Eje de arrastre" value={eje} onChange={(e) => setEje(e.target.value)}><option value="libre">Libre en la vista</option><option value="x">X · izquierda / derecha</option><option value="y">Y · arriba / abajo</option><option value="z">Z · atrás / adelante</option></select></label>
      <label>Paso (mm)<select aria-label="Paso de diseño libre" value={paso} onChange={(e) => setPaso(Number(e.target.value))}>{[0, 1, 5, 10, 25, 50, 100].map((n) => <option key={n} value={n}>{n ? `${n} mm` : 'Sin paso'}</option>)}</select></label>
      <label className="corte-check"><input type="checkbox" checked={caras} onChange={(e) => setCaras(e.target.checked)}/>Ajustar a caras</label>
    </div>
    {error && <p className="banner error" role="alert">{error}</p>}
    <div className="libre-espacio">
      <div className="libre-visual">
        <div className="libre-camaras"><button type="button" className="corte-button" aria-label="Ajustar vista libre" onClick={() => motor.current?.vista('perspectiva')}><Scan size={16}/>Ajustar</button>
          {['frontal', 'lateral', 'superior'].map((v, i) => <button key={v} type="button" className="corte-button" onClick={() => motor.current?.vista(v)}>{['Frente', 'Lado', 'Arriba'][i]}</button>)}
          <button type="button" className="corte-tool" aria-label="Descargar imagen del diseño libre" onClick={guardarImagen}><Download size={16}/></button>
          <label className="corte-check libre-medidas"><input type="checkbox" checked={mostrarCotas} onChange={(e) => setMostrarCotas(e.target.checked)}/>Mostrar medidas</label></div>
        <LienzoLibre modelo={modeloVisible} opciones={opciones} motor={motor} onSeleccionar={seleccionar} onArrastrar={arrastrar}/>
        {!modelo.piezas.length && <div className="libre-vacio"><strong>Tu mueble empieza con un tablero</strong><span>Usa Nuevo tablero para indicar sus medidas y posición.</span></div>}
        <div className="libre-estado" aria-live="polite"><span>{preview ? `Moviendo: ${preview.origen.join(' / ')} mm` : pieza ? `${pieza.nombre} · ${pieza.ancho / 10} × ${pieza.alto / 10} cm · ${pieza.espesor} mm` : `${modelo.piezas.length} tableros ubicados`}</span><span>X rojo · Y verde · Z azul</span></div>
      </div>
      <aside className="libre-propiedades" aria-label="Propiedades de diseño libre">
        {creando || !proyecto.piezas.length ? <><h3>Nuevo tablero</h3><FormularioTablero key={`nuevo-${proyecto.piezas.length}`} datos={{ nombre: `Tablero ${proyecto.piezas.length + 1}`, ancho: 600, alto: 800, espesor: Number(proyecto.lamina.espesor) || 18, plano: 'frente', x: 0, y: 0, z: 0 }} onGuardar={nueva} nuevo/>
          {creando && <button type="button" className="corte-button" onClick={() => setCreando(false)}>Cancelar</button>}</> : <>
          <label>Tablero<select aria-label="Tablero de diseño libre" value={pieza?.id || ''} onChange={(e) => seleccionar(e.target.value || null)}><option value="">Selecciona en el 3D</option>{modelo.piezas.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre} · unidad {p.id.slice(p.codigo.length + 1)}</option>)}</select></label>
          {pieza ? <>
            <FormularioTablero key={JSON.stringify([tipo, lugar])} datos={{ ...tipo, ...lugar }} onGuardar={(datos) => actuar(() => onCambiar(editarTablero(proyecto, pieza.id, datos)))}/>
            {tipo.cantidad > 1 && <p className="muted small">Las medidas se comparten entre las {tipo.cantidad} unidades de {tipo.codigo}. La posición y el giro son individuales.</p>}
            <details><summary>Girar y copiar</summary>
              <div className="libre-giros">{['x', 'y', 'z'].map((e) => <button type="button" key={e} className="corte-button" onClick={() => actuar(() => onCambiar(girarTablero(proyecto, pieza.id, e)))}><RotateCcw size={14}/>Girar {e.toUpperCase()} 90°</button>)}</div>
              <div className="corte-pair"><label>Eje de copia<select aria-label="Eje de copia" value={copiaEje} onChange={(e) => setCopiaEje(e.target.value)}>{['x', 'y', 'z'].map((e) => <option key={e}>{e}</option>)}</select></label>
                <label>Separación de copia (mm)<input aria-label="Separación de copia (mm)" type="number" step="0.1" value={copiaPaso} onChange={(e) => setCopiaPaso(e.target.value)}/></label></div>
              <button type="button" className="corte-button" onClick={() => actuar(() => { const r = duplicarTablero(proyecto, pieza.id, copiaEje, Number(copiaPaso)); onCambiar(r.proyecto); setSeleccion(r.id) })}><Copy size={15}/>Duplicar tablero</button>
            </details>
            <details><summary>Alinear o unir caras</summary><label>Referencia<select aria-label="Tablero de referencia" value={referencia} onChange={(e) => setReferencia(e.target.value)}><option value="">Elige otro tablero</option>{modelo.piezas.filter((p) => p.id !== pieza.id).map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}</select></label>
              <div className="corte-pair"><label>Eje<select aria-label="Eje de alineación" value={ejeAlinear} onChange={(e) => setEjeAlinear(e.target.value)}>{['x', 'y', 'z'].map((e) => <option key={e}>{e}</option>)}</select></label>
                <label>Ajuste<select aria-label="Ajuste de alineación" value={alineacion} onChange={(e) => setAlineacion(e.target.value)}>{[['inicio', 'Borde inicial'], ['centro', 'Centrar'], ['final', 'Borde final'], ['antes', 'Unir antes'], ['despues', 'Unir después']].map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label></div>
              <button type="button" className="corte-button" disabled={!referencia || referencia === pieza.id} onClick={() => actuar(() => onCambiar(alinearTablero(proyecto, pieza.id, referencia, ejeAlinear, alineacion)))}>Aplicar alineación</button>
            </details>
            <button type="button" className="corte-button libre-eliminar" onClick={() => actuar(() => { onCambiar(eliminarTablero(proyecto, pieza.id)); setSeleccion(null) })}><Trash2 size={15}/>Eliminar esta unidad</button>
          </> : <p className="muted">Selecciona un tablero para editar medidas, posición y orientación.</p>}
        </>}
        {modelo.faltantes.length > 0 && <div className="libre-pendientes"><p>{modelo.faltantes.length} unidades sin ubicar. Conservan sus medidas de corte.</p><button type="button" className="corte-button" onClick={() => actuar(() => onCambiar(ubicarPendientes(proyecto)))}>Ubicar piezas pendientes</button></div>}
        <details><summary>Apariencia del área 3D</summary><label>Acabado de referencia<select aria-label="Acabado diseño libre" value={acabado} onChange={(e) => setAcabado(e.target.value)}>{ACABADOS_MUEBLE.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>
          <label className="corte-check"><input type="checkbox" checked={rejilla} onChange={(e) => setRejilla(e.target.checked)}/>Mostrar guía de 100 mm</label><p className="muted small">El acabado es una referencia visual. El material del proyecto se indica arriba.</p></details>
      </aside>
    </div>
    <footer className="libre-ayuda">Seleccionar / girar vista: clic para elegir y arrastrar para orbitar · Mover tablero: arrastra sobre la pieza · Rueda: zoom · Mayús o botón derecho: desplazar vista · Esc: cancelar arrastre · Deshacer y Guardar versión en la cabecera del proyecto.</footer>
  </section>
}

function FormularioTablero({ datos, onGuardar, nuevo = false }) {
  const [f, setF] = useState({ ...datos, ancho: datos.ancho / 10, alto: datos.alto / 10, giro: datos.giro || 0 })
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  return <form className="libre-formulario" onSubmit={(e) => {
    e.preventDefault(); onGuardar({ ...f, ancho: Number(f.ancho) * 10, alto: Number(f.alto) * 10, espesor: Number(f.espesor), x: Number(f.x), y: Number(f.y), z: Number(f.z) })
  }}><label>Nombre<input aria-label="Tablero · Nombre" value={f.nombre} maxLength={120} required onChange={(e) => set('nombre', e.target.value)}/></label>
    <div className="corte-pair">{[['ancho', 'Ancho (cm)', .01, 10000], ['alto', 'Alto / largo (cm)', .01, 10000], ['espesor', 'Espesor (mm)', .1, 200]].map(([key, label, min, max]) => <label key={key}>{label}<input aria-label={`Tablero · ${label}`} type="number" required min={min} max={max} step="any" value={f[key]} onChange={(e) => set(key, e.target.value)}/></label>)}</div>
    <label>Orientación<select aria-label="Tablero · Orientación" value={f.plano} onChange={(e) => set('plano', e.target.value)}><option value="frente">Frontal · puerta / trasera</option><option value="lateral">Lateral · costado / división</option><option value="horizontal">Horizontal · tapa / repisa</option></select></label>
    <label>Dirección del tablero<select aria-label="Tablero · Giro" value={f.giro} onChange={(e) => set('giro', Number(e.target.value))}><option value={0}>Ancho y largo originales</option><option value={90}>Girar 90° dentro del plano</option></select></label>
    <div className="libre-coordenadas">{['x', 'y', 'z'].map((eje) => <label key={eje}>{eje.toUpperCase()} (mm)<input aria-label={`Tablero · ${eje.toUpperCase()} (mm)`} type="number" required step="any" min={-100000} max={100000} value={f[eje]} onChange={(e) => set(eje, e.target.value)}/></label>)}</div>
    <p className="muted small">Posición de la esquina: X derecha, Y arriba, Z frente.</p>
    <button type="submit" className="corte-button primary">{nuevo ? 'Crear tablero' : 'Aplicar al tablero'}</button>
  </form>
}

function LienzoLibre({ modelo, opciones, motor, onSeleccionar, onArrastrar }) {
  const canvas = useRef(null), callbacks = useRef({}), [error, setError] = useState(''), [intento, setIntento] = useState(0)
  const [cotas, setCotas] = useState(null)
  callbacks.current = { onSeleccionar, onArrastrar }
  useEffect(() => {
    try { motor.current = new VisorWebGL(canvas.current, { onSeleccionar: (id) => callbacks.current.onSeleccionar(id), onArrastrar: (e) => callbacks.current.onArrastrar(e), onError: setError, onCotas: setCotas }) }
    catch (e) { setError(e.message) }
    return () => { motor.current?.dispose(); motor.current = null }
  }, [intento, motor])
  useEffect(() => { motor.current?.actualizar(modelo, opciones) }, [modelo, opciones, intento, motor])
  return <div className="libre-lienzo"><canvas key={intento} ref={canvas} aria-label="Diseño libre 3D interactivo" tabIndex={0} data-herramienta={opciones.herramienta}/>
    {!error && opciones.mostrarCotas && cotas?.cotas.length > 0 && <svg className="libre-cotas" viewBox={`0 0 ${cotas.ancho} ${cotas.alto}`} role="img" aria-label="Medidas del tablero seleccionado">
      {cotas.cotas.map((c) => <g key={c.key} data-cota={c.key}>
        <path d={c.lineas.map(([a, b]) => `M${a.join(',')} L${b.join(',')}`).join(' ')} fill="none" stroke={c.color} strokeWidth="1.2"/>
        <rect x={c.etiqueta.x} y={c.etiqueta.y} width={c.etiqueta.w} height={c.etiqueta.h} fill="#fff" stroke="#b5ced2" rx="3"/>
        <text x={c.etiqueta.x + c.etiqueta.w / 2} y={c.etiqueta.y + c.etiqueta.h / 2} textAnchor="middle" dominantBaseline="central" fill={c.color}>{c.etiqueta.texto}</text>
      </g>)}
    </svg>}
    {error && <div className="libre-error" role="alert"><p>{error}</p><button type="button" className="corte-button" onClick={() => { setError(''); setIntento((n) => n + 1) }}>Reintentar diseño 3D</button></div>}</div>
}

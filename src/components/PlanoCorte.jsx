import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Rect, Text, Group, Line, Arrow } from 'react-konva'
import { ZoomIn, ZoomOut, Scan, Hand, MousePointer2, Ruler, Grid2X2, Expand, Shrink, Layers } from 'lucide-react'
import { colorPieza, bordesPieza } from '../utils/proyectoCorte.js'
import { fmtCm } from '../utils/unidades.js'

export function Herramienta({ icono: Icono, titulo, activo, ...props }) {
  return <button type="button" className={`corte-tool ${activo ? 'active' : ''}`} title={titulo}
    aria-label={titulo} aria-pressed={activo} {...props}><Icono size={18} strokeWidth={1.8} /></button>
}

export default function PlanoCorte({ ancho, largo, piezas, retazos = [], margen = 0, seleccionado, onSeleccionar }) {
  const host = useRef(null), stage = useRef(null), gesto = useRef(null)
  const [tamano, setTamano] = useState({ width: 600, height: 560 })
  const [camara, setCamara] = useState({ zoom: 1, x: 0, y: 0 })
  const [modo, setModo] = useState('seleccion')
  const [cotas, setCotas] = useState(true), [rejilla, setRejilla] = useState(false)
  const [verRetazos, setVerRetazos] = useState(true), [completa, setCompleta] = useState(false)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setTamano({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) }))
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => { setCamara({ zoom: 1, x: 0, y: 0 }) }, [ancho, largo, piezas, tamano.width, tamano.height])
  useEffect(() => {
    const salir = (e) => { if (e.key === 'Escape') setCompleta(false) }
    window.addEventListener('keydown', salir)
    return () => window.removeEventListener('keydown', salir)
  }, [])
  const base = Math.max(0.001, Math.min((tamano.width - 100) / ancho, (tamano.height - 100) / largo))
  const escala = base * camara.zoom
  const origen = { x: (tamano.width - ancho * base) / 2 + camara.x, y: (tamano.height - largo * base) / 2 + camara.y }
  const acercar = (factor, punto = { x: tamano.width / 2, y: tamano.height / 2 }) => {
    const zoom = Math.min(8, Math.max(0.25, camara.zoom * factor)), ratio = zoom / camara.zoom
    setCamara({ zoom, x: camara.x + (punto.x - origen.x) * (1 - ratio), y: camara.y + (punto.y - origen.y) * (1 - ratio) })
  }
  const onTouchMove = (e) => {
    if (e.evt.touches.length !== 2) return
    e.evt.preventDefault()
    const [a, b] = e.evt.touches, rect = host.current.getBoundingClientRect()
    const centro = { x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top }
    const distancia = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    if (gesto.current) acercar(distancia / gesto.current.distancia, centro)
    gesto.current = { distancia }
  }
  const seleccion = piezas.find((p) => (p.id || p.codigo) === seleccionado)
  const px = (n) => n / escala
  return <div className={`corte-visor ${completa ? 'corte-fullscreen' : ''}`}>
    <div className="corte-toolbar" role="toolbar" aria-label="Herramientas del plano">
      <Herramienta icono={MousePointer2} titulo="Seleccionar pieza" activo={modo === 'seleccion'} onClick={() => setModo('seleccion')} />
      <Herramienta icono={Hand} titulo="Desplazar plano" activo={modo === 'mano'} onClick={() => setModo('mano')} />
      <span className="corte-tool-separator" />
      <Herramienta icono={ZoomOut} titulo="Alejar" onClick={() => acercar(1 / 1.25)} />
      <output className="corte-zoom" aria-label="Zoom">{Math.round(camara.zoom * 100)}%</output>
      <Herramienta icono={ZoomIn} titulo="Acercar" onClick={() => acercar(1.25)} />
      <Herramienta icono={Scan} titulo="Ajustar a pantalla" onClick={() => setCamara({ zoom: 1, x: 0, y: 0 })} />
      <span className="corte-tool-separator" />
      <Herramienta icono={Ruler} titulo="Mostrar cotas" activo={cotas} onClick={() => setCotas(!cotas)} />
      <Herramienta icono={Grid2X2} titulo="Mostrar rejilla" activo={rejilla} onClick={() => setRejilla(!rejilla)} />
      <Herramienta icono={Layers} titulo="Mostrar retazos" activo={verRetazos} onClick={() => setVerRetazos(!verRetazos)} />
      <Herramienta icono={completa ? Shrink : Expand} titulo={completa ? 'Salir de pantalla completa' : 'Pantalla completa'} onClick={() => setCompleta(!completa)} />
    </div>
    <div className="corte-canvas" ref={host} style={{ cursor: modo === 'mano' ? 'grab' : 'default' }}>
      <Stage ref={stage} width={tamano.width} height={tamano.height}
        onWheel={(e) => { e.evt.preventDefault(); acercar(e.evt.deltaY < 0 ? 1.12 : 1 / 1.12, stage.current.getPointerPosition()) }}
        onTouchMove={onTouchMove} onTouchEnd={() => { gesto.current = null }}
        onTouchStart={(e) => { if (e.evt.touches.length === 2) { stage.current.findOne('.plano-mundo')?.stopDrag(); gesto.current = null } }}>
        <Layer>
          <Group name="plano-mundo" x={origen.x} y={origen.y} scaleX={escala} scaleY={escala} draggable={modo === 'mano'}
            onDragEnd={(e) => { if (e.target.name() === 'plano-mundo') setCamara({ ...camara, x: camara.x + e.target.x() - origen.x, y: camara.y + e.target.y() - origen.y }) }}>
            <Rect x={-100000} y={-100000} width={200000} height={200000} fill="rgba(0,0,0,0)" />
            <Rect width={ancho} height={largo} fill="#ffffff" stroke="#687782" strokeWidth={1} strokeScaleEnabled={false} />
            {margen > 0 && <Rect x={margen} y={margen} width={ancho - margen * 2} height={largo - margen * 2}
              stroke="#b6792b" dash={[6, 4]} strokeWidth={1} strokeScaleEnabled={false} listening={false} />}
            {rejilla && Array.from({ length: Math.min(100, Math.ceil(ancho / 100)) }, (_, i) =>
              <Line key={`x${i}`} points={[i * 100, 0, i * 100, largo]} stroke="#e7ecee" strokeWidth={1} strokeScaleEnabled={false} listening={false} />)}
            {rejilla && Array.from({ length: Math.min(100, Math.ceil(largo / 100)) }, (_, i) =>
              <Line key={`y${i}`} points={[0, i * 100, ancho, i * 100]} stroke="#e7ecee" strokeWidth={1} strokeScaleEnabled={false} listening={false} />)}
            {verRetazos && retazos.map((r) => <Group key={r.id} x={r.x} y={r.y} listening={false}>
              <Rect width={r.ancho} height={r.largo} fill="#f0f6f0" stroke="#98b4a0" dash={[4, 4]} strokeWidth={0.7} strokeScaleEnabled={false} />
              {r.ancho * escala > 70 && r.largo * escala > 36 && <Text text={`${r.id}\n${fmtCm(r.ancho)} x ${fmtCm(r.largo)}`}
                width={r.ancho} height={r.largo} fontSize={px(10)} fill="#5c7864" align="center" verticalAlign="middle" />}
            </Group>)}
            {piezas.map((p, i) => {
              const id = p.id || p.codigo || String(i), activo = seleccionado === id
              const bordes = { arriba: [0, 0, p.ancho, 0], abajo: [0, p.largo, p.ancho, p.largo], izq: [0, 0, 0, p.largo], der: [p.ancho, 0, p.ancho, p.largo] }
              return <Group key={id} x={p.x} y={p.y} onClick={() => onSeleccionar?.(id)} onTap={() => onSeleccionar?.(id)}>
                <Rect width={p.ancho} height={p.largo} fill={colorPieza(p.codigo || p.nombre)} stroke={activo ? '#087f8c' : '#51616e'} strokeWidth={activo ? 3 : 1} strokeScaleEnabled={false} />
                {bordesPieza(p).map((b) => <Line key={b} points={bordes[b]} stroke="#dc7436" strokeWidth={3} strokeScaleEnabled={false} listening={false} />)}
                {p.ancho * escala > 45 && p.largo * escala > 24 && <Group listening={false}>
                  <Text text={p.id || p.codigo || p.nombre} y={p.largo / 2 - px(cotas ? 13 : 6)} width={p.ancho}
                    height={px(14)} fontSize={px(11)} fill="#263841" align="center" wrap="none" ellipsis />
                  {cotas && <Text text={`${fmtCm(p.ancho)} x ${fmtCm(p.largo)}`} y={p.largo / 2 + px(2)} width={p.ancho}
                    height={px(13)} fontSize={px(10)} fill="#435c67" align="center" wrap="none" ellipsis />}
                </Group>}
                {!p.permiteRotar && p.ancho * escala > 45 && p.largo * escala > 65 && <Arrow
                  points={p.rotada ? [p.ancho / 2 - px(12), p.largo - px(10), p.ancho / 2 + px(12), p.largo - px(10)] : [p.ancho - px(10), p.largo / 2 + px(12), p.ancho - px(10), p.largo / 2 - px(12)]}
                  stroke="#687b83" fill="#687b83" strokeWidth={1} strokeScaleEnabled={false} pointerLength={px(4)} pointerWidth={px(4)} listening={false} />}
              </Group>
            })}
            {cotas && <Group listening={false}>
              <Line points={[0, -px(19), ancho, -px(19)]} stroke="#536b75" strokeWidth={1} strokeScaleEnabled={false} />
              <Line points={[-px(19), 0, -px(19), largo]} stroke="#536b75" strokeWidth={1} strokeScaleEnabled={false} />
              {[0, ancho].map((x) => <Line key={x} points={[x, -px(24), x, -px(14)]} stroke="#536b75" strokeWidth={1} strokeScaleEnabled={false} />)}
              {[0, largo].map((y) => <Line key={y} points={[-px(24), y, -px(14), y]} stroke="#536b75" strokeWidth={1} strokeScaleEnabled={false} />)}
              <Text text={`${fmtCm(ancho)} cm`} x={0} y={-px(38)} width={ancho} align="center" fontSize={px(12)} fill="#435c67" />
              <Text text={`${fmtCm(largo)} cm`} x={-px(39)} y={largo} width={largo} rotation={-90} align="center" fontSize={px(12)} fill="#435c67" />
            </Group>}
          </Group>
        </Layer>
      </Stage>
    </div>
    <div className="corte-status"><span>{seleccion ? `${seleccion.id || seleccion.codigo} · ${seleccion.nombre}` : `${piezas.length} piezas`}</span>
      <span>{seleccion ? `${fmtCm(seleccion.ancho)} × ${fmtCm(seleccion.largo)} cm` : `${fmtCm(ancho)} × ${fmtCm(largo)} cm`}</span></div>
  </div>
}

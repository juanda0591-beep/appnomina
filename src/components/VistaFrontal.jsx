import { Stage, Layer, Rect, Line, Text, Group } from 'react-konva'
import { anchoModulo } from '../utils/despiece.js'

// Vista frontal (alzado) del mueble, dibujada en vivo por módulo. Muestra las
// medidas de cada componente. Los entrepaños se pueden arrastrar verticalmente
// (o editar por número en el panel de módulos); su altura se refleja al instante.
const MT = 46, ML = 66, PAD = 30, MAXW = 470, MAXH = 540
const n = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)

export default function VistaFrontal({ f, setModulos, embebido = false, stageRef }) {
  // Medidas en cm; el espesor viene en mm, lo paso a cm para dibujar en una sola unidad.
  const An = n(f.ancho), Al = n(f.alto), E = n(f.espesor, 18) / 10
  const modulos = f.modulos
  const nMod = modulos.length

  if (!(An > 0 && Al > 0)) {
    return <p className="muted">Ingresa ancho y alto para ver el mueble.</p>
  }

  const scale = Math.min(MAXW / An, MAXH / Al)
  const Wd = An * scale, Hd = Al * scale
  const stageW = ML + Wd + PAD, stageH = MT + Hd + PAD
  const e = E * scale
  const anchoModCm = anchoModulo(An, E, nMod)
  const anchoMod = anchoModCm * scale

  // Al soltar un entrepaño arrastrado: convierte px del dibujo a cm desde el piso.
  const moverEntrepano = (idxMod, k, yPxDentro) => {
    const altoIntCm = Al - 2 * E
    const alturaCm = Math.round((altoIntCm - (yPxDentro / (Hd - 2 * e)) * altoIntCm) * 10) / 10
    setModulos((ms) => ms.map((m, i) =>
      i === idxMod ? { ...m, alturas: m.alturas.map((a, j) => (j === k ? clamp(alturaCm, 0, altoIntCm) : a)) } : m))
  }

  const contenido = (
    <>
      <p className="muted small" style={{ margin: '0 0 6px' }}>Arrastra los entrepaños para reubicarlos.</p>
      <div style={{ position: 'relative', width: stageW }}>
        <Stage width={stageW} height={stageH} ref={stageRef}>
          <Layer>
            <CotasGlobales {...{ Wd, Hd }} An={An} Al={Al} />
            <Group x={ML} y={MT}>
              <Carcasa {...{ Wd, Hd, e }} />
              {modulos.map((m, i) => (
                <ModuloDibujo key={i} {...{ m, i, e, Wd, Hd, anchoMod, anchoModCm, scale, Al, E }}
                  onMover={moverEntrepano} />
              ))}
            </Group>
          </Layer>
        </Stage>
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>
        Fondo: {f.fondo || '—'} cm · {nMod} módulo(s) de ≈{Math.round(anchoModCm)} cm c/u.
        Medidas en cm.
      </p>
    </>
  )

  if (embebido) return contenido
  return (
    <div className="card" style={{ background: '#f8fafc' }}>
      <h4>Vista frontal</h4>
      {contenido}
    </div>
  )
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// Cotas de ancho (arriba) y alto (izquierda) del mueble completo.
function CotasGlobales({ Wd, Hd, An, Al }) {
  const azul = '#2563eb', y = MT - 16, x = ML - 16
  return (
    <>
      <Line points={[ML, y, ML + Wd, y]} stroke={azul} strokeWidth={1} />
      <Line points={[ML, y - 4, ML, y + 4]} stroke={azul} strokeWidth={1} />
      <Line points={[ML + Wd, y - 4, ML + Wd, y + 4]} stroke={azul} strokeWidth={1} />
      <Text text={`${An} cm`} x={ML} y={y - 15} width={Wd} align="center" fontSize={12} fontStyle="bold" fill={azul} />
      <Line points={[x, MT, x, MT + Hd]} stroke={azul} strokeWidth={1} />
      <Line points={[x - 4, MT, x + 4, MT]} stroke={azul} strokeWidth={1} />
      <Line points={[x - 4, MT + Hd, x + 4, MT + Hd]} stroke={azul} strokeWidth={1} />
      <Text text={`${Al} cm`} x={x - 46} y={MT + Hd / 2} width={Hd} align="center" fontSize={12}
        fontStyle="bold" fill={azul} rotation={-90} />
    </>
  )
}

// Carcasa exterior y hueco interior.
function Carcasa({ Wd, Hd, e }) {
  return (
    <>
      <Rect x={0} y={0} width={Wd} height={Hd} fill="#fff" stroke="#334155" strokeWidth={2} />
      <Rect x={e} y={e} width={Wd - 2 * e} height={Hd - 2 * e} fill="#fdf6ec" stroke="#cbd5e1" strokeWidth={1} />
    </>
  )
}

// Dibuja un módulo: su división, cajones, puertas y entrepaños (arrastrables).
// Todo en cm. Si el cajón es parcial, ocupa una columna a un lado y la puerta
// va a la columna contigua a altura completa.
function ModuloDibujo({ m, i, e, Hd, anchoMod, anchoModCm, scale, Al, E, onMover }) {
  const x0 = e + i * (anchoMod + e)
  const yTop = e, hInt = Hd - 2 * e
  const anchoCajCm = n(m.anchoCajon, 0)
  const cajonParcial = m.cajones > 0 && n(m.zonaCajones) > 0 && anchoCajCm > 0 && anchoCajCm < anchoModCm
  const anchoColCajPx = cajonParcial ? anchoCajCm * scale : anchoMod
  const cajonIzq = (m.ladoCajon || 'izq') === 'izq'
  // x de la columna de cajón y de la columna de puerta.
  const xCaj = cajonParcial && !cajonIzq ? x0 + anchoMod - anchoColCajPx : x0
  const xPuerta = cajonParcial && cajonIzq ? x0 + anchoColCajPx + e : x0
  const anchoPuertaPx = cajonParcial ? anchoMod - anchoColCajPx - e : anchoMod
  const anchoPuertaCm = cajonParcial ? anchoModCm - anchoCajCm - E : anchoModCm
  const zonaCajPx = (m.cajones > 0 ? n(m.zonaCajones) : 0) * scale
  // La puerta baja hasta el piso si el cajón es parcial; si no, se detiene sobre los cajones.
  const yPuertaBottom = cajonParcial ? yTop + hInt : yTop + hInt - zonaCajPx

  return (
    <Group>
      {i > 0 && <Rect x={x0 - e} y={yTop} width={e} height={hInt} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1} />}
      {cajonParcial && (
        <Rect x={cajonIzq ? x0 + anchoColCajPx : xCaj - e} y={yTop} width={e} height={hInt} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1} />
      )}

      {m.alturas.map((alt, k) => {
        const y = yTop + hInt - (clamp(alt, 0, Al - 2 * E) / (Al - 2 * E)) * hInt
        return (
          <Group key={k} draggable dragBoundFunc={(pos) => ({ x: pos.x, y: pos.y })}
            onDragEnd={(ev) => { onMover(i, k, (y + ev.target.y()) - yTop); ev.target.position({ x: 0, y: 0 }) }}>
            <Line points={[x0, y, x0 + anchoMod, y]} stroke="#b45309" strokeWidth={2.5} />
            <Text text={`${Math.round(anchoModCm)} × ${alt}↑`} x={x0 + 3} y={y - 13} fontSize={10} fill="#92400e" />
          </Group>
        )
      })}

      <PuertasMod m={m} x0={xPuerta} yTop={yTop} anchoPx={anchoPuertaPx} anchoCm={anchoPuertaCm} yBottom={yPuertaBottom} />
      <CajonesMod m={m} x0={xCaj} anchoPx={anchoColCajPx} anchoCm={cajonParcial ? anchoCajCm : anchoModCm}
        yBottom={yTop + hInt} zonaCajPx={zonaCajPx} />
    </Group>
  )
}

// Puertas (1 o 2 hojas), semitransparentes, con ancho en cm en el centro.
function PuertasMod({ m, x0, yTop, anchoPx, anchoCm, yBottom }) {
  if (m.puerta === 'ninguna') return null
  const hojas = m.puerta === 'dos' ? 2 : 1
  const g = 2
  const y = yTop + g, h = yBottom - yTop - 2 * g
  if (h <= 0 || anchoPx <= 0) return null
  const wHoja = (anchoPx - (hojas + 1) * g) / hojas
  const cmHoja = Math.round((anchoCm - (hojas + 1) * 0.3) / hojas)
  return Array.from({ length: hojas }, (_, j) => {
    const x = x0 + g + j * (wHoja + g)
    const tx = hojas === 1 ? x + wHoja - 7 : (j === 0 ? x + wHoja - 7 : x + 4)
    return (
      <Group key={j}>
        <Rect x={x} y={y} width={wHoja} height={h} fill="rgba(147,197,253,0.30)" stroke="#2563eb" strokeWidth={1.5} cornerRadius={2} />
        <Rect x={tx} y={y + h / 2 - 12} width={3} height={24} fill="#1e3a8a" cornerRadius={2} />
        <Text text={`${cmHoja}`} x={x} y={y + h / 2 - 6} width={wHoja} align="center" fontSize={10} fill="#1e3a8a" />
      </Group>
    )
  })
}

// Cajones apilados en la zona inferior de su columna, con medida de frente en cm.
function CajonesMod({ m, x0, anchoPx, anchoCm, yBottom, zonaCajPx }) {
  if (!(m.cajones > 0) || zonaCajPx <= 0) return null
  const g = 2
  const hCaj = (zonaCajPx - (m.cajones + 1) * g) / m.cajones
  const y0 = yBottom - zonaCajPx
  const cmFrente = Math.round(anchoCm - 0.6)
  const cmAltoCaj = Math.round(n(m.zonaCajones) / m.cajones - 0.3)
  return Array.from({ length: m.cajones }, (_, j) => {
    const y = y0 + g + j * (hCaj + g)
    return (
      <Group key={j}>
        <Rect x={x0 + g} y={y} width={anchoPx - 2 * g} height={hCaj} fill="rgba(167,243,208,0.5)" stroke="#059669" strokeWidth={1.5} cornerRadius={2} />
        <Rect x={x0 + anchoPx / 2 - 14} y={y + hCaj / 2 - 2} width={28} height={4} fill="#065f46" cornerRadius={2} />
        <Text text={`${cmFrente}×${cmAltoCaj}`} x={x0} y={y + hCaj / 2 - 6} width={anchoPx} align="center" fontSize={9} fill="#065f46" />
      </Group>
    )
  })
}

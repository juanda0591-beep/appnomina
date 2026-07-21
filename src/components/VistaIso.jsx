import { Stage, Layer, Rect, Line, Group } from 'react-konva'
import { anchoModulo } from '../utils/despiece.js'

// Vista 3D del mueble en proyección de gabinete: el frente se dibuja plano (sin
// distorsión, para ver puertas/cajones tal cual) y la profundidad se extruye en
// ángulo. Se puede ver desde la izquierda o la derecha. Todo en cm.
const PADL = 16, PADT = 16, MAXW = 380, MAXH = 460
const DEP = 0.5 // factor de profundidad (estilo gabinete)
const CX = 0.866, CY = 0.5 // cos/sin de 30°
const n = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)

export default function VistaIso({ f, lado = 'der', stageRef }) {
  const An = n(f.ancho), Al = n(f.alto), Pr = n(f.fondo), E = n(f.espesor, 18) / 10
  const modulos = f.modulos, nMod = modulos.length
  if (!(An > 0 && Al > 0 && Pr > 0)) {
    return <p className="muted">Ingresa ancho, alto y fondo para ver el 3D.</p>
  }

  const scale = Math.min(MAXW / (An + Pr * DEP * CX), MAXH / (Al + Pr * DEP * CY))
  const W = An * scale, H = Al * scale
  const sign = lado === 'izq' ? -1 : 1
  const ddx = Pr * scale * DEP * CX * sign  // desplazamiento de profundidad en x
  const ddy = Pr * scale * DEP * CY          // ... en y (hacia arriba)

  // Origen: deja margen arriba (para el techo) y a la izquierda.
  const ox = PADL + (lado === 'izq' ? Pr * scale * DEP * CX : 0)
  const oy = PADT + ddy
  const stageW = W + Math.abs(ddx) + PADL * 2
  const stageH = H + ddy + PADT * 2

  // Proyecta un punto (x,y de la cara frontal, z profundidad 0..1) a pantalla.
  const P = (x, y, z) => [ox + x + ddx * z, oy + y - ddy * z]

  const e = E * scale
  const anchoModCm = anchoModulo(An, E, nMod)
  const anchoMod = anchoModCm * scale

  return (
    <Stage width={stageW} height={stageH} ref={stageRef}>
      <Layer>
        <CuerpoIso {...{ W, H, P, lado }} />
        <FrenteIso {...{ modulos, e, W, H, anchoMod, anchoModCm, scale, Al, E, ox, oy }} />
      </Layer>
    </Stage>
  )
}

// Caras superior y lateral (el "volumen" del mueble) mediante polígonos.
function CuerpoIso({ W, H, P, lado }) {
  // Cara superior (techo): borde frontal-superior extruido hacia atrás.
  const top = [...P(0, 0, 0), ...P(W, 0, 0), ...P(W, 0, 1), ...P(0, 0, 1)]
  // Cara lateral: en el lado visible según la orientación.
  const xLat = lado === 'izq' ? 0 : W
  const side = [...P(xLat, 0, 0), ...P(xLat, H, 0), ...P(xLat, H, 1), ...P(xLat, 0, 1)]
  return (
    <>
      <Line points={top} closed fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1} />
      <Line points={side} closed fill="#cbd5e1" stroke="#94a3b8" strokeWidth={1} />
    </>
  )
}

// Cara frontal: carcasa, módulos, puertas, cajones y entrepaños (en cm, plano).
function FrenteIso({ modulos, e, W, H, anchoMod, anchoModCm, scale, Al, E, ox, oy }) {
  return (
    <Group x={ox} y={oy}>
      <Rect x={0} y={0} width={W} height={H} fill="#fff" stroke="#334155" strokeWidth={2} />
      <Rect x={e} y={e} width={W - 2 * e} height={H - 2 * e} fill="#fdf6ec" stroke="#cbd5e1" strokeWidth={1} />
      {modulos.map((m, i) => (
        <ModuloIso key={i} {...{ m, i, e, H, anchoMod, anchoModCm, scale, Al, E }} />
      ))}
    </Group>
  )
}

// Un módulo en el frente 3D (sin cotas ni arrastre; solo la forma).
function ModuloIso({ m, i, e, H, anchoMod, anchoModCm, scale, Al, E }) {
  const x0 = e + i * (anchoMod + e)
  const yTop = e, hInt = H - 2 * e
  const anchoCajCm = n(m.anchoCajon, 0)
  const cajonParcial = m.cajones > 0 && n(m.zonaCajones) > 0 && anchoCajCm > 0 && anchoCajCm < anchoModCm
  const anchoColCajPx = cajonParcial ? anchoCajCm * scale : anchoMod
  const cajonIzq = (m.ladoCajon || 'izq') === 'izq'
  const xCaj = cajonParcial && !cajonIzq ? x0 + anchoMod - anchoColCajPx : x0
  const xPuerta = cajonParcial && cajonIzq ? x0 + anchoColCajPx + e : x0
  const anchoPuertaPx = cajonParcial ? anchoMod - anchoColCajPx - e : anchoMod
  const zonaCajPx = (m.cajones > 0 ? n(m.zonaCajones) : 0) * scale
  const yPuertaBottom = cajonParcial ? yTop + hInt : yTop + hInt - zonaCajPx

  return (
    <Group>
      {i > 0 && <Rect x={x0 - e} y={yTop} width={e} height={hInt} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1} />}
      {cajonParcial && (
        <Rect x={cajonIzq ? x0 + anchoColCajPx : xCaj - e} y={yTop} width={e} height={hInt} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1} />
      )}
      {/* Entrepaños */}
      {m.alturas.map((alt, k) => {
        const y = yTop + hInt - (clampIso(alt, 0, Al - 2 * E) / (Al - 2 * E)) * hInt
        return <Line key={k} points={[x0, y, x0 + anchoMod, y]} stroke="#b45309" strokeWidth={2} />
      })}
      <PuertaIso puerta={m.puerta} x0={xPuerta} yTop={yTop} anchoPx={anchoPuertaPx} yBottom={yPuertaBottom} />
      <CajonIso cajones={m.cajones} x0={xCaj} anchoPx={anchoColCajPx} yBottom={yTop + hInt} zonaCajPx={zonaCajPx} />
    </Group>
  )
}

function clampIso(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

function PuertaIso({ puerta, x0, yTop, anchoPx, yBottom }) {
  if (puerta === 'ninguna') return null
  const hojas = puerta === 'dos' ? 2 : 1, g = 2
  const y = yTop + g, h = yBottom - yTop - 2 * g
  if (h <= 0 || anchoPx <= 0) return null
  const wHoja = (anchoPx - (hojas + 1) * g) / hojas
  return Array.from({ length: hojas }, (_, j) => {
    const x = x0 + g + j * (wHoja + g)
    const tx = hojas === 1 ? x + wHoja - 7 : (j === 0 ? x + wHoja - 7 : x + 4)
    return (
      <Group key={j}>
        <Rect x={x} y={y} width={wHoja} height={h} fill="rgba(147,197,253,0.35)" stroke="#2563eb" strokeWidth={1.5} cornerRadius={2} />
        <Rect x={tx} y={y + h / 2 - 12} width={3} height={24} fill="#1e3a8a" cornerRadius={2} />
      </Group>
    )
  })
}

function CajonIso({ cajones, x0, anchoPx, yBottom, zonaCajPx }) {
  if (!(cajones > 0) || zonaCajPx <= 0) return null
  const g = 2
  const hCaj = (zonaCajPx - (cajones + 1) * g) / cajones
  const y0 = yBottom - zonaCajPx
  return Array.from({ length: cajones }, (_, j) => {
    const y = y0 + g + j * (hCaj + g)
    return (
      <Group key={j}>
        <Rect x={x0 + g} y={y} width={anchoPx - 2 * g} height={hCaj} fill="rgba(167,243,208,0.5)" stroke="#059669" strokeWidth={1.5} cornerRadius={2} />
        <Rect x={x0 + anchoPx / 2 - 14} y={y + hCaj / 2 - 2} width={28} height={4} fill="#065f46" cornerRadius={2} />
      </Group>
    )
  })
}

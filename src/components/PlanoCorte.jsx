import { Stage, Layer, Rect, Text, Group, Line } from 'react-konva'
import { fmtCm } from '../utils/unidades.js'

// Dibuja una lámina y las piezas colocadas sobre ella (coordenadas en mm).
// Escala las medidas reales al ancho disponible en pantalla. Las cotas y medidas
// de pieza se muestran en cm. Zoom con la rueda.
import { useState } from 'react'

// Paleta para diferenciar piezas por nombre.
const COLORES = ['#93c5fd', '#a7f3d0', '#fcd34d', '#fca5a5', '#c4b5fd', '#f9a8d4', '#5eead4', '#fdba74']
function colorPieza(nombre) {
  let h = 0
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) % COLORES.length
  return COLORES[h]
}

// Margen reservado alrededor de la lámina para dibujar las cotas (ancho/alto).
const MARGEN = 34

export default function PlanoCorte({ ancho, largo, piezas }) {
  const [zoom, setZoom] = useState(1)
  // Ancho de dibujo base: la lámina se muestra "acostada" (ancho horizontal).
  const anchoCanvas = 720
  const escala = (anchoCanvas / ancho) * zoom
  const w = ancho * escala
  const h = largo * escala

  const onWheel = (e) => {
    e.evt.preventDefault()
    const factor = e.evt.deltaY < 0 ? 1.1 : 0.9
    setZoom((z) => Math.min(4, Math.max(0.4, z * factor)))
  }

  return (
    <div style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
      <Stage width={w + MARGEN + 8} height={h + MARGEN + 8} onWheel={onWheel}>
        <Layer>
          {/* La lámina y las piezas van desplazadas por el margen de cotas. */}
          <Group x={MARGEN} y={MARGEN}>
            <Rect x={0} y={0} width={w} height={h} fill="#fff" stroke="#334155" strokeWidth={2} />
            {piezas.map((p, i) => (
              <PiezaRect key={i} p={p} escala={escala} />
            ))}
          </Group>
          <Cotas ancho={ancho} largo={largo} w={w} h={h} />
        </Layer>
      </Stage>
    </div>
  )
}

// Líneas de cota: ancho de la lámina arriba, alto (largo) al costado izquierdo.
function Cotas({ ancho, largo, w, h }) {
  const azul = '#2563eb'
  return (
    <>
      {/* Cota del ancho (horizontal, arriba) */}
      <Line points={[MARGEN, MARGEN - 12, MARGEN + w, MARGEN - 12]} stroke={azul} strokeWidth={1} />
      <Line points={[MARGEN, MARGEN - 16, MARGEN, MARGEN - 8]} stroke={azul} strokeWidth={1} />
      <Line points={[MARGEN + w, MARGEN - 16, MARGEN + w, MARGEN - 8]} stroke={azul} strokeWidth={1} />
      <Text
        text={`${fmtCm(ancho)} cm`} x={MARGEN} y={MARGEN - 30} width={w}
        align="center" fontSize={13} fontStyle="bold" fill={azul}
      />
      {/* Cota del alto (vertical, izquierda) — texto rotado 90° */}
      <Line points={[MARGEN - 12, MARGEN, MARGEN - 12, MARGEN + h]} stroke={azul} strokeWidth={1} />
      <Line points={[MARGEN - 16, MARGEN, MARGEN - 8, MARGEN]} stroke={azul} strokeWidth={1} />
      <Line points={[MARGEN - 16, MARGEN + h, MARGEN - 8, MARGEN + h]} stroke={azul} strokeWidth={1} />
      <Text
        text={`${fmtCm(largo)} cm`} x={MARGEN - 30} y={MARGEN + h}
        width={h} align="center" fontSize={13} fontStyle="bold" fill={azul}
        rotation={-90}
      />
    </>
  )
}

function PiezaRect({ p, escala }) {
  const x = p.x * escala
  const y = p.y * escala
  const w = p.ancho * escala
  const h = p.largo * escala
  const mostrarTexto = w > 46 && h > 24
  return (
    <Group x={x} y={y}>
      <Rect width={w} height={h} fill={colorPieza(p.nombre)} stroke="#1e293b" strokeWidth={1} />
      {mostrarTexto && (
        <Text
          text={`${p.nombre}\n${fmtCm(p.ancho)}×${fmtCm(p.largo)}${p.rotada ? ' ↻' : ''}`}
          fontSize={12}
          fill="#0f172a"
          width={w}
          height={h}
          align="center"
          verticalAlign="middle"
          padding={2}
        />
      )}
    </Group>
  )
}

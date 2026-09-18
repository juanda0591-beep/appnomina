import { vistasMueble } from '../utils/vistasMueble.js'

export default function VistasTecnicas({ diseno }) {
  const vistas = vistasMueble(diseno)
  if (!vistas.length) return null
  return <section className="corte-vistas"><h3>Vistas técnicas del mueble</h3>
    <p className="muted small">Medidas en mm. Estructura sin frentes; las líneas discontinuas indican elementos interiores.</p>
    <div className="corte-vistas-grid">{vistas.map((v) => {
      const s = Math.min(240 / v.ancho, 280 / v.alto), w = v.ancho * s, h = v.alto * s
      const x = (320 - w) / 2 + 8, y = (355 - h) / 2 + 8
      return <figure key={v.nombre}><figcaption>{v.nombre}</figcaption><svg viewBox="0 0 320 355" role="img" aria-label={`${v.nombre}: ${v.ancho} por ${v.alto} milímetros`}>
        <rect x={x} y={y} width={w} height={h} fill="#fff" stroke="#526c75" strokeWidth="1" />
        {v.rectangulos.map((r, i) => <rect key={i} x={x + r.x * s} y={y + r.y * s} width={r.ancho * s} height={r.alto * s}
          fill={r.oculta ? 'none' : '#e0eaed'} stroke="#526c75" strokeWidth=".7" strokeDasharray={r.oculta ? '4 3' : undefined} />)}
        <path d={`M ${x},${y - 12} h ${w} M ${x},${y - 16} v 8 M ${x + w},${y - 16} v 8 M ${x - 12},${y} v ${h} M ${x - 16},${y} h 8 M ${x - 16},${y + h} h 8`} fill="none" stroke="#657d87" strokeWidth="1" />
        <text x={x + w / 2} y={y - 20} textAnchor="middle" fontSize="11" fill="#435c67">{v.ancho} mm</text>
        <text transform={`translate(${x - 22},${y + h / 2}) rotate(-90)`} textAnchor="middle" fontSize="11" fill="#435c67">{v.alto} mm</text>
      </svg></figure>
    })}</div>
  </section>
}

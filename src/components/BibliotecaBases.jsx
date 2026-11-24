import { BASES_MUEBLE, crearBaseMueble } from '../utils/basesMueble.js'
import { confirmar } from '../utils/notify.js'

function Miniatura({ base }) {
  const tocador = base.tipo === 'tocador', abierto = base.id === 'ropero-abierto'
  return <svg width="130" height="94" viewBox="0 0 130 94" aria-hidden="true" fill="none" stroke="#2e6059" strokeWidth="2">
    {tocador ? <><path d="M20 52h90M24 52v30m82-30v30M25 60h80"/><path d="M30 60v17h22V60m26 0v17h23V60"/>{base.id !== 'tocador-mesa' && <rect x="44" y="12" width="42" height="36" rx="3" fill="#d9e9e6"/>}{base.id === 'tocador-repisas' && <path d="M93 14h21v32H93m0-16h21"/>}</>
      : <><rect x="24" y="9" width="82" height="76" rx="2" fill="#eff5f2"/>{Array.from({ length: base.modulos - 1 }, (_, i) => <path key={i} d={`M${24 + 82 * (i + 1) / base.modulos} 10v74`}/>)}
        {base.id === 'zapatero' ? [25, 38, 51, 64].map((y) => <path key={y} d={`M26 ${y}h78`}/>) : <><path d="M25 25h79"/>{!abierto && <path d="M61 39v12m8-12v12" stroke="#b68b51"/>}<path d="M26 66h35m-35 9h35"/>{abierto && <path d="M34 35h20m12 8h38m-38 15h38m-38 15h38"/>}</>}</>}
  </svg>
}
export default function BibliotecaBases({ onCambiar }) {
  return <details className="biblioteca-bases"><summary>Más bases de armarios y tocadores ({BASES_MUEBLE.length})</summary>
    <p className="muted small">Bases de ejemplo con MDF de 9 mm y fondos de 3 mm. Revisa medidas, construcción y herrajes para tu producto.</p>
    <div className="bases-grid">{BASES_MUEBLE.map((base) => <button type="button" className="base-mueble" key={base.id} aria-label={`Cargar base ${base.nombre}`} onClick={async () => {
      if (await confirmar(`Se cargará ${base.nombre.toLowerCase()} con medidas de ejemplo. Reemplazará el diseño actual.`, { titulo: 'Cargar base de mueble', textoOk: 'Cargar base', peligro: false })) onCambiar(crearBaseMueble(base.id))
    }}><Miniatura base={base}/><strong>{base.nombre}</strong><span>{base.ancho} × {base.alto} × {base.fondo} cm de carcasa</span><small>{base.detalle}</small></button>)}</div>
  </details>
}

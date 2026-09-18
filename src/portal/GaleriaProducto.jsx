import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Expand, Package, X } from 'lucide-react'

export default function GaleriaProducto({ producto, etiqueta }) {
  const fotos = producto.imagenes || []
  const [indice, setIndice] = useState(0), [abierta, setAbierta] = useState(false)
  const dialogo = useRef(null), inicioToque = useRef(null)
  const actual = Math.min(indice, Math.max(0, fotos.length - 1))
  const url = (foto) => `/api/portal/productos/${producto.id}/imagenes/${foto.id}`
  const cambiar = (delta) => setIndice((i) => (Math.min(i, fotos.length - 1) + delta + fotos.length) % fotos.length)
  const ids = fotos.map((f) => f.id).join(',')
  useEffect(() => { setIndice(0) }, [ids])
  useEffect(() => {
    if (!abierta) return
    const el = dialogo.current, overflow = document.body.style.overflow
    el.showModal(); document.body.style.overflow = 'hidden'
    return () => { el.close(); document.body.style.overflow = overflow }
  }, [abierta])
  const toqueInicio = (e) => { inicioToque.current = e.touches.length === 1 ? [e.touches[0].clientX, e.touches[0].clientY] : null }
  const toqueFin = (e) => {
    if (!inicioToque.current || fotos.length < 2) return
    const [x, y] = inicioToque.current; inicioToque.current = null
    const dx = e.changedTouches[0].clientX - x, dy = e.changedTouches[0].clientY - y
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) cambiar(dx < 0 ? 1 : -1)
  }
  return <>
    <div className="producto-foto" onTouchStart={toqueInicio} onTouchEnd={toqueFin}>
      {fotos.length ? <button className="foto-ampliar" type="button" aria-label={`Ampliar fotos de ${producto.nombre}`} onClick={() => setAbierta(true)}>
        <img src={url(fotos[actual])} alt={producto.nombre} loading="lazy"/><span className="foto-ampliar-icono"><Expand size={17}/></span>
      </button> : <div className="sin-foto"><Package size={54} strokeWidth={1}/><span>Fotografía pendiente</span></div>}
      <span className="producto-etiqueta">{etiqueta}</span>
      {fotos.length > 1 && <div className="foto-navegacion"><button type="button" aria-label={`Foto anterior de ${producto.nombre}`} onClick={() => cambiar(-1)}><ChevronLeft size={19}/></button><span aria-live="polite">{actual + 1} / {fotos.length}</span><button type="button" aria-label={`Foto siguiente de ${producto.nombre}`} onClick={() => cambiar(1)}><ChevronRight size={19}/></button></div>}
    </div>
    {fotos.length > 0 && <dialog ref={dialogo} className="galeria-producto" aria-label={`Fotos de ${producto.nombre}`} onCancel={() => setAbierta(false)} onClose={() => setAbierta(false)} onClick={(e) => { if (e.target === dialogo.current) setAbierta(false) }} onKeyDown={(e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); cambiar(-1) }
      if (e.key === 'ArrowRight') { e.preventDefault(); cambiar(1) }
    }}><div className="galeria-interior">
      <header><div><span className="eyebrow">TODOS LOS DETALLES</span><h2>{producto.nombre}</h2></div><button autoFocus aria-label="Cerrar galería" onClick={() => setAbierta(false)}><X size={24}/></button></header>
      {abierta && <>
        <div className="galeria-principal" onTouchStart={toqueInicio} onTouchEnd={toqueFin}>
          <img src={url(fotos[actual])} alt={`${producto.nombre} · fotografía ${actual + 1}`} draggable={false}/>
          {fotos.length > 1 && <><button className="galeria-anterior" aria-label="Fotografía anterior" onClick={() => cambiar(-1)}><ChevronLeft/></button><button className="galeria-siguiente" aria-label="Fotografía siguiente" onClick={() => cambiar(1)}><ChevronRight/></button></>}
        </div>
        <p className="galeria-contador" aria-live="polite">Fotografía {actual + 1} de {fotos.length}{producto.medidas && ` · ${producto.medidas}`}</p>
        {fotos.length > 1 && <div className="galeria-miniaturas" role="group" aria-label="Elegir fotografía">{fotos.map((f, i) => <button key={f.id} aria-label={`Ver fotografía ${i + 1}`} aria-pressed={actual === i} onClick={() => setIndice(i)}><img src={url(f)} alt=""/></button>)}</div>}
      </>}
    </div></dialog>}
  </>
}

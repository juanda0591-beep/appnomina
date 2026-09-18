import { useEffect, useRef } from 'react'
import { ArrowRight, CheckCircle2, Package, ShoppingBag, X } from 'lucide-react'
import { dinero } from './api.js'

export default function ConfirmacionProducto({ producto, total, unidades, cerrar, verPedido }) {
  const dialogo = useRef(null)
  useEffect(() => {
    const el = dialogo.current, anterior = document.activeElement
    const overflow = document.body.style.overflow
    el.showModal(); document.body.style.overflow = 'hidden'
    return () => { el.close(); document.body.style.overflow = overflow; anterior?.focus({ preventScroll: true }) }
  }, [])
  const terminar = (accion) => { dialogo.current.close(); accion() }
  return <dialog ref={dialogo} className="confirmacion-producto" aria-labelledby="producto-agregado-titulo"
    aria-describedby="producto-agregado-ayuda" onCancel={(e) => { e.preventDefault(); terminar(cerrar) }}>
    <div className="confirmacion-interior">
      <button className="confirmacion-cerrar" aria-label="Cerrar confirmación y seguir eligiendo" onClick={() => terminar(cerrar)}><X size={23}/></button>
      <div className="confirmacion-exito"><CheckCircle2 size={42} strokeWidth={2}/></div>
      <span className="eyebrow">¡VAS MUY BIEN!</span>
      <h2 id="producto-agregado-titulo">¡Producto agregado!</h2>
      <p className="confirmacion-cantidad">Agregaste <strong>{producto.agregadas} {producto.agregadas === 1 ? 'unidad' : 'unidades'}</strong> a tu pedido.</p>
      <div className="confirmacion-ficha">
        {producto.foto ? <img src={producto.foto} alt=""/> : <div className="confirmacion-sin-foto"><Package size={35}/></div>}
        <div><h3>{producto.nombre}</h3><p>{producto.color}</p><strong>{producto.cantidad} {producto.cantidad === 1 ? 'unidad en tu pedido' : 'unidades en tu pedido'}</strong>
          <small>{dinero(producto.precio)} por unidad</small></div>
      </div>
      <div className="confirmacion-total"><span><ShoppingBag size={18}/>Tu pedido · {unidades} {unidades === 1 ? 'unidad' : 'unidades'}</span><strong>{dinero(total)}</strong></div>
      <p id="producto-agregado-ayuda" className="confirmacion-ayuda"><strong>Falta el último paso: enviar tu pedido.</strong><br/>Puedes seguir agregando productos o revisar y enviar cuando estés listo.</p>
      <button autoFocus className="primario ancho" onClick={() => terminar(verPedido)}>Ver mi pedido y continuar <ArrowRight size={20}/></button>
      <button className="confirmacion-seguir ancho" onClick={() => terminar(cerrar)}>Seguir eligiendo productos</button>
    </div>
  </dialog>
}
